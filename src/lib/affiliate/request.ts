/**
 * Request classification for `/go/{slug}` — docs/ARCHITECTURE.md §11.2, §11.3.
 *
 * PURE FUNCTIONS over header values. No database, no `node:crypto`, no request
 * object, so every rule below is unit-testable in isolation.
 *
 * Everything here CLASSIFIES; nothing blocks. Bot traffic is flagged and kept,
 * because filtering belongs at report time — a click deleted at write time can
 * never be reviewed, and a partner dispute needs the raw row
 * (docs/ARCHITECTURE.md §11.3 `[LOCKED]`).
 *
 * These are heuristics and are treated as such: `is_bot` is a reporting hint,
 * never an authorisation decision and never a reason to change what a visitor
 * is shown.
 */

/**
 * Signatures that identify a non-human client. Deliberately conservative — a
 * false positive silently removes a real click from every report.
 */
const BOT_SIGNATURE =
  /bot|crawler|spider|crawling|slurp|facebookexternalhit|bingpreview|headless|phantomjs|curl\/|wget\/|python-requests|libwww|okhttp|axios\/|node-fetch|got\/|lighthouse|pingdom|uptimerobot|gtmetrix/i;

export function isBotUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return true; // No UA at all is not a browser.
  return BOT_SIGNATURE.test(userAgent);
}

/**
 * Headers a browser or framework sends when it is fetching a link the user has
 * NOT clicked. A prefetch is not a click and must never be reported as one.
 */
const PREFETCH_HEADERS: [string, RegExp][] = [
  ["sec-purpose", /prefetch|prerender/i],
  ["purpose", /prefetch|preview/i],
  ["x-purpose", /prefetch|preview/i],
  ["x-moz", /prefetch/i],
  ["next-router-prefetch", /1|true/i],
];

export function isPrefetch(headers: Headers): boolean {
  return PREFETCH_HEADERS.some(([name, pattern]) => {
    const value = headers.get(name);
    return value !== null && pattern.test(value);
  });
}

export type DeviceType = "mobile" | "tablet" | "desktop";

/**
 * Coarse device classification. Tablet is tested first: an iPad's user agent
 * also contains "Mobile", so the opposite order would misreport every tablet.
 */
export function deviceTypeFrom(userAgent: string | null): DeviceType | null {
  if (!userAgent) return null;
  if (/ipad|tablet|playbook|silk/i.test(userAgent)) return "tablet";
  if (/mobi|android|iphone|ipod|windows phone/i.test(userAgent))
    return "mobile";
  return "desktop";
}

/**
 * The referring HOST only — never the full referring URL, which can carry a
 * query string with personal data (docs/ARCHITECTURE.md §11.2 `[LOCKED]`).
 */
export function referrerHostFrom(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).host || null;
  } catch {
    return null;
  }
}

/**
 * The path on OUR site that the click came from.
 *
 * Only same-origin referers yield a path. Another site's pathname is their
 * data, not our landing page, and storing it would make the column mean two
 * different things.
 */
export function landingPathFrom(
  referer: string | null,
  origin: string,
): string | null {
  if (!referer) return null;
  try {
    const url = new URL(referer);
    return url.origin === origin ? url.pathname : null;
  } catch {
    return null;
  }
}

/** ISO 3166-1 alpha-2, as supplied by the edge network. Rejected otherwise. */
export function countryCodeFrom(header: string | null): string | null {
  if (!header) return null;
  const code = header.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

/**
 * `?p=` — where on the page the CTA sat. An allowlisted shape, because it is
 * attacker-controlled and ends up in a reporting dimension. Anything else is
 * dropped, never rejected: a malformed parameter must not cost a real click.
 */
export function placementFrom(value: string | null): string | null {
  if (!value) return null;
  return /^[a-z0-9_]{1,64}$/.test(value) ? value : null;
}

/**
 * `?c=` — the campaign whose link should be preferred. Same reasoning as
 * placement, and it only ever SELECTS among links already stored for the firm;
 * it can never introduce a destination.
 */
export function campaignFrom(value: string | null): string | null {
  if (!value) return null;
  return /^[a-zA-Z0-9_-]{1,64}$/.test(value) ? value : null;
}

/** The public slug shape (docs/SEO.md §3.3). Anything else is a 404. */
export function isValidFirmSlug(slug: string): boolean {
  return slug.length <= 100 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}
