"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth/current-admin";
import { AuthorizationError, PERMISSIONS } from "@/lib/auth/permissions";
import { isSafeAffiliateDestination } from "@/lib/affiliate/link";
import {
  affiliateLinkFormSchema,
  challengeFormSchema,
  instrumentFormSchema,
  offerFormSchema,
  platformFormSchema,
  ruleFormSchema,
  seoFormSchema,
  toAffiliateLinkOp,
  toChallengeOp,
  toOfferOp,
  toRuleOp,
} from "@/lib/validation/firm-children";
import {
  type ChildCollection,
  stageChildOp,
  stageSeo,
  unstageChildOp,
} from "./firm-children";
import { NotFoundError, StaleDraftError } from "./firm-draft";

/**
 * Child-collection server actions — docs/ARCHITECTURE.md §3.2.
 *
 * Server Actions are PUBLIC HTTP ENDPOINTS and are treated as such. Every
 * action here:
 *
 *  1. resolves the admin from the session cookie — NEVER from the form body;
 *  2. delegates authorisation to the service layer's `requirePermission`, so a
 *     hidden button is presentation and the permission check is security;
 *  3. validates its input with a shared Zod schema before anything reaches a
 *     service;
 *  4. returns a safe message — internals go to the logs, never to the client.
 *
 * Every mutation lands in `draft_payload`. None of them writes a published row;
 * that only happens inside `publishFirm`'s transaction.
 */

export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
  message?: string;
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
const checked = (form: FormData, key: string): boolean =>
  form.get(key) === "on" || form.get(key) === "true";
const optionalId = (form: FormData, key: string): string | undefined => {
  const value = text(form, key);
  return value.length > 0 ? value : undefined;
};

function saved(firmId: string, pendingChanges: number): ActionState {
  revalidatePath(`/admin/prop-firms/${firmId}`);
  return {
    ok: true,
    message: `Staged in the draft. ${pendingChanges} pending change${
      pendingChanges === 1 ? "" : "s"
    }. The published page is unchanged until you publish.`,
  };
}

/* ------------------------------------------------------------- challenges */

export async function saveChallengeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const firmId = idSchema.parse(formData.get("firmId"));

    const input = challengeFormSchema.parse({
      id: optionalId(formData, "id"),
      name: text(formData, "name"),
      slug: text(formData, "slug"),
      challengeType: text(formData, "challengeType"),
      accountSizeAmount: text(formData, "accountSizeAmount"),
      accountSizeCurrency: text(formData, "accountSizeCurrency"),
      priceAmount: text(formData, "priceAmount"),
      priceCurrency: text(formData, "priceCurrency"),
      profitTargetP1Pct: text(formData, "profitTargetP1Pct"),
      profitTargetP2Pct: text(formData, "profitTargetP2Pct"),
      profitTargetP3Pct: text(formData, "profitTargetP3Pct"),
      maxDailyLossPct: text(formData, "maxDailyLossPct"),
      maxTotalDrawdownPct: text(formData, "maxTotalDrawdownPct"),
      drawdownType: text(formData, "drawdownType"),
      drawdownBasis: text(formData, "drawdownBasis"),
      minTradingDays: text(formData, "minTradingDays"),
      maxTradingDays: text(formData, "maxTradingDays"),
      profitSplitPct: text(formData, "profitSplitPct"),
      payoutFrequencyDays: text(formData, "payoutFrequencyDays"),
      firstPayoutDays: text(formData, "firstPayoutDays"),
      leverage: text(formData, "leverage"),
      feeRefundable: text(formData, "feeRefundable"),
      hasScalingPlan: text(formData, "hasScalingPlan"),
      displayOrder: text(formData, "displayOrder"),
    });

    const { pendingChanges } = await stageChildOp(getDb(), {
      adminUserId: admin.adminUserId,
      firmId,
      collection: "challenges",
      op: toChallengeOp(input),
      permission: PERMISSIONS.CHALLENGE_EDIT,
    });

    return saved(firmId, pendingChanges);
  } catch (error) {
    return toActionState(error);
  }
}

