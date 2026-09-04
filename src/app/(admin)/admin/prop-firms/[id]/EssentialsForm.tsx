"use client";

import * as React from "react";
import { useActionState } from "react";
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
import { LogoUpload, type StorageState } from "./LogoUpload";

/**
 * THE PRIMARY EDITOR — docs/ADMIN.md §6 `[owner-locked 2026-09-04]`.
 *
 * The sixteen core fields, on one screen, in the order someone actually fills
 * them. Everything else the schema holds stays editable in the collapsed
 * sections below; nothing was removed from the data model, only from the
 * default view.
 *
 * ONLY THE NAME IS REQUIRED. Every other field can stay blank until the
 * information exists — a blank input means NOT SPECIFIED and is stored as NULL,
 * never as an empty string or a borrowed default (PROJECT.md §6.5 `[LOCKED]`).
 *
 * PARTIAL SAVE `[LOCKED]`. This form writes only the fields it shows. Company
 * details, platforms, instruments, challenges, rules and SEO entered elsewhere
 * are untouched by a save from here.
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

/**
 * A searchable country field.
 *
 * An input plus a `datalist` gives real substring search ("emir" finds the
 * UAE), which a native `select` cannot do — its type-ahead only matches from
 * the start of an option. The visible field holds the NAME; a hidden field
 * carries the ISO code, which is what the database stores.
 */
function CountryField({
  defaultCode,
  disabled,
  error,
}: {
  defaultCode: string | null;
  disabled: boolean;
  error?: string | undefined;
}) {
  const initial = country(defaultCode);
  const [name, setName] = React.useState(initial?.name ?? "");

  const match = COUNTRIES.find(
    (c) => c.name.toLowerCase() === name.trim().toLowerCase(),
  );

  return (
    <Field
      label="Country"
      htmlFor="countryName"
      hint="Where the firm is based. Start typing to search."
      error={error}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-xl leading-none">
          {match?.flag ?? "🏳️"}
        </span>
        <Input
          id="countryName"
          list="country-options"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={disabled}
          placeholder="Search countries"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
        />
      </div>
      {/* The code is what gets stored; the name is only how it is chosen. */}
      <input
        type="hidden"
        name="headquartersCountry"
        value={match?.code ?? ""}
      />
      <datalist id="country-options">
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.name} />
        ))}
      </datalist>
      {name.trim().length > 0 && !match ? (
        <p className="text-xs text-warning">
          Pick a country from the list — otherwise it is saved as not specified.
        </p>
      ) : null}
    </Field>
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
                ? `, most recent ${new Date(clicks.lastClickAt).toISOString().slice(0, 10)}`
                : ""
            }.`}
        {clicks.excluded > 0
          ? ` ${clicks.excluded} further click${clicks.excluded === 1 ? "" : "s"} were recorded but excluded as bot or internal traffic.`
          : ""}
      </p>
    </div>
  );
}

export function EssentialsForm({
  firm,
  readOnly,
  storage,
}: {
  firm: FirmEssentials;
  readOnly: boolean;
  storage: StorageState;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    saveFirmEssentialsAction,
    {},
  );
  const err = (field: string) => state.fieldErrors?.[field];

  // Mirrors the server's derivation so the admin sees what the page will show.
  const [foundedOn, setFoundedOn] = React.useState(firm.foundedOn ?? "");
  const years = yearsInOperation(foundedOn || null);

  return (
    <div className="flex flex-col gap-4">
      {/*
        The logo posts its own multipart form, so it lives OUTSIDE the
        essentials form — nested forms are invalid HTML and the browser drops
        the inner one.
      */}
      <Card className="p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-text-primary">Logo</h2>
        <div className="mt-4">
          <LogoUpload
            firmId={firm.id}
            logoUrl={firm.logoUrl}
            logoAlt={firm.logoAlt}
            readOnly={readOnly}
            storage={storage}
          />
        </div>
      </Card>

      <form action={formAction} id="firm-essentials-form">
        <input type="hidden" name="firmId" value={firm.id} />

        <div className="flex flex-col gap-4">
          <StatusMessage state={state} />

          {/* ----------------------------------------- basic information */}
          <Card className="flex flex-col gap-5 p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-text-primary">
              Basic information
            </h2>

            <Field
              label="Prop firm name"
              htmlFor="name"
              required
              hint="The only required field. The URL slug is derived from it."
              error={err("name")}
            >
              <Input
                id="name"
                name="name"
                defaultValue={firm.name}
                required
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
              hint="Needed before publishing. Leave blank rather than guessing."
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

            <CountryField
              defaultCode={firm.headquartersCountry}
              disabled={readOnly}
              error={err("headquartersCountry")}
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

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Date created"
                htmlFor="foundedOn"
                hint="When the company was established. Leave blank if unknown."
                error={err("foundedOn")}
              >
                <Input
                  id="foundedOn"
                  name="foundedOn"
                  type="date"
                  value={foundedOn}
                  onChange={(e) => setFoundedOn(e.target.value)}
                  disabled={readOnly}
                />
              </Field>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Years in operation
                </span>
                {/* Calculated, never typed: a stored count is wrong from the
                    next anniversary onwards. */}
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
          </Card>

          {/* --------------------------------------------------- discount */}
          <Card className="flex flex-col gap-5 p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-text-primary">
              Discount
            </h2>
            <p className="-mt-2 text-sm text-text-muted">
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
                hint="Shown with a copy button on the public page."
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
          </Card>

          {!readOnly ? (
            <div className="flex flex-wrap gap-2">
              <SubmitButton variant="primary" pendingLabel="Saving…">
                Save draft
              </SubmitButton>
            </div>
          ) : null}
        </div>
      </form>
    </div>
  );
}
