import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import {
  blockchainNetworks,
  blockchainTransactions,
  payoutCandidates,
  payoutVerificationEvents,
  trackedWallets,
} from "@/lib/db/schema";
import {
  type BlockchainProvider,
  ProviderError,
  ProviderRateLimitError,
  normaliseAddress,
} from "@/lib/blockchain/provider";

/**
 * TRANSACTION INGESTION — docs/PAYOUTS.md §6 `[LOCKED]`.
 *
 *   tracked wallet -> provider -> raw transaction -> payout candidate
 *
 * IDEMPOTENT BY CONSTRUCTION. Every insert is `onConflictDoNothing` against a
 * unique key, so running a scan twice over the same range produces the same
 * rows. Re-running after a crash is therefore safe and is the intended
 * recovery, rather than something to be avoided.
 *
 * IT VERIFIES NOTHING. Ingestion records what a chain says and raises a
 * CANDIDATE. Whether that candidate is a trader payout is a separate,
 * auditable decision (`payout-verification.ts`) — a wallet label is a hint,
 * never proof.
 */

export interface ScanResult {
  walletId: string;
  transfersSeen: number;
  transactionsInserted: number;
  candidatesCreated: number;
  cursor: string | null;
  error: string | null;
}

/** Pages a wallet's outgoing transfers and records what it finds. */
export async function scanWallet(
  db: Database,
  opts: {
    walletId: string;
    provider: BlockchainProvider;
    /** Pages per run, so one wallet cannot monopolise a scheduled scan. */
    maxPages?: number;
    pageSize?: number;
    /** Resume from the stored cursor rather than restarting. */
    resume?: boolean;
    now?: Date;
  },
): Promise<ScanResult> {
  const now = opts.now ?? new Date();
  const maxPages = Math.min(Math.max(opts.maxPages ?? 5, 1), 50);

  const [wallet] = await db
    .select({
      id: trackedWallets.id,
      propFirmId: trackedWallets.propFirmId,
      networkId: trackedWallets.networkId,
      address: trackedWallets.address,
      purpose: trackedWallets.purpose,
      isActive: trackedWallets.isActive,
      scanCursor: trackedWallets.scanCursor,
      confirmationsRequired: blockchainNetworks.confirmationsRequired,
      providerKey: blockchainNetworks.provider,
    })
    .from(trackedWallets)
    .innerJoin(
      blockchainNetworks,
      eq(blockchainNetworks.id, trackedWallets.networkId),
    )
    .where(eq(trackedWallets.id, opts.walletId))
    .limit(1);

  if (!wallet) throw new Error("Tracked wallet not found");

  const result: ScanResult = {
    walletId: wallet.id,
    transfersSeen: 0,
    transactionsInserted: 0,
    candidatesCreated: 0,
    cursor: opts.resume === false ? null : wallet.scanCursor,
    error: null,
  };

  if (!wallet.isActive) {
    result.error = "wallet is inactive";
    return result;
  }

  try {
    for (let page = 0; page < maxPages; page += 1) {
      const { transfers, nextCursor } =
        await opts.provider.listOutgoingTransfers({
          address: wallet.address,
          cursor: result.cursor,
          ...(opts.pageSize === undefined ? {} : { limit: opts.pageSize }),
        });

      result.transfersSeen += transfers.length;

      for (const transfer of transfers) {
        // Defensive: a provider must only return outgoing transfers, but a
        // wrong one would attribute someone else's payment to this firm.
        if (
          normaliseAddress(transfer.fromAddress) !==
          normaliseAddress(wallet.address)
        ) {
          continue;
        }
        if (transfer.status !== "success") continue;

        const [inserted] = await db
          .insert(blockchainTransactions)
          .values({
            networkId: wallet.networkId,
            txHash: transfer.txHash,
            transferIndex: transfer.transferIndex,
            blockNumber: transfer.blockNumber,
            blockTimestamp: transfer.blockTimestamp,
            fromAddress: normaliseAddress(transfer.fromAddress),
            toAddress: normaliseAddress(transfer.toAddress),
            assetSymbol: transfer.assetSymbol,
            assetContract: transfer.assetContract,
            amountBaseUnits: transfer.amountBaseUnits,
            decimals: transfer.decimals,
            status: transfer.status,
            confirmations: transfer.confirmations,
            provider: opts.provider.key,
            raw: transfer.raw as Record<string, unknown>,
          })
          // THE IDEMPOTENCY GUARANTEE: a re-scan silently skips what it
          // already recorded (network + hash + transfer index).
          .onConflictDoNothing()
          .returning({ id: blockchainTransactions.id });

        if (!inserted) continue;
        result.transactionsInserted += 1;

        const created = await raiseCandidate(db, {
          transactionId: inserted.id,
          propFirmId: wallet.propFirmId,
          trackedWalletId: wallet.id,
          walletPurpose: wallet.purpose,
          amountBaseUnits: transfer.amountBaseUnits,
        });
        if (created) result.candidatesCreated += 1;
      }

      result.cursor = nextCursor;
      if (!nextCursor || transfers.length === 0) break;
    }
  } catch (error) {
    // A failure is RECORDED, never swallowed. Silently returning zero would be
    // indistinguishable from a firm that made no payouts.
    result.error =
      error instanceof ProviderRateLimitError
        ? "rate limited by provider"
        : error instanceof ProviderError
          ? error.message
          : "scan failed";
  }

  await db
    .update(trackedWallets)
    .set({
      lastCheckedAt: now,
      scanCursor: result.cursor,
      lastScanError: result.error,
      ...(result.transactionsInserted > 0 ? { firstSeenAt: now } : {}),
    })
    .where(eq(trackedWallets.id, wallet.id));

  return result;
}

