import { publicEnv } from "@/lib/validation/env";

/**
 * The ONLY place an absolute URL is constructed (docs/SEO.md §3.1, §4).
 * Nothing else in the codebase may concatenate a domain.
 */
export const SITE_ORIGIN = publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");

export function canonicalUrl(path = "/"): string {
  const normalised = path.startsWith("/") ? path : `/${path}`;
  return normalised === "/"
    ? SITE_ORIGIN
    : `${SITE_ORIGIN}${normalised.replace(/\/$/, "")}`;
}

/**
 * Reserved route segments. A firm slug may never collide with one
 * (docs/SEO.md §3.2, docs/ARCHITECTURE.md §20.1).
 */
export const RESERVED_SEGMENTS = [
  "compare",
  "go",
  "admin",
  "api",
  "prop-firms",
  "platforms",
  "instruments",
  "offers",
  "about",
  "methodology",
  "contact",
  "disclosure",
  "privacy",
  "terms",
  "sitemap",
  "robots",
] as const;
