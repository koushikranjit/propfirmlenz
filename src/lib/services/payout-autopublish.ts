import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import {
  auditLogs,
  blockchainNetworks,
  blockchainTransactions,
  payoutCandidates,
  payoutVerificationEvents,
  trackedWallets,
  verifiedPayouts,
} from "@/lib/db/schema";
import { explorerUrl } from "@/lib/blockchain/provider";

/**
 * AUTO-PUBLISH FROM VERIFIED WALLETS — docs/PAYOUTS.md §7 `[owner-directed
 * 2026-09-05]`.
 *
 * The human decision moved UP A LEVEL. It used to be "is this transfer a
 * trader payout?", asked once per transfer. That does not survive contact with
 * a wallet holding ten thousand of them — nobody reviews ten thousand rows,
 * and a queue nobody works is worse than no queue.
 *
 * It is now "is this WALLET a trader payout wallet?", asked once, by a person,
 * with evidence recorded. A wallet marked `trader_payouts` AND `verified`
 * publishes its transfers automatically; every other wallet still queues its
 * candidates for review.
 *
 * WHAT THIS DOES NOT RELAX `[LOCKED]`. The integrity conditions still apply to
 * every transfer: it must have settled, be non-zero, come from the tracked
 * wallet, and not already be published. Those are facts about a transaction,
 * not judgements about intent — automating them costs nothing. What was never
 * automatable, and still is not, is deciding that an address pays traders.
 *
 * The trail stays accountable: each auto-published payout is attributed to the
 * admin who verified the WALLET, and its event says it was published under
 * that authorisation rather than by a separate human decision.
 */

export interface AutoPublishResult {
  published: number;
  skipped: number;
}

/** A wallet whose transfers publish without further review. */
export function isAutoPublishing(wallet: {
  purpose: string;
  verificationStatus: string;
  isActive: boolean;
  deletedAt: Date | null;
}): boolean {
  return (
    wallet.purpose === "trader_payouts" &&
    wallet.verificationStatus === "verified" &&
    wallet.isActive &&
    wallet.deletedAt === null
  );
}

/**
 * Publishes every eligible pending candidate for one wallet.
 *
 * Called after a scan, and again when a wallet is first marked verified — so
 * turning a wallet on also releases the candidates it accumulated while it was
 * still unverified, rather than stranding them.
 */
