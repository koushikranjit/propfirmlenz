import { desc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireAdminPermission } from "@/lib/auth/current-admin";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { adminUsers, auditLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Audit Logs" };

const pageSchema = z.coerce.number().int().min(1).max(10_000).catch(1);
const PAGE_SIZE = 50;

/**
 * Audit log viewer — docs/ADMIN.md §10.
 *
 * READ ONLY. There is no mutation path here, and none could work: the table is
 * append-only, enforced by a database trigger that raises on UPDATE and DELETE
 * (docs/DATABASE.md §4.7 `[LOCKED]`).
 *
 * Gated behind `audit_log:read` — it is a sensitive surface, because before/
 * after values can include commercial fields.
 */
export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPermission(PERMISSIONS.AUDIT_LOG_READ, {
    notFoundOnDeny: true,
  });

  const params = await searchParams;
  const raw = Array.isArray(params.page) ? params.page[0] : params.page;
  const page = pageSchema.parse(raw ?? 1);

  const db = getDb();
  const rows = await db
    .select({
      id: auditLogs.id,
      actorType: auditLogs.actorType,
      actorLabel: auditLogs.actorLabel,
      actorEmail: adminUsers.email,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(adminUsers, eq(adminUsers.id, auditLogs.actorAdminId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Admin", href: "/admin" }, { label: "Audit Logs" }]}
      />
      <PageHeader
        title="Audit Logs"
        description="Append-only. Every admin mutation is recorded and cannot be edited or deleted."
      />

      <Card className="mt-6 overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            title="No audit entries yet."
            description="Entries appear as soon as an admin action is taken."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <caption className="sr-only">Audit log, page {page}</caption>
              <thead>
                <tr className="border-b border-border-default text-left text-xs uppercase tracking-wide text-text-metadata">
                  <th scope="col" className="px-4 py-3 font-semibold">
                    When
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Actor
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Action
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Entity
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border-subtle last:border-0"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                      <time dateTime={row.createdAt.toISOString()}>
                        {row.createdAt
                          .toISOString()
                          .replace("T", " ")
                          .slice(0, 19)}
                      </time>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {row.actorEmail ?? row.actorLabel ?? row.actorType}
                    </td>
                    <td className="px-4 py-3 font-medium text-text-primary">
                      {row.action}
                    </td>
                    <td className="px-4 py-3 text-text-metadata">
                      {row.entityType ? (
                        <>
                          {row.entityType}
                          {row.entityId ? (
                            <span className="ml-1 font-mono text-xs">
                              {row.entityId.slice(0, 8)}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-3 text-xs text-text-metadata">
        Before/after values are not shown here yet. They contain commercial
        fields and need their own permission-gated view.
      </p>
    </>
  );
}
