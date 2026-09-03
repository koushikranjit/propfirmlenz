import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import {
  auditLogs,
  challenges,
  entityVersions,
  propFirms,
  redirects,
} from "@/lib/db/schema";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import {
  type DraftPayload,
  countDraftChanges,
  draftPayloadSchema,
  emptyDraft,
} from "@/lib/validation/draft";

/**
 * LIVE -> EDIT DRAFT -> PREVIEW -> PUBLISH — docs/DATABASE.md §3.2.1,
 * docs/ADMIN.md §7 `[LOCKED]`.
 *
 * THE GUARANTEE: while a draft exists, the public site continues to serve the
 * published version, byte for byte. Editing, saving and previewing change
 * nothing public. Only an explicit publish changes published data.
 */

export class StaleDraftError extends Error {
  readonly code = "STALE_DRAFT";
  constructor(
    readonly baseVersion: number,
    readonly currentVersion: number,
  ) {
    super(
      `Draft was forked from version ${baseVersion} but the firm is now at version ${currentVersion}.`,
    );
    this.name = "StaleDraftError";
  }
}

export class NotFoundError extends Error {
  readonly code = "NOT_FOUND";
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

export class PrePublishCheckError extends Error {
  readonly code = "PRE_PUBLISH_FAILED";
  constructor(readonly failures: string[]) {
    super(`Pre-publish checks failed: ${failures.join("; ")}`);
    this.name = "PrePublishCheckError";
  }
}

/** Latest version number for a firm; 0 when never published. */
export async function getCurrentVersion(
  db: Database,
  firmId: string,
): Promise<number> {
  const rows = await db
    .select({ v: entityVersions.versionNumber })
    .from(entityVersions)
    .where(
      and(
        eq(entityVersions.entityType, "prop_firm"),
        eq(entityVersions.entityId, firmId),
      ),
    )
    .orderBy(desc(entityVersions.versionNumber))
    .limit(1);
  return rows[0]?.v ?? 0;
}

/**
 * Saves a draft. Validated with the SAME schema used at publish, so a draft
 * cannot accumulate invalid state that only fails at the last moment.
 *
 * Published columns are NOT touched.
 */
export async function saveDraft(
  db: Database,
  opts: {
    adminUserId: string;
    firmId: string;
    payload: unknown;
  },
): Promise<{ pendingChanges: number }> {
  await requirePermission(db, opts.adminUserId, PERMISSIONS.FIRM_EDIT);

  const parsed = draftPayloadSchema.parse(opts.payload);

  const firm = await requireFirm(db, opts.firmId);
  const currentVersion = await getCurrentVersion(db, firm.id);

  // Optimistic concurrency: refuse to overwrite a colleague's newer publish.
  if (parsed.baseVersion !== currentVersion) {
    throw new StaleDraftError(parsed.baseVersion, currentVersion);
  }

  await db
    .update(propFirms)
    .set({
      draftPayload: parsed,
      // `updated_at` is PRESERVED explicitly. It feeds sitemap `lastmod`
      // (docs/SEO.md §14), so bumping it on a draft save would tell search
      // engines the published page changed when it did not
      // (docs/ADMIN.md §7A.1: "no updated_at on the published row").
      // The editor and timestamp are recorded inside the draft envelope.
      updatedAt: firm.updatedAt,
    })
    .where(eq(propFirms.id, firm.id));

  await writeAudit(db, {
    adminUserId: opts.adminUserId,
    action: "firm.draft_saved",
    entityId: firm.id,
    after: { pendingChanges: countDraftChanges(parsed) },
  });

  return { pendingChanges: countDraftChanges(parsed) };
}

/** Discards a draft. Published columns are left untouched. */
export async function discardDraft(
  db: Database,
  opts: { adminUserId: string; firmId: string },
): Promise<void> {
  await requirePermission(db, opts.adminUserId, PERMISSIONS.FIRM_EDIT);
  const firm = await requireFirm(db, opts.firmId);

  await db
    .update(propFirms)
    // updated_at preserved for the same reason as saveDraft: discarding a
    // draft changes nothing public, so it must not move sitemap lastmod.
    .set({ draftPayload: null, updatedAt: firm.updatedAt })
    .where(eq(propFirms.id, firm.id));

  await writeAudit(db, {
    adminUserId: opts.adminUserId,
    action: "firm.draft_discarded",
    entityId: firm.id,
  });
}

export interface FirmView {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  websiteUrl: string | null;
  isVerified: boolean;
  challenges: {
    id: string;
    name: string;
    slug: string;
    accountSize: string;
    accountCurrency: string;
    price: string | null;
    priceCurrency: string | null;
  }[];
}

/**
 * Overlays draft_payload onto the published rows.
 *
 * PURE AND READ-ONLY — it never writes. Ever. `[LOCKED]`
 *
 * Returns the same `FirmView` the public page consumes, so the live preview
 * renders through the real public components and cannot drift from production
 * (docs/ARCHITECTURE.md §21.2, §21.3).
 */
export async function materializeDraft(
  db: Database,
  firmId: string,
): Promise<FirmView> {
  const firm = await requireFirm(db, firmId);
  const publishedChallenges = await db
    .select()
    .from(challenges)
    .where(
      and(eq(challenges.propFirmId, firmId), isNull(challenges.deletedAt)),
    );

  const draft = firm.draftPayload;

  const base: FirmView = {
    id: firm.id,
    slug: firm.slug,
    name: firm.name,
    tagline: firm.tagline,
    description: firm.description,
    websiteUrl: firm.websiteUrl,
    isVerified: firm.verificationStatus === "verified",
    challenges: publishedChallenges.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      accountSize: c.accountSize,
      accountCurrency: c.accountCurrency,
      price: c.price,
      priceCurrency: c.priceCurrency,
    })),
  };

  if (!draft) return base;

  const view: FirmView = {
    ...base,
    ...(draft.firm?.slug !== undefined ? { slug: draft.firm.slug } : {}),
    ...(draft.firm?.name !== undefined ? { name: draft.firm.name } : {}),
    ...(draft.firm?.tagline !== undefined
      ? { tagline: draft.firm.tagline }
      : {}),
    ...(draft.firm?.description !== undefined
      ? { description: draft.firm.description }
      : {}),
    ...(draft.firm?.websiteUrl !== undefined
      ? { websiteUrl: draft.firm.websiteUrl }
      : {}),
  };

  // Apply child ops. Synthesised rows are never written.
  const byId = new Map(view.challenges.map((c) => [c.id, { ...c }]));
  for (const op of draft.challenges ?? []) {
    if (op._op === "delete" && op.id) {
      byId.delete(op.id);
      continue;
    }
    if (op._op === "update" && op.id) {
      const existing = byId.get(op.id);
      if (existing) {
        byId.set(op.id, {
          ...existing,
          ...(op.name !== undefined ? { name: op.name } : {}),
          ...(op.slug !== undefined ? { slug: op.slug } : {}),
          ...(op.accountSize !== undefined
            ? {
                accountSize: op.accountSize.amount.toFixed(2),
                accountCurrency: op.accountSize.currency,
              }
            : {}),
          ...(op.price !== undefined
            ? op.price === null
              ? { price: null, priceCurrency: null }
              : {
                  price: op.price.amount.toFixed(2),
                  priceCurrency: op.price.currency,
                }
            : {}),
        });
      }
      continue;
    }
    if (op._op === "create") {
      // Stable synthetic id so React keys and anchors survive preview reloads.
      const syntheticId = `draft:${op.slug ?? op.name ?? "new"}`;
      byId.set(syntheticId, {
        id: syntheticId,
        name: op.name ?? "",
        slug: op.slug ?? "",
        accountSize: op.accountSize ? op.accountSize.amount.toFixed(2) : "0.00",
        accountCurrency: op.accountSize?.currency ?? "USD",
        price: op.price ? op.price.amount.toFixed(2) : null,
        priceCurrency: op.price ? op.price.currency : null,
      });
    }
  }
  view.challenges = [...byId.values()];

  return view;
}

