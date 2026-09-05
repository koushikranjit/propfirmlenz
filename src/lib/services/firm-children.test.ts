import { and, eq, isNull } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetTestDb, type TestDb } from "@/lib/db/testing";
import {
  adminUserRoles,
  adminUsers,
  affiliateLinks,
  auditLogs,
  challenges,
  firmInstruments,
  firmPlatforms,
  instruments,
  offers,
  platforms,
  propFirms,
  roles,
  ruleValues,
  rules,
  seoMetadata,
} from "@/lib/db/schema";
import {
  AuthorizationError,
  ROLES,
  seedRolesAndPermissions,
} from "@/lib/auth/permissions";
import { getPublishedFirmView } from "@/lib/repositories/public-firm-view";
import { getAdminFirmChildren } from "@/lib/repositories/admin-firm-children";
import { StaleDraftError, materializeDraft, publishFirm } from "./firm-draft";
import { stageChildOp, stageSeo, unstageChildOp } from "./firm-children";

/**
 * Admin child data management — docs/ADMIN.md §7, docs/DATABASE.md §3.2.1.
 *
 * Real PostgreSQL (PGlite), real constraints, real transactions.
 *
 * THE GUARANTEE UNDER TEST: staging a child edit changes nothing the public can
 * see, and publishing applies every staged collection atomically. Before this
 * stage, a staged challenge was validated, previewed, and then silently dropped
 * at publish — several tests below exist specifically to keep that from
 * returning.
 *
 * Every record is OBVIOUSLY FAKE ("Example Firm A", "Example Challenge").
 */
