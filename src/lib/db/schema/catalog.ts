import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  ENTITY_STATUS,
  primaryId,
  softDeleteTimestamps,
  sqlEnumList,
  timestamps,
} from "./columns";
import { challenges, propFirms } from "./firms";
import { adminUsers } from "./identity";
import { media } from "./media";

export const RULE_CATEGORIES = [
  "trading",
  "risk",
  "payout",
  "account",
  "platform",
  "restriction",
  "other",
] as const;

export const RULE_DATA_TYPES = [
  "boolean",
  "number",
  "percent",
  "currency",
  "text",
  "enum",
] as const;

export const RULE_APPLIES_TO = ["firm", "challenge", "both"] as const;

export const RULE_VALUE_SCOPES = ["firm", "challenge"] as const;

export const ASSET_CLASSES = [
  "forex",
  "indices",
  "commodities",
  "metals",
  "energies",
  "crypto",
  "stocks",
  "futures",
  "options",
  "other",
] as const;

/**
 * Catalog of rule DEFINITIONS, not values (docs/DATABASE.md §5.3).
 *
 * `description` is the canonical published definition that appears in the public
 * glossary — editing one changes site-wide terminology (docs/ADMIN.md §16).
 */
export const rules = pgTable(
  "rules",
  {
    id: primaryId(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    category: text("category").notNull(),
    dataType: text("data_type").notNull(),
    enumOptions: text("enum_options").array(),
    unit: text("unit"),
    appliesTo: text("applies_to").notNull().default("both"),
    /** Drives inclusion in comparison tables (docs/ARCHITECTURE.md §20.1). */
    isComparable: boolean("is_comparable").notNull().default(true),
    /** Drives directory filters. */
    isFilterable: boolean("is_filterable").notNull().default(false),
    displayOrder: integer("display_order").notNull().default(0),
    status: text("status").notNull().default("published"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("rules_key_uq").on(t.key),
    index("rules_category_idx").on(t.category, t.displayOrder),
    check(
      "rules_category_ck",
      sql`${t.category} in (${sql.raw(sqlEnumList(RULE_CATEGORIES))})`,
    ),
    check(
      "rules_data_type_ck",
      sql`${t.dataType} in (${sql.raw(sqlEnumList(RULE_DATA_TYPES))})`,
    ),
    check(
      "rules_applies_to_ck",
      sql`${t.appliesTo} in (${sql.raw(sqlEnumList(RULE_APPLIES_TO))})`,
    ),
    check(
      "rules_status_ck",
      sql`${t.status} in (${sql.raw(sqlEnumList(ENTITY_STATUS))})`,
    ),
    check(
      "rules_enum_options_ck",
      sql`${t.dataType} <> 'enum' or ${t.enumOptions} is not null`,
    ),
  ],
);

/**
 * The long-tail half of the hybrid rule model (docs/DATABASE.md §5.4 `[APPROVED]`).
 *
 * Hot rules — anything filtered, sorted, or compared — are COLUMNS on
 * `challenges`. Everything else lives here.
 */
export const ruleValues = pgTable(
  "rule_values",
  {
    id: primaryId(),
    /** RESTRICT: deleting an answered rule definition must fail loudly. */
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => rules.id, { onDelete: "restrict" }),
    scope: text("scope").notNull(),
    propFirmId: uuid("prop_firm_id").references(() => propFirms.id, {
      onDelete: "cascade",
    }),
    challengeId: uuid("challenge_id").references(() => challenges.id, {
      onDelete: "cascade",
    }),
    valueBoolean: boolean("value_boolean"),
    valueNumeric: numeric("value_numeric", { precision: 14, scale: 4 }),
    valueText: text("value_text"),
    /** Admin clarification shown to users. */
    note: text("note"),
    /** Provenance (docs/PROJECT.md §6.6). */
    sourceUrl: text("source_url"),
    createdByAdminId: uuid("created_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "set null" },
    ),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("rule_values_firm_uq")
      .on(t.ruleId, t.propFirmId)
      .where(sql`${t.scope} = 'firm'`),
    uniqueIndex("rule_values_challenge_uq")
      .on(t.ruleId, t.challengeId)
      .where(sql`${t.scope} = 'challenge'`),
    index("rule_values_firm_lookup_idx").on(t.propFirmId, t.ruleId),
    index("rule_values_challenge_lookup_idx").on(t.challengeId, t.ruleId),

    check(
      "rule_values_scope_ck",
      sql`${t.scope} in (${sql.raw(sqlEnumList(RULE_VALUE_SCOPES))})`,
    ),
    /** Exactly one target, matching the scope. */
    check(
      "rule_values_target_ck",
      sql`(${t.scope} = 'firm' and ${t.propFirmId} is not null and ${t.challengeId} is null)
          or (${t.scope} = 'challenge' and ${t.challengeId} is not null and ${t.propFirmId} is null)`,
    ),
    /** Exactly one value column populated. */
    check(
      "rule_values_one_value_ck",
      sql`(${t.valueBoolean} is not null)::int + (${t.valueNumeric} is not null)::int + (${t.valueText} is not null)::int = 1`,
    ),
  ],
);

export const platforms = pgTable(
  "platforms",
  {
    id: primaryId(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    logoMediaId: uuid("logo_media_id").references(() => media.id, {
      onDelete: "set null",
    }),
    websiteUrl: text("website_url"),
    description: text("description"),
    status: text("status").notNull().default("published"),
    displayOrder: integer("display_order").notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("platforms_key_uq").on(t.key),
    uniqueIndex("platforms_slug_uq").on(t.slug),
    check(
      "platforms_status_ck",
      sql`${t.status} in (${sql.raw(sqlEnumList(ENTITY_STATUS))})`,
    ),
    check("platforms_slug_ck", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ],
);

export const firmPlatforms = pgTable(
  "firm_platforms",
  {
    propFirmId: uuid("prop_firm_id")
      .notNull()
      .references(() => propFirms.id, { onDelete: "cascade" }),
    /** RESTRICT: deleting a referenced catalog entry must fail loudly. */
    platformId: uuid("platform_id")
      .notNull()
      .references(() => platforms.id, { onDelete: "restrict" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.propFirmId, t.platformId] }),
    index("firm_platforms_platform_idx").on(t.platformId),
  ],
);

export const instruments = pgTable(
  "instruments",
  {
    id: primaryId(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    assetClass: text("asset_class").notNull(),
    description: text("description"),
    status: text("status").notNull().default("published"),
    displayOrder: integer("display_order").notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("instruments_key_uq").on(t.key),
    uniqueIndex("instruments_slug_uq").on(t.slug),
    index("instruments_asset_class_idx").on(t.assetClass),
    check(
      "instruments_asset_class_ck",
      sql`${t.assetClass} in (${sql.raw(sqlEnumList(ASSET_CLASSES))})`,
    ),
    check(
      "instruments_status_ck",
      sql`${t.status} in (${sql.raw(sqlEnumList(ENTITY_STATUS))})`,
    ),
    check("instruments_slug_ck", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ],
);

export const firmInstruments = pgTable(
  "firm_instruments",
  {
    propFirmId: uuid("prop_firm_id")
      .notNull()
      .references(() => propFirms.id, { onDelete: "cascade" }),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "restrict" }),
    /**
     * "This firm explicitly prohibits crypto" is different information from
     * "this firm has no crypto row" — the site must be able to say which.
     * docs/DATABASE.md §5.6 `[LOCKED]`
     */
    isAllowed: boolean("is_allowed").notNull().default(true),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.propFirmId, t.instrumentId] }),
    index("firm_instruments_instrument_idx").on(t.instrumentId),
  ],
);

/** Re-exported for the soft-delete helper used by firm-scoped catalog rows. */
export const catalogSoftDelete = softDeleteTimestamps;
