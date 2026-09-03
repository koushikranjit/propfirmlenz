/**
 * Session cookie constants.
 *
 * Deliberately free of Node built-ins so the EDGE middleware can import them:
 * `session.ts` uses `node:crypto`, which cannot be bundled for Edge
 * (docs/ARCHITECTURE.md §5.2).
 */

/** `__Host-` prefix forces Secure, path=/, and no Domain attribute. */
export const SESSION_COOKIE_NAME = "__Host-pfl_admin_session";

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
} as const;
