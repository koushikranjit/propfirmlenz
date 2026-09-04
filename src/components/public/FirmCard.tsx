import Link from "next/link";
import { Badge } from "@/components/ui/primitives";
import { FirmLogo } from "@/components/public/firm-profile/FirmLogo";
import type { FirmSummary } from "@/lib/repositories/public-firms";
import { countryName, formatMoney } from "@/lib/view/format";

/**
 * A directory card — docs/DESIGN.md §7.
 *
 * Shows only stored facts. There is no score, no rank, no star rating and no
 * "popular" badge: none of those exist in the database, and inventing one is
 * exactly what CLAUDE.md §3 forbids.
 *
 * The "from" price is shown ONLY when the firm's published challenge prices
 * all share one currency. Across currencies the card says so, because an
 * unconverted minimum presented as a starting price is a false comparison
 * (docs/ARCHITECTURE.md §18.3 `[LOCKED]`).
 */
export function FirmCard({ firm }: { firm: FirmSummary }) {
  const location = countryName(firm.headquartersCountry);

  return (
    // `relative` anchors the heading link's ::after overlay, which makes the
    // whole card clickable while keeping ONE real anchor for assistive tech.
    <div className="relative flex h-full flex-col rounded-[14px] border border-border-default bg-bg-card p-4 transition-colors hover:border-border-strong">
      <div className="flex items-start gap-3">
        <FirmLogo logo={firm.logo} size={48} />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-text-primary">
            <Link
              href={`/prop-firms/${firm.slug}`}
              className="rounded after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
            >
              {firm.name}
            </Link>
          </h2>
          {firm.tagline ? (
            <p className="mt-1 line-clamp-2 text-sm text-text-muted">
              {firm.tagline}
            </p>
          ) : null}
        </div>
      </div>

      <dl className="mt-4 flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-text-muted">Challenges</dt>
          <dd className="tabular-nums text-text-secondary">
            {firm.challengeCount > 0 ? firm.challengeCount : "None published"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-text-muted">Fees from</dt>
          <dd className="text-right tabular-nums text-text-secondary">
            {firm.priceFrom ? (
              formatMoney(firm.priceFrom)
            ) : firm.hasMixedPriceCurrencies ? (
              <span className="text-text-muted">
                Priced in several currencies
              </span>
            ) : (
              <span className="text-text-muted">Not specified</span>
            )}
          </dd>
        </div>
        {location ? (
          <div className="flex justify-between gap-3">
            <dt className="text-text-muted">Headquarters</dt>
            <dd className="text-right text-text-secondary">{location}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 flex items-center gap-2 pt-1">
        {firm.isVerified ? (
          <Badge tone="success">Data verified</Badge>
        ) : (
          <Badge tone="neutral">Not yet verified</Badge>
        )}
      </div>
    </div>
  );
}
