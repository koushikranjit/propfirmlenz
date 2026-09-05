import Link from "next/link";
import { FirmLogo } from "@/components/public/firm-profile/FirmLogo";
import type { FirmSummary } from "@/lib/repositories/public-firms";

const offers = [
  { label: "Research verified", accent: "brand-cyan" },
  { label: "Rules documented", accent: "brand-blue" },
  { label: "Payout terms", accent: "brand-violet" },
];

export function ReferencePreview({ firms }: { firms: FirmSummary[] }) {
  const visible = firms.slice(0, 6);

  return (
    <>
      <section className="border-y border-brand-cyan/20 bg-bg-near-black py-5" aria-label="Prop Firm Lenz research highlights">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
            <div className="rounded-[16px] border border-brand-cyan/50 bg-bg-elevated p-4 shadow-[0_0_50px_rgba(25,230,210,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-text-primary sm:text-base">Research signals from published sources</h2>
                <span className="rounded-full border border-brand-cyan/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-cyan">Live desk</span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {offers.map((offer) => (
                  <div key={offer.label} className="rounded-[12px] border border-border-default bg-bg-card p-3">
                    <span className="mb-3 block h-1 rounded-full bg-[image:var(--gradient-brand)]" aria-hidden="true" />
                    <p className="text-sm font-semibold text-text-primary">{offer.label}</p>
                    <p className="mt-1 text-xs text-text-muted">Recorded, dated, and easy to compare.</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[16px] border border-brand-violet/50 bg-bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-violet">Why Lenz</p>
              <p className="mt-2 text-lg font-semibold text-text-primary">No invented rankings. Just sourced detail.</p>
              <Link href="/prop-firms" className="mt-4 inline-flex text-sm font-semibold text-brand-cyan hover:text-text-primary">Open the directory →</Link>
            </div>
          </div>
        </div>
      </section>

      {visible.length > 0 ? (
        <section className="border-b border-border-subtle bg-bg-base py-10 sm:py-14" aria-labelledby="firm-preview-heading">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-cyan">Directory preview</p>
                <h2 id="firm-preview-heading" className="mt-2 text-2xl font-semibold text-text-primary sm:text-3xl">Compare firms at a glance</h2>
              </div>
              <Link href="/prop-firms" className="rounded-full border border-border-default px-4 py-2 text-sm font-semibold text-text-primary hover:border-brand-cyan">View all firms</Link>
            </div>
            <div className="mt-6 overflow-x-auto rounded-[16px] border border-border-default bg-bg-card">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-[2fr_1fr_1.1fr_1fr_auto] gap-4 border-b border-border-subtle px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted sm:px-5">
                  <span>Firm</span><span>Challenges</span><span>Headquarters</span><span>Verification</span><span>Action</span>
                </div>
                <div className="divide-y divide-border-subtle">
                  {visible.map((firm) => (
                    <div key={firm.id} className="grid grid-cols-[2fr_1fr_1.1fr_1fr_auto] items-center gap-4 px-4 py-4 transition-colors hover:bg-bg-elevated sm:px-5">
                      <div className="flex min-w-0 items-center gap-3"><FirmLogo logo={firm.logo} size={42} /><div className="min-w-0"><p className="truncate text-sm font-semibold text-text-primary">{firm.name}</p><p className="text-xs text-text-muted">{firm.tagline || "Published firm profile"}</p></div></div>
                      <span className="text-sm tabular-nums text-text-secondary">{firm.challengeCount || "—"}</span>
                      <span className="text-sm text-text-secondary">{firm.headquartersCountry || "Not specified"}</span>
                      <span className={firm.isVerified ? "text-sm font-semibold text-success" : "text-sm text-text-muted"}>{firm.isVerified ? "Verified" : "Unverified"}</span>
                      <Link href={`/prop-firms/${firm.slug}`} className="rounded-full border border-brand-violet px-3 py-2 text-xs font-semibold text-text-primary hover:bg-bg-elevated">View firm</Link>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
