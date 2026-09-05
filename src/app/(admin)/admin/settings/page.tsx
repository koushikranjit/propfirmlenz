import { requireAdminPermission } from "@/lib/auth/current-admin";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { missingStorageVars } from "@/lib/media/storage";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { StorageCheckPanel } from "@/components/admin/StorageCheckPanel";
import { PageHeader } from "@/components/ui/primitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

/**
 * Server configuration status — docs/ADMIN.md.
 *
 * Reports WHETHER each integration is configured, by variable NAME, and never
 * a value. `missingStorageVars()` returns names only, so no code path exists
 * that could put a credential on this page (CLAUDE.md §6 `[LOCKED]`).
 */
export default async function SettingsPage() {
  const admin = await requireAdminPermission(PERMISSIONS.FIRM_READ);
  const missing = missingStorageVars();

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Admin", href: "/admin" }, { label: "Settings" }]}
      />
      <PageHeader
        title="Settings"
        description="How this deployment is configured, and whether each integration actually works."
      />

      <div className="mt-6 flex flex-col gap-4">
        <StorageCheckPanel
          configured={missing.length === 0}
          missing={missing}
          canTest={admin.can(PERMISSIONS.CATALOG_MANAGE)}
        />
      </div>
    </>
  );
}
