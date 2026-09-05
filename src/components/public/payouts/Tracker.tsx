import Link from "next/link";
import type {
  FirmPayoutProfile,
  PayoutAsset,
  PayoutMonth,
  RankedFirm,
  RankedFirmToken,
  RankingSort,
} from "@/lib/repositories/payout-tracker";
import { isSortAvailable } from "@/lib/repositories/payout-tracker";
import type { PayoutWindow } from "@/lib/repositories/public-payouts";
import { formatBaseUnits } from "@/lib/blockchain/provider";
import { formatDate } from "@/lib/view/format";

/**
 * THE PAYOUT TRACKER UI — docs/PAYOUTS.md §9, docs/DESIGN.md §2.
 *
 * An original Prop Firm Lenz surface. The information architecture follows the
 * conventions of this kind of tracker — a dense ranking table, period chips, a
 * segmented stat strip, a trend chart — which docs/DESIGN.md §11 and CLAUDE.md
 * §12.2b permit. The palette, components, wording and columns are ours;
 * reproducing a competitor's screen is `[LOCKED]` shut (§12.2 rule 6).
 *
 * PALETTE CONSTRAINTS APPLIED (docs/DESIGN.md §2.5, measured not assumed):
 *  - `text-metadata` (#737A89) FAILS AA on `bg-card` and `bg-elevated`, so
 *    every label on a card uses `text-muted` (#9298A8) instead.
 *  - Indigo and violet fail on card surfaces; neither is used for text.
 *  - The gradient appears once per view, on the volume bar — §2.2 permits it
 *    for "data visualisation that genuinely spans a range", which is what a
 *    share-of-leader bar is.
 *
 * THREE DATA RULES THIS FILE KEEPS `[LOCKED]`:
 *  1. Amounts render from the base-unit integer through `formatBaseUnits`,
 *     never by dividing a JavaScript number.
 *  2. Assets are never added together, and never compared to each other.
 *  3. Nothing is labelled a "total". These are on-chain payouts from wallets
 *     we happen to track — a floor, never a firm's payout volume.
 */

export const WINDOW_LABEL: Record<PayoutWindow, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "365d": "Last 365 days",
  all: "All time",
};

export const WINDOWS: PayoutWindow[] = ["24h", "7d", "30d", "365d", "all"];

export interface TrackerQuery {
  window: PayoutWindow;
  sort: RankingSort;
  asset?: string | undefined;
  q?: string | undefined;
}

/** Builds a tracker URL, dropping anything at its default. */
export function trackerHref(
  basePath: string,
  query: TrackerQuery,
  override: Partial<TrackerQuery> = {},
): string {
  const next = { ...query, ...override };
  const params = new URLSearchParams({ window: next.window });
  if (next.sort !== "payouts") params.set("sort", next.sort);
  if (next.asset) params.set("asset", next.asset);
  if (next.q) params.set("q", next.q);
  return `${basePath}?${params.toString()}`;
}

/* -------------------------------------------------------------- primitives */

const CHIP_BASE =
  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base";

const CHIP_ON = "border-brand-cyan/50 bg-brand-cyan/10 text-brand-cyan";
const CHIP_OFF =
  "border-border-default bg-bg-card text-text-secondary hover:border-border-strong hover:text-text-primary";

function Chip({
  href,
  active,
  children,
  count,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`${CHIP_BASE} ${active ? CHIP_ON : CHIP_OFF}`}
    >
      {children}
      {count === undefined ? null : (
        <span
          className={
            "rounded-full px-1.5 text-xs tabular-nums " +
            (active ? "bg-brand-cyan/15" : "bg-bg-elevated text-text-muted")
          }
        >
          {count.toLocaleString("en")}
        </span>
      )}
    </Link>
  );
}

