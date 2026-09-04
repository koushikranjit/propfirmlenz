import { JsonLd } from "@/components/public/JsonLd";
import { SiteFooter, SiteHeader } from "@/components/public/SiteChrome";
import { buildOrganizationLd } from "@/lib/seo/metadata";

/**
 * The public shell — docs/SEO.md §11.
 *
 * `Organization` JSON-LD is emitted SITE-WIDE here, describing Prop Firm Lenz
 * itself with its official logo. It is deliberately not repeated per firm page:
 * an Organization block on a firm profile would compete for entity attribution
 * with the firm the page is actually about.
 *
 * The admin preview route lives in the `(admin)` group and does not use this
 * layout, so it inherits no canonical, no Open Graph, and no JSON-LD
 * (docs/ARCHITECTURE.md §21.8 `[LOCKED]`).
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-bg-base">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[10px] focus:bg-bg-elevated focus:px-4 focus:py-2 focus:text-sm focus:text-text-primary"
      >
        Skip to content
      </a>

      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />

      <JsonLd data={buildOrganizationLd()} />
    </div>
  );
}
