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
import { FirmProfile } from "@/components/public/firm-profile/FirmProfile";

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

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        {/*
          THE SAME component the production page renders, given the same
          `FirmView` — assembled by `materializeDraft` from the published rows
          plus the draft overlay, through the same `assembleView` the public
          repository uses. There is no preview-only firm template, and a field
          added to the view that the materialiser does not supply is a compile
          error (docs/ARCHITECTURE.md §21.1, §21.2 `[LOCKED]`).

          `preview` changes exactly one thing: the affiliate CTA renders inert
          with no `/go/` href, so previewing cannot create click attribution
          (§21.7 `[LOCKED]`).
        */}
        <FirmProfile firm={view} preview />
      </div>
    </div>
  );
}
