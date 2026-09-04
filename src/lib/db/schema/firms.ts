import { sql } from "drizzle-orm";
import {
  boolean,
  char,
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
import type { DraftPayload } from "@/lib/validation/draft";
import {
  ENTITY_STATUS,
  VERIFICATION_STATUS,
  primaryId,
  softDeleteTimestamps,
  sqlEnumList,
} from "./columns";
import { adminUsers } from "./identity";
import { media } from "./media";

export const CHALLENGE_TYPES = [
  "one_step",
  "two_step",
  "three_step",
  "instant_funding",
  "other",
] as const;

export const DRAWDOWN_TYPES = ["static", "trailing", "eod_trailing"] as const;

export const DRAWDOWN_BASES = [
  "initial_balance",
  "equity",
  "highest_equity",
  "highest_balance",
] as const;

const SLUG_PATTERN = "^[a-z0-9]+(-[a-z0-9]+)*$";
const ISO_CURRENCY_PATTERN = "^[A-Z]{3}$";
const ISO_COUNTRY_PATTERN = "^[A-Z]{2}$";
const HEX_COLOR_PATTERN = "^#[0-9a-fA-F]{6}$";

/**
 * The central entity — docs/DATABASE.md §5.1.
 *
 * Deliberately ABSENT: rating, review_count, payout_total. Those are Phase 2/3
 * derived values; creating a nullable rating column now is an invitation to
 * fill it with a guess before the data exists. `[LOCKED]`
 */
export const propFirms = pgTable(
  "prop_firms",
  {
    id: primaryId(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    tagline: text("tagline"),
    description: text("description"),
    foundedYear: integer("founded_year"),
    headquartersCountry: char("headquarters_country", { length: 2 }),
    headquartersCity: text("headquarters_city"),
    websiteUrl: text("website_url"),
    supportEmail: text("support_email"),
    supportUrl: text("support_url"),
    /**
     * Where the firm publishes its own payout evidence or tracker.
     *
     * A LINK ONLY. Prop Firm Lenz stores no payout figures, no payout counts
     * and no verification of them — payout tracking is Phase 2, and a number
     * we cannot source is a fabricated business fact (CLAUDE.md §3).
     */
    payoutInfoUrl: text("payout_info_url"),
    logoMediaId: uuid("logo_media_id").references(() => media.id, {
      onDelete: "set null",
    }),
    coverMediaId: uuid("cover_media_id").references(() => media.id, {
      onDelete: "set null",
    }),
    /** The firm's own accent colour — never used for Prop Firm Lenz chrome. */
    brandColor: text("brand_color"),
    status: text("status").notNull().default("draft"),

    /**
     * Pending unpublished edits for the WHOLE firm aggregate — firm fields plus
     * every child (challenges, rules, platforms, instruments, offers, SEO).
     * docs/DATABASE.md §3.2.1 `[LOCKED]`. NULL = no pending changes.
     *
     * NEVER read by a public query. Public repositories do not select this
     * column and public domain types do not contain it, so draft data is
     * STRUCTURALLY unable to leak rather than merely filtered out.
     */
    draftPayload: jsonb("draft_payload").$type<DraftPayload>(),

    verificationStatus: text("verification_status")
      .notNull()
      .default("unverified"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedByAdminId: uuid("verified_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "set null" },
    ),
    dataCompletenessScore: smallint("data_completeness_score"),
    isFeatured: boolean("is_featured").notNull().default(false),
    displayOrder: integer("display_order").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdByAdminId: uuid("created_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "set null" },
    ),
    updatedByAdminId: uuid("updated_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "set null" },
    ),
    ...softDeleteTimestamps(),
  },
  (t) => [
    uniqueIndex("prop_firms_slug_live_uq")
      .on(t.slug)
      .where(sql`${t.deletedAt} is null`),
    index("prop_firms_public_idx")
      .on(t.status, t.displayOrder, t.name)
      .where(sql`${t.deletedAt} is null and ${t.status} = 'published'`),
    index("prop_firms_featured_idx")
      .on(t.isFeatured, t.displayOrder)
      .where(sql`${t.status} = 'published' and ${t.deletedAt} is null`),
    index("prop_firms_verification_idx").on(t.verificationStatus, t.verifiedAt),
    /** Backs the admin "Drafts in progress" queue (docs/ADMIN.md §4). */
    index("prop_firms_has_draft_idx")
      .on(t.updatedAt.desc())
      .where(sql`${t.draftPayload} is not null and ${t.deletedAt} is null`),

    check(
      "prop_firms_status_ck",
      sql`${t.status} in (${sql.raw(sqlEnumList(ENTITY_STATUS))})`,
    ),
    check(
      "prop_firms_verification_ck",
      sql`${t.verificationStatus} in (${sql.raw(sqlEnumList(VERIFICATION_STATUS))})`,
    ),
    check(
      "prop_firms_slug_ck",
      sql`${t.slug} ~ ${sql.raw(`'${SLUG_PATTERN}'`)}`,
    ),
    check(
      "prop_firms_tagline_len_ck",
      sql`${t.tagline} is null or length(${t.tagline}) <= 160`,
    ),
    check(
      "prop_firms_founded_year_ck",
      sql`${t.foundedYear} is null or (${t.foundedYear} between 1900 and extract(year from now())::int + 1)`,
    ),
    check(
      "prop_firms_brand_color_ck",
      sql`${t.brandColor} is null or ${t.brandColor} ~ ${sql.raw(`'${HEX_COLOR_PATTERN}'`)}`,
    ),
    check(
      "prop_firms_completeness_ck",
      sql`${t.dataCompletenessScore} is null or (${t.dataCompletenessScore} between 0 and 100)`,
    ),
    check(
      "prop_firms_country_ck",
      sql`${t.headquartersCountry} is null or ${t.headquartersCountry} ~ ${sql.raw(`'${ISO_COUNTRY_PATTERN}'`)}`,
    ),
    /** Draft payload must be a versioned object envelope (docs/DATABASE.md §3.2.1). */
    check(
      "prop_firms_draft_shape_ck",
      sql`${t.draftPayload} is null or (jsonb_typeof(${t.draftPayload}) = 'object' and ${t.draftPayload} ? 'schemaVersion')`,
    ),
  ],
);

/**
 * The real unit of comparison (docs/PROJECT.md §6.3).
 *
 * No `draft_payload` here `[LOCKED]` — pending challenge edits live inside the
 * parent firm's draft_payload, so an unpublished challenge never exists as a row.
 */
export const challenges = pgTable(
  "challenges",
  {
    id: primaryId(),
    propFirmId: uuid("prop_firm_id")
      .notNull()
      .references(() => propFirms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    challengeType: text("challenge_type").notNull(),

    /** Money: original amount + its own source currency. Never converted (§1.3). */
    accountSize: numeric("account_size", { precision: 14, scale: 2 }).notNull(),
    accountCurrency: char("account_currency", { length: 3 }).notNull(),
    price: numeric("price", { precision: 12, scale: 2 }),
    priceCurrency: char("price_currency", { length: 3 }),

    profitTargetP1Pct: numeric("profit_target_p1_pct", {
      precision: 6,
      scale: 3,
    }),
    profitTargetP2Pct: numeric("profit_target_p2_pct", {
      precision: 6,
      scale: 3,
    }),
    profitTargetP3Pct: numeric("profit_target_p3_pct", {
      precision: 6,
      scale: 3,
    }),
    maxDailyLossPct: numeric("max_daily_loss_pct", { precision: 6, scale: 3 }),
    maxTotalDrawdownPct: numeric("max_total_drawdown_pct", {
      precision: 6,
      scale: 3,
    }),
    drawdownType: text("drawdown_type"),
    drawdownBasis: text("drawdown_basis"),
    minTradingDays: smallint("min_trading_days"),
    /** NULL means UNLIMITED — the UI must say so explicitly, never render 0. */
    maxTradingDays: smallint("max_trading_days"),
    profitSplitPct: numeric("profit_split_pct", { precision: 6, scale: 3 }),
    payoutFrequencyDays: smallint("payout_frequency_days"),
    firstPayoutDays: smallint("first_payout_days"),
    /** Free-form: firms express leverage inconsistently (e.g. "1:100"). */
    leverage: text("leverage"),
    feeRefundable: boolean("fee_refundable"),
    hasScalingPlan: boolean("has_scaling_plan"),
    status: text("status").notNull().default("draft"),
    displayOrder: integer("display_order").notNull().default(0),
    createdByAdminId: uuid("created_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "set null" },
    ),
    updatedByAdminId: uuid("updated_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "set null" },
    ),
    ...softDeleteTimestamps(),
  },
  (t) => [
    uniqueIndex("challenges_firm_slug_uq")
      .on(t.propFirmId, t.slug)
      .where(sql`${t.deletedAt} is null`),
    index("challenges_firm_idx")
      .on(t.propFirmId, t.displayOrder)
      .where(sql`${t.deletedAt} is null`),
    index("challenges_filter_idx")
      .on(t.accountSize, t.price, t.challengeType)
      .where(sql`${t.status} = 'published' and ${t.deletedAt} is null`),

    check(
      "challenges_status_ck",
      sql`${t.status} in (${sql.raw(sqlEnumList(ENTITY_STATUS))})`,
    ),
    check(
      "challenges_slug_ck",
      sql`${t.slug} ~ ${sql.raw(`'${SLUG_PATTERN}'`)}`,
    ),
    check(
      "challenges_type_ck",
      sql`${t.challengeType} in (${sql.raw(sqlEnumList(CHALLENGE_TYPES))})`,
    ),
    check(
      "challenges_drawdown_type_ck",
      sql`${t.drawdownType} is null or ${t.drawdownType} in (${sql.raw(sqlEnumList(DRAWDOWN_TYPES))})`,
    ),
    check(
      "challenges_drawdown_basis_ck",
      sql`${t.drawdownBasis} is null or ${t.drawdownBasis} in (${sql.raw(sqlEnumList(DRAWDOWN_BASES))})`,
    ),
    check("challenges_account_size_ck", sql`${t.accountSize} > 0`),
    check("challenges_price_ck", sql`${t.price} is null or ${t.price} >= 0`),
    check(
      "challenges_trading_days_ck",
      sql`${t.maxTradingDays} is null or ${t.minTradingDays} is null or ${t.maxTradingDays} >= ${t.minTradingDays}`,
    ),
    check(
      "challenges_profit_split_ck",
      sql`${t.profitSplitPct} is null or (${t.profitSplitPct} between 0 and 100)`,
    ),
    check(
      "challenges_daily_loss_ck",
      sql`${t.maxDailyLossPct} is null or (${t.maxDailyLossPct} between 0 and 100)`,
    ),
    check(
      "challenges_total_drawdown_ck",
      sql`${t.maxTotalDrawdownPct} is null or (${t.maxTotalDrawdownPct} between 0 and 100)`,
    ),

    /* Currency policy (§1.3): an amount is never stored without its source currency. */
    check(
      "challenges_account_currency_ck",
      sql`${t.accountCurrency} ~ ${sql.raw(`'${ISO_CURRENCY_PATTERN}'`)}`,
    ),
    check(
      "challenges_price_currency_ck",
      sql`${t.priceCurrency} is null or ${t.priceCurrency} ~ ${sql.raw(`'${ISO_CURRENCY_PATTERN}'`)}`,
    ),
    check(
      "challenges_price_pairing_ck",
      sql`(${t.price} is null) = (${t.priceCurrency} is null)`,
    ),
  ],
);
