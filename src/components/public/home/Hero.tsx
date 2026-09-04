import Link from "next/link";
import { SITE_NAME } from "@/lib/seo/site";

/**
 * The landing hero — docs/DESIGN.md §4.2 (`display` is hero-only), §10.
 *
 * COPY DISCIPLINE `[LOCKED]`
 *
 * Every claim here describes what the product DOES, not how good it is. There
 * is no "best", "most accurate", "largest database", "100% trusted" or
 * "guaranteed" anywhere, because nothing in the database could substantiate
 * one (CLAUDE.md §3, docs/PROJECT.md §7).
 *
 * The counts are real, computed values. When the database holds nothing they
 * are simply absent — never rendered as zero-as-achievement, and never
 * invented.
 */
export function Hero({
  firmCount,
  verifiedCount,
}: {
  firmCount: number;
  verifiedCount: number;
}) {
  return (
    <section className="relative overflow-hidden border-b border-border-subtle">
      {/*
        A single restrained gradient wash, low opacity, behind the text. One
        gradient per view (docs/DESIGN.md §2.2) and no glow (§10).
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 h-80 bg-[image:var(--gradient-brand)] opacity-[0.07] blur-3xl"
      />

      <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
            Prop firm research
          </p>

          <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight text-text-primary sm:text-5xl lg:text-[3.5rem]">
            Research prop firms before you buy
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-secondary">
            {SITE_NAME} records what proprietary trading firms actually publish
            — challenge pricing, account sizes, drawdown limits, profit targets,
            trading rules, platforms, payout terms and current offers — in one
            structured format you can read side by side.
          </p>

          <p className="mt-4 max-w-2xl text-text-muted">
            Every figure comes from a firm&apos;s own published sources and
            carries the date it was checked. Where a firm has not published
            something, this site says so instead of estimating it.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/prop-firms"
              className="inline-flex h-12 items-center justify-center rounded-[10px] bg-[image:var(--gradient-brand)] px-6 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
            >
              Browse prop firms
            </Link>
            {/*
              The comparison feature is Phase 4 and `/compare` does not exist,
              so the secondary CTA points at a real in-page destination rather
              than a route invented for the button (docs/ROADMAP.md §1.5).
            */}
            <a
              href="#how-it-works"
              className="inline-flex h-12 items-center justify-center rounded-[10px] border border-border-default bg-bg-elevated px-6 text-sm font-semibold text-text-primary hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
            >
              How this site works
            </a>
          </div>

          {firmCount > 0 ? (
            <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4">
              <Stat
                value={firmCount}
                label={`prop firm${firmCount === 1 ? "" : "s"} documented`}
              />
              {verifiedCount > 0 ? (
                <Stat
                  value={verifiedCount}
                  label="with data checked against published sources"
                />
              ) : null}
            </dl>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** A COUNTED value, read from the database. Never an estimate or a target. */
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="block text-2xl font-semibold tabular-nums text-text-primary">
          {value}
        </span>
        <span className="mt-0.5 block max-w-[16rem] text-sm text-text-muted">
          {label}
        </span>
      </dd>
    </div>
  );
}
