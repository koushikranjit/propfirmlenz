"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  SelectField,
  StatusMessage,
  SubmitButton,
} from "@/components/admin/forms";
import { Badge, Field, Input } from "@/components/ui/primitives";
import {
  type ActionState,
  saveWalletAction,
} from "@/lib/services/payout-actions";
import { WALLET_PURPOSES } from "@/lib/db/schema/payouts";
import type {
  AdminNetwork,
  AdminWallet,
} from "@/lib/repositories/admin-payouts";

/**
 * Firm-scoped payout tracking — docs/PAYOUTS.md §11.
 *
 * A CONFIGURATION POINT, NOT A SECOND SYSTEM `[LOCKED]`. It writes a
 * `tracked_wallets` row against THIS firm's existing `prop_firms.id` through
 * the same `saveWalletAction` the Payout Tracking section uses. It cannot
 * create a firm, and it never touches transactions, candidates or verified
 * payouts — those stay in the operational queue where a person reviews them.
 *
 * PROVIDER CREDENTIALS ARE GLOBAL, NOT PER FIRM. They are server environment
 * variables shared by every wallet on a network, so this panel reports the
 * network's provider and whether it can actually run — it never asks an admin
 * to paste an API key into a form, and no secret is ever sent to the browser.
 */

const titleCase = (value: string): string =>
  value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function PayoutTrackingSection({
  firmId,
  networks,
  wallets,
  readOnly,
}: {
  firmId: string;
  networks: AdminNetwork[];
  wallets: AdminWallet[];
  readOnly: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    saveWalletAction,
    {},
  );
  const active = networks.filter((n) => n.isActive);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-text-muted">
        Wallets recorded here are scanned for outgoing transfers. Every transfer
        becomes a candidate that a person reviews — nothing is published as a
        payout automatically. The full queue lives in{" "}
        <Link
          href="/admin/payouts"
          className="rounded text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
        >
          Payout Tracking
        </Link>
        .
      </p>

      {wallets.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {wallets.map((wallet) => (
            <li
              key={wallet.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-border-default bg-bg-elevated px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-xs text-text-secondary">
                  {wallet.address}
                </p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {wallet.networkName} · {titleCase(wallet.purpose)} ·{" "}
                  {wallet.transactionCount} transaction
                  {wallet.transactionCount === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {wallet.lastScanError ? (
                  <Badge tone="danger">Last scan failed</Badge>
                ) : wallet.isActive ? (
                  <Badge tone="success">Scanning</Badge>
                ) : (
                  <Badge tone="neutral">Paused</Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {active.length === 0 ? (
        <p className="rounded-[10px] border border-dashed border-border-default px-4 py-3 text-sm text-text-muted">
          No blockchain network is active yet, so there is nothing to track a
          wallet on. Add one under{" "}
          <Link
            href="/admin/payouts/networks"
            className="rounded text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
          >
            Networks
          </Link>
          .
        </p>
      ) : readOnly ? (
        <p className="text-sm text-text-muted">
          You have read-only access to this firm.
        </p>
      ) : (
        <form action={action} className="flex flex-col gap-4">
          {/* The firm is fixed to the record being edited — a client-supplied
              firm id must never be able to attach a wallet elsewhere. */}
          <input type="hidden" name="propFirmId" value={firmId} />
          <input type="hidden" name="verificationStatus" value="unverified" />
          <input type="hidden" name="isActive" value="on" />
          <StatusMessage state={state} />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Blockchain / network"
              name="networkId"
              id="pt-network"
              required
              options={active.map((n) => ({
                value: n.id,
                label: `${n.name} (${n.provider})`,
              }))}
              hint="Only networks an operator has activated appear here."
              error={state.fieldErrors?.networkId}
            />
            <SelectField
              label="What the wallet is used for"
              name="purpose"
              id="pt-purpose"
              defaultValue="trader_payouts"
              options={WALLET_PURPOSES.map((p) => ({
                value: p,
                label: titleCase(p),
              }))}
              hint="Research, not proof. Every transfer is still reviewed."
            />
          </div>

          <Field
            label="Payout wallet address"
            htmlFor="pt-address"
            required
            error={state.fieldErrors?.address}
            hint="As the chain displays it. Matching is case-insensitive."
          >
            <Input
              id="pt-address"
              name="address"
              required
              className="font-mono"
            />
          </Field>

          <Field
            label="Label"
            htmlFor="pt-label"
            hint="Optional, for your own reference."
          >
            <Input id="pt-label" name="label" />
          </Field>

          <div>
            <SubmitButton variant="primary" pendingLabel="Saving…">
              Track this wallet
            </SubmitButton>
          </div>
        </form>
      )}

      <div className="rounded-[10px] border border-border-subtle bg-bg-elevated px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          API / provider
        </p>
        {active.length === 0 ? (
          <p className="mt-1 text-sm text-text-muted">
            No active network, so no provider is in use.
          </p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-sm text-text-secondary">
            {active.map((n) => (
              <li key={n.id}>
                {n.name} — {n.provider}
              </li>
            ))}
          </ul>
        )}
        {/* Credentials are server environment variables, shared per provider.
            They are never per firm and never entered through the browser. */}
        <p className="mt-2 text-xs text-text-muted">
          Provider credentials are server configuration, shared by every wallet
          on a network. They are never entered here and never sent to the
          browser. A scan run without one fails visibly rather than reporting
          zero payouts.
        </p>
      </div>
    </div>
  );
}
