"use client";

import { useActionState } from "react";
import {
  type ActionResult,
  EditorDisclosure,
  PendingBadge,
  SelectField,
  StatusMessage,
  SubmitButton,
} from "@/components/admin/forms";
import {
  Badge,
  Card,
  Field,
  Input,
  Textarea,
} from "@/components/ui/primitives";
import type {
  AdminAffiliateLink,
  AdminOffer,
} from "@/lib/repositories/admin-firm-children";
import {
  removeChildAction,
  saveAffiliateLinkAction,
  saveOfferAction,
} from "@/lib/services/firm-child-actions";

/**
 * Offers and affiliate links.
 *
 * DATES ARE UTC `[LOCKED]`. `datetime-local` carries no offset, so every field
 * here is labelled "(UTC)" and parsed as UTC on the server. Without that, the
 * same typed string would mean different instants for an admin in London and a
 * server in Virginia, and an offer would expire an hour early or late.
 *
 * AFFILIATE DESTINATIONS. The destination is edited here and stored on the
 * link; it NEVER enters `FirmView`, which carries only `hasAffiliateLink`. The
 * public CTA points at `/go/{slug}`, which resolves the destination server-side
 * (docs/ARCHITECTURE.md §11 `[LOCKED]`). The URL is validated three times — by
 * the form schema, by `isSafeAffiliateDestination` in the action, and again
 * before any `Location` header is emitted.
 */

const DISCOUNT_TYPES = [
  { value: "", label: "Not specified" },
  { value: "percent", label: "Percentage" },
  { value: "fixed", label: "Fixed amount" },
  { value: "free_trial", label: "Free trial" },
  { value: "other", label: "Other" },
];

const LINK_STATUSES = [
  { value: "active", label: "Active — eligible for /go/ redirects" },
  { value: "paused", label: "Paused — no redirects" },
  { value: "archived", label: "Archived" },
];

/** ISO -> the `datetime-local` shape, in UTC. */
function toLocalInput(iso: string | null): string {
  return iso ? iso.slice(0, 16) : "";
}

export interface StagedKey {
  key: string;
  op: "create" | "update" | "delete";
}

/* ----------------------------------------------------------------- offers */

