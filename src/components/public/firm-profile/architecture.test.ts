import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architecture invariants asserted against the SOURCE — docs/ARCHITECTURE.md
 * §21.9 cases 17, 19, 20, 21, 22, and §21.2's import boundary.
 *
 * These are the guarantees a runtime test cannot easily prove, because what
 * matters is that a second implementation does not EXIST anywhere. A
 * source-level assertion is the honest way to check "there is no duplicate".
 *
 * Comments are stripped before scanning: the rules below are about what the
 * CODE does. A comment that names `draft_payload` in order to explain why it
 * is never selected is documentation, not a leak.
 */

const ROOT = join(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const sourceFiles = walk(ROOT).filter((f) => /\.tsx?$/.test(f));
const productionFiles = sourceFiles.filter((f) => !/\.test\.tsx?$/.test(f));

const raw = (file: string) => readFileSync(file, "utf8");

/** Removes block, JSX and line comments, leaving `https://` URLs intact. */
function code(file: string): string {
  return raw(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

describe("one firm profile, two data sources", () => {
  const PROFILE_MODULE = "@/components/public/firm-profile/FirmProfile";
  const publicRoute = join(
    ROOT,
    "app",
    "(public)",
    "prop-firms",
    "[slug]",
    "page.tsx",
  );
  const previewRoute = join(
    ROOT,
    "app",
    "(admin)",
    "admin",
    "preview",
    "firms",
    "[id]",
    "page.tsx",
  );

  it("(17) the public route and the admin preview import the SAME component", () => {
    expect(code(publicRoute)).toContain(PROFILE_MODULE);
    expect(code(previewRoute)).toContain(PROFILE_MODULE);
  });

  it("(17) no parallel firm-profile implementation exists", () => {
    // A preview-only or admin-only firm template is prohibited: it drifts from
    // production and the preview stops being trustworthy (§21.1 `[LOCKED]`).
    for (const name of [
      "AdminFirmProfile",
      "PreviewFirmProfile",
      "FakePreviewFirmProfile",
    ]) {
      expect(productionFiles.filter((f) => code(f).includes(name))).toEqual([]);
    }

    const definitions = productionFiles.filter((f) =>
      /export function FirmProfile\b/.test(code(f)),
    );
    expect(definitions).toHaveLength(1);
  });

  it("components/public never imports from components/admin", () => {
    const publicFiles = productionFiles.filter((f) =>
      f.includes(join("components", "public")),
    );
    expect(publicFiles.length).toBeGreaterThan(0);

    for (const file of publicFiles) {
      expect(code(file)).not.toMatch(/from\s+"@\/components\/admin/);
      expect(code(file)).not.toMatch(/from\s+"\.\.\/admin/);
    }
  });
});

describe("preview head suppression", () => {
  const previewRoute = join(
    ROOT,
    "app",
    "(admin)",
    "admin",
    "preview",
    "firms",
    "[id]",
    "page.tsx",
  );

  it("(20) declares noindex and no-store", () => {
    expect(code(previewRoute)).toMatch(/robots:\s*\{\s*index:\s*false/);
    expect(code(previewRoute)).toContain('fetchCache = "force-no-store"');
  });

  it("(21) emits no canonical, no Open Graph, and no JSON-LD", () => {
    const source = code(previewRoute);
    expect(source).not.toContain("alternates");
    expect(source).not.toContain("openGraph");
    expect(source).not.toContain("JsonLd");
    expect(source).not.toContain("buildBreadcrumbLd");
    expect(source).not.toContain("buildWebPageLd");
  });

  it("(19) builds no /go/ href of its own", () => {
    // The CTA's preview branch is what removes the href; the route must not
    // reintroduce one (§21.7 `[LOCKED]`).
    expect(code(previewRoute)).not.toContain("/go/");
  });
});

describe("sitemap exclusions", () => {
  const sitemap = join(ROOT, "app", "sitemap.ts");

  it("(22) never emits an admin, preview, or affiliate URL", () => {
    const source = code(sitemap);
    expect(source).not.toContain("/admin");
    expect(source).not.toContain("/go/");
    expect(source).not.toContain("preview");
  });

  it("uses the entity's real updated_at as lastmod, never now()", () => {
    const source = code(sitemap);
    expect(source).toContain("firm.updatedAt");
    expect(source).not.toMatch(/lastModified:\s*new Date\(\)/);
  });
});

describe("public data isolation", () => {
  it("no public repository selects draft_payload", () => {
    const publicRepos = productionFiles.filter((f) =>
      /repositories[\\/]public-/.test(f),
    );
    expect(publicRepos.length).toBeGreaterThan(0);

    for (const file of publicRepos) {
      expect(code(file)).not.toContain("draftPayload");
      expect(code(file)).not.toContain("draft_payload");
    }
  });

  it("no public component reads a draft or admin-only field", () => {
    const publicFiles = productionFiles.filter((f) =>
      f.includes(join("components", "public")),
    );

    for (const file of publicFiles) {
      const source = code(file);
      for (const forbidden of [
        "draftPayload",
        "internalNotes",
        "auditLogs",
        "adminSessions",
        "adminUsers",
        "passwordHash",
        "destinationUrl",
        "dataCompletenessScore",
      ]) {
        expect(source).not.toContain(forbidden);
      }
    }
  });

  it("no public component or route imports the database client", () => {
    // Components receive a materialised view model; they never query
    // (CLAUDE.md §8). Route files are the layer allowed to call a repository.
    const publicComponents = productionFiles.filter((f) =>
      f.includes(join("components", "public")),
    );

    for (const file of publicComponents) {
      expect(code(file)).not.toContain("@/lib/db/");
    }
  });

  it("the canonical view carries no affiliate destination URL", () => {
    const view = code(join(ROOT, "lib", "view", "firm-view.ts"));
    expect(view).toContain("hasAffiliateLink: boolean");
    expect(view).not.toContain("destinationUrl");
  });
});
