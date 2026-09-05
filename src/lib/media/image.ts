/**
 * Image validation and dimension probing — no dependency, no decoding.
 *
 * WHY DIMENSIONS ARE MANDATORY: `media_image_dimensions_ck` refuses an image
 * row without width and height, because rendering an image without them causes
 * layout shift, and CLS ≤ 0.1 is a binding budget (CLAUDE.md §7). Reading them
 * from the file header is also a real format check — a file that claims to be a
 * PNG but has no IHDR is rejected before it is ever stored.
 *
 * SVG IS NOT ALLOWED `[LOCKED]`. It is a script-bearing document, and serving
 * one from a domain the site trusts is a stored-XSS vector. Raster only.
 */

export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** A logo. Generous for a transparent PNG, far below any abuse threshold. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export interface ImageInfo {
  mimeType: AllowedImageType;
  width: number;
  height: number;
}

export class ImageError extends Error {
  constructor(
    readonly code:
      | "EMPTY"
      | "TOO_LARGE"
      | "UNSUPPORTED_TYPE"
      | "CORRUPT"
      | "TOO_SMALL_DIMENSIONS",
    message: string,
  ) {
    super(message);
    this.name = "ImageError";
  }
}

/**
 * Identifies the format from the BYTES, not from the declared MIME type or the
 * file extension — both are attacker-controlled.
 */
export function inspectImage(bytes: Uint8Array): ImageInfo {
  if (bytes.length === 0) {
    throw new ImageError("EMPTY", "That file is empty.");
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new ImageError(
      "TOO_LARGE",
      `That file is larger than ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`,
    );
  }

  const info = png(bytes) ?? jpeg(bytes) ?? webp(bytes);
  if (!info) {
    throw new ImageError(
      "UNSUPPORTED_TYPE",
      "Use a PNG, JPEG or WebP image. SVG is not accepted.",
    );
  }
  if (info.width < 16 || info.height < 16) {
    throw new ImageError(
      "TOO_SMALL_DIMENSIONS",
      "That image is too small to use as a logo.",
    );
  }
  return info;
}

const startsWith = (bytes: Uint8Array, signature: number[]): boolean =>
  signature.every((byte, i) => bytes[i] === byte);

const readU32BE = (b: Uint8Array, o: number): number =>
  ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;

const readU16BE = (b: Uint8Array, o: number): number =>
  (b[o]! << 8) | b[o + 1]!;

const readU16LE = (b: Uint8Array, o: number): number =>
  b[o]! | (b[o + 1]! << 8);

const readU32LE = (b: Uint8Array, o: number): number =>
  (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;

/** PNG: 8-byte signature, then an IHDR chunk carrying the dimensions. */
function png(b: Uint8Array): ImageInfo | null {
  if (!startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return null;
  }
  // Bytes 12-15 must spell IHDR, or the file is not a usable PNG.
  if (String.fromCharCode(...b.slice(12, 16)) !== "IHDR") {
    throw new ImageError("CORRUPT", "That PNG could not be read.");
  }
  return {
    mimeType: "image/png",
    width: readU32BE(b, 16),
    height: readU32BE(b, 20),
  };
}

/** JPEG: walk the segment markers to the frame header (SOF0–SOF15). */
function jpeg(b: Uint8Array): ImageInfo | null {
  if (!startsWith(b, [0xff, 0xd8])) return null;

  let offset = 2;
  while (offset + 9 < b.length) {
    if (b[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = b[offset + 1]!;
    // SOF0..SOF15, excluding the DHT/JPG/DAC markers interleaved in the range.
    const isFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isFrame) {
      return {
        mimeType: "image/jpeg",
        height: readU16BE(b, offset + 5),
        width: readU16BE(b, offset + 7),
      };
    }
    const length = readU16BE(b, offset + 2);
    if (length < 2) break;
    offset += 2 + length;
  }
  throw new ImageError("CORRUPT", "That JPEG could not be read.");
}

/** WebP: RIFF container, then one of three chunk layouts. */
function webp(b: Uint8Array): ImageInfo | null {
  if (
    !startsWith(b, [0x52, 0x49, 0x46, 0x46]) ||
    String.fromCharCode(...b.slice(8, 12)) !== "WEBP"
  ) {
    return null;
  }

  const chunk = String.fromCharCode(...b.slice(12, 16));

  if (chunk === "VP8 " && b.length > 29) {
    // Frame tag (3) + sync code (3) precede the 14-bit little-endian pair.
    return {
      mimeType: "image/webp",
      width: readU16LE(b, 26) & 0x3fff,
      height: readU16LE(b, 28) & 0x3fff,
    };
  }
  if (chunk === "VP8L" && b.length > 24) {
    // 14 bits each, packed little-endian starting after the 1-byte signature.
    const bits = readU32LE(b, 21);
    return {
      mimeType: "image/webp",
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  if (chunk === "VP8X" && b.length > 29) {
    // 24-bit little-endian, stored as (dimension - 1).
    const at = (o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);
    return {
      mimeType: "image/webp",
      width: at(24) + 1,
      height: at(27) + 1,
    };
  }

  throw new ImageError("CORRUPT", "That WebP could not be read.");
}