/**
 * Raises a candidate for an observed transfer.
 *
 * `confidence` ranks a review queue; it never decides anything. Even a wallet
 * an admin labelled `trader_payouts` and verified produces a candidate at
 * `match_review`, because wallets get reused and one mislabelled address would
 * otherwise inflate a firm's verified volume for as long as it kept paying.
 */
async function raiseCandidate(
  db: Database,
  opts: {
    transactionId: number;
    propFirmId: string;
    trackedWalletId: string;
    walletPurpose: string;
    amountBaseUnits: string;
  },
): Promise<boolean> {
  const reasons: string[] = ["outgoing_from_tracked_wallet"];
  let confidence = 40;

  if (opts.walletPurpose === "trader_payouts") {
    reasons.push("wallet_labelled_trader_payouts");
    confidence = 75;
  } else if (opts.walletPurpose === "unknown") {
    reasons.push("wallet_purpose_unknown");
    confidence = 25;
  }

  // A zero-value transfer is a contract interaction, not a payment.
  if (/^0+$/.test(opts.amountBaseUnits)) {
    reasons.push("zero_value");
    confidence = 0;
  }

  const [candidate] = await db
    .insert(payoutCandidates)
    .values({
      transactionId: opts.transactionId,
      propFirmId: opts.propFirmId,
      trackedWalletId: opts.trackedWalletId,
      status: "detected",
      confidence,
      matchReasons: reasons,
    })
    .onConflictDoNothing()
    .returning({ id: payoutCandidates.id });

  if (!candidate) return false;

  await db.insert(payoutVerificationEvents).values({
    candidateId: candidate.id,
    event: "detected",
    toStatus: "detected",
    note: reasons.join(", "),
  });

  return true;
}

/** Wallets due a scan, oldest check first. */
export async function walletsDueForScan(
  db: Database,
  opts: { limit?: number } = {},
): Promise<
  {
    id: string;
    address: string;
    networkKey: string;
    provider: string;
    chainId: number | null;
  }[]
> {
  return db
    .select({
      id: trackedWallets.id,
      address: trackedWallets.address,
      networkKey: blockchainNetworks.key,
      provider: blockchainNetworks.provider,
      chainId: blockchainNetworks.chainId,
    })
    .from(trackedWallets)
    .innerJoin(
      blockchainNetworks,
      eq(blockchainNetworks.id, trackedWallets.networkId),
    )
    .where(
      and(
        eq(trackedWallets.isActive, true),
        eq(blockchainNetworks.isActive, true),
      ),
    )
    .orderBy(sql`${trackedWallets.lastCheckedAt} asc nulls first`)
    .limit(Math.min(Math.max(opts.limit ?? 25, 1), 200));
}
