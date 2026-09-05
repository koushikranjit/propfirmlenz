"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FirmLogo } from "@/components/public/firm-profile/FirmLogo";
import type { FirmSummary } from "@/lib/repositories/public-firms";

type FirmTab = "firms" | "challenges" | "offers" | "reviews";

const videos = [
  { title: "How to compare prop firm rules", meta: "Research guide" },
  { title: "Payout evidence explained", meta: "Payouts" },
  { title: "Choosing a challenge", meta: "Challenge guide" },
  { title: "What verified data means", meta: "Methodology" },
];

const resources = [
  ["Prop firm lists", "Compare firms by country, platforms, payouts, and key criteria.", "/prop-firms"],
  ["Payment options", "Explore firms by supported payment methods and payout routes.", "/payouts"],
  ["Futures", "Compare futures-focused programs, rules, and market access.", "/prop-firms?market=futures"],
  ["Prop firm demo access", "Review published firm details before committing to a challenge.", "/prop-firms"],
] as const;

const faq = [
  ["Which prop firm is the best?", "The best firm depends on your goals, challenge rules, payout terms, and preferred market. Use the directory to compare sourced details."],
  ["What should I compare first?", "Start with drawdown, profit targets, supported platforms, payout timing, restrictions, and the evidence behind each claim."],
  ["What is the best futures prop firm?", "Filter the directory for futures programs and compare rules, supported markets, account sizes, and verification status."],
  ["How does Prop Firm Lenz verify data?", "We organize published firm information and evidence so traders can inspect the source context before deciding."],
] as const;

function Stars({ value }: { value: number }) {
  return <span className="text-xs tracking-tight text-brand-cyan" aria-label={`${value} out of 5 stars`}>{"★".repeat(Math.max(1, Math.min(5, Math.round(value))))}{"☆".repeat(Math.max(0, 5 - Math.round(value)))}</span>;
}

