import { describe, expect, it } from "vitest";
import {
  affiliateLinkFormSchema,
  challengeFormSchema,
  offerFormSchema,
  ruleFormSchema,
  seoFormSchema,
  toChallengeOp,
  toRuleOp,
} from "./firm-children";

/**
 * Admin child-form validation — docs/ARCHITECTURE.md §13 `[LOCKED]`.
 *
 * Server-side validation is mandatory: a browser's own checks are a
 * convenience, and a server action is a public HTTP endpoint that anyone can
 * post to directly.
 */

const validChallenge = {
  name: "Example Challenge",
  slug: "example-challenge",
  challengeType: "two_step",
  accountSizeAmount: "50000",
  accountSizeCurrency: "USD",
  priceAmount: "299",
  priceCurrency: "usd",
  profitTargetP1Pct: "8",
  profitTargetP2Pct: "",
  profitTargetP3Pct: "",
  maxDailyLossPct: "5",
  maxTotalDrawdownPct: "10",
  drawdownType: "static",
  drawdownBasis: "initial_balance",
  minTradingDays: "3",
  maxTradingDays: "",
  profitSplitPct: "80",
  payoutFrequencyDays: "14",
  firstPayoutDays: "",
  leverage: "1:100",
  feeRefundable: "yes",
  hasScalingPlan: "",
  displayOrder: "",
};

describe("challenge form", () => {
  it("keeps money as an amount paired with its own currency", () => {
    const op = toChallengeOp(challengeFormSchema.parse(validChallenge));

    expect(op.accountSize).toEqual({ amount: 50000, currency: "USD" });
    expect(op.price).toEqual({ amount: 299, currency: "USD" });
    // No flat compatibility fields — the canonical nested shape only.
    expect(op).not.toHaveProperty("accountCurrency");
    expect(op).not.toHaveProperty("priceCurrency");
  });

  it("(27) rejects a negative or non-numeric amount", () => {
    for (const accountSizeAmount of ["-1", "abc", "12abc"]) {
      const result = challengeFormSchema.safeParse({
        ...validChallenge,
        accountSizeAmount,
      });
      expect(result.success).toBe(false);
    }
  });

  it("(28) rejects a malformed currency", () => {
    for (const accountSizeCurrency of ["US", "DOLLAR", "$", ""]) {
      expect(
        challengeFormSchema.safeParse({
          ...validChallenge,
          accountSizeCurrency,
        }).success,
      ).toBe(false);
    }
  });

  it("(28) refuses a price without its own currency", () => {
    const result = challengeFormSchema.safeParse({
      ...validChallenge,
      priceAmount: "299",
      priceCurrency: "",
    });
    expect(result.success).toBe(false);
  });

  it("(29) rejects out-of-range drawdown and target percentages", () => {
    for (const field of [
      "maxDailyLossPct",
      "maxTotalDrawdownPct",
      "profitTargetP1Pct",
      "profitSplitPct",
    ]) {
      for (const value of ["-5", "101"]) {
        expect(
          challengeFormSchema.safeParse({ ...validChallenge, [field]: value })
            .success,
        ).toBe(false);
      }
    }
  });

  it("rejects a maximum trading day count below the minimum", () => {
    expect(
      challengeFormSchema.safeParse({
        ...validChallenge,
        minTradingDays: "10",
        maxTradingDays: "3",
      }).success,
    ).toBe(false);
  });

  it("(30) rejects a malformed slug", () => {
    for (const slug of [
      "Example Challenge",
      "example_challenge",
      "-lead",
      "",
    ]) {
      expect(
        challengeFormSchema.safeParse({ ...validChallenge, slug }).success,
      ).toBe(false);
    }
  });

  it("stores a blank optional field as null, never as zero", () => {
    const op = toChallengeOp(challengeFormSchema.parse(validChallenge));

    // Blank max trading days means UNLIMITED, and the public page says so.
    expect(op.maxTradingDays).toBeNull();
    expect(op.firstPayoutDays).toBeNull();
    // A blank tri-state is "not specified", not `false`.
    expect(op.hasScalingPlan).toBeNull();
    expect(op.feeRefundable).toBe(true);
  });

  it("accepts a genuine zero as a real value", () => {
    const op = toChallengeOp(
      challengeFormSchema.parse({ ...validChallenge, minTradingDays: "0" }),
    );
    expect(op.minTradingDays).toBe(0);
  });
});

describe("rule form", () => {
  const base = {
    ruleId: "00000000-0000-7000-8000-000000000001",
    detail: "",
    note: "",
    sourceUrl: "",
  };

  it("maps allowed and not-allowed onto the boolean column", () => {
    expect(
      toRuleOp(ruleFormSchema.parse({ ...base, state: "allowed" })),
    ).toMatchObject({ valueBoolean: true, valueText: null });
    expect(
      toRuleOp(ruleFormSchema.parse({ ...base, state: "not_allowed" })),
    ).toMatchObject({ valueBoolean: false });
  });

  it("keeps 'not specified' distinct from 'not allowed'", () => {
    // With no stored answer there is nothing to record: the honest form of
    // "we do not know" is the ABSENCE of a row (docs/PROJECT.md §6.5).
    const op = toRuleOp(
      ruleFormSchema.parse({ ...base, state: "not_specified" }),
    );
    expect(op).toBeNull();

    // With one stored, it becomes an explicit delete — never `false`.
    const removal = toRuleOp(
      ruleFormSchema.parse({
        ...base,
        id: "00000000-0000-7000-8000-000000000002",
        state: "not_specified",
      }),
    );
    expect(removal).toMatchObject({ _op: "delete" });
    expect(removal).not.toHaveProperty("valueBoolean");
  });

  it("records a condition as text", () => {
    const op = toRuleOp(
      ruleFormSchema.parse({
        ...base,
        state: "conditional",
        detail: "Allowed outside high-impact news windows.",
      }),
    );
    expect(op).toMatchObject({
      valueBoolean: null,
      valueText: "Allowed outside high-impact news windows.",
    });
  });

  it("(32) rejects a malformed source URL and rule id", () => {
    expect(
      ruleFormSchema.safeParse({
        ...base,
        state: "allowed",
        sourceUrl: "not-a-url",
      }).success,
    ).toBe(false);
    expect(
      ruleFormSchema.safeParse({ ...base, ruleId: "nope", state: "allowed" })
        .success,
    ).toBe(false);
  });
});

