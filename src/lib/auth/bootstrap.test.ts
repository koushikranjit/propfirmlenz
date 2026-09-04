import { eq } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetTestDb, type TestDb } from "@/lib/db/testing";
import {
  adminUserRoles,
  adminUsers,
  auditLogs,
  permissions,
  roles,
} from "@/lib/db/schema";
import { BootstrapError, bootstrapFirstAdmin, hasAnyAdmin } from "./bootstrap";
import { MIN_PASSWORD_LENGTH } from "./password";
import { ROLES } from "./permissions";
import { verifyPassword } from "./password";

/**
 * First-admin bootstrap — docs/ADMIN.md §11.
 *
 * Against a REAL PostgreSQL (PGlite), because the guarantees under test are
 * transactional: the refuse-if-an-admin-exists check, the RBAC seed, the user
 * insert and the role grant either all commit or none do.
 *
 * The passwords below are throwaway values that exist only inside this test
 * database. None is a default, and none is ever written to source that runs in
 * production.
 */
describe("first-admin bootstrap", () => {
  let db: TestDb;
  let client: PGlite;
  let close: () => Promise<void>;

  const VALID = {
    email: "owner@example.test",
    fullName: "Example Owner",
    password: "correct horse battery staple",
  };

  beforeAll(async () => {
    ({ db, client, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await resetTestDb(client);
  });

  describe("creating the first admin", () => {
    it("creates the account, seeds RBAC and grants master_admin", async () => {
      expect(await hasAnyAdmin(db)).toBe(false);

      const result = await bootstrapFirstAdmin(db, VALID);

      expect(result.email).toBe("owner@example.test");
      expect(result.role).toBe(ROLES.MASTER_ADMIN);

      const [admin] = await db
        .select()
        .from(adminUsers)
        .where(eq(adminUsers.id, result.adminUserId));
      expect(admin?.email).toBe("owner@example.test");
      expect(admin?.status).toBe("active");
      expect(admin?.deletedAt).toBeNull();

      // RBAC was seeded by the bootstrap, not assumed to exist.
      expect((await db.select().from(roles)).length).toBeGreaterThan(0);
      expect((await db.select().from(permissions)).length).toBeGreaterThan(0);

      const grants = await db
        .select()
        .from(adminUserRoles)
        .where(eq(adminUserRoles.adminUserId, result.adminUserId));
      expect(grants).toHaveLength(1);

      const [master] = await db
        .select()
        .from(roles)
        .where(eq(roles.key, ROLES.MASTER_ADMIN));
      expect(grants[0]?.roleId).toBe(master?.id);
      expect(await hasAnyAdmin(db)).toBe(true);
    });

    it("stores an Argon2id hash that verifies, never the plaintext", async () => {
      const result = await bootstrapFirstAdmin(db, VALID);
      const [admin] = await db
        .select()
        .from(adminUsers)
        .where(eq(adminUsers.id, result.adminUserId));

      const hash = admin!.passwordHash;
      expect(hash).toMatch(/^\$argon2id\$/);
      expect(hash).not.toContain(VALID.password);
      expect(await verifyPassword(hash, VALID.password)).toBe(true);
      expect(await verifyPassword(hash, "the wrong password entirely")).toBe(
        false,
      );
    });

    it("normalises the email before storing it", async () => {
      const result = await bootstrapFirstAdmin(db, {
        ...VALID,
        email: "  OWNER@Example.TEST  ",
      });
      expect(result.email).toBe("owner@example.test");
    });

    it("writes an audit entry that contains no password material", async () => {
      const result = await bootstrapFirstAdmin(db, VALID);
      const entries = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, result.adminUserId));

      const entry = entries.find((e) => e.action === "admin_user.bootstrapped");
      expect(entry).toBeDefined();
      expect(entry?.actorAdminId).toBe(result.adminUserId);

      const serialised = JSON.stringify(entry);
      expect(serialised).not.toContain(VALID.password);
      expect(serialised).not.toContain("$argon2id$");
      expect(serialised).not.toContain("passwordHash");
    });
  });

  describe("refusing a second bootstrap", () => {
    it("refuses when an admin already exists", async () => {
      await bootstrapFirstAdmin(db, VALID);

      await expect(
        bootstrapFirstAdmin(db, {
          ...VALID,
          email: "second@example.test",
        }),
      ).rejects.toMatchObject({ code: "ADMIN_EXISTS" });

      // And nothing was written by the refused attempt.
      expect(await db.select().from(adminUsers)).toHaveLength(1);
    });

    it("refuses even when the existing admin is not a master admin", async () => {
      await db.insert(adminUsers).values({
        email: "someone@example.test",
        passwordHash: "x",
        fullName: "Someone",
        status: "active",
      });

      await expect(bootstrapFirstAdmin(db, VALID)).rejects.toBeInstanceOf(
        BootstrapError,
      );
      expect(await db.select().from(adminUsers)).toHaveLength(1);
    });
  });

  describe("validation", () => {
    it("rejects an invalid email", async () => {
      for (const email of [
        "",
        "   ",
        "not-an-email",
        "missing@tld",
        "a b@c.test",
      ]) {
        await expect(
          bootstrapFirstAdmin(db, { ...VALID, email }),
        ).rejects.toMatchObject({ code: "INVALID_EMAIL" });
      }
      expect(await db.select().from(adminUsers)).toHaveLength(0);
    });

    it("rejects a missing name", async () => {
      await expect(
        bootstrapFirstAdmin(db, { ...VALID, fullName: "   " }),
      ).rejects.toMatchObject({ code: "INVALID_NAME" });
    });

    it("enforces the application's password minimum, unrelaxed", async () => {
      const tooShort = "a".repeat(MIN_PASSWORD_LENGTH - 1);
      await expect(
        bootstrapFirstAdmin(db, { ...VALID, password: tooShort }),
      ).rejects.toMatchObject({ code: "INVALID_PASSWORD" });

      // Nothing was created, and RBAC was not seeded by the failed attempt.
      expect(await db.select().from(adminUsers)).toHaveLength(0);
      expect(await db.select().from(roles)).toHaveLength(0);
    });

    it("accepts a password exactly at the minimum length", async () => {
      const atLimit = "a".repeat(MIN_PASSWORD_LENGTH);
      const result = await bootstrapFirstAdmin(db, {
        ...VALID,
        password: atLimit,
      });
      expect(result.adminUserId).toBeTruthy();
    });
  });

  describe("atomicity", () => {
    it("rolls the whole bootstrap back when a late step fails", async () => {
      // Fault injection: make the role grant — the second-to-last step — fail.
      // By then the RBAC seed and the admin insert have already run, so a
      // non-transactional implementation would leave an admin with no role,
      // which is an account that exists but can do nothing.
      await client.exec(
        `alter table admin_user_roles add constraint tmp_force_failure check (false) not valid`,
      );

      try {
        await expect(bootstrapFirstAdmin(db, VALID)).rejects.toThrow();

        // Every step is rolled back together — no orphaned admin, no partial
        // RBAC seed, no audit entry for something that did not happen.
        expect(await db.select().from(adminUsers)).toHaveLength(0);
        expect(await db.select().from(roles)).toHaveLength(0);
        expect(await db.select().from(permissions)).toHaveLength(0);
        expect(await db.select().from(adminUserRoles)).toHaveLength(0);
        expect(await db.select().from(auditLogs)).toHaveLength(0);
      } finally {
        await client.exec(
          `alter table admin_user_roles drop constraint if exists tmp_force_failure`,
        );
      }
    });

    it("reuses the email of a soft-deleted admin, per the soft-delete convention", async () => {
      // Documented behaviour, asserted so it stays deliberate: uniqueness is a
      // PARTIAL index over live rows (docs/DATABASE.md §1.2), so retiring an
      // admin frees their address again.
      await db.insert(adminUsers).values({
        email: "owner@example.test",
        passwordHash: "x",
        fullName: "Retired",
        status: "active",
        deletedAt: new Date(),
      });

      const result = await bootstrapFirstAdmin(db, VALID);
      expect(result.email).toBe("owner@example.test");
    });
  });

  describe("surface", () => {
    it("is not reachable from any HTTP route", async () => {
      const { readdirSync, statSync, readFileSync } = await import("node:fs");
      const { join } = await import("node:path");

      const appDir = join(process.cwd(), "src", "app");
      const files: string[] = [];
      (function walk(dir: string) {
        for (const entry of readdirSync(dir)) {
          const full = join(dir, entry);
          if (statSync(full).isDirectory()) walk(full);
          else files.push(full);
        }
      })(appDir);

      // No page, route handler or server action may import the bootstrap.
      for (const file of files) {
        expect(readFileSync(file, "utf8")).not.toContain("auth/bootstrap");
      }
    });
  });
});
