import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { requireAdminPermission } from "@/lib/auth/current-admin";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listAdminFirms } from "@/lib/repositories/admin-firms";
import { parseFirmListQuery } from "@/lib/validation/firm";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  NotSpecified,
  PageHeader,
} from "@/components/ui/primitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Prop Firms" };

/**
 * Prop Firm list — docs/ADMIN.md §5.
 *
 * Search, filter, sort and pagination are ALL server-side and schema-validated:
 * sort keys come from an allowlist (never interpolated into SQL) and page size
 * is capped, so a crafted URL cannot trigger an unbounded scan.
 *
 * Rating and Review Count render an honest empty state — those columns do not
 * exist until Phase 3 (docs/DATABASE.md §5.1 `[LOCKED]`).
 */
export default async function PropFirmsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdminPermission(PERMISSIONS.FIRM_READ);
  const query = parseFirmListQuery(await searchParams);
  const db = getDb();
  const result = await listAdminFirms(db, query);

  const qs = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { ...query, ...patch } as Record<string, unknown>;
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === "" || v === null) continue;
      p.set(k, String(v));
    }
    return `/admin/prop-firms?${p.toString()}`;
  };

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Admin", href: "/admin" }, { label: "Prop Firms" }]}
      />
      <PageHeader
        title="Prop Firms"
        description={result.total === 1 ? "1 firm" : `${result.total} firms`}
        actions={
          admin.can(PERMISSIONS.FIRM_CREATE) ? (
            <Link
              href="/admin/prop-firms/new"
              className="inline-flex h-10 items-center rounded-[10px] bg-[image:var(--gradient-brand)] px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
            >
              New prop firm
            </Link>
          ) : null
        }
      />

      {/* Filters — a plain GET form, so state lives in the URL and is shareable */}
      <Card className="mt-6 p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <label
              htmlFor="search"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary"
            >
              Search
            </label>
            <input
              id="search"
              name="search"
              type="search"
              defaultValue={query.search ?? ""}
              placeholder="Name, slug or legal name"
              className="w-full rounded-[10px] border border-border-default bg-bg-near-black px-3 py-2 text-sm text-text-primary placeholder:text-text-metadata focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
            />
          </div>

          <SelectFilter
            id="status"
            label="Status"
            defaultValue={query.status ?? ""}
            options={[
              ["", "All"],
              ["draft", "Draft"],
              ["published", "Published"],
              ["archived", "Archived"],
            ]}
          />
          <SelectFilter
            id="verification"
            label="Verification"
            defaultValue={query.verification ?? ""}
            options={[
              ["", "All"],
              ["unverified", "Unverified"],
              ["verified", "Verified"],
              ["needs_review", "Needs review"],
            ]}
          />
          <SelectFilter
            id="sort"
            label="Sort by"
            defaultValue={query.sort}
            options={[
              ["updatedAt", "Last updated"],
              ["createdAt", "Created"],
              ["name", "Name"],
              ["status", "Status"],
              ["country", "Country"],
            ]}
          />
          <SelectFilter
            id="direction"
            label="Order"
            defaultValue={query.direction}
            options={[
              ["desc", "Descending"],
              ["asc", "Ascending"],
            ]}
          />

          <Button type="submit" variant="secondary">
            Apply
          </Button>
          <Link
            href="/admin/prop-firms"
            className="inline-flex h-10 items-center rounded-[10px] px-3 text-sm text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
          >
            Reset
          </Link>
        </form>
      </Card>

      <Card className="mt-4 overflow-hidden">
        {result.rows.length === 0 ? (
          <EmptyState
            title={
              query.search || query.status || query.verification
                ? "No firms match these filters."
                : "No prop firms yet."
            }
            description={
              query.search || query.status || query.verification
                ? "Adjust or reset the filters above."
                : "Firm data is entered here by a human, never generated."
            }
            action={
              admin.can(PERMISSIONS.FIRM_CREATE) ? (
                <Link
                  href="/admin/prop-firms/new"
                  className="inline-flex h-9 items-center rounded-[10px] border border-border-default bg-bg-elevated px-4 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                >
                  Create the first firm
                </Link>
              ) : null
            }
          />
        ) : (
          // Wide tables scroll inside their own container; the page body never
          // scrolls horizontally (docs/DESIGN.md §6).
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-sm">
              <caption className="sr-only">
                Prop firms, page {result.page} of {result.pageCount}
              </caption>
              <thead>
                <tr className="border-b border-border-default text-left text-xs uppercase tracking-wide text-text-metadata">
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Firm
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Country
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Rating
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Reviews
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Active offers
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right font-semibold"
                  >
                    Affiliate clicks
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Last updated
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((firm) => (
                  <tr
                    key={firm.id}
                    className="border-b border-border-subtle last:border-0 hover:bg-bg-elevated"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/prop-firms/${firm.id}`}
                        className="font-medium text-text-primary hover:text-brand-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                      >
                        {firm.name}
                      </Link>
                      <p className="text-xs text-text-metadata">/{firm.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      {firm.headquartersCountry ?? <NotSpecified label="—" />}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          tone={
                            firm.status === "published"
                              ? "success"
                              : firm.status === "archived"
                                ? "neutral"
                                : "info"
                          }
                        >
                          {firm.status}
                        </Badge>
                        {firm.hasDraft ? (
                          <Badge tone="warning">Draft changes</Badge>
                        ) : null}
                        {firm.verificationStatus === "verified" ? (
                          <Badge tone="success">Verified</Badge>
                        ) : null}
                      </div>
                    </td>
                    {/* Rating and Reviews: no such data exists until Phase 3. */}
                    <td className="px-4 py-3">
                      <NotSpecified label="—" />
                    </td>
                    <td className="px-4 py-3">
                      <NotSpecified label="—" />
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {firm.activeOfferCount}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {firm.affiliateClickCount}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      <time dateTime={firm.updatedAt.toISOString()}>
                        {firm.updatedAt.toISOString().slice(0, 10)}
                      </time>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/prop-firms/${firm.id}`}
                        className="rounded text-sm text-brand-cyan hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-3 text-xs text-text-metadata">
        Rating and review data does not exist yet — it arrives in Phase 3. No
        placeholder figures are shown.
      </p>

      {result.pageCount > 1 ? (
        <nav
          aria-label="Pagination"
          className="mt-4 flex items-center justify-between"
        >
          <p className="text-sm text-text-muted">
            Page {result.page} of {result.pageCount}
          </p>
          <div className="flex gap-2">
            {result.page > 1 ? (
              <Link
                href={qs({ page: result.page - 1 })}
                rel="prev"
                className="inline-flex h-9 items-center rounded-[10px] border border-border-default bg-bg-elevated px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
              >
                Previous
              </Link>
            ) : null}
            {result.page < result.pageCount ? (
              <Link
                href={qs({ page: result.page + 1 })}
                rel="next"
                className="inline-flex h-9 items-center rounded-[10px] border border-border-default bg-bg-elevated px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
              >
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </>
  );
}

function SelectFilter({
  id,
  label,
  defaultValue,
  options,
}: {
  id: string;
  label: string;
  defaultValue: string;
  options: [string, string][];
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary"
      >
        {label}
      </label>
      <select
        id={id}
        name={id}
        defaultValue={defaultValue}
        className="rounded-[10px] border border-border-default bg-bg-near-black px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}
