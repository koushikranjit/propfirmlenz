import Link from "next/link";
import type { PublicOffer } from "@/lib/repositories/public-offers";
import { FirmLogo } from "@/components/public/firm-profile/FirmLogo";
import { CopyCode } from "@/components/public/firm-profile/CopyCode";
import { formatDate, formatMoney, formatPercent } from "@/lib/view/format";

/**
 * One published offer — docs/DATABASE.md §5.7.
 *
 * EVERY FIELD IS OPTIONAL EXCEPT THE FIRM AND THE TITLE. A discount figure,
 * description, terms and expiry render only when the database holds them, and
 * their absence renders NOTHING rather than a placeholder. A card that says
 * "up to 20% off" because a percentage was missing would be an invented
 * commercial claim about a real company (CLAUDE.md §3 `[LOCKED]`).
 *
 * The coupon code is always present because it falls back to the system
 * default, and `CopyCode` copies the value it is given — the stored code where
 * there is one, so the button never puts a different string on the clipboard
 * from the one on screen.
 */

/** The discount, exactly as stored. Null when the firm published no figure. */
function discountLabel(offer: PublicOffer): string | null {
  if (offer.discountType === "percent") {
    return formatPercent(offer.discountValue);
  }
  if (offer.discountType === "fixed" && offer.discountCurrency) {
    return formatMoney({
      amount: offer.discountValue ?? "0",
      currency: offer.discountCurrency,
    });
  }
  return null;
}

export function OfferCard({ offer }: { offer: PublicOffer }) {
  const discount = discountLabel(offer);
  const endsOn = formatDate(offer.endsAt);

  return (
    <li className="flex flex-col rounded-[14px] border border-border-default bg-bg-card p-5">
      <div className="flex items-start gap-3">
        <FirmLogo logo={offer.logo} size={48} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/prop-firms/${offer.firmSlug}`}
            className="rounded font-semibold text-text-primary hover:text-brand-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
          >
            {offer.firmName}
          </Link>
          <p className="mt-0.5 text-sm text-text-secondary">{offer.title}</p>
        </div>
        {/* Only when a real figure was entered. No figure, no badge. */}
        {discount ? (
          <span className="shrink-0 rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-3 py-1 text-sm font-semibold tabular-nums text-brand-cyan">
            {discount}
          </span>
        ) : null}
      </div>

      {offer.description ? (
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          {offer.description}
        </p>
      ) : null}

      <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
        <span>Code:</span>
        <CopyCode code={offer.code} />
      </p>

      {offer.terms ? (
        <p className="mt-3 text-xs text-text-muted">{offer.terms}</p>
      ) : null}

      {/* A real end date or nothing. Never "ends soon". */}
      {endsOn ? (
        <p className="mt-2 text-xs text-text-muted">Ends {endsOn}.</p>
      ) : null}

      <div className="mt-auto pt-4">
        <Link
          href={`/prop-firms/${offer.firmSlug}`}
          className="inline-flex h-10 items-center justify-center rounded-[10px] border border-border-default px-4 text-sm font-medium text-text-primary hover:border-brand-cyan/50 hover:text-brand-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
        >
          View {offer.firmName}
        </Link>
      </div>
    </li>
  );
}
