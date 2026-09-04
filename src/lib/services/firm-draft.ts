import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import {
  affiliateLinks,
  auditLogs,
  entityVersions,
  instruments,
  platforms,
  propFirms,
  redirects,
  rules,
} from "@/lib/db/schema";
import {
  assembleView,
  getFirmRowForView,
} from "@/lib/repositories/public-firm-view";
import type { FirmView } from "@/lib/view/firm-view";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { type OverlayCatalog, overlayDraft } from "./firm-draft-overlay";
import { applyDraftChildren } from "./firm-publish-children";
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

/** Re-exported so existing imports of `FirmView` from this module keep working. */
export type { FirmView };

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

/**
 * Overlays draft_payload onto the published rows.
 *
 * PURE AND READ-ONLY — it never writes. Ever. `[LOCKED]`
 *
 * Returns the SAME `FirmView` the public page consumes (docs/view/firm-view.ts),
 * built by the SAME `assembleView` the public repository uses. That is what
 * makes the live preview render through the real public components and be
 * structurally unable to drift from production
 * (docs/ARCHITECTURE.md §21.2, §21.3 `[LOCKED]`).
 */
export async function materializeDraft(
  db: Database,
  firmId: string,
): Promise<FirmView> {
  const firm = await requireFirm(db, firmId);
  const row = await getFirmRowForView(db, firmId);
  if (!row) throw new NotFoundError("Firm");

  // The published view, assembled exactly as the public page would build it.
  const base = await assembleView(db, row);
  const draft = firm.draftPayload;
  if (!draft) return base;

  // The draft references catalog rows and affiliate links by id; the overlay
  // is pure, so those are resolved here and handed to it.
  const catalog = await loadOverlayCatalog(db, firmId, draft);
  return overlayDraft(base, draft, catalog);
}

/**
 * Resolves everything the pure overlay needs: the catalog rows the draft names,
 * and the firm's currently-active affiliate link ids.
 *
 * One query per collection, and only for ids the draft actually references — a
 * draft that touches no platforms issues no platform query.
 */
async function loadOverlayCatalog(
  db: Database,
  firmId: string,
  draft: DraftPayload,
): Promise<OverlayCatalog> {
  const platformIds = (draft.platforms ?? []).map((p) => p.platformId);
  const instrumentIds = (draft.instruments ?? []).map((i) => i.instrumentId);
  const ruleIds = (draft.ruleValues ?? []).map((r) => r.ruleId);

  const [platformRows, instrumentRows, ruleRows, affiliateRows] =
    await Promise.all([
      platformIds.length > 0
        ? db
            .select({
              id: platforms.id,
              name: platforms.name,
              slug: platforms.slug,
            })
            .from(platforms)
            .where(inArray(platforms.id, platformIds))
        : Promise.resolve([]),

      instrumentIds.length > 0
        ? db
            .select({
              id: instruments.id,
              name: instruments.name,
              slug: instruments.slug,
              assetClass: instruments.assetClass,
            })
            .from(instruments)
            .where(inArray(instruments.id, instrumentIds))
        : Promise.resolve([]),

      ruleIds.length > 0
        ? db
            .select({
              id: rules.id,
              key: rules.key,
              label: rules.label,
              category: rules.category,
              description: rules.description,
            })
            .from(rules)
            .where(inArray(rules.id, ruleIds))
        : Promise.resolve([]),

      db
        .select({ id: affiliateLinks.id })
        .from(affiliateLinks)
        .where(
          and(
            eq(affiliateLinks.propFirmId, firmId),
            eq(affiliateLinks.status, "active"),
            isNull(affiliateLinks.deletedAt),
          ),
        ),
    ]);

  return {
    platforms: new Map(platformRows.map((p) => [p.id, p])),
    instruments: new Map(instrumentRows.map((i) => [i.id, i])),
    rules: new Map(ruleRows.map((r) => [r.id, r])),
    activeAffiliateLinkIds: affiliateRows.map((a) => a.id),
  };
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
    // 1. Apply firm-level fields. Every column a draft can carry is written, so
    //    a field an admin edited cannot be silently discarded at publish.
    const d = draft?.firm;
    await tx
      .update(propFirms)
      .set({
        slug: view.slug,
        name: view.name,
        tagline: view.tagline,
        description: view.description,
        legalName: view.legalName,
        foundedYear: view.foundedYear,
        headquartersCountry: view.headquartersCountry,
        headquartersCity: view.headquartersCity,
        websiteUrl: view.websiteUrl,
        supportEmail: view.supportEmail,
        supportUrl: view.supportUrl,
        // Not part of the public view model, so read from the draft directly.
        ...(d?.logoMediaId !== undefined ? { logoMediaId: d.logoMediaId } : {}),
        ...(d?.coverMediaId !== undefined
          ? { coverMediaId: d.coverMediaId }
          : {}),
        ...(d?.brandColor !== undefined ? { brandColor: d.brandColor } : {}),
        ...(d?.isFeatured !== undefined ? { isFeatured: d.isFeatured } : {}),
        ...(d?.displayOrder !== undefined
          ? { displayOrder: d.displayOrder }
          : {}),
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

    // 1b. Materialise every child collection in the SAME transaction. Without
    //     this a challenge staged in a draft was validated, previewed, and then
    //     silently dropped at publish.
    if (draft) {
      await applyDraftChildren(tx, {
        firmId: firm.id,
        adminUserId: opts.adminUserId,
        draft,
      });
    }

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
