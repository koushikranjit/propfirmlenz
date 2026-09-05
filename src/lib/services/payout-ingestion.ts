import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import {
  blockchainNetworks,
  blockchainTokens,
  blockchainTransactions,
  payoutCandidates,
  payoutVerificationEvents,
  trackedWalletTokens,
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
 * auditable decision — a wallet label is a hint, never proof. Callers run
 * `payout-autopublish.ts` afterwards, which releases candidates only for
 * wallets a person has already marked verified trader payouts; every other
 * wallet's candidates wait for `payout-verification.ts`.
 */

export interface ScanResult {
  walletId: string;
  transfersSeen: number;
  transactionsInserted: number;
  candidatesCreated: number;
  /**
   * Transfers INTO the wallet, which are never payouts.
   *
   * Counted rather than silently dropped: an operator seeing "0 new
   * transactions" needs to be able to tell a quiet wallet from one whose page
   * budget went entirely on money coming in.
   */
  skippedIncoming: number;
  /** Transfers of assets that are not configured, tracked, enabled tokens. */
  skippedUnsupportedToken: number;
  /** Configured decimals disagreeing with what the provider reported. */
  decimalsMismatch: number;
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
    skippedIncoming: 0,
    skippedUnsupportedToken: 0,
    decimalsMismatch: 0,
    cursor: opts.resume === false ? null : wallet.scanCursor,
    error: null,
  };

  /**
   * The tokens this wallet is tracked for — docs/PAYOUTS.md §5 `[LOCKED]`.
   *
   * Keyed by CONTRACT, never by ticker. "USDT" exists independently on many
   * chains, and any contract can call itself whatever it likes; matching on
   * the symbol would let an unrelated token be counted as a stablecoin payout.
   *
   * A wallet with no tokens selected falls back to every enabled token on its
   * network, so an admin who adds a wallet without picking tokens gets the
   * network's configured stablecoins rather than silence.
   */
  const walletTokens = await db
    .select({
      contract: blockchainTokens.contractAddress,
      symbol: blockchainTokens.symbol,
      decimals: blockchainTokens.decimals,
    })
    .from(blockchainTokens)
    .innerJoin(
      trackedWalletTokens,
      eq(trackedWalletTokens.tokenId, blockchainTokens.id),
    )
    .where(
      and(
        eq(trackedWalletTokens.walletId, wallet.id),
        eq(blockchainTokens.isEnabled, true),
      ),
    );

  const networkTokens =
    walletTokens.length > 0
      ? walletTokens
      : await db
          .select({
            contract: blockchainTokens.contractAddress,
            symbol: blockchainTokens.symbol,
            decimals: blockchainTokens.decimals,
          })
          .from(blockchainTokens)
          .where(
            and(
              eq(blockchainTokens.networkId, wallet.networkId),
              eq(blockchainTokens.isEnabled, true),
            ),
          );

  const supported = new Map(
    networkTokens.map((t) => [t.contract.toLowerCase(), t]),
  );

  // No configured token means nothing is recognisable on this network. Saying
  // so is the honest result; scanning anyway would raise candidates for assets
  // nobody has identified.
  if (supported.size === 0) {
    result.error = "no enabled token is configured for this network";
    await db
      .update(trackedWallets)
      .set({ lastCheckedAt: now, lastScanError: result.error })
      .where(eq(trackedWallets.id, wallet.id));
    return result;
  }

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
        /*
         * A PAYOUT IS MONEY LEAVING THE FIRM `[LOCKED]`.
         *
         * Every adapter is contracted to return outgoing transfers only, and
         * this check is the backstop for the one that gets it wrong. It is a
         * backstop worth keeping: a firm wallet also receives challenge fees
         * and treasury movements, and crediting those to the firm as payouts
         * would invent a payout record for money it was PAID.
         */
        if (
          normaliseAddress(transfer.fromAddress) !==
          normaliseAddress(wallet.address)
        ) {
          result.skippedIncoming += 1;
          continue;
        }
        if (transfer.status !== "success") continue;

        // ONLY CONFIGURED TOKENS. An unrecognised contract is not "probably a
        // stablecoin" — it is unknown, and unknown assets do not become
        // payout candidates.
        const contract = transfer.assetContract?.toLowerCase() ?? null;
        const token = contract ? supported.get(contract) : undefined;
        if (!token) {
          result.skippedUnsupportedToken += 1;
          continue;
        }

        // The configured decimals is a CROSS-CHECK, not the source of truth.
        // A disagreement means one of the two is wrong, and a wrong exponent
        // mis-scales every amount by orders of magnitude — so it is counted
        // and surfaced rather than silently resolved.
        if (token.decimals !== transfer.decimals) {
          result.decimalsMismatch += 1;
        }

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
        // A removed wallet stops being scanned. What it already produced,
        // including anything published, stays exactly where it is.
        isNull(trackedWallets.deletedAt),
        eq(blockchainNetworks.isActive, true),
      ),
    )
    .orderBy(sql`${trackedWallets.lastCheckedAt} asc nulls first`)
    .limit(Math.min(Math.max(opts.limit ?? 25, 1), 200));
}
