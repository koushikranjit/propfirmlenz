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
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[image:var(--gradient-brand)] opacity-[0.06]" />
      <div className="relative mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
          <div>
            <p className="inline-flex rounded-full border border-brand-cyan/30 bg-bg-elevated px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-brand-cyan">
              Prop firm research desk
            </p>
            <h1 className="mt-5 max-w-3xl text-balance text-4xl font-semibold leading-[1.02] tracking-tight text-text-primary sm:text-6xl">
              Research prop firms before you buy.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-secondary">
              {SITE_NAME} turns each firm&apos;s published rules, challenge terms,
              platforms, payout details and current offers into a structured
              record you can scan with confidence.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/prop-firms" className="inline-flex h-12 items-center justify-center rounded-[10px] bg-[image:var(--gradient-brand)] px-6 text-sm font-semibold text-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base">
                Browse the directory
              </Link>
              <a href="#how-it-works" className="inline-flex h-12 items-center justify-center rounded-[10px] border border-border-default bg-bg-elevated px-6 text-sm font-semibold text-text-primary hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base">
                See how it works
              </a>
            </div>
          </div>

          <div className="rounded-[18px] border border-border-default bg-bg-card/90 p-5 shadow-2xl shadow-brand-indigo/10 sm:p-6">
            <div className="flex items-center justify-between border-b border-border-subtle pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Research signal</p>
                <p className="mt-1 text-sm font-medium text-text-primary">Published source coverage</p>
              </div>
              <span className="size-3 rounded-full bg-brand-cyan shadow-[0_0_18px_var(--brand-cyan)]" aria-hidden />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Signal label="Firms documented" value={firmCount} />
              <Signal label="Verified records" value={verifiedCount} />
            </div>
            <div className="mt-5 rounded-[12px] border border-border-subtle bg-bg-near-black p-4">
              <p className="text-sm font-semibold text-text-primary">What you&apos;ll find</p>
              <ul className="mt-3 grid gap-2 text-sm text-text-muted sm:grid-cols-2">
                <li>Challenge pricing</li><li>Drawdown limits</li><li>Trading platforms</li><li>Payout terms</li>
              </ul>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-text-muted">Dates and values come from each firm&apos;s published sources. Missing information is shown as missing, never estimated.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Signal({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-[12px] border border-border-subtle bg-bg-elevated p-3">
      <span className="block text-2xl font-semibold tabular-nums text-text-primary">{value}</span>
      <span className="mt-1 block text-xs text-text-muted">{label}</span>
    </div>
  );
}

