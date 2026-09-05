import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/cookies";

/**
 * Edge guard for the admin surface — docs/ARCHITECTURE.md §6.2.
 *
 * This is a CHEAP EARLY REJECT, not the authorisation layer. It only checks
 * that a session cookie is present; it cannot validate it, because session
 * validation needs the database and Argon2 needs the Node runtime.
 *
 * Every admin route and action independently calls requireAdmin() /
 * requireAdminPermission() on the server. A forged cookie gets past this
 * middleware and is then rejected by the real check.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isLogin = pathname === "/admin/login";
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);

  if (!isLogin && !hasSessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    // Only a same-site path is ever echoed back, and safeNextPath re-validates
    // it before use — this cannot become an open redirect.
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();

  // Admin surfaces are never indexed and never cached (docs/SEO.md §9).
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
