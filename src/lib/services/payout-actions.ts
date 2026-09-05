"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth/current-admin";
import { AuthorizationError } from "@/lib/auth/permissions";
import {
  networkSchema,
  rejectFormSchema,
  verifyFormSchema,
  walletFormSchema,
} from "@/lib/validation/payouts";
import {
  PayoutAdminError,
  deleteTrackedWallet,
  saveNetwork,
  saveTrackedWallet,
  scanWalletNow,
} from "./payout-admin";
import { seedPayoutRegistry, testProviderConnection } from "./payout-registry";
import {
  VerificationError,
  markForReview,
  rejectCandidate,
  verifyCandidate,
} from "./payout-verification";

/**
 * Payout server actions — docs/PAYOUTS.md §11.
 *
 * Server Actions are PUBLIC HTTP ENDPOINTS. Every action here resolves the
 * admin from the session cookie (never from the form body), validates with a
 * shared Zod schema, and lets the SERVICE enforce the permission — so a hidden
 * button remains presentation while the check remains security.
 *
 * TWO ACTIONS REACH THE PUBLIC FIGURES, and both are a human decision:
 * `verifyCandidateAction` publishes one transfer, and `saveWalletAction`
 * publishes every transfer from a wallet an admin marks verified trader
 * payouts, now and in future (`payout-autopublish.ts`). Nothing unattended
 * publishes anything.
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
  // These messages are written for an operator and contain no internals.
  if (error instanceof PayoutAdminError || error instanceof VerificationError) {
    return { error: error.message };
  }
  if (error instanceof AuthorizationError) {
    return { error: "You do not have permission to do that." };
  }
  return { error: "Something went wrong. Please try again." };
}

const text = (form: FormData, key: string): string =>
  typeof form.get(key) === "string" ? (form.get(key) as string) : "";
const checked = (form: FormData, key: string): boolean =>
  form.get(key) === "on" || form.get(key) === "true";
const optionalId = (form: FormData, key: string): string | undefined => {
  const value = text(form, key);
  return value.length > 0 ? value : undefined;
};

function revalidatePayouts(): void {
  revalidatePath("/admin/payouts");
  revalidatePath("/admin/payouts/wallets");
  revalidatePath("/admin/payouts/networks");
  revalidatePath("/admin/payouts/candidates");
  revalidatePath("/admin/payouts/verified");
}

/** Anything that can change a published figure must refresh the public pages. */
function revalidatePublicPayouts(): void {
  revalidatePath("/payouts");
  revalidatePath("/payouts/methodology");
}

/* ---------------------------------------------------------------- networks */

export async function saveNetworkAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const input = networkSchema.parse({
      id: optionalId(formData, "id"),
      key: text(formData, "key"),
      name: text(formData, "name"),
      chainId: text(formData, "chainId"),
      nativeSymbol: text(formData, "nativeSymbol"),
      explorerTxTemplate: text(formData, "explorerTxTemplate"),
      provider: text(formData, "provider"),
      confirmationsRequired: text(formData, "confirmationsRequired"),
      isActive: checked(formData, "isActive"),
    });

    await saveNetwork(getDb(), { adminUserId: admin.adminUserId, input });
    revalidatePayouts();
    return { ok: true, message: `Saved ${input.name}.` };
  } catch (error) {
    return toActionState(error);
  }
}

/* ---------------------------------------------------------------- registry */

export async function seedRegistryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // The form carries no fields; reading it keeps the signature honest.
  void formData;
  try {
    const admin = await requireAdmin();
    const report = await seedPayoutRegistry(getDb(), {
      adminUserId: admin.adminUserId,
    });
    revalidatePayouts();
    revalidatePath("/admin/payouts/providers");
    return {
      ok: true,
      message:
        `Registry updated: ${report.providersCreated} provider(s), ` +
        `${report.networksCreated} network(s), ${report.tokensCreated} token(s) added. ` +
        "Existing configuration was left untouched.",
    };
  } catch (error) {
    return toActionState(error);
  }
}

export async function testProviderAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const providerId = z.uuid().parse(formData.get("providerId"));

    const result = await testProviderConnection(getDb(), {
      adminUserId: admin.adminUserId,
      providerId,
    });
    revalidatePath("/admin/payouts/providers");

    // Status only. The credential never reaches this message.
    return result.ok
      ? { ok: true, message: `Connected in ${result.latencyMs}ms.` }
      : { error: `Connection failed: ${result.status}` };
  } catch (error) {
    return toActionState(error);
  }
}

/* ----------------------------------------------------------------- wallets */

