import type * as React from "react";
import { NotSpecified } from "@/components/ui/primitives";
import { countryName } from "@/lib/view/format";
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
  const location = [firm.headquartersCity, countryName(firm.headquartersCountry)]
    .filter(Boolean)
    .join(", ");

  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      <Fact label="Founded">
        {firm.foundedYear ? String(firm.foundedYear) : null}
      </Fact>
      <Fact label="Headquarters">{location || null}</Fact>
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
