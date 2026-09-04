import { createInterface } from "node:readline";
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

function fail(message: string): never {
  console.error(`\n  x ${message}\n`);
  process.exit(1);
}

function prompt(question: string, { mask = false } = {}): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (mask) {
      const internal = rl as unknown as {
        _writeToOutput: (s: string) => void;
      };
      const original = internal._writeToOutput.bind(rl);
      internal._writeToOutput = (s: string) => {
        // Echo the prompt itself; replace typed characters with a mask.
        if (s.includes(question)) original(s);
        else process.stdout.write("*");
      };
    }

    rl.question(question, (answer) => {
      rl.close();
      if (mask) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!url) {
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

  if (password !== confirm) fail("The two passwords do not match.");

  const sql = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(sql, { schema });

  try {
    const result = await bootstrapFirstAdmin(db, {
      email,
      fullName,
      password,
    });

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
