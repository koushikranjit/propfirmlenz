import { eq } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetTestDb, type TestDb } from "@/lib/db/testing";
import {
  affiliateLinks,
  challenges,
  firmInstruments,
  firmPlatforms,
  instruments,
  media,
  offers,
  platforms,
  propFirms,
  ruleValues,
  rules,
} from "@/lib/db/schema";
import { getPublishedFirmView } from "./public-firm-view";
import {
  countPublishedFirms,
  listPublishedFirmSlugs,
  listPublishedFirmSummaries,
} from "./public-firms";

/**
 * The public read path, against a REAL PostgreSQL (PGlite) — docs/ARCHITECTURE.md
 * §14 cases 1, 2, 4 and §21.9.
 *
 * Every record is OBVIOUSLY FAKE ("Example Firm A", "Example Platform"). No
 * real prop firm, price, rule or payout figure exists anywhere in this
 * repository (CLAUDE.md §3 `[LOCKED]`).
 */
describe("public firm view", () => {
  let db: TestDb;
  let client: PGlite;
  let close: () => Promise<void>;
  let firmId: string;

  beforeAll(async () => {
    ({ db, client, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await resetTestDb(client);

    const [logo] = await db
      .insert(media)
      .values({
        storageKey: "example/logo.png",
        publicUrl: "https://cdn.example.test/logo.png",
        mimeType: "image/png",
        byteSize: 1024,
        width: 64,
        height: 64,
        checksumSha256: "0".repeat(64),
        altText: "Example Firm A logo",
      })
      .returning({ id: media.id });

    const [firm] = await db
      .insert(propFirms)
      .values({
        slug: "example-firm-a",
        name: "Example Firm A",
        description: "A placeholder record used only by the test suite.",
        logoMediaId: logo!.id,
        headquartersCountry: "GB",
        status: "published",
        publishedAt: new Date(),
      })
      .returning({ id: propFirms.id });
    firmId = firm!.id;
  });

  const publishedChallenge = (overrides = {}) => ({
    propFirmId: firmId,
    name: "Example Challenge",
    slug: "example-challenge",
    challengeType: "two_step",
    accountSize: "50000.00",
    accountCurrency: "USD",
    status: "published",
    ...overrides,
  });

  describe("published-only reads", () => {
    it("returns null for a draft, archived or soft-deleted firm", async () => {
      await db
        .update(propFirms)
        .set({ status: "draft" })
        .where(eq(propFirms.id, firmId));
      expect(await getPublishedFirmView(db, "example-firm-a")).toBeNull();

      await db
        .update(propFirms)
        .set({ status: "published", deletedAt: new Date() })
        .where(eq(propFirms.id, firmId));
      expect(await getPublishedFirmView(db, "example-firm-a")).toBeNull();
    });

    it("returns null for an unknown slug", async () => {
      expect(await getPublishedFirmView(db, "no-such-firm")).toBeNull();
    });

    it("excludes unpublished and soft-deleted challenges", async () => {
      await db.insert(challenges).values([
        publishedChallenge(),
        publishedChallenge({
          name: "Draft Challenge",
          slug: "draft-challenge",
          status: "draft",
        }),
        publishedChallenge({
          name: "Deleted Challenge",
          slug: "deleted-challenge",
          deletedAt: new Date(),
        }),
      ]);

      const view = await getPublishedFirmView(db, "example-firm-a");
      expect(view!.challenges.map((c) => c.name)).toEqual([
        "Example Challenge",
      ]);
    });

    it("excludes unpublished offers and offers outside their window", async () => {
      const hourAgo = new Date(Date.now() - 3_600_000);
      const hourAhead = new Date(Date.now() + 3_600_000);

      await db.insert(offers).values([
        {
          propFirmId: firmId,
          title: "Active Example Offer",
          status: "published",
          startsAt: hourAgo,
          endsAt: hourAhead,
        },
        {
          propFirmId: firmId,
          title: "Draft Example Offer",
          status: "draft",
        },
        {
          propFirmId: firmId,
          title: "Expired Example Offer",
          status: "published",
          endsAt: hourAgo,
        },
        {
          propFirmId: firmId,
          title: "Future Example Offer",
          status: "published",
          startsAt: hourAhead,
        },
      ]);

      const view = await getPublishedFirmView(db, "example-firm-a");
      expect(view!.offers.map((o) => o.title)).toEqual([
        "Active Example Offer",
      ]);
    });

    it("excludes unpublished platforms, instruments and rules", async () => {
      const [live] = await db
        .insert(platforms)
        .values({
          key: "example-live",
          name: "Example Platform",
          slug: "example-platform",
          status: "published",
        })
        .returning({ id: platforms.id });
      const [hidden] = await db
        .insert(platforms)
        .values({
          key: "example-hidden",
          name: "Hidden Platform",
          slug: "hidden-platform",
          status: "draft",
        })
        .returning({ id: platforms.id });

      await db.insert(firmPlatforms).values([
        { propFirmId: firmId, platformId: live!.id, isPrimary: true },
        { propFirmId: firmId, platformId: hidden!.id },
      ]);

      const [instrument] = await db
        .insert(instruments)
        .values({
          key: "example-instrument",
          name: "Example Instrument",
          slug: "example-instrument",
          assetClass: "forex",
          status: "published",
        })
        .returning({ id: instruments.id });
      await db.insert(firmInstruments).values({
        propFirmId: firmId,
        instrumentId: instrument!.id,
        isAllowed: false,
      });

      const [rule] = await db
        .insert(rules)
        .values({
          key: "example_rule",
          label: "Example Rule",
          category: "trading",
          dataType: "boolean",
          status: "published",
        })
        .returning({ id: rules.id });
      await db.insert(ruleValues).values({
        ruleId: rule!.id,
        scope: "firm",
        propFirmId: firmId,
        valueBoolean: false,
      });

      const view = await getPublishedFirmView(db, "example-firm-a");
      expect(view!.platforms.map((p) => p.name)).toEqual(["Example Platform"]);
      expect(view!.instruments[0]?.isAllowed).toBe(false);
      expect(view!.rules[0]?.state).toBe("not_allowed");
    });
  });

  describe("data the public must never receive", () => {
    it("never exposes the affiliate destination — only whether a link exists", async () => {
      await db.insert(affiliateLinks).values({
        propFirmId: firmId,
        label: "Default",
        destinationUrl: "https://partner.example.test/secret-tracking-id",
        isDefault: true,
        status: "active",
        commissionNotes: "Confidential commercial terms.",
      });

      const view = await getPublishedFirmView(db, "example-firm-a");
      expect(view!.hasAffiliateLink).toBe(true);

      const serialised = JSON.stringify(view);
      expect(serialised).not.toContain("partner.example.test");
      expect(serialised).not.toContain("secret-tracking-id");
      expect(serialised).not.toContain("Confidential commercial terms");
    });

    it("reports no affiliate link when the only one is inactive", async () => {
      await db.insert(affiliateLinks).values({
        propFirmId: firmId,
        label: "Paused",
        destinationUrl: "https://partner.example.test/paused",
        isDefault: true,
        status: "paused",
      });

      const view = await getPublishedFirmView(db, "example-firm-a");
      expect(view!.hasAffiliateLink).toBe(false);
    });

    it("never returns draft_payload or admin-only fields", async () => {
      await db
        .update(propFirms)
        .set({
          draftPayload: {
            schemaVersion: 1,
            baseVersion: 0,
            updatedAt: new Date().toISOString(),
            updatedByAdminId: "00000000-0000-7000-8000-000000000001",
            firm: { name: "Secret Draft Name" },
          },
          dataCompletenessScore: 42,
        })
        .where(eq(propFirms.id, firmId));

      const view = await getPublishedFirmView(db, "example-firm-a");

      expect(view!.name).toBe("Example Firm A");
      expect(JSON.stringify(view)).not.toContain("Secret Draft Name");
      for (const forbidden of [
        "draftPayload",
        "status",
        "dataCompletenessScore",
        "createdByAdminId",
        "updatedByAdminId",
        "verifiedByAdminId",
      ]) {
        expect(view).not.toHaveProperty(forbidden);
      }
    });
  });

  describe("money keeps its source currency", () => {
    it("pairs every amount with the currency it was published in", async () => {
      await db.insert(challenges).values(
        publishedChallenge({
          accountSize: "50000.00",
          accountCurrency: "EUR",
          price: "299.00",
          priceCurrency: "EUR",
        }),
      );

      const view = await getPublishedFirmView(db, "example-firm-a");
      expect(view!.challenges[0]?.accountSize).toEqual({
        amount: "50000.00",
        currency: "EUR",
      });
      expect(view!.challenges[0]?.price).toEqual({
        amount: "299.00",
        currency: "EUR",
      });
    });

    it("returns a null price rather than zero when none is published", async () => {
      await db.insert(challenges).values(publishedChallenge());
      const view = await getPublishedFirmView(db, "example-firm-a");
      expect(view!.challenges[0]?.price).toBeNull();
    });
  });

  describe("directory", () => {
    it("counts and lists published firms only", async () => {
      await db.insert(propFirms).values({
        slug: "example-firm-b",
        name: "Example Firm B",
        status: "draft",
      });

      expect(await countPublishedFirms(db)).toBe(1);
      const summaries = await listPublishedFirmSummaries(db);
      expect(summaries.map((f) => f.slug)).toEqual(["example-firm-a"]);
      expect(await listPublishedFirmSlugs(db)).toEqual([
        expect.objectContaining({ slug: "example-firm-a" }),
      ]);
    });

    it("offers a 'from' price only when one currency is used", async () => {
      await db.insert(challenges).values([
        publishedChallenge({ price: "299.00", priceCurrency: "USD" }),
        publishedChallenge({
          name: "Second Example Challenge",
          slug: "second-example-challenge",
          price: "199.00",
          priceCurrency: "USD",
        }),
      ]);

      const [single] = await listPublishedFirmSummaries(db);
      expect(single?.priceFrom).toEqual({ amount: "199.00", currency: "USD" });
      expect(single?.hasMixedPriceCurrencies).toBe(false);
      expect(single?.challengeCount).toBe(2);

      await db.insert(challenges).values(
        publishedChallenge({
          name: "Euro Example Challenge",
          slug: "euro-example-challenge",
          price: "179.00",
          priceCurrency: "EUR",
        }),
      );

      const [mixed] = await listPublishedFirmSummaries(db);
      // A minimum across currencies would be a false comparison, so none is
      // offered (docs/ARCHITECTURE.md §18.3 `[LOCKED]`).
      expect(mixed?.priceFrom).toBeNull();
      expect(mixed?.hasMixedPriceCurrencies).toBe(true);
    });

    it("filters by name, country and verification without leaking drafts", async () => {
      await db.insert(propFirms).values({
        slug: "example-firm-c",
        name: "Example Firm C",
        headquartersCountry: "US",
        verificationStatus: "verified",
        status: "published",
      });

      expect(
        (await listPublishedFirmSummaries(db, { q: "Firm C" })).map(
          (f) => f.slug,
        ),
      ).toEqual(["example-firm-c"]);
      expect(
        (await listPublishedFirmSummaries(db, { country: "GB" })).map(
          (f) => f.slug,
        ),
      ).toEqual(["example-firm-a"]);
      expect(
        (await listPublishedFirmSummaries(db, { verifiedOnly: true })).map(
          (f) => f.slug,
        ),
      ).toEqual(["example-firm-c"]);
    });

    it("treats search metacharacters as literal text", async () => {
      // "%" must not act as a wildcard that matches every firm.
      expect(await listPublishedFirmSummaries(db, { q: "%" })).toEqual([]);
    });

    it("paginates rather than returning everything", async () => {
      const page = await listPublishedFirmSummaries(db, { pageSize: 1 });
      expect(page).toHaveLength(1);
      expect(
        await listPublishedFirmSummaries(db, { pageSize: 1, page: 2 }),
      ).toHaveLength(0);
    });
  });
});
