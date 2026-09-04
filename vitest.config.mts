import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    globals: true,
    passWithNoTests: true,
    // Integration tests boot a real PostgreSQL (PGlite) and apply the full
    // migration in beforeAll; that legitimately exceeds the 10s default.
    hookTimeout: 60_000,
    testTimeout: 30_000,
    /**
     * Each integration file boots its own PostgreSQL-in-WASM instance, and
     * several now do. At the default worker count those instances are alive
     * concurrently and exhaust memory, which kills a fork mid-run — surfacing
     * as a spurious "worker exited unexpectedly" with a different pass count
     * each time, rather than as a real failure.
     *
     * Two workers keeps the wall time close to the default while bounding how
     * many database instances exist at once. Raise it only alongside a measured
     * check that the suite still completes.
     */
    maxWorkers: 2,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
