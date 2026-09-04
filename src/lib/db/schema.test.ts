import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, type TestDb } from "./testing";
import * as schema from "./schema";

/**
 * (1) Database schema imports / configuration, and (10) soft-delete behaviour.
 *
 * Real PostgreSQL (PGlite), running the real migration — not a mock.
 */
describe("schema", () => {
  let db: TestDb;
  let client: PGlite;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, client, close } = await createTestDb());
  });
  afterAll(async () => {
    await close();
  });

  it("exports every Phase 1 table documented in DATABASE.md", () => {
    const expected = [
      "users",
      "profiles",
      "propFirms",
      "challenges",
      "rules",
      "ruleValues",
      "platforms",
      "firmPlatforms",
      "instruments",
      "firmInstruments",
      "offers",
      "affiliateLinks",
      "affiliateClicks",
      "seoMetadata",
      "media",
      "mediaUsages",
      "adminUsers",
      "adminSessions",
      "roles",
      "permissions",
      "rolePermissions",
      "adminUserRoles",
      "entityVersions",
      "redirects",
      "internalNotes",
      "auditLogs",
    ];
    for (const name of expected) {
      expect(schema, `missing table export: ${name}`).toHaveProperty(name);
    }
  });

  it("creates every documented table in PostgreSQL", async () => {
    const r = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema='public'`,
    );
    const names = r.rows.map((x) => x.table_name).sort();

    // 23 enumerated entities plus the 3 junction/EAV tables that DATABASE.md
    // §5.4–5.6 specifies as part of the rules/platforms/instruments design,
    // plus the 6 payout-intelligence tables of docs/PAYOUTS.md §2, plus the
    // 2 firm content tables (announcements, FAQs).
    expect(names).toEqual([
      "admin_sessions",
      "admin_user_roles",
      "admin_users",
      "affiliate_clicks",
      "affiliate_links",
      "audit_logs",
      "blockchain_networks",
      "blockchain_transactions",
      "challenges",
      "entity_versions",
      "firm_announcements",
      "firm_faqs",
      "firm_instruments",
      "firm_platforms",
      "instruments",
      "internal_notes",
      "media",
      "media_usages",
      "offers",
      "payout_candidates",
      "payout_verification_events",
      "permissions",
      "platforms",
      "profiles",
      "prop_firms",
      "redirects",
      "role_permissions",
      "roles",
      "rule_values",
      "rules",
      "seo_metadata",
      "tracked_wallets",
      "users",
      "verified_payouts",
    ]);
  });

  it("enables the citext and pg_trgm extensions", async () => {
    const r = await client.query<{ extname: string }>(
      `select extname from pg_extension`,
    );
    const names = r.rows.map((x) => x.extname);
    expect(names).toContain("citext");
    expect(names).toContain("pg_trgm");
  });

  it("applies CHECK constraints from the schema", async () => {
    const r = await client.query<{ n: number }>(
      `select count(*)::int n from pg_constraint where contype='c'`,
    );
    expect(r.rows[0]!.n).toBeGreaterThan(50);
  });

  it("uses UUIDv7 for generated primary keys", async () => {
    const [row] = await db
      .insert(schema.propFirms)
      .values({ slug: "example-firm-a", name: "Example Firm A" })
      .returning({ id: schema.propFirms.id });

    // UUIDv7 sets version nibble 7 at position 14.
    expect(row!.id[14]).toBe("7");
  });

  it("stores money as numeric with its own source currency, never converted", async () => {
    const cols = await client.query<{
      column_name: string;
      data_type: string;
    }>(
      `select column_name, data_type from information_schema.columns
       where table_name='challenges' and column_name in
       ('account_size','price','account_currency','price_currency')`,
    );
    const byName = new Map(cols.rows.map((c) => [c.column_name, c.data_type]));
    expect(byName.get("account_size")).toBe("numeric");
    expect(byName.get("price")).toBe("numeric");
    expect(byName.get("account_currency")).toBe("character");

    // No stored converted-money column exists anywhere. [LOCKED]
    const converted = await client.query<{ n: number }>(
      `select count(*)::int n from information_schema.columns
       where table_schema='public' and (column_name like '%converted%' or column_name like '%_usd')`,
    );
    expect(converted.rows[0]!.n).toBe(0);
  });

  it("soft delete frees the slug for reuse via the partial unique index", async () => {
    const slug = "soft-delete-probe";
    const [first] = await db
      .insert(schema.propFirms)
      .values({ slug, name: "Probe One" })
      .returning({ id: schema.propFirms.id });

    // A second live row with the same slug must be rejected.
    await expect(
      db.insert(schema.propFirms).values({ slug, name: "Probe Two" }),
    ).rejects.toThrow();

    // After soft delete the slug is free again.
    await client.query(
      `update prop_firms set deleted_at = now() where id = $1`,
      [first!.id],
    );
    await expect(
      db.insert(schema.propFirms).values({ slug, name: "Probe Two" }),
    ).resolves.toBeDefined();
  });

  it("rejects an amount stored without its source currency", async () => {
    const [firm] = await db
      .insert(schema.propFirms)
      .values({ slug: "currency-pairing-probe", name: "Probe" })
      .returning({ id: schema.propFirms.id });

    await expect(
      client.query(
        `insert into challenges (id, prop_firm_id, name, slug, challenge_type, account_size, account_currency, price)
         values (gen_random_uuid(), $1, 'X', 'x', 'one_step', 100000, 'USD', 499)`,
        [firm!.id],
      ),
    ).rejects.toThrow(/challenges_price_pairing_ck/);
  });

  it("blocks UPDATE and DELETE on append-only tables", async () => {
    await client.query(
      `insert into audit_logs (actor_type, action) values ('system','test.event')`,
    );
    await expect(
      client.query(`update audit_logs set action='tampered'`),
    ).rejects.toThrow(/append-only/);
    await expect(client.query(`delete from audit_logs`)).rejects.toThrow(
      /append-only/,
    );
  });
});
