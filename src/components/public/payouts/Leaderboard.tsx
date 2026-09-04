import Link from "next/link";
import { formatBaseUnits } from "@/lib/blockchain/provider";
import { formatDate } from "@/lib/view/format";
import type { LeaderboardRow } from "@/lib/repositories/public-payouts";

/**
 * Verified payouts by firm — docs/PAYOUTS.md §9 `[LOCKED]`.
 *
 * Built from Prop Firm Lenz's own tokens and components. Competitor layouts
 * were used only to understand what a reader looks for in a payout table;
 * nothing of theirs is reproduced (CLAUDE.md §12.2 rule 6).
 *
 * THREE RULES THIS TABLE KEEPS:
 *
 *  1. Amounts render from the exact base-unit integer, per token. USDT and
 *     USDC are never summed into one figure, because that would assert a rate
 *     nobody recorded.
 *  2. Every column says "verified". None says "total" — these are the payouts
 *     we can prove, a floor rather than a firm's payout volume.
 *  3. Ranking is by VERIFIED COUNT, not volume: one large transfer should not
 *     outrank a hundred smaller ones on a figure that is already a floor.
 */

function TokenAmount({
  baseUnits,
  decimals,
  symbol,
}: {
  baseUnits: string;
  decimals: number;
  symbol: string;
}) {
  return (
    <span className="whitespace-nowrap tabular-nums">
      {formatBaseUnits(baseUnits, decimals)}{" "}
      <span className="text-text-muted">{symbol}</span>
    </span>
  );
}

export function PayoutLeaderboard({ rows }: { rows: LeaderboardRow[] }) {
  return (
    <div className="overflow-x-auto rounded-[14px] border border-border-default bg-bg-card">
      <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
        <caption className="sr-only">
          Firms ranked by the number of blockchain-verified payouts recorded
          against them. Amounts are exact on-chain figures, listed per token.
        </caption>
        <thead>
          <tr className="border-b border-border-default">
            <th
              scope="col"
              className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted"
            >
              Firm
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-text-muted"
            >
              Verified payouts
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-text-muted"
            >
              Verified volume
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-text-muted"
            >
              Largest
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-text-muted"
            >
              Latest
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.firmSlug}
              className="border-b border-border-subtle last:border-0"
            >
              <th scope="row" className="px-4 py-3 font-medium">
                <Link
                  href={`/prop-firms/${row.firmSlug}`}
                  className="inline-flex items-center gap-2.5 rounded text-text-primary hover:text-brand-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                >
                  {row.logoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={row.logoUrl}
                      alt=""
                      width={24}
                      height={24}
                      className="size-6 rounded-[6px] border border-border-subtle bg-bg-elevated object-contain"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="size-6 rounded-[6px] border border-dashed border-border-default"
                    />
                  )}
                  {row.firmName}
                </Link>
              </th>

              <td className="px-4 py-3 text-right tabular-nums text-text-primary">
                {row.count}
              </td>

              {/* One line per asset — never one number across assets. */}
              <td className="px-4 py-3 text-right text-text-secondary">
                <div className="flex flex-col items-end gap-0.5">
                  {row.tokens.map((token) => (
                    <TokenAmount
                      key={token.symbol}
                      baseUnits={token.totalBaseUnits}
                      decimals={token.decimals}
                      symbol={token.symbol}
                    />
                  ))}
                </div>
              </td>

              <td className="px-4 py-3 text-right text-text-secondary">
                <div className="flex flex-col items-end gap-0.5">
                  {row.tokens.map((token) => (
                    <TokenAmount
                      key={token.symbol}
                      baseUnits={token.largestBaseUnits}
                      decimals={token.decimals}
                      symbol={token.symbol}
                    />
                  ))}
                </div>
              </td>

              <td className="px-4 py-3 text-right text-text-muted">
                {row.latestAt ? (
                  <time dateTime={row.latestAt}>
                    {formatDate(row.latestAt)}
                  </time>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
