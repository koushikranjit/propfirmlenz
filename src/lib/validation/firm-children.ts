import { z } from "zod";

/**
 * Admin child-form schemas — docs/ARCHITECTURE.md §13 `[LOCKED]`.
 *
 * These parse an HTML form into a DRAFT OP. They are the boundary: server
 * actions call them before anything reaches a service, and the database's CHECK
 * constraints remain the last line of defence, not the first.
 *
 * Two conventions run through every schema here:
 *
 *  1. A blank input means NOT SPECIFIED and becomes `null`. It never becomes
 *     `0`, `""`, `false`, or a borrowed default — "unknown" is a first-class
 *     value (docs/PROJECT.md §6.5 `[LOCKED]`).
 *  2. Money is `{ amount, currency }`, matching the canonical view model. There
 *     are no flat `accountCurrency` / `priceCurrency` compatibility fields, and
 *     nothing is ever converted between currencies.
 */

const CURRENCY = /^[A-Z]{3}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "" -> null. Anything else is trimmed. */
const blankToNull = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : v));

/** "" -> null; otherwise a finite number. Rejects "12abc" rather than coercing. */
function numericField(
  opts: { min?: number; max?: number; int?: boolean } = {},
) {
  return blankToNull
    .superRefine((value, ctx) => {
      if (value === null) return;
      const n = Number(value);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: "custom", message: "Enter a number." });
        return;
      }
      if (opts.int && !Number.isInteger(n)) {
        ctx.addIssue({ code: "custom", message: "Enter a whole number." });
      }
      if (opts.min !== undefined && n < opts.min) {
        ctx.addIssue({
          code: "custom",
          message: `Must be ${opts.min} or more.`,
        });
      }
      if (opts.max !== undefined && n > opts.max) {
        ctx.addIssue({
          code: "custom",
          message: `Must be ${opts.max} or less.`,
        });
      }
    })
    .transform((value) => (value === null ? null : Number(value)));
}

/** A percentage 0–100. Negative drawdowns and >100% targets are rejected. */
const percentField = numericField({ min: 0, max: 100 });

const currencyField = z
  .string()
  .trim()
  .toUpperCase()
  .regex(CURRENCY, "Use a three-letter ISO code, e.g. USD.");

/**
 * A `datetime-local` value, interpreted as UTC.
 *
 * The input carries no offset, so it MUST be given one explicitly — otherwise
 * the same string means different instants on an admin's laptop and on the
 * server. The form labels these fields "(UTC)" so the admin knows which clock
 * they are typing in, and the column is `timestamptz`, so the stored instant is
 * absolute (docs/DATABASE.md §1).
 */
const utcDateTimeField = blankToNull
  .superRefine((value, ctx) => {
    if (value === null) return;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date and time." });
      return;
    }
    if (Number.isNaN(new Date(`${value}Z`).getTime())) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date and time." });
    }
  })
  .transform((value) =>
    value === null ? null : new Date(`${value}Z`).toISOString(),
  );

/* ------------------------------------------------------------- challenges */

