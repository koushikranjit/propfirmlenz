/**
 * Affiliate LINK CONSTRUCTION — docs/ARCHITECTURE.md §11.1, §21.7 `[LOCKED]`.
 *
 * Deliberately dependency-free: no database, no schema, no `node:crypto`. The
 * public component tree renders the CTA, and it must be able to do so without
 * importing the click-recording service (and dragging the driver with it).
 * `services/affiliate.ts` re-exports these so there is still one definition.
 */

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
