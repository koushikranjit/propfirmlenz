import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import { auditLogs, propFirms } from "@/lib/db/schema";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import {
  type DraftAffiliateLink,
  type DraftAnnouncement,
  type DraftFaq,
  type DraftFirm,
  type DraftChallenge,
  type DraftInstrument,
  type DraftOffer,
  type DraftPayload,
  type DraftPlatform,
  type DraftRuleValue,
  type DraftSeo,
  countDraftChanges,
  draftPayloadSchema,
  emptyDraft,
} from "@/lib/validation/draft";
import { NotFoundError, getCurrentVersion } from "./firm-draft";

/**
 * Staging child edits into `draft_payload` — docs/DATABASE.md §3.2.1 `[LOCKED]`.
 *
 * EVERY child edit goes through the draft. There is no "write it straight to
 * the table if the firm is unpublished" shortcut here, deliberately:
 *
 *  - one code path means one set of semantics to reason about and test;
 *  - `publishFirm` already materialises the whole draft atomically, so an
 *    unpublished firm reaches the same end state by the same route;
 *  - an admin can preview an unpublished firm's challenges before committing
 *    to them, which is the entire point of the draft model.
 *
 * A staged op NEVER touches a published row. Creating a challenge inserts
 * nothing; deleting one deletes nothing. The public page keeps serving exactly
 * what it served before, until someone publishes.
 *
 * Each collection is keyed so that editing the same child twice REPLACES the
 * pending op rather than queuing two of them — otherwise a draft would grow a
 * history of intermediate states that publish would replay in order.
 */

export type ChildCollection =
  | "challenges"
  | "ruleValues"
  | "platforms"
  | "instruments"
  | "offers"
  | "affiliateLinks"
  | "announcements"
  | "faqs";

/** Identity of a pending op within its collection. */
function opKey(
  collection: ChildCollection,
  op: Record<string, unknown>,
): string {
  switch (collection) {
    case "platforms":
      return String(op.platformId);
    case "instruments":
      return String(op.instrumentId);
    case "ruleValues":
      // Keyed by RULE, not by row: a firm answers a given rule once.
      return String(op.ruleId);
    default: {
      if (op.id) return String(op.id);
      // A create has no id yet, so it is keyed by its NATURAL key. Submitting
      // the same new child twice then replaces the pending op instead of
      // queuing a second insert that would collide on a unique index the
      // moment someone published.
      const natural = op.slug ?? op.title ?? op.label ?? op.question;
      return `new:${natural === undefined ? "unnamed" : String(natural)}`;
    }
  }
}

type AnyOp =
  | DraftChallenge
  | DraftRuleValue
  | DraftPlatform
  | DraftInstrument
  | DraftOffer
  | DraftAffiliateLink
  | DraftAnnouncement
  | DraftFaq;

async function loadFirmForDraft(db: Database, firmId: string) {
  const rows = await db
    .select()
    .from(propFirms)
    .where(and(eq(propFirms.id, firmId), isNull(propFirms.deletedAt)))
    .limit(1);
  const firm = rows[0];
  if (!firm) throw new NotFoundError("Firm");
  return firm;
}

/**
 * Merges one child op into the firm's draft and saves it.
 *
 * Returns the resulting pending-change count so the UI can show it without a
 * second round trip.
 */
