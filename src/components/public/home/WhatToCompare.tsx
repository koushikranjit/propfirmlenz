import Link from "next/link";

/**
 * The informational section — the homepage's unique, indexable prose.
 *
 * DEFINITIONAL ONLY `[LOCKED]`. Everything below explains what a term MEANS.
 * There is not a single number, price, percentage, typical value, or statement
 * about what firms "usually" do, because no such figure exists in the database
 * and inventing one would be fabricated business data (CLAUDE.md §3).
 *
 * The value to a reader is knowing which conditions to check; the actual values
 * for any firm come from that firm's own profile page.
 */

const TERMS: { term: string; definition: string }[] = [
  {
    term: "Challenge or evaluation",
    definition:
      "The assessment a trader pays to take. Firms set their own structure — some evaluate in one stage, others in two or three, and some offer funded accounts without an evaluation. The stage count changes what you have to achieve before a payout is possible.",
  },
  {
    term: "Account size and fee",
    definition:
      "The nominal capital allocated on the account, and what the evaluation costs. These are separate numbers: a larger account is not automatically a better deal, and each firm publishes both in its own currency.",
  },
  {
    term: "Profit target",
    definition:
      "The gain required to pass a stage. Where a firm evaluates in several stages, each stage can carry its own target, so the totals are what matter rather than the first number quoted.",
  },
  {
    term: "Maximum daily loss",
    definition:
      "The most an account may lose within a single trading day before it breaches. Firms differ in whether this is measured against balance or equity, and that difference decides whether an open drawdown counts against you.",
  },
  {
    term: "Maximum drawdown",
    definition:
      "The total loss allowed over the life of the account. It may be static, or it may trail your balance or equity upward as you profit — a trailing limit tightens as you win, which changes how you have to size positions.",
  },
  {
    term: "Profit split and payouts",
    definition:
      "The share of profit a funded trader keeps, how often a payout can be requested, and how long the first one takes. A high split with a long or conditional payout cycle is a different proposition from a lower split paid frequently.",
  },
  {
    term: "Trading rules",
    definition:
      "The conditions attached to how you may trade — around news events, holding overnight or over a weekend, copy trading, automation, hedging, and minimum or maximum trading days. A rule that is not documented is not the same as a rule that permits it.",
  },
  {
    term: "Platforms and instruments",
    definition:
      "Which trading platforms a firm supports, and which asset classes may be traded on them. An instrument recorded as explicitly prohibited is different information from one a firm has simply never mentioned.",
  },
];

export function WhatToCompare() {
  return (
    <div className="flex flex-col gap-8">
      <dl className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2">
        {TERMS.map((entry) => (
          <div key={entry.term}>
            <dt className="text-base font-semibold text-text-primary">
              {entry.term}
            </dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-text-muted">
              {entry.definition}
            </dd>
          </div>
        ))}
      </dl>

      <p className="text-sm text-text-muted">
        Each firm&apos;s own values for these conditions are on its profile.{" "}
        <Link
          href="/prop-firms"
          className="rounded font-medium text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
        >
          Browse all prop firms
        </Link>{" "}
        to compare them.
      </p>
    </div>
  );
}
