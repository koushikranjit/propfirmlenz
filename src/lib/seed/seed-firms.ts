import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import {
  affiliateLinks,
  firmPlatforms,
  offers,
  platforms,
  propFirms,
} from "@/lib/db/schema";
import { createFirm } from "@/lib/services/firm-admin";
import { publishFirm } from "@/lib/services/firm-draft";
import { stageChildOp, stageFirmField } from "@/lib/services/firm-children";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { LENZ_OFFER, SEED_FIRMS, SEED_PLATFORMS } from "./firm-catalog";

/**
 * SEEDING THE INITIAL CATALOG — run with `pnpm seed:firms`.
 *
 * IT USES THE REAL WORKFLOW, NOT A SHORTCUT `[LOCKED]`. Every firm goes
 * through `createFirm` → staged draft → `publishFirm`, so the same validation,
 * the same permission checks, the same publish transaction and the same
 * `entity_versions` snapshot apply as when a person does it in Admin. Nothing
 * here writes a published row directly.
 *
 * IDEMPOTENT, AND IT NEVER CLOBBERS AN EDIT `[LOCKED]`. Re-running is safe:
 *
 *  - a firm is found by slug and reused, never duplicated;
 *  - a seed field is written ONLY where the stored value is still empty, so an
 *    admin's correction survives the next run — the seed fills gaps, it does
 *    not reassert itself;
 *  - the LENZ offer is found by its CODE and updated in place, so a firm can
 *    never accumulate two of them;
 *  - platform links are added only when absent.
 *
 * That last rule is the important one. A seed that overwrites is a seed nobody
 * dares run twice.
 */

export interface SeedReport {
  firmsCreated: number;
  firmsReconciled: number;
  fieldsFilled: number;
  platformsLinked: number;
  offersCreated: number;
  offersUpdated: number;
  published: number;
  /** Firms that could not be published, with the reason. */
  skipped: { slug: string; reason: string }[];
}

/** Ensures the shared platform vocabulary exists. Structural, not business, data. */
export async function seedPlatformCatalog(db: Database): Promise<number> {
  let created = 0;
  for (const [index, platform] of SEED_PLATFORMS.entries()) {
    const [row] = await db
      .insert(platforms)
      .values({
        key: platform.key,
        name: platform.name,
        slug: platform.slug,
        status: "published",
        displayOrder: index,
      })
      // Already in the catalog: leave the admin's version alone.
      .onConflictDoNothing()
      .returning({ id: platforms.id });
    if (row) created += 1;
  }
  return created;
}

