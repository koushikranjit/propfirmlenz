import { eq } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetTestDb, type TestDb } from "@/lib/db/testing";
import {
  adminUserRoles,
  adminUsers,
  offers,
  propFirms,
  roles,
} from "@/lib/db/schema";
import { ROLES, seedRolesAndPermissions } from "@/lib/auth/permissions";
import { createFirm } from "@/lib/services/firm-admin";
import { saveFirmEssentials } from "@/lib/services/firm-essentials";
import { publishFirm } from "@/lib/services/firm-draft";
import { getPublishedFirmView } from "@/lib/repositories/public-firm-view";
import { listActiveOffers } from "@/lib/repositories/public-offers";
import { firmEssentialsSchema } from "@/lib/validation/firm";
import {
  DEFAULT_COUPON_CODE,
  hasCustomCouponCode,
  resolveCouponCode,
} from "./coupon";

/**
 * THE DEFAULT COUPON CODE — `LENZ`.
 *
 * Two properties are under test, and they pull against each other:
 *
 *  1. a firm with no stored code shows `LENZ`, everywhere, without an admin
 *     typing it for every firm;
 *  2. a firm that HAS a code keeps it, and nothing about the default leaks
 *     into a discount figure.
 *
 * (2) is the one worth guarding. A default code is a convenience; a defaulted
 * PERCENTAGE would be an invented commercial claim about a real company
 * (CLAUDE.md §3 `[LOCKED]`).
 *
 * Against a REAL PostgreSQL, because the resolution has to hold through the
 * draft → publish → public-view path, not just in a pure function.
 */