/* ------------------------------------------------------------------ rules */

export async function saveRuleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const firmId = idSchema.parse(formData.get("firmId"));

    const input = ruleFormSchema.parse({
      id: optionalId(formData, "id"),
      ruleId: text(formData, "ruleId"),
      state: text(formData, "state"),
      detail: text(formData, "detail"),
      note: text(formData, "note"),
      sourceUrl: text(formData, "sourceUrl"),
    });

    const op = toRuleOp(input);
    if (!op) {
      // "Not specified" on a rule that was never answered: nothing to stage,
      // and saying so is more honest than reporting a change.
      return { ok: true, message: "No answer recorded for that rule." };
    }

    const { pendingChanges } = await stageChildOp(getDb(), {
      adminUserId: admin.adminUserId,
      firmId,
      collection: "ruleValues",
      op,
    });

    return saved(firmId, pendingChanges);
  } catch (error) {
    return toActionState(error);
  }
}

/* ------------------------------------------------ platforms & instruments */

export async function savePlatformAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const firmId = idSchema.parse(formData.get("firmId"));
    const remove = formData.get("remove") === "true";

    const input = platformFormSchema.parse({
      platformId: text(formData, "platformId"),
      isPrimary: checked(formData, "isPrimary"),
      notes: text(formData, "notes"),
    });

    const { pendingChanges } = await stageChildOp(getDb(), {
      adminUserId: admin.adminUserId,
      firmId,
      collection: "platforms",
      op: remove
        ? { _op: "delete", platformId: input.platformId }
        : {
            _op: "create",
            platformId: input.platformId,
            isPrimary: input.isPrimary,
            notes: input.notes,
          },
    });

    return saved(firmId, pendingChanges);
  } catch (error) {
    return toActionState(error);
  }
}

export async function saveInstrumentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const firmId = idSchema.parse(formData.get("firmId"));
    const remove = formData.get("remove") === "true";

    const input = instrumentFormSchema.parse({
      instrumentId: text(formData, "instrumentId"),
      isAllowed: checked(formData, "isAllowed"),
      notes: text(formData, "notes"),
    });

    const { pendingChanges } = await stageChildOp(getDb(), {
      adminUserId: admin.adminUserId,
      firmId,
      collection: "instruments",
      op: remove
        ? { _op: "delete", instrumentId: input.instrumentId }
        : {
            _op: "create",
            instrumentId: input.instrumentId,
            isAllowed: input.isAllowed,
            notes: input.notes,
          },
    });

    return saved(firmId, pendingChanges);
  } catch (error) {
    return toActionState(error);
  }
}

/* ----------------------------------------------------------------- offers */

export async function saveOfferAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const firmId = idSchema.parse(formData.get("firmId"));

    const input = offerFormSchema.parse({
      id: optionalId(formData, "id"),
      title: text(formData, "title"),
      description: text(formData, "description"),
      terms: text(formData, "terms"),
      code: text(formData, "code"),
      discountType: text(formData, "discountType"),
      discountValue: text(formData, "discountValue"),
      discountCurrency: text(formData, "discountCurrency"),
      startsAt: text(formData, "startsAt"),
      endsAt: text(formData, "endsAt"),
      affiliateLinkId: text(formData, "affiliateLinkId"),
      displayOrder: text(formData, "displayOrder"),
    });

    const { pendingChanges } = await stageChildOp(getDb(), {
      adminUserId: admin.adminUserId,
      firmId,
      collection: "offers",
      op: toOfferOp(input),
      permission: PERMISSIONS.OFFER_EDIT,
    });

    return saved(firmId, pendingChanges);
  } catch (error) {
    return toActionState(error);
  }
}

/* -------------------------------------------------------- affiliate links */

