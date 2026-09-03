"use server";

import { and, eq, isNull } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { adminUsers, auditLogs } from "@/lib/db/schema";
import { getCurrentAdmin, safeNextPath } from "./current-admin";
import { verifyPassword } from "./password";
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  createSession,
  hashIdentifier,
  revokeSession,
} from "./session";

/**
 * Admin login / logout — docs/ARCHITECTURE.md §5.2.
 *
 * Argon2id requires the NODE runtime, not Edge. The route segments that invoke
 * these actions declare `export const runtime = "nodejs"`; a "use server"
 * module cannot declare it itself.
 */

const loginSchema = z.object({
  email: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(1024),
  next: z.string().optional(),
});

export interface LoginState {
  error?: string;
}

/**
 * A single generic message for EVERY failure mode — wrong email, wrong
 * password, suspended, locked, deleted. An attacker must not be able to
 * enumerate accounts or learn account state (docs/CLAUDE.md §6).
 */
const GENERIC_FAILURE = "Invalid email or password.";

/** Lockout thresholds (docs/ARCHITECTURE.md §5.2). */
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MS = 15 * 60 * 1000;

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: GENERIC_FAILURE };

  const { email, password } = parsed.data;
  const db = getDb();

  const rows = await db
    .select({
      id: adminUsers.id,
      passwordHash: adminUsers.passwordHash,
      status: adminUsers.status,
      lockedUntil: adminUsers.lockedUntil,
      failedLoginCount: adminUsers.failedLoginCount,
    })
    .from(adminUsers)
    .where(and(eq(adminUsers.email, email), isNull(adminUsers.deletedAt)))
    .limit(1);

  const admin = rows[0];

  // Always run a verification so a missing account and a wrong password take
  // comparable time — no timing oracle for account existence.
  const passwordOk = admin
    ? await verifyPassword(admin.passwordHash, password)
    : await verifyPassword(
        "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        password,
      );

  if (!admin || !passwordOk) {
    if (admin) {
      // Count the failure and lock the account temporarily once the threshold
      // is crossed (docs/ARCHITECTURE.md §5.2). The response is identical
      // either way, so lockout state is not observable to the caller.
      const failures = admin.failedLoginCount + 1;
      await db
        .update(adminUsers)
        .set({
          failedLoginCount: failures,
          ...(failures >= MAX_FAILED_LOGINS
            ? { lockedUntil: new Date(Date.now() + LOCKOUT_MS) }
            : {}),
        })
        .where(eq(adminUsers.id, admin.id));
    }
    return { error: GENERIC_FAILURE };
  }

  // Suspended / invited / locked accounts fail with the SAME message.
  if (admin.status !== "active") return { error: GENERIC_FAILURE };
  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    return { error: GENERIC_FAILURE };
  }

  const headerList = await headers();
  const { token, expiresAt } = await createSession(db, {
    adminUserId: admin.id,
    ip: headerList.get("x-forwarded-for"),
    userAgent: headerList.get("user-agent"),
  });

  await db
    .update(adminUsers)
    .set({
      lastLoginAt: new Date(),
      lastLoginIpHash: hashIdentifier(headerList.get("x-forwarded-for")),
      failedLoginCount: 0,
    })
    .where(eq(adminUsers.id, admin.id));

  await db.insert(auditLogs).values({
    actorType: "admin",
    actorAdminId: admin.id,
    action: "admin.logged_in",
    ipHash: hashIdentifier(headerList.get("x-forwarded-for")),
  });

  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    ...SESSION_COOKIE_OPTIONS,
    expires: expiresAt,
    // __Host- prefix requires Secure; allow http on localhost in development.
    secure: process.env.NODE_ENV === "production",
  });

  redirect(safeNextPath(parsed.data.next) ?? "/admin");
}

export async function logoutAction(): Promise<void> {
  const admin = await getCurrentAdmin();
  const store = await cookies();

  if (admin) {
    const db = getDb();
    await revokeSession(db, admin.sessionId);
    await db.insert(auditLogs).values({
      actorType: "admin",
      actorAdminId: admin.adminUserId,
      action: "admin.logged_out",
    });
  }

  store.delete(SESSION_COOKIE_NAME);
  redirect("/admin/login");
}
