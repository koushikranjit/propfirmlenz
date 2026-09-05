import type * as React from "react";
import { NotSpecified } from "@/components/ui/primitives";
import {
  CHALLENGE_TYPE_LABEL,
  DRAWDOWN_BASIS_LABEL,
  DRAWDOWN_TYPE_LABEL,
  formatMoney,
  formatPercent,
  labelFor,
} from "@/lib/view/format";
import type { FirmViewChallenge } from "@/lib/view/firm-view";
import { NoData } from "./Section";

/**
 * Published challenges — the real unit of comparison (docs/PROJECT.md §6.3).
 *
 * Data rules `[LOCKED]`:
 *
 *  - Every monetary value renders WITH its own source currency, unconverted
 *    (docs/ARCHITECTURE.md §18.4).
 *  - A missing number renders "Not specified". It is NEVER shown as 0, a dash
 *    on its own, or an inferred value (CLAUDE.md §3).
 *  - `maxTradingDays === null` means UNLIMITED, which is a real answer and is
 *    stated as one — not left blank and not rendered as 0
 *    (docs/DATABASE.md §5.2).
 *  - Currencies are never mixed into a single figure. When challenges price in
 *    different currencies the table says so instead of implying comparability.
 *
 * Two renderings of ONE data set: a real <table> from `md` up (scrollable, so
 * a wide table never forces the page to scroll horizontally), and stacked
 * cards below it. Mobile is a first-class layout, not a fallback
 * (CLAUDE.md §12.3 rule 13).
 */
