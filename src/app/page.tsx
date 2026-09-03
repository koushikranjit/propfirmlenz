import { SITE_NAME } from "@/lib/seo/site";

/**
 * Placeholder root route. The Phase 1 landing page is not built yet
 * (docs/ROADMAP.md §1.5) and must not be started without approval.
 */
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <h1 className="text-2xl font-semibold text-text-primary">{SITE_NAME}</h1>
    </main>
  );
}
