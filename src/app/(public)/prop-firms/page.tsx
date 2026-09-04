import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/public/JsonLd";
import { FirmCard } from "@/components/public/FirmCard";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { EmptyState } from "@/components/ui/primitives";
import { getDb } from "@/lib/db/client";
import {
  DIRECTORY_PAGE_SIZE,
  countPublishedFirms,
  listPublishedFirmCountries,
  listPublishedFirmSummaries,
} from "@/lib/repositories/public-firms";
import { DIRECTORY_PATH } from "@/lib/seo/firm-seo";
import {
  type BreadcrumbItem,
  buildBreadcrumbLd,
  buildItemListLd,
  buildMetadata,
  buildWebPageLd,
} from "@/lib/seo/metadata";
import { countryName } from "@/lib/view/format";
import {
  type DirectoryQuery,
  directoryHref,
  isCleanDirectoryView,
  parseDirectoryQuery,
} from "@/lib/validation/directory";

/**
 * The public prop firm directory — docs/SEO.md §3.2, §9, §12.
 *
 * Server-rendered: the firm list is in the initial HTML, never fetched from a
 * client effect (CLAUDE.md §5 `[LOCKED]`). Filters are a plain GET form and
 * pagination uses real anchors, so the whole directory is crawlable without
 * JavaScript.
 *
 * Rendered dynamically rather than statically: the list changes whenever an
 * admin publishes, and the database is not reachable at build time. Caching
 * and revalidation tags are a later stage; correctness comes first.
 */
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function breadcrumbs(): BreadcrumbItem[] {
  return [
    { name: "Home", path: "/" },
    { name: "Prop firms", path: DIRECTORY_PATH },
  ];
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const query = parseDirectoryQuery(await searchParams);
  const clean = isCleanDirectoryView(query);

  // Page 2+ of the CLEAN view self-canonicalises so its content stays
  // indexable; it never canonicalises back to page 1 (docs/SEO.md §4).
  // Filtered and sorted views are navigation, not content, so they are
  // `noindex, follow` (§9).
  const path = clean ? directoryHref(query) : DIRECTORY_PATH;
  const suffix = clean && query.page > 1 ? ` — page ${query.page}` : "";

  return buildMetadata({
    path,
    title: `Prop firms${suffix}`,
    description:
      "Every prop firm on Prop Firm Lenz, with challenge pricing, drawdown limits and trading rules recorded from each firm's own published sources.",
    noindex: !clean,
  });
}

export default async function PropFirmsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = parseDirectoryQuery(await searchParams);
  const db = getDb();

  const filters = {
    q: query.q,
    country: query.country,
    platform: query.platform,
    verifiedOnly: query.verified,
  };

  const [firms, total, countries] = await Promise.all([
    listPublishedFirmSummaries(db, {
      ...filters,
      sort: query.sort,
      page: query.page,
    }),
    countPublishedFirms(db, filters),
    listPublishedFirmCountries(db),
  ]);

  const totalPages = Math.max(Math.ceil(total / DIRECTORY_PAGE_SIZE), 1);
  const isFiltered = !isCleanDirectoryView({ ...query, page: 1 });
  const clean = isCleanDirectoryView(query);
  const firstOnPage = (query.page - 1) * DIRECTORY_PAGE_SIZE + 1;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Breadcrumbs
        items={[{ label: "Home", href: "/" }, { label: "Prop firms" }]}
      />

      <header className="max-w-prose">
        <h1 className="text-2xl font-semibold text-text-primary sm:text-3xl">
          Prop firms
        </h1>
        <p className="mt-2 text-text-secondary">
          Challenge pricing, drawdown limits and trading rules, recorded from
          each firm&apos;s own published sources. Where a firm has not published
          a figure, this site says so instead of estimating it.
        </p>
      </header>

      <DirectoryFilters query={query} countries={countries} />

      <p className="mt-6 text-sm text-text-muted" role="status">
        {total === 0
          ? "No firms match."
          : `${total} published firm${total === 1 ? "" : "s"}${
              firms.length > 0 && total > firms.length
                ? ` — showing ${firstOnPage} to ${firstOnPage + firms.length - 1}`
                : ""
            }.`}
      </p>

      {firms.length === 0 ? (
        <div className="mt-4 rounded-[14px] border border-border-default bg-bg-card">
          {isFiltered ? (
            <EmptyState
              title="No firms match those filters"
              description="Nothing published matches this combination. Clearing the filters shows every firm on the site."
              action={
                <Link
                  href={DIRECTORY_PATH}
                  className="rounded-[10px] border border-border-default bg-bg-elevated px-4 py-2 text-sm font-medium text-text-primary hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                >
                  Clear filters
                </Link>
              }
            />
          ) : (
            <EmptyState
              title="No prop firms have been published yet"
              description="Firm profiles appear here once their data has been entered and published. Nothing is listed before then — this site does not publish placeholder firms."
            />
          )}
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {firms.map((firm) => (
            <li key={firm.id}>
              <FirmCard firm={firm} />
            </li>
          ))}
        </ul>
      )}

      <Pagination query={query} totalPages={totalPages} />

      <JsonLd
        data={[
          buildWebPageLd({
            path: DIRECTORY_PATH,
            name: "Prop firms",
            description:
              "Directory of prop firms with published challenge, rule and platform data.",
          }),
          buildBreadcrumbLd(breadcrumbs()),
          // Describes exactly the firms rendered above, in the order rendered,
          // and only on the indexable view (docs/SEO.md §11 rule 2).
          ...(clean && firms.length > 0
            ? [
                buildItemListLd(
                  firms.map((f) => ({
                    name: f.name,
                    path: `/prop-firms/${f.slug}`,
                  })),
                  { startPosition: firstOnPage },
                ),
              ]
            : []),
        ]}
      />
    </div>
  );
}

