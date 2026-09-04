import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import {
  affiliateLinks,
  challenges,
  firmInstruments,
  firmPlatforms,
  instruments,
  media,
  offers,
  platforms,
  propFirms,
  ruleValues,
  rules,
} from "@/lib/db/schema";
import {
  type FirmView,
  type FirmViewChallenge,
  type FirmViewRule,
  deriveRuleState,
} from "@/lib/view/firm-view";

/**
 * Builds the PUBLIC `FirmView` — docs/ARCHITECTURE.md §21.2.
 *
 * HARD RULES `[LOCKED]`:
 *
 *  1. `draft_payload` is NEVER selected. It does not appear in any column list
 *     below, and `FirmView` has no field for it, so a leak is a compile error.
 *  2. Every query filters `status = 'published' AND deleted_at IS NULL`.
 *  3. Admin-only data (internal notes, audit log, completeness, verification
 *     actor, affiliate destination URL, commission notes) is never selected.
 *  4. The affiliate destination is reduced to a BOOLEAN. The real URL is
 *     resolved server-side inside `/go/{slug}` and never reaches the browser.
 */

const livePublished = and(
  eq(propFirms.status, "published"),
  isNull(propFirms.deletedAt),
);

/** Resolves a published firm by slug into the canonical view, or null. */
export async function getPublishedFirmView(
  db: Database,
  slug: string,
): Promise<FirmView | null> {
  const firmRows = await db
    .select({
      id: propFirms.id,
      slug: propFirms.slug,
      name: propFirms.name,
      legalName: propFirms.legalName,
      tagline: propFirms.tagline,
      description: propFirms.description,
      foundedYear: propFirms.foundedYear,
      headquartersCountry: propFirms.headquartersCountry,
      headquartersCity: propFirms.headquartersCity,
      websiteUrl: propFirms.websiteUrl,
      supportEmail: propFirms.supportEmail,
      supportUrl: propFirms.supportUrl,
      payoutInfoUrl: propFirms.payoutInfoUrl,
      verificationStatus: propFirms.verificationStatus,
      verifiedAt: propFirms.verifiedAt,
      publishedAt: propFirms.publishedAt,
      updatedAt: propFirms.updatedAt,
      logoUrl: media.publicUrl,
      logoAlt: media.altText,
      logoWidth: media.width,
      logoHeight: media.height,
    })
    .from(propFirms)
    .leftJoin(media, eq(media.id, propFirms.logoMediaId))
    .where(and(eq(propFirms.slug, slug), livePublished))
    .limit(1);

  const firm = firmRows[0];
  if (!firm) return null;

  return assembleView(db, firm);
}

type FirmRow = {
  id: string;
  slug: string;
  name: string;
  legalName: string | null;
  tagline: string | null;
  description: string | null;
  foundedYear: number | null;
  headquartersCountry: string | null;
  headquartersCity: string | null;
  websiteUrl: string | null;
  supportEmail: string | null;
  supportUrl: string | null;
  payoutInfoUrl: string | null;
  verificationStatus: string;
  verifiedAt: Date | null;
  publishedAt: Date | null;
  updatedAt: Date;
  logoUrl: string | null;
  logoAlt: string | null;
  logoWidth: number | null;
  logoHeight: number | null;
};

/**
 * Loads the published children and assembles the view.
 *
 * Exported so the draft materialiser can reuse the exact same assembly and
 * overlay on top of it — one code path, no drift.
 */
