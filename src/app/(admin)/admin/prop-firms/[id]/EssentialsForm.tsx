"use client";

import * as React from "react";
import { useActionState } from "react";
import { Tabs } from "radix-ui";
import {
  type ActionResult,
  StatusMessage,
  SubmitButton,
} from "@/components/admin/forms";
import { Card, Field, Input, Textarea } from "@/components/ui/primitives";
import { saveFirmEssentialsAction } from "@/lib/services/firm-actions";
import { COUNTRIES, country } from "@/lib/geo/countries";
import { yearsInOperation } from "@/lib/view/firm-view";
import type { FirmClickStats } from "@/lib/repositories/admin-firms";
import type { StorageState } from "./LogoUpload";

/**
 * THE CORE FIELDS, BY CATEGORY — docs/ADMIN.md §6.2 `[owner-locked 2026-09-04]`.
 *
 * Renders the Overview, Company and Discount panels of the editor's tab bar.
 * All three live in ONE form so a single "Save draft" submits them together —
 * an admin filling in a founder on Company should not have to remember which
 * tab the save button belonged to.
 *
 * The panels are `forceMount`ed and hidden when inactive, so switching tabs
 * never discards what has been typed on another one.
 *
 * COUNTRY AND DATE CREATED APPEAR TWICE, ON PURPOSE. They are listed under
 * both Overview and Company. Each is rendered from ONE piece of React state
 * with exactly ONE submitted input, so the two views are the same field rather
 * than two fields racing to overwrite each other.
 *
 * NOTHING HERE IS REQUIRED `[LOCKED]`. Not even the name. A blank input means
 * NOT SPECIFIED and stores NULL — never an empty string, a zero, or an
 * invented placeholder (PROJECT.md §6.5).
 */

export interface FirmEssentials {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  founderName: string | null;
  ceoName: string | null;
  headquartersCountry: string | null;
  trustpilotRating: string | null;
  trustpilotUrl: string | null;
  foundedOn: string | null;
  payoutInfoUrl: string | null;
  /** Admin-only. The public CTA uses `/go/{slug}` and never this value. */
  affiliateUrl: string | null;
  discountTitle: string | null;
  discountCode: string | null;
  discountDescription: string | null;
  discountPercent: string | null;
  discountEndsAt: string | null;
  logoUrl: string | null;
  logoAlt: string | null;
  clicks: FirmClickStats;
}

/** ISO -> the `datetime-local` shape, in UTC. */
function toLocalInput(iso: string | null): string {
  return iso ? iso.slice(0, 16) : "";
}

/** Hides an inactive panel without unmounting it, so typing is never lost. */
const PANEL = "data-[state=inactive]:hidden focus-visible:outline-none";

/**
 * A searchable country picker.
 *
 * An input plus a `datalist` gives real substring search ("emir" finds the
 * UAE), which a native `select` cannot do — its type-ahead only matches from
 * the start of an option. `submits` is true for exactly one instance: the
 * other is a mirror of the same state.
 */
function CountryPicker({
  id,
  value,
  onChange,
  disabled,
  error,
  submits,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  error?: string | undefined;
  submits: boolean;
}) {
  const match = COUNTRIES.find(
    (c) => c.name.toLowerCase() === value.trim().toLowerCase(),
  );

  return (
    <Field
      label="Country"
      htmlFor={id}
      hint="Where the firm is based. Start typing to search."
      error={error}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-xl leading-none">
          {match?.flag ?? "🏳️"}
        </span>
        <Input
          id={id}
          list="country-options"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="Search countries"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
        />
      </div>
      {/* The stored value is the ISO code; the name is only how it is chosen. */}
      {submits ? (
        <input
          type="hidden"
          name="headquartersCountry"
          value={match?.code ?? ""}
        />
      ) : null}
      <datalist id="country-options">
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.name} />
        ))}
      </datalist>
      {value.trim().length > 0 && !match ? (
        <p className="text-xs text-warning">
          Pick a country from the list — otherwise it is saved as not specified.
        </p>
      ) : null}
    </Field>
  );
}

/**
 * Date created plus the derived years. `submits` as above.
 *
 * MONTH AND YEAR ONLY. A firm publishes "founded 2021", or at best "July
 * 2021"; asking for a day invites someone to pick the 1st and turn a guess
 * into a stored fact (CLAUDE.md §3 `[LOCKED]`). The value is `YYYY-MM` and the
 * day is never entered, never shown, and never claimed.
 */