export function ChallengeTable({
  challenges,
  firmName,
}: {
  challenges: FirmViewChallenge[];
  firmName: string;
}) {
  if (challenges.length === 0) {
    return (
      <NoData>
        No challenges have been published for {firmName} yet. When they are,
        each one&apos;s account size, fee, targets and drawdown limits appear
        here exactly as the firm publishes them.
      </NoData>
    );
  }

  const currencies = new Set(
    challenges.flatMap((c) => (c.price ? [c.price.currency] : [])),
  );
  const mixedCurrencies = currencies.size > 1;

  return (
    <div className="flex flex-col gap-4">
      {mixedCurrencies ? (
        <p className="rounded-[10px] border border-border-default bg-bg-elevated px-4 py-3 text-sm text-text-secondary">
          These challenges are priced in different currencies (
          {[...currencies].sort().join(", ")}). Each figure is shown in the
          currency the firm publishes it in. No conversion is applied, so the
          prices are not directly comparable.
        </p>
      ) : null}

      {/* Desktop: one scrollable table. The page body never scrolls sideways. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[64rem] border-collapse text-left text-sm">
          <caption className="sr-only">
            Published challenges for {firmName}, with account size, fee, profit
            targets, drawdown limits and payout terms.
          </caption>
          <thead>
            <tr className="border-b border-border-default">
              <Th scope="col">Challenge</Th>
              <Th scope="col">Type</Th>
              <Th scope="col">Account size</Th>
              <Th scope="col">Fee</Th>
              <Th scope="col">Profit targets</Th>
              <Th scope="col">Max daily loss</Th>
              <Th scope="col">Max drawdown</Th>
              <Th scope="col">Profit split</Th>
              <Th scope="col">Trading days</Th>
              <Th scope="col">Leverage</Th>
            </tr>
          </thead>
          <tbody>
            {challenges.map((c) => (
              <tr
                key={c.id}
                className="border-b border-border-subtle align-top last:border-0"
              >
                <th
                  scope="row"
                  className="py-3 pr-4 font-medium text-text-primary"
                >
                  {c.name}
                </th>
                <Td>{labelFor(CHALLENGE_TYPE_LABEL, c.challengeType)}</Td>
                <Td numeric>{formatMoney(c.accountSize)}</Td>
                <Td numeric>{c.price ? formatMoney(c.price) : null}</Td>
                <Td numeric>{profitTargets(c)}</Td>
                <Td numeric>{formatPercent(c.maxDailyLossPct)}</Td>
                <Td numeric>{drawdown(c)}</Td>
                <Td numeric>{formatPercent(c.profitSplitPct)}</Td>
                <Td>{tradingDays(c)}</Td>
                <Td>{c.leverage}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: the same data, stacked. */}
      <ul className="flex flex-col gap-4 md:hidden">
        {challenges.map((c) => (
          <li
            key={c.id}
            className="rounded-[14px] border border-border-default bg-bg-card p-4"
          >
            <h3 className="text-sm font-semibold text-text-primary">
              {c.name}
            </h3>
            <p className="mt-0.5 text-xs text-text-muted">
              {labelFor(CHALLENGE_TYPE_LABEL, c.challengeType) ?? "Challenge"}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
              <MobileFact label="Account size">
                {formatMoney(c.accountSize)}
              </MobileFact>
              <MobileFact label="Fee">
                {c.price ? formatMoney(c.price) : null}
              </MobileFact>
              <MobileFact label="Profit targets">{profitTargets(c)}</MobileFact>
              <MobileFact label="Max daily loss">
                {formatPercent(c.maxDailyLossPct)}
              </MobileFact>
              <MobileFact label="Max drawdown">{drawdown(c)}</MobileFact>
              <MobileFact label="Profit split">
                {formatPercent(c.profitSplitPct)}
              </MobileFact>
              <MobileFact label="Trading days">{tradingDays(c)}</MobileFact>
              <MobileFact label="Leverage">{c.leverage}</MobileFact>
              <MobileFact label="Payout frequency">
                {days(c.payoutFrequencyDays)}
              </MobileFact>
              <MobileFact label="First payout">
                {days(c.firstPayoutDays)}
              </MobileFact>
            </dl>
            <p className="mt-3 text-xs text-text-muted">
              {yesNoUnknown("Fee refundable", c.feeRefundable)} ·{" "}
              {yesNoUnknown("Scaling plan", c.hasScalingPlan)}
            </p>
          </li>
        ))}
      </ul>

      {/* Payout and scaling terms, shown once for the desktop table. */}
      <div className="hidden md:block">
        <h3 className="text-sm font-semibold text-text-secondary">
          Payout and scaling terms
        </h3>
        <ul className="mt-2 flex flex-col gap-1 text-sm text-text-muted">
          {challenges.map((c) => (
            <li key={c.id}>
              <span className="text-text-secondary">{c.name}</span>
              {" — "}
              Payout frequency: {days(c.payoutFrequencyDays) ?? "not specified"};
              first payout: {days(c.firstPayoutDays) ?? "not specified"};{" "}
              {yesNoUnknown("fee refundable", c.feeRefundable)};{" "}
              {yesNoUnknown("scaling plan", c.hasScalingPlan)}.
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** "8%, 5%" — only the phases the firm actually publishes. */
function profitTargets(c: FirmViewChallenge): string | null {
  const targets = [
    c.profitTargetP1Pct,
    c.profitTargetP2Pct,
    c.profitTargetP3Pct,
  ]
    .map(formatPercent)
    .filter((v): v is string => v !== null);

  return targets.length > 0 ? targets.join(", ") : null;
}

/** The limit plus how it is measured — the two together are the actual rule. */
function drawdown(c: FirmViewChallenge): string | null {
  const pct = formatPercent(c.maxTotalDrawdownPct);
  const type = labelFor(DRAWDOWN_TYPE_LABEL, c.drawdownType);
  const basis = labelFor(DRAWDOWN_BASIS_LABEL, c.drawdownBasis);

  const qualifiers = [type, basis ? `on ${basis.toLowerCase()}` : null].filter(
    Boolean,
  );

  if (pct === null) return qualifiers.length > 0 ? qualifiers.join(", ") : null;
  return qualifiers.length > 0 ? `${pct} (${qualifiers.join(", ")})` : pct;
}

/**
 * A null maximum means UNLIMITED. Saying so is the whole point — rendering an
 * empty cell would hide a genuine selling point, and rendering 0 would invert
 * it (docs/DATABASE.md §5.2 `[LOCKED]`).
 */
function tradingDays(c: FirmViewChallenge): string | null {
  const min =
    c.minTradingDays === null ? null : `min ${c.minTradingDays.toString()}`;
  const max = c.maxTradingDays === null ? null : `max ${c.maxTradingDays}`;

  if (min === null && max === null) return null;
  if (max === null) return `${min}, no maximum`;
  return [min, max].filter(Boolean).join(", ");
}

function days(value: number | null): string | null {
  if (value === null) return null;
  return `${value} day${value === 1 ? "" : "s"}`;
}

/** A tri-state boolean. `null` is "not specified", never silently "no". */
function yesNoUnknown(label: string, value: boolean | null): string {
  if (value === null) return `${label}: not specified`;
  return `${label}: ${value ? "yes" : "no"}`;
}

function Th({
  children,
  scope,
}: {
  children: React.ReactNode;
  scope: "col" | "row";
}) {
  return (
    <th
      scope={scope}
      className="py-2 pr-4 text-xs font-semibold uppercase tracking-wide text-text-muted"
    >
      {children}
    </th>
  );
}

function Td({
  children,
  numeric,
}: {
  children: React.ReactNode;
  numeric?: boolean;
}) {
  return (
    <td
      className={`py-3 pr-4 text-text-secondary${numeric ? " tabular-nums" : ""}`}
    >
      {children ?? <NotSpecified />}
    </td>
  );
}

function MobileFact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm tabular-nums text-text-secondary">
        {children ?? <NotSpecified />}
      </dd>
    </div>
  );
}
