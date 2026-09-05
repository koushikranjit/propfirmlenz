import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/lib/db/types";
import { adminUserRoles, adminUsers, auditLogs, roles } from "@/lib/db/schema";
import { MIN_PASSWORD_LENGTH, hashPassword } from "./password";
import { ROLES, seedRolesAndPermissions } from "./permissions";

/**
 * FIRST-ADMIN BOOTSTRAP — docs/ADMIN.md §11.
 *
 * The one account that cannot be created through the admin UI, because
 * creating an admin requires already being one. Everything after it is created
 * in the dashboard, where the action is authorised and audited.
 *
 * DELIBERATELY NOT A ROUTE `[LOCKED]`. There is no HTTP surface for this — no
 * setup page, no "claim this instance" endpoint, no registration. A web route
 * that can mint a privileged account is a permanent attack surface even when
 * guarded, because the guard is one refactor away from being wrong. This runs
 * from an operator's terminal against a database they can already reach.
 *
 * It reuses the application's own Argon2id hashing and its own RBAC seed, so
 * there is no second password policy and no second permission list to drift.
 */

export class BootstrapError extends Error {
  constructor(
    readonly code:
      | "ADMIN_EXISTS"
      | "INVALID_EMAIL"
      | "INVALID_PASSWORD"
      | "INVALID_NAME"
      | "ROLE_MISSING",
    message: string,
  ) {
    super(message);
    this.name = "BootstrapError";
  }
}

/**
 * Email is normalised before storage: trimmed and lower-cased.
 *
 * `admin_users.email` is `citext`, so the database already compares
 * case-insensitively; normalising as well keeps what is stored identical to
 * what an operator typed, so the audit trail reads unambiguously.
 */
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."));

const nameSchema = z
  .string()
  .trim()
  .min(1, "A full name is required.")
  .max(200, "That name is too long.");

export interface BootstrapInput {
  email: string;
  fullName: string;
  password: string;
}

export interface BootstrapResult {
  adminUserId: string;
  email: string;
  role: string;
}

/**
 * Creates the first master admin.
 *
 * ONE TRANSACTION `[LOCKED]`. The "does an admin already exist?" check, the
 * RBAC seed, the user insert, the role grant and the audit entry all commit
 * together or not at all — so a failure part-way cannot leave an admin with no
 * role, or a role grant pointing at no admin.
 *
 * Refuses if ANY active admin exists, not merely a master admin: once someone
 * can sign in, further accounts belong in the dashboard.
 */
export async function bootstrapFirstAdmin(
  db: Database,
  input: BootstrapInput,
): Promise<BootstrapResult> {
  const email = emailSchema.safeParse(input.email);
  if (!email.success) {
    throw new BootstrapError(
      "INVALID_EMAIL",
      email.error.issues[0]?.message ?? "Enter a valid email address.",
    );
  }

  const fullName = nameSchema.safeParse(input.fullName);
  if (!fullName.success) {
    throw new BootstrapError(
      "INVALID_NAME",
      fullName.error.issues[0]?.message ?? "A full name is required.",
    );
  }

  // Checked here so the failure message is clear; `hashPassword` enforces the
  // same minimum itself, and this never relaxes it.
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new BootstrapError(
      "INVALID_PASSWORD",
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  // Hashed BEFORE the transaction opens: Argon2id is deliberately slow, and
  // holding a transaction open across it would pin a connection for no reason.
  const passwordHash = await hashPassword(input.password);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(adminUsers)
      .where(isNull(adminUsers.deletedAt));

    if ((existing?.n ?? 0) > 0) {
      throw new BootstrapError(
        "ADMIN_EXISTS",
        `${existing?.n} admin account(s) already exist. Create further admins from the dashboard, where the action is authorised and audited.`,
      );
    }

    // Idempotent: inserts only the roles and permissions that are missing.
    await seedRolesAndPermissions(tx);

    const [created] = await tx
      .insert(adminUsers)
      .values({
        email: email.data,
        fullName: fullName.data,
        passwordHash,
        status: "active",
      })
      .returning({ id: adminUsers.id });

    if (!created) {
      throw new BootstrapError("ROLE_MISSING", "Failed to create the admin.");
    }

    const [masterRole] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.key, ROLES.MASTER_ADMIN))
      .limit(1);

    if (!masterRole) {
      throw new BootstrapError(
        "ROLE_MISSING",
        "The master_admin role is missing after seeding.",
      );
    }

    await tx
      .insert(adminUserRoles)
      .values({ adminUserId: created.id, roleId: masterRole.id });

    await tx.insert(auditLogs).values({
      actorType: "admin",
      actorAdminId: created.id,
      action: "admin_user.bootstrapped",
      entityType: "admin_user",
      entityId: created.id,
      // The email identifies the account. The password and its hash never
      // appear here — an audit record is read by people (CLAUDE.md §6).
      after: { email: email.data, role: ROLES.MASTER_ADMIN },
    });

    return {
      adminUserId: created.id,
      email: email.data,
      role: ROLES.MASTER_ADMIN,
    };
  });
}

/** Whether any active admin exists. Used by the CLI to fail fast and clearly. */
export async function hasAnyAdmin(db: Database): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(adminUsers)
    .where(and(isNull(adminUsers.deletedAt)));
  return (row?.n ?? 0) > 0;
}
