import { eq, isNull } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetTestDb, type TestDb } from "@/lib/db/testing";
import {
  adminUserRoles,
  adminUsers,
  affiliateLinks,
  challenges,
  offers,
  propFirms,
  roles,
} from "@/lib/db/schema";
import {
  AuthorizationError,
  ROLES,
  seedRolesAndPermissions,
} from "@/lib/auth/permissions";
import { getPublishedFirmView } from "@/lib/repositories/public-firm-view";
import { firmEssentialsSchema, slugFromName } from "@/lib/validation/firm";
import { publishFirm } from "./firm-draft";
import { UnsafeDestinationError, saveFirmEssentials } from "./firm-essentials";

/**
 * The SIMPLE editor's service — docs/ADMIN.md §6.
 *
 * It is a different door into the existing machinery, so these tests check
 * exactly that: the same draft model, the same affiliate protection, the same
 * offers architecture, and no data loss for anything entered under Advanced.
 */
describe("firm essentials", () => {
  let db: TestDb;
  let client: PGlite;
  let close: () => Promise<void>;
  let adminId: string;
  let analystId: string;
  let firmId: string;

  beforeAll(async () => {
    ({ db, client, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await resetTestDb(client);
    await seedRolesAndPermissions(db);

    const makeAdmin = async (email: string, role: string) => {
      const [user] = await db
        .insert(adminUsers)
        .values({ email, passwordHash: "x", fullName: email, status: "active" })
        .returning({ id: adminUsers.id });
      const all = await db.select().from(roles);
      await db.insert(adminUserRoles).values({
        adminUserId: user!.id,
        roleId: all.find((r) => r.key === role)!.id,
      });
      return user!.id;
    };

    adminId = await makeAdmin("admin@example.test", ROLES.ADMIN);
    analystId = await makeAdmin("analyst@example.test", ROLES.ANALYST);

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

  const input = (overrides: Record<string, unknown> = {}) =>
    firmEssentialsSchema.parse({
      name: "Example Firm A",
      description: "Updated from the simple editor.",
      websiteUrl: "https://example.test",
      affiliateUrl: "",
      payoutInfoUrl: "",
      discountCode: "",
      discountPercent: "",
      discountEndsAt: "",
      ...overrides,
    });

  const save = (overrides = {}, who = adminId) =>
    saveFirmEssentials(db, {
      adminUserId: who,
      firmId,
      input: input(overrides),
    });

  describe("authorization", () => {
    it("refuses an admin without firm:edit", async () => {
      await expect(save({}, analystId)).rejects.toThrow(AuthorizationError);
    });
  });

  describe("draft-only", () => {
    it("changes nothing public until publish", async () => {
      const before = await getPublishedFirmView(db, "example-firm-a");
      await save({ payoutInfoUrl: "https://example.test/payouts" });

      expect(await getPublishedFirmView(db, "example-firm-a")).toEqual(before);
      expect(await db.select().from(affiliateLinks)).toHaveLength(0);
      expect(await db.select().from(offers)).toHaveLength(0);
    });
  });

  describe("payout link", () => {
    it("publishes as a plain URL on the firm, with no payout figures", async () => {
      await save({ payoutInfoUrl: "https://example.test/payouts" });
      await publishFirm(db, { adminUserId: adminId, firmId });

      const view = await getPublishedFirmView(db, "example-firm-a");
      expect(view!.payoutInfoUrl).toBe("https://example.test/payouts");
      // A link, never a claim: nothing numeric came with it.
      expect(JSON.stringify(view)).not.toMatch(/payoutTotal|payoutCount/);
    });
  });

  describe("affiliate link", () => {
    it("stages a default link and never exposes the destination publicly", async () => {
      await save({ affiliateUrl: "https://partner.example.test/secret-id" });
      await publishFirm(db, { adminUserId: adminId, firmId });

      const [link] = await db.select().from(affiliateLinks);
      expect(link?.destinationUrl).toBe(
        "https://partner.example.test/secret-id",
      );
      expect(link?.isDefault).toBe(true);
      expect(link?.status).toBe("active");

      const view = await getPublishedFirmView(db, "example-firm-a");
      expect(view!.hasAffiliateLink).toBe(true);
      expect(JSON.stringify(view)).not.toContain("partner.example.test");
      expect(JSON.stringify(view)).not.toContain("secret-id");
    });

    it("updates the existing default link rather than creating a second", async () => {
      await save({ affiliateUrl: "https://partner.example.test/one" });
      await publishFirm(db, { adminUserId: adminId, firmId });
      await save({ affiliateUrl: "https://partner.example.test/two" });
      await publishFirm(db, { adminUserId: adminId, firmId });

      const links = await db
        .select()
        .from(affiliateLinks)
        .where(isNull(affiliateLinks.deletedAt));
      expect(links).toHaveLength(1);
      expect(links[0]?.destinationUrl).toBe("https://partner.example.test/two");
    });

    it("rejects a destination that could never be safely redirected to", async () => {
      for (const affiliateUrl of [
        "http://partner.example.test",
        "https://user:pass@partner.example.test",
      ]) {
        await expect(save({ affiliateUrl })).rejects.toBeInstanceOf(
          UnsafeDestinationError,
        );
      }
      expect(await db.select().from(affiliateLinks)).toHaveLength(0);
    });
  });

  describe("discount", () => {
    it("reuses the offers architecture rather than a second system", async () => {
      await save({ discountCode: "EXAMPLE", discountPercent: "20" });
      await publishFirm(db, { adminUserId: adminId, firmId });

      const rows = await db.select().from(offers);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.code).toBe("EXAMPLE");
      expect(rows[0]?.discountType).toBe("percent");
      expect(rows[0]?.discountValue).toBe("20.00");

      const view = await getPublishedFirmView(db, "example-firm-a");
      expect(view!.offers[0]?.code).toBe("EXAMPLE");
    });

    it("updates the existing offer instead of adding another", async () => {
      await save({ discountCode: "FIRST", discountPercent: "10" });
      await publishFirm(db, { adminUserId: adminId, firmId });
      await save({ discountCode: "SECOND", discountPercent: "15" });
      await publishFirm(db, { adminUserId: adminId, firmId });

      const rows = await db
        .select()
        .from(offers)
        .where(isNull(offers.deletedAt));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.code).toBe("SECOND");
    });

    it("creates no offer when no discount was entered", async () => {
      await save({});
      expect(await db.select().from(offers)).toHaveLength(0);
    });
  });

  describe("partial save", () => {
    it("never wipes data entered under Advanced", async () => {
      // Advanced data: company fields and a challenge.
      await db
        .update(propFirms)
        .set({
          legalName: "Example Firm A Ltd",
          foundedYear: 2019,
          headquartersCountry: "GB",
          supportEmail: "support@example.test",
        })
        .where(eq(propFirms.id, firmId));
      await db.insert(challenges).values({
        propFirmId: firmId,
        name: "Example Challenge",
        slug: "example-challenge",
        challengeType: "two_step",
        accountSize: "50000.00",
        accountCurrency: "USD",
        status: "published",
      });

      await save({ description: "Edited from the simple screen." });
      await publishFirm(db, { adminUserId: adminId, firmId });

      const [firm] = await db
        .select()
        .from(propFirms)
        .where(eq(propFirms.id, firmId));
      expect(firm?.legalName).toBe("Example Firm A Ltd");
      expect(firm?.foundedYear).toBe(2019);
      expect(firm?.headquartersCountry).toBe("GB");
      expect(firm?.supportEmail).toBe("support@example.test");
      expect(firm?.description).toBe("Edited from the simple screen.");

      const view = await getPublishedFirmView(db, "example-firm-a");
      expect(view!.challenges).toHaveLength(1);
    });
  });

  describe("slug derivation", () => {
    it("builds a valid public slug from a firm name", () => {
      expect(slugFromName("Example Firm A")).toBe("example-firm-a");
      expect(slugFromName("  Spaced   Out!  ")).toBe("spaced-out");
      expect(slugFromName("Firm & Co. 2026")).toBe("firm-co-2026");
    });

    it("produces a slug the public route accepts", () => {
      const pattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
      for (const name of ["Example Firm A", "Firm & Co. 2026", "A  B"]) {
        expect(slugFromName(name)).toMatch(pattern);
      }
    });
  });
});
