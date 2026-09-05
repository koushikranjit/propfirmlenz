import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import {
  adminUserRoles,
  permissions,
  rolePermissions,
  roles,
} from "@/lib/db/schema";

/**
 * RBAC — docs/ARCHITECTURE.md §6.
 *
 * Permissions are `resource:action` strings. Authorisation happens in the
 * SERVICE layer on every call, never only in the UI. Hiding a button is
 * presentation, not security.
 *
 * DENY BY DEFAULT: an unknown or absent permission is a denial.
 */

export const PERMISSIONS = {
  FIRM_READ: "firm:read",
  FIRM_CREATE: "firm:create",
  FIRM_EDIT: "firm:edit",
  FIRM_PUBLISH: "firm:publish",
  FIRM_VERIFY: "firm:verify",
  FIRM_DELETE: "firm:delete",
  CHALLENGE_EDIT: "challenge:edit",
  OFFER_EDIT: "offer:edit",
  AFFILIATE_LINK_READ: "affiliate_link:read",
  AFFILIATE_LINK_EDIT: "affiliate_link:edit",
  CATALOG_MANAGE: "catalog:manage",
  MEDIA_UPLOAD: "media:upload",
  MEDIA_DELETE: "media:delete",
  SEO_WRITE: "seo:write",
  REDIRECT_MANAGE: "redirect:manage",
  INTERNAL_NOTE_READ: "internal_note:read",
  INTERNAL_NOTE_WRITE: "internal_note:write",
  AUDIT_LOG_READ: "audit_log:read",
  ADMIN_USER_MANAGE: "admin_user:manage",
  ROLE_MANAGE: "role:manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: readonly PermissionKey[] =
  Object.values(PERMISSIONS);

/** Role keys. These are architecture, not business data. */
export const ROLES = {
  MASTER_ADMIN: "master_admin",
  ADMIN: "admin",
  EDITOR: "editor",
  PUBLISHER: "publisher",
  SEO_MANAGER: "seo_manager",
  ANALYST: "analyst",
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

/**
 * Structural seed data only — roles and permissions, never business data
 * (docs/DATABASE.md §9 `[LOCKED]`).
 */
export const ROLE_PERMISSIONS: Record<RoleKey, readonly PermissionKey[]> = {
  [ROLES.MASTER_ADMIN]: ALL_PERMISSIONS,
  [ROLES.ADMIN]: ALL_PERMISSIONS.filter(
    (p) => p !== PERMISSIONS.ROLE_MANAGE && p !== PERMISSIONS.ADMIN_USER_MANAGE,
  ),
  /** Can create and edit, but CANNOT publish or verify. */
  [ROLES.EDITOR]: [
    PERMISSIONS.FIRM_READ,
    PERMISSIONS.FIRM_CREATE,
    PERMISSIONS.FIRM_EDIT,
    PERMISSIONS.CHALLENGE_EDIT,
    PERMISSIONS.OFFER_EDIT,
    PERMISSIONS.MEDIA_UPLOAD,
    PERMISSIONS.INTERNAL_NOTE_READ,
    PERMISSIONS.INTERNAL_NOTE_WRITE,
  ],
  [ROLES.PUBLISHER]: [
    PERMISSIONS.FIRM_READ,
    PERMISSIONS.FIRM_CREATE,
    PERMISSIONS.FIRM_EDIT,
    PERMISSIONS.FIRM_PUBLISH,
    PERMISSIONS.FIRM_VERIFY,
    PERMISSIONS.CHALLENGE_EDIT,
    PERMISSIONS.OFFER_EDIT,
    PERMISSIONS.MEDIA_UPLOAD,
    PERMISSIONS.INTERNAL_NOTE_READ,
    PERMISSIONS.INTERNAL_NOTE_WRITE,
  ],
  [ROLES.SEO_MANAGER]: [
    PERMISSIONS.FIRM_READ,
    PERMISSIONS.SEO_WRITE,
    PERMISSIONS.REDIRECT_MANAGE,
  ],
  /** Read-only. Notably NOT affiliate destinations or internal notes. */
  [ROLES.ANALYST]: [PERMISSIONS.FIRM_READ, PERMISSIONS.AUDIT_LOG_READ],
};

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN";
  constructor(public readonly permission: string) {
    super(`Missing required permission: ${permission}`);
    this.name = "AuthorizationError";
  }
}

export class AuthenticationError extends Error {
  readonly code = "UNAUTHENTICATED";
  constructor() {
    super("Authentication required");
    this.name = "AuthenticationError";
  }
}

/** Loads the effective permission set for an admin, via their roles. */
export async function getAdminPermissions(
  db: Database,
  adminUserId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ key: permissions.key })
    .from(adminUserRoles)
    .innerJoin(roles, eq(roles.id, adminUserRoles.roleId))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(adminUserRoles.adminUserId, adminUserId));

  return new Set(rows.map((r) => r.key));
}

