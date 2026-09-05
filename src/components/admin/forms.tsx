"use client";

import type * as React from "react";
import { useFormStatus } from "react-dom";
import { Badge, Button, cx } from "@/components/ui/primitives";

/**
 * Shared admin form pieces — docs/ADMIN.md §6.2.
 *
 * One implementation of the submit button and the status region, used by every
 * editor tab. Each tab having its own would mean each tab drifting on the parts
 * that matter most: the disabled-while-saving state and the announcement that
 * tells a screen-reader user whether their edit was accepted.
 */

/**
 * A submit button that disables itself for the duration of the action.
 *
 * `useFormStatus` reads the state of the enclosing form, so this cannot get out
 * of step with the request the way a manually-tracked boolean can — and a
 * double submit cannot stage the same edit twice.
 */
export function SubmitButton({
  children,
  variant = "secondary",
  size = "md",
  pendingLabel,
  disabled,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  pendingLabel: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending || disabled}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}

export interface ActionResult {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
  message?: string;
}

/**
 * Announces an action's outcome.
 *
 * `role="status"` with `aria-live="polite"` so the result reaches assistive
 * technology without stealing focus mid-edit. Success and failure are
 * distinguished by TEXT and by the message itself, not by colour alone
 * (docs/DESIGN.md §2.5 rule 5).
 */
export function StatusMessage({ state }: { state: ActionResult }) {
  if (!state.error && !state.message) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className={cx(
        "rounded-[10px] border px-3 py-2 text-sm font-medium",
        state.error
          ? "border-danger/40 bg-danger/12 text-danger"
          : "border-success/40 bg-success/12 text-success",
      )}
    >
      {state.error ?? state.message}
    </p>
  );
}

/** Marks a row that has an unpublished edit staged against it. */
export function PendingBadge({ op }: { op: "create" | "update" | "delete" }) {
  const label =
    op === "create"
      ? "New — not published"
      : op === "delete"
        ? "Removal staged"
        : "Edited — not published";
  return <Badge tone={op === "delete" ? "danger" : "warning"}>{label}</Badge>;
}

/**
 * A collapsible editor row.
 *
 * `<details>` rather than a dialog: it needs no JavaScript, it is keyboard
 * operable, it announces its own expanded state, and an accidental collapse
 * does not lose what has been typed — the inputs stay in the DOM.
 */
export function EditorDisclosure({
  summary,
  meta,
  defaultOpen,
  children,
}: {
  summary: React.ReactNode;
  meta?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-[10px] border border-border-default bg-bg-card"
    >
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base [&::-webkit-details-marker]:hidden">
        <span className="flex flex-wrap items-center gap-2 font-medium text-text-primary">
          <span
            aria-hidden
            className="text-text-muted group-open:rotate-90"
            style={{ display: "inline-block" }}
          >
            ›
          </span>
          {summary}
        </span>
        {meta ? (
          <span className="flex flex-wrap items-center gap-2">{meta}</span>
        ) : null}
      </summary>
      <div className="border-t border-border-subtle p-4">{children}</div>
    </details>
  );
}

/** A labelled select built on the shared control styling. */
export function SelectField({
  label,
  name,
  id,
  defaultValue,
  options,
  hint,
  error,
  required,
  disabled,
}: {
  label: string;
  name: string;
  id: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  hint?: string;
  error?: string | undefined;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-xs font-semibold uppercase tracking-wide text-text-secondary"
      >
        {label}
        {required ? (
          <span className="ml-1 font-normal text-text-muted">(required)</span>
        ) : null}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="w-full rounded-[10px] border border-border-default bg-bg-near-black px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base disabled:opacity-50 aria-[invalid=true]:border-danger"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
