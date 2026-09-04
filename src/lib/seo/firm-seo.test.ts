import { describe, expect, it } from "vitest";
import type { FirmView } from "@/lib/view/firm-view";
import {
  buildFirmDescription,
  buildFirmMetadata,
  buildFirmTitle,
  firmBreadcrumbs,
  firmPath,
} from "./firm-seo";
import { buildItemListLd, buildWebPageLd } from "./metadata";

/** docs/SEO.md §4, §5.1, §10.3, §11 — the templates are pure and tested. */

function firm(overrides: Partial<FirmView> = {}): FirmView {
  return {
    id: "00000000-0000-7000-8000-000000000001",
    slug: "example-firm-a",
    name: "Example Firm A",
    legalName: null,
    tagline: null,
    description: null,
    logo: null,
    foundedYear: null,
    foundedOn: null,
    yearsInOperation: null,
    founderName: null,
    ceoName: null,
    trustpilotRating: null,
    trustpilotUrl: null,
    headquartersCountry: null,
    headquartersCity: null,
    websiteUrl: null,
    supportEmail: null,
    supportUrl: null,
    payoutInfoUrl: null,
    isVerified: false,
    verifiedAt: null,
    publishedAt: null,
    updatedAt: "2026-09-01T00:00:00.000Z",
    challenges: [],
    platforms: [],
    instruments: [],
    rules: [],
    offers: [],
    announcements: [],
    faqs: [],
    hasAffiliateLink: false,
    ...overrides,
  };
}

const challenge: FirmView["challenges"][number] = {
  id: "c1",
  name: "Example Challenge",
  slug: "example-challenge",
  challengeType: "two_step",
  accountSize: { amount: "50000.00", currency: "USD" },
  price: null,
  profitTargetP1Pct: null,
  profitTargetP2Pct: null,
  profitTargetP3Pct: null,
  maxDailyLossPct: null,
  maxTotalDrawdownPct: null,
  drawdownType: null,
  drawdownBasis: null,
  minTradingDays: null,
  maxTradingDays: null,
  profitSplitPct: null,
  payoutFrequencyDays: null,
  firstPayoutDays: null,
  leverage: null,
  feeRefundable: null,
  hasScalingPlan: null,
};

const rule: FirmView["rules"][number] = {
  id: "r1",
  key: "news_trading",
  label: "News trading",
  category: "trading",
  description: null,
  state: "allowed",
  detail: null,
  note: null,
  sourceUrl: null,
};

describe("firm title template", () => {
  it("only names sections that actually have content", () => {
    expect(buildFirmTitle(firm())).toBe("Example Firm A prop firm profile");
    expect(buildFirmTitle(firm({ challenges: [challenge] }))).toBe(
      "Example Firm A challenges and pricing",
    );
    expect(buildFirmTitle(firm({ rules: [rule] }))).toBe(
      "Example Firm A trading rules",
    );
    expect(
      buildFirmTitle(firm({ challenges: [challenge], rules: [rule] })),
    ).toBe("Example Firm A challenges and rules");
  });

  it("never emits an empty interpolation", () => {
    for (const view of [
      firm(),
      firm({ challenges: [challenge] }),
      firm({ rules: [rule] }),
    ]) {
      const title = buildFirmTitle(view);
      expect(title).not.toContain("undefined");
      expect(title).not.toContain("null");
      expect(title).not.toMatch(/\s{2,}/);
    }
  });
});

describe("firm description template", () => {
  it("prefers the admin-written description", () => {
    expect(
      buildFirmDescription(firm({ description: "  A real description.  " })),
    ).toBe("A real description.");
  });

  it("falls back to the tagline", () => {
    expect(buildFirmDescription(firm({ tagline: "A tagline" }))).toBe(
      "A tagline",
    );
  });

  it("states plainly when nothing has been published", () => {
    expect(buildFirmDescription(firm())).toContain(
      "No challenge or rule data has been published yet",
    );
  });

  it("counts only what exists, and never invents a figure", () => {
    const description = buildFirmDescription(
      firm({ challenges: [challenge], headquartersCountry: "GB" }),
    );
    expect(description).toContain("1 published challenge");
    expect(description).toContain("Based in United Kingdom");
    expect(description).not.toContain("0 ");
    expect(description).not.toContain("undefined");
  });

  it("keeps a long description within the meta description budget", () => {
    const long = `${"Sentence one is here. ".repeat(20)}`;
    const description = buildFirmDescription(firm({ description: long }));
    expect(description.length).toBeLessThanOrEqual(160);
  });
});

