import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import {
  adminUsers,
  blockchainNetworks,
  blockchainTransactions,
  payoutCandidates,
  propFirms,
  trackedWallets,
  verifiedPayouts,
} from "@/lib/db/schema";
import type { CandidateStatus } from "@/lib/db/schema/payouts";

/**
 * ADMIN payout reads — docs/PAYOUTS.md §11.
 *
 * Unlike `public-payouts.ts`, this module DOES reach raw transactions and
 * candidates: reviewing a candidate is impossible without seeing the chain data
 * behind it. That is exactly why the two modules are separate — the public one
 * cannot reach this data even by mistake, because it does not import it.
 *
 * Every list here is bounded. An unbounded scan over chain data is the one
 * query most likely to grow without anyone noticing.
 */

export interface AdminNetwork {
  id: string;
  key: string;
  name: string;
  chainId: number | null;
  nativeSymbol: string;
  explorerTxTemplate: string;
  provider: string;
  confirmationsRequired: number;
  isActive: boolean;
  walletCount: number;
}

export async function listNetworks(db: Database): Promise<AdminNetwork[]> {
  return db
    .select({
      id: blockchainNetworks.id,
      key: blockchainNetworks.key,
      name: blockchainNetworks.name,
      chainId: blockchainNetworks.chainId,
      nativeSymbol: blockchainNetworks.nativeSymbol,
      explorerTxTemplate: blockchainNetworks.explorerTxTemplate,
      provider: blockchainNetworks.provider,
      confirmationsRequired: blockchainNetworks.confirmationsRequired,
      isActive: blockchainNetworks.isActive,
      walletCount: sql<number>`(
        select count(*)::int from ${trackedWallets}
        where ${trackedWallets.networkId} = ${blockchainNetworks.id}
          and ${trackedWallets.deletedAt} is null
      )`,
    })
    .from(blockchainNetworks)
    .orderBy(blockchainNetworks.name);
}

export interface AdminWallet {
  id: string;
  address: string;
  label: string | null;
  purpose: string;
  verificationStatus: string;
  isActive: boolean;
  notes: string | null;
  firmId: string;
  firmName: string | null;
  networkId: string;
  networkName: string;
  lastCheckedAt: Date | null;
  lastScanError: string | null;
  transactionCount: number;
  /** Payouts already published from this wallet, without further review. */
  publishedCount: number;
  verifiedAt: Date | null;
}

export async function listTrackedWallets(
  db: Database,
  opts: { firmId?: string; limit?: number } = {},
): Promise<AdminWallet[]> {
  const query = db
    .select({
      id: trackedWallets.id,
      address: trackedWallets.address,
      label: trackedWallets.label,
      purpose: trackedWallets.purpose,
      verificationStatus: trackedWallets.verificationStatus,
      isActive: trackedWallets.isActive,
      notes: trackedWallets.notes,
      firmId: propFirms.id,
      firmName: propFirms.name,
      networkId: blockchainNetworks.id,
      networkName: blockchainNetworks.name,
      lastCheckedAt: trackedWallets.lastCheckedAt,
      lastScanError: trackedWallets.lastScanError,
      verifiedAt: trackedWallets.verifiedAt,
      publishedCount: sql<number>`(
        select count(*)::int from ${verifiedPayouts}
        where ${verifiedPayouts.sourceWalletId} = ${trackedWallets.id}
      )`,
      // How much chain data this wallet has actually produced — the honest
      // answer to "is this address doing anything?".
      transactionCount: sql<number>`(
        select count(*)::int from ${blockchainTransactions}
        where ${blockchainTransactions.networkId} = ${trackedWallets.networkId}
          and ${blockchainTransactions.fromAddress} = ${trackedWallets.addressNormalized}
      )`,
    })
    .from(trackedWallets)
    .innerJoin(propFirms, eq(propFirms.id, trackedWallets.propFirmId))
    .innerJoin(
      blockchainNetworks,
      eq(blockchainNetworks.id, trackedWallets.networkId),
    )
    // A removed wallet is gone from the admin. Its published payouts remain —
    // retiring an address does not un-happen the transfers it made.
    .where(
      opts.firmId
        ? and(
            isNull(trackedWallets.deletedAt),
            eq(trackedWallets.propFirmId, opts.firmId),
          )
        : isNull(trackedWallets.deletedAt),
    )
    .orderBy(desc(trackedWallets.createdAt))
    .limit(Math.min(Math.max(opts.limit ?? 100, 1), 500));

  return query;
}

export interface AdminCandidate {
  id: string;
  status: string;
  confidence: number | null;
  matchReasons: string[] | null;
  rejectionReason: string | null;
  detectedAt: Date;
  firmId: string;
  firmName: string | null;
  walletLabel: string | null;
  walletPurpose: string;
  networkName: string;
  explorerTxTemplate: string;
  txHash: string;
  transactionTimestamp: Date;
  fromAddress: string;
  toAddress: string;
  assetSymbol: string;
  amountBaseUnits: string;
  decimals: number;
  confirmations: number | null;
  confirmationsRequired: number;
  reviewedAt: Date | null;
  reviewedBy: string | null;
}

