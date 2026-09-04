"use client";

import { useActionState } from "react";
import {
  type ActionState,
  discardDraftAction,
  publishFirmAction,
  saveFirmAction,
  verifyFirmAction,
} from "@/lib/services/firm-actions";
import { Badge, Button, Card, Field, Input } from "@/components/ui/primitives";
import { StatusMessage, SubmitButton } from "@/components/admin/forms";
import type {
  AdminCatalog,
  AdminFirmChildren,
} from "@/lib/repositories/admin-firm-children";
import type {
  AdminNetwork,
  AdminWallet,
} from "@/lib/repositories/admin-payouts";
import type { FirmClickStats } from "@/lib/repositories/admin-firms";
import { AssociationsTab } from "./AssociationsTab";
import { AnnouncementsSection, FaqsSection } from "./ContentSections";
import type { StorageState } from "./LogoUpload";
import { PayoutTrackingSection } from "./PayoutTrackingSection";
import { ChallengesTab, type StagedChallenge } from "./ChallengesTab";
import { AffiliateTab, OffersTab, type StagedKey } from "./CommerceTabs";
import { RulesTab, type StagedRule } from "./RulesTab";
import { SeoTab } from "./SeoTab";
import { EssentialsForm, type FirmEssentials } from "./EssentialsForm";

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
  payoutInfoUrl: string | null;
  foundedOn: string | null;
  founderName: string | null;
  ceoName: string | null;
  trustpilotRating: string | null;
  trustpilotUrl: string | null;
  logoUrl: string | null;
  logoAlt: string | null;
  clicks: FirmClickStats;
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
 * ONE PAGE, EXPANDABLE SECTIONS — docs/ADMIN.md §6.2 `[owner-locked 2026-09-04]`.
 *
 * There is deliberately NO TAB STRIP. The primary editor is the sixteen core
 * fields; everything else is a collapsed section on the same page, opened when
 * it is needed. A seventeen-tab bar is how a firm editor becomes a maze.
 *
 * THIS EDITOR HOLDS FIRM DATA, AND NOTHING ELSE. Every section writes to a
 * table the firm owns. Reviews, the media library and the audit trail are their
 * OWN admin sections, linked rather than embedded — a section for each one here
 * is how a firm editor becomes the whole dashboard. Payout tracking appears
 * only as a wallet configuration point that writes against this firm's existing
 * record (docs/PAYOUTS.md §11).
 */

/** A collapsed section. `<details>` needs no JavaScript and keeps its state. */
function Section({
  id,
  title,
  meta,
  children,
}: {
  id: string;
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <details
      id={id}
      className="group rounded-[14px] border border-border-default bg-bg-card"
    >
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-4 marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <span
            aria-hidden
            className="text-text-muted group-open:rotate-90"
            style={{ display: "inline-block" }}
          >
            ›
          </span>
          {title}
        </span>
        {meta ? <span className="text-xs text-text-muted">{meta}</span> : null}
      </summary>
      <div className="border-t border-border-subtle p-4 sm:p-5">{children}</div>
    </details>
  );
}

/**
 * Firm-related work that lives in its own admin section.
 *
 * Rendered as links, never as tabs: the separation is the point, and a link
 * that goes somewhere real beats a tab that apologises.
 */
const ELSEWHERE: { label: string; href: string; note: string }[] = [
  {
    label: "Payout tracking",
    href: "/admin/payouts",
    note: "wallets, candidates and verified payouts",
  },
  {
    label: "Audit log",
    href: "/admin/audit-logs",
    note: "who changed what, and when",
  },
];

export interface WorkspaceStaged {
  challenges: StagedChallenge[];
  rules: StagedRule[];
  platformIds: string[];
  instrumentIds: string[];
  offers: StagedKey[];
  affiliateLinks: StagedKey[];
  announcements: string[];
  faqs: string[];
  seo: boolean;
}

