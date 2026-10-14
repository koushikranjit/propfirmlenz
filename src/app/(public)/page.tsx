import type { Metadata } from "next";
import Link from "next/link";
import { FirmCard } from "@/components/public/FirmCard";
import { JsonLd } from "@/components/public/JsonLd";
import { BrowseBy } from "@/components/public/home/BrowseBy";
import { HomeSection } from "@/components/public/home/HomeSection";
import { RecentlyVerified } from "@/components/public/home/RecentlyVerified";
import { ReferenceLanding } from "@/components/public/home/ReferenceLanding";
import { ReferencePreview } from "@/components/public/home/ReferencePreview";
import { TrustSection } from "@/components/public/home/TrustSection";
import { WhatToCompare } from "@/components/public/home/WhatToCompare";
import { EmptyState } from "@/components/ui/primitives";
import { getDb } from "@/lib/db/client";
import { listActiveOffers } from "@/lib/repositories/public-offers";
import { env } from "@/lib/validation/env";
import {
  countPublishedFirms,
  listPublishedFirmCountries,
  listPublishedFirmSummaries,
  listPublishedPlatformFacets,
} from "@/lib/repositories/public-firms";
import {
  buildMetadata,
  buildWebPageLd,
  buildWebSiteLd,
} from "@/lib/seo/metadata";
import { SITE_NAME } from "@/lib/seo/site";

/**
 * The public landing page — docs/PROJECT.md §9, docs/ROADMAP.md §1.5.
 *
 * Reads PUBLISHED data only, through the existing public directory repository.
 * It cannot see `draft_payload`, admin-only columns, internal notes, or an
 * affiliate destination URL: none of those exist on `FirmSummary`, so a leak
 * would be a compile error rather than a runtime accident.
 *
 * ORDERING HONESTY `[LOCKED]`
 *
 * The firm grid is ordered ALPHABETICALLY and labelled as such. `is_featured`
 * exists in the schema, but it is admin curation with no published methodology
 * behind it, and PROJECT.md §7 rule 10 requires the default order to be a
 * neutral published rule. Until a methodology is written and shown, presenting
 * a curated order under a word like "top" or "popular" would be a ranking claim
 * this site cannot substantiate. There is no engagement, rating, or popularity
 * signal in the database at all.
 *
 * Server-rendered per request: the published set changes on every publish, and
 * the database is not reachable at build time. Caching and revalidation tags
 * are a later stage.
 */
export const dynamic = "force-dynamic";

const HOME_FIRM_LIMIT = 10;
const RECENTLY_VERIFIED_LIMIT = 5;

const HOME_DESCRIPTION =
  "Research prop firms before you buy. Compare challenge pricing, account sizes, drawdown limits, profit targets, trading rules, platforms and payout terms, recorded from each firm's own published sources.";

export function generateMetadata(): Metadata {
  return buildMetadata({
    path: "/",
    title: `${SITE_NAME} — research prop firms before you buy`,
    description: HOME_DESCRIPTION,
  });
}

