import type { MetadataRoute } from "next";
import { getDb } from "@/lib/db/client";
import { getPublishedFirmView } from "@/lib/repositories/public-firm-view";
import { listPublishedFirmSlugs } from "@/lib/repositories/public-firms";
import { getPayoutTotals } from "@/lib/repositories/public-payouts";
import { canonicalUrl } from "@/lib/seo/canonical";
import { firmPath } from "@/lib/seo/firm-seo";
import { isIndexable } from "@/lib/view/firm-view";

/**
 * The sitemap — docs/SEO.md §14 `[LOCKED]`.
 *
 * Generated from the database, not a hand-maintained list.
 *
 *  - `lastmod` is each entity's REAL `updated_at`, never `now()`. A sitemap
 *    that claims everything changed today is ignored. This is also why saving
 *    a draft deliberately leaves `updated_at` untouched.
 *  - Drafts, archived and soft-deleted firms are excluded by construction:
 *    `listPublishedFirmSlugs` cannot return them.
 *  - Thin profiles are excluded too. A `noindex` page in a sitemap is a
 *    contradictory signal, and every URL here must return 200 and be
 *    self-canonical.
 *  - `/admin/*`, `/admin/preview/*` and `/go/*` never appear — they are not
 *    reachable from any query used here (§21.6 guarantee 6).
 *
 * Dynamic because the published set changes on every publish, and because the
 * database is not reachable at build time.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = getDb();
  const [firms, payouts] = await Promise.all([
    listPublishedFirmSlugs(db),
    getPayoutTotals(db, "all"),
  ]);

  // Indexability depends on the assembled profile, so it is decided by the same
  // predicate the page itself uses — the sitemap can never disagree with the
  // robots directive the page emits.
  const views = await Promise.all(
    firms.map(async (firm) => {
      const view = await getPublishedFirmView(db, firm.slug);
      return view && isIndexable(view) ? firm : null;
    }),
  );

  return [
    {
      url: canonicalUrl("/"),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: canonicalUrl("/prop-firms"),
      changeFrequency: "daily",
      priority: 0.9,
    },
    // Original methodology content, and true whether or not anything has been
    // verified yet.
    {
      url: canonicalUrl("/payouts/methodology"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    // The payout index carries nothing but an empty state until something is
    // verified, and the page emits noindex in that state. Listing it here
    // anyway would be the contradictory signal this file exists to avoid.
    ...(payouts.count > 0
      ? [
          {
            url: canonicalUrl("/payouts"),
            changeFrequency: "daily" as const,
            priority: 0.7,
          },
        ]
      : []),
    ...views.flatMap((firm) =>
      firm
        ? [
            {
              url: canonicalUrl(firmPath(firm.slug)),
              lastModified: firm.updatedAt,
              changeFrequency: "weekly" as const,
              priority: 0.8,
            },
          ]
        : [],
    ),
  ];
}
