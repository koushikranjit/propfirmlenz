import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { requireAdminPermission } from "@/lib/auth/current-admin";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listNetworks } from "@/lib/repositories/admin-payouts";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { EditorDisclosure } from "@/components/admin/forms";
import { PayoutNav } from "@/components/admin/payouts/PayoutNav";
import { NetworkForm } from "@/components/admin/payouts/WalletForms";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Blockchain networks" };

/**
 * BLOCKCHAIN NETWORKS — docs/PAYOUTS.md §3 `[LOCKED]`.
 *
 * Networks are ROWS, added by an operator once a provider can actually serve
 * reliable data for that chain — never a long shipped list of chains we cannot
 * read, which would imply coverage we do not have.
 */

export default async function NetworksPage() {
  const admin = await requireAdminPermission(PERMISSIONS.FIRM_READ);
  const networks = await listNetworks(getDb());
  const canManage = admin.can(PERMISSIONS.CATALOG_MANAGE);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Payouts", href: "/admin/payouts" },
          { label: "Networks" },
        ]}
      />
      <PayoutNav current="/admin/payouts/networks" />
      <PageHeader
        title="Blockchain networks"
        description="The chains we can read. A network is only scanned while it is active and its provider credential is configured."
        actions={
          <Link href="/admin/payouts/wallets">
            <Button>Tracked wallets</Button>
          </Link>
        }
      />

      <div className="mt-6 flex flex-col gap-3">
        {networks.length === 0 ? (
          <Card>
            <EmptyState
              title="No networks yet"
              description="Add the chain a firm pays on before recording its wallets."
            />
          </Card>
        ) : (
          networks.map((network) => (
            <EditorDisclosure
              key={network.id}
              summary={
                <span className="flex flex-col">
                  <span>{network.name}</span>
                  <span className="text-xs font-normal text-text-muted">
                    {network.provider} · {network.nativeSymbol}
                    {network.chainId === null
                      ? ""
                      : ` · chain ${network.chainId}`}
                  </span>
                </span>
              }
              meta={
                <>
                  <Badge tone={network.isActive ? "success" : "neutral"}>
                    {network.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <span className="text-xs tabular-nums text-text-muted">
                    {network.walletCount} wallet
                    {network.walletCount === 1 ? "" : "s"}
                  </span>
                </>
              }
            >
              {canManage ? (
                <NetworkForm network={network} />
              ) : (
                <p className="text-sm text-text-muted">
                  You can see networks but not change them.
                </p>
              )}
            </EditorDisclosure>
          ))
        )}
      </div>

      {canManage ? (
        <Card className="mt-8 p-5 sm:p-6">
          <h2 className="text-base font-semibold text-text-primary">
            Add a network
          </h2>
          <p className="mt-1 mb-5 text-sm text-text-muted">
            Only add a chain a configured provider can actually read. An
            unreadable network produces empty scans, which look exactly like a
            firm that made no payouts.
          </p>
          <NetworkForm />
        </Card>
      ) : null}
    </>
  );
}
