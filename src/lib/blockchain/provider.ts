/**
 * BLOCKCHAIN PROVIDER ABSTRACTION — docs/PAYOUTS.md §4 `[LOCKED]`.
 *
 * One interface between the payout pipeline and whichever service actually
 * reads a chain. Adding a network later means writing an adapter, not
 * threading a new API through the ingestion, matching and verification code.
 *
 * WHAT AN ADAPTER MUST NOT DO `[LOCKED]`:
 *
 *  - invent a transaction, an amount, a timestamp or a confirmation count;
 *  - round, scale or otherwise "tidy" an amount — base units are returned
 *    exactly as the chain reports them, as a decimal STRING, because a
 *    JavaScript number cannot hold an 18-decimal token amount;
 *  - silently return an empty page when a request failed. A failure is thrown,
 *    so ingestion records the error instead of recording "no payouts today".
 *
 * There is deliberately no built-in mock adapter. Fixtures live in tests, where
 * they cannot reach production (docs/PAYOUTS.md §4).
 */

/** A single value transfer, normalised across chains. */
export interface ChainTransfer {
  txHash: string;
  /** Which transfer within the transaction; a hash can carry several. */
  transferIndex: number;
  blockNumber: bigint | null;
  blockTimestamp: Date;
  /** Lower-cased for stable matching. */
  fromAddress: string;
  toAddress: string;
  assetSymbol: string;
  /** Token contract address, or null for the chain's native currency. */
  assetContract: string | null;
  /** EXACT smallest-unit integer, as a decimal string. Never a number. */
  amountBaseUnits: string;
  decimals: number;
  status: "success" | "failed" | "pending";
  confirmations: number | null;
  /** The provider's own payload, kept for provenance. */
  raw: unknown;
}

export interface TransferPage {
  transfers: ChainTransfer[];
  /**
   * Opaque resume point. `null` means the provider has no more pages, which
   * is what lets an incremental scan stop rather than loop.
   */
  nextCursor: string | null;
}

export interface ListTransfersOptions {
  address: string;
  /** Resume point from a previous page or scan. */
  cursor?: string | null | undefined;
  /** Provider-side cap; adapters clamp it to whatever the API allows. */
  limit?: number | undefined;
  /** Only transfers at or after this instant, where the provider supports it. */
  since?: Date | undefined;
}

export interface BlockchainProvider {
  /** Matches `blockchain_networks.provider`. */
  readonly key: string;
  /** Outgoing transfers from an address, newest first. */
  listOutgoingTransfers(options: ListTransfersOptions): Promise<TransferPage>;
}

/** A provider failure. Ingestion records it rather than treating it as "no data". */
export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(`${provider}: ${message}`);
    this.name = "ProviderError";
  }
}

/** The provider is rate limiting; the caller should back off and resume later. */
export class ProviderRateLimitError extends ProviderError {
  constructor(
    provider: string,
    readonly retryAfterMs: number | null = null,
  ) {
    super(provider, "rate limited");
    this.name = "ProviderRateLimitError";
  }
}

/**
 * Fetch with a timeout and one retry for transient failures.
 *
 * A hung request would stall a wallet scan indefinitely and, worse, leave the
 * cursor unadvanced so the next run repeats the same work.
 */
export async function fetchJson(
  url: string,
  opts: {
    provider: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
    retries?: number;
  },
): Promise<unknown> {
  const { provider, headers = {}, timeoutMs = 15_000, retries = 1 } = opts;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json", ...headers },
        signal: controller.signal,
      });

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after"));
        throw new ProviderRateLimitError(
          provider,
          Number.isFinite(retryAfter) ? retryAfter * 1000 : null,
        );
      }
      if (!response.ok) {
        throw new ProviderError(provider, `HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      // A rate limit is the caller's decision to handle, not something to
      // retry into a harder block.
      if (error instanceof ProviderRateLimitError) throw error;
      if (attempt === retries) {
        throw new ProviderError(provider, "request failed", error);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new ProviderError(provider, "unreachable");
}

/** Chains disagree on case; matching is done in lower case throughout. */
export function normaliseAddress(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * Renders a base-unit integer for display WITHOUT floating point.
 *
 * `Number("1000000000000000000") / 1e18` is already lossy for many token
 * amounts, so the split is done on the digit string itself.
 */
export function formatBaseUnits(
  amountBaseUnits: string,
  decimals: number,
  maxFractionDigits = 2,
): string {
  const digits = amountBaseUnits.replace(/^0+(?=\d)/, "");
  if (decimals === 0) return withThousands(digits);

  const padded = digits.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals);
  const fraction = padded
    .slice(padded.length - decimals)
    .slice(0, maxFractionDigits)
    .replace(/0+$/, "");

  return fraction.length > 0
    ? `${withThousands(whole)}.${fraction}`
    : withThousands(whole);
}

function withThousands(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Builds an explorer link from the network's stored template. */
export function explorerUrl(template: string, txHash: string): string {
  return template.replace("{hash}", txHash);
}
