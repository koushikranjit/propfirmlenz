import { eq } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createTestDb, resetTestDb, type TestDb } from "@/lib/db/testing";
import { affiliateClicks, affiliateLinks, propFirms } from "@/lib/db/schema";
import { getPublishedFirmView } from "@/lib/repositories/public-firm-view";

/**
 * `/go/{slug}` end to end, against a REAL PostgreSQL (PGlite) —
 * docs/ARCHITECTURE.md §11 `[LOCKED]`.
 *
 * The route reads its database through `getDb()`, so that single module is
 * redirected at the test database. Nothing else is mocked: the service, the
 * SQL, the constraints and the click row are all real.
 *
 * Every record is OBVIOUSLY FAKE ("Example Firm A", `partner.example.test`).
 * No real prop firm, affiliate network, or destination URL appears anywhere in
 * this repository (CLAUDE.md §3 `[LOCKED]`).
 */

let db: TestDb;
let client: PGlite;
let close: () => Promise<void>;

vi.mock("@/lib/db/client", () => ({
  getDb: () => db,
}));

const { GET } = await import("./route");

const DESTINATION = "https://partner.example.test/offer?ref=example";

/**
 * Builds a request with the headers a real browser would send.
 *
 * The headers are attached AFTER construction on purpose: undici enforces the
 * fetch spec's forbidden-header list, so `Referer` and any `Sec-*` header
 * passed to `new Request()` are silently dropped. A real HTTP request carries
 * them fine — the restriction applies to client-side construction, not to what
 * a server receives — so dropping them here would test the harness, not the
 * route.
 */
function go(
  path: string,
  headerInit: Record<string, string> = {},
): NextRequest {
  const request = new NextRequest(`https://propfirmlenz.com${path}`);
  const headers = new Headers();
  for (const [name, value] of Object.entries(headerInit)) {
    headers.set(name, value);
  }
  Object.defineProperty(request, "headers", {
    value: headers,
    configurable: true,
  });
  return request;
}

