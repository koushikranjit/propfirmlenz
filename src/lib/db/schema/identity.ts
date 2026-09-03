import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import {
  citext,
  primaryId,
  softDeleteTimestamps,
  sqlEnumList,
  timestamps,
} from "./columns";

/**
 * Identity and access — docs/DATABASE.md §4.
 *
 * `users` (public) and `admin_users` are SEPARATE tables with separate sessions
 * and separate login routes. There is no column, join, or code path that
 * promotes a public user to an admin (docs/DATABASE.md §4.1 `[LOCKED]`).
 */

export const USER_STATUS = ["active", "suspended", "banned"] as const;
export const ADMIN_STATUS = ["invited", "active", "suspended"] as const;

/** Public users. Phase 1 ships the schema only — no public signup until Phase 2. */
export const users = pgTable(
  "users",
  {
    id: primaryId(),
    email: citext("email").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    passwordHash: text("password_hash"),
    status: text("status").notNull().default("active"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...softDeleteTimestamps(),
  },
  (t) => [
    uniqueIndex("users_email_live_uq")
      .on(t.email)
      .where(sql`${t.deletedAt} is null`),
    index("users_status_idx").on(t.status),
    index("users_created_idx").on(t.createdAt.desc()),
    check(
      "users_status_ck",
      sql`${t.status} in (${sql.raw(sqlEnumList(USER_STATUS))})`,
    ),
  ],
);

/** Admin operators. Invited only — there is no admin self-signup. */
export const adminUsers = pgTable(
  "admin_users",
  {
    id: primaryId(),
    email: citext("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    status: text("status").notNull().default("invited"),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    mfaSecretEncrypted: text("mfa_secret_encrypted"),
    mfaRecoveryCodes: text("mfa_recovery_codes").array(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    /** Salted hash only — raw IPs are never stored (docs/CLAUDE.md §6). */
    lastLoginIpHash: text("last_login_ip_hash"),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    invitedByAdminId: uuid("invited_by_admin_id").references(
      (): AnyPgColumn => adminUsers.id,
      { onDelete: "set null" },
    ),
    ...softDeleteTimestamps(),
  },
  (t) => [
    uniqueIndex("admin_users_email_live_uq")
      .on(t.email)
      .where(sql`${t.deletedAt} is null`),
    index("admin_users_status_idx").on(t.status),
    check(
      "admin_users_status_ck",
      sql`${t.status} in (${sql.raw(sqlEnumList(ADMIN_STATUS))})`,
    ),
    check("admin_users_failed_login_ck", sql`${t.failedLoginCount} >= 0`),
  ],
);

/**
 * Database-backed admin sessions (docs/ARCHITECTURE.md §5.2 `[APPROVED]`).
 *
 * `token_hash` stores the SHA-256 of an opaque random token — NEVER the token
 * itself. Server-side sessions mean an admin can be logged out everywhere the
 * instant they are suspended or their roles change.
 */
export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: primaryId(),
    adminUserId: uuid("admin_user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    ipHash: text("ip_hash"),
    userAgentHash: text("user_agent_hash"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("admin_sessions_token_hash_uq").on(t.tokenHash),
    index("admin_sessions_admin_idx").on(t.adminUserId),
    index("admin_sessions_expires_idx").on(t.expiresAt),
  ],
);

export const roles = pgTable(
  "roles",
  {
    id: primaryId(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** System roles cannot be renamed or deleted. */
    isSystem: boolean("is_system").notNull().default(false),
    ...timestamps(),
  },
  (t) => [uniqueIndex("roles_key_uq").on(t.key)],
);

/**
 * Permission catalog. A joinable table rather than a jsonb array, so grants are
 * auditable and referentially safe — "who can publish?" stays a query, not a
 * JSON scan (docs/DATABASE.md §4.6).
 */
export const permissions = pgTable(
  "permissions",
  {
    id: primaryId(),
    key: text("key").notNull(),
    resource: text("resource").notNull(),
    action: text("action").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("permissions_key_uq").on(t.key),
    index("permissions_resource_idx").on(t.resource),
  ],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.roleId, t.permissionId] }),
    index("role_permissions_permission_idx").on(t.permissionId),
  ],
);

export const adminUserRoles = pgTable(
  "admin_user_roles",
  {
    adminUserId: uuid("admin_user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    grantedByAdminId: uuid("granted_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "set null" },
    ),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.adminUserId, t.roleId] }),
    index("admin_user_roles_role_idx").on(t.roleId),
  ],
);

/** Public user profile — 1:1 with `users`, split so credentials stay out of public reads. */
export const profiles = pgTable(
  "profiles",
  {
    id: primaryId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    slug: text("slug"),
    avatarMediaId: uuid("avatar_media_id"),
    countryCode: char("country_code", { length: 2 }),
    bio: text("bio"),
    tradingExperience: text("trading_experience"),
    isPublic: boolean("is_public").notNull().default(false),
    ...softDeleteTimestamps(),
  },
  (t) => [
    uniqueIndex("profiles_user_uq").on(t.userId),
    uniqueIndex("profiles_slug_live_uq")
      .on(t.slug)
      .where(sql`${t.slug} is not null and ${t.deletedAt} is null`),
    check(
      "profiles_bio_len_ck",
      sql`${t.bio} is null or length(${t.bio}) <= 1000`,
    ),
    check(
      "profiles_country_ck",
      sql`${t.countryCode} is null or ${t.countryCode} ~ '^[A-Z]{2}$'`,
    ),
  ],
);