export function ReferenceLanding({ firms }: { firms: FirmSummary[] }) {
  const [tab, setTab] = useState<FirmTab>("firms");
  const [videoIndex, setVideoIndex] = useState(0);
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const visibleFirms = useMemo(() => firms.slice(0, 10), [firms]);
  const visibleVideos = Array.from({ length: Math.min(4, videos.length) }, (_, index) => videos[(videoIndex + index) % videos.length]).filter((video): video is (typeof videos)[number] => Boolean(video));

  function subscribe(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim() && email.includes("@")) setSubscribed(true);
  }

  return (
    <div className="bg-bg-base">
      <section className="mx-auto max-w-[1440px] px-4 pb-12 pt-8 sm:px-8">
        <div className="flex flex-wrap justify-center gap-3" role="tablist" aria-label="Directory views">
          {(["firms", "challenges", "offers", "reviews"] as FirmTab[]).map((value) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`rounded-full px-6 py-3 text-sm font-semibold capitalize transition-colors ${tab === value ? "bg-bg-elevated text-text-primary ring-1 ring-brand-cyan" : "bg-bg-card text-text-muted hover:text-text-primary"}`}>
              {value}
            </button>
          ))}
          <Link href="/prop-firms?market=futures" className="rounded-full border border-brand-violet px-6 py-3 text-sm font-semibold text-text-primary hover:bg-bg-card">Futures firms <span className="ml-1 rounded-full bg-brand-violet/20 px-2 py-0.5 text-xs text-brand-violet">Trending</span></Link>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {['Filter', 'Popular', 'Favorite 0/5', 'New', 'All'].map((filter, index) => <button key={filter} type="button" className={`rounded-full px-4 py-2 text-xs font-semibold ${index === 1 ? "border border-brand-cyan text-text-primary" : "bg-bg-card text-text-secondary hover:text-text-primary"}`}>{filter}</button>)}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/prop-firms?verified=true" className="rounded-full border border-brand-violet px-4 py-2 text-xs font-semibold text-text-primary">How we verify and rank firms</Link>
            <span className="rounded-full bg-success/10 px-4 py-2 text-xs font-semibold text-success">Live data · updated now</span>
          </div>
        </div>

        <div className="mt-10 overflow-x-auto">
          <div className="min-w-[1050px]">
            <div className="grid grid-cols-[2fr_1fr_1.2fr_1fr_1.8fr_1.2fr_1.3fr_auto] gap-3 px-4 py-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              <span>Firm</span><span>Rank / reviews</span><span>Country</span><span>Years active</span><span>Assets / platforms</span><span>Allocation</span><span>Promo</span><span>Action</span>
            </div>
            <div className="space-y-3">
              {visibleFirms.length > 0 ? visibleFirms.map((firm, index) => <div key={firm.id} className="grid grid-cols-[2fr_1fr_1.2fr_1fr_1.8fr_1.2fr_1.3fr_auto] items-center gap-3 rounded-2xl border border-border-default bg-bg-card px-4 py-4 transition-colors hover:border-brand-cyan/50">
                <Link href={`/prop-firms/${firm.slug}`} className="flex min-w-0 items-center gap-3"><span className="text-xs text-brand-cyan">{index + 1}</span><FirmLogo logo={firm.logo} size={54} /><span className="min-w-0"><strong className="block truncate text-sm text-text-primary">{firm.name}</strong><small className="text-xs text-text-muted">{firm.isVerified ? "Verified" : "Published"}</small></span></Link>
                <div><strong className="block text-sm text-text-primary">Published</strong><Stars value={firm.isVerified ? 5 : 0} /><small className="block text-xs text-text-muted">{firm.isVerified ? "Verified record" : "Source record"}</small></div>
                <span className="text-sm text-text-secondary">{firm.headquartersCountry ?? "Not specified"}</span>
                <span className="text-sm text-text-secondary">{firm.updatedAt ? new Date(firm.updatedAt).getFullYear() : "—"}</span>
                <div className="flex flex-wrap gap-1"><span className="rounded-full bg-bg-elevated px-2 py-1 text-xs text-text-secondary">FX</span><span className="rounded-full bg-bg-elevated px-2 py-1 text-xs text-text-secondary">Indices</span><span className="rounded-full bg-bg-elevated px-2 py-1 text-xs text-text-secondary">Crypto</span></div>
                <span className="text-sm font-semibold text-text-primary">{firm.challengeCount} challenges</span>
                <span className="rounded-lg border border-brand-violet px-3 py-2 text-center text-xs font-semibold text-text-primary">View offer</span>
                <Link href={`/prop-firms/${firm.slug}`} className="rounded-full border border-brand-cyan px-3 py-2 text-xs font-semibold text-text-primary">Firm</Link>
              </div>) : <div className="rounded-2xl border border-dashed border-border-default px-6 py-14 text-center text-sm text-text-muted">Published firms will appear here when backend records are available.</div>}
            </div>
          </div>
        </div>
        <div className="mt-7 text-center"><Link href="/prop-firms" className="rounded-full border border-brand-violet px-5 py-3 text-sm font-semibold text-text-primary hover:bg-bg-card">View all</Link></div>
      </section>

      <section className="border-y border-border-subtle py-16"><div className="mx-auto max-w-[1440px] px-4 sm:px-8"><div className="flex items-center justify-between gap-4"><h2 className="text-3xl font-bold text-text-primary">Watch our latest videos</h2><div className="flex gap-2"><button type="button" onClick={() => setVideoIndex((index) => (index - 1 + videos.length) % videos.length)} className="size-10 rounded-full border border-border-default text-text-primary" aria-label="Previous videos">‹</button><button type="button" onClick={() => setVideoIndex((index) => (index + 1) % videos.length)} className="size-10 rounded-full border border-border-default text-text-primary" aria-label="Next videos">›</button></div></div><div className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-4">{visibleVideos.map((video) => <article key={video.title} className="rounded-2xl border border-border-default bg-bg-card p-5"><div className="flex aspect-video items-center justify-center rounded-xl bg-[image:var(--gradient-brand-soft)] text-4xl text-brand-cyan">▶</div><p className="mt-4 font-semibold text-text-primary">{video.title}</p><p className="mt-2 text-xs text-text-muted">{video.meta} · Prop Firm Lenz</p></article>)}</div><div className="mx-auto mt-7 flex max-w-2xl items-center justify-between rounded-2xl border border-border-default bg-bg-card px-5 py-4"><span className="font-semibold text-text-primary">Prop Firm Lenz on YouTube</span><Link href="/prop-firms" className="rounded-full border border-brand-violet px-4 py-2 text-sm font-semibold text-text-primary">All videos</Link></div></div></section>

      <section className="mx-auto grid max-w-[1440px] gap-4 px-4 py-16 sm:px-8 md:grid-cols-2">{resources.map(([title, description, href]) => <article key={title} className="rounded-2xl border border-border-default bg-bg-card p-7"><span className="flex size-12 items-center justify-center rounded-full border border-brand-violet text-xl text-brand-violet">◆</span><h2 className="mt-6 text-xl font-bold text-text-primary">{title}</h2><p className="mt-3 max-w-xl leading-relaxed text-text-secondary">{description}</p><Link href={href} className="mt-7 inline-flex text-sm font-semibold text-brand-cyan">Learn more →</Link></article>)}</section>

      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-8"><h2 className="text-center text-3xl font-bold text-text-primary">Homepage FAQ</h2><div className="mt-8 divide-y divide-border-subtle border-y border-border-subtle">{faq.map(([question, answer]) => <details key={question} className="group py-5"><summary className="cursor-pointer list-none text-lg font-semibold text-text-primary [&::-webkit-details-marker]:hidden">{question}<span className="float-right text-brand-cyan">+</span></summary><p className="mt-4 leading-relaxed text-text-secondary">{answer}</p></details>)}</div><div className="mt-8 text-center"><Link href="/payouts" className="rounded-full border border-brand-violet px-5 py-3 text-sm font-semibold text-text-primary">Help center</Link></div></section>

      <section className="mx-auto max-w-[1440px] px-4 pb-16 sm:px-8"><div className="rounded-2xl border border-border-default bg-[image:var(--gradient-brand-soft)] px-6 py-16 text-center"><p className="text-sm font-semibold uppercase tracking-[0.14em] text-brand-cyan">Stay connected</p><h2 className="mx-auto mt-4 max-w-2xl text-3xl font-bold text-text-primary sm:text-5xl">Subscribe for the latest prop trading research and deals</h2><form onSubmit={subscribe} className="mx-auto mt-8 flex max-w-md gap-2 rounded-full border border-border-default bg-bg-card p-1"><label htmlFor="landing-email" className="sr-only">Email address</label><input id="landing-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Your email" className="min-w-0 flex-1 bg-transparent px-4 text-sm text-text-primary outline-none" /><button type="submit" className="rounded-full bg-[image:var(--gradient-brand)] px-5 py-3 text-sm font-bold text-bg-base">{subscribed ? "Subscribed" : "Subscribe"}</button></form></div></section>
    </div>
  );
}
