import Link from "next/link";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireAdminPermission } from "@/lib/auth/current-admin";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  blockchainNetworks,
  blockchainProviders,
  blockchainTokens,
  trackedWallets,
  verifiedPayouts,
} from "@/lib/db/schema";
import { countCandidatesByStatus } from "@/lib/repositories/admin-payouts";
import { credentialStatus } from "@/lib/services/payout-registry";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { PayoutNav } from "@/components/admin/payouts/PayoutNav";
import { Badge, Card, PageHeader } from "@/components/ui/primitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Payout tracking",
  robots: { index: false, follow: false },
};

/**
 * PAYOUT TRACKING DASHBOARD — docs/PAYOUTS.md §11.
 *
 * Operational counts, every one a live query. There is no cached total and no
 * illustrative chart: a dashboard figure that cannot be recomputed from rows
 * is a figure nobody can act on (CLAUDE.md §3). Zero reads as zero.
 */
export default async function PayoutDashboardPage() {
  await requireAdminPermission(PERMISSIONS.FIRM_READ);
  const db = getDb();

  const [wallets, networks, tokens, payouts, providers, candidates] =
    await Promise.all([
      db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${trackedWallets.isActive})::int`,
          firms: sql<number>`count(distinct ${trackedWallets.propFirmId})::int`,
          failing: sql<number>`count(*) filter (where ${trackedWallets.lastScanError} is not null)::int`,
          lastSync: sql<Date | null>`max(${trackedWallets.lastCheckedAt})`,
        })
        .from(trackedWallets),
      db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${blockchainNetworks.isActive})::int`,
        })
        .from(blockchainNetworks),
      db
        .select({
          total: sql<number>`count(*)::int`,
          enabled: sql<number>`count(*) filter (where ${blockchainTokens.isEnabled})::int`,
        })
        .from(blockchainTokens),
      db.select({ total: sql<number>`count(*)::int` }).from(verifiedPayouts),
      db.select().from(blockchainProviders),
      countCandidatesByStatus(db),
    ]);

  const configured = new Map(
    credentialStatus().map((c) => [c.key, c.configured] as const),
  );

  const pending =
    (candidates["detected"] ?? 0) + (candidates["match_review"] ?? 0);

  const stats: { label: string; value: string; note?: string }[] = [
    {
      label: "Firms tracked",
      value: String(wallets[0]?.firms ?? 0),
      note: "firms with at least one wallet",
    },
    {
      label: "Active wallets",
      value: `${wallets[0]?.active ?? 0} of ${wallets[0]?.total ?? 0}`,
    },
    {
      label: "Active networks",
      value: `${networks[0]?.active ?? 0} of ${networks[0]?.total ?? 0}`,
    },
    {
      label: "Enabled tokens",
      value: `${tokens[0]?.enabled ?? 0} of ${tokens[0]?.total ?? 0}`,
      note: "identified by contract, never by ticker",
    },
    { label: "Pending candidates", value: String(pending) },
    { label: "Verified payouts", value: String(payouts[0]?.total ?? 0) },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Payout Tracking" },
        ]}
      />
      <PayoutNav current="/admin/payouts" />
      <PageHeader
        title="Payout tracking"
        description="Verified on-chain payouts only. Coverage is limited to the wallets and chains configured here — it is a floor, never a firm's total payout volume."
      />

      <dl className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-4">
            <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              {stat.label}
            </dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">
              {stat.value}
            </dd>
            {stat.note ? (
              <p className="mt-1 text-xs text-text-muted">{stat.note}</p>
            ) : null}
          </Card>
        ))}
      </dl>

      <Card className="mt-4 p-5">
        <h2 className="text-sm font-semibold text-text-primary">
          Provider status
        </h2>
        {providers.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">
            No provider configured yet.{" "}
            <Link
              href="/admin/payouts/providers"
              className="rounded text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
            >
              Set them up
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {providers.map((p) => {
              const hasKey = configured.get(p.key) ?? false;
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-border-subtle bg-bg-elevated px-4 py-2.5"
                >
                  <span className="text-sm text-text-secondary">{p.name}</span>
                  <Badge
                    tone={
                      !hasKey
                        ? "warning"
                        : p.lastTestOk === true
                          ? "success"
                          : p.lastTestOk === false
                            ? "danger"
                            : "neutral"
                    }
                  >
                    {!hasKey
                      ? "Not configured"
                      : p.lastTestOk === true
                        ? "Connected"
                        : p.lastTestOk === false
                          ? "Connection failed"
                          : "Not tested"}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="text-sm font-semibold text-text-primary">Sync health</h2>
        <p className="mt-2 text-sm text-text-secondary">
          {wallets[0]?.lastSync
            ? `Last wallet scan ${new Date(wallets[0].lastSync)
                .toISOString()
                .slice(0, 16)
                .replace("T", " ")} UTC.`
            : "No wallet has been scanned yet."}
          {wallets[0]?.failing
            ? ` ${wallets[0].failing} wallet${
                wallets[0].failing === 1 ? "" : "s"
              } reported an error on the last scan — a failed scan is not the same as no payouts.`
            : ""}
        </p>
      </Card>
    </>
  );
}