export async function saveAffiliateLinkAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const firmId = idSchema.parse(formData.get("firmId"));

    const input = affiliateLinkFormSchema.parse({
      id: optionalId(formData, "id"),
      label: text(formData, "label"),
      destinationUrl: text(formData, "destinationUrl"),
      network: text(formData, "network"),
      campaign: text(formData, "campaign"),
      isDefault: checked(formData, "isDefault"),
      status: text(formData, "status"),
      startsAt: text(formData, "startsAt"),
      endsAt: text(formData, "endsAt"),
    });

    // The SAME predicate `/go/{slug}` applies before it emits a Location
    // header. Rejecting here means a destination that could never be
    // redirected to also cannot be stored (docs/ARCHITECTURE.md §11.3).
    if (!isSafeAffiliateDestination(input.destinationUrl)) {
      return {
        error: "Please correct the highlighted fields.",
        fieldErrors: {
          destinationUrl:
            "Enter an absolute https:// URL with a real domain and no embedded credentials.",
        },
      };
    }

    const { pendingChanges } = await stageChildOp(getDb(), {
      adminUserId: admin.adminUserId,
      firmId,
      collection: "affiliateLinks",
      op: toAffiliateLinkOp(input),
      permission: PERMISSIONS.AFFILIATE_LINK_EDIT,
    });

    return saved(firmId, pendingChanges);
  } catch (error) {
    return toActionState(error);
  }
}

/* ------------------------------------------------------- remove / unstage */

const COLLECTIONS: ChildCollection[] = [
  "challenges",
  "ruleValues",
  "platforms",
  "instruments",
  "offers",
  "affiliateLinks",
];

/** Stages a DELETE of a published child. The row is removed only at publish. */
export async function removeChildAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const firmId = idSchema.parse(formData.get("firmId"));
    const collection = z
      .enum(COLLECTIONS as [ChildCollection, ...ChildCollection[]])
      .parse(formData.get("collection"));
    const id = idSchema.parse(formData.get("id"));

    // Only the collections whose ops are keyed by a row id reach here;
    // associations are removed through their own action.
    const op =
      collection === "ruleValues"
        ? {
            _op: "delete" as const,
            id,
            ruleId: idSchema.parse(formData.get("ruleId")),
            scope: "firm" as const,
          }
        : { _op: "delete" as const, id };

    const { pendingChanges } = await stageChildOp(getDb(), {
      adminUserId: admin.adminUserId,
      firmId,
      collection,
      op: op as never,
    });

    revalidatePath(`/admin/prop-firms/${firmId}`);
    return {
      ok: true,
      message: `Removal staged. ${pendingChanges} pending change${
        pendingChanges === 1 ? "" : "s"
      }. Nothing is deleted until you publish.`,
    };
  } catch (error) {
    return toActionState(error);
  }
}

/** Drops a PENDING op — "undo my staged edit", not "delete the published row". */
export async function unstageChildAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const firmId = idSchema.parse(formData.get("firmId"));
    const collection = z
      .enum(COLLECTIONS as [ChildCollection, ...ChildCollection[]])
      .parse(formData.get("collection"));
    const key = z.string().min(1).max(200).parse(formData.get("key"));

    const { pendingChanges } = await unstageChildOp(getDb(), {
      adminUserId: admin.adminUserId,
      firmId,
      collection,
      key,
    });

    revalidatePath(`/admin/prop-firms/${firmId}`);
    return {
      ok: true,
      message: `Pending change discarded. ${pendingChanges} remaining.`,
    };
  } catch (error) {
    return toActionState(error);
  }
}

/* -------------------------------------------------------------------- SEO */

export async function saveSeoAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const firmId = idSchema.parse(formData.get("firmId"));

    const input = seoFormSchema.parse({
      title: text(formData, "title"),
      metaDescription: text(formData, "metaDescription"),
      canonicalUrl: text(formData, "canonicalUrl"),
      ogTitle: text(formData, "ogTitle"),
      ogDescription: text(formData, "ogDescription"),
      robotsIndex: checked(formData, "robotsIndex"),
      robotsFollow: checked(formData, "robotsFollow"),
      includeInSitemap: checked(formData, "includeInSitemap"),
    });

    const { pendingChanges } = await stageSeo(getDb(), {
      adminUserId: admin.adminUserId,
      firmId,
      seo: input,
    });

    return saved(firmId, pendingChanges);
  } catch (error) {
    return toActionState(error);
  }
}
