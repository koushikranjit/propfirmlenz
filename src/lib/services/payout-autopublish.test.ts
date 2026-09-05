import { eq } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetTestDb, type TestDb } from "@/lib/db/testing";
import {
  adminUserRoles,
  adminUsers,
  auditLogs,
  blockchainNetworks,
  blockchainTokens,
  payoutCandidates,
  payoutVerificationEvents,
  propFirms,
  roles,
  trackedWallets,
  verifiedPayouts,
} from "@/lib/db/schema";
import { ROLES, seedRolesAndPermissions } from "@/lib/auth/permissions";
import type {
  BlockchainProvider,
  ChainTransfer,
  TransferPage,
} from "@/lib/blockchain/provider";
import { normaliseAddress } from "@/lib/blockchain/provider";
import { listTrackedWallets } from "@/lib/repositories/admin-payouts";
import { scanWallet, walletsDueForScan } from "./payout-ingestion";
import { autoPublishForWallet } from "./payout-autopublish";
import {
  PayoutAdminError,
  deleteTrackedWallet,
  saveTrackedWallet,
} from "./payout-admin";
import { rejectCandidate } from "./payout-verification";

/**
 * WALLET-LEVEL VERIFICATION — docs/PAYOUTS.md §7.1.
 *
 * The question these tests answer is not "does it publish?" but "what can it
 * publish WITHOUT a person having said so?". Every case below is an attempt to
 * get a payout onto the public figures through a route nobody authorised.
 *
 * Against a REAL PostgreSQL: the guarantees are database ones — the unique
 * index that makes re-publishing a no-op, and the RESTRICT references that
 * make wallet removal necessarily soft.
 *
 * Addresses here are deterministic test values with valid TRON checksums. They
 * are not any real firm's wallet, and no amount below is a real payout
 * (CLAUDE.md §3 `[LOCKED]`).
 */

const USDT_TRON = "tr7nhqjekqxgtci8q8zy4pl8otszgjlj6t";
const WALLET_ADDRESS = "TABr6nZ6hVArcfC9eRXaX8Ze8a6Agcax6K";
const OTHER_ADDRESS = "TWaPyLVo6pyqWH1x3n7Qmw3mA4UvgXPxrU";

class FixtureProvider implements BlockchainProvider {
  readonly key = "fixture";
  private calls = 0;
  constructor(private readonly pages: TransferPage[]) {}
  async listOutgoingTransfers(): Promise<TransferPage> {
    const page = this.pages[this.calls] ?? { transfers: [], nextCursor: null };
    this.calls += 1;
    return page;
  }
}

function transfer(overrides: Partial<ChainTransfer> = {}): ChainTransfer {
  return {
    txHash: "0xexamplehash0001",
    transferIndex: 0,
    blockNumber: 100n,
    blockTimestamp: new Date("2026-09-01T12:00:00.000Z"),
    fromAddress: WALLET_ADDRESS,
    toAddress: "TRecipientExampleAddress00000000001",
    assetSymbol: "USDT",
    assetContract: USDT_TRON,
    amountBaseUnits: "1234560000",
    decimals: 6,
    status: "success",
    confirmations: 50,
    raw: { source: "fixture" },
    ...overrides,
  };
}

