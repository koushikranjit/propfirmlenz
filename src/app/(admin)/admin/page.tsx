import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth/current-admin";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getAdminCounts } from "@/lib/repositories/admin-firms";
import { visibleGroups } from "@/components/admin/nav";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { Card, PageHeader } from "@/components/ui/primitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

/**
 * Dashboard shell — docs/ADMIN.md §4.
 *
 * Every number below is a LIVE QUERY. There are no hard-coded, cached-stale, or
 * estimated figures, and no revenue, conversion, click or ranking estimates
 * until real data exists (docs/ADMIN.md §4 `[LOCKED]`, docs/CLAUDE.md §3).
 */
export default async function AdminDashboardPage() {
  const admin = await requireAdmin("/admin");
  const db = getDb();

  const canReadFirms = admin.can(PERMISSIONS.FIRM_READ);
  const counts = canReadFirms ? await getAdminCounts(db) : null;

  const groups = visibleGroups(admin.permissions);

  return (
    <>
      <Breadcrumbs items={[{ label: "Admin" }, { label: "Dashboard" }]} />
      <PageHeader
        title={`Welcome, ${admin.fullName}`}
        description="Prop Firm Lenz Master Admin."
      />

      {counts ? (
        <section aria-labelledby="counts-heading" className="mt-6">
          <h2 id="counts-heading" className="sr-only">
            Current counts
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Prop firms" value={counts.firms} />
            <Stat label="Published" value={counts.published} />
            <Stat label="Unpublished drafts" value={counts.drafts} />
            <Stat label="Pending draft edits" value={counts.pendingDrafts} />
            <Stat label="Challenges" value={counts.challenges} />
            <Stat label="Active offers" value={counts.activeOffers} />
          </div>

          {counts.firms === 0 ? (
            <Card className="mt-4 p-6">
              <p className="text-sm font-semibold text-text-primary">
                No prop firms yet.
              </p>
              <p className="mt-1 text-sm text-text-muted">
                Firm data is entered here by a human, never generated. Create
                the first firm to begin.
              </p>
              <Link
                href="/admin/prop-firms/new"
                className="mt-3 inline-flex h-9 items-center rounded-[10px] bg-[image:var(--gradient-brand)] px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
              >
                Create a prop firm
              </Link>
            </Card>
          ) : null}
        </section>
      ) : null}

      {/*
        Ratings, reviews, payouts, affiliate revenue and traffic are NOT shown.
        Those columns and tables do not exist yet, and inventing a figure would
        violate docs/CLAUDE.md §3. They appear when the data does.
      */}

      <section aria-labelledby="nav-heading" className="mt-10">
        <h2
          id="nav-heading"
          className="text-sm font-semibold uppercase tracking-wide text-text-secondary"
        >
          Management areas
        </h2>
        <div className="mt-3 grid gap-6 sm:grid-cols-2">
          {groups.map((group) => (
            <Card key={group.label} className="p-4">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-text-metadata">
                {group.label}
              </h3>
              <ul className="mt-3 grid grid-cols-2 gap-2">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex flex-col rounded-[10px] border border-border-subtle bg-bg-elevated px-3 py-2 transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
                    >
                      <span className="truncate text-sm text-text-primary">
                        {item.label}
                      </span>
                      {!item.implemented ? (
                        <span className="text-[11px] text-text-metadata">
                          Not implemented yet
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-text-metadata">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">
        {value}
      </p>
    </Card>
  );
}
