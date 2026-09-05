"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-admin";
import { getDb } from "@/lib/db/client";
import { auditLogs } from "@/lib/db/schema";
import {
  PERMISSIONS,
  AuthorizationError,
  requirePermission,
} from "@/lib/auth/permissions";
import { type StorageCheck, checkStorage } from "@/lib/media/storage";

/**
 * Storage self-test — docs/ADMIN.md.
 *
 * A Server Action is a PUBLIC HTTP ENDPOINT, so this resolves the admin from
 * the session cookie and the SERVICE enforces the permission. It performs a
 * real write, a real public read and a real delete against the bucket, which
 * is why it is gated on `catalog:manage` rather than merely on being signed in.
 *
 * The result carries statuses only. No key, no signature, no bucket
 * credential, and no provider response body ever reaches the browser or the
 * audit entry (CLAUDE.md §6 `[LOCKED]`).
 */

export interface StorageCheckState {
  ran?: boolean;
  check?: StorageCheck;
  error?: string;
}

export async function testStorageAction(
  _prev: StorageCheckState,
  formData: FormData,
): Promise<StorageCheckState> {
  // The form carries no fields; reading it keeps the signature honest.
  void formData;
  try {
    const admin = await requireAdmin();
    const db = getDb();
    await requirePermission(db, admin.adminUserId, PERMISSIONS.CATALOG_MANAGE);

    const check = await checkStorage();

    await db.insert(auditLogs).values({
      actorType: "admin",
      actorAdminId: admin.adminUserId,
      action: "media.storage_tested",
      entityType: "system",
      // Step names and outcomes. Never a credential.
      after: {
        ok: check.ok,
        steps: check.steps.map((s) => ({ step: s.step, ok: s.ok })),
      },
    });

    revalidatePath("/admin/settings");
    return { ran: true, check };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { error: "You do not have permission to do that." };
    }
    return { error: "The storage test could not be run." };
  }
}
