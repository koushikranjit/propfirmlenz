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

/**
 * The official lockup, used unmodified (docs/DESIGN.md §3 `[LOCKED]`).
 *
 * `logo-576.png` is the SAME artwork scaled down — no crop, no recolour, no
 * redraw. The 1774px master is 500KB, which is half a megabyte spent on a mark
 * that renders about 200px wide, in the header, where LCP is measured.
 *
 * Sized generously on purpose. The lockup carries a wide black margin, so the
 * visible mark is roughly two-thirds of the box height: at a "standard" 32px
 * the wordmark reads about 19px and looks like an afterthought.
 */
function Wordmark({ className = "h-11 sm:h-14" }: { className?: string }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- a fixed local asset already stored at delivery size; the optimiser would re-encode brand artwork for no gain. */
    <img
      src="/brand/logo-576.png"
      alt={SITE_NAME}
      width={576}
      height={288}
      className={`${className} w-auto`}
    />
  );
}

export function SiteHeader() {
  const secondaryNav = [
    { href: "/", label: "Home" },
    { href: "/prop-firms", label: "Offers" },
    { href: "/prop-firms", label: "Challenges" },
    { href: "/prop-firms", label: "Best Sellers" },
    { href: "/prop-firms?verified=true", label: "Reviews" },
    { href: "/prop-firms?favorite=true", label: "Favorite Firms" },
    { href: "/prop-firms", label: "Prop Firm Rules" },
    { href: "/prop-firms", label: "Compare Firms" },
    { href: "/payouts", label: "Spreads" },
    { href: "/payouts", label: "Payouts" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-bg-base/95 backdrop-blur">
      <div className="flex h-14 items-center justify-center bg-[image:var(--gradient-brand)] px-4 text-sm font-semibold text-bg-base">
        <span>Source-led prop firm research</span>
        <span aria-hidden className="mx-2">→</span>
        <Link href="/payouts" className="rounded-full bg-bg-base px-4 py-1.5 text-xs font-semibold text-text-primary hover:bg-bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bg-base focus-visible:ring-offset-2 focus-visible:ring-offset-brand-violet">
          Explore payouts
        </Link>
      </div>

      <div className="mx-auto max-w-[1440px] px-4 sm:px-8">
        <div className="flex min-h-[68px] items-center gap-4 border-b border-border-subtle">
          <Link href="/" className="flex shrink-0 items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base">
            <Wordmark className="h-12 sm:h-14" />
            <span className="sr-only">{SITE_NAME} home</span>
          </Link>
          <span className="hidden h-7 w-px bg-border-default sm:block" aria-hidden />
          <Link href="/prop-firms" aria-label="Browse all firms" className="hidden size-10 items-center justify-center rounded-lg text-text-primary hover:bg-bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan sm:flex">
            <span aria-hidden className="grid grid-cols-3 gap-1">
              {Array.from({ length: 9 }).map((_, index) => <span key={index} className="size-1.5 rounded-[2px] bg-current" />)}
            </span>
          </Link>
          <form action="/prop-firms" method="get" role="search" className="hidden min-w-0 max-w-[290px] flex-1 sm:block">
            <label htmlFor="site-header-search" className="sr-only">Search prop firms</label>
            <div className="flex h-11 items-center rounded-full border border-border-default bg-bg-card px-4 focus-within:border-brand-cyan">
              <span aria-hidden className="mr-2 text-lg text-text-muted">⌕</span>
              <input id="site-header-search" name="q" type="search" placeholder="Search" className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted" />
            </div>
          </form>
          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            <div className="hidden rounded-full border border-brand-violet bg-bg-card p-1 text-sm font-semibold sm:flex">
              <span className="rounded-full bg-[image:var(--gradient-brand)] px-4 py-2 text-bg-base">Research</span>
              <Link href="/payouts" className="px-4 py-2 text-text-primary hover:text-brand-cyan">Payouts</Link>
            </div>
            <Link href="/prop-firms" className="hidden rounded-full border border-brand-cyan/50 px-4 py-2 text-sm font-semibold text-text-primary hover:bg-bg-elevated md:inline-flex">Browse firms</Link>
            <span className="hidden rounded-full border border-border-default px-3 py-2 text-sm font-semibold text-text-primary lg:inline-flex">Live data</span>
            <span className="flex size-9 items-center justify-center rounded-full bg-[image:var(--gradient-brand)] text-xs font-bold text-bg-base" aria-label="Prop Firm Lenz account">PL</span>

            <details className="group relative sm:hidden">
              <summary aria-label="Open navigation menu" className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full border border-border-default text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan [&::-webkit-details-marker]:hidden">
                <span aria-hidden className="flex flex-col gap-1"><span className="h-0.5 w-5 bg-current" /><span className="h-0.5 w-5 bg-current" /><span className="h-0.5 w-5 bg-current" /></span>
              </summary>
              <nav aria-label="Mobile primary" className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-border-default bg-bg-card p-3 shadow-2xl">
                <div className="flex flex-col gap-1">
                  {secondaryNav.map((item) => <Link key={`${item.href}-${item.label}`} href={item.href} className={`${NAV_LINK_CLASS} block`}>{item.label}</Link>)}
                </div>
              </nav>
            </details>
            <span aria-hidden className="hidden text-3xl text-text-primary sm:inline">☰</span>
          </div>
        </div>

        <nav aria-label="Secondary" className="hidden min-h-[54px] items-end justify-between gap-2 overflow-x-auto sm:flex">
          {secondaryNav.map((item, index) => (
            <Link key={`${item.href}-${item.label}`} href={item.href} className={`relative whitespace-nowrap px-3 pb-4 pt-4 text-sm font-medium ${index === 0 ? "text-text-primary after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-brand-cyan" : "text-text-muted hover:text-text-primary"}`}>
              {item.label}
              {item.label === "Compare Firms" && <span className="ml-2 rounded-full bg-brand-cyan/15 px-2 py-1 text-[10px] text-brand-cyan">New</span>}
            </Link>
          ))}
        </nav>
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
            {/* The footer is where the mark gets its own space, so it is the
                one place it is not competing with navigation. */}
            <Wordmark className="h-14 sm:h-16" />
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
