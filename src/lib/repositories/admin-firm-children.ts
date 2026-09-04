import { and, asc, eq, isNull } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import {
  affiliateLinks,
  challenges,
  firmInstruments,
  firmPlatforms,
  instruments,
  offers,
  platforms,
  ruleValues,
  rules,
  seoMetadata,
} from "@/lib/db/schema";

/**
 * ADMIN firm children repository — docs/ADMIN.md §6.
 *
 * The counterpart to `public-firm-view.ts`: this one is allowed to read the
 * fields an admin needs and the public must never see — an affiliate link's
 * destination URL, an unpublished challenge, a paused link's status.
 *
 * It is reachable ONLY from `(admin)` routes, all of which enforce
 * `requireAdminPermission` server-side. Nothing here is imported by
 * `components/public/**` (an ESLint rule forbids the reverse edge, and the
 * public repositories are a separate module).
 *
 * These are the PUBLISHED rows. Pending edits live in `draft_payload` and are
 * layered on top by the editor, so an admin sees "published + staged" without
 * either being written into the other.
 */

export interface AdminChallenge {
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
  displayOrder: number;
  status: string;
}

export interface AdminRuleValue {
  id: string;
  ruleId: string;
  valueBoolean: boolean | null;
  valueNumeric: string | null;
  valueText: string | null;
  note: string | null;
  sourceUrl: string | null;
}

export interface AdminOffer {
  id: string;
  title: string;
  description: string | null;
  terms: string | null;
  code: string | null;
  discountType: string | null;
  discountValue: string | null;
  discountCurrency: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  affiliateLinkId: string | null;
  displayOrder: number;
}

/**
 * ADMIN-ONLY. `destinationUrl` appears here and NOWHERE in any public view
 * model — `FirmView` carries only `hasAffiliateLink: boolean`
 * (docs/ARCHITECTURE.md §11 `[LOCKED]`).
 */
export interface AdminAffiliateLink {
  id: string;
  label: string;
  destinationUrl: string;
  network: string | null;
  campaign: string | null;
  isDefault: boolean;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
}

export interface AdminSeoMetadata {
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  robotsIndex: boolean;
  robotsFollow: boolean;
  includeInSitemap: boolean;
  keywords: string[] | null;
}

export interface AdminFirmChildren {
  challenges: AdminChallenge[];
  ruleValues: AdminRuleValue[];
  platformIds: {
    platformId: string;
    isPrimary: boolean;
    notes: string | null;
  }[];
  instrumentIds: {
    instrumentId: string;
    isAllowed: boolean;
    notes: string | null;
  }[];
  offers: AdminOffer[];
  affiliateLinks: AdminAffiliateLink[];
  seo: AdminSeoMetadata | null;
}

const iso = (value: Date | null) => value?.toISOString() ?? null;

