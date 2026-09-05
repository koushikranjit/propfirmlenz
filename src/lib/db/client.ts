import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/validation/env";
import * as schema from "./schema";
import type { Database } from "./types";

/**
 * The ONLY place Drizzle is instantiated (docs/ARCHITECTURE.md §4.1).
 * Repositories import from here; services and components never do.
 *
 * `prepare: false` is mandatory: Neon's pooled endpoint runs in transaction
 * mode, which breaks prepared statements (docs/ARCHITECTURE.md §3.3).
 *
 * Returns the shared `Database` type so services stay driver-agnostic and the
 * same code runs against PGlite in integration tests.
 */
let client: Database | undefined;

export function getDb(): Database {
  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not configured. See .env.example and docs/INITIALIZATION.md §8.",
    );
  }
  if (!client) {
    const sql = postgres(env.DATABASE_URL, { prepare: false });
    client = drizzle(sql, { schema });
  }
  return client;
}
