import { z } from "zod";
import { isCountryCode } from "@/lib/geo/countries";
import { RESERVED_SEGMENTS } from "@/lib/seo/canonical";

/**
 * Firm input schemas — shared by server actions and forms
 * (docs/ARCHITECTURE.md §13 `[LOCKED]`).
 *
 * One schema per concept. Validation runs at the BOUNDARY; database constraints
 * remain the last line of defence, not the first.
 */

/**
 * Slug rules (docs/SEO.md §3.3, §3.2).
 *
 * Rejects anything colliding with a reserved route segment — a firm must never
 * be able to claim `/admin`, `/go`, `/compare`, etc.
 */
export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers and single hyphens.",
  )
  .refine(
    (s) => !(RESERVED_SEGMENTS as readonly string[]).includes(s),
    "That slug is reserved by a site route.",
  );

/** Blank form inputs mean "not specified" — never an empty string in the DB. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable();

const optionalUrl = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .refine(
    (v) => v === null || /^https?:\/\/\S+$/.test(v),
    "Enter a full URL starting with http:// or https://",
  );

const optionalEmail = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .refine(
    (v) => v === null || z.email().safeParse(v).success,
    "Enter a valid email address.",
  );

/** Creation requires only what publishing will genuinely need. */
/**
 * Creation requires NOTHING `[owner-directed 2026-09-04]`.
 *
 * A firm can be created empty and filled in later. The slug is derived from
 * the name when there is one; with no name there is no slug, and the record
 * simply has no public page until it gets one. Nothing is invented to fill the
 * gap — "untitled-firm" would be a URL nobody chose.
 */
export const createFirmSchema = z.object({
  name: optionalText(200),
  slug: slugSchema.nullable(),
  description: optionalText(20_000),
});

export type CreateFirmInput = z.infer<typeof createFirmSchema>;

/**
 * Overview + Company + Branding editing.
 *
 * Every optional field is genuinely optional: a blank input stores NULL and the
 * UI renders "Not specified". Nothing is silently defaulted, and no business
 * fact is invented (docs/PROJECT.md §6.5 `[LOCKED]`).
 */
export const editFirmSchema = z.object({
  /**
   * Name, tagline and description are OPTIONAL here `[LOCKED]`.
   *
   * They belong to the primary editor (`firmEssentialsSchema`). Advanced saves
   * omit them, and a field that is absent is left alone rather than written as
   * null — otherwise saving Advanced would silently revert a name just typed
   * on the screen above it.
   */
  name: z.string().trim().min(2).max(200).optional(),
  slug: slugSchema,
  tagline: optionalText(160).optional(),
  description: optionalText(20_000).optional(),

  // Company
  legalName: optionalText(200),
  foundedYear: z
    .union([z.literal(""), z.coerce.number().int().min(1900).max(2100)])
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  headquartersCountry: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .refine(
      (v) => v === null || /^[A-Z]{2}$/.test(v),
      "Use a two-letter ISO country code, e.g. GB.",
    ),
  headquartersCity: optionalText(120),
  websiteUrl: optionalUrl,
  supportEmail: optionalEmail,
  supportUrl: optionalUrl,

  // Branding
  logoMediaId: z.uuid().nullable().optional(),
  coverMediaId: z.uuid().nullable().optional(),
  brandColor: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .refine(
      (v) => v === null || /^#[0-9a-fA-F]{6}$/.test(v),
      "Use a six-digit hex colour, e.g. #19E6D2.",
    ),
  isFeatured: z.boolean().optional(),
  displayOrder: z.coerce.number().int().min(0).max(100_000).optional(),
});

export type EditFirmInput = z.infer<typeof editFirmSchema>;

/**
 * List query parameters.
 *
 * Parsed from the URL, so every value is untrusted. Sort keys are an allowlist
 * — never interpolated into SQL — and page size is capped so a crafted URL
 * cannot request an unbounded scan.
 */
export const firmListQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v ? v : undefined)),
  status: z.enum(["draft", "published", "archived"]).optional(),
  verification: z.enum(["unverified", "verified", "needs_review"]).optional(),
  hasDraft: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  sort: z
    .enum(["name", "status", "updatedAt", "createdAt", "country"])
    .default("updatedAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
});

