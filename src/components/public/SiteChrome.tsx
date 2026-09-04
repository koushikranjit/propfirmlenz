import Link from "next/link";
import { SITE_NAME } from "@/lib/seo/site";

/**
 * Public site chrome — docs/DESIGN.md §3, §7.
 *
 * The header uses the OFFICIAL logo asset, unmodified. It is never recreated,
 * redrawn, restyled, or substituted (CLAUDE.md §12.2 rule 8 `[LOCKED]`).
 *
 * The footer carries the affiliate disclosure. Affiliate relationships must be
 * disclosed and must never alter how data is presented (§12.1 rule 4).
 */
export function SiteHeader() {
  return (
    <header className="border-b border-border-subtle">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-3 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- the official lockup is a fixed local asset with known dimensions; the optimiser adds nothing and must not re-encode brand artwork. */}
          <img
            src="/brand/Prop Firm Lenz logo.png"
            alt={SITE_NAME}
            width={160}
            height={32}
            className="h-8 w-auto"
          />
        </Link>

        <nav aria-label="Primary">
          <Link
            href="/prop-firms"
            className="rounded px-3 py-2 text-sm font-medium text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
          >
            Prop firms
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border-subtle">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-text-muted sm:px-6">
        <p>
          {SITE_NAME} is a prop firm comparison and data platform. It is not a
          proprietary trading firm, not a broker, and not a financial adviser.
          Nothing here is financial advice.
        </p>
        <p>
          Some outbound links are affiliate links and may earn {SITE_NAME} a
          commission. Affiliate relationships never change the data, the
          ordering, or how a firm is presented.
        </p>
        <p>
          Every figure on this site is entered from a firm&apos;s own published
          sources. Where a value has not been published, the page says so rather
          than estimating it.
        </p>
      </div>
    </footer>
  );
}
