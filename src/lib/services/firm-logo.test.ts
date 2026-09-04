import { eq, isNull } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetTestDb, type TestDb } from "@/lib/db/testing";
import {
  adminUserRoles,
  adminUsers,
  auditLogs,
  media,
  mediaUsages,
  propFirms,
  roles,
} from "@/lib/db/schema";
import {
  AuthorizationError,
  ROLES,
  seedRolesAndPermissions,
} from "@/lib/auth/permissions";
import type { MediaStorage, StoredObject } from "@/lib/media/storage";
import { ImageError, MAX_IMAGE_BYTES, inspectImage } from "@/lib/media/image";
import { LogoError, removeFirmLogo, uploadFirmLogo } from "./firm-logo";
import { materializeDraft, publishFirm } from "./firm-draft";
import { createFirm } from "./firm-admin";
import { getPublishedFirmView } from "@/lib/repositories/public-firm-view";

/**
 * FIRM LOGO UPLOAD — docs/ADMIN.md §14.
 *
 * Two halves. The format checks are pure and run against crafted BYTES,
 * because "is this really a PNG?" is the question the browser cannot be
 * trusted to answer. The rest runs against real PostgreSQL, because what
 * matters is that an upload reaches the draft and stops there until publish.
 *
 * The storage below is a TEST FIXTURE. Production ships no fake adapter —
 * `uploadFirmLogo` takes one only so this file can supply it, the same seam
 * `scanWallet` uses for blockchain providers.
 */

/** Records what it was asked to store. Never touches a network. */
class FakeStorage implements MediaStorage {
  readonly provider = "r2" as const;
  readonly puts: { key: string; contentType: string; bytes: number }[] = [];
  readonly deleted: string[] = [];

  constructor(private readonly failWith?: Error) {}

  async put(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<StoredObject> {
    if (this.failWith) throw this.failWith;
    this.puts.push({
      key: input.key,
      contentType: input.contentType,
      bytes: input.body.length,
    });
    return {
      storageKey: input.key,
      publicUrl: `https://cdn.example.test/${input.key}`,
    };
  }

  async delete(key: string): Promise<void> {
    this.deleted.push(key);
  }
}

/* ------------------------------------------------------------- fixtures */

const be = (n: number) => [
  (n >>> 24) & 255,
  (n >>> 16) & 255,
  (n >>> 8) & 255,
  n & 255,
];

/** A structurally real PNG header. `seed` varies the bytes for dedup tests. */
function png(width = 64, height = 64, seed = 0): Uint8Array {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13], 8);
  b.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR
  b.set(be(width), 16);
  b.set(be(height), 20);
  b[40] = seed;
  return b;
}

function jpeg(width = 48, height = 32): Uint8Array {
  const b = new Uint8Array(32);
  b.set([0xff, 0xd8], 0); // SOI
  b.set([0xff, 0xc0], 2); // SOF0
  b.set([0x00, 0x11], 4); // segment length
  b[6] = 8; // precision
  b.set([(height >> 8) & 255, height & 255], 7);
  b.set([(width >> 8) & 255, width & 255], 9);
  return b;
}

/** Lossless WebP: RIFF / WEBP / VP8L, 14-bit dimensions minus one. */
function webp(width = 40, height = 24): Uint8Array {
  const b = new Uint8Array(40);
  b.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  b.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  b.set([0x56, 0x50, 0x38, 0x4c], 12); // VP8L
  b[20] = 0x2f;
  const bits = (width - 1) | ((height - 1) << 14);
  b.set(
    [bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >> 24) & 255],
    21,
  );
  return b;
}

const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0]);
const PDF = new TextEncoder().encode("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n");

/* ------------------------------------------------- format checks (pure) */

