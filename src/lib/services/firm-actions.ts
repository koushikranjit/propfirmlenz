"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth/current-admin";
import { AuthorizationError } from "@/lib/auth/permissions";
import { createFirmSchema, editFirmSchema } from "@/lib/validation/firm";
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
    const input = createFirmSchema.parse({
      name: formData.get("name"),
      slug: formData.get("slug"),
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

    const input = editFirmSchema.parse({
      name: formData.get("name"),
      slug: formData.get("slug"),
      tagline: formData.get("tagline") ?? "",
      description: formData.get("description") ?? "",
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
