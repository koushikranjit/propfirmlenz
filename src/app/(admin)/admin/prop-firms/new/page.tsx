import { requireAdminPermission } from "@/lib/auth/current-admin";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { PageHeader } from "@/components/ui/primitives";
import { CreateFirmForm } from "./CreateFirmForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "New prop firm" };

export default async function NewPropFirmPage() {
  // Server-side authorisation. The form is unreachable without firm:create,
  // and the action re-checks independently.
  await requireAdminPermission(PERMISSIONS.FIRM_CREATE);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Prop Firms", href: "/admin/prop-firms" },
          { label: "New" },
        ]}
      />
      <PageHeader
        title="New prop firm"
        description="Creates an unpublished draft. Nothing is public until you explicitly publish."
      />
      <div className="mt-6 max-w-2xl">
        <CreateFirmForm />
      </div>
    </>
  );
}