describe("logo format validation", () => {
  it("accepts PNG, JPEG and WebP, reading dimensions from the header", () => {
    expect(inspectImage(png(64, 48))).toEqual({
      mimeType: "image/png",
      width: 64,
      height: 48,
    });
    expect(inspectImage(jpeg(48, 32))).toEqual({
      mimeType: "image/jpeg",
      width: 48,
      height: 32,
    });
    expect(inspectImage(webp(40, 24))).toEqual({
      mimeType: "image/webp",
      width: 40,
      height: 24,
    });
  });

  it("refuses SVG — including an SVG wearing a PNG's name", () => {
    // There is no filename here on purpose. The check reads BYTES, so what
    // the file is called and what Content-Type the browser claimed are both
    // irrelevant: an SVG renamed `logo.png` fails identically.
    expect(() => inspectImage(SVG)).toThrow(ImageError);
    expect(() => inspectImage(SVG)).toThrow(/SVG is not accepted/i);
  });

  it("refuses GIF, PDF and arbitrary binary", () => {
    expect(() => inspectImage(GIF)).toThrow(/PNG, JPEG or WebP/i);
    expect(() => inspectImage(PDF)).toThrow(/PNG, JPEG or WebP/i);
    expect(() =>
      inspectImage(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])),
    ).toThrow(ImageError);
  });

  it("refuses a file over 2MB, and an empty one", () => {
    const huge = new Uint8Array(MAX_IMAGE_BYTES + 1);
    huge.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    expect(() => inspectImage(huge)).toThrow(/larger than 2MB/i);
    expect(() => inspectImage(new Uint8Array())).toThrow(/empty/i);
  });

  it("refuses a corrupt image that only starts like a real one", () => {
    // A valid PNG signature with a garbage chunk where IHDR belongs.
    const broken = png();
    broken.set([0x00, 0x00, 0x00, 0x00], 12);
    expect(() => inspectImage(broken)).toThrow(/could not be read/i);
  });
});

/* --------------------------------------------------- the upload pipeline */

