import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/public/JsonLd";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { EmptyState } from "@/components/ui/primitives";
import { OfferCard } from "@/components/public/offers/OfferCard";
import { getDb } from "@/lib/db/client";
import { listActiveOffers } from "@/lib/repositories/public-offers";
import {
  buildBreadcrumbLd,
  buildMetadata,
  buildWebPageLd,
} from "@/lib/seo/metadata";

/**
 * PUBLISHED OFFERS — docs/DATABASE.md §5.7.
 *
 * Reads `listActiveOffers`, the same query the homepage panel uses. There is
 * deliberately no second dataset for this page: two queries over one table
 * drift, and the first symptom is a discount showing here and not on the firm's
 * own profile.
 *
 * Nothing is generated. A firm appears only while it has a published offer
 * inside its window, and each field renders only if an admin entered it. With
 * nothing live the page says so rather than filling the space
 * (CLAUDE.md §3 `[LOCKED]`).
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const offers = await listActiveOffers(getDb(), { limit: 1 });

  return buildMetadata({
    path: "/offers",
    title: "Prop firm discount codes and offers",
    description:
      "Current prop firm offers and discount codes, each one recorded from what the firm published. Every code, percentage and expiry date comes from a verified record — nothing is estimated.",
    // With nothing live this is a heading and an empty state: honest for a
    // reader, thin for a crawler (docs/SEO.md §9).
    ...(offers.length === 0 ? { noindex: true } : {}),
  });
}

export default async function OffersPage() {
  const offers = await listActiveOffers(getDb(), { limit: 100 });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Breadcrumbs
        items={[{ label: "Home", href: "/" }, { label: "Offers" }]}
      />

      <header className="max-w-3xl">
        <h1 className="text-2xl font-semibold text-text-primary sm:text-3xl">
          Prop firm offers
        </h1>
        <p className="mt-3 text-text-secondary">
          Discount codes and offers currently running, taken from what each firm
          published. An offer disappears from this page the moment it expires.
        </p>
        <p className="mt-3 text-sm text-text-muted">
          A percentage or an end date appears only where the firm stated one. We
          do not estimate discounts, and an offer without a published figure is
          shown without one.
        </p>
      </header>

      {offers.length === 0 ? (
        <div className="mt-8 rounded-[14px] border border-border-default bg-bg-card">
          <EmptyState
            title="No offers are running right now"
            description="No firm currently has a published offer inside its active window. Rather than showing an expired code or an estimated discount, this page stays empty until there is a real one."
            action={
              <Link
                href="/prop-firms"
                className="rounded-[10px] border border-border-default bg-bg-elevated px-4 py-2 text-sm font-medium text-text-primary hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
              >
                Browse all prop firms
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <p className="mt-8 text-sm text-text-muted">
            {offers.length === 1
              ? "1 offer running"
              : `${offers.length} offers running`}
          </p>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {offers.map((offer) => (
              <OfferCard key={offer.id} offer={offer} />
            ))}
          </ul>
        </>
      )}

      <JsonLd
        data={[
          buildWebPageLd({
            path: "/offers",
            name: "Prop firm discount codes and offers",
            description:
              "Current prop firm offers and discount codes, recorded from what each firm published.",
          }),
          buildBreadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Offers", path: "/offers" },
          ]),
        ]}
      />
    </div>
  );
}
