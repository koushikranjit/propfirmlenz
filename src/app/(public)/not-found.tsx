import Link from "next/link";

/**
 * Public 404 — docs/SEO.md §8.
 *
 * `noindex, follow`: the page should not be indexed, but a crawler that lands
 * here should still follow the links back into the directory. The route also
 * genuinely returns a 404 status, so this is never a soft 404.
 *
 * It says which URL failed only in the general sense — it never echoes the
 * requested path back into the markup, which would reflect arbitrary input.
 */
export const metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function PublicNotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
        404
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-text-primary">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-3 text-text-muted">
        The page may have moved, or the firm you were looking for may not be
        published. Firms that are still being written are not visible here.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/prop-firms"
          className="inline-flex h-11 items-center justify-center rounded-[10px] bg-[image:var(--gradient-brand)] px-5 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
        >
          Browse all prop firms
        </Link>
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-[10px] border border-border-default bg-bg-elevated px-5 text-sm font-medium text-text-primary hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
        >
          Go to the homepage
        </Link>
      </div>
    </div>
  );
}