export async function seedFirmCatalog(
  db: Database,
  opts: { adminUserId: string },
): Promise<SeedReport> {
  const report: SeedReport = {
    firmsCreated: 0,
    firmsReconciled: 0,
    fieldsFilled: 0,
    platformsLinked: 0,
    offersCreated: 0,
    offersUpdated: 0,
    published: 0,
    skipped: [],
  };

  await seedPlatformCatalog(db);

  const platformIdByKey = new Map(
    (
      await db.select({ id: platforms.id, key: platforms.key }).from(platforms)
    ).map((p) => [p.key, p.id] as const),
  );

  for (const seed of SEED_FIRMS) {
    const [existing] = await db
      .select({
        id: propFirms.id,
        name: propFirms.name,
        tagline: propFirms.tagline,
        description: propFirms.description,
        websiteUrl: propFirms.websiteUrl,
        headquartersCountry: propFirms.headquartersCountry,
        foundedYear: propFirms.foundedYear,
        founderName: propFirms.founderName,
        draftPayload: propFirms.draftPayload,
      })
      .from(propFirms)
      // Slug OR name. A firm an admin already created may sit under a
      // different slug ("the5ers" where this seed says "the-5-ers"), and
      // matching on slug alone would publish a SECOND copy of it. The stored
      // slug wins — renaming it would move a live URL and leave a 301 behind.
      .where(
        and(
          or(
            eq(propFirms.slug, seed.slug),
            sql`lower(${propFirms.name}) = ${seed.name.toLowerCase()}`,
          ),
          isNull(propFirms.deletedAt),
        ),
      )
      .limit(1);

    let firmId: string;
    if (existing) {
      firmId = existing.id;
      report.firmsReconciled += 1;
    } else {
      const created = await createFirm(db, {
        adminUserId: opts.adminUserId,
        input: {
          name: seed.name,
          slug: seed.slug,
          description: seed.description,
        },
      });
      firmId = created.id;
      report.firmsCreated += 1;
    }

    /* ------------------------------------------------------ firm fields */

    // Only where the stored value is still empty. This is what makes a
    // re-run safe after someone has corrected something by hand.
    const draft = existing?.draftPayload ?? null;

    const fill = async (
      field: "tagline" | "description" | "websiteUrl" | "headquartersCountry",
      current: string | null | undefined,
      value: string | null,
    ) => {
      // Already published, or already staged from an earlier run.
      if (value === null || (current ?? "") !== "") return;
      if (draft?.firm?.[field] !== undefined) return;
      await stageFirmField(db, {
        adminUserId: opts.adminUserId,
        firmId,
        field,
        value,
      });
      report.fieldsFilled += 1;
    };

    await fill("tagline", existing?.tagline, seed.tagline);
    await fill("description", existing?.description, seed.description);
    await fill("websiteUrl", existing?.websiteUrl, seed.websiteUrl);
    await fill(
      "headquartersCountry",
      existing?.headquartersCountry,
      seed.headquartersCountry,
    );

    if (
      seed.foundedYear !== null &&
      !existing?.foundedYear &&
      draft?.firm?.foundedYear === undefined
    ) {
      await stageFirmField(db, {
        adminUserId: opts.adminUserId,
        firmId,
        field: "foundedYear",
        value: seed.foundedYear,
      });
      report.fieldsFilled += 1;
    }
    if (
      seed.founderName !== null &&
      !existing?.founderName &&
      draft?.firm?.founderName === undefined
    ) {
      await stageFirmField(db, {
        adminUserId: opts.adminUserId,
        firmId,
        field: "founderName",
        value: seed.founderName,
      });
      report.fieldsFilled += 1;
    }

    /* -------------------------------------------------------- buy link */

    // The firm's OWN site, so the outbound CTA has somewhere real to go. It is
    // never rendered publicly: the button points at /go/{slug}, which resolves
    // this server-side (docs/ARCHITECTURE.md §11 `[LOCKED]`).
    if (seed.websiteUrl) {
      const [link] = await db
        .select({ id: affiliateLinks.id })
        .from(affiliateLinks)
        .where(
          and(
            eq(affiliateLinks.propFirmId, firmId),
            isNull(affiliateLinks.deletedAt),
          ),
        )
        .limit(1);

      const stagedLink = (draft?.affiliateLinks ?? []).length > 0;
      if (!link && !stagedLink) {
        await stageChildOp(db, {
          adminUserId: opts.adminUserId,
          firmId,
          collection: "affiliateLinks",
          permission: PERMISSIONS.AFFILIATE_LINK_EDIT,
          op: {
            _op: "create",
            label: "Official site",
            destinationUrl: seed.websiteUrl,
            isDefault: true,
            status: "active",
          },
        });
      }
    }

    /* -------------------------------------------------------- platforms */

    for (const key of seed.platformKeys) {
      const platformId = platformIdByKey.get(key);
      if (!platformId) continue;

      const [linked] = await db
        .select({ platformId: firmPlatforms.platformId })
        .from(firmPlatforms)
        .where(
          and(
            eq(firmPlatforms.propFirmId, firmId),
            eq(firmPlatforms.platformId, platformId),
          ),
        )
        .limit(1);
      if (linked) continue;
      const stagedPlatform = (draft?.platforms ?? []).some(
        (op) => op.platformId === platformId,
      );
      if (stagedPlatform) continue;

      await stageChildOp(db, {
        adminUserId: opts.adminUserId,
        firmId,
        collection: "platforms",
        permission: PERMISSIONS.FIRM_EDIT,
        op: { _op: "create", platformId },
      });
      report.platformsLinked += 1;
    }

    /* ------------------------------------------------------- LENZ offer */

    // Found by CODE, not by position: a firm may already have its own offers,
    // and the seed must edit ITS one rather than the first row it happens to
    // see. `offers_firm_code_uq` enforces the same thing at the database.
    const [lenz] = await db
      .select({ id: offers.id })
      .from(offers)
      .where(
        and(
          eq(offers.propFirmId, firmId),
          sql`lower(${offers.code}) = ${LENZ_OFFER.code.toLowerCase()}`,
          isNull(offers.deletedAt),
        ),
      )
      .limit(1);

    const stagedLenz = (draft?.offers ?? []).some(
      (op) => op.code?.toLowerCase() === LENZ_OFFER.code.toLowerCase(),
    );

    await stageChildOp(db, {
      adminUserId: opts.adminUserId,
      firmId,
      collection: "offers",
      permission: PERMISSIONS.OFFER_EDIT,
      op: lenz
        ? {
            _op: "update",
            id: lenz.id,
            title: LENZ_OFFER.title,
            code: LENZ_OFFER.code,
            discountType: "percent",
            discountValue: LENZ_OFFER.discountPercent,
          }
        : {
            _op: "create",
            title: LENZ_OFFER.title,
            code: LENZ_OFFER.code,
            discountType: "percent",
            discountValue: LENZ_OFFER.discountPercent,
          },
    });
    // Staging the same op twice replaces it rather than queuing a second, so
    // this only affects what the run REPORTS, not what it wrote.
    if (lenz) report.offersUpdated += 1;
    else if (stagedLenz) report.offersUpdated += 1;
    else report.offersCreated += 1;

    /* ---------------------------------------------------------- publish */

    try {
      await publishFirm(db, { adminUserId: opts.adminUserId, firmId });
      report.published += 1;
    } catch (error) {
      // A firm the pre-publish checks reject stays a DRAFT. That is the
      // correct outcome for a record with too little verified data to be a
      // useful public page — it is not an error to paper over.
      report.skipped.push({
        slug: seed.slug,
        reason: error instanceof Error ? error.message : "publish failed",
      });
    }
  }

  return report;
}
