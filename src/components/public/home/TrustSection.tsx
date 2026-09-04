/**
 * Trust positioning — docs/PROJECT.md §7 `[LOCKED]`.
 *
 * Every item below describes a behaviour that is actually implemented and can
 * be checked by opening a firm page. None of them is a quality claim, a
 * superlative, or a promise about firms.
 *
 * In particular: this section says data is checked against each firm's own
 * published sources on a recorded date. It does NOT claim independent auditing,
 * because the workflow is an admin reading a firm's published documentation —
 * saying more than that would be the exact kind of unsupported claim
 * PROJECT.md §7 forbids.
 */

const PRINCIPLES: { title: string; body: string }[] = [
  {
    title: "Structured, not marketing copy",
    body: "Pricing, account sizes, drawdown limits, profit targets and payout terms are stored as fields, so the same condition can be read the same way across every firm.",
  },
  {
    title: "Dated against published sources",
    body: "When a firm's data has been checked against its own published documentation, the page shows the date it was checked. When it has not, the page says that instead.",
  },
  {
    title: "Missing data is stated, not filled in",
    body: "If a firm has not published a figure, you see “Not specified”. Nothing is estimated, rounded, inferred from a competitor, or carried over from an older version.",
  },
  {
    title: "Money keeps its own currency",
    body: "A fee published in euros is shown in euros. Amounts are never silently converted, and a starting price is withheld where a firm prices in several currencies rather than implying a false comparison.",
  },
  {
    title: "Affiliate links are disclosed where they appear",
    body: "Some outbound links earn a commission, and each one says so next to the link. Commission never affects the data, the ordering, or how a firm is presented.",
  },
  {
    title: "No ratings, rankings or reviews yet",
    body: "There is no scoring system on this site today, so nothing here is a recommendation. Review collection is a later phase and will publish its methodology before any score appears.",
  },
];

export function TrustSection() {
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {PRINCIPLES.map((principle) => (
        <li
          key={principle.title}
          className="rounded-[14px] border border-border-default bg-bg-card p-5"
        >
          <h3 className="text-base font-semibold text-text-primary">
            {principle.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            {principle.body}
          </p>
        </li>
      ))}
    </ul>
  );
}
