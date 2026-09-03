import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { materializeDraft } from "@/lib/services/firm-draft";
import { getAdminFirmById } from "@/lib/repositories/admin-firms";
import { countDraftChanges } from "@/lib/validation/draft";
import { PreviewBanner } from "@/components/admin/PreviewBanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Never cached (docs/ARCHITECTURE.md §21.6 guarantee 6). */
export const fetchCache = "force-no-store";

/**
 * Live draft preview — docs/ARCHITECTURE.md §21.
 *
 * Emits NO canonical, NO Open Graph, and NO JSON-LD `[LOCKED]`. Component reuse
 * governs the rendered BODY; head generation is deliberately suppressed so no
 * draft data can appear in machine-readable markup and no preview URL can be
 * mistaken for a public page (docs/ARCHITECTURE.md §21.8).
 */
export const metadata: Metadata = {
  title: "Preview",
  robots: { index: false, follow: false, nocache: true },
  // No `alternates.canonical`, no `openGraph`. Deliberate.
};

export default async function FirmPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Anonymous access returns 404, not 403 — the existence of an unpublished
  // firm is itself non-public (docs/ARCHITECTURE.md §21.6 guarantee 8).
  const admin = await getCurrentAdmin();
  if (!admin || !admin.can(PERMISSIONS.FIRM_READ)) notFound();

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const db = getDb();
  const firm = await getAdminFirmById(db, id);
  if (!firm) notFound();

  // Pure and read-only — it never writes (docs/ARCHITECTURE.md §21.3).
  const view = await materializeDraft(db, id);
  const pendingChanges = firm.draftPayload
    ? countDraftChanges(firm.draftPayload)
    : 0;

  return (
    <div className="min-h-screen bg-bg-base">
      <PreviewBanner pendingChanges={pendingChanges} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        {/*
          The production public firm template does not exist yet (it is a later
          stage). Rather than invent a SECOND fake public template — which would
          drift from production and make the preview untrustworthy — this is an
          honest placeholder that renders the materialised draft values
          (docs/ARCHITECTURE.md §21.1).

          When components/public/firm-profile/FirmProfile.tsx is built, this
          route renders THAT component with the same FirmView, and this
          placeholder is deleted.
        */}
        <div className="mb-6 rounded-[14px] border border-dashed border-border-default bg-bg-card p-4">
          <p className="text-sm font-semibold text-text-primary">
            Public firm template not built yet
          </p>
          <p className="mt-1 text-sm text-text-muted">
            The preview infrastructure is in place. Once the public firm profile
            component exists, this route renders that exact component with the
            draft data — never a separate preview-only implementation.
          </p>
        </div>

        <article className="flex flex-col gap-4">
          <header>
            <h1 className="text-3xl font-semibold text-text-primary">
              {view.name}
            </h1>
            {view.tagline ? (
              <p className="mt-2 text-lg text-text-secondary">{view.tagline}</p>
            ) : null}
            <p className="mt-2 text-sm text-text-metadata">
              /prop-firms/{view.slug}
              {view.isVerified ? " · Verified" : ""}
            </p>
          </header>

          {view.description ? (
            <p className="whitespace-pre-wrap text-text-secondary">
              {view.description}
            </p>
          ) : (
            <p className="italic text-text-metadata">
              No description entered yet.
            </p>
          )}

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
              Challenges
            </h2>
            {view.challenges.length === 0 ? (
              <p className="mt-2 italic text-text-metadata">
                No challenges entered yet.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {view.challenges.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-[10px] border border-border-default bg-bg-card px-4 py-3"
                  >
                    <p className="text-sm font-medium text-text-primary">
                      {c.name}
                    </p>
                    <p className="text-sm tabular-nums text-text-secondary">
                      {/* Money always renders WITH its source currency. */}
                      {c.accountSize} {c.accountCurrency}
                      {c.price ? ` · ${c.price} ${c.priceCurrency}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/*
            The affiliate CTA renders with correct styling and copy but NO href.
            No request is issued, so there is nothing to attribute — this is the
            PRIMARY protection, not a downstream filter
            (docs/ARCHITECTURE.md §21.7 `[LOCKED]`).
          */}
          <div>
            <span
              aria-disabled="true"
              title="Affiliate links are disabled in preview, so no click is recorded."
              className="inline-flex h-11 cursor-not-allowed items-center rounded-[10px] bg-[image:var(--gradient-brand)] px-6 text-sm font-semibold text-white opacity-60"
            >
              Visit firm
            </span>
            <p className="mt-1 text-xs text-text-metadata">
              Affiliate link disabled in preview — no click is recorded.
            </p>
          </div>
        </article>
      </main>
    </div>
  );
}
