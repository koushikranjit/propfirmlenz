import { readFileSync, readdirSync, statSync } from "node:fs";
import { eq } from "drizzle-orm";
import { join } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { PGlite } from "@electric-sql/pglite";
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
import {
  affiliateLinks,
  challenges,
  firmPlatforms,
  platforms,
  propFirms,
} from "@/lib/db/schema";
import { SiteFooter, SiteHeader } from "@/components/public/SiteChrome";

/**
 * The public homepage — docs/PROJECT.md §9, docs/SEO.md §5, §11.
 *
 * The page is an async Server Component that queries the database, so it is
 * exercised by awaiting it and rendering what it returns, against a REAL
 * PostgreSQL (PGlite). Only `getDb` is redirected; the repositories, the SQL
 * and the constraints are all real.
 *
 * Every record is OBVIOUSLY FAKE ("Example Firm A"). No real prop firm name,
 * price, rule or payout figure exists anywhere in this repository
 * (CLAUDE.md §3 `[LOCKED]`).
 */

let db: TestDb;
let client: PGlite;
let close: () => Promise<void>;

vi.mock("@/lib/db/client", () => ({
  getDb: () => db,
}));

const HomePage = (await import("./page")).default;
const { generateMetadata } = await import("./page");

/** Renders the async Server Component's output. */
async function renderHome() {
  return render(await HomePage());
}

afterEach(cleanup);

