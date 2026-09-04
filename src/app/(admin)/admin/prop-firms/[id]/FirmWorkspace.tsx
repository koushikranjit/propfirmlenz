"use client";

import { useActionState } from "react";
import { Tabs } from "radix-ui";
import {
  type ActionState,
  discardDraftAction,
  publishFirmAction,
  saveFirmAction,
  verifyFirmAction,
} from "@/lib/services/firm-actions";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  NotImplemented,
  Textarea,
  cx,
} from "@/components/ui/primitives";
import { StatusMessage, SubmitButton } from "@/components/admin/forms";
import type {
  AdminCatalog,
  AdminFirmChildren,
} from "@/lib/repositories/admin-firm-children";
import { AssociationsTab } from "./AssociationsTab";
import { ChallengesTab, type StagedChallenge } from "./ChallengesTab";
import { AffiliateTab, OffersTab, type StagedKey } from "./CommerceTabs";
import { RulesTab, type StagedRule } from "./RulesTab";
import { SeoTab } from "./SeoTab";

export interface WorkspaceFirm {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  legalName: string | null;
  foundedYear: number | null;
  headquartersCountry: string | null;
  headquartersCity: string | null;
  websiteUrl: string | null;
  supportEmail: string | null;
  supportUrl: string | null;
  brandColor: string | null;
  isFeatured: boolean;
  displayOrder: number;
  status: string;
  verificationStatus: string;
  verifiedAt: string | null;
  publishedAt: string | null;
  hasDraft: boolean;
  pendingChanges: number;
  version: number;
}

export interface WorkspaceCan {
  edit: boolean;
  publish: boolean;
  verify: boolean;
  delete: boolean;
  audit: boolean;
  affiliate: boolean;
  seo: boolean;
}

/**
 * Workspace tabs — docs/ADMIN.md §6.2.
 *
 * Overview / Company / Branding are implemented. Every other tab renders an
 * honest "not implemented" state rather than a fake form pretending the
 * underlying functionality exists (docs/CLAUDE.md §3).
 */
const TABS = [
  { value: "overview", label: "Overview", ready: true },
  { value: "company", label: "Company", ready: true },
  { value: "branding", label: "Branding", ready: true },
  { value: "challenges", label: "Challenges", ready: true },
  { value: "rules", label: "Rules", ready: true },
  { value: "associations", label: "Platforms & instruments", ready: true },
  { value: "offers", label: "Offers", ready: true },
  { value: "affiliate", label: "Affiliate", ready: true },
  { value: "seo", label: "SEO", ready: true },
  { value: "verification", label: "Verification", ready: true },
  { value: "payouts", label: "Payouts", ready: false, phase: "Phase 2" },
  { value: "reviews", label: "Reviews", ready: false, phase: "Phase 3" },
  { value: "faqs", label: "FAQs", ready: false, phase: "Phase 6" },
  {
    value: "media",
    label: "Media",
    ready: false,
    phase: "a later Phase 1 stage",
  },
  {
    value: "notes",
    label: "Internal Notes",
    ready: false,
    phase: "a later Phase 1 stage",
  },
  {
    value: "redirects",
    label: "Redirects",
    ready: false,
    phase: "a later Phase 1 stage",
  },
  {
    value: "audit",
    label: "Audit Log",
    ready: false,
    phase: "a later Phase 1 stage",
  },
] as const;

export interface WorkspaceStaged {
  challenges: StagedChallenge[];
  rules: StagedRule[];
  platformIds: string[];
  instrumentIds: string[];
  offers: StagedKey[];
  affiliateLinks: StagedKey[];
  seo: boolean;
}

