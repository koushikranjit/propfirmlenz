import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { adminUserRoles, adminUsers, roles } from "@/lib/db/schema";
import { ROLES } from "@/lib/auth/permissions";
import { seedFirmCatalog } from "@/lib/seed/seed-firms";
import { LENZ_OFFER, SEED_FIRMS } from "@/lib/seed/firm-catalog";

/**
 * Seeds the initial public catalog — `pnpm seed:firms`.
 *
 * IT ACTS AS A REAL ADMIN. The seed runs under an existing master admin's id,
 * so every permission check, audit entry and version snapshot is the same as
 * if that person had done it in the dashboard. There is no seed-only bypass,
 * and no account is created to provide one.
 *
 * SAFE TO RE-RUN. See `seed-firms.ts`: firms are matched by slug, fields are
 * filled only where empty, and the LENZ offer is matched by code.
 */

async function main(): Promise<void> {
  const db = getDb();

  // Whoever bootstrapped the system. Never invented, never a new account.
  const [admin] = await db
    .select({ id: adminUsers.id, email: adminUsers.email })
    .from(adminUsers)
    .innerJoin(adminUserRoles, eq(adminUserRoles.adminUserId, adminUsers.id))
    .innerJoin(roles, eq(roles.id, adminUserRoles.roleId))
    .where(
      and(
        eq(roles.key, ROLES.MASTER_ADMIN),
        eq(adminUsers.status, "active"),
        isNull(adminUsers.deletedAt),
      ),
    )
    .limit(1);

  if (!admin) {
    console.error(
      "No active master admin found. Run `pnpm admin:create` first — the seed\n" +
        "runs as a real admin rather than creating a privileged account of its own.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Seeding ${SEED_FIRMS.length} firms as ${admin.email}…\n`);

  const report = await seedFirmCatalog(db, { adminUserId: admin.id });

  console.log(`  firms created      ${report.firmsCreated}`);
  console.log(`  firms reconciled   ${report.firmsReconciled}`);
  console.log(`  fields filled      ${report.fieldsFilled}`);
  console.log(`  platforms linked   ${report.platformsLinked}`);
  console.log(`  LENZ offers new    ${report.offersCreated}`);
  console.log(`  LENZ offers updated${report.offersUpdated}`);
  console.log(`  published          ${report.published}`);

  if (report.skipped.length > 0) {
    console.log(`\n  left as drafts (pre-publish checks):`);
    for (const skip of report.skipped) {
      console.log(`    ${skip.slug}: ${skip.reason}`);
    }
  }

  console.log(
    `\nThe LENZ offer is placeholder data: ${LENZ_OFFER.discountPercent}% has not been\n` +
      `agreed with any firm. Set the real terms in Admin before launch, or remove it.`,
  );
}

await main();
process.exit(process.exitCode ?? 0);