/** The pre-publish checklist, run against the MATERIALISED draft. */
export async function runPrePublishChecks(
  db: Database,
  firmId: string,
): Promise<string[]> {
  const view = await materializeDraft(db, firmId);
  const failures: string[] = [];

  if (!view.name.trim()) failures.push("name is required");
  if (!view.slug.trim()) failures.push("slug is required");
  if (!view.description?.trim()) failures.push("description is required");

  // Slug must not collide with a live firm or an active redirect.
  const collision = await db
    .select({ id: propFirms.id })
    .from(propFirms)
    .where(and(eq(propFirms.slug, view.slug), isNull(propFirms.deletedAt)))
    .limit(2);
  if (collision.some((c) => c.id !== firmId)) {
    failures.push(`slug "${view.slug}" is already in use`);
  }

  const redirectCollision = await db
    .select({ id: redirects.id })
    .from(redirects)
    .where(
      and(
        eq(redirects.fromPath, `/prop-firms/${view.slug}`),
        eq(redirects.isActive, true),
      ),
    )
    .limit(1);
  if (redirectCollision.length > 0) {
    failures.push(`slug "${view.slug}" is claimed by an active redirect`);
  }

  return failures;
}

/**
 * Publish — ONE transaction (docs/ADMIN.md §7 rule 6):
 *
 *   validate -> checklist -> apply firm fields -> apply child ops as real rows
 *   -> write entity_versions snapshot -> write audit_logs
 *   -> set published_at (first publish only) -> CLEAR draft_payload -> commit
 *
 * Cache-tag revalidation happens AFTER commit, never inside it.
 */
