import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, resetTestDb, type TestDb } from "@/lib/db/testing";
import {
  adminUserRoles,
  adminUsers,
  auditLogs,
  entityVersions,
  propFirms,
  redirects,
  roles,
} from "@/lib/db/schema";
import {
  AuthorizationError,
  ROLES,
  seedRolesAndPermissions,
} from "@/lib/auth/permissions";
import {
  DRAFT_SCHEMA_VERSION,
  draftPayloadSchema,
} from "@/lib/validation/draft";
import {
  PrePublishCheckError,
  StaleDraftError,
  discardDraft,
  getCurrentVersion,
  materializeDraft,
  publishFirm,
  rollbackToVersion,
  saveDraft,
  softDeleteFirm,
} from "./firm-draft";
import { listPublishedFirmSummaries } from "@/lib/repositories/public-firms";
import { getPublishedFirmView } from "@/lib/repositories/public-firm-view";

/**
 * (4) public queries cannot access draft_payload, (6) draft validation,
 * (7) optimistic concurrency, (8) publish transaction, (9) rollback,
 * (10) soft delete, (3) authorization boundaries.
 *
 * Test records use OBVIOUSLY FAKE names ("Example Firm A") and are created
 * inside the test database only. No demo prop-firm data is added to the
 * application database (docs/CLAUDE.md §3).
 */