/**
 * A plain GET form. No client JavaScript, so filtering works for every visitor
 * and every crawler, and each filtered view has a real, linkable URL.
 */
function DirectoryFilters({
  query,
  countries,
}: {
  query: DirectoryQuery;
  countries: string[];
}) {
  return (
    <form
      method="get"
      action={DIRECTORY_PATH}
      className="mt-6 flex flex-wrap items-end gap-3 rounded-[14px] border border-border-default bg-bg-card p-4"
    >
      <div className="min-w-0 flex-1 basis-64">
        <label
          htmlFor="q"
          className="text-xs font-semibold uppercase tracking-wide text-text-muted"
        >
          Search by name
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={query.q ?? ""}
          placeholder="Firm name"
          className="mt-1.5 w-full rounded-[10px] border border-border-default bg-bg-near-black px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
        />
      </div>

      <div className="basis-48">
        <label
          htmlFor="country"
          className="text-xs font-semibold uppercase tracking-wide text-text-muted"
        >
          Headquarters
        </label>
        <select
          id="country"
          name="country"
          defaultValue={query.country ?? ""}
          className="mt-1.5 w-full rounded-[10px] border border-border-default bg-bg-near-black px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
        >
          <option value="">Anywhere</option>
          {countries.map((code) => (
            <option key={code} value={code}>
              {countryName(code)}
            </option>
          ))}
        </select>
      </div>

      <div className="basis-44">
        <label
          htmlFor="sort"
          className="text-xs font-semibold uppercase tracking-wide text-text-muted"
        >
          Sort
        </label>
        <select
          id="sort"
          name="sort"
          defaultValue={query.sort}
          className="mt-1.5 w-full rounded-[10px] border border-border-default bg-bg-near-black px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
        >
          <option value="featured">Featured first</option>
          <option value="name">Name A–Z</option>
          <option value="newest">Recently published</option>
        </select>
      </div>

      <label className="flex items-center gap-2 pb-2 text-sm text-text-secondary">
        <input
          type="checkbox"
          name="verified"
          value="true"
          defaultChecked={query.verified}
          className="size-4 rounded border-border-default bg-bg-near-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
        />
        Data verified only
      </label>

      <button
        type="submit"
        className="h-10 rounded-[10px] border border-border-default bg-bg-elevated px-4 text-sm font-medium text-text-primary hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
      >
        Apply
      </button>
    </form>
  );
}

/** Real anchors, never infinite scroll — the directory must be crawlable (§12). */
function Pagination({
  query,
  totalPages,
}: {
  query: DirectoryQuery;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  const previous = query.page > 1 ? query.page - 1 : null;
  const next = query.page < totalPages ? query.page + 1 : null;

  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center gap-3">
      {previous ? (
        <Link
          href={directoryHref(query, { page: previous })}
          rel="prev"
          className="rounded-[10px] border border-border-default bg-bg-elevated px-4 py-2 text-sm text-text-primary hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
        >
          Previous
        </Link>
      ) : null}

      <span className="text-sm text-text-muted">
        Page {query.page} of {totalPages}
      </span>

      {next ? (
        <Link
          href={directoryHref(query, { page: next })}
          rel="next"
          className="rounded-[10px] border border-border-default bg-bg-elevated px-4 py-2 text-sm text-text-primary hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
        >
          Next
        </Link>
      ) : null}
    </nav>
  );
}
