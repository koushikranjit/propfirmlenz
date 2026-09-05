import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/public/JsonLd";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { EmptyState } from "@/components/ui/primitives";
import { getDb } from "@/lib/db/client";
import {
  type PayoutWindow,
  getPayoutTotals,
  listRecentVerifiedPayouts,
} from "@/lib/repositories/public-payouts";
import {
  type RankingSort,
  listPayoutAssets,
  listPayoutFirmRanking,
  listPayoutMonths,
} from "@/lib/repositories/payout-tracker";
import {
  buildBreadcrumbLd,
  buildMetadata,
  buildWebPageLd,
} from "@/lib/seo/metadata";
import { PayoutTable } from "@/components/public/payouts/PayoutViews";
import {
  AssetTabs,
  FirmRankingTable,
  FirmSearch,
  PayoutTrend,
  StatStrip,
  type TrackerQuery,
  WINDOWS,
  WINDOW_LABEL,
  WindowTabs,
} from "@/components/public/payouts/Tracker";

/**
 * THE PAYOUT TRACKER — docs/PAYOUTS.md §9.
 *
 * Every figure is computed live from `verified_payouts`. When nothing has been
 * verified the page says so; it never falls back to a firm-reported number.
 *
 * An original Prop Firm Lenz page, built from the docs/DESIGN.md tokens. It
 * carries only columns this database can actually answer: no payout waiting
 * time, account size, percentage return or recipient region, none of which a
 * blockchain transfer reveals (§9.1 `[LOCKED]`).
 */
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SORTS: RankingSort[] = [
  "payouts",
  "latest",
  "name",
  "volume",
  "largest",
  "average",
];

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

function readQuery(params: Record<string, string | string[] | undefined>): {
  query: TrackerQuery;
  filtered: boolean;
} {
  const rawWindow = one(params.window);
  const rawSort = one(params.sort);
  const q = one(params.q)?.trim().slice(0, 80) || undefined;
  const asset = one(params.asset)?.trim().slice(0, 16).toUpperCase() || undefined;

  return {
    query: {
      window: WINDOWS.includes(rawWindow as PayoutWindow)
        ? (rawWindow as PayoutWindow)
        : "30d",
      sort: SORTS.includes(rawSort as RankingSort)
        ? (rawSort as RankingSort)
        : "payouts",
      ...(asset ? { asset } : {}),
      ...(q ? { q } : {}),
    },
    filtered: Boolean(rawWindow || rawSort || q || asset),
  };
}

