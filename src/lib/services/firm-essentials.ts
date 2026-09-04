import { and, asc, eq, isNull } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import { affiliateLinks, offers, propFirms } from "@/lib/db/schema";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { isSafeAffiliateDestination } from "@/lib/affiliate/link";
import {
  type DraftPayload,
  countDraftChanges,
  draftPayloadSchema,
  emptyDraft,
} from "@/lib/validation/draft";
import type { FirmEssentialsInput } from "@/lib/validation/firm";
import {
  NotFoundError,
  StaleDraftError,
  getCurrentVersion,
} from "./firm-draft";
import { stageChildOp } from "./firm-children";

/**
 * THE SIMPLE EDITOR'S SERVICE — docs/ADMIN.md §6.
 *
 * One save spanning three collections: the firm's own columns, its affiliate
 * link, and its discount offer. It exists so an admin can list a firm in under
 * a minute without walking every tab.
 *
 * IT ADDS NO NEW RULES. Firm fields are staged into `draft_payload` exactly as
 * the full editor stages them; the affiliate link and the offer go through the
 * SAME `stageChildOp` the Advanced tabs use, with the same per-collection
 * permissions and the same validation. This is a different door into the
 * existing machinery, not a second machine.
 *
 * PARTIAL BY DESIGN `[LOCKED]`. Only the fields this form owns are written.
 * Legal name, founded year, headquarters, support details, platforms,
 * instruments, challenges, rules and SEO are untouched, so simplifying the
 * screen can never quietly erase data entered under Advanced.
 */

export interface EssentialsResult {
  pendingChanges: number;
  affiliateStaged: boolean;
  offerStaged: boolean;
}

export async function saveFirmEssentials(
  db: Database,
  opts: {
    adminUserId: string;
    firmId: string;
    input: FirmEssentialsInput;
  },
): Promise<EssentialsResult> {
  await requirePermission(db, opts.adminUserId, PERMISSIONS.FIRM_EDIT);

  const rows = await db
    .select()
    .from(propFirms)
    .where(and(eq(propFirms.id, opts.firmId), isNull(propFirms.deletedAt)))
    .limit(1);
  const firm = rows[0];
  if (!firm) throw new NotFoundError("Firm");

  const currentVersion = await getCurrentVersion(db, firm.id);
  if (firm.draftPayload && firm.draftPayload.baseVersion !== currentVersion) {
    throw new StaleDraftError(firm.draftPayload.baseVersion, currentVersion);
  }

  const { input } = opts;

  /* ------------------------------------------------------- firm columns */

  const base: DraftPayload =
    firm.draftPayload ?? emptyDraft(currentVersion, opts.adminUserId);

  const payload = draftPayloadSchema.parse({
    ...base,
    baseVersion: currentVersion,
    updatedAt: new Date().toISOString(),
    updatedByAdminId: opts.adminUserId,
    firm: {
      ...(base.firm ?? {}),
      name: input.name,
      description: input.description,
      websiteUrl: input.websiteUrl,
      payoutInfoUrl: input.payoutInfoUrl,
    },
  });

  await db
    .update(propFirms)
    // `updated_at` preserved: a draft save changes nothing public, so it must
    // not move sitemap lastmod (docs/SEO.md §14).
    .set({ draftPayload: payload, updatedAt: firm.updatedAt })
    .where(eq(propFirms.id, firm.id));

  let pendingChanges = countDraftChanges(payload);
  let affiliateStaged = false;
  let offerStaged = false;

  /* ---------------------------------------------------- affiliate link */

  if (input.affiliateUrl) {
    // The SAME predicate `/go/{slug}` applies before emitting a Location
    // header. A destination that could never be redirected to is refused here
    // too (docs/ARCHITECTURE.md §11.3 `[LOCKED]`).
    if (!isSafeAffiliateDestination(input.affiliateUrl)) {
      throw new UnsafeDestinationError();
    }

    // The existing link is resolved from the DATABASE, never from the form —
    // a client-supplied id must not be able to address another firm's row.
    const [existing] = await db
      .select({ id: affiliateLinks.id })
      .from(affiliateLinks)
      .where(
        and(
          eq(affiliateLinks.propFirmId, firm.id),
          eq(affiliateLinks.isDefault, true),
          isNull(affiliateLinks.deletedAt),
        ),
      )
      .limit(1);

    const result = await stageChildOp(db, {
      adminUserId: opts.adminUserId,
      firmId: firm.id,
      collection: "affiliateLinks",
      permission: PERMISSIONS.AFFILIATE_LINK_EDIT,
      op: existing
        ? {
            _op: "update",
            id: existing.id,
            destinationUrl: input.affiliateUrl,
            status: "active",
          }
        : {
            _op: "create",
            label: "Purchase link",
            destinationUrl: input.affiliateUrl,
            isDefault: true,
            status: "active",
          },
    });
    pendingChanges = result.pendingChanges;
    affiliateStaged = true;
  }

  /* ---------------------------------------------------------- discount */

  const hasDiscount =
    input.discountCode !== null ||
    input.discountPercent !== null ||
    input.discountEndsAt !== null;

  if (hasDiscount) {
    const [existing] = await db
      .select({ id: offers.id })
      .from(offers)
      .where(and(eq(offers.propFirmId, firm.id), isNull(offers.deletedAt)))
      .orderBy(asc(offers.displayOrder), asc(offers.title))
      .limit(1);

    const fields = {
      code: input.discountCode,
      discountType:
        input.discountPercent === null ? null : ("percent" as const),
      discountValue: input.discountPercent,
      endsAt: input.discountEndsAt,
    };

    const result = await stageChildOp(db, {
      adminUserId: opts.adminUserId,
      firmId: firm.id,
      collection: "offers",
      permission: PERMISSIONS.OFFER_EDIT,
      op: existing
        ? { _op: "update", id: existing.id, ...fields }
        : // "Discount" is a label, not a business fact. The terms, description
          // and window stay blank until a human enters what the firm published.
          { _op: "create", title: "Discount", ...fields },
    });
    pendingChanges = result.pendingChanges;
    offerStaged = true;
  }

  return { pendingChanges, affiliateStaged, offerStaged };
}

/** Raised when a destination could never be safely redirected to. */
export class UnsafeDestinationError extends Error {
  readonly code = "UNSAFE_DESTINATION";
  constructor() {
    super(
      "Enter an absolute https:// URL with a real domain and no embedded credentials.",
    );
    this.name = "UnsafeDestinationError";
  }
}
