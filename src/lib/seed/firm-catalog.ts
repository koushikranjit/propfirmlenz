/**
 * INITIAL PUBLIC CATALOG — the eleven firms, seeded 2026-09-04.
 *
 * PROVENANCE `[LOCKED]`
 *
 * Every value below was read from THE FIRM'S OWN WEBSITE on 2026-09-04 and is
 * recorded with the URL it came from. Nothing here is remembered, inferred, or
 * filled in to make a page look complete (CLAUDE.md §3).
 *
 * WHY NOT THE REQUESTED SOURCE. The seed was asked to draw on
 * propfirmmatch.com. That host returns HTTP 403 to automated requests — it
 * blocks this deliberately — and CLAUDE.md §12.2 rule 6 separately prohibits
 * copying that competitor's content or data. Each firm's own site is the better
 * source anyway: it is primary, it is what the firm actually publishes, and
 * using it breaks no rule.
 *
 * WHAT IS DELIBERATELY ABSENT. Challenge tables, trading rules, instruments,
 * Trustpilot ratings, CEOs, FAQs and announcements are NOT here. The firms'
 * home pages state programme NAMES and headline ranges ("4–5% daily drawdown",
 * "up to 90% split") but not the per-challenge figures the schema needs. A
 * range is not a value, and writing one in as though it were would publish a
 * financial figure nobody can stand behind. Those fields stay empty until a
 * person enters them, and the public page renders its honest "Not specified"
 * state meanwhile.
 *
 * The two firms with no fields beyond a name (FundingPips, E8 Markets) are the
 * ones whose sites refused automated access. They are seeded as records so the
 * catalog is complete and an admin can fill them in — not padded with guesses.
 */

/** A platform an admin can associate a firm with. Product names, not claims. */
export interface SeedPlatform {
  key: string;
  name: string;
  slug: string;
}

/**
 * The shared platform vocabulary (docs/PROJECT.md §6.2 `[LOCKED]`).
 *
 * Seeded as catalog records so two firms cannot end up with "MetaTrader 5" and
 * "MT5" as different platforms and break every filter built on them.
 */
export const SEED_PLATFORMS: SeedPlatform[] = [
  { key: "mt4", name: "MetaTrader 4", slug: "metatrader-4" },
  { key: "mt5", name: "MetaTrader 5", slug: "metatrader-5" },
  { key: "ctrader", name: "cTrader", slug: "ctrader" },
  { key: "match-trader", name: "Match-Trader", slug: "match-trader" },
  { key: "tradelocker", name: "TradeLocker", slug: "tradelocker" },
  { key: "dxtrade", name: "DXtrade", slug: "dxtrade" },
  { key: "ninjatrader", name: "NinjaTrader", slug: "ninjatrader" },
  { key: "tradovate", name: "Tradovate", slug: "tradovate" },
  { key: "tradingview", name: "TradingView", slug: "tradingview" },
  { key: "bybit", name: "Bybit", slug: "bybit" },
];

export interface SeedFirm {
  slug: string;
  name: string;
  /** The firm's own words for itself, quoted as a short identifier. */
  tagline: string | null;
  /** Written for Prop Firm Lenz from the verified facts. Never copied prose. */
  description: string | null;
  /** The official site. Becomes the Buy Link, resolved through /go/{slug}. */
  websiteUrl: string | null;
  /** ISO-3166 alpha-2, only where the firm names ONE home jurisdiction. */
  headquartersCountry: string | null;
  foundedYear: number | null;
  founderName: string | null;
  /** Platform keys from SEED_PLATFORMS. Only where the site lists them. */
  platformKeys: string[];
  /** Where each field above was read from, for the next person to re-check. */
  source: string | null;
}

/**
 * THE LENZ SEED OFFER — placeholder terms `[MUST BE SET BEFORE LAUNCH]`.
 *
 * The owner asked for one LENZ offer on every firm at the same percentage, and
 * said the percentage is temporary demo data. It is therefore NOT a verified
 * fact about any firm: no firm has agreed to it, and it is published only so
 * the offer component can be inspected with content in it.
 *
 * It lives in the database like any other offer and is editable in Admin →
 * Prop Firms → Discount. Changing it needs no code change; changing it here
 * only changes what a re-run would reconcile to.
 */
export const LENZ_OFFER = {
  code: "LENZ",
  title: "10% off with code LENZ",
  /** No terms are claimed, because none have been agreed. */
  description: null,
  discountPercent: 10,
} as const;

