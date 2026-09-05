import { eq } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetTestDb, type TestDb } from "@/lib/db/testing";
import {
  adminSessions,
  adminUserRoles,
  adminUsers,
  roles,
} from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "./password";
import {
  createSession,
  hashIdentifier,
  hashToken,
  IDLE_TIMEOUT_MS,
  resolveSession,
  revokeAllSessionsForAdmin,
  revokeSession,
  touchSession,
} from "./session";
import {
  AuthenticationError,
  AuthorizationError,
  PERMISSIONS,
  ROLES,
  getAdminPermissions,
  hasPermission,
  requirePermission,
  seedRolesAndPermissions,
} from "./permissions";

/** (2) validation, (3) authorization boundaries — plus session security. */
describe("auth", () => {
  let db: TestDb;
  let client: PGlite;
  let close: () => Promise<void>;
  let adminId: string;

  beforeAll(async () => {
    ({ db, client, close } = await createTestDb());
  });

  beforeEach(async () => {
    await resetTestDb(client);
    await seedRolesAndPermissions(db);
    const [admin] = await db
      .insert(adminUsers)
      .values({
        email: "operator@example.test",
        passwordHash: "x",
        fullName: "Operator",
        status: "active",
      })
      .returning({ id: adminUsers.id });
    adminId = admin!.id;
  });
  afterAll(async () => {
    await close();
  });

  describe("password hashing (Argon2id)", () => {
    it("hashes and verifies", async () => {
      const hash = await hashPassword("correct horse battery staple");
      expect(hash).toMatch(/^\$argon2id\$/);
      expect(await verifyPassword(hash, "correct horse battery staple")).toBe(
        true,
      );
      expect(await verifyPassword(hash, "wrong password here")).toBe(false);
    });

    it("never stores the plaintext", async () => {
      const secret = "correct horse battery staple";
      const hash = await hashPassword(secret);
      expect(hash).not.toContain(secret);
    });

    it("produces a different hash each time (per-hash salt)", async () => {
      const a = await hashPassword("correct horse battery staple");
      const b = await hashPassword("correct horse battery staple");
      expect(a).not.toBe(b);
    });

    it("rejects a password below the minimum length", async () => {
      await expect(hashPassword("short")).rejects.toThrow(/at least 12/);
    });

    it("returns false rather than throwing on a malformed hash", async () => {
      expect(await verifyPassword("not-a-hash", "anything at all")).toBe(false);
    });
  });

  describe("sessions", () => {
    it("stores only the HASH of the token, never the token", async () => {
      const { token, sessionId } = await createSession(db, {
        adminUserId: adminId,
      });
      const [row] = await db
        .select()
        .from(adminSessions)
        .where(eq(adminSessions.id, sessionId));

      expect(row!.tokenHash).not.toBe(token);
      expect(row!.tokenHash).toBe(hashToken(token));
      expect(JSON.stringify(row)).not.toContain(token);
    });

    it("resolves a valid token", async () => {
      const { token } = await createSession(db, { adminUserId: adminId });
      const session = await resolveSession(db, token);
      expect(session?.adminUserId).toBe(adminId);
      expect(session?.email).toBe("operator@example.test");
    });

    it("rejects an unknown, empty, or tampered token", async () => {
      expect(await resolveSession(db, "nonsense")).toBeNull();
      expect(await resolveSession(db, "")).toBeNull();
      expect(await resolveSession(db, undefined)).toBeNull();
    });

    it("rejects a revoked session (logout)", async () => {
      const { token, sessionId } = await createSession(db, {
        adminUserId: adminId,
      });
      await revokeSession(db, sessionId);
      expect(await resolveSession(db, token)).toBeNull();
    });

    it("rejects an expired session", async () => {
      const { token } = await createSession(db, { adminUserId: adminId });
      const future = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
      expect(await resolveSession(db, token, future)).toBeNull();
    });

    it("enforces the idle timeout", async () => {
      const { token } = await createSession(db, { adminUserId: adminId });
      const idle = new Date(Date.now() + IDLE_TIMEOUT_MS + 1000);
      expect(await resolveSession(db, token, idle)).toBeNull();
    });

    it("touching a session refreshes the idle window", async () => {
      const { token, sessionId } = await createSession(db, {
        adminUserId: adminId,
      });
      const later = new Date(Date.now() + IDLE_TIMEOUT_MS - 1000);
      await touchSession(db, sessionId, later);
      const stillValid = new Date(later.getTime() + IDLE_TIMEOUT_MS - 1000);
      expect(await resolveSession(db, token, stillValid)).not.toBeNull();
    });

    it("suspending an admin invalidates every session immediately", async () => {
      const { token } = await createSession(db, { adminUserId: adminId });
      expect(await resolveSession(db, token)).not.toBeNull();

      await db
        .update(adminUsers)
        .set({ status: "suspended" })
        .where(eq(adminUsers.id, adminId));

      expect(await resolveSession(db, token)).toBeNull();
    });

    it("revokes all sessions for an admin at once", async () => {
      const a = await createSession(db, { adminUserId: adminId });
      const b = await createSession(db, { adminUserId: adminId });
      await revokeAllSessionsForAdmin(db, adminId);
      expect(await resolveSession(db, a.token)).toBeNull();
      expect(await resolveSession(db, b.token)).toBeNull();
    });

    it("hashes IP and user agent — raw values are never stored", async () => {
      const ip = "203.0.113.42";
      const ua = "Mozilla/5.0 (probe)";
      const { sessionId } = await createSession(db, {
        adminUserId: adminId,
        ip,
        userAgent: ua,
      });
      const [row] = await db
        .select()
        .from(adminSessions)
        .where(eq(adminSessions.id, sessionId));

      expect(row!.ipHash).not.toBe(ip);
      expect(row!.userAgentHash).not.toBe(ua);
      expect(row!.ipHash).toBe(hashIdentifier(ip));
      expect(JSON.stringify(row)).not.toContain(ip);
      expect(JSON.stringify(row)).not.toContain(ua);
    });

    it("issues a different token every time", async () => {
      const a = await createSession(db, { adminUserId: adminId });
      const b = await createSession(db, { adminUserId: adminId });
      expect(a.token).not.toBe(b.token);
    });
  });

  describe("RBAC — deny by default", () => {
    const grant = async (roleKey: string) => {
      const allRoles = await db.select().from(roles);
      await db.insert(adminUserRoles).values({
        adminUserId: adminId,
        roleId: allRoles.find((r) => r.key === roleKey)!.id,
      });
    };

    it("an admin with NO roles has NO permissions", async () => {
      const perms = await getAdminPermissions(db, adminId);
      expect(perms.size).toBe(0);
      await expect(
        requirePermission(db, adminId, PERMISSIONS.FIRM_READ),
      ).rejects.toBeInstanceOf(AuthorizationError);
    });

    it("rejects a null/absent actor as unauthenticated", async () => {
      await expect(
        requirePermission(db, null, PERMISSIONS.FIRM_READ),
      ).rejects.toBeInstanceOf(AuthenticationError);
    });

    it("editor: can edit, cannot publish, verify, or delete", async () => {
      await grant(ROLES.EDITOR);
      expect(await hasPermission(db, adminId, PERMISSIONS.FIRM_EDIT)).toBe(
        true,
      );
      expect(await hasPermission(db, adminId, PERMISSIONS.FIRM_PUBLISH)).toBe(
        false,
      );
      expect(await hasPermission(db, adminId, PERMISSIONS.FIRM_VERIFY)).toBe(
        false,
      );
      expect(await hasPermission(db, adminId, PERMISSIONS.FIRM_DELETE)).toBe(
        false,
      );
    });

    it("publisher: can publish and verify, cannot manage roles", async () => {
      await grant(ROLES.PUBLISHER);
      expect(await hasPermission(db, adminId, PERMISSIONS.FIRM_PUBLISH)).toBe(
        true,
      );
      expect(await hasPermission(db, adminId, PERMISSIONS.ROLE_MANAGE)).toBe(
        false,
      );
    });

    it("analyst: read-only, and NO access to affiliate destinations or notes", async () => {
      await grant(ROLES.ANALYST);
      expect(await hasPermission(db, adminId, PERMISSIONS.FIRM_READ)).toBe(
        true,
      );
      expect(await hasPermission(db, adminId, PERMISSIONS.FIRM_EDIT)).toBe(
        false,
      );
      expect(
        await hasPermission(db, adminId, PERMISSIONS.AFFILIATE_LINK_READ),
      ).toBe(false);
      expect(
        await hasPermission(db, adminId, PERMISSIONS.INTERNAL_NOTE_READ),
      ).toBe(false);
    });

    it("seo_manager: SEO and redirects only", async () => {
      await grant(ROLES.SEO_MANAGER);
      expect(await hasPermission(db, adminId, PERMISSIONS.SEO_WRITE)).toBe(
        true,
      );
      expect(
        await hasPermission(db, adminId, PERMISSIONS.REDIRECT_MANAGE),
      ).toBe(true);
      expect(await hasPermission(db, adminId, PERMISSIONS.FIRM_PUBLISH)).toBe(
        false,
      );
    });

    it("only master_admin can manage roles", async () => {
      await grant(ROLES.ADMIN);
      expect(await hasPermission(db, adminId, PERMISSIONS.ROLE_MANAGE)).toBe(
        false,
      );

      const allRoles = await db.select().from(roles);
      await db.insert(adminUserRoles).values({
        adminUserId: adminId,
        roleId: allRoles.find((r) => r.key === ROLES.MASTER_ADMIN)!.id,
      });
      expect(await hasPermission(db, adminId, PERMISSIONS.ROLE_MANAGE)).toBe(
        true,
      );
    });

    it("seeds structural data only — no business data", async () => {
      const allRoles = await db.select().from(roles);
      expect(allRoles.every((r) => r.isSystem)).toBe(true);
      // Seeding creates roles and permissions, never firms.
      const { propFirms } = await import("@/lib/db/schema");
      const firms = await db.select().from(propFirms);
      expect(firms).toHaveLength(0);
    });
  });
});
