import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import {
  challenges,
  firmPlatforms,
  media,
  platforms,
  propFirms,
} from "@/lib/db/schema";
import type { FirmViewImage, FirmViewMoney } from "@/lib/view/firm-view";

/**
 * PUBLIC firm DIRECTORY repository — docs/ARCHITECTURE.md §3.1, docs/SEO.md §3.2.
 *
 * SCOPE: the `/prop-firms` index and the sitemap. The full firm profile is
 * assembled by `public-firm-view.ts`, which owns the canonical `FirmView`.
 * There is deliberately no second detail shape here: one profile view model,
 * one assembly path (docs/ARCHITECTURE.md §21.2 `[LOCKED]`).
 *
 * HARD RULES `[LOCKED]`:
 *
 *  1. `draft_payload` is NEVER selected. The explicit column lists below are the
 *     mechanism: draft data is STRUCTURALLY unable to leak rather than filtered
 *     out by a predicate somebody might forget.
 *  2. `FirmSummary` has no draft field, so a leak is a compile error.
 *  3. Every query filters `status = 'published' AND deleted_at IS NULL`.
 *  4. Admin-only data (internal notes, audit trail, completeness score,
 *     verification actor, affiliate destinations) is never selected here.
 */

/** A directory card. Deliberately smaller than `FirmView` — a list is not a profile. */
export interface FirmSummary {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logo: FirmViewImage | null;
  foundedYear: number | null;
  headquartersCountry: string | null;
  isVerified: boolean;
  verifiedAt: string | null;
  updatedAt: string;
  challengeCount: number;
  /**
   * The cheapest published challenge price — supplied ONLY when every one of
   * the firm's published prices shares a single source currency. Across mixed
   * currencies a "from" figure would present an unconverted minimum as if it
   * were like-for-like, which is a data-integrity defect
   * (docs/ARCHITECTURE.md §18.3, CLAUDE.md §12.4c rule 24 `[LOCKED]`).
   */
  priceFrom: FirmViewMoney | null;
  /** True when prices span currencies, so the UI can say so instead of guessing. */
  hasMixedPriceCurrencies: boolean;
}

/**
 * The public column list. Note the absence of: draftPayload, status,
 * dataCompletenessScore, createdByAdminId, updatedByAdminId, verifiedByAdminId.
 */
const summaryColumns = {
  id: propFirms.id,
  slug: propFirms.slug,
  name: propFirms.name,
  tagline: propFirms.tagline,
  foundedYear: propFirms.foundedYear,
  headquartersCountry: propFirms.headquartersCountry,
  verificationStatus: propFirms.verificationStatus,
  verifiedAt: propFirms.verifiedAt,
  updatedAt: propFirms.updatedAt,
  logoUrl: media.publicUrl,
  logoAlt: media.altText,
  logoWidth: media.width,
  logoHeight: media.height,
} as const;

/** Published AND not soft-deleted. Applied to every public query, always. */
const livePublished = and(
  eq(propFirms.status, "published"),
  isNull(propFirms.deletedAt),
  // No slug, no public page — see public-firm-view.ts.
  isNotNull(propFirms.slug),
  isNotNull(propFirms.name),
);

export interface FirmDirectoryFilters {
  /** Free-text name match. Backed by the `prop_firms_name_trgm_idx` GIN index. */
  q?: string | undefined;
  /** ISO 3166-1 alpha-2. */
  country?: string | undefined;
  /** Platform slug — firms supporting it. */
  platform?: string | undefined;
  verifiedOnly?: boolean | undefined;
}

/**
 * `recently_verified` orders by the real `verified_at` timestamp an admin wrote
 * when they checked the firm's data against its published sources. It is NOT
 * `updated_at`, which changes for unrelated reasons and would misrepresent an
 * edit as a verification (docs/PROJECT.md §6.6 `[LOCKED]`).
 */
export type FirmDirectorySort =
  "featured" | "name" | "newest" | "recently_verified";

