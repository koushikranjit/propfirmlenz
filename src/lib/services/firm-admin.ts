import { and, eq, isNull, ne } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import { auditLogs, propFirms, redirects } from "@/lib/db/schema";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import {
  type DraftPayload,
  draftPayloadSchema,
  emptyDraft,
} from "@/lib/validation/draft";
import type { CreateFirmInput, EditFirmInput } from "@/lib/validation/firm";
import { NotFoundError, getCurrentVersion } from "./firm-draft";

/**
 * Admin firm creation and draft editing.
 *
 * This module deliberately does NOT re-implement draft, publish, rollback or
 * soft-delete logic — those live in `firm-draft.ts` and remain the single
 * source of truth (docs/CLAUDE.md §2). It only adds creation and the mapping
 * from an edit form to a draft payload.
 */

export class SlugConflictError extends Error {
  readonly code = "SLUG_CONFLICT";
  constructor(readonly slug: string) {
    super(`The slug "${slug}" is already in use.`);
    this.name = "SlugConflictError";
  }
}

/**
 * Checks a slug against BOTH live firms and active redirects.
 *
 * A new firm must not claim a URL that already redirects elsewhere — that is a
 * cross-table rule, so it lives in the service rather than as a DB constraint
 * (docs/DATABASE.md §3.3).
 */
export async function assertSlugAvailable(
  db: Database,
  slug: string,
  exceptFirmId?: string,
): Promise<void> {
  const firmFilters = [eq(propFirms.slug, slug), isNull(propFirms.deletedAt)];
  if (exceptFirmId) firmFilters.push(ne(propFirms.id, exceptFirmId));

  const clash = await db
    .select({ id: propFirms.id })
    .from(propFirms)
    .where(and(...firmFilters))
    .limit(1);
  if (clash.length > 0) throw new SlugConflictError(slug);

  const redirected = await db
    .select({ id: redirects.id })
    .from(redirects)
    .where(
      and(
        eq(redirects.fromPath, `/prop-firms/${slug}`),
        eq(redirects.isActive, true),
      ),
    )
    .limit(1);
  if (redirected.length > 0) throw new SlugConflictError(slug);
}

/**
 * Creates a firm as an UNPUBLISHED draft.
 *
 * Before first publish the columns ARE the working state and `draft_payload`
 * stays NULL — there is no live version to protect yet, and the Prop List needs
 * name and slug in queryable columns (docs/DATABASE.md §3.2.1 rule 5).
 *
 * No business facts are invented: everything except name and slug starts NULL,
 * and the UI renders "Not specified".
 */
export async function createFirm(
  db: Database,
  opts: { adminUserId: string; input: CreateFirmInput },
): Promise<{ id: string }> {
  await requirePermission(db, opts.adminUserId, PERMISSIONS.FIRM_CREATE);
  await assertSlugAvailable(db, opts.input.slug);

  const [row] = await db
    .insert(propFirms)
    .values({
      name: opts.input.name,
      slug: opts.input.slug,
      description: opts.input.description,
      status: "draft",
      createdByAdminId: opts.adminUserId,
      updatedByAdminId: opts.adminUserId,
    })
    .returning({ id: propFirms.id });

  if (!row) throw new Error("Failed to create firm");

  await db.insert(auditLogs).values({
    actorType: "admin",
    actorAdminId: opts.adminUserId,
    action: "firm.created",
    entityType: "prop_firm",
    entityId: row.id,
    after: { name: opts.input.name, slug: opts.input.slug },
  });

  return { id: row.id };
}

/**
 * Applies an edit form.
 *
 * Two paths, both correct per docs/DATABASE.md §3.2.1:
 *
 *  - NEVER PUBLISHED (status = 'draft', no live version): the columns are the
 *    working state, so the edit is written directly. Nothing is public.
 *  - PUBLISHED: the edit goes into `draft_payload`. Published columns are NOT
 *    touched, and `updated_at` is preserved so sitemap lastmod does not move
 *    for a change the public cannot see.
 */
