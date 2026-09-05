import Link from "next/link";
import { formatBaseUnits } from "@/lib/blockchain/provider";
import type { PublicPayout } from "@/lib/repositories/public-payouts";
import { formatDate } from "@/lib/view/format";
import { NoData } from "./Section";

/**
 * A firm's blockchain-verified payouts — docs/PAYOUTS.md §9 `[LOCKED]`.
 *
 * WHAT THIS SECTION IS ALLOWED TO CLAIM:
 *
 *   "These payouts happened, and here is the transaction."
 *
 * WHAT IT MUST NEVER CLAIM:
 *
 *   "This is what the firm pays out." Coverage is partial by construction —
 *   only wallets someone identified, only chains we can read — so the figure is
 *   a FLOOR. Nothing here is labelled a total, and an empty section is never
 *   presented as evidence that a firm does not pay.
 *
 * It is passed in as a required prop rather than added to `FirmView`, because
 * verified payouts are published facts that exist independently of the firm's
 * draft. Requiring it still means BOTH the public route and the admin preview
 * must supply it, so the preview cannot silently omit the section
 * (CLAUDE.md §12.4f rules 34–35 `[LOCKED]`).
 */
export interface FirmPayoutEvidence {
  count: number;
  /** Summed USD value of the priced payouts, and how many were priced. */
  usdValue: string | null;
  usdValuedCount: number;
  latestAt: string | null;
  recent: PublicPayout[];
}

export const EMPTY_PAYOUT_EVIDENCE: FirmPayoutEvidence = {
  count: 0,
  usdValue: null,
  usdValuedCount: 0,
  latestAt: null,
  recent: [],
};

function shorten(value: string): string {
  return value.length <= 16 ? value : `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function PayoutEvidenceSection({
  payouts,
  firmName,
  payoutInfoUrl,
}: {
  payouts: FirmPayoutEvidence;
  firmName: string;
  /** The firm's own payout page, if it publishes one. A claim, not evidence. */
  payoutInfoUrl: string | null;
}) {
  const methodology = (
    <Link
      href="/payouts/methodology"
      className="rounded text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
    >
      how we verify payouts
    </Link>
  );

  if (payouts.count === 0) {
    return (
      <div className="flex flex-col gap-3">
        <NoData>
          No blockchain-verified payouts have been recorded for {firmName}. That
          is not evidence the firm does not pay — it may pay by bank transfer or
          card, or from wallets nobody has identified. Read {methodology}.
        </NoData>
        {payoutInfoUrl ? (
          <p className="text-sm text-text-muted">
            {firmName} publishes its own payout information. It is the firm&apos;s
            own claim, not something verified here:{" "}
            <a
              href={payoutInfoUrl}
              rel="nofollow noopener"
              target="_blank"
              className="rounded text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
            >
              the firm&apos;s payout page
            </a>
            .
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[14px] border border-border-default bg-bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Verified payouts
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
            {payouts.count}
          </p>
        </div>
        <div className="rounded-[14px] border border-border-default bg-bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Verified value
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
            {payouts.usdValue === null ? (
              <span className="text-sm font-normal italic text-text-muted">
                Not available
              </span>
            ) : (
              `$${Number(payouts.usdValue).toLocaleString("en", {
                maximumFractionDigits: 0,
              })}`
            )}
          </p>
          {payouts.usdValuedCount < payouts.count ? (
            // Otherwise a sum over the priced subset reads as a sum over all.
            <p className="mt-1 text-xs text-text-muted">
              {payouts.usdValuedCount} of {payouts.count} priced
            </p>
          ) : null}
        </div>
        <div className="rounded-[14px] border border-border-default bg-bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Most recent
          </p>
          <p className="mt-1 text-xl font-semibold text-text-primary">
            {payouts.latestAt ? formatDate(payouts.latestAt) : "—"}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[14px] border border-border-default bg-bg-card">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <caption className="sr-only">
            {firmName}&apos;s most recent blockchain-verified payouts. Each row
            links to the transaction it was verified from.
          </caption>
          <thead>
            <tr className="border-b border-border-default">
              {["Amount", "Network", "When", "Transaction"].map((heading) => (
                <th
                  key={heading}
                  scope="col"
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payouts.recent.map((payout) => (
              <tr
                key={payout.id}
                className="border-b border-border-subtle last:border-0"
              >
                <th
                  scope="row"
                  className="px-4 py-3 font-medium tabular-nums text-text-primary"
                >
                  {/* Exact base units — never a divided JavaScript number. */}
                  {formatBaseUnits(payout.amountBaseUnits, payout.decimals)}{" "}
                  {payout.assetSymbol}
                </th>
                <td className="px-4 py-3 text-text-muted">
                  {payout.networkName}
                </td>
                <td className="px-4 py-3 text-text-muted">
                  <time dateTime={payout.transactionTimestamp}>
                    {formatDate(payout.transactionTimestamp)}
                  </time>
                </td>
                <td className="px-4 py-3">
                  <a
                    href={payout.explorerUrl}
                    rel="nofollow noopener"
                    target="_blank"
                    className="rounded font-mono text-xs text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                  >
                    {shorten(payout.txHash)}
                    <span className="sr-only"> (opens the block explorer)</span>
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-text-muted">
        Verified on-chain payouts only — a floor, not {firmName}&apos;s total
        payout volume. Coverage depends on which wallets have been identified
        and which chains can be read: {methodology}.
      </p>
    </div>
  );
}
