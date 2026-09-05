import { stdin, stdout } from "node:process";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { BootstrapError, bootstrapFirstAdmin } from "@/lib/auth/bootstrap";

/**
 * The first-admin bootstrap CLI.
 *
 *   pnpm admin:create
 *
 * A THIN SHELL. Every rule — email normalisation, the password minimum,
 * Argon2id hashing, the RBAC seed, the refuse-if-an-admin-exists check and the
 * transaction — lives in `src/lib/auth/bootstrap.ts`, which is unit-tested
 * against a real Postgres. This file only asks the questions and prints the
 * outcome, so there is nothing here that can drift from the tested behaviour.
 *
 * THE PASSWORD IS TYPED HERE AND NOWHERE ELSE `[LOCKED]`. It is not a command
 * argument (arguments land in shell history and in process listings) and not
 * an environment variable. It is masked while typing, never echoed, never
 * printed on success or failure, and never written to the audit log. Only the
 * Argon2id hash reaches the database.
 */

const KEY_ENTER = "\r";
const KEY_NEWLINE = "\n";
const KEY_EOF = "\u0004";
const KEY_INTERRUPT = "\u0003";
const KEY_BACKSPACE = "\u007f";

function fail(message: string): never {
  console.error(`\n  x ${message}\n`);
  process.exit(1);
}

/* ------------------------------------------------------------------ input */

/**
 * A tiny prompt reader over `stdin`.
 *
 * Deliberately NOT `readline`. Masking a readline prompt means overriding its
 * private `_writeToOutput`, and that override fights the interface's own
 * lifecycle: the second prompt in a sequence stops receiving input and the
 * script stalls with no error at all.
 *
 * ONE PERSISTENT LISTENER, and a buffer that survives between questions. A
 * listener attached per prompt loses whatever else arrived in the same chunk —
 * which is invisible when a terminal delivers one keystroke at a time, and
 * breaks immediately when input is piped and all the answers arrive at once.
 */
const isTty = Boolean(stdin.isTTY);

/** Input received but not yet consumed by a prompt. */
let buffered = "";
/** Characters typed for the prompt currently awaiting an answer (TTY only). */
let typed = "";
let awaiting: { resolve: (value: string) => void; mask: boolean } | null = null;

function finishAnswer(value: string): void {
  const pending = awaiting;
  awaiting = null;
  typed = "";
  stdout.write("\n");
  pending?.resolve(value);
}

/** Terminal input: a keystroke at a time, echoed by us so it can be masked. */
function handleKeystrokes(chunk: string): void {
  for (const ch of chunk) {
    if (!awaiting) {
      buffered += ch;
      continue;
    }
    if (ch === KEY_ENTER || ch === KEY_NEWLINE || ch === KEY_EOF) {
      finishAnswer(typed);
      continue;
    }
    // Raw mode disables the default handler, so Ctrl-C is honoured here.
    if (ch === KEY_INTERRUPT) {
      closePrompts();
      stdout.write("\n");
      process.exit(130);
    }
    if (ch === KEY_BACKSPACE || ch === "\b") {
      if (typed.length > 0) {
        typed = typed.slice(0, -1);
        stdout.write("\b \b");
      }
      continue;
    }
    typed += ch;
    stdout.write(awaiting.mask ? "*" : ch);
  }
}

/** Piped input: whole lines, possibly several in one chunk. */
function handleLines(chunk: string): void {
  buffered += chunk;
  drainBufferedLine();
}

function drainBufferedLine(): void {
  if (!awaiting) return;
  const index = buffered.search(/[\r\n]/);
  if (index === -1) return;

  const line = buffered.slice(0, index);
  let rest = buffered.slice(index + 1);
  // Consume the second half of a CRLF pair so it does not end the next answer.
  if (buffered[index] === KEY_ENTER && rest.startsWith(KEY_NEWLINE)) {
    rest = rest.slice(1);
  }
  buffered = rest;
  finishAnswer(line);
}

stdin.setEncoding("utf8");
if (isTty) stdin.setRawMode(true);
stdin.resume();
stdin.on("data", (chunk: string) =>
  isTty ? handleKeystrokes(chunk) : handleLines(chunk),
);

function prompt(question: string, { mask = false } = {}): Promise<string> {
  return new Promise((resolve) => {
    stdout.write(question);
    awaiting = { resolve, mask };
    // Input for this answer may already have arrived in an earlier chunk.
    if (!isTty) drainBufferedLine();
  });
}

/** Restores the terminal once every question has been answered. */
function closePrompts(): void {
  stdin.removeAllListeners("data");
  if (isTty) stdin.setRawMode(false);
  stdin.pause();
}

/* ------------------------------------------------------------------- main */

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!url) {
    closePrompts();
    fail(
      "No database URL is configured.\n" +
        "    Run this from the project root so .env.local is loaded.",
    );
  }

  const target = url.includes("-pooler.") ? "pooled" : "direct";
  console.log("\n  Prop Firm Lenz - first admin bootstrap");
  console.log(`  Database: ${new URL(url).host} (${target})`);
  console.log(
    "  Creates ONE master admin. Refuses if any admin already exists.",
  );
  console.log("  The password is masked, never printed, and never logged.\n");

  const email = await prompt("  Email:      ");
  const fullName = await prompt("  Full name:  ");
  const password = await prompt("  Password:   ", { mask: true });
  const confirm = await prompt("  Confirm:    ", { mask: true });

  closePrompts();

  if (password !== confirm) fail("The two passwords do not match.");

  const sql = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(sql, { schema });

  try {
    const result = await bootstrapFirstAdmin(db, { email, fullName, password });

    console.log("\n  Master admin created.");
    console.log(`    Email : ${result.email}`);
    console.log(`    Role  : ${result.role}`);
    console.log("\n  Sign in at /admin/login.");
    console.log(
      "  Nothing about the password was printed, logged or stored.\n",
    );
  } catch (error) {
    if (error instanceof BootstrapError) fail(error.message);
    // Never surface a driver error verbatim: it can carry the connection
    // string, and that string carries the database password.
    fail("The bootstrap failed. Check the database connection and try again.");
  } finally {
    await sql.end();
  }
}

await main();
