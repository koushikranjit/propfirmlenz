import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/**
 * The database handle passed through the service and repository layers.
 *
 * Deliberately driver-agnostic: production runs `postgres-js` against Neon's
 * pooled endpoint, while integration tests run PGlite. Both satisfy this type,
 * so production code never imports test infrastructure — and PGlite (a
 * devDependency) can never be pulled into a production bundle.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
