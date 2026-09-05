import type { DraftPayload } from "@/lib/validation/draft";
import { resolveCouponCode } from "@/lib/offers/coupon";
import {
  type FirmView,
  type FirmViewAnnouncement,
  type FirmViewChallenge,
  type FirmViewFaq,
  type FirmViewInstrument,
  type FirmViewOffer,
  type FirmViewPlatform,
  type FirmViewRule,
  deriveRuleState,
  yearsInOperation,
} from "@/lib/view/firm-view";

/**
 * The draft overlay — docs/ARCHITECTURE.md §21.3 `[LOCKED]`.
 *
 * PURE. No database, no clock beyond the `now` it is handed, no writes. Given
 * the published view and a draft, it returns what the public page WOULD look
 * like if that draft were published.
 *
 * Separated from `firm-draft.ts` so the overlay rules are unit-testable without
 * booting a database, and so "read the published rows" stays clearly distinct
 * from "decide what the draft means".
 *
 * Synthesised rows carry `draft:` ids. They are never written anywhere — the
 * real insert happens in `firm-publish-children.ts` from the ops, not from
 * this view.
 */

/** Catalog rows the draft references by id, resolved by the caller. */
export interface OverlayCatalog {
  platforms: Map<string, { id: string; name: string; slug: string }>;
  instruments: Map<
    string,
    { id: string; name: string; slug: string; assetClass: string }
  >;
  rules: Map<
    string,
    {
      id: string;
      key: string;
      label: string;
      category: string;
      description: string | null;
    }
  >;
  /** Ids of the firm's currently-active published affiliate links. */
  activeAffiliateLinkIds: string[];
  /**
   * The media row a staged `logoMediaId` points at, resolved by the caller.
   *
   * Without this the preview would keep showing the PUBLISHED logo after an
   * admin uploaded a new one — the staged id would be in the draft with
   * nothing to turn it into a URL (docs/ARCHITECTURE.md §21.3).
   */
  logoMedia: {
    id: string;
    url: string;
    alt: string;
    width: number | null;
    height: number | null;
  } | null;
}

export function overlayDraft(
  base: FirmView,
  draft: DraftPayload,
  catalog: OverlayCatalog,
  now: Date = new Date(),
): FirmView {
  return {
    ...base,
    ...overlayFirmFields(draft, catalog),
    challenges: overlayChallenges(base.challenges, draft),
    rules: overlayRules(base.rules, draft, catalog),
    platforms: overlayPlatforms(base.platforms, draft, catalog),
    instruments: overlayInstruments(base.instruments, draft, catalog),
    offers: overlayOffers(base.offers, draft, now),
    announcements: overlayAnnouncements(base.announcements, draft),
    faqs: overlayFaqs(base.faqs, draft),
    hasAffiliateLink: overlayAffiliate(draft, catalog),
  };
}

/* --------------------------------------------------------------- firm fields */

function overlayFirmFields(
  draft: DraftPayload,
  catalog: OverlayCatalog,
): Partial<FirmView> {
  const d = draft.firm;
  if (!d) return {};
  return {
    // Three distinct states, and they must stay distinct: field absent means
    // "unchanged", null means "the admin removed it", an id means "replaced".
    ...(d.logoMediaId === undefined
      ? {}
      : d.logoMediaId === null
        ? { logo: null }
        : catalog.logoMedia && catalog.logoMedia.id === d.logoMediaId
          ? {
              logo: {
                url: catalog.logoMedia.url,
                alt: catalog.logoMedia.alt,
                width: catalog.logoMedia.width,
                height: catalog.logoMedia.height,
              },
            }
          : // Staged against a media row that no longer resolves. Showing the
            // old logo would be a lie about what publishing would do.
            { logo: null }),
    // A draft may CLEAR these; `FirmView` types them as strings, so absence
    // becomes an empty string in the view and NULL again at publish. Letting
    // null through here put a null in a field typed string, which is how
    // publishing an empty firm used to crash.
    ...(d.slug !== undefined ? { slug: d.slug ?? "" } : {}),
    ...(d.name !== undefined ? { name: d.name ?? "" } : {}),
    ...(d.legalName !== undefined ? { legalName: d.legalName } : {}),
    ...(d.tagline !== undefined ? { tagline: d.tagline } : {}),
    ...(d.description !== undefined ? { description: d.description } : {}),
    ...(d.foundedYear !== undefined ? { foundedYear: d.foundedYear } : {}),
    // Both move together: the derived count must never lag the staged date.
    ...(d.foundedOn !== undefined
      ? {
          foundedOn: d.foundedOn,
          yearsInOperation: yearsInOperation(d.foundedOn),
        }
      : {}),
    ...(d.founderName !== undefined ? { founderName: d.founderName } : {}),
    ...(d.ceoName !== undefined ? { ceoName: d.ceoName } : {}),
    ...(d.trustpilotRating !== undefined
      ? {
          trustpilotRating:
            d.trustpilotRating === null ? null : d.trustpilotRating.toFixed(1),
        }
      : {}),
    ...(d.trustpilotUrl !== undefined
      ? { trustpilotUrl: d.trustpilotUrl }
      : {}),
    ...(d.headquartersCountry !== undefined
      ? { headquartersCountry: d.headquartersCountry }
      : {}),
    ...(d.headquartersCity !== undefined
      ? { headquartersCity: d.headquartersCity }
      : {}),
    ...(d.websiteUrl !== undefined ? { websiteUrl: d.websiteUrl } : {}),
    ...(d.supportEmail !== undefined ? { supportEmail: d.supportEmail } : {}),
    ...(d.supportUrl !== undefined ? { supportUrl: d.supportUrl } : {}),
    ...(d.payoutInfoUrl !== undefined
      ? { payoutInfoUrl: d.payoutInfoUrl }
      : {}),
  };
}

