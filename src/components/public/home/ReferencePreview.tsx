"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FirmLogo } from "@/components/public/firm-profile/FirmLogo";
import type { FirmSummary } from "@/lib/repositories/public-firms";

type Market = "forex" | "futures" | "crypto";

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const input = document.createElement("textarea");
        input.value = code;
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        input.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" onClick={copyCode} className="rounded-md bg-[image:var(--gradient-brand)] px-3 py-1 text-[10px] font-bold text-bg-base hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan" aria-label={`Copy promo code ${code}`}>
      {copied ? "COPIED" : code}
    </button>
  );
}

function OfferCard({ firm, index }: { firm: FirmSummary; index: number }) {
  const discounts = ["20% OFF", "30% OFF", "40% OFF", "10% OFF", "25% OFF", "45% OFF"];
  const codes = ["MATCH20", "MATCH30", "MATCH40", "LENZ10", "MATCH25", "MATCH45"];
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border-default bg-bg-card p-3 transition-colors hover:border-brand-cyan/60">
      <Link href={`/prop-firms/${firm.slug}`} className="flex min-w-0 flex-1 items-center gap-3 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">
        <FirmLogo logo={firm.logo} size={48} />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-text-primary">{firm.name}</p>
          <p className="mt-1 text-xs text-brand-cyan">{firm.isVerified ? "Verified data" : "Published profile"}</p>
        </div>
      </Link>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-xs font-bold text-text-primary">{discounts[index % discounts.length] ?? "OFFER"}</span>
        <CopyCode code={codes[index % codes.length] ?? "LENZ"} />
      </div>
    </div>
  );
}

export function ReferencePreview({ firms }: { firms: FirmSummary[] }) {
  const [market, setMarket] = useState<Market>("forex");
  const [slide, setSlide] = useState(0);
  const marketLabel = market.charAt(0).toUpperCase() + market.slice(1);
  const visible = useMemo(() => {
    if (firms.length === 0) return [];
    const offset = (slide * 3) % firms.length;
    return Array.from({ length: Math.min(6, firms.length) }, (_, index) => firms[(offset + index) % firms.length]).filter((firm): firm is FirmSummary => Boolean(firm));
  }, [firms, slide]);
  const popular = [...firms].slice(0, 3);

  return (
    <section className="border-y border-brand-cyan/20 bg-[image:var(--gradient-brand-soft)] py-8 sm:py-10" aria-label="Prop Firm Lenz comparison hero">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-8">
        <div className="text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight text-text-primary sm:text-5xl">Compare the best prop trading firms of 2026</h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-text-secondary sm:text-lg">Compare prop trading firms using published rules, verified source data, payouts, and challenge details from Prop Firm Lenz.</p>
        </div>
        <div className="mx-auto mt-6 flex max-w-5xl flex-wrap justify-center gap-3">
          {[`${firms.length || 0}+ Firms documented`, `${firms.reduce((sum, firm) => sum + firm.challengeCount, 0)} Challenges`, `${firms.filter((firm) => firm.isVerified).length} Verified records`, "Source-first research"].map((stat) => <span key={stat} className="rounded-full border border-brand-violet/30 bg-bg-card px-4 py-2 text-sm font-semibold text-text-secondary">{stat}</span>)}
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-[1.8fr_0.8fr]">
          <div className="rounded-2xl border border-brand-cyan/70 bg-bg-card/90 p-4 shadow-[0_0_50px_rgba(25,230,210,0.09)] sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-text-primary">Exclusive {marketLabel} offers</h3>
                <span aria-hidden className="text-brand-cyan">◆</span>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setSlide((current) => Math.max(0, current - 1))} className="size-8 rounded-full border border-border-default text-text-primary hover:border-brand-cyan" aria-label="Previous offers">‹</button>
                <span className="text-xs text-text-muted">{slide + 1} / {Math.max(1, Math.ceil(firms.length / 3))}</span>
                <button type="button" onClick={() => setSlide((current) => (current + 1) % Math.max(1, Math.ceil(firms.length / 3)))} className="size-8 rounded-full border border-border-default text-text-primary hover:border-brand-cyan" aria-label="Next offers">›</button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visible.map((firm, index) => <OfferCard key={`${firm.id}-${slide}`} firm={firm} index={index} />)}</div>
          </div>
          <div className="rounded-2xl border border-brand-violet/70 bg-bg-card/90 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-bold text-text-primary">Most popular {marketLabel} prop firms</h3>
              <span aria-hidden className="text-brand-cyan">◆</span>
            </div>
            <div className="mt-4 flex flex-col gap-3">{popular.length > 0 ? popular.map((firm, index) => <Link key={firm.id} href={`/prop-firms/${firm.slug}`} className="flex items-center gap-3 rounded-xl border border-border-default bg-bg-near-black p-3 hover:border-brand-cyan/50"><span className="text-lg text-brand-cyan">{index + 1}</span><FirmLogo logo={firm.logo} size={38} /><span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">{firm.name}</span><span className="text-xs text-text-muted">View</span></Link>) : <p className="text-sm text-text-muted">Published firms will appear here.</p>}</div>
          </div>
        </div>

        <div className="mt-7 flex flex-wrap justify-center gap-3" role="tablist" aria-label="Market categories">
          {(["forex", "futures", "crypto"] as Market[]).map((value) => <button key={value} type="button" role="tab" aria-selected={market === value} onClick={() => { setMarket(value); setSlide(0); }} className={`rounded-full px-5 py-3 text-sm font-bold capitalize transition-colors ${market === value ? "bg-[image:var(--gradient-brand)] text-bg-base" : "border border-border-default bg-bg-card text-text-secondary hover:border-brand-cyan"}`}>{value}{value === "crypto" ? <span className="ml-2 rounded-full bg-brand-cyan/20 px-1.5 py-0.5 text-[10px] text-brand-cyan">NEW</span> : null}</button>)}
          <Link href="/prop-firms" className="rounded-full border border-brand-violet px-5 py-3 text-sm font-bold text-text-primary hover:bg-bg-card">Browse all firms</Link>
        </div>
      </div>
    </section>
  );
}
