import Link from "next/link";
import type { FirmSummary } from "@/lib/repositories/public-firms";
import { formatDate } from "@/lib/view/format";

/**
 * Recently verified firms — docs/PROJECT.md §6.6, §7 rule 2 `[LOCKED]`.
 *
 * Ordered by the real `verified_at` timestamp an admin wrote when they checked
 * the firm's recorded data against its own published sources.
 *
 * Deliberately NOT `updated_at`. That column moves for reasons unrelated to
 * verification, and presenting an edit as a check would be a false trust
 * signal — the exact claim this section exists to make honestly.
 *
 * A firm with no verification date can never appear here, so the section is
 * either accurate or absent.
 */
export function RecentlyVerified({ firms }: { firms: FirmSummary[] }) {
  return (
    <ul className="divide-y divide-border-subtle rounded-[16px] border border-border-default bg-bg-card shadow-[0_12px_40px_rgba(0,0,0,0.14)]">
      {firms.map((firm) => {
        const verifiedOn = formatDate(firm.verifiedAt);

        return (
          <li
            key={firm.id}
            className="relative flex flex-wrap items-center justify-between gap-3 px-5 py-4"
          >
            <div className="min-w-0">
              <h3 className="text-base font-medium text-text-primary">
                <Link
                  href={`/prop-firms/${firm.slug}`}
                  className="rounded after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                >
                  Research {firm.name}
                </Link>
              </h3>
              {firm.tagline ? (
                <p className="mt-0.5 line-clamp-1 text-sm text-text-muted">
                  {firm.tagline}
                </p>
              ) : null}
            </div>

            {/* The date is the point of the section, so it is stated, not implied. */}
            {verifiedOn ? (
              <p className="text-sm text-text-muted">
                Checked{" "}
                <time dateTime={firm.verifiedAt ?? undefined}>
                  {verifiedOn}
                </time>
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
