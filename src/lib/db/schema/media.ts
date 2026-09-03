import { sql } from "drizzle-orm";
import {
  bigint,
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
} from "drizzle-orm/pg-core";
import { adminUsers } from "./identity";
import { deletedAt, primaryId, sqlEnumList } from "./columns";

/** docs/DATABASE.md §5.8. */
export const STORAGE_PROVIDERS = ["r2", "s3", "vercel_blob"] as const;

export const media = pgTable(
  "media",
  {
    id: primaryId(),
    storageProvider: text("storage_provider").notNull().default("r2"),
    storageKey: text("storage_key").notNull(),
    publicUrl: text("public_url").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    /** Required for images — prevents CLS (docs/SEO.md §13). */
    width: integer("width"),
    height: integer("height"),
    blurPlaceholder: text("blur_placeholder"),
    checksumSha256: char("checksum_sha256", { length: 64 }).notNull(),
    /** Required at upload — accessibility and SEO (docs/DATABASE.md §5.8 `[LOCKED]`). */
    altText: text("alt_text").notNull(),
    title: text("title"),
    caption: text("caption"),
    uploadedByAdminId: uuid("uploaded_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("media_storage_key_uq").on(t.storageKey),
    uniqueIndex("media_checksum_uq").on(t.checksumSha256),
    index("media_created_idx").on(t.createdAt.desc()),
    check(
      "media_provider_ck",
      sql`${t.storageProvider} in (${sql.raw(sqlEnumList(STORAGE_PROVIDERS))})`,
    ),
    check("media_byte_size_ck", sql`${t.byteSize} > 0`),
    check(
      "media_image_dimensions_ck",
      sql`${t.mimeType} not like 'image/%' or (${t.width} is not null and ${t.height} is not null)`,
    ),
  ],
);

/**
 * Which entity fields reference which asset. Lets the admin answer
 * "what breaks if I delete this logo?" BEFORE deleting (docs/ADMIN.md §14).
 */
export const mediaUsages = pgTable(
  "media_usages",
  {
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    field: text("field").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({
      columns: [t.mediaId, t.entityType, t.entityId, t.field],
    }),
    index("media_usages_entity_idx").on(t.entityType, t.entityId),
  ],
);