/**
 * NOINDEX WHILE EMPTY — docs/SEO.md §9.
 *
 * With nothing verified, this page is a methodology summary and an empty state
 * — honest for a reader, thin for a crawler, and it leaves the sitemap for the
 * same reason. It becomes indexable the moment there is a payout to show.
 *
 * A windowed, sorted, filtered or searched view is noindex whatever the data:
 * the canonical payouts page is the unfiltered one, and near-duplicate
 * parameter URLs must not compete with it (docs/SEO.md §4).
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { filtered } = readQuery(await searchParams);
  const { count } = await getPayoutTotals(getDb(), "all");

  return buildMetadata({
    path: "/payouts",
    title: "Blockchain-verified prop firm payouts",
    description:
      "Prop firm payouts verified against public blockchain transactions. Every figure links to the transaction it came from, and covers only what can be proved on-chain.",
    ...(count === 0 || filtered ? { noindex: true } : {}),
  });
}

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { query } = readQuery(await searchParams);
  const db = getDb();

  const [totals, firms, assets, recent, months] = await Promise.all([
    getPayoutTotals(db, query.window),
    // `q` is the URL's name for it; the repository calls it `query`. Mapped
    // explicitly rather than spread, so a rename cannot silently drop the
    // search and quietly return every firm instead.
    listPayoutFirmRanking(db, {
      window: query.window,
      sort: query.sort,
      asset: query.asset,
      query: query.q,
      limit: 50,
    }),
    listPayoutAssets(db, { window: query.window }),
    listRecentVerifiedPayouts(db, { window: query.window, limit: 15 }),
    listPayoutMonths(db, { months: 12 }),
  ]);

  const usd = (value: string | null) =>
    value === null
      ? null
      : `$${Number(value).toLocaleString("en", { maximumFractionDigits: 0 })}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Breadcrumbs
        items={[{ label: "Home", href: "/" }, { label: "Payouts" }]}
      />

      <header className="max-w-3xl">
        <h1 className="text-2xl font-semibold text-text-primary sm:text-3xl">
          Prop firm payout tracker
        </h1>
        <p className="mt-3 text-text-secondary">
          Payouts we can prove. Each one is a real blockchain transaction sent
          from a wallet recorded as belonging to the firm, and every row links
          to the transaction so you can check it yourself.
        </p>
        <p className="mt-3 text-sm text-text-muted">
          These are verified <strong>on-chain</strong> payouts only — a floor,
          not a total. Firms also pay by bank transfer, card and processors, and
          from wallets nobody has identified.{" "}
          <Link
            href="/payouts/methodology"
            className="rounded text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
          >
            How verification works
          </Link>
          .
        </p>
      </header>

      <div className="mt-8 flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <WindowTabs
            current={query.window}
            basePath="/payouts"
            query={query}
          />
          <FirmSearch action="/payouts" query={query} />
        </div>
        <AssetTabs
          assets={assets}
          basePath="/payouts"
          query={query}
          total={totals.count}
        />
      </div>

      <div className="mt-6">
        <StatStrip
          stats={[
            {
              label: "Verified payouts",
              value: totals.count.toLocaleString("en"),
              note: WINDOW_LABEL[query.window],
            },
            {
              label: "Firms with payouts",
              value: firms.length.toLocaleString("en"),
              ...(query.asset ? { note: `Paying in ${query.asset}` } : {}),
            },
            {
              label: "Priced value",
              value:
                usd(totals.usdValue) ??
                ((
                  <span className="text-sm font-normal italic text-text-muted">
                    No recorded rates
                  </span>
                ) as React.ReactNode),
              ...(totals.usdValuedCount < totals.count
                ? {
                    note: `${totals.usdValuedCount} of ${totals.count} carry a recorded rate`,
                  }
                : {}),
            },
            {
              label: "Most recent",
              value:
                totals.latestAt === null ? (
                  <span className="text-sm font-normal italic text-text-muted">
                    None yet
                  </span>
                ) : (
                  new Date(totals.latestAt).toISOString().slice(0, 10)
                ),
            },
          ]}
        />
      </div>

      {firms.length === 0 ? (
        <div className="mt-8 rounded-[14px] border border-border-default bg-bg-card">
          <EmptyState
            title={
              query.q
                ? `No verified payouts for “${query.q}”`
                : "No verified payouts in this period"
            }
            description={
              query.q
                ? "No published firm matching that name has a verified payout in the selected period. Try a different name, or widen the period."
                : "Nothing has passed blockchain verification for this period. Rather than showing figures a firm reports about itself, this page stays empty until there is a transaction anyone can check."
            }
            action={
              <Link
                href="/payouts?window=all"
                className="rounded-full border border-border-default bg-bg-elevated px-4 py-2 text-sm font-medium text-text-primary hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
              >
                Show all time
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <section aria-labelledby="ranking" className="mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2
                id="ranking"
                className="text-lg font-semibold text-text-primary"
              >
                Firms by verified payouts
              </h2>
              <p className="text-xs text-text-muted">
                {query.asset
                  ? `Showing ${query.asset} only — amount columns are sortable`
                  : "Pick a single asset to sort by amount"}
              </p>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-text-muted">
              Ranked by how many payouts we have verified, not by volume — one
              large transfer should not outrank a hundred smaller ones on a
              figure that is already a floor. Amounts are listed per asset,
              because different tokens are never added together.
            </p>
            <div className="mt-4">
              <FirmRankingTable firms={firms} query={query} />
            </div>
          </section>

          {months.length > 1 ? (
            <section aria-labelledby="trend" className="mt-10">
              <h2 id="trend" className="sr-only">
                Verified payouts over time
              </h2>
              <PayoutTrend months={months} />
            </section>
          ) : null}

          {recent.length > 0 ? (
            <section aria-labelledby="recent" className="mt-10">
              <h2
                id="recent"
                className="text-lg font-semibold text-text-primary"
              >
                Latest verified payouts
              </h2>
              <div className="mt-4">
                <PayoutTable payouts={recent} />
              </div>
            </section>
          ) : null}
        </>
      )}

      <JsonLd
        data={[
          buildWebPageLd({
            path: "/payouts",
            name: "Blockchain-verified prop firm payouts",
            description:
              "Prop firm payouts verified against public blockchain transactions.",
          }),
          buildBreadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Payouts", path: "/payouts" },
          ]),
        ]}
      />
    </div>
  );
}
