import { eq } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetTestDb, type TestDb } from "@/lib/db/testing";
import {
  adminUserRoles,
  adminUsers,
  firmAnnouncements,
  firmFaqs,
  media,
  offers,
  propFirms,
  roles,
} from "@/lib/db/schema";
import { ROLES, seedRolesAndPermissions } from "@/lib/auth/permissions";
import { createFirm } from "./firm-admin";
import { saveFirmEssentials } from "./firm-essentials";
import { stageChildOp } from "./firm-children";
import { publishFirm } from "./firm-draft";
import { getPublishedFirmView } from "@/lib/repositories/public-firm-view";
import {
  listPublishedFirmSlugs,
  listPublishedFirmSummaries,
} from "@/lib/repositories/public-firms";
import { getAdminFirmChildren } from "@/lib/repositories/admin-firm-children";
import { firmEssentialsSchema } from "@/lib/validation/firm";
import { yearsInOperation } from "@/lib/view/firm-view";
import { COUNTRIES, country, countryFlag } from "@/lib/geo/countries";
import { ImageError, inspectImage } from "@/lib/media/image";

/**
 * THE CORE PROP FIRM WORKFLOW — docs/ADMIN.md §6 `[owner-locked 2026-09-04]`.
 *
 * Against a REAL PostgreSQL, because what is under test is the promise that
 * simplifying the admin screen did NOT simplify the database: a firm saved
 * from the primary editor must round-trip through the draft, the publish
 * transaction, and out to the public view with every core field intact.
 *
 * Fixtures are obviously fake ("Example Firm A") — no real firm's name, price,
 * founder or rating appears anywhere in this repository `[LOCKED]`.
 */

