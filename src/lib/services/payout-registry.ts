import { and, eq } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import {
  auditLogs,
  blockchainNetworks,
  blockchainProviders,
  blockchainTokens,
} from "@/lib/db/schema";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { ProviderError } from "@/lib/blockchain/provider";
import { providerFor } from "@/lib/blockchain/adapters";
import { TronScanProvider } from "@/lib/blockchain/tronscan";
import {
  SEED_NETWORKS,
  SEED_PROVIDERS,
  SEED_TOKENS,
} from "@/lib/blockchain/registry";

/**
 * PROVIDER / NETWORK / TOKEN REGISTRY — docs/PAYOUTS.md §3–§5.
 *
 * Configuration, not business data: which chains this build can read, which
 * providers serve them, and which token contracts count as recognisable
 * assets. Seeding it creates no wallet, no transfer and no payout.
 *
 * IT NEVER OVERWRITES. Every upsert below fills gaps and leaves an operator's
 * edits alone — a registry that reasserts itself on deploy is a registry that
 * silently undoes a correction someone made for a reason.
 */

export interface RegistryReport {
  providersCreated: number;
  networksCreated: number;
  networksLinked: number;
  tokensCreated: number;
}

export async function seedPayoutRegistry(
  db: Database,
  opts: { adminUserId: string },
): Promise<RegistryReport> {
  await requirePermission(db, opts.adminUserId, PERMISSIONS.CATALOG_MANAGE);

  const report: RegistryReport = {
    providersCreated: 0,
    networksCreated: 0,
    networksLinked: 0,
    tokensCreated: 0,
  };

  /* ------------------------------------------------------------ providers */

  for (const provider of SEED_PROVIDERS) {
    const [row] = await db
      .insert(blockchainProviders)
      .values({
        key: provider.key,
        name: provider.name,
        // The NAME of the variable, never its value.
        credentialEnvVar: provider.credentialEnvVar,
        isEnabled: true,
      })
      .onConflictDoNothing()
      .returning({ id: blockchainProviders.id });
    if (row) report.providersCreated += 1;
  }

  const providerIdByKey = new Map(
    (
      await db
        .select({ id: blockchainProviders.id, key: blockchainProviders.key })
        .from(blockchainProviders)
    ).map((p) => [p.key, p.id] as const),
  );

  /* ------------------------------------------------------------- networks */

  for (const network of SEED_NETWORKS) {
    const [row] = await db
      .insert(blockchainNetworks)
      .values({
        key: network.key,
        name: network.name,
        chainId: network.chainId,
        nativeSymbol: network.nativeSymbol,
        explorerTxTemplate: network.explorerTxTemplate,
        provider: network.provider,
        confirmationsRequired: network.confirmationsRequired,
        // Enabled deliberately: a network nobody switched on scans nothing,
        // and an operator adding a wallet should not have to find a toggle.
        isActive: true,
        ...(providerIdByKey.get(network.provider)
          ? { providerId: providerIdByKey.get(network.provider) }
          : {}),
      })
      .onConflictDoNothing()
      .returning({ id: blockchainNetworks.id });
    if (row) report.networksCreated += 1;
  }

  // Link networks that predate the provider table, without touching anything
  // else an operator may have changed on them.
  for (const network of SEED_NETWORKS) {
    const providerId = providerIdByKey.get(network.provider);
    if (!providerId) continue;
    const updated = await db
      .update(blockchainNetworks)
      .set({ providerId })
      .where(
        and(
          eq(blockchainNetworks.key, network.key),
          eq(blockchainNetworks.provider, network.provider),
        ),
      )
      .returning({ id: blockchainNetworks.id });
    report.networksLinked += updated.length;
  }

  const networkIdByKey = new Map(
    (
      await db
        .select({ id: blockchainNetworks.id, key: blockchainNetworks.key })
        .from(blockchainNetworks)
    ).map((n) => [n.key, n.id] as const),
  );

  /* --------------------------------------------------------------- tokens */

  for (const token of SEED_TOKENS) {
    const networkId = networkIdByKey.get(token.networkKey);
    if (!networkId) continue;

    const [row] = await db
      .insert(blockchainTokens)
      .values({
        networkId,
        // Stored lower-cased; the unique index and every match use that form.
        contractAddress: token.contractAddress.toLowerCase(),
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        sourceUrl: token.sourceUrl,
        isEnabled: token.isEnabled,
      })
      .onConflictDoNothing()
      .returning({ id: blockchainTokens.id });
    if (row) report.tokensCreated += 1;
  }

  await db.insert(auditLogs).values({
    actorType: "admin",
    actorAdminId: opts.adminUserId,
    action: "payout.registry_seeded",
    entityType: "system",
    after: { ...report },
  });

  return report;
}