describe("firm metadata", () => {
  const substantial = firm({
    description: "x".repeat(200),
    challenges: [challenge],
  });

  it("emits a self-referencing canonical for a substantial firm", () => {
    const meta = buildFirmMetadata(substantial, null);
    expect(meta.alternates?.canonical).toBe(
      "https://propfirmlenz.com/prop-firms/example-firm-a",
    );
    expect(meta.robots).toEqual({ index: true, follow: true });
  });

  it("(§10.3) ships a thin profile as noindex with NO canonical", () => {
    const meta = buildFirmMetadata(firm(), null);
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates?.canonical).toBeUndefined();
  });

  it("lets a stored seo_metadata row override the template", () => {
    const meta = buildFirmMetadata(substantial, {
      title: "Overridden title",
      metaDescription: "Overridden description",
    });
    expect(meta.title).toBe("Overridden title");
    expect(meta.description).toBe("Overridden description");
  });

  it("honours an admin noindex override", () => {
    const meta = buildFirmMetadata(substantial, { robotsIndex: false });
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates?.canonical).toBeUndefined();
  });

  it("emits Open Graph on the canonical origin", () => {
    const meta = buildFirmMetadata(substantial, null);
    expect(meta.openGraph?.url).toBe(
      "https://propfirmlenz.com/prop-firms/example-firm-a",
    );
    expect(JSON.stringify(meta)).not.toContain("propfirmlens");
  });
});

describe("breadcrumbs", () => {
  it("mirrors the visible trail, ending at the firm", () => {
    const crumbs = firmBreadcrumbs(firm());
    expect(crumbs.map((c) => c.path)).toEqual([
      "/",
      "/prop-firms",
      "/prop-firms/example-firm-a",
    ]);
    expect(crumbs.at(-1)?.name).toBe("Example Firm A");
  });

  it("builds firm paths under the reserved directory segment", () => {
    expect(firmPath("example-firm-a")).toBe("/prop-firms/example-firm-a");
  });
});

describe("structured data", () => {
  it("omits dateModified rather than emitting null", () => {
    const ld = buildWebPageLd({
      path: "/prop-firms",
      name: "Prop firms",
      description: "Directory.",
    });
    expect(ld).not.toHaveProperty("dateModified");
  });

  it("carries the entity's real updated_at when known", () => {
    const ld = buildWebPageLd({
      path: firmPath("example-firm-a"),
      name: "Example Firm A",
      description: "Description.",
      dateModified: "2026-09-01T00:00:00.000Z",
    });
    expect(ld).toMatchObject({ dateModified: "2026-09-01T00:00:00.000Z" });
    expect(ld["@id"]).toBe(
      "https://propfirmlenz.com/prop-firms/example-firm-a",
    );
  });

  it("numbers a paginated ItemList from its real starting position", () => {
    const ld = buildItemListLd(
      [{ name: "Example Firm A", path: "/prop-firms/example-firm-a" }],
      { startPosition: 25 },
    );
    expect(ld.numberOfItems).toBe(1);
    expect(ld.itemListElement[0]?.position).toBe(25);
  });

  it("emits no rating, review or FAQ markup anywhere", () => {
    const payload = JSON.stringify([
      buildWebPageLd({
        path: firmPath("example-firm-a"),
        name: "Example Firm A",
        description: "Description.",
      }),
      buildItemListLd([
        { name: "Example Firm A", path: "/prop-firms/example-firm-a" },
      ]),
    ]);

    for (const forbidden of [
      "AggregateRating",
      "ratingValue",
      "reviewCount",
      "Review",
      "FAQPage",
      "Question",
    ]) {
      expect(payload).not.toContain(forbidden);
    }
  });
});
