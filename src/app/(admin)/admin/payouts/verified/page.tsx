import { getDb } from "@/lib/db/client";
import { requireAdminPermission } from "@/lib/auth/current-admin";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listVerifiedPayoutsForAdmin } from "@/lib/repositories/admin-payouts";
import { formatBaseUnits } from "@/lib/blockchain/provider";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { PayoutNav } from "@/components/admin/payouts/PayoutNav";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Verified payouts",
  robots: { index: false, follow: false },
};

/**
 * THE LEDGER — docs/PAYOUTS.md §7.
 *
 * Every payout that reached the public site, with who allowed it. Unlike the
 * public page this includes payouts belonging to unpublished firms, because an
 * operator needs to see everything that was verified, not only what is live.
 */
export default async function VerifiedPayoutsPage() {
  await requireAdminPermission(PERMISSIONS.FIRM_READ);
  const payouts = await listVerifiedPayoutsForAdmin(getDb(), { limit: 100 });

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Payout Tracking", href: "/admin/payouts" },
          { label: "Verified Payouts" },
        ]}
      />
      <PayoutNav current="/admin/payouts/verified" />
      <PageHeader
        title="Verified payouts"
        description={
          payouts.length === 1
            ? "1 verified payout"
            : `${payouts.length} verified payouts`
        }
      />

      <div className="mt-6">
        {payouts.length === 0 ? (
          <Card>
            <EmptyState
              title="Nothing verified yet"
              description="A payout appears here once someone reviews a candidate and accepts it. Nothing is promoted automatically."
            />
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-[14px] border border-border-default bg-bg-card">
            <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
              <caption className="sr-only">
                Verified payouts, most recently verified first.
              </caption>
              <thead>
                <tr className="border-b border-border-default">
                  {[
                    "Firm",
                    "Amount",
                    "Network",
                    "When",
                    "Verified by",
                    "Transaction",
                  ].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-border-subtle last:border-0"
                  >
                    <th
                      scope="row"
                      className="px-4 py-3 font-medium text-text-primary"
                    >
                      {p.firmName ?? "(untitled firm)"}
                    </th>
                    <td className="px-4 py-3 tabular-nums text-text-secondary">
                      {/* Exact base units, formatted without floating point. */}
                      {formatBaseUnits(p.amountBaseUnits, p.decimals)}{" "}
                      {p.assetSymbol}
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      {p.networkName}
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      {p.transactionTimestamp.toISOString().slice(0, 10)}
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      {p.verifiedBy ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={p.explorerUrl}
                        target="_blank"
                        rel="nofollow noopener"
                        className="rounded font-mono text-xs text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                      >
                        {p.txHash.slice(0, 10)}…
                        <span className="sr-only">
                          {" "}
                          (opens the block explorer)
                        </span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
