import Link from "next/link";
import type {
  FirmPayoutProfile,
  PayoutMonth,
  RankedFirm,
  RankedFirmToken,
} from "@/lib/repositories/payout-tracker";
import type { PayoutWindow } from "@/lib/repositories/public-payouts";
import { formatBaseUnits } from "@/lib/blockchain/provider";
import { formatDate } from "@/lib/view/format";

/**
 * THE PAYOUT TRACKER UI — docs/PAYOUTS.md §9.
 *
 * An original Prop Firm Lenz surface built from the design tokens in
 * docs/DESIGN.md. It is not, and must not become, a reproduction of any
 * competitor's screen (CLAUDE.md §12.2 rule 6 `[LOCKED]`).
 *
 * THREE RULES THIS FILE EXISTS TO KEEP `[LOCKED]`:
 *
 *  1. Amounts render from the base-unit integer through `formatBaseUnits`,
 *     never by dividing a JavaScript number.
 *  2. Assets are never added together. A firm paying USDT and USDC shows two
 *     figures, because one combined figure would assert a rate nobody recorded.
 *  3. Nothing is labelled a "total". These are the on-chain payouts from
 *     wallets we happen to track — a floor, never a firm's payout volume.
 */

export const WINDOW_LABEL: Record<PayoutWindow, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "365d": "Last 365 days",
  all: "All time",
};

export const WINDOWS: PayoutWindow[] = ["24h", "7d", "30d", "365d", "all"];

