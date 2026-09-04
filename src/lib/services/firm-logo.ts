import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import { auditLogs, media, mediaUsages, propFirms } from "@/lib/db/schema";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { ImageError, inspectImage } from "@/lib/media/image";
import {
  StorageError,
  mediaStorage,
  missingStorageVars,
} from "@/lib/media/storage";
import { stageFirmField } from "./firm-children";

/**
 * FIRM LOGO UPLOAD — docs/ADMIN.md §14.
 *
 * The logo is a firm field like any other, so it goes through the DRAFT: the
 * media row and the object are created immediately (an upload is not reversible
 * by a discard), but `logoMediaId` is STAGED. The public page keeps the
 * published logo until someone publishes, exactly as with a name change
 * (CLAUDE.md §12.4e rule 28 `[LOCKED]`).
 *
 * FOUR THINGS THIS REFUSES TO DO:
 *  1. trust the browser's Content-Type — the format is read from the bytes;
 *  2. accept SVG — a script-bearing document served from a trusted origin;
 *  3. store a local filesystem path — that works on a laptop and 404s in
 *     production;
 *  4. pretend to work when storage is unconfigured. It says so instead.
 */

export class LogoError extends Error {
  constructor(
    readonly code:
      "NOT_CONFIGURED" | "INVALID_IMAGE" | "UPLOAD_FAILED" | "NOT_FOUND",
    message: string,
    /** Variable names only — never a value (CLAUDE.md §6). */
    readonly missing: string[] = [],
  ) {
    super(message);
    this.name = "LogoError";
  }
}

export interface LogoResult {
  mediaId: string;
  publicUrl: string;
  width: number;
  height: number;
  pendingChanges: number;
}

/**
 * Stores an uploaded logo and stages it on the firm's draft.
 *
 * The checksum doubles as deduplication: `media_checksum_uq` means re-uploading
 * a byte-identical file reuses the existing object instead of paying for a
 * second copy of it.
 */
export async function uploadFirmLogo(
  db: Database,
  opts: {
    adminUserId: string;
    firmId: string;
    bytes: Uint8Array;
    altText: string;
  },
): Promise<LogoResult> {
  await requirePermission(db, opts.adminUserId, PERMISSIONS.MEDIA_UPLOAD);
  await requirePermission(db, opts.adminUserId, PERMISSIONS.FIRM_EDIT);

  const storage = mediaStorage();
  if (!storage) {
    throw new LogoError(
      "NOT_CONFIGURED",
      "Media storage is not configured, so the logo cannot be stored.",
      missingStorageVars(),
    );
  }

  const [firm] = await db
    .select({ id: propFirms.id, slug: propFirms.slug, name: propFirms.name })
    .from(propFirms)
    .where(and(eq(propFirms.id, opts.firmId), isNull(propFirms.deletedAt)))
    .limit(1);
  if (!firm) throw new LogoError("NOT_FOUND", "That firm no longer exists.");

  let image;
  try {
    image = inspectImage(opts.bytes);
  } catch (error) {
    if (error instanceof ImageError) {
      throw new LogoError("INVALID_IMAGE", error.message);
    }
    throw error;
  }

  const checksum = createHash("sha256").update(opts.bytes).digest("hex");

  // Same bytes, already stored: reuse rather than duplicate.
  const [existing] = await db
    .select({ id: media.id, publicUrl: media.publicUrl })
    .from(media)
    .where(and(eq(media.checksumSha256, checksum), isNull(media.deletedAt)))
    .limit(1);

  let mediaId: string;
  let publicUrl: string;

  if (existing) {
    mediaId = existing.id;
    publicUrl = existing.publicUrl;
  } else {
    const extension = image.mimeType.split("/")[1] ?? "bin";
    // Checksum-named, so the key is content-addressed and a re-upload of the
    // same bytes can never collide with a different image.
    const key = `firms/${firm.slug}/logo-${checksum.slice(0, 16)}.${extension}`;

    let stored;
    try {
      stored = await storage.put({
        key,
        body: opts.bytes,
        contentType: image.mimeType,
      });
    } catch (error) {
      throw new LogoError(
        "UPLOAD_FAILED",
        error instanceof StorageError
          ? error.message
          : "The upload did not complete.",
      );
    }

    const [row] = await db
      .insert(media)
      .values({
        storageProvider: storage.provider,
        storageKey: stored.storageKey,
        publicUrl: stored.publicUrl,
        mimeType: image.mimeType,
        byteSize: opts.bytes.length,
        width: image.width,
        height: image.height,
        checksumSha256: checksum,
        altText: opts.altText.trim() || `${firm.name} logo`,
        uploadedByAdminId: opts.adminUserId,
      })
      .returning({ id: media.id, publicUrl: media.publicUrl });

    if (!row) throw new LogoError("UPLOAD_FAILED", "The upload did not save.");
    mediaId = row.id;
    publicUrl = row.publicUrl;
  }

  // "What breaks if I delete this asset?" needs an answer before deletion.
  await db
    .insert(mediaUsages)
    .values({
      mediaId,
      entityType: "prop_firm",
      entityId: firm.id,
      field: "logo_media_id",
    })
    .onConflictDoNothing();

  const { pendingChanges } = await stageFirmField(db, {
    adminUserId: opts.adminUserId,
    firmId: firm.id,
    field: "logoMediaId",
    value: mediaId,
  });

  await db.insert(auditLogs).values({
    actorType: "admin",
    actorAdminId: opts.adminUserId,
    action: "firm.logo_uploaded",
    entityType: "prop_firm",
    entityId: firm.id,
    after: { mediaId, bytes: opts.bytes.length, mimeType: image.mimeType },
  });

  return {
    mediaId,
    publicUrl,
    width: image.width,
    height: image.height,
    pendingChanges,
  };
}

/**
 * Stages the REMOVAL of a firm's logo.
 *
 * The media row and the stored object are left alone: another firm may share
 * the asset by checksum, and an upload is not undone by an editorial decision.
 * Deleting assets is the media library's job, with usage counts in view.
 */
export async function removeFirmLogo(
  db: Database,
  opts: { adminUserId: string; firmId: string },
): Promise<{ pendingChanges: number }> {
  await requirePermission(db, opts.adminUserId, PERMISSIONS.FIRM_EDIT);

  const result = await stageFirmField(db, {
    adminUserId: opts.adminUserId,
    firmId: opts.firmId,
    field: "logoMediaId",
    value: null,
  });

  await db.insert(auditLogs).values({
    actorType: "admin",
    actorAdminId: opts.adminUserId,
    action: "firm.logo_removed",
    entityType: "prop_firm",
    entityId: opts.firmId,
    after: { logoMediaId: null },
  });

  return result;
}