/** Everything the editor needs for one firm, in one round of parallel queries. */
export async function getAdminFirmChildren(
  db: Database,
  firmId: string,
): Promise<AdminFirmChildren> {
  const [
    challengeRows,
    ruleValueRows,
    platformRows,
    instrumentRows,
    offerRows,
    affiliateRows,
    seoRows,
  ] = await Promise.all([
    db
      .select()
      .from(challenges)
      .where(
        and(eq(challenges.propFirmId, firmId), isNull(challenges.deletedAt)),
      )
      .orderBy(asc(challenges.displayOrder), asc(challenges.name)),

    db
      .select({
        id: ruleValues.id,
        ruleId: ruleValues.ruleId,
        valueBoolean: ruleValues.valueBoolean,
        valueNumeric: ruleValues.valueNumeric,
        valueText: ruleValues.valueText,
        note: ruleValues.note,
        sourceUrl: ruleValues.sourceUrl,
      })
      .from(ruleValues)
      .where(
        and(eq(ruleValues.propFirmId, firmId), eq(ruleValues.scope, "firm")),
      ),

    db
      .select({
        platformId: firmPlatforms.platformId,
        isPrimary: firmPlatforms.isPrimary,
        notes: firmPlatforms.notes,
      })
      .from(firmPlatforms)
      .where(eq(firmPlatforms.propFirmId, firmId)),

    db
      .select({
        instrumentId: firmInstruments.instrumentId,
        isAllowed: firmInstruments.isAllowed,
        notes: firmInstruments.notes,
      })
      .from(firmInstruments)
      .where(eq(firmInstruments.propFirmId, firmId)),

    db
      .select()
      .from(offers)
      .where(and(eq(offers.propFirmId, firmId), isNull(offers.deletedAt)))
      .orderBy(asc(offers.displayOrder), asc(offers.title)),

    db
      .select()
      .from(affiliateLinks)
      .where(
        and(
          eq(affiliateLinks.propFirmId, firmId),
          isNull(affiliateLinks.deletedAt),
        ),
      )
      .orderBy(asc(affiliateLinks.label)),

    db
      .select()
      .from(seoMetadata)
      .where(
        and(
          eq(seoMetadata.entityType, "prop_firm"),
          eq(seoMetadata.entityId, firmId),
        ),
      )
      .limit(1),
  ]);

  const seoRow = seoRows[0];

  return {
    challenges: challengeRows.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      challengeType: c.challengeType,
      accountSize: c.accountSize,
      accountCurrency: c.accountCurrency,
      price: c.price,
      priceCurrency: c.priceCurrency,
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
      displayOrder: c.displayOrder,
      status: c.status,
    })),
    ruleValues: ruleValueRows,
    platformIds: platformRows,
    instrumentIds: instrumentRows,
    offers: offerRows.map((o) => ({
      id: o.id,
      title: o.title,
      description: o.description,
      terms: o.terms,
      code: o.code,
      discountType: o.discountType,
      discountValue: o.discountValue,
      discountCurrency: o.discountCurrency,
      startsAt: iso(o.startsAt),
      endsAt: iso(o.endsAt),
      status: o.status,
      affiliateLinkId: o.affiliateLinkId,
      displayOrder: o.displayOrder,
    })),
    affiliateLinks: affiliateRows.map((a) => ({
      id: a.id,
      label: a.label,
      destinationUrl: a.destinationUrl,
      network: a.network,
      campaign: a.campaign,
      isDefault: a.isDefault,
      status: a.status,
      startsAt: iso(a.startsAt),
      endsAt: iso(a.endsAt),
      // `commissionNotes` is deliberately not surfaced by the editor: it is
      // commercial detail with no bearing on the data being published, and
      // keeping it out of the form keeps it out of every snapshot and log.
    })),
    seo: seoRow
      ? {
          title: seoRow.title,
          metaDescription: seoRow.metaDescription,
          canonicalUrl: seoRow.canonicalUrl,
          ogTitle: seoRow.ogTitle,
          ogDescription: seoRow.ogDescription,
          robotsIndex: seoRow.robotsIndex,
          robotsFollow: seoRow.robotsFollow,
          includeInSitemap: seoRow.includeInSitemap,
          keywords: seoRow.keywords,
        }
      : null,
  };
}

export interface CatalogOption {
  id: string;
  name: string;
  slug: string;
}

export interface RuleOption {
  id: string;
  key: string;
  label: string;
  category: string;
  dataType: string;
  description: string | null;
}

export interface AdminCatalog {
  platforms: CatalogOption[];
  instruments: (CatalogOption & { assetClass: string })[];
  rules: RuleOption[];
}

/**
 * The canonical catalog an admin picks FROM.
 *
 * Platforms, instruments and rules are shared vocabulary (docs/PROJECT.md §6.2
 * `[LOCKED]`): a firm is associated with an existing record by id, never by
 * typing a free-text name. Two firms writing "MetaTrader 5" and "MT5" would
 * silently become two different platforms and break every filter built on them.
 *
 * Creating new catalog records is a separate, `catalog:manage` concern and is
 * not part of the firm editor.
 */
export async function getAdminCatalog(db: Database): Promise<AdminCatalog> {
  const [platformRows, instrumentRows, ruleRows] = await Promise.all([
    db
      .select({ id: platforms.id, name: platforms.name, slug: platforms.slug })
      .from(platforms)
      .where(eq(platforms.status, "published"))
      .orderBy(asc(platforms.displayOrder), asc(platforms.name)),

    db
      .select({
        id: instruments.id,
        name: instruments.name,
        slug: instruments.slug,
        assetClass: instruments.assetClass,
      })
      .from(instruments)
      .where(eq(instruments.status, "published"))
      .orderBy(asc(instruments.displayOrder), asc(instruments.name)),

    db
      .select({
        id: rules.id,
        key: rules.key,
        label: rules.label,
        category: rules.category,
        dataType: rules.dataType,
        description: rules.description,
      })
      .from(rules)
      .where(eq(rules.status, "published"))
      .orderBy(asc(rules.displayOrder), asc(rules.label)),
  ]);

  return {
    platforms: platformRows,
    instruments: instrumentRows,
    rules: ruleRows,
  };
}