export async function saveFirmEdits(
  db: Database,
  opts: { adminUserId: string; firmId: string; input: EditFirmInput },
): Promise<{ mode: "direct" | "draft"; pendingChanges: number }> {
  await requirePermission(db, opts.adminUserId, PERMISSIONS.FIRM_EDIT);

  const rows = await db
    .select()
    .from(propFirms)
    .where(and(eq(propFirms.id, opts.firmId), isNull(propFirms.deletedAt)))
    .limit(1);
  const firm = rows[0];
  if (!firm) throw new NotFoundError("Firm");

  await assertSlugAvailable(db, opts.input.slug, firm.id);

  const currentVersion = await getCurrentVersion(db, firm.id);
  const neverPublished = firm.publishedAt === null && currentVersion === 0;

  if (neverPublished) {
    await db
      .update(propFirms)
      .set({
        ...(opts.input.name !== undefined ? { name: opts.input.name } : {}),
        slug: opts.input.slug,
        ...(opts.input.tagline !== undefined
          ? { tagline: opts.input.tagline }
          : {}),
        ...(opts.input.description !== undefined
          ? { description: opts.input.description }
          : {}),
        legalName: opts.input.legalName,
        foundedYear: opts.input.foundedYear,
        headquartersCountry: opts.input.headquartersCountry,
        headquartersCity: opts.input.headquartersCity,
        websiteUrl: opts.input.websiteUrl,
        supportEmail: opts.input.supportEmail,
        supportUrl: opts.input.supportUrl,
        brandColor: opts.input.brandColor,
        ...(opts.input.logoMediaId !== undefined
          ? { logoMediaId: opts.input.logoMediaId }
          : {}),
        ...(opts.input.coverMediaId !== undefined
          ? { coverMediaId: opts.input.coverMediaId }
          : {}),
        ...(opts.input.isFeatured !== undefined
          ? { isFeatured: opts.input.isFeatured }
          : {}),
        ...(opts.input.displayOrder !== undefined
          ? { displayOrder: opts.input.displayOrder }
          : {}),
        updatedByAdminId: opts.adminUserId,
      })
      .where(eq(propFirms.id, firm.id));

    await db.insert(auditLogs).values({
      actorType: "admin",
      actorAdminId: opts.adminUserId,
      action: "firm.updated",
      entityType: "prop_firm",
      entityId: firm.id,
    });

    return { mode: "direct", pendingChanges: 0 };
  }

  // Published: build a draft payload containing only the changed fields.
  const existing = firm.draftPayload;
  const base: DraftPayload =
    existing ?? emptyDraft(currentVersion, opts.adminUserId);

  const payload: DraftPayload = draftPayloadSchema.parse({
    ...base,
    baseVersion: currentVersion,
    updatedAt: new Date().toISOString(),
    updatedByAdminId: opts.adminUserId,
    firm: {
      ...(base.firm ?? {}),
      ...(opts.input.name !== undefined ? { name: opts.input.name } : {}),
      slug: opts.input.slug,
      ...(opts.input.tagline !== undefined
        ? { tagline: opts.input.tagline }
        : {}),
      ...(opts.input.description !== undefined
        ? { description: opts.input.description }
        : {}),
      legalName: opts.input.legalName,
      foundedYear: opts.input.foundedYear,
      headquartersCountry: opts.input.headquartersCountry,
      headquartersCity: opts.input.headquartersCity,
      websiteUrl: opts.input.websiteUrl,
      supportEmail: opts.input.supportEmail,
      supportUrl: opts.input.supportUrl,
      brandColor: opts.input.brandColor,
      ...(opts.input.logoMediaId !== undefined
        ? { logoMediaId: opts.input.logoMediaId }
        : {}),
      ...(opts.input.coverMediaId !== undefined
        ? { coverMediaId: opts.input.coverMediaId }
        : {}),
      ...(opts.input.isFeatured !== undefined
        ? { isFeatured: opts.input.isFeatured }
        : {}),
      ...(opts.input.displayOrder !== undefined
        ? { displayOrder: opts.input.displayOrder }
        : {}),
    },
  });

  await db
    .update(propFirms)
    .set({
      draftPayload: payload,
      // Preserved: a draft save must not move sitemap lastmod
      // (docs/ADMIN.md §7A.1, docs/SEO.md §14).
      updatedAt: firm.updatedAt,
    })
    .where(eq(propFirms.id, firm.id));

  await db.insert(auditLogs).values({
    actorType: "admin",
    actorAdminId: opts.adminUserId,
    action: "firm.draft_saved",
    entityType: "prop_firm",
    entityId: firm.id,
  });

  return {
    mode: "draft",
    pendingChanges: Object.keys(payload.firm ?? {}).length,
  };
}

/** Verification is separable from editing by design (docs/ADMIN.md §8). */
export async function verifyFirm(
  db: Database,
  opts: { adminUserId: string; firmId: string },
): Promise<void> {
  await requirePermission(db, opts.adminUserId, PERMISSIONS.FIRM_VERIFY);

  await db
    .update(propFirms)
    .set({
      verificationStatus: "verified",
      verifiedAt: new Date(),
      verifiedByAdminId: opts.adminUserId,
    })
    .where(and(eq(propFirms.id, opts.firmId), isNull(propFirms.deletedAt)));

  await db.insert(auditLogs).values({
    actorType: "admin",
    actorAdminId: opts.adminUserId,
    action: "firm.verified",
    entityType: "prop_firm",
    entityId: opts.firmId,
  });
}