/* ---------------------------------------------------------------- challenges */

const pct = (v: number | null | undefined): string | null | undefined =>
  v === undefined ? undefined : v === null ? null : v.toFixed(3);

function overlayChallenges(
  published: FirmViewChallenge[],
  draft: DraftPayload,
): FirmViewChallenge[] {
  const byId = new Map(published.map((c) => [c.id, { ...c }]));

  for (const op of draft.challenges ?? []) {
    if (op._op === "delete") {
      if (op.id) byId.delete(op.id);
      continue;
    }

    const patch = {
      ...(op.name !== undefined ? { name: op.name } : {}),
      ...(op.slug !== undefined ? { slug: op.slug } : {}),
      ...(op.challengeType !== undefined
        ? { challengeType: op.challengeType }
        : {}),
      ...(op.accountSize !== undefined
        ? {
            accountSize: {
              amount: op.accountSize.amount.toFixed(2),
              currency: op.accountSize.currency,
            },
          }
        : {}),
      ...(op.price !== undefined
        ? {
            price:
              op.price === null
                ? null
                : {
                    amount: op.price.amount.toFixed(2),
                    currency: op.price.currency,
                  },
          }
        : {}),
      ...(op.profitTargetP1Pct !== undefined
        ? { profitTargetP1Pct: pct(op.profitTargetP1Pct) ?? null }
        : {}),
      ...(op.profitTargetP2Pct !== undefined
        ? { profitTargetP2Pct: pct(op.profitTargetP2Pct) ?? null }
        : {}),
      ...(op.profitTargetP3Pct !== undefined
        ? { profitTargetP3Pct: pct(op.profitTargetP3Pct) ?? null }
        : {}),
      ...(op.maxDailyLossPct !== undefined
        ? { maxDailyLossPct: pct(op.maxDailyLossPct) ?? null }
        : {}),
      ...(op.maxTotalDrawdownPct !== undefined
        ? { maxTotalDrawdownPct: pct(op.maxTotalDrawdownPct) ?? null }
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
        ? { profitSplitPct: pct(op.profitSplitPct) ?? null }
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
    };

    if (op._op === "update") {
      const existing = op.id ? byId.get(op.id) : undefined;
      if (existing && op.id) byId.set(op.id, { ...existing, ...patch });
      continue;
    }

    // Stable synthetic id so React keys and anchors survive preview reloads.
    const id = `draft:challenge:${op.slug ?? op.name ?? "new"}`;
    byId.set(id, {
      id,
      name: "",
      slug: "",
      challengeType: "other",
      accountSize: { amount: "0.00", currency: "USD" },
      price: null,
      profitTargetP1Pct: null,
      profitTargetP2Pct: null,
      profitTargetP3Pct: null,
      maxDailyLossPct: null,
      maxTotalDrawdownPct: null,
      drawdownType: null,
      drawdownBasis: null,
      minTradingDays: null,
      maxTradingDays: null,
      profitSplitPct: null,
      payoutFrequencyDays: null,
      firstPayoutDays: null,
      leverage: null,
      feeRefundable: null,
      hasScalingPlan: null,
      ...patch,
    });
  }

  return [...byId.values()];
}

/* --------------------------------------------------------------------- rules */

function overlayRules(
  published: FirmViewRule[],
  draft: DraftPayload,
  catalog: OverlayCatalog,
): FirmViewRule[] {
  const byId = new Map(published.map((r) => [r.id, { ...r }]));
  // A rule answered twice in one draft resolves to one row, keyed by rule.
  const byRuleId = new Map(published.map((r) => [r.key, r.id]));

  for (const op of draft.ruleValues ?? []) {
    // Only firm-scoped answers are rendered on the profile's rules section.
    if (op.scope !== "firm") continue;

    if (op._op === "delete") {
      if (op.id) byId.delete(op.id);
      continue;
    }

    const rule = catalog.rules.get(op.ruleId);
    if (!rule) continue; // An unknown rule id renders nothing, never a guess.

    const { state, detail } = deriveRuleState({
      valueBoolean: op.valueBoolean ?? null,
      valueNumeric:
        op.valueNumeric === null || op.valueNumeric === undefined
          ? null
          : op.valueNumeric.toFixed(4),
      valueText: op.valueText ?? null,
      note: op.note ?? null,
    });

    const id = op.id ?? byRuleId.get(rule.key) ?? `draft:rule:${rule.key}`;
    byId.set(id, {
      id,
      key: rule.key,
      label: rule.label,
      category: rule.category,
      description: rule.description,
      state,
      detail,
      note: op.note ?? null,
      sourceUrl: op.sourceUrl ?? null,
    });
  }

  return [...byId.values()];
}

/* ----------------------------------------------------------------- platforms */

function overlayPlatforms(
  published: FirmViewPlatform[],
  draft: DraftPayload,
  catalog: OverlayCatalog,
): FirmViewPlatform[] {
  const byId = new Map(published.map((p) => [p.id, { ...p }]));

  for (const op of draft.platforms ?? []) {
    if (op._op === "delete") {
      byId.delete(op.platformId);
      continue;
    }

    const platform = catalog.platforms.get(op.platformId);
    if (!platform) continue;

    const existing = byId.get(op.platformId);
    byId.set(op.platformId, {
      id: platform.id,
      name: platform.name,
      slug: platform.slug,
      isPrimary: op.isPrimary ?? existing?.isPrimary ?? false,
      notes: op.notes ?? existing?.notes ?? null,
    });
  }

  return [...byId.values()];
}

/* --------------------------------------------------------------- instruments */

function overlayInstruments(
  published: FirmViewInstrument[],
  draft: DraftPayload,
  catalog: OverlayCatalog,
): FirmViewInstrument[] {
  const byId = new Map(published.map((i) => [i.id, { ...i }]));

  for (const op of draft.instruments ?? []) {
    if (op._op === "delete") {
      byId.delete(op.instrumentId);
      continue;
    }

    const instrument = catalog.instruments.get(op.instrumentId);
    if (!instrument) continue;

    const existing = byId.get(op.instrumentId);
    byId.set(op.instrumentId, {
      id: instrument.id,
      name: instrument.name,
      slug: instrument.slug,
      assetClass: instrument.assetClass,
      // `false` is EXPLICITLY prohibited, so it is preserved rather than
      // collapsed into the default (docs/DATABASE.md §5.6).
      isAllowed: op.isAllowed ?? existing?.isAllowed ?? true,
      notes: op.notes ?? existing?.notes ?? null,
    });
  }

  return [...byId.values()];
}

/* ------------------------------------------------- announcements and FAQs */

function overlayAnnouncements(
  published: FirmViewAnnouncement[],
  draft: DraftPayload,
): FirmViewAnnouncement[] {
  const byId = new Map(published.map((a) => [a.id, { ...a }]));

  for (const op of draft.announcements ?? []) {
    if (op._op === "delete") {
      if (op.id) byId.delete(op.id);
      continue;
    }
    // An inactive announcement is not published, so preview must not show it.
    if (op.isActive === false) {
      if (op.id) byId.delete(op.id);
      continue;
    }

    const patch = {
      ...(op.title !== undefined ? { title: op.title } : {}),
      ...(op.body !== undefined ? { body: op.body } : {}),
      ...(op.linkUrl !== undefined ? { linkUrl: op.linkUrl } : {}),
      ...(op.announcedAt !== undefined ? { announcedAt: op.announcedAt } : {}),
    };

    if (op._op === "update") {
      const existing = op.id ? byId.get(op.id) : undefined;
      if (!existing || !op.id) continue;
      byId.set(op.id, { ...existing, ...patch });
      continue;
    }

    if (!op.title || !op.announcedAt) continue;
    const id = `draft:announcement:${op.title}`;
    byId.set(id, {
      id,
      title: op.title,
      body: null,
      linkUrl: null,
      announcedAt: op.announcedAt,
      ...patch,
    });
  }

  return [...byId.values()].sort((a, b) =>
    b.announcedAt.localeCompare(a.announcedAt),
  );
}

function overlayFaqs(
  published: FirmViewFaq[],
  draft: DraftPayload,
): FirmViewFaq[] {
  const byId = new Map(published.map((f) => [f.id, { ...f }]));
  const order = new Map<string, number>(published.map((f, i) => [f.id, i]));

  for (const op of draft.faqs ?? []) {
    if (op._op === "delete" || op.isActive === false) {
      if (op.id) byId.delete(op.id);
      continue;
    }

    const patch = {
      ...(op.question !== undefined ? { question: op.question } : {}),
      ...(op.answer !== undefined ? { answer: op.answer } : {}),
    };

    if (op._op === "update") {
      const existing = op.id ? byId.get(op.id) : undefined;
      if (!existing || !op.id) continue;
      byId.set(op.id, { ...existing, ...patch });
      if (op.displayOrder !== undefined) order.set(op.id, op.displayOrder);
      continue;
    }

    // Half an FAQ would render as a heading with nothing under it.
    if (!op.question || !op.answer) continue;
    const id = `draft:faq:${op.question}`;
    byId.set(id, { id, question: op.question, answer: op.answer, ...patch });
    order.set(id, op.displayOrder ?? order.size);
  }

  return [...byId.values()].sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  );
}

