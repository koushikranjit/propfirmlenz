import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { requireAdminPermission } from "@/lib/auth/current-admin";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  CANDIDATE_PAGE_SIZE,
  countCandidatesByStatus,
  listCandidates,
} from "@/lib/repositories/admin-payouts";
import { getPayoutTotals } from "@/lib/repositories/public-payouts";
import { candidateQuerySchema } from "@/lib/validation/payouts";
import { CANDIDATE_STATUS } from "@/lib/db/schema/payouts";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { CandidateCard } from "@/components/admin/payouts/CandidateReview";
import { PayoutNav } from "@/components/admin/payouts/PayoutNav";
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Payout candidates" };

/**
 * PAYOUT REVIEW QUEUE — docs/PAYOUTS.md §11.
 *
 * The queue is the product. Every public payout figure passed through here,
 * one decision at a time, attributed to a person.
 *
 * Viewing needs `firm:read`; DECIDING needs `firm:verify`, enforced in the
 * service — the controls below are hidden without it, but that is presentation.
 */

const STATUS_LABEL: Record<string, string> = {
  detected: "Detected",
  match_review: "In review",
  verified: "Verified",
  rejected: "Rejected",
  unverified: "Unverifiable",
};

export default async function AdminPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdminPermission(PERMISSIONS.FIRM_READ);
  const query = candidateQuerySchema.parse(await searchParams);
  const db = getDb();

  const [counts, { rows, total }, published] = await Promise.all([
    countCandidatesByStatus(db),
    listCandidates(db, { status: query.status, page: query.page }),
    getPayoutTotals(db, "all"),
  ]);

  const canVerify = admin.can(PERMISSIONS.FIRM_VERIFY);
  const pages = Math.max(1, Math.ceil(total / CANDIDATE_PAGE_SIZE));

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Admin", href: "/admin" }, { label: "Payouts" }]}
      />
      <PayoutNav current="/admin/payouts/candidates" />
      <PageHeader
        title="Payout candidates"
        description="Blockchain transactions from tracked wallets, awaiting a decision. Only verified ones appear publicly."
      />

      <p className="mt-4 text-sm text-text-muted">
        {published.count === 0
          ? "No payouts are published yet."
          : `${published.count} verified payout${
              published.count === 1 ? "" : "s"
            } are published across live firms.`}{" "}
        Verified on-chain volume is a floor, never a firm&apos;s total payout
        volume — see the{" "}
        <Link
          href="/payouts/methodology"
          className="rounded text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
        >
          public methodology
        </Link>
        .
      </p>

      <nav aria-label="Candidate status" className="mt-6">
        <ul className="flex flex-wrap gap-2">
          {CANDIDATE_STATUS.map((status) => {
            const active = status === query.status;
            return (
              <li key={status}>
                <Link
                  href={`/admin/payouts/candidates?status=${status}`}
                  aria-current={active ? "page" : undefined}
                  className={
                    "inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base " +
                    (active
                      ? "border-brand-cyan/50 bg-bg-elevated text-brand-cyan"
                      : "border-border-default bg-bg-card text-text-secondary hover:border-border-strong hover:text-text-primary")
                  }
                >
                  {STATUS_LABEL[status] ?? status}
                  <span className="tabular-nums text-xs text-text-muted">
                    {counts[status] ?? 0}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-6 flex flex-col gap-4">
        {rows.length === 0 ? (
          <Card>
            <EmptyState
              title={`Nothing ${(
                STATUS_LABEL[query.status] ?? query.status
              ).toLowerCase()}`}
              description="Candidates appear here after a tracked wallet is scanned. Record a wallet and run a scan to start."
              action={
                <Link href="/admin/payouts/wallets">
                  <Button variant="primary">Tracked wallets</Button>
                </Link>
              }
            />
          </Card>
        ) : (
          rows.map((candidate) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              canVerify={canVerify}
            />
          ))
        )}
      </div>

      {pages > 1 ? (
        <nav aria-label="Pagination" className="mt-6 flex items-center gap-3">
          {query.page > 1 ? (
            <Link
              href={`/admin/payouts/candidates?status=${query.status}&page=${query.page - 1}`}
              className="rounded text-sm text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
            >
              Previous
            </Link>
          ) : null}
          <span className="text-sm text-text-muted">
            Page {query.page} of {pages}
          </span>
          {query.page < pages ? (
            <Link
              href={`/admin/payouts/candidates?status=${query.status}&page=${query.page + 1}`}
              className="rounded text-sm text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
            >
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
