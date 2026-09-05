import { eq } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetTestDb, type TestDb } from "@/lib/db/testing";
import {
  adminUserRoles,
  adminUsers,
  auditLogs,
  redirects,
  roles,
} from "@/lib/db/schema";
import {
  AuthorizationError,
  ROLES,
  seedRolesAndPermissions,
} from "@/lib/auth/permissions";
import { getPublishedFirmView } from "@/lib/repositories/public-firm-view";
import {
  listAdminFirms,
  getAdminFirmById,
} from "@/lib/repositories/admin-firms";
import { publishFirm } from "./firm-draft";
import {
  SlugConflictError,
  createFirm,
  saveFirmEdits,
  verifyFirm,
} from "./firm-admin";
import {
  createFirmSchema,
  editFirmSchema,
  parseFirmListQuery,
} from "@/lib/validation/firm";

/**
 * Stage 2 — admin firm management.
 *
 * Test records use obviously-fake names and live only in the test database.
 * No demo prop-firm data is added to the application (docs/CLAUDE.md §3).
 */
describe("admin firm management", () => {
  let db: TestDb;
  let client: PGlite;
  let close: () => Promise<void>;
  let editorId: string;
  let publisherId: string;
  let analystId: string;

  beforeAll(async () => {
    ({ db, client, close } = await createTestDb());
  });
  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await resetTestDb(client);
    await seedRolesAndPermissions(db);
    const allRoles = await db.select().from(roles);
    const roleId = (k: string) => allRoles.find((r) => r.key === k)!.id;

    const mk = async (email: string, name: string, role: string) => {
      const [a] = await db
        .insert(adminUsers)
        .values({ email, passwordHash: "x", fullName: name, status: "active" })
        .returning({ id: adminUsers.id });
      await db
        .insert(adminUserRoles)
        .values({ adminUserId: a!.id, roleId: roleId(role) });
      return a!.id;
    };

    editorId = await mk("editor@example.test", "Editor", ROLES.EDITOR);
    publisherId = await mk("pub@example.test", "Publisher", ROLES.PUBLISHER);
    analystId = await mk("analyst@example.test", "Analyst", ROLES.ANALYST);
  });

  /* ------------------------------------------------------------ validation */

  describe("create validation", () => {
    it("rejects an invalid slug", () => {
      expect(() =>
        createFirmSchema.parse({ name: "Example Firm A", slug: "Not Valid" }),
      ).toThrow();
    });

    it("rejects a slug that collides with a reserved route segment", () => {
      for (const reserved of ["admin", "compare", "go", "api"]) {
        expect(() =>
          createFirmSchema.parse({ name: "Example", slug: reserved }),
        ).toThrow();
      }
    });

    it("turns a blank description into null rather than an empty string", () => {
      const parsed = createFirmSchema.parse({
        name: "Example Firm A",
        slug: "example-firm-a",
        description: "   ",
      });
      expect(parsed.description).toBeNull();
    });

    it("treats blank optional fields as not-specified, never as defaults", () => {
      const parsed = editFirmSchema.parse({
        name: "Example Firm A",
        slug: "example-firm-a",
        tagline: "",
        description: "",
        legalName: "",
        foundedYear: "",
        headquartersCountry: "",
        headquartersCity: "",
        websiteUrl: "",
        supportEmail: "",
        supportUrl: "",
        brandColor: "",
      });
      expect(parsed.foundedYear).toBeNull();
      expect(parsed.headquartersCountry).toBeNull();
      expect(parsed.websiteUrl).toBeNull();
      // Critically: not 0, not "", not a guess.
      expect(parsed.foundedYear).not.toBe(0);
    });

    it("rejects a malformed URL, email and country code", () => {
      const base = { name: "Example Firm A", slug: "example-firm-a" };
      expect(() =>
        editFirmSchema.parse({ ...base, websiteUrl: "not-a-url" }),
      ).toThrow();
      expect(() =>
        editFirmSchema.parse({ ...base, supportEmail: "nope" }),
      ).toThrow();
      expect(() =>
        editFirmSchema.parse({ ...base, headquartersCountry: "GBR" }),
      ).toThrow();
    });
  });

  describe("list query parsing (untrusted URL input)", () => {
    it("falls back to safe defaults for garbage", () => {
      const q = parseFirmListQuery({ sort: "; drop table", page: "-5" });
      expect(q.sort).toBe("updatedAt");
      expect(q.page).toBe(1);
    });

    it("caps page size so a crafted URL cannot request an unbounded scan", () => {
      const q = parseFirmListQuery({ pageSize: "100000" });
      expect(q.pageSize).toBeLessThanOrEqual(100);
    });
  });

  /* ---------------------------------------------------------------- create */

  describe("create", () => {
    it("creates an unpublished draft with no invented business data", async () => {
      const { id } = await createFirm(db, {
        adminUserId: editorId,
        input: {
          name: "Example Firm A",
          slug: "example-firm-a",
          description: null,
        },
      });

      const firm = await getAdminFirmById(db, id);
      expect(firm!.status).toBe("draft");
      expect(firm!.publishedAt).toBeNull();
      // Nothing invented.
      expect(firm!.foundedYear).toBeNull();
      expect(firm!.headquartersCountry).toBeNull();
      expect(firm!.websiteUrl).toBeNull();
      expect(firm!.dataCompletenessScore).toBeNull();

      // Not public.
      expect(await getPublishedFirmView(db, "example-firm-a")).toBeNull();
    });

    it("writes an audit entry", async () => {
      await createFirm(db, {
        adminUserId: editorId,
        input: {
          name: "Example Firm A",
          slug: "example-firm-a",
          description: null,
        },
      });
      const audits = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, "firm.created"));
      expect(audits).toHaveLength(1);
      expect(audits[0]!.actorAdminId).toBe(editorId);
    });

    it("rejects a duplicate slug", async () => {
      const input = {
        name: "Example Firm A",
        slug: "example-firm-a",
        description: null,
      };
      await createFirm(db, { adminUserId: editorId, input });
      await expect(
        createFirm(db, { adminUserId: editorId, input }),
      ).rejects.toBeInstanceOf(SlugConflictError);
    });

    it("rejects a slug already claimed by an active redirect", async () => {
      await db.insert(redirects).values({
        fromPath: "/prop-firms/taken-slug",
        toPath: "/prop-firms/somewhere-else",
        statusCode: 301,
      });
      await expect(
        createFirm(db, {
          adminUserId: editorId,
          input: { name: "Example", slug: "taken-slug", description: null },
        }),
      ).rejects.toBeInstanceOf(SlugConflictError);
    });

    it("denies an analyst (read-only role)", async () => {
      await expect(
        createFirm(db, {
          adminUserId: analystId,
          input: { name: "Example", slug: "example", description: null },
        }),
      ).rejects.toBeInstanceOf(AuthorizationError);
    });
  });

  /* ------------------------------------------------------------------ edit */

  describe("edit", () => {
    const edit = (over: Partial<Record<string, unknown>> = {}) =>
      editFirmSchema.parse({
        name: "Example Firm A",
        slug: "example-firm-a",
        tagline: "",
        description: "A placeholder used only by the test suite.",
        legalName: "",
        foundedYear: "",
        headquartersCountry: "",
        headquartersCity: "",
        websiteUrl: "",
        supportEmail: "",
        supportUrl: "",
        brandColor: "",
        ...over,
      });

    it("writes DIRECTLY before first publish (nothing is public yet)", async () => {
      const { id } = await createFirm(db, {
        adminUserId: editorId,
        input: {
          name: "Example Firm A",
          slug: "example-firm-a",
          description: null,
        },
      });

      const result = await saveFirmEdits(db, {
        adminUserId: editorId,
        firmId: id,
        input: edit({ tagline: "Direct write" }),
      });

      expect(result.mode).toBe("direct");
      const firm = await getAdminFirmById(db, id);
      expect(firm!.tagline).toBe("Direct write");
      expect(firm!.draftPayload).toBeNull();
    });

    it("writes to draft_payload once published, leaving live data untouched", async () => {
      const { id } = await createFirm(db, {
        adminUserId: editorId,
        input: {
          name: "Example Firm A",
          slug: "example-firm-a",
          description: "Published description.",
        },
      });
      await publishFirm(db, { adminUserId: publisherId, firmId: id });

      const before = await getPublishedFirmView(db, "example-firm-a");

      const result = await saveFirmEdits(db, {
        adminUserId: editorId,
        firmId: id,
        input: edit({ tagline: "Draft only" }),
      });

      expect(result.mode).toBe("draft");

      const after = await getPublishedFirmView(db, "example-firm-a");
      // The public response is byte-identical, INCLUDING updated_at.
      expect(after).toEqual(before);
      expect(after!.tagline).toBeNull();

      const firm = await getAdminFirmById(db, id);
      expect(firm!.draftPayload).not.toBeNull();
      expect(firm!.tagline).toBeNull();
    });

    it("does NOT move updated_at when saving a draft (sitemap lastmod)", async () => {
      const { id } = await createFirm(db, {
        adminUserId: editorId,
        input: {
          name: "Example Firm A",
          slug: "example-firm-a",
          description: "Published description.",
        },
      });
      await publishFirm(db, { adminUserId: publisherId, firmId: id });

      const before = (await getAdminFirmById(db, id))!.updatedAt;
      await saveFirmEdits(db, {
        adminUserId: editorId,
        firmId: id,
        input: edit({ tagline: "Draft only" }),
      });
      const after = (await getAdminFirmById(db, id))!.updatedAt;

      expect(after.getTime()).toBe(before.getTime());
    });

    it("denies an analyst", async () => {
      const { id } = await createFirm(db, {
        adminUserId: editorId,
        input: {
          name: "Example Firm A",
          slug: "example-firm-a",
          description: null,
        },
      });
      await expect(
        saveFirmEdits(db, {
          adminUserId: analystId,
          firmId: id,
          input: edit(),
        }),
      ).rejects.toBeInstanceOf(AuthorizationError);
    });

    it("rejects taking another live firm's slug", async () => {
      await createFirm(db, {
        adminUserId: editorId,
        input: { name: "Firm One", slug: "firm-one", description: null },
      });
      const { id } = await createFirm(db, {
        adminUserId: editorId,
        input: { name: "Firm Two", slug: "firm-two", description: null },
      });

      await expect(
        saveFirmEdits(db, {
          adminUserId: editorId,
          firmId: id,
          input: edit({ name: "Firm Two", slug: "firm-one" }),
        }),
      ).rejects.toBeInstanceOf(SlugConflictError);
    });
  });

  /* ---------------------------------------------------------- verification */

  describe("verification", () => {
    it("an editor cannot verify; a publisher can", async () => {
      const { id } = await createFirm(db, {
        adminUserId: editorId,
        input: {
          name: "Example Firm A",
          slug: "example-firm-a",
          description: null,
        },
      });

      await expect(
        verifyFirm(db, { adminUserId: editorId, firmId: id }),
      ).rejects.toBeInstanceOf(AuthorizationError);

      await verifyFirm(db, { adminUserId: publisherId, firmId: id });
      const firm = await getAdminFirmById(db, id);
      expect(firm!.verificationStatus).toBe("verified");
      expect(firm!.verifiedByAdminId).toBe(publisherId);
    });
  });

  /* ------------------------------------------------------------------ list */

  describe("admin list", () => {
    beforeEach(async () => {
      for (const [name, slug] of [
        ["Example Firm A", "example-firm-a"],
        ["Example Firm B", "example-firm-b"],
        ["Example Firm C", "example-firm-c"],
      ] as const) {
        await createFirm(db, {
          adminUserId: editorId,
          input: { name, slug, description: "Test record." },
        });
      }
    });

    it("paginates rather than returning everything", async () => {
      const q = parseFirmListQuery({ pageSize: "10" });
      const page1 = await listAdminFirms(db, { ...q, pageSize: 2, page: 1 });
      expect(page1.rows).toHaveLength(2);
      expect(page1.total).toBe(3);
      expect(page1.pageCount).toBe(2);
    });

    it("searches by name and slug", async () => {
      const q = parseFirmListQuery({ search: "Firm B" });
      const result = await listAdminFirms(db, q);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]!.name).toBe("Example Firm B");
    });

    it("filters by status", async () => {
      const q = parseFirmListQuery({ status: "published" });
      expect((await listAdminFirms(db, q)).rows).toHaveLength(0);
    });

    it("excludes soft-deleted firms", async () => {
      const all = await listAdminFirms(db, parseFirmListQuery({}));
      const target = all.rows[0]!;
      await client.query(
        `update prop_firms set deleted_at = now() where id = $1`,
        [target.id],
      );
      const after = await listAdminFirms(db, parseFirmListQuery({}));
      expect(after.total).toBe(2);
      expect(await getAdminFirmById(db, target.id)).toBeNull();
    });

    it("reports real affiliate click counts, never invented ones", async () => {
      const result = await listAdminFirms(db, parseFirmListQuery({}));
      // No clicks exist, so every count is a genuine zero.
      expect(result.rows.every((r) => r.affiliateClickCount === 0)).toBe(true);
    });

    it("returns no rating or review fields — they do not exist until Phase 3", async () => {
      const result = await listAdminFirms(db, parseFirmListQuery({}));
      const row = result.rows[0]!;
      expect(row).not.toHaveProperty("rating");
      expect(row).not.toHaveProperty("reviewCount");
    });
  });
});
