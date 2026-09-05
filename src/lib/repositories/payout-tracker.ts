import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import {
  blockchainNetworks,
  media,
  propFirms,
  verifiedPayouts,
} from "@/lib/db/schema";
import {
  type PayoutWindow,
  isPayoutAddressable,
  livePublishedFirm,
  windowStart,
} from "./public-payouts";

/**
 * THE PAYOUT TRACKER — docs/PAYOUTS.md §9 `[LOCKED]`.
 *
 * A ranking of firms by verified on-chain payouts, and the per-firm breakdown
 * behind each row. Reads `verified_payouts` only — it never joins
 * `blockchain_transactions` or `payout_candidates`, so an unverified transfer
 * is structurally unable to reach a public figure.
 *
 * WHAT IS DELIBERATELY ABSENT, and why `[LOCKED]`. Trackers of this shape
 * normally also carry payout waiting time, account size, percentage return,
 * and the recipient's region. Prop Firm Lenz holds NONE of that. A chain shows
 * a transfer: not the request that preceded it, not the account it came from,
 * and not who received it. Every one of those columns would have to be
 * invented, so none of them exists here (CLAUDE.md §3 `[LOCKED]`). The columns
 * that are here are each recomputable by a reader from the linked transactions.
 */

export interface RankedFirmToken {
  symbol: string;
  decimals: number;
  /** Exact base-unit integers. Rendered with formatBaseUnits, never divided. */
  totalBaseUnits: string;
  largestBaseUnits: string;
  averageBaseUnits: string;
  count: number;
}

export interface RankedFirm {
  firmName: string;
  firmSlug: string;
  logoUrl: string | null;
  count: number;
  firstAt: string | null;
  latestAt: string | null;
  networks: string[];
  /** One entry per asset. Different tokens are NEVER added together. */
  tokens: RankedFirmToken[];
}

/* ---------------------------------------------------- base-unit arithmetic */

/**
 * Exact integer maths on decimal STRINGS — docs/PAYOUTS.md §5 `[LOCKED]`.
 *
 * `BigInt`, never `Number`: a token amount routinely exceeds 2^53, so
 * `Number("1234567890123456789")` is already wrong in its final digits. A
 * payout figure that is quietly wrong is worse than one that is absent.
 */
function addBaseUnits(a: string, b: string): string {
  return (BigInt(a) + BigInt(b)).toString();
}

function maxBaseUnits(a: string, b: string): string {
  return BigInt(a) > BigInt(b) ? a : b;
}

/** Integer mean, rounded half-up, entirely in BigInt. */
function meanBaseUnits(total: string, count: number): string {
  if (count <= 0) return "0";
  const n = BigInt(count);
  return ((BigInt(total) + n / 2n) / n).toString();
}

/**
 * Firms ranked by verified payout count, for one window.
 *
 * ORDERED BY WHAT WE CAN PROVE. Not by volume: on a figure that is already a
 * floor, one large transfer would outrank a hundred smaller ones and read as
 * the firm paying more, when it only means we happened to record one big row.
 */
