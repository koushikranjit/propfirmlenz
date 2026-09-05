import { describe, expect, it } from "vitest";
import { RESERVED_SEGMENTS, SITE_ORIGIN, canonicalUrl } from "./canonical";
import {
  AGGREGATE_RATING_LD_ALLOWED,
  DESCRIPTION_MAX,
  TITLE_MAX,
  buildBreadcrumbLd,
  buildMetadata,
  buildOrganizationLd,
} from "./metadata";

/** (2) validation — SEO foundation is pure and unit-tested (docs/SEO.md §5.1). */
describe("seo", () => {
  describe("canonicalUrl", () => {
    it("uses the official production origin", () => {
      expect(SITE_ORIGIN).toBe("https://propfirmlenz.com");
    });

    it("builds absolute, self-referencing URLs", () => {
      expect(canonicalUrl("/")).toBe("https://propfirmlenz.com");
      expect(canonicalUrl("/prop-firms")).toBe(
        "https://propfirmlenz.com/prop-firms",
      );
    });

    it("normalises a missing leading slash and a trailing slash", () => {
      expect(canonicalUrl("prop-firms")).toBe(
        "https://propfirmlenz.com/prop-firms",
      );
      expect(canonicalUrl("/prop-firms/")).toBe(
        "https://propfirmlenz.com/prop-firms",
      );
    });

    it("never emits the old brand domain", () => {
      expect(canonicalUrl("/prop-firms")).not.toContain("propfirmlens");
    });

    it("reserves route segments so a firm slug cannot claim them", () => {
      for (const seg of ["compare", "go", "admin", "api", "sitemap"]) {
        expect(RESERVED_SEGMENTS).toContain(seg);
      }
    });
  });

  describe("buildMetadata", () => {
    it("produces a self-referencing canonical for indexable pages", () => {
      const m = buildMetadata({
        path: "/prop-firms",
        title: "Prop Firms",
        description: "Compare prop firms.",
      });
      expect(m.alternates?.canonical).toBe(
        "https://propfirmlenz.com/prop-firms",
      );
      expect(m.robots).toEqual({ index: true, follow: true });
    });

    it("OMITS the canonical when noindex — never points at a noindex URL", () => {
      const m = buildMetadata({
        path: "/compare?a=x",
        title: "Compare",
        description: "Comparison tool.",
        noindex: true,
      });
      expect(m.robots).toEqual({ index: false, follow: true });
      expect(m.alternates?.canonical).toBeUndefined();
    });

    it("prefers the seo_metadata override over the template", () => {
      const m = buildMetadata({
        path: "/prop-firms",
        title: "Template Title",
        description: "Template description.",
        override: { title: "Override Title" },
      });
      expect(m.title).toBe("Override Title");
    });

    it("falls back to the template when the override is blank", () => {
      const m = buildMetadata({
        path: "/prop-firms",
        title: "Template Title",
        description: "Template description.",
        override: { title: "   ", metaDescription: null },
      });
      expect(m.title).toBe("Template Title");
      expect(m.description).toBe("Template description.");
    });

    it("clamps to the documented length limits", () => {
      const m = buildMetadata({
        path: "/x",
        title: "T".repeat(200),
        description: "D".repeat(400),
      });
      expect((m.title as string).length).toBeLessThanOrEqual(TITLE_MAX);
      expect((m.description as string).length).toBeLessThanOrEqual(
        DESCRIPTION_MAX,
      );
    });

    it("never emits 'undefined' or an empty bracket in a template", () => {
      const m = buildMetadata({
        path: "/x",
        title: "Example Firm A Review",
        description: "Rules and challenges.",
      });
      const serialised = JSON.stringify(m);
      expect(serialised).not.toContain("undefined");
      expect(serialised).not.toMatch(/\{\s*\}/);
    });

    it("sets og:url equal to the canonical", () => {
      const m = buildMetadata({
        path: "/prop-firms",
        title: "T",
        description: "D",
      });
      expect(m.openGraph?.url).toBe(m.alternates?.canonical);
    });
  });

  describe("structured data", () => {
    it("breadcrumbs use absolute canonical URLs and 1-based positions", () => {
      const ld = buildBreadcrumbLd([
        { name: "Home", path: "/" },
        { name: "Prop Firms", path: "/prop-firms" },
      ]);
      expect(ld["@type"]).toBe("BreadcrumbList");
      expect(ld.itemListElement[0]!.position).toBe(1);
      expect(ld.itemListElement[1]!.item).toBe(
        "https://propfirmlenz.com/prop-firms",
      );
    });

    it("Organization uses the OFFICIAL logo asset, never a redrawn mark", () => {
      const ld = buildOrganizationLd();
      expect(ld.name).toBe("Prop Firm Lenz");
      expect(ld.logo).toContain("/brand/Prop Firm Lenz logo.png");
    });

    it("rating and review markup is PROHIBITED before Phase 3", () => {
      expect(AGGREGATE_RATING_LD_ALLOWED).toBe(false);
    });
  });
});
