import { eq } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetTestDb, type TestDb } from "@/lib/db/testing";
import {
  adminUserRoles,
  adminUsers,
  blockchainNetworks,
  blockchainTokens,
  blockchainTransactions,
  payoutCandidates,
  payoutVerificationEvents,
  propFirms,
  roles,
  trackedWallets,
  verifiedPayouts,
} from "@/lib/db/schema";
import {
  AuthorizationError,
  ROLES,
  seedRolesAndPermissions,
} from "@/lib/auth/permissions";
import type {
  BlockchainProvider,
  ChainTransfer,
  TransferPage,
} from "@/lib/blockchain/provider";
import { ProviderError, formatBaseUnits } from "@/lib/blockchain/provider";
import { scanWallet } from "./payout-ingestion";
import {
  VerificationError,
  rejectCandidate,
  verifyCandidate,
} from "./payout-verification";
import {
  getPayoutTotals,
  listRecentVerifiedPayouts,
} from "@/lib/repositories/public-payouts";

/**
 * BLOCKCHAIN PAYOUT PIPELINE — docs/PAYOUTS.md.
 *
 * Against a REAL PostgreSQL, because the guarantees under test are database
 * ones: idempotent ingestion, the separation between raw data and verified
 * payouts, and exact integer amounts.
 *
 * The provider below is a TEST FIXTURE returning fixed transfers. It exists
 * only in this file — the application ships no mock provider, so fabricated
 * chain data cannot reach production (docs/PAYOUTS.md §4 `[LOCKED]`).
 */

const USDT_TRON = "tr7nhqjekqxgtci8q8zy4pl8otszgjlj6t";

/** A stub provider. Returns exactly what it is given, or throws. */
class FixtureProvider implements BlockchainProvider {
  readonly key = "fixture";
  calls = 0;

  constructor(
    private readonly pages: TransferPage[],
    private readonly failWith?: Error,
  ) {}

  async listOutgoingTransfers(): Promise<TransferPage> {
    if (this.failWith) throw this.failWith;
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
    fromAddress: "twalletexampleaddress0001",
    toAddress: "ttraderexampleaddress0001",
    assetSymbol: "USDT",
    assetContract: USDT_TRON,
    // 1,234.56 USDT in base units at 6 decimals — an exact integer string.
    amountBaseUnits: "1234560000",
    decimals: 6,
    status: "success",
    confirmations: 50,
    raw: { source: "fixture" },
    ...overrides,
  };
}

