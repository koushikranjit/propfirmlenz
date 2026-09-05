/** Official brand constants (docs/SESSION.md "Official brand"). */
export const SITE_NAME = "Prop Firm Lenz";
export const SITE_DESCRIPTION =
  "Compare proprietary trading firms using structured, verified data.";

/**
 * BRAND ASSET PATHS — one place, so the mark cannot drift between surfaces.
 *
 * Every file below is the OFFICIAL artwork SCALED, and nothing else: no crop,
 * no recolour, no redraw, no alternate mark (CLAUDE.md §12.2 rule 8
 * `[LOCKED]`). The masters stay in the repository as the source of truth;
 * these exist because a 600KB PNG is not a favicon and a 500KB PNG is not a
 * header logo.
 */
export const BRAND = {
  /** Full-resolution masters. Used where byte size does not matter. */
  logoMaster: "/brand/Prop Firm Lenz logo.png",
  iconMaster: "/brand/Prop Firm Lenz Icon.png",
  /** The lockup at delivery size — header, footer, sidebar, sign-in. */
  logo: "/brand/logo-576.png",
  /** The mark alone, for places a wordmark will not fit. */
  icon32: "/brand/icon-32.png",
  icon192: "/brand/icon-192.png",
  icon512: "/brand/icon-512.png",
  appleIcon: "/brand/apple-icon-180.png",
  /** Social preview. A static file: crawlers do not run the image optimiser. */
  ogImage: "/brand/og-cover.png",
} as const;

/**
 * The default social card.
 *
 * Shared by the root layout and `buildMetadata`, because a page's `openGraph`
 * REPLACES the root's rather than merging into it — setting the image in only
 * one of the two would leave every other page with no preview image at all.
 */
export const OG_IMAGE = {
  url: BRAND.ogImage,
  width: 1200,
  height: 600,
  alt: SITE_NAME,
} as const;
