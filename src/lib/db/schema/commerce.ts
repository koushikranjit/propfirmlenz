import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  ENTITY_STATUS,
  primaryId,
  softDeleteTimestamps,
  sqlEnumList,
} from "./columns";
import { propFirms } from "./firms";
import { adminUsers, users } from "./identity";

export const DISCOUNT_TYPES = [
  "percent",
  "fixed",
  "free_trial",
  "other",
] as const;

export const AFFILIATE_LINK_STATUS = ["active", "paused", "archived"] as const;

/**
 * Affiliate links belong to an individual prop firm (docs/DATABASE.md §5.9).
 *
 * `destination_url` is treated as a secret in logs. `commission_notes` is
 * commercial data and is NEVER rendered publicly `[LOCKED]`.
 */
export const affiliateLinks = pgTable(
  "affiliate_links",
  {
    id: primaryId(),
    propFirmId: uuid("prop_firm_id")
      .notNull()
      .references(() => propFirms.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    destinationUrl: text("destination_url").notNull(),
    network: text("network"),
    campaign: text("campaign"),
    isDefault: boolean("is_default").notNull().default(false),
    status: text("status").notNull().default("active"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    /** Commercial — never rendered publicly. */
    commissionNotes: text("commission_notes"),
    createdByAdminId: uuid("created_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "set null" },
    ),
    ...softDeleteTimestamps(),
  },
  (t) => [
    /**
     * The database GUARANTEE that /go resolution is deterministic: exactly one
     * active default link per firm. Not an application hope.
     */
    uniqueIndex("affiliate_links_default_uq")
      .on(t.propFirmId)
      .where(
        sql`${t.isDefault} and ${t.deletedAt} is null and ${t.status} = 'active'`,
      ),
    uniqueIndex("affiliate_links_campaign_uq")
      .on(t.propFirmId, t.campaign)
      .where(sql`${t.campaign} is not null and ${t.deletedAt} is null`),
    index("affiliate_links_firm_idx").on(t.propFirmId, t.status),
    check(
      "affiliate_links_status_ck",
      sql`${t.status} in (${sql.raw(sqlEnumList(AFFILIATE_LINK_STATUS))})`,
    ),
    check("affiliate_links_https_ck", sql`${t.destinationUrl} ~ '^https://'`),
    check(
      "affiliate_links_window_ck",
      sql`${t.endsAt} is null or ${t.startsAt} is null or ${t.endsAt} > ${t.startsAt}`,
    ),
  ],
);

export const offers = pgTable(
  "offers",
  {
    id: primaryId(),
    propFirmId: uuid("prop_firm_id")
      .notNull()
      .references(() => propFirms.id, { onDelete: "cascade" }),
    /** Binds a promo to its tracked URL. */
    affiliateLinkId: uuid("affiliate_link_id").references(
      () => affiliateLinks.id,
      { onDelete: "set null" },
    ),
    title: text("title").notNull(),
    description: text("description"),
    terms: text("terms"),
    code: text("code"),
    discountType: text("discount_type"),
    discountValue: numeric("discount_value", { precision: 10, scale: 2 }),
    /** Money keeps its own source currency (§1.3). */
    discountCurrency: char("discount_currency", { length: 3 }),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    status: text("status").notNull().default("draft"),
    displayOrder: integer("display_order").notNull().default(0),
    createdByAdminId: uuid("created_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "set null" },
    ),
    ...softDeleteTimestamps(),
  },
  (t) => [
    uniqueIndex("offers_firm_code_uq")
      .on(t.propFirmId, sql`lower(${t.code})`)
      .where(sql`${t.code} is not null and ${t.deletedAt} is null`),
    index("offers_active_idx")
      .on(t.status, t.endsAt, t.displayOrder)
      .where(sql`${t.status} = 'published' and ${t.deletedAt} is null`),
    index("offers_firm_idx").on(t.propFirmId),
    check(
      "offers_status_ck",
      sql`${t.status} in (${sql.raw(sqlEnumList(ENTITY_STATUS))})`,
    ),
    check(
      "offers_discount_type_ck",
      sql`${t.discountType} is null or ${t.discountType} in (${sql.raw(sqlEnumList(DISCOUNT_TYPES))})`,
    ),
    check(
      "offers_window_ck",
      sql`${t.endsAt} is null or ${t.startsAt} is null or ${t.endsAt} > ${t.startsAt}`,
    ),
    check(
      "offers_percent_range_ck",
      sql`${t.discountType} <> 'percent' or (${t.discountValue} between 0 and 100)`,
    ),
    check(
      "offers_fixed_currency_ck",
      sql`${t.discountType} <> 'fixed' or ${t.discountCurrency} is not null`,
    ),
    check(
      "offers_currency_format_ck",
      sql`${t.discountCurrency} is null or ${t.discountCurrency} ~ '^[A-Z]{3}$'`,
    ),
  ],
);

/**
 * Affiliate click tracking (docs/DATABASE.md §5.10, docs/ARCHITECTURE.md §11).
 *
 * Raw IPs and user agents are NEVER stored — salted SHA-256 only `[LOCKED]`.
 * Conversions are not modelled here: they are only ever ingested from a partner
 * postback, never inferred.
 */
export const affiliateClicks = pgTable(
  "affiliate_clicks",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    /** RESTRICT: never lose click history to a link deletion. */
    affiliateLinkId: uuid("affiliate_link_id")
      .notNull()
      .references(() => affiliateLinks.id, { onDelete: "restrict" }),
    /** Denormalised for reporting speed. */
    propFirmId: uuid("prop_firm_id").notNull(),
    offerId: uuid("offer_id").references(() => offers.id, {
      onDelete: "set null",
    }),
    placement: text("placement"),
    clickedAt: timestamp("clicked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    countryCode: char("country_code", { length: 2 }),
    deviceType: text("device_type"),
    /** Host only, never the full URL. */
    referrerHost: text("referrer_host"),
    landingPath: text("landing_path"),
    sessionId: text("session_id"),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Flagged, never deleted. */
    isBot: boolean("is_bot").notNull().default(false),
    /**
     * Internal / admin / test traffic. SECONDARY protection and classification
     * only (docs/DATABASE.md §5.10a `[LOCKED]`) — the primary guarantee is
     * structural: preview CTAs carry no affiliate href, so no click is created.
     * A change that made preview RELY on this flag would be a defect.
     */
    isInternal: boolean("is_internal").notNull().default(false),
    /** Salted SHA-256. Raw values are never stored. */
    ipHash: text("ip_hash"),
    userAgentHash: text("user_agent_hash"),
  },
  (t) => [
    index("affiliate_clicks_link_idx").on(
      t.affiliateLinkId,
      t.clickedAt.desc(),
    ),
    index("affiliate_clicks_firm_idx").on(t.propFirmId, t.clickedAt.desc()),
    index("affiliate_clicks_reportable_idx")
      .on(t.clickedAt.desc())
      .where(sql`not ${t.isBot} and not ${t.isInternal}`),
  ],
);