export const challengeFormSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1, "A name is required.").max(200),
    slug: z
      .string()
      .trim()
      .min(1, "A slug is required.")
      .max(100)
      .regex(SLUG, "Use lowercase letters, numbers and single hyphens."),
    challengeType: z.enum([
      "one_step",
      "two_step",
      "three_step",
      "instant_funding",
      "other",
    ]),
    accountSizeAmount: numericField({ min: 0 }).refine((v) => v !== null, {
      message: "An account size is required.",
    }),
    accountSizeCurrency: currencyField,
    priceAmount: numericField({ min: 0 }),
    priceCurrency: z
      .string()
      .trim()
      .toUpperCase()
      .transform((v) => (v.length === 0 ? null : v))
      .nullable(),
    profitTargetP1Pct: percentField,
    profitTargetP2Pct: percentField,
    profitTargetP3Pct: percentField,
    maxDailyLossPct: percentField,
    maxTotalDrawdownPct: percentField,
    drawdownType: z
      .enum(["static", "trailing", "eod_trailing", ""])
      .transform((v) => (v === "" ? null : v)),
    drawdownBasis: z
      .enum([
        "initial_balance",
        "equity",
        "highest_equity",
        "highest_balance",
        "",
      ])
      .transform((v) => (v === "" ? null : v)),
    minTradingDays: numericField({ min: 0, int: true }),
    maxTradingDays: numericField({ min: 0, int: true }),
    profitSplitPct: percentField,
    payoutFrequencyDays: numericField({ min: 0, int: true }),
    firstPayoutDays: numericField({ min: 0, int: true }),
    leverage: blankToNull.pipe(z.string().max(50).nullable()),
    feeRefundable: z.enum(["", "yes", "no"]),
    hasScalingPlan: z.enum(["", "yes", "no"]),
    displayOrder: numericField({ min: 0, int: true }),
  })
  .refine(
    (c) =>
      c.maxTradingDays === null ||
      c.minTradingDays === null ||
      c.maxTradingDays >= c.minTradingDays,
    {
      message: "The maximum trading days cannot be below the minimum.",
      path: ["maxTradingDays"],
    },
  )
  .refine((c) => c.priceAmount === null || c.priceCurrency !== null, {
    // Money never exists without its own currency (CLAUDE.md §12.4c rule 21).
    message: "A price needs its own currency.",
    path: ["priceCurrency"],
  })
  .refine((c) => c.priceCurrency === null || CURRENCY.test(c.priceCurrency), {
    message: "Use a three-letter ISO code, e.g. USD.",
    path: ["priceCurrency"],
  });

export type ChallengeFormInput = z.infer<typeof challengeFormSchema>;

/** A tri-state select: "" is genuinely unknown, never `false`. */
function triState(value: "" | "yes" | "no"): boolean | null {
  return value === "" ? null : value === "yes";
}

/** Converts a validated challenge form into a draft op. */
export function toChallengeOp(input: ChallengeFormInput) {
  return {
    _op: input.id ? ("update" as const) : ("create" as const),
    ...(input.id ? { id: input.id } : {}),
    name: input.name,
    slug: input.slug,
    challengeType: input.challengeType,
    accountSize: {
      amount: input.accountSizeAmount as number,
      currency: input.accountSizeCurrency,
    },
    price:
      input.priceAmount === null || input.priceCurrency === null
        ? null
        : { amount: input.priceAmount, currency: input.priceCurrency },
    profitTargetP1Pct: input.profitTargetP1Pct,
    profitTargetP2Pct: input.profitTargetP2Pct,
    profitTargetP3Pct: input.profitTargetP3Pct,
    maxDailyLossPct: input.maxDailyLossPct,
    maxTotalDrawdownPct: input.maxTotalDrawdownPct,
    drawdownType: input.drawdownType,
    drawdownBasis: input.drawdownBasis,
    minTradingDays: input.minTradingDays,
    maxTradingDays: input.maxTradingDays,
    profitSplitPct: input.profitSplitPct,
    payoutFrequencyDays: input.payoutFrequencyDays,
    firstPayoutDays: input.firstPayoutDays,
    leverage: input.leverage,
    feeRefundable: triState(input.feeRefundable),
    hasScalingPlan: triState(input.hasScalingPlan),
    ...(input.displayOrder !== null
      ? { displayOrder: input.displayOrder }
      : {}),
  };
}

/* ------------------------------------------------------------------ rules */

/**
 * A rule answer.
 *
 * "not_specified" is a real choice that REMOVES the answer rather than storing
 * a falsy one — the distinction between "this firm forbids it" and "nobody has
 * checked" is the whole point of the rules section
 * (docs/PROJECT.md §6.5 `[LOCKED]`).
 */
