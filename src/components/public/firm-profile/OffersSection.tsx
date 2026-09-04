import { formatDate, formatMoney, formatPercent } from "@/lib/view/format";
import type { FirmViewOffer } from "@/lib/view/firm-view";
import { NoData } from "./Section";

/**
 * Published, currently-active offers — docs/DATABASE.md §5.7.
 *
 * "Active" was decided by the QUERY against `starts_at` / `ends_at`, not by a
 * stored flag that goes stale the moment nobody runs the job. Anything that
 * reaches this component is live right now.
 *
 * Discount codes, terms and expiry dates are only ever what an admin entered.
 * Nothing is generated, extended, or rounded (CLAUDE.md §3 `[LOCKED]`).
 */
export function OffersSection({
  offers,
  firmName,
}: {
  offers: FirmViewOffer[];
  firmName: string;
}) {
  if (offers.length === 0) {
    return <NoData>There are no active offers for {firmName} right now.</NoData>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {offers.map((offer) => {
        const value = discountValue(offer);
        const endsOn = formatDate(offer.endsAt);

        return (
          <li
            key={offer.id}
            className="rounded-[14px] border border-border-default bg-bg-card p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-text-primary">
                {offer.title}
              </h3>
              {value ? (
                <span className="text-sm font-semibold tabular-nums text-text-primary">
                  {value}
                </span>
              ) : null}
            </div>

            {offer.description ? (
              <p className="mt-1 text-sm text-text-secondary">
                {offer.description}
              </p>
            ) : null}

            {offer.code ? (
              <p className="mt-2 text-sm text-text-secondary">
                Code:{" "}
                <code className="rounded-[6px] border border-border-default bg-bg-near-black px-2 py-1 font-mono text-text-primary">
                  {offer.code}
                </code>
              </p>
            ) : null}

            {offer.terms ? (
              <p className="mt-2 text-xs text-text-muted">{offer.terms}</p>
            ) : null}

            {/* Only stated when a real end date exists. Never "ends soon". */}
            {endsOn ? (
              <p className="mt-2 text-xs text-text-muted">Ends {endsOn}.</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The discount as published. A fixed amount keeps its own source currency and
 * is never converted (docs/ARCHITECTURE.md §18 `[LOCKED]`).
 */
function discountValue(offer: FirmViewOffer): string | null {
  if (offer.discountValue === null) return null;

  if (offer.discountType === "percent") {
    return formatPercent(offer.discountValue) ?? null;
  }
  if (offer.discountType === "fixed" && offer.discountCurrency) {
    return formatMoney({
      amount: offer.discountValue,
      currency: offer.discountCurrency,
    });
  }
  return null;
}
