"use client";

import Link from "next/link";

/**
 * Public error boundary.
 *
 * `"use client"` is a React requirement for an error boundary, not a choice —
 * it is the one client component on the public surface, and it renders nothing
 * until something has already failed.
 *
 * It shows a plain apology and a way back. It deliberately does NOT render
 * `error.message`, a stack, or a digest: internal error detail is never exposed
 * to a visitor (CLAUDE.md §6 `[LOCKED]`). The digest is available in server
 * logs for anyone who needs to correlate a report.
 */
export default function PublicError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        Something went wrong loading this page
      </h1>
      <p className="mt-3 text-text-muted">
        This is a problem on our side, not with your request. Nothing has been
        changed or saved.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center justify-center rounded-[10px] bg-[image:var(--gradient-brand)] px-5 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
        >
          Try again
        </button>
        <Link
          href="/prop-firms"
          className="inline-flex h-11 items-center justify-center rounded-[10px] border border-border-default bg-bg-elevated px-5 text-sm font-medium text-text-primary hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
        >
          Go to the prop firm directory
        </Link>
      </div>
    </div>
  );
}
