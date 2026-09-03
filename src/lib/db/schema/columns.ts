import { customType, timestamp, uuid } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

/**
 * Shared column conventions — docs/DATABASE.md §1 `[APPROVED]`.
 *
 * - UUIDv7 identifiers (time-ordered, good index locality, no sequential leak)
 * - timestamptz everywhere, always UTC
 * - soft delete via `deleted_at`, with partial unique indexes on live rows
 */

/** Case-insensitive text. Requires `CREATE EXTENSION citext`. */
export const citext = customType<{ data: string; driverData: string }>({
  dataType: () => "citext",
});

/** Primary key: application-generated UUIDv7 (docs/DATABASE.md §1). */
export const primaryId = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7());

/** A UUIDv7 for a non-primary-key column. */
export const newId = () => uuidv7();

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Soft delete. NULL = live. All public queries filter on this. */
export const deletedAt = () => timestamp("deleted_at", { withTimezone: true });

export const timestamps = () => ({
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const softDeleteTimestamps = () => ({
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt(),
});

/** Lifecycle status shared by publishable entities (docs/DATABASE.md §3.2). */
export const ENTITY_STATUS = ["draft", "published", "archived"] as const;
export type EntityStatus = (typeof ENTITY_STATUS)[number];

export const VERIFICATION_STATUS = [
  "unverified",
  "verified",
  "needs_review",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUS)[number];

/** Entity types addressable by the polymorphic tables (docs/DATABASE.md §3.1). */
export const ENTITY_TYPES = [
  "prop_firm",
  "challenge",
  "platform",
  "instrument",
  "offer",
  "affiliate_link",
  "media",
  "rule",
  "static_route",
] as const;
export type EntityTypeName = (typeof ENTITY_TYPES)[number];

/** Builds a SQL `IN (...)` list for a CHECK constraint from a const tuple. */
export const sqlEnumList = (values: readonly string[]) =>
  values.map((v) => `'${v}'`).join(", ");
