import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),

  {
    // CLAUDE.md §12.4f rule 36 — the public component tree may never reach
    // admin code. This boundary is what keeps the live preview honest
    // (docs/ARCHITECTURE.md §21.2). On this machine node_modules is hoisted
    // (exFAT), so pnpm's strictness does NOT back this up: the rule is the
    // only enforcement. It is not optional.
    files: ["src/components/public/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/components/admin",
                "@/components/admin/*",
                "../admin/*",
              ],
              message:
                "components/public/** must never import from components/admin/** (CLAUDE.md §12.4f rule 36).",
            },
          ],
        },
      ],
    },
  },

  {
    // docs/DESIGN.md §14 — components reference design tokens, never raw hex.
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/#[0-9a-fA-F]{6}\b/]",
          message:
            "Raw hex colours are not allowed in components. Use design tokens from src/styles/tokens.css (docs/DESIGN.md §14).",
        },
      ],
    },
  },
]);

export default eslintConfig;
