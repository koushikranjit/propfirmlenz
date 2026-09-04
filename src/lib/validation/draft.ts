import { z } from "zod";

/**
 * The draft payload envelope — docs/DATABASE.md §3.2.1 `[LOCKED]`.
 *
 *   LIVE -> EDIT DRAFT -> PREVIEW -> PUBLISH
 *
 * Pending edits to a published firm live here, covering the firm AND every
 * child. Pending child rows never exist as real rows, so there is no path by
 * which draft data can reach a public query.
 *
 * The payload is SPARSE: only changed fields and changed children are recorded.
 * It is validated on EVERY save with the same schemas used at publish, so a
 * draft cannot accumulate invalid state that only fails at the last moment.
 */

export const DRAFT_SCHEMA_VERSION = 1;

/** Every child entry declares what should happen to it at publish. */
export const draftOpSchema = z.enum(["create", "update", "delete"]);
export type DraftOp = z.infer<typeof draftOpSchema>;

const currencyCode = z
  .string()
  .regex(/^[A-Z]{3}$/, "must be an ISO 4217 code, uppercase");

const slug = z
  .string()
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "must be lowercase alphanumeric with single hyphens",
  );

const percent = z.number().min(0).max(100);

/**
 * Money is always an amount PLUS its own source currency (docs/ARCHITECTURE.md
 * §18). There is no base-currency field and no converted value: conversion is a
 * read-time display concern only.
 */
const money = z.object({
  amount: z.number().nonnegative(),
  currency: currencyCode,
});

export const draftFirmSchema = z
  .object({
    slug: slug.optional(),
    name: z.string().min(1).max(200).optional(),
    legalName: z.string().max(200).nullable().optional(),
    tagline: z.string().max(160).nullable().optional(),
    description: z.string().nullable().optional(),
    foundedYear: z.number().int().min(1900).max(2100).nullable().optional(),
    headquartersCountry: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .optional(),
    headquartersCity: z.string().nullable().optional(),
    websiteUrl: z.url().nullable().optional(),
    supportEmail: z.email().nullable().optional(),
    supportUrl: z.url().nullable().optional(),
    payoutInfoUrl: z.url().nullable().optional(),
    logoMediaId: z.uuid().nullable().optional(),
    coverMediaId: z.uuid().nullable().optional(),
    brandColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable()
      .optional(),
    isFeatured: z.boolean().optional(),
    displayOrder: z.number().int().optional(),
  })
  .strict();

export const draftChallengeSchema = z
  .object({
    _op: draftOpSchema,
    id: z.uuid().optional(),
    name: z.string().min(1).max(200).optional(),
    slug: slug.optional(),
    challengeType: z
      .enum(["one_step", "two_step", "three_step", "instant_funding", "other"])
      .optional(),
    accountSize: money.optional(),
    price: money.nullable().optional(),
    profitTargetP1Pct: percent.nullable().optional(),
    profitTargetP2Pct: percent.nullable().optional(),
    profitTargetP3Pct: percent.nullable().optional(),
    maxDailyLossPct: percent.nullable().optional(),
    maxTotalDrawdownPct: percent.nullable().optional(),
    drawdownType: z
      .enum(["static", "trailing", "eod_trailing"])
      .nullable()
      .optional(),
    drawdownBasis: z
      .enum(["initial_balance", "equity", "highest_equity", "highest_balance"])
      .nullable()
      .optional(),
    minTradingDays: z.number().int().nonnegative().nullable().optional(),
    /** null means UNLIMITED — never coerce to 0. */
    maxTradingDays: z.number().int().nonnegative().nullable().optional(),
    profitSplitPct: percent.nullable().optional(),
    payoutFrequencyDays: z.number().int().nonnegative().nullable().optional(),
    firstPayoutDays: z.number().int().nonnegative().nullable().optional(),
    leverage: z.string().max(50).nullable().optional(),
    feeRefundable: z.boolean().nullable().optional(),
    hasScalingPlan: z.boolean().nullable().optional(),
    displayOrder: z.number().int().optional(),
  })
  .strict()
  .refine((c) => c._op === "create" || c.id !== undefined, {
    message: "update and delete require an id",
  })
  .refine(
    (c) =>
      c.maxTradingDays == null ||
      c.minTradingDays == null ||
      c.maxTradingDays >= c.minTradingDays,
    { message: "maxTradingDays must be >= minTradingDays" },
  );

