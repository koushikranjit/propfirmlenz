import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * The bootstrap CLI's prompt plumbing — a regression guard.
 *
 * WHY THIS EXISTS. The CLI shipped once with a prompt implementation that
 * stalled silently after the second question: it attached a fresh `stdin`
 * listener per prompt, so every answer that arrived in the same chunk as the
 * first was discarded. Nothing errored — the process simply hung, and then a
 * later revision crashed with `closePrompts is not defined`. Neither failure
 * was catchable by a unit test of the service, because both were in the shell
 * around it.
 *
 * So this runs the REAL script as a subprocess with piped answers and asserts
 * it gets all the way through the questions to the database call. It points at
 * an unreachable database on purpose: reaching the connection error proves the
 * four prompts completed, while guaranteeing the test can never create an
 * admin anywhere.
 */

const UNREACHABLE_DB = "postgresql://u:p@127.0.0.1:59999/none";
const SENTINEL_PASSWORD = "a-long-enough-password-for-the-policy";

function runCli(input: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--experimental-transform-types",
        "--no-warnings",
        "--import",
        "./scripts/ts-alias-loader.mjs",
        "scripts/create-admin.ts",
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          // Overrides whatever .env.local holds, so a developer running the
          // suite locally cannot point this at a real database.
          DATABASE_URL_DIRECT: UNREACHABLE_DB,
          DATABASE_URL: UNREACHABLE_DB,
        },
      },
    );

    let output = "";
    child.stdout.on("data", (d: Buffer) => (output += d.toString()));
    child.stderr.on("data", (d: Buffer) => (output += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, output }));

    child.stdin.write(input);
    child.stdin.end();
  });
}

describe("bootstrap CLI", () => {
  it("collects all four answers and reaches the database call", async () => {
    const { code, output } = await runCli(
      [
        "owner@example.test",
        "Example Owner",
        SENTINEL_PASSWORD,
        SENTINEL_PASSWORD,
        "",
      ].join("\n"),
    );

    // Every prompt was shown, in order — the stall reproduced as a missing
    // "Password:" prompt and a process that never exited.
    for (const label of ["Email:", "Full name:", "Password:", "Confirm:"]) {
      expect(output).toContain(label);
    }

    // It got past the questions and into the service, which then failed to
    // connect. That failure is the proof the prompts completed.
    expect(output).toContain("The bootstrap failed");
    expect(code).not.toBe(0);

    // And it did not crash on its own cleanup.
    expect(output).not.toContain("closePrompts is not defined");
    expect(output).not.toContain("ReferenceError");
  }, 60_000);

  it("never echoes, prints or logs the password", async () => {
    const { output } = await runCli(
      [
        "owner@example.test",
        "Example Owner",
        SENTINEL_PASSWORD,
        SENTINEL_PASSWORD,
        "",
      ].join("\n"),
    );
    expect(output).not.toContain(SENTINEL_PASSWORD);
  }, 60_000);

  it("never leaks the connection string, which carries the DB password", async () => {
    const { output } = await runCli(
      [
        "owner@example.test",
        "Example Owner",
        SENTINEL_PASSWORD,
        SENTINEL_PASSWORD,
        "",
      ].join("\n"),
    );

    // The host is shown deliberately so an operator can confirm which database
    // they are about to write to; the credentials in the URL are not.
    expect(output).not.toContain(UNREACHABLE_DB);
    expect(output).not.toMatch(/postgres(ql)?:\/\/[^@\s]*:[^@\s]*@/);
  }, 60_000);

  it("refuses mismatched confirmation before touching the database", async () => {
    const { code, output } = await runCli(
      [
        "owner@example.test",
        "Example Owner",
        SENTINEL_PASSWORD,
        "a-different-password-entirely",
        "",
      ].join("\n"),
    );

    expect(output).toContain("do not match");
    // It stopped at the mismatch rather than attempting to connect.
    expect(output).not.toContain("The bootstrap failed");
    expect(code).not.toBe(0);
  }, 60_000);
});
