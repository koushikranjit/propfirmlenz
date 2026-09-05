"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth/current-admin";
import { AuthorizationError, PERMISSIONS } from "@/lib/auth/permissions";
import { MAX_IMAGE_BYTES } from "@/lib/media/image";
import { LogoError, removeFirmLogo, uploadFirmLogo } from "./firm-logo";
import { stageChildOp } from "./firm-children";
import { NotFoundError, StaleDraftError } from "./firm-draft";

/**
 * Logo, announcements and FAQ actions — docs/ADMIN.md §6.
 *
 * Server Actions are PUBLIC HTTP ENDPOINTS. Each one resolves the admin from
 * the session cookie (never the form body), validates with Zod, and lets the
 * SERVICE enforce permission.
 *
 * Announcements and FAQs stage into `draft_payload` through the same
 * `stageChildOp` every other child uses. Nothing here writes a published row.
 */

export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
  message?: string;
  /** Set by the upload action so the form can show the new image immediately. */
  logoUrl?: string;
}

function toActionState(error: unknown): ActionState {
  if (error instanceof z.ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Please correct the highlighted fields.", fieldErrors };
  }
  if (error instanceof LogoError) {
    // The missing-variable NAMES are safe to show an operator; values are not.
    return {
      error:
        error.missing.length > 0
          ? `${error.message} Set ${error.missing.join(", ")} on the server.`
          : error.message,
    };
  }
  if (error instanceof StaleDraftError) {
    return {
      error:
        "This firm was published by someone else while you were editing. Reload before saving again.",
    };
  }
  if (error instanceof AuthorizationError) {
    return { error: "You do not have permission to do that." };
  }
  if (error instanceof NotFoundError) {
    return { error: "That firm no longer exists." };
  }
  return { error: "Something went wrong. Please try again." };
}

const idSchema = z.uuid();
const text = (form: FormData, key: string): string =>
  typeof form.get(key) === "string" ? (form.get(key) as string) : "";
const optionalId = (form: FormData, key: string): string | undefined => {
  const value = text(form, key);
  return value.length > 0 ? value : undefined;
};
const blank = (value: string): string | null =>
  value.trim().length === 0 ? null : value.trim();

function staged(firmId: string, pendingChanges: number): ActionState {
  revalidatePath(`/admin/prop-firms/${firmId}`);
  return {
    ok: true,
    message: `Staged in the draft. ${pendingChanges} pending change${
      pendingChanges === 1 ? "" : "s"
    }. The published page is unchanged until you publish.`,
  };
}

/* -------------------------------------------------------------------- logo */

export async function uploadLogoAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const firmId = idSchema.parse(formData.get("firmId"));

    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "Choose an image to upload." };
    }
    // Checked before reading the whole body into memory.
    if (file.size > MAX_IMAGE_BYTES) {
      return {
        error: `That file is larger than ${Math.round(
          MAX_IMAGE_BYTES / 1024 / 1024,
        )}MB.`,
      };
    }

    const result = await uploadFirmLogo(getDb(), {
      adminUserId: admin.adminUserId,
      firmId,
      bytes: new Uint8Array(await file.arrayBuffer()),
      altText: text(formData, "altText"),
    });

    revalidatePath(`/admin/prop-firms/${firmId}`);
    return {
      ok: true,
      logoUrl: result.publicUrl,
      message:
        "Logo uploaded and staged. The published page keeps the old logo until you publish.",
    };
  } catch (error) {
    return toActionState(error);
  }
}

export async function removeLogoAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const firmId = idSchema.parse(formData.get("firmId"));
    const { pendingChanges } = await removeFirmLogo(getDb(), {
      adminUserId: admin.adminUserId,
      firmId,
    });
    return staged(firmId, pendingChanges);
  } catch (error) {
    return toActionState(error);
  }
}

/* ----------------------------------------------------------- announcements */

/** `datetime-local` has no zone; it is read as UTC, as everywhere else. */
const localDateTime = z
  .string()
  .trim()
  .refine(
    (v) =>
      /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(v) &&
      !Number.isNaN(
        new Date(v.includes("T") ? `${v}Z` : `${v}T00:00:00Z`).getTime(),
      ),
    "Enter the date it was announced.",
  )
  .transform((v) =>
    new Date(v.includes("T") ? `${v}Z` : `${v}T00:00:00Z`).toISOString(),
  );

const announcementSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1, "A title is required.").max(200),
  body: z.string().trim().max(5000).nullable(),
  linkUrl: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .refine(
      (v) => v === null || v.startsWith("https://"),
      "Links must start with https://",
    ),
  announcedAt: localDateTime,
  isActive: z.boolean(),
});

export async function saveAnnouncementAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const firmId = idSchema.parse(formData.get("firmId"));
    const id = optionalId(formData, "id");

    const input = announcementSchema.parse({
      ...(id ? { id } : {}),
      title: text(formData, "title"),
      body: blank(text(formData, "body")),
      linkUrl: text(formData, "linkUrl"),
      announcedAt: text(formData, "announcedAt"),
      isActive: formData.get("isActive") === "on",
    });

    const { pendingChanges } = await stageChildOp(getDb(), {
      adminUserId: admin.adminUserId,
      firmId,
      collection: "announcements",
      permission: PERMISSIONS.FIRM_EDIT,
      op: id
        ? { _op: "update", ...input, id }
        : { _op: "create", ...input, id: undefined },
    });

    return staged(firmId, pendingChanges);
  } catch (error) {
    return toActionState(error);
  }
}

export async function deleteAnnouncementAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const firmId = idSchema.parse(formData.get("firmId"));
    const id = idSchema.parse(formData.get("id"));

    const { pendingChanges } = await stageChildOp(getDb(), {
      adminUserId: admin.adminUserId,
      firmId,
      collection: "announcements",
      permission: PERMISSIONS.FIRM_EDIT,
      op: { _op: "delete", id },
    });
    return staged(firmId, pendingChanges);
  } catch (error) {
    return toActionState(error);
  }
}

/* -------------------------------------------------------------------- FAQs */

const faqSchema = z.object({
  id: z.uuid().optional(),
  question: z.string().trim().min(1, "A question is required.").max(300),
  answer: z.string().trim().min(1, "An answer is required.").max(5000),
  displayOrder: z.coerce.number().int().min(0).max(999).catch(0),
  isActive: z.boolean(),
});

export async function saveFaqAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const firmId = idSchema.parse(formData.get("firmId"));
    const id = optionalId(formData, "id");

    const input = faqSchema.parse({
      ...(id ? { id } : {}),
      question: text(formData, "question"),
      answer: text(formData, "answer"),
      displayOrder: text(formData, "displayOrder") || 0,
      isActive: formData.get("isActive") === "on",
    });

    const { pendingChanges } = await stageChildOp(getDb(), {
      adminUserId: admin.adminUserId,
      firmId,
      collection: "faqs",
      permission: PERMISSIONS.FIRM_EDIT,
      op: id
        ? { _op: "update", ...input, id }
        : { _op: "create", ...input, id: undefined },
    });

    return staged(firmId, pendingChanges);
  } catch (error) {
    return toActionState(error);
  }
}

export async function deleteFaqAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const firmId = idSchema.parse(formData.get("firmId"));
    const id = idSchema.parse(formData.get("id"));

    const { pendingChanges } = await stageChildOp(getDb(), {
      adminUserId: admin.adminUserId,
      firmId,
      collection: "faqs",
      permission: PERMISSIONS.FIRM_EDIT,
      op: { _op: "delete", id },
    });
    return staged(firmId, pendingChanges);
  } catch (error) {
    return toActionState(error);
  }
}
