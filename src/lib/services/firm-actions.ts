"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth/current-admin";
import { AuthorizationError } from "@/lib/auth/permissions";
import {
  createFirmSchema,
  editFirmSchema,
  firmEssentialsSchema,
  slugFromName,
} from "@/lib/validation/firm";
import { UnsafeDestinationError, saveFirmEssentials } from "./firm-essentials";
import {
  SlugConflictError,
  createFirm,
  saveFirmEdits,
  verifyFirm,
} from "./firm-admin";
import {
  NotFoundError,
  PrePublishCheckError,
  StaleDraftError,
  discardDraft,
  publishFirm,
  softDeleteFirm,
} from "./firm-draft";

/**
 * Admin server actions.
 *
 * Server Actions are PUBLIC HTTP ENDPOINTS — they are treated as such
 * (docs/ARCHITECTURE.md §3.2). Every action:
 *
 *  1. resolves the admin from the session cookie — never from client input
 *  2. delegates authorisation to the service layer's requirePermission
 *  3. validates its input with the shared Zod schema
 *  4. returns a safe message; internals go to the logs, never to the client
 *
 * The admin identity, the permission set, and the firm id are never trusted
 * from the form body.
 */

export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
  message?: string;
}

/** Maps known failures to safe messages; anything else is generic. */
function toActionState(error: unknown): ActionState {
  if (error instanceof z.ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Please correct the highlighted fields.", fieldErrors };
  }
  if (error instanceof UnsafeDestinationError) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: { affiliateUrl: error.message },
    };
  }
  if (error instanceof SlugConflictError) {
    return { error: error.message, fieldErrors: { slug: error.message } };
  }
  if (error instanceof StaleDraftError) {
    return {
      error:
        "This firm was published by someone else while you were editing. Reload to see their changes before publishing.",
    };
  }
  if (error instanceof PrePublishCheckError) {
    return { error: `Cannot publish yet — ${error.failures.join("; ")}.` };
  }
  if (error instanceof AuthorizationError) {
    return { error: "You do not have permission to do that." };
  }
  if (error instanceof NotFoundError) {
    return { error: "That firm no longer exists." };
  }
  // Never leak internals to the client (docs/ARCHITECTURE.md §12).
  return { error: "Something went wrong. Please try again." };
}

const idSchema = z.uuid();

export async function createFirmAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let newId: string;
  try {
    const admin = await requireAdmin();
    const rawName = formData.get("name");
    const submittedSlug = formData.get("slug");
    const input = createFirmSchema.parse({
      name: rawName,
      // The simple form does not ask for a slug; it is derived from the name
      // and stays editable under Advanced. A submitted slug still wins, so the
      // Advanced path keeps working.
      slug:
        typeof submittedSlug === "string" && submittedSlug.trim().length > 0
          ? submittedSlug
          : slugFromName(typeof rawName === "string" ? rawName : ""),
      description: formData.get("description") ?? "",
    });
    const result = await createFirm(getDb(), {
      adminUserId: admin.adminUserId,
      input,
    });
    newId = result.id;
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath("/admin/prop-firms");
  redirect(`/admin/prop-firms/${newId}`);
}

export async function saveFirmAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const firmId = idSchema.parse(formData.get("firmId"));

    // Advanced saves carry only advanced fields; name, tagline and
    // description are the primary editor's, and are left untouched here.
    const input = editFirmSchema.parse({
      slug: formData.get("slug"),
      legalName: formData.get("legalName") ?? "",
      foundedYear: formData.get("foundedYear") ?? "",
      headquartersCountry: formData.get("headquartersCountry") ?? "",
      headquartersCity: formData.get("headquartersCity") ?? "",
      websiteUrl: formData.get("websiteUrl") ?? "",
      supportEmail: formData.get("supportEmail") ?? "",
      supportUrl: formData.get("supportUrl") ?? "",
      brandColor: formData.get("brandColor") ?? "",
      isFeatured: formData.get("isFeatured") === "on",
      displayOrder: formData.get("displayOrder") ?? 0,
    });

    const result = await saveFirmEdits(getDb(), {
      adminUserId: admin.adminUserId,
      firmId,
      input,
    });

    revalidatePath(`/admin/prop-firms/${firmId}`);
    return {
      ok: true,
      message:
        result.mode === "draft"
          ? "Draft saved. The published page is unchanged."
          : "Saved.",
    };
  } catch (error) {
    return toActionState(error);
  }
}