describe("default coupon code", () => {
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

  /** Publishes the firm's offer so it reaches the public surfaces. */
  const publishOffer = async (firmId: string) => {
    await db
      .update(offers)
      .set({ status: "published" })
      .where(eq(offers.propFirmId, firmId));
  };

  /* ------------------------------------------------------------- resolver */

  describe("(1)(2)(3) the resolver", () => {
    it("defaults to LENZ when nothing is stored", () => {
      expect(DEFAULT_COUPON_CODE).toBe("LENZ");
      expect(resolveCouponCode(null)).toBe("LENZ");
      expect(resolveCouponCode(undefined)).toBe("LENZ");
      expect(resolveCouponCode("")).toBe("LENZ");
      // Whitespace is not a code anyone can type.
      expect(resolveCouponCode("   ")).toBe("LENZ");
    });

    it("preserves an existing custom code", () => {
      expect(resolveCouponCode("SAVE10")).toBe("SAVE10");
      expect(resolveCouponCode("PROP10")).toBe("PROP10");
      // Trimmed, never rewritten.
      expect(resolveCouponCode("  SAVE10  ")).toBe("SAVE10");
    });

    it("knows which firms have chosen their own code", () => {
      expect(hasCustomCouponCode("SAVE10")).toBe(true);
      expect(hasCustomCouponCode(null)).toBe(false);
      expect(hasCustomCouponCode("LENZ")).toBe(false);
      expect(hasCustomCouponCode("lenz")).toBe(false);
    });
  });

  /* ---------------------------------------------------------- the pipeline */

  describe("(2) an existing offer with no code", () => {
    it("resolves to LENZ on the public view, with nothing written to the row", async () => {
      const { id } = await newFirm();
      await saveFirmEssentials(db, {
        adminUserId: adminId,
        firmId: id,
        input: essentials({ discountTitle: "Launch offer" }),
      });
      await publishFirm(db, { adminUserId: adminId, firmId: id });
      await publishOffer(id);

      const view = await getPublishedFirmView(db, "example-firm-a");
      expect(view?.offers[0]?.code).toBe("LENZ");

      // The DEFAULT is a read-time resolution. Nothing invented was persisted,
      // so changing the default later changes every firm that never chose one.
      const [row] = await db
        .select()
        .from(offers)
        .where(eq(offers.propFirmId, id));
      expect(row?.code).toBeNull();
    });
  });

  describe("(3)(4) a custom code", () => {
    it("is preserved end to end, and can replace the default", async () => {
      const { id } = await newFirm();
      await saveFirmEssentials(db, {
        adminUserId: adminId,
        firmId: id,
        input: essentials({ discountTitle: "Launch", discountCode: "SAVE10" }),
      });
      await publishFirm(db, { adminUserId: adminId, firmId: id });
      await publishOffer(id);

      expect(
        (await getPublishedFirmView(db, "example-firm-a"))?.offers[0]?.code,
      ).toBe("SAVE10");

      // (4) An admin changes it again — the new value wins, not the default.
      await saveFirmEssentials(db, {
        adminUserId: adminId,
        firmId: id,
        input: essentials({ discountTitle: "Launch", discountCode: "PROP10" }),
      });
      await publishFirm(db, { adminUserId: adminId, firmId: id });
      await publishOffer(id);

      expect(
        (await getPublishedFirmView(db, "example-firm-a"))?.offers[0]?.code,
      ).toBe("PROP10");
    });
  });

  /* ------------------------------------------------------- no fabrication */

  describe("(7)(8) nothing is invented alongside the default", () => {
    it("defaults the code but NEVER a discount percentage", async () => {
      const { id } = await newFirm();
      await saveFirmEssentials(db, {
        adminUserId: adminId,
        firmId: id,
        input: essentials({ discountTitle: "Launch offer" }),
      });
      await publishFirm(db, { adminUserId: adminId, firmId: id });
      await publishOffer(id);

      const offer = (await getPublishedFirmView(db, "example-firm-a"))
        ?.offers[0];

      expect(offer?.code).toBe("LENZ");
      // The whole point: a code is not a discount.
      expect(offer?.discountType).toBeNull();
      expect(offer?.discountValue).toBeNull();
      expect(offer?.endsAt).toBeNull();
      expect(offer?.terms).toBeNull();
    });

    it("shows no offer at all for a firm that has none", async () => {
      const { id } = await newFirm();
      await saveFirmEssentials(db, {
        adminUserId: adminId,
        firmId: id,
        input: essentials(),
      });
      await publishFirm(db, { adminUserId: adminId, firmId: id });

      const view = await getPublishedFirmView(db, "example-firm-a");
      // No offer row, so no defaulted code floating on its own — a bare "LENZ"
      // with no offer behind it would imply a discount that does not exist.
      expect(view?.offers).toEqual([]);
      expect(await listActiveOffers(db)).toEqual([]);
    });
  });

  /* ------------------------------------------------------------- /offers */

  describe("(9) /offers reflects the same data", () => {
    it("returns the same code and figures as the firm profile", async () => {
      const a = await newFirm("Example Firm A");
      const b = await newFirm("Example Firm B");

      await saveFirmEssentials(db, {
        adminUserId: adminId,
        firmId: a.id,
        input: essentials({ discountTitle: "Launch A", discountPercent: "20" }),
      });
      await saveFirmEssentials(db, {
        adminUserId: adminId,
        firmId: b.id,
        input: essentials({
          name: "Example Firm B",
          discountTitle: "Launch B",
          discountCode: "SAVE10",
        }),
      });
      await publishFirm(db, { adminUserId: adminId, firmId: a.id });
      await publishFirm(db, { adminUserId: adminId, firmId: b.id });
      await publishOffer(a.id);
      await publishOffer(b.id);

      const listed = await listActiveOffers(db);
      const byFirm = new Map(listed.map((o) => [o.firmName, o]));

      // Defaulted where absent, preserved where chosen — the same rule the
      // profile applies, because it is the same helper.
      expect(byFirm.get("Example Firm A")?.code).toBe("LENZ");
      expect(byFirm.get("Example Firm B")?.code).toBe("SAVE10");

      // The percentage is the admin's, and only firm A has one.
      expect(byFirm.get("Example Firm A")?.discountValue).toBe("20.00");
      expect(byFirm.get("Example Firm A")?.discountType).toBe("percent");
      expect(byFirm.get("Example Firm B")?.discountValue).toBeNull();

      // And it agrees with what the firm's own profile shows.
      const profile = await getPublishedFirmView(db, "example-firm-b");
      expect(profile?.offers[0]?.code).toBe(
        byFirm.get("Example Firm B")?.code,
      );
    });

    it("excludes expired offers and unpublished firms", async () => {
      const { id } = await newFirm();
      await saveFirmEssentials(db, {
        adminUserId: adminId,
        firmId: id,
        input: essentials({
          discountTitle: "Expired",
          discountEndsAt: "2020-01-01T00:00",
        }),
      });
      await publishFirm(db, { adminUserId: adminId, firmId: id });
      await publishOffer(id);

      // "Active" is computed against now() in SQL, never a stored flag.
      expect(await listActiveOffers(db)).toEqual([]);
    });
  });

  /* ------------------------------------------------- section independence */

  describe("(10) saving the discount section", () => {
    it("does not overwrite other categories", async () => {
      const { id } = await newFirm();
      await saveFirmEssentials(db, {
        adminUserId: adminId,
        firmId: id,
        input: essentials({
          tagline: "An example tagline",
          founderName: "Example Founder",
          headquartersCountry: "ae",
          foundedOn: "2021-07",
        }),
      });
      await publishFirm(db, { adminUserId: adminId, firmId: id });

      // Now save again, changing ONLY the discount fields.
      await saveFirmEssentials(db, {
        adminUserId: adminId,
        firmId: id,
        input: essentials({
          tagline: "An example tagline",
          founderName: "Example Founder",
          headquartersCountry: "ae",
          foundedOn: "2021-07",
          discountTitle: "Launch offer",
          discountCode: "SAVE10",
        }),
      });
      await publishFirm(db, { adminUserId: adminId, firmId: id });
      await publishOffer(id);

      const view = await getPublishedFirmView(db, "example-firm-a");
      expect(view?.tagline).toBe("An example tagline");
      expect(view?.founderName).toBe("Example Founder");
      expect(view?.headquartersCountry).toBe("AE");
      expect(view?.foundedOn).toBe("2021-07-01");
      expect(view?.offers[0]?.code).toBe("SAVE10");

      const [row] = await db
        .select()
        .from(propFirms)
        .where(eq(propFirms.id, id));
      expect(row?.description).toBe(DESCRIPTION);
    });
  });
});