describe("homepage", () => {
  beforeAll(async () => {
    ({ db, client, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await resetTestDb(client);
  });

  const publishFirm = async (
    overrides: Partial<typeof propFirms.$inferInsert> = {},
  ) => {
    const [firm] = await db
      .insert(propFirms)
      .values({
        slug: "example-firm-a",
        name: "Example Firm A",
        tagline: "An example tagline",
        status: "published",
        publishedAt: new Date(),
        headquartersCountry: "GB",
        ...overrides,
      })
      .returning({ id: propFirms.id });
    return firm!.id;
  };

  describe("(1) renders", () => {
    it("renders with exactly one h1 and a logical heading order", async () => {
      await publishFirm();
      const { container } = await renderHome();

      const h1s = screen.getAllByRole("heading", { level: 1 });
      expect(h1s).toHaveLength(1);
      expect(h1s[0]?.textContent).toContain("Research prop firms");

      // No heading level is skipped: h1 -> h2 -> h3 only.
      const levels = [...container.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(
        (h) => Number(h.tagName[1]),
      );
      expect(Math.max(...levels)).toBeLessThanOrEqual(3);
      for (let i = 1; i < levels.length; i += 1) {
        expect(levels[i]! - levels[i - 1]!).toBeLessThanOrEqual(1);
      }
    });

    it("names every section landmark", async () => {
      await publishFirm();
      await renderHome();

      for (const name of [
        /explore prop firms/i,
        /how prop firm lenz records/i,
        /browse by platform/i,
        /what to compare/i,
        /start your research/i,
      ]) {
        expect(screen.getByRole("region", { name })).toBeTruthy();
      }
    });

    it("offers a search that submits to the real directory route", async () => {
      await publishFirm();
      const { container } = await renderHome();

      const form = container.querySelector('form[role="search"]');
      expect(form?.getAttribute("action")).toBe("/prop-firms");
      expect(form?.getAttribute("method")).toBe("get");
      // A GET form, so the flow is crawlable and needs no JavaScript.
      expect(form?.querySelector('input[name="q"]')).toBeTruthy();
      expect(screen.getByLabelText(/search prop firms by name/i)).toBeTruthy();
    });
  });

  describe("(2-4) published data only", () => {
    it("shows a published firm", async () => {
      await publishFirm();
      await renderHome();
      expect(screen.getAllByText("Example Firm A").length).toBeGreaterThan(0);
    });

    it("(3) never shows a draft firm", async () => {
      await publishFirm({
        slug: "draft-firm",
        name: "Draft Firm",
        status: "draft",
      });
      const { container } = await renderHome();
      expect(container.innerHTML).not.toContain("Draft Firm");
    });

    it("(4) never shows an archived or soft-deleted firm", async () => {
      await publishFirm({
        slug: "archived-firm",
        name: "Archived Firm",
        status: "archived",
      });
      await publishFirm({
        slug: "deleted-firm",
        name: "Deleted Firm",
        deletedAt: new Date(),
      });

      const { container } = await renderHome();
      expect(container.innerHTML).not.toContain("Archived Firm");
      expect(container.innerHTML).not.toContain("Deleted Firm");
    });

    it("never exposes draft_payload or admin-only data", async () => {
      const id = await publishFirm();
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
        .where(eq(propFirms.id, id));

      const { container } = await renderHome();
      expect(container.innerHTML).not.toContain("Secret Draft Name");
      expect(container.innerHTML).not.toContain("draftPayload");
    });
  });

  describe("(5) empty database", () => {
    it("states plainly that nothing is published, and invents nothing", async () => {
      const { container } = await renderHome();

      expect(
        screen.getByText(/no prop firms have been published yet/i),
      ).toBeTruthy();

      // No fabricated counts, ratings, testimonials or social proof.
      expect(container.innerHTML).not.toMatch(/\b\d+\s*\+?\s*traders?\b/i);
      expect(container.innerHTML).not.toMatch(/\b\d(\.\d)?\s*\/\s*5\b/);
      expect(container.innerHTML.toLowerCase()).not.toContain("testimonial");
      expect(container.innerHTML.toLowerCase()).not.toContain("rated");
    });

    it("still offers a route onward, so the page is not a dead end", async () => {
      const { container } = await renderHome();
      const hrefs = [...container.querySelectorAll("a")].map((a) =>
        a.getAttribute("href"),
      );
      expect(hrefs).toContain("/prop-firms");
    });

    it("omits the recently-checked section rather than showing it empty", async () => {
      await renderHome();
      expect(
        screen.queryByRole("region", { name: /recently checked/i }),
      ).toBeNull();
    });

    it("hides the counts strip when there is nothing to count", async () => {
      const { container } = await renderHome();
      expect(container.innerHTML).not.toContain("prop firms documented");
    });
  });

  describe("(6) internal links point only to implemented routes", () => {
    const IMPLEMENTED = [
      /^\/$/,
      /^\/prop-firms(\?.*)?$/,
      /^\/prop-firms\/[a-z0-9-]+$/,
    ];

    it("links only to routes that exist", async () => {
      await publishFirm();
      const { container } = await renderHome();

      const internal = [...container.querySelectorAll("a")]
        .map((a) => a.getAttribute("href") ?? "")
        .filter((href) => href.startsWith("/") && !href.startsWith("//"));

      expect(internal.length).toBeGreaterThan(0);
      for (const href of internal) {
        const path = href.split("#")[0] ?? "";
        if (path === "") continue; // pure in-page anchor
        expect(
          IMPLEMENTED.some((pattern) => pattern.test(path)),
          `unimplemented route linked: ${href}`,
        ).toBe(true);
      }
    });

    it("links to no unbuilt section, in the page or the footer", async () => {
      await publishFirm();
      const { container } = await renderHome();
      const footer = render(<SiteFooter />).container;

      for (const html of [container.innerHTML, footer.innerHTML]) {
        for (const unbuilt of [
          'href="/payouts',
          'href="/reviews',
          'href="/compare',
          'href="/leaderboard',
          'href="/offers',
          'href="/blog',
          'href="/about',
          'href="/best',
        ]) {
          expect(html).not.toContain(unbuilt);
        }
      }
    });

    it("uses descriptive anchor text, never 'click here'", async () => {
      await publishFirm();
      const { container } = await renderHome();

      for (const anchor of container.querySelectorAll("a")) {
        const text = (anchor.textContent ?? "").trim().toLowerCase();
        expect(text).not.toBe("click here");
        expect(text).not.toBe("here");
        expect(text).not.toBe("read more");
      }
    });
  });

  describe("browse-by facets", () => {
    it("lists a platform only when a published firm supports it", async () => {
      const id = await publishFirm();
      const [supported] = await db
        .insert(platforms)
        .values({
          key: "example-platform",
          name: "Example Platform",
          slug: "example-platform",
          status: "published",
        })
        .returning({ id: platforms.id });
      const [unsupported] = await db
        .insert(platforms)
        .values({
          key: "unused-platform",
          name: "Unused Platform",
          slug: "unused-platform",
          status: "published",
        })
        .returning({ id: platforms.id });
      await db
        .insert(firmPlatforms)
        .values({ propFirmId: id, platformId: supported!.id });

      const { container } = await renderHome();

      // The facet exists because a row does, and its count is counted.
      const link = [...container.querySelectorAll("a")].find(
        (a) =>
          a.getAttribute("href") === "/prop-firms?platform=example-platform",
      );
      expect(link?.textContent).toContain("Example Platform");
      expect(link?.textContent).toContain("1 firm");

      // A platform no published firm supports is never advertised.
      expect(container.innerHTML).not.toContain("Unused Platform");
      expect(unsupported).toBeDefined();
    });

    it("says so honestly when there are no facets yet", async () => {
      const { container } = await renderHome();
      expect(container.innerHTML).toContain(
        "Platform and headquarters shortcuts appear here",
      );
    });
  });

  describe("(7) affiliate safety", () => {
    it("routes the CTA through /go/{slug} and never exposes the destination", async () => {
      const id = await publishFirm();
      await db.insert(affiliateLinks).values({
        propFirmId: id,
        label: "Default",
        destinationUrl: "https://partner.example.test/secret-tracking-id",
        isDefault: true,
        status: "active",
        commissionNotes: "Confidential commercial terms.",
      });

      const { container } = await renderHome();

      expect(container.innerHTML).not.toContain("partner.example.test");
      expect(container.innerHTML).not.toContain("secret-tracking-id");
      expect(container.innerHTML).not.toContain("Confidential commercial");

      // The homepage card links to the profile; the tracked CTA lives there.
      // Whatever outbound links exist must be /go/ or nothing.
      const external = [...container.querySelectorAll("a")]
        .map((a) => a.getAttribute("href") ?? "")
        .filter((href) => href.startsWith("http"));
      expect(external).toEqual([]);
    });

    it("discloses the affiliate relationship in the footer", async () => {
      const { container } = render(<SiteFooter />);
      expect(container.innerHTML).toContain("Affiliate disclosure");
      expect(container.innerHTML).toContain("never change the data");
    });
  });

  describe("(8) currency display", () => {
    it("shows a from-price only when one currency is used", async () => {
      const id = await publishFirm();
      await db.insert(challenges).values({
        propFirmId: id,
        name: "Example Challenge",
        slug: "example-challenge",
        challengeType: "two_step",
        accountSize: "50000.00",
        accountCurrency: "EUR",
        price: "299.00",
        priceCurrency: "EUR",
        status: "published",
      });

      const { container } = await renderHome();
      expect(container.innerHTML).toContain("EUR");
      // The stored currency, never a conversion.
      expect(container.innerHTML).not.toContain("USD");
    });

    it("withholds a from-price across mixed currencies", async () => {
      const id = await publishFirm();
      await db.insert(challenges).values([
        {
          propFirmId: id,
          name: "Example Challenge",
          slug: "example-challenge",
          challengeType: "two_step",
          accountSize: "50000.00",
          accountCurrency: "USD",
          price: "299.00",
          priceCurrency: "USD",
          status: "published",
        },
        {
          propFirmId: id,
          name: "Euro Example Challenge",
          slug: "euro-example-challenge",
          challengeType: "two_step",
          accountSize: "50000.00",
          accountCurrency: "EUR",
          price: "179.00",
          priceCurrency: "EUR",
          status: "published",
        },
      ]);

      const { container } = await renderHome();
      // An unconverted minimum shown as a starting price would be a false
      // comparison (docs/ARCHITECTURE.md §18.3 `[LOCKED]`).
      expect(container.innerHTML).toContain("Priced in several currencies");
      expect(container.innerHTML).not.toContain("179");
    });
  });

  describe("(9) metadata", () => {
    it("is unique, self-canonical, and on the official origin", () => {
      const meta = generateMetadata();

      expect(meta.alternates?.canonical).toBe("https://propfirmlenz.com");
      expect(meta.robots).toEqual({ index: true, follow: true });
      expect(String(meta.title)).toContain("Prop Firm Lenz");
      expect(String(meta.description).length).toBeGreaterThan(50);
      expect(meta.openGraph?.url).toBe("https://propfirmlenz.com");
      expect(JSON.stringify(meta)).not.toContain("propfirmlens");
      // Never canonicalised to /home or any other path.
      expect(String(meta.alternates?.canonical)).not.toContain("/home");
    });
  });

  describe("(10) structured data", () => {
    it("emits only WebSite and WebPage, and no Organization duplicate", async () => {
      await publishFirm();
      const { container } = await renderHome();

      const blocks = [
        ...container.querySelectorAll('script[type="application/ld+json"]'),
      ].map((script) => JSON.parse(script.textContent ?? "[]"));
      expect(blocks).toHaveLength(1);

      const types = (blocks[0] as { "@type": string }[]).map((n) => n["@type"]);
      expect(types).toEqual(["WebSite", "WebPage"]);

      // Organization is emitted once, in the public layout. Two on one page
      // would compete for entity attribution.
      expect(types).not.toContain("Organization");
    });

    it("asserts no rating, review, FAQ or ranked list", async () => {
      await publishFirm();
      const { container } = await renderHome();
      const payload =
        container.querySelector('script[type="application/ld+json"]')
          ?.textContent ?? "";

      for (const forbidden of [
        "AggregateRating",
        "ratingValue",
        "reviewCount",
        '"Review"',
        "FAQPage",
        "ItemList",
      ]) {
        expect(payload).not.toContain(forbidden);
      }
    });

    it("declares a SearchAction that points at the real search endpoint", async () => {
      await publishFirm();
      const { container } = await renderHome();
      const payload = JSON.parse(
        container.querySelector('script[type="application/ld+json"]')
          ?.textContent ?? "[]",
      ) as {
        "@type": string;
        potentialAction?: { target?: { urlTemplate?: string } };
      }[];

      const website = payload.find((node) => node["@type"] === "WebSite");
      // The form on the page submits to exactly this endpoint.
      expect(website?.potentialAction?.target?.urlTemplate).toBe(
        "https://propfirmlenz.com/prop-firms?q={search_term_string}",
      );
    });
  });

  describe("(11) navigation accessibility", () => {
    it("gives the header a named nav and a keyboard-operable mobile menu", () => {
      const { container } = render(<SiteHeader />);

      expect(
        screen.getAllByRole("navigation", { name: /primary/i }).length,
      ).toBe(2);

      // <details>/<summary> is focusable and toggles on Enter/Space with no
      // JavaScript, and announces its expanded state.
      const disclosure = container.querySelector("details > summary");
      expect(disclosure).toBeTruthy();
      expect(disclosure?.textContent).toContain("Menu");
    });

    it("links the logo home with an accessible name", () => {
      render(<SiteHeader />);
      const logo = screen.getByAltText("Prop Firm Lenz");
      expect(logo.getAttribute("width")).toBe("160");
      expect(logo.getAttribute("height")).toBe("32");
    });

    it("keeps planned sections as text, not links", () => {
      const { container } = render(<SiteFooter />);
      const planned = within(container).getByText(/trader reviews/i);
      expect(planned.closest("a")).toBeNull();
      expect(container.innerHTML).toContain("Phase 3");
    });

    it("links payouts now that the route exists", () => {
      const { container } = render(<SiteHeader />);
      const hrefs = [...container.querySelectorAll("a")].map((a) =>
        a.getAttribute("href"),
      );
      expect(hrefs).toContain("/payouts");
    });
  });
});

describe("(12) public/admin boundary", () => {
  const ROOT = join(process.cwd(), "src");

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  }

  it("no homepage component imports admin code or the database", () => {
    const homeFiles = walk(join(ROOT, "components", "public", "home"));
    expect(homeFiles.length).toBeGreaterThan(0);

    for (const file of homeFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/from\s+"@\/components\/admin/);
      expect(source).not.toMatch(/from\s+"@\/lib\/db\//);
    }
  });
});
