import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetTestDb, type TestDb } from "@/lib/db/testing";
import {
  adminUserRoles,
  adminUsers,
  affiliateClicks,
  affiliateLinks,
  roles,
} from "@/lib/db/schema";
import { ROLES, seedRolesAndPermissions } from "@/lib/auth/permissions";
import { getFirmClickStats } from "./admin-firms";
import { createFirm } from "@/lib/services/firm-admin";

/**
 * BUY-LINK CLICK REPORTING — docs/DATABASE.md §5.10a.
 *
 * The number an affiliate decision gets made on, so the thing worth testing is
 * what it EXCLUDES. Bot and internal traffic are real rows that must never be
 * counted as trader interest.
 */

describe("buy link click stats", () => {
  let db: TestDb;
  let client: PGlite;
  let close: () => Promise<void>;
  let firmId: string;
  let linkId: string;

  beforeAll(async () => {
    ({ db, client, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await resetTestDb(client);
    await seedRolesAndPermissions(db);

    const [user] = await db
      .insert(adminUsers)
      .values({
        email: "admin@example.test",
        passwordHash: "x",
        fullName: "Example Admin",
        status: "active",
      })
      .returning({ id: adminUsers.id });
    const all = await db.select().from(roles);
    await db.insert(adminUserRoles).values({
      adminUserId: user!.id,
      roleId: all.find((r) => r.key === ROLES.MASTER_ADMIN)!.id,
    });

    const firm = await createFirm(db, {
      adminUserId: user!.id,
      input: {
        name: "Example Firm A",
        slug: "example-firm-a",
        description: null,
      },
    });
    firmId = firm.id;

    const [link] = await db
      .insert(affiliateLinks)
      .values({
        propFirmId: firmId,
        label: "Official site",
        destinationUrl: "https://example.test/buy",
        isDefault: true,
        status: "active",
      })
      .returning({ id: affiliateLinks.id });
    linkId = link!.id;
  });

  const click = (over: Record<string, unknown> = {}) =>
    db.insert(affiliateClicks).values({
      affiliateLinkId: linkId,
      propFirmId: firmId,
      ...over,
    });

  it("reports zero as zero when nothing has been clicked", async () => {
    const stats = await getFirmClickStats(db, firmId);
    expect(stats).toEqual({
      clicks: 0,
      excluded: 0,
      last30Days: 0,
      lastClickAt: null,
    });
  });

  it("counts genuine clicks and excludes bot and internal traffic", async () => {
    await click();
    await click();
    await click({ isBot: true });
    await click({ isInternal: true });

    const stats = await getFirmClickStats(db, firmId);
    // THE POINT: four rows exist, two are trader clicks.
    expect(stats.clicks).toBe(2);
    expect(stats.excluded).toBe(2);
    expect(stats.lastClickAt).not.toBeNull();
  });

  it("windows the recent count without losing the total", async () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await click({ clickedAt: old });
    await click();

    const stats = await getFirmClickStats(db, firmId);
    expect(stats.clicks).toBe(2);
    expect(stats.last30Days).toBe(1);
  });

  it("counts only this firm's clicks", async () => {
    const [other] = await db
      .insert(adminUsers)
      .values({
        email: "second@example.test",
        passwordHash: "x",
        fullName: "Second",
        status: "active",
      })
      .returning({ id: adminUsers.id });
    const allRoles = await db.select().from(roles);
    await db.insert(adminUserRoles).values({
      adminUserId: other!.id,
      roleId: allRoles.find((r) => r.key === ROLES.MASTER_ADMIN)!.id,
    });

    const otherFirm = await createFirm(db, {
      adminUserId: other!.id,
      input: {
        name: "Example Firm B",
        slug: "example-firm-b",
        description: null,
      },
    });
    const [otherLink] = await db
      .insert(affiliateLinks)
      .values({
        propFirmId: otherFirm.id,
        label: "Official site",
        destinationUrl: "https://example.test/other",
        isDefault: true,
        status: "active",
      })
      .returning({ id: affiliateLinks.id });

    await click();
    await db.insert(affiliateClicks).values({
      affiliateLinkId: otherLink!.id,
      propFirmId: otherFirm.id,
    });

    expect((await getFirmClickStats(db, firmId)).clicks).toBe(1);
    expect((await getFirmClickStats(db, otherFirm.id)).clicks).toBe(1);
  });
});

/**
 * THE CORE EDITOR'S SHAPE — docs/ADMIN.md §6.2 `[owner-locked 2026-09-04]`.
 *
 * Source-level assertions, because the guarantee is structural: the firm
 * workspace is ONE page of expandable sections, and the tab strip it replaced
 * must not come back. A rendering test would pass just as well against a
 * component that still imported Radix Tabs and hid them.
 */
describe("core firm editor structure", () => {
  const workspace = join(
    process.cwd(),
    "src/app/(admin)/admin/prop-firms/[id]/FirmWorkspace.tsx",
  );
  const source = readFileSync(workspace, "utf8");

  it("renders no tab strip at all", () => {
    expect(source).not.toContain("Tabs.Root");
    expect(source).not.toContain("Tabs.List");
    expect(source).not.toContain("Tabs.Trigger");
    expect(source).not.toContain("Tabs.Content");
    expect(source).not.toMatch(/from "radix-ui"/);
  });

  it("names none of the removed tabs as a primary destination", () => {
    // Reviews, Media, Internal Notes, Redirects and the Audit Log belong to
    // other admin sections; a tab for each is how this page became a maze.
    for (const gone of [
      'value: "reviews"',
      'value: "media"',
      'value: "notes"',
      'value: "redirects"',
      'value: "audit"',
      'label: "Internal Notes"',
    ]) {
      expect(source).not.toContain(gone);
    }
  });

  it("keeps the core sections on one page", () => {
    for (const section of [
      'title="Payout Tracking"',
      'title="Challenges"',
      'title="Announcements"',
      'title="FAQs"',
      'title="Advanced Information"',
    ]) {
      expect(source).toContain(section);
    }
    // And the primary editor is rendered directly, not behind a section.
    expect(source).toContain("<EssentialsForm");
  });

  it("keeps SEO and Verification out of the primary fields", () => {
    const essentials = readFileSync(
      join(
        process.cwd(),
        "src/app/(admin)/admin/prop-firms/[id]/EssentialsForm.tsx",
      ),
      "utf8",
    );
    expect(essentials).not.toContain("metaDescription");
    expect(essentials).not.toContain("canonicalUrl");
    expect(essentials).not.toContain("verificationStatus");
  });

  it("requires only the name", () => {
    const essentials = readFileSync(
      join(
        process.cwd(),
        "src/app/(admin)/admin/prop-firms/[id]/EssentialsForm.tsx",
      ),
      "utf8",
    );
    // Which LABELLED fields are marked required. A field carries the marker
    // twice — once on the Field wrapper for the visible "(required)" text and
    // once on the input for the browser — so counting markers would overcount.
    const requiredLabels = [
      ...essentials.matchAll(
        /label="([^"]+)"\s*\n\s*htmlFor="[^"]+"\s*\n\s*required/g,
      ),
    ].map((m) => m[1]);

    expect(requiredLabels).toEqual(["Prop firm name"]);
    // The slug is derived, not asked for.
    expect(essentials).not.toContain('name="slug"');
  });

  it("shows the logo uploader and the click count in the primary editor", () => {
    const essentials = readFileSync(
      join(
        process.cwd(),
        "src/app/(admin)/admin/prop-firms/[id]/EssentialsForm.tsx",
      ),
      "utf8",
    );
    expect(essentials).toContain("<LogoUpload");
    expect(essentials).toContain("<BuyLinkClicks");
  });
});
