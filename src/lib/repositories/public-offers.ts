import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import { media, offers, propFirms } from "@/lib/db/schema";
import { resolveCouponCode } from "@/lib/offers/coupon";
import type { FirmViewImage } from "@/lib/view/firm-view";

/**
 * PUBLISHED, CURRENTLY-ACTIVE OFFERS — docs/DATABASE.md §5.7.
 *
 * ONE QUERY, EVERY SURFACE. `/offers` and the homepage offer panel both read
 * this. There is deliberately no second "offers page" dataset: two queries over
 * the same table drift, and the first symptom is a discount that appears in one
 * place and not the other.
 *
 * "ACTIVE" IS COMPUTED, NEVER STORED. The window is evaluated against `now()`
 * in SQL, so an expired offer stops appearing the moment it expires rather than
 * when someone remembers to run a job.
 *
 * NOTHING HERE IS INVENTED `[LOCKED]`. The title, description, percentage,
 * terms and expiry are exactly what an admin entered; a firm with no active
 * offer simply does not appear. The ONLY defaulted field is the coupon code,
 * and only where none was stored — see `coupon.ts` for why that is a default
 * rather than a fact, and why it implies nothing about a discount.
 */

export interface PublicOffer {
  id: string;
  firmSlug: string;
  firmName: string;
  logo: FirmViewImage | null;
  title: string;
  description: string | null;
  terms: string | null;
  /** Always present: the stored code, or the system default. */
  code: string;
  discountType: string | null;
  discountValue: string | null;
  discountCurrency: string | null;
  endsAt: string | null;
  /** Whether a tracked CTA can be rendered. The URL never leaves the server. */
  hasAffiliateLink: boolean;
}

/** Only published, live firms with a public page can carry a public offer. */
const livePublishedFirm = and(
  eq(propFirms.status, "published"),
  isNull(propFirms.deletedAt),
  sql`${propFirms.slug} is not null`,
  sql`${propFirms.name} is not null`,
);

export async function listActiveOffers(
  db: Database,
  opts: { limit?: number } = {},
): Promise<PublicOffer[]> {
  const rows = await db
    .select({
      id: offers.id,
      firmSlug: propFirms.slug,
      firmName: propFirms.name,
      logoUrl: media.publicUrl,
      logoAlt: media.altText,
      logoWidth: media.width,
      logoHeight: media.height,
      title: offers.title,
      description: offers.description,
      terms: offers.terms,
      code: offers.code,
      discountType: offers.discountType,
      discountValue: offers.discountValue,
      discountCurrency: offers.discountCurrency,
      endsAt: offers.endsAt,
      displayOrder: offers.displayOrder,
      affiliateLinkId: offers.affiliateLinkId,
    })
    .from(offers)
    .innerJoin(propFirms, eq(propFirms.id, offers.propFirmId))
    .leftJoin(media, eq(media.id, propFirms.logoMediaId))
    .where(
      and(
        livePublishedFirm,
        eq(offers.status, "published"),
        isNull(offers.deletedAt),
        or(isNull(offers.startsAt), sql`${offers.startsAt} <= now()`),
        or(isNull(offers.endsAt), sql`${offers.endsAt} > now()`),
      ),
    )
    // Soonest to expire first, so anything time-limited is seen while it is
    // still usable. Offers with no end date sort last, then by the admin's
    // chosen order.
    .orderBy(
      sql`${offers.endsAt} asc nulls last`,
      asc(offers.displayOrder),
      desc(propFirms.name),
    )
    .limit(Math.min(Math.max(opts.limit ?? 50, 1), 200));

  return rows
    .filter(
      (row): row is typeof row & { firmSlug: string; firmName: string } =>
        row.firmSlug !== null && row.firmName !== null,
    )
    .map((row) => ({
      id: row.id,
      firmSlug: row.firmSlug,
      firmName: row.firmName,
      logo: row.logoUrl
        ? {
            url: row.logoUrl,
            alt: row.logoAlt ?? "",
            width: row.logoWidth,
            height: row.logoHeight,
          }
        : null,
      title: row.title,
      description: row.description,
      terms: row.terms,
      code: resolveCouponCode(row.code),
      discountType: row.discountType,
      discountValue: row.discountValue,
      discountCurrency: row.discountCurrency,
      endsAt: row.endsAt?.toISOString() ?? null,
      hasAffiliateLink: row.affiliateLinkId !== null,
    }));
}

/** How many offers are live right now — for a heading that states a real count. */
export async function countActiveOffers(db: Database): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(offers)
    .innerJoin(propFirms, eq(propFirms.id, offers.propFirmId))
    .where(
      and(
        livePublishedFirm,
        eq(offers.status, "published"),
        isNull(offers.deletedAt),
        or(isNull(offers.startsAt), sql`${offers.startsAt} <= now()`),
        or(isNull(offers.endsAt), sql`${offers.endsAt} > now()`),
      ),
    );
  return row?.total ?? 0;
}