export async function saveWalletAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const input = walletFormSchema.parse({
      id: optionalId(formData, "id"),
      propFirmId: text(formData, "propFirmId"),
      networkId: text(formData, "networkId"),
      address: text(formData, "address"),
      label: text(formData, "label"),
      purpose: text(formData, "purpose"),
      verificationStatus: text(formData, "verificationStatus"),
      notes: text(formData, "notes"),
      isActive: checked(formData, "isActive"),
    });

    const { autoPublished } = await saveTrackedWallet(getDb(), {
      adminUserId: admin.adminUserId,
      input,
    });
    revalidatePayouts();
    if (autoPublished > 0) revalidatePublicPayouts();

    // The message states plainly what marking a wallet verified now does.
    // An admin must not be able to publish payouts without knowing they did.
    const verified =
      input.purpose === "trader_payouts" &&
      input.verificationStatus === "verified";
    return {
      ok: true,
      message: verified
        ? `Wallet saved and marked verified trader payouts. Its transfers publish automatically from now on${
            autoPublished > 0
              ? `; ${autoPublished} already-collected transfer${
                  autoPublished === 1 ? "" : "s"
                } published now`
              : ""
          }.`
        : "Wallet saved. Transactions from it become candidates for review — nothing is published until it is verified.",
    };
  } catch (error) {
    return toActionState(error);
  }
}

/**
 * Retires a wallet. SOFT — published payouts and their evidence are untouched.
 *
 * Destructive enough to need confirmation and an audit entry (CLAUDE.md §6),
 * which is why the UI asks before submitting and the service logs it.
 */
export async function deleteWalletAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const walletId = z.uuid().parse(formData.get("walletId"));

    await deleteTrackedWallet(getDb(), {
      adminUserId: admin.adminUserId,
      walletId,
    });
    revalidatePayouts();
    return {
      ok: true,
      message:
        "Wallet removed. It will not be scanned again; payouts already published from it are unchanged.",
    };
  } catch (error) {
    return toActionState(error);
  }
}

export async function scanWalletAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const walletId = z.uuid().parse(formData.get("walletId"));

    const result = await scanWalletNow(getDb(), {
      adminUserId: admin.adminUserId,
      walletId,
    });
    revalidatePayouts();
    if (result.autoPublished > 0) revalidatePublicPayouts();

    // A provider failure is reported as a failure, never as "no payouts".
    if (result.error) {
      return { error: `Scan did not complete: ${result.error}` };
    }

    const published =
      result.autoPublished > 0
        ? ` ${result.autoPublished} published automatically from this verified wallet.`
        : "";
    // Said out loud, so "nothing new" cannot be mistaken for a quiet wallet
    // when the page budget actually went on money coming IN.
    const incoming =
      result.skippedIncoming > 0
        ? ` ${result.skippedIncoming} incoming transfer${
            result.skippedIncoming === 1 ? " was" : "s were"
          } ignored — only money leaving the wallet is a payout.`
        : "";

    return {
      ok: true,
      message:
        result.transactionsInserted === 0
          ? `Scan complete. Saw ${result.transfersSeen} outgoing transfer${
              result.transfersSeen === 1 ? "" : "s"
            }; nothing new to record.${incoming}${published}`
          : `Scan complete. ${result.transactionsInserted} new transaction${
              result.transactionsInserted === 1 ? "" : "s"
            }, ${result.candidatesCreated} candidate${
              result.candidatesCreated === 1 ? "" : "s"
            }.${incoming}${published}`,
    };
  } catch (error) {
    return toActionState(error);
  }
}

/* ------------------------------------------------------------ review queue */

export async function verifyCandidateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const input = verifyFormSchema.parse({
      candidateId: formData.get("candidateId"),
      note: text(formData, "note"),
      usd: {
        value: text(formData, "usdValue"),
        rate: text(formData, "usdRate"),
        source: text(formData, "usdRateSource"),
        rateAt: text(formData, "usdRateAt"),
      },
    });

    await verifyCandidate(getDb(), {
      adminUserId: admin.adminUserId,
      candidateId: input.candidateId,
      ...(input.note ? { note: input.note } : {}),
      ...(input.usd ? { usd: input.usd } : {}),
    });

    revalidatePayouts();
    // The public pages read verified payouts, so they change with this.
    revalidatePath("/payouts");
    return {
      ok: true,
      message: "Verified. It now counts towards the public payout statistics.",
    };
  } catch (error) {
    return toActionState(error);
  }
}

export async function rejectCandidateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const input = rejectFormSchema.parse({
      candidateId: formData.get("candidateId"),
      reason: text(formData, "reason"),
    });

    await rejectCandidate(getDb(), {
      adminUserId: admin.adminUserId,
      candidateId: input.candidateId,
      reason: input.reason,
    });

    revalidatePayouts();
    return { ok: true, message: "Rejected. It will not appear publicly." };
  } catch (error) {
    return toActionState(error);
  }
}

export async function markForReviewAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const candidateId = z.uuid().parse(formData.get("candidateId"));

    await markForReview(getDb(), {
      adminUserId: admin.adminUserId,
      candidateId,
    });
    revalidatePayouts();
    return { ok: true, message: "Moved to the review queue." };
  } catch (error) {
    return toActionState(error);
  }
}
