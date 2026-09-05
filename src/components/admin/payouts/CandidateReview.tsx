"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  type ActionState,
  markForReviewAction,
  rejectCandidateAction,
  verifyCandidateAction,
} from "@/lib/services/payout-actions";
import { SubmitButton, StatusMessage } from "@/components/admin/forms";
import {
  Badge,
  Card,
  Field,
  Input,
  Textarea,
} from "@/components/ui/primitives";
import { formatBaseUnits, explorerUrl } from "@/lib/blockchain/provider";
import type { AdminCandidate } from "@/lib/repositories/admin-payouts";

/**
 * THE REVIEW QUEUE — docs/PAYOUTS.md §7 `[LOCKED]`.
 *
 * The one place where a transaction becomes a published payout. It is
 * deliberately manual, and deliberately shows the evidence next to the buttons:
 * the amount, the confirmations, the wallet's purpose, and a link to the
 * explorer, so the decision is made against the chain rather than against a
 * confidence score.
 *
 * `confidence` is a QUEUE ORDER, not a verdict. Nothing here approves in bulk,
 * because a bulk approval is exactly how a treasury transfer ends up counted as
 * a trader payout.
 */

function amount(candidate: AdminCandidate): string {
  return `${formatBaseUnits(candidate.amountBaseUnits, candidate.decimals)} ${candidate.assetSymbol}`;
}

