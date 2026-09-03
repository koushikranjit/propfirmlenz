import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id password hashing — docs/ARCHITECTURE.md §5.2 `[APPROVED]`.
 *
 * Parameters follow the OWASP baseline: memory >= 19 MiB, iterations >= 2,
 * parallelism 1.
 *
 * Argon2 requires the NODE runtime, not Edge. Every route that calls this must
 * declare `export const runtime = "nodejs"`.
 */
const ARGON2ID = 2 as const;

const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

/** Minimum length per NIST SP 800-63B — length over composition rules. */
export const MIN_PASSWORD_LENGTH = 12;

export async function hashPassword(plaintext: string): Promise<string> {
  if (plaintext.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
  return hash(plaintext, OPTIONS);
}

/**
 * Verifies a password. Returns false rather than throwing on a malformed hash,
 * so a corrupt record cannot be distinguished from a wrong password by timing
 * or by error shape.
 */
export async function verifyPassword(
  storedHash: string,
  plaintext: string,
): Promise<boolean> {
  try {
    return await verify(storedHash, plaintext);
  } catch {
    return false;
  }
}
