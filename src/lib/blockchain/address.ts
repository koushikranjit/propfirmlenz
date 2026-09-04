import { createHash } from "node:crypto";

/**
 * ADDRESS VALIDATION, PER NETWORK — docs/PAYOUTS.md §6.
 *
 * A wallet is only useful if it is real on the chain it was filed under. An
 * Ethereum address saved against Tron scans forever and finds nothing, and the
 * admin has no way to tell that from a firm that simply made no payouts — the
 * exact confusion this system exists to remove.
 *
 * These are FORMAT checks. They prove an address is well-formed, not that it
 * belongs to anyone; that is what a wallet's recorded evidence is for.
 */

export type AddressFamily = "evm" | "tron";

/** Which validator a network uses. Anything else is rejected outright. */
export function addressFamilyFor(networkKey: string): AddressFamily | null {
  if (networkKey === "tron") return "tron";
  // Every EVM chain shares the 20-byte hex address format.
  if (
    [
      "ethereum",
      "bnb",
      "polygon",
      "arbitrum",
      "base",
      "optimism",
      "avalanche",
    ].includes(networkKey)
  ) {
    return "evm";
  }
  return null;
}

/**
 * EVM: 20 bytes of hex behind an `0x`.
 *
 * The EIP-55 mixed-case checksum is NOT verified: it needs keccak-256, which
 * would mean a dependency for a check that rejects nothing a well-formed
 * address would produce. Mixed case is accepted and normalised to lower case,
 * which is what matching uses everywhere.
 */
export function isValidEvmAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address.trim());
}

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Decodes base58, or null if the string contains a non-alphabet character. */
function base58Decode(input: string): Uint8Array | null {
  const bytes: number[] = [0];
  for (const char of input) {
    const value = BASE58_ALPHABET.indexOf(char);
    if (value === -1) return null;

    let carry = value;
    for (let i = 0; i < bytes.length; i += 1) {
      carry += bytes[i]! * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  // Leading '1's are leading zero bytes.
  for (const char of input) {
    if (char !== "1") break;
    bytes.push(0);
  }

  return new Uint8Array(bytes.reverse());
}

const sha256 = (data: Uint8Array): Uint8Array =>
  new Uint8Array(createHash("sha256").update(data).digest());

/**
 * TRON: base58check over 21 bytes, the first of which is 0x41.
 *
 * The checksum is genuinely verified — unlike EVM it needs only SHA-256, so a
 * mistyped address is caught here rather than after a scan returns nothing.
 */
export function isValidTronAddress(address: string): boolean {
  const trimmed = address.trim();
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed)) return false;

  const decoded = base58Decode(trimmed);
  if (!decoded || decoded.length !== 25) return false;
  if (decoded[0] !== 0x41) return false;

  const payload = decoded.slice(0, 21);
  const checksum = decoded.slice(21);
  const expected = sha256(sha256(payload)).slice(0, 4);

  return checksum.every((byte, i) => byte === expected[i]);
}

export function isValidAddressFor(
  family: AddressFamily,
  address: string,
): boolean {
  return family === "evm"
    ? isValidEvmAddress(address)
    : isValidTronAddress(address);
}

/**
 * The stored matching form.
 *
 * EVM addresses are case-insensitive, so they are lower-cased. TRON base58 IS
 * case-sensitive — lower-casing one would destroy it — so it is left exactly
 * as the chain writes it.
 */
export function normaliseAddressFor(
  family: AddressFamily,
  address: string,
): string {
  const trimmed = address.trim();
  return family === "evm" ? trimmed.toLowerCase() : trimmed;
}
