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
  FirmRankingTable,
  FirmSearch,
  PayoutTrend,
  StatCard,
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
 * An original Prop Firm Lenz page, built from the docs/DESIGN.md tokens — not a
 * reproduction of a competitor's tracker (CLAUDE.md §12.2 rule 6 `[LOCKED]`).
 * It carries only columns this database can actually answer: no payout waiting
 * time, account size, percentage return or recipient region, none of which a
 * blockchain transfer reveals.
 */
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function readWindow(value: string | string[] | undefined): PayoutWindow {
  const raw = Array.isArray(value) ? value[0] : value;
  return WINDOWS.includes(raw as PayoutWindow) ? (raw as PayoutWindow) : "30d";
}

function readQuery(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim().slice(0, 80);
  return trimmed ? trimmed : undefined;
}

/**
 * NOINDEX WHILE EMPTY — docs/SEO.md §9.
 *
 * With nothing verified, this page is a methodology summary and an empty state.
 * That is honest for a reader who arrives, but it is a thin page for a crawler,
 * and it disappears from the sitemap for the same reason. It becomes indexable
 * the moment there is a payout to show.
 *
 * A windowed or searched view is noindex whatever the data: the canonical
 * payouts page is the unfiltered one, and near-duplicate parameter URLs must
 * not compete with it (docs/SEO.md §4).
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const params = await searchParams;
  const filtered = Boolean(readQuery(params.q)) || Boolean(params.window);
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
  const params = await searchParams;
  const window = readWindow(params.window);
  const query = readQuery(params.q);
  const db = getDb();

  const [totals, firms, recent, months] = await Promise.all([
    getPayoutTotals(db, window),
    listPayoutFirmRanking(db, {
      window,
      limit: 50,
      ...(query ? { query } : {}),
    }),
    listRecentVerifiedPayouts(db, { window, limit: 15 }),
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

      <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <WindowTabs current={window} basePath="/payouts" query={query} />
        <FirmSearch action="/payouts" window={window} query={query} />
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Verified payouts">
          {totals.count.toLocaleString("en")}
        </StatCard>
        <StatCard label="Firms with payouts">
          {firms.length.toLocaleString("en")}
        </StatCard>
        <StatCard
          label="Priced value"
          {...(totals.usdValuedCount < totals.count
            ? {
                note: `${totals.usdValuedCount} of ${totals.count} carry a recorded rate`,
              }
            : {})}
        >
          {usd(totals.usdValue) ?? (
            <span className="text-sm font-normal italic text-text-muted">
              No recorded rates
            </span>
          )}
        </StatCard>
        <StatCard label="Period">
          <span className="text-base">{WINDOW_LABEL[window]}</span>
        </StatCard>
      </dl>

      {firms.length === 0 ? (
        <div className="mt-8 rounded-[14px] border border-border-default bg-bg-card">
          <EmptyState
            title={
              query
                ? `No verified payouts for “${query}”`
                : "No verified payouts in this period"
            }
            description={
              query
                ? "No published firm matching that name has a verified payout in the selected period. Try a different name, or widen the period."
                : "Nothing has passed blockchain verification for this period. Rather than showing figures a firm reports about itself, this page stays empty until there is a transaction anyone can check."
            }
            action={
              <Link
                href="/payouts?window=all"
                className="rounded-[10px] border border-border-default bg-bg-elevated px-4 py-2 text-sm font-medium text-text-primary hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
              >
                Show all time
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <section aria-labelledby="ranking" className="mt-10">
            <h2
              id="ranking"
              className="text-lg font-semibold text-text-primary"
            >
              Firms by verified payouts
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-text-muted">
              Ranked by how many payouts we have verified, not by volume — one
              large transfer should not outrank a hundred smaller ones on a
              figure that is already a floor. Amounts are listed per asset,
              because different tokens are never added together.
            </p>
            <div className="mt-4">
              <FirmRankingTable firms={firms} window={window} />
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
