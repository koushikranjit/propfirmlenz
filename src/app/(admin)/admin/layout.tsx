import type { Metadata } from "next";
import { logoutAction } from "@/lib/auth/actions";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { AdminShell } from "@/components/admin/AdminShell";
import { visibleGroups } from "@/components/admin/nav";
import { Button } from "@/components/ui/primitives";

/**
 * Admin layout — docs/ADMIN.md §2, §17.
 *
 * Argon2id and the database driver require the Node runtime, not Edge.
 */
export const runtime = "nodejs";

/** The admin surface is never indexed and never cached (docs/SEO.md §9). */
export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Prop Firm Lenz Admin" },
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getCurrentAdmin();

  // The login page renders inside this layout but has no shell. Every other
  // admin route calls requireAdmin()/requireAdminPermission() for itself —
  // this is a convenience, not the authorisation boundary.
  if (!admin) return <>{children}</>;

  return (
    <AdminShell
      groups={visibleGroups(admin.permissions)}
      adminName={admin.fullName}
      adminEmail={admin.email}
      logout={
        <form action={logoutAction}>
          <Button type="submit" variant="ghost" size="sm" className="w-full">
            Sign out
          </Button>
        </form>
      }
    >
      {children}
    </AdminShell>
  );
}