export const ruleFormSchema = z.object({
  id: z.uuid().optional(),
  ruleId: z.uuid("Choose a rule."),
  state: z.enum(["allowed", "not_allowed", "conditional", "not_specified"]),
  detail: blankToNull.pipe(z.string().max(2000).nullable()),
  note: blankToNull.pipe(z.string().max(2000).nullable()),
  sourceUrl: blankToNull.superRefine((value, ctx) => {
    if (value === null) return;
    if (!/^https?:\/\/\S+$/.test(value)) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a full URL starting with http:// or https://",
      });
    }
  }),
});

export type RuleFormInput = z.infer<typeof ruleFormSchema>;

/**
 * Converts a rule answer into a draft op.
 *
 * `not_specified` becomes a DELETE: the honest representation of "we do not
 * know" is the absence of a row, not a row saying nothing.
 */
export function toRuleOp(input: RuleFormInput) {
  if (input.state === "not_specified") {
    return input.id
      ? {
          _op: "delete" as const,
          id: input.id,
          ruleId: input.ruleId,
          scope: "firm" as const,
        }
      : null;
  }

  const base = {
    _op: input.id ? ("update" as const) : ("create" as const),
    ...(input.id ? { id: input.id } : {}),
    ruleId: input.ruleId,
    scope: "firm" as const,
    note: input.note,
    sourceUrl: input.sourceUrl,
    valueBoolean: null as boolean | null,
    valueNumeric: null as number | null,
    valueText: null as string | null,
  };

  if (input.state === "conditional") {
    // A condition needs describing; without detail there is nothing to show.
    return { ...base, valueText: input.detail ?? "Allowed with conditions" };
  }
  return { ...base, valueBoolean: input.state === "allowed" };
}

/* ------------------------------------------------ platforms & instruments */

export const platformFormSchema = z.object({
  platformId: z.uuid("Choose a platform."),
  isPrimary: z.boolean(),
  notes: blankToNull.pipe(z.string().max(500).nullable()),
});

export const instrumentFormSchema = z.object({
  instrumentId: z.uuid("Choose an instrument."),
  /** `false` = EXPLICITLY prohibited, which is not the same as no row. */
  isAllowed: z.boolean(),
  notes: blankToNull.pipe(z.string().max(500).nullable()),
});

/* ----------------------------------------------------------------- offers */

export const offerFormSchema = z
  .object({
    id: z.uuid().optional(),
    title: z.string().trim().min(1, "A title is required.").max(200),
    description: blankToNull.pipe(z.string().max(2000).nullable()),
    terms: blankToNull.pipe(z.string().max(4000).nullable()),
    code: blankToNull.pipe(z.string().max(64).nullable()),
    discountType: z
      .enum(["percent", "fixed", "free_trial", "other", ""])
      .transform((v) => (v === "" ? null : v)),
    discountValue: numericField({ min: 0 }),
    discountCurrency: z
      .string()
      .trim()
      .toUpperCase()
      .transform((v) => (v.length === 0 ? null : v))
      .nullable(),
    startsAt: utcDateTimeField,
    endsAt: utcDateTimeField,
    affiliateLinkId: z
      .string()
      .trim()
      .transform((v) => (v.length === 0 ? null : v))
      .nullable()
      .refine((v) => v === null || z.uuid().safeParse(v).success, {
        message: "Choose a valid affiliate link.",
      }),
    displayOrder: numericField({ min: 0, int: true }),
  })
  .refine(
    (o) =>
      o.discountType !== "fixed" ||
      (o.discountCurrency !== null && CURRENCY.test(o.discountCurrency)),
    {
      message: "A fixed discount needs its own currency.",
      path: ["discountCurrency"],
    },
  )
  .refine(
    (o) =>
      o.discountType !== "percent" ||
      o.discountValue === null ||
      o.discountValue <= 100,
    {
      message: "A percentage discount cannot exceed 100.",
      path: ["discountValue"],
    },
  )
  .refine(
    (o) => o.startsAt === null || o.endsAt === null || o.endsAt > o.startsAt,
    {
      message: "The offer must end after it starts.",
      path: ["endsAt"],
    },
  );

