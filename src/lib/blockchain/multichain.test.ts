import { describe, expect, it } from "vitest";
import {
  addressFamilyFor,
  isValidAddressFor,
  isValidEvmAddress,
  isValidTronAddress,
  normaliseAddressFor,
} from "./address";
import {
  SEED_NETWORKS,
  SEED_PROVIDERS,
  SEED_TOKENS,
  UNCONFIGURED_TOKENS,
} from "./registry";
import { TronScanProvider } from "./tronscan";
import { ProviderError, formatBaseUnits, normaliseAddress } from "./provider";

/**
 * MULTI-CHAIN, MULTI-TOKEN CONFIGURATION — docs/PAYOUTS.md §3–§6.
 *
 * No network is touched. The provider tests drive the adapter through a
 * stubbed `fetch`, because an integration test that calls a metered public API
 * is a test that fails when someone else is rate-limited.
 */

describe("address validation", () => {
  it("routes each network to the right validator", () => {
    expect(addressFamilyFor("ethereum")).toBe("evm");
    expect(addressFamilyFor("tron")).toBe("tron");
    // A chain nobody configured has no validator, so nothing can be filed
    // under it by accident.
    expect(addressFamilyFor("bitcoin")).toBeNull();
  });

  it("accepts a well-formed Ethereum address in any case", () => {
    const lower = "0xdac17f958d2ee523a2206206994597c13d831ec7";
    expect(isValidEvmAddress(lower)).toBe(true);
    expect(isValidEvmAddress(lower.toUpperCase().replace("0X", "0x"))).toBe(
      true,
    );
  });

  it("rejects malformed Ethereum addresses", () => {
    for (const bad of [
      "dac17f958d2ee523a2206206994597c13d831ec7", // no 0x
      "0xdac17f958d2ee523a2206206994597c13d831ec", // 39 nibbles
      "0xdac17f958d2ee523a2206206994597c13d831ec78", // 41
      "0xzzc17f958d2ee523a2206206994597c13d831ec7", // not hex
      "",
    ]) {
      expect(isValidEvmAddress(bad)).toBe(false);
    }
  });

  it("verifies the TRON base58 checksum, not just the shape", () => {
    // Tether's published TRC-20 contract address.
    expect(isValidTronAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")).toBe(true);

    // Right shape, one character changed — the checksum catches it. This is
    // the case a regex alone would wave through.
    expect(isValidTronAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u")).toBe(
      false,
    );
  });

  it("rejects an Ethereum address filed under TRON and vice versa", () => {
    const evm = "0xdac17f958d2ee523a2206206994597c13d831ec7";
    const tron = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

    // The mistake this prevents: a wallet that scans forever and finds
    // nothing, indistinguishable from a firm that made no payouts.
    expect(isValidAddressFor("tron", evm)).toBe(false);
    expect(isValidAddressFor("evm", tron)).toBe(false);
    expect(isValidAddressFor("evm", evm)).toBe(true);
    expect(isValidAddressFor("tron", tron)).toBe(true);
  });

  it("produces a matching key that agrees with the ingestion normaliser", () => {
    const mixed = "0xDAC17F958D2ee523a2206206994597C13D831ec7";
    expect(normaliseAddressFor("evm", mixed)).toBe(normaliseAddress(mixed));

    // TRON included. The matching key is NOT a usable address — the original
    // is kept in `tracked_wallets.address` — but it must equal what ingestion
    // writes into `from_address`. If it did not, a wallet would stop matching
    // its own transfers and read as a firm that never paid anyone.
    const tron = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
    expect(normaliseAddressFor("tron", tron)).toBe(normaliseAddress(tron));
    expect(normaliseAddressFor("tron", ` ${tron} `)).toBe(tron.toLowerCase());
  });
});

describe("token registry", () => {
  it("identifies every token by network AND contract, never by ticker", () => {
    for (const token of SEED_TOKENS) {
      expect(token.contractAddress).toBe(token.contractAddress.toLowerCase());
      expect(token.networkKey).toBeTruthy();
      expect(token.decimals).toBeGreaterThanOrEqual(0);
      // Every contract records where it was read from, so it is re-checkable.
      expect(token.sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it("carries the issuer-published contracts for Ethereum USDT and USDC", () => {
    const eth = SEED_TOKENS.filter((t) => t.networkKey === "ethereum");
    expect(eth.find((t) => t.symbol === "USDT")?.contractAddress).toBe(
      "0xdac17f958d2ee523a2206206994597c13d831ec7",
    );
    expect(eth.find((t) => t.symbol === "USDC")?.contractAddress).toBe(
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    );
  });

  it("carries Tether's TRC-20 contract for TRON USDT", () => {
    const usdt = SEED_TOKENS.find(
      (t) => t.networkKey === "tron" && t.symbol === "USDT",
    );
    // Stored lower-cased for matching; it is the same address Tether publishes.
    expect(usdt?.contractAddress).toBe("tr7nhqjekqxgtci8q8zy4pl8otszgjlj6t");
    expect(isValidTronAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")).toBe(true);
  });

  it("does NOT configure USDC on TRON, and says why", () => {
    // Circle's official contract list has no TRON entry, so there is no
    // issuer-published contract. An address from anywhere else is a guess.
    expect(
      SEED_TOKENS.some((t) => t.networkKey === "tron" && t.symbol === "USDC"),
    ).toBe(false);

    const noted = UNCONFIGURED_TOKENS.find(
      (t) => t.networkKey === "tron" && t.symbol === "USDC",
    );
    expect(noted).toBeDefined();
    expect(noted?.reason).toMatch(/Circle/i);
  });

  it("names a credential variable for each provider and no value", () => {
    for (const provider of SEED_PROVIDERS) {
      expect(provider.credentialEnvVar).toMatch(/^[A-Z0-9_]+$/);
      // The registry is committed to Git; a value here would be a leaked key.
      expect(JSON.stringify(provider)).not.toMatch(/[A-Za-z0-9]{24,}/);
    }
  });

  it("gives every network an explorer template and a real provider", () => {
    const keys = SEED_PROVIDERS.map((p) => p.key);
    for (const network of SEED_NETWORKS) {
      expect(network.explorerTxTemplate).toContain("{hash}");
      expect(network.explorerTxTemplate.startsWith("https://")).toBe(true);
      expect(keys).toContain(network.provider);
      expect(network.confirmationsRequired).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------- TRONSCAN adapter */

/** Swaps global fetch for one call, then restores it. */
async function withFetch<T>(
  impl: (url: string, init?: RequestInit) => Promise<Response>,
  run: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl as typeof globalThis.fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const TRANSFER = {
  transaction_id: "a".repeat(64),
  block_ts: 1_767_225_600_000,
  block: 60_000_000,
  from_address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  to_address: "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8",
  quant: "1234560000",
  contract_address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  confirmed: true,
  contractRet: "SUCCESS",
  tokenInfo: { tokenAbbr: "USDT", tokenDecimal: 6, tokenName: "Tether USD" },
};

describe("TRONSCAN provider", () => {
  it("parses a TRC-20 transfer without losing precision", async () => {
    const page = await withFetch(
      async () => json({ token_transfers: [TRANSFER] }),
      () =>
        new TronScanProvider({ apiKey: "test-key" }).listOutgoingTransfers({
          address: TRANSFER.from_address,
        }),
    );

    expect(page.transfers).toHaveLength(1);
    const transfer = page.transfers[0]!;
    expect(transfer.txHash).toBe(TRANSFER.transaction_id);
    // The exact base-unit string, never a parsed number.
    expect(transfer.amountBaseUnits).toBe("1234560000");
    expect(formatBaseUnits(transfer.amountBaseUnits, transfer.decimals)).toBe(
      "1,234.56",
    );
    expect(transfer.assetContract).toBe(TRANSFER.contract_address);
    expect(transfer.blockTimestamp.toISOString()).toBe(
      new Date(TRANSFER.block_ts).toISOString(),
    );
  });

  it("sends the key as a header and never in the URL", async () => {
    let seenUrl = "";
    let seenHeaders: Record<string, string> = {};

    await withFetch(
      async (url, init) => {
        seenUrl = String(url);
        seenHeaders = (init?.headers ?? {}) as Record<string, string>;
        return json({ token_transfers: [] });
      },
      () =>
        new TronScanProvider({
          apiKey: "super-secret-key",
        }).listOutgoingTransfers({ address: TRANSFER.from_address }),
    );

    // A key in a query string ends up in provider logs and referrers.
    expect(seenUrl).not.toContain("super-secret-key");
    expect(seenHeaders["TRON-PRO-API-KEY"]).toBe("super-secret-key");
    expect(seenUrl.startsWith("https://apilist.tronscanapi.com/")).toBe(true);
  });

  it("skips a reverted transaction", async () => {
    const page = await withFetch(
      async () =>
        json({
          token_transfers: [{ ...TRANSFER, contractRet: "REVERT" }],
        }),
      () =>
        new TronScanProvider().listOutgoingTransfers({
          address: TRANSFER.from_address,
        }),
    );
    expect(page.transfers).toHaveLength(0);
  });

  it("gives several transfers in one transaction distinct indexes", async () => {
    const page = await withFetch(
      async () => json({ token_transfers: [TRANSFER, { ...TRANSFER }] }),
      () =>
        new TronScanProvider().listOutgoingTransfers({
          address: TRANSFER.from_address,
        }),
    );
    // One hash, two transfers — the index is what keeps the storage key unique.
    expect(page.transfers.map((t) => t.transferIndex)).toEqual([0, 1]);
  });

  it("pages while a page is full and stops when it is short", async () => {
    const full = Array.from({ length: 50 }, (_, i) => ({
      ...TRANSFER,
      transaction_id: String(i).padStart(64, "0"),
    }));

    const paged = await withFetch(
      async () => json({ token_transfers: full }),
      () =>
        new TronScanProvider().listOutgoingTransfers({
          address: TRANSFER.from_address,
          limit: 50,
        }),
    );
    expect(paged.nextCursor).toBe("50");

    const last = await withFetch(
      async () => json({ token_transfers: [TRANSFER] }),
      () =>
        new TronScanProvider().listOutgoingTransfers({
          address: TRANSFER.from_address,
          limit: 50,
        }),
    );
    expect(last.nextCursor).toBeNull();
  });

  it("throws rather than reporting an empty page when the API errors", async () => {
    // The distinction that matters: a failure is not "this firm paid nobody".
    await expect(
      withFetch(
        async () => json({ error: "bad request" }, 500),
        () =>
          new TronScanProvider().listOutgoingTransfers({
            address: TRANSFER.from_address,
          }),
      ),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("throws on a malformed body instead of trusting it", async () => {
    await expect(
      withFetch(
        async () => json({ unexpected: true }),
        () =>
          new TronScanProvider().listOutgoingTransfers({
            address: TRANSFER.from_address,
          }),
      ),
    ).rejects.toThrow(/unexpected response shape/);
  });

  it("reports a connection test without leaking the key", async () => {
    const ok = await withFetch(
      async () => json({ status: "ok" }),
      () => new TronScanProvider({ apiKey: "secret" }).testConnection(),
    );
    expect(ok.ok).toBe(true);
    expect(JSON.stringify(ok)).not.toContain("secret");

    const failed = await withFetch(
      async () => json({}, 429),
      () => new TronScanProvider({ apiKey: "secret" }).testConnection(),
    );
    expect(failed.ok).toBe(false);
    expect(JSON.stringify(failed)).not.toContain("secret");
  });
});

describe("TRONSCAN query parameters", () => {
  /**
   * REGRESSION — a real wallet with ~10,000 transfers returned ZERO rows.
   *
   * The adapter sent `confirm=true`, which TRONSCAN answers with an empty
   * list. The scan then reported no transfers and no error: a result
   * indistinguishable from a firm that has never paid a trader. Confirmation
   * comes from each row's own flag, never from a filter that can silently
   * empty the response.
   */
  it("never sends confirm=true, which silently empties the result", async () => {
    let seenUrl = "";
    await withFetch(
      async (url) => {
        seenUrl = String(url);
        return json({ token_transfers: [] });
      },
      () =>
        new TronScanProvider().listOutgoingTransfers({
          address: TRANSFER.from_address,
        }),
    );

    expect(seenUrl).not.toContain("confirm=true");
    // The parameters that must still be there.
    expect(seenUrl).toContain("relatedAddress=");
    expect(seenUrl).toContain("sort=-timestamp");
  });

  it("reads confirmation from the row, not from a query filter", async () => {
    const page = await withFetch(
      async () =>
        json({
          token_transfers: [
            { ...TRANSFER, confirmed: true },
            { ...TRANSFER, transaction_id: "b".repeat(64), confirmed: false },
          ],
        }),
      () =>
        new TronScanProvider().listOutgoingTransfers({
          address: TRANSFER.from_address,
        }),
    );

    expect(page.transfers).toHaveLength(2);
    // Confirmed: depth unknown (TRONSCAN reports a boolean), so null — the
    // verification gate treats that as "not reported" rather than "settled".
    expect(page.transfers[0]?.confirmations).toBeNull();
    // Unconfirmed: 0, which the gate refuses against the network's threshold.
    expect(page.transfers[1]?.confirmations).toBe(0);
  });
});