describe("firm draft / publish", () => {
  let db: TestDb;
  let client: PGlite;
  let close: () => Promise<void>;
  let publisherId: string;
  let editorId: string;
  let adminId: string;
  let firmId: string;

  beforeAll(async () => {
    ({ db, client, close } = await createTestDb());
  });

  beforeEach(async () => {
    await resetTestDb(client);
    await seedRolesAndPermissions(db);

    const allRoles = await db.select().from(roles);
    const roleId = (key: string) => allRoles.find((r) => r.key === key)!.id;

    const [publisher] = await db
      .insert(adminUsers)
      .values({
        email: "publisher@example.test",
        passwordHash: "x",
        fullName: "Publisher",
        status: "active",
      })
      .returning({ id: adminUsers.id });
    publisherId = publisher!.id;

    const [editor] = await db
      .insert(adminUsers)
      .values({
        email: "editor@example.test",
        passwordHash: "x",
        fullName: "Editor",
        status: "active",
      })
      .returning({ id: adminUsers.id });
    editorId = editor!.id;

    const [admin] = await db
      .insert(adminUsers)
      .values({
        email: "admin@example.test",
        passwordHash: "x",
        fullName: "Admin",
        status: "active",
      })
      .returning({ id: adminUsers.id });
    adminId = admin!.id;

    await db.insert(adminUserRoles).values([
      { adminUserId: publisherId, roleId: roleId(ROLES.PUBLISHER) },
      { adminUserId: editorId, roleId: roleId(ROLES.EDITOR) },
      { adminUserId: adminId, roleId: roleId(ROLES.ADMIN) },
    ]);

    const [firm] = await db
      .insert(propFirms)
      .values({
        slug: "example-firm-a",
        name: "Example Firm A",
        description: "A placeholder record used only by the test suite.",
        status: "published",
        publishedAt: new Date(),
      })
      .returning({ id: propFirms.id });
    firmId = firm!.id;
  });

  afterAll(async () => {
    await close();
  });

  const draft = (baseVersion: number, adminId: string, firm = {}) => ({
    schemaVersion: DRAFT_SCHEMA_VERSION as 1,
    baseVersion,
    updatedAt: new Date().toISOString(),
    updatedByAdminId: adminId,
    firm,
  });

  describe("draft validation", () => {
    it("rejects an unknown schema version", () => {
      expect(() =>
        draftPayloadSchema.parse({ ...draft(0, editorId), schemaVersion: 99 }),
      ).toThrow();
    });

    it("rejects unknown fields (strict envelope)", () => {
      expect(() =>
        draftPayloadSchema.parse({ ...draft(0, editorId), rogue: true }),
      ).toThrow();
    });

    it("rejects an invalid slug", async () => {
      await expect(
        saveDraft(db, {
          adminUserId: editorId,
          firmId,
          payload: draft(0, editorId, { slug: "Not A Slug" }),
        }),
      ).rejects.toThrow();
    });

    it("rejects a challenge update without an id", () => {
      expect(() =>
        draftPayloadSchema.parse({
          ...draft(0, editorId),
          challenges: [{ _op: "update", name: "X" }],
        }),
      ).toThrow();
    });

    it("rejects money without a currency", () => {
      expect(() =>
        draftPayloadSchema.parse({
          ...draft(0, editorId),
          challenges: [
            { _op: "create", accountSize: { amount: 100000 } as never },
          ],
        }),
      ).toThrow();
    });
  });

  describe("public / draft isolation", () => {
    it("editing and saving a draft changes NOTHING the public can see", async () => {
      const before = await getPublishedFirmView(db, "example-firm-a");

      await saveDraft(db, {
        adminUserId: editorId,
        firmId,
        payload: draft(0, editorId, {
          name: "Renamed In Draft",
          tagline: "draft tagline",
        }),
      });

      const after = await getPublishedFirmView(db, "example-firm-a");
      expect(after).toEqual(before);
      expect(after!.name).toBe("Example Firm A");
    });

    it("the public repository never returns draft_payload", async () => {
      await saveDraft(db, {
        adminUserId: editorId,
        firmId,
        payload: draft(0, editorId, { name: "Secret Draft Name" }),
      });

      const firm = await getPublishedFirmView(db, "example-firm-a");
      const list = await listPublishedFirmSummaries(db);

      expect(firm).not.toHaveProperty("draftPayload");
      expect(firm).not.toHaveProperty("draft_payload");
      expect(JSON.stringify(firm)).not.toContain("Secret Draft Name");
      expect(JSON.stringify(list)).not.toContain("Secret Draft Name");
    });

    it("the public repository never exposes admin-only fields", async () => {
      const firm = await getPublishedFirmView(db, "example-firm-a");
      for (const forbidden of [
        "draftPayload",
        "createdByAdminId",
        "updatedByAdminId",
        "verifiedByAdminId",
        "dataCompletenessScore",
        "status",
      ]) {
        expect(firm).not.toHaveProperty(forbidden);
      }
    });

    it("never returns unpublished or soft-deleted firms", async () => {
      await db
        .insert(propFirms)
        .values({ slug: "example-firm-b", name: "Example Firm B" }); // draft
      expect(await getPublishedFirmView(db, "example-firm-b")).toBeNull();

      // `admin` holds firm:delete; `publisher` deliberately does not
      // (docs/ADMIN.md §11).
      await softDeleteFirm(db, { adminUserId: adminId, firmId });
      expect(await getPublishedFirmView(db, "example-firm-a")).toBeNull();
    });
  });

  describe("preview materialisation", () => {
    it("shows draft values while the public page shows published values", async () => {
      await saveDraft(db, {
        adminUserId: editorId,
        firmId,
        payload: draft(0, editorId, { tagline: "25% off" }),
      });

      const preview = await materializeDraft(db, firmId);
      const publicView = await getPublishedFirmView(db, "example-firm-a");

      expect(preview.tagline).toBe("25% off");
      expect(publicView!.tagline).toBeNull();
    });

    it("performs no writes", async () => {
      await saveDraft(db, {
        adminUserId: editorId,
        firmId,
        payload: draft(0, editorId, { name: "Draft Name" }),
      });
      const before = await client.query(`select * from prop_firms`);
      await materializeDraft(db, firmId);
      const after = await client.query(`select * from prop_firms`);
      expect(after.rows).toEqual(before.rows);
    });

    it("returns the published view when there is no draft", async () => {
      const view = await materializeDraft(db, firmId);
      expect(view.name).toBe("Example Firm A");
    });
  });

  describe("optimistic concurrency", () => {
    it("rejects a draft forked from a superseded version", async () => {
      await publishFirm(db, { adminUserId: publisherId, firmId });
      expect(await getCurrentVersion(db, firmId)).toBe(1);

      await expect(
        saveDraft(db, {
          adminUserId: editorId,
          firmId,
          payload: draft(0, editorId, { name: "Stale" }),
        }),
      ).rejects.toBeInstanceOf(StaleDraftError);
    });

    it("refuses to publish a stale draft rather than overwriting silently", async () => {
      await saveDraft(db, {
        adminUserId: editorId,
        firmId,
        payload: draft(0, editorId, { name: "First" }),
      });
      // Someone else publishes, moving the firm to version 1.
      await publishFirm(db, { adminUserId: publisherId, firmId });

      await db
        .update(propFirms)
        .set({ draftPayload: draft(0, editorId, { name: "Stale" }) })
        .where(eq(propFirms.id, firmId));

      await expect(
        publishFirm(db, { adminUserId: publisherId, firmId }),
      ).rejects.toBeInstanceOf(StaleDraftError);
    });
  });

  describe("publish", () => {
    it("applies the draft, snapshots a version, audits, and clears the draft", async () => {
      await saveDraft(db, {
        adminUserId: editorId,
        firmId,
        payload: draft(0, editorId, { name: "Published Name" }),
      });

      const result = await publishFirm(db, {
        adminUserId: publisherId,
        firmId,
      });
      expect(result.version).toBe(1);

      const [firm] = await db
        .select()
        .from(propFirms)
        .where(eq(propFirms.id, firmId));
      expect(firm!.name).toBe("Published Name");
      expect(firm!.draftPayload).toBeNull();

      const versions = await db.select().from(entityVersions);
      expect(versions).toHaveLength(1);

      const audits = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, "firm.published"));
      expect(audits).toHaveLength(1);

      const publicView = await getPublishedFirmView(db, "example-firm-a");
      expect(publicView!.name).toBe("Published Name");
    });

    it("creates a 301 in the same transaction when the slug changes", async () => {
      await saveDraft(db, {
        adminUserId: editorId,
        firmId,
        payload: draft(0, editorId, { slug: "example-firm-a-renamed" }),
      });
      const result = await publishFirm(db, {
        adminUserId: publisherId,
        firmId,
      });

      expect(result.slugChanged).toBe(true);
      const [r] = await db.select().from(redirects);
      expect(r!.fromPath).toBe("/prop-firms/example-firm-a");
      expect(r!.toPath).toBe("/prop-firms/example-firm-a-renamed");
      expect(r!.statusCode).toBe(301);
      expect(r!.source).toBe("auto_slug_change");
    });

    it("blocks publish when the pre-publish checklist fails", async () => {
      const [firm] = await db
        .insert(propFirms)
        .values({ slug: "no-description", name: "No Description" })
        .returning({ id: propFirms.id });

      await expect(
        publishFirm(db, { adminUserId: publisherId, firmId: firm!.id }),
      ).rejects.toBeInstanceOf(PrePublishCheckError);
    });

    it("moves a verified firm to needs_review after a substantive edit", async () => {
      await db
        .update(propFirms)
        .set({ verificationStatus: "verified", verifiedAt: new Date() })
        .where(eq(propFirms.id, firmId));

      await saveDraft(db, {
        adminUserId: editorId,
        firmId,
        payload: draft(0, editorId, { name: "Edited" }),
      });
      await publishFirm(db, { adminUserId: publisherId, firmId });

      const [firm] = await db
        .select()
        .from(propFirms)
        .where(eq(propFirms.id, firmId));
      expect(firm!.verificationStatus).toBe("needs_review");
    });
  });

  describe("discard", () => {
    it("clears the draft and leaves published columns untouched", async () => {
      const before = await getPublishedFirmView(db, "example-firm-a");
      await saveDraft(db, {
        adminUserId: editorId,
        firmId,
        payload: draft(0, editorId, { name: "Discarded" }),
      });
      await discardDraft(db, { adminUserId: editorId, firmId });

      const [firm] = await db
        .select()
        .from(propFirms)
        .where(eq(propFirms.id, firmId));
      expect(firm!.draftPayload).toBeNull();
      expect(await getPublishedFirmView(db, "example-firm-a")).toEqual(before);
    });
  });

  describe("rollback", () => {
    it("restores INTO draft_payload, never straight to live", async () => {
      await saveDraft(db, {
        adminUserId: editorId,
        firmId,
        payload: draft(0, editorId, { name: "Version One" }),
      });
      await publishFirm(db, { adminUserId: publisherId, firmId });

      await saveDraft(db, {
        adminUserId: editorId,
        firmId,
        payload: draft(1, editorId, { name: "Version Two" }),
      });
      await publishFirm(db, { adminUserId: publisherId, firmId });

      const live = await getPublishedFirmView(db, "example-firm-a");
      expect(live!.name).toBe("Version Two");

      await rollbackToVersion(db, {
        adminUserId: publisherId,
        firmId,
        versionNumber: 1,
      });

      // Live is UNCHANGED — the restore landed in the draft.
      const stillLive = await getPublishedFirmView(db, "example-firm-a");
      expect(stillLive!.name).toBe("Version Two");

      const preview = await materializeDraft(db, firmId);
      expect(preview.name).toBe("Version One");
    });

    it("keeps history append-only — rolling back adds, never erases", async () => {
      await publishFirm(db, { adminUserId: publisherId, firmId });
      await rollbackToVersion(db, {
        adminUserId: publisherId,
        firmId,
        versionNumber: 1,
      });
      await publishFirm(db, { adminUserId: publisherId, firmId });

      const versions = await db.select().from(entityVersions);
      expect(versions.map((v) => v.versionNumber).sort()).toEqual([1, 2]);
    });
  });

  describe("authorization boundaries", () => {
    it("an editor cannot publish", async () => {
      await expect(
        publishFirm(db, { adminUserId: editorId, firmId }),
      ).rejects.toBeInstanceOf(AuthorizationError);
    });

    it("an editor cannot delete", async () => {
      await expect(
        softDeleteFirm(db, { adminUserId: editorId, firmId }),
      ).rejects.toBeInstanceOf(AuthorizationError);
    });

    it("a publisher can publish but cannot delete", async () => {
      await expect(
        publishFirm(db, { adminUserId: publisherId, firmId }),
      ).resolves.toBeDefined();
      await expect(
        softDeleteFirm(db, { adminUserId: publisherId, firmId }),
      ).rejects.toBeInstanceOf(AuthorizationError);
    });

    it("an unauthenticated caller is rejected", async () => {
      await expect(
        saveDraft(db, {
          adminUserId: "",
          firmId,
          payload: draft(0, editorId),
        }),
      ).rejects.toThrow(/Authentication required/);
    });
  });
});
