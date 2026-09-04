"use client";

import { useActionState } from "react";
import {
  type ActionResult,
  StatusMessage,
  SubmitButton,
} from "@/components/admin/forms";
import { Card, Field, Input, Textarea } from "@/components/ui/primitives";
import { saveFirmEssentialsAction } from "@/lib/services/firm-actions";

/**
 * THE SIMPLE EDITOR — docs/ADMIN.md §6.
 *
 * Everything needed to get a firm listed and monetised, and nothing else. The
 * full structured record still exists and is still editable under Advanced;
 * this screen just stops an admin having to walk seventeen tabs to add a firm.
 *
 * PARTIAL SAVE `[LOCKED]`. It writes only the fields shown here. Company
 * details, platforms, instruments, challenges, rules and SEO entered under
 * Advanced are untouched by a save from this form.
 */

export interface FirmEssentials {
  id: string;
  name: string;
  description: string | null;
  websiteUrl: string | null;
  payoutInfoUrl: string | null;
  /** Admin-only. The public CTA uses `/go/{slug}` and never this value. */
  affiliateUrl: string | null;
  discountCode: string | null;
  discountPercent: string | null;
  discountEndsAt: string | null;
  hasLogo: boolean;
}

/** ISO -> the `datetime-local` shape, in UTC. */
function toLocalInput(iso: string | null): string {
  return iso ? iso.slice(0, 16) : "";
}

export function EssentialsForm({
  firm,
  readOnly,
}: {
  firm: FirmEssentials;
  readOnly: boolean;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    saveFirmEssentialsAction,
    {},
  );
  const err = (field: string) => state.fieldErrors?.[field];

  return (
    <form action={formAction} id="firm-essentials-form">
      <input type="hidden" name="firmId" value={firm.id} />

      <div className="flex flex-col gap-4">
        <StatusMessage state={state} />

        {/* ------------------------------------------------------- basics */}
        <Card className="flex flex-col gap-5 p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-text-primary">
            Basic information
          </h2>

          <Field
            label="Prop firm name"
            htmlFor="name"
            required
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

          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Logo
            </span>
            {/*
              HONEST STATE, not a fake uploader. The `media` table exists, but
              no upload endpoint or object storage does, so a file input here
              would be a control that cannot work. It arrives with the media
              library (docs/SESSION.md, known issues).
            */}
            <p className="mt-1.5 rounded-[10px] border border-dashed border-border-default px-4 py-3 text-sm text-text-muted">
              {firm.hasLogo
                ? "A logo is attached. Replacing it needs the media library, which is not built yet."
                : "Logo upload arrives with the media library. Until then the public page shows a neutral placeholder rather than a broken image."}
            </p>
          </div>

          <Field
            label="Short description"
            htmlFor="description"
            hint="Required before publishing. Leave blank rather than guessing."
            error={err("description")}
          >
            <Textarea
              id="description"
              name="description"
              rows={4}
              defaultValue={firm.description ?? ""}
              disabled={readOnly}
            />
          </Field>
        </Card>

        {/* -------------------------------------------------------- links */}
        <Card className="flex flex-col gap-5 p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-text-primary">Links</h2>

          <Field
            label="Official website"
            htmlFor="websiteUrl"
            error={err("websiteUrl")}
          >
            <Input
              id="websiteUrl"
              name="websiteUrl"
              type="url"
              placeholder="https://"
              defaultValue={firm.websiteUrl ?? ""}
              disabled={readOnly}
            />
          </Field>

          <Field
            label="Purchase / affiliate link"
            htmlFor="affiliateUrl"
            hint="Must be https://. Never shown publicly — visitors go through /go/{slug}, which resolves it server-side and records the click."
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

          <Field
            label="Payout information / tracker link"
            htmlFor="payoutInfoUrl"
            hint="Where the firm publishes its own payout evidence. A link only — no payout figures are stored or claimed."
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

        {/* ----------------------------------------------------- discount */}
        <Card className="flex flex-col gap-5 p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-text-primary">Discount</h2>
          <p className="-mt-2 text-sm text-text-muted">
            Saved as the firm&apos;s offer. Enter only what the firm actually
            publishes; leave blank if there is no current discount.
          </p>

          <div className="grid gap-5 sm:grid-cols-3">
            <Field
              label="Discount code"
              htmlFor="discountCode"
              error={err("discountCode")}
            >
              <Input
                id="discountCode"
                name="discountCode"
                defaultValue={firm.discountCode ?? ""}
                disabled={readOnly}
              />
            </Field>
            <Field
              label="Discount %"
              htmlFor="discountPercent"
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
              hint="Optional."
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
  );
}