export interface FirmDirectoryQuery extends FirmDirectoryFilters {
  sort?: FirmDirectorySort | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

/** LIKE metacharacters are literal in a search box, not wildcards. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function buildFilters(filters: FirmDirectoryFilters) {
  const clauses = [livePublished];

  if (filters.q) {
    clauses.push(ilike(propFirms.name, `%${escapeLike(filters.q)}%`));
  }
  if (filters.country) {
    clauses.push(eq(propFirms.headquartersCountry, filters.country));
  }
  if (filters.verifiedOnly) {
    clauses.push(eq(propFirms.verificationStatus, "verified"));
  }
  if (filters.platform) {
    // A parameterised subquery — never string-concatenated SQL (CLAUDE.md §6).
    clauses.push(
      inArray(
        propFirms.id,
        sql`(select ${firmPlatforms.propFirmId}
             from ${firmPlatforms}
             join ${platforms} on ${platforms.id} = ${firmPlatforms.platformId}
             where ${platforms.slug} = ${filters.platform}
               and ${platforms.status} = 'published')`,
      ),
    );
  }

  return and(...clauses);
}

export const DIRECTORY_PAGE_SIZE = 24;

/**
 * One page of the directory. Never unbounded (CLAUDE.md §7).
 *
 * Challenge aggregates are fetched in a SECOND query keyed by the page's firm
 * ids, not per row — no N+1, and no correlated subquery to mis-qualify.
 */

/** Narrows a row the `livePublished` filter has already excluded nulls from. */
function isAddressable<T extends { slug: string | null; name: string | null }>(
  row: T,
): row is T & { slug: string; name: string } {
  return row.slug !== null && row.name !== null;
}

export async function listPublishedFirmSummaries(
  db: Database,
  query: FirmDirectoryQuery = {},
): Promise<FirmSummary[]> {
  const pageSize = Math.min(
    Math.max(query.pageSize ?? DIRECTORY_PAGE_SIZE, 1),
    100,
  );
  const page = Math.max(query.page ?? 1, 1);

  const order =
    query.sort === "name"
      ? [asc(propFirms.name)]
      : query.sort === "newest"
        ? [desc(propFirms.publishedAt), asc(propFirms.name)]
        : query.sort === "recently_verified"
          ? [desc(propFirms.verifiedAt), asc(propFirms.name)]
          : [
              desc(propFirms.isFeatured),
              asc(propFirms.displayOrder),
              asc(propFirms.name),
            ];

  const rows = await db
    .select(summaryColumns)
    .from(propFirms)
    .leftJoin(media, eq(media.id, propFirms.logoMediaId))
    .where(buildFilters(query))
    .orderBy(...order)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  if (rows.length === 0) return [];

  const stats = await challengeStats(
    db,
    rows.map((r) => r.id),
  );

  return rows.filter(isAddressable).map((row) => {
    const stat = stats.get(row.id);
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      tagline: row.tagline,
      logo:
        row.logoUrl && row.logoAlt
          ? {
              url: row.logoUrl,
              alt: row.logoAlt,
              width: row.logoWidth,
              height: row.logoHeight,
            }
          : null,
      foundedYear: row.foundedYear,
      headquartersCountry: row.headquartersCountry,
      isVerified: row.verificationStatus === "verified",
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      challengeCount: stat?.challengeCount ?? 0,
      priceFrom:
        stat && stat.currencyCount === 1 && stat.minPrice && stat.currency
          ? { amount: stat.minPrice, currency: stat.currency }
          : null,
      hasMixedPriceCurrencies: (stat?.currencyCount ?? 0) > 1,
    };
  });
}

interface ChallengeStat {
  challengeCount: number;
  minPrice: string | null;
  currency: string | null;
  currencyCount: number;
}

/** Per-firm published challenge aggregates for one page of results. */
async function challengeStats(
  db: Database,
  firmIds: string[],
): Promise<Map<string, ChallengeStat>> {
  const rows = await db
    .select({
      propFirmId: challenges.propFirmId,
      challengeCount: sql<number>`count(*)::int`,
      minPrice: sql<string | null>`min(${challenges.price})::text`,
      currency: sql<string | null>`min(${challenges.priceCurrency})`,
      currencyCount: sql<number>`count(distinct ${challenges.priceCurrency})::int`,
    })
    .from(challenges)
    .where(
      and(
        inArray(challenges.propFirmId, firmIds),
        eq(challenges.status, "published"),
        isNull(challenges.deletedAt),
      ),
    )
    .groupBy(challenges.propFirmId);

  return new Map(rows.map((r) => [r.propFirmId, r]));
}

export async function countPublishedFirms(
  db: Database,
  filters: FirmDirectoryFilters = {},
): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(propFirms)
    .where(buildFilters(filters));
  return rows[0]?.n ?? 0;
}

/**
 * Sitemap entries. `lastmod` is the entity's real `updated_at` — never `now()`
 * (docs/SEO.md §14 `[LOCKED]`). Drafts and deleted rows are excluded by
 * construction, not by a downstream filter.
 */
export async function listPublishedFirmSlugs(
  db: Database,
): Promise<{ slug: string; updatedAt: Date }[]> {
  const rows = await db
    .select({ slug: propFirms.slug, updatedAt: propFirms.updatedAt })
    .from(propFirms)
    .where(livePublished)
    .orderBy(asc(propFirms.slug));

  // A firm with no slug has no URL, so it is not a sitemap entry.
  return rows.filter(
    (r): r is { slug: string; updatedAt: Date } => r.slug !== null,
  );
}

/**
 * Platform facets — each with the number of PUBLISHED firms that support it.
 *
 * Powers the homepage's browse-by pathways. Every entry maps to a directory
 * filter that already exists (`/prop-firms?platform={slug}`), so no link can
 * point at an unbuilt route, and the count is computed from stored rows rather
 * than asserted (CLAUDE.md §3).
 */
export interface PlatformFacet {
  name: string;
  slug: string;
  firmCount: number;
}

export async function listPublishedPlatformFacets(
  db: Database,
  limit = 8,
): Promise<PlatformFacet[]> {
  return db
    .select({
      name: platforms.name,
      slug: platforms.slug,
      firmCount: sql<number>`count(distinct ${propFirms.id})::int`,
    })
    .from(platforms)
    .innerJoin(firmPlatforms, eq(firmPlatforms.platformId, platforms.id))
    .innerJoin(propFirms, eq(propFirms.id, firmPlatforms.propFirmId))
    .where(and(eq(platforms.status, "published"), livePublished))
    .groupBy(platforms.id, platforms.name, platforms.slug)
    .orderBy(desc(sql`count(distinct ${propFirms.id})`), asc(platforms.name))
    .limit(Math.min(Math.max(limit, 1), 24));
}

/** Country facets for the directory filter, computed from published rows only. */
export async function listPublishedFirmCountries(
  db: Database,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ country: propFirms.headquartersCountry })
    .from(propFirms)
    .where(
      and(livePublished, sql`${propFirms.headquartersCountry} is not null`),
    )
    .orderBy(asc(propFirms.headquartersCountry));

  return rows.flatMap((r) => (r.country ? [r.country] : []));
}