export type FirmListQuery = z.infer<typeof firmListQuerySchema>;

/** Parses untrusted search params, falling back to safe defaults. */
export function parseFirmListQuery(
  params: Record<string, string | string[] | undefined>,
): FirmListQuery {
  const flat: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(params)) {
    flat[k] = Array.isArray(v) ? v[0] : v;
  }
  const parsed = firmListQuerySchema.safeParse(flat);
  return parsed.success ? parsed.data : firmListQuerySchema.parse({});
}

/**
 * THE SIMPLE EDITOR — docs/ADMIN.md §6.
 *
 * The handful of fields needed to get a firm listed and monetised. Everything
 * else the schema holds stays editable under "Advanced"; nothing was removed
 * from the data model, only from the default screen.
 *
 * Each field is genuinely optional except the name. A blank input means NOT
 * SPECIFIED and is stored as NULL — never as an empty string, a zero, or a
 * borrowed default (docs/PROJECT.md §6.5 `[LOCKED]`).
 */
export const firmEssentialsSchema = z.object({
  /** Optional, like every other content field. */
  name: optionalText(200),
  tagline: optionalText(160),
  description: optionalText(20_000),

  /**
   * THE BUY LINK — one field, not two `[LOCKED]`.
   *
   * Where a visitor goes to buy. It is stored as the firm's default affiliate
   * link destination and NEVER exposed publicly: the public CTA points at
   * `/go/{slug}`, which resolves it server-side (docs/ARCHITECTURE.md §11).
   *
   * The plain marketing website is a separate, publicly-visible field that
   * stays under Advanced. Merging them would publish the tracked URL.
   */
  affiliateUrl: optionalUrl,

  founderName: optionalText(200),
  ceoName: optionalText(200),

  /** ISO 3166-1 alpha-2, chosen from a list — never typed by hand. */
  headquartersCountry: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .refine((v) => v === null || isCountryCode(v), "Choose a country."),

  /**
   * TRUSTPILOT'S rating, transcribed by an admin. Blank means unknown, which
   * renders as "Not specified" — never as a zero (CLAUDE.md §3).
   */
  trustpilotRating: z
    .union([z.literal(""), z.coerce.number().min(0).max(5)])
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  trustpilotUrl: optionalUrl,

  /**
   * When the company was established — MONTH AND YEAR (`YYYY-MM`).
   *
   * Normalised to the first of that month so the existing `date` column keeps
   * working. That day is a STORAGE ARTEFACT, not a claim: no admin enters it
   * and nothing renders it (CLAUDE.md §3 `[LOCKED]`). A full date written
   * before this narrowing is still accepted and truncated to its month, so an
   * older row round-trips instead of failing to save.
   *
   * "Years in operation" is derived from it and never stored.
   */
  foundedOn: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .refine(
      (v) => v === null || /^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/.test(v),
      "Enter the month and year the company was established.",
    )
    .transform((v) => (v === null ? null : `${v.slice(0, 7)}-01`)),

  /** Where the firm publishes its own payout evidence. A link, not a figure. */
  payoutInfoUrl: optionalUrl,

  discountTitle: optionalText(200),
  discountCode: optionalText(64),
  discountDescription: optionalText(2000),
  discountPercent: z
    .union([z.literal(""), z.coerce.number().min(0).max(100)])
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  /** `datetime-local`, read as UTC — see `firm-children.ts` for the reasoning. */
  discountEndsAt: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .refine(
      (v) =>
        v === null ||
        (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v) &&
          !Number.isNaN(new Date(`${v}Z`).getTime())),
      "Enter a valid date and time.",
    )
    .transform((v) => (v === null ? null : new Date(`${v}Z`).toISOString())),
});

export type FirmEssentialsInput = z.infer<typeof firmEssentialsSchema>;

/**
 * Derives a URL slug from a firm name.
 *
 * The simple editor does not ask for a slug — one fewer thing to think about
 * when adding a firm. It stays editable under Advanced, and a rename after
 * publishing still creates a 301 (docs/SEO.md §7).
 */
export function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/, "");
}