export const draftRuleValueSchema = z
  .object({
    _op: draftOpSchema,
    id: z.uuid().optional(),
    ruleId: z.uuid(),
    scope: z.enum(["firm", "challenge"]),
    challengeId: z.uuid().nullable().optional(),
    valueBoolean: z.boolean().nullable().optional(),
    valueNumeric: z.number().nullable().optional(),
    valueText: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
    sourceUrl: z.url().nullable().optional(),
  })
  .strict()
  .refine(
    (v) => {
      if (v._op === "delete") return true;
      const set = [v.valueBoolean, v.valueNumeric, v.valueText].filter(
        (x) => x !== null && x !== undefined,
      );
      return set.length === 1;
    },
    { message: "exactly one value column must be set" },
  );

export const draftPlatformSchema = z
  .object({
    _op: draftOpSchema,
    platformId: z.uuid(),
    isPrimary: z.boolean().optional(),
    notes: z.string().nullable().optional(),
  })
  .strict();

export const draftInstrumentSchema = z
  .object({
    _op: draftOpSchema,
    instrumentId: z.uuid(),
    /** false = explicitly prohibited, which is different from "no row". */
    isAllowed: z.boolean().optional(),
    notes: z.string().nullable().optional(),
  })
  .strict();

export const draftOfferSchema = z
  .object({
    _op: draftOpSchema,
    id: z.uuid().optional(),
    affiliateLinkId: z.uuid().nullable().optional(),
    title: z.string().min(1).max(200).optional(),
    description: z.string().nullable().optional(),
    terms: z.string().nullable().optional(),
    code: z.string().max(64).nullable().optional(),
    discountType: z
      .enum(["percent", "fixed", "free_trial", "other"])
      .nullable()
      .optional(),
    discountValue: z.number().nonnegative().nullable().optional(),
    discountCurrency: currencyCode.nullable().optional(),
    startsAt: z.iso.datetime().nullable().optional(),
    endsAt: z.iso.datetime().nullable().optional(),
    displayOrder: z.number().int().optional(),
  })
  .strict()
  .refine((o) => o._op === "create" || o.id !== undefined, {
    message: "update and delete require an id",
  })
  .refine(
    (o) =>
      o.discountType !== "fixed" ||
      (o.discountCurrency !== null && o.discountCurrency !== undefined),
    { message: "a fixed discount requires its source currency" },
  )
  .refine(
    (o) =>
      o.discountType !== "percent" ||
      o.discountValue == null ||
      (o.discountValue >= 0 && o.discountValue <= 100),
    { message: "a percent discount must be between 0 and 100" },
  );

/**
 * Affiliate links — pending edits, like every other child `[LOCKED]`.
 *
 * These live in the draft for the same reason challenges do: an admin editing a
 * published firm must be able to stage a destination change, preview it, and
 * publish it atomically. Writing an affiliate link straight to the live table
 * would change where real visitors are sent the instant it was typed.
 *
 * `destinationUrl` is validated HERE, again by the database (`^https://`), and
 * again by `isSafeAffiliateDestination` before any `Location` header is
 * emitted. All three layers are deliberate: `/go/{slug}` is the only route that
 * sends a visitor off-site (docs/ARCHITECTURE.md §11.3 `[LOCKED]`).
 *
 * `commissionNotes` is deliberately ABSENT. Commercial terms are admin-only and
 * are never staged in a draft, so they cannot ride into a published snapshot or
 * an entity version that someone later inspects.
 */