export async function autoPublishForWallet(
  db: Database,
  opts: { walletId: string },
): Promise<AutoPublishResult> {
  const result: AutoPublishResult = { published: 0, skipped: 0 };

  const [wallet] = await db
    .select({
      id: trackedWallets.id,
      propFirmId: trackedWallets.propFirmId,
      purpose: trackedWallets.purpose,
      verificationStatus: trackedWallets.verificationStatus,
      isActive: trackedWallets.isActive,
      deletedAt: trackedWallets.deletedAt,
      verifiedByAdminId: trackedWallets.verifiedByAdminId,
      addressNormalized: trackedWallets.addressNormalized,
    })
    .from(trackedWallets)
    .where(eq(trackedWallets.id, opts.walletId))
    .limit(1);

  if (!wallet || !isAutoPublishing(wallet)) return result;

  const pending = await db
    .select({
      candidateId: payoutCandidates.id,
      status: payoutCandidates.status,
      transactionId: blockchainTransactions.id,
      networkId: blockchainTransactions.networkId,
      txHash: blockchainTransactions.txHash,
      blockNumber: blockchainTransactions.blockNumber,
      blockTimestamp: blockchainTransactions.blockTimestamp,
      fromAddress: blockchainTransactions.fromAddress,
      toAddress: blockchainTransactions.toAddress,
      assetSymbol: blockchainTransactions.assetSymbol,
      assetContract: blockchainTransactions.assetContract,
      amountBaseUnits: blockchainTransactions.amountBaseUnits,
      decimals: blockchainTransactions.decimals,
      status_: blockchainTransactions.status,
      confirmations: blockchainTransactions.confirmations,
      confirmationsRequired: blockchainNetworks.confirmationsRequired,
      explorerTemplate: blockchainNetworks.explorerTxTemplate,
    })
    .from(payoutCandidates)
    .innerJoin(
      blockchainTransactions,
      eq(blockchainTransactions.id, payoutCandidates.transactionId),
    )
    .innerJoin(
      blockchainNetworks,
      eq(blockchainNetworks.id, blockchainTransactions.networkId),
    )
    .where(
      and(
        eq(payoutCandidates.trackedWalletId, wallet.id),
        // A HUMAN REJECTION IS FINAL. Auto-publish only picks up candidates
        // nobody has ruled on — `rejected` and `unverified` were decisions,
        // and a job that quietly overturned them would make review pointless.
        inArray(payoutCandidates.status, ["detected", "match_review"]),
      ),
    );

  for (const row of pending) {
    // The same integrity conditions the manual path enforces. These are facts
    // about the transaction, checkable by anyone; none of them is a judgement.
    const settled = row.status_ === "success";
    const deepEnough =
      row.confirmations === null ||
      row.confirmations >= row.confirmationsRequired;
    const nonZero = !/^0+$/.test(row.amountBaseUnits);
    const fromThisWallet =
      row.fromAddress.toLowerCase() === wallet.addressNormalized.toLowerCase();

    if (!settled || !deepEnough || !nonZero || !fromThisWallet) {
      result.skipped += 1;
      continue;
    }

    await db.transaction(async (tx) => {
      const [payout] = await tx
        .insert(verifiedPayouts)
        .values({
          propFirmId: wallet.propFirmId,
          networkId: row.networkId,
          candidateId: row.candidateId,
          transactionId: row.transactionId,
          sourceWalletId: wallet.id,
          txHash: row.txHash,
          blockNumber: row.blockNumber,
          transactionTimestamp: row.blockTimestamp,
          fromAddress: row.fromAddress,
          toAddress: row.toAddress,
          assetSymbol: row.assetSymbol,
          assetContract: row.assetContract,
          amountBaseUnits: row.amountBaseUnits,
          decimals: row.decimals,
          explorerUrl: explorerUrl(row.explorerTemplate, row.txHash),
          // Attributed to whoever authorised the WALLET. Every payout here
          // rests on that person's judgement, so the trail must name them.
          ...(wallet.verifiedByAdminId
            ? { verifiedByAdminId: wallet.verifiedByAdminId }
            : {}),
        })
        // A transfer already published stays published; re-running is safe.
        .onConflictDoNothing()
        .returning({ id: verifiedPayouts.id });

      if (!payout) return;

      await tx
        .update(payoutCandidates)
        .set({
          status: "verified",
          reviewedAt: new Date(),
          ...(wallet.verifiedByAdminId
            ? { reviewedByAdminId: wallet.verifiedByAdminId }
            : {}),
        })
        .where(eq(payoutCandidates.id, row.candidateId));

      await tx.insert(payoutVerificationEvents).values({
        candidateId: row.candidateId,
        event: "verified",
        ...(wallet.verifiedByAdminId
          ? { actorAdminId: wallet.verifiedByAdminId }
          : {}),
        fromStatus: row.status,
        toStatus: "verified",
        note: "Published automatically under the wallet's verification.",
      });

      result.published += 1;
    });
  }

  if (result.published > 0 && wallet.verifiedByAdminId) {
    await db.insert(auditLogs).values({
      actorType: "admin",
      actorAdminId: wallet.verifiedByAdminId,
      action: "payout.auto_published",
      entityType: "prop_firm",
      entityId: wallet.propFirmId,
      after: { walletId: wallet.id, published: result.published },
    });
  }

  return result;
}

/** Wallets currently set to publish automatically, for the admin to see. */
export async function countAutoPublishingWallets(
  db: Database,
): Promise<number> {
  const rows = await db
    .select({ id: trackedWallets.id })
    .from(trackedWallets)
    .where(
      and(
        eq(trackedWallets.purpose, "trader_payouts"),
        eq(trackedWallets.verificationStatus, "verified"),
        eq(trackedWallets.isActive, true),
        isNull(trackedWallets.deletedAt),
      ),
    );
  return rows.length;
}
