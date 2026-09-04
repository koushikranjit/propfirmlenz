import { createHash, createHmac } from "node:crypto";

/**
 * OBJECT STORAGE — Cloudflare R2, the locked provider (CLAUDE.md §12.4b).
 *
 * Signed with SigV4 against R2's S3-compatible API using only `node:crypto`.
 * An SDK would add a dependency (and an approval, §9) to do what ~40 lines of
 * HMAC does for a single authenticated PUT.
 *
 * NOT CONFIGURED IS A FIRST-CLASS STATE `[LOCKED]`. `mediaStorage()` returns
 * null when the credentials are absent, and the admin UI says so plainly. It
 * never falls back to the local filesystem: a path that works on a laptop and
 * 404s in production is worse than an upload button that admits it cannot run.
 *
 * Credentials are read from the environment on the SERVER only. Nothing here is
 * importable from a client component, and no value is ever returned to the
 * browser (CLAUDE.md §6).
 */

export interface StoredObject {
  storageKey: string;
  publicUrl: string;
}

export interface MediaStorage {
  readonly provider: "r2";
  put(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<StoredObject>;
  delete(key: string): Promise<void>;
}

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Where the objects are readable from — a custom domain or r2.dev host. */
  publicBaseUrl: string;
}

function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim();

  if (
    !accountId ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucket ||
    !publicBaseUrl
  ) {
    return null;
  }
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ""),
  };
}

/** Which variables are missing, for an honest admin message. Names only. */
export function missingStorageVars(): string[] {
  return [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
    "R2_PUBLIC_BASE_URL",
  ].filter((name) => !process.env[name]?.trim());
}

const sha256Hex = (data: Uint8Array | string): string =>
  createHash("sha256").update(data).digest("hex");

const hmac = (key: Uint8Array | string, data: string): Buffer =>
  createHmac("sha256", key).update(data, "utf8").digest();

/**
 * Every byte of the path is signed, so the key is encoded exactly once and the
 * same encoding is used for the request and the signature.
 */
function encodeKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

class R2Storage implements MediaStorage {
  readonly provider = "r2" as const;

  constructor(private readonly config: R2Config) {}

  private get host(): string {
    return `${this.config.accountId}.r2.cloudflarestorage.com`;
  }

  private sign(input: {
    method: "PUT" | "DELETE";
    key: string;
    payloadHash: string;
    contentType?: string;
  }): { url: string; headers: Record<string, string> } {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    // R2 has no regions; "auto" is what its S3 API expects.
    const region = "auto";
    const service = "s3";
    const scope = `${dateStamp}/${region}/${service}/aws4_request`;

    const path = `/${this.config.bucket}/${encodeKey(input.key)}`;
    const headers: Record<string, string> = {
      host: this.host,
      "x-amz-content-sha256": input.payloadHash,
      "x-amz-date": amzDate,
    };
    if (input.contentType) headers["content-type"] = input.contentType;

    const signedHeaders = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaders
      .map((h) => `${h}:${headers[h]}\n`)
      .join("");
    const signedHeaderList = signedHeaders.join(";");

    const canonicalRequest = [
      input.method,
      path,
      "",
      canonicalHeaders,
      signedHeaderList,
      input.payloadHash,
    ].join("\n");

    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      scope,
      sha256Hex(canonicalRequest),
    ].join("\n");

    const signingKey = hmac(
      hmac(
        hmac(hmac(`AWS4${this.config.secretAccessKey}`, dateStamp), region),
        service,
      ),
      "aws4_request",
    );
    const signature = createHmac("sha256", signingKey)
      .update(stringToSign, "utf8")
      .digest("hex");

    return {
      url: `https://${this.host}${path}`,
      headers: {
        ...headers,
        authorization:
          `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${scope}, ` +
          `SignedHeaders=${signedHeaderList}, Signature=${signature}`,
      },
    };
  }

  async put(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<StoredObject> {
    const { url, headers } = this.sign({
      method: "PUT",
      key: input.key,
      payloadHash: sha256Hex(input.body),
      contentType: input.contentType,
    });

    const response = await fetch(url, {
      method: "PUT",
      headers,
      body: input.body as BodyInit,
    });

    if (!response.ok) {
      // The provider's body can echo request details; only the status leaves.
      throw new StorageError(`Upload failed (HTTP ${response.status}).`);
    }

    return {
      storageKey: input.key,
      publicUrl: `${this.config.publicBaseUrl}/${encodeKey(input.key)}`,
    };
  }

  async delete(key: string): Promise<void> {
    const { url, headers } = this.sign({
      method: "DELETE",
      key,
      payloadHash: sha256Hex(new Uint8Array()),
    });
    const response = await fetch(url, { method: "DELETE", headers });
    // 404 means it is already gone, which is the state we wanted.
    if (!response.ok && response.status !== 404) {
      throw new StorageError(`Delete failed (HTTP ${response.status}).`);
    }
  }
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

/** The configured storage, or null when credentials are absent. */
export function mediaStorage(): MediaStorage | null {
  const config = r2Config();
  return config ? new R2Storage(config) : null;
}
