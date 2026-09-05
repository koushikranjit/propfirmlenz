import type * as React from "react";
import { NotSpecified } from "@/components/ui/primitives";
import { country } from "@/lib/geo/countries";
import { formatMonthYear } from "@/lib/view/format";
import type { FirmView } from "@/lib/view/firm-view";

/**
 * Company facts — docs/PROJECT.md §6.5 `[LOCKED]`.
 *
 * A definition list, so each label is programmatically tied to its value. Any
 * fact the database does not hold renders "Not specified" rather than being
 * omitted: an admin, and a reader, should be able to see WHICH facts are
 * missing. Nothing here is inferred from anything else.
 */
export function KeyFacts({ firm }: { firm: FirmView }) {
  const hq = country(firm.headquartersCountry);
  const location = [firm.headquartersCity, hq?.name].filter(Boolean).join(", ");

  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      <Fact label="Founded">
        {formatMonthYear(firm.foundedOn) ??
          (firm.foundedYear ? String(firm.foundedYear) : null)}
      </Fact>
      {/* Derived from the founding date, never stored and never guessed. */}
      <Fact label="Years in operation">
        {firm.yearsInOperation === null
          ? null
          : `${firm.yearsInOperation}+ years`}
      </Fact>
      <Fact label="Headquarters">
        {location ? (
          <span className="inline-flex items-center gap-2">
            {hq ? (
              <span aria-hidden className="text-base leading-none">
                {hq.flag}
              </span>
            ) : null}
            {location}
          </span>
        ) : null}
      </Fact>
      <Fact label="Founder">{firm.founderName}</Fact>
      <Fact label="CEO">{firm.ceoName}</Fact>
      {/*
        TRUSTPILOT'S rating, labelled as theirs. It is never averaged with
        anything, never called a Prop Firm Lenz rating, and never emitted as
        AggregateRating structured data (docs/SEO.md §11 rule 1 `[LOCKED]`).
      */}
      <Fact label="Trustpilot rating">
        {firm.trustpilotRating ? (
          <span>
            {firm.trustpilotRating} / 5{" "}
            <span className="text-text-muted">on Trustpilot</span>
            {firm.trustpilotUrl ? (
              <>
                {" · "}
                <a
                  href={firm.trustpilotUrl}
                  rel="nofollow noopener"
                  target="_blank"
                  className="text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                >
                  view
                </a>
              </>
            ) : null}
          </span>
        ) : null}
      </Fact>
      <Fact label="Website">
        {firm.websiteUrl ? (
          <a
            href={firm.websiteUrl}
            rel="nofollow noopener"
            target="_blank"
            className="break-words text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
          >
            {displayHost(firm.websiteUrl)}
          </a>
        ) : null}
      </Fact>
      <Fact label="Support email">
        {firm.supportEmail ? (
          <a
            href={`mailto:${firm.supportEmail}`}
            className="break-words text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
          >
            {firm.supportEmail}
          </a>
        ) : null}
      </Fact>
      <Fact label="Support page">
        {firm.supportUrl ? (
          <a
            href={firm.supportUrl}
            rel="nofollow noopener"
            target="_blank"
            className="break-words text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
          >
            {displayHost(firm.supportUrl)}
          </a>
        ) : null}
      </Fact>
      <Fact label="Payout information">
        {firm.payoutInfoUrl ? (
          <a
            href={firm.payoutInfoUrl}
            rel="nofollow noopener"
            target="_blank"
            className="break-words text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
          >
            {displayHost(firm.payoutInfoUrl)}
          </a>
        ) : null}
      </Fact>
      <Fact label="Published challenges">
        {firm.challenges.length > 0 ? String(firm.challenges.length) : null}
      </Fact>
    </dl>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-text-secondary">
        {children ?? <NotSpecified />}
      </dd>
    </div>
  );
}

/** Shows the host rather than a raw URL. Falls back to the original string. */
function displayHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