export async function assembleView(
  db: Database,
  firm: FirmRow,
): Promise<FirmView> {
  const [
    challengeRows,
    platformRows,
    instrumentRows,
    ruleRows,
    offerRows,
    affiliateRows,
  ] = await Promise.all([
    db
      .select()
      .from(challenges)
      .where(
        and(
          eq(challenges.propFirmId, firm.id),
          eq(challenges.status, "published"),
          isNull(challenges.deletedAt),
        ),
      )
      .orderBy(asc(challenges.displayOrder), asc(challenges.name)),

    db
      .select({
        id: platforms.id,
        name: platforms.name,
        slug: platforms.slug,
        isPrimary: firmPlatforms.isPrimary,
        notes: firmPlatforms.notes,
      })
      .from(firmPlatforms)
      .innerJoin(platforms, eq(platforms.id, firmPlatforms.platformId))
      .where(
        and(
          eq(firmPlatforms.propFirmId, firm.id),
          eq(platforms.status, "published"),
        ),
      )
      .orderBy(asc(platforms.displayOrder), asc(platforms.name)),

    db
      .select({
        id: instruments.id,
        name: instruments.name,
        slug: instruments.slug,
        assetClass: instruments.assetClass,
        isAllowed: firmInstruments.isAllowed,
        notes: firmInstruments.notes,
      })
      .from(firmInstruments)
      .innerJoin(instruments, eq(instruments.id, firmInstruments.instrumentId))
      .where(
        and(
          eq(firmInstruments.propFirmId, firm.id),
          eq(instruments.status, "published"),
        ),
      )
      .orderBy(asc(instruments.displayOrder), asc(instruments.name)),

    db
      .select({
        id: ruleValues.id,
        key: rules.key,
        label: rules.label,
        category: rules.category,
        description: rules.description,
        valueBoolean: ruleValues.valueBoolean,
        valueNumeric: ruleValues.valueNumeric,
        valueText: ruleValues.valueText,
        note: ruleValues.note,
        sourceUrl: ruleValues.sourceUrl,
      })
      .from(ruleValues)
      .innerJoin(rules, eq(rules.id, ruleValues.ruleId))
      .where(
        and(
          eq(ruleValues.propFirmId, firm.id),
          eq(ruleValues.scope, "firm"),
          eq(rules.status, "published"),
        ),
      )
      .orderBy(asc(rules.displayOrder), asc(rules.label)),

    // "Active" is computed at query time — never a stored boolean, which would
    // go stale the moment nobody ran the job (docs/DATABASE.md §5.7 `[LOCKED]`).
    db
      .select({
        id: offers.id,
        title: offers.title,
        description: offers.description,
        terms: offers.terms,
        code: offers.code,
        discountType: offers.discountType,
        discountValue: offers.discountValue,
        discountCurrency: offers.discountCurrency,
        endsAt: offers.endsAt,
      })
      .from(offers)
      .where(
        and(
          eq(offers.propFirmId, firm.id),
          eq(offers.status, "published"),
          isNull(offers.deletedAt),
          or(isNull(offers.startsAt), sql`${offers.startsAt} <= now()`),
          or(isNull(offers.endsAt), sql`${offers.endsAt} > now()`),
        ),
      )
      .orderBy(asc(offers.displayOrder)),

    // Only whether a usable link EXISTS. The destination URL is deliberately
    // not selected — it never leaves the server.
    db
      .select({ id: affiliateLinks.id })
      .from(affiliateLinks)
      .where(
        and(
          eq(affiliateLinks.propFirmId, firm.id),
          eq(affiliateLinks.status, "active"),
          isNull(affiliateLinks.deletedAt),
          or(
            isNull(affiliateLinks.startsAt),
            sql`${affiliateLinks.startsAt} <= now()`,
          ),
          or(
            isNull(affiliateLinks.endsAt),
            sql`${affiliateLinks.endsAt} > now()`,
          ),
        ),
      )
      .limit(1),
  ]);

  return {
    id: firm.id,
    slug: firm.slug,
    name: firm.name,
    legalName: firm.legalName,
    tagline: firm.tagline,
    description: firm.description,
    logo:
      firm.logoUrl && firm.logoAlt
        ? {
            url: firm.logoUrl,
            alt: firm.logoAlt,
            width: firm.logoWidth,
            height: firm.logoHeight,
          }
        : null,
    foundedYear: firm.foundedYear,
    headquartersCountry: firm.headquartersCountry,
    headquartersCity: firm.headquartersCity,
    websiteUrl: firm.websiteUrl,
    supportEmail: firm.supportEmail,
    supportUrl: firm.supportUrl,
    payoutInfoUrl: firm.payoutInfoUrl,
    isVerified: firm.verificationStatus === "verified",
    verifiedAt: firm.verifiedAt?.toISOString() ?? null,
    publishedAt: firm.publishedAt?.toISOString() ?? null,
    updatedAt: firm.updatedAt.toISOString(),
    challenges: challengeRows.map(toViewChallenge),
    platforms: platformRows,
    instruments: instrumentRows,
    rules: ruleRows.map(toViewRule),
    offers: offerRows.map((o) => ({
      ...o,
      endsAt: o.endsAt?.toISOString() ?? null,
    })),
    hasAffiliateLink: affiliateRows.length > 0,
  };
}

