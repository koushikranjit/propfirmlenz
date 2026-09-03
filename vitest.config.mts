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
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
