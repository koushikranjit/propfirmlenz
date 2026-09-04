import Link from "next/link";
import type {
  PayoutTotals,
  PayoutWindow,
  PublicPayout,
} from "@/lib/repositories/public-payouts";
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

const WINDOW_LABEL: Record<PayoutWindow, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
};

const WINDOWS: PayoutWindow[] = ["24h", "7d", "30d", "all"];

/** Real anchors, so the windows work without JavaScript and stay linkable. */
export function WindowTabs({ current }: { current: PayoutWindow }) {
  return (
    <nav aria-label="Time period" className="mt-8">
      <ul className="flex flex-wrap gap-2">
        {WINDOWS.map((window) => {
          const active = window === current;
          return (
            <li key={window}>
              <Link
                href={`/payouts?window=${window}`}
                aria-current={active ? "page" : undefined}
                className={
                  "inline-flex rounded-[10px] border px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base " +
                  (active
                    ? "border-brand-cyan/50 bg-bg-elevated text-brand-cyan"
                    : "border-border-default bg-bg-card text-text-secondary hover:border-border-strong hover:text-text-primary")
                }
              >
                {WINDOW_LABEL[window]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Headline figures. Every one is counted, never estimated. */
export function PayoutTotalsStrip({ totals }: { totals: PayoutTotals }) {
  const usd = (value: string | null) =>
    value === null
      ? null
      : `$${Number(value).toLocaleString("en", { maximumFractionDigits: 0 })}`;

  const stats: { label: string; value: string | null; note?: string }[] = [
    { label: "Verified payouts", value: String(totals.count) },
    {
      label: "Verified value",
      value: usd(totals.usdValue),
      // Said plainly: a sum over only the payouts we could price would
      // otherwise read as a sum over all of them.
      ...(totals.usdValuedCount < totals.count
        ? {
            note: `${totals.usdValuedCount} of ${totals.count} priced`,
          }
        : {}),
    },
    { label: "Largest verified", value: usd(totals.largestUsd) },
    { label: "Average verified", value: usd(totals.averageUsd) },
  ];

  return (
    <dl className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-[14px] border border-border-default bg-bg-card p-4"
        >
          <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {stat.label}
          </dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
            {stat.value ?? (
              <span className="text-sm font-normal italic text-text-muted">
                Not available
              </span>
            )}
          </dd>
          {stat.note ? (
            <p className="mt-1 text-xs text-text-muted">{stat.note}</p>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

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