/** The route's own params contract. */
function params(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

describe("/go/{slug}", () => {
  let firmId: string;

  beforeAll(async () => {
    ({ db, client, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
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
  });

  const addDefaultLink = () =>
    db.insert(affiliateLinks).values({
      propFirmId: firmId,
      label: "Default",
      destinationUrl: DESTINATION,
      isDefault: true,
      status: "active",
    });

  const clicks = () => db.select().from(affiliateClicks);

  describe("(1) a published firm with an active link", () => {
    it("records the click and redirects 302 to the stored destination", async () => {
      await addDefaultLink();

      const response = await GET(
        go("/go/example-firm-a?p=firm_header", {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          referer: "https://propfirmlenz.com/prop-firms/example-firm-a",
          "x-forwarded-for": "203.0.113.9",
          "x-vercel-ip-country": "gb",
        }),
        params("example-firm-a"),
      );

      // 302, never 301: destinations change and a cached permanent redirect is
      // unrecoverable (§11.3 `[LOCKED]`).
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(DESTINATION);
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(response.headers.get("cache-control")).toContain("no-store");

      const [click] = await clicks();
      expect(click).toBeDefined();
      expect(click!.propFirmId).toBe(firmId);
      expect(click!.placement).toBe("firm_header");
      expect(click!.countryCode).toBe("GB");
      expect(click!.deviceType).toBe("desktop");
      expect(click!.referrerHost).toBe("propfirmlenz.com");
      expect(click!.landingPath).toBe("/prop-firms/example-firm-a");
      expect(click!.isBot).toBe(false);
      expect(click!.isInternal).toBe(false);
    });

    it("records the click BEFORE responding, so none is lost", async () => {
      await addDefaultLink();
      const response = await GET(
        go("/go/example-firm-a"),
        params("example-firm-a"),
      );

      // The row is already durable by the time the caller sees the redirect.
      expect(response.status).toBe(302);
      expect(await clicks()).toHaveLength(1);
    });

    it("stores no raw IP or user agent — only salted hashes", async () => {
      await addDefaultLink();
      await GET(
        go("/go/example-firm-a", {
          "x-forwarded-for": "203.0.113.9",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        }),
        params("example-firm-a"),
      );

      const [click] = await clicks();
      const serialised = JSON.stringify(click);
      expect(serialised).not.toContain("203.0.113.9");
      expect(serialised).not.toContain("Windows NT");
      expect(click!.ipHash).toBeTruthy();
      expect(click!.userAgentHash).toBeTruthy();
    });

    it("never writes a session identifier", async () => {
      await addDefaultLink();
      await GET(go("/go/example-firm-a"), params("example-firm-a"));
      const [click] = await clicks();
      expect(click!.sessionId).toBeNull();
      expect(click!.userId).toBeNull();
    });

    it("flags bot and prefetch traffic rather than dropping it", async () => {
      await addDefaultLink();

      await GET(
        go("/go/example-firm-a", { "user-agent": "curl/8.4.0" }),
        params("example-firm-a"),
      );
      await GET(
        go("/go/example-firm-a", {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "Sec-Purpose": "prefetch",
        }),
        params("example-firm-a"),
      );

      const rows = await clicks();
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.isBot)).toBe(true);
    });

    it("drops an out-of-shape placement without losing the click", async () => {
      await addDefaultLink();
      const response = await GET(
        go("/go/example-firm-a?p=%3Cscript%3E"),
        params("example-firm-a"),
      );

      expect(response.status).toBe(302);
      const [click] = await clicks();
      expect(click!.placement).toBeNull();
    });
  });

  describe("(2) a published firm with no applicable link", () => {
    it("404s rather than guessing a destination", async () => {
      const response = await GET(
        go("/go/example-firm-a"),
        params("example-firm-a"),
      );

      expect(response.status).toBe(404);
      expect(response.headers.get("location")).toBeNull();
      expect(await clicks()).toHaveLength(0);
    });

    it("404s when the only link is paused", async () => {
      await db.insert(affiliateLinks).values({
        propFirmId: firmId,
        label: "Paused",
        destinationUrl: DESTINATION,
        isDefault: true,
        status: "paused",
      });

      const response = await GET(
        go("/go/example-firm-a"),
        params("example-firm-a"),
      );
      expect(response.status).toBe(404);
      expect(await clicks()).toHaveLength(0);
    });

    it("404s when the link's window has closed", async () => {
      await db.insert(affiliateLinks).values({
        propFirmId: firmId,
        label: "Expired",
        destinationUrl: DESTINATION,
        isDefault: true,
        status: "active",
        endsAt: new Date(Date.now() - 3_600_000),
      });

      expect(
        (await GET(go("/go/example-firm-a"), params("example-firm-a"))).status,
      ).toBe(404);
      expect(await clicks()).toHaveLength(0);
    });
  });

  describe("(3) a draft firm", () => {
    it("404s even though an active link exists", async () => {
      await addDefaultLink();
      await db
        .update(propFirms)
        .set({ status: "draft" })
        .where(eq(propFirms.id, firmId));

      const response = await GET(
        go("/go/example-firm-a"),
        params("example-firm-a"),
      );
      expect(response.status).toBe(404);
      expect(response.headers.get("location")).toBeNull();
      expect(await clicks()).toHaveLength(0);
    });
  });

  describe("(4) an archived or soft-deleted firm", () => {
    it("404s for an archived firm", async () => {
      await addDefaultLink();
      await db
        .update(propFirms)
        .set({ status: "archived" })
        .where(eq(propFirms.id, firmId));

      expect(
        (await GET(go("/go/example-firm-a"), params("example-firm-a"))).status,
      ).toBe(404);
      expect(await clicks()).toHaveLength(0);
    });

    it("404s for a soft-deleted firm", async () => {
      await addDefaultLink();
      await db
        .update(propFirms)
        .set({ deletedAt: new Date() })
        .where(eq(propFirms.id, firmId));

      expect(
        (await GET(go("/go/example-firm-a"), params("example-firm-a"))).status,
      ).toBe(404);
      expect(await clicks()).toHaveLength(0);
    });
  });

  describe("(5) an unknown or malformed slug", () => {
    it("404s for a slug that does not exist", async () => {
      const response = await GET(
        go("/go/no-such-firm"),
        params("no-such-firm"),
      );
      expect(response.status).toBe(404);
      expect(await clicks()).toHaveLength(0);
    });

    it("404s for a malformed slug without touching the database", async () => {
      for (const bad of ["../admin", "Example-Firm-A", "with space", ""]) {
        const response = await GET(go("/go/x"), params(bad));
        expect(response.status).toBe(404);
      }
      expect(await clicks()).toHaveLength(0);
    });

    it("gives an identical response for every failure cause", async () => {
      const draft = await GET(go("/go/no-such-firm"), params("no-such-firm"));
      const noLink = await GET(
        go("/go/example-firm-a"),
        params("example-firm-a"),
      );

      // "Does not exist" and "is not monetised" must be indistinguishable, so
      // the route cannot be used to enumerate unpublished firms.
      expect(draft.status).toBe(noLink.status);
      expect(await draft.text()).toBe(await noLink.text());
    });
  });

  describe("(6) the destination never reaches the public view", () => {
    it("is absent from FirmView, which exposes only a boolean", async () => {
      await addDefaultLink();

      const view = await getPublishedFirmView(db, "example-firm-a");
      expect(view!.hasAffiliateLink).toBe(true);
      expect(JSON.stringify(view)).not.toContain("partner.example.test");
      expect(JSON.stringify(view)).not.toContain("ref=example");
      expect(view).not.toHaveProperty("destinationUrl");
    });
  });

  describe("(7) campaign and default resolution", () => {
    beforeEach(async () => {
      await addDefaultLink();
      await db.insert(affiliateLinks).values({
        propFirmId: firmId,
        label: "Spring",
        destinationUrl: "https://partner.example.test/spring",
        campaign: "spring-2026",
        isDefault: false,
        status: "active",
      });
    });

    it("prefers the campaign-scoped link when ?c= matches", async () => {
      const response = await GET(
        go("/go/example-firm-a?c=spring-2026"),
        params("example-firm-a"),
      );
      expect(response.headers.get("location")).toBe(
        "https://partner.example.test/spring",
      );
    });

    it("falls back to the default when the campaign is unknown", async () => {
      const response = await GET(
        go("/go/example-firm-a?c=no-such-campaign"),
        params("example-firm-a"),
      );
      expect(response.headers.get("location")).toBe(DESTINATION);
    });

    it("falls back to the default when ?c= is out of shape", async () => {
      const response = await GET(
        go("/go/example-firm-a?c=%27%20or%201%3D1%20--"),
        params("example-firm-a"),
      );
      expect(response.headers.get("location")).toBe(DESTINATION);
    });

    it("records the click against the link actually used", async () => {
      await GET(
        go("/go/example-firm-a?c=spring-2026"),
        params("example-firm-a"),
      );

      const [click] = await clicks();
      const [spring] = await db
        .select()
        .from(affiliateLinks)
        .where(eq(affiliateLinks.campaign, "spring-2026"));
      expect(click!.affiliateLinkId).toBe(spring!.id);
    });
  });

  describe("(8) no request input can steer the redirect", () => {
    // Two tests below drop the database's `^https://` CHECK to prove the
    // APPLICATION layer refuses too. Restore it afterwards so no later test
    // silently runs against a weakened schema.
    afterEach(async () => {
      // Clear the deliberately-invalid rows first; the constraint is validated
      // against existing data when it is added back.
      await client.exec(`truncate table affiliate_links cascade`);
      await client.exec(
        `alter table affiliate_links drop constraint if exists affiliate_links_https_ck`,
      );
      await client.exec(
        `alter table affiliate_links add constraint affiliate_links_https_ck check ("destination_url" ~ '^https://')`,
      );
    });

    it("ignores every parameter that looks like a destination", async () => {
      await addDefaultLink();

      for (const query of [
        "?url=https://evil.example",
        "?to=https://evil.example",
        "?next=//evil.example",
        "?redirect=https://evil.example&p=firm_header",
        "?destination=javascript:alert(1)",
      ]) {
        const response = await GET(
          go(`/go/example-firm-a${query}`),
          params("example-firm-a"),
        );
        // The destination is read from the row, never from the request.
        expect(response.headers.get("location")).toBe(DESTINATION);
      }
    });

    it("404s rather than emitting an unsafe stored destination", async () => {
      // The `^https://` CHECK is bypassed here to prove the APPLICATION layer
      // also refuses. Both layers exist deliberately: a dropped constraint or a
      // row predating it must not become an open redirect.
      await addDefaultLink();
      await client.exec(
        `alter table affiliate_links drop constraint if exists affiliate_links_https_ck`,
      );
      await db
        .update(affiliateLinks)
        .set({ destinationUrl: "javascript:alert(1)" })
        .where(eq(affiliateLinks.propFirmId, firmId));

      const response = await GET(
        go("/go/example-firm-a"),
        params("example-firm-a"),
      );
      expect(response.status).toBe(404);
      expect(response.headers.get("location")).toBeNull();
      expect(await clicks()).toHaveLength(0);
    });

    it("404s for a protocol-relative stored destination", async () => {
      await addDefaultLink();
      await client.exec(
        `alter table affiliate_links drop constraint if exists affiliate_links_https_ck`,
      );
      await db
        .update(affiliateLinks)
        .set({ destinationUrl: "//evil.example/path" })
        .where(eq(affiliateLinks.propFirmId, firmId));

      expect(
        (await GET(go("/go/example-firm-a"), params("example-firm-a"))).status,
      ).toBe(404);
      expect(await clicks()).toHaveLength(0);
    });
  });
});
