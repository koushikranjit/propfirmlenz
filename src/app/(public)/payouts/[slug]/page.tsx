import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/public/JsonLd";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { EmptyState } from "@/components/ui/primitives";
import { getDb } from "@/lib/db/client";
import {
  type PayoutWindow,
  listRecentVerifiedPayouts,
} from "@/lib/repositories/public-payouts";
import {
  getFirmPayoutProfile,
  listPayoutMonths,
} from "@/lib/repositories/payout-tracker";
import {
  buildBreadcrumbLd,
  buildMetadata,
  buildWebPageLd,
} from "@/lib/seo/metadata";
import { PayoutTable } from "@/components/public/payouts/PayoutViews";
import {
  FirmPayoutHeader,
  NotRecorded,
  PayoutTrend,
  StatCard,
  TokenLines,
  WINDOWS,
  WINDOW_LABEL,
  WindowTabs,
} from "@/components/public/payouts/Tracker";
import { formatDate } from "@/lib/view/format";

/**
 * ONE FIRM'S VERIFIED PAYOUTS — docs/PAYOUTS.md §9.
 *
 * The detail behind a row of the tracker: what has been verified, on which
 * chains, in which assets, and every transaction that produced the figures.
 *
 * WHAT THIS PAGE WILL NOT SHOW `[LOCKED]`. Payout speed, account size,
 * percentage return, and where a recipient lives are not in this database and
 * are not derivable from a transfer. They are absent rather than approximated
 * (CLAUDE.md §3).
 *
 * A firm that is not published 404s here, exactly as it does on its profile —
 * this route must not become a way to probe for draft firms.
 */
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function readWindow(value: string | string[] | undefined): PayoutWindow {
  const raw = Array.isArray(value) ? value[0] : value;
  return WINDOWS.includes(raw as PayoutWindow) ? (raw as PayoutWindow) : "all";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const firm = await getFirmPayoutProfile(getDb(), { slug, window: "all" });

  if (!firm) {
    return buildMetadata({
      path: `/payouts/${slug}`,
      title: "Payouts not found",
      description: "This payout page does not exist.",
      noindex: true,
    });
  }

  return buildMetadata({
    path: `/payouts/${firm.firmSlug}`,
    title: `${firm.firmName} verified payouts`,
    description: `Blockchain-verified payouts from ${firm.firmName}, with the transaction behind every figure. Verified on-chain payouts only — a floor, not the firm's total payout volume.`,
    // A firm with nothing verified has no content here worth indexing, and
    // the empty state must not compete with its profile page.
    ...(firm.count === 0 ? { noindex: true } : {}),
  });
}