export interface ConnectionTestResult {
  ok: boolean;
  /** A status or short reason. NEVER a credential (CLAUDE.md §6). */
  status: string;
  latencyMs: number;
  testedAt: Date;
}

/**
 * Tests one provider with a minimal authenticated request.
 *
 * Returns diagnostics only. The credential is not in the result, not in the
 * stored row, and not in the audit entry — an admin sees "Connected" or a
 * status code, and never the key that produced it.
 */
export async function testProviderConnection(
  db: Database,
  opts: { adminUserId: string; providerId: string },
): Promise<ConnectionTestResult> {
  await requirePermission(db, opts.adminUserId, PERMISSIONS.CATALOG_MANAGE);

  const [provider] = await db
    .select()
    .from(blockchainProviders)
    .where(eq(blockchainProviders.id, opts.providerId))
    .limit(1);
  if (!provider) throw new Error("Provider not found");

  const configured = Boolean(
    provider.credentialEnvVar && process.env[provider.credentialEnvVar]?.trim(),
  );

  let result: ConnectionTestResult;

  if (provider.key === "tronscan") {
    const outcome = await new TronScanProvider(
      configured ? { apiKey: process.env[provider.credentialEnvVar!] } : {},
    ).testConnection();
    result = { ...outcome, testedAt: new Date() };
  } else if (!configured) {
    // No key, no request. Reporting "not configured" beats a call that fails
    // for a reason the admin then has to guess at.
    result = {
      ok: false,
      status: `Not configured — set ${provider.credentialEnvVar ?? "its API key"} on the server`,
      latencyMs: 0,
      testedAt: new Date(),
    };
  } else {
    const started = Date.now();
    try {
      const adapter = providerFor({ provider: provider.key, chainId: 1 });
      if (!adapter) throw new ProviderError(provider.key, "no adapter");
      // A wallet that certainly exists and certainly has no transfers: the
      // burn address. The point is the round trip, not the rows.
      await adapter.listOutgoingTransfers({
        address: "0x0000000000000000000000000000000000000000",
        limit: 1,
      });
      result = {
        ok: true,
        status: "OK",
        latencyMs: Date.now() - started,
        testedAt: new Date(),
      };
    } catch (error) {
      result = {
        ok: false,
        status:
          error instanceof ProviderError ? error.message : "request failed",
        latencyMs: Date.now() - started,
        testedAt: new Date(),
      };
    }
  }

  await db
    .update(blockchainProviders)
    .set({
      lastTestedAt: result.testedAt,
      lastTestOk: result.ok,
      lastTestStatus: result.status,
      lastTestLatencyMs: result.latencyMs,
      ...(result.ok ? { lastSuccessAt: result.testedAt } : {}),
    })
    .where(eq(blockchainProviders.id, provider.id));

  await db.insert(auditLogs).values({
    actorType: "admin",
    actorAdminId: opts.adminUserId,
    action: "payout.provider_tested",
    entityType: "system",
    after: { provider: provider.key, ok: result.ok, status: result.status },
  });

  return result;
}

/**
 * Whether each provider's credential is present, by NAME only.
 *
 * Used by the admin UI to say "Not configured" without ever reading, echoing
 * or logging the value.
 */
export function credentialStatus(): {
  key: string;
  envVar: string;
  configured: boolean;
}[] {
  return SEED_PROVIDERS.map((p) => ({
    key: p.key,
    envVar: p.credentialEnvVar,
    configured: Boolean(process.env[p.credentialEnvVar]?.trim()),
  }));
}
