import { describe, expect, it } from "vitest";
import {
  CHALLENGE_TYPE_LABEL,
  countryName,
  formatDate,
  formatMoney,
  formatPercent,
  labelFor,
} from "./format";
import { deriveRuleState, isIndexable, RULE_STATE_LABEL } from "./firm-view";
import type { FirmView } from "./firm-view";

/** docs/ARCHITECTURE.md §18.4, docs/PROJECT.md §6.5. */

describe("formatMoney", () => {
  it("always renders the source currency alongside the amount", () => {
    expect(formatMoney({ amount: "50000.00", currency: "USD" })).toBe(
      "$50,000 USD",
    );
    expect(formatMoney({ amount: "299.50", currency: "EUR" })).toBe(
      "€299.50 EUR",
    );
  });

  it("never converts — the same number in another currency stays that number", () => {
    const usd = formatMoney({ amount: "100.00", currency: "USD" });
    const eur = formatMoney({ amount: "100.00", currency: "EUR" });
    expect(usd).toContain("100");
    expect(eur).toContain("100");
    expect(usd).toContain("USD");
    expect(eur).toContain("EUR");
  });

  it("still renders honestly for an unrecognised ISO code", () => {
    expect(formatMoney({ amount: "10.00", currency: "ZZZ" })).toContain("ZZZ");
  });
});

describe("formatPercent", () => {
  it("returns null for a value the database does not hold", () => {
    expect(formatPercent(null)).toBeNull();
  });

  it("keeps the stored precision", () => {
    expect(formatPercent("8.000")).toBe("8%");
    expect(formatPercent("4.500")).toBe("4.5%");
  });

  it("renders a real zero as 0%, not as missing", () => {
    expect(formatPercent("0.000")).toBe("0%");
  });
});

describe("formatDate", () => {
  it("uses an unambiguous day-first form", () => {
    expect(formatDate("2026-09-01T00:00:00.000Z")).toBe("1 September 2026");
  });

  it("returns null rather than inventing a date", () => {
    expect(formatDate(null)).toBeNull();
    expect(formatDate("not a date")).toBeNull();
  });
});

describe("countryName", () => {
  it("resolves an ISO code to its name", () => {
    expect(countryName("GB")).toBe("United Kingdom");
  });

  it("returns null when no country is stored", () => {
    expect(countryName(null)).toBeNull();
  });
});

describe("labelFor", () => {
  it("maps a known enum value", () => {
    expect(labelFor(CHALLENGE_TYPE_LABEL, "two_step")).toBe("Two step");
  });

  it("humanises an unmapped value instead of showing a raw enum", () => {
    expect(labelFor(CHALLENGE_TYPE_LABEL, "four_step")).toBe("Four step");
  });
});

describe("deriveRuleState", () => {
  const base = {
    valueBoolean: null,
    valueNumeric: null,
    valueText: null,
    note: null,
  };

  it("treats an absent value as 'not specified', never as allowed", () => {
    expect(deriveRuleState(base)).toEqual({
      state: "not_specified",
      detail: null,
    });
    expect(RULE_STATE_LABEL.not_specified).toBe("Not specified");
  });

  it("reads an explicit false as 'not allowed'", () => {
    expect(deriveRuleState({ ...base, valueBoolean: false }).state).toBe(
      "not_allowed",
    );
  });

  it("treats a note on an allowed rule as a condition", () => {
    expect(
      deriveRuleState({ ...base, valueBoolean: true, note: "During sessions" })
        .state,
    ).toBe("allowed_with_conditions");
  });

  it("carries a numeric or textual limit through as the detail", () => {
    expect(deriveRuleState({ ...base, valueNumeric: "2" })).toEqual({
      state: "allowed_with_conditions",
      detail: "2",
    });
  });
});

describe("isIndexable", () => {
  const stub: FirmView = {
    id: "1",
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
  };

  it("refuses to index a firm that is only a name", () => {
    expect(isIndexable(stub)).toBe(false);
  });

  it("refuses to index a long description with no substance behind it", () => {
    expect(isIndexable({ ...stub, description: "x".repeat(200) })).toBe(false);
  });

  it("indexes a firm with real prose and published data", () => {
    expect(
      isIndexable({
        ...stub,
        description: "x".repeat(200),
        platforms: [
          {
            id: "p1",
            name: "Example Platform",
            slug: "example-platform",
            isPrimary: true,
            notes: null,
          },
        ],
      }),
    ).toBe(true);
  });
});
