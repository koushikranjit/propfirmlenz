import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { ENTITY_TYPES, primaryId, sqlEnumList, timestamps } from "./columns";
import { adminUsers, users } from "./identity";
import { media } from "./media";

export const SEO_ENTITY_TYPES = [
  "prop_firm",
  "challenge",
  "platform",
  "instrument",
  "article",
  "page",
  "static_route",
] as const;

export const TWITTER_CARDS = ["summary", "summary_large_image"] as const;

export const ACTOR_TYPES = ["admin", "user", "system"] as const;

export const REDIRECT_SOURCES = [
  "auto_slug_change",
  "manual",
  "import",
] as const;

export const REDIRECT_STATUS_CODES = [301, 302, 307, 308, 410] as const;

/**
 * Per-entity SEO overrides (docs/DATABASE.md §5.11).
 *
 * EVERY field is optional. A missing row means "use the deterministic template",
 * not "no metadata" `[LOCKED]`.
 */
export const seoMetadata = pgTable(
  "seo_metadata",
  {
    id: primaryId(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    /** For static routes that have no row of their own (`/`, `/about`). */
    routePath: text("route_path"),
    title: text("title"),
    metaDescription: text("meta_description"),
    /** Override only — normally derived by canonicalUrl(). */
    canonicalUrl: text("canonical_url"),
    ogTitle: text("og_title"),
    ogDescription: text("og_description"),
    ogImageMediaId: uuid("og_image_media_id").references(() => media.id, {
      onDelete: "set null",
    }),
    twitterCard: text("twitter_card"),
    robotsIndex: boolean("robots_index").notNull().default(true),
    robotsFollow: boolean("robots_follow").notNull().default(true),
    includeInSitemap: boolean("include_in_sitemap").notNull().default(true),
    /** Escape hatch; validated against the schema shape before render. */
    structuredDataOverride: jsonb("structured_data_override"),
    /** Internal targeting notes — NOT a meta-keywords tag. */
    keywords: text("keywords").array(),
    updatedByAdminId: uuid("updated_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "set null" },
    ),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("seo_entity_uq")
      .on(t.entityType, t.entityId)
      .where(sql`${t.entityId} is not null`),
    uniqueIndex("seo_route_uq")
      .on(t.routePath)
      .where(sql`${t.routePath} is not null`),
    check(
      "seo_entity_type_ck",
      sql`${t.entityType} in (${sql.raw(sqlEnumList(SEO_ENTITY_TYPES))})`,
    ),
    /** Exactly one of entity_id / route_path. */
    check(
      "seo_target_ck",
      sql`(${t.entityId} is not null and ${t.routePath} is null)
          or (${t.entityId} is null and ${t.routePath} is not null)`,
    ),
    check(
      "seo_title_len_ck",
      sql`${t.title} is null or length(${t.title}) <= 70`,
    ),
    check(
      "seo_description_len_ck",
      sql`${t.metaDescription} is null or length(${t.metaDescription}) <= 160`,
    ),
    check(
      "seo_twitter_card_ck",
      sql`${t.twitterCard} is null or ${t.twitterCard} in (${sql.raw(sqlEnumList(TWITTER_CARDS))})`,
    ),
  ],
);

/**
 * Append-only audit trail (docs/DATABASE.md §4.7 `[LOCKED]`).
 *
 * UPDATE and DELETE are additionally blocked by a database trigger and revoked
 * grants, added in the migration — application code cannot tamper with history.
 *
 * `before`/`after` are scrubbed of password_hash, MFA secrets and affiliate
 * destination secrets before writing.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    actorType: text("actor_type").notNull(),
    actorAdminId: uuid("actor_admin_id").references(() => adminUsers.id, {
      onDelete: "set null",
    }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Denormalised name/email AT THE TIME of the action. */
    actorLabel: text("actor_label"),
    /** Dotted verb: firm.published, role.granted, firm.rolled_back. */
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    /** Precomputed changed keys — makes the history UI fast. */
    diff: jsonb("diff"),
    ipHash: text("ip_hash"),
    userAgentHash: text("user_agent_hash"),
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_logs_entity_idx").on(
      t.entityType,
      t.entityId,
      t.createdAt.desc(),
    ),
    index("audit_logs_actor_idx").on(t.actorAdminId, t.createdAt.desc()),
    index("audit_logs_action_idx").on(t.action, t.createdAt.desc()),
    index("audit_logs_created_idx").on(t.createdAt.desc()),
    check(
      "audit_logs_actor_type_ck",
      sql`${t.actorType} in (${sql.raw(sqlEnumList(ACTOR_TYPES))})`,
    ),
    /** The actor column must match the declared actor type. */
    check(
      "audit_logs_actor_match_ck",
      sql`(${t.actorType} = 'admin' and ${t.actorAdminId} is not null)
          or (${t.actorType} = 'user' and ${t.actorUserId} is not null)
          or (${t.actorType} = 'system' and ${t.actorAdminId} is null and ${t.actorUserId} is null)`,
    ),
  ],
);

