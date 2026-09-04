import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { walletsDueForScan, scanWallet } from "@/lib/services/payout-ingestion";
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
 * IT ONLY INGESTS. Transfers become CANDIDATES; nothing is verified and
 * nothing reaches the public site without a person deciding
 * (docs/PAYOUTS.md §7 `[LOCKED]`). An unattended job must not be able to
 * publish a payout.
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
    error: string | null;
  }[] = [];

  for (const wallet of due) {
    const provider = providerFor(wallet);
    if (!provider) {
      results.push({
        walletId: wallet.id,
        inserted: 0,
        candidates: 0,
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
    results.push({
      walletId: wallet.id,
      inserted: result.transactionsInserted,
      candidates: result.candidatesCreated,
      error: result.error,
    });
  }

  return NextResponse.json({
    scanned: results.length,
    inserted: results.reduce((n, r) => n + r.inserted, 0),
    candidates: results.reduce((n, r) => n + r.candidates, 0),
    failed: results.filter((r) => r.error).length,
  });
}
