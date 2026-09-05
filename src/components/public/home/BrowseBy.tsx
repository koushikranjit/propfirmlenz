import Link from "next/link";
import type { PlatformFacet } from "@/lib/repositories/public-firms";
import { countryName } from "@/lib/view/format";

/**
 * Browse-by pathways — docs/SEO.md §12.
 *
 * Every destination here is `/prop-firms` with a filter the directory already
 * implements, so no link can point at an unbuilt page. The facets themselves
 * are computed from published rows: a platform appears only because a published
 * firm supports it, and its count is a real count.
 *
 * Filtered directory views are `noindex, follow` (docs/SEO.md §9), which is the
 * intent — these links exist to move readers and crawlers toward firm profiles,
 * not to rank themselves.
 */
export function BrowseBy({
  platforms,
  countries,
}: {
  platforms: PlatformFacet[];
  countries: string[];
}) {
  const hasFacets = platforms.length > 0 || countries.length > 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PathwayCard
          href="/prop-firms"
          title="All prop firms"
          body="The full directory, with search, platform and headquarters filters, and every published challenge."
        />
        <PathwayCard
          href="/prop-firms?verified=true"
          title="Firms with verified data"
          body="Only firms whose recorded data has been checked against their own published sources."
        />
      </div>

      {platforms.length > 0 ? (
        <Facets
          title="By trading platform"
          items={platforms.map((platform) => ({
            key: platform.slug,
            href: `/prop-firms?platform=${platform.slug}`,
            label: platform.name,
            // A real count of published firms, not a rounded-up marketing figure.
            meta: `${platform.firmCount} firm${platform.firmCount === 1 ? "" : "s"}`,
            title: `Prop firms supporting ${platform.name}`,
          }))}
        />
      ) : null}

      {countries.length > 0 ? (
        <Facets
          title="By headquarters"
          items={countries.map((code) => ({
            key: code,
            href: `/prop-firms?country=${code}`,
            label: countryName(code) ?? code,
            meta: null,
            title: `Prop firms headquartered in ${countryName(code) ?? code}`,
          }))}
        />
      ) : null}

      {!hasFacets ? (
        <p className="rounded-[10px] border border-dashed border-border-default px-4 py-6 text-sm text-text-muted">
          Platform and headquarters shortcuts appear here once firms have been
          published with that information recorded.
        </p>
      ) : null}
    </div>
  );
}

function PathwayCard({
  href,
  title,
  body,
}: {
  href: string;
  title: string;
  body: string;
}) {
  return (
    <div className="relative rounded-[16px] border border-border-default bg-bg-card p-6 transition-colors hover:border-brand-cyan/40 hover:bg-bg-elevated">
      <h3 className="text-base font-semibold text-text-primary">
        <Link
          href={href}
          className="rounded after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
        >
          {title}
        </Link>
      </h3>
      <p className="mt-2 text-sm text-text-muted">{body}</p>
    </div>
  );
}

function Facets({
  title,
  items,
}: {
  title: string;
  items: {
    key: string;
    href: string;
    label: string;
    meta: string | null;
    title: string;
  }[];
}) {
  const headingId = `facets-${title.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div>
      <h3 id={headingId} className="text-sm font-semibold text-text-secondary">
        {title}
      </h3>
      <ul aria-labelledby={headingId} className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              // Descriptive, not "click here" (docs/SEO.md §12).
              title={item.title}
              className="inline-flex items-center gap-2 rounded-[10px] border border-border-default bg-bg-card px-3 py-2 text-sm text-text-secondary hover:border-border-strong hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
            >
              {item.label}
              {item.meta ? (
                <span className="text-xs tabular-nums text-text-muted">
                  {item.meta}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