export function FirmWorkspace({
  firm,
  can,
  firmChildren,
  catalog,
  staged,
}: {
  firm: WorkspaceFirm;
  can: WorkspaceCan;
  firmChildren: AdminFirmChildren;
  catalog: AdminCatalog;
  staged: WorkspaceStaged;
}) {
  const [saveState, saveFormAction] = useActionState<ActionState, FormData>(
    saveFirmAction,
    {},
  );
  const [publishState, publishFormAction] = useActionState<
    ActionState,
    FormData
  >(publishFirmAction, {});
  const [discardState, discardFormAction] = useActionState<
    ActionState,
    FormData
  >(discardDraftAction, {});
  const [verifyState, verifyFormAction] = useActionState<ActionState, FormData>(
    verifyFirmAction,
    {},
  );

  const readOnly = !can.edit;
  const err = (field: string) => saveState.fieldErrors?.[field];

  return (
    <div className="flex flex-col gap-4">
      {/* ---------------------------------------------------------- header */}
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold text-text-primary">
                {firm.name}
              </h1>
              <Badge
                tone={
                  firm.status === "published"
                    ? "success"
                    : firm.status === "archived"
                      ? "neutral"
                      : "info"
                }
              >
                {firm.status}
              </Badge>
              {firm.hasDraft ? (
                <Badge tone="warning">
                  Draft changes ({firm.pendingChanges})
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-text-metadata">
              /prop-firms/{firm.slug}
              {" · "}
              {firm.verifiedAt ? (
                <>Last verified {firm.verifiedAt.slice(0, 10)}</>
              ) : (
                <>Not verified</>
              )}
              {firm.version > 0 ? <> · version {firm.version}</> : null}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/admin/preview/firms/${firm.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center rounded-[10px] border border-border-default bg-bg-elevated px-4 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
            >
              Preview
            </a>

            {can.edit ? (
              <Button type="submit" form="firm-edit-form" variant="secondary">
                Save draft
              </Button>
            ) : null}

            {can.edit && firm.hasDraft ? (
              <form action={discardFormAction}>
                <input type="hidden" name="firmId" value={firm.id} />
                <SubmitButton variant="ghost" pendingLabel="Discarding…">
                  Discard draft
                </SubmitButton>
              </form>
            ) : null}

            {can.publish ? (
              <form action={publishFormAction}>
                <input type="hidden" name="firmId" value={firm.id} />
                <SubmitButton variant="primary" pendingLabel="Publishing…">
                  Publish
                </SubmitButton>
              </form>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <StatusMessage state={saveState} />
          <StatusMessage state={publishState} />
          <StatusMessage state={discardState} />
          <StatusMessage state={verifyState} />
        </div>

        {firm.hasDraft ? (
          <p className="mt-3 rounded-[10px] border border-warning/40 bg-warning/12 px-3 py-2 text-sm text-warning">
            This firm has unpublished draft changes. The public site continues
            to serve the published version until you publish.
          </p>
        ) : null}

        {readOnly ? (
          <p className="mt-3 text-sm text-text-metadata">
            You have read-only access to this firm.
          </p>
        ) : null}
      </Card>

      {/* ------------------------------------------------------------ tabs */}
      <Tabs.Root defaultValue="overview">
        <Tabs.List
          aria-label="Firm sections"
          className="flex flex-wrap gap-1 border-b border-border-default pb-2"
        >
          {TABS.map((tab) => (
            <Tabs.Trigger
              key={tab.value}
              value={tab.value}
              className={cx(
                "rounded-[8px] px-3 py-1.5 text-sm text-text-secondary transition-colors",
                "hover:bg-bg-elevated hover:text-text-primary",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan",
                "focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base",
                "data-[state=active]:bg-bg-elevated data-[state=active]:text-brand-cyan",
              )}
            >
              {tab.label}
              {!tab.ready ? (
                <span className="ml-1.5 text-[10px] uppercase text-text-metadata">
                  soon
                </span>
              ) : null}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/*
          One form spans Overview / Company / Branding so a single "Save draft"
          submits them together. Tab panels stay mounted (forceMount) so values
          typed on one tab are not lost by switching (docs/ADMIN.md §6.2).
        */}
        <form action={saveFormAction} id="firm-edit-form">
          <input type="hidden" name="firmId" value={firm.id} />

          <Tabs.Content
            value="overview"
            forceMount
            className="data-[state=inactive]:hidden"
          >
            <Card className="mt-4 flex flex-col gap-5 p-6">
              <Field
                label="Firm name"
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
              <Field
                label="Slug"
                htmlFor="slug"
                required
                hint="Changing this after publishing creates a 301 redirect automatically. The admin URL is unaffected."
                error={err("slug")}
              >
                <Input
                  id="slug"
                  name="slug"
                  defaultValue={firm.slug}
                  required
                  disabled={readOnly}
                  aria-invalid={err("slug") ? true : undefined}
                />
              </Field>
              <Field label="Tagline" htmlFor="tagline" error={err("tagline")}>
                <Input
                  id="tagline"
                  name="tagline"
                  defaultValue={firm.tagline ?? ""}
                  maxLength={160}
                  disabled={readOnly}
                />
              </Field>
              <Field
                label="Description"
                htmlFor="description"
                hint="Required before publishing. Leave blank rather than guessing."
                error={err("description")}
              >
                <Textarea
                  id="description"
                  name="description"
                  rows={8}
                  defaultValue={firm.description ?? ""}
                  disabled={readOnly}
                />
              </Field>
            </Card>
          </Tabs.Content>

          <Tabs.Content
            value="company"
            forceMount
            className="data-[state=inactive]:hidden"
          >
            <Card className="mt-4 grid gap-5 p-6 md:grid-cols-2">
              <Field
                label="Legal name"
                htmlFor="legalName"
                error={err("legalName")}
              >
                <Input
                  id="legalName"
                  name="legalName"
                  defaultValue={firm.legalName ?? ""}
                  disabled={readOnly}
                />
              </Field>
              <Field
                label="Founded year"
                htmlFor="foundedYear"
                hint="Leave blank if not disclosed."
                error={err("foundedYear")}
              >
                <Input
                  id="foundedYear"
                  name="foundedYear"
                  inputMode="numeric"
                  defaultValue={firm.foundedYear ?? ""}
                  disabled={readOnly}
                />
              </Field>
              <Field
                label="HQ country"
                htmlFor="headquartersCountry"
                hint="Two-letter ISO code, e.g. GB."
                error={err("headquartersCountry")}
              >
                <Input
                  id="headquartersCountry"
                  name="headquartersCountry"
                  maxLength={2}
                  defaultValue={firm.headquartersCountry ?? ""}
                  disabled={readOnly}
                />
              </Field>
              <Field
                label="HQ city"
                htmlFor="headquartersCity"
                error={err("headquartersCity")}
              >
                <Input
                  id="headquartersCity"
                  name="headquartersCity"
                  defaultValue={firm.headquartersCity ?? ""}
                  disabled={readOnly}
                />
              </Field>
              <Field
                label="Website"
                htmlFor="websiteUrl"
                error={err("websiteUrl")}
              >
                <Input
                  id="websiteUrl"
                  name="websiteUrl"
                  type="url"
                  defaultValue={firm.websiteUrl ?? ""}
                  disabled={readOnly}
                />
              </Field>
              <Field
                label="Support email"
                htmlFor="supportEmail"
                error={err("supportEmail")}
              >
                <Input
                  id="supportEmail"
                  name="supportEmail"
                  type="email"
                  defaultValue={firm.supportEmail ?? ""}
                  disabled={readOnly}
                />
              </Field>
              <Field
                label="Support URL"
                htmlFor="supportUrl"
                error={err("supportUrl")}
              >
                <Input
                  id="supportUrl"
                  name="supportUrl"
                  type="url"
                  defaultValue={firm.supportUrl ?? ""}
                  disabled={readOnly}
                />
              </Field>
            </Card>
          </Tabs.Content>

          <Tabs.Content
            value="branding"
            forceMount
            className="data-[state=inactive]:hidden"
          >
            <Card className="mt-4 flex flex-col gap-5 p-6">
              <Field
                label="Firm brand colour"
                htmlFor="brandColor"
                hint="The FIRM's own accent, e.g. #19E6D2. Never used for Prop Firm Lenz chrome."
                error={err("brandColor")}
              >
                <Input
                  id="brandColor"
                  name="brandColor"
                  defaultValue={firm.brandColor ?? ""}
                  placeholder="#000000"
                  disabled={readOnly}
                />
              </Field>
              <Field
                label="Display order"
                htmlFor="displayOrder"
                hint="Lower sorts first."
                error={err("displayOrder")}
              >
                <Input
                  id="displayOrder"
                  name="displayOrder"
                  inputMode="numeric"
                  defaultValue={firm.displayOrder}
                  disabled={readOnly}
                />
              </Field>
              <div className="flex items-center gap-2">
                <input
                  id="isFeatured"
                  name="isFeatured"
                  type="checkbox"
                  defaultChecked={firm.isFeatured}
                  disabled={readOnly}
                  className="size-4 rounded border-border-default bg-bg-near-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                />
                <label
                  htmlFor="isFeatured"
                  className="text-sm text-text-secondary"
                >
                  Featured firm
                </label>
              </div>

              <p className="text-xs text-text-metadata">
                Logo and cover image upload arrive with the media library in a
                later Phase 1 stage. Third-party firm logos are stored as
                uploaded and never restyled.
              </p>
            </Card>
          </Tabs.Content>

          {can.edit ? (
            <div className="mt-4 flex gap-2">
              <SubmitButton variant="primary" pendingLabel="Saving…">
                Save draft
              </SubmitButton>
            </div>
          ) : null}
        </form>

        <Tabs.Content value="verification">
          <Card className="mt-4 p-6">
            <h2 className="text-sm font-semibold text-text-primary">
              Verification
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              {firm.verifiedAt
                ? `Last verified ${firm.verifiedAt.slice(0, 10)}.`
                : "This firm has not been verified."}{" "}
              Status: {firm.verificationStatus.replace("_", " ")}.
            </p>
            <p className="mt-2 text-xs text-text-metadata">
              Verifying is deliberately separable from editing, so the person
              who enters data need not be the person who confirms it. Any
              substantive edit moves a verified firm back to &ldquo;needs
              review&rdquo;.
            </p>
            {can.verify ? (
              <form action={verifyFormAction} className="mt-4">
                <input type="hidden" name="firmId" value={firm.id} />
                <SubmitButton pendingLabel="Verifying…">
                  Mark as verified
                </SubmitButton>
              </form>
            ) : (
              <p className="mt-4 text-sm text-text-metadata">
                You do not have permission to verify firms.
              </p>
            )}
          </Card>
        </Tabs.Content>

        <Tabs.Content value="challenges">
          <div className="mt-4">
            <ChallengesTab
              firmId={firm.id}
              challenges={firmChildren.challenges}
              staged={staged.challenges}
              readOnly={readOnly}
            />
          </div>
        </Tabs.Content>

        <Tabs.Content value="rules">
          <div className="mt-4">
            <RulesTab
              firmId={firm.id}
              rules={catalog.rules}
              values={firmChildren.ruleValues}
              staged={staged.rules}
              readOnly={readOnly}
            />
          </div>
        </Tabs.Content>

        <Tabs.Content value="associations">
          <div className="mt-4">
            <AssociationsTab
              firmId={firm.id}
              catalog={catalog}
              firmChildren={firmChildren}
              stagedPlatformIds={new Set(staged.platformIds)}
              stagedInstrumentIds={new Set(staged.instrumentIds)}
              readOnly={readOnly}
            />
          </div>
        </Tabs.Content>

        <Tabs.Content value="offers">
          <div className="mt-4">
            <OffersTab
              firmId={firm.id}
              offers={firmChildren.offers}
              affiliateLinks={firmChildren.affiliateLinks}
              staged={staged.offers}
              readOnly={readOnly}
            />
          </div>
        </Tabs.Content>

        <Tabs.Content value="affiliate">
          <div className="mt-4">
            <AffiliateTab
              firmId={firm.id}
              links={firmChildren.affiliateLinks}
              staged={staged.affiliateLinks}
              readOnly={readOnly}
              canEdit={can.affiliate}
            />
          </div>
        </Tabs.Content>

        <Tabs.Content value="seo">
          <div className="mt-4">
            <SeoTab
              firmId={firm.id}
              seo={firmChildren.seo}
              slug={firm.slug}
              hasStagedSeo={staged.seo}
              readOnly={readOnly}
              canWriteSeo={can.seo}
            />
          </div>
        </Tabs.Content>

        {TABS.filter((t) => !t.ready).map((tab) => (
          <Tabs.Content key={tab.value} value={tab.value}>
            <div className="mt-4">
              <NotImplemented feature={tab.label} phase={tab.phase} />
            </div>
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </div>
  );
}
