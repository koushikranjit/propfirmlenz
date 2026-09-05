/**
 * PROVIDER, NETWORK AND TOKEN REFERENCE DATA — docs/PAYOUTS.md §3, §5.
 *
 * Configuration an operator would otherwise type by hand, wrong. It is
 * structural, not business data: contract addresses are facts published by the
 * issuer, and every one below carries the URL it was read from
 * (CLAUDE.md §3).
 *
 * NOTHING HERE IS A PAYOUT. Seeding a token contract says "this asset exists
 * and we can recognise it", not that any firm ever sent one.
 */

export interface SeedProvider {
  key: string;
  name: string;
  /** The env var NAME the API key lives in. Never a value. */
  credentialEnvVar: string;
}

export const SEED_PROVIDERS: SeedProvider[] = [
  {
    key: "etherscan",
    name: "Etherscan",
    credentialEnvVar: "ETHERSCAN_API_KEY",
  },
  {
    key: "tronscan",
    name: "TRONSCAN",
    credentialEnvVar: "TRONSCAN_API_KEY",
  },
];

export interface SeedNetwork {
  key: string;
  name: string;
  chainId: number | null;
  nativeSymbol: string;
  explorerTxTemplate: string;
  provider: string;
  confirmationsRequired: number;
}

export const SEED_NETWORKS: SeedNetwork[] = [
  {
    key: "ethereum",
    name: "Ethereum Mainnet",
    chainId: 1,
    nativeSymbol: "ETH",
    explorerTxTemplate: "https://etherscan.io/tx/{hash}",
    provider: "etherscan",
    // ~12 blocks is the conventional "settled" depth on Ethereum.
    confirmationsRequired: 12,
  },
  {
    key: "tron",
    name: "TRON Mainnet",
    chainId: null,
    nativeSymbol: "TRX",
    explorerTxTemplate: "https://tronscan.org/#/transaction/{hash}",
    provider: "tronscan",
    // Tron finalises on a 27-block super-representative round.
    confirmationsRequired: 27,
  },
];

export interface SeedToken {
  networkKey: string;
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  /** Where the contract was read from. Re-checkable, not remembered. */
  sourceUrl: string;
  /** Enabled only when the issuer publishes the contract for that chain. */
  isEnabled: boolean;
}

/**
 * THE CONFIGURED STABLECOINS.
 *
 * Each contract below was read from the ISSUER on 2026-09-04, not recalled:
 * Tether publishes its own contracts, and Circle publishes its own.
 *
 * `decimals` is a cross-check, not the source of truth. Ingestion uses the
 * decimals the PROVIDER reports for each transfer and flags a mismatch, so a
 * wrong value here surfaces as a warning rather than silently mis-scaling
 * every amount by a factor of a thousand.
 *
 * USDC ON TRON IS ABSENT, DELIBERATELY. Circle's official contract list does
 * not include TRON, so there is no issuer-published contract to configure. An
 * address found elsewhere and assumed to be right is exactly the guess
 * docs/PAYOUTS.md §5 forbids — the admin UI reports it as not configured.
 */
export const SEED_TOKENS: SeedToken[] = [
  {
    networkKey: "ethereum",
    contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    sourceUrl: "https://tether.to/en/supported-protocols/",
    isEnabled: true,
  },
  {
    networkKey: "ethereum",
    contractAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    sourceUrl:
      "https://developers.circle.com/stablecoins/usdc-contract-addresses",
    isEnabled: true,
  },
  {
    networkKey: "tron",
    contractAddress: "tr7nhqjekqxgtci8q8zy4pl8otszgjlj6t",
    symbol: "USDT",
    name: "Tether USD (TRC-20)",
    decimals: 6,
    sourceUrl: "https://tether.to/en/supported-protocols/",
    isEnabled: true,
  },
];

/** Tokens an operator might expect to find, and why they are not configured. */
export const UNCONFIGURED_TOKENS: {
  networkKey: string;
  symbol: string;
  reason: string;
}[] = [
  {
    networkKey: "tron",
    symbol: "USDC",
    reason:
      "Circle's official USDC contract list does not include TRON, so there is no issuer-published contract to configure. Adding an address from anywhere else would be a guess.",
  },
];
