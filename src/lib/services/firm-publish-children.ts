import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import {
  affiliateLinks,
  challenges,
  firmInstruments,
  firmPlatforms,
  firmAnnouncements,
  firmFaqs,
  offers,
  ruleValues,
  seoMetadata,
} from "@/lib/db/schema";
import type { DraftPayload } from "@/lib/validation/draft";

/**
 * Materialises a draft's CHILD collections into real rows — docs/ADMIN.md §7
 * rule 6, docs/DATABASE.md §3.2.1 `[LOCKED]`.
 *
 * Called from inside `publishFirm`'s transaction and nowhere else. Every write
 * here shares that transaction, so a failure on the last offer rolls back the
 * first challenge: there is no partially-published state.
 *
 * WHY THE OPS, NOT THE VIEW `[LOCKED]`
 *
 * Publishing applies the draft's `_op` entries directly to the tables rather
 * than writing back the materialised `FirmView`. The view is a PRESENTATION
 * model — it collapses a rule's `value_boolean` / `value_numeric` /
 * `value_text` into a single display state, so publishing from it would lose
 * which column the answer actually lives in. The view stays the thing an admin
 * previews and the thing a version snapshot records; the ops stay the thing
 * that gets written.
 *
 * DELETES ARE SOFT wherever the table supports it (`deleted_at`), so an
 * accidental publish is recoverable. Association tables (`firm_platforms`,
 * `firm_instruments`) have no soft-delete column and no history worth keeping —
 * they are pure join rows — so a removal there is a real delete.
 */

/** The subset of the draft this module owns. */
type ChildDraft = Pick<
  DraftPayload,
  | "challenges"
  | "ruleValues"
  | "platforms"
  | "instruments"
  | "offers"
  | "affiliateLinks"
  | "announcements"
  | "faqs"
  | "seo"
>;

export interface ApplyChildrenResult {
  challenges: number;
  ruleValues: number;
  platforms: number;
  instruments: number;
  offers: number;
  affiliateLinks: number;
  announcements: number;
  faqs: number;
  seo: boolean;
}

/** `numeric` money: an exact decimal string, never a float (docs/DATABASE.md §1.3). */
function money(amount: number): string {
  return amount.toFixed(2);
}

/** `numeric` percentage, at the column's scale of 3. */
function pct(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toFixed(3);
}

function toDate(iso: string | null | undefined): Date | null {
  return iso ? new Date(iso) : null;
}