describe("firm child data", () => {
  let db: TestDb;
  let client: PGlite;
  let close: () => Promise<void>;
  let editorId: string;
  let publisherId: string;
  let analystId: string;
  let seoAdminId: string;
  let firmId: string;
  let platformId: string;
  let instrumentId: string;
  let ruleId: string;

  beforeAll(async () => {
    ({ db, client, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await resetTestDb(client);
    await seedRolesAndPermissions(db);

    const roleRows = await db.select().from(adminUsers);
    expect(roleRows).toHaveLength(0);

    const makeAdmin = async (email: string, role: string) => {
      const [user] = await db
        .insert(adminUsers)
        .values({
          email,
          passwordHash: "x",
          fullName: email,
          status: "active",
        })
        .returning({ id: adminUsers.id });
      const allRoles = await db.select().from(roles);
      const roleId = allRoles.find((r) => r.key === role)!.id;
      await db.insert(adminUserRoles).values({ adminUserId: user!.id, roleId });
      return user!.id;
    };

    editorId = await makeAdmin("editor@example.test", ROLES.EDITOR);
    publisherId = await makeAdmin("publisher@example.test", ROLES.PUBLISHER);
    analystId = await makeAdmin("analyst@example.test", ROLES.ANALYST);
    // The publisher role deliberately does NOT hold seo:write; SEO is a
    // separate concern, so these tests use an admin who has it.
    seoAdminId = await makeAdmin("admin@example.test", ROLES.ADMIN);

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

    const [platform] = await db
      .insert(platforms)
      .values({
        key: "example-platform",
        name: "Example Platform",
        slug: "example-platform",
        status: "published",
      })
      .returning({ id: platforms.id });
    platformId = platform!.id;

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
    instrumentId = instrument!.id;

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
    ruleId = rule!.id;
  });

  const newChallengeOp = (overrides = {}) => ({
    _op: "create" as const,
    name: "Example Challenge",
    slug: "example-challenge",
    challengeType: "two_step" as const,
    accountSize: { amount: 50000, currency: "USD" },
    price: { amount: 299, currency: "USD" },
    maxDailyLossPct: 5,
    maxTotalDrawdownPct: 10,
    ...overrides,
  });

  const stage = (op: unknown, collection = "challenges", who = editorId) =>
    stageChildOp(db, {
      adminUserId: who,
      firmId,
      collection: collection as never,
      op: op as never,
    });

  const publish = () => publishFirm(db, { adminUserId: publisherId, firmId });

  const publicView = () => getPublishedFirmView(db, "example-firm-a");

  /* ------------------------------------------------------- authorization */

  describe("authorization", () => {
    it("(1) refuses a mutation from an admin without permission", async () => {
      // The analyst role holds firm:read only.
      await expect(
        stage(newChallengeOp(), "challenges", analystId),
      ).rejects.toThrow(AuthorizationError);

      const firm = await db
        .select()
        .from(propFirms)
        .where(eq(propFirms.id, firmId));
      expect(firm[0]?.draftPayload).toBeNull();
    });

    it("(2) allows an admin who holds the permission", async () => {
      const result = await stage(newChallengeOp());
      expect(result.pendingChanges).toBe(1);
    });

    it("refuses SEO edits without seo:write", async () => {
      await expect(
        stageSeo(db, {
          adminUserId: analystId,
          firmId,
          seo: { title: "Nope" },
        }),
      ).rejects.toThrow(AuthorizationError);
    });
  });

  /* -------------------------------------------------------- draft-only */

  describe("staged edits change nothing public", () => {
    it("(3) a challenge create writes no row", async () => {
      const before = await publicView();
      await stage(newChallengeOp());

      expect(await db.select().from(challenges)).toHaveLength(0);
      expect(await publicView()).toEqual(before);
    });

    it("(4) a challenge update leaves the published row untouched", async () => {
      const [row] = await db
        .insert(challenges)
        .values({
          propFirmId: firmId,
          name: "Published Challenge",
          slug: "published-challenge",
          challengeType: "two_step",
          accountSize: "50000.00",
          accountCurrency: "USD",
          status: "published",
        })
        .returning({ id: challenges.id });

      await stage({
        _op: "update",
        id: row!.id,
        name: "Renamed In Draft",
        accountSize: { amount: 99999, currency: "EUR" },
      });

      const live = await db.select().from(challenges);
      expect(live[0]?.name).toBe("Published Challenge");
      expect(live[0]?.accountSize).toBe("50000.00");
      expect(live[0]?.accountCurrency).toBe("USD");

      const view = await publicView();
      expect(view!.challenges[0]?.name).toBe("Published Challenge");
    });

    it("(5) a challenge delete deletes nothing", async () => {
      const [row] = await db
        .insert(challenges)
        .values({
          propFirmId: firmId,
          name: "Published Challenge",
          slug: "published-challenge",
          challengeType: "two_step",
          accountSize: "50000.00",
          accountCurrency: "USD",
          status: "published",
        })
        .returning({ id: challenges.id });

      await stage({ _op: "delete", id: row!.id });

      const live = await db
        .select()
        .from(challenges)
        .where(isNull(challenges.deletedAt));
      expect(live).toHaveLength(1);
      expect((await publicView())!.challenges).toHaveLength(1);
    });

    it("(6) rule changes write no rule_values row", async () => {
      await stage(
        {
          _op: "create",
          ruleId,
          scope: "firm",
          valueBoolean: false,
        },
        "ruleValues",
      );

      expect(await db.select().from(ruleValues)).toHaveLength(0);
      expect((await publicView())!.rules).toHaveLength(0);
    });

    it("(7) platform and instrument links write no association row", async () => {
      await stage({ _op: "create", platformId, isPrimary: true }, "platforms");
      await stage(
        { _op: "create", instrumentId, isAllowed: false },
        "instruments",
      );

      expect(await db.select().from(firmPlatforms)).toHaveLength(0);
      expect(await db.select().from(firmInstruments)).toHaveLength(0);
    });

    it("(8) offer changes write no offer row", async () => {
      await stage(
        { _op: "create", title: "Example Offer", code: "EXAMPLE" },
        "offers",
      );
      expect(await db.select().from(offers)).toHaveLength(0);
      expect((await publicView())!.offers).toHaveLength(0);
    });

    it("(9) affiliate changes write no link row and leave the CTA off", async () => {
      await stage(
        {
          _op: "create",
          label: "Default",
          destinationUrl: "https://partner.example.test/offer",
          isDefault: true,
        },
        "affiliateLinks",
      );

      expect(await db.select().from(affiliateLinks)).toHaveLength(0);
      expect((await publicView())!.hasAffiliateLink).toBe(false);
    });

    it("(10) SEO changes write no seo_metadata row", async () => {
      await stageSeo(db, {
        adminUserId: seoAdminId,
        firmId,
        seo: { title: "Staged title", robotsIndex: false },
      });
      expect(await db.select().from(seoMetadata)).toHaveLength(0);
    });
  });

  /* ------------------------------------------------------------ publish */

  describe("publish materialises the draft", () => {
    it("(11) creates, updates and soft-deletes challenges", async () => {
      const [existing] = await db
        .insert(challenges)
        .values({
          propFirmId: firmId,
          name: "Old Challenge",
          slug: "old-challenge",
          challengeType: "two_step",
          accountSize: "10000.00",
          accountCurrency: "USD",
          status: "published",
        })
        .returning({ id: challenges.id });

      await stage(newChallengeOp());
      await stage({ _op: "delete", id: existing!.id });
      await publish();

      const live = await db
        .select()
        .from(challenges)
        .where(isNull(challenges.deletedAt));
      expect(live).toHaveLength(1);
      expect(live[0]?.name).toBe("Example Challenge");
      // Money keeps its exact decimal and its own currency.
      expect(live[0]?.accountSize).toBe("50000.00");
      expect(live[0]?.accountCurrency).toBe("USD");
      expect(live[0]?.price).toBe("299.00");

      // The removed one is soft-deleted, not gone.
      const all = await db.select().from(challenges);
      expect(all).toHaveLength(2);
      expect(all.find((c) => c.id === existing!.id)?.deletedAt).not.toBeNull();
    });

    it("(12) materialises rule answers into the right value column", async () => {
      await stage(
        { _op: "create", ruleId, scope: "firm", valueBoolean: false },
        "ruleValues",
      );
      await publish();

      const values = await db.select().from(ruleValues);
      expect(values).toHaveLength(1);
      expect(values[0]?.valueBoolean).toBe(false);
      expect(values[0]?.valueText).toBeNull();

      // And the public page reads it as an explicit prohibition, not a gap.
      const view = await publicView();
      expect(view!.rules[0]?.state).toBe("not_allowed");
    });

    it("(13) materialises platform and instrument associations", async () => {
      await stage({ _op: "create", platformId, isPrimary: true }, "platforms");
      await stage(
        { _op: "create", instrumentId, isAllowed: false },
        "instruments",
      );
      await publish();

      const view = await publicView();
      expect(view!.platforms[0]?.name).toBe("Example Platform");
      expect(view!.platforms[0]?.isPrimary).toBe(true);
      // `false` survives: explicitly prohibited, not "no row".
      expect(view!.instruments[0]?.isAllowed).toBe(false);
    });

    it("(14) materialises offers, with their window intact", async () => {
      const endsAt = new Date(Date.now() + 86_400_000).toISOString();
      await stage(
        {
          _op: "create",
          title: "Example Offer",
          code: "EXAMPLE",
          discountType: "percent",
          discountValue: 20,
          endsAt,
        },
        "offers",
      );
      await publish();

      const rows = await db.select().from(offers);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.title).toBe("Example Offer");
      expect(rows[0]?.discountValue).toBe("20.00");
      expect(rows[0]?.endsAt?.toISOString()).toBe(endsAt);
      expect((await publicView())!.offers).toHaveLength(1);
    });

    it("(15) materialises affiliate links without exposing the destination", async () => {
      await stage(
        {
          _op: "create",
          label: "Default",
          destinationUrl: "https://partner.example.test/secret-id",
          isDefault: true,
          status: "active",
        },
        "affiliateLinks",
      );
      await publish();

      const rows = await db.select().from(affiliateLinks);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.destinationUrl).toBe(
        "https://partner.example.test/secret-id",
      );

      const view = await publicView();
      expect(view!.hasAffiliateLink).toBe(true);
      expect(JSON.stringify(view)).not.toContain("partner.example.test");
      expect(JSON.stringify(view)).not.toContain("secret-id");
    });

    it("(16) materialises SEO metadata", async () => {
      await stageSeo(db, {
        adminUserId: seoAdminId,
        firmId,
        seo: {
          title: "Example Firm A — staged title",
          metaDescription: "A staged description.",
          robotsIndex: false,
        },
      });
      await publish();

      const rows = await db.select().from(seoMetadata);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.entityId).toBe(firmId);
      expect(rows[0]?.title).toBe("Example Firm A — staged title");
      expect(rows[0]?.robotsIndex).toBe(false);
      // An admin-supplied JSON-LD blob is never written.
      expect(rows[0]?.structuredDataOverride).toBeNull();
    });

    it("(17) is atomic — a failing child rolls the whole publish back", async () => {
      // A published challenge already owns this slug, so inserting the staged
      // one violates challenges_firm_slug_uq and the transaction must abort
      // entirely — including the firm-level fields written before it.
      await db.insert(challenges).values({
        propFirmId: firmId,
        name: "Existing Challenge",
        slug: "example-challenge",
        challengeType: "two_step",
        accountSize: "10000.00",
        accountCurrency: "USD",
        status: "published",
      });
      await stage(newChallengeOp());
      await stage({ _op: "create", title: "Example Offer" }, "offers");

      await expect(publish()).rejects.toThrow();

      // The offer staged alongside it was rolled back too.
      expect(await db.select().from(offers)).toHaveLength(0);
      expect(await db.select().from(challenges)).toHaveLength(1);
      const firm = await db
        .select()
        .from(propFirms)
        .where(eq(propFirms.id, firmId));
      expect(firm[0]?.draftPayload).not.toBeNull();
      expect(firm[0]?.status).toBe("published");
    });

    it("(18) rejects a draft forked from a superseded version", async () => {
      await stage(newChallengeOp());
      await publish();

      // Stage a fresh edit — it forks from version 1 — then age its base
      // version to 0 to simulate a colleague having published underneath it.
      await stage(newChallengeOp({ slug: "second-challenge" }));
      const [firm] = await db
        .select()
        .from(propFirms)
        .where(eq(propFirms.id, firmId));
      await db
        .update(propFirms)
        .set({
          draftPayload: { ...firm!.draftPayload!, baseVersion: 0 } as never,
        })
        .where(eq(propFirms.id, firmId));

      await expect(publish()).rejects.toThrow(StaleDraftError);
    });

    it("clears the draft and bumps the version on success", async () => {
      await stage(newChallengeOp());
      const { version } = await publish();

      expect(version).toBe(1);
      const [firm] = await db
        .select()
        .from(propFirms)
        .where(eq(propFirms.id, firmId));
      expect(firm!.draftPayload).toBeNull();
    });
  });

  /* ------------------------------------------------------------ preview */

  describe("preview", () => {
    it("(19) reflects the staged draft while the public page does not", async () => {
      await stage(newChallengeOp());
      await stage({ _op: "create", platformId, isPrimary: true }, "platforms");
      await stage(
        { _op: "create", ruleId, scope: "firm", valueBoolean: true },
        "ruleValues",
      );

      const preview = await materializeDraft(db, firmId);
      expect(preview.challenges).toHaveLength(1);
      expect(preview.challenges[0]?.name).toBe("Example Challenge");
      expect(preview.platforms[0]?.name).toBe("Example Platform");
      expect(preview.rules[0]?.state).toBe("allowed");

      const live = await publicView();
      expect(live!.challenges).toHaveLength(0);
      expect(live!.platforms).toHaveLength(0);
      expect(live!.rules).toHaveLength(0);
    });

    it("(21) never exposes an affiliate destination, staged or published", async () => {
      await stage(
        {
          _op: "create",
          label: "Default",
          destinationUrl: "https://partner.example.test/secret-id",
          isDefault: true,
        },
        "affiliateLinks",
      );

      const preview = await materializeDraft(db, firmId);
      // The CTA turns on, but the destination is not in the view model at all.
      expect(preview.hasAffiliateLink).toBe(true);
      expect(JSON.stringify(preview)).not.toContain("partner.example.test");
      expect(preview).not.toHaveProperty("destinationUrl");
    });

    it("turns the CTA off when the draft pauses the only link", async () => {
      const [link] = await db
        .insert(affiliateLinks)
        .values({
          propFirmId: firmId,
          label: "Default",
          destinationUrl: "https://partner.example.test/offer",
          isDefault: true,
          status: "active",
        })
        .returning({ id: affiliateLinks.id });

      expect((await materializeDraft(db, firmId)).hasAffiliateLink).toBe(true);

      await stage(
        { _op: "update", id: link!.id, status: "paused" },
        "affiliateLinks",
      );
      expect((await materializeDraft(db, firmId)).hasAffiliateLink).toBe(false);
    });

    it("performs no writes", async () => {
      await stage(newChallengeOp());
      const before = await client.query(`select * from prop_firms`);
      await materializeDraft(db, firmId);
      const after = await client.query(`select * from prop_firms`);
      expect(after.rows).toEqual(before.rows);
    });
  });

  /* ----------------------------------------------------------- security */

  describe("security", () => {
    it("(24) a staged draft never reaches the public view", async () => {
      await stage(newChallengeOp({ name: "Secret Draft Challenge" }));
      const view = await publicView();
      expect(JSON.stringify(view)).not.toContain("Secret Draft Challenge");
    });

    it("(25) a soft-deleted firm disappears publicly, draft or not", async () => {
      await stage(newChallengeOp());
      await db
        .update(propFirms)
        .set({ deletedAt: new Date() })
        .where(eq(propFirms.id, firmId));
      expect(await publicView()).toBeNull();
    });

    it("(26) admin-only fields never appear in the public view", async () => {
      await stage(newChallengeOp());
      await publish();
      const view = await publicView();

      for (const forbidden of [
        "draftPayload",
        "status",
        "dataCompletenessScore",
        "createdByAdminId",
        "updatedByAdminId",
        "commissionNotes",
      ]) {
        expect(view).not.toHaveProperty(forbidden);
      }
    });

    it("scopes every child write to the firm that owns it", async () => {
      const [other] = await db
        .insert(propFirms)
        .values({ slug: "example-firm-b", name: "Example Firm B" })
        .returning({ id: propFirms.id });
      const [foreign] = await db
        .insert(challenges)
        .values({
          propFirmId: other!.id,
          name: "Other Firm Challenge",
          slug: "other-firm-challenge",
          challengeType: "two_step",
          accountSize: "10000.00",
          accountCurrency: "USD",
          status: "published",
        })
        .returning({ id: challenges.id });

      // Staging a delete of ANOTHER firm's challenge under this firm must not
      // touch it: every child write is scoped by prop_firm_id.
      await stage({ _op: "delete", id: foreign!.id });
      await publish();

      const row = await db
        .select()
        .from(challenges)
        .where(eq(challenges.id, foreign!.id));
      expect(row[0]?.deletedAt).toBeNull();
    });
  });

  /* ---------------------------------------------------------- unstaging */

  describe("unstaging", () => {
    it("drops a pending op without touching published data", async () => {
      const [row] = await db
        .insert(challenges)
        .values({
          propFirmId: firmId,
          name: "Published Challenge",
          slug: "published-challenge",
          challengeType: "two_step",
          accountSize: "50000.00",
          accountCurrency: "USD",
          status: "published",
        })
        .returning({ id: challenges.id });

      await stage({ _op: "delete", id: row!.id });
      const { pendingChanges } = await unstageChildOp(db, {
        adminUserId: editorId,
        firmId,
        collection: "challenges",
        key: row!.id,
      });

      expect(pendingChanges).toBe(0);
      await publish();
      const live = await db
        .select()
        .from(challenges)
        .where(isNull(challenges.deletedAt));
      expect(live).toHaveLength(1);
    });

    it("replaces rather than queues repeated edits to one child", async () => {
      await stage(newChallengeOp({ name: "First" }));
      await stage(newChallengeOp({ name: "Second" }));

      const [firm] = await db
        .select()
        .from(propFirms)
        .where(eq(propFirms.id, firmId));
      // Same slug, so the same pending challenge — one op, not two.
      expect(firm!.draftPayload?.challenges).toHaveLength(1);
      expect(firm!.draftPayload?.challenges?.[0]?.name).toBe("Second");
    });
  });

  /* --------------------------------------------------------------- audit */

  describe("audit", () => {
    it("(38) records a meaningful entry for a staged edit", async () => {
      await stage(newChallengeOp());
      const entries = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, firmId));

      const staged = entries.find((e) => e.action === "firm.challenges.staged");
      expect(staged).toBeDefined();
      expect(staged?.actorAdminId).toBe(editorId);
      // No secrets ride along in the audit payload.
      expect(JSON.stringify(staged?.after)).not.toContain("passwordHash");
    });

    it("(39) writes no success entry when the mutation was refused", async () => {
      await expect(
        stage(newChallengeOp(), "challenges", analystId),
      ).rejects.toThrow(AuthorizationError);

      const entries = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.entityId, firmId),
            eq(auditLogs.action, "firm.challenges.staged"),
          ),
        );
      expect(entries).toHaveLength(0);
    });
  });

  /* ------------------------------------------------- editor read model */

  describe("admin read model", () => {
    it("returns published children plus the affiliate destination", async () => {
      await stage(newChallengeOp());
      await stage(
        {
          _op: "create",
          label: "Default",
          destinationUrl: "https://partner.example.test/offer",
          isDefault: true,
        },
        "affiliateLinks",
      );
      await publish();

      const children = await getAdminFirmChildren(db, firmId);
      expect(children.challenges).toHaveLength(1);
      // The admin editor MAY see the destination; the public view may not.
      expect(children.affiliateLinks[0]?.destinationUrl).toBe(
        "https://partner.example.test/offer",
      );
      // Commercial terms are never surfaced by the editor at all.
      expect(children.affiliateLinks[0]).not.toHaveProperty("commissionNotes");
    });
  });
});
