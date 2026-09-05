import { Badge } from "@/components/ui/primitives";
import { RULE_CATEGORY_LABEL, labelFor } from "@/lib/view/format";
import {
  type FirmViewRule,
  RULE_STATE_LABEL,
  type RuleState,
} from "@/lib/view/firm-view";
import { NoData } from "./Section";

/**
 * Trading rules — docs/PROJECT.md §6.5 `[LOCKED]`.
 *
 * "Not specified" is a FIRST-CLASS answer, shown with the same weight as
 * "Allowed" or "Not allowed". A rule the firm has not documented is never
 * quietly rendered as permitted, and never omitted from the list — the gap in
 * the data is itself the useful information.
 *
 * State is carried by TEXT in every case; colour only reinforces it
 * (docs/DESIGN.md §2.5 rule 5, WCAG 1.4.1).
 */

const STATE_TONE: Record<RuleState, "success" | "danger" | "warning" | "neutral"> =
  {
    allowed: "success",
    not_allowed: "danger",
    allowed_with_conditions: "warning",
    not_specified: "neutral",
  };

export function RulesSection({
  rules,
  firmName,
}: {
  rules: FirmViewRule[];
  firmName: string;
}) {
  if (rules.length === 0) {
    return (
      <NoData>
        No trading rules have been recorded for {firmName} yet. Nothing is
        assumed in the meantime — an absent rule is not an allowed rule.
      </NoData>
    );
  }

  const byCategory = new Map<string, FirmViewRule[]>();
  for (const rule of rules) {
    const bucket = byCategory.get(rule.category);
    if (bucket) bucket.push(rule);
    else byCategory.set(rule.category, [rule]);
  }

  return (
    <div className="flex flex-col gap-6">
      {[...byCategory.entries()].map(([category, categoryRules]) => (
        <div key={category}>
          <h3 className="text-sm font-semibold text-text-secondary">
            {labelFor(RULE_CATEGORY_LABEL, category)}
          </h3>
          <ul className="mt-2 flex flex-col gap-2">
            {categoryRules.map((rule) => (
              <li
                key={rule.id}
                className="rounded-[10px] border border-border-default bg-bg-card px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-text-primary">
                    {rule.label}
                  </span>
                  <Badge tone={STATE_TONE[rule.state]}>
                    {RULE_STATE_LABEL[rule.state]}
                  </Badge>
                </div>

                {rule.detail ? (
                  <p className="mt-1 text-sm text-text-secondary">
                    {rule.detail}
                  </p>
                ) : null}
                {rule.note ? (
                  <p className="mt-1 text-sm text-text-muted">{rule.note}</p>
                ) : null}
                {rule.description ? (
                  <p className="mt-1 text-xs text-text-muted">
                    {rule.description}
                  </p>
                ) : null}
                {rule.sourceUrl ? (
                  <p className="mt-1 text-xs">
                    <a
                      href={rule.sourceUrl}
                      rel="nofollow noopener"
                      target="_blank"
                      className="text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                    >
                      Source
                      <span className="sr-only">
                        {" "}
                        for {rule.label} (opens in a new tab)
                      </span>
                    </a>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