export async function listPayoutFirmRanking(
  db: Database,
  opts: { window?: PayoutWindow; limit?: number; query?: string } = {},
  now: Date = new Date(),
): Promise<RankedFirm[]> {
  const start = windowStart(opts.window ?? "all", now);
  const clauses = [livePublishedFirm];
  if (start) clauses.push(gte(verifiedPayouts.transactionTimestamp, start));

  const search = opts.query?.trim();
  // Parameterised, and matched against the firm's own name only.
  if (search) clauses.push(sql`${propFirms.name} ilike ${`%${search}%`}`);

  const rows = await db
    .select({
      firmName: propFirms.name,
      firmSlug: propFirms.slug,
      logoUrl: media.publicUrl,
      networkName: blockchainNetworks.name,
      symbol: verifiedPayouts.assetSymbol,
      decimals: verifiedPayouts.decimals,
      count: sql<number>`count(*)::int`,
      totalBaseUnits: sql<string>`sum(${verifiedPayouts.amountBaseUnits})::text`,
      largestBaseUnits: sql<string>`max(${verifiedPayouts.amountBaseUnits})::text`,
      // `numeric` is arbitrary precision in PostgreSQL, so this is exact
      // arithmetic rounded once — not a float that drifted on the way.
      averageBaseUnits: sql<string>`round(avg(${verifiedPayouts.amountBaseUnits}))::text`,
      firstAt: sql<
        string | null
      >`min(${verifiedPayouts.transactionTimestamp})::text`,
      latestAt: sql<
        string | null
      >`max(${verifiedPayouts.transactionTimestamp})::text`,
    })
    .from(verifiedPayouts)
    .innerJoin(propFirms, eq(propFirms.id, verifiedPayouts.propFirmId))
    .innerJoin(
      blockchainNetworks,
      eq(blockchainNetworks.id, verifiedPayouts.networkId),
    )
    .leftJoin(media, eq(media.id, propFirms.logoMediaId))
    .where(and(...clauses))
    .groupBy(
      propFirms.id,
      propFirms.name,
      propFirms.slug,
      media.publicUrl,
      blockchainNetworks.name,
      verifiedPayouts.assetSymbol,
      verifiedPayouts.decimals,
    );

  const byFirm = new Map<string, RankedFirm>();

  for (const row of rows) {
    if (!isPayoutAddressable(row)) continue;

    const firm = byFirm.get(row.firmSlug) ?? {
      firmName: row.firmName,
      firmSlug: row.firmSlug,
      logoUrl: row.logoUrl,
      count: 0,
      firstAt: null,
      latestAt: null,
      networks: [],
      tokens: [],
    };

    firm.count += row.count;
    if (row.firstAt && (!firm.firstAt || row.firstAt < firm.firstAt)) {
      firm.firstAt = row.firstAt;
    }
    if (row.latestAt && (!firm.latestAt || row.latestAt > firm.latestAt)) {
      firm.latestAt = row.latestAt;
    }
    if (!firm.networks.includes(row.networkName)) {
      firm.networks.push(row.networkName);
    }

    // The grouping is per network AND per token, so one asset paid on two
    // chains arrives as two rows and has to be folded together here.
    const token = firm.tokens.find((t) => t.symbol === row.symbol);
    if (token) {
      token.count += row.count;
      token.totalBaseUnits = addBaseUnits(
        token.totalBaseUnits,
        row.totalBaseUnits,
      );
      token.largestBaseUnits = maxBaseUnits(
        token.largestBaseUnits,
        row.largestBaseUnits,
      );
      // Recomputed from the combined total, so it stays the real mean rather
      // than an average of averages.
      token.averageBaseUnits = meanBaseUnits(
        token.totalBaseUnits,
        token.count,
      );
    } else {
      firm.tokens.push({
        symbol: row.symbol,
        decimals: row.decimals,
        totalBaseUnits: row.totalBaseUnits,
        largestBaseUnits: row.largestBaseUnits,
        averageBaseUnits: row.averageBaseUnits,
        count: row.count,
      });
    }

    byFirm.set(row.firmSlug, firm);
  }

  return [...byFirm.values()]
    .map((firm) => ({
      ...firm,
      networks: firm.networks.sort((a, b) => a.localeCompare(b, "en")),
      tokens: firm.tokens.sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.count - a.count || a.firmName.localeCompare(b.firmName))
    .slice(0, Math.min(Math.max(opts.limit ?? 50, 1), 100));
}

export interface PayoutMonth {
  /** `YYYY-MM`. */
  month: string;
  count: number;
  cumulative: number;
}

/**
 * Verified payouts per calendar month, with a running total.
 *
 * COUNTS, NOT VALUE `[LOCKED]`. A firm can pay in several assets, and adding
 * USDT to USDC to make one bar would assert an exchange rate nobody recorded
 * (docs/PAYOUTS.md §8). The count is exact, needs no rate, and is comparable
 * across firms and months.
 */
export async function listPayoutMonths(
  db: Database,
  opts: { firmId?: string; months?: number } = {},
): Promise<PayoutMonth[]> {
  const clauses = [livePublishedFirm];
  if (opts.firmId) clauses.push(eq(verifiedPayouts.propFirmId, opts.firmId));

  const bucket = sql`date_trunc('month', ${verifiedPayouts.transactionTimestamp})`;

  const rows = await db
    .select({
      month: sql<string>`to_char(${bucket}, 'YYYY-MM')`,
      count: sql<number>`count(*)::int`,
    })
    .from(verifiedPayouts)
    .innerJoin(propFirms, eq(propFirms.id, verifiedPayouts.propFirmId))
    .where(and(...clauses))
    .groupBy(bucket)
    .orderBy(bucket);

  const first = rows[0]?.month;
  const last = rows[rows.length - 1]?.month;
  if (!first || !last) return [];

  // Months with no payouts are REAL zeros and are drawn as such. Dropping them
  // would compress a quiet stretch into a line that looks continuous.
  const counts = new Map(rows.map((r) => [r.month, r.count] as const));
  const step = (m: string): string => {
    const [year, month] = m.split("-").map(Number) as [number, number];
    return month === 12
      ? `${year + 1}-01`
      : `${year}-${String(month + 1).padStart(2, "0")}`;
  };

  const filled: PayoutMonth[] = [];
  let cumulative = 0;
  for (let m = first; m <= last; m = step(m)) {
    cumulative += counts.get(m) ?? 0;
    filled.push({ month: m, count: counts.get(m) ?? 0, cumulative });
  }

  // Keep the tail: the recent months are what a reader is asking about.
  return filled.slice(-Math.min(Math.max(opts.months ?? 12, 1), 60));
}

export interface FirmPayoutNetwork {
  name: string;
  count: number;
}

export interface FirmPayoutProfile {
  firmId: string;
  firmName: string;
  firmSlug: string;
  logoUrl: string | null;
  /** Window-scoped figures. */
  count: number;
  firstAt: string | null;
  latestAt: string | null;
  tokens: RankedFirmToken[];
  networks: FirmPayoutNetwork[];
}

/**
 * One firm's verified payout breakdown, for `/payouts/[slug]`.
 *
 * Null for a firm that is not published, so the page 404s rather than render a
 * shell — a draft firm must not be probeable through this route.
 */
export async function getFirmPayoutProfile(
  db: Database,
  opts: { slug: string; window?: PayoutWindow },
  now: Date = new Date(),
): Promise<FirmPayoutProfile | null> {
  const [firm] = await db
    .select({
      id: propFirms.id,
      name: propFirms.name,
      slug: propFirms.slug,
      logoUrl: media.publicUrl,
    })
    .from(propFirms)
    .leftJoin(media, eq(media.id, propFirms.logoMediaId))
    .where(and(livePublishedFirm, eq(propFirms.slug, opts.slug)))
    .limit(1);

  if (!firm?.slug || !firm.name) return null;

  const start = windowStart(opts.window ?? "all", now);
  const clauses = [eq(verifiedPayouts.propFirmId, firm.id)];
  if (start) clauses.push(gte(verifiedPayouts.transactionTimestamp, start));

  const [tokenRows, networkRows] = await Promise.all([
    db
      .select({
        symbol: verifiedPayouts.assetSymbol,
        decimals: verifiedPayouts.decimals,
        count: sql<number>`count(*)::int`,
        totalBaseUnits: sql<string>`sum(${verifiedPayouts.amountBaseUnits})::text`,
        largestBaseUnits: sql<string>`max(${verifiedPayouts.amountBaseUnits})::text`,
        averageBaseUnits: sql<string>`round(avg(${verifiedPayouts.amountBaseUnits}))::text`,
        firstAt: sql<
          string | null
        >`min(${verifiedPayouts.transactionTimestamp})::text`,
        latestAt: sql<
          string | null
        >`max(${verifiedPayouts.transactionTimestamp})::text`,
      })
      .from(verifiedPayouts)
      .where(and(...clauses))
      .groupBy(verifiedPayouts.assetSymbol, verifiedPayouts.decimals),
    db
      .select({
        name: blockchainNetworks.name,
        count: sql<number>`count(*)::int`,
      })
      .from(verifiedPayouts)
      .innerJoin(
        blockchainNetworks,
        eq(blockchainNetworks.id, verifiedPayouts.networkId),
      )
      .where(and(...clauses))
      .groupBy(blockchainNetworks.id, blockchainNetworks.name)
      .orderBy(desc(sql`count(*)`)),
  ]);

  let firstAt: string | null = null;
  let latestAt: string | null = null;
  let count = 0;
  for (const row of tokenRows) {
    count += row.count;
    if (row.firstAt && (!firstAt || row.firstAt < firstAt)) {
      firstAt = row.firstAt;
    }
    if (row.latestAt && (!latestAt || row.latestAt > latestAt)) {
      latestAt = row.latestAt;
    }
  }

  return {
    firmId: firm.id,
    firmName: firm.name,
    firmSlug: firm.slug,
    logoUrl: firm.logoUrl,
    count,
    firstAt,
    latestAt,
    // The per-token timestamps were only needed to fold the firm-level first
    // and latest above; they are not part of the token figures.
    tokens: tokenRows
      .map((row) => ({
        symbol: row.symbol,
        decimals: row.decimals,
        count: row.count,
        totalBaseUnits: row.totalBaseUnits,
        largestBaseUnits: row.largestBaseUnits,
        averageBaseUnits: row.averageBaseUnits,
      }))
      .sort((a, b) => b.count - a.count),
    networks: networkRows,
  };
}