export async function applyDraftChildren(
  tx: Database,
  opts: { firmId: string; adminUserId: string; draft: ChildDraft },
): Promise<ApplyChildrenResult> {
  const { firmId, adminUserId, draft } = opts;
  const now = new Date();

  const result: ApplyChildrenResult = {
    challenges: 0,
    ruleValues: 0,
    platforms: 0,
    instruments: 0,
    offers: 0,
    affiliateLinks: 0,
    announcements: 0,
    faqs: 0,
    seo: false,
  };

  /* ------------------------------------------------------------ challenges */
  for (const op of draft.challenges ?? []) {
    if (op._op === "delete") {
      if (!op.id) continue;
      // Soft delete: the row stays for history and for any click already
      // attributed to it (docs/DATABASE.md §1.2).
      await tx
        .update(challenges)
        .set({ deletedAt: now, updatedByAdminId: adminUserId })
        .where(
          and(eq(challenges.id, op.id), eq(challenges.propFirmId, firmId)),
        );
      result.challenges += 1;
      continue;
    }

    const fields = {
      ...(op.name !== undefined ? { name: op.name } : {}),
      ...(op.slug !== undefined ? { slug: op.slug } : {}),
      ...(op.challengeType !== undefined
        ? { challengeType: op.challengeType }
        : {}),
      ...(op.accountSize !== undefined
        ? {
            accountSize: money(op.accountSize.amount),
            accountCurrency: op.accountSize.currency,
          }
        : {}),
      ...(op.price !== undefined
        ? op.price === null
          ? { price: null, priceCurrency: null }
          : {
              price: money(op.price.amount),
              priceCurrency: op.price.currency,
            }
        : {}),
      ...(op.profitTargetP1Pct !== undefined
        ? { profitTargetP1Pct: pct(op.profitTargetP1Pct) }
        : {}),
      ...(op.profitTargetP2Pct !== undefined
        ? { profitTargetP2Pct: pct(op.profitTargetP2Pct) }
        : {}),
      ...(op.profitTargetP3Pct !== undefined
        ? { profitTargetP3Pct: pct(op.profitTargetP3Pct) }
        : {}),
      ...(op.maxDailyLossPct !== undefined
        ? { maxDailyLossPct: pct(op.maxDailyLossPct) }
        : {}),
      ...(op.maxTotalDrawdownPct !== undefined
        ? { maxTotalDrawdownPct: pct(op.maxTotalDrawdownPct) }
        : {}),
      ...(op.drawdownType !== undefined
        ? { drawdownType: op.drawdownType }
        : {}),
      ...(op.drawdownBasis !== undefined
        ? { drawdownBasis: op.drawdownBasis }
        : {}),
      ...(op.minTradingDays !== undefined
        ? { minTradingDays: op.minTradingDays }
        : {}),
      ...(op.maxTradingDays !== undefined
        ? { maxTradingDays: op.maxTradingDays }
        : {}),
      ...(op.profitSplitPct !== undefined
        ? { profitSplitPct: pct(op.profitSplitPct) }
        : {}),
      ...(op.payoutFrequencyDays !== undefined
        ? { payoutFrequencyDays: op.payoutFrequencyDays }
        : {}),
      ...(op.firstPayoutDays !== undefined
        ? { firstPayoutDays: op.firstPayoutDays }
        : {}),
      ...(op.leverage !== undefined ? { leverage: op.leverage } : {}),
      ...(op.feeRefundable !== undefined
        ? { feeRefundable: op.feeRefundable }
        : {}),
      ...(op.hasScalingPlan !== undefined
        ? { hasScalingPlan: op.hasScalingPlan }
        : {}),
      ...(op.displayOrder !== undefined
        ? { displayOrder: op.displayOrder }
        : {}),
    };

    if (op._op === "update") {
      if (!op.id) continue;
      await tx
        .update(challenges)
        .set({ ...fields, updatedByAdminId: adminUserId })
        .where(
          and(eq(challenges.id, op.id), eq(challenges.propFirmId, firmId)),
        );
      result.challenges += 1;
      continue;
    }

    // create — the NOT NULL columns are required by the schema, and the draft
    // schema has already refused anything that cannot satisfy them.
    if (!op.name || !op.slug || !op.accountSize) continue;
    await tx.insert(challenges).values({
      propFirmId: firmId,
      name: op.name,
      slug: op.slug,
      challengeType: op.challengeType ?? "other",
      accountSize: money(op.accountSize.amount),
      accountCurrency: op.accountSize.currency,
      status: "published",
      createdByAdminId: adminUserId,
      updatedByAdminId: adminUserId,
      ...fields,
    });
    result.challenges += 1;
  }

  /* ----------------------------------------------------------- rule values */
  for (const op of draft.ruleValues ?? []) {
    if (op._op === "delete") {
      if (!op.id) continue;
      // `rule_values` has no soft-delete column: a rule answer is a current
      // fact, and its history lives in the firm's version snapshots.
      await tx
        .delete(ruleValues)
        .where(
          and(eq(ruleValues.id, op.id), eq(ruleValues.propFirmId, firmId)),
        );
      result.ruleValues += 1;
      continue;
    }

    const values = {
      ...(op.valueBoolean !== undefined
        ? { valueBoolean: op.valueBoolean }
        : {}),
      ...(op.valueNumeric !== undefined
        ? {
            valueNumeric:
              op.valueNumeric === null ? null : op.valueNumeric.toFixed(4),
          }
        : {}),
      ...(op.valueText !== undefined ? { valueText: op.valueText } : {}),
      ...(op.note !== undefined ? { note: op.note } : {}),
      ...(op.sourceUrl !== undefined ? { sourceUrl: op.sourceUrl } : {}),
    };

    if (op._op === "update") {
      if (!op.id) continue;
      await tx
        .update(ruleValues)
        .set(values)
        .where(
          and(eq(ruleValues.id, op.id), eq(ruleValues.propFirmId, firmId)),
        );
      result.ruleValues += 1;
      continue;
    }

    await tx.insert(ruleValues).values({
      ruleId: op.ruleId,
      scope: op.scope,
      propFirmId: firmId,
      challengeId: op.challengeId ?? null,
      createdByAdminId: adminUserId,
      // A create for a rule already answered replaces that answer rather than
      // violating `rule_values_firm_uq`.
      valueBoolean: null,
      valueNumeric: null,
      valueText: null,
      ...values,
    });
    result.ruleValues += 1;
  }

  /* -------------------------------------------------- platform associations */
  for (const op of draft.platforms ?? []) {
    if (op._op === "delete") {
      await tx
        .delete(firmPlatforms)
        .where(
          and(
            eq(firmPlatforms.propFirmId, firmId),
            eq(firmPlatforms.platformId, op.platformId),
          ),
        );
      result.platforms += 1;
      continue;
    }

    const row = {
      isPrimary: op.isPrimary ?? false,
      notes: op.notes ?? null,
    };
    // A join row has a composite primary key, so create and update are the
    // same intent: "this firm supports this platform, with these notes".
    await tx
      .insert(firmPlatforms)
      .values({ propFirmId: firmId, platformId: op.platformId, ...row })
      .onConflictDoUpdate({
        target: [firmPlatforms.propFirmId, firmPlatforms.platformId],
        set: row,
      });
    result.platforms += 1;
  }

  /* ------------------------------------------------ instrument associations */
  for (const op of draft.instruments ?? []) {
    if (op._op === "delete") {
      await tx
        .delete(firmInstruments)
        .where(
          and(
            eq(firmInstruments.propFirmId, firmId),
            eq(firmInstruments.instrumentId, op.instrumentId),
          ),
        );
      result.instruments += 1;
      continue;
    }

    const row = {
      // `false` means EXPLICITLY prohibited, which is different information
      // from having no row at all — so the default cannot be `false`.
      isAllowed: op.isAllowed ?? true,
      notes: op.notes ?? null,
    };
    await tx
      .insert(firmInstruments)
      .values({ propFirmId: firmId, instrumentId: op.instrumentId, ...row })
      .onConflictDoUpdate({
        target: [firmInstruments.propFirmId, firmInstruments.instrumentId],
        set: row,
      });
    result.instruments += 1;
  }

  /* ---------------------------------------------------------------- offers */
  for (const op of draft.offers ?? []) {
    if (op._op === "delete") {
      if (!op.id) continue;
      await tx
        .update(offers)
        .set({ deletedAt: now })
        .where(and(eq(offers.id, op.id), eq(offers.propFirmId, firmId)));
      result.offers += 1;
      continue;
    }

    const fields = {
      ...(op.affiliateLinkId !== undefined
        ? { affiliateLinkId: op.affiliateLinkId }
        : {}),
      ...(op.title !== undefined ? { title: op.title } : {}),
      ...(op.description !== undefined ? { description: op.description } : {}),
      ...(op.terms !== undefined ? { terms: op.terms } : {}),
      ...(op.code !== undefined ? { code: op.code } : {}),
      ...(op.discountType !== undefined
        ? { discountType: op.discountType }
        : {}),
      ...(op.discountValue !== undefined
        ? {
            discountValue:
              op.discountValue === null ? null : op.discountValue.toFixed(2),
          }
        : {}),
      ...(op.discountCurrency !== undefined
        ? { discountCurrency: op.discountCurrency }
        : {}),
      // Stored as timestamptz: the instant is absolute, so an offer window
      // means the same thing in every reader's timezone.
      ...(op.startsAt !== undefined ? { startsAt: toDate(op.startsAt) } : {}),
      ...(op.endsAt !== undefined ? { endsAt: toDate(op.endsAt) } : {}),
      ...(op.displayOrder !== undefined
        ? { displayOrder: op.displayOrder }
        : {}),
    };

    if (op._op === "update") {
      if (!op.id) continue;
      await tx
        .update(offers)
        .set(fields)
        .where(and(eq(offers.id, op.id), eq(offers.propFirmId, firmId)));
      result.offers += 1;
      continue;
    }

    if (!op.title) continue;
    await tx.insert(offers).values({
      propFirmId: firmId,
      title: op.title,
      status: "published",
      createdByAdminId: adminUserId,
      ...fields,
    });
    result.offers += 1;
  }

  /* -------------------------------------------------------- affiliate links */
  for (const op of draft.affiliateLinks ?? []) {
    if (op._op === "delete") {
      if (!op.id) continue;
      // Soft delete: `affiliate_clicks` references the link with RESTRICT, and
      // click history must survive the link being retired.
      await tx
        .update(affiliateLinks)
        .set({ deletedAt: now, status: "archived", isDefault: false })
        .where(
          and(
            eq(affiliateLinks.id, op.id),
            eq(affiliateLinks.propFirmId, firmId),
          ),
        );
      result.affiliateLinks += 1;
      continue;
    }

    // At most one active default per firm is enforced by a partial unique
    // index. Clearing the previous default first turns a constraint violation
    // into the intended "promote this one" behaviour.
    if (op.isDefault) {
      await tx
        .update(affiliateLinks)
        .set({ isDefault: false })
        .where(
          and(
            eq(affiliateLinks.propFirmId, firmId),
            eq(affiliateLinks.isDefault, true),
            isNull(affiliateLinks.deletedAt),
          ),
        );
    }

    const fields = {
      ...(op.label !== undefined ? { label: op.label } : {}),
      ...(op.destinationUrl !== undefined
        ? { destinationUrl: op.destinationUrl }
        : {}),
      ...(op.network !== undefined ? { network: op.network } : {}),
      ...(op.campaign !== undefined ? { campaign: op.campaign } : {}),
      ...(op.isDefault !== undefined ? { isDefault: op.isDefault } : {}),
      ...(op.status !== undefined ? { status: op.status } : {}),
      ...(op.startsAt !== undefined ? { startsAt: toDate(op.startsAt) } : {}),
      ...(op.endsAt !== undefined ? { endsAt: toDate(op.endsAt) } : {}),
    };

    if (op._op === "update") {
      if (!op.id) continue;
      await tx
        .update(affiliateLinks)
        .set(fields)
        .where(
          and(
            eq(affiliateLinks.id, op.id),
            eq(affiliateLinks.propFirmId, firmId),
          ),
        );
      result.affiliateLinks += 1;
      continue;
    }

    if (!op.label || !op.destinationUrl) continue;
    await tx.insert(affiliateLinks).values({
      propFirmId: firmId,
      label: op.label,
      destinationUrl: op.destinationUrl,
      status: op.status ?? "active",
      createdByAdminId: adminUserId,
      ...fields,
    });
    result.affiliateLinks += 1;
  }

  /* --------------------------------------------------------- announcements */
  for (const op of draft.announcements ?? []) {
    if (op._op === "delete") {
      if (!op.id) continue;
      await tx
        .update(firmAnnouncements)
        .set({ deletedAt: now })
        .where(
          and(
            eq(firmAnnouncements.id, op.id),
            eq(firmAnnouncements.propFirmId, firmId),
          ),
        );
      result.announcements += 1;
      continue;
    }

    const fields = {
      ...(op.title !== undefined ? { title: op.title } : {}),
      ...(op.body !== undefined ? { body: op.body } : {}),
      ...(op.linkUrl !== undefined ? { linkUrl: op.linkUrl } : {}),
      ...(op.announcedAt !== undefined
        ? { announcedAt: new Date(op.announcedAt) }
        : {}),
      ...(op.isActive !== undefined ? { isActive: op.isActive } : {}),
      ...(op.displayOrder !== undefined
        ? { displayOrder: op.displayOrder }
        : {}),
    };

    if (op._op === "update") {
      if (!op.id) continue;
      await tx
        .update(firmAnnouncements)
        .set(fields)
        .where(
          and(
            eq(firmAnnouncements.id, op.id),
            eq(firmAnnouncements.propFirmId, firmId),
          ),
        );
      result.announcements += 1;
      continue;
    }

    // A create without a title or a date is not an announcement; the draft
    // schema refuses it, and this is the second line of that same defence.
    if (!op.title || !op.announcedAt) continue;
    await tx.insert(firmAnnouncements).values({
      propFirmId: firmId,
      title: op.title,
      announcedAt: new Date(op.announcedAt),
      ...fields,
    });
    result.announcements += 1;
  }

  /* ------------------------------------------------------------------ FAQs */
  for (const op of draft.faqs ?? []) {
    if (op._op === "delete") {
      if (!op.id) continue;
      await tx
        .update(firmFaqs)
        .set({ deletedAt: now })
        .where(and(eq(firmFaqs.id, op.id), eq(firmFaqs.propFirmId, firmId)));
      result.faqs += 1;
      continue;
    }

    const fields = {
      ...(op.question !== undefined ? { question: op.question } : {}),
      ...(op.answer !== undefined ? { answer: op.answer } : {}),
      ...(op.isActive !== undefined ? { isActive: op.isActive } : {}),
      ...(op.displayOrder !== undefined
        ? { displayOrder: op.displayOrder }
        : {}),
    };

    if (op._op === "update") {
      if (!op.id) continue;
      await tx
        .update(firmFaqs)
        .set(fields)
        .where(and(eq(firmFaqs.id, op.id), eq(firmFaqs.propFirmId, firmId)));
      result.faqs += 1;
      continue;
    }

    // Half an FAQ renders as a heading with nothing under it.
    if (!op.question || !op.answer) continue;
    await tx.insert(firmFaqs).values({
      propFirmId: firmId,
      question: op.question,
      answer: op.answer,
      ...fields,
    });
    result.faqs += 1;
  }

  /* ------------------------------------------------------------------- SEO */
  if (draft.seo && Object.keys(draft.seo).length > 0) {
    const seo = draft.seo;
    const fields = {
      ...(seo.title !== undefined ? { title: seo.title } : {}),
      ...(seo.metaDescription !== undefined
        ? { metaDescription: seo.metaDescription }
        : {}),
      ...(seo.canonicalUrl !== undefined
        ? { canonicalUrl: seo.canonicalUrl }
        : {}),
      ...(seo.ogTitle !== undefined ? { ogTitle: seo.ogTitle } : {}),
      ...(seo.ogDescription !== undefined
        ? { ogDescription: seo.ogDescription }
        : {}),
      ...(seo.ogImageMediaId !== undefined
        ? { ogImageMediaId: seo.ogImageMediaId }
        : {}),
      ...(seo.twitterCard !== undefined
        ? { twitterCard: seo.twitterCard }
        : {}),
      ...(seo.robotsIndex !== undefined
        ? { robotsIndex: seo.robotsIndex }
        : {}),
      ...(seo.robotsFollow !== undefined
        ? { robotsFollow: seo.robotsFollow }
        : {}),
      ...(seo.includeInSitemap !== undefined
        ? { includeInSitemap: seo.includeInSitemap }
        : {}),
      ...(seo.keywords !== undefined ? { keywords: seo.keywords } : {}),
      updatedByAdminId: adminUserId,
    };

    // `structured_data_override` is deliberately NEVER written here. An
    // admin-supplied JSON-LD blob must be validated against a schema shape
    // before it can be emitted (docs/SEO.md §11 rule 4), and no such validator
    // exists yet — so the column stays unreachable from the editor.
    await tx
      .insert(seoMetadata)
      .values({ entityType: "prop_firm", entityId: firmId, ...fields })
      .onConflictDoUpdate({
        target: [seoMetadata.entityType, seoMetadata.entityId],
        // `seo_entity_uq` is a PARTIAL index (`where entity_id is not null`),
        // because a row may instead target a static route path. Postgres
        // matches a partial index only when the conflict target repeats its
        // predicate; without this the statement fails with "no unique or
        // exclusion constraint matching the ON CONFLICT specification".
        targetWhere: isNotNull(seoMetadata.entityId),
        set: fields,
      });
    result.seo = true;
  }

  return result;
}
