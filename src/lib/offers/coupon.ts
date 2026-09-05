/**
 * THE DEFAULT COUPON CODE — `LENZ`.
 *
 * Prop Firm Lenz negotiates its own code with most firms, so `LENZ` is what an
 * offer carries unless a firm publishes something else. Defining it once, here,
 * is the whole point: the admin form, the firm profile and `/offers` all read
 * this module rather than each spelling the string out, so changing the default
 * is one edit and no surface can drift to a stale value (CLAUDE.md §3).
 *
 * IT IS A DEFAULT, NOT A FACT `[LOCKED]`. The database remains the source of
 * truth. A stored code always wins — `SAVE10` stays `SAVE10` — and this only
 * fills the gap where no code was ever entered.
 *
 * WHAT IT MUST NEVER IMPLY. A code is not a discount. Defaulting the code says
 * nothing about a percentage, a title, or an expiry date: those stay empty
 * until an admin enters what the firm actually published, and a firm with no
 * active offer shows no offer at all. Inventing "20% off" to sit beside a
 * defaulted code is exactly the fabrication §3 forbids.
 */
export const DEFAULT_COUPON_CODE = "LENZ";

/**
 * The code to show for an offer, given whatever is stored.
 *
 * Blank and whitespace-only are treated as absent: a code saved as `"   "` is
 * not a code a visitor can type.
 */
export function resolveCouponCode(stored: string | null | undefined): string {
  const trimmed = stored?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_COUPON_CODE;
}

/** Whether a firm has explicitly chosen a code other than the default. */
export function hasCustomCouponCode(
  stored: string | null | undefined,
): boolean {
  const trimmed = stored?.trim();
  return Boolean(
    trimmed &&
      trimmed.length > 0 &&
      trimmed.toUpperCase() !== DEFAULT_COUPON_CODE,
  );
}
