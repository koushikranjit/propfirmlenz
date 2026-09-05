import {
  type BlockchainProvider,
  type ChainTransfer,
  type ListTransfersOptions,
  ProviderError,
  type TransferPage,
  fetchJson,
} from "./provider";

/**
 * TRONSCAN — TRC-20 transfers for a tracked wallet (docs/PAYOUTS.md §4).
 *
 * Alongside the existing TronGrid adapter rather than replacing it: both read
 * the same chain, and an operator who has a working TronGrid key should not
 * lose it because a second option arrived.
 *
 * THE ENDPOINT IS FIXED. It is never composed from anything an admin typed,
 * so no configuration change can point this at another host — a provider whose
 * base URL came from a form is an SSRF hole with a settings page.
 *
 * The API key travels in a header and is never logged, never returned, and
 * never reaches an error message (CLAUDE.md §6 `[LOCKED]`).
 */

const TRONSCAN_BASE = "https://apilist.tronscanapi.com";

interface TronscanTransferRow {
  transaction_id?: string;
  block_ts?: number;
  block?: number;
  from_address?: string;
  to_address?: string;
  quant?: string;
  contract_address?: string;
  confirmed?: boolean;
  finalResult?: string;
  contractRet?: string;
  tokenInfo?: {
    tokenAbbr?: string;
    tokenDecimal?: number;
    tokenName?: string;
  };
}

interface TronscanResponse {
  token_transfers?: TronscanTransferRow[];
  total?: number;
  rangeTotal?: number;
  message?: string;
}

export class TronScanProvider implements BlockchainProvider {
  readonly key = "tronscan";

  constructor(private readonly options: { apiKey?: string | undefined } = {}) {}

  /** Header auth. The value never leaves this object. */
  private headers(): Record<string, string> {
    return this.options.apiKey
      ? { "TRON-PRO-API-KEY": this.options.apiKey }
      : {};
  }