/** Period chips. Real anchors, so they work without JavaScript. */
export function WindowTabs({
  current,
  basePath,
  query,
}: {
  current: PayoutWindow;
  basePath: string;
  query?: TrackerQuery | undefined;
}) {
  return (
    <nav aria-label="Time period">
      <ul className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {WINDOWS.map((window) => (
          <li key={window}>
            <Chip
              href={
                query
                  ? trackerHref(basePath, query, { window })
                  : `${basePath}?window=${window}`
              }
              active={window === current}
            >
              {WINDOW_LABEL[window]}
            </Chip>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Asset chips.
 *
 * Selecting one is not only a filter — it is what makes the amount columns
 * sortable, because within a single asset the numbers are finally comparable.
 */
export function AssetTabs({
  assets,
  basePath,
  query,
  total,
}: {
  assets: PayoutAsset[];
  basePath: string;
  query: TrackerQuery;
  total: number;
}) {
  if (assets.length < 2) return null;
  return (
    <nav aria-label="Asset">
      <ul className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <li>
          <Chip
            href={trackerHref(basePath, query, {
              asset: undefined,
              sort: isSortAvailable(query.sort) ? query.sort : "payouts",
            })}
            active={!query.asset}
            count={total}
          >
            All assets
          </Chip>
        </li>
        {assets.map((asset) => (
          <li key={asset.symbol}>
            <Chip
              href={trackerHref(basePath, query, { asset: asset.symbol })}
              active={query.asset === asset.symbol}
              count={asset.count}
            >
              {asset.symbol}
            </Chip>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Name search. A GET form, so it works with JavaScript disabled. */
export function FirmSearch({
  action,
  query,
}: {
  action: string;
  query: TrackerQuery;
}) {
  return (
    <form action={action} className="flex w-full gap-2 sm:w-auto">
      <input type="hidden" name="window" value={query.window} />
      {query.asset ? (
        <input type="hidden" name="asset" value={query.asset} />
      ) : null}
      {query.sort !== "payouts" ? (
        <input type="hidden" name="sort" value={query.sort} />
      ) : null}
      <label htmlFor="payout-firm-search" className="sr-only">
        Search firms by name
      </label>
      <input
        id="payout-firm-search"
        name="q"
        type="search"
        defaultValue={query.q ?? ""}
        placeholder="Search firms…"
        className="h-10 w-full min-w-0 rounded-full border border-border-default bg-bg-card px-4 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base sm:w-64"
      />
      <button
        type="submit"
        className="h-10 shrink-0 rounded-full border border-border-default bg-bg-elevated px-4 text-sm font-medium text-text-primary hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
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
  size = 40,
}: {
  name: string;
  logoUrl: string | null;
  size?: number;
}) {
  const box = size === 40 ? "size-10" : "size-14";
  if (logoUrl) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element -- a firm's logo is an uploaded remote asset at an unknown host, shown as uploaded and never re-encoded (CLAUDE.md §12.2 rule 9). */
      <img
        src={logoUrl}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className={`${box} shrink-0 rounded-[10px] border border-border-subtle bg-bg-near-black object-contain`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${box} flex shrink-0 items-center justify-center rounded-[10px] border border-border-subtle bg-bg-elevated font-semibold text-text-muted`}
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
    <span className="whitespace-nowrap tabular-nums text-text-primary">
      {formatBaseUnits(baseUnits, token.decimals)}{" "}
      <span className="text-xs font-medium text-text-muted">
        {token.symbol}
      </span>
    </span>
  );
}

function TokenLines({
  tokens,
  pick,
}: {
  tokens: RankedFirmToken[];
  pick: (token: RankedFirmToken) => string;
}) {
  if (tokens.length === 0) return <NotRecorded />;
  return (
    <span className="flex flex-col gap-0.5 text-sm">
      {tokens.map((token) => (
        <TokenAmount key={token.symbol} baseUnits={pick(token)} token={token} />
      ))}
    </span>
  );
}

export function NotRecorded() {
  return (
    <span className="text-sm font-normal italic text-text-muted">
      Not recorded
    </span>
  );
}

/* ------------------------------------------------------------ the ranking */

const TH =
  "px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted";
const TD = "px-4 py-4 align-middle text-sm text-text-secondary";

/** A sortable column header, or a plain one where the sort is unavailable. */
function SortHeader({
  label,
  sort,
  query,
  align = "right",
  hint,
}: {
  label: string;
  sort: RankingSort;
  query: TrackerQuery;
  align?: "left" | "right";
  hint?: string;
}) {
  const available = isSortAvailable(sort, query.asset);
  const active = query.sort === sort;
  const justify = align === "right" ? "justify-end" : "justify-start";

  if (!available) {
    return (
      <th scope="col" className={`${TH} ${align === "right" ? "text-right" : ""}`}>
        <span className={`flex items-center gap-1 ${justify}`} title={hint}>
          {label}
          {/* Says WHY it cannot be sorted, rather than looking broken. */}
          <span aria-hidden className="text-text-muted/60">
            ·
          </span>
          <span className="sr-only">
            Sorting by this column needs a single asset selected, because
            amounts in different assets are not comparable.
          </span>
        </span>
      </th>
    );
  }

  return (
    <th
      scope="col"
      className={`${TH} ${align === "right" ? "text-right" : ""}`}
      aria-sort={active ? "descending" : "none"}
    >
      <Link
        href={trackerHref("/payouts", query, { sort })}
        className={`flex items-center gap-1 rounded ${justify} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan ${
          active ? "text-brand-cyan" : "hover:text-text-primary"
        }`}
      >
        {label}
        <span aria-hidden className="text-[9px] leading-none">
          {active ? "▼" : "⇅"}
        </span>
      </Link>
    </th>
  );
}

/**
 * The ranking table.
 *
 * Rank is the row's position in THIS ordering — a description of the table,
 * not a score, a rating, or an endorsement (docs/PAYOUTS.md §9.1 `[LOCKED]`).
 */
export function FirmRankingTable({
  firms,
  query,
}: {
  firms: RankedFirm[];
  query: TrackerQuery;
}) {
  // The bar is share-of-leader within the CURRENT ordering, so it always
  // describes the column the table is sorted by rather than a hidden one.
  const leader = Math.max(...firms.map((f) => f.count), 1);

  return (
    <div className="overflow-x-auto rounded-[14px] border border-border-default bg-bg-card">
      <table className="w-full min-w-[68rem] border-collapse text-left">
        <caption className="sr-only">
          Prop firms ranked by payouts verified against public blockchain
          transactions in the selected period.
        </caption>
        <thead>
          <tr className="border-b border-border-default bg-bg-near-black">
            <th scope="col" className={`${TH} w-14`}>
              #
            </th>
            <SortHeader label="Firm" sort="name" query={query} align="left" />
            <SortHeader label="Verified payouts" sort="payouts" query={query} />
            <SortHeader
              label="Verified volume"
              sort="volume"
              query={query}
              hint="Pick a single asset to sort by amount"
            />
            <SortHeader
              label="Largest single"
              sort="largest"
              query={query}
              hint="Pick a single asset to sort by amount"
            />
            <SortHeader
              label="Average size"
              sort="average"
              query={query}
              hint="Pick a single asset to sort by amount"
            />
            <th scope="col" className={TH}>
              Networks
            </th>
            <SortHeader label="Latest" sort="latest" query={query} />
            <th scope="col" className={`${TH} text-right`}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {firms.map((firm, index) => {
            const href = trackerHref(`/payouts/${firm.firmSlug}`, {
              ...query,
              sort: "payouts",
              q: undefined,
            });
            return (
              <tr
                key={firm.firmSlug}
                className="border-b border-border-subtle transition-colors last:border-0 hover:bg-bg-elevated/50"
              >
                <td className={`${TD} tabular-nums text-text-muted`}>
                  {index + 1}
                </td>

                <td className={TD}>
                  <span className="flex items-center gap-3">
                    <FirmAvatar name={firm.firmName} logoUrl={firm.logoUrl} />
                    <span className="flex min-w-0 flex-col">
                      <Link
                        href={href}
                        className="rounded font-semibold text-text-primary hover:text-brand-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                      >
                        {firm.firmName}
                      </Link>
                      <span className="text-xs text-text-muted">
                        {firm.tokens.map((t) => t.symbol).join(" · ")}
                        {firm.firstAt
                          ? ` · since ${formatDate(firm.firstAt)}`
                          : ""}
                      </span>
                    </span>
                  </span>
                </td>

                <td className={`${TD} text-right`}>
                  <span className="flex flex-col items-end gap-1.5">
                    <span className="text-base font-semibold tabular-nums text-text-primary">
                      {firm.count.toLocaleString("en")}
                    </span>
                    {/* Share of the leading firm. The gradient is permitted
                        here as data visualisation spanning a range
                        (docs/DESIGN.md §2.2). */}
                    <span
                      aria-hidden
                      className="block h-1 w-24 overflow-hidden rounded-full bg-bg-elevated"
                    >
                      <span
                        className="block h-full rounded-full bg-[image:var(--gradient-brand)]"
                        style={{
                          width: `${Math.max(4, (firm.count / leader) * 100)}%`,
                        }}
                      />
                    </span>
                  </span>
                </td>

                <td className={`${TD} text-right`}>
                  <TokenLines
                    tokens={firm.tokens}
                    pick={(t) => t.totalBaseUnits}
                  />
                </td>
                <td className={`${TD} text-right`}>
                  <TokenLines
                    tokens={firm.tokens}
                    pick={(t) => t.largestBaseUnits}
                  />
                </td>
                <td className={`${TD} text-right`}>
                  <TokenLines
                    tokens={firm.tokens}
                    pick={(t) => t.averageBaseUnits}
                  />
                </td>

                <td className={TD}>
                  <span className="flex flex-wrap gap-1">
                    {firm.networks.map((network) => (
                      <span
                        key={network}
                        className="whitespace-nowrap rounded-full border border-border-subtle bg-bg-near-black px-2 py-0.5 text-xs text-text-muted"
                      >
                        {network}
                      </span>
                    ))}
                  </span>
                </td>

                <td
                  className={`${TD} whitespace-nowrap text-right text-text-muted`}
                >
                  {formatDate(firm.latestAt) ?? "—"}
                </td>

                <td className={`${TD} text-right`}>
                  <Link
                    href={href}
                    className="inline-flex whitespace-nowrap rounded-full border border-border-default px-4 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:border-brand-cyan/50 hover:bg-brand-cyan/10 hover:text-brand-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
                  >
                    View
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------- the stat strip */

export interface Stat {
  label: string;
  value: React.ReactNode;
  note?: string | undefined;
}

/**
 * One bordered strip divided into segments, rather than separate cards.
 *
 * These figures are read together — a count means little without the period it
 * covers — so they share a container and are separated by hairlines. It wraps
 * to a grid below `lg`, where a single scrolling row would be unreadable.
 */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-[14px] border border-border-default bg-bg-card sm:grid-cols-3 lg:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="border-b border-r border-border-subtle p-4 last:border-r-0"
        >
          <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
            {stat.label}
          </dt>
          <dd className="mt-1.5 text-lg font-semibold tabular-nums text-text-primary">
            {stat.value}
          </dd>
          {stat.note ? (
            <p className="mt-1 text-xs text-text-muted">{stat.note}</p>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

/** A standalone figure, for places the strip would be overkill. */
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
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
        {label}
      </p>
      <div className="mt-1.5 text-lg font-semibold tabular-nums text-text-primary">
        {children}
      </div>
      {note ? <p className="mt-1 text-xs text-text-muted">{note}</p> : null}
    </div>
  );
}

export { TokenLines };

/* ---------------------------------------------------------------- the chart */

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ’${year?.slice(2)}`;
}

/**
 * Verified payouts per month, with a cumulative line.
 *
 * A server-rendered SVG rather than a charting library: it is a bar series and
 * a running line, it must be in the HTML for a crawler, and shipping a charting
 * runtime to draw it would cost more than the whole page (CLAUDE.md §7). The
 * gridlines are labelled, so the bars can be read as values rather than shapes.
 */
export function PayoutTrend({ months }: { months: PayoutMonth[] }) {
  if (months.length === 0) return null;

  const width = 960;
  const height = 300;
  const pad = { top: 20, right: 16, bottom: 34, left: 48 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const peak = Math.max(...months.map((m) => m.count), 1);
  // A round ceiling, so the gridline labels are readable numbers.
  const step = Math.max(1, Math.ceil(peak / 4));
  const ceiling = step * 4;
  const finalTotal = months[months.length - 1]?.cumulative ?? 0;

  const slot = plotW / months.length;
  const barW = Math.max(6, Math.min(44, slot * 0.5));
  const y = (value: number) => pad.top + plotH - (value / ceiling) * plotH;

  const linePoints = months
    .map((m, i) => {
      const x = pad.left + slot * i + slot / 2;
      const value = finalTotal === 0 ? 0 : (m.cumulative / finalTotal) * ceiling;
      return `${x.toFixed(1)},${y(value).toFixed(1)}`;
    })
    .join(" ");

  const labelEvery = Math.ceil(months.length / 8);

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
        className="mt-4 h-64 w-full sm:h-72"
        role="img"
        aria-label={`Verified payouts per month from ${monthLabel(months[0]!.month)} to ${monthLabel(months[months.length - 1]!.month)}. Peak ${peak} in a month; ${finalTotal} verified in total.`}
      >
        {[0, 1, 2, 3, 4].map((i) => {
          const value = step * i;
          return (
            <g key={value}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y(value)}
                y2={y(value)}
                className="stroke-[var(--color-border-subtle)]"
                strokeWidth="1"
              />
              <text
                x={pad.left - 8}
                y={y(value) + 4}
                textAnchor="end"
                className="fill-[var(--color-text-muted)] text-[11px]"
              >
                {value}
              </text>
            </g>
          );
        })}

        {months.map((month, i) => {
          const barH = (month.count / ceiling) * plotH;
          const x = pad.left + slot * i + (slot - barW) / 2;
          return (
            <rect
              key={month.month}
              x={x.toFixed(1)}
              y={(pad.top + plotH - barH).toFixed(1)}
              width={barW.toFixed(1)}
              height={Math.max(barH, month.count > 0 ? 2 : 0).toFixed(1)}
              rx="4"
              className="fill-brand-blue/60"
            >
              <title>{`${monthLabel(month.month)}: ${month.count} verified`}</title>
            </rect>
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

        {months.map((month, i) =>
          i % labelEvery !== 0 && i !== months.length - 1 ? null : (
            <text
              key={month.month}
              x={(pad.left + slot * i + slot / 2).toFixed(1)}
              y={height - 10}
              textAnchor="middle"
              className="fill-[var(--color-text-muted)] text-[11px]"
            >
              {monthLabel(month.month)}
            </text>
          ),
        )}
      </svg>

      <p className="mt-3 flex flex-wrap items-center gap-4 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 rounded-[2px] bg-brand-blue/60"
          />
          Verified that month
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-full bg-brand-cyan" />
          Running total
        </span>
      </p>
    </figure>
  );
}

/* ------------------------------------------------------------- firm header */

export function FirmPayoutHeader({ firm }: { firm: FirmPayoutProfile }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <FirmAvatar name={firm.firmName} logoUrl={firm.logoUrl} size={56} />
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-text-primary sm:text-3xl">
          {firm.firmName}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Blockchain-verified payouts ·{" "}
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

/* -------------------------------------------------------------- pagination */

/** Previous/next over a windowed list. Real links, no JavaScript. */
export function Pager({
  basePath,
  window,
  page,
  hasNext,
}: {
  basePath: string;
  window: PayoutWindow;
  page: number;
  hasNext: boolean;
}) {
  if (page === 1 && !hasNext) return null;

  const href = (next: number) =>
    `${basePath}?window=${window}${next > 1 ? `&page=${next}` : ""}#transactions`;
  const style =
    "inline-flex rounded-full border border-border-default px-4 py-1.5 text-xs font-semibold text-text-primary hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base";

  return (
    <nav
      aria-label="Transaction pages"
      className="mt-4 flex items-center justify-between gap-3"
    >
      {page > 1 ? (
        <Link href={href(page - 1)} className={style} rel="prev">
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-xs text-text-muted">Page {page}</span>
      {hasNext ? (
        <Link href={href(page + 1)} className={style} rel="next">
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
