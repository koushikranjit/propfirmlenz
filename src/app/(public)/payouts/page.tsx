import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/public/JsonLd";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { EmptyState } from "@/components/ui/primitives";
import { getDb } from "@/lib/db/client";
import {
  type PayoutWindow,
  getPayoutTotals,
  listFirmPayoutLeaderboard,
  listRecentVerifiedPayouts,
} from "@/lib/repositories/public-payouts";
import {
  buildBreadcrumbLd,
  buildMetadata,
  buildWebPageLd,
} from "@/lib/seo/metadata";
import {
  PayoutTable,
  PayoutTotalsStrip,
  WindowTabs,
} from "@/components/public/payouts/PayoutViews";
import { PayoutLeaderboard } from "@/components/public/payouts/Leaderboard";

/**
 * Verified on-chain payouts — docs/PAYOUTS.md §9.
 *
 * Every figure is computed live from `verified_payouts`. When nothing has been
 * verified the page says so; it never falls back to a firm-reported number.
 */
export const dynamic = "force-dynamic";

const WINDOWS: PayoutWindow[] = ["24h", "7d", "30d", "all"];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function readWindow(value: string | string[] | undefined): PayoutWindow {
  const raw = Array.isArray(value) ? value[0] : value;
  return WINDOWS.includes(raw as PayoutWindow) ? (raw as PayoutWindow) : "30d";
}

/**
 * NOINDEX WHILE EMPTY — docs/SEO.md §9.
 *
 * With nothing verified, this page is a methodology summary and an empty state.
 * That is honest for a reader who arrives, but it is a thin page for a crawler,
 * and it disappears from the sitemap for the same reason. It becomes indexable
 * the moment there is a payout to show.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { count } = await getPayoutTotals(getDb(), "all");
  return buildMetadata({
    path: "/payouts",
    title: "Blockchain-verified prop firm payouts",
    description:
      "Prop firm payouts verified against public blockchain transactions. Every figure links to the transaction it came from, and covers only what can be proved on-chain.",
    ...(count === 0 ? { noindex: true } : {}),
  });
}

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const window = readWindow(params.window);
  const db = getDb();

  const [totals, recent, firms] = await Promise.all([
    getPayoutTotals(db, window),
    listRecentVerifiedPayouts(db, { window, limit: 25 }),
    listFirmPayoutLeaderboard(db, { window, limit: 50 }),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Breadcrumbs
        items={[{ label: "Home", href: "/" }, { label: "Payouts" }]}
      />

      <header className="max-w-prose">
        <h1 className="text-2xl font-semibold text-text-primary sm:text-3xl">
          Blockchain-verified payouts
        </h1>
        <p className="mt-2 text-text-secondary">
          Payouts we can prove. Each one is a real blockchain transaction from a
          wallet recorded as belonging to the firm, and every row links to the
          transaction so you can check it yourself.
        </p>
        <p className="mt-3 text-sm text-text-muted">
          These are verified <strong>on-chain</strong> payouts only — a floor,
          not a total. Firms also pay by bank transfer, card and processors, and
          through wallets nobody has identified.{" "}
          <Link
            href="/payouts/methodology"
            className="rounded text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
          >
            How verification works
          </Link>
          .
        </p>
      </header>

      <WindowTabs current={window} />
      <PayoutTotalsStrip totals={totals} />

      {recent.length === 0 ? (
        <div className="mt-8 rounded-[14px] border border-border-default bg-bg-card">
          <EmptyState
            title="No verified payouts yet"
            description="Nothing has passed blockchain verification for this period. Rather than showing figures a firm reports about itself, this page stays empty until there is a transaction anyone can check."
            action={
              <Link
                href="/payouts/methodology"
                className="rounded-[10px] border border-border-default bg-bg-elevated px-4 py-2 text-sm font-medium text-text-primary hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
              >
                Read the methodology
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <section aria-labelledby="recent" className="mt-10">
            <h2 id="recent" className="text-lg font-semibold text-text-primary">
              Latest verified payouts
            </h2>
            <div className="mt-4">
              <PayoutTable payouts={recent} />
            </div>
          </section>

          {firms.length > 0 ? (
            <section aria-labelledby="by-firm" className="mt-10">
              <h2
                id="by-firm"
                className="text-lg font-semibold text-text-primary"
              >
                Verified payouts by firm
              </h2>
              <p className="mt-1 max-w-prose text-sm text-text-muted">
                Ranked by how many payouts we have verified, not by volume — one
                large transfer should not outrank a hundred smaller ones on a
                figure that is already a floor. Amounts are listed per token,
                because different assets are never added together.
              </p>
              <div className="mt-4">
                <PayoutLeaderboard rows={firms} />
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
