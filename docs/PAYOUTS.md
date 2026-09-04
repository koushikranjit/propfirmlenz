# PAYOUTS.md — Blockchain payout intelligence

> Binding specification for the payout system. Referenced by section number throughout
> `src/lib/blockchain/**`, `src/lib/services/payout-*.ts`, `src/lib/repositories/*payouts*.ts`
> and the payout routes. Read with `CLAUDE.md` §3 (data integrity), which outranks it.

---

## 1. The governing principle `[LOCKED]`

**Show what we can prove.**

A payout is "verified" only when an independently checkable on-chain transaction backs it. Every
public figure resolves to a transaction hash a reader can open on a block explorer without trusting
Prop Firm Lenz at all.

Three consequences follow, and they constrain everything below:

1. **A firm's own published payout numbers are never verification.** They may be linked, labelled as
   the firm's own claim. They are never counted, mixed into a statistic, or used as a fallback.
2. **Coverage is partial, permanently.** Firms pay by bank transfer, card, processor, other crypto
   rails, and wallets nobody has identified. Verified on-chain volume is a **floor**, never a total.
3. **Absence proves nothing.** A firm with no verified payouts may simply not pay from an identified
   wallet. It is never presented as a negative signal.

Payout Junction is a **methodology reference only**. No wording, layout, styling, data or asset of
theirs is copied (`CLAUDE.md` §12.2).

---

## 2. Four layers, deliberately separate `[LOCKED]`

| Table                         | Holds                                                       | Public? |
| ----------------------------- | ----------------------------------------------------------- | ------- |
| `blockchain_networks`         | chains an operator has enabled, and which adapter reads them | no      |
| `tracked_wallets`             | addresses an admin watches, and why                          | no      |
| `blockchain_transactions`     | RAW chain data, exactly as observed                          | no      |
| `payout_candidates`           | a transaction that MIGHT be a trader payout                  | no      |
| `verified_payouts`            | the ones that passed verification                            | **yes** |
| `payout_verification_events`  | append-only trail of every decision                          | no      |

Collapsing these would mean every wallet movement — treasury rebalancing, gas top-ups, refunds,
exchange transfers — silently became a "trader payout". That is precisely the false statistic this
system exists to prevent. Schema: `src/lib/db/schema/payouts.ts`; migration `drizzle/0002_giant_lightspeed.sql`.

---

## 3. Networks are rows, not a shipped list `[LOCKED]`

A chain appears only when an operator adds it **and** a provider can actually serve reliable data
for it. Shipping a long list of chains implies coverage we do not have, and an unreadable network
produces empty scans that look exactly like a firm that never paid anyone.

Managed at `/admin/payouts/networks` (`catalog:manage`). `explorer_tx_template` must contain
`{hash}` — a CHECK constraint enforces it, because the explorer link is the whole claim.

---

## 4. Provider abstraction `[LOCKED]`

`src/lib/blockchain/provider.ts` defines one interface between the pipeline and whichever service
reads a chain. Adapters live in `adapters.ts` (`TronProvider`, `EvmExplorerProvider`).

**An adapter must never:**

- invent a transaction, amount, timestamp or confirmation count;
- round, scale or "tidy" an amount;
- return an empty page when a request failed — a failure is **thrown**, so ingestion records the
  error instead of recording "no payouts today".

`providerFor()` returns `null` when a required credential is absent, and callers report that as a
failure. **There is no built-in mock adapter.** Fixtures exist only in `payouts.test.ts`, where they
cannot reach production.

---

## 5. Amounts are exact integers `[LOCKED]`

Amounts are stored in the asset's smallest unit (wei, sun, satoshi) as `numeric(78,0)`, with
`decimals` alongside. A human-readable figure is derived **at render time** by `formatBaseUnits()`,
which does string arithmetic.

`Number("1234567890123456789") / 1e18` is already wrong in its final digits. A payout figure that is
quietly wrong is worse than one that is absent.

---

## 6. Ingestion `[LOCKED]`

`src/lib/services/payout-ingestion.ts`:

```
tracked wallet -> provider -> blockchain_transactions -> payout_candidates
```

- **Idempotent by construction.** Every insert is `onConflictDoNothing` against a unique key
  (`network + hash + transfer index`; one candidate per transaction). Re-running a scan after a
  crash is the intended recovery, not something to avoid.
- **It verifies nothing.** Ingestion records what a chain says and raises a candidate.
- **Failures are recorded** on the wallet (`last_scan_error`) and surfaced in the admin UI.
- `confidence` (0–100) ranks the review queue. It decides nothing.

