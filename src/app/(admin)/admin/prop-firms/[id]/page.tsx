import { notFound } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireAdminPermission } from "@/lib/auth/current-admin";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getAdminFirmById } from "@/lib/repositories/admin-firms";
import {
  getAdminCatalog,
  getAdminFirmChildren,
} from "@/lib/repositories/admin-firm-children";
import {
  listNetworks,
  listTrackedWallets,
} from "@/lib/repositories/admin-payouts";
import { getCurrentVersion } from "@/lib/services/firm-draft";
import { mediaStorage, missingStorageVars } from "@/lib/media/storage";
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

  const [currentVersion, children, catalog, networks, wallets] =
    await Promise.all([
      getCurrentVersion(db, firm.id),
      // PUBLISHED children. Pending edits stay in `draft_payload` and are
      // summarised separately, so the editor can show "published + staged"
      // without either being written into the other.
      getAdminFirmChildren(db, firm.id),
      getAdminCatalog(db),
      // Payout tracking is a separate system; these are read-only references
      // so the firm editor can configure a wallet against THIS firm's record.
      listNetworks(db),
      listTrackedWallets(db, { firmId: firm.id }),
    ]);

  const draft = firm.draftPayload;
  const pendingChanges = draft ? countDraftChanges(draft) : 0;

  /** What the draft has staged, keyed so each row can show its own badge. */
  const staged = {
    challenges: (draft?.challenges ?? []).map((op) => ({
      key: op.id ?? `new:${op.slug ?? op.name ?? ""}`,
      op: op._op,
      name: op.name ?? "",
    })),
    rules: (draft?.ruleValues ?? []).map((op) => ({
      ruleId: op.ruleId,
      op: op._op,
    })),
    platformIds: (draft?.platforms ?? []).map((op) => op.platformId),
    instrumentIds: (draft?.instruments ?? []).map((op) => op.instrumentId),
    offers: (draft?.offers ?? []).map((op) => ({
      key: op.id ?? `new:${op.title ?? ""}`,
      op: op._op,
    })),
    affiliateLinks: (draft?.affiliateLinks ?? []).map((op) => ({
      key: op.id ?? `new:${op.label ?? ""}`,
      op: op._op,
    })),
    announcements: (draft?.announcements ?? [])
      .map((op) => op.id)
      .filter((id): id is string => id !== undefined),
    faqs: (draft?.faqs ?? [])
      .map((op) => op.id)
      .filter((id): id is string => id !== undefined),
    seo: draft?.seo !== undefined,
  };

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
          payoutInfoUrl: firm.payoutInfoUrl,
          foundedOn: firm.foundedOn,
          founderName: firm.founderName,
          ceoName: firm.ceoName,
          trustpilotRating: firm.trustpilotRating,
          trustpilotUrl: firm.trustpilotUrl,
          logoUrl: firm.logoUrl,
          logoAlt: firm.logoAlt,
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
          affiliate: admin.can(PERMISSIONS.AFFILIATE_LINK_EDIT),
          seo: admin.can(PERMISSIONS.SEO_WRITE),
        }}
        firmChildren={children}
        catalog={catalog}
        staged={staged}
        networks={networks}
        wallets={wallets}
        // Resolved on the SERVER. Only the boolean and the variable NAMES
        // cross to the browser — never a credential value (CLAUDE.md §6).
        storage={{
          configured: mediaStorage() !== null,
          missing: missingStorageVars(),
        }}
      />
    </>
  );
}
