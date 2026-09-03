import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import { challenges, propFirms } from "@/lib/db/schema";

/**
 * PUBLIC firm repository — docs/ARCHITECTURE.md §3.1, §21.2.
 *
 * HARD RULES `[LOCKED]`:
 *
 *  1. This module NEVER selects `draft_payload`. The explicit column lists below
 *     are the mechanism: draft data is STRUCTURALLY unable to leak, rather than
 *     being filtered out by a predicate somebody might forget.
 *  2. `PublicFirm` does not contain a draft field, so a leak would be a compile
 *     error, not a silent runtime exposure.
 *  3. Every query filters `status = 'published' AND deleted_at IS NULL`.
 *  4. Admin-only fields (commission notes, internal notes, audit trail,
 *     credentials, verification actor) are never selected here.
 */

/** The public view of a firm. Deliberately has NO draft field. */
export interface PublicFirm {
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
  logoMediaId: string | null;
  coverMediaId: string | null;
  brandColor: string | null;
  /** Shown publicly as "Last verified {date}" (docs/PROJECT.md §7). */
  verifiedAt: Date | null;
  isVerified: boolean;
  publishedAt: Date | null;
  updatedAt: Date;
}

export interface PublicChallenge {
  id: string;
  propFirmId: string;
  name: string;
  slug: string;
  challengeType: string;
  /** Money keeps its own source currency. Never converted (docs/ARCHITECTURE.md §18). */
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
  /** null means UNLIMITED — the UI must say so, never render 0. */
  maxTradingDays: number | null;
  profitSplitPct: string | null;
  payoutFrequencyDays: number | null;
  firstPayoutDays: number | null;
  leverage: string | null;
  feeRefundable: boolean | null;
  hasScalingPlan: boolean | null;
  displayOrder: number;
}

/**
 * The public column list. Note the absence of: draftPayload, createdByAdminId,
 * updatedByAdminId, verifiedByAdminId, dataCompletenessScore, status.
 */
const publicFirmColumns = {
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
  logoMediaId: propFirms.logoMediaId,
  coverMediaId: propFirms.coverMediaId,
  brandColor: propFirms.brandColor,
  verifiedAt: propFirms.verifiedAt,
  verificationStatus: propFirms.verificationStatus,
  publishedAt: propFirms.publishedAt,
  updatedAt: propFirms.updatedAt,
} as const;

const publicChallengeColumns = {
  id: challenges.id,
  propFirmId: challenges.propFirmId,
  name: challenges.name,
  slug: challenges.slug,
  challengeType: challenges.challengeType,
  accountSize: challenges.accountSize,
  accountCurrency: challenges.accountCurrency,
  price: challenges.price,
  priceCurrency: challenges.priceCurrency,
  profitTargetP1Pct: challenges.profitTargetP1Pct,
  profitTargetP2Pct: challenges.profitTargetP2Pct,
  profitTargetP3Pct: challenges.profitTargetP3Pct,
  maxDailyLossPct: challenges.maxDailyLossPct,
  maxTotalDrawdownPct: challenges.maxTotalDrawdownPct,
  drawdownType: challenges.drawdownType,
  drawdownBasis: challenges.drawdownBasis,
  minTradingDays: challenges.minTradingDays,
  maxTradingDays: challenges.maxTradingDays,
  profitSplitPct: challenges.profitSplitPct,
  payoutFrequencyDays: challenges.payoutFrequencyDays,
  firstPayoutDays: challenges.firstPayoutDays,
  leverage: challenges.leverage,
  feeRefundable: challenges.feeRefundable,
  hasScalingPlan: challenges.hasScalingPlan,
  displayOrder: challenges.displayOrder,
} as const;

/** Published AND not soft-deleted. Applied to every public query, always. */
const livePublished = and(
  eq(propFirms.status, "published"),
  isNull(propFirms.deletedAt),
);

function toPublicFirm(row: {
  verificationStatus: string;
  [k: string]: unknown;
}): PublicFirm {
  const { verificationStatus, ...rest } = row;
  return {
    ...(rest as Omit<PublicFirm, "isVerified">),
    isVerified: verificationStatus === "verified",
  };
}

export async function getPublishedFirmBySlug(
  db: Database,
  slug: string,
): Promise<PublicFirm | null> {
  const rows = await db
    .select(publicFirmColumns)
    .from(propFirms)
    .where(and(eq(propFirms.slug, slug), livePublished))
    .limit(1);

  const row = rows[0];
  return row ? toPublicFirm(row) : null;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
}

/** Paginated. Never unbounded (docs/CLAUDE.md §7). */
export async function listPublishedFirms(
  db: Database,
  { limit = 50, offset = 0 }: ListOptions = {},
): Promise<PublicFirm[]> {
  const rows = await db
    .select(publicFirmColumns)
    .from(propFirms)
    .where(livePublished)
    .orderBy(asc(propFirms.displayOrder), asc(propFirms.name))
    .limit(Math.min(limit, 100))
    .offset(offset);

  return rows.map(toPublicFirm);
}

export async function countPublishedFirms(db: Database): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(propFirms)
    .where(livePublished);
  return rows[0]?.n ?? 0;
}

/** Published challenges for a published firm. */
export async function listPublishedChallenges(
  db: Database,
  propFirmId: string,
): Promise<PublicChallenge[]> {
  return db
    .select(publicChallengeColumns)
    .from(challenges)
    .where(
      and(
        eq(challenges.propFirmId, propFirmId),
        eq(challenges.status, "published"),
        isNull(challenges.deletedAt),
      ),
    )
    .orderBy(asc(challenges.displayOrder), asc(challenges.name));
}

/** Slugs for the sitemap. Drafts and deleted rows are excluded by construction. */
export async function listPublishedFirmSlugs(
  db: Database,
): Promise<{ slug: string; updatedAt: Date }[]> {
  return db
    .select({ slug: propFirms.slug, updatedAt: propFirms.updatedAt })
    .from(propFirms)
    .where(livePublished)
    .orderBy(asc(propFirms.slug));
}
