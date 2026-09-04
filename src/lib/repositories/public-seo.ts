import { and, eq } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import { media, redirects, seoMetadata } from "@/lib/db/schema";
import type { SeoOverride } from "@/lib/seo/metadata";

/**
 * PUBLIC SEO infrastructure repository — docs/SEO.md §5.1, §7.
 *
 * Two concerns, both read-only from public routes:
 *
 *  1. Per-entity metadata OVERRIDES. A missing row means "use the deterministic
 *     template", never "no metadata" (docs/DATABASE.md §5.11 `[LOCKED]`).
 *  2. Redirect lookup, so a slug rename never breaks a public URL
 *     (docs/SEO.md §7 `[LOCKED]`).
 *
 * `structured_data_override` is deliberately NOT selected. An admin-supplied
 * blob must be validated against a schema shape before it can be emitted
 * (docs/SEO.md §11 rule 4); until that validator exists, the column is
 * unreachable from any public path.
 */

/** Resolves the SEO override for a firm, or null to use the template. */
export async function getFirmSeoOverride(
  db: Database,
  firmId: string,
): Promise<SeoOverride | null> {
  const rows = await db
    .select({
      title: seoMetadata.title,
      metaDescription: seoMetadata.metaDescription,
      canonicalUrl: seoMetadata.canonicalUrl,
      ogTitle: seoMetadata.ogTitle,
      ogDescription: seoMetadata.ogDescription,
      ogImageUrl: media.publicUrl,
      robotsIndex: seoMetadata.robotsIndex,
      robotsFollow: seoMetadata.robotsFollow,
      includeInSitemap: seoMetadata.includeInSitemap,
    })
    .from(seoMetadata)
    .leftJoin(media, eq(media.id, seoMetadata.ogImageMediaId))
    .where(
      and(
        eq(seoMetadata.entityType, "prop_firm"),
        eq(seoMetadata.entityId, firmId),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export interface ActiveRedirect {
  toPath: string;
  statusCode: number;
}

/**
 * Looks up an active redirect for a public path.
 *
 * `from_path` is stored normalised (lowercase, leading slash, no trailing
 * slash, no query), so the caller normalises before asking. A 410 is recorded
 * as a redirect row with status 410 and is handled by the caller as a
 * deliberate gone response, never as a 404 (docs/SEO.md §8).
 */
export async function findActiveRedirect(
  db: Database,
  fromPath: string,
): Promise<ActiveRedirect | null> {
  const rows = await db
    .select({
      toPath: redirects.toPath,
      statusCode: redirects.statusCode,
    })
    .from(redirects)
    .where(and(eq(redirects.fromPath, fromPath), eq(redirects.isActive, true)))
    .limit(1);

  return rows[0] ?? null;
}
