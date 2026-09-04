"use client";

import { useActionState } from "react";
import {
  type ActionResult,
  EditorDisclosure,
  PendingBadge,
  SelectField,
  StatusMessage,
  SubmitButton,
} from "@/components/admin/forms";
import { Card, Field, Input } from "@/components/ui/primitives";
import type { AdminChallenge } from "@/lib/repositories/admin-firm-children";
import {
  removeChildAction,
  saveChallengeAction,
} from "@/lib/services/firm-child-actions";

/**
 * Challenge editor — docs/PROJECT.md §6.3.
 *
 * A challenge is the real unit of comparison, so this is the densest form in
 * the workspace. Every field maps to an existing column; nothing is invented.
 *
 * MONEY `[LOCKED]`. Amount and currency are edited as a PAIR, and the pair
 * travels together into `accountSize: { amount, currency }`. There is no flat
 * `accountCurrency` field, no base currency, and no conversion — a fee the firm
 * publishes in euros is stored, and shown, in euros
 * (docs/ARCHITECTURE.md §18 `[LOCKED]`).
 *
 * BLANK MEANS UNKNOWN. Every optional numeric field left empty is stored as
 * NULL and rendered publicly as "Not specified". None of them defaults to 0,
 * which would be a fabricated business fact.
 */

const CHALLENGE_TYPES = [
  { value: "one_step", label: "One step" },
  { value: "two_step", label: "Two step" },
  { value: "three_step", label: "Three step" },
  { value: "instant_funding", label: "Instant funding" },
  { value: "other", label: "Other" },
];

const DRAWDOWN_TYPES = [
  { value: "", label: "Not specified" },
  { value: "static", label: "Static" },
  { value: "trailing", label: "Trailing" },
  { value: "eod_trailing", label: "End-of-day trailing" },
];

const DRAWDOWN_BASES = [
  { value: "", label: "Not specified" },
  { value: "initial_balance", label: "Initial balance" },
  { value: "equity", label: "Equity" },
  { value: "highest_equity", label: "Highest equity" },
  { value: "highest_balance", label: "Highest balance" },
];

