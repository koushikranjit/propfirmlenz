import { and, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import {
  blockchainNetworks,
  propFirms,
  verifiedPayouts,
} from "@/lib/db/schema";

/**
 * PUBLIC PAYOUT STATISTICS — docs/PAYOUTS.md §9 `[LOCKED]`.
 *
 * EVERY figure here is computed from `verified_payouts`, live, at read time.
 * Nothing is cached into a totals column, nothing is hard-coded, and nothing is
 * estimated. A number that cannot be recomputed from rows anyone can check on
 * a block explorer does not belong on a public page.
 *
 * RAW TRANSACTIONS AND CANDIDATES ARE UNREACHABLE FROM HERE. This module never
 * joins `blockchain_transactions` or `payout_candidates`, so a detected-but-
 * unverified transfer is structurally unable to reach a statistic — not merely
 * filtered out by a predicate somebody might forget.
 *
 * VOLUME IS A FLOOR, NOT A TOTAL `[LOCKED]`. These are verified ON-CHAIN
 * payouts from wallets we happen to track. Firms also pay by bank transfer,
 * card, processor and wallets nobody has identified, so no field here may be
 * presented as a firm's total payout volume. The naming reflects that
 * throughout: `verifiedVolume`, never `totalVolume`.
 */

/** Only published, live firms appear in public payout data. */
export const livePublishedFirm = and(
  eq(propFirms.status, "published"),
  isNull(propFirms.deletedAt),
  // A payout cannot link to a firm with no public page.
  isNotNull(propFirms.slug),
  isNotNull(propFirms.name),
);

export interface PayoutTotals {
  /** Number of verified payouts. */
  count: number;
  /**
   * Summed USD value of the payouts that HAVE a stored valuation, and how many
   * that was. The two travel together so a reader is never shown a total that
   * silently omits payouts we could not price (docs/PAYOUTS.md §8).
   */
  usdValue: string | null;
  usdValuedCount: number;
  largestUsd: string | null;
  averageUsd: string | null;
  latestAt: string | null;
}

const EMPTY_TOTALS: PayoutTotals = {
  count: 0,
  usdValue: null,
  usdValuedCount: 0,
  largestUsd: null,
  averageUsd: null,
  latestAt: null,
};

/** Windows the public page offers. */
export type PayoutWindow = "24h" | "7d" | "30d" | "365d" | "all";

const WINDOW_MS: Record<Exclude<PayoutWindow, "all">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "365d": 365 * 24 * 60 * 60 * 1000,
};

export function windowStart(window: PayoutWindow, now: Date): Date | null {
  return window === "all" ? null : new Date(now.getTime() - WINDOW_MS[window]);
}

/** Verified payout totals across every published firm, for one window. */
export async function getPayoutTotals(
  db: Database,
  window: PayoutWindow = "all",
  now: Date = new Date(),
): Promise<PayoutTotals> {
  const start = windowStart(window, now);

  const rows = await db
    .select({
      count: sql<number>`count(*)::int`,
      usdValue: sql<string | null>`sum(${verifiedPayouts.usdValue})::text`,
      usdValuedCount: sql<number>`count(${verifiedPayouts.usdValue})::int`,
      largestUsd: sql<string | null>`max(${verifiedPayouts.usdValue})::text`,
      averageUsd: sql<
        string | null
      >`round(avg(${verifiedPayouts.usdValue}), 2)::text`,
      latestAt: sql<
        string | null
      >`max(${verifiedPayouts.transactionTimestamp})::text`,
    })
    .from(verifiedPayouts)
    .innerJoin(propFirms, eq(propFirms.id, verifiedPayouts.propFirmId))
    .where(
      start
        ? and(
            livePublishedFirm,
            gte(verifiedPayouts.transactionTimestamp, start),
          )
        : livePublishedFirm,
    );

  return rows[0] ?? EMPTY_TOTALS;
}

/** Narrows a row the `livePublishedFirm` filter has already excluded. */
export function isPayoutAddressable<
  T extends { firmSlug: string | null; firmName: string | null },
>(row: T): row is T & { firmSlug: string; firmName: string } {
  return row.firmSlug !== null && row.firmName !== null;
}

export interface PublicPayout {
  id: string;
  firmName: string;
  firmSlug: string;
  networkName: string;
  txHash: string;
  explorerUrl: string;
  assetSymbol: string;
  amountBaseUnits: string;
  decimals: number;
  usdValue: string | null;
  transactionTimestamp: string;
  /** Recipient is shown truncated by the UI; never a trader identity. */
  toAddress: string;
}

/**
 * The most recent verified payouts.
 *
 * Each row carries its hash and explorer link, because a payout claim a reader
 * cannot check independently is just an assertion.
 */
export async function listRecentVerifiedPayouts(
  db: Database,
  opts: { limit?: number; window?: PayoutWindow; firmId?: string } = {},
  now: Date = new Date(),
): Promise<PublicPayout[]> {
  const start = windowStart(opts.window ?? "all", now);
  const clauses = [livePublishedFirm];
  if (start) clauses.push(gte(verifiedPayouts.transactionTimestamp, start));
  if (opts.firmId) clauses.push(eq(verifiedPayouts.propFirmId, opts.firmId));

  const rows = await db
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
      toAddress: verifiedPayouts.toAddress,
    })
    .from(verifiedPayouts)
    .innerJoin(propFirms, eq(propFirms.id, verifiedPayouts.propFirmId))
    .innerJoin(
      blockchainNetworks,
      eq(blockchainNetworks.id, verifiedPayouts.networkId),
    )
    .where(and(...clauses))
    .orderBy(desc(verifiedPayouts.transactionTimestamp))
    .limit(Math.min(Math.max(opts.limit ?? 25, 1), 100));

  return rows.filter(isPayoutAddressable).map((row) => ({
    ...row,
    transactionTimestamp: row.transactionTimestamp.toISOString(),
  }));
}

/** One firm's verified payout summary, for its public profile. */
export async function getFirmPayoutTotals(
  db: Database,
  firmId: string,
): Promise<PayoutTotals> {
  const rows = await db
    .select({
      count: sql<number>`count(*)::int`,
      usdValue: sql<string | null>`sum(${verifiedPayouts.usdValue})::text`,
      usdValuedCount: sql<number>`count(${verifiedPayouts.usdValue})::int`,
      largestUsd: sql<string | null>`max(${verifiedPayouts.usdValue})::text`,
      averageUsd: sql<
        string | null
      >`round(avg(${verifiedPayouts.usdValue}), 2)::text`,
      latestAt: sql<
        string | null
      >`max(${verifiedPayouts.transactionTimestamp})::text`,
    })
    .from(verifiedPayouts)
    .where(eq(verifiedPayouts.propFirmId, firmId));

  return rows[0] ?? EMPTY_TOTALS;
}

/** Networks currently carrying verified payouts, for the methodology page. */
export async function listCoveredNetworks(
  db: Database,
): Promise<{ name: string; key: string; count: number }[]> {
  return db
    .select({
      name: blockchainNetworks.name,
      key: blockchainNetworks.key,
      count: sql<number>`count(*)::int`,
    })
    .from(verifiedPayouts)
    .innerJoin(
      blockchainNetworks,
      eq(blockchainNetworks.id, verifiedPayouts.networkId),
    )
    .innerJoin(propFirms, eq(propFirms.id, verifiedPayouts.propFirmId))
    .where(livePublishedFirm)
    .groupBy(
      blockchainNetworks.id,
      blockchainNetworks.name,
      blockchainNetworks.key,
    )
    .orderBy(desc(sql`count(*)`));
}
