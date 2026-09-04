import type { Metadata } from "next";
import { type FirmView, isIndexable } from "@/lib/view/firm-view";
import { countryName } from "@/lib/view/format";
import {
  type BreadcrumbItem,
  type SeoOverride,
  buildMetadata,
} from "./metadata";

/**
 * Firm-page SEO — docs/SEO.md §5.1 `[LOCKED]`.
 *
 * Resolution order: `seo_metadata` override -> deterministic template ->
 * global default. Every template below BRANCHES on what the database actually
 * holds. Nothing interpolates a value that may be missing, so no title or
 * description can ever read "undefined", " challenges" with no number, or
 * assert data the firm has not published (CLAUDE.md §3).
 */

export function firmPath(slug: string): string {
  return `/prop-firms/${slug}`;
}

export const DIRECTORY_PATH = "/prop-firms";

/** Visible breadcrumb AND its JSON-LD come from this one source (§11 rule 5). */
export function firmBreadcrumbs(firm: FirmView): BreadcrumbItem[] {
  return [
    { name: "Home", path: "/" },
    { name: "Prop firms", path: DIRECTORY_PATH },
    { name: firm.name, path: firmPath(firm.slug) },
  ];
}

/**
 * Deterministic title. Names only the sections that genuinely have content.
 */
export function buildFirmTitle(firm: FirmView): string {
  const hasChallenges = firm.challenges.length > 0;
  const hasRules = firm.rules.length > 0;

  if (hasChallenges && hasRules) return `${firm.name} challenges and rules`;
  if (hasChallenges) return `${firm.name} challenges and pricing`;
  if (hasRules) return `${firm.name} trading rules`;
  return `${firm.name} prop firm profile`;
}

/**
 * Deterministic meta description.
 *
 * Prefers the admin-written description (the same prose the page shows), then
 * the tagline, then a factual summary assembled ONLY from populated sections.
 * If the firm holds nothing but a name, it says exactly that.
 */
export function buildFirmDescription(firm: FirmView): string {
  const description = firm.description?.trim();
  if (description) return firstSentences(description);

  const tagline = firm.tagline?.trim();
  if (tagline) return tagline;

  const facts: string[] = [];
  if (firm.challenges.length > 0) {
    facts.push(plural(firm.challenges.length, "published challenge"));
  }
  if (firm.platforms.length > 0) {
    facts.push(plural(firm.platforms.length, "trading platform"));
  }
  if (firm.rules.length > 0) {
    facts.push(plural(firm.rules.length, "documented trading rule"));
  }

  const country = countryName(firm.headquartersCountry);
  const based = country ? ` Based in ${country}.` : "";

  if (facts.length === 0) {
    return `${firm.name} on Prop Firm Lenz.${based} No challenge or rule data has been published yet.`;
  }
  return `${firm.name} on Prop Firm Lenz: ${joinList(facts)}.${based}`;
}

/**
 * Firm page metadata.
 *
 * A firm without enough published substance ships `noindex, follow` — a stub
 * profile is a thin page (docs/SEO.md §10.3 `[LOCKED]`). `buildMetadata` then
 * omits the canonical rather than pointing one at a noindex URL (§4).
 */
export function buildFirmMetadata(
  firm: FirmView,
  override: SeoOverride | null,
): Metadata {
  return buildMetadata({
    path: firmPath(firm.slug),
    title: buildFirmTitle(firm),
    description: buildFirmDescription(firm),
    override,
    noindex: !isIndexable(firm),
  });
}

/** Trims prose to whole sentences that fit a meta description. */
function firstSentences(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;

  const cut = flat.slice(0, max);
  const lastStop = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("! "),
    cut.lastIndexOf("? "),
  );
  if (lastStop > 80) return cut.slice(0, lastStop + 1);

  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max - 1).trimEnd()}…`;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
