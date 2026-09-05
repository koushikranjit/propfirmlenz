import Link from "next/link";
import type { PublicPayout } from "@/lib/repositories/public-payouts";
import { formatBaseUnits } from "@/lib/blockchain/provider";
import { formatDate } from "@/lib/view/format";

/**
 * Payout presentation — docs/PAYOUTS.md §9.
 *
 * TWO RULES THIS FILE EXISTS TO KEEP `[LOCKED]`:
 *
 *  1. Amounts are rendered from the base-unit integer with `formatBaseUnits`,
 *     never by dividing a JavaScript number. `1234567890123456789 / 1e18` is
 *     already wrong in its final digits, and a payout figure that is quietly
 *     wrong is worse than one that is absent.
 *  2. Nothing says "total". Every label is "verified", because these are the
 *     on-chain payouts from wallets we happen to track — a floor, never a
 *     firm's total payout volume.
 */

/** Truncates an address for display. The full value stays in the explorer link. */
function shortAddress(address: string): string {
  return address.length <= 14
    ? address
    : `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function PayoutTable({ payouts }: { payouts: PublicPayout[] }) {
  return (
    <div className="overflow-x-auto rounded-[14px] border border-border-default bg-bg-card">
      <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
        <caption className="sr-only">
          Verified on-chain payouts, newest first. Each row links to the
          blockchain transaction it was verified from.
        </caption>
        <thead>
          <tr className="border-b border-border-default">
            {["Firm", "Amount", "Network", "To", "When", "Transaction"].map(
              (heading) => (
                <th
                  key={heading}
                  scope="col"
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted"
                >
                  {heading}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {payouts.map((payout) => (
            <tr
              key={payout.id}
              className="border-b border-border-subtle last:border-0"
            >
              <th scope="row" className="px-4 py-3 font-medium">
                <Link
                  href={`/prop-firms/${payout.firmSlug}`}
                  className="rounded text-text-primary hover:text-brand-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                >
                  {payout.firmName}
                </Link>
              </th>
              <td className="px-4 py-3 tabular-nums text-text-secondary">
                {/* Exact base units, formatted without floating point. */}
                {formatBaseUnits(payout.amountBaseUnits, payout.decimals)}{" "}
                {payout.assetSymbol}
                {payout.usdValue ? (
                  <span className="ml-2 text-xs text-text-muted">
                    ≈ ${Number(payout.usdValue).toLocaleString("en")}
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-text-muted">
                {payout.networkName}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-text-muted">
                {shortAddress(payout.toAddress)}
              </td>
              <td className="px-4 py-3 text-text-muted">
                <time dateTime={payout.transactionTimestamp}>
                  {formatDate(payout.transactionTimestamp)}
                </time>
              </td>
              <td className="px-4 py-3">
                {/* The whole point: anyone can check the claim. */}
                <a
                  href={payout.explorerUrl}
                  rel="nofollow noopener"
                  target="_blank"
                  className="rounded font-mono text-xs text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                >
                  {shortAddress(payout.txHash)}
                  <span className="sr-only"> (opens the block explorer)</span>
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
