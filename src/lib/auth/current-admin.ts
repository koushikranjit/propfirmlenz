import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import {
  AuthorizationError,
  type PermissionKey,
  getAdminPermissions,
} from "./permissions";
import {
  SESSION_COOKIE_NAME,
  type ResolvedSession,
  resolveSession,
  touchSession,
} from "./session";

/**
 * Server-side admin context — docs/ARCHITECTURE.md §6.2.
 *
 * Reuses the Stage 1 session service; it does NOT re-implement token hashing,
 * expiry, or revocation. This module only bridges the Next.js cookie/request
 * layer to that service.
 *
 * DENY BY DEFAULT: every helper here fails closed.
 */

export interface AdminContext extends ResolvedSession {
  permissions: Set<string>;
  can: (permission: PermissionKey) => boolean;
}

/** Resolves the current admin, or null. Never throws. */
export async function getCurrentAdmin(): Promise<AdminContext | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const db = getDb();
  const session = await resolveSession(db, token);
  if (!session) return null;

  // Refresh the idle window on authenticated traffic.
  await touchSession(db, session.sessionId);

  const permissions = await getAdminPermissions(db, session.adminUserId);
  return {
    ...session,
    permissions,
    can: (permission) => permissions.has(permission),
  };
}

/**
 * Requires an authenticated admin. Redirects to the login page otherwise.
 *
 * The redirect carries only a relative `next` path, validated by
 * `safeNextPath` on the way back out, so it cannot be used as an open redirect.
 */
export async function requireAdmin(nextPath?: string): Promise<AdminContext> {
  const admin = await getCurrentAdmin();
  if (admin) return admin;

  const target = nextPath && safeNextPath(nextPath);
  redirect(
    target ? `/admin/login?next=${encodeURIComponent(target)}` : "/admin/login",
  );
}

/**
 * Requires a specific permission, enforced ON THE SERVER.
 *
 * Hiding a button is presentation, not security (docs/ARCHITECTURE.md §6.2
 * rule 4). Every page and action calls this.
 *
 * Returns 404 rather than 403 for read surfaces where the existence of the
 * resource is itself non-public (docs/ARCHITECTURE.md §6.2 rule 5).
 */
export async function requireAdminPermission(
  permission: PermissionKey,
  opts: { notFoundOnDeny?: boolean } = {},
): Promise<AdminContext> {
  const admin = await requireAdmin();
  if (!admin.can(permission)) {
    if (opts.notFoundOnDeny) notFound();
    throw new AuthorizationError(permission);
  }
  return admin;
}

/**
 * Validates a post-login redirect target.
 *
 * Only same-site absolute paths under /admin are allowed. Protocol-relative
 * URLs (`//evil.test`) and backslash variants are rejected — this is the open
 * redirect guard.
 */
export function safeNextPath(
  candidate: string | null | undefined,
): string | null {
  if (!candidate) return null;
  if (!candidate.startsWith("/")) return null;
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return null;
  if (candidate.includes("://")) return null;
  if (!candidate.startsWith("/admin")) return null;
  if (candidate.startsWith("/admin/login")) return null;
  return candidate;
}