/**
 * Saves the SIMPLE editor — docs/ADMIN.md §6.
 *
 * Partial by design: it writes only the fields that form owns, so data entered
 * under Advanced is never wiped by a save from the simple screen.
 */
export async function saveFirmEssentialsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const firmId = idSchema.parse(formData.get("firmId"));

    const input = firmEssentialsSchema.parse({
      name: formData.get("name"),
      tagline: formData.get("tagline") ?? "",
      description: formData.get("description") ?? "",
      affiliateUrl: formData.get("affiliateUrl") ?? "",
      founderName: formData.get("founderName") ?? "",
      ceoName: formData.get("ceoName") ?? "",
      headquartersCountry: formData.get("headquartersCountry") ?? "",
      trustpilotRating: formData.get("trustpilotRating") ?? "",
      trustpilotUrl: formData.get("trustpilotUrl") ?? "",
      foundedOn: formData.get("foundedOn") ?? "",
      payoutInfoUrl: formData.get("payoutInfoUrl") ?? "",
      discountTitle: formData.get("discountTitle") ?? "",
      discountCode: formData.get("discountCode") ?? "",
      discountDescription: formData.get("discountDescription") ?? "",
      discountPercent: formData.get("discountPercent") ?? "",
      discountEndsAt: formData.get("discountEndsAt") ?? "",
    });

    const result = await saveFirmEssentials(getDb(), {
      adminUserId: admin.adminUserId,
      firmId,
      input,
    });

    revalidatePath(`/admin/prop-firms/${firmId}`);
    return {
      ok: true,
      message: `Draft saved. ${result.pendingChanges} pending change${
        result.pendingChanges === 1 ? "" : "s"
      }. The published page is unchanged until you publish.`,
    };
  } catch (error) {
    return toActionState(error);
  }
}

export async function publishFirmAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const firmId = idSchema.parse(formData.get("firmId"));
    const result = await publishFirm(getDb(), {
      adminUserId: admin.adminUserId,
      firmId,
    });

    // Revalidation happens AFTER the transaction commits
    // (docs/ARCHITECTURE.md §8.2).
    revalidatePath(`/admin/prop-firms/${firmId}`);
    revalidatePath("/admin/prop-firms");

    return {
      ok: true,
      message: `Published version ${result.version}.${
        result.slugChanged ? " A 301 redirect was created for the old URL." : ""
      }`,
    };
  } catch (error) {
    return toActionState(error);
  }
}

export async function discardDraftAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const firmId = idSchema.parse(formData.get("firmId"));
    await discardDraft(getDb(), { adminUserId: admin.adminUserId, firmId });
    revalidatePath(`/admin/prop-firms/${firmId}`);
    return { ok: true, message: "Draft discarded. Published data untouched." };
  } catch (error) {
    return toActionState(error);
  }
}

export async function verifyFirmAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const firmId = idSchema.parse(formData.get("firmId"));
    await verifyFirm(getDb(), { adminUserId: admin.adminUserId, firmId });
    revalidatePath(`/admin/prop-firms/${firmId}`);
    return { ok: true, message: "Firm marked as verified." };
  } catch (error) {
    return toActionState(error);
  }
}

export async function archiveFirmAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const firmId = idSchema.parse(formData.get("firmId"));
    await softDeleteFirm(getDb(), { adminUserId: admin.adminUserId, firmId });
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath("/admin/prop-firms");
  redirect("/admin/prop-firms");
}
