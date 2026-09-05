import { and, eq } from "drizzle-orm";
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
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { explorerUrl } from "@/lib/blockchain/provider";

/**
 * PAYOUT VERIFICATION — docs/PAYOUTS.md §7 `[LOCKED]`.
 *
 * The gate between "a transaction exists" and "we will publish it as a payout".
 *
 * SIX CONDITIONS, ALL REQUIRED `[LOCKED]`:
 *
 *  1. a real transaction is on record;
 *  2. it settled — failed and pending transactions never count;
 *  3. its hash is independently checkable, and the row carries the explorer
 *     link so a reader can do exactly that;
 *  4. it LEFT a wallet this firm is tracked as paying from — money coming IN
 *     is never a payout;
 *  5. the asset and an exact amount are derivable;
 *  6. a human decided it is a trader payout.
 *
 * Condition 6 is deliberate, and NO RULE MAY SUBSTITUTE FOR IT. A heuristic
 * good enough to auto-verify would also be good enough to publish a treasury
 * transfer as a trader payout, and that error is invisible once it is in the
 * totals.
 *
 * That decision is exercised in exactly two places, and nowhere else: HERE,
 * per transfer, with `firm:verify`; or once per WALLET, by marking it verified
 * trader payouts, which stands as the same person's authorisation for that
 * address (`payout-autopublish.ts`). This module promotes nothing on its own.
 *
 * Every transition is appended to `payout_verification_events`, so any figure
 * on the public page can be traced back to the person who allowed it.
 */

export class VerificationError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "NOT_SETTLED"
      | "ALREADY_VERIFIED"
      | "ZERO_AMOUNT"
      | "WALLET_INACTIVE"
      | "NOT_OUTGOING",
    message: string,
  ) {
    super(message);
    this.name = "VerificationError";
  }
}

export interface VerifyResult {
  payoutId: string;
  candidateId: string;
  txHash: string;
}

/**
 * Promotes a candidate to a verified payout, in one transaction.
 *
 * The candidate update, the payout row and the audit event commit together: a
 * payout with no trail, or a trail with no payout, would each undermine the
 * claim the feature exists to make.
 */