export const draftAffiliateLinkSchema = z
  .object({
    _op: draftOpSchema,
    id: z.uuid().optional(),
    label: z.string().min(1).max(120).optional(),
    destinationUrl: z
      .url()
      .refine((v) => v.startsWith("https://"), {
        message: "must be an https:// URL",
      })
      .optional(),
    network: z.string().max(120).nullable().optional(),
    campaign: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,64}$/, "letters, numbers, hyphen or underscore")
      .nullable()
      .optional(),
    isDefault: z.boolean().optional(),
    status: z.enum(["active", "paused", "archived"]).optional(),
    startsAt: z.iso.datetime().nullable().optional(),
    endsAt: z.iso.datetime().nullable().optional(),
  })
  .strict()
  .refine((l) => l._op === "create" || l.id !== undefined, {
    message: "update and delete require an id",
  })
  .refine((l) => l._op !== "create" || l.destinationUrl !== undefined, {
    message: "a new affiliate link requires a destination URL",
  })
  .refine(
    (l) => l.startsAt == null || l.endsAt == null || l.endsAt > l.startsAt,
    {
      message: "the end of the window must be after its start",
    },
  );

export const draftSeoSchema = z
  .object({
    title: z.string().max(70).nullable().optional(),
    metaDescription: z.string().max(160).nullable().optional(),
    canonicalUrl: z.url().nullable().optional(),
    ogTitle: z.string().max(70).nullable().optional(),
    ogDescription: z.string().max(200).nullable().optional(),
    ogImageMediaId: z.uuid().nullable().optional(),
    twitterCard: z
      .enum(["summary", "summary_large_image"])
      .nullable()
      .optional(),
    robotsIndex: z.boolean().optional(),
    robotsFollow: z.boolean().optional(),
    includeInSitemap: z.boolean().optional(),
    keywords: z.array(z.string()).nullable().optional(),
  })
  .strict();

/**
 * The versioned envelope. `baseVersion` records the published version this
 * draft forked from — a draft forked from a superseded version is STALE and
 * must warn before publishing rather than overwrite silently.
 */
export const draftPayloadSchema = z
  .object({
    schemaVersion: z.literal(DRAFT_SCHEMA_VERSION),
    baseVersion: z.number().int().nonnegative(),
    updatedAt: z.iso.datetime(),
    updatedByAdminId: z.uuid(),
    firm: draftFirmSchema.optional(),
    challenges: z.array(draftChallengeSchema).optional(),
    ruleValues: z.array(draftRuleValueSchema).optional(),
    platforms: z.array(draftPlatformSchema).optional(),
    instruments: z.array(draftInstrumentSchema).optional(),
    offers: z.array(draftOfferSchema).optional(),
    affiliateLinks: z.array(draftAffiliateLinkSchema).optional(),
    seo: draftSeoSchema.optional(),
  })
  .strict();

export type DraftPayload = z.infer<typeof draftPayloadSchema>;
export type DraftFirm = z.infer<typeof draftFirmSchema>;
export type DraftChallenge = z.infer<typeof draftChallengeSchema>;
export type DraftOffer = z.infer<typeof draftOfferSchema>;
export type DraftAffiliateLink = z.infer<typeof draftAffiliateLinkSchema>;
export type DraftRuleValue = z.infer<typeof draftRuleValueSchema>;
export type DraftPlatform = z.infer<typeof draftPlatformSchema>;
export type DraftInstrument = z.infer<typeof draftInstrumentSchema>;
export type DraftSeo = z.infer<typeof draftSeoSchema>;

/** Creates an empty draft forked from a known published version. */
export function emptyDraft(baseVersion: number, adminId: string): DraftPayload {
  return {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    baseVersion,
    updatedAt: new Date().toISOString(),
    updatedByAdminId: adminId,
  };
}

/** Counts pending changes, for the "N pending changes" preview indicator. */
export function countDraftChanges(payload: DraftPayload): number {
  return (
    Object.keys(payload.firm ?? {}).length +
    (payload.challenges?.length ?? 0) +
    (payload.ruleValues?.length ?? 0) +
    (payload.platforms?.length ?? 0) +
    (payload.instruments?.length ?? 0) +
    (payload.offers?.length ?? 0) +
    (payload.affiliateLinks?.length ?? 0) +
    Object.keys(payload.seo ?? {}).length
  );
}
