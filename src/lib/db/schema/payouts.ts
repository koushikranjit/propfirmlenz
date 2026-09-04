import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { primaryId, sqlEnumList, timestamps } from "./columns";
import { adminUsers } from "./identity";
import { propFirms } from "./firms";

/**
 * BLOCKCHAIN PAYOUT INTELLIGENCE — docs/PAYOUTS.md.
 *
 * THE GOVERNING PRINCIPLE: show what we can prove `[LOCKED]`.
 *
 * A payout is "blockchain-verified" only when an independently checkable
 * on-chain transaction backs it. A figure a firm publishes about itself is
 * never a verified payout, however plausible it looks.
 *
 * FOUR LAYERS, DELIBERATELY SEPARATE `[LOCKED]`:
 *
 *   tracked_wallets            what we watch, and why we think it pays traders
 *   blockchain_transactions    RAW chain data, exactly as observed
 *   payout_candidates          a transaction that MIGHT be a trader payout
 *   verified_payouts           the ones that passed verification
 *
 * Raw data is never public and never counted. Collapsing these into one table
 * would mean every wallet movement — treasury rebalancing, gas top-ups, refunds
 * — silently became a "trader payout", which is exactly the false statistic
 * this system exists to avoid.
 *
 * COVERAGE IS PARTIAL, ALWAYS `[LOCKED]`. Firms also pay by bank transfer,
 * card, processor, and wallets nobody has identified. Verified on-chain volume
 * is a FLOOR, never a total, and no column here may be labelled as a firm's
 * total payout volume.
 */

export const WALLET_PURPOSES = [
  "trader_payouts",
  "operations",
  "treasury",
  "other",
  "unknown",
] as const;

export const WALLET_VERIFICATION_STATUS = [
  "unverified",
  "verified",
  "disputed",
] as const;

/** Only VERIFIED candidates reach `verified_payouts` or any public statistic. */
export const CANDIDATE_STATUS = [
  "detected",
  "match_review",
  "verified",
  "rejected",
  "unverified",
] as const;

export const TRANSACTION_STATUS = ["success", "failed", "pending"] as const;

export type WalletPurpose = (typeof WALLET_PURPOSES)[number];
export type CandidateStatus = (typeof CANDIDATE_STATUS)[number];
export type TransactionStatus = (typeof TRANSACTION_STATUS)[number];

export const VERIFICATION_EVENTS = [
  "detected",
  "matched",
  "verified",
  "rejected",
  "corrected",
] as const;

const ADDRESS_PATTERN = "^[A-Za-z0-9:_-]{8,128}$";

/**
 * A supported chain.
 *
 * A ROW, not a hard-coded list: support is added by an operator once a provider
 * can actually serve reliable data for it, rather than by shipping a long list
 * of chains for appearance (docs/PAYOUTS.md §3 `[LOCKED]`).
 */
export const blockchainNetworks = pgTable(
  "blockchain_networks",
  {
    id: primaryId(),
    /** Stable machine key, e.g. `tron`, `ethereum`. */
    key: text("key").notNull(),
    name: text("name").notNull(),
    /** EVM chain id where applicable; null for non-EVM chains. */
    chainId: integer("chain_id"),
    nativeSymbol: text("native_symbol").notNull(),
    /** `{hash}` is substituted to build an explorer link. */
    explorerTxTemplate: text("explorer_tx_template").notNull(),
    /** Which provider adapter serves this network. */
    provider: text("provider").notNull(),
    /** Blocks required before a transaction is treated as settled. */
    confirmationsRequired: integer("confirmations_required")
      .notNull()
      .default(12),
    isActive: boolean("is_active").notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("blockchain_networks_key_uq").on(t.key),
    check(
      "blockchain_networks_explorer_ck",
      sql`${t.explorerTxTemplate} like '%{hash}%'`,
    ),
    check(
      "blockchain_networks_confirmations_ck",
      sql`${t.confirmationsRequired} >= 0`,
    ),
  ],
);

