import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import { affiliateClicks, affiliateLinks, propFirms } from "@/lib/db/schema";
import { hashIdentifier } from "@/lib/auth/session";

/**
 * Affiliate click tracking — docs/ARCHITECTURE.md §11, docs/DATABASE.md §5.10.
 *
 *   user -> /go/{firm-slug} -> record click -> 302 to the external URL
 *
 * Rules `[LOCKED]`:
 *  - 302, NEVER 301. Destinations change; a cached 301 is unrecoverable.
 *  - Raw IP / user-agent are never stored — salted SHA-256 only.
 *  - If no active link exists, 404. Never redirect to a guessed destination.
 *  - Conversions are NEVER modelled or inferred here; they only ever arrive
 *    from a partner postback.
 */

export interface ResolvedAffiliateLink {
  linkId: string;
  propFirmId: string;
  destinationUrl: string;
}

/**
 * Resolves the link for a firm slug: campaign-scoped first, then the default.
 *
 * The partial unique index guarantees at most one active default per firm, so
 * this resolution is deterministic at the database level.
 */
export async function resolveAffiliateLink(
  db: Database,
  opts: { firmSlug: string; campaign?: string | null; now?: Date },
): Promise<ResolvedAffiliateLink | null> {
  const now = opts.now ?? new Date();

  const rows = await db
    .select({
      linkId: affiliateLinks.id,
      propFirmId: affiliateLinks.propFirmId,
      destinationUrl: affiliateLinks.destinationUrl,
      campaign: affiliateLinks.campaign,
      isDefault: affiliateLinks.isDefault,
    })
    .from(affiliateLinks)
    .innerJoin(propFirms, eq(propFirms.id, affiliateLinks.propFirmId))
    .where(
      and(
        eq(propFirms.slug, opts.firmSlug),
        eq(propFirms.status, "published"),
        isNull(propFirms.deletedAt),
        eq(affiliateLinks.status, "active"),
        isNull(affiliateLinks.deletedAt),
        or(
          isNull(affiliateLinks.startsAt),
          sql`${affiliateLinks.startsAt} <= ${now}`,
        ),
        or(
          isNull(affiliateLinks.endsAt),
          sql`${affiliateLinks.endsAt} > ${now}`,
        ),
      ),
    );

  if (rows.length === 0) return null;

  const campaignMatch = opts.campaign
    ? rows.find((r) => r.campaign === opts.campaign)
    : undefined;
  const chosen = campaignMatch ?? rows.find((r) => r.isDefault);
  if (!chosen) return null;

  return {
    linkId: chosen.linkId,
    propFirmId: chosen.propFirmId,
    destinationUrl: chosen.destinationUrl,
  };
}

export interface RecordClickInput {
  link: ResolvedAffiliateLink;
  offerId?: string | null;
  placement?: string | null;
  countryCode?: string | null;
  deviceType?: string | null;
  referrerHost?: string | null;
  landingPath?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  isBot?: boolean;
  /**
   * Internal / admin / test traffic. SECONDARY protection only — the primary
   * guarantee is structural: preview CTAs carry no affiliate href, so no click
   * is created at all (docs/DATABASE.md §5.10a `[LOCKED]`).
   */
  isInternal?: boolean;
}

/**
 * Records a click. Called AFTER the redirect response is sent, so it never
 * blocks the user.
 */
export async function recordAffiliateClick(
  db: Database,
  input: RecordClickInput,
): Promise<void> {
  await db.insert(affiliateClicks).values({
    affiliateLinkId: input.link.linkId,
    propFirmId: input.link.propFirmId,
    offerId: input.offerId ?? null,
    placement: input.placement ?? null,
    countryCode: input.countryCode ?? null,
    deviceType: input.deviceType ?? null,
    referrerHost: input.referrerHost ?? null,
    landingPath: input.landingPath ?? null,
    sessionId: input.sessionId ?? null,
    userId: input.userId ?? null,
    isBot: input.isBot ?? false,
    isInternal: input.isInternal ?? false,
    ipHash: hashIdentifier(input.ip),
    userAgentHash: hashIdentifier(input.userAgent),
  });
}

/**
 * Reportable click count. Bot and internal traffic are EXCLUDED from every
 * report and rollup — flagged, never deleted (docs/DATABASE.md §5.10a rule 4).
 */
export async function countReportableClicks(
  db: Database,
  propFirmId: string,
): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(affiliateClicks)
    .where(
      and(
        eq(affiliateClicks.propFirmId, propFirmId),
        eq(affiliateClicks.isBot, false),
        eq(affiliateClicks.isInternal, false),
      ),
    );
  return rows[0]?.n ?? 0;
}

/**
 * The outbound link attributes required on every affiliate anchor
 * (docs/SEO.md §12 `[LOCKED]`).
 */
export const AFFILIATE_REL = "sponsored nofollow noopener" as const;

/**
 * Builds the tracked href. Returns null under preview, so the CTA renders with
 * correct styling and copy but NO href — no request is issued, so there is
 * nothing to attribute (docs/ARCHITECTURE.md §21.7 `[LOCKED]`).
 */
export function affiliateHref(
  firmSlug: string,
  opts: { placement?: string; campaign?: string; isPreview?: boolean } = {},
): string | null {
  if (opts.isPreview) return null;

  const params = new URLSearchParams();
  if (opts.placement) params.set("p", opts.placement);
  if (opts.campaign) params.set("c", opts.campaign);
  const query = params.toString();

  return `/go/${firmSlug}${query ? `?${query}` : ""}`;
}