export const CANDIDATE_PAGE_SIZE = 25;

/** One page of the review queue, oldest-detected first so nothing is stranded. */
export async function listCandidates(
  db: Database,
  opts: { status: CandidateStatus; page?: number },
): Promise<{ rows: AdminCandidate[]; total: number }> {
  const page = Math.min(Math.max(opts.page ?? 1, 1), 500);
  const where = eq(payoutCandidates.status, opts.status);

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(payoutCandidates)
    .where(where);

  const rows = await db
    .select({
      id: payoutCandidates.id,
      status: payoutCandidates.status,
      confidence: payoutCandidates.confidence,
      matchReasons: payoutCandidates.matchReasons,
      rejectionReason: payoutCandidates.rejectionReason,
      detectedAt: payoutCandidates.createdAt,
      firmId: propFirms.id,
      firmName: propFirms.name,
      walletLabel: trackedWallets.label,
      walletPurpose: trackedWallets.purpose,
      networkName: blockchainNetworks.name,
      explorerTxTemplate: blockchainNetworks.explorerTxTemplate,
      txHash: blockchainTransactions.txHash,
      transactionTimestamp: blockchainTransactions.blockTimestamp,
      fromAddress: blockchainTransactions.fromAddress,
      toAddress: blockchainTransactions.toAddress,
      assetSymbol: blockchainTransactions.assetSymbol,
      amountBaseUnits: blockchainTransactions.amountBaseUnits,
      decimals: blockchainTransactions.decimals,
      confirmations: blockchainTransactions.confirmations,
      confirmationsRequired: blockchainNetworks.confirmationsRequired,
      reviewedAt: payoutCandidates.reviewedAt,
      reviewedBy: adminUsers.fullName,
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
    .innerJoin(propFirms, eq(propFirms.id, payoutCandidates.propFirmId))
    .innerJoin(
      trackedWallets,
      eq(trackedWallets.id, payoutCandidates.trackedWalletId),
    )
    .leftJoin(adminUsers, eq(adminUsers.id, payoutCandidates.reviewedByAdminId))
    .where(where)
    .orderBy(desc(payoutCandidates.confidence), payoutCandidates.createdAt)
    .limit(CANDIDATE_PAGE_SIZE)
    .offset((page - 1) * CANDIDATE_PAGE_SIZE);

  return { rows, total: countRow?.total ?? 0 };
}

/** How much work is waiting, by state. Drives the queue's tabs. */
export async function countCandidatesByStatus(
  db: Database,
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      status: payoutCandidates.status,
      count: sql<number>`count(*)::int`,
    })
    .from(payoutCandidates)
    .groupBy(payoutCandidates.status);

  return Object.fromEntries(rows.map((r) => [r.status, r.count]));
}

export interface AdminVerifiedPayout {
  id: string;
  firmName: string | null;
  firmSlug: string | null;
  networkName: string;
  txHash: string;
  explorerUrl: string;
  assetSymbol: string;
  amountBaseUnits: string;
  decimals: number;
  usdValue: string | null;
  transactionTimestamp: Date;
  verifiedAt: Date;
  verifiedBy: string | null;
}

/** Verified payouts including those of unpublished firms — this is the ledger. */
export async function listVerifiedPayoutsForAdmin(
  db: Database,
  opts: { limit?: number } = {},
): Promise<AdminVerifiedPayout[]> {
  return db
    .select({
      id: verifiedPayouts.id,
      firmName: propFirms.name,
      firmSlug: propFirms.slug,
      networkName: blockchainNetworks.name,
      txHash: verifiedPayouts.txHash,
      explorerUrl: verifiedPayouts.explorerUrl,
      assetSymbol: verifiedPayouts.assetSymbol,
      amountBaseUnits: verifiedPayouts.amountBaseUnits,
      decimals: verifiedPayouts.decimals,
      usdValue: verifiedPayouts.usdValue,
      transactionTimestamp: verifiedPayouts.transactionTimestamp,
      verifiedAt: verifiedPayouts.verifiedAt,
      verifiedBy: adminUsers.fullName,
    })
    .from(verifiedPayouts)
    .innerJoin(propFirms, eq(propFirms.id, verifiedPayouts.propFirmId))
    .innerJoin(
      blockchainNetworks,
      eq(blockchainNetworks.id, verifiedPayouts.networkId),
    )
    .leftJoin(adminUsers, eq(adminUsers.id, verifiedPayouts.verifiedByAdminId))
    .orderBy(desc(verifiedPayouts.verifiedAt))
    .limit(Math.min(Math.max(opts.limit ?? 50, 1), 200));
}

/** Firms available to attach a wallet to, including drafts. */
export async function listFirmOptions(
  db: Database,
): Promise<{ id: string; name: string | null }[]> {
  return db
    .select({ id: propFirms.id, name: propFirms.name })
    .from(propFirms)
    .where(sql`${propFirms.deletedAt} is null`)
    .orderBy(propFirms.name)
    .limit(500);
}
