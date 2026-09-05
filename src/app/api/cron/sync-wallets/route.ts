import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { walletsDueForScan, scanWallet } from "@/lib/services/payout-ingestion";
import { autoPublishForWallet } from "@/lib/services/payout-autopublish";
import { providerFor } from "@/lib/blockchain/adapters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * SCHEDULED WALLET SYNC — docs/PAYOUTS.md §6.
 *
 * Runs DAILY — the Vercel plan in use allows one cron run per day, so the
 * schedule is 03:00 UTC rather than hourly. Raising the frequency is a
 * one-line change in vercel.json on a plan that permits it.
 *
 * Incremental and bounded. Each run takes the wallets checked longest ago, a
 * few pages each, resuming from the stored cursor — it never rescans a chain
 * from genesis, which would burn provider quota and find nothing new.
 *
 * IT DECIDES NOTHING `[LOCKED]`. This job ingests, then releases transfers
 * from wallets A PERSON HAS ALREADY MARKED verified trader payouts. That
 * standing authorisation is the human decision (docs/PAYOUTS.md §7); the job
 * only acts on it. For every other wallet — unknown purpose, unverified,
 * disputed — transfers stay in the queue exactly as before, and no unattended
 * code path can promote them.
 *
 * AUTHORISATION: Vercel signs cron requests with `CRON_SECRET`. Without that
 * variable set the route refuses everything — a sync endpoint anyone could
 * call is a way to exhaust a metered API key from the outside.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Scheduled sync is not configured." },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    // Deny by default, and say nothing about why.
    return new NextResponse(null, { status: 404 });
  }

  const db = getDb();
  const due = await walletsDueForScan(db, { limit: 10 });

  const results: {
    walletId: string;
    inserted: number;
    candidates: number;
    published: number;
    error: string | null;
  }[] = [];

  for (const wallet of due) {
    const provider = providerFor(wallet);
    if (!provider) {
      results.push({
        walletId: wallet.id,
        inserted: 0,
        candidates: 0,
        published: 0,
        // A missing credential is reported, never silently treated as "no
        // payouts" — the two are indistinguishable downstream otherwise.
        error: "provider not configured",
      });
      continue;
    }

    const result = await scanWallet(db, {
      walletId: wallet.id,
      provider,
      // Bounded per run; the cursor carries the rest to the next one.
      maxPages: 3,
    });

    // A no-op unless an admin has already verified this wallet.
    const { published } = await autoPublishForWallet(db, {
      walletId: wallet.id,
    });

    results.push({
      walletId: wallet.id,
      inserted: result.transactionsInserted,
      candidates: result.candidatesCreated,
      published,
      error: result.error,
    });
  }

  const published = results.reduce((n, r) => n + r.published, 0);
  // Only touch the public cache when the public figures actually changed.
  if (published > 0) revalidatePath("/payouts");

  return NextResponse.json({
    scanned: results.length,
    inserted: results.reduce((n, r) => n + r.inserted, 0),
    candidates: results.reduce((n, r) => n + r.candidates, 0),
    published,
    failed: results.filter((r) => r.error).length,
  });
}