describe("core prop firm workflow", () => {
  let db: TestDb;
  let client: PGlite;
  let close: () => Promise<void>;
  let adminId: string;

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
        email: "publisher@example.test",
        passwordHash: "x",
        fullName: "Example Publisher",
        status: "active",
      })
      .returning({ id: adminUsers.id });
    adminId = user!.id;

    const all = await db.select().from(roles);
    await db.insert(adminUserRoles).values({
      adminUserId: adminId,
      roleId: all.find((r) => r.key === ROLES.MASTER_ADMIN)!.id,
    });
  });

  /** Publishing genuinely requires a description; this satisfies that check. */
  const DESCRIPTION =
    "A placeholder description used only by the test suite, long enough to satisfy the pre-publish check.";

  const newFirm = async (name = "Example Firm A") =>
    createFirm(db, {
      adminUserId: adminId,
      input: {
        name,
        slug: name.toLowerCase().replace(/\s+/g, "-"),
        description: DESCRIPTION,
      },
    });

  /** The essentials form with everything blank but the name. */
  const essentials = (over: Record<string, unknown> = {}) =>
    firmEssentialsSchema.parse({
      name: "Example Firm A",
      tagline: "",
      description: DESCRIPTION,
      affiliateUrl: "",
      founderName: "",
      ceoName: "",
      headquartersCountry: "",
      trustpilotRating: "",
      trustpilotUrl: "",
      foundedOn: "",
      payoutInfoUrl: "",
      discountTitle: "",
      discountCode: "",
      discountDescription: "",
      discountPercent: "",
      discountEndsAt: "",
      ...over,
    });

  /* ------------------------------------------------------------ the firm */

  describe("creating and editing", () => {
    it("creates a firm with only a name, and derives the slug", async () => {
      const { id } = await createFirm(db, {
        adminUserId: adminId,
        input: {
          name: "Example Firm A",
          slug: "example-firm-a",
          description: null,
        },
      });

      const [row] = await db
        .select()
        .from(propFirms)
        .where(eq(propFirms.id, id));
      expect(row?.slug).toBe("example-firm-a");
      // Nothing was invented to fill the gaps.
      expect(row?.description).toBeNull();
      expect(row?.founderName).toBeNull();
      expect(row?.trustpilotRating).toBeNull();
      expect(row?.foundedOn).toBeNull();
    });

    it("saves a draft with only the name filled in", async () => {
      const { id } = await newFirm();
      await expect(
        saveFirmEssentials(db, {
          adminUserId: adminId,
          firmId: id,
          input: essentials(),
        }),
      ).resolves.toBeDefined();
    });

    it("round-trips every core field to the public view", async () => {
      const { id } = await newFirm();

      await saveFirmEssentials(db, {
        adminUserId: adminId,
        firmId: id,
        input: essentials({
          tagline: "An example tagline",
          description: "An example description used only by the test suite.",
          founderName: "Example Founder",
          ceoName: "Example Chief",
          headquartersCountry: "ae",
          trustpilotRating: "4.6",
          trustpilotUrl: "https://example.test/reviews",
          foundedOn: "2022-11-01",
          affiliateUrl: "https://example.test/buy",
        }),
      });

      await publishFirm(db, { adminUserId: adminId, firmId: id });
      const view = await getPublishedFirmView(db, "example-firm-a");

      expect(view?.tagline).toBe("An example tagline");
      expect(view?.founderName).toBe("Example Founder");
      expect(view?.ceoName).toBe("Example Chief");
      expect(view?.headquartersCountry).toBe("AE");
      expect(view?.trustpilotRating).toBe("4.6");
      expect(view?.foundedOn).toBe("2022-11-01");
      // The buy link drives the CTA but never reaches the public view.
      expect(view?.hasAffiliateLink).toBe(true);
      expect(JSON.stringify(view)).not.toContain("example.test/buy");
    });

    it("leaves fields it does not own alone", async () => {
      const { id } = await newFirm();
      await db
        .update(propFirms)
        .set({
          legalName: "Example Firm A Ltd",
          supportEmail: "a@example.test",
        })
        .where(eq(propFirms.id, id));

      await saveFirmEssentials(db, {
        adminUserId: adminId,
        firmId: id,
        input: essentials({ tagline: "New tagline" }),
      });
      await publishFirm(db, { adminUserId: adminId, firmId: id });

      const [row] = await db
        .select()
        .from(propFirms)
        .where(eq(propFirms.id, id));
      expect(row?.legalName).toBe("Example Firm A Ltd");
      expect(row?.supportEmail).toBe("a@example.test");
    });
  });

  /* ----------------------------------------- publishing with nothing set */

  describe("no content field is required", () => {
    it("creates a firm with no name and no slug at all", async () => {
      const { id } = await createFirm(db, {
        adminUserId: adminId,
        input: { name: null, slug: null, description: null },
      });

      const [row] = await db
        .select()
        .from(propFirms)
        .where(eq(propFirms.id, id));
      expect(row?.name).toBeNull();
      expect(row?.slug).toBeNull();
      // Nothing was substituted to satisfy a constraint.
      expect(row?.description).toBeNull();
    });

    it("publishes a completely empty firm", async () => {
      const { id } = await createFirm(db, {
        adminUserId: adminId,
        input: { name: null, slug: null, description: null },
      });

      await expect(
        publishFirm(db, { adminUserId: adminId, firmId: id }),
      ).resolves.toBeDefined();

      const [row] = await db
        .select()
        .from(propFirms)
        .where(eq(propFirms.id, id));
      expect(row?.status).toBe("published");
      // Still empty. Publishing fills nothing in.
      expect(row?.name).toBeNull();
      expect(row?.slug).toBeNull();
      expect(row?.founderName).toBeNull();
      expect(row?.trustpilotRating).toBeNull();
    });

    it("gives an empty published firm no public page and no sitemap entry", async () => {
      const { id } = await createFirm(db, {
        adminUserId: adminId,
        input: { name: null, slug: null, description: null },
      });
      await publishFirm(db, { adminUserId: adminId, firmId: id });

      // THE POINT: publishable in the database, unreachable on the web. No
      // invented slug means no invented URL (docs/ADMIN.md §6.2).
      expect(await listPublishedFirmSummaries(db, {})).toHaveLength(0);
      expect(await listPublishedFirmSlugs(db)).toHaveLength(0);
      expect(await getPublishedFirmView(db, "")).toBeNull();
    });

    it("saves the essentials form with every field blank", async () => {
      const { id } = await createFirm(db, {
        adminUserId: adminId,
        input: { name: null, slug: null, description: null },
      });

      await expect(
        saveFirmEssentials(db, {
          adminUserId: adminId,
          firmId: id,
          input: firmEssentialsSchema.parse({
            name: "",
            tagline: "",
            description: "",
            affiliateUrl: "",
            founderName: "",
            ceoName: "",
            headquartersCountry: "",
            trustpilotRating: "",
            trustpilotUrl: "",
            foundedOn: "",
            payoutInfoUrl: "",
            discountTitle: "",
            discountCode: "",
            discountDescription: "",
            discountPercent: "",
            discountEndsAt: "",
          }),
        }),
      ).resolves.toBeDefined();

      await publishFirm(db, { adminUserId: adminId, firmId: id });
      // A blank discount creates no offer.
      expect(
        await db.select().from(offers).where(eq(offers.propFirmId, id)),
      ).toHaveLength(0);
    });
  });

  /* ------------------------------------------------------------- country */

  describe("country", () => {
    it("resolves a code to a name and a derived flag", () => {
      expect(country("AE")?.name).toBe("United Arab Emirates");
      expect(country("ae")?.flag).toBe("🇦🇪");
      expect(countryFlag("GB")).toBe("🇬🇧");
      expect(countryFlag("XX-invalid")).toBeNull();
    });

    it("rejects a country that is not on the list", () => {
      expect(() => essentials({ headquartersCountry: "ZZ" })).toThrow();
    });

    it("offers every country, sorted by name", () => {
      expect(COUNTRIES.length).toBeGreaterThan(200);
      const names = COUNTRIES.map((c) => c.name);
      expect([...names].sort((a, b) => a.localeCompare(b, "en"))).toEqual(
        names,
      );
    });
  });

  /* -------------------------------------------------- years in operation */

  describe("years in operation", () => {
    const at = (iso: string) => new Date(iso);

    it("counts full years only", () => {
      expect(yearsInOperation("2022-11-01", at("2026-09-04T00:00:00Z"))).toBe(
        3,
      );
      // The day before the anniversary is still the previous count.
      expect(yearsInOperation("2022-11-01", at("2025-10-31T00:00:00Z"))).toBe(
        2,
      );
      expect(yearsInOperation("2022-11-01", at("2025-11-01T00:00:00Z"))).toBe(
        3,
      );
    });

    it("is null when the date is unknown, never zero", () => {
      expect(yearsInOperation(null)).toBeNull();
      expect(yearsInOperation("not-a-date")).toBeNull();
      // A future founding date is not "0 years", it is not answerable.
      expect(
        yearsInOperation("2030-01-01", at("2026-09-04T00:00:00Z")),
      ).toBeNull();
    });

    it("is derived on the view, never stored", async () => {
      const { id } = await newFirm();
      await saveFirmEssentials(db, {
        adminUserId: adminId,
        firmId: id,
        input: essentials({ foundedOn: "2022-11-01" }),
      });
      await publishFirm(db, { adminUserId: adminId, firmId: id });

      const view = await getPublishedFirmView(db, "example-firm-a");
      expect(view?.yearsInOperation).toBe(yearsInOperation("2022-11-01"));
      // No column holds it.
      const [row] = await db
        .select()
        .from(propFirms)
        .where(eq(propFirms.id, id));
      expect(Object.keys(row ?? {})).not.toContain("yearsInOperation");
    });
  });

  /* ------------------------------------------------------------ discount */

  describe("discount", () => {
    it("creates one offer, and updates that same offer on re-save", async () => {
      const { id } = await newFirm();

      await saveFirmEssentials(db, {
        adminUserId: adminId,
        firmId: id,
        input: essentials({
          discountTitle: "20% OFF",
          discountCode: "PFL20",
          discountDescription: "20% off all evaluation accounts.",
          discountPercent: "20",
        }),
      });
      await publishFirm(db, { adminUserId: adminId, firmId: id });

      await saveFirmEssentials(db, {
        adminUserId: adminId,
        firmId: id,
        input: essentials({
          discountTitle: "25% OFF",
          discountCode: "PFL25",
          discountDescription: "25% off all evaluation accounts.",
          discountPercent: "25",
        }),
      });
      await publishFirm(db, { adminUserId: adminId, firmId: id });

      // THE POINT: a second discount is an edit, not a duplicate offer.
      const rows = await db
        .select()
        .from(offers)
        .where(eq(offers.propFirmId, id));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.title).toBe("25% OFF");
      expect(rows[0]?.code).toBe("PFL25");
      expect(rows[0]?.description).toBe("25% off all evaluation accounts.");
    });

    it("stores no offer at all when every discount field is blank", async () => {
      const { id } = await newFirm();
      await saveFirmEssentials(db, {
        adminUserId: adminId,
        firmId: id,
        input: essentials({ tagline: "Just a tagline" }),
      });
      await publishFirm(db, { adminUserId: adminId, firmId: id });

      expect(
        await db.select().from(offers).where(eq(offers.propFirmId, id)),
      ).toHaveLength(0);
    });

    it("hides an expired discount from the public view", async () => {
      const { id } = await newFirm();
      await saveFirmEssentials(db, {
        adminUserId: adminId,
        firmId: id,
        input: essentials({
          discountTitle: "Expired offer",
          discountCode: "OLD",
          discountEndsAt: "2020-01-01T00:00",
        }),
      });
      await publishFirm(db, { adminUserId: adminId, firmId: id });

      const view = await getPublishedFirmView(db, "example-firm-a");
      expect(view?.offers).toHaveLength(0);
    });
  });

  /* ------------------------------------------------------- announcements */

  describe("announcements", () => {
    it("stages, publishes and shows newest first", async () => {
      const { id } = await newFirm();

      for (const [title, date] of [
        ["Older example announcement", "2026-01-01T00:00:00.000Z"],
        ["Newer example announcement", "2026-06-01T00:00:00.000Z"],
      ] as const) {
        await stageChildOp(db, {
          adminUserId: adminId,
          firmId: id,
          collection: "announcements",
          permission: "firm:edit",
          op: { _op: "create", title, announcedAt: date, isActive: true },
        });
        await publishFirm(db, { adminUserId: adminId, firmId: id });
      }

      const view = await getPublishedFirmView(db, "example-firm-a");
      expect(view?.announcements.map((a) => a.title)).toEqual([
        "Newer example announcement",
        "Older example announcement",
      ]);
    });

    it("keeps an inactive announcement out of the public view", async () => {
      const { id } = await newFirm();
      await stageChildOp(db, {
        adminUserId: adminId,
        firmId: id,
        collection: "announcements",
        permission: "firm:edit",
        op: {
          _op: "create",
          title: "Hidden example announcement",
          announcedAt: "2026-06-01T00:00:00.000Z",
          isActive: false,
        },
      });
      await publishFirm(db, { adminUserId: adminId, firmId: id });

      expect(await db.select().from(firmAnnouncements)).toHaveLength(1);
      const view = await getPublishedFirmView(db, "example-firm-a");
      expect(view?.announcements).toHaveLength(0);
    });
  });

  /* ---------------------------------------------------------------- FAQs */

  describe("FAQs", () => {
    it("publishes in display order and can be edited", async () => {
      const { id } = await newFirm();

      for (const [question, order] of [
        ["Second example question?", 2],
        ["First example question?", 1],
      ] as const) {
        await stageChildOp(db, {
          adminUserId: adminId,
          firmId: id,
          collection: "faqs",
          permission: "firm:edit",
          op: {
            _op: "create",
            question,
            answer: "An example answer.",
            displayOrder: order,
            isActive: true,
          },
        });
        await publishFirm(db, { adminUserId: adminId, firmId: id });
      }

      const view = await getPublishedFirmView(db, "example-firm-a");
      expect(view?.faqs.map((f) => f.question)).toEqual([
        "First example question?",
        "Second example question?",
      ]);

      const children = await getAdminFirmChildren(db, id);
      const first = children.faqs.find((f) => f.displayOrder === 1)!;
      await stageChildOp(db, {
        adminUserId: adminId,
        firmId: id,
        collection: "faqs",
        permission: "firm:edit",
        op: { _op: "update", id: first.id, answer: "A corrected answer." },
      });
      await publishFirm(db, { adminUserId: adminId, firmId: id });

      const updated = await getPublishedFirmView(db, "example-firm-a");
      expect(updated?.faqs[0]?.answer).toBe("A corrected answer.");
    });

    it("refuses an FAQ with no answer", async () => {
      const { id } = await newFirm();
      await expect(
        stageChildOp(db, {
          adminUserId: adminId,
          firmId: id,
          collection: "faqs",
          permission: "firm:edit",
          op: { _op: "create", question: "A question with no answer?" },
        }),
      ).rejects.toThrow();
      expect(await db.select().from(firmFaqs)).toHaveLength(0);
    });
  });

  /* -------------------------------------------------------- image checks */

  describe("logo validation", () => {
    /** A minimal but structurally real 32x32 PNG header. */
    function pngBytes(width = 32, height = 32): Uint8Array {
      const bytes = new Uint8Array(64);
      bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
      bytes.set([0, 0, 0, 13], 8);
      bytes.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR
      const be = (n: number) => [
        (n >>> 24) & 255,
        (n >>> 16) & 255,
        (n >>> 8) & 255,
        n & 255,
      ];
      bytes.set(be(width), 16);
      bytes.set(be(height), 20);
      return bytes;
    }

    it("reads the format and dimensions from the bytes", () => {
      expect(inspectImage(pngBytes(64, 48))).toEqual({
        mimeType: "image/png",
        width: 64,
        height: 48,
      });
    });

    it("rejects a file that is not an image, whatever it claims", () => {
      const svg = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"/>',
      );
      expect(() => inspectImage(svg)).toThrow(ImageError);
      expect(() => inspectImage(new Uint8Array())).toThrow(/empty/i);
    });

    it("rejects an oversized file", () => {
      const huge = new Uint8Array(3 * 1024 * 1024);
      huge.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
      expect(() => inspectImage(huge)).toThrow(/larger than/i);
    });

    it("rejects an image too small to be a logo", () => {
      expect(() => inspectImage(pngBytes(8, 8))).toThrow(/too small/i);
    });

    it("has no media row until something is genuinely stored", async () => {
      // Storage is unconfigured in tests, so nothing can be uploaded — and
      // nothing fabricates a row or a local path.
      expect(await db.select().from(media)).toHaveLength(0);
    });
  });
});
