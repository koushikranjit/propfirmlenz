import type { MetadataRoute } from "next";

/**
 * Sitemap shell. Entries are generated from the database once entities exist
 * (docs/SEO.md §14). Drafts, noindex pages, /go/* and /admin/* are never included.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [];
}
