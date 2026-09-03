import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema";
import type { Database } from "./types";

/**
 * Integration-test database.
 *
 * These are REAL PostgreSQL integration tests, not mocks: PGlite is PostgreSQL
 * compiled to WASM, so CHECK constraints, partial unique indexes, triggers,
 * jsonb and transactions all behave exactly as they do in production.
 *
 * docs/ARCHITECTURE.md §14 specifies a Neon branch or Testcontainers. Neither is
 * available on this machine (no Docker, and connecting production Neon is
 * forbidden), so PGlite is used instead. Its one relevant limitation is that it
 * is single-connection, so it cannot exercise connection-pool behaviour.
 *
 * Each call gets a fresh in-memory database with the real migration applied.
 */
/** Test handle. Structurally identical to the production `Database` type. */
export type TestDb = Database;

function migrationSql(): string {
  const dir = path.join(process.cwd(), "drizzle");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) {
    throw new Error(
      "No migration found in drizzle/. Run `pnpm db:generate` first.",
    );
  }
  return files
    .map((f) => readFileSync(path.join(dir, f), "utf8"))
    .join("\n--> statement-breakpoint\n");
}

export async function createTestDb(): Promise<{
  db: TestDb;
  client: PGlite;
  close: () => Promise<void>;
}> {
  const client = await PGlite.create({ extensions: { citext, pg_trgm } });

  // Apply the real migration, statement by statement, exactly as production would.
  // Leading comment lines are stripped per statement — a statement preceded by a
  // comment block (such as the CREATE EXTENSION preamble) must still run.
  const statements = migrationSql()
    .split("--> statement-breakpoint")
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => !/^\s*--/.test(line))
        .join("\n")
        .trim(),
    )
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await client.exec(statement);
  }

  const db = drizzle(client, { schema });
  return {
    db,
    client,
    close: async () => {
      await client.close();
    },
  };
}

/**
 * Empties every table between tests.
 *
 * Far cheaper than rebuilding the database per test (the migration takes
 * seconds), while keeping full isolation. TRUNCATE is not affected by the
 * row-level append-only triggers on audit_logs / entity_versions, which fire
 * only on UPDATE and DELETE.
 */
export async function resetTestDb(client: PGlite): Promise<void> {
  const r = await client.query<{ table_name: string }>(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'`,
  );
  const tables = r.rows.map((row) => `"${row.table_name}"`).join(", ");
  if (tables.length > 0) {
    await client.exec(`TRUNCATE ${tables} RESTART IDENTITY CASCADE;`);
  }
}
