/**
 * The canonical firm view model — docs/ARCHITECTURE.md §21.2 `[LOCKED]`.
 *
 * THE TYPE IS THE CONTRACT. `getPublishedFirmView()` and `materializeDraft()`
 * both return exactly this type, so the public page and the admin preview
 * render the SAME `FirmProfile` component. Adding a field to the view without
 * supplying it from the draft materialiser is a COMPILE ERROR, not a silent
 * visual difference.
 *
 * Two deliberate omissions:
 *
 *  1. NO `draftPayload`, and no admin-only field (status, completeness,
 *     internal notes, audit trail, verification actor). A leak would be a
 *     compile error because the field simply does not exist here.
 *  2. NO affiliate destination URL. Only `hasAffiliateLink` — a boolean. The
 *     real destination is resolved server-side behind `/go/{slug}`, so the raw
 *     partner URL never reaches the browser (docs/ARCHITECTURE.md §11).
 *
 * Dates are ISO strings so the view crosses the server/client boundary
 * unchanged and both producers agree byte-for-byte.
 */

/** An image already resolved to a public URL, with its required alt text. */
export interface FirmViewImage {
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
}

/** Money always travels with its own source currency — never converted. */
export interface FirmViewMoney {
  amount: string;
  currency: string;
}

export interface FirmViewChallenge {
  id: string;
  name: string;
  slug: string;
  challengeType: string;
  accountSize: FirmViewMoney;
  /** null = not disclosed. Never rendered as 0. */
  price: FirmViewMoney | null;
  profitTargetP1Pct: string | null;
  profitTargetP2Pct: string | null;
  profitTargetP3Pct: string | null;
  maxDailyLossPct: string | null;
  maxTotalDrawdownPct: string | null;
  drawdownType: string | null;
  drawdownBasis: string | null;
  minTradingDays: number | null;
  /** null means UNLIMITED — the UI must say so, never render 0. */
  maxTradingDays: number | null;
  profitSplitPct: string | null;
  payoutFrequencyDays: number | null;
  firstPayoutDays: number | null;
  leverage: string | null;
  feeRefundable: boolean | null;
  hasScalingPlan: boolean | null;
}

export interface FirmViewPlatform {
  id: string;
  name: string;
  slug: string;
  isPrimary: boolean;
  notes: string | null;
}

export interface FirmViewInstrument {
  id: string;
  name: string;
  slug: string;
  assetClass: string;
  /** false = EXPLICITLY prohibited, which differs from "no row at all". */
  isAllowed: boolean;
  notes: string | null;
}

/**
 * The four documented rule states. "not_specified" is a first-class answer, not
 * a missing value (docs/PROJECT.md §6.5 `[LOCKED]`).
 */
export type RuleState =
  "allowed" | "not_allowed" | "allowed_with_conditions" | "not_specified";

export interface FirmViewRule {
  id: string;
  key: string;
  label: string;
  category: string;
  description: string | null;
  state: RuleState;
  /** Free-text detail, e.g. a numeric limit or a narrative restriction. */
  detail: string | null;
  note: string | null;
  sourceUrl: string | null;
}

export interface FirmViewOffer {
  id: string;
  title: string;
  description: string | null;
  terms: string | null;
  code: string | null;
  discountType: string | null;
  discountValue: string | null;
  discountCurrency: string | null;
  endsAt: string | null;
}

export interface FirmView {
  // ---- identity
  id: string;
  slug: string;
  name: string;
  legalName: string | null;
  tagline: string | null;
  description: string | null;
  logo: FirmViewImage | null;

  // ---- key facts
  foundedYear: number | null;
  headquartersCountry: string | null;
  headquartersCity: string | null;
  websiteUrl: string | null;
  supportEmail: string | null;
  supportUrl: string | null;

  // ---- trust
  isVerified: boolean;
  /** ISO date. Rendered publicly as "Last verified {date}". */
  verifiedAt: string | null;
  publishedAt: string | null;
  updatedAt: string;

  // ---- published children
  challenges: FirmViewChallenge[];
  platforms: FirmViewPlatform[];
  instruments: FirmViewInstrument[];
  rules: FirmViewRule[];
  offers: FirmViewOffer[];

  /**
   * Whether a tracked affiliate CTA should render. NEVER the destination URL —
   * that is resolved server-side inside `/go/{slug}`.
   */
  hasAffiliateLink: boolean;
}

/**
 * Derives a rule's display state from its stored value.
 *
 * Never INFERS a rule that is not stored: an absent or null value yields
 * "not_specified", which the UI renders as an honest answer
 * (docs/CLAUDE.md §3, docs/PROJECT.md §6.5).
 */
export function deriveRuleState(value: {
  valueBoolean: boolean | null;
  valueNumeric: string | null;
  valueText: string | null;
  note: string | null;
}): { state: RuleState; detail: string | null } {
  if (value.valueBoolean !== null) {
    // A boolean rule with a clarifying note is "allowed with conditions" —
    // the note is the condition.
    if (value.valueBoolean && value.note) {
      return { state: "allowed_with_conditions", detail: null };
    }
    return {
      state: value.valueBoolean ? "allowed" : "not_allowed",
      detail: null,
    };
  }
  if (value.valueNumeric !== null) {
    return { state: "allowed_with_conditions", detail: value.valueNumeric };
  }
  if (value.valueText !== null) {
    return { state: "allowed_with_conditions", detail: value.valueText };
  }
  return { state: "not_specified", detail: null };
}

/** Human label for a rule state. Text, never colour alone (docs/DESIGN.md §2.5). */
export const RULE_STATE_LABEL: Record<RuleState, string> = {
  allowed: "Allowed",
  not_allowed: "Not allowed",
  allowed_with_conditions: "Allowed with conditions",
  not_specified: "Not specified",
};

/**
 * Does this firm have enough published substance to be worth indexing?
 *
 * A stub with a name and nothing else is a thin page, and thin pages ship
 * `noindex` (docs/SEO.md §6, §9 `[LOCKED]`).
 */
export function isIndexable(firm: FirmView): boolean {
  const hasDescription = (firm.description?.trim().length ?? 0) >= 120;
  const hasSubstance =
    firm.challenges.length > 0 ||
    firm.platforms.length > 0 ||
    firm.instruments.length > 0 ||
    firm.rules.length > 0;
  return hasDescription && hasSubstance;
}