function shortHash(hash: string): string {
  return hash.length <= 18 ? hash : `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

function confirmationsLabel(candidate: AdminCandidate): {
  text: string;
  tone: "success" | "warning";
} {
  if (candidate.confirmations === null) {
    return { text: "Confirmations unknown", tone: "warning" };
  }
  const settled = candidate.confirmations >= candidate.confirmationsRequired;
  return {
    text: `${candidate.confirmations}/${candidate.confirmationsRequired} confirmations`,
    tone: settled ? "success" : "warning",
  };
}

export function CandidateCard({
  candidate,
  canVerify,
}: {
  candidate: AdminCandidate;
  canVerify: boolean;
}) {
  const [verifyState, verify] = useActionState<ActionState, FormData>(
    verifyCandidateAction,
    {},
  );
  const [rejectState, reject] = useActionState<ActionState, FormData>(
    rejectCandidateAction,
    {},
  );
  const [queueState, queue] = useActionState<ActionState, FormData>(
    markForReviewAction,
    {},
  );
  const [showValuation, setShowValuation] = React.useState(false);

  const confirmations = confirmationsLabel(candidate);
  const href = explorerUrl(candidate.explorerTxTemplate, candidate.txHash);

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-text-primary">
            {amount(candidate)}
          </p>
          <p className="mt-1 text-sm text-text-muted">
            {candidate.firmName} · {candidate.networkName} ·{" "}
            {candidate.transactionTimestamp.toISOString().slice(0, 10)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={confirmations.tone}>{confirmations.text}</Badge>
          {candidate.confidence === null ? null : (
            <Badge tone="neutral">Confidence {candidate.confidence}</Badge>
          )}
        </div>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            From wallet
          </dt>
          <dd className="mt-0.5 text-text-secondary">
            {candidate.walletLabel ?? "Unlabelled"}{" "}
            <span className="text-text-muted">
              ({candidate.walletPurpose.replace(/_/g, " ")})
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Recipient
          </dt>
          <dd className="mt-0.5 font-mono text-xs text-text-secondary">
            {candidate.toAddress}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Transaction
          </dt>
          <dd className="mt-0.5">
            {/* The evidence. Check it before deciding, not after. */}
            <a
              href={href}
              target="_blank"
              rel="nofollow noopener"
              className="rounded font-mono text-xs text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
            >
              {shortHash(candidate.txHash)}
              <span className="sr-only"> (opens the block explorer)</span>
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Why it was flagged
          </dt>
          <dd className="mt-0.5 text-text-secondary">
            {candidate.matchReasons?.length
              ? candidate.matchReasons
                  .map((r) => r.replace(/_/g, " "))
                  .join(", ")
              : "No reasons recorded"}
          </dd>
        </div>
      </dl>

      {candidate.status === "rejected" && candidate.rejectionReason ? (
        <p className="rounded-[10px] border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-text-secondary">
          Rejected: {candidate.rejectionReason}
        </p>
      ) : null}

      {!canVerify ? (
        <p className="text-sm text-text-muted">
          You can see this queue but not decide on it — verifying a payout needs
          the firm verification permission.
        </p>
      ) : candidate.status === "verified" ? (
        <p className="text-sm text-success">
          Verified{candidate.reviewedBy ? ` by ${candidate.reviewedBy}` : ""}.
        </p>
      ) : (
        <div className="flex flex-col gap-4 border-t border-border-subtle pt-4">
          <StatusMessage state={verifyState} />
          <StatusMessage state={rejectState} />
          <StatusMessage state={queueState} />

          <form action={verify} className="flex flex-col gap-3">
            <input type="hidden" name="candidateId" value={candidate.id} />

            <Field label="Note (optional)" htmlFor={`note-${candidate.id}`}>
              <Input
                id={`note-${candidate.id}`}
                name="note"
                placeholder="What made this a trader payout?"
              />
            </Field>

            <div>
              <button
                type="button"
                onClick={() => setShowValuation((v) => !v)}
                className="rounded text-sm font-medium text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                aria-expanded={showValuation}
              >
                {showValuation ? "Hide" : "Add"} a US dollar valuation
              </button>
              {showValuation ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {/* All four or none: the CHECK constraint refuses a value
                      whose rate and source were not recorded with it. */}
                  <Field
                    label="USD value"
                    htmlFor={`usdValue-${candidate.id}`}
                    error={verifyState.fieldErrors?.usd}
                  >
                    <Input
                      id={`usdValue-${candidate.id}`}
                      name="usdValue"
                      inputMode="decimal"
                    />
                  </Field>
                  <Field label="Rate used" htmlFor={`usdRate-${candidate.id}`}>
                    <Input
                      id={`usdRate-${candidate.id}`}
                      name="usdRate"
                      inputMode="decimal"
                      placeholder={`USD per 1 ${candidate.assetSymbol}`}
                    />
                  </Field>
                  <Field
                    label="Rate source"
                    htmlFor={`usdRateSource-${candidate.id}`}
                    hint="Where the rate came from, so the figure can be defended later."
                  >
                    <Input
                      id={`usdRateSource-${candidate.id}`}
                      name="usdRateSource"
                    />
                  </Field>
                  <Field
                    label="Rate taken at"
                    htmlFor={`usdRateAt-${candidate.id}`}
                  >
                    <Input
                      id={`usdRateAt-${candidate.id}`}
                      name="usdRateAt"
                      type="datetime-local"
                    />
                  </Field>
                </div>
              ) : null}
            </div>

            <div>
              <SubmitButton variant="primary" pendingLabel="Verifying…">
                Verify as a trader payout
              </SubmitButton>
            </div>
          </form>

          <form action={reject} className="flex flex-col gap-3">
            <input type="hidden" name="candidateId" value={candidate.id} />
            <Field
              label="Reject with a reason"
              htmlFor={`reason-${candidate.id}`}
              error={rejectState.fieldErrors?.reason}
              hint="Required. A rejection nobody can account for is not a decision."
            >
              <Textarea
                id={`reason-${candidate.id}`}
                name="reason"
                rows={2}
                placeholder="e.g. Transfer to an exchange, not a trader."
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <SubmitButton variant="danger" pendingLabel="Rejecting…">
                Reject
              </SubmitButton>
            </div>
          </form>

          {candidate.status === "detected" ? (
            <form action={queue}>
              <input type="hidden" name="candidateId" value={candidate.id} />
              <SubmitButton size="sm" pendingLabel="Moving…">
                Move to review queue
              </SubmitButton>
            </form>
          ) : null}
        </div>
      )}
    </Card>
  );
}
