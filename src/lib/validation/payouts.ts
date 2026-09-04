import { z } from "zod";
import {
  CANDIDATE_STATUS,
  WALLET_PURPOSES,
  WALLET_VERIFICATION_STATUS,
} from "@/lib/db/schema/payouts";

/**
 * Payout admin form schemas — docs/PAYOUTS.md §11.
 *
 * The boundary between an HTML form and the payout services. Two rules run
 * through all of it:
 *
 *  1. A USD valuation is all-or-nothing. Value, rate, source and rate time are
 *     accepted together or not at all, because a dollar figure whose rate
 *     nobody recorded is a number we cannot defend — and the database's CHECK
 *     constraint agrees (docs/PAYOUTS.md §8 `[LOCKED]`).
 *  2. Nothing here can invent chain data. The forms describe what to WATCH and
 *     what a human DECIDED; amounts, hashes and timestamps only ever arrive
 *     from a provider.
 */

/** Adapters that actually exist. A network cannot name a provider we cannot run. */
export const PROVIDER_KEYS = ["trongrid", "etherscan"] as const;
export type ProviderKey = (typeof PROVIDER_KEYS)[number];

const KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Mirrors `tracked_wallets_address_ck`. Deliberately chain-agnostic. */
const ADDRESS = /^[A-Za-z0-9:_-]{8,128}$/;

const blankToNull = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : v));

const trimmed = (max: number) => z.string().trim().min(1).max(max);

/* ---------------------------------------------------------------- networks */

export const networkFormSchema = z.object({
  id: z.uuid().optional(),
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(KEY, "Use lower-case words separated by hyphens.")
    .max(40),
  name: trimmed(80),
  chainId: blankToNull
    .refine(
      (v) => v === null || (/^\d+$/.test(v) && Number(v) > 0),
      "Enter the numeric EVM chain id, or leave blank for a non-EVM chain.",
    )
    .transform((v) => (v === null ? null : Number(v))),
  nativeSymbol: z.string().trim().min(1).max(12).toUpperCase(),
  explorerTxTemplate: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v.startsWith("https://"), "The explorer must be https.")
    .refine(
      (v) => v.includes("{hash}"),
      "Include {hash} where the transaction hash goes.",
    ),
  provider: z.enum(PROVIDER_KEYS),
  confirmationsRequired: z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(v), "Enter a whole number.")
    .transform(Number)
    .refine((n) => n >= 0 && n <= 1000, "Between 0 and 1000."),
  isActive: z.boolean(),
});

export type NetworkFormInput = z.infer<typeof networkFormSchema>;

/**
 * An EVM explorer adapter cannot work without a chain id, so a network that
 * would never scan is rejected at the form rather than failing silently later.
 */
export const networkSchema = networkFormSchema.refine(
  (n) => n.provider !== "etherscan" || n.chainId !== null,
  { path: ["chainId"], message: "Etherscan networks need their chain id." },
);

/* ----------------------------------------------------------------- wallets */

export const walletFormSchema = z.object({
  id: z.uuid().optional(),
  propFirmId: z.uuid(),
  networkId: z.uuid(),
  address: z
    .string()
    .trim()
    .regex(ADDRESS, "That does not look like a wallet address."),
  label: blankToNull.pipe(z.string().max(120).nullable()),
  purpose: z.enum(WALLET_PURPOSES),
  verificationStatus: z.enum(WALLET_VERIFICATION_STATUS),
  /** Admin research note. Never rendered publicly. */
  notes: blankToNull.pipe(z.string().max(2000).nullable()),
  isActive: z.boolean(),
});

export type WalletFormInput = z.infer<typeof walletFormSchema>;

/* -------------------------------------------------------------- review queue */

/**
 * An optional valuation, supplied by the reviewer.
 *
 * Either every part is present or none is. There is no partial state in which
 * a value could be stored without the rate that produced it.
 */
export const usdValuationSchema = z
  .object({
    value: blankToNull,
    rate: blankToNull,
    source: blankToNull,
    rateAt: blankToNull,
  })
  .transform((raw, ctx) => {
    const parts = [raw.value, raw.rate, raw.source, raw.rateAt];
    if (parts.every((p) => p === null)) return null;

    if (parts.some((p) => p === null)) {
      ctx.addIssue({
        code: "custom",
        message:
          "A dollar value needs its rate, the source of that rate, and when it was taken.",
      });
      return z.NEVER;
    }

    const value = Number(raw.value);
    const rate = Number(raw.rate);
    const rateAt = new Date(raw.rateAt as string);
    if (!Number.isFinite(value) || value <= 0) {
      ctx.addIssue({ code: "custom", message: "Enter the dollar value." });
      return z.NEVER;
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      ctx.addIssue({ code: "custom", message: "Enter the rate used." });
      return z.NEVER;
    }
    if (Number.isNaN(rateAt.getTime())) {
      ctx.addIssue({
        code: "custom",
        message: "Enter when the rate was taken.",
      });
      return z.NEVER;
    }

    return {
      value: value.toFixed(2),
      rate: rate.toFixed(10),
      source: raw.source as string,
      rateAt,
    };
  });

export const verifyFormSchema = z.object({
  candidateId: z.uuid(),
  note: blankToNull.pipe(z.string().max(1000).nullable()),
  usd: usdValuationSchema,
});

export const rejectFormSchema = z.object({
  candidateId: z.uuid(),
  /** Mandatory: a rejection nobody can account for is not a decision. */
  reason: trimmed(1000),
});

export const candidateQuerySchema = z.object({
  status: z.enum(CANDIDATE_STATUS).catch("detected"),
  page: z.coerce.number().int().min(1).max(500).catch(1),
});

export type CandidateQuery = z.infer<typeof candidateQuerySchema>;