/**
 * Immutable snapshots written on every publish (docs/ADMIN.md §9).
 * Rollback restores a snapshot INTO draft_payload, never straight to live.
 */
export const entityVersions = pgTable(
  "entity_versions",
  {
    id: primaryId(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    versionNumber: integer("version_number").notNull(),
    /** The full entity plus its children, so a restore is coherent. */
    snapshot: jsonb("snapshot").notNull(),
    label: text("label"),
    isPublished: boolean("is_published").notNull().default(true),
    createdByAdminId: uuid("created_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("entity_versions_uq").on(
      t.entityType,
      t.entityId,
      t.versionNumber,
    ),
    index("entity_versions_lookup_idx").on(
      t.entityType,
      t.entityId,
      t.versionNumber.desc(),
    ),
    check(
      "entity_versions_entity_type_ck",
      sql`${t.entityType} in (${sql.raw(sqlEnumList(ENTITY_TYPES))})`,
    ),
    check("entity_versions_number_ck", sql`${t.versionNumber} > 0`),
  ],
);

/**
 * URL stability (docs/SEO.md §7). Redirects are permanent infrastructure —
 * never bulk-deleted to "clean up" `[LOCKED]`.
 */
export const redirects = pgTable(
  "redirects",
  {
    id: primaryId(),
    /** Normalised: lowercase, leading slash, no trailing slash, no query. */
    fromPath: text("from_path").notNull(),
    toPath: text("to_path").notNull(),
    statusCode: smallint("status_code").notNull().default(301),
    isActive: boolean("is_active").notNull().default(true),
    reason: text("reason"),
    source: text("source").notNull().default("manual"),
    hitCount: bigint("hit_count", { mode: "number" }).notNull().default(0),
    lastHitAt: timestamp("last_hit_at", { withTimezone: true }),
    createdByAdminId: uuid("created_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "set null" },
    ),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("redirects_from_active_uq")
      .on(t.fromPath)
      .where(sql`${t.isActive}`),
    index("redirects_to_idx").on(t.toPath),
    check(
      "redirects_status_ck",
      sql`${t.statusCode} in (${sql.raw(REDIRECT_STATUS_CODES.join(", "))})`,
    ),
    check(
      "redirects_source_ck",
      sql`${t.source} in (${sql.raw(sqlEnumList(REDIRECT_SOURCES))})`,
    ),
    /** Blocks the trivial loop; multi-hop detection is service-layer. */
    check("redirects_no_self_ck", sql`${t.fromPath} <> ${t.toPath}`),
    check("redirects_from_shape_ck", sql`${t.fromPath} ~ '^/'`),
  ],
);

/**
 * Private admin research trail (docs/ADMIN.md §12 `[LOCKED]`).
 *
 * NEVER rendered on any public route, in any public API response, in an OG
 * image, or in JSON-LD. A test asserts no public serialiser can reach it.
 */
export const internalNotes = pgTable(
  "internal_notes",
  {
    id: primaryId(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    body: text("body").notNull(),
    isPinned: boolean("is_pinned").notNull().default(false),
    createdByAdminId: uuid("created_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "set null" },
    ),
    ...timestamps(),
  },
  (t) => [
    index("internal_notes_entity_idx").on(
      t.entityType,
      t.entityId,
      t.isPinned.desc(),
      t.createdAt.desc(),
    ),
    check(
      "internal_notes_entity_type_ck",
      sql`${t.entityType} in (${sql.raw(sqlEnumList(ENTITY_TYPES))})`,
    ),
  ],
);
