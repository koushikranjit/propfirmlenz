"use client";

import type * as React from "react";
import { useActionState } from "react";
import {
  type ActionState,
  saveNetworkAction,
  saveWalletAction,
  scanWalletAction,
} from "@/lib/services/payout-actions";
import {
  EditorDisclosure,
  SelectField,
  StatusMessage,
  SubmitButton,
} from "@/components/admin/forms";
import { Card, Field, Input, Textarea } from "@/components/ui/primitives";
import { PROVIDER_KEYS } from "@/lib/validation/payouts";
import {
  WALLET_PURPOSES,
  WALLET_VERIFICATION_STATUS,
} from "@/lib/db/schema/payouts";
import type {
  AdminNetwork,
  AdminWallet,
} from "@/lib/repositories/admin-payouts";

/**
 * Wallet and network administration — docs/PAYOUTS.md §11.
 *
 * These forms record WHAT WE WATCH. They never record a payout: a wallet's
 * purpose is a researched classification, and every transaction leaving it
 * still has to pass review before it counts (docs/PAYOUTS.md §6 `[LOCKED]`).
 */

const titleCase = (value: string): string =>
  value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const purposeOptions = WALLET_PURPOSES.map((value) => ({
  value,
  label: titleCase(value),
}));

const verificationOptions = WALLET_VERIFICATION_STATUS.map((value) => ({
  value,
  label: titleCase(value),
}));

const providerOptions = PROVIDER_KEYS.map((value) => ({
  value,
  label: value === "trongrid" ? "TronGrid (Tron)" : "Etherscan v2 (EVM)",
}));

function Checkbox({
  id,
  name,
  label,
  defaultChecked,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  defaultChecked?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="flex items-center gap-2 text-sm text-text-primary"
      >
        <input
          id={id}
          name={name}
          type="checkbox"
          defaultChecked={defaultChecked}
          className="size-4 rounded border-border-default bg-bg-near-black accent-brand-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
        />
        {label}
      </label>
      {hint ? <p className="text-xs text-text-muted">{hint}</p> : null}
    </div>
  );
}