/**
 * A wallet an admin has decided to watch for a firm.
 *
 * `purpose` is a CLASSIFICATION, not a guarantee. A transaction leaving a
 * wallet labelled `trader_payouts` is still only a CANDIDATE: wallets get
 * reused, and treating the label as proof would let one mislabelled address
 * inflate a firm's verified volume indefinitely `[LOCKED]`.
 */
export const trackedWallets = pgTable(
  "tracked_wallets",
  {
    id: primaryId(),
    propFirmId: uuid("prop_firm_id")
      .notNull()
      .references(() => propFirms.id, { onDelete: "cascade" }),
    networkId: uuid("network_id")
      .notNull()
      .references(() => blockchainNetworks.id, { onDelete: "restrict" }),
    /** As displayed by the chain. */
    address: text("address").notNull(),
    /**
     * Lower-cased for matching. Chains differ on case sensitivity, and an
     * address that only matches when the casing agrees is an address that
     * silently stops matching.
     */
    addressNormalized: text("address_normalized").notNull(),
    label: text("label"),
    purpose: text("purpose").notNull().default("unknown"),
    verificationStatus: text("verification_status")
      .notNull()
      .default("unverified"),
    isActive: boolean("is_active").notNull().default(true),
    /** Admin-only research note. Never rendered publicly. */
    notes: text("notes"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    /** Provider-specific resume point for incremental scanning. */
    scanCursor: text("scan_cursor"),
    lastScanError: text("last_scan_error"),
    createdByAdminId: uuid("created_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "set null" },
    ),
    ...timestamps(),
  },
  (t) => [
    // One wallet per network. Watching an address twice would double-count
    // every transaction it ever made.
    uniqueIndex("tracked_wallets_network_address_uq").on(
      t.networkId,
      t.addressNormalized,
    ),
    index("tracked_wallets_firm_idx").on(t.propFirmId, t.isActive),
    index("tracked_wallets_scan_idx")
      .on(t.lastCheckedAt)
      .where(sql`${t.isActive}`),
    check(
      "tracked_wallets_purpose_ck",
      sql`${t.purpose} in (${sql.raw(sqlEnumList(WALLET_PURPOSES))})`,
    ),
    check(
      "tracked_wallets_verification_ck",
      sql`${t.verificationStatus} in (${sql.raw(sqlEnumList(WALLET_VERIFICATION_STATUS))})`,
    ),
    check(
      "tracked_wallets_address_ck",
      sql`${t.address} ~ ${sql.raw(`'${ADDRESS_PATTERN}'`)}`,
    ),
    check(
      "tracked_wallets_normalized_ck",
      sql`${t.addressNormalized} = lower(${t.addressNormalized})`,
    ),
  ],
);

/**
 * RAW chain data, as observed. Never public, never counted `[LOCKED]`.
 *
 * AMOUNTS ARE EXACT INTEGERS in the asset's smallest unit — wei, sun, satoshi
 * — held in `numeric(78,0)`. Floating point cannot represent 18-decimal token
 * amounts, and a payout figure that is quietly wrong in its last digits is
 * worse than none (docs/PAYOUTS.md §5 `[LOCKED]`). `decimals` is stored
 * alongside so a human-readable amount is derived at render time, never at
 * write time.
 */
export const blockchainTransactions = pgTable(
  "blockchain_transactions",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    networkId: uuid("network_id")
      .notNull()
      .references(() => blockchainNetworks.id, { onDelete: "restrict" }),
    txHash: text("tx_hash").notNull(),
    /**
     * Which transfer within the transaction. One hash can carry several token
     * transfers, so the hash alone is not a unique key.
     */
    transferIndex: integer("transfer_index").notNull().default(0),
    blockNumber: bigint("block_number", { mode: "bigint" }),
    blockTimestamp: timestamp("block_timestamp", {
      withTimezone: true,
    }).notNull(),
    fromAddress: text("from_address").notNull(),
    toAddress: text("to_address").notNull(),
    assetSymbol: text("asset_symbol").notNull(),
    /** Token contract; null for a native-currency transfer. */
    assetContract: text("asset_contract"),
    /** Smallest-unit integer. NEVER a float, NEVER pre-divided. */
    amountBaseUnits: numeric("amount_base_units", {
      precision: 78,
      scale: 0,
    }).notNull(),
    decimals: smallint("decimals").notNull(),
    status: text("status").notNull().default("success"),
    confirmations: integer("confirmations"),
    /** Which adapter observed it, for provenance. */
    provider: text("provider").notNull(),
    /** The provider's own response, kept so a decision can be re-examined. */
    raw: jsonb("raw"),
    detectedAt: timestamp("detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // IDEMPOTENCY. Re-running ingestion over the same range must not create a
    // second row, so this key is what makes a re-scan safe.
    uniqueIndex("blockchain_transactions_uq").on(
      t.networkId,
      t.txHash,
      t.transferIndex,
    ),
    index("blockchain_transactions_from_idx").on(
      t.networkId,
      t.fromAddress,
      t.blockTimestamp.desc(),
    ),
    index("blockchain_transactions_time_idx").on(t.blockTimestamp.desc()),
    check(
      "blockchain_transactions_status_ck",
      sql`${t.status} in (${sql.raw(sqlEnumList(TRANSACTION_STATUS))})`,
    ),
    check("blockchain_transactions_amount_ck", sql`${t.amountBaseUnits} >= 0`),
    check(
      "blockchain_transactions_decimals_ck",
      sql`${t.decimals} between 0 and 36`,
    ),
    check(
      "blockchain_transactions_addresses_ck",
      sql`${t.fromAddress} = lower(${t.fromAddress}) and ${t.toAddress} = lower(${t.toAddress})`,
    ),
  ],
);

/**
 * A transaction that MIGHT be a trader payout.
 *
 * The deliberate gap between "we saw it on chain" and "we counted it". Every
 * observed transaction from a tracked wallet becomes a candidate; only a
 * candidate that passes verification becomes a payout `[LOCKED]`.
 */
export const payoutCandidates = pgTable(
  "payout_candidates",
  {
    id: primaryId(),
    transactionId: bigint("transaction_id", { mode: "number" })
      .notNull()
      .references(() => blockchainTransactions.id, { onDelete: "cascade" }),
    propFirmId: uuid("prop_firm_id")
      .notNull()
      .references(() => propFirms.id, { onDelete: "cascade" }),
    trackedWalletId: uuid("tracked_wallet_id")
      .notNull()
      .references(() => trackedWallets.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("detected"),
    /** 0–100. A ranking aid for review, never a substitute for verification. */
    confidence: smallint("confidence"),
    /** Which rules fired, so a decision can be explained months later. */
    matchReasons: text("match_reasons").array(),
    reviewedByAdminId: uuid("reviewed_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "set null" },
    ),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    ...timestamps(),
  },
  (t) => [
    // One candidate per transfer: re-running detection cannot fan out.
    uniqueIndex("payout_candidates_transaction_uq").on(t.transactionId),
    index("payout_candidates_review_idx").on(t.status, t.createdAt.desc()),
    index("payout_candidates_firm_idx").on(t.propFirmId, t.status),
    check(
      "payout_candidates_status_ck",
      sql`${t.status} in (${sql.raw(sqlEnumList(CANDIDATE_STATUS))})`,
    ),
    check(
      "payout_candidates_confidence_ck",
      sql`${t.confidence} is null or (${t.confidence} between 0 and 100)`,
    ),
    /** A rejection has to say why. */
    check(
      "payout_candidates_rejection_ck",
      sql`${t.status} <> 'rejected' or ${t.rejectionReason} is not null`,
    ),
  ],
);

/**
 * A payout backed by verifiable on-chain evidence.
 *
 * The ONLY table public statistics are computed from. Each row keeps the hash
 * and explorer link so any reader can check the claim themselves — that
 * independent checkability is the entire value of the feature.
 */
export const verifiedPayouts = pgTable(
  "verified_payouts",
  {
    id: primaryId(),
    propFirmId: uuid("prop_firm_id")
      .notNull()
      .references(() => propFirms.id, { onDelete: "cascade" }),
    networkId: uuid("network_id")
      .notNull()
      .references(() => blockchainNetworks.id, { onDelete: "restrict" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => payoutCandidates.id, { onDelete: "restrict" }),
    transactionId: bigint("transaction_id", { mode: "number" })
      .notNull()
      .references(() => blockchainTransactions.id, { onDelete: "restrict" }),
    sourceWalletId: uuid("source_wallet_id")
      .notNull()
      .references(() => trackedWallets.id, { onDelete: "restrict" }),

    /* Denormalised chain evidence, so a payout stays checkable even if the
       raw row is later pruned by a retention policy. */
    txHash: text("tx_hash").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }),
    transactionTimestamp: timestamp("transaction_timestamp", {
      withTimezone: true,
    }).notNull(),
    fromAddress: text("from_address").notNull(),
    toAddress: text("to_address").notNull(),
    assetSymbol: text("asset_symbol").notNull(),
    assetContract: text("asset_contract"),
    amountBaseUnits: numeric("amount_base_units", {
      precision: 78,
      scale: 0,
    }).notNull(),
    decimals: smallint("decimals").notNull(),

    /**
     * Optional valuation. The NATIVE amount above is authoritative; this is a
     * convenience that may be absent. It is written only with the rate and the
     * moment it came from, so a figure can always be explained — and never
     * invented when no reliable rate exists (docs/PAYOUTS.md §8 `[LOCKED]`).
     */
    usdValue: numeric("usd_value", { precision: 20, scale: 2 }),
    usdRate: numeric("usd_rate", { precision: 24, scale: 10 }),
    usdRateSource: text("usd_rate_source"),
    usdRateAt: timestamp("usd_rate_at", { withTimezone: true }),

    explorerUrl: text("explorer_url").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    verifiedByAdminId: uuid("verified_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "set null" },
    ),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("verified_payouts_transaction_uq").on(t.transactionId),
    index("verified_payouts_firm_idx").on(
      t.propFirmId,
      t.transactionTimestamp.desc(),
    ),
    index("verified_payouts_recent_idx").on(t.transactionTimestamp.desc()),
    check("verified_payouts_amount_ck", sql`${t.amountBaseUnits} > 0`),
    /** A valuation without its provenance is a number nobody can defend. */
    check(
      "verified_payouts_usd_ck",
      sql`${t.usdValue} is null or (${t.usdRate} is not null and ${t.usdRateSource} is not null and ${t.usdRateAt} is not null)`,
    ),
  ],
);

/**
 * Append-only verification history — docs/PAYOUTS.md §7 `[LOCKED]`.
 *
 * Every state change a candidate goes through, with the actor. A verified
 * payout that nobody can account for is indistinguishable from a fabricated
 * one, so the trail is part of the claim.
 */
export const payoutVerificationEvents = pgTable(
  "payout_verification_events",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => payoutCandidates.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    /** Null for an automated decision made by the pipeline itself. */
    actorAdminId: uuid("actor_admin_id").references(() => adminUsers.id, {
      onDelete: "set null",
    }),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("payout_verification_events_candidate_idx").on(
      t.candidateId,
      t.createdAt.desc(),
    ),
    check(
      "payout_verification_events_event_ck",
      sql`${t.event} in (${sql.raw(sqlEnumList(VERIFICATION_EVENTS))})`,
    ),
  ],
);
