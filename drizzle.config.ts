import { defineConfig } from "drizzle-kit";

/**
 * docs/INITIALIZATION.md §7 and docs/ARCHITECTURE.md §3.3.
 *
 * Migrations use the DIRECT Neon endpoint (session mode); the application
 * runtime uses the POOLED endpoint. `drizzle-kit push` is PROHIBITED — schema
 * changes go through generate -> review -> migrate, always.
 *
 * `.env.local` IS NOT LOADED AUTOMATICALLY HERE. drizzle-kit is a standalone
 * CLI: only `next dev` / `next build` read `.env.local` on their own. The
 * `db:*` scripts therefore load it the same way `admin:create` and
 * `seed:firms` do — Node's own `--env-file-if-exists`, no dotenv dependency.
 *
 * Running the CLI directly (`npx drizzle-kit migrate`) skips that and fails
 * below, on purpose: an empty-string fallback here is what turned "the
 * variable is not loaded" into the far less useful "url: ''".
 */
const url = process.env.DATABASE_URL_DIRECT;

if (!url) {
  throw new Error(
    "DATABASE_URL_DIRECT is not set.\n" +
      "Run migrations through the package scripts (`pnpm db:migrate`), which " +
      "load .env.local. Running `drizzle-kit` directly does not load it.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
