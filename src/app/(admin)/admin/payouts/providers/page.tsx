import { getDb } from "@/lib/db/client";
import { requireAdminPermission } from "@/lib/auth/current-admin";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { blockchainNetworks, blockchainProviders } from "@/lib/db/schema";
import { credentialStatus } from "@/lib/services/payout-registry";
import { UNCONFIGURED_TOKENS } from "@/lib/blockchain/registry";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { PayoutNav } from "@/components/admin/payouts/PayoutNav";
import {
  ProviderCard,
  type ProviderRow,
  SeedRegistryButton,
} from "./ProviderPanel";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Blockchain providers",
  // Operational surface. Never indexed (docs/SEO.md §11).
  robots: { index: false, follow: false },
};

/**
 * BLOCKCHAIN PROVIDERS — docs/PAYOUTS.md §4.
 *
 * Which integrations exist, whether their credentials are present, and what a
 * test request returned. Credentials are read on the SERVER and reduced to a
 * boolean before anything is rendered; the value never crosses to the browser.
 */
export default async function ProvidersPage() {
  await requireAdminPermission(PERMISSIONS.FIRM_READ);
  const db = getDb();

  const [providers, networks] = await Promise.all([
    db.select().from(blockchainProviders).orderBy(blockchainProviders.name),
    db
      .select({
        name: blockchainNetworks.name,
        provider: blockchainNetworks.provider,
      })
      .from(blockchainNetworks),
  ]);

  // Presence only. `credentialStatus` returns names and booleans, never values.
  const configured = new Map(
    credentialStatus().map((c) => [c.key, c.configured] as const),
  );

  const rows: ProviderRow[] = providers.map((p) => ({
    id: p.id,
    key: p.key,
    name: p.name,
    envVar: p.credentialEnvVar,
    configured: configured.get(p.key) ?? false,
    isEnabled: p.isEnabled,
    lastTestedAt: p.lastTestedAt?.toISOString() ?? null,
    lastTestOk: p.lastTestOk,
    lastTestStatus: p.lastTestStatus,
    lastTestLatencyMs: p.lastTestLatencyMs,
    networks: networks.filter((n) => n.provider === p.key).map((n) => n.name),
  }));

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Payout Tracking", href: "/admin/payouts" },
          { label: "Providers" },
        ]}
      />
      <PayoutNav current="/admin/payouts/providers" />
      <PageHeader
        title="Blockchain providers"
        description="The services this build can read a chain through. A provider with no credential reports that plainly rather than failing a scan silently."
      />

      <div className="mt-6 flex flex-col gap-4">
        {rows.length === 0 ? (
          <Card>
            <EmptyState
              title="No providers configured yet"
              description="Add the built-in providers, networks and stablecoin contracts. This creates configuration only — no wallet, no transfer and no payout."
              action={<SeedRegistryButton />}
            />
          </Card>
        ) : (
          <>
            {rows.map((provider) => (
              <ProviderCard key={provider.id} provider={provider} />
            ))}
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-text-primary">
                Add missing configuration
              </h2>
              <p className="mt-1 mb-4 text-sm text-text-muted">
                Adds any built-in provider, network or token that is not yet
                present. Existing rows are never overwritten.
              </p>
              <SeedRegistryButton />
            </Card>
          </>
        )}

        {/*
          Assets an operator might expect and will not find, with the reason.
          Silence here would read as an oversight; the honest answer is that
          the issuer does not publish a contract for that chain.
        */}
        {UNCONFIGURED_TOKENS.length > 0 ? (
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-text-primary">
              Deliberately not configured
            </h2>
            <ul className="mt-3 flex flex-col gap-3">
              {UNCONFIGURED_TOKENS.map((token) => (
                <li key={`${token.networkKey}-${token.symbol}`}>
                  <p className="text-sm font-medium text-text-secondary">
                    {token.symbol} on {token.networkKey}
                  </p>
                  <p className="mt-0.5 text-sm text-text-muted">
                    {token.reason}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </>
  );
}