describe("firm logo upload", () => {
  let db: TestDb;
  let client: PGlite;
  let close: () => Promise<void>;
  let adminId: string;
  let analystId: string;
  let firmId: string;

  beforeAll(async () => {
    ({ db, client, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  const DESCRIPTION =
    "A placeholder description used only by the test suite, long enough to satisfy the pre-publish check.";

  beforeEach(async () => {
    await resetTestDb(client);
    await seedRolesAndPermissions(db);

    const makeAdmin = async (email: string, role: string) => {
      const [user] = await db
        .insert(adminUsers)
        .values({ email, passwordHash: "x", fullName: email, status: "active" })
        .returning({ id: adminUsers.id });
      const all = await db.select().from(roles);
      await db.insert(adminUserRoles).values({
        adminUserId: user!.id,
        roleId: all.find((r) => r.key === role)!.id,
      });
      return user!.id;
    };

    adminId = await makeAdmin("admin@example.test", ROLES.MASTER_ADMIN);
    analystId = await makeAdmin("analyst@example.test", ROLES.ANALYST);

    const firm = await createFirm(db, {
      adminUserId: adminId,
      input: {
        name: "Example Firm A",
        slug: "example-firm-a",
        description: DESCRIPTION,
      },
    });
    firmId = firm.id;
  });

  const upload = (bytes: Uint8Array, storage: MediaStorage, who = adminId) =>
    uploadFirmLogo(db, {
      adminUserId: who,
      firmId,
      bytes,
      altText: "Example Firm A logo",
      storage,
    });

  /* ------------------------------------------------------------- staging */

  it("stores the object, records the media row, and stages it in the draft", async () => {
    const storage = new FakeStorage();
    const result = await upload(png(), storage);

    expect(storage.puts).toHaveLength(1);
    expect(storage.puts[0]?.contentType).toBe("image/png");

    const [row] = await db.select().from(media);
    expect(row?.mimeType).toBe("image/png");
    expect(row?.width).toBe(64);
    expect(row?.height).toBe(64);
    expect(row?.storageProvider).toBe("r2");
    expect(row?.altText).toBe("Example Firm A logo");
    expect(result.mediaId).toBe(row?.id);

    // Usage recorded, so "what breaks if I delete this?" has an answer.
    const usages = await db.select().from(mediaUsages);
    expect(usages).toHaveLength(1);
    expect(usages[0]).toMatchObject({
      entityType: "prop_firm",
      entityId: firmId,
      field: "logo_media_id",
    });

    // Staged, NOT published.
    const [firm] = await db
      .select()
      .from(propFirms)
      .where(eq(propFirms.id, firmId));
    expect(firm?.draftPayload?.firm?.logoMediaId).toBe(row?.id);
    expect(firm?.logoMediaId).toBeNull();
  });

  it("builds a storage key that cannot escape its prefix", async () => {
    const storage = new FakeStorage();
    await upload(png(), storage);

    const key = storage.puts[0]!.key;
    // Derived server-side from the firm's slug and the checksum — never from
    // a filename the browser supplied.
    expect(key).toMatch(/^firms\/example-firm-a\/logo-[0-9a-f]{16}\.png$/);
    expect(key).not.toContain("..");
    expect(key.startsWith("/")).toBe(false);
  });

  it("writes an audit entry that records no file content", async () => {
    await upload(png(), new FakeStorage());

    const [entry] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "firm.logo_uploaded"));
    expect(entry?.entityId).toBe(firmId);
    expect(entry?.actorAdminId).toBe(adminId);
    // Size and type, never bytes.
    expect(JSON.stringify(entry?.after)).toMatch(/mimeType/);
    expect(JSON.stringify(entry?.after)).not.toMatch(/PNG|IHDR/);
  });

  /* --------------------------------------------------------- deduplication */

  it("reuses the stored object when the same bytes are uploaded again", async () => {
    const storage = new FakeStorage();
    const first = await upload(png(), storage);
    const second = await upload(png(), storage);

    expect(second.mediaId).toBe(first.mediaId);
    expect(await db.select().from(media)).toHaveLength(1);
    // The second upload never reached storage.
    expect(storage.puts).toHaveLength(1);
  });

  it("treats different bytes as a different asset", async () => {
    const storage = new FakeStorage();
    const first = await upload(png(64, 64, 1), storage);
    const second = await upload(png(64, 64, 2), storage);

    expect(second.mediaId).not.toBe(first.mediaId);
    expect(await db.select().from(media)).toHaveLength(2);
    expect(storage.puts).toHaveLength(2);
  });

  /* ------------------------------------------------- preview and publish */

  it("shows the staged logo in preview while the public page keeps the old one", async () => {
    // A published firm with no logo yet.
    await publishFirm(db, { adminUserId: adminId, firmId });
    expect((await getPublishedFirmView(db, "example-firm-a"))?.logo).toBeNull();

    const result = await upload(png(), new FakeStorage());

    // THE POINT: preview reflects the staged upload immediately...
    const preview = await materializeDraft(db, firmId);
    expect(preview.logo).not.toBeNull();
    expect(preview.logo?.url).toContain("cdn.example.test");
    expect(preview.logo?.alt).toBe("Example Firm A logo");
    expect(preview.logo?.width).toBe(64);

    // ...while the public page still shows what was published.
    const live = await getPublishedFirmView(db, "example-firm-a");
    expect(live?.logo).toBeNull();
    expect(JSON.stringify(live)).not.toContain(result.mediaId);
  });

  it("persists the association on publish", async () => {
    const result = await upload(png(), new FakeStorage());
    await publishFirm(db, { adminUserId: adminId, firmId });

    const [firm] = await db
      .select()
      .from(propFirms)
      .where(eq(propFirms.id, firmId));
    expect(firm?.logoMediaId).toBe(result.mediaId);
    expect(firm?.draftPayload).toBeNull();

    const view = await getPublishedFirmView(db, "example-firm-a");
    expect(view?.logo?.url).toContain("cdn.example.test");
    // Dimensions travel with it, so the public page can reserve the space.
    expect(view?.logo?.width).toBe(64);
    expect(view?.logo?.height).toBe(64);
  });

  /* ------------------------------------------------------ replace and remove */

  it("replaces a logo without invalidating the old reference", async () => {
    const storage = new FakeStorage();
    const first = await upload(png(64, 64, 1), storage);
    await publishFirm(db, { adminUserId: adminId, firmId });
    const publishedUrl = (await getPublishedFirmView(db, "example-firm-a"))
      ?.logo?.url;

    const second = await upload(png(64, 64, 2), storage);
    expect(second.mediaId).not.toBe(first.mediaId);

    // Preview shows the NEW asset, not the published one.
    const preview = await materializeDraft(db, firmId);
    expect(preview.logo?.url).toBe(second.publicUrl);
    expect(preview.logo?.url).not.toBe(publishedUrl);

    await publishFirm(db, { adminUserId: adminId, firmId });
    const [firm] = await db
      .select()
      .from(propFirms)
      .where(eq(propFirms.id, firmId));
    expect(firm?.logoMediaId).toBe(second.mediaId);

    // The previous asset is untouched: another firm or an older published
    // version may still reference it. No destructive collection here.
    const rows = await db.select().from(media).where(isNull(media.deletedAt));
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.id === first.mediaId)).toBe(true);
    expect(storage.deleted).toHaveLength(0);
  });

  it("removes the logo through the draft, leaving the asset in place", async () => {
    const result = await upload(png(), new FakeStorage());
    await publishFirm(db, { adminUserId: adminId, firmId });

    await removeFirmLogo(db, { adminUserId: adminId, firmId });

    // Staged removal shows in preview before it is published.
    expect((await materializeDraft(db, firmId)).logo).toBeNull();
    expect(
      (await getPublishedFirmView(db, "example-firm-a"))?.logo,
    ).not.toBeNull();

    await publishFirm(db, { adminUserId: adminId, firmId });
    expect((await getPublishedFirmView(db, "example-firm-a"))?.logo).toBeNull();

    // The media row survives — removal is an editorial decision, not a purge.
    const [asset] = await db
      .select()
      .from(media)
      .where(eq(media.id, result.mediaId));
    expect(asset).toBeDefined();
    expect(asset?.deletedAt).toBeNull();
  });

  /* --------------------------------------------------------- refusals */

  it("refuses an admin without upload permission", async () => {
    const storage = new FakeStorage();
    await expect(upload(png(), storage, analystId)).rejects.toThrow(
      AuthorizationError,
    );
    // Nothing was stored, and nothing was staged.
    expect(storage.puts).toHaveLength(0);
    expect(await db.select().from(media)).toHaveLength(0);
  });

  it("refuses a bad image before it reaches storage", async () => {
    const storage = new FakeStorage();
    await expect(upload(SVG, storage)).rejects.toMatchObject({
      code: "INVALID_IMAGE",
    });
    expect(storage.puts).toHaveLength(0);
    expect(await db.select().from(media)).toHaveLength(0);
  });

  it("reports missing configuration by NAME, never by value", async () => {
    // No storage injected and none configured in the test environment.
    const error = await uploadFirmLogo(db, {
      adminUserId: adminId,
      firmId,
      bytes: png(),
      altText: "",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LogoError);
    const logoError = error as LogoError;
    expect(logoError.code).toBe("NOT_CONFIGURED");
    expect(logoError.missing).toContain("R2_ACCESS_KEY_ID");
    // Names only — the message carries no credential material.
    expect(logoError.message).not.toMatch(/[A-Za-z0-9]{32,}/);
  });

  it("surfaces a storage failure without leaking provider detail", async () => {
    const storage = new FakeStorage(new Error("connect ECONNREFUSED 10.0.0.1"));
    const error = await upload(png(), storage).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LogoError);
    expect((error as LogoError).code).toBe("UPLOAD_FAILED");
    expect((error as LogoError).message).not.toContain("10.0.0.1");
    // Nothing half-written.
    expect(await db.select().from(media)).toHaveLength(0);
  });

  it("refuses to attach a logo to a firm that does not exist", async () => {
    await expect(
      uploadFirmLogo(db, {
        adminUserId: adminId,
        firmId: "01a06c9a-0000-7000-8000-000000000000",
        bytes: png(),
        altText: "",
        storage: new FakeStorage(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
