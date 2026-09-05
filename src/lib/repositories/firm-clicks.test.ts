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
 * THE CORE EDITOR'S SHAPE — docs/ADMIN.md §6.2 `[owner-directed 2026-09-04]`.
 *
 * Source-level assertions, because the guarantee is structural: the editor is
 * organised into ELEVEN categories, and the seventeen-tab strip it replaced
 * must not come back. A rendering test would pass just as well against a
 * component that still declared the old tabs and hid them.
 */
describe("core firm editor structure", () => {
  const dir = "src/app/(admin)/admin/prop-firms/[id]";
  const read = (file: string) =>
    readFileSync(join(process.cwd(), dir, file), "utf8");

  const workspace = read("FirmWorkspace.tsx");
  const essentials = read("EssentialsForm.tsx");

  const CATEGORIES = [
    "overview",
    "company",
    "branding",
    "discount",
    "payout-tracking",
    "challenges",
    "announcements",
    "faqs",
    "advanced",
    "seo",
    "verification",
  ];

  it("declares exactly the eleven categories", () => {
    const declared = [
      ...workspace.matchAll(/\{ value: "([a-z-]+)", label: "[^"]+" \}/g),
    ].map((m) => m[1]);
    expect(declared).toEqual(CATEGORIES);
  });

  it("renders a panel for every category, and no orphan panels", () => {
    const panels = [
      ...workspace.matchAll(/<Tabs\.Content value="([a-z-]+)"/g),
      ...essentials.matchAll(/<Tabs\.Content value="([a-z-]+)"/g),
    ].map((m) => m[1]);

    // Overview, Company and Discount live in the essentials form; the rest in
    // the workspace. Together they must cover the tab list exactly.
    expect([...panels].sort()).toEqual([...CATEGORIES].sort());
  });

  it("does not bring back the seventeen-tab strip", () => {
    // These were primary tabs and are now either inside Advanced or are
    // separate admin systems entirely.
    for (const gone of [
      'value: "reviews"',
      'value: "media"',
      'value: "notes"',
      'value: "redirects"',
      'value: "audit"',
      'value: "affiliate"',
      'value: "rules"',
      'value: "associations"',
      'value: "offers"',
      'label: "Internal Notes"',
      'label: "Audit Log"',
    ]) {
      expect(workspace).not.toContain(gone);
    }
  });

  it("keeps rules, platforms and affiliate inside Advanced", () => {
    const advanced = workspace.slice(
      workspace.indexOf('<Tabs.Content value="advanced">'),
      workspace.indexOf('<Tabs.Content value="seo">'),
    );
    expect(advanced).toContain("<RulesTab");
    expect(advanced).toContain("<AssociationsTab");
    expect(advanced).toContain("<AffiliateTab");
    expect(advanced).toContain("<OffersTab");
  });

  it("puts each core field in its category", () => {
    const panel = (name: string) => {
      const from = essentials.indexOf(`<Tabs.Content value="${name}"`);
      const rest = essentials.slice(from + 1);
      const to = rest.indexOf("<Tabs.Content value=");
      return to === -1 ? rest : rest.slice(0, to);
    };

    const overview = panel("overview");
    for (const field of [
      'name="name"',
      'name="tagline"',
      'name="description"',
      'name="affiliateUrl"',
      "<BuyLinkClicks",
      'name="trustpilotRating"',
      'name="trustpilotUrl"',
    ]) {
      expect(overview).toContain(field);
    }

    const company = panel("company");
    expect(company).toContain('name="founderName"');
    expect(company).toContain('name="ceoName"');

    const discount = panel("discount");
    for (const field of [
      'name="discountTitle"',
      'name="discountCode"',
      'name="discountDescription"',
      'name="discountPercent"',
      'name="discountEndsAt"',
    ]) {
      expect(discount).toContain(field);
    }

    // Branding carries the logo, and it is the only place that does.
    expect(workspace).toContain("<LogoUpload");
  });

  it("submits country and date created exactly once despite showing twice", () => {
    // They appear under both Overview and Company. Two live inputs with the
    // same name would race; one state with one submitted input cannot.
    expect((essentials.match(/name="headquartersCountry"/g) ?? []).length).toBe(
      1,
    );
    expect((essentials.match(/name: "foundedOn"/g) ?? []).length).toBe(1);
    expect((essentials.match(/<CountryPicker/g) ?? []).length).toBe(2);
    expect((essentials.match(/<FoundedFields/g) ?? []).length).toBe(2);
  });

  it("marks no field as required, including the name", () => {
    const requiredLabels = [
      ...essentials.matchAll(
        /label="([^"]+)"\s*\n\s*htmlFor="[^"]+"\s*\n\s*required/g,
      ),
    ].map((m) => m[1]);
    expect(requiredLabels).toEqual([]);
    // And no "(REQUIRED)" chrome on name or slug anywhere in the editor.
    expect(essentials).not.toMatch(/name="name"[\s\S]{0,200}required/);
    expect(workspace).not.toMatch(/name="slug"[\s\S]{0,200}required/);
  });

  it("keeps SEO and verification out of the core fields", () => {
    expect(essentials).not.toContain("metaDescription");
    expect(essentials).not.toContain("canonicalUrl");
    expect(essentials).not.toContain("verificationStatus");
  });
});
