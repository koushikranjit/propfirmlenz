import { and, eq, isNull, sql } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetTestDb, type TestDb } from "@/lib/db/testing";
import {
  adminUserRoles,
  adminUsers,
  challenges,
  firmPlatforms,
  offers,
  payoutCandidates,
  propFirms,
  roles,
  trackedWallets,
  verifiedPayouts,
} from "@/lib/db/schema";
import { ROLES, seedRolesAndPermissions } from "@/lib/auth/permissions";
import { getPublishedFirmView } from "@/lib/repositories/public-firm-view";
import { listPublishedFirmSummaries } from "@/lib/repositories/public-firms";
import { createFirm } from "@/lib/services/firm-admin";
import { LENZ_OFFER, SEED_FIRMS } from "./firm-catalog";
import { seedFirmCatalog } from "./seed-firms";

/**
 * THE INITIAL CATALOG SEED — docs/SESSION.md.
 *
 * Against a REAL PostgreSQL, because the property that matters is one only a
 * database can demonstrate: running the seed twice leaves exactly the same
 * rows as running it once, and running it after a human edit does not undo
 * that edit.
 */

describe("initial firm catalog seed", () => {
  let db: TestDb;
  let client: PGlite;
  let close: () => Promise<void>;
  let adminId: string;

  beforeAll(async () => {
    ({ db, client, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await resetTestDb(client);
    await seedRolesAndPermissions(db);

    const [user] = await db
      .insert(adminUsers)
      .values({
        email: "seed-admin@example.test",
        passwordHash: "x",
        fullName: "Example Seed Admin",
        status: "active",
      })
      .returning({ id: adminUsers.id });
    adminId = user!.id;

    const all = await db.select().from(roles);
    await db.insert(adminUserRoles).values({
      adminUserId: adminId,
      roleId: all.find((r) => r.key === ROLES.MASTER_ADMIN)!.id,
    });
  });

  const seed = () => seedFirmCatalog(db, { adminUserId: adminId });

  const liveFirms = () =>
    db.select().from(propFirms).where(isNull(propFirms.deletedAt));

  /* ------------------------------------------------------------- the run */

  it("creates all eleven firms with the expected slugs", async () => {
    const report = await seed();

    expect(report.firmsCreated).toBe(11);
    const rows = await liveFirms();
    expect(rows).toHaveLength(11);
    expect(rows.map((f) => f.slug).sort()).toEqual(
      SEED_FIRMS.map((f) => f.slug).sort(),
    );
  });

  it("publishes the firms that have enough data, and leaves the rest as drafts", async () => {
    const report = await seed();

    // A record with no description cannot pass the pre-publish checks. That is
    // the correct outcome, not a failure to paper over.
    expect(report.published + report.skipped.length).toBe(11);
    expect(report.published).toBeGreaterThan(0);

    const published = await listPublishedFirmSummaries(db, {});
    expect(published.length).toBe(report.published);
  });

  /* --------------------------------------------------------- idempotency */

  it("produces the same dataset when run twice", async () => {
    await seed();

    const snapshot = async () => ({
      firms: (await liveFirms()).map((f) => ({
        slug: f.slug,
        name: f.name,
        tagline: f.tagline,
        description: f.description,
        status: f.status,
      })),
      offers: (
        await db.select().from(offers).where(isNull(offers.deletedAt))
      ).map((o) => ({ code: o.code, title: o.title, value: o.discountValue })),
      platformLinks: (await db.select().from(firmPlatforms)).length,
    });

    const first = await snapshot();
    const second = await seed();
    const after = await snapshot();

    expect(after).toEqual(first);
    // Nothing was created the second time round.
    expect(second.firmsCreated).toBe(0);
    expect(second.firmsReconciled).toBe(11);
    expect(second.offersCreated).toBe(0);
    expect(second.platformsLinked).toBe(0);
  });

  it("never creates a duplicate firm, offer or platform link", async () => {
    await seed();
    await seed();
    await seed();

    expect(await liveFirms()).toHaveLength(11);

    // One LENZ offer per PUBLISHED firm — and the partial unique index on
    // (firm, lower(code)) would refuse a second anyway. A firm that cannot
    // publish holds its offer in the draft until it can.
    const published = (await liveFirms()).filter(
      (f) => f.status === "published",
    );
    const lenz = await db
      .select({ firmId: offers.propFirmId })
      .from(offers)
      .where(
        and(
          sql`lower(${offers.code}) = ${LENZ_OFFER.code.toLowerCase()}`,
          isNull(offers.deletedAt),
        ),
      );
    expect(lenz).toHaveLength(published.length);
    expect(new Set(lenz.map((o) => o.firmId)).size).toBe(published.length);

    const links = await db.select().from(firmPlatforms);
    const keys = links.map((l) => `${l.propFirmId}:${l.platformId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("reconciles onto a firm that already exists under a different slug", async () => {
    // Exactly what a real database looks like: someone added The5ers by hand
    // at "the5ers", while this seed's catalog says "the-5-ers".
    await createFirm(db, {
      adminUserId: adminId,
      input: {
        name: "The5ers",
        slug: "the5ers",
        description: "Entered by an admin before the seed ever ran.",
      },
    });

    await seed();

    const matches = await db
      .select({ slug: propFirms.slug, description: propFirms.description })
      .from(propFirms)
      .where(
        and(
          sql`lower(${propFirms.name}) = 'the5ers'`,
          isNull(propFirms.deletedAt),
        ),
      );

    // ONE record, not two — and it kept the live slug rather than moving the
    // URL and leaving a redirect behind.
    expect(matches).toHaveLength(1);
    expect(matches[0]?.slug).toBe("the5ers");
    expect(matches[0]?.description).toBe(
      "Entered by an admin before the seed ever ran.",
    );

    // And the catalog is still eleven firms, not twelve.
    expect(await liveFirms()).toHaveLength(11);
  });

  it("does not overwrite an edit made between runs", async () => {
    await seed();

    const [firm] = await db
      .select({ id: propFirms.id })
      .from(propFirms)
      .where(eq(propFirms.slug, "brightfunded"))
      .limit(1);

    // An admin corrects the tagline by hand.
    await db
      .update(propFirms)
      .set({ tagline: "A correction entered by a person" })
      .where(eq(propFirms.id, firm!.id));

    await seed();

    const [after] = await db
      .select({ tagline: propFirms.tagline })
      .from(propFirms)
      .where(eq(propFirms.id, firm!.id));
    expect(after?.tagline).toBe("A correction entered by a person");
  });

  /* ------------------------------------------------------- the LENZ offer */

  it("gives every firm exactly one LENZ offer at the same percentage", async () => {
    await seed();

    const rows = await db.select().from(offers).where(isNull(offers.deletedAt));

    const published = (await liveFirms()).filter(
      (f) => f.status === "published",
    );
    expect(rows).toHaveLength(published.length);

    // The rest are staged, waiting on their firm having enough data to publish.
    for (const firm of (await liveFirms()).filter(
      (f) => f.status !== "published",
    )) {
      const staged = firm.draftPayload?.offers ?? [];
      expect(staged.some((op) => op.code === LENZ_OFFER.code)).toBe(true);
    }

    for (const offer of rows) {
      expect(offer.code).toBe("LENZ");
      expect(offer.discountType).toBe("percent");
      expect(Number(offer.discountValue)).toBe(LENZ_OFFER.discountPercent);
      // Nothing claims terms nobody agreed to.
      expect(offer.description).toBeNull();
      expect(offer.terms).toBeNull();
    }
  });

  it("serves the LENZ offer from the database, not from the frontend", async () => {
    await seed();
    const view = await getPublishedFirmView(db, "brightfunded");
    const offer = view?.offers.find((o) => o.code === "LENZ");

    expect(offer).toBeDefined();
    expect(offer?.discountValue).toBe("10.00");

    // Editing the row changes the page; no code change is involved.
    await db
      .update(offers)
      .set({ discountValue: "25.00", title: "25% off with code LENZ" })
      .where(eq(offers.code, "LENZ"));

    const edited = await getPublishedFirmView(db, "brightfunded");
    const updated = edited?.offers.find((o) => o.code === "LENZ");
    expect(updated?.discountValue).toBe("25.00");
    expect(updated?.title).toBe("25% off with code LENZ");
  });

  /* ------------------------------------------------ what must NOT be there */

  it("imports no reviews or third-party ratings", async () => {
    await seed();

    const rows = await liveFirms();
    for (const firm of rows) {
      // Trustpilot's rating was not read from Trustpilot, so it is not stored.
      expect(firm.trustpilotRating).toBeNull();
      expect(firm.trustpilotUrl).toBeNull();
    }
    // Prop Firm Lenz reviews are a separate Phase 3 system with no table yet;
    // nothing here fabricates a rating or a count for either.
  });

  it("creates no payout, wallet or blockchain data", async () => {
    await seed();

    expect(await db.select().from(trackedWallets)).toHaveLength(0);
    expect(await db.select().from(payoutCandidates)).toHaveLength(0);
    expect(await db.select().from(verifiedPayouts)).toHaveLength(0);
  });

  it("marks nothing as verified", async () => {
    await seed();

    for (const firm of await liveFirms()) {
      expect(firm.verificationStatus).toBe("unverified");
      expect(firm.verifiedAt).toBeNull();
    }
  });

  it("invents no challenges", async () => {
    await seed();
    // The sources publish programme NAMES and headline ranges, not the
    // per-challenge figures the schema needs. None were written.
    expect(await db.select().from(challenges)).toHaveLength(0);
  });

  it("leaves unverifiable fields empty rather than filling them", async () => {
    await seed();

    // The two firms whose sites refused automated access carry a name and
    // nothing else.
    for (const slug of ["funding-pips", "e8-markets"]) {
      const [firm] = await db
        .select()
        .from(propFirms)
        .where(eq(propFirms.slug, slug))
        .limit(1);

      expect(firm?.tagline).toBeNull();
      expect(firm?.description).toBeNull();
      expect(firm?.websiteUrl).toBeNull();
      expect(firm?.headquartersCountry).toBeNull();
      expect(firm?.founderName).toBeNull();
      expect(firm?.foundedYear).toBeNull();
      // And it stays a draft, because there is nothing to publish.
      expect(firm?.status).toBe("draft");
    }
  });

  /* ----------------------------------------------------- public/draft wall */

  it("exposes no draft data and no buy link through the public view", async () => {
    await seed();
    const view = await getPublishedFirmView(db, "brightfunded");

    expect(view).not.toBeNull();
    const serialised = JSON.stringify(view);
    expect(serialised).not.toContain("draftPayload");
    expect(serialised).not.toContain("draft_payload");

    // The affiliate destination is reduced to a BOOLEAN. The view has no field
    // that could carry a destination, which is the guarantee that matters —
    // the URL itself is resolved inside /go/{slug}.
    expect(view?.hasAffiliateLink).toBe(true);
    expect(serialised).not.toContain("destinationUrl");
    expect(serialised).not.toContain("destination_url");

    // The public WEBSITE is a different, deliberately public field.
    expect(view?.websiteUrl).toBe("https://brightfunded.com");
  });

  it("carries no Prop Firm Match link anywhere in the seeded data", async () => {
    await seed();

    const rows = await liveFirms();
    const links = await db.select().from(offers);
    const all = JSON.stringify([rows, links]).toLowerCase();

    expect(all).not.toContain("propfirmmatch");
    expect(all).not.toContain("prop firm match");
  });
});