export async function publishFirm(
  db: Database,
  opts: { adminUserId: string; firmId: string },
): Promise<{ version: number; slugChanged: boolean }> {
  await requirePermission(db, opts.adminUserId, PERMISSIONS.FIRM_PUBLISH);

  const firm = await requireFirm(db, opts.firmId);
  const draft = firm.draftPayload;
  const currentVersion = await getCurrentVersion(db, firm.id);

  if (draft && draft.baseVersion !== currentVersion) {
    throw new StaleDraftError(draft.baseVersion, currentVersion);
  }

  const failures = await runPrePublishChecks(db, firm.id);
  if (failures.length > 0) throw new PrePublishCheckError(failures);

  const view = await materializeDraft(db, firm.id);
  const slugChanged = view.slug !== firm.slug;
  const now = new Date();

  await db.transaction(async (tx) => {
    // 1. Apply firm-level fields.
    await tx
      .update(propFirms)
      .set({
        slug: view.slug,
        name: view.name,
        tagline: view.tagline,
        description: view.description,
        websiteUrl: view.websiteUrl,
        status: "published",
        publishedAt: firm.publishedAt ?? now,
        updatedByAdminId: opts.adminUserId,
        // 4. Clear the draft — publish is complete only when this is null.
        draftPayload: null,
        // Editing substantive data invalidates verification (docs/ADMIN.md §8).
        ...(draft && firm.verificationStatus === "verified"
          ? { verificationStatus: "needs_review" as const }
          : {}),
      })
      .where(eq(propFirms.id, firm.id));

    // 2. A slug change writes its 301 in the SAME transaction (docs/SEO.md §7).
    if (slugChanged) {
      await tx.insert(redirects).values({
        fromPath: `/prop-firms/${firm.slug}`,
        toPath: `/prop-firms/${view.slug}`,
        statusCode: 301,
        source: "auto_slug_change",
        reason: `Firm slug changed from ${firm.slug} to ${view.slug}`,
        createdByAdminId: opts.adminUserId,
      });
    }

    // 3. Immutable version snapshot.
    await tx.insert(entityVersions).values({
      entityType: "prop_firm",
      entityId: firm.id,
      versionNumber: currentVersion + 1,
      snapshot: view as unknown as Record<string, unknown>,
      isPublished: true,
      createdByAdminId: opts.adminUserId,
    });

    // 4. Audit.
    await tx.insert(auditLogs).values({
      actorType: "admin",
      actorAdminId: opts.adminUserId,
      action: "firm.published",
      entityType: "prop_firm",
      entityId: firm.id,
      after: { version: currentVersion + 1, slug: view.slug },
    });
  });

  return { version: currentVersion + 1, slugChanged };
}