  async listOutgoingTransfers(
    options: ListTransfersOptions,
  ): Promise<TransferPage> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 50);
    // The cursor is an offset. It is parsed as an integer rather than
    // interpolated, so a malformed stored cursor cannot alter the query.
    const start = Number.parseInt(options.cursor ?? "0", 10);
    const offset = Number.isFinite(start) && start > 0 ? start : 0;

    const url = new URL("/api/token_trc20/transfers", TRONSCAN_BASE);
    /*
     * `relatedAddress` returns BOTH DIRECTIONS, and the rows are filtered to
     * outgoing below.
     *
     * TRONSCAN does document a `fromAddress` parameter that would filter
     * server-side, which would be better — it would stop us paging through
     * money coming IN. It answers 401 without a key, so it cannot be verified
     * here, and this endpoint has form for accepting a parameter and silently
     * returning nothing for it (see the `confirm` note below). Until it can be
     * tested against a live key, the filter stays where its behaviour is
     * visible: in this file.
     */
    url.searchParams.set("relatedAddress", options.address);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("start", String(offset));
    url.searchParams.set("sort", "-timestamp");
    // NO `confirm=true`. TRONSCAN returns ZERO rows for it on wallets that
    // demonstrably have thousands of transfers — a silent empty result that
    // is indistinguishable from a firm which never paid anyone, which is the
    // single worst failure this system can have. Confirmation is read from
    // each row's own `confirmed` flag below instead.
    if (options.since) {
      url.searchParams.set("start_timestamp", String(options.since.getTime()));
    }

    const payload = (await fetchJson(url.toString(), {
      provider: this.key,
      headers: this.headers(),
    })) as TronscanResponse;

    // A body that is not the documented shape is a failure, not "no payouts".
    if (!payload || !Array.isArray(payload.token_transfers)) {
      throw new ProviderError(
        this.key,
        payload?.message ? "request rejected" : "unexpected response shape",
      );
    }

    const transfers: ChainTransfer[] = [];
    // One row per transfer, so a hash can appear several times; the index
    // keeps the storage key unique per transfer within a transaction.
    const seenPerHash = new Map<string, number>();
    // Matched the way the pipeline matches everywhere else, so a wallet
    // recorded in one casing still matches its own transfers.
    const wallet = options.address.trim().toLowerCase();

    for (const row of payload.token_transfers) {
      if (!row.transaction_id || !row.from_address || !row.to_address) continue;
      if (!row.quant || !row.block_ts) continue;
      // TRONSCAN reports the contract result separately from confirmation.
      const reverted =
        (row.contractRet && row.contractRet !== "SUCCESS") ||
        (row.finalResult && row.finalResult !== "SUCCESS");
      if (reverted) continue;

      /*
       * THE INDEX IS ASSIGNED BEFORE THE DIRECTION FILTER, DELIBERATELY.
       *
       * `transfer_index` is half the storage key (network + hash + index).
       * Rows already recorded had their index counted across every transfer
       * in the transaction, incoming ones included. Counting only outgoing
       * rows from now on would give an already-stored payout a different
       * index on its next scan — and `onConflictDoNothing` would then insert
       * it a SECOND time, double-counting a real payout. Keeping the
       * derivation exactly as it was is what makes this change safe to ship
       * against existing data.
       */
      const index = seenPerHash.get(row.transaction_id) ?? 0;
      seenPerHash.set(row.transaction_id, index + 1);

      /*
       * ONLY MONEY LEAVING THE WALLET IS A PAYOUT `[LOCKED]`.
       *
       * A firm's wallet also RECEIVES — challenge fees, exchange returns,
       * treasury top-ups. On the wallet this was measured against, 41 of every
       * 50 rows were incoming. Dropping them here rather than downstream is
       * what stops a scan spending its whole page budget on money coming in
       * and reporting a firm as barely paying anyone.
       */
      if (row.from_address.trim().toLowerCase() !== wallet) continue;

      transfers.push({
        txHash: row.transaction_id,
        transferIndex: index,
        blockNumber: row.block ? BigInt(row.block) : null,
        blockTimestamp: new Date(row.block_ts),
        fromAddress: row.from_address,
        toAddress: row.to_address,
        assetSymbol: row.tokenInfo?.tokenAbbr ?? "UNKNOWN",
        assetContract: row.contract_address ?? null,
        // EXACT base units, as the string the chain reported. Never parsed
        // into a JavaScript number (docs/PAYOUTS.md §5 `[LOCKED]`).
        amountBaseUnits: String(row.quant),
        decimals: row.tokenInfo?.tokenDecimal ?? 6,
        status: "success",
        // TRONSCAN reports confirmation as a boolean, not a depth. Null means
        // "not reported", which the verification gate treats as unknown
        // rather than as settled.
        confirmations: row.confirmed === true ? null : 0,
        raw: row,
      });
    }

    // Paged on the RAW row count, never the filtered one. The cursor is an
    // offset into what the API returns, so advancing it by the number of
    // outgoing rows would re-read the incoming ones forever and never reach
    // the end of a wallet's history.
    const nextCursor =
      payload.token_transfers.length >= limit
        ? String(offset + payload.token_transfers.length)
        : null;

    return { transfers, nextCursor };
  }

  /**
   * A minimal authenticated request, for the admin's connection test.
   *
   * Returns diagnostics only — status, latency. Never the key, never a header.
   */
  async testConnection(): Promise<{
    ok: boolean;
    status: string;
    latencyMs: number;
  }> {
    const started = Date.now();
    try {
      const url = new URL("/api/system/status", TRONSCAN_BASE);
      await fetchJson(url.toString(), {
        provider: this.key,
        headers: this.headers(),
        retries: 0,
        timeoutMs: 10_000,
      });
      return { ok: true, status: "OK", latencyMs: Date.now() - started };
    } catch (error) {
      return {
        ok: false,
        // ProviderError messages carry a status code, never a credential.
        status:
          error instanceof ProviderError ? error.message : "request failed",
        latencyMs: Date.now() - started,
      };
    }
  }
}
