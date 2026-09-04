import { TronScanProvider } from "./tronscan";
import {
  type BlockchainProvider,
  type ChainTransfer,
  type ListTransfersOptions,
  ProviderError,
  type TransferPage,
  fetchJson,
  normaliseAddress,
} from "./provider";

/**
 * Concrete provider adapters — docs/PAYOUTS.md §4.
 *
 * TWO NETWORKS, chosen because prop firms demonstrably pay traders on them in
 * stablecoins and because both expose public transfer history that can be
 * checked independently by anyone reading a payout claim. More can be added by
 * writing another adapter; nothing else in the pipeline changes.
 *
 * Neither adapter fabricates anything. When a request fails they throw, so
 * ingestion records an error rather than silently reporting "no payouts".
 */

/* --------------------------------------------------------------- TRON */

interface TronTrc20Response {
  data?: {
    transaction_id?: string;
    block_timestamp?: number;
    from?: string;
    to?: string;
    value?: string;
    type?: string;
    token_info?: { symbol?: string; decimals?: number; address?: string };
  }[];
  meta?: { fingerprint?: string; links?: { next?: string } };
  success?: boolean;
  error?: string;
}

/**
 * TRC-20 transfers via TronGrid.
 *
 * Tron carries a large share of stablecoin payouts because its fees are
 * negligible. TronGrid serves transfer history publicly; an API key raises the
 * rate limit but is not required to read, so this adapter works without
 * credentials and simply gets throttled harder without them.
 */
export class TronProvider implements BlockchainProvider {
  readonly key = "trongrid";

  constructor(
    private readonly options: {
      baseUrl?: string;
      apiKey?: string | undefined;
    } = {},
  ) {}

  async listOutgoingTransfers(
    options: ListTransfersOptions,
  ): Promise<TransferPage> {
    const base = this.options.baseUrl ?? "https://api.trongrid.io";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);

    const url = new URL(
      `/v1/accounts/${encodeURIComponent(options.address)}/transactions/trc20`,
      base,
    );
    url.searchParams.set("only_from", "true");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("order_by", "block_timestamp,desc");
    if (options.cursor) url.searchParams.set("fingerprint", options.cursor);
    if (options.since) {
      url.searchParams.set("min_timestamp", String(options.since.getTime()));
    }

    const payload = (await fetchJson(url.toString(), {
      provider: this.key,
      ...(this.options.apiKey
        ? { headers: { "TRON-PRO-API-KEY": this.options.apiKey } }
        : {}),
    })) as TronTrc20Response;

    if (payload.success === false) {
      throw new ProviderError(this.key, payload.error ?? "request rejected");
    }

    const transfers: ChainTransfer[] = [];
    // TronGrid returns one row per transfer, so several rows can share a hash;
    // the index is assigned per hash to keep the storage key unique.
    const seenPerHash = new Map<string, number>();

    for (const row of payload.data ?? []) {
      if (row.type && row.type !== "Transfer") continue;
      if (!row.transaction_id || !row.from || !row.to || !row.value) continue;
      if (!row.block_timestamp) continue;

      const index = seenPerHash.get(row.transaction_id) ?? 0;
      seenPerHash.set(row.transaction_id, index + 1);

      transfers.push({
        txHash: row.transaction_id,
        transferIndex: index,
        // TronGrid's TRC-20 endpoint does not carry the block number.
        blockNumber: null,
        blockTimestamp: new Date(row.block_timestamp),
        fromAddress: normaliseAddress(row.from),
        toAddress: normaliseAddress(row.to),
        assetSymbol: row.token_info?.symbol ?? "UNKNOWN",
        assetContract: row.token_info?.address
          ? normaliseAddress(row.token_info.address)
          : null,
        // The exact integer string, untouched.
        amountBaseUnits: row.value,
        decimals: row.token_info?.decimals ?? 0,
        status: "success",
        confirmations: null,
        raw: row,
      });
    }

    return {
      transfers,
      nextCursor: payload.meta?.fingerprint ?? null,
    };
  }
}

/* ---------------------------------------------------------------- EVM */

interface EtherscanResponse {
  status?: string;
  message?: string;
  result?:
    | {
        hash?: string;
        blockNumber?: string;
        timeStamp?: string;
        from?: string;
        to?: string;
        value?: string;
        tokenSymbol?: string;
        tokenDecimal?: string;
        contractAddress?: string;
        confirmations?: string;
      }[]
    | string;
}

