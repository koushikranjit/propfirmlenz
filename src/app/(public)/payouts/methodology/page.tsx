import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/public/JsonLd";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { getDb } from "@/lib/db/client";
import { listCoveredNetworks } from "@/lib/repositories/public-payouts";
import {
  buildBreadcrumbLd,
  buildMetadata,
  buildWebPageLd,
} from "@/lib/seo/metadata";

/**
 * How payout verification works — docs/PAYOUTS.md §10.
 *
 * Original Prop Firm Lenz content describing OUR pipeline. The value of a
 * verified-payout claim is that a reader can check it, and they can only check
 * it if they know what was actually checked — including what this data cannot
 * tell them.
 */
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildMetadata({
    path: "/payouts/methodology",
    title: "How Prop Firm Lenz verifies payouts",
    description:
      "The wallet tracking, transaction matching and verification steps behind every blockchain-verified payout on Prop Firm Lenz — and the limits of what on-chain data can show.",
  });
}

const STEPS: { title: string; body: string }[] = [
  {
    title: "1. A wallet is recorded and classified",
    body: "An administrator records a blockchain address as belonging to a firm, along with what it appears to be used for: trader payouts, operations, treasury, or unknown. The classification is research, not proof, and it never by itself makes a transaction a payout.",
  },
  {
    title: "2. Outgoing transactions are read from the chain",
    body: "Transfers leaving that address are read from a public blockchain data provider and stored exactly as reported — the transaction hash, block, timestamp, sender, recipient, asset and the amount in the asset's smallest unit. Nothing is rounded, converted or adjusted on the way in.",
  },
  {
    title: "3. Each transfer becomes a candidate, not a payout",
    body: "Every stored transfer is raised as a candidate for review. This step exists because wallets get reused: a firm may move funds to an exchange, pay a supplier, top up gas, or refund a fee from the same address it pays traders from. Counting all of it as trader payouts would be wrong in a way that is invisible once it reaches a total.",
  },
  {
    title: "4. A person decides",
    body: "A candidate becomes a verified payout only when someone with verification permission reviews it and accepts it. There is no automatic promotion. A rule confident enough to approve payouts unattended would also be confident enough to publish a treasury transfer as one.",
  },
  {
    title: "5. The decision is recorded",
    body: "Every transition — detected, matched, verified, rejected, corrected — is appended to an audit trail with the person responsible. A published figure that nobody can account for is indistinguishable from one that was made up.",
  },
];

const LIMITS: { title: string; body: string }[] = [
  {
    title: "This is a floor, not a total",
    body: "Verified on-chain payouts are the ones we can prove. Firms also pay by bank transfer, card, payment processors, other crypto rails, and wallets nobody has identified. A firm's real payout volume is therefore at least what is shown here, and may be far higher. Nothing on this site presents verified volume as a firm's total payout volume.",
  },
  {
    title: "Absence of data is not evidence of anything",
    body: "A firm with no verified payouts may simply not pay from a wallet anyone has identified, or may not pay in crypto at all. It is not a signal that the firm does not pay, and we do not present it as one.",
  },
  {
    title: "Firm-reported figures are not verification",
    body: "Numbers a firm publishes about its own payouts are not blockchain-verified, however plausible they look, and are never mixed into these statistics. Where a firm publishes its own payout page, it is linked as exactly that: the firm's own claim.",
  },
  {
    title: "Amounts are exact; valuations may be missing",
    body: "The on-chain amount is authoritative and stored as an exact integer. A US dollar figure appears only where a rate and its source can be recorded alongside it. Where a reliable rate is not available, no dollar value is shown rather than an invented one — which is why a valued total can cover fewer payouts than the count beside it.",
  },
  {
    title: "Verification is not endorsement",
    body: "That a payout happened says nothing about whether a firm is a good one, whether its rules are fair, or whether you should trade with it. This is evidence, not a recommendation, and it is not financial advice.",
  },
];

export default async function PayoutMethodologyPage() {
  const networks = await listCoveredNetworks(getDb());

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Payouts", href: "/payouts" },
          { label: "Methodology" },
        ]}
      />

      <header>
        <h1 className="text-2xl font-semibold text-text-primary sm:text-3xl">
          How we verify payouts
        </h1>
        <p className="mt-3 text-text-secondary">
          A payout is only shown as verified when there is a blockchain
          transaction behind it that you can check yourself. This page explains
          how one gets there, and — just as importantly — what it does not tell
          you.
        </p>
      </header>

      <section aria-labelledby="pipeline" className="mt-10">
        <h2 id="pipeline" className="text-lg font-semibold text-text-primary">
          From transaction to verified payout
        </h2>
        <ol className="mt-4 flex flex-col gap-4">
          {STEPS.map((step) => (
            <li
              key={step.title}
              className="rounded-[14px] border border-border-default bg-bg-card p-5"
            >
              <h3 className="text-base font-semibold text-text-primary">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="limits" className="mt-10">
        <h2 id="limits" className="text-lg font-semibold text-text-primary">
          What this data cannot tell you
        </h2>
        <dl className="mt-4 flex flex-col gap-5">
          {LIMITS.map((limit) => (
            <div key={limit.title}>
              <dt className="text-base font-semibold text-text-primary">
                {limit.title}
              </dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-text-muted">
                {limit.body}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="coverage" className="mt-10">
        <h2 id="coverage" className="text-lg font-semibold text-text-primary">
          Networks currently covered
        </h2>
        {networks.length === 0 ? (
          <p className="mt-3 rounded-[10px] border border-dashed border-border-default px-4 py-6 text-sm text-text-muted">
            No payouts have been verified on any network yet. Networks appear
            here once there is at least one verified payout on them, rather than
            being listed in advance.
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {networks.map((network) => (
              <li
                key={network.key}
                className="inline-flex items-center gap-2 rounded-[10px] border border-border-default bg-bg-card px-3 py-2 text-sm text-text-secondary"
              >
                {network.name}
                <span className="text-xs tabular-nums text-text-muted">
                  {network.count} verified
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-10 text-sm text-text-muted">
        <Link
          href="/payouts"
          className="rounded font-medium text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
        >
          Back to verified payouts
        </Link>
      </p>

      <JsonLd
        data={[
          buildWebPageLd({
            path: "/payouts/methodology",
            name: "How Prop Firm Lenz verifies payouts",
            description:
              "The wallet tracking, transaction matching and verification steps behind every blockchain-verified payout.",
          }),
          buildBreadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Payouts", path: "/payouts" },
            { name: "Methodology", path: "/payouts/methodology" },
          ]),
        ]}
      />
    </div>
  );
}