export type OfferFormInput = z.infer<typeof offerFormSchema>;

export function toOfferOp(input: OfferFormInput) {
  return {
    _op: input.id ? ("update" as const) : ("create" as const),
    ...(input.id ? { id: input.id } : {}),
    title: input.title,
    description: input.description,
    terms: input.terms,
    code: input.code,
    discountType: input.discountType,
    discountValue: input.discountValue,
    discountCurrency: input.discountCurrency,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    affiliateLinkId: input.affiliateLinkId,
    ...(input.displayOrder !== null
      ? { displayOrder: input.displayOrder }
      : {}),
  };
}

/* -------------------------------------------------------- affiliate links */

/**
 * `destinationUrl` is checked here, by the database's `^https://` CHECK, and
 * again by `isSafeAffiliateDestination` before any `Location` header is sent.
 * `/go/{slug}` is the only route that sends a visitor off-site, so the cost of
 * a bad value is an open redirect (docs/ARCHITECTURE.md §11.3 `[LOCKED]`).
 */
export const affiliateLinkFormSchema = z.object({
  id: z.uuid().optional(),
  label: z.string().trim().min(1, "A label is required.").max(120),
  destinationUrl: z
    .string()
    .trim()
    .min(1, "A destination URL is required.")
    .refine((v) => v.startsWith("https://"), {
      message: "The destination must be an https:// URL.",
    })
    .refine((v) => z.url().safeParse(v).success, {
      message: "Enter a valid URL.",
    }),
  network: blankToNull.pipe(z.string().max(120).nullable()),
  campaign: blankToNull.superRefine((value, ctx) => {
    if (value === null) return;
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(value)) {
      ctx.addIssue({
        code: "custom",
        message: "Use letters, numbers, hyphens or underscores.",
      });
    }
  }),
  isDefault: z.boolean(),
  status: z.enum(["active", "paused", "archived"]),
  startsAt: utcDateTimeField,
  endsAt: utcDateTimeField,
});

export type AffiliateLinkFormInput = z.infer<typeof affiliateLinkFormSchema>;

export function toAffiliateLinkOp(input: AffiliateLinkFormInput) {
  return {
    _op: input.id ? ("update" as const) : ("create" as const),
    ...(input.id ? { id: input.id } : {}),
    label: input.label,
    destinationUrl: input.destinationUrl,
    network: input.network,
    campaign: input.campaign,
    isDefault: input.isDefault,
    status: input.status,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  };
}

/* -------------------------------------------------------------------- SEO */

/**
 * SEO overrides.
 *
 * `robotsIndex` is a request, not a guarantee: `isIndexable()` still decides
 * whether a firm page is thin, and a thin page ships `noindex` however this is
 * set (docs/SEO.md §10.3 `[LOCKED]`). There is deliberately no field for
 * `structured_data_override` — an admin-supplied JSON-LD blob would need schema
 * validation before render, and that validator does not exist.
 */
export const seoFormSchema = z.object({
  title: blankToNull.pipe(z.string().max(70).nullable()),
  metaDescription: blankToNull.pipe(z.string().max(160).nullable()),
  canonicalUrl: blankToNull.superRefine((value, ctx) => {
    if (value === null) return;
    if (!/^https:\/\/\S+$/.test(value)) {
      ctx.addIssue({
        code: "custom",
        message: "A canonical must be a full https:// URL.",
      });
    }
  }),
  ogTitle: blankToNull.pipe(z.string().max(70).nullable()),
  ogDescription: blankToNull.pipe(z.string().max(200).nullable()),
  robotsIndex: z.boolean(),
  robotsFollow: z.boolean(),
  includeInSitemap: z.boolean(),
});

export type SeoFormInput = z.infer<typeof seoFormSchema>;
