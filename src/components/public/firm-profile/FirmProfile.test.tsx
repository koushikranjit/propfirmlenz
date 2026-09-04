import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { FirmView } from "@/lib/view/firm-view";
import { FirmProfile } from "./FirmProfile";

/**
 * Firm profile rendering — docs/ARCHITECTURE.md §21.9 cases 16, 19;
 * docs/CLAUDE.md §3.
 *
 * Every fixture below is OBVIOUSLY FAKE ("Example Firm A"). No real prop firm
 * name, price, rule or payout figure appears in this repository, in a test or
 * anywhere else `[LOCKED]`.
 */

afterEach(cleanup);

function view(overrides: Partial<FirmView> = {}): FirmView {
  return {
    id: "00000000-0000-7000-8000-000000000001",
    slug: "example-firm-a",
    name: "Example Firm A",
    legalName: null,
    tagline: null,
    description: null,
    logo: null,
    foundedYear: null,
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
    hasAffiliateLink: false,
    ...overrides,
  };
}

function challenge(
  overrides: Partial<FirmView["challenges"][number]> = {},
): FirmView["challenges"][number] {
  return {
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
    ...overrides,
  };
}

describe("FirmProfile — affiliate safety", () => {
  it("(19) renders NO /go/ href in preview, even with an affiliate link", () => {
    const { container } = render(
      <FirmProfile firm={view({ hasAffiliateLink: true })} preview />,
    );

    const hrefs = [...container.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs.filter((h) => h?.startsWith("/go/"))).toEqual([]);
    expect(container.innerHTML).toContain("no click is recorded");
  });

  it("renders the tracked href with sponsored rel on the public page", () => {
    const { container } = render(
      <FirmProfile firm={view({ hasAffiliateLink: true })} />,
    );

    const tracked = [...container.querySelectorAll("a")].filter((a) =>
      a.getAttribute("href")?.startsWith("/go/example-firm-a"),
    );
    expect(tracked.length).toBeGreaterThan(0);
    for (const link of tracked) {
      expect(link.getAttribute("rel")).toBe("sponsored nofollow noopener");
    }
  });

  it("marks a non-affiliate outbound link as such, without the sponsored token", () => {
    const { container } = render(
      <FirmProfile
        firm={view({ websiteUrl: "https://example.test", hasAffiliateLink: false })}
      />,
    );

    const outbound = [...container.querySelectorAll("a")].filter(
      (a) => a.getAttribute("href") === "https://example.test",
    );
    expect(outbound.length).toBeGreaterThan(0);
    expect(outbound[0]?.getAttribute("rel")).toBe("nofollow noopener");
    expect(container.innerHTML).toContain("Not an affiliate link");
  });

  it("never exposes an affiliate destination — the view has no such field", () => {
    const { container } = render(
      <FirmProfile firm={view({ hasAffiliateLink: true })} />,
    );
    expect(container.innerHTML).not.toContain("http://partner");
    expect(container.innerHTML).not.toContain("destinationUrl");
  });
});

describe("FirmProfile — honest empty states", () => {
  it("states that nothing is published rather than showing zeros", () => {
    const { container } = render(<FirmProfile firm={view()} />);
    const html = container.innerHTML;

    expect(html).toContain("No challenges have been published");
    expect(html).toContain("No trading rules have been recorded");
    expect(html).toContain("No trading platforms have been recorded");
    expect(html).toContain("no active offers");
    expect(html).toContain("No description has been published");
  });

  it("says reviews and payouts are not published, and shows no rating", () => {
    const { container } = render(<FirmProfile firm={view()} />);
    const html = container.innerHTML;

    expect(html).toContain("does not publish trader reviews or payout records");
    // No score, star, rank or count is invented anywhere (CLAUDE.md §3).
    expect(html).not.toMatch(/\b\d(\.\d)?\s*\/\s*5\b/);
    expect(html).not.toContain("out of 5");
    expect(html.toLowerCase()).not.toContain("rating:");
  });

  it("says a firm is not verified rather than implying it is", () => {
    render(<FirmProfile firm={view()} />);
    expect(screen.getAllByText(/not yet verified/i).length).toBeGreaterThan(0);
  });

  it("renders 'Not specified' for facts the database does not hold", () => {
    render(<FirmProfile firm={view()} />);
    expect(screen.getAllByText("Not specified").length).toBeGreaterThan(0);
  });
});

