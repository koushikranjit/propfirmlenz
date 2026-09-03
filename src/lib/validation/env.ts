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
});

const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("https://propfirmlenz.com"),
});

export const env = serverSchema.parse(process.env);

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});
