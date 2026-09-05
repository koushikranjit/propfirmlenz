import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetTestDb, type TestDb } from "@/lib/db/testing";
import {
  adminUsers,
  blockchainNetworks,
  blockchainTransactions,
  payoutCandidates,
  propFirms,
  trackedWallets,
  verifiedPayouts,
} from "@/lib/db/schema";
import {
  getFirmPayoutProfile,
  listPayoutFirmRanking,
  listPayoutMonths,
} from "./payout-tracker";

/**
 * THE PAYOUT TRACKER QUERIES — docs/PAYOUTS.md §9.
 *
 * Against a REAL PostgreSQL, because the properties under test are database
 * ones: exact `numeric(78,0)` arithmetic that a JavaScript number would
 * corrupt, and the join that keeps unpublished firms out of a public figure.
 *
 * Fixtures are obviously fake ("Example Firm A"). No real firm's name and no
 * real payout amount appears here (CLAUDE.md §3 `[LOCKED]`).
 */

describe("payout tracker", () => {
  let db: TestDb;
  let client: PGlite;
  let close: () => Promise<void>;
  let networkId: string;
  let txSeq = 0;
  let walletSeq = 0;

  beforeAll(async () => {
    ({ db, client, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await resetTestDb(client);
    txSeq = 0;
    walletSeq = 0;

    const [network] = await db
      .insert(blockchainNetworks)
      .values({
        key: "example-chain",
        name: "Example Chain",
        nativeSymbol: "EXM",
        explorerTxTemplate: "https://explorer.example.test/tx/{hash}",
        provider: "fixture",
        confirmationsRequired: 12,
        isActive: true,
      })
      .returning({ id: blockchainNetworks.id });
    networkId = network!.id;
  });

  const makeFirm = async (
    name: string,
    status: "published" | "draft" = "published",
  ) => {
    const [firm] = await db
      .insert(propFirms)
      .values({
        slug: name.toLowerCase().replace(/\s+/g, "-"),
        name,
        description: "A placeholder record used only by the test suite.",
        status,
        ...(status === "published" ? { publishedAt: new Date() } : {}),
      })
      .returning({ id: propFirms.id });
    return firm!.id;
  };

  const makeWallet = async (firmId: string) => {
    // Its own counter. UUIDv7 values minted in the same millisecond share a
    // prefix, so deriving the address from the firm id collided.
    walletSeq += 1;
    const address = `twalletexampleaddress${String(walletSeq).padStart(4, "0")}`;

    const [admin] = await db
      .insert(adminUsers)
      .values({
        email: `wallet-owner-${walletSeq}@example.test`,
        passwordHash: "x",
        fullName: "Example Admin",
        status: "active",
      })
      .returning({ id: adminUsers.id });

    const [wallet] = await db
      .insert(trackedWallets)
      .values({
        propFirmId: firmId,
        networkId,
        address,
        addressNormalized: address,
        purpose: "trader_payouts",
        isActive: true,
        createdByAdminId: admin!.id,
      })
      .returning({ id: trackedWallets.id });
    return wallet!.id;
  };

  /** A verified payout, with the raw transaction and candidate behind it. */
  const payout = async (opts: {
    firmId: string;
    walletId: string;
    amountBaseUnits: string;
    symbol?: string;
    decimals?: number;
    at: string;
  }) => {
    txSeq += 1;
    const hash = `0xexamplehash${String(txSeq).padStart(4, "0")}`;
    const when = new Date(opts.at);

    const [tx] = await db
      .insert(blockchainTransactions)
      .values({
        networkId,
        txHash: hash,
        transferIndex: 0,
        blockTimestamp: when,
        fromAddress: "twalletexample",
        toAddress: `trecipient${txSeq}`,
        assetSymbol: opts.symbol ?? "USDT",
        amountBaseUnits: opts.amountBaseUnits,
        decimals: opts.decimals ?? 6,
        status: "success",
        provider: "fixture",
      })
      .returning({ id: blockchainTransactions.id });

    const [candidate] = await db
      .insert(payoutCandidates)
      .values({
        transactionId: tx!.id,
        propFirmId: opts.firmId,
        trackedWalletId: opts.walletId,
        status: "verified",
      })
      .returning({ id: payoutCandidates.id });

    await db.insert(verifiedPayouts).values({
      propFirmId: opts.firmId,
      networkId,
      candidateId: candidate!.id,
      transactionId: tx!.id,
      sourceWalletId: opts.walletId,
      txHash: hash,
      transactionTimestamp: when,
      fromAddress: "twalletexample",
      toAddress: `trecipient${txSeq}`,
      assetSymbol: opts.symbol ?? "USDT",
      amountBaseUnits: opts.amountBaseUnits,
      decimals: opts.decimals ?? 6,
      explorerUrl: `https://explorer.example.test/tx/${hash}`,
    });
  };

  /* ------------------------------------------------------------- ranking */

  describe("the ranking", () => {
    it("ranks by verified count, not by volume", async () => {
      // The point of the rule: one big transfer must not outrank many small
      // ones on a figure that is already a floor.
      const few = await makeFirm("Example Firm A");
      const many = await makeFirm("Example Firm B");
      const fewWallet = await makeWallet(few);
      const manyWallet = await makeWallet(many);

      await payout({
        firmId: few,
        walletId: fewWallet,
        amountBaseUnits: "900000000",
        at: "2026-09-01T00:00:00Z",
      });
      for (let i = 0; i < 3; i += 1) {
        await payout({
          firmId: many,
          walletId: manyWallet,
          amountBaseUnits: "1000000",
          at: "2026-09-02T00:00:00Z",
        });
      }

      const rows = await listPayoutFirmRanking(db, { window: "all" });
      expect(rows.map((r) => r.firmName)).toEqual([
        "Example Firm B",
        "Example Firm A",
      ]);
      expect(rows[0]?.count).toBe(3);
    });

    it("never adds two assets into one figure", async () => {
      const firmId = await makeFirm("Example Firm A");
      const walletId = await makeWallet(firmId);
      await payout({
        firmId,
        walletId,
        amountBaseUnits: "1000000",
        symbol: "USDT",
        at: "2026-09-01T00:00:00Z",
      });
      await payout({
        firmId,
        walletId,
        amountBaseUnits: "2000000",
        symbol: "USDC",
        at: "2026-09-02T00:00:00Z",
      });

      const [row] = await listPayoutFirmRanking(db, { window: "all" });
      expect(row?.count).toBe(2);
      // Two assets, two figures. A combined "3.0" would assert a rate nobody
      // recorded (docs/PAYOUTS.md §8 `[LOCKED]`).
      expect(row?.tokens).toHaveLength(2);
      expect(row?.tokens.map((t) => t.symbol).sort()).toEqual([
        "USDC",
        "USDT",
      ]);
    });

    it("keeps amounts exact past the precision of a JS number", async () => {
      const firmId = await makeFirm("Example Firm A");
      const walletId = await makeWallet(firmId);
      // Two 18-decimal amounts whose sum a float cannot represent.
      await payout({
        firmId,
        walletId,
        amountBaseUnits: "1234567890123456789",
        decimals: 18,
        symbol: "EXM",
        at: "2026-09-01T00:00:00Z",
      });
      await payout({
        firmId,
        walletId,
        amountBaseUnits: "1000000000000000001",
        decimals: 18,
        symbol: "EXM",
        at: "2026-09-02T00:00:00Z",
      });

      const [row] = await listPayoutFirmRanking(db, { window: "all" });
      const token = row?.tokens[0];
      expect(token?.totalBaseUnits).toBe("2234567890123456790");
      expect(token?.largestBaseUnits).toBe("1234567890123456789");
      // The mean, computed in exact integers rather than through a double.
      expect(token?.averageBaseUnits).toBe("1117283945061728395");
    });

    it("excludes unpublished firms from every figure", async () => {
      const draft = await makeFirm("Example Firm A", "draft");
      const walletId = await makeWallet(draft);
      await payout({
        firmId: draft,
        walletId,
        amountBaseUnits: "1000000",
        at: "2026-09-01T00:00:00Z",
      });

      expect(await listPayoutFirmRanking(db, { window: "all" })).toHaveLength(
        0,
      );
      // And the firm's own page refuses to resolve it at all.
      expect(
        await getFirmPayoutProfile(db, { slug: "example-firm-a" }),
      ).toBeNull();
    });

    it("respects the window", async () => {
      const firmId = await makeFirm("Example Firm A");
      const walletId = await makeWallet(firmId);
      const now = new Date("2026-09-10T00:00:00Z");

      await payout({
        firmId,
        walletId,
        amountBaseUnits: "1000000",
        at: "2026-09-09T12:00:00Z",
      });
      await payout({
        firmId,
        walletId,
        amountBaseUnits: "1000000",
        at: "2026-01-01T00:00:00Z",
      });

      const recent = await listPayoutFirmRanking(db, { window: "7d" }, now);
      expect(recent[0]?.count).toBe(1);
      const all = await listPayoutFirmRanking(db, { window: "all" }, now);
      expect(all[0]?.count).toBe(2);
    });

    it("filters by firm name without matching anything else", async () => {
      const a = await makeFirm("Example Firm A");
      const b = await makeFirm("Example Firm B");
      await payout({
        firmId: a,
        walletId: await makeWallet(a),
        amountBaseUnits: "1000000",
        at: "2026-09-01T00:00:00Z",
      });
      await payout({
        firmId: b,
        walletId: await makeWallet(b),
        amountBaseUnits: "1000000",
        at: "2026-09-01T00:00:00Z",
      });

      const rows = await listPayoutFirmRanking(db, {
        window: "all",
        query: "firm b",
      });
      expect(rows.map((r) => r.firmName)).toEqual(["Example Firm B"]);

      // A wildcard typed by a visitor is matched literally, not executed.
      expect(
        await listPayoutFirmRanking(db, { window: "all", query: "'; drop--" }),
      ).toHaveLength(0);
    });
  });

  /* -------------------------------------------------------------- months */

  describe("the monthly series", () => {
    it("counts payouts per month and fills quiet months with a real zero", async () => {
      const firmId = await makeFirm("Example Firm A");
      const walletId = await makeWallet(firmId);
      await payout({
        firmId,
        walletId,
        amountBaseUnits: "1000000",
        at: "2026-06-15T00:00:00Z",
      });
      await payout({
        firmId,
        walletId,
        amountBaseUnits: "1000000",
        at: "2026-08-02T00:00:00Z",
      });
      await payout({
        firmId,
        walletId,
        amountBaseUnits: "1000000",
        at: "2026-08-20T00:00:00Z",
      });

      const months = await listPayoutMonths(db, { firmId });
      expect(months.map((m) => m.month)).toEqual([
        "2026-06",
        "2026-07",
        "2026-08",
      ]);
      // July is a genuine zero, not a gap to be smoothed over.
      expect(months.map((m) => m.count)).toEqual([1, 0, 2]);
      expect(months.map((m) => m.cumulative)).toEqual([1, 1, 3]);
    });

    it("is empty when nothing has been verified", async () => {
      const firmId = await makeFirm("Example Firm A");
      expect(await listPayoutMonths(db, { firmId })).toEqual([]);
    });
  });

  /* ------------------------------------------------------------- profile */

  describe("one firm's profile", () => {
    it("reports counts, extremes and networks for the window", async () => {
      const firmId = await makeFirm("Example Firm A");
      const walletId = await makeWallet(firmId);
      await payout({
        firmId,
        walletId,
        amountBaseUnits: "1000000",
        at: "2026-09-01T00:00:00Z",
      });
      await payout({
        firmId,
        walletId,
        amountBaseUnits: "5000000",
        at: "2026-09-03T00:00:00Z",
      });

      const profile = await getFirmPayoutProfile(db, {
        slug: "example-firm-a",
        window: "all",
      });

      expect(profile?.count).toBe(2);
      expect(profile?.firstAt).toContain("2026-09-01");
      expect(profile?.latestAt).toContain("2026-09-03");
      expect(profile?.tokens[0]?.largestBaseUnits).toBe("5000000");
      expect(profile?.tokens[0]?.averageBaseUnits).toBe("3000000");
      expect(profile?.networks).toEqual([{ name: "Example Chain", count: 2 }]);
    });

    it("resolves a published firm with no payouts, reporting zero", async () => {
      await makeFirm("Example Firm A");
      const profile = await getFirmPayoutProfile(db, {
        slug: "example-firm-a",
      });

      // The page renders an honest empty state rather than 404ing a real firm.
      expect(profile?.count).toBe(0);
      expect(profile?.tokens).toEqual([]);
      expect(profile?.firstAt).toBeNull();
    });

    it("is null for a slug that does not exist", async () => {
      expect(
        await getFirmPayoutProfile(db, { slug: "no-such-firm" }),
      ).toBeNull();
    });
  });
});
