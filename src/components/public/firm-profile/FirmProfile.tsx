import { formatDate } from "@/lib/view/format";
import type { FirmView } from "@/lib/view/firm-view";
import { AffiliateCta } from "./AffiliateCta";
import { ChallengeTable } from "./ChallengeTable";
import { FirmHeader } from "./FirmHeader";
import { KeyFacts } from "./KeyFacts";
import { OffersSection } from "./OffersSection";
import {
  AnnouncementsSection,
  FaqSection,
} from "./AnnouncementsSection";
import {
  type FirmPayoutEvidence,
  PayoutEvidenceSection,
} from "./PayoutEvidence";
import { InstrumentsSection, PlatformsSection } from "./PlatformsSection";
import { RulesSection } from "./RulesSection";
import { NoData, Section } from "./Section";

/**
 * THE canonical public firm profile — docs/ARCHITECTURE.md §21.1, §21.2
 * `[LOCKED]`.
 *
 * Rendered by BOTH:
 *   - `app/(public)/prop-firms/[slug]` from `getPublishedFirmView()`
 *   - `app/(admin)/admin/preview/firms/[id]` from `materializeDraft()`
 *
 * There is no `AdminFirmProfile`, no `PreviewFirmProfile`, and no second
 * implementation of this page anywhere. Both routes supply the same `FirmView`,
 * so a field added to the view without being supplied by the draft materialiser
 * is a COMPILE error rather than a silent visual difference.
 *
 * This component:
 *   - never queries the database — it receives a materialised view model;
 *   - never imports from `components/admin/**` (ESLint-enforced);
 *   - contains no admin-only logic, no mutation, and no form.
 *
 * `preview` is the documented `PreviewContext` (§21.7). It changes exactly one
 * thing: the affiliate CTA renders inert, with no `/go/` href, so previewing
 * cannot create click attribution. It does not hide, add, or alter any data.
 */
export function FirmProfile({
  firm,
  payouts,
  preview = false,
}: {
  firm: FirmView;
  /**
   * Blockchain-verified payouts for this firm. REQUIRED, so the preview route
   * cannot quietly omit the section the public page shows (§21.2 `[LOCKED]`).
   */
  payouts: FirmPayoutEvidence;
  /** True only on the authenticated admin preview route. */
  preview?: boolean;
}) {
  const verifiedOn = formatDate(firm.verifiedAt);
  const updatedOn = formatDate(firm.updatedAt);

  return (
    <article className="flex flex-col gap-8">
      <FirmHeader firm={firm} preview={preview} />

      <Section id="overview" title="Overview">
        {firm.description ? (
          <div className="max-w-prose whitespace-pre-wrap text-text-secondary">
            {firm.description}
          </div>
        ) : (
          <NoData>
            No description has been published for {firm.name} yet.
          </NoData>
        )}
        <div className="mt-6">
          <KeyFacts firm={firm} />
        </div>
      </Section>

      <Section
        id="challenges"
        title="Challenges"
        description="Account sizes, fees and targets exactly as the firm publishes them. Figures keep their own currency and are never converted."
      >
        <ChallengeTable challenges={firm.challenges} firmName={firm.name} />
      </Section>

      <Section
        id="rules"
        title="Trading rules"
        description="Rules recorded from the firm's own published documentation. A rule that has not been documented is shown as not specified, never assumed."
      >
        <RulesSection rules={firm.rules} firmName={firm.name} />
      </Section>

      <Section id="platforms" title="Platforms">
        <PlatformsSection platforms={firm.platforms} firmName={firm.name} />
      </Section>

      <Section id="instruments" title="Instruments">
        <InstrumentsSection
          instruments={firm.instruments}
          firmName={firm.name}
        />
      </Section>

      <Section id="offers" title="Offers">
        <OffersSection offers={firm.offers} firmName={firm.name} />
      </Section>

      {/* Rendered only when the firm has real entries — an empty section
          would imply a firm that never announces anything. */}
      {firm.announcements.length > 0 ? (
        <Section
          id="announcements"
          title="Announcements"
          description={`Updates ${firm.name} has published, recorded here with the date the firm gave.`}
        >
          <AnnouncementsSection announcements={firm.announcements} />
        </Section>
      ) : null}

      <Section
        id="payouts"
        title="Verified payouts"
        description="Payouts backed by a public blockchain transaction anyone can check. Never a firm-reported figure."
      >
        <PayoutEvidenceSection
          payouts={payouts}
          firmName={firm.name}
          payoutInfoUrl={firm.payoutInfoUrl}
        />
      </Section>

      {/*
        Trader reviews are Phase 3 (docs/ROADMAP.md). Saying so plainly is the
        honest state: silence would read as "this firm has no reviews", which is
        a different claim and one we have no data to make. No rating, count, or
        placeholder score is rendered, and no Review / AggregateRating markup is
        emitted (docs/SEO.md §11 rule 1 `[LOCKED]`).
      */}
      <Section id="reviews" title="Trader reviews">
        <NoData>
          Prop Firm Lenz does not publish trader reviews yet, so none are shown
          for {firm.name}. Nothing on this page is a rating or a ranking.
        </NoData>
      </Section>

      {firm.faqs.length > 0 ? (
        <Section id="faqs" title="Frequently asked questions">
          <FaqSection faqs={firm.faqs} />
        </Section>
      ) : null}

      <Section id="visit" title={`Visit ${firm.name}`}>
        <AffiliateCta firm={firm} preview={preview} placement="firm_footer" />
      </Section>

      <footer className="border-t border-border-subtle pt-6 text-sm text-text-muted">
        <p>
          {verifiedOn
            ? `Data last verified against ${firm.name}'s published sources on ${verifiedOn}.`
            : `This firm's data has not been verified against its published sources yet.`}
        </p>
        {updatedOn ? (
          <p className="mt-1">Page data last updated {updatedOn}.</p>
        ) : null}
      </footer>
    </article>
  );
}