/**
 * Rollback restores a prior snapshot INTO draft_payload — never straight to
 * live `[LOCKED]`. The admin then reviews, previews, and publishes it, which
 * creates a new version in its turn. History stays append-only.
 */
export async function rollbackToVersion(
  db: Database,
  opts: { adminUserId: string; firmId: string; versionNumber: number },
): Promise<{ restoredFrom: number; baseVersion: number }> {
  await requirePermission(db, opts.adminUserId, PERMISSIONS.FIRM_PUBLISH);

  const firm = await requireFirm(db, opts.firmId);

  const rows = await db
    .select()
    .from(entityVersions)
    .where(
      and(
        eq(entityVersions.entityType, "prop_firm"),
        eq(entityVersions.entityId, firm.id),
        eq(entityVersions.versionNumber, opts.versionNumber),
      ),
    )
    .limit(1);

  const version = rows[0];
  if (!version) throw new NotFoundError(`Version ${opts.versionNumber}`);

  const snapshot = version.snapshot as unknown as FirmView;
  const currentVersion = await getCurrentVersion(db, firm.id);

  const restored: DraftPayload = {
    ...emptyDraft(currentVersion, opts.adminUserId),
    firm: {
      slug: snapshot.slug,
      name: snapshot.name,
      tagline: snapshot.tagline,
      description: snapshot.description,
      websiteUrl: snapshot.websiteUrl,
    },
  };

  // Validate the restored payload like any other draft.
  const parsed = draftPayloadSchema.parse(restored);

  await db
    .update(propFirms)
    // Rollback lands in the draft only; the live row is untouched.
    .set({ draftPayload: parsed, updatedAt: firm.updatedAt })
    .where(eq(propFirms.id, firm.id));

  await writeAudit(db, {
    adminUserId: opts.adminUserId,
    action: "firm.rolled_back",
    entityId: firm.id,
    after: { restoredFrom: opts.versionNumber },
  });

  return { restoredFrom: opts.versionNumber, baseVersion: currentVersion };
}

/** Soft delete. Recoverable, and frees the slug for reuse (docs/DATABASE.md §1.2). */
export async function softDeleteFirm(
  db: Database,
  opts: { adminUserId: string; firmId: string },
): Promise<void> {
  await requirePermission(db, opts.adminUserId, PERMISSIONS.FIRM_DELETE);
  const firm = await requireFirm(db, opts.firmId);

  await db
    .update(propFirms)
    .set({ deletedAt: new Date(), updatedByAdminId: opts.adminUserId })
    .where(eq(propFirms.id, firm.id));

  await writeAudit(db, {
    adminUserId: opts.adminUserId,
    action: "firm.deleted",
    entityId: firm.id,
  });
}

async function requireFirm(db: Database, firmId: string) {
  const rows = await db
    .select()
    .from(propFirms)
    .where(and(eq(propFirms.id, firmId), isNull(propFirms.deletedAt)))
    .limit(1);
  const firm = rows[0];
  if (!firm) throw new NotFoundError("Firm");
  return firm;
}

async function writeAudit(
  db: Database,
  opts: {
    adminUserId: string;
    action: string;
    entityId: string;
    after?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(auditLogs).values({
    actorType: "admin",
    actorAdminId: opts.adminUserId,
    action: opts.action,
    entityType: "prop_firm",
    entityId: opts.entityId,
    ...(opts.after ? { after: opts.after } : {}),
  });
}