export function WalletForm({
  firms,
  networks,
  wallet,
}: {
  firms: { id: string; name: string }[];
  networks: AdminNetwork[];
  wallet?: AdminWallet;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    saveWalletAction,
    {},
  );
  const id = wallet?.id ?? "new";
  const active = networks.filter(
    (n) => n.isActive || n.id === wallet?.networkId,
  );

  if (active.length === 0) {
    return (
      <Card className="p-5">
        <p className="text-sm text-text-muted">
          No active network yet. Add one below before recording a wallet —
          without a network there is nothing to read the address on.
        </p>
      </Card>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {wallet ? <input type="hidden" name="id" value={wallet.id} /> : null}
      <StatusMessage state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Prop firm"
          name="propFirmId"
          id={`propFirmId-${id}`}
          required
          {...(wallet?.firmId ? { defaultValue: wallet.firmId } : {})}
          options={firms.map((f) => ({ value: f.id, label: f.name }))}
          error={state.fieldErrors?.propFirmId}
        />
        <SelectField
          label="Network"
          name="networkId"
          id={`networkId-${id}`}
          required
          {...(wallet?.networkId ? { defaultValue: wallet.networkId } : {})}
          options={active.map((n) => ({ value: n.id, label: n.name }))}
          error={state.fieldErrors?.networkId}
        />
      </div>

      <Field
        label="Wallet address"
        htmlFor={`address-${id}`}
        required
        error={state.fieldErrors?.address}
        hint="As the chain displays it. Matching is case-insensitive."
      >
        <Input
          id={`address-${id}`}
          name="address"
          required
          defaultValue={wallet?.address ?? ""}
          className="font-mono"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Label" htmlFor={`label-${id}`}>
          <Input
            id={`label-${id}`}
            name="label"
            defaultValue={wallet?.label ?? ""}
            placeholder="e.g. Main payout wallet"
          />
        </Field>
        <SelectField
          label="What it appears to be used for"
          name="purpose"
          id={`purpose-${id}`}
          defaultValue={wallet?.purpose ?? "unknown"}
          options={purposeOptions}
          hint="A classification, not proof. Transactions still need review."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="How well established the ownership is"
          name="verificationStatus"
          id={`verificationStatus-${id}`}
          defaultValue={wallet?.verificationStatus ?? "unverified"}
          options={verificationOptions}
        />
        <Checkbox
          id={`isActive-${id}`}
          name="isActive"
          label="Scan this wallet"
          defaultChecked={wallet?.isActive ?? true}
          hint="Turning this off stops future scans; existing payouts are untouched."
        />
      </div>

      <Field
        label="Research notes"
        htmlFor={`notes-${id}`}
        hint="Admin-only. Where the address came from, and how it was confirmed. Never shown publicly."
      >
        <Textarea
          id={`notes-${id}`}
          name="notes"
          defaultValue={wallet?.notes ?? ""}
        />
      </Field>

      <div>
        <SubmitButton variant="primary" pendingLabel="Saving…">
          {wallet ? "Save wallet" : "Track this wallet"}
        </SubmitButton>
      </div>
    </form>
  );
}

/** On-demand scan. Reports a provider failure as a failure, never as "none". */
export function ScanButton({ walletId }: { walletId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(
    scanWalletAction,
    {},
  );

  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="walletId" value={walletId} />
      <SubmitButton size="sm" pendingLabel="Scanning…">
        Scan now
      </SubmitButton>
      <StatusMessage state={state} />
    </form>
  );
}

export function NetworkForm({ network }: { network?: AdminNetwork }) {
  const [state, action] = useActionState<ActionState, FormData>(
    saveNetworkAction,
    {},
  );
  const id = network?.id ?? "new";

  return (
    <form action={action} className="flex flex-col gap-4">
      {network ? <input type="hidden" name="id" value={network.id} /> : null}
      <StatusMessage state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Key"
          htmlFor={`key-${id}`}
          required
          error={state.fieldErrors?.key}
          hint="Lower-case, e.g. tron or ethereum."
        >
          <Input
            id={`key-${id}`}
            name="key"
            required
            defaultValue={network?.key ?? ""}
          />
        </Field>
        <Field
          label="Name"
          htmlFor={`name-${id}`}
          required
          error={state.fieldErrors?.name}
        >
          <Input
            id={`name-${id}`}
            name="name"
            required
            defaultValue={network?.name ?? ""}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Provider"
          name="provider"
          id={`provider-${id}`}
          defaultValue={network?.provider ?? "trongrid"}
          options={providerOptions}
          hint="Scanning needs that provider's API credential configured on the server."
          error={state.fieldErrors?.provider}
        />
        <Field
          label="EVM chain id"
          htmlFor={`chainId-${id}`}
          error={state.fieldErrors?.chainId}
          hint="Required for Etherscan networks; blank for non-EVM chains."
        >
          <Input
            id={`chainId-${id}`}
            name="chainId"
            inputMode="numeric"
            defaultValue={network?.chainId?.toString() ?? ""}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Native symbol"
          htmlFor={`nativeSymbol-${id}`}
          required
          error={state.fieldErrors?.nativeSymbol}
        >
          <Input
            id={`nativeSymbol-${id}`}
            name="nativeSymbol"
            required
            defaultValue={network?.nativeSymbol ?? ""}
          />
        </Field>
        <Field
          label="Confirmations required"
          htmlFor={`confirmationsRequired-${id}`}
          required
          error={state.fieldErrors?.confirmationsRequired}
          hint="Below this, a transaction is not treated as settled and cannot be verified."
        >
          <Input
            id={`confirmationsRequired-${id}`}
            name="confirmationsRequired"
            inputMode="numeric"
            required
            defaultValue={network?.confirmationsRequired?.toString() ?? "12"}
          />
        </Field>
      </div>

      <Field
        label="Explorer transaction URL"
        htmlFor={`explorerTxTemplate-${id}`}
        required
        error={state.fieldErrors?.explorerTxTemplate}
        hint="Include {hash} where the transaction hash goes — this is the link readers use to check a payout."
      >
        <Input
          id={`explorerTxTemplate-${id}`}
          name="explorerTxTemplate"
          required
          defaultValue={network?.explorerTxTemplate ?? ""}
          placeholder="https://example.test/tx/{hash}"
          className="font-mono"
        />
      </Field>

      <Checkbox
        id={`networkActive-${id}`}
        name="isActive"
        label="Active"
        defaultChecked={network?.isActive ?? false}
        hint="Only active networks are scanned."
      />

      <div>
        <SubmitButton variant="primary" pendingLabel="Saving…">
          {network ? "Save network" : "Add network"}
        </SubmitButton>
      </div>
    </form>
  );
}

/** Wraps an edit form so a long list of wallets or networks stays scannable. */
export function EditDisclosure({
  summary,
  meta,
  children,
}: {
  summary: React.ReactNode;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <EditorDisclosure summary={summary} {...(meta ? { meta } : {})}>
      {children}
    </EditorDisclosure>
  );
}
