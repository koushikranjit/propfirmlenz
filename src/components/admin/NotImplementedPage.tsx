import { requireAdmin } from "@/lib/auth/current-admin";
import { findNavItem } from "@/components/admin/nav";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { NotImplemented, PageHeader } from "@/components/ui/primitives";

/**
 * A navigation destination whose feature genuinely does not exist yet.
 *
 * Honest by design: no fake form, no placeholder chart, no invented metric
 * (docs/CLAUDE.md §3, §4). The nav entry exists so the shell is complete; the
 * page says plainly that the capability is not built.
 */
export async function NotImplementedPage({ href }: { href: string }) {
  await requireAdmin(href);
  const item = findNavItem(href);
  const label = item?.label ?? "This section";

  return (
    <>
      <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label }]} />
      <PageHeader title={label} />
      <div className="mt-6">
        <NotImplemented
          feature={label}
          {...(item?.phase ? { phase: item.phase } : {})}
        />
      </div>
    </>
  );
}
