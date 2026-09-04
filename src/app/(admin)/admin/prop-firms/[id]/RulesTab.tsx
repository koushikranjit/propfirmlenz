"use client";

import { useActionState } from "react";
import {
  type ActionResult,
  EditorDisclosure,
  SelectField,
  StatusMessage,
  SubmitButton,
} from "@/components/admin/forms";
import {
  Badge,
  Card,
  Field,
  Input,
  Textarea,
} from "@/components/ui/primitives";
import type {
  AdminRuleValue,
  RuleOption,
} from "@/lib/repositories/admin-firm-children";
import { saveRuleAction } from "@/lib/services/firm-child-actions";

/**
 * Rule editor — docs/PROJECT.md §6.4, §6.5 `[LOCKED]`.
 *
 * Rules use the existing hybrid model: the catalog defines the QUESTION
 * (`rules`), and a firm's answer is a `rule_values` row. An admin picks from
 * the catalog; they never type a rule name, because two firms writing "News
 * trading" and "news-trading" would silently become two different rules and
 * break every comparison built on them.
 *
 * FOUR STATES, and the fourth is real `[LOCKED]`:
 *
 *   Allowed · Not allowed · Allowed with conditions · Not specified
 *
 * "Not specified" is the DEFAULT for every rule nobody has answered, and
 * choosing it removes the answer rather than storing a falsy one. An
 * unanswered rule must never render as "allowed" — the gap in the data is
 * itself the useful information.
 */

const STATES = [
  { value: "not_specified", label: "Not specified — nobody has checked" },
  { value: "allowed", label: "Allowed" },
  { value: "not_allowed", label: "Not allowed" },
  { value: "conditional", label: "Allowed with conditions" },
];

export interface StagedRule {
  ruleId: string;
  op: "create" | "update" | "delete";
}

/** Reads a stored answer back into the four-state selector. */
function stateOf(value: AdminRuleValue | undefined): string {
  if (!value) return "not_specified";
  if (value.valueBoolean !== null) {
    return value.valueBoolean ? "allowed" : "not_allowed";
  }
  if (value.valueNumeric !== null || value.valueText !== null) {
    return "conditional";
  }
  return "not_specified";
}

export function RulesTab({
  firmId,
  rules,
  values,
  staged,
  readOnly,
}: {
  firmId: string;
  rules: RuleOption[];
  values: AdminRuleValue[];
  staged: StagedRule[];
  readOnly: boolean;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    saveRuleAction,
    {},
  );

  const byRuleId = new Map(values.map((v) => [v.ruleId, v]));
  const stagedByRuleId = new Map(staged.map((s) => [s.ruleId, s]));

  if (rules.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-text-muted">
          No rules exist in the catalog yet. Rules are shared vocabulary managed
          separately under <code>catalog:manage</code>; a firm answers them, it
          does not invent them.
        </p>
      </Card>
    );
  }

  const byCategory = new Map<string, RuleOption[]>();
  for (const rule of rules) {
    const bucket = byCategory.get(rule.category);
    if (bucket) bucket.push(rule);
    else byCategory.set(rule.category, [rule]);
  }

  return (
    <div className="flex flex-col gap-5">
      <StatusMessage state={state} />

      <p className="text-sm text-text-muted">
        Every rule starts as <strong>Not specified</strong>. Leave it there
        unless the firm has actually published an answer — an unanswered rule is
        never shown as allowed.
      </p>

      {[...byCategory.entries()].map(([category, categoryRules]) => (
        <section key={category} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold capitalize text-text-secondary">
            {category}
          </h3>

          {categoryRules.map((rule) => {
            const value = byRuleId.get(rule.id);
            const pending = stagedByRuleId.get(rule.id);
            const current = stateOf(value);

            return (
              <EditorDisclosure
                key={rule.id}
                summary={rule.label}
                meta={
                  <>
                    <Badge
                      tone={
                        current === "allowed"
                          ? "success"
                          : current === "not_allowed"
                            ? "danger"
                            : current === "conditional"
                              ? "warning"
                              : "neutral"
                      }
                    >
                      {STATES.find((s) => s.value === current)?.label.split(
                        " — ",
                      )[0] ?? current}
                    </Badge>
                    {pending ? (
                      <Badge tone="warning">Edited — not published</Badge>
                    ) : null}
                  </>
                }
              >
                <form action={formAction} className="flex flex-col gap-4">
                  <input type="hidden" name="firmId" value={firmId} />
                  <input type="hidden" name="ruleId" value={rule.id} />
                  {value ? (
                    <input type="hidden" name="id" value={value.id} />
                  ) : null}

                  {rule.description ? (
                    <p className="text-xs text-text-muted">
                      {rule.description}
                    </p>
                  ) : null}

                  <SelectField
                    label="Answer"
                    name="state"
                    id={`state-${rule.id}`}
                    defaultValue={current}
                    options={STATES}
                    disabled={readOnly}
                  />

                  <Field
                    label="Condition"
                    htmlFor={`detail-${rule.id}`}
                    hint="Shown publicly when the answer is “Allowed with conditions”."
                    error={state.fieldErrors?.detail}
                  >
                    <Textarea
                      id={`detail-${rule.id}`}
                      name="detail"
                      rows={2}
                      defaultValue={value?.valueText ?? ""}
                      disabled={readOnly}
                    />
                  </Field>

                  <Field
                    label="Note"
                    htmlFor={`note-${rule.id}`}
                    hint="Clarification shown alongside the answer."
                    error={state.fieldErrors?.note}
                  >
                    <Input
                      id={`note-${rule.id}`}
                      name="note"
                      defaultValue={value?.note ?? ""}
                      disabled={readOnly}
                    />
                  </Field>

                  <Field
                    label="Source URL"
                    htmlFor={`source-${rule.id}`}
                    hint="Where the firm published this. Shown publicly as a source link."
                    error={state.fieldErrors?.sourceUrl}
                  >
                    <Input
                      id={`source-${rule.id}`}
                      name="sourceUrl"
                      type="url"
                      defaultValue={value?.sourceUrl ?? ""}
                      disabled={readOnly}
                    />
                  </Field>

                  {!readOnly ? (
                    <div>
                      <SubmitButton pendingLabel="Staging…">
                        Stage answer
                      </SubmitButton>
                    </div>
                  ) : null}
                </form>
              </EditorDisclosure>
            );
          })}
        </section>
      ))}
    </div>
  );
}
