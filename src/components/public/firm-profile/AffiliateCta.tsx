import { AFFILIATE_REL, affiliateHref } from "@/lib/affiliate/link";
import type { FirmView } from "@/lib/view/firm-view";

const CTA_CLASS =
  "inline-flex h-12 items-center justify-center rounded-[10px] px-6 text-sm font-semibold " +
  "text-white bg-[image:var(--gradient-brand)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base";

/**
 * The outbound CTA — docs/ARCHITECTURE.md §11, §21.7 `[LOCKED]`.
 *
 * Three genuinely different states, and no fourth:
 *
 *  1. PREVIEW — an inert element with the correct styling and copy and NO
 *     href. No request is issued, so there is nothing to attribute. This is
 *     the PRIMARY protection: structural, not a downstream filter. It does not
 *     depend on `affiliate_clicks.is_internal`, which is classification only.
 *  2. Tracked — an affiliate link exists, so the CTA points at `/go/{slug}`,
 *     which resolves the destination SERVER-SIDE. The partner URL is never in
 *     the markup (§11.1).
 *  3. Plain — no affiliate link, so this is an ordinary outbound link to the
 *     firm's own site, marked `nofollow` and without the `sponsored` token,
 *     because it is not sponsored.
 */
export function AffiliateCta({
  firm,
  preview,
  placement,
}: {
  firm: FirmView;
  preview: boolean;
  placement: string;
}) {
  if (firm.hasAffiliateLink) {
    const href = affiliateHref(firm.slug, { placement, isPreview: preview });

    if (href === null) {
      return (
        <div>
          <span
            role="link"
            aria-disabled="true"
            title="Affiliate links are disabled in preview, so no click is recorded."
            className={`${CTA_CLASS} cursor-not-allowed opacity-60`}
          >
            Visit {firm.name}
          </span>
          <p className="mt-2 text-xs text-text-muted">
            Affiliate link disabled in preview — no click is recorded.
          </p>
        </div>
      );
    }

    return (
      <div>
        <a
          href={href}
          rel={AFFILIATE_REL}
          target="_blank"
          className={CTA_CLASS}
        >
          Visit {firm.name}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        {/* Disclosure sits with the link, not only in the footer (§12.1 rule 4). */}
        <p className="mt-2 text-xs text-text-muted">
          Affiliate link. Prop Firm Lenz may earn a commission. It does not
          change the data on this page.
        </p>
      </div>
    );
  }

  if (firm.websiteUrl) {
    return (
      <div>
        <a
          href={firm.websiteUrl}
          rel="nofollow noopener"
          target="_blank"
          className={CTA_CLASS}
        >
          Visit {firm.name}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        <p className="mt-2 text-xs text-text-muted">
          Not an affiliate link — Prop Firm Lenz earns nothing from this visit.
        </p>
      </div>
    );
  }

  return (
    <p className="text-sm text-text-muted">
      No website has been recorded for {firm.name}.
    </p>
  );
}
