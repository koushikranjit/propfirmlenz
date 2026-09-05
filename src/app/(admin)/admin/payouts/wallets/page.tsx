import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { requireAdminPermission } from "@/lib/auth/current-admin";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  listFirmOptions,
  listNetworks,
  listTrackedWallets,
} from "@/lib/repositories/admin-payouts";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { EditorDisclosure } from "@/components/admin/forms";
import { PayoutNav } from "@/components/admin/payouts/PayoutNav";
import {
  DeleteWalletButton,
  ScanButton,
  WalletForm,
} from "@/components/admin/payouts/WalletForms";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Tracked wallets" };

/**
 * TRACKED WALLETS — docs/PAYOUTS.md §11.
 *
 * What we watch, and why we think it pays traders. A wallet's purpose is an
 * admin's research, not proof — but for one combination it is also the
 * publishing decision: `trader payouts` + `verified` releases that wallet's
 * transfers automatically (docs/PAYOUTS.md §7). Every other wallet's transfers
 * go to the review queue, one at a time, as before.
 *
 * "Scan now" needs a configured provider credential. Without one it FAILS
 * VISIBLY rather than reporting an empty scan, because a silent zero reads
 * exactly like a firm that never paid anyone.
 */

const PURPOSE_TONE: Record<string, "success" | "warning" | "neutral"> = {
  trader_payouts: "success",
  unknown: "warning",
};

export default async function TrackedWalletsPage() {
  const admin = await requireAdminPermission(PERMISSIONS.FIRM_READ);
  const db = getDb();
  const [wallets, networks, firms] = await Promise.all([
    listTrackedWallets(db),
    listNetworks(db),
    listFirmOptions(db),
  ]);

  const canEdit = admin.can(PERMISSIONS.FIRM_EDIT);
  // A firm with no name yet is still selectable; it is labelled by its id
  // rather than given an invented one.
  const namedFirms = firms.map((f) => ({
    id: f.id,
    name: f.name ?? `(untitled — ${f.id.slice(0, 8)})`,
  }));

  const autoPublishing = wallets.filter(
    (w) => w.purpose === "trader_payouts" && w.verificationStatus === "verified",
  ).length;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Payouts", href: "/admin/payouts" },
          { label: "Tracked wallets" },
        ]}
      />
      <PayoutNav current="/admin/payouts/wallets" />
      <PageHeader
        title="Tracked wallets"
        description={
          (wallets.length === 1 ? "1 wallet" : `${wallets.length} wallets`) +
          (autoPublishing > 0
            ? ` · ${autoPublishing} publishing automatically`
            : "")
        }
        actions={
          <Link href="/admin/payouts">
            <Button>Review queue</Button>
          </Link>
        }
      />

      {firms.length === 0 ? (
        <Card className="mt-6">
          <EmptyState
            title="No prop firms yet"
            description="A wallet belongs to a firm, so add a firm first."
            action={
              <Link href="/admin/prop-firms/new">
                <Button variant="primary">Add a prop firm</Button>
              </Link>
            }
          />
        </Card>
      ) : canEdit ? (
        <Card className="mt-6 p-5 sm:p-6">
          <h2 className="text-base font-semibold text-text-primary">
            Track a wallet
          </h2>
          <p className="mt-1 mb-5 text-sm text-text-muted">
            Outgoing transfers from this address are recorded. They queue for
            review unless you mark the wallet as verified trader payouts, which
            publishes them.
          </p>
          <WalletForm firms={namedFirms} networks={networks} />
        </Card>
      ) : null}

      <div className="mt-8 flex flex-col gap-3">
        {wallets.length === 0 ? (
          <Card>
            <EmptyState
              title="No wallets are being tracked"
              description="Record a firm's payout address to start collecting verifiable evidence."
            />
          </Card>
        ) : (
          wallets.map((wallet) => {
            const publishing =
              wallet.purpose === "trader_payouts" &&
              wallet.verificationStatus === "verified";

            return (
              <EditorDisclosure
                key={wallet.id}
                summary={
                  <span className="flex flex-col">
                    <span>{wallet.label ?? wallet.address}</span>
                    <span className="font-mono text-xs font-normal text-text-muted">
                      {wallet.firmName} · {wallet.networkName}
                    </span>
                  </span>
                }
                meta={
                  <>
                    <Badge tone={PURPOSE_TONE[wallet.purpose] ?? "neutral"}>
                      {wallet.purpose.replace(/_/g, " ")}
                    </Badge>
                    {/* The most consequential fact about a wallet: whether it
                        publishes, or queues for a person to decide. */}
                    {publishing ? (
                      <Badge tone="success">Auto-publishing</Badge>
                    ) : (
                      <Badge tone="neutral">Queues for review</Badge>
                    )}
                    {wallet.isActive ? null : (
                      <Badge tone="neutral">Not scanned</Badge>
                    )}
                    {wallet.lastScanError ? (
                      <Badge tone="danger">Last scan failed</Badge>
                    ) : null}
                    <span className="text-xs tabular-nums text-text-muted">
                      {wallet.transactionCount} transaction
                      {wallet.transactionCount === 1 ? "" : "s"} ·{" "}
                      {wallet.publishedCount} published
                    </span>
                  </>
                }
              >
                <div className="flex flex-col gap-5">
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                        Address
                      </dt>
                      <dd className="mt-0.5 break-all font-mono text-xs text-text-secondary">
                        {wallet.address}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                        Last checked
                      </dt>
                      <dd className="mt-0.5 text-text-secondary">
                        {wallet.lastCheckedAt
                          ? wallet.lastCheckedAt
                              .toISOString()
                              .slice(0, 16)
                              .replace("T", " ")
                          : "Never scanned"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                        Verified as a payout wallet
                      </dt>
                      <dd className="mt-0.5 text-text-secondary">
                        {wallet.verifiedAt
                          ? wallet.verifiedAt
                              .toISOString()
                              .slice(0, 16)
                              .replace("T", " ")
                          : "Not verified"}
                      </dd>
                    </div>
                  </dl>

                  {wallet.lastScanError ? (
                    <p className="rounded-[10px] border border-danger/40 bg-danger/12 px-3 py-2 text-sm font-medium text-danger">
                      Last scan did not complete: {wallet.lastScanError}
                    </p>
                  ) : null}

                  {canEdit ? (
                    <>
                      <div className="flex flex-wrap items-start justify-end gap-3">
                        <DeleteWalletButton
                          walletId={wallet.id}
                          label={wallet.label ?? wallet.address}
                          publishedCount={wallet.publishedCount}
                        />
                        <ScanButton walletId={wallet.id} />
                      </div>
                      <WalletForm
                        firms={namedFirms}
                        networks={networks}
                        wallet={wallet}
                      />
                    </>
                  ) : (
                    <p className="text-sm text-text-muted">
                      You can see tracked wallets but not change them.
                    </p>
                  )}
                </div>
              </EditorDisclosure>
            );
          })
        )}
      </div>
    </>
  );
}
