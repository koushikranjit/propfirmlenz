import { z } from "zod";

/**
 * Environment contract. Parsed at module load so a missing variable fails the
 * build rather than the first request (docs/ARCHITECTURE.md §13).
 *
 * Never log or expose these values (docs/CLAUDE.md §6).
 */
const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  // Neon: pooled for the app, direct for drizzle-kit (docs/ARCHITECTURE.md §3.3)
  DATABASE_URL: z.string().url().optional(),
  DATABASE_URL_DIRECT: z.string().url().optional(),

  /** Pepper for session-token hashing — a leaked DB alone yields no usable tokens. */
  AUTH_SESSION_PEPPER: z.string().min(16).optional(),
  /** Salt for IP / user-agent hashing. Raw values are never stored. */
  IP_HASH_SALT: z.string().min(16).optional(),
});

const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("https://propfirmlenz.com"),
});

export const env = serverSchema.parse(process.env);

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});

/**
 * Variables that are optional in development but REQUIRED in production.
 * Called by a deployment preflight rather than at import time, so local
 * development and tests are not blocked by unset production secrets.
 */
export function assertProductionEnv(): void {
  if (env.NODE_ENV !== "production") return;

  const required: [string, unknown][] = [
    ["DATABASE_URL", env.DATABASE_URL],
    ["DATABASE_URL_DIRECT", env.DATABASE_URL_DIRECT],
    ["AUTH_SESSION_PEPPER", env.AUTH_SESSION_PEPPER],
    ["IP_HASH_SALT", env.IP_HASH_SALT],
  ];

  const missing = required.filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missing.join(", ")}`,
    );
  }
}