export async function stageChildOp(
  db: Database,
  opts: {
    adminUserId: string;
    firmId: string;
    collection: ChildCollection;
    op: AnyOp;
    /** The permission this specific collection requires. */
    permission?: (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
  },
): Promise<{ pendingChanges: number }> {
  await requirePermission(
    db,
    opts.adminUserId,
    opts.permission ?? PERMISSIONS.FIRM_EDIT,
  );

  const firm = await loadFirmForDraft(db, opts.firmId);
  const currentVersion = await getCurrentVersion(db, firm.id);

  const base: DraftPayload =
    firm.draftPayload ?? emptyDraft(currentVersion, opts.adminUserId);

  // Optimistic concurrency: an existing draft forked from a superseded version
  // must not silently absorb another edit (docs/CLAUDE.md §12.4e rule 33).
  if (firm.draftPayload && firm.draftPayload.baseVersion !== currentVersion) {
    const { StaleDraftError } = await import("./firm-draft");
    throw new StaleDraftError(firm.draftPayload.baseVersion, currentVersion);
  }

  const existing = (base[opts.collection] ?? []) as AnyOp[];
  const key = opKey(opts.collection, opts.op as Record<string, unknown>);
  const next = existing.filter(
    (candidate) =>
      opKey(opts.collection, candidate as Record<string, unknown>) !== key,
  );
  next.push(opts.op);

  const payload = draftPayloadSchema.parse({
    ...base,
    baseVersion: currentVersion,
    updatedAt: new Date().toISOString(),
    updatedByAdminId: opts.adminUserId,
    [opts.collection]: next,
  });

  await db
    .update(propFirms)
    // `updated_at` preserved: a draft save changes nothing public, so it must
    // not move sitemap lastmod (docs/SEO.md §14).
    .set({ draftPayload: payload, updatedAt: firm.updatedAt })
    .where(eq(propFirms.id, firm.id));

  await db.insert(auditLogs).values({
    actorType: "admin",
    actorAdminId: opts.adminUserId,
    action: `firm.${opts.collection}.staged`,
    entityType: "prop_firm",
    entityId: firm.id,
    // The op itself, minus anything sensitive. Affiliate destinations are
    // commercial but not secret; commission notes are never staged at all.
    after: { op: opts.op._op, collection: opts.collection },
  });

  return { pendingChanges: countDraftChanges(payload) };
}

/**
 * Removes a PENDING op without publishing anything.
 *
 * This is "undo my staged edit", not "delete the published row" — deleting a
 * published child is itself a staged `delete` op.
 */
export async function unstageChildOp(
  db: Database,
  opts: {
    adminUserId: string;
    firmId: string;
    collection: ChildCollection;
    key: string;
  },
): Promise<{ pendingChanges: number }> {
  await requirePermission(db, opts.adminUserId, PERMISSIONS.FIRM_EDIT);

  const firm = await loadFirmForDraft(db, opts.firmId);
  if (!firm.draftPayload) return { pendingChanges: 0 };

  const existing = (firm.draftPayload[opts.collection] ?? []) as AnyOp[];
  const next = existing.filter(
    (candidate) =>
      opKey(opts.collection, candidate as Record<string, unknown>) !== opts.key,
  );

  const payload = draftPayloadSchema.parse({
    ...firm.draftPayload,
    updatedAt: new Date().toISOString(),
    updatedByAdminId: opts.adminUserId,
    [opts.collection]: next,
  });

  await db
    .update(propFirms)
    .set({ draftPayload: payload, updatedAt: firm.updatedAt })
    .where(eq(propFirms.id, firm.id));

  return { pendingChanges: countDraftChanges(payload) };
}

/** Stages the firm's SEO metadata. Replaces the pending block wholesale. */
/**
 * Stages ONE firm column into the draft.
 *
 * For edits that are not a form submission — a logo upload, say — where
 * round-tripping the whole essentials form would overwrite fields the caller
 * never saw. It merges into any existing draft rather than replacing it.
 */
export async function stageFirmField<K extends keyof DraftFirm>(
  db: Database,
  opts: {
    adminUserId: string;
    firmId: string;
    field: K;
    value: DraftFirm[K];
  },
): Promise<{ pendingChanges: number }> {
  await requirePermission(db, opts.adminUserId, PERMISSIONS.FIRM_EDIT);

  const firm = await loadFirmForDraft(db, opts.firmId);
  const currentVersion = await getCurrentVersion(db, firm.id);
  const base: DraftPayload =
    firm.draftPayload ?? emptyDraft(currentVersion, opts.adminUserId);

  const payload = draftPayloadSchema.parse({
    ...base,
    baseVersion: currentVersion,
    updatedAt: new Date().toISOString(),
    updatedByAdminId: opts.adminUserId,
    firm: { ...(base.firm ?? {}), [opts.field]: opts.value },
  });

  await db
    .update(propFirms)
    // Preserved: a draft save changes nothing public (docs/SEO.md §14).
    .set({ draftPayload: payload, updatedAt: firm.updatedAt })
    .where(eq(propFirms.id, firm.id));

  return { pendingChanges: countDraftChanges(payload) };
}

export async function stageSeo(
  db: Database,
  opts: { adminUserId: string; firmId: string; seo: DraftSeo },
): Promise<{ pendingChanges: number }> {
  // SEO is its own permission: an SEO manager edits metadata without being
  // able to change the firm's business data (docs/ADMIN.md §11).
  await requirePermission(db, opts.adminUserId, PERMISSIONS.SEO_WRITE);

  const firm = await loadFirmForDraft(db, opts.firmId);
  const currentVersion = await getCurrentVersion(db, firm.id);
  const base: DraftPayload =
    firm.draftPayload ?? emptyDraft(currentVersion, opts.adminUserId);

  const payload = draftPayloadSchema.parse({
    ...base,
    baseVersion: currentVersion,
    updatedAt: new Date().toISOString(),
    updatedByAdminId: opts.adminUserId,
    seo: opts.seo,
  });

  await db
    .update(propFirms)
    .set({ draftPayload: payload, updatedAt: firm.updatedAt })
    .where(eq(propFirms.id, firm.id));

  await db.insert(auditLogs).values({
    actorType: "admin",
    actorAdminId: opts.adminUserId,
    action: "firm.seo.staged",
    entityType: "prop_firm",
    entityId: firm.id,
  });

  return { pendingChanges: countDraftChanges(payload) };
}
