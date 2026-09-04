import type { FirmViewMoney } from "./firm-view";

/**
 * Display formatters — docs/ARCHITECTURE.md §18.4 `[LOCKED]`.
 *
 * THE SINGLE SHARED FORMATTER. Currency symbols are never hard-coded, and a
 * monetary value is NEVER rendered without its own source currency.
 *
 * Nothing here converts. There is no rate lookup, no base currency, and no
 * cross-currency arithmetic — a converted figure would need stored provenance
 * and a visible label, which is Phase 2+ (§18.2 `[LOCKED]`).
 *
 * The locale is pinned rather than taken from the request so the server and
 * client render byte-identical output; a locale-dependent separator is a
 * hydration mismatch waiting to happen.
 */

const LOCALE = "en";

/**
 * Dates use the day-first English form ("1 September 2026"). The site lists
 * firms and readers worldwide, and "09/01/2026" means two different days
 * depending on where the reader is — an unacceptable ambiguity next to
 * payout windows and challenge deadlines.
 */
const DATE_LOCALE = "en-GB";

/**
 * "$5,000.00 USD". The code is shown alongside the symbol on purpose: `$`
 * alone is ambiguous across USD, AUD and CAD, and this site lists firms that
 * price in all three.
 */
export function formatMoney(money: FirmViewMoney): string {
  const amount = Number(money.amount);
  if (!Number.isFinite(amount)) return `${money.amount} ${money.currency}`;

  try {
    const formatted = new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency: money.currency,
      // Whole amounts read better without ".00"; fractional prices keep both.
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
    return `${formatted} ${money.currency}`;
  } catch {
    // An unrecognised (but schema-valid) ISO code still renders honestly.
    return `${money.amount} ${money.currency}`;
  }
}

/** "80%" from the stored `numeric` string. Never rounds a stored value away. */
export function formatPercent(value: string | null): string | null {
  if (value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 }).format(n)}%`;
}

/** "4 September 2026" from an ISO string. */
export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * "GB" -> "United Kingdom", via the platform's own region data. This resolves
 * a code to its name; it does not invent a location.
 */
export function countryName(code: string | null): string | null {
  if (!code) return null;
  try {
    const name = new Intl.DisplayNames([LOCALE], { type: "region" }).of(code);
    return name && name !== code ? name : code;
  } catch {
    return code;
  }
}

/** "Two step" from the stored enum value. */
export function humaniseEnum(value: string | null): string | null {
  if (!value) return null;
  const words = value.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const CHALLENGE_TYPE_LABEL: Record<string, string> = {
  one_step: "One step",
  two_step: "Two step",
  three_step: "Three step",
  instant_funding: "Instant funding",
  other: "Other",
};

export const DRAWDOWN_TYPE_LABEL: Record<string, string> = {
  static: "Static",
  trailing: "Trailing",
  eod_trailing: "End-of-day trailing",
};

export const DRAWDOWN_BASIS_LABEL: Record<string, string> = {
  initial_balance: "Initial balance",
  equity: "Equity",
  highest_equity: "Highest equity",
  highest_balance: "Highest balance",
};

/** Mirrors `RULE_CATEGORIES` in the catalog schema. */
export const RULE_CATEGORY_LABEL: Record<string, string> = {
  trading: "Trading",
  risk: "Risk",
  payout: "Payouts",
  account: "Account",
  platform: "Platform",
  restriction: "Restrictions",
  other: "Other",
};

/** Mirrors `ASSET_CLASSES` in the catalog schema. */
export const ASSET_CLASS_LABEL: Record<string, string> = {
  forex: "Forex",
  indices: "Indices",
  commodities: "Commodities",
  metals: "Metals",
  energies: "Energies",
  crypto: "Crypto",
  stocks: "Stocks",
  futures: "Futures",
  options: "Options",
  other: "Other",
};

/** Falls back to a humanised form so an unmapped value still reads correctly. */
export function labelFor(
  map: Record<string, string>,
  value: string | null,
): string | null {
  if (!value) return null;
  return map[value] ?? humaniseEnum(value);
}