export function OffersTab({
  firmId,
  offers,
  affiliateLinks,
  staged,
  readOnly,
}: {
  firmId: string;
  offers: AdminOffer[];
  affiliateLinks: AdminAffiliateLink[];
  staged: StagedKey[];
  readOnly: boolean;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    saveOfferAction,
    {},
  );
  const [removeState, removeAction] = useActionState<ActionResult, FormData>(
    removeChildAction,
    {},
  );

  const err = (field: string) => state.fieldErrors?.[field];
  const linkOptions = [
    { value: "", label: "No affiliate link" },
    ...affiliateLinks.map((link) => ({ value: link.id, label: link.label })),
  ];

  const form = (offer: AdminOffer | null) => (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="grid gap-5 md:grid-cols-2">
        <input type="hidden" name="firmId" value={firmId} />
        {offer ? <input type="hidden" name="id" value={offer.id} /> : null}

        <Field label="Title" htmlFor="title" required error={err("title")}>
          <Input
            name="title"
            defaultValue={offer?.title ?? ""}
            required
            disabled={readOnly}
          />
        </Field>
        <Field label="Code" htmlFor="code" error={err("code")}>
          <Input
            name="code"
            defaultValue={offer?.code ?? ""}
            disabled={readOnly}
          />
        </Field>

        <SelectField
          label="Discount type"
          name="discountType"
          id={`discount-type-${offer?.id ?? "new"}`}
          defaultValue={offer?.discountType ?? ""}
          options={DISCOUNT_TYPES}
          disabled={readOnly}
          error={err("discountType")}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Value"
            htmlFor="discountValue"
            error={err("discountValue")}
          >
            <Input
              name="discountValue"
              inputMode="decimal"
              defaultValue={offer?.discountValue ?? ""}
              disabled={readOnly}
            />
          </Field>
          <Field
            label="Currency"
            htmlFor="discountCurrency"
            hint="Required for a fixed amount."
            error={err("discountCurrency")}
          >
            <Input
              name="discountCurrency"
              maxLength={3}
              defaultValue={offer?.discountCurrency ?? ""}
              disabled={readOnly}
            />
          </Field>
        </div>

        <Field
          label="Starts at (UTC)"
          htmlFor="startsAt"
          hint="Blank means it is already live."
          error={err("startsAt")}
        >
          <Input
            name="startsAt"
            type="datetime-local"
            defaultValue={toLocalInput(offer?.startsAt ?? null)}
            disabled={readOnly}
          />
        </Field>
        <Field
          label="Ends at (UTC)"
          htmlFor="endsAt"
          hint="Blank means no end date. An expired offer stops showing publicly on its own."
          error={err("endsAt")}
        >
          <Input
            name="endsAt"
            type="datetime-local"
            defaultValue={toLocalInput(offer?.endsAt ?? null)}
            disabled={readOnly}
          />
        </Field>

        <SelectField
          label="Affiliate link"
          name="affiliateLinkId"
          id={`offer-link-${offer?.id ?? "new"}`}
          defaultValue={offer?.affiliateLinkId ?? ""}
          options={linkOptions}
          disabled={readOnly}
          error={err("affiliateLinkId")}
        />
        <Field
          label="Display order"
          htmlFor="displayOrder"
          error={err("displayOrder")}
        >
          <Input
            name="displayOrder"
            inputMode="numeric"
            defaultValue={offer?.displayOrder ?? ""}
            disabled={readOnly}
          />
        </Field>

        <div className="md:col-span-2">
          <Field
            label="Description"
            htmlFor="description"
            error={err("description")}
          >
            <Textarea
              name="description"
              rows={2}
              defaultValue={offer?.description ?? ""}
              disabled={readOnly}
            />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field
            label="Terms"
            htmlFor="terms"
            hint="Shown publicly. Enter only what the firm actually publishes."
            error={err("terms")}
          >
            <Textarea
              name="terms"
              rows={2}
              defaultValue={offer?.terms ?? ""}
              disabled={readOnly}
            />
          </Field>
        </div>

        {!readOnly ? (
          <div className="md:col-span-2">
            <SubmitButton variant="primary" pendingLabel="Staging…">
              {offer ? "Stage changes" : "Stage new offer"}
            </SubmitButton>
          </div>
        ) : null}
      </form>

      {offer && !readOnly ? (
        <form
          action={removeAction}
          className="border-t border-border-subtle pt-4"
        >
          <input type="hidden" name="firmId" value={firmId} />
          <input type="hidden" name="collection" value="offers" />
          <input type="hidden" name="id" value={offer.id} />
          <SubmitButton variant="danger" size="sm" pendingLabel="Staging…">
            Stage removal
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <StatusMessage state={state} />
      <StatusMessage state={removeState} />

      {offers.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-text-muted">
            No offers recorded. Add one only when the firm is genuinely running
            it — an offer that does not exist must never be invented.
          </p>
        </Card>
      ) : null}

      {offers.map((offer) => {
        const pending = staged.find((s) => s.key === offer.id);
        return (
          <EditorDisclosure
            key={offer.id}
            summary={offer.title}
            meta={
              <>
                <Badge
                  tone={offer.status === "published" ? "success" : "neutral"}
                >
                  {offer.status}
                </Badge>
                {pending ? <PendingBadge op={pending.op} /> : null}
              </>
            }
          >
            {form(offer)}
          </EditorDisclosure>
        );
      })}

      {!readOnly ? (
        <EditorDisclosure summary="Add an offer">{form(null)}</EditorDisclosure>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------- affiliate links */

export function AffiliateTab({
  firmId,
  links,
  staged,
  readOnly,
  canEdit,
}: {
  firmId: string;
  links: AdminAffiliateLink[];
  staged: StagedKey[];
  readOnly: boolean;
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    saveAffiliateLinkAction,
    {},
  );
  const [removeState, removeAction] = useActionState<ActionResult, FormData>(
    removeChildAction,
    {},
  );

  const err = (field: string) => state.fieldErrors?.[field];
  const locked = readOnly || !canEdit;

  const form = (link: AdminAffiliateLink | null) => (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="grid gap-5 md:grid-cols-2">
        <input type="hidden" name="firmId" value={firmId} />
        {link ? <input type="hidden" name="id" value={link.id} /> : null}

        <Field label="Label" htmlFor="label" required error={err("label")}>
          <Input
            name="label"
            defaultValue={link?.label ?? ""}
            required
            disabled={locked}
          />
        </Field>
        <Field
          label="Network"
          htmlFor="network"
          hint="The affiliate network, if any."
          error={err("network")}
        >
          <Input
            name="network"
            defaultValue={link?.network ?? ""}
            disabled={locked}
          />
        </Field>

        <div className="md:col-span-2">
          <Field
            label="Destination URL"
            htmlFor="destinationUrl"
            required
            hint="Must be https://. Never shown publicly — visitors go through /go/{slug}, which resolves this server-side."
            error={err("destinationUrl")}
          >
            <Input
              name="destinationUrl"
              type="url"
              placeholder="https://"
              defaultValue={link?.destinationUrl ?? ""}
              required
              disabled={locked}
            />
          </Field>
        </div>

        <Field
          label="Campaign"
          htmlFor="campaign"
          hint="Optional. Matched by /go/{slug}?c=…, otherwise the default link is used."
          error={err("campaign")}
        >
          <Input
            name="campaign"
            defaultValue={link?.campaign ?? ""}
            disabled={locked}
          />
        </Field>
        <SelectField
          label="Status"
          name="status"
          id={`link-status-${link?.id ?? "new"}`}
          defaultValue={link?.status ?? "active"}
          options={LINK_STATUSES}
          disabled={locked}
          error={err("status")}
        />

        <Field
          label="Starts at (UTC)"
          htmlFor="startsAt"
          error={err("startsAt")}
        >
          <Input
            name="startsAt"
            type="datetime-local"
            defaultValue={toLocalInput(link?.startsAt ?? null)}
            disabled={locked}
          />
        </Field>
        <Field label="Ends at (UTC)" htmlFor="endsAt" error={err("endsAt")}>
          <Input
            name="endsAt"
            type="datetime-local"
            defaultValue={toLocalInput(link?.endsAt ?? null)}
            disabled={locked}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            name="isDefault"
            defaultChecked={link?.isDefault ?? false}
            disabled={locked}
            className="size-4 rounded border-border-default bg-bg-near-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
          />
          Default link for this firm
        </label>

        {!locked ? (
          <div className="md:col-span-2">
            <SubmitButton variant="primary" pendingLabel="Staging…">
              {link ? "Stage changes" : "Stage new link"}
            </SubmitButton>
          </div>
        ) : null}
      </form>

      {link && !locked ? (
        <form
          action={removeAction}
          className="border-t border-border-subtle pt-4"
        >
          <input type="hidden" name="firmId" value={firmId} />
          <input type="hidden" name="collection" value="affiliateLinks" />
          <input type="hidden" name="id" value={link.id} />
          <SubmitButton variant="danger" size="sm" pendingLabel="Staging…">
            Stage removal
          </SubmitButton>
          <p className="mt-2 text-xs text-text-muted">
            Archived on publish, never hard-deleted — recorded clicks reference
            this link and must survive it.
          </p>
        </form>
      ) : null}
    </div>
  );

  if (!canEdit) {
    return (
      <Card className="p-6">
        <p className="text-sm text-text-muted">
          You do not have permission to manage affiliate links for this firm.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <StatusMessage state={state} />
      <StatusMessage state={removeState} />

      <Card className="p-4">
        <p className="text-sm text-text-muted">
          Destination URLs are admin-only. The public firm page never contains
          one — its CTA points at{" "}
          <code className="text-text-secondary">/go/{"{slug}"}</code>, which
          resolves the destination on the server and records the click. In
          preview the CTA is inert and has no link at all, so previewing cannot
          create attribution.
        </p>
      </Card>

      {links.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-text-muted">
            No affiliate links recorded. Without one, the public page shows a
            plain, clearly-labelled link to the firm&apos;s own site instead.
          </p>
        </Card>
      ) : null}

      {links.map((link) => {
        const pending = staged.find((s) => s.key === link.id);
        return (
          <EditorDisclosure
            key={link.id}
            summary={link.label}
            meta={
              <>
                {link.isDefault ? <Badge tone="info">Default</Badge> : null}
                <Badge tone={link.status === "active" ? "success" : "neutral"}>
                  {link.status}
                </Badge>
                {pending ? <PendingBadge op={pending.op} /> : null}
              </>
            }
          >
            {form(link)}
          </EditorDisclosure>
        );
      })}

      {!locked ? (
        <EditorDisclosure summary="Add an affiliate link">
          {form(null)}
        </EditorDisclosure>
      ) : null}
    </div>
  );
}