/**
 * ERC-20 transfers from any Etherscan-compatible explorer API.
 *
 * One adapter covers Ethereum, BSC, Polygon, Arbitrum and the rest, because
 * they share the v2 API shape and differ only by `chainid`. An API key IS
 * required — the endpoint refuses anonymous traffic — so a network using this
 * adapter stays inactive until a key is configured, rather than quietly
 * reporting no payouts.
 */
export class EvmExplorerProvider implements BlockchainProvider {
  readonly key = "etherscan";

  constructor(
    private readonly options: {
      apiKey: string;
      chainId: number;
      baseUrl?: string;
    },
  ) {}

  async listOutgoingTransfers(
    options: ListTransfersOptions,
  ): Promise<TransferPage> {
    const base = this.options.baseUrl ?? "https://api.etherscan.io/v2/api";
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 10_000);
    // The cursor is the page number; the API paginates by page, not by token.
    const page = options.cursor ? Number(options.cursor) : 1;

    const url = new URL(base);
    url.searchParams.set("chainid", String(this.options.chainId));
    url.searchParams.set("module", "account");
    url.searchParams.set("action", "tokentx");
    url.searchParams.set("address", options.address);
    url.searchParams.set("page", String(page));
    url.searchParams.set("offset", String(limit));
    url.searchParams.set("sort", "desc");
    url.searchParams.set("apikey", this.options.apiKey);

    const payload = (await fetchJson(url.toString(), {
      provider: this.key,
    })) as EtherscanResponse;

    // "No transactions found" is a legitimate empty result, not a failure.
    if (payload.status === "0" && typeof payload.result === "string") {
      if (/no transactions found/i.test(payload.result)) {
        return { transfers: [], nextCursor: null };
      }
      throw new ProviderError(this.key, payload.result);
    }
    if (!Array.isArray(payload.result)) {
      throw new ProviderError(
        this.key,
        payload.message ?? "unexpected response",
      );
    }

    const from = normaliseAddress(options.address);
    const transfers: ChainTransfer[] = [];
    const seenPerHash = new Map<string, number>();

    for (const row of payload.result) {
      if (!row.hash || !row.from || !row.to || !row.value || !row.timeStamp) {
        continue;
      }
      // `tokentx` returns transfers in BOTH directions; payouts are outgoing.
      if (normaliseAddress(row.from) !== from) continue;

      const index = seenPerHash.get(row.hash) ?? 0;
      seenPerHash.set(row.hash, index + 1);

      transfers.push({
        txHash: row.hash,
        transferIndex: index,
        blockNumber: row.blockNumber ? BigInt(row.blockNumber) : null,
        blockTimestamp: new Date(Number(row.timeStamp) * 1000),
        fromAddress: normaliseAddress(row.from),
        toAddress: normaliseAddress(row.to),
        assetSymbol: row.tokenSymbol ?? "UNKNOWN",
        assetContract: row.contractAddress
          ? normaliseAddress(row.contractAddress)
          : null,
        amountBaseUnits: row.value,
        decimals: row.tokenDecimal ? Number(row.tokenDecimal) : 0,
        status: "success",
        confirmations: row.confirmations ? Number(row.confirmations) : null,
        raw: row,
      });
    }

    // A short page means the end; a full one means there may be more.
    return {
      transfers,
      nextCursor: payload.result.length >= limit ? String(page + 1) : null,
    };
  }
}

/**
 * Builds the adapter a network row asks for.
 *
 * Returns null when the provider needs a credential that is not configured —
 * ingestion then records "provider unavailable" rather than an empty scan that
 * would look like a firm having made no payouts.
 */
/** Providers this build can actually run. Nothing else is addressable. */
export const SUPPORTED_PROVIDER_KEYS = [
  "etherscan",
  "tronscan",
  "trongrid",
] as const;

export function providerFor(network: {
  provider: string;
  chainId: number | null;
}): BlockchainProvider | null {
  switch (network.provider) {
    case "trongrid":
      return new TronProvider({ apiKey: process.env.TRONGRID_API_KEY });

    case "tronscan": {
      // TRONSCAN serves public data without a key but rate-limits hard; the
      // key raises the limit rather than unlocking the endpoint, so an
      // unconfigured key is a warning, not a blocker.
      const apiKey = process.env.TRONSCAN_API_KEY;
      return new TronScanProvider(apiKey ? { apiKey } : {});
    }

    case "etherscan": {
      const apiKey = process.env.ETHERSCAN_API_KEY;
      if (!apiKey || network.chainId === null) return null;
      return new EvmExplorerProvider({ apiKey, chainId: network.chainId });
    }

    default:
      return null;
  }
}