const TRI_STATE = [
  { value: "", label: "Not specified" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export interface StagedChallenge {
  key: string;
  op: "create" | "update" | "delete";
  name: string;
}

export function ChallengesTab({
  firmId,
  challenges,
  staged,
  readOnly,
}: {
  firmId: string;
  challenges: AdminChallenge[];
  staged: StagedChallenge[];
  readOnly: boolean;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    saveChallengeAction,
    {},
  );
  const [removeState, removeAction] = useActionState<ActionResult, FormData>(
    removeChildAction,
    {},
  );

  const stagedFor = (id: string) => staged.find((s) => s.key === id);
  const pendingCreates = staged.filter((s) => s.op === "create");

  return (
    <div className="flex flex-col gap-4">
      <StatusMessage state={state} />
      <StatusMessage state={removeState} />

      {challenges.length === 0 && pendingCreates.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-text-muted">
            No challenges have been recorded for this firm yet. Add the ones the
            firm publishes — leave anything they have not published blank rather
            than estimating it.
          </p>
        </Card>
      ) : null}

      {challenges.map((challenge) => {
        const pending = stagedFor(challenge.id);
        return (
          <EditorDisclosure
            key={challenge.id}
            summary={challenge.name}
            meta={
              <>
                <span className="text-xs tabular-nums text-text-muted">
                  {challenge.accountSize} {challenge.accountCurrency}
                </span>
                {pending ? <PendingBadge op={pending.op} /> : null}
              </>
            }
          >
            <ChallengeForm
              firmId={firmId}
              challenge={challenge}
              formAction={formAction}
              removeAction={removeAction}
              state={state}
              readOnly={readOnly}
            />
          </EditorDisclosure>
        );
      })}

      {pendingCreates.length > 0 ? (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-text-primary">
            Staged new challenges
          </h3>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-text-secondary">
            {pendingCreates.map((s) => (
              <li key={s.key} className="flex items-center gap-2">
                {s.name || "Untitled challenge"}
                <PendingBadge op="create" />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-text-muted">
            These become real rows when you publish. Until then the public page
            shows only the published challenges above.
          </p>
        </Card>
      ) : null}

      {!readOnly ? (
        <EditorDisclosure summary="Add a challenge">
          <ChallengeForm
            firmId={firmId}
            challenge={null}
            formAction={formAction}
            removeAction={removeAction}
            state={state}
            readOnly={readOnly}
          />
        </EditorDisclosure>
      ) : null}
    </div>
  );
}

function ChallengeForm({
  firmId,
  challenge,
  formAction,
  removeAction,
  state,
  readOnly,
}: {
  firmId: string;
  challenge: AdminChallenge | null;
  formAction: (formData: FormData) => void;
  removeAction: (formData: FormData) => void;
  state: ActionResult;
  readOnly: boolean;
}) {
  const err = (field: string) => state.fieldErrors?.[field];
  const v = (value: string | number | null | undefined) => value ?? "";
  const tri = (value: boolean | null) =>
    value === null ? "" : value ? "yes" : "no";

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="firmId" value={firmId} />
        {challenge ? (
          <input type="hidden" name="id" value={challenge.id} />
        ) : null}

        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Name" htmlFor="name" required error={err("name")}>
            <Input
              name="name"
              defaultValue={v(challenge?.name)}
              required
              disabled={readOnly}
            />
          </Field>
          <Field label="Slug" htmlFor="slug" required error={err("slug")}>
            <Input
              name="slug"
              defaultValue={v(challenge?.slug)}
              required
              disabled={readOnly}
            />
          </Field>

          <SelectField
            label="Challenge type"
            name="challengeType"
            id={`type-${challenge?.id ?? "new"}`}
            defaultValue={challenge?.challengeType ?? "two_step"}
            options={CHALLENGE_TYPES}
            required
            disabled={readOnly}
            error={err("challengeType")}
          />
          <Field
            label="Leverage"
            htmlFor="leverage"
            hint="Free text — firms express this inconsistently, e.g. 1:100."
            error={err("leverage")}
          >
            <Input
              name="leverage"
              defaultValue={v(challenge?.leverage)}
              disabled={readOnly}
            />
          </Field>
        </div>

        <fieldset className="grid gap-5 rounded-[10px] border border-border-subtle p-4 md:grid-cols-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Money — each amount keeps its own currency
          </legend>
          <Field
            label="Account size"
            htmlFor="accountSizeAmount"
            required
            error={err("accountSizeAmount")}
          >
            <Input
              name="accountSizeAmount"
              inputMode="decimal"
              defaultValue={v(challenge?.accountSize)}
              required
              disabled={readOnly}
            />
          </Field>
          <Field
            label="Currency"
            htmlFor="accountSizeCurrency"
            required
            error={err("accountSizeCurrency")}
          >
            <Input
              name="accountSizeCurrency"
              maxLength={3}
              placeholder="USD"
              defaultValue={v(challenge?.accountCurrency)}
              required
              disabled={readOnly}
            />
          </Field>
          <Field
            label="Fee"
            htmlFor="priceAmount"
            hint="Blank if not published."
            error={err("priceAmount")}
          >
            <Input
              name="priceAmount"
              inputMode="decimal"
              defaultValue={v(challenge?.price)}
              disabled={readOnly}
            />
          </Field>
          <Field
            label="Fee currency"
            htmlFor="priceCurrency"
            error={err("priceCurrency")}
          >
            <Input
              name="priceCurrency"
              maxLength={3}
              defaultValue={v(challenge?.priceCurrency)}
              disabled={readOnly}
            />
          </Field>
        </fieldset>

        <fieldset className="grid gap-5 rounded-[10px] border border-border-subtle p-4 md:grid-cols-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Targets and limits (%)
          </legend>
          <Field
            label="Profit target — stage 1"
            htmlFor="profitTargetP1Pct"
            error={err("profitTargetP1Pct")}
          >
            <Input
              name="profitTargetP1Pct"
              inputMode="decimal"
              defaultValue={v(challenge?.profitTargetP1Pct)}
              disabled={readOnly}
            />
          </Field>
          <Field
            label="Stage 2"
            htmlFor="profitTargetP2Pct"
            error={err("profitTargetP2Pct")}
          >
            <Input
              name="profitTargetP2Pct"
              inputMode="decimal"
              defaultValue={v(challenge?.profitTargetP2Pct)}
              disabled={readOnly}
            />
          </Field>
          <Field
            label="Stage 3"
            htmlFor="profitTargetP3Pct"
            error={err("profitTargetP3Pct")}
          >
            <Input
              name="profitTargetP3Pct"
              inputMode="decimal"
              defaultValue={v(challenge?.profitTargetP3Pct)}
              disabled={readOnly}
            />
          </Field>
          <Field
            label="Max daily loss"
            htmlFor="maxDailyLossPct"
            error={err("maxDailyLossPct")}
          >
            <Input
              name="maxDailyLossPct"
              inputMode="decimal"
              defaultValue={v(challenge?.maxDailyLossPct)}
              disabled={readOnly}
            />
          </Field>
          <Field
            label="Max total drawdown"
            htmlFor="maxTotalDrawdownPct"
            error={err("maxTotalDrawdownPct")}
          >
            <Input
              name="maxTotalDrawdownPct"
              inputMode="decimal"
              defaultValue={v(challenge?.maxTotalDrawdownPct)}
              disabled={readOnly}
            />
          </Field>
          <Field
            label="Profit split"
            htmlFor="profitSplitPct"
            error={err("profitSplitPct")}
          >
            <Input
              name="profitSplitPct"
              inputMode="decimal"
              defaultValue={v(challenge?.profitSplitPct)}
              disabled={readOnly}
            />
          </Field>
          <SelectField
            label="Drawdown type"
            name="drawdownType"
            id={`ddtype-${challenge?.id ?? "new"}`}
            defaultValue={challenge?.drawdownType ?? ""}
            options={DRAWDOWN_TYPES}
            disabled={readOnly}
          />
          <SelectField
            label="Measured against"
            name="drawdownBasis"
            id={`ddbasis-${challenge?.id ?? "new"}`}
            defaultValue={challenge?.drawdownBasis ?? ""}
            options={DRAWDOWN_BASES}
            disabled={readOnly}
          />
        </fieldset>

        <fieldset className="grid gap-5 rounded-[10px] border border-border-subtle p-4 md:grid-cols-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Trading days and payouts
          </legend>
          <Field
            label="Minimum trading days"
            htmlFor="minTradingDays"
            error={err("minTradingDays")}
          >
            <Input
              name="minTradingDays"
              inputMode="numeric"
              defaultValue={v(challenge?.minTradingDays)}
              disabled={readOnly}
            />
          </Field>
          <Field
            label="Maximum trading days"
            htmlFor="maxTradingDays"
            hint="Blank means unlimited, and the public page says so."
            error={err("maxTradingDays")}
          >
            <Input
              name="maxTradingDays"
              inputMode="numeric"
              defaultValue={v(challenge?.maxTradingDays)}
              disabled={readOnly}
            />
          </Field>
          <Field
            label="Payout frequency (days)"
            htmlFor="payoutFrequencyDays"
            error={err("payoutFrequencyDays")}
          >
            <Input
              name="payoutFrequencyDays"
              inputMode="numeric"
              defaultValue={v(challenge?.payoutFrequencyDays)}
              disabled={readOnly}
            />
          </Field>
          <Field
            label="First payout after (days)"
            htmlFor="firstPayoutDays"
            error={err("firstPayoutDays")}
          >
            <Input
              name="firstPayoutDays"
              inputMode="numeric"
              defaultValue={v(challenge?.firstPayoutDays)}
              disabled={readOnly}
            />
          </Field>
          <SelectField
            label="Fee refundable"
            name="feeRefundable"
            id={`refund-${challenge?.id ?? "new"}`}
            defaultValue={tri(challenge?.feeRefundable ?? null)}
            options={TRI_STATE}
            disabled={readOnly}
          />
          <SelectField
            label="Scaling plan"
            name="hasScalingPlan"
            id={`scaling-${challenge?.id ?? "new"}`}
            defaultValue={tri(challenge?.hasScalingPlan ?? null)}
            options={TRI_STATE}
            disabled={readOnly}
          />
        </fieldset>

        <Field
          label="Display order"
          htmlFor="displayOrder"
          hint="Lower sorts first."
          error={err("displayOrder")}
        >
          <Input
            name="displayOrder"
            inputMode="numeric"
            defaultValue={v(challenge?.displayOrder)}
            disabled={readOnly}
          />
        </Field>

        {!readOnly ? (
          <div>
            <SubmitButton variant="primary" pendingLabel="Staging…">
              {challenge ? "Stage changes" : "Stage new challenge"}
            </SubmitButton>
          </div>
        ) : null}
      </form>

      {challenge && !readOnly ? (
        <form
          action={removeAction}
          className="border-t border-border-subtle pt-4"
        >
          <input type="hidden" name="firmId" value={firmId} />
          <input type="hidden" name="collection" value="challenges" />
          <input type="hidden" name="id" value={challenge.id} />
          <SubmitButton variant="danger" size="sm" pendingLabel="Staging…">
            Stage removal
          </SubmitButton>
          <p className="mt-2 text-xs text-text-muted">
            Staged only. The challenge is soft-deleted when you publish, and the
            row is kept for history.
          </p>
        </form>
      ) : null}
    </div>
  );
}
