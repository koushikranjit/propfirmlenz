import { afterEach, describe, expect, it, vi } from "vitest";
import { checkStorage, missingStorageVars } from "./storage";

/**
 * THE STORAGE SELF-TEST — docs/ADMIN.md.
 *
 * No bucket is touched: `fetch` is stubbed, because a test that uploads to
 * real object storage fails whenever someone else's credentials expire.
 *
 * What is under test is the DIAGNOSIS. Four of the five variables fail loudly
 * when wrong; `R2_PUBLIC_BASE_URL` fails silently — uploads succeed and every
 * logo then 404s for readers — so the check must fail on the read leg alone,
 * and must never report a credential while explaining any of it.
 */

const CONFIG = {
  R2_ACCOUNT_ID: "example-account",
  R2_ACCESS_KEY_ID: "example-key-id",
  R2_SECRET_ACCESS_KEY: "example-secret-value-not-real",
  R2_BUCKET: "example-bucket",
  R2_PUBLIC_BASE_URL: "https://media.example.test",
};

function configure(): void {
  for (const [name, value] of Object.entries(CONFIG)) {
    vi.stubEnv(name, value);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Answers each leg by method, so the three can be failed independently. */
function stubFetch(handlers: {
  put?: () => Response;
  get?: () => Response;
  delete?: () => Response;
}) {
  const calls: { method: string; url: string }[] = [];
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ method, url: String(input) });
    if (method === "PUT") return handlers.put?.() ?? new Response(null, { status: 200 });
    if (method === "DELETE")
      return handlers.delete?.() ?? new Response(null, { status: 204 });
    return handlers.get?.() ?? new Response("ok", { status: 200 });
  });
  return calls;
}

describe("media storage self-test", () => {
  it("reports what is missing, by name, when nothing is configured", async () => {
    for (const name of Object.keys(CONFIG)) vi.stubEnv(name, "");

    expect(missingStorageVars()).toEqual(Object.keys(CONFIG));

    const check = await checkStorage();
    expect(check.ok).toBe(false);
    expect(check.steps[0]?.detail).toContain("R2_PUBLIC_BASE_URL");
    // Names only. Nothing that could be a credential.
    expect(JSON.stringify(check)).not.toContain(CONFIG.R2_SECRET_ACCESS_KEY);
  });

  it("passes when the object writes, reads back and deletes", async () => {
    configure();
    const calls = stubFetch({});

    const check = await checkStorage();

    expect(check.ok).toBe(true);
    expect(check.steps.map((s) => [s.step, s.ok])).toEqual([
      ["write", true],
      ["read", true],
      ["cleanup", true],
    ]);
    // The read leg must go to the PUBLIC url, not the S3 endpoint — testing
    // the endpoint we just wrote to would prove nothing about what a visitor
    // can see.
    const read = calls.find((c) => c.method === "GET");
    expect(read?.url.startsWith(CONFIG.R2_PUBLIC_BASE_URL)).toBe(true);
  });

  it("FAILS when the object writes but is not publicly readable", async () => {
    /*
     * The silent failure this whole check exists for. Without the read leg an
     * admin would see a successful upload, a media row, and a logo that 404s
     * for every reader.
     */
    configure();
    stubFetch({ get: () => new Response("denied", { status: 403 }) });

    const check = await checkStorage();

    expect(check.ok).toBe(false);
    expect(check.steps.find((s) => s.step === "write")?.ok).toBe(true);
    const read = check.steps.find((s) => s.step === "read");
    expect(read?.ok).toBe(false);
    expect(read?.detail).toContain("R2_PUBLIC_BASE_URL");
    // It still cleans up after itself.
    expect(check.steps.find((s) => s.step === "cleanup")?.ok).toBe(true);
  });

  it("stops at the write, and blames the right things", async () => {
    configure();
    stubFetch({ put: () => new Response("nope", { status: 403 }) });

    const check = await checkStorage();

    expect(check.ok).toBe(false);
    expect(check.steps).toHaveLength(1);
    expect(check.steps[0]?.detail).toMatch(/write access/i);
    // The provider's own body can echo request details; only the status may
    // leave (CLAUDE.md §6).
    expect(JSON.stringify(check)).not.toContain("nope");
  });

  it("still passes when only the cleanup fails", async () => {
    // Storage works; there is simply a stray probe object. Reporting that as
    // a red cross would send someone rechecking credentials that are correct.
    configure();
    stubFetch({ delete: () => new Response("denied", { status: 403 }) });

    const check = await checkStorage();

    expect(check.ok).toBe(true);
    expect(check.steps.find((s) => s.step === "cleanup")?.ok).toBe(false);
  });

  it("never puts a credential in the result, whatever fails", async () => {
    configure();
    stubFetch({
      put: () => new Response("x", { status: 500 }),
    });

    const failed = JSON.stringify(await checkStorage());
    expect(failed).not.toContain(CONFIG.R2_SECRET_ACCESS_KEY);
    expect(failed).not.toContain(CONFIG.R2_ACCESS_KEY_ID);
    expect(failed).not.toContain("Signature=");
  });
});