describe("wallet-level verification", () => {
  let db: TestDb;
  let client: PGlite;
  let close: () => Promise<void>;
  let adminId: string;
  let firmId: string;
  let tronNetworkId: string;
  let ethNetworkId: string;

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
      roleId: all.find((r) => r.key === ROLES.PUBLISHER)!.id,
    });

    const [firm] = await db
      .insert(propFirms)
      .values({
        slug: "example-firm-a",
        name: "Example Firm A",
        description: "A placeholder record used only by the test suite.",
        status: "published",
        publishedAt: new Date(),
      })
      .returning({ id: propFirms.id });
    firmId = firm!.id;

    const [tron] = await db
      .insert(blockchainNetworks)
      .values({
        key: "tron",
        name: "Tron",
        nativeSymbol: "TRX",
        explorerTxTemplate: "https://explorer.example.test/tx/{hash}",
        provider: "fixture",
        confirmationsRequired: 12,
        isActive: true,
      })
      .returning({ id: blockchainNetworks.id });
    tronNetworkId = tron!.id;

    const [eth] = await db
      .insert(blockchainNetworks)
      .values({
        key: "ethereum",
        name: "Ethereum Mainnet",
        chainId: 1,
        nativeSymbol: "ETH",
        explorerTxTemplate: "https://explorer.example.test/tx/{hash}",
        provider: "fixture",
        confirmationsRequired: 12,
        isActive: true,
      })
      .returning({ id: blockchainNetworks.id });
    ethNetworkId = eth!.id;

    await db.insert(blockchainTokens).values({
      networkId: tronNetworkId,
      contractAddress: USDT_TRON,
      symbol: "USDT",
      decimals: 6,
      isEnabled: true,
    });
  });

  const saveWallet = (
    overrides: Partial<Parameters<typeof saveTrackedWallet>[1]["input"]> = {},
  ) =>
    saveTrackedWallet(db, {
      adminUserId: adminId,
      input: {
        propFirmId: firmId,
        networkId: tronNetworkId,
        address: WALLET_ADDRESS,
        label: "Example payout wallet",
        purpose: "unknown",
        verificationStatus: "unverified",
        notes: null,
        isActive: true,
        ...overrides,
      },
    });

  const ingest = (walletId: string, transfers: ChainTransfer[]) =>
    scanWallet(db, {
      walletId,
      provider: new FixtureProvider([{ transfers, nextCursor: null }]),
      maxPages: 1,
    });

  /* --------------------------------------------------- address validation */

  describe("an address must belong to the network it is filed under", () => {
    it("refuses a TRON address saved against Ethereum", async () => {
      // The exact defect this rule exists for: filed under the wrong chain,
      // the wallet scans forever and finds nothing — indistinguishable from a
      // firm that never paid anyone.
      await expect(
        saveWallet({ networkId: ethNetworkId }),
      ).rejects.toBeInstanceOf(PayoutAdminError);
      await expect(saveWallet({ networkId: ethNetworkId })).rejects.toThrow(
        /not a valid Ethereum Mainnet address/i,
      );
      expect(await db.select().from(trackedWallets)).toHaveLength(0);
    });

    it("refuses a TRON address whose checksum does not hold", async () => {
      // One character changed. Length and alphabet still look right.
      const mistyped = `${WALLET_ADDRESS.slice(0, -1)}L`;
      await expect(saveWallet({ address: mistyped })).rejects.toThrow(
        /not a valid Tron address/i,
      );
    });

    it("stores a matching key that ingestion will actually match", async () => {
      const { id } = await saveWallet();
      const [row] = await db
        .select()
        .from(trackedWallets)
        .where(eq(trackedWallets.id, id));

      // The original survives for display and for the provider call…
      expect(row?.address).toBe(WALLET_ADDRESS);
      // …while the matching key agrees with what ingestion writes into
      // `from_address`. If these ever diverged the wallet would report zero
      // transactions while holding thousands.
      expect(row?.addressNormalized).toBe(normaliseAddress(WALLET_ADDRESS));

      await ingest(id, [transfer()]);
      const [listed] = await listTrackedWallets(db);
      expect(listed?.transactionCount).toBe(1);
    });
  });

  /* ------------------------------------------------------- authorisation */

  describe("nothing publishes without a person", () => {
    it("leaves an unverified wallet's transfers in the queue", async () => {
      const { id } = await saveWallet({ purpose: "trader_payouts" });
      await ingest(id, [transfer()]);

      const result = await autoPublishForWallet(db, { walletId: id });

      expect(result.published).toBe(0);
      expect(await db.select().from(verifiedPayouts)).toHaveLength(0);
      const [candidate] = await db.select().from(payoutCandidates);
      expect(candidate?.status).toBe("detected");
    });

    it("leaves a verified wallet of unknown purpose in the queue", async () => {
      // Verified ownership is not the same claim as "this pays traders".
      const { id } = await saveWallet({
        purpose: "unknown",
        verificationStatus: "verified",
      });
      await ingest(id, [transfer()]);

      expect((await autoPublishForWallet(db, { walletId: id })).published).toBe(
        0,
      );
      expect(await db.select().from(verifiedPayouts)).toHaveLength(0);
    });

    it("publishes only once both parts of the decision are recorded", async () => {
      const { id } = await saveWallet({ purpose: "trader_payouts" });
      await ingest(id, [transfer()]);
      expect(await db.select().from(verifiedPayouts)).toHaveLength(0);

      // The decision, made by a person, once, for the address.
      const saved = await saveWallet({
        id,
        purpose: "trader_payouts",
        verificationStatus: "verified",
      });

      // It releases what the wallet already collected rather than stranding it.
      expect(saved.autoPublished).toBe(1);
      const payouts = await db.select().from(verifiedPayouts);
      expect(payouts).toHaveLength(1);
      // Attributed to whoever authorised the wallet — a published figure
      // nobody can account for is indistinguishable from a fabricated one.
      expect(payouts[0]?.verifiedByAdminId).toBe(adminId);
      expect(payouts[0]?.sourceWalletId).toBe(id);

      const [candidate] = await db.select().from(payoutCandidates);
      expect(candidate?.status).toBe("verified");

      const events = await db
        .select()
        .from(payoutVerificationEvents)
        .where(eq(payoutVerificationEvents.event, "verified"));
      expect(events).toHaveLength(1);
      expect(events[0]?.actorAdminId).toBe(adminId);
    });

    it("records who verified the wallet, and clears it when withdrawn", async () => {
      const { id } = await saveWallet({
        purpose: "trader_payouts",
        verificationStatus: "verified",
      });
      const [verified] = await db
        .select()
        .from(trackedWallets)
        .where(eq(trackedWallets.id, id));
      expect(verified?.verifiedByAdminId).toBe(adminId);
      expect(verified?.verifiedAt).toBeInstanceOf(Date);

      await saveWallet({
        id,
        purpose: "trader_payouts",
        verificationStatus: "disputed",
      });
      const [withdrawn] = await db
        .select()
        .from(trackedWallets)
        .where(eq(trackedWallets.id, id));
      // A stale "verified by" on an unverified wallet reads as an endorsement
      // nobody made.
      expect(withdrawn?.verifiedByAdminId).toBeNull();
      expect(withdrawn?.verifiedAt).toBeNull();
    });

    it("stops publishing as soon as verification is withdrawn", async () => {
      const { id } = await saveWallet({
        purpose: "trader_payouts",
        verificationStatus: "verified",
      });
      await saveWallet({
        id,
        purpose: "trader_payouts",
        verificationStatus: "disputed",
      });

      await ingest(id, [transfer()]);
      expect((await autoPublishForWallet(db, { walletId: id })).published).toBe(
        0,
      );
      expect(await db.select().from(verifiedPayouts)).toHaveLength(0);
    });
  });

  /* ------------------------------------------- per-transfer conditions */

  describe("the chain conditions still apply to every transfer", () => {
    const verifiedWallet = async () => {
      const { id } = await saveWallet({
        purpose: "trader_payouts",
        verificationStatus: "verified",
      });
      return id;
    };

    it("skips a transfer that has not reached the network's depth", async () => {
      const id = await verifiedWallet();
      await ingest(id, [transfer({ confirmations: 3 })]);

      const result = await autoPublishForWallet(db, { walletId: id });
      expect(result.published).toBe(0);
      expect(result.skipped).toBe(1);
      expect(await db.select().from(verifiedPayouts)).toHaveLength(0);
    });

    it("skips a zero-value transfer", async () => {
      const id = await verifiedWallet();
      await ingest(id, [transfer({ amountBaseUnits: "0" })]);

      expect((await autoPublishForWallet(db, { walletId: id })).published).toBe(
        0,
      );
      expect(await db.select().from(verifiedPayouts)).toHaveLength(0);
    });

    it("never overturns a rejection a person made", async () => {
      const id = await saveWallet({ purpose: "trader_payouts" }).then(
        (w) => w.id,
      );
      await ingest(id, [transfer()]);

      const [candidate] = await db.select().from(payoutCandidates);
      await rejectCandidate(db, {
        adminUserId: adminId,
        candidateId: candidate!.id,
        reason: "Moved to an exchange, not a trader payout.",
      });

      // Verifying the wallet afterwards must not resurrect it.
      await saveWallet({
        id,
        purpose: "trader_payouts",
        verificationStatus: "verified",
      });

      expect(await db.select().from(verifiedPayouts)).toHaveLength(0);
      const [after] = await db.select().from(payoutCandidates);
      expect(after?.status).toBe("rejected");
    });

    it("is idempotent — publishing twice records one payout", async () => {
      const id = await verifiedWallet();
      await ingest(id, [transfer()]);

      await autoPublishForWallet(db, { walletId: id });
      const second = await autoPublishForWallet(db, { walletId: id });

      expect(second.published).toBe(0);
      expect(await db.select().from(verifiedPayouts)).toHaveLength(1);
    });

    it("publishes each transfer of a multi-transfer hash separately", async () => {
      const id = await verifiedWallet();
      await ingest(id, [
        transfer({ transferIndex: 0 }),
        transfer({ transferIndex: 1, toAddress: OTHER_ADDRESS }),
      ]);

      expect((await autoPublishForWallet(db, { walletId: id })).published).toBe(
        2,
      );
    });

    it("writes an audit entry naming the wallet and the count", async () => {
      const id = await verifiedWallet();
      await ingest(id, [transfer()]);
      await autoPublishForWallet(db, { walletId: id });

      const entries = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, "payout.auto_published"));
      expect(entries).toHaveLength(1);
      expect(entries[0]?.actorAdminId).toBe(adminId);
    });
  });

  /* ----------------------------------------------------- wallet removal */

  describe("removing a wallet", () => {
    it("is soft, and keeps everything already published", async () => {
      const { id } = await saveWallet({
        purpose: "trader_payouts",
        verificationStatus: "verified",
      });
      await ingest(id, [transfer()]);
      await autoPublishForWallet(db, { walletId: id });
      expect(await db.select().from(verifiedPayouts)).toHaveLength(1);

      const removed = await deleteTrackedWallet(db, {
        adminUserId: adminId,
        walletId: id,
      });
      expect(removed.address).toBe(WALLET_ADDRESS);

      const [row] = await db
        .select()
        .from(trackedWallets)
        .where(eq(trackedWallets.id, id));
      expect(row?.deletedAt).toBeInstanceOf(Date);
      expect(row?.isActive).toBe(false);

      // Retiring an address does not un-make the transfers it sent.
      expect(await db.select().from(verifiedPayouts)).toHaveLength(1);
    });

    it("disappears from the admin list and from scheduled scans", async () => {
      const { id } = await saveWallet();
      expect(await listTrackedWallets(db)).toHaveLength(1);
      expect(await walletsDueForScan(db)).toHaveLength(1);

      await deleteTrackedWallet(db, { adminUserId: adminId, walletId: id });

      expect(await listTrackedWallets(db)).toHaveLength(0);
      expect(await walletsDueForScan(db)).toHaveLength(0);
    });

    it("stops auto-publishing, even while still marked verified", async () => {
      const { id } = await saveWallet({
        purpose: "trader_payouts",
        verificationStatus: "verified",
      });
      await ingest(id, [transfer()]);
      await deleteTrackedWallet(db, { adminUserId: adminId, walletId: id });

      expect((await autoPublishForWallet(db, { walletId: id })).published).toBe(
        0,
      );
      expect(await db.select().from(verifiedPayouts)).toHaveLength(0);
    });

    it("writes an audit entry, and refuses a second removal", async () => {
      const { id } = await saveWallet();
      await deleteTrackedWallet(db, { adminUserId: adminId, walletId: id });

      const entries = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, "payout.wallet_removed"));
      expect(entries).toHaveLength(1);

      await expect(
        deleteTrackedWallet(db, { adminUserId: adminId, walletId: id }),
      ).rejects.toBeInstanceOf(PayoutAdminError);
    });
  });
});