---

## 7. Verification — six conditions, all required `[LOCKED]`

`src/lib/services/payout-verification.ts`. A candidate becomes a `verified_payout` only when:

1. a real transaction is on record;
2. it settled — failed and pending never count, and confirmations meet the network's threshold;
3. its hash is independently checkable, and the row carries the explorer link;
4. it left a wallet this firm is tracked as paying from, still active;
5. the asset and an exact non-zero amount are derivable;
6. **a human holding `firm:verify` decided it is a trader payout.**

Condition 6 is deliberate and non-negotiable. A rule confident enough to auto-verify would be
confident enough to auto-publish a treasury transfer as a trader payout, and that error is invisible
once it is in the totals. Nothing approves in bulk.

The payout row, the candidate update and the audit event commit in **one transaction**. Every
transition is appended to `payout_verification_events` with its actor: a published figure nobody can
account for is indistinguishable from a fabricated one.

---

## 8. Valuation is optional and all-or-nothing `[LOCKED]`

The on-chain amount is authoritative. A USD figure is stored only together with its rate, the source
of that rate, and when it was taken — enforced by the `verified_payouts_usd_ck` CHECK constraint.

Where no reliable rate exists, **no dollar value is stored**. Public totals therefore always publish
`usdValuedCount` beside `count`, so a sum over the priced subset can never read as a sum over all.

---

## 9. Public surface `[LOCKED]`

`src/lib/repositories/public-payouts.ts` is the only public reader. It never joins
`blockchain_transactions` or `payout_candidates`, so unreviewed data is **structurally** unable to
reach a statistic rather than filtered out by a predicate somebody might forget. Only published,
non-deleted firms are included.

Routes:

- `/payouts` — verified payouts, time windows, per-firm summaries. `noindex` while empty (a thin
  page), and excluded from the sitemap in that state.
- `/payouts/methodology` — §10.
- `/prop-firms/[slug]` — a "Verified payouts" section, passed to `FirmProfile` as a **required**
  prop so the admin preview cannot silently omit it (`CLAUDE.md` §12.4f rules 34–35).

Naming is load-bearing: `verifiedVolume`, never `totalVolume`. No label anywhere says "total".

---

## 10. The methodology page

`/payouts/methodology` explains, in original Prop Firm Lenz wording: wallet tracking and
classification, transaction reading, why every transfer is only a candidate, the human decision, the
audit trail — and then the limits: floor not total, absence proves nothing, firm-reported figures are
not verification, exact amounts with possibly-missing valuations, and that verification is not
endorsement or financial advice.

A verified-payout claim is only worth something if the reader knows what was actually checked.

---

## 11. Admin surface

| Route                       | View          | Act                                    |
| --------------------------- | ------------- | -------------------------------------- |
| `/admin/payouts`            | `firm:read`   | `firm:verify` (verify / reject / queue) |
| `/admin/payouts/wallets`    | `firm:read`   | `firm:edit` (record wallets, scan)      |
| `/admin/payouts/networks`   | `firm:read`   | `catalog:manage`                        |

Permissions are enforced in the **services**; hidden controls are presentation only. Every mutation
writes an `audit_logs` entry. Research notes on a wallet are admin-only and never rendered publicly.

---

## 12. Relationship to the Phase 2 roadmap

`ROADMAP.md` Phase 2 specifies **two** payout sources: trader-submitted evidence (needing public
accounts, email verification and rate limiting) and verified payout records. What is built is the
**blockchain-verified** half, which needs no public accounts and no trust in a submitter.

Still unbuilt, and still Phase 2: public user accounts, the trader submission queue, evidence media
handling with redaction/retention, processing-time distributions, payout method coverage, anomaly
flags, and `/prop-firms/[slug]/payouts`.

Phase 2's locked data rules 1–6 hold for what is built: only verified payouts appear publicly,
aggregates are computed from verified records at read time, nothing unverified is shown as fact, the
methodology is published, recipient addresses are shown truncated and never linked to an identity,
and **no payout data is ever invented, seeded, or demonstrated with fabricated examples.**

---

## 13. Tests

`src/lib/services/payouts.test.ts` — integration tests against real PostgreSQL (PGlite):
ingestion idempotency and dedup, multi-transfer hashes, exact-integer storage, non-outgoing and
failed transfers ignored, provider failure recorded as a failure, the permission gate, the
verification conditions, the audit trail, rejection requiring a reason, the USD CHECK constraint,
statistics counting verified rows only, unpublished firms excluded, window filtering, and
`formatBaseUnits` precision.
