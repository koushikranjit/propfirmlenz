import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import { auditLogs, blockchainNetworks, trackedWallets } from "@/lib/db/schema";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { normaliseAddress } from "@/lib/blockchain/provider";
import { providerFor } from "@/lib/blockchain/adapters";
import type {
  NetworkFormInput,
  WalletFormInput,
} from "@/lib/validation/payouts";
import { type ScanResult, scanWallet } from "./payout-ingestion";

/**
 * PAYOUT ADMINISTRATION — docs/PAYOUTS.md §11.
 *
 * Managing WHAT WE WATCH. Nothing in this module decides whether a transfer is
 * a payout — that stays in `payout-verification.ts` behind `firm:verify`.
 *
 * Networks and wallets are operator data, not business data: they record which
 * chains we can actually read and which addresses an admin has researched. No
 * chain, wallet or amount is ever seeded (docs/CLAUDE.md §3).
 */

export class PayoutAdminError extends Error {
  constructor(
    readonly code:
      | "DUPLICATE_NETWORK"
      | "DUPLICATE_WALLET"
      | "NOT_FOUND"
      | "PROVIDER_UNAVAILABLE"
      | "NETWORK_INACTIVE",
    message: string,
  ) {
    super(message);
    this.name = "PayoutAdminError";
  }
}

/** Postgres unique violation. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

/* ---------------------------------------------------------------- networks */

export async function saveNetwork(
  db: Database,
  opts: { adminUserId: string; input: NetworkFormInput },
): Promise<{ id: string }> {
  await requirePermission(db, opts.adminUserId, PERMISSIONS.CATALOG_MANAGE);
  const { input } = opts;

  const values = {
    key: input.key,
    name: input.name,
    chainId: input.chainId,
    nativeSymbol: input.nativeSymbol,
    explorerTxTemplate: input.explorerTxTemplate,
    provider: input.provider,
    confirmationsRequired: input.confirmationsRequired,
    isActive: input.isActive,
  };

  try {
    if (input.id) {
      const [updated] = await db
        .update(blockchainNetworks)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(blockchainNetworks.id, input.id))
        .returning({ id: blockchainNetworks.id });
      if (!updated) {
        throw new PayoutAdminError(
          "NOT_FOUND",
          "That network no longer exists.",
        );
      }

      await audit(db, opts.adminUserId, "payout.network_updated", {
        key: values.key,
        provider: values.provider,
        isActive: values.isActive,
      });
      return updated;
    }

    const [created] = await db
      .insert(blockchainNetworks)
      .values(values)
      .returning({ id: blockchainNetworks.id });
    if (!created) throw new Error("Failed to create the network");

    await audit(db, opts.adminUserId, "payout.network_created", {
      key: values.key,
      provider: values.provider,
    });
    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new PayoutAdminError(
        "DUPLICATE_NETWORK",
        "A network with that key already exists.",
      );
    }
    throw error;
  }
}

/* ----------------------------------------------------------------- wallets */

/**
 * Records or updates a wallet to watch.
 *
 * `addressNormalized` is derived here, never taken from the form. The unique
 * index is on the normalised value, so deriving it anywhere else would let the
 * same address be watched twice under different casing — and every one of its
 * transactions would then be counted twice.
 */
export async function saveTrackedWallet(
  db: Database,
  opts: { adminUserId: string; input: WalletFormInput },
): Promise<{ id: string }> {
  await requirePermission(db, opts.adminUserId, PERMISSIONS.FIRM_EDIT);
  const { input } = opts;

  const values = {
    propFirmId: input.propFirmId,
    networkId: input.networkId,
    address: input.address,
    addressNormalized: normaliseAddress(input.address),
    label: input.label,
    purpose: input.purpose,
    verificationStatus: input.verificationStatus,
    notes: input.notes,
    isActive: input.isActive,
  };

  try {
    if (input.id) {
      const [updated] = await db
        .update(trackedWallets)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(trackedWallets.id, input.id))
        .returning({ id: trackedWallets.id });
      if (!updated) {
        throw new PayoutAdminError(
          "NOT_FOUND",
          "That wallet no longer exists.",
        );
      }

      await audit(
        db,
        opts.adminUserId,
        "payout.wallet_updated",
        { purpose: values.purpose, isActive: values.isActive },
        input.propFirmId,
      );
      return updated;
    }

    const [created] = await db
      .insert(trackedWallets)
      .values({ ...values, createdByAdminId: opts.adminUserId })
      .returning({ id: trackedWallets.id });
    if (!created) throw new Error("Failed to record the wallet");

    await audit(
      db,
      opts.adminUserId,
      "payout.wallet_added",
      { purpose: values.purpose },
      input.propFirmId,
    );
    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new PayoutAdminError(
        "DUPLICATE_WALLET",
        "That address is already tracked on this network.",
      );
    }
    throw error;
  }
}

/**
 * Runs a scan for one wallet, on demand.
 *
 * When the network's provider has no configured credential, this FAILS LOUDLY.
 * A scan that quietly returns nothing looks identical to a firm that made no
 * payouts, and that is the misreading the whole feature exists to prevent
 * (docs/PAYOUTS.md §6 `[LOCKED]`).
 */
export async function scanWalletNow(
  db: Database,
  opts: { adminUserId: string; walletId: string },
): Promise<ScanResult> {
  await requirePermission(db, opts.adminUserId, PERMISSIONS.FIRM_EDIT);

  const [wallet] = await db
    .select({
      id: trackedWallets.id,
      propFirmId: trackedWallets.propFirmId,
      provider: blockchainNetworks.provider,
      chainId: blockchainNetworks.chainId,
      networkActive: blockchainNetworks.isActive,
    })
    .from(trackedWallets)
    .innerJoin(
      blockchainNetworks,
      eq(blockchainNetworks.id, trackedWallets.networkId),
    )
    .where(eq(trackedWallets.id, opts.walletId))
    .limit(1);

  if (!wallet) {
    throw new PayoutAdminError("NOT_FOUND", "That wallet no longer exists.");
  }
  if (!wallet.networkActive) {
    throw new PayoutAdminError(
      "NETWORK_INACTIVE",
      "That network is switched off. Activate it before scanning.",
    );
  }

  const provider = providerFor(wallet);
  if (!provider) {
    throw new PayoutAdminError(
      "PROVIDER_UNAVAILABLE",
      "No API credential is configured for this network's provider, so it cannot be scanned.",
    );
  }

  const result = await scanWallet(db, {
    walletId: wallet.id,
    provider,
    maxPages: 3,
  });

  await audit(
    db,
    opts.adminUserId,
    "payout.wallet_scanned",
    {
      transactionsInserted: result.transactionsInserted,
      candidatesCreated: result.candidatesCreated,
      error: result.error,
    },
    wallet.propFirmId,
  );

  return result;
}

async function audit(
  db: Database,
  adminUserId: string,
  action: string,
  after: Record<string, unknown>,
  entityId?: string,
): Promise<void> {
  await db.insert(auditLogs).values({
    actorType: "admin",
    actorAdminId: adminUserId,
    action,
    entityType: entityId ? "prop_firm" : "system",
    ...(entityId ? { entityId } : {}),
    after,
  });
}