/* -------------------------------------------------------------------- offers */

/**
 * The published view already contains only offers whose window is open. A
 * drafted offer is held to the SAME rule: an offer starting next week does not
 * appear in preview, because it would not appear on the public page either.
 * Preview shows what the public would see, not what the admin typed.
 */
function isLive(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
  now: Date,
): boolean {
  if (startsAt && new Date(startsAt) > now) return false;
  if (endsAt && new Date(endsAt) <= now) return false;
  return true;
}

function overlayOffers(
  published: FirmViewOffer[],
  draft: DraftPayload,
  now: Date,
): FirmViewOffer[] {
  const byId = new Map(published.map((o) => [o.id, { ...o }]));

  for (const op of draft.offers ?? []) {
    if (op._op === "delete") {
      if (op.id) byId.delete(op.id);
      continue;
    }

    const patch = {
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
      ...(op.endsAt !== undefined ? { endsAt: op.endsAt } : {}),
    };

    if (op._op === "update") {
      const existing = op.id ? byId.get(op.id) : undefined;
      if (!existing || !op.id) continue;
      if (!isLive(op.startsAt, op.endsAt ?? existing.endsAt, now)) {
        byId.delete(op.id);
        continue;
      }
      byId.set(op.id, { ...existing, ...patch });
      continue;
    }

    if (!isLive(op.startsAt, op.endsAt, now)) continue;
    const id = `draft:offer:${op.title ?? "new"}`;
    byId.set(id, {
      id,
      title: "",
      description: null,
      terms: null,
      code: null,
      discountType: null,
      discountValue: null,
      discountCurrency: null,
      endsAt: null,
      ...patch,
    });
  }

  // Resolved on the way out, exactly as the published query does it, so the
  // preview shows the code the public page will show — including where a draft
  // cleared it back to nothing (CLAUDE.md §12.4f rule 34: the preview is not a
  // second implementation).
  return [...byId.values()].map((offer) => ({
    ...offer,
    code: resolveCouponCode(offer.code),
  }));
}

/* ---------------------------------------------------------------- affiliate */

/**
 * Whether a tracked CTA would render after publishing.
 *
 * Computed from the published active link ids plus the draft's ops, so pausing
 * or deleting the last link correctly turns the CTA off in preview. Only the
 * BOOLEAN is derived — the destination never enters the view model at all
 * (docs/ARCHITECTURE.md §11 `[LOCKED]`).
 */
function overlayAffiliate(
  draft: DraftPayload,
  catalog: OverlayCatalog,
): boolean {
  const active = new Set(catalog.activeAffiliateLinkIds);

  for (const [index, op] of (draft.affiliateLinks ?? []).entries()) {
    if (op._op === "delete") {
      if (op.id) active.delete(op.id);
      continue;
    }
    if (op._op === "update") {
      if (!op.id) continue;
      if (op.status !== undefined && op.status !== "active")
        active.delete(op.id);
      else if (op.status === "active") active.add(op.id);
      continue;
    }
    if ((op.status ?? "active") === "active") {
      active.add(`draft:affiliate:${index}`);
    }
  }

  return active.size > 0;
}