export default async function FirmPayoutsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const [{ slug }, search] = await Promise.all([params, searchParams]);
  const window = readWindow(search.window);
  const db = getDb();

  const firm = await getFirmPayoutProfile(db, { slug, window });
  if (!firm) notFound();

  const [payouts, months] = await Promise.all([
    listRecentVerifiedPayouts(db, { firmId: firm.firmId, window, limit: 50 }),
    listPayoutMonths(db, { firmId: firm.firmId, months: 12 }),
  ]);

  const basePath = `/payouts/${firm.firmSlug}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Payouts", href: "/payouts" },
          { label: firm.firmName },
        ]}
      />

      <FirmPayoutHeader firm={firm} />

      <div className="mt-8">
        <WindowTabs current={window} basePath={basePath} />
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Verified payouts" note={WINDOW_LABEL[window]}>
          {firm.count.toLocaleString("en")}
        </StatCard>
        <StatCard label="Verified volume" note="Per asset, never combined">
          <TokenLines tokens={firm.tokens} pick={(t) => t.totalBaseUnits} />
        </StatCard>
        <StatCard label="Largest single">
          <TokenLines tokens={firm.tokens} pick={(t) => t.largestBaseUnits} />
        </StatCard>
        <StatCard label="Average size">
          <TokenLines tokens={firm.tokens} pick={(t) => t.averageBaseUnits} />
        </StatCard>
        <StatCard label="First verified">
          {formatDate(firm.firstAt) ?? <NotRecorded />}
        </StatCard>
        <StatCard label="Most recent">
          {formatDate(firm.latestAt) ?? <NotRecorded />}
        </StatCard>
        <StatCard label="Networks">
          {firm.networks.length === 0 ? (
            <NotRecorded />
          ) : (
            <span className="flex flex-col gap-0.5 text-sm font-medium">
              {firm.networks.map((network) => (
                <span key={network.name} className="whitespace-nowrap">
                  {network.name}{" "}
                  <span className="text-xs font-normal tabular-nums text-text-muted">
                    ({network.count.toLocaleString("en")})
                  </span>
                </span>
              ))}
            </span>
          )}
        </StatCard>
        <StatCard label="Assets">
          {firm.tokens.length === 0 ? (
            <NotRecorded />
          ) : (
            <span className="text-base">
              {firm.tokens.map((t) => t.symbol).join(" · ")}
            </span>
          )}
        </StatCard>
      </dl>

      <p className="mt-4 max-w-3xl text-sm text-text-muted">
        Payout speed, account size and percentage return are not shown because
        they are not in this data. A blockchain records a transfer — not the
        request that preceded it, the account it came from, or who received it.
        Publishing those figures would mean estimating them.{" "}
        <Link
          href="/payouts/methodology"
          className="rounded text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
        >
          How verification works
        </Link>
        .
      </p>

      {firm.count === 0 ? (
        <div className="mt-8 rounded-[14px] border border-border-default bg-bg-card">
          <EmptyState
            title="Nothing verified in this period"
            description="No payout from a tracked wallet passed verification in the selected period. That is not evidence the firm did not pay — it may pay by other rails, or from a wallet nobody has identified."
            action={
              <Link
                href={`${basePath}?window=all`}
                className="rounded-[10px] border border-border-default bg-bg-elevated px-4 py-2 text-sm font-medium text-text-primary hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
              >
                Show all time
              </Link>
            }
          />
        </div>
      ) : (
        <>
          {months.length > 1 ? (
            <section aria-labelledby="trend" className="mt-10">
              <h2 id="trend" className="sr-only">
                Verified payouts over time
              </h2>
              <PayoutTrend months={months} />
            </section>
          ) : null}

          <section aria-labelledby="by-network" className="mt-10">
            <h2
              id="by-network"
              className="text-lg font-semibold text-text-primary"
            >
              Where the payouts were made
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {firm.networks.map((network) => (
                <li
                  key={network.name}
                  className="flex items-baseline justify-between gap-3 rounded-[12px] border border-border-default bg-bg-card px-4 py-3"
                >
                  <span className="text-sm text-text-secondary">
                    {network.name}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-text-primary">
                    {network.count.toLocaleString("en")}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="transactions" className="mt-10">
            <h2
              id="transactions"
              className="text-lg font-semibold text-text-primary"
            >
              Verified transactions
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-text-muted">
              Newest first. Every row links to the transaction on a public block
              explorer — a payout claim you cannot check is only an assertion.
              Recipient addresses are truncated and are never linked to an
              identity.
            </p>
            <div className="mt-4">
              <PayoutTable payouts={payouts} />
            </div>
          </section>
        </>
      )}

      <p className="mt-10 text-sm text-text-muted">
        <Link
          href="/payouts"
          className="rounded font-medium text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
        >
          Back to the payout tracker
        </Link>
      </p>

      <JsonLd
        data={[
          buildWebPageLd({
            path: basePath,
            name: `${firm.firmName} verified payouts`,
            description: `Blockchain-verified payouts from ${firm.firmName}.`,
          }),
          buildBreadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Payouts", path: "/payouts" },
            { name: firm.firmName, path: basePath },
          ]),
        ]}
      />
    </div>
  );
}