describe("FirmProfile — money and currency", () => {
  it("renders every amount with its own source currency", () => {
    const { container } = render(
      <FirmProfile
        firm={view({
          challenges: [
            challenge({
              accountSize: { amount: "50000.00", currency: "EUR" },
              price: { amount: "299.00", currency: "EUR" },
            }),
          ],
        })}
      />,
    );

    const html = container.innerHTML;
    expect(html).toContain("EUR");
    // The stored figure, not a converted one. No USD appears anywhere.
    expect(html).not.toContain("USD");
  });

  it("refuses to imply comparability across currencies", () => {
    const { container } = render(
      <FirmProfile
        firm={view({
          challenges: [
            challenge({
              id: "c1",
              price: { amount: "199.00", currency: "USD" },
            }),
            challenge({
              id: "c2",
              name: "Example Challenge Two",
              price: { amount: "179.00", currency: "EUR" },
            }),
          ],
        })}
      />,
    );

    expect(container.innerHTML).toContain("No conversion is applied");
  });
});

describe("FirmProfile — null semantics", () => {
  it("says a null maximum trading day count means no maximum", () => {
    const { container } = render(
      <FirmProfile
        firm={view({
          challenges: [challenge({ minTradingDays: 3, maxTradingDays: null })],
        })}
      />,
    );

    expect(container.innerHTML).toContain("no maximum");
    // Never rendered as zero, which would invert the meaning.
    expect(container.innerHTML).not.toContain("max 0");
  });

  it("renders a tri-state boolean's null as 'not specified'", () => {
    const { container } = render(
      <FirmProfile
        firm={view({ challenges: [challenge({ feeRefundable: null })] })}
      />,
    );
    expect(container.innerHTML).toContain("refundable: not specified");
  });

  it("shows an undocumented rule as 'Not specified', never as allowed", () => {
    render(
      <FirmProfile
        firm={view({
          rules: [
            {
              id: "r1",
              key: "news_trading",
              label: "News trading",
              category: "trading",
              description: null,
              state: "not_specified",
              detail: null,
              note: null,
              sourceUrl: null,
            },
          ],
        })}
      />,
    );

    const rules = screen.getByRole("region", { name: /trading rules/i });
    expect(within(rules).getByText("Not specified")).toBeTruthy();
    expect(within(rules).queryByText("Allowed")).toBeNull();
  });

  it("distinguishes an explicitly prohibited instrument from an absent one", () => {
    render(
      <FirmProfile
        firm={view({
          instruments: [
            {
              id: "i1",
              name: "Example Instrument",
              slug: "example-instrument",
              assetClass: "crypto",
              isAllowed: false,
              notes: null,
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("Explicitly not tradable")).toBeTruthy();
  });
});

describe("FirmProfile — structure and accessibility", () => {
  it("renders exactly one h1, carrying the firm name", () => {
    render(<FirmProfile firm={view()} />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toContain("Example Firm A");
  });

  it("gives every section an accessible name", () => {
    render(<FirmProfile firm={view()} />);
    for (const name of [
      /overview/i,
      /challenges/i,
      /trading rules/i,
      /platforms/i,
      /instruments/i,
      /offers/i,
    ]) {
      expect(screen.getByRole("region", { name })).toBeTruthy();
    }
  });

  it("gives the challenge table a caption and row headers", () => {
    render(
      <FirmProfile firm={view({ challenges: [challenge()] })} />,
    );

    const table = screen.getByRole("table");
    expect(table.querySelector("caption")?.textContent).toContain(
      "Example Firm A",
    );
    expect(table.querySelector('tbody th[scope="row"]')?.textContent).toBe(
      "Example Challenge",
    );
  });

  it("states verification with text and a date, not colour alone", () => {
    render(
      <FirmProfile
        firm={view({ isVerified: true, verifiedAt: "2026-09-01T00:00:00.000Z" })}
      />,
    );
    expect(screen.getAllByText(/Data verified 1 September 2026/).length).toBe(1);
  });
});

describe("FirmProfile — preview parity", () => {
  it("(16) renders identical markup in preview apart from the CTA href", () => {
    const firm = view({
      tagline: "Example tagline",
      hasAffiliateLink: true,
      challenges: [challenge()],
    });

    const live = render(<FirmProfile firm={firm} />).container.innerHTML;
    cleanup();
    const draft = render(<FirmProfile firm={firm} preview />).container
      .innerHTML;

    expect(live).toContain("/go/example-firm-a");
    expect(draft).not.toContain("/go/example-firm-a");

    // Everything that is not the CTA is byte-identical: the preview is the
    // real page, not a lookalike.
    const strip = (html: string) =>
      html.replace(/<div><(?:a|span)[\s\S]*?<\/p><\/div>/g, "<cta/>");
    expect(strip(draft)).toBe(strip(live));
  });
});