/** Real anchors, so the windows work without JavaScript and stay linkable. */
export function WindowTabs({
  current,
  basePath,
  query,
}: {
  current: PayoutWindow;
  basePath: string;
  query?: string | undefined;
}) {
  const href = (window: PayoutWindow) => {
    const params = new URLSearchParams({ window });
    if (query) params.set("q", query);
    return `${basePath}?${params.toString()}`;
  };

  return (
    <nav aria-label="Time period">
      <ul className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {WINDOWS.map((window) => {
          const active = window === current;
          return (
            <li key={window}>
              <Link
                href={href(window)}
                aria-current={active ? "page" : undefined}
                className={
                  "inline-flex shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base " +
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

/** Name search. A GET form, so it works with JavaScript disabled. */
export function FirmSearch({
  action,
  window,
  query,
}: {
  action: string;
  window: PayoutWindow;
  query?: string | undefined;
}) {
  return (
    <form action={action} className="flex w-full gap-2 sm:w-auto">
      <input type="hidden" name="window" value={window} />
      <label htmlFor="payout-firm-search" className="sr-only">
        Search firms by name
      </label>
      <input
        id="payout-firm-search"
        name="q"
        type="search"
        defaultValue={query ?? ""}
        placeholder="Search firms…"
        className="h-10 w-full min-w-0 rounded-[10px] border border-border-default bg-bg-card px-3 text-sm text-text-primary placeholder:text-text-metadata focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base sm:w-64"
      />
      <button
        type="submit"
        className="h-10 shrink-0 rounded-[10px] border border-border-default bg-bg-elevated px-4 text-sm font-medium text-text-primary hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
      >
        Search
      </button>
    </form>
  );
}

/** A firm's logo, or its initial. Never a generated stand-in mark. */
function FirmAvatar({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string | null;
}) {
  if (logoUrl) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element -- a firm's logo is an uploaded remote asset at an unknown host; it is shown as uploaded and never re-encoded (CLAUDE.md §12.2 rule 9). */
      <img
        src={logoUrl}
        alt=""
        width={40}
        height={40}
        loading="lazy"
        className="size-10 shrink-0 rounded-[10px] border border-border-subtle object-contain"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-border-subtle bg-bg-elevated text-sm font-semibold text-text-muted"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** One asset's figure. The symbol is always attached to the number. */
function TokenAmount({
  baseUnits,
  token,
}: {
  baseUnits: string;
  token: RankedFirmToken;
}) {
  return (
    <span className="whitespace-nowrap tabular-nums">
      {formatBaseUnits(baseUnits, token.decimals)}{" "}
      <span className="text-xs font-medium text-text-muted">
        {token.symbol}
      </span>
    </span>
  );
}

function TokenColumn({
  tokens,
  pick,
}: {
  tokens: RankedFirmToken[];
  pick: (token: RankedFirmToken) => string;
}) {
  if (tokens.length === 0) return <span className="text-text-muted">—</span>;
  return (
    <span className="flex flex-col gap-0.5">
      {tokens.map((token) => (
        <TokenAmount key={token.symbol} baseUnits={pick(token)} token={token} />
      ))}
    </span>
  );
}

const TH =
  "px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted";
const TD = "px-4 py-4 align-middle text-sm text-text-secondary";

/**
 * The ranking table.
 *
 * Rank is the row's position by verified payout count — a description of this
 * table's ordering, not a score, a rating, or an endorsement.
 */
export function FirmRankingTable({
  firms,
  window,
}: {
  firms: RankedFirm[];
  window: PayoutWindow;
}) {
  return (
    <div className="overflow-x-auto rounded-[14px] border border-border-default bg-bg-card">
      <table className="w-full min-w-[64rem] border-collapse text-left">
        <caption className="sr-only">
          Prop firms ranked by the number of payouts verified against public
          blockchain transactions in the selected period.
        </caption>
        <thead>
          <tr className="border-b border-border-default bg-bg-elevated/50">
            <th scope="col" className={`${TH} w-16`}>
              #
            </th>
            <th scope="col" className={TH}>
              Firm
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Verified payouts
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Verified volume
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Largest single
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Average size
            </th>
            <th scope="col" className={TH}>
              Networks
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Latest
            </th>
            <th scope="col" className={`${TH} text-right`}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {firms.map((firm, index) => (
            <tr
              key={firm.firmSlug}
              className="border-b border-border-subtle last:border-0 hover:bg-bg-elevated/40"
            >
              <td className={`${TD} tabular-nums text-text-muted`}>
                {index + 1}
              </td>
              <td className={TD}>
                <span className="flex items-center gap-3">
                  <FirmAvatar name={firm.firmName} logoUrl={firm.logoUrl} />
                  <Link
                    href={`/payouts/${firm.firmSlug}?window=${window}`}
                    className="rounded font-medium text-text-primary hover:text-brand-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                  >
                    {firm.firmName}
                  </Link>
                </span>
              </td>
              <td
                className={`${TD} text-right font-semibold tabular-nums text-text-primary`}
              >
                {firm.count.toLocaleString("en")}
              </td>
              <td className={`${TD} text-right`}>
                <TokenColumn
                  tokens={firm.tokens}
                  pick={(t) => t.totalBaseUnits}
                />
              </td>
              <td className={`${TD} text-right`}>
                <TokenColumn
                  tokens={firm.tokens}
                  pick={(t) => t.largestBaseUnits}
                />
              </td>
              <td className={`${TD} text-right`}>
                <TokenColumn
                  tokens={firm.tokens}
                  pick={(t) => t.averageBaseUnits}
                />
              </td>
              <td className={TD}>
                <span className="flex flex-wrap gap-1">
                  {firm.networks.map((network) => (
                    <span
                      key={network}
                      className="whitespace-nowrap rounded-full border border-border-subtle px-2 py-0.5 text-xs text-text-muted"
                    >
                      {network}
                    </span>
                  ))}
                </span>
              </td>
              <td className={`${TD} whitespace-nowrap text-right`}>
                {formatDate(firm.latestAt) ?? "—"}
              </td>
              <td className={`${TD} text-right`}>
                <Link
                  href={`/payouts/${firm.firmSlug}?window=${window}`}
                  className="inline-flex whitespace-nowrap rounded-[10px] border border-border-default px-3 py-1.5 text-xs font-medium text-text-primary hover:border-brand-cyan/50 hover:text-brand-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A labelled figure. Renders "Not recorded" rather than a zero or a guess. */
export function StatCard({
  label,
  children,
  note,
}: {
  label: string;
  children: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="rounded-[14px] border border-border-default bg-bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <div className="mt-1.5 text-lg font-semibold tabular-nums text-text-primary">
        {children}
      </div>
      {note ? <p className="mt-1 text-xs text-text-muted">{note}</p> : null}
    </div>
  );
}

export function NotRecorded() {
  return (
    <span className="text-sm font-normal italic text-text-muted">
      Not recorded
    </span>
  );
}

/** Per-asset stat body: one line per token, never one merged number. */
export function TokenLines({
  tokens,
  pick,
}: {
  tokens: RankedFirmToken[];
  pick: (token: RankedFirmToken) => string;
}) {
  if (tokens.length === 0) return <NotRecorded />;
  return (
    <span className="flex flex-col gap-0.5">
      {tokens.map((token) => (
        <TokenAmount key={token.symbol} baseUnits={pick(token)} token={token} />
      ))}
    </span>
  );
}

/**
 * Verified payouts per month.
 *
 * A server-rendered SVG rather than a charting library: it is a bar series and
 * a running line, it must appear in the HTML for a crawler, and shipping a
 * charting runtime to draw it would cost more than the whole page (CLAUDE.md
 * §7). The table underneath is the accessible equivalent, not a fallback.
 */
export function PayoutTrend({ months }: { months: PayoutMonth[] }) {
  if (months.length === 0) return null;

  const width = 720;
  const height = 220;
  const padding = { top: 16, right: 8, bottom: 28, left: 8 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const peak = Math.max(...months.map((m) => m.count), 1);
  const finalTotal = months[months.length - 1]?.cumulative ?? 0;
  const slot = plotWidth / months.length;
  const barWidth = Math.max(4, Math.min(48, slot * 0.55));

  const linePoints = months
    .map((month, i) => {
      const x = padding.left + slot * i + slot / 2;
      const y =
        padding.top +
        plotHeight -
        (finalTotal === 0 ? 0 : (month.cumulative / finalTotal) * plotHeight);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const monthLabel = (month: string) => {
    const [year, m] = month.split("-");
    return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1]} ’${year?.slice(2)}`;
  };

  return (
    <figure className="rounded-[14px] border border-border-default bg-bg-card p-5">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-text-primary">
          Verified payouts per month
        </h3>
        <p className="text-xs text-text-muted">
          Counts, not value — assets are never added together
        </p>
      </figcaption>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-4 h-56 w-full"
        role="img"
        aria-label={`Verified payouts per month, from ${monthLabel(months[0]!.month)} to ${monthLabel(months[months.length - 1]!.month)}. Peak ${peak} in a month, ${finalTotal} in total.`}
      >
        {months.map((month, i) => {
          const barHeight = (month.count / peak) * plotHeight;
          const x = padding.left + slot * i + (slot - barWidth) / 2;
          return (
            <rect
              key={month.month}
              x={x.toFixed(1)}
              y={(padding.top + plotHeight - barHeight).toFixed(1)}
              width={barWidth.toFixed(1)}
              height={Math.max(barHeight, month.count > 0 ? 2 : 0).toFixed(1)}
              rx="3"
              className="fill-brand-blue/70"
            />
          );
        })}

        <polyline
          points={linePoints}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-brand-cyan"
        />

        {months.map((month, i) => {
          // Thin out labels on a long series rather than overlapping them.
          const every = Math.ceil(months.length / 8);
          if (i % every !== 0 && i !== months.length - 1) return null;
          return (
            <text
              key={month.month}
              x={(padding.left + slot * i + slot / 2).toFixed(1)}
              y={height - 8}
              textAnchor="middle"
              className="fill-[var(--color-text-metadata)] text-[11px]"
            >
              {monthLabel(month.month)}
            </text>
          );
        })}
      </svg>

      <p className="mt-2 text-xs text-text-muted">
        Bars are payouts verified in that month; the line is the running total.
      </p>
    </figure>
  );
}

/** The firm header on a detail page. */
export function FirmPayoutHeader({ firm }: { firm: FirmPayoutProfile }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <FirmAvatar name={firm.firmName} logoUrl={firm.logoUrl} />
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-text-primary sm:text-3xl">
          {firm.firmName} payouts
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Verified on-chain payouts only.{" "}
          <Link
            href={`/prop-firms/${firm.firmSlug}`}
            className="rounded text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
          >
            Full firm profile
          </Link>
        </p>
      </div>
    </div>
  );
}
