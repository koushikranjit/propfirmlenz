import { eq } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetTestDb, type TestDb } from "@/lib/db/testing";
import { affiliateClicks, affiliateLinks, propFirms } from "@/lib/db/schema";
import {
  AFFILIATE_REL,
  affiliateHref,
  countReportableClicks,
  recordAffiliateClick,
  resolveAffiliateLink,
} from "./affiliate";

/** (5) affiliate internal-link protection. */
describe("affiliate", () => {
  let db: TestDb;
  let client: PGlite;
  let close: () => Promise<void>;
  let firmId: string;

  beforeAll(async () => {
    ({ db, client, close } = await createTestDb());
  });

  beforeEach(async () => {
    await resetTestDb(client);
    const [firm] = await db
      .insert(propFirms)
      .values({
        slug: "example-firm-a",
        name: "Example Firm A",
        status: "published",
        publishedAt: new Date(),
      })
      .returning({ id: propFirms.id });
    firmId = firm!.id;

    await db.insert(affiliateLinks).values({
      propFirmId: firmId,
      label: "Default",
      destinationUrl: "https://example.test/partner",
      isDefault: true,
      status: "active",
    });
  });
  afterAll(async () => {
    await close();
  });

  describe("link resolution", () => {
    it("resolves the default link for a published firm", async () => {
      const link = await resolveAffiliateLink(db, {
        firmSlug: "example-firm-a",
      });
      expect(link?.destinationUrl).toBe("https://example.test/partner");
    });

    it("returns null for an unknown firm — never a guessed destination", async () => {
      expect(
        await resolveAffiliateLink(db, { firmSlug: "does-not-exist" }),
      ).toBeNull();
    });

    it("returns null for an unpublished firm", async () => {
      await db.insert(propFirms).values({
        slug: "example-firm-b",
        name: "Example Firm B",
      });
      expect(
        await resolveAffiliateLink(db, { firmSlug: "example-firm-b" }),
      ).toBeNull();
    });

    it("ignores paused links", async () => {
      await db
        .update(affiliateLinks)
        .set({ status: "paused" })
        .where(eq(affiliateLinks.propFirmId, firmId));
      expect(
        await resolveAffiliateLink(db, { firmSlug: "example-firm-a" }),
      ).toBeNull();
    });

    it("prefers a campaign-scoped link over the default", async () => {
      await db.insert(affiliateLinks).values({
        propFirmId: firmId,
        label: "Summer",
        destinationUrl: "https://example.test/summer",
        campaign: "summer",
        status: "active",
      });
      const link = await resolveAffiliateLink(db, {
        firmSlug: "example-firm-a",
        campaign: "summer",
      });
      expect(link?.destinationUrl).toBe("https://example.test/summer");
    });

    it("enforces at most one active default link per firm in the DATABASE", async () => {
      await expect(
        db.insert(affiliateLinks).values({
          propFirmId: firmId,
          label: "Second default",
          destinationUrl: "https://example.test/other",
          isDefault: true,
          status: "active",
        }),
      ).rejects.toThrow();
    });

    it("requires an HTTPS destination", async () => {
      await expect(
        db.insert(affiliateLinks).values({
          propFirmId: firmId,
          label: "Insecure",
          destinationUrl: "http://example.test/insecure",
          status: "active",
        }),
      ).rejects.toThrow();
    });
  });

  describe("preview protection — the PRIMARY guarantee is structural", () => {
    it("affiliateHref returns NULL under preview, so no request can be issued", () => {
      expect(affiliateHref("example-firm-a")).toBe("/go/example-firm-a");
      expect(affiliateHref("example-firm-a", { isPreview: true })).toBeNull();
    });

    it("outbound anchors carry rel=sponsored nofollow noopener", () => {
      expect(AFFILIATE_REL).toBe("sponsored nofollow noopener");
    });

    it("no click row exists when preview issues no request", async () => {
      // Preview renders an inert CTA: affiliateHref is null, so /go is never
      // called, so nothing is recorded. This is the primary protection.
      expect(affiliateHref("example-firm-a", { isPreview: true })).toBeNull();
      const clicks = await db.select().from(affiliateClicks);
      expect(clicks).toHaveLength(0);
    });
  });

  describe("is_internal — SECONDARY protection and classification only", () => {
    it("excludes internal and bot clicks from reportable counts", async () => {
      const link = (await resolveAffiliateLink(db, {
        firmSlug: "example-firm-a",
      }))!;

      await recordAffiliateClick(db, { link });
      await recordAffiliateClick(db, { link, isInternal: true });
      await recordAffiliateClick(db, { link, isBot: true });

      expect(await countReportableClicks(db, firmId)).toBe(1);

      // Flagged, never deleted — all three rows are retained.
      const all = await db.select().from(affiliateClicks);
      expect(all).toHaveLength(3);
    });

    it("defaults to not-internal and not-bot", async () => {
      const link = (await resolveAffiliateLink(db, {
        firmSlug: "example-firm-a",
      }))!;
      await recordAffiliateClick(db, { link });
      const [row] = await db.select().from(affiliateClicks);
      expect(row!.isInternal).toBe(false);
      expect(row!.isBot).toBe(false);
    });
  });

  describe("privacy", () => {
    it("hashes IP and user agent — raw values are never stored", async () => {
      const link = (await resolveAffiliateLink(db, {
        firmSlug: "example-firm-a",
      }))!;
      const ip = "203.0.113.9";
      const ua = "Mozilla/5.0 (probe)";
      await recordAffiliateClick(db, { link, ip, userAgent: ua });

      const [row] = await db.select().from(affiliateClicks);
      expect(row!.ipHash).not.toBe(ip);
      expect(row!.userAgentHash).not.toBe(ua);
      expect(JSON.stringify(row)).not.toContain(ip);
      expect(JSON.stringify(row)).not.toContain(ua);
    });

    it("stores no conversion data — conversions are never inferred", async () => {
      const cols = Object.keys(affiliateClicks);
      expect(cols.join(",")).not.toMatch(/conversion|revenue|commission|epc/i);
    });
  });
});
