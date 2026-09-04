import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/cookies";
import { resolveSession } from "@/lib/auth/session";
import { isSafeAffiliateDestination } from "@/lib/affiliate/link";
import {
  campaignFrom,
  countryCodeFrom,
  deviceTypeFrom,
  isBotUserAgent,
  isPrefetch,
  isValidFirmSlug,
  landingPathFrom,
  placementFrom,
  referrerHostFrom,
} from "@/lib/affiliate/request";
import { getDb } from "@/lib/db/client";
import {
  recordAffiliateClick,
  resolveAffiliateLink,
} from "@/lib/services/affiliate";

/**
 * The tracked affiliate redirect — docs/ARCHITECTURE.md §11 `[LOCKED]`.
 *
 *   user -> /go/{firm-slug} -> resolve link -> record click -> 302 off-site
 *
 * A route handler, not a page: it renders nothing and must stay server-side.
 * It is the ONLY route that sends a visitor off-site, which makes it the only
 * route that could become an open redirect — hence the rules below.
 *
 * SECURITY `[LOCKED]`
 *
 *  1. The destination comes ONLY from `affiliate_links.destination_url`. No
 *     query parameter, header, or path segment can supply, extend, or steer it.
 *     `?p=` and `?c=` are classification and selection inputs; neither can
 *     introduce a URL. This is structural, not a filter.
 *  2. A stored destination is re-validated by `isSafeAffiliateDestination`
 *     before it reaches a `Location` header. A destination that fails is a data
 *     defect and 404s — it is never repaired, guessed, or fallen back from.
 *  3. Only published, non-deleted firms participate. `resolveAffiliateLink`
 *     enforces that in SQL; this route does not re-implement the check.
 *  4. Every failure is the SAME bare 404. "No such firm", "firm is a draft",
 *     "firm is soft-deleted" and "no active link" are indistinguishable, so the
 *     route cannot be used to enumerate unpublished firms.
 *  5. **302, never 301** — destinations change, and a cached permanent redirect
 *     is unrecoverable and would silently stop recording clicks (§11.3).
 *  6. `noindex` + `no-store` on every response, success or failure.
 *  7. Raw IP and user agent are never stored; `recordAffiliateClick` hashes
 *     them with the rotated salt. The admin session id is never written to
 *     `affiliate_clicks.session_id` — that column is for a future PUBLIC
 *     visitor session, and logging a session identifier is prohibited
 *     (CLAUDE.md §6).
 *
 * The slug is used ONLY for routing. Everything downstream — the click row, the
 * foreign keys, the reporting join — uses the stable ids `resolveAffiliateLink`
 * returns (`linkId`, `propFirmId`), so a later slug rename cannot orphan or
 * misattribute a single recorded click (docs/ARCHITECTURE.md §22).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Applied to every response, including the 404s. */
const NO_INDEX_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "no-store, max-age=0",
} as const;

/**
 * One bare, identical failure. It deliberately says nothing about which of the
 * possible causes applied (rule 4 above).
 */
function notFound(): NextResponse {
  return new NextResponse("Not found", {
    status: 404,
    headers: {
      ...NO_INDEX_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await params;
  if (!isValidFirmSlug(slug)) return notFound();

  const db = getDb();
  const campaign = campaignFrom(request.nextUrl.searchParams.get("c"));

  // Campaign-scoped first, then the firm's default — the semantics already
  // implemented and tested in the service. Not re-derived here.
  const link = await resolveAffiliateLink(db, {
    firmSlug: slug,
    campaign,
  });
  if (!link) return notFound();

  // Second layer over the database's `^https://` constraint (see the module
  // note in `lib/affiliate/link.ts`). A bad row 404s rather than redirecting.
  if (!isSafeAffiliateDestination(link.destinationUrl)) return notFound();

  const headers = request.headers;
  const userAgent = headers.get("user-agent");
  const referer = headers.get("referer");

  // A prefetch is the browser guessing, not a person clicking. Flagged as bot
  // traffic so it is excluded from every report, and kept so the volume stays
  // visible (§11.3 — flagged, never deleted).
  const isBot = isBotUserAgent(userAgent) || isPrefetch(headers);

  // SECONDARY protection only. The primary guarantee that previewing creates no
  // attribution is structural: preview CTAs carry no href, so no request
  // reaches this route at all (docs/ARCHITECTURE.md §21.7 `[LOCKED]`).
  const isInternal = await hasAdminSession(request);

  // Recorded BEFORE the redirect, so a click is never lost to a response the
  // runtime has already flushed `[owner-directed 2026-09-04]`. This overrides
  // the deferred-write note in §11.1; §11.3's "never block the redirect" target
  // now means "keep this write to a single fast insert", which it is.
  await recordAffiliateClick(db, {
    link,
    placement: placementFrom(request.nextUrl.searchParams.get("p")),
    countryCode: countryCodeFrom(headers.get("x-vercel-ip-country")),
    deviceType: deviceTypeFrom(userAgent),
    referrerHost: referrerHostFrom(referer),
    landingPath: landingPathFrom(referer, request.nextUrl.origin),
    // No public session system exists yet, and the ADMIN session id must never
    // be written here (rule 7 above).
    sessionId: null,
    userId: null,
    ip: headers.get("x-forwarded-for"),
    userAgent,
    isBot,
    isInternal,
  });

  return NextResponse.redirect(link.destinationUrl, {
    status: 302,
    headers: NO_INDEX_HEADERS,
  });
}

/**
 * Does this request carry a genuinely valid admin session?
 *
 * The cookie is checked first so anonymous traffic — nearly all of it — costs
 * no query. A forged cookie resolves to null and the click is simply reported
 * as external, which is the safe direction: `is_internal` only ever REMOVES a
 * click from reporting.
 */
async function hasAdminSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return false;
  return (await resolveSession(getDb(), token)) !== null;
}