export async function hasPermission(
  db: Database,
  adminUserId: string,
  permission: PermissionKey,
): Promise<boolean> {
  const granted = await getAdminPermissions(db, adminUserId);
  return granted.has(permission);
}

/**
 * The authorisation gate. Every service entry point begins with this.
 * Throws — callers must not be able to proceed by ignoring a return value.
 */
export async function requirePermission(
  db: Database,
  adminUserId: string | null | undefined,
  permission: PermissionKey,
): Promise<void> {
  if (!adminUserId) throw new AuthenticationError();
  if (!(await hasPermission(db, adminUserId, permission))) {
    throw new AuthorizationError(permission);
  }
}

/** Does this admin hold the given role? */
export async function hasRole(
  db: Database,
  adminUserId: string,
  roleKey: RoleKey,
): Promise<boolean> {
  const rows = await db
    .select({ id: roles.id })
    .from(adminUserRoles)
    .innerJoin(roles, eq(roles.id, adminUserRoles.roleId))
    .where(
      and(eq(adminUserRoles.adminUserId, adminUserId), eq(roles.key, roleKey)),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Seeds the permission catalog and the system roles.
 *
 * STRUCTURAL DATA ONLY. No firms, challenges, offers, or ratings — that is
 * business data and enters exclusively through the admin UI (docs/CLAUDE.md §3).
 */
export async function seedRolesAndPermissions(db: Database): Promise<void> {
  const permissionRows = ALL_PERMISSIONS.map((key) => {
    const [resource, action] = key.split(":");
    return { key, resource: resource ?? key, action: action ?? "" };
  });

  await db.insert(permissions).values(permissionRows).onConflictDoNothing();

  const roleRows = (Object.values(ROLES) as RoleKey[]).map((key) => ({
    key,
    name: key
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" "),
    isSystem: true,
  }));

  await db.insert(roles).values(roleRows).onConflictDoNothing();

  const allRoles = await db.select().from(roles);
  const allPermissions = await db.select().from(permissions);
  const permissionIdByKey = new Map(allPermissions.map((p) => [p.key, p.id]));

  for (const role of allRoles) {
    const wanted = ROLE_PERMISSIONS[role.key as RoleKey] ?? [];
    const values = wanted
      .map((key) => permissionIdByKey.get(key))
      .filter((id): id is string => Boolean(id))
      .map((permissionId) => ({ roleId: role.id, permissionId }));

    if (values.length > 0) {
      await db.insert(rolePermissions).values(values).onConflictDoNothing();
    }
  }
}

/**
 * Guard rail: the system must always retain at least one active master_admin
 * (docs/DATABASE.md §4.6, docs/ADMIN.md §11).
 */
export async function countActiveMasterAdmins(db: Database): Promise<number> {
  const rows = await db
    .select({ adminUserId: adminUserRoles.adminUserId })
    .from(adminUserRoles)
    .innerJoin(roles, eq(roles.id, adminUserRoles.roleId))
    .where(inArray(roles.key, [ROLES.MASTER_ADMIN]));
  return new Set(rows.map((r) => r.adminUserId)).size;
}
