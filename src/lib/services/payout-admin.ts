import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import { auditLogs, blockchainNetworks, trackedWallets } from "@/lib/db/schema";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import {
  addressFamilyFor,
  isValidAddressFor,
  normaliseAddressFor,
} from "@/lib/blockchain/address";
import { providerFor } from "@/lib/blockchain/adapters";
import type {
  NetworkFormInput,
  WalletFormInput,
} from "@/lib/validation/payouts";
import { autoPublishForWallet } from "./payout-autopublish";
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
      | "NETWORK_INACTIVE"
      | "INVALID_ADDRESS",
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
): Promise<{ id: string; autoPublished: number }> {
  await requirePermission(db, opts.adminUserId, PERMISSIONS.FIRM_EDIT);
  const { input } = opts;

  /*
   * THE ADDRESS MUST BELONG TO THE NETWORK IT IS FILED UNDER.
   *
   * A TRON address saved against Ethereum scans forever and finds nothing,
   * and "no transfers" is indistinguishable from "this firm pays nobody" —
   * the one confusion this whole system exists to remove. Caught here rather
   * than after a week of clean-looking empty scans.
   */
  const [network] = await db
    .select({ key: blockchainNetworks.key, name: blockchainNetworks.name })
    .from(blockchainNetworks)
    .where(eq(blockchainNetworks.id, input.networkId))
    .limit(1);
  if (!network) {
    throw new PayoutAdminError("NOT_FOUND", "That network no longer exists.");
  }

  const family = addressFamilyFor(network.key);
  if (!family) {
    throw new PayoutAdminError(
      "INVALID_ADDRESS",
      `No address format is known for ${network.name}, so an address cannot be validated for it.`,
    );
  }
  if (!isValidAddressFor(family, input.address)) {
    throw new PayoutAdminError(
      "INVALID_ADDRESS",
      `That is not a valid ${network.name} address. ${
        family === "tron"
          ? "TRON addresses start with T and carry a checksum."
          : "Ethereum addresses are 0x followed by 40 hex characters."
      }`,
    );
  }

  /*
   * WHO SAID THIS WALLET IS GENUINE, AND WHEN.
   *
   * Marking a wallet `verified` is now the decision that publishes its
   * transfers (see `payout-autopublish.ts`), so it has to name a person. When
   * verification is withdrawn the attribution is cleared with it — a stale
   * "verified by" on an unverified wallet reads as an endorsement nobody made.
   */
  const verification =
    input.verificationStatus === "verified"
      ? { verifiedByAdminId: opts.adminUserId, verifiedAt: new Date() }
      : { verifiedByAdminId: null, verifiedAt: null };

  const values = {
    propFirmId: input.propFirmId,
    networkId: input.networkId,
    address: input.address.trim(),
    addressNormalized: normaliseAddressFor(family, input.address),
    label: input.label,
    purpose: input.purpose,
    verificationStatus: input.verificationStatus,
    notes: input.notes,
    isActive: input.isActive,
    ...verification,
  };

  let walletId: string;

  try {
    if (input.id) {
      const [updated] = await db
        .update(trackedWallets)
        .set({ ...values, updatedAt: new Date() })
        .where(
          and(eq(trackedWallets.id, input.id), isNull(trackedWallets.deletedAt)),
        )
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
        {
          purpose: values.purpose,
          isActive: values.isActive,
          verificationStatus: values.verificationStatus,
        },
        input.propFirmId,
      );
      walletId = updated.id;
    } else {
      const [created] = await db
        .insert(trackedWallets)
        .values({ ...values, createdByAdminId: opts.adminUserId })
        .returning({ id: trackedWallets.id });
      if (!created) throw new Error("Failed to record the wallet");

      await audit(
        db,
        opts.adminUserId,
        "payout.wallet_added",
        {
          purpose: values.purpose,
          verificationStatus: values.verificationStatus,
        },
        input.propFirmId,
      );
      walletId = created.id;
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new PayoutAdminError(
        "DUPLICATE_WALLET",
        "That address is already tracked on this network.",
      );
    }
    throw error;
  }

  // Turning verification ON releases whatever this wallet already collected
  // while it was unverified, rather than stranding it in a queue nobody will
  // work. For any other wallet this is a no-op.
  const { published } = await autoPublishForWallet(db, { walletId });

  return { id: walletId, autoPublished: published };
}

/**
 * Retires a wallet — docs/PAYOUTS.md §6.
 *
 * SOFT, and deliberately so. Candidates and verified payouts reference the
 * wallet with RESTRICT, so a hard delete would either fail or take real payout
 * history with it. Removing a wallet stops future scans and hides it from the
 * admin; everything it already produced stays exactly where it is, including
 * anything already published.
 */
export async function deleteTrackedWallet(
  db: Database,
  opts: { adminUserId: string; walletId: string },
): Promise<{ address: string }> {
  await requirePermission(db, opts.adminUserId, PERMISSIONS.FIRM_EDIT);

  const [wallet] = await db
    .select({
      id: trackedWallets.id,
      address: trackedWallets.address,
      propFirmId: trackedWallets.propFirmId,
    })
    .from(trackedWallets)
    .where(
      and(eq(trackedWallets.id, opts.walletId), isNull(trackedWallets.deletedAt)),
    )
    .limit(1);
  if (!wallet) {
    throw new PayoutAdminError("NOT_FOUND", "That wallet no longer exists.");
  }

  await db
    .update(trackedWallets)
    .set({ deletedAt: new Date(), isActive: false })
    .where(eq(trackedWallets.id, wallet.id));

  await audit(
    db,
    opts.adminUserId,
    "payout.wallet_removed",
    { address: wallet.address },
    wallet.propFirmId,
  );

  return { address: wallet.address };
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
): Promise<ScanResult & { autoPublished: number }> {
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
    .where(
      and(eq(trackedWallets.id, opts.walletId), isNull(trackedWallets.deletedAt)),
    )
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

  // Ingestion still verifies nothing. This publishes only if a person has
  // already marked this wallet as verified trader payouts.
  const { published } = await autoPublishForWallet(db, { walletId: wallet.id });

  await audit(
    db,
    opts.adminUserId,
    "payout.wallet_scanned",
    {
      transactionsInserted: result.transactionsInserted,
      candidatesCreated: result.candidatesCreated,
      autoPublished: published,
      error: result.error,
    },
    wallet.propFirmId,
  );

  return { ...result, autoPublished: published };
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
