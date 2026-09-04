import type { Database } from "@/lib/db/types";
import type { FirmPayoutEvidence } from "@/components/public/firm-profile/PayoutEvidence";
import {
  getFirmPayoutTotals,
  listRecentVerifiedPayouts,
} from "./public-payouts";

/**
 * One firm's verified payout evidence, assembled for its profile page.
 *
 * Lives beside the public payout repository — and reads only from it — so the
 * firm profile cannot reach raw transactions or unreviewed candidates by any
 * route (docs/PAYOUTS.md §9 `[LOCKED]`).
 */
export async function firmPayoutEvidence(
  db: Database,
  firmId: string,
  opts: { limit?: number } = {},
): Promise<FirmPayoutEvidence> {
  const [totals, recent] = await Promise.all([
    getFirmPayoutTotals(db, firmId),
    listRecentVerifiedPayouts(db, { firmId, limit: opts.limit ?? 10 }),
  ]);

  return {
    count: totals.count,
    usdValue: totals.usdValue,
    usdValuedCount: totals.usdValuedCount,
    latestAt: totals.latestAt,
    recent,
  };
}
