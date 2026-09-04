import Link from "next/link";
import { SITE_NAME } from "@/lib/seo/site";

/**
 * Public site chrome — docs/DESIGN.md §3, §7.7.
 *
 * The header uses the OFFICIAL logo asset, unmodified. It is never recreated,
 * redrawn, restyled, or substituted (CLAUDE.md §12.2 rule 8 `[LOCKED]`).
 *
 * NAVIGATION HONESTY `[LOCKED]`
 *
 * `PRIMARY_NAV` lists only routes that are actually built. Reviews and
 * comparison are real roadmap items (docs/ROADMAP.md Phases 3–4) but have no
 * route, so they appear in the footer as plain text with their phase — never as
 * a link that 404s. A dead nav link is worse than an absent one: it wastes a
 * click, it wastes crawl budget, and it makes the whole site look broken.
 *
 * The mobile menu is a `<details>` disclosure rather than a client component.
 * It is keyboard operable, announces its expanded state to assistive
 * technology, and ships zero JavaScript — which matters most on the surface
 * that is measured on mobile (CLAUDE.md §7).
 */

/** Built routes only. Adding an entry here requires the route to exist. */
const PRIMARY_NAV: { href: string; label: string }[] = [
  { href: "/prop-firms", label: "Prop firms" },
  { href: "/payouts", label: "Payouts" },
];

/**
 * Sections with a committed phase but no route yet. Rendered as TEXT in the
 * footer, never as links (docs/ROADMAP.md).
 */
const PLANNED_SECTIONS: { label: string; phase: string }[] = [
  { label: "Trader reviews", phase: "Phase 3" },
  { label: "Side-by-side comparison", phase: "Phase 4" },
];

const NAV_LINK_CLASS =
  "rounded-[8px] px-3 py-2 text-sm font-medium text-text-secondary " +
  "hover:bg-bg-elevated hover:text-text-primary focus-visible:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-bg-base";

const CTA_CLASS =
  "inline-flex h-10 items-center justify-center rounded-[10px] px-4 text-sm font-semibold " +
  "text-white bg-[image:var(--gradient-brand)] focus-visible:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-bg-base";

function Wordmark() {
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- the official lockup is a fixed local asset with known dimensions; the optimiser adds nothing and must not re-encode brand artwork. */
    <img
      src="/brand/Prop Firm Lenz logo.png"
      alt={SITE_NAME}
      width={160}
      height={32}
      className="h-8 w-auto"
    />
  );
}

export function SiteHeader() {
  return (
    // Sticky with a restrained blur (docs/DESIGN.md §7.7, §10 — subtle, not
    // decorative glassmorphism). The background stays opaque enough that text
    // contrast never depends on what is scrolling underneath.
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-bg-base/90 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link
            href="/"
            className="flex shrink-0 items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
          >
            <Wordmark />
            <span className="sr-only">{SITE_NAME} home</span>
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-1 sm:flex">
            {PRIMARY_NAV.map((item) => (
              <Link key={item.href} href={item.href} className={NAV_LINK_CLASS}>
                {item.label}
              </Link>
            ))}
            <Link href="/prop-firms" className={`${CTA_CLASS} ml-2`}>
              Browse all firms
            </Link>
          </nav>

          {/* Mobile: a disclosure, not a drawer library. No client JS. */}
          <details className="group relative sm:hidden">
            <summary className="flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-border-default px-3 text-sm font-medium text-text-secondary marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base [&::-webkit-details-marker]:hidden">
              <span
                aria-hidden
                className="flex flex-col gap-[3px] transition-none"
              >
                <span className="block h-0.5 w-4 bg-current" />
                <span className="block h-0.5 w-4 bg-current" />
                <span className="block h-0.5 w-4 bg-current" />
              </span>
              Menu
            </summary>

            <nav
              aria-label="Primary"
              className="absolute right-0 z-50 mt-2 w-56 rounded-[14px] border border-border-default bg-bg-card p-2 shadow-lg"
            >
              <ul className="flex flex-col gap-1">
                {PRIMARY_NAV.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`${NAV_LINK_CLASS} block`}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
                <li className="pt-1">
                  <Link href="/prop-firms" className={`${CTA_CLASS} w-full`}>
                    Browse all firms
                  </Link>
                </li>
              </ul>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border-subtle">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
          <div>
            <Wordmark />
            <p className="mt-4 max-w-xs text-sm text-text-muted">
              Structured, sourced information about proprietary trading firms,
              so a trader can research the conditions before paying for a
              challenge.
            </p>
          </div>

          <nav aria-labelledby="footer-research">
            <h2
              id="footer-research"
              className="text-xs font-semibold uppercase tracking-wide text-text-muted"
            >
              Research
            </h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              <li>
                <Link
                  href="/prop-firms"
                  className="rounded text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                >
                  Browse all prop firms
                </Link>
              </li>
              <li>
                <Link
                  href="/prop-firms?verified=true"
                  className="rounded text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                >
                  Firms with verified data
                </Link>
              </li>
            </ul>
          </nav>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Not built yet
            </h2>
            {/*
              Deliberately NOT links. These sections have a committed phase and
              no route, and a link to an unbuilt page would 404.
            */}
            <ul className="mt-3 flex flex-col gap-2 text-sm text-text-muted">
              {PLANNED_SECTIONS.map((section) => (
                <li key={section.label}>
                  {section.label}
                  <span className="ml-2 rounded-full border border-border-default px-2 py-0.5 text-xs">
                    {section.phase}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-border-subtle pt-6 text-sm text-text-muted">
          <p>
            <strong className="font-semibold text-text-secondary">
              Affiliate disclosure.
            </strong>{" "}
            Some outbound links are affiliate links and may earn {SITE_NAME} a
            commission. Affiliate relationships never change the data, the
            ordering, or how a firm is presented.
          </p>
          <p>
            {SITE_NAME} is a prop firm comparison and data platform. It is not a
            proprietary trading firm, not a broker, and not a financial adviser.
            Nothing here is financial advice.
          </p>
          <p>
            Every figure on this site is entered from a firm&apos;s own
            published sources. Where a value has not been published, the page
            says so rather than estimating it.
          </p>
        </div>
      </div>
    </footer>
  );
}
