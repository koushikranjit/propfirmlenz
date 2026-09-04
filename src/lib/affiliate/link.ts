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

/**
 * Is a STORED destination safe to redirect a visitor to? `[LOCKED]`
 *
 * `/go/{slug}` is the one route that sends a visitor off-site, so it is the one
 * route that could become an open redirect. The structural protection is that
 * the destination comes only from `affiliate_links.destination_url` and no
 * request input can influence it. This function is the second layer: even a
 * stored value must be an absolute `https://` URL with a real host before it is
 * ever emitted in a `Location` header.
 *
 * The database enforces `^https://` too (`affiliate_links_https_ck`). Both
 * exist deliberately: the constraint could be dropped, or a row could predate
 * it, and neither is a reason to redirect a visitor to `javascript:` or to a
 * protocol-relative `//evil.example`.
 *
 * A destination that fails this check is a data defect. The caller must 404 —
 * never fall back, never guess, never rewrite it into something valid
 * (docs/ARCHITECTURE.md §11.3).
 */
export function isSafeAffiliateDestination(destination: string): boolean {
  let url: URL;
  try {
    url = new URL(destination);
  } catch {
    // Relative, protocol-relative and malformed values all land here.
    return false;
  }

  if (url.protocol !== "https:") return false;

  // A partner destination is always a public, dotted host. Requiring the dot
  // also rejects the surprising `https:///path`, which the URL parser resolves
  // by treating `path` as the hostname — a typo that would otherwise send
  // visitors to a host that does not exist.
  if (!url.hostname.includes(".")) return false;

  // Credentials in a redirect target are a phishing vector.
  if (url.username.length > 0 || url.password.length > 0) return false;

  return true;
}
