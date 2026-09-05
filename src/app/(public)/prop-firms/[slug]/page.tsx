import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { FirmProfile } from "@/components/public/firm-profile/FirmProfile";
import { firmPayoutEvidence } from "@/lib/repositories/firm-payout-evidence";
import { JsonLd } from "@/components/public/JsonLd";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { getDb } from "@/lib/db/client";
import { getPublishedFirmView } from "@/lib/repositories/public-firm-view";
import {
  findActiveRedirect,
  getFirmSeoOverride,
} from "@/lib/repositories/public-seo";
import {
  buildFirmDescription,
  buildFirmMetadata,
  buildFirmTitle,
  firmBreadcrumbs,
  firmPath,
} from "@/lib/seo/firm-seo";
import {
  buildBreadcrumbLd,
  buildFaqLd,
  buildWebPageLd,
} from "@/lib/seo/metadata";
import { type FirmView, isIndexable } from "@/lib/view/firm-view";

/**
 * The canonical public firm profile — docs/SEO.md §3.2, docs/ARCHITECTURE.md
 * §21.2, §22.
 *
 * Reads PUBLISHED data only, through `getPublishedFirmView`, which never
 * selects `draft_payload`. While an admin edits a draft, this page keeps
 * serving the published version unchanged (CLAUDE.md §12.4e rule 28
 * `[LOCKED]`).
 *
 * Public routes are keyed by SLUG; admin routes are keyed by id (§22
 * `[LOCKED]`). A renamed slug leaves a redirect behind, so the old URL keeps
 * working rather than 404ing (docs/SEO.md §7).
 *
 * Server-rendered per request. The database is not reachable at build time and
 * the published set changes on every publish, so there is nothing honest to
 * prerender; caching and revalidation tags come with the caching stage.
 */
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

/** The slug shape the route accepts at all. Anything else is a 404, not a query. */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

async function loadFirm(slug: string): Promise<FirmView | null> {
  if (slug.length > 100 || !SLUG_PATTERN.test(slug)) return null;
  return getPublishedFirmView(getDb(), slug);
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const firm = await loadFirm(slug);

  // A page that is about to 404 or redirect must not advertise itself.
  if (!firm) {
    return { title: "Firm not found", robots: { index: false, follow: true } };
  }

  const override = await getFirmSeoOverride(getDb(), firm.id);
  return buildFirmMetadata(firm, override);
}

export default async function FirmProfilePage({ params }: { params: Params }) {
  const { slug } = await params;
  const firm = await loadFirm(slug);

  if (!firm) {
    // A renamed slug has a redirect row; anything else is genuinely gone.
    // Draft, archived and soft-deleted firms fall through to 404 — the
    // existence of an unpublished firm is not public information.
    const target = await findActiveRedirect(getDb(), firmPath(slug));

    if (target) {
      if (target.statusCode === 301 || target.statusCode === 308) {
        // Next issues 308, the permanent equivalent of a 301: same "update
        // your link" signal to crawlers, and it preserves the method.
        permanentRedirect(target.toPath);
      }
      if (target.statusCode === 302 || target.statusCode === 307) {
        redirect(target.toPath);
      }
      // A 410 row means deliberately gone. Returning a true 410 status needs
      // the URL-normalisation middleware, which is not built yet, so this
      // falls through to 404 rather than pretending otherwise.
    }

    notFound();
  }

  const crumbs = firmBreadcrumbs(firm);
  const payouts = await firmPayoutEvidence(getDb(), firm.id);
  const faqLd = buildFaqLd(firm.faqs);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <Breadcrumbs
        items={crumbs.map((crumb, i) => ({
          label: crumb.name,
          ...(i < crumbs.length - 1 ? { href: crumb.path } : {}),
        }))}
      />

      {/* THE shared component. The admin preview renders this exact tree. */}
      <FirmProfile firm={firm} payouts={payouts} />

      {/*
        Only markup the page can back up:
          - WebPage and BreadcrumbList, both mirroring what is visible;
          - NO AggregateRating or Review — no rating data exists, and it is
            prohibited before Phase 3 (docs/SEO.md §11 rule 1 `[LOCKED]`);
          - FAQPage ONLY when this firm has real, visible FAQs on the page;
          - NO Organization for the firm; the site's own Organization is
            emitted once, in the public layout.
        A thin profile is noindex, so it emits no structured data at all.
      */}
      {isIndexable(firm) ? (
        <JsonLd
          data={[
            buildWebPageLd({
              path: firmPath(firm.slug),
              name: buildFirmTitle(firm),
              description: buildFirmDescription(firm),
              dateModified: firm.updatedAt,
            }),
            buildBreadcrumbLd(crumbs),
            // Built from the SAME array the page renders, so the markup can
            // never describe content a reader cannot see (docs/SEO.md §11
            // rule 2). Absent entirely when the firm has no FAQs.
            ...(faqLd ? [faqLd] : []),
          ]}
        />
      ) : null}
    </div>
  );
}
