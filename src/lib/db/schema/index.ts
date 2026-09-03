/**
 * Drizzle schema root — docs/DATABASE.md.
 *
 * The single TypeScript source of truth for table types. Only repositories
 * import from here (docs/ARCHITECTURE.md §4.1); services and components never do.
 */
export * from "./columns";
export * from "./identity";
export * from "./media";
export * from "./firms";
export * from "./catalog";
export * from "./commerce";
export * from "./system";
