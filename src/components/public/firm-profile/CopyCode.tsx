"use client";

import * as React from "react";

/**
 * Copy a discount code to the clipboard.
 *
 * The ONLY interactive client component on the firm profile, and it exists
 * because a code a visitor has to retype by hand is a code they get wrong.
 *
 * The code is rendered as TEXT regardless — the button is an enhancement, and
 * when the clipboard API is unavailable or refused the code is still readable
 * and selectable. Feedback is announced politely rather than only shown in
 * colour (docs/DESIGN.md §2.5 rule 5).
 */
export function CopyCode({ code }: { code: string }) {
  const [state, setState] = React.useState<"idle" | "copied" | "failed">(
    "idle",
  );

  // Reverts the label so a second copy still reads as an action.
  React.useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2500);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
    } catch {
      // A refused clipboard permission is not an error worth shouting about;
      // the code is on screen and can be selected.
      setState("failed");
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <code className="rounded-[6px] border border-border-default bg-bg-near-black px-2 py-1 font-mono text-sm text-text-primary">
        {code}
      </code>
      <button
        type="button"
        onClick={copy}
        className="inline-flex h-8 items-center rounded-[8px] border border-border-default bg-bg-elevated px-3 text-xs font-semibold text-text-primary hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
      >
        {state === "copied" ? "Copied!" : "Copy code"}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {state === "copied"
          ? `Copied ${code} to the clipboard`
          : state === "failed"
            ? "Copying failed — select the code to copy it manually"
            : ""}
      </span>
      {state === "failed" ? (
        <span className="text-xs text-text-muted">
          Copying was blocked — select the code instead.
        </span>
      ) : null}
    </span>
  );
}
