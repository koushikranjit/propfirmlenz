"use client";

import { useActionState } from "react";
import {
  type StorageCheckState,
  testStorageAction,
} from "@/lib/services/storage-actions";
import { SubmitButton } from "@/components/admin/forms";

/**
 * Media storage status and self-test.
 *
 * Shows WHICH variables are absent, by name, and never a value — a settings
 * screen that echoes a secret back is a secret in a screenshot (CLAUDE.md §6
 * `[LOCKED]`).
 *
 * The test button exists because four of the five variables fail loudly and
 * one fails silently: a wrong `R2_PUBLIC_BASE_URL` lets uploads succeed and
 * then 404s every logo for visitors. Only a real read over the public URL
 * catches that, so the panel reports each leg separately.
 */
const STEP_LABEL: Record<string, string> = {
  write: "Write to the bucket",
  read: "Read back over the public URL",
  cleanup: "Remove the probe object",
};

export function StorageCheckPanel({
  configured,
  missing,
  canTest,
}: {
  configured: boolean;
  missing: string[];
  canTest: boolean;
}) {
  const [state, action] = useActionState<StorageCheckState, FormData>(
    testStorageAction,
    {},
  );

  return (
    <section className="rounded-[14px] border border-border-default bg-bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text-primary">
            Media storage
          </h2>
          <p className="mt-1 max-w-prose text-sm text-text-muted">
            Cloudflare R2 holds uploaded firm logos. Until it is configured the
            logo field in the firm editor says so, and every other field keeps
            working.
          </p>
        </div>
        <span
          className={
            "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold " +
            (configured
              ? "border-success/40 bg-success/12 text-success"
              : "border-warning/40 bg-warning/12 text-warning")
          }
        >
          {configured ? "Configured" : "Not configured"}
        </span>
      </div>

      {missing.length > 0 ? (
        <div className="mt-4 rounded-[10px] border border-warning/40 bg-warning/10 px-4 py-3">
          <p className="text-sm font-medium text-text-primary">
            Missing on the server
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {missing.map((name) => (
              <li
                key={name}
                className="rounded border border-border-default bg-bg-near-black px-2 py-1 font-mono text-xs text-text-secondary"
              >
                {name}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-text-muted">
            Set these as server environment variables and redeploy. They are
            never read in the browser, and this screen never displays their
            values.
          </p>
        </div>
      ) : null}

      {canTest ? (
        <form action={action} className="mt-5">
          <SubmitButton pendingLabel="Testing…">
            Test storage end to end
          </SubmitButton>
          <p className="mt-2 text-xs text-text-muted">
            Writes a small file, reads it back over the public URL, and deletes
            it again.
          </p>
        </form>
      ) : (
        <p className="mt-5 text-sm text-text-muted">
          You can see the storage status but not run the test.
        </p>
      )}

      {state.error ? (
        <p className="mt-4 rounded-[10px] border border-danger/40 bg-danger/12 px-3 py-2 text-sm font-medium text-danger">
          {state.error}
        </p>
      ) : null}

      {state.ran && state.check ? (
        <div className="mt-4">
          <p
            className={
              "text-sm font-semibold " +
              (state.check.ok ? "text-success" : "text-danger")
            }
          >
            {state.check.ok
              ? "Storage is working — uploads will be visible to readers."
              : "Storage is not usable yet."}
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {state.check.steps.map((step) => (
              <li
                key={step.step}
                className="flex gap-3 rounded-[10px] border border-border-subtle bg-bg-near-black px-3 py-2"
              >
                <span
                  aria-hidden
                  className={
                    "mt-0.5 shrink-0 text-sm " +
                    (step.ok ? "text-success" : "text-danger")
                  }
                >
                  {step.ok ? "✓" : "✕"}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-text-primary">
                    {STEP_LABEL[step.step] ?? step.step}
                    <span className="sr-only">
                      {step.ok ? " passed" : " failed"}
                    </span>
                  </span>
                  <span className="block text-sm text-text-secondary">
                    {step.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
