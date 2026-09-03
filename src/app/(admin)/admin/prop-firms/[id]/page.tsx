import { notFound } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireAdminPermission } from "@/lib/auth/current-admin";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getAdminFirmById } from "@/lib/repositories/admin-firms";
import { getCurrentVersion } from "@/lib/services/firm-draft";
import { countDraftChanges } from "@/lib/validation/draft";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { FirmWorkspace } from "./FirmWorkspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Prop firm workspace — docs/ADMIN.md §6.
 *
 * Keyed by DATABASE ID, not slug `[LOCKED]` (docs/ARCHITECTURE.md §22): a slug
 * rename is a supported mid-draft edit, and a slug-keyed URL would break the
 * open tab, the preview iframe, and every deep link the moment it changed.
 */
export default async function FirmWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdminPermission(PERMISSIONS.FIRM_READ, {
    notFoundOnDeny: true,
  });

  const { id } = await params;
  // A malformed id is a 404, not a 500 — and never reaches the database.
  if (!z.uuid().safeParse(id).success) notFound();

  const db = getDb();
  const firm = await getAdminFirmById(db, id);
  // Also covers the soft-deleted case: getAdminFirmById filters deleted_at.
  if (!firm) notFound();

  const currentVersion = await getCurrentVersion(db, firm.id);
  const pendingChanges = firm.draftPayload
    ? countDraftChanges(firm.draftPayload)
    : 0;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Prop Firms", href: "/admin/prop-firms" },
          { label: firm.name },
        ]}
      />
      <Link
        href="/admin/prop-firms"
        className="mb-4 inline-block rounded text-sm text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
      >
        ← Back to all prop firms
      </Link>

      <FirmWorkspace
        firm={{
          id: firm.id,
          name: firm.name,
          slug: firm.slug,
          tagline: firm.tagline,
          description: firm.description,
          legalName: firm.legalName,
          foundedYear: firm.foundedYear,
          headquartersCountry: firm.headquartersCountry,
          headquartersCity: firm.headquartersCity,
          websiteUrl: firm.websiteUrl,
          supportEmail: firm.supportEmail,
          supportUrl: firm.supportUrl,
          brandColor: firm.brandColor,
          isFeatured: firm.isFeatured,
          displayOrder: firm.displayOrder,
          status: firm.status,
          verificationStatus: firm.verificationStatus,
          verifiedAt: firm.verifiedAt?.toISOString() ?? null,
          publishedAt: firm.publishedAt?.toISOString() ?? null,
          hasDraft: firm.draftPayload !== null,
          pendingChanges,
          version: currentVersion,
        }}
        can={{
          edit: admin.can(PERMISSIONS.FIRM_EDIT),
          publish: admin.can(PERMISSIONS.FIRM_PUBLISH),
          verify: admin.can(PERMISSIONS.FIRM_VERIFY),
          delete: admin.can(PERMISSIONS.FIRM_DELETE),
          audit: admin.can(PERMISSIONS.AUDIT_LOG_READ),
        }}
      />
    </>
  );
}
