import type { Metadata } from "next";
import { canonicalUrl } from "./canonical";
import { SITE_DESCRIPTION, SITE_NAME } from "./site";

/**
 * Metadata builders — docs/SEO.md §5, docs/ARCHITECTURE.md §9.
 *
 * PURE FUNCTIONS, unit-tested. Never ad-hoc strings scattered in components.
 *
 * Resolution order `[LOCKED]`:
 *   seo_metadata override -> deterministic template -> global default
 *
 * Templates interpolate only REAL values. If a value is missing the template
 * branches — it never emits "undefined", an empty bracket, or a fabricated
 * number (docs/SEO.md §5.1 `[LOCKED]`).
 */

export const TITLE_MAX = 70;
export const DESCRIPTION_MAX = 160;

export interface SeoOverride {
  title?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImageUrl?: string | null;
  robotsIndex?: boolean;
  robotsFollow?: boolean;
  includeInSitemap?: boolean;
}

export interface BuildMetadataInput {
  path: string;
  title: string;
  description: string;
  override?: SeoOverride | null;
  /** Non-indexable surfaces: previews, filtered views, error pages. */
  noindex?: boolean;
}

function clamp(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Builds page metadata with a self-referencing canonical.
 *
 * A canonical must never point at a URL that redirects, 404s, or is noindex —
 * so when a page is noindex we omit the canonical entirely rather than emit a
 * misleading one (docs/SEO.md §4).
 */
export function buildMetadata(input: BuildMetadataInput): Metadata {
  const o = input.override ?? {};
  const title = clamp(o.title?.trim() || input.title, TITLE_MAX);
  const description = clamp(
    o.metaDescription?.trim() || input.description,
    DESCRIPTION_MAX,
  );
  const url = o.canonicalUrl?.trim() || canonicalUrl(input.path);

  const index = input.noindex ? false : (o.robotsIndex ?? true);
  const follow = o.robotsFollow ?? true;

  const metadata: Metadata = {
    title,
    description,
    robots: { index, follow },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url,
      title: o.ogTitle?.trim() || title,
      description: o.ogDescription?.trim() || description,
      ...(o.ogImageUrl ? { images: [{ url: o.ogImageUrl }] } : {}),
    },
    twitter: { card: "summary_large_image" },
  };

  if (index) {
    metadata.alternates = { canonical: url };
  }

  return metadata;
}

/** Site-wide default metadata. */
export function buildDefaultMetadata(): Metadata {
  return buildMetadata({
    path: "/",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  });
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

/**
 * Breadcrumb JSON-LD. Generated from the SAME source as the visible breadcrumb,
 * so the two cannot drift (docs/SEO.md §11 rule 5).
 */
export function buildBreadcrumbLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: canonicalUrl(item.path),
    })),
  } as const;
}

/** Organization JSON-LD. Uses the OFFICIAL logo asset — never a redrawn mark. */
export function buildOrganizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: canonicalUrl("/"),
    logo: canonicalUrl("/brand/Prop Firm Lenz logo.png"),
  } as const;
}

/**
 * `WebPage` JSON-LD. Describes only what the page visibly contains — no
 * counts, prices, or ratings are asserted here (docs/SEO.md §11 rule 2).
 */
export function buildWebPageLd(input: {
  path: string;
  name: string;
  description: string;
  /** The entity's real `updated_at`. Never `now()`. */
  dateModified?: string | null;
}) {
  const url = canonicalUrl(input.path);
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": url,
    url,
    name: input.name,
    description: input.description,
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: canonicalUrl("/"),
    },
    // Omitted entirely when unknown — never emitted as null (§11 rule 3).
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
  } as const;
}

/**
 * `ItemList` for a directory page. Lists the items ACTUALLY rendered, in the
 * order rendered, so the markup matches the visible page (§11 rule 2).
 */
export function buildItemListLd(
  items: { name: string; path: string }[],
  opts: { startPosition?: number } = {},
) {
  const start = opts.startPosition ?? 1;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: start + i,
      name: item.name,
      url: canonicalUrl(item.path),
    })),
  } as const;
}

/**
 * Rating and review markup is PROHIBITED before Phase 3, and then only from
 * genuine moderated reviews with real counts (docs/SEO.md §11 rule 1
 * `[LOCKED]`). This exists so the prohibition is greppable in code, not only
 * in prose.
 */
export const AGGREGATE_RATING_LD_ALLOWED = false;

/**
 * `FAQPage` markup requires genuine, VISIBLE, published Q&A on the page
 * (docs/SEO.md §11 rule 2 `[LOCKED]`). No public surface renders FAQ content
 * yet, so no FAQ markup may be emitted. Greppable, like the rule above.
 */
export const FAQ_LD_ALLOWED = false;
