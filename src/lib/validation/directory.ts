import { z } from "zod";

/**
 * PUBLIC directory query parameters — docs/SEO.md §9.
 *
 * Every value arrives from the URL, so every value is untrusted. Sort keys are
 * an allowlist (never interpolated into SQL), page size is fixed server-side,
 * and page number is capped so a crafted URL cannot request an unbounded scan.
 *
 * Unrecognised parameters — `utm_*`, `gclid`, `fbclid` and anything else — are
 * ignored entirely: they never alter rendering and never reach a canonical
 * (docs/SEO.md §9 parameter policy `[LOCKED]`).
 */
export const directoryQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v ? v : undefined)),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .optional()
    .catch(undefined),
  platform: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(100)
    .optional()
    .catch(undefined),
  verified: z
    .enum(["true", "false"])
    .optional()
    .catch(undefined)
    .transform((v) => v === "true"),
  sort: z.enum(["featured", "name", "newest"]).catch("featured"),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});

export type DirectoryQuery = z.infer<typeof directoryQuerySchema>;

/** Parses untrusted search params, falling back to safe defaults. */
export function parseDirectoryQuery(
  params: Record<string, string | string[] | undefined>,
): DirectoryQuery {
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(params)) {
    flat[key] = Array.isArray(value) ? value[0] : value;
  }
  const parsed = directoryQuerySchema.safeParse(flat);
  return parsed.success ? parsed.data : directoryQuerySchema.parse({});
}

/**
 * Is this the clean, unfiltered, first-page view?
 *
 * Only that view is the canonical directory URL. Filtered and sorted views are
 * `noindex, follow` — they are navigation, not distinct content
 * (docs/SEO.md §9 `[LOCKED]`).
 */
export function isCleanDirectoryView(query: DirectoryQuery): boolean {
  return (
    query.q === undefined &&
    query.country === undefined &&
    query.platform === undefined &&
    !query.verified &&
    query.sort === "featured"
  );
}

/** Rebuilds the directory URL, preserving filters and setting the page. */
export function directoryHref(
  query: DirectoryQuery,
  overrides: Partial<{ page: number }> = {},
): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.country) params.set("country", query.country);
  if (query.platform) params.set("platform", query.platform);
  if (query.verified) params.set("verified", "true");
  if (query.sort !== "featured") params.set("sort", query.sort);

  const page = overrides.page ?? query.page;
  if (page > 1) params.set("page", String(page));

  const qs = params.toString();
  return qs ? `/prop-firms?${qs}` : "/prop-firms";
}
