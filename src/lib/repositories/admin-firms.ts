import {
  and,
  asc,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import {
  affiliateClicks,
  challenges,
  media,
  offers,
  propFirms,
} from "@/lib/db/schema";
import type { FirmListQuery } from "@/lib/validation/firm";

/**
 * ADMIN firm repository — docs/ADMIN.md §5.
 *
 * Separate from the public repository by design. This one MAY read
 * administrative fields (status, completeness, draft presence). It is only ever
 * reached from routes that have already passed `requireAdminPermission`.
 *
 * Every query is paginated server-side; the full table is never shipped to the
 * browser (docs/ADMIN.md §5 `[LOCKED]`).
 */

export interface AdminFirmRow {
  id: string;
  slug: string;
  name: string;
  logoMediaId: string | null;
  headquartersCountry: string | null;
  status: string;
  verificationStatus: string;
  verifiedAt: Date | null;
  hasDraft: boolean;
  dataCompletenessScore: number | null;
  challengeCount: number;
  activeOfferCount: number;
  /** Real, from affiliate_clicks. Bot and internal traffic excluded. */
  affiliateClickCount: number;
  hasAffiliateLink: boolean;
  updatedAt: Date;
}

export interface AdminFirmListResult {
  rows: AdminFirmRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/**
 * NOTE on Rating and Review Count:
 *
 * `prop_firms` deliberately has NO rating or review_count columns — those are
 * Phase 3 derived values, and creating them early is an invitation to fill them
 * with a guess (docs/DATABASE.md §5.1 `[LOCKED]`). The admin list therefore
 * renders an honest empty state for those columns rather than a number.
 */

const SORTABLE = {
  name: propFirms.name,
  status: propFirms.status,
  updatedAt: propFirms.updatedAt,
  createdAt: propFirms.createdAt,
  country: propFirms.headquartersCountry,
} as const;

export async function listAdminFirms(
  db: Database,
  query: FirmListQuery,
): Promise<AdminFirmListResult> {
  const filters = [isNull(propFirms.deletedAt)];

  if (query.search) {
    // Parameterised by Drizzle — never string-concatenated.
    const pattern = `%${query.search}%`;
    const match = or(
      ilike(propFirms.name, pattern),
      ilike(propFirms.slug, pattern),
      ilike(propFirms.legalName, pattern),
    );
    if (match) filters.push(match);
  }
  if (query.status) filters.push(eq(propFirms.status, query.status));
  if (query.verification) {
    filters.push(eq(propFirms.verificationStatus, query.verification));
  }
  if (query.hasDraft === true) filters.push(isNotNull(propFirms.draftPayload));
  if (query.hasDraft === false) filters.push(isNull(propFirms.draftPayload));

  const where = and(...filters);
  const column = SORTABLE[query.sort];
  const orderBy = query.direction === "asc" ? asc(column) : desc(column);

  const offset = (query.page - 1) * query.pageSize;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: propFirms.id,
        slug: propFirms.slug,
        name: propFirms.name,
        logoMediaId: propFirms.logoMediaId,
        headquartersCountry: propFirms.headquartersCountry,
        status: propFirms.status,
        verificationStatus: propFirms.verificationStatus,
        verifiedAt: propFirms.verifiedAt,
        hasDraft: sql<boolean>`(${propFirms.draftPayload} is not null)`,
        dataCompletenessScore: propFirms.dataCompletenessScore,
        updatedAt: propFirms.updatedAt,
        challengeCount: sql<number>`(
          select count(*)::int from "challenges"
          where "challenges"."prop_firm_id" = "prop_firms"."id"
            and "challenges"."deleted_at" is null
        )`,
        activeOfferCount: sql<number>`(
          select count(*)::int from "offers"
          where "offers"."prop_firm_id" = "prop_firms"."id"
            and "offers"."deleted_at" is null
            and "offers"."status" = 'published'
            and ("offers"."starts_at" is null or "offers"."starts_at" <= now())
            and ("offers"."ends_at" is null or "offers"."ends_at" > now())
        )`,
        affiliateClickCount: sql<number>`(
          select count(*)::int from "affiliate_clicks"
          where "affiliate_clicks"."prop_firm_id" = "prop_firms"."id"
            and not "affiliate_clicks"."is_bot"
            and not "affiliate_clicks"."is_internal"
        )`,
        hasAffiliateLink: sql<boolean>`exists (
          select 1 from "affiliate_links"
          where "affiliate_links"."prop_firm_id" = "prop_firms"."id"
            and "affiliate_links"."deleted_at" is null
            and "affiliate_links"."status" = 'active'
        )`,
      })
      .from(propFirms)
      .where(where)
      .orderBy(orderBy)
      .limit(query.pageSize)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(propFirms)
      .where(where),
  ]);

  const total = totalRows[0]?.n ?? 0;

  return {
    rows,
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/**
 * Loads a firm for the admin workspace BY ID.
 *
 * Admin routes are id-keyed so a slug rename mid-draft cannot break an open
 * workspace, preview, or deep link (docs/ARCHITECTURE.md §22 `[LOCKED]`).
 *
 * Returns null for a soft-deleted firm — deletion is a real state, not a 500.
 */
export async function getAdminFirmById(db: Database, id: string) {
  const rows = await db
    .select()
    .from(propFirms)
    .where(and(eq(propFirms.id, id), isNull(propFirms.deletedAt)))
    .limit(1);
  const firm = rows[0];
  if (!firm) return null;

  // The logo's URL and alt text, so the editor can show what is attached
  // rather than only that something is. Left-joined separately because the
  // select above is the whole row and Drizzle cannot alias a join into it.
  const logoRows = firm.logoMediaId
    ? await db
        .select({ url: media.publicUrl, alt: media.altText })
        .from(media)
        .where(eq(media.id, firm.logoMediaId))
        .limit(1)
    : [];
  const logo = logoRows[0];

  return {
    ...firm,
    logoUrl: logo?.url ?? null,
    logoAlt: logo?.alt ?? null,
  };
}

export interface FirmClickStats {
  /** Genuine outbound clicks: bots and internal traffic excluded. */
  clicks: number;
  /** Rows that WERE recorded but are excluded above, so nothing is hidden. */
  excluded: number;
  last30Days: number;
  lastClickAt: Date | null;
}

/**
 * Buy-link click counts for one firm — docs/DATABASE.md §5.10a.
 *
 * Counted from `affiliate_clicks`, live. There is no cached total and no
 * estimate: a click figure that cannot be recomputed from rows is a figure
 * nobody can check (CLAUDE.md §3).
 *
 * BOTS AND INTERNAL TRAFFIC ARE EXCLUDED FROM THE HEADLINE `[LOCKED]`.
 * Reporting them as trader interest would overstate exactly the number an
 * affiliate decision gets made on. They are returned separately rather than
 * dropped, because "12 clicks, 40 filtered" and "12 clicks" are different
 * facts and the second one hides a signal worth seeing.
 */
export async function getFirmClickStats(
  db: Database,
  firmId: string,
): Promise<FirmClickStats> {
  const genuine = sql`not ${affiliateClicks.isBot} and not ${affiliateClicks.isInternal}`;

  const rows = await db
    .select({
      clicks: sql<number>`count(*) filter (where ${genuine})::int`,
      excluded: sql<number>`count(*) filter (where not (${genuine}))::int`,
      last30Days: sql<number>`count(*) filter (where ${genuine} and ${affiliateClicks.clickedAt} > now() - interval '30 days')::int`,
      lastClickAt: sql<Date | null>`max(${affiliateClicks.clickedAt}) filter (where ${genuine})`,
    })
    .from(affiliateClicks)
    .where(eq(affiliateClicks.propFirmId, firmId));

  return (
    rows[0] ?? { clicks: 0, excluded: 0, last30Days: 0, lastClickAt: null }
  );
}

/** Dashboard counts. Real queries — never a hard-coded or estimated figure. */
export async function getAdminCounts(db: Database) {
  const [firmRows, draftRows, challengeRows, offerRows] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        published: sql<number>`count(*) filter (where ${propFirms.status} = 'published')::int`,
        draft: sql<number>`count(*) filter (where ${propFirms.status} = 'draft')::int`,
        needsVerification: sql<number>`count(*) filter (where ${propFirms.verificationStatus} <> 'verified')::int`,
      })
      .from(propFirms)
      .where(isNull(propFirms.deletedAt)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(propFirms)
      .where(
        and(isNotNull(propFirms.draftPayload), isNull(propFirms.deletedAt)),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(challenges)
      .where(isNull(challenges.deletedAt)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(offers)
      .where(and(isNull(offers.deletedAt), eq(offers.status, "published"))),
  ]);

  return {
    firms: firmRows[0]?.total ?? 0,
    published: firmRows[0]?.published ?? 0,
    drafts: firmRows[0]?.draft ?? 0,
    needsVerification: firmRows[0]?.needsVerification ?? 0,
    pendingDrafts: draftRows[0]?.n ?? 0,
    challenges: challengeRows[0]?.n ?? 0,
    activeOffers: offerRows[0]?.n ?? 0,
  };
}