export function FirmWorkspace({
  firm,
  can,
  firmChildren,
  catalog,
  staged,
  networks,
  wallets,
  storage,
}: {
  firm: WorkspaceFirm;
  can: WorkspaceCan;
  firmChildren: AdminFirmChildren;
  catalog: AdminCatalog;
  staged: WorkspaceStaged;
  /** Payout tracking is a separate system; these are read-only references. */
  networks: AdminNetwork[];
  wallets: AdminWallet[];
  /** Whether object storage is usable, and which variables are absent. */
  storage: StorageState;
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

  // The simple editor's view model, assembled from the same props the tabs
  // already receive — no extra query, and no second source of truth.
  const defaultOffer = firmChildren.offers[0];
  const defaultLink = firmChildren.affiliateLinks.find((l) => l.isDefault);
  const essentials: FirmEssentials = {
    id: firm.id,
    name: firm.name,
    tagline: firm.tagline,
    description: firm.description,
    founderName: firm.founderName,
    ceoName: firm.ceoName,
    headquartersCountry: firm.headquartersCountry,
    trustpilotRating: firm.trustpilotRating,
    trustpilotUrl: firm.trustpilotUrl,
    foundedOn: firm.foundedOn,
    payoutInfoUrl: firm.payoutInfoUrl,
    affiliateUrl: defaultLink?.destinationUrl ?? null,
    discountTitle: defaultOffer?.title ?? null,
    discountCode: defaultOffer?.code ?? null,
    discountDescription: defaultOffer?.description ?? null,
    discountPercent:
      defaultOffer?.discountType === "percent"
        ? (defaultOffer.discountValue ?? null)
        : null,
    discountEndsAt: defaultOffer?.endsAt ?? null,
    logoUrl: firm.logoUrl,
    logoAlt: firm.logoAlt,
    clicks: firm.clicks,
  };
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

      {/* The PRIMARY screen: everything needed to list and monetise a firm. */}
      <EssentialsForm firm={essentials} readOnly={readOnly} storage={storage} />

      {/* Payout tracking: a configuration point into the separate system. */}
      <Section
        id="payout-tracking"
        title="Payout Tracking"
        meta={
          wallets.length === 1
            ? "1 tracked wallet"
            : `${wallets.length} tracked wallets`
        }
      >
        <PayoutTrackingSection
          firmId={firm.id}
          networks={networks}
          wallets={wallets}
          readOnly={readOnly}
        />
      </Section>

      <Section
        id="challenges"
        title="Challenges"
        meta={
          firmChildren.challenges.length === 1
            ? "1 challenge"
            : `${firmChildren.challenges.length} challenges`
        }
      >
        <ChallengesTab
          firmId={firm.id}
          challenges={firmChildren.challenges}
          staged={staged.challenges}
          readOnly={readOnly}
        />
      </Section>

      <Section
        id="announcements"
        title="Announcements"
        meta={
          firmChildren.announcements.length === 1
            ? "1 announcement"
            : `${firmChildren.announcements.length} announcements`
        }
      >
        <AnnouncementsSection
          firmId={firm.id}
          announcements={firmChildren.announcements}
          staged={new Set(staged.announcements)}
          readOnly={readOnly}
        />
      </Section>

      <Section
        id="faqs"
        title="FAQs"
        meta={
          firmChildren.faqs.length === 1
            ? "1 FAQ"
            : `${firmChildren.faqs.length} FAQs`
        }
      >
        <FaqsSection
          firmId={firm.id}
          faqs={firmChildren.faqs}
          staged={new Set(staged.faqs)}
          readOnly={readOnly}
        />
      </Section>

      {/* Everything the schema holds that is not part of the core workflow. */}
      <Section
        id="advanced-firm-data"
        title="Advanced Information"
        meta="Company, branding, rules, platforms, instruments, offers, affiliate"
      >
        <div className="flex flex-col gap-3">
          {/*
            One form spans company and branding so a single "Save draft"
            submits them together. It deliberately does NOT carry name, tagline
            or description — those belong to the primary editor above, and
            saving here would otherwise revert what was just typed there.
          */}
          <form action={saveFormAction} id="firm-edit-form">
            <input type="hidden" name="firmId" value={firm.id} />

            <Section id="advanced-company" title="Company">
              <div className="flex flex-col gap-5">
                <Card className="flex flex-col gap-5 p-6">
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
                </Card>
              </div>
              <div className="mt-5">
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
              </div>
            </Section>

            <div className="mt-3">
              <Section id="advanced-branding" title="Branding & ordering">
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
                    Logo and cover image upload arrive with the media library in
                    a later Phase 1 stage. Third-party firm logos are stored as
                    uploaded and never restyled.
                  </p>
                </Card>
              </Section>
            </div>

            {can.edit ? (
              <div className="mt-4 flex gap-2">
                <SubmitButton variant="primary" pendingLabel="Saving…">
                  Save draft
                </SubmitButton>
              </div>
            ) : null}
          </form>

          <Section id="advanced-rules" title="Rules">
            <div className="mt-4">
              <RulesTab
                firmId={firm.id}
                rules={catalog.rules}
                values={firmChildren.ruleValues}
                staged={staged.rules}
                readOnly={readOnly}
              />
            </div>
          </Section>

          <Section id="advanced-associations" title="Platforms & instruments">
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
          </Section>

          <Section id="advanced-offers" title="Offers">
            <div className="mt-4">
              <OffersTab
                firmId={firm.id}
                offers={firmChildren.offers}
                affiliateLinks={firmChildren.affiliateLinks}
                staged={staged.offers}
                readOnly={readOnly}
              />
            </div>
          </Section>

          <Section id="advanced-affiliate" title="Affiliate configuration">
            <div className="mt-4">
              <AffiliateTab
                firmId={firm.id}
                links={firmChildren.affiliateLinks}
                staged={staged.affiliateLinks}
                readOnly={readOnly}
                canEdit={can.affiliate}
              />
            </div>
          </Section>

          {/* Firm-scoped work that belongs to another system. */}
          <div className="mt-6 border-t border-border-subtle pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Managed elsewhere
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {ELSEWHERE.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="rounded font-medium text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                  >
                    {item.label}
                  </a>
                  <span className="text-text-muted"> — {item.note}</span>
                </li>
              ))}
              <li className="text-text-muted">
                Reviews, FAQs, media, internal notes and redirects are not built
                yet.
              </li>
            </ul>
          </div>
        </div>
      </Section>

      {/* SEO — collapsed by default. */}
      <details className="group rounded-[14px] border border-border-default bg-bg-card">
        <summary
          id="seo-section"
          className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-4 marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base [&::-webkit-details-marker]:hidden"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <span
              aria-hidden
              className="text-text-muted group-open:rotate-90"
              style={{ display: "inline-block" }}
            >
              ›
            </span>
            SEO
          </span>
          <span className="text-xs text-text-muted">
            Title, description, canonical, indexing
          </span>
        </summary>
        <div className="border-t border-border-subtle p-4 sm:p-5">
          <SeoTab
            firmId={firm.id}
            seo={firmChildren.seo}
            slug={firm.slug}
            hasStagedSeo={staged.seo}
            readOnly={readOnly}
            canWriteSeo={can.seo}
          />
        </div>
      </details>

      {/* Verification — collapsed by default. */}
      <details className="group rounded-[14px] border border-border-default bg-bg-card">
        <summary
          id="verification-section"
          className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-4 marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base [&::-webkit-details-marker]:hidden"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <span
              aria-hidden
              className="text-text-muted group-open:rotate-90"
              style={{ display: "inline-block" }}
            >
              ›
            </span>
            Verification
          </span>
          <span className="text-xs text-text-muted">
            {firm.verificationStatus.replace("_", " ")}
          </span>
        </summary>
        <div className="border-t border-border-subtle p-4 sm:p-5">
          <Card className="p-5">
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
        </div>
      </details>
    </div>
  );
}