export async function verifyCandidate(
  db: Database,
  opts: {
    adminUserId: string;
    candidateId: string;
    note?: string | undefined;
    /** Optional valuation. Written only WITH its rate and provenance. */
    usd?:
      | {
          value: string;
          rate: string;
          source: string;
          rateAt: Date;
        }
      | undefined;
  },
): Promise<VerifyResult> {
  await requirePermission(db, opts.adminUserId, PERMISSIONS.FIRM_VERIFY);

  const [row] = await db
    .select({
      candidateId: payoutCandidates.id,
      candidateStatus: payoutCandidates.status,
      propFirmId: payoutCandidates.propFirmId,
      walletId: payoutCandidates.trackedWalletId,
      walletActive: trackedWallets.isActive,
      walletAddress: trackedWallets.addressNormalized,
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
      status: blockchainTransactions.status,
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
    .innerJoin(
      trackedWallets,
      eq(trackedWallets.id, payoutCandidates.trackedWalletId),
    )
    .where(eq(payoutCandidates.id, opts.candidateId))
    .limit(1);

  if (!row) throw new VerificationError("NOT_FOUND", "Candidate not found.");
  if (row.candidateStatus === "verified") {
    throw new VerificationError(
      "ALREADY_VERIFIED",
      "That payout is already verified.",
    );
  }

  // (2) Settled only.
  if (row.status !== "success") {
    throw new VerificationError(
      "NOT_SETTLED",
      "The transaction has not settled successfully.",
    );
  }
  if (
    row.confirmations !== null &&
    row.confirmations < row.confirmationsRequired
  ) {
    throw new VerificationError(
      "NOT_SETTLED",
      `Only ${row.confirmations} confirmations; ${row.confirmationsRequired} are required.`,
    );
  }

  // (5) A real amount.
  if (/^0+$/.test(row.amountBaseUnits)) {
    throw new VerificationError(
      "ZERO_AMOUNT",
      "A zero-value transfer is not a payout.",
    );
  }

  // (4) Still a wallet we track for this firm...
  if (!row.walletActive) {
    throw new VerificationError(
      "WALLET_INACTIVE",
      "The source wallet is no longer tracked.",
    );
  }
  // ...and the money LEFT it. A firm's wallet also receives — challenge fees,
  // exchange returns, treasury movements — and publishing one of those would
  // record money the firm was PAID as money it paid out.
  if (
    row.fromAddress.trim().toLowerCase() !==
    row.walletAddress.trim().toLowerCase()
  ) {
    throw new VerificationError(
      "NOT_OUTGOING",
      "That transfer went INTO the tracked wallet. Only transfers out of it are payouts.",
    );
  }

  return db.transaction(async (tx) => {
    const [payout] = await tx
      .insert(verifiedPayouts)
      .values({
        propFirmId: row.propFirmId,
        networkId: row.networkId,
        candidateId: row.candidateId,
        transactionId: row.transactionId,
        sourceWalletId: row.walletId,
        txHash: row.txHash,
        blockNumber: row.blockNumber,
        transactionTimestamp: row.blockTimestamp,
        fromAddress: row.fromAddress,
        toAddress: row.toAddress,
        assetSymbol: row.assetSymbol,
        assetContract: row.assetContract,
        amountBaseUnits: row.amountBaseUnits,
        decimals: row.decimals,
        // Valuation is optional and never invented; the CHECK constraint
        // refuses a value without its rate, source and timestamp.
        ...(opts.usd
          ? {
              usdValue: opts.usd.value,
              usdRate: opts.usd.rate,
              usdRateSource: opts.usd.source,
              usdRateAt: opts.usd.rateAt,
            }
          : {}),
        explorerUrl: explorerUrl(row.explorerTemplate, row.txHash),
        verifiedByAdminId: opts.adminUserId,
      })
      .returning({ id: verifiedPayouts.id });

    if (!payout) throw new Error("Failed to record the verified payout");

    await tx
      .update(payoutCandidates)
      .set({
        status: "verified",
        reviewedByAdminId: opts.adminUserId,
        reviewedAt: new Date(),
      })
      .where(eq(payoutCandidates.id, row.candidateId));

    await tx.insert(payoutVerificationEvents).values({
      candidateId: row.candidateId,
      event: "verified",
      actorAdminId: opts.adminUserId,
      fromStatus: row.candidateStatus,
      toStatus: "verified",
      ...(opts.note ? { note: opts.note } : {}),
    });

    await tx.insert(auditLogs).values({
      actorType: "admin",
      actorAdminId: opts.adminUserId,
      action: "payout.verified",
      entityType: "prop_firm",
      entityId: row.propFirmId,
      after: { txHash: row.txHash, asset: row.assetSymbol },
    });

    return {
      payoutId: payout.id,
      candidateId: row.candidateId,
      txHash: row.txHash,
    };
  });
}

/** Rejects a candidate. A reason is mandatory — the constraint enforces it. */
export async function rejectCandidate(
  db: Database,
  opts: { adminUserId: string; candidateId: string; reason: string },
): Promise<void> {
  await requirePermission(db, opts.adminUserId, PERMISSIONS.FIRM_VERIFY);

  const reason = opts.reason.trim();
  if (reason.length === 0) {
    throw new VerificationError("NOT_FOUND", "A rejection needs a reason.");
  }

  const [candidate] = await db
    .select({ id: payoutCandidates.id, status: payoutCandidates.status })
    .from(payoutCandidates)
    .where(eq(payoutCandidates.id, opts.candidateId))
    .limit(1);
  if (!candidate)
    throw new VerificationError("NOT_FOUND", "Candidate not found.");
  if (candidate.status === "verified") {
    throw new VerificationError(
      "ALREADY_VERIFIED",
      "Withdraw the verified payout before rejecting it.",
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(payoutCandidates)
      .set({
        status: "rejected",
        rejectionReason: reason,
        reviewedByAdminId: opts.adminUserId,
        reviewedAt: new Date(),
      })
      .where(eq(payoutCandidates.id, candidate.id));

    await tx.insert(payoutVerificationEvents).values({
      candidateId: candidate.id,
      event: "rejected",
      actorAdminId: opts.adminUserId,
      fromStatus: candidate.status,
      toStatus: "rejected",
      note: reason,
    });
  });
}

/** Moves a detected candidate into the review queue. */
export async function markForReview(
  db: Database,
  opts: { adminUserId: string; candidateId: string },
): Promise<void> {
  await requirePermission(db, opts.adminUserId, PERMISSIONS.FIRM_VERIFY);

  const [candidate] = await db
    .select({ id: payoutCandidates.id, status: payoutCandidates.status })
    .from(payoutCandidates)
    .where(
      and(
        eq(payoutCandidates.id, opts.candidateId),
        eq(payoutCandidates.status, "detected"),
      ),
    )
    .limit(1);
  if (!candidate) return;

  await db.transaction(async (tx) => {
    await tx
      .update(payoutCandidates)
      .set({ status: "match_review" })
      .where(eq(payoutCandidates.id, candidate.id));
    await tx.insert(payoutVerificationEvents).values({
      candidateId: candidate.id,
      event: "matched",
      actorAdminId: opts.adminUserId,
      fromStatus: "detected",
      toStatus: "match_review",
    });
  });
}
