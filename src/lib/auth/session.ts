import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/types";
import { adminSessions, adminUsers } from "@/lib/db/schema";
import { env } from "@/lib/validation/env";

/**
 * Database-backed admin sessions — docs/ARCHITECTURE.md §5.2 `[APPROVED]`.
 *
 * Opaque random tokens, stored HASHED. Never JWTs for admin: server-side
 * sessions can be revoked instantly, which is what makes suspension and role
 * changes take effect immediately on a privileged surface.
 */

/** 256 bits of entropy. */
const TOKEN_BYTES = 32;

/** docs/ARCHITECTURE.md §17 defaults: 8h idle, 30d absolute. */
export const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
export const ABSOLUTE_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000;

export { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from "./cookies";

/**
 * Hashes a session token with the configured pepper.
 *
 * The pepper means a leaked database alone does not yield usable session
 * tokens. Raw tokens are never stored or logged (docs/CLAUDE.md §6).
 */
export function hashToken(token: string): string {
  return createHash("sha256")
    .update(`${env.AUTH_SESSION_PEPPER ?? ""}:${token}`)
    .digest("hex");
}

/** Salted hash for IP / user-agent. Raw values are NEVER stored `[LOCKED]`. */
export function hashIdentifier(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  return createHash("sha256")
    .update(`${env.IP_HASH_SALT ?? ""}:${value}`)
    .digest("hex");
}

export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Constant-time comparison, for comparing hashes without leaking via timing. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export interface CreateSessionInput {
  adminUserId: string;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
}

export interface CreatedSession {
  /** Returned to the caller ONCE, to be set as a cookie. Never persisted. */
  token: string;
  sessionId: string;
  expiresAt: Date;
}

export async function createSession(
  db: Database,
  input: CreateSessionInput,
): Promise<CreatedSession> {
  const now = input.now ?? new Date();
  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + ABSOLUTE_TIMEOUT_MS);

  const [row] = await db
    .insert(adminSessions)
    .values({
      adminUserId: input.adminUserId,
      tokenHash: hashToken(token),
      expiresAt,
      lastSeenAt: now,
      ipHash: hashIdentifier(input.ip),
      userAgentHash: hashIdentifier(input.userAgent),
    })
    .returning({ id: adminSessions.id });

  if (!row) throw new Error("Failed to create session");
  return { token, sessionId: row.id, expiresAt };
}

export interface ResolvedSession {
  sessionId: string;
  adminUserId: string;
  email: string;
  fullName: string;
}

/**
 * Resolves a raw token to an active session.
 *
 * Returns null — never throws — for every failure mode, so a caller cannot
 * distinguish "no such session" from "expired" from "revoked" from "suspended".
 * Enforces BOTH the absolute expiry and the idle timeout, and requires the
 * owning admin to still be active.
 */
export async function resolveSession(
  db: Database,
  token: string | undefined | null,
  now: Date = new Date(),
): Promise<ResolvedSession | null> {
  if (!token) return null;

  const rows = await db
    .select({
      sessionId: adminSessions.id,
      adminUserId: adminSessions.adminUserId,
      lastSeenAt: adminSessions.lastSeenAt,
      email: adminUsers.email,
      fullName: adminUsers.fullName,
      adminStatus: adminUsers.status,
      adminDeletedAt: adminUsers.deletedAt,
    })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.adminUserId))
    .where(
      and(
        eq(adminSessions.tokenHash, hashToken(token)),
        isNull(adminSessions.revokedAt),
        gt(adminSessions.expiresAt, now),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // A suspended or deleted admin loses every session immediately.
  if (row.adminStatus !== "active" || row.adminDeletedAt !== null) return null;

  // Idle timeout.
  if (row.lastSeenAt) {
    const idleMs = now.getTime() - row.lastSeenAt.getTime();
    if (idleMs > IDLE_TIMEOUT_MS) return null;
  }

  return {
    sessionId: row.sessionId,
    adminUserId: row.adminUserId,
    email: row.email,
    fullName: row.fullName,
  };
}

/** Refreshes the idle window. Called on authenticated requests. */
export async function touchSession(
  db: Database,
  sessionId: string,
  now: Date = new Date(),
): Promise<void> {
  await db
    .update(adminSessions)
    .set({ lastSeenAt: now })
    .where(eq(adminSessions.id, sessionId));
}

/** Logout. */
export async function revokeSession(
  db: Database,
  sessionId: string,
  now: Date = new Date(),
): Promise<void> {
  await db
    .update(adminSessions)
    .set({ revokedAt: now })
    .where(eq(adminSessions.id, sessionId));
}

/** Revokes every session for an admin — used on suspend and on role change. */
export async function revokeAllSessionsForAdmin(
  db: Database,
  adminUserId: string,
  now: Date = new Date(),
): Promise<void> {
  await db
    .update(adminSessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(adminSessions.adminUserId, adminUserId),
        isNull(adminSessions.revokedAt),
      ),
    );
}

/** Housekeeping: drop rows that can no longer authenticate anyone. */
export async function deleteExpiredSessions(
  db: Database,
  now: Date = new Date(),
): Promise<void> {
  await db
    .delete(adminSessions)
    // ISO string, not a bare Date: a raw `sql` template passes its parameters
    // straight through, and postgres-js cannot serialise a Date that way.
    .where(sql`${adminSessions.expiresAt} < ${now.toISOString()}::timestamptz`);
}