export function toViewChallenge(c: {
  id: string;
  name: string;
  slug: string;
  challengeType: string;
  accountSize: string;
  accountCurrency: string;
  price: string | null;
  priceCurrency: string | null;
  profitTargetP1Pct: string | null;
  profitTargetP2Pct: string | null;
  profitTargetP3Pct: string | null;
  maxDailyLossPct: string | null;
  maxTotalDrawdownPct: string | null;
  drawdownType: string | null;
  drawdownBasis: string | null;
  minTradingDays: number | null;
  maxTradingDays: number | null;
  profitSplitPct: string | null;
  payoutFrequencyDays: number | null;
  firstPayoutDays: number | null;
  leverage: string | null;
  feeRefundable: boolean | null;
  hasScalingPlan: boolean | null;
}): FirmViewChallenge {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    challengeType: c.challengeType,
    accountSize: { amount: c.accountSize, currency: c.accountCurrency },
    // The pairing CHECK guarantees both are set or both null.
    price:
      c.price && c.priceCurrency
        ? { amount: c.price, currency: c.priceCurrency }
        : null,
    profitTargetP1Pct: c.profitTargetP1Pct,
    profitTargetP2Pct: c.profitTargetP2Pct,
    profitTargetP3Pct: c.profitTargetP3Pct,
    maxDailyLossPct: c.maxDailyLossPct,
    maxTotalDrawdownPct: c.maxTotalDrawdownPct,
    drawdownType: c.drawdownType,
    drawdownBasis: c.drawdownBasis,
    minTradingDays: c.minTradingDays,
    maxTradingDays: c.maxTradingDays,
    profitSplitPct: c.profitSplitPct,
    payoutFrequencyDays: c.payoutFrequencyDays,
    firstPayoutDays: c.firstPayoutDays,
    leverage: c.leverage,
    feeRefundable: c.feeRefundable,
    hasScalingPlan: c.hasScalingPlan,
  };
}

function toViewRule(r: {
  id: string;
  key: string;
  label: string;
  category: string;
  description: string | null;
  valueBoolean: boolean | null;
  valueNumeric: string | null;
  valueText: string | null;
  note: string | null;
  sourceUrl: string | null;
}): FirmViewRule {
  const { state, detail } = deriveRuleState(r);
  return {
    id: r.id,
    key: r.key,
    label: r.label,
    category: r.category,
    description: r.description,
    state,
    detail,
    note: r.note,
    sourceUrl: r.sourceUrl,
  };
}

/** Loads the raw published firm row for the draft materialiser to overlay. */
export async function getFirmRowForView(
  db: Database,
  id: string,
): Promise<FirmRow | null> {
  const rows = await db
    .select({
      id: propFirms.id,
      slug: propFirms.slug,
      name: propFirms.name,
      legalName: propFirms.legalName,
      tagline: propFirms.tagline,
      description: propFirms.description,
      foundedYear: propFirms.foundedYear,
      headquartersCountry: propFirms.headquartersCountry,
      headquartersCity: propFirms.headquartersCity,
      websiteUrl: propFirms.websiteUrl,
      supportEmail: propFirms.supportEmail,
      supportUrl: propFirms.supportUrl,
      payoutInfoUrl: propFirms.payoutInfoUrl,
      verificationStatus: propFirms.verificationStatus,
      verifiedAt: propFirms.verifiedAt,
      publishedAt: propFirms.publishedAt,
      updatedAt: propFirms.updatedAt,
      logoUrl: media.publicUrl,
      logoAlt: media.altText,
      logoWidth: media.width,
      logoHeight: media.height,
    })
    .from(propFirms)
    .leftJoin(media, eq(media.id, propFirms.logoMediaId))
    .where(and(eq(propFirms.id, id), isNull(propFirms.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}
