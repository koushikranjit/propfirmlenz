"use client";

import { useActionState } from "react";
import { StatusMessage, SubmitButton } from "@/components/admin/forms";
import { Badge, Card } from "@/components/ui/primitives";
import {
  type ActionState,
  seedRegistryAction,
  testProviderAction,
} from "@/lib/services/payout-actions";

/**
 * Provider status and connection testing — docs/PAYOUTS.md §4.
 *
 * WHAT THIS DELIBERATELY CANNOT SHOW: the API key. The server reports whether
 * the environment variable is set, by NAME, and what a test request returned.
 * The value is never sent to the browser, so there is nothing here to leak
 * (CLAUDE.md §6 `[LOCKED]`).
 */

export interface ProviderRow {
  id: string;
  key: string;
  name: string;
  envVar: string | null;
  configured: boolean;
  isEnabled: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestStatus: string | null;
  lastTestLatencyMs: number | null;
  networks: string[];
}

function TestButton({ providerId }: { providerId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(
    testProviderAction,
    {},
  );
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="providerId" value={providerId} />
      <SubmitButton size="sm" pendingLabel="Testing…">
        Test connection
      </SubmitButton>
      <StatusMessage state={state} />
    </form>
  );
}

export function SeedRegistryButton() {
  const [state, action] = useActionState<ActionState, FormData>(
    seedRegistryAction,
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-2">
      <SubmitButton variant="primary" pendingLabel="Updating…">
        Add missing providers, networks and tokens
      </SubmitButton>
      <StatusMessage state={state} />
    </form>
  );
}

export function ProviderCard({ provider }: { provider: ProviderRow }) {
  const status = !provider.configured
    ? { tone: "warning" as const, label: "Not configured" }
    : provider.lastTestOk === true
      ? { tone: "success" as const, label: "Connected" }
      : provider.lastTestOk === false
        ? { tone: "danger" as const, label: "Connection failed" }
        : { tone: "neutral" as const, label: "Not tested" };

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">
            {provider.name}
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            {provider.networks.length > 0
              ? provider.networks.join(", ")
              : "No network uses this provider yet"}
          </p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Credential
          </dt>
          {/* The variable NAME only — never a value, never a prefix. */}
          <dd className="mt-0.5 font-mono text-xs text-text-secondary">
            {provider.envVar ?? "none required"}
            {provider.envVar ? (
              <span
                className={
                  provider.configured
                    ? "ml-2 text-success"
                    : "ml-2 text-warning"
                }
              >
                {provider.configured ? "set on the server" : "not set"}
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Last test
          </dt>
          <dd className="mt-0.5 text-text-secondary">
            {provider.lastTestedAt
              ? `${provider.lastTestedAt.slice(0, 16).replace("T", " ")} · ${
                  provider.lastTestStatus ?? "—"
                }${
                  provider.lastTestLatencyMs !== null
                    ? ` · ${provider.lastTestLatencyMs}ms`
                    : ""
                }`
              : "Never tested"}
          </dd>
        </div>
      </dl>

      <TestButton providerId={provider.id} />
    </Card>
  );
}
