import { defineConfig } from "drizzle-kit";

/**
 * docs/INITIALIZATION.md §7 and docs/ARCHITECTURE.md §3.3.
 *
 * Migrations use the DIRECT Neon endpoint (session mode); the application
 * runtime uses the POOLED endpoint. `drizzle-kit push` is PROHIBITED — schema
 * changes go through generate -> review -> migrate, always.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT ?? "",
  },
  strict: true,
  verbose: true,
});
