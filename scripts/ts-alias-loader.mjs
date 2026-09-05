import { registerHooks } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Resolves the project's "@/..." path alias for Node's native TypeScript
 * execution, so operational scripts can import the REAL application modules
 * instead of re-implementing them.
 *
 * Node strips types but does not read `tsconfig.json` paths, and it needs a
 * concrete file rather than a bare specifier. These few lines bridge both gaps:
 * no dependency, no build step, and no second copy of any application logic.
 *
 * Used only by `scripts/`. The application itself is compiled by Next.js and
 * never loads this.
 */
const srcRoot = path.join(process.cwd(), "src");

/** Mirrors TypeScript/bundler resolution: exact -> .ts/.tsx -> /index.ts. */
function resolveFile(base) {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const resolved = resolveFile(path.join(srcRoot, specifier.slice(2)));
      if (resolved) {
        return { url: pathToFileURL(resolved).href, shortCircuit: true };
      }
    }

    // A relative import *from* an aliased module may also be extensionless.
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const resolved = resolveFile(path.resolve(parentDir, specifier));
      if (resolved) {
        return { url: pathToFileURL(resolved).href, shortCircuit: true };
      }
    }

    return nextResolve(specifier, context);
  },
});
