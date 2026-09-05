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
  Pager,
  PayoutTrend,
  StatStrip,
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
 * (CLAUDE.md §3), and the page says so rather than leaving a reader to guess
 * that the data is merely missing.
 *
 * A firm that is not published 404s here, exactly as it does on its profile —
 * this route must not become a way to probe for draft firms.
 */
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

function readWindow(value: string | string[] | undefined): PayoutWindow {
  const raw = one(value);
  return WINDOWS.includes(raw as PayoutWindow) ? (raw as PayoutWindow) : "all";
}

function readPage(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(one(value) ?? "1", 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 200) : 1;
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
    // A firm with nothing verified has no content here worth indexing, and its
    // empty state must not compete with its profile page.
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
  const page = readPage(search.page);
  const db = getDb();

  const firm = await getFirmPayoutProfile(db, { slug, window });
  if (!firm) notFound();

  const [payouts, months] = await Promise.all([
    listRecentVerifiedPayouts(db, {
      firmId: firm.firmId,
      window,
      // One extra row answers "is there a next page?" without a second count.
      limit: PAGE_SIZE + 1,
      offset: (page - 1) * PAGE_SIZE,
    }),
    listPayoutMonths(db, { firmId: firm.firmId, months: 12 }),
  ]);

  const hasNext = payouts.length > PAGE_SIZE;
  const rows = hasNext ? payouts.slice(0, PAGE_SIZE) : payouts;
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

      <div className="mt-6">
        <StatStrip
          stats={[
            {
              label: "Verified payouts",
              value: firm.count.toLocaleString("en"),
              note: WINDOW_LABEL[window],
            },
            {
              label: "Verified volume",
              value: (
                <TokenLines
                  tokens={firm.tokens}
                  pick={(t) => t.totalBaseUnits}
                />
              ),
              note: "Per asset, never combined",
            },
            {
              label: "Largest single",
              value: (
                <TokenLines
                  tokens={firm.tokens}
                  pick={(t) => t.largestBaseUnits}
                />
              ),
            },
            {
              label: "Average size",
              value: (
                <TokenLines
                  tokens={firm.tokens}
                  pick={(t) => t.averageBaseUnits}
                />
              ),
            },
            {
              label: "First verified",
              value: formatDate(firm.firstAt) ?? <NotRecorded />,
            },
            {
              label: "Most recent",
              value: formatDate(firm.latestAt) ?? <NotRecorded />,
            },
            {
              label: "Networks",
              value:
                firm.networks.length === 0 ? (
                  <NotRecorded />
                ) : (
                  <span className="flex flex-col gap-0.5 text-sm">
                    {firm.networks.map((network) => (
                      <span key={network.name} className="whitespace-nowrap">
                        {network.name}{" "}
                        <span className="text-xs font-normal tabular-nums text-text-muted">
                          ({network.count.toLocaleString("en")})
                        </span>
                      </span>
                    ))}
                  </span>
                ),
            },
            {
              label: "Assets",
              value:
                firm.tokens.length === 0 ? (
                  <NotRecorded />
                ) : (
                  <span className="text-base">
                    {firm.tokens.map((t) => t.symbol).join(" · ")}
                  </span>
                ),
            },
          ]}
        />
      </div>

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
                className="rounded-full border border-border-default bg-bg-elevated px-4 py-2 text-sm font-medium text-text-primary hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
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

          <section aria-labelledby="transactions" className="mt-10">
            <h2
              id="transactions"
              className="scroll-mt-24 text-lg font-semibold text-text-primary"
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
              <PayoutTable payouts={rows} />
            </div>
            <Pager
              basePath={basePath}
              window={window}
              page={page}
              hasNext={hasNext}
            />
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