describe("offer form", () => {
  const base = {
    title: "Example Offer",
    description: "",
    terms: "",
    code: "EXAMPLE",
    discountType: "percent",
    discountValue: "20",
    discountCurrency: "",
    startsAt: "",
    endsAt: "",
    affiliateLinkId: "",
    displayOrder: "",
  };

  it("(31) interprets a datetime-local value as UTC", () => {
    const parsed = offerFormSchema.parse({
      ...base,
      startsAt: "2026-09-04T09:30",
    });
    // No offset in the input, so it MUST be pinned to UTC explicitly —
    // otherwise the instant depends on where the admin is sitting.
    expect(parsed.startsAt).toBe("2026-09-04T09:30:00.000Z");
  });

  it("(31) rejects a malformed date and an inverted window", () => {
    expect(
      offerFormSchema.safeParse({ ...base, startsAt: "yesterday" }).success,
    ).toBe(false);
    expect(
      offerFormSchema.safeParse({
        ...base,
        startsAt: "2026-09-04T10:00",
        endsAt: "2026-09-04T09:00",
      }).success,
    ).toBe(false);
  });

  it("requires a currency for a fixed discount", () => {
    expect(
      offerFormSchema.safeParse({
        ...base,
        discountType: "fixed",
        discountValue: "50",
        discountCurrency: "",
      }).success,
    ).toBe(false);

    expect(
      offerFormSchema.safeParse({
        ...base,
        discountType: "fixed",
        discountValue: "50",
        discountCurrency: "eur",
      }).success,
    ).toBe(true);
  });

  it("rejects a percentage discount above 100", () => {
    expect(
      offerFormSchema.safeParse({ ...base, discountValue: "150" }).success,
    ).toBe(false);
  });
});

describe("affiliate link form", () => {
  const base = {
    label: "Default",
    destinationUrl: "https://partner.example.test/offer",
    network: "",
    campaign: "",
    isDefault: true,
    status: "active",
    startsAt: "",
    endsAt: "",
  };

  it("(22) rejects any destination that is not absolute https", () => {
    for (const destinationUrl of [
      "http://partner.example.test",
      "javascript:alert(1)",
      "//evil.example/path",
      "/prop-firms/example-firm-a",
      "ftp://partner.example.test",
      "",
    ]) {
      expect(
        affiliateLinkFormSchema.safeParse({ ...base, destinationUrl }).success,
      ).toBe(false);
    }
  });

  it("(23) accepts only a well-formed partner URL", () => {
    expect(affiliateLinkFormSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a campaign outside the allowlisted shape", () => {
    expect(
      affiliateLinkFormSchema.safeParse({ ...base, campaign: "' or 1=1 --" })
        .success,
    ).toBe(false);
    expect(
      affiliateLinkFormSchema.safeParse({ ...base, campaign: "spring-2026" })
        .success,
    ).toBe(true);
  });

  it("has no field for commercial terms", () => {
    const parsed = affiliateLinkFormSchema.parse(base);
    expect(parsed).not.toHaveProperty("commissionNotes");
  });
});

describe("SEO form", () => {
  const base = {
    title: "",
    metaDescription: "",
    canonicalUrl: "",
    ogTitle: "",
    ogDescription: "",
    robotsIndex: true,
    robotsFollow: true,
    includeInSitemap: true,
  };

  it("(35) enforces the documented length limits", () => {
    expect(
      seoFormSchema.safeParse({ ...base, title: "x".repeat(71) }).success,
    ).toBe(false);
    expect(
      seoFormSchema.safeParse({ ...base, metaDescription: "x".repeat(161) })
        .success,
    ).toBe(false);
  });

  it("(36) requires a canonical override to be an absolute https URL", () => {
    for (const canonicalUrl of [
      "/prop-firms/example-firm-a",
      "http://propfirmlenz.com/x",
      "javascript:alert(1)",
    ]) {
      expect(seoFormSchema.safeParse({ ...base, canonicalUrl }).success).toBe(
        false,
      );
    }
    expect(
      seoFormSchema.safeParse({
        ...base,
        canonicalUrl: "https://propfirmlenz.com/prop-firms/example-firm-a",
      }).success,
    ).toBe(true);
  });

  it("treats a blank override as 'use the template', not as an empty string", () => {
    const parsed = seoFormSchema.parse(base);
    expect(parsed.title).toBeNull();
    expect(parsed.canonicalUrl).toBeNull();
  });

  it("(37) offers no field for structured-data injection", () => {
    const parsed = seoFormSchema.parse(base);
    for (const forbidden of [
      "structuredDataOverride",
      "jsonLd",
      "schema",
      "faq",
      "aggregateRating",
      "review",
    ]) {
      expect(parsed).not.toHaveProperty(forbidden);
    }
  });
});