function FoundedFields({
  idPrefix,
  value,
  onChange,
  disabled,
  error,
  submits,
}: {
  idPrefix: string;
  /** `YYYY-MM`, or empty for unknown. */
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  error?: string | undefined;
  submits: boolean;
}) {
  // The helper works in full dates, so the month is anchored for the maths
  // only. Nothing about that day is stored or displayed.
  const years = yearsInOperation(value ? `${value}-01` : null);
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field
        label="Date created"
        htmlFor={`${idPrefix}-foundedOn`}
        hint="Month and year the company was established. Leave blank if unknown."
        error={error}
      >
        <Input
          id={`${idPrefix}-foundedOn`}
          {...(submits ? { name: "foundedOn" } : {})}
          type="month"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Years in operation
        </span>
        {/* Derived, never stored: a saved count is wrong from the next
            anniversary onwards, and never shown as 0 when unknown. */}
        <p className="rounded-[10px] border border-dashed border-border-default px-3 py-2 text-sm text-text-secondary">
          {years === null ? (
            <span className="italic text-text-muted">
              Not specified — set a date created
            </span>
          ) : (
            `${years}+ years (calculated)`
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * Real outbound click counts — docs/DATABASE.md §5.10a.
 *
 * Counted from `affiliate_clicks` at read time. Bots and internal traffic are
 * EXCLUDED from the headline and reported separately: presenting them as
 * trader interest would overstate the one number an affiliate decision gets
 * made on. Zero is shown as zero (CLAUDE.md §3).
 */
function BuyLinkClicks({ clicks }: { clicks: FirmClickStats }) {
  return (
    <div className="rounded-[10px] border border-border-subtle bg-bg-elevated px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Buy link clicks
        </span>
        <span className="text-lg font-semibold tabular-nums text-text-primary">
          {clicks.clicks}
        </span>
      </div>
      <p className="mt-1 text-xs text-text-muted">
        {clicks.clicks === 0
          ? "No clicks recorded yet."
          : `${clicks.last30Days} in the last 30 days${
              clicks.lastClickAt
                ? `, most recent ${new Date(clicks.lastClickAt)
                    .toISOString()
                    .slice(0, 10)}`
                : ""
            }.`}
        {clicks.excluded > 0
          ? ` ${clicks.excluded} further click${
              clicks.excluded === 1 ? "" : "s"
            } were recorded but excluded as bot or internal traffic.`
          : ""}
      </p>
    </div>
  );
}

export function EssentialsForm({
  firm,
  readOnly,
}: {
  firm: FirmEssentials;
  readOnly: boolean;
  /** Accepted for symmetry with the Branding panel; the logo lives there. */
  storage?: StorageState;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    saveFirmEssentialsAction,
    {},
  );
  const err = (field: string) => state.fieldErrors?.[field];

  // One source of truth per field, mirrored across Overview and Company.
  const [countryName, setCountryName] = React.useState(
    country(firm.headquartersCountry)?.name ?? "",
  );
  // Stored as a date, edited as a month. Any day component a legacy row holds
  // is dropped here rather than shown as if someone had chosen it.
  const [foundedOn, setFoundedOn] = React.useState(
    (firm.foundedOn ?? "").slice(0, 7),
  );

  const save = !readOnly ? (
    <div className="mt-5 flex flex-wrap gap-2">
      <SubmitButton variant="primary" pendingLabel="Saving…">
        Save draft
      </SubmitButton>
    </div>
  ) : null;

  return (
    <form action={formAction} id="firm-essentials-form">
      <input type="hidden" name="firmId" value={firm.id} />
      <div className="mb-4">
        <StatusMessage state={state} />
      </div>

      {/* ------------------------------------------------------- Overview */}
      <Tabs.Content value="overview" forceMount className={PANEL}>
        <Card className="flex flex-col gap-5 p-5 sm:p-6">
          <Field label="Prop firm name" htmlFor="name" error={err("name")}>
            <Input
              id="name"
              name="name"
              defaultValue={firm.name}
              disabled={readOnly}
              aria-invalid={err("name") ? true : undefined}
            />
          </Field>

          <Field label="Tagline" htmlFor="tagline" error={err("tagline")}>
            <Input
              id="tagline"
              name="tagline"
              maxLength={160}
              defaultValue={firm.tagline ?? ""}
              disabled={readOnly}
            />
          </Field>

          <Field
            label="Description"
            htmlFor="description"
            error={err("description")}
          >
            <Textarea
              id="description"
              name="description"
              rows={5}
              defaultValue={firm.description ?? ""}
              disabled={readOnly}
            />
          </Field>

          <Field
            label="Buy link"
            htmlFor="affiliateUrl"
            hint="Where a visitor goes to buy. Must be https://. Never shown publicly — visitors go through /go/{slug}, which resolves it server-side and records the click."
            error={err("affiliateUrl")}
          >
            <Input
              id="affiliateUrl"
              name="affiliateUrl"
              type="url"
              placeholder="https://"
              defaultValue={firm.affiliateUrl ?? ""}
              disabled={readOnly}
              aria-invalid={err("affiliateUrl") ? true : undefined}
            />
          </Field>

          <BuyLinkClicks clicks={firm.clicks} />

          <CountryPicker
            id="countryName"
            value={countryName}
            onChange={setCountryName}
            disabled={readOnly}
            error={err("headquartersCountry")}
            submits
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Trustpilot rating"
              htmlFor="trustpilotRating"
              hint="Trustpilot's rating out of 5 — not a Prop Firm Lenz rating. Leave blank if unknown."
              error={err("trustpilotRating")}
            >
              <Input
                id="trustpilotRating"
                name="trustpilotRating"
                inputMode="decimal"
                placeholder="e.g. 4.6"
                defaultValue={firm.trustpilotRating ?? ""}
                disabled={readOnly}
              />
            </Field>
            <Field
              label="Trustpilot page"
              htmlFor="trustpilotUrl"
              hint="The page the rating came from, so a reader can check it."
              error={err("trustpilotUrl")}
            >
              <Input
                id="trustpilotUrl"
                name="trustpilotUrl"
                type="url"
                placeholder="https://"
                defaultValue={firm.trustpilotUrl ?? ""}
                disabled={readOnly}
              />
            </Field>
          </div>

          <FoundedFields
            idPrefix="overview"
            value={foundedOn}
            onChange={setFoundedOn}
            disabled={readOnly}
            error={err("foundedOn")}
            submits
          />

          <Field
            label="Payout information"
            htmlFor="payoutInfoUrl"
            hint="Where the firm publishes its own payout evidence. A link only — the firm's own claim, never verified data."
            error={err("payoutInfoUrl")}
          >
            <Input
              id="payoutInfoUrl"
              name="payoutInfoUrl"
              type="url"
              placeholder="https://"
              defaultValue={firm.payoutInfoUrl ?? ""}
              disabled={readOnly}
            />
          </Field>

          {save}
        </Card>
      </Tabs.Content>

      {/* -------------------------------------------------------- Company */}
      <Tabs.Content value="company" forceMount className={PANEL}>
        <Card className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Founder"
              htmlFor="founderName"
              error={err("founderName")}
            >
              <Input
                id="founderName"
                name="founderName"
                defaultValue={firm.founderName ?? ""}
                disabled={readOnly}
              />
            </Field>
            <Field label="CEO" htmlFor="ceoName" error={err("ceoName")}>
              <Input
                id="ceoName"
                name="ceoName"
                defaultValue={firm.ceoName ?? ""}
                disabled={readOnly}
              />
            </Field>
          </div>

          {/* The same field as on Overview — one state, one submitted input. */}
          <CountryPicker
            id="companyCountryName"
            value={countryName}
            onChange={setCountryName}
            disabled={readOnly}
            submits={false}
          />

          <FoundedFields
            idPrefix="company"
            value={foundedOn}
            onChange={setFoundedOn}
            disabled={readOnly}
            submits={false}
          />

          <p className="text-xs text-text-muted">
            Legal name, headquarters city, website and support details are under
            Advanced.
          </p>

          {save}
        </Card>
      </Tabs.Content>

      {/* ------------------------------------------------------- Discount */}
      <Tabs.Content value="discount" forceMount className={PANEL}>
        <Card className="flex flex-col gap-5 p-5 sm:p-6">
          <p className="text-sm text-text-muted">
            Saved as the firm&apos;s offer. Enter only what the firm actually
            publishes; leave blank if there is no current discount.
          </p>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Title"
              htmlFor="discountTitle"
              hint="What the visitor sees, e.g. 20% OFF."
              error={err("discountTitle")}
            >
              <Input
                id="discountTitle"
                name="discountTitle"
                defaultValue={firm.discountTitle ?? ""}
                disabled={readOnly}
              />
            </Field>
            <Field
              label="Code"
              htmlFor="discountCode"
              hint="Shown with a copy button on the public page. No code, no button."
              error={err("discountCode")}
            >
              <Input
                id="discountCode"
                name="discountCode"
                defaultValue={firm.discountCode ?? ""}
                disabled={readOnly}
              />
            </Field>
          </div>

          <Field
            label="Description"
            htmlFor="discountDescription"
            hint="Optional. Left blank, the public page renders no description block."
            error={err("discountDescription")}
          >
            <Textarea
              id="discountDescription"
              name="discountDescription"
              rows={2}
              defaultValue={firm.discountDescription ?? ""}
              disabled={readOnly}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Discount %"
              htmlFor="discountPercent"
              hint="Optional. Only if the firm publishes a percentage."
              error={err("discountPercent")}
            >
              <Input
                id="discountPercent"
                name="discountPercent"
                inputMode="decimal"
                defaultValue={firm.discountPercent ?? ""}
                disabled={readOnly}
              />
            </Field>
            <Field
              label="Expires (UTC)"
              htmlFor="discountEndsAt"
              hint="Optional. After this the offer stops showing publicly."
              error={err("discountEndsAt")}
            >
              <Input
                id="discountEndsAt"
                name="discountEndsAt"
                type="datetime-local"
                defaultValue={toLocalInput(firm.discountEndsAt)}
                disabled={readOnly}
              />
            </Field>
          </div>

          {save}
        </Card>
      </Tabs.Content>
    </form>
  );
}