export default async function HomePage() {
  const data = env.DATABASE_URL
    ? await (async () => {
        try {
          const db = getDb();
          const [firms, firmCount, verifiedCount, recentlyVerified, platforms, countries] = await Promise.all([
            listPublishedFirmSummaries(db, { sort: "name", pageSize: HOME_FIRM_LIMIT }),
            countPublishedFirms(db),
            countPublishedFirms(db, { verifiedOnly: true }),
            listPublishedFirmSummaries(db, {
              sort: "recently_verified",
              verifiedOnly: true,
              pageSize: RECENTLY_VERIFIED_LIMIT,
            }),
            listPublishedPlatformFacets(db, 8),
            listPublishedFirmCountries(db),
          ]);
          // The SAME query /offers uses, so a discount can never appear in one
          // place and not the other.
          const offers = await listActiveOffers(db, { limit: 12 });
          return { firms, firmCount, verifiedCount, recentlyVerified, platforms, countries, offers };
        } catch (error) {
          console.error("HomePage query fallback:", error);
          return {
            firms: [],
            firmCount: 0,
            verifiedCount: 0,
            recentlyVerified: [],
            platforms: [],
            countries: [],
            offers: [],
          };
        }
      })()
    : {
        firms: [],
        firmCount: 0,
        verifiedCount: 0,
        recentlyVerified: [],
        platforms: [],
        countries: [],
        offers: [],
      };

  const { firms, recentlyVerified, platforms, countries, offers } = data;
  const verified = recentlyVerified.filter((firm) => firm.verifiedAt !== null);

  return (
    <>
      <ReferencePreview firms={firms} offers={offers} />
      <ReferenceLanding firms={firms} />

      <HomeSection
        id="explore"
        title="Explore prop firms"
        description="Listed alphabetically. This is not a ranking — there is no rating or popularity data on this site, so no firm is presented as better than another."
        {...(firms.length > 0
          ? { link: { href: "/prop-firms", label: "Browse all prop firms" } }
          : {})}
      >
        {firms.length > 0 ? (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {firms.map((firm) => (
              <li key={firm.id}>
                <FirmCard firm={firm} />
              </li>
            ))}
          </ul>
        ) : (
          // Intentional, not an error: an empty database is a real state, and
          // the page must look deliberate in it (CLAUDE.md §3).
          <div className="rounded-[14px] border border-border-default bg-bg-card">
            <EmptyState
              title="No prop firms have been published yet"
              description="Firm profiles appear here as soon as their data has been entered and published. Nothing is listed before then — this site does not publish placeholder firms."
              action={
                <Link
                  href="/prop-firms"
                  className="rounded-[10px] border border-border-default bg-bg-elevated px-4 py-2 text-sm font-medium text-text-primary hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
                >
                  Open the directory
                </Link>
              }
            />
          </div>
        )}
      </HomeSection>

      <HomeSection
        id="how-it-works"
        title="How Prop Firm Lenz records prop firm data"
        description="What this site does, and what it deliberately does not do."
      >
        <TrustSection />
      </HomeSection>

      <HomeSection
        id="browse"
        title="Browse by platform or headquarters"
        description="Shortcuts into the directory, built from firms that are already published."
      >
        <BrowseBy platforms={platforms} countries={countries} />
      </HomeSection>

      {/* Omitted entirely rather than shown empty: a "recently verified" list
          with nothing in it invites the reader to assume verification failed. */}
      {verified.length > 0 ? (
        <HomeSection
          id="recently-verified"
          title="Recently checked against published sources"
          description="The date shown is when an admin last compared this firm's recorded data with the firm's own published documentation."
          link={{
            href: "/prop-firms?verified=true",
            label: "See verified firms",
          }}
        >
          <RecentlyVerified firms={verified} />
        </HomeSection>
      ) : null}

      <HomeSection
        id="what-to-compare"
        title="What to compare before paying for a challenge"
        description="The conditions that decide whether an account is passable and a payout is reachable."
      >
        <WhatToCompare />
      </HomeSection>

      <section
        aria-labelledby="start-research"
        className="border-b border-border-subtle"
      >
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
          <h2
            id="start-research"
            className="text-2xl font-semibold text-text-primary sm:text-3xl"
          >
            Start your research
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-text-muted">
            Open the directory to filter prop firms by platform, headquarters
            and verification status, and to read each firm&apos;s published
            challenges, rules and payout terms side by side.
          </p>
          <div className="mt-8">
            <Link
              href="/prop-firms"
              className="inline-flex h-12 items-center justify-center rounded-[10px] bg-[image:var(--gradient-brand)] px-6 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
            >
              Browse all prop firms
            </Link>
          </div>
        </div>
      </section>

      {/*
        `WebSite` (with the SearchAction the directory genuinely implements) and
        `WebPage`. `Organization` is emitted once in the public layout and is
        NOT repeated here — two Organization blocks on one page compete for
        entity attribution.

        No `BreadcrumbList`: this is the root, so no breadcrumb genuinely
        exists. No `ItemList`: the firm grid is alphabetical, and list markup
        would imply a ranking the data cannot support. No rating, review or FAQ
        markup anywhere (docs/SEO.md §11 rule 1 `[LOCKED]`).
      */}
      <JsonLd
        data={[
          buildWebSiteLd(),
          buildWebPageLd({
            path: "/",
            name: `${SITE_NAME} — research prop firms before you buy`,
            description: HOME_DESCRIPTION,
          }),
        ]}
      />
    </>
  );
}
