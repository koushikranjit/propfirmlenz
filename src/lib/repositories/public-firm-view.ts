import { and, asc, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import { resolveCouponCode } from "@/lib/offers/coupon";
import {
  affiliateLinks,
  challenges,
  firmAnnouncements,
  firmFaqs,
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
  yearsInOperation,
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

/**
 * Publicly addressable: published, live, AND actually nameable.
 *
 * Name and slug are nullable — no content field is required to publish
 * (docs/ADMIN.md §6.2). A firm missing either has no public page, because
 * `/prop-firms/{slug}` cannot address it and a nameless card is not a link
 * anyone can use. Filtering it out HERE is what lets `FirmView.name` and
 * `.slug` stay non-null everywhere downstream.
 */
const livePublished = and(
  eq(propFirms.status, "published"),
  isNull(propFirms.deletedAt),
  isNotNull(propFirms.slug),
  isNotNull(propFirms.name),
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
      foundedOn: propFirms.foundedOn,
      founderName: propFirms.founderName,
      ceoName: propFirms.ceoName,
      trustpilotRating: propFirms.trustpilotRating,
      trustpilotUrl: propFirms.trustpilotUrl,
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
  // Belt and braces: the WHERE excludes these, the guard proves it to TS.
  if (!firm || !isAddressable(firm)) return null;

  return assembleView(db, firm);
}

/** Narrows a row the `livePublished` filter has already excluded nulls from. */
function isAddressable<T extends { slug: string | null; name: string | null }>(
  row: T,
): row is T & { slug: string; name: string } {
  return row.slug !== null && row.name !== null;
}

type FirmRow = {
  id: string;
  slug: string;
  name: string;
  legalName: string | null;
  tagline: string | null;
  description: string | null;
  foundedYear: number | null;
  foundedOn: string | null;
  founderName: string | null;
  ceoName: string | null;
  trustpilotRating: string | null;
  trustpilotUrl: string | null;
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
    announcementRows,
    faqRows,
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

    // Newest first: an announcement's value decays, unlike a challenge's.
    db
      .select({
        id: firmAnnouncements.id,
        title: firmAnnouncements.title,
        body: firmAnnouncements.body,
        linkUrl: firmAnnouncements.linkUrl,
        announcedAt: firmAnnouncements.announcedAt,
      })
      .from(firmAnnouncements)
      .where(
        and(
          eq(firmAnnouncements.propFirmId, firm.id),
          eq(firmAnnouncements.isActive, true),
          isNull(firmAnnouncements.deletedAt),
        ),
      )
      .orderBy(desc(firmAnnouncements.announcedAt))
      .limit(20),

    db
      .select({
        id: firmFaqs.id,
        question: firmFaqs.question,
        answer: firmFaqs.answer,
      })
      .from(firmFaqs)
      .where(
        and(
          eq(firmFaqs.propFirmId, firm.id),
          eq(firmFaqs.isActive, true),
          isNull(firmFaqs.deletedAt),
        ),
      )
      .orderBy(asc(firmFaqs.displayOrder), asc(firmFaqs.question)),
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
    foundedOn: firm.foundedOn,
    // Derived here so every consumer — page, preview, tests — agrees.
    yearsInOperation: yearsInOperation(firm.foundedOn),
    founderName: firm.founderName,
    ceoName: firm.ceoName,
    trustpilotRating: firm.trustpilotRating,
    trustpilotUrl: firm.trustpilotUrl,
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
    // The coupon code is resolved HERE, in the data layer, so the profile, the
    // admin preview and /offers all receive the same value and none of them
    // spells the default out for itself. A stored code always wins; this only
    // fills the gap where none was entered.
    offers: offerRows.map((o) => ({
      ...o,
      code: resolveCouponCode(o.code),
      endsAt: o.endsAt?.toISOString() ?? null,
    })),
    announcements: announcementRows.map((a) => ({
      ...a,
      announcedAt: a.announcedAt.toISOString(),
    })),
    faqs: faqRows,
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
      foundedOn: propFirms.foundedOn,
      founderName: propFirms.founderName,
      ceoName: propFirms.ceoName,
      trustpilotRating: propFirms.trustpilotRating,
      trustpilotUrl: propFirms.trustpilotUrl,
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

  const row = rows[0];
  if (!row) return null;
  // The ADMIN preview may be looking at a firm with no name or slug yet, which
  // is legal now. The view model still needs strings, so absence becomes an
  // empty string HERE and nowhere else — it is never written back, and the
  // preview route refuses to render a profile for it (docs/ADMIN.md §6.2).
  return { ...row, slug: row.slug ?? "", name: row.name ?? "" };
}