describe("blockchain payout pipeline", () => {
  let db: TestDb;
  let client: PGlite;
  let close: () => Promise<void>;
  let verifierId: string;
  let analystId: string;
  let firmId: string;
  let networkId: string;
  let walletId: string;

  beforeAll(async () => {
    ({ db, client, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

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

    verifierId = await makeAdmin("publisher@example.test", ROLES.PUBLISHER);
    analystId = await makeAdmin("analyst@example.test", ROLES.ANALYST);

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

    await db.insert(blockchainTokens).values({
      networkId,
      contractAddress: USDT_TRON,
      symbol: "USDT",
      decimals: 6,
      isEnabled: true,
    });

    const [wallet] = await db
      .insert(trackedWallets)
      .values({
        propFirmId: firmId,
        networkId,
        address: "twalletexampleaddress0001",
        addressNormalized: "twalletexampleaddress0001",
        label: "Example payout wallet",
        purpose: "trader_payouts",
        isActive: true,
      })
      .returning({ id: trackedWallets.id });
    walletId = wallet!.id;
  });

  const scan = (provider: BlockchainProvider) =>
    scanWallet(db, { walletId, provider, maxPages: 1 });

  /* ------------------------------------------------------------ ingestion */

  describe("ingestion", () => {
    it("records a transfer and raises a candidate, not a payout", async () => {
      const result = await scan(
        new FixtureProvider([{ transfers: [transfer()], nextCursor: null }]),
      );

      expect(result.transactionsInserted).toBe(1);
      expect(result.candidatesCreated).toBe(1);
      expect(result.error).toBeNull();

      // The separation that the whole design rests on.
      expect(await db.select().from(blockchainTransactions)).toHaveLength(1);
      expect(await db.select().from(payoutCandidates)).toHaveLength(1);
      expect(await db.select().from(verifiedPayouts)).toHaveLength(0);

      const [candidate] = await db.select().from(payoutCandidates);
      expect(candidate?.status).toBe("detected");
    });

    it("is idempotent — a re-scan inserts nothing new", async () => {
      const page = { transfers: [transfer()], nextCursor: null };
      await scan(new FixtureProvider([page]));
      const second = await scan(new FixtureProvider([page]));

      expect(second.transactionsInserted).toBe(0);
      expect(second.candidatesCreated).toBe(0);
      expect(await db.select().from(blockchainTransactions)).toHaveLength(1);
      expect(await db.select().from(payoutCandidates)).toHaveLength(1);
    });

    it("keeps several transfers that share one hash", async () => {
      await scan(
        new FixtureProvider([
          {
            transfers: [
              transfer({ transferIndex: 0, toAddress: "trader0001" }),
              transfer({ transferIndex: 1, toAddress: "trader0002" }),
            ],
            nextCursor: null,
          },
        ]),
      );
      expect(await db.select().from(blockchainTransactions)).toHaveLength(2);
    });

    it("stores the amount as an exact integer, never a float", async () => {
      // 18 decimals: a value that a JS number cannot represent exactly.
      const huge = "1234567890123456789";
      await scan(
        new FixtureProvider([
          {
            transfers: [
              transfer({
                amountBaseUnits: huge,
                decimals: 18,
                assetSymbol: "EXM",
              }),
            ],
            nextCursor: null,
          },
        ]),
      );

      const [row] = await db.select().from(blockchainTransactions);
      expect(row?.amountBaseUnits).toBe(huge);
      // And it renders without going through a float.
      expect(formatBaseUnits(huge, 18)).toBe("1.23");
    });

    it("ignores a token that is not configured for the network", async () => {
      // A contract nobody registered is not "probably a stablecoin" — it is
      // unknown, and unknown assets do not become payout candidates.
      const result = await scan(
        new FixtureProvider([
          {
            transfers: [
              transfer({ assetContract: "0xsomeunknowncontract0001" }),
            ],
            nextCursor: null,
          },
        ]),
      );

      expect(result.skippedUnsupportedToken).toBe(1);
      expect(await db.select().from(blockchainTransactions)).toHaveLength(0);
      expect(await db.select().from(payoutCandidates)).toHaveLength(0);
    });

    it("ignores a disabled token even though its contract is known", async () => {
      await db
        .update(blockchainTokens)
        .set({ isEnabled: false })
        .where(eq(blockchainTokens.networkId, networkId));

      const result = await scan(
        new FixtureProvider([{ transfers: [transfer()], nextCursor: null }]),
      );

      // No enabled token means nothing on this network is recognisable, and
      // the scan says so instead of reporting a clean, empty result.
      expect(result.error).toMatch(/no enabled token/i);
      expect(await db.select().from(blockchainTransactions)).toHaveLength(0);
    });

    it("flags a decimals disagreement rather than silently rescaling", async () => {
      // The token says 6; the provider reports 18. One of them is wrong, and
      // the difference is a factor of a trillion.
      const result = await scan(
        new FixtureProvider([
          { transfers: [transfer({ decimals: 18 })], nextCursor: null },
        ]),
      );

      expect(result.decimalsMismatch).toBe(1);
      // It is still recorded — the mismatch is surfaced, not used to discard
      // a real transfer.
      expect(result.transactionsInserted).toBe(1);
    });

    it("ignores a transfer that did not leave the tracked wallet", async () => {
      await scan(
        new FixtureProvider([
          {
            transfers: [transfer({ fromAddress: "someoneelsesaddress0001" })],
            nextCursor: null,
          },
        ]),
      );
      expect(await db.select().from(blockchainTransactions)).toHaveLength(0);
    });

    it("never records money coming INTO the wallet, and says how much", async () => {
      /*
       * A firm's payout wallet also RECEIVES — challenge fees, exchange
       * returns, treasury top-ups. Recording those would credit the firm with
       * paying out money it was paid. The count is reported rather than
       * silently dropped, so "nothing new" cannot be mistaken for a quiet
       * wallet when the page went entirely on incoming transfers.
       */
      const result = await scan(
        new FixtureProvider([
          {
            transfers: [
              transfer({
                txHash: "0xincoming0001",
                fromAddress: "atraderaddress0001",
                toAddress: "twalletexampleaddress0001",
              }),
              transfer({
                txHash: "0xincoming0002",
                fromAddress: "anexchangeaddress0001",
                toAddress: "twalletexampleaddress0001",
              }),
              transfer({ txHash: "0xoutgoing0001" }),
            ],
            nextCursor: null,
          },
        ]),
      );

      expect(result.skippedIncoming).toBe(2);
      expect(result.transactionsInserted).toBe(1);

      const rows = await db.select().from(blockchainTransactions);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.txHash).toBe("0xoutgoing0001");
      // Nothing incoming reached the review queue either.
      expect(await db.select().from(payoutCandidates)).toHaveLength(1);
    });

    it("ignores an unsuccessful transaction", async () => {
      await scan(
        new FixtureProvider([
          { transfers: [transfer({ status: "failed" })], nextCursor: null },
        ]),
      );
      expect(await db.select().from(blockchainTransactions)).toHaveLength(0);
    });

    it("records a provider failure instead of reporting no payouts", async () => {
      const result = await scan(
        new FixtureProvider([], new ProviderError("fixture", "boom")),
      );

      expect(result.error).toContain("boom");
      expect(result.transactionsInserted).toBe(0);

      // The distinction that matters: the wallet is marked errored, not clean.
      const [wallet] = await db
        .select()
        .from(trackedWallets)
        .where(eq(trackedWallets.id, walletId));
      expect(wallet?.lastScanError).toContain("boom");
    });

    it("scores an unknown-purpose wallet lower than a payout wallet", async () => {
      await db
        .update(trackedWallets)
        .set({ purpose: "unknown" })
        .where(eq(trackedWallets.id, walletId));
      await scan(
        new FixtureProvider([{ transfers: [transfer()], nextCursor: null }]),
      );

      const [candidate] = await db.select().from(payoutCandidates);
      expect(candidate?.confidence).toBeLessThan(50);
      expect(candidate?.matchReasons).toContain("wallet_purpose_unknown");
    });
  });

  /* --------------------------------------------------------- verification */

  async function candidateId(): Promise<string> {
    const [candidate] = await db.select().from(payoutCandidates);
    return candidate!.id;
  }

  describe("verification", () => {
    beforeEach(async () => {
      await scan(
        new FixtureProvider([{ transfers: [transfer()], nextCursor: null }]),
      );
    });

    it("requires the verify permission", async () => {
      await expect(
        verifyCandidate(db, {
          adminUserId: analystId,
          candidateId: await candidateId(),
        }),
      ).rejects.toThrow(AuthorizationError);
      expect(await db.select().from(verifiedPayouts)).toHaveLength(0);
    });

    it("promotes a candidate and records the evidence", async () => {
      const id = await candidateId();
      const result = await verifyCandidate(db, {
        adminUserId: verifierId,
        candidateId: id,
      });

      const [payout] = await db.select().from(verifiedPayouts);
      expect(payout?.txHash).toBe("0xexamplehash0001");
      expect(payout?.amountBaseUnits).toBe("1234560000");
      expect(payout?.explorerUrl).toBe(
        "https://explorer.example.test/tx/0xexamplehash0001",
      );
      expect(payout?.verifiedByAdminId).toBe(verifierId);
      expect(result.payoutId).toBe(payout?.id);

      const [candidate] = await db.select().from(payoutCandidates);
      expect(candidate?.status).toBe("verified");

      // The trail that makes the published figure accountable.
      const events = await db.select().from(payoutVerificationEvents);
      expect(events.map((e) => e.event)).toEqual(["detected", "verified"]);
      expect(events.at(-1)?.actorAdminId).toBe(verifierId);
    });

    it("refuses a transaction with too few confirmations", async () => {
      await db.update(blockchainTransactions).set({ confirmations: 2 });

      await expect(
        verifyCandidate(db, {
          adminUserId: verifierId,
          candidateId: await candidateId(),
        }),
      ).rejects.toMatchObject({ code: "NOT_SETTLED" });
      expect(await db.select().from(verifiedPayouts)).toHaveLength(0);
    });

    it("refuses a zero-value transfer", async () => {
      await db.update(blockchainTransactions).set({ amountBaseUnits: "0" });

      await expect(
        verifyCandidate(db, {
          adminUserId: verifierId,
          candidateId: await candidateId(),
        }),
      ).rejects.toMatchObject({ code: "ZERO_AMOUNT" });
    });

    it("refuses a transfer that went INTO the wallet", async () => {
      /*
       * Ingestion already drops incoming transfers, so this is the backstop
       * for anything that got past it — a provider that stopped honouring the
       * outgoing contract, or a row recorded before the filter existed.
       * Publishing one would record money the firm was PAID as a payout, and
       * that error is invisible once it is in the totals.
       */
      await db
        .update(blockchainTransactions)
        .set({
          fromAddress: "atraderaddress0001",
          toAddress: "twalletexampleaddress0001",
        });

      await expect(
        verifyCandidate(db, {
          adminUserId: verifierId,
          candidateId: await candidateId(),
        }),
      ).rejects.toMatchObject({ code: "NOT_OUTGOING" });
      expect(await db.select().from(verifiedPayouts)).toHaveLength(0);
    });

    it("refuses to verify the same candidate twice", async () => {
      const id = await candidateId();
      await verifyCandidate(db, { adminUserId: verifierId, candidateId: id });
      await expect(
        verifyCandidate(db, { adminUserId: verifierId, candidateId: id }),
      ).rejects.toMatchObject({ code: "ALREADY_VERIFIED" });
      expect(await db.select().from(verifiedPayouts)).toHaveLength(1);
    });

    it("requires a reason to reject, and records it", async () => {
      const id = await candidateId();
      await expect(
        rejectCandidate(db, {
          adminUserId: verifierId,
          candidateId: id,
          reason: "   ",
        }),
      ).rejects.toBeInstanceOf(VerificationError);

      await rejectCandidate(db, {
        adminUserId: verifierId,
        candidateId: id,
        reason: "Internal treasury transfer, not a trader payout.",
      });

      const [candidate] = await db.select().from(payoutCandidates);
      expect(candidate?.status).toBe("rejected");
      expect(candidate?.rejectionReason).toContain("treasury");
      expect(await db.select().from(verifiedPayouts)).toHaveLength(0);
    });

    it("refuses a USD value without its rate and provenance", async () => {
      // The CHECK constraint is the guard: a figure nobody can explain is
      // exactly what this system exists to avoid.
      await expect(
        db.insert(verifiedPayouts).values({
          propFirmId: firmId,
          networkId,
          candidateId: await candidateId(),
          transactionId: (await db.select().from(blockchainTransactions))[0]!
            .id,
          sourceWalletId: walletId,
          txHash: "0xexamplehash0002",
          transactionTimestamp: new Date(),
          fromAddress: "twalletexampleaddress0001",
          toAddress: "ttraderexampleaddress0001",
          assetSymbol: "USDT",
          amountBaseUnits: "100",
          decimals: 6,
          usdValue: "1000.00",
          explorerUrl: "https://explorer.example.test/tx/0xexamplehash0002",
        }),
      ).rejects.toThrow();
    });
  });

  /* ----------------------------------------------------------- statistics */

  describe("public statistics", () => {
    it("count only VERIFIED payouts, never candidates", async () => {
      await scan(
        new FixtureProvider([{ transfers: [transfer()], nextCursor: null }]),
      );

      // Detected but unverified: must not appear anywhere public.
      expect((await getPayoutTotals(db, "all")).count).toBe(0);
      expect(await listRecentVerifiedPayouts(db)).toHaveLength(0);

      await verifyCandidate(db, {
        adminUserId: verifierId,
        candidateId: await candidateId(),
      });

      expect((await getPayoutTotals(db, "all")).count).toBe(1);
      const recent = await listRecentVerifiedPayouts(db);
      expect(recent).toHaveLength(1);
      expect(recent[0]?.firmSlug).toBe("example-firm-a");
      expect(recent[0]?.explorerUrl).toContain("0xexamplehash0001");
    });

    it("excludes payouts belonging to an unpublished firm", async () => {
      await scan(
        new FixtureProvider([{ transfers: [transfer()], nextCursor: null }]),
      );
      await verifyCandidate(db, {
        adminUserId: verifierId,
        candidateId: await candidateId(),
      });
      await db
        .update(propFirms)
        .set({ status: "draft" })
        .where(eq(propFirms.id, firmId));

      expect((await getPayoutTotals(db, "all")).count).toBe(0);
      expect(await listRecentVerifiedPayouts(db)).toHaveLength(0);
    });

    it("reports how many payouts a valued total actually covers", async () => {
      await scan(
        new FixtureProvider([{ transfers: [transfer()], nextCursor: null }]),
      );
      await verifyCandidate(db, {
        adminUserId: verifierId,
        candidateId: await candidateId(),
      });

      const totals = await getPayoutTotals(db, "all");
      expect(totals.count).toBe(1);
      // No rate was supplied, so there is no dollar figure — and the count of
      // valued payouts says so rather than implying the total covers all.
      expect(totals.usdValue).toBeNull();
      expect(totals.usdValuedCount).toBe(0);
    });

    it("honours the time window", async () => {
      const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      await scan(
        new FixtureProvider([
          { transfers: [transfer({ blockTimestamp: old })], nextCursor: null },
        ]),
      );
      await verifyCandidate(db, {
        adminUserId: verifierId,
        candidateId: await candidateId(),
      });

      expect((await getPayoutTotals(db, "all")).count).toBe(1);
      expect((await getPayoutTotals(db, "30d")).count).toBe(0);
      expect((await getPayoutTotals(db, "24h")).count).toBe(0);
    });
  });

  /* ------------------------------------------------------------ formatting */

  describe("amount rendering", () => {
    it("never loses precision to floating point", () => {
      expect(formatBaseUnits("1234560000", 6)).toBe("1,234.56");
      expect(formatBaseUnits("1000000", 6)).toBe("1");
      expect(formatBaseUnits("1", 18)).toBe("0");
      expect(formatBaseUnits("999999999999999999999", 18)).toBe("999.99");
      expect(formatBaseUnits("500", 0)).toBe("500");
    });
  });
});