export const SEED_FIRMS: SeedFirm[] = [
  {
    slug: "fundednext",
    name: "FundedNext",
    tagline: "We sponsor your trading journey",
    description:
      "FundedNext is a proprietary trading firm founded in 2022 by Abdullah Jayed, offering evaluation programmes for CFD and futures traders across a network of global offices. Challenge parameters, platforms and payout terms have not yet been recorded here.",
    websiteUrl: "https://fundednext.com",
    headquartersCountry: null,
    foundedYear: 2022,
    founderName: "Abdullah Jayed",
    platformKeys: [],
    source: "https://fundednext.com/ (read 2026-09-04)",
  },
  {
    slug: "funding-pips",
    name: "FundingPips",
    // Every field is null: the site refused automated access, and a firm
    // record with nothing in it is more honest than one filled from memory.
    tagline: null,
    description: null,
    websiteUrl: null,
    headquartersCountry: null,
    foundedYear: null,
    founderName: null,
    platformKeys: [],
    source: null,
  },
  {
    slug: "brightfunded",
    name: "BrightFunded",
    tagline: "Get Paid For Your Trading Skills",
    description:
      "BrightFunded is a proprietary trading firm founded in 2023 and headquartered in Dubai, United Arab Emirates. It runs one-step and two-step evaluation challenges on MetaTrader 5, cTrader and DXtrade, with simulated capital advertised up to $400,000.",
    websiteUrl: "https://brightfunded.com",
    headquartersCountry: "AE",
    foundedYear: 2023,
    founderName: null,
    platformKeys: ["mt5", "ctrader", "dxtrade"],
    source: "https://brightfunded.com/ (read 2026-09-04)",
  },
  {
    slug: "e8-markets",
    name: "E8 Markets",
    tagline: null,
    description: null,
    websiteUrl: null,
    headquartersCountry: null,
    foundedYear: null,
    founderName: null,
    platformKeys: [],
    source: null,
  },
  {
    slug: "crypto-fund-trader",
    name: "Crypto Fund Trader",
    tagline: "You trade we boost",
    description:
      "Crypto Fund Trader is a proprietary trading firm based in Switzerland, running one-phase and two-phase evaluation programmes on MetaTrader 5, Match-Trader and Bybit. Account sizes advertised on its site range from $2,500 to $200,000.",
    websiteUrl: "https://cryptofundtrader.com",
    headquartersCountry: "CH",
    foundedYear: null,
    founderName: null,
    platformKeys: ["mt5", "match-trader", "bybit"],
    source: "https://cryptofundtrader.com/ (read 2026-09-04)",
  },
  {
    slug: "the-5-ers",
    name: "The5ers",
    tagline: "Turning your passion into a trading career",
    description:
      "The5ers is a proprietary trading firm offering one-step, two-step and three-step evaluation routes alongside a futures programme, with funded accounts advertised up to $4,000,000. Per-programme parameters have not yet been recorded here.",
    websiteUrl: "https://the5ers.com",
    headquartersCountry: null,
    foundedYear: null,
    founderName: null,
    platformKeys: [],
    source: "https://the5ers.com/ (read 2026-09-04)",
  },
  {
    slug: "alpha-capital-group",
    name: "Alpha Capital Group",
    tagline: "Trade with an Industry-Leading Prop Firm",
    description:
      "Alpha Capital Group is a United Kingdom-based proprietary trading firm offering evaluation and qualified-account routes on MetaTrader 5, cTrader, TradeLocker and DXtrade, with simulated funds advertised up to $200,000. All trading it describes is simulated.",
    websiteUrl: "https://alphacapitalgroup.uk",
    headquartersCountry: "GB",
    foundedYear: null,
    founderName: null,
    platformKeys: ["mt5", "ctrader", "tradelocker", "dxtrade"],
    source: "https://alphacapitalgroup.uk/ (read 2026-09-04)",
  },
  {
    slug: "hola-prime",
    name: "Hola Prime",
    tagline: "We are Traders",
    description:
      "Hola Prime is a proprietary trading firm registered in Hong Kong, offering forex and futures evaluation programmes and direct accounts on MetaTrader 4, MetaTrader 5, cTrader, DXtrade and Match-Trader. Per-programme parameters have not yet been recorded here.",
    websiteUrl: "https://holaprime.com",
    headquartersCountry: "HK",
    foundedYear: null,
    founderName: null,
    platformKeys: ["mt4", "mt5", "ctrader", "dxtrade", "match-trader"],
    source: "https://holaprime.com/ (read 2026-09-04)",
  },
  {
    slug: "atmos-funded",
    name: "Atmos Funded",
    tagline: "The Future of Trading is Funded",
    description:
      "Atmos Funded is a proprietary trading firm operating from Cyprus, offering one-step and two-step evaluation challenges with account sizes advertised from $5,000 to $200,000 and scaling beyond. Platform support and per-challenge parameters have not yet been recorded here.",
    websiteUrl: "https://atmosfunded.com",
    headquartersCountry: "CY",
    foundedYear: null,
    founderName: null,
    platformKeys: [],
    source: "https://atmosfunded.com/ (read 2026-09-04)",
  },
  {
    slug: "aquafunded",
    name: "AquaFunded",
    tagline:
      "Trade with our Capital and keep 100% of the Profit paid on demand",
    description:
      "AquaFunded is a proprietary trading firm offering one-step, two-step and instant-funding routes on Match-Trader, TradeLocker, MetaTrader 5 and cTrader, with account sizes advertised from $2,500 to $400,000. It names entities in both Saint Lucia and the United Arab Emirates.",
    websiteUrl: "https://aquafunded.com",
    // Two jurisdictions are named and neither is identified as the home one;
    // choosing between them would be a decision, not a fact.
    headquartersCountry: null,
    foundedYear: null,
    founderName: null,
    platformKeys: ["match-trader", "tradelocker", "mt5", "ctrader"],
    source: "https://aquafunded.com/ (read 2026-09-04)",
  },
  {
    slug: "blue-guardian",
    name: "Blue Guardian",
    tagline: "Empowering Traders",
    description:
      "Blue Guardian is a proprietary trading firm offering instant, one-step and two-step CFD routes plus several futures programmes, on MetaTrader 5, TradeLocker, Match-Trader, NinjaTrader, Tradovate and TradingView. Account sizes advertised run from $5,000 to $400,000.",
    websiteUrl: "https://blueguardian.com",
    // Saint Lucia and Dubai entities are both named; see AquaFunded above.
    headquartersCountry: null,
    foundedYear: null,
    founderName: null,
    platformKeys: [
      "mt5",
      "tradelocker",
      "match-trader",
      "ninjatrader",
      "tradovate",
      "tradingview",
    ],
    source: "https://blueguardian.com/ (read 2026-09-04)",
  },
];
