# PROJECT.md — Prop Firm Lenz

> Product and business definition. This is the "why" document.
> Technical detail lives in `ARCHITECTURE.md`, `DATABASE.md`, `SEO.md`, `ADMIN.md`, `DESIGN.md`.

Markers: `[LOCKED]` owner requirement · `[APPROVED]` owner-approved, binding ·
`[PROPOSED]` needs approval · `[OPEN]` undecided.

---

## 1. What Prop Firm Lenz is

**Prop Firm Lenz is a comparison, data, and transparency platform for proprietary trading firms
("prop firms").**

It gives traders a single, structured, trustworthy place to answer one question:

> _"Which prop firm challenge should I take, and what exactly am I agreeing to?"_

The product is built around a **normalised database of prop firms and their challenges**, rendered as
fast, SEO-optimised public pages, and maintained through a **Master Admin dashboard**.

The name is the thesis: a **lens** — clarifying, magnifying, and focusing an opaque market. Prop Firm
Lens does not sell challenges. It explains them.

### The problem it solves `[LOCKED]`

Prop firm offerings are deliberately hard to compare:

- Rules are scattered across marketing pages, FAQs, and terms documents.
- Identical-sounding terms mean different things at different firms (e.g. "drawdown" may be static,
  trailing, or end-of-day trailing).
- Pricing is obscured by permanent "discounts".
- Payout reliability — the thing traders care about most — is largely unverifiable.
- Existing comparison sites are frequently affiliate-ranked without disclosure.

Prop Firm Lenz addresses this with **structured data, consistent definitions, explicit unknowns, and
disclosed incentives.**

---

## 2. Business objective

**Primary objective:** become the most accurate and trusted structured data source for prop firm
evaluation, and monetise that trust through disclosed affiliate partnerships.

Ordered goals:

1. **Data quality** — the most complete, correct, and consistently structured prop firm dataset.
2. **Organic search** — rank for high-intent comparison and evaluation queries (see `SEO.md`).
3. **Trust** — become the reference traders cite, not just a site they land on.
4. **Monetisation** — affiliate revenue from disclosed partner links.
5. **Defensibility** — Phase 2 payout tracking and Phase 3 verified reviews create proprietary data
   that cannot be copied from public marketing pages.

**Explicit non-goal:** maximising short-term affiliate revenue at the cost of data neutrality. That
trade is prohibited by `CLAUDE.md` §12.1.

---

## 3. Target user and intent

### Primary audience

| Segment                        | Situation                                         | What they need                                              |
| ------------------------------ | ------------------------------------------------- | ----------------------------------------------------------- |
| **First-time challenge buyer** | Knows prop firms exist; overwhelmed by options    | Plain-language explanation of rules; a shortlist            |
| **Comparison shopper**         | Has 2–5 firms in mind                             | Side-by-side data on price, targets, drawdown, payout terms |
| **Experienced funded trader**  | Already passed somewhere; diversifying or leaving | Payout reliability, scaling, profit split, restrictions     |
| **Rule-checker**               | Owns an account; needs a specific fact            | Fast, precise answer to one rule question                   |
| **Burned trader**              | Had a bad payout/denial experience                | Evidence of which firms actually pay (Phase 2/3)            |

### Search intent served

- **Comparison** — "X vs Y prop firm", "cheapest 100k challenge"
- **Evaluation** — "is X legit", "X payout proof", "X review"
- **Rule lookup** — "X max drawdown", "does X allow news trading", "X weekend holding"
- **Category discovery** — "best prop firms for futures", "prop firms with instant funding"
- **Deal seeking** — "X discount code"

Each intent maps to a route family in `SEO.md` §3. Pages are built to _answer the intent_, not to
capture the keyword.

### Explicitly not the audience

Prop firms themselves are **partners and data subjects**, not the audience. The site is written for
traders. Firm-facing needs (corrections, updates) are handled via `update_requests` in a later phase.

---

## 4. Business model

**Revenue: affiliate commissions from prop firms, on disclosed partner links.** `[LOCKED]`

| Stream                                             | Phase | Status                                                          |
| -------------------------------------------------- | ----- | --------------------------------------------------------------- |
| Affiliate commissions (CPA / revenue share)        | 1     | Primary                                                         |
| Sponsored placement — **only if visibly labelled** | Later | `[OPEN]`                                                        |
| Display advertising                                | —     | `[PROPOSED]` **against**: degrades trust, CWV, and premium feel |
| Paid firm listings that alter data or ranking      | —     | **Prohibited** `[LOCKED]`                                       |
| Data/API licensing                                 | Later | `[OPEN]`                                                        |
| Trader-facing subscription                         | Later | `[OPEN]`                                                        |

### Monetisation constraints `[LOCKED]`

1. Affiliate status **never** changes a firm's data, rating, or default sort order.
2. Non-partner firms are listed with the same completeness and prominence as partners.
3. Every affiliate link is disclosed at the point of use and in a site-wide disclosure page.
4. Affiliate links carry `rel="sponsored nofollow"` and route through a `noindex`, robots-disallowed
   redirect (`/go/...`).
5. Commission rates are **commercial data**, stored privately, never displayed publicly, and never
   used as a ranking input without explicit labelling.

---

## 5. Affiliate model

### Structure

- Each firm may have **many** `affiliate_links` (different networks, campaigns, offers, geographies).
- Exactly **one** link per firm is the **default** — enforced by a partial unique index
  (`DATABASE.md` §5.9).
- Offers (`offers`) may bind to a specific affiliate link so a promo code and its tracked URL travel
  together.
- Firms with **no** affiliate link still display a plain outbound link (`rel="nofollow"`), or no link
  at all, per admin configuration. **A missing affiliate relationship is never a reason to hide a
  firm.** `[LOCKED]`

### Click flow

```
User clicks CTA
   → GET /go/[firm-slug]            (server route, noindex, robots: disallow)
   → resolve active affiliate_link  (default, or offer-bound, or campaign-scoped)
   → record affiliate_clicks row    (async; placement, hashed IP, country, device, referrer)
   → 302 redirect to destination_url
```

Design notes:

- The redirect is **302**, not 301 — destinations change and must never be browser-cached. `[LOCKED]`
- Click recording must **never block or delay** the redirect.
- Raw IP addresses are never stored — only a salted hash. `[LOCKED]`
- Known bots are flagged and excluded from reporting, not dropped silently.
- If no active link exists, the route returns 404 rather than redirecting anywhere arbitrary.

Full technical detail: `ARCHITECTURE.md` §11.

### What is measured

Clicks by firm, link, placement, offer, device, country, and date. **Conversions are only recorded if
a partner network provides them via postback or import** — they are never estimated, modelled, or
inferred. `[LOCKED]`

---

## 6. Prop-firm data model philosophy

This is the intellectual core of the product.

### 6.1 Structured, not prose `[LOCKED]`

Every comparable fact is a **typed field**, not a sentence. `max_total_drawdown_pct` is a number with
a defined meaning; it is not a paragraph. Prose exists only to _explain_ structured data, never to
replace it.

### 6.2 Normalised vocabulary `[LOCKED]`

Firms use inconsistent language. Prop Firm Lenz defines the canonical vocabulary and maps firm
terminology onto it:

- `drawdown_type` ∈ { static, trailing, end-of-day trailing } — with a published definition of each.
- `challenge_type` ∈ { one-step, two-step, three-step, instant funding, … }
- Platforms and instruments are **catalog entities**, not free text — so "MT5" is one row, not
  fourteen spellings.

The definitions themselves are content, published and linked from every page that uses the term.

### 6.3 Firm → challenge hierarchy `[LOCKED]`

A firm is **not** the unit of comparison; a **challenge** is. One firm has many challenges; each has
its own price, size, targets, and rules. Firm-level attributes are only those genuinely constant
across the firm (name, country, founding year, support channels).

### 6.4 Hybrid rule modelling `[APPROVED]`

- **Hot rules** (filtered, sorted, compared) are **columns** on `challenges` — fast, typed, indexable.
- **Long-tail rules** (firm-specific quirks) live in the `rules` catalog + `rule_values`, so admins
  can add a rule type without a schema migration.

The binding **placement rule** and the **promotion path** (long-tail → column, via an
expand-then-contract migration) are specified in `DATABASE.md` §5.4. Approved 2026-09-03.

### 6.5 Unknown is a first-class value `[LOCKED]`

A field is `NULL` when it is unknown, and the UI says **"Not disclosed"** or **"Unknown"**.

- Never substitute a default (`0`, `—`, "Unlimited") for a missing value.
- Never infer a value from a similar firm.
- Unknowns are surfaced to admins via the **data completeness score** (`ADMIN.md` §13) so gaps get
  filled by research, not by guessing.

### 6.6 Provenance and freshness `[LOCKED]`

Every firm record carries verification state (`unverified` / `verified` / `needs_review`),
`verified_at`, and `verified_by`. Public pages show **"Last verified {date}"**. Stale records are
flagged for re-verification rather than silently presented as current.

### 6.7 History is preserved `[LOCKED]`

Firm rules change often and materially. Every published change writes an immutable version snapshot
(`entity_versions`) and an `audit_logs` entry, enabling rollback and — later — public "what changed"
timelines.

### 6.8 Never derived from marketing `[LOCKED]`

Data is entered by a human from a primary source (firm terms, dashboard, or direct confirmation).
Claude never populates, estimates, extrapolates, or scrapes this data.

### 6.9 Original values are preserved `[APPROVED]`

**Monetary values are stored exactly as the firm publishes them, together with their source
currency.** A firm that prices in EUR is stored in EUR — never silently converted to a house
currency, and never overwritten by a converted figure.

Currency conversion, where shown at all, is **display-only, derived at read time, and visibly
labelled** with its rate and rate date. A cross-currency comparison must state its basis; presenting
one as like-for-like when it is not is a data-integrity defect, not a rounding detail.

This is the same principle as §6.5 and §6.6 applied to money: **the record says what the source said,
and any transformation is visible as a transformation.** Full policy: `ARCHITECTURE.md` §18.

---

## 7. Trust and transparency principles `[LOCKED]`

1. **Disclose incentives.** Affiliate relationships are stated plainly, at the point of use.
2. **Show the date.** Every data-bearing page shows when it was last verified.
3. **Show the source.** Where a rule comes from a specific document, cite it.
4. **Admit ignorance.** "Not disclosed" is an honest, valuable answer.
5. **Separate fact from opinion.** Structured data is fact. Editorial commentary is visibly labelled
   as opinion.
6. **No dark patterns.** No fake urgency, fake scarcity, fake countdowns, or invented social proof.
7. **No fabricated social proof.** No stock-photo testimonials, no invented trader counts, no
   "X traders funded this week" unless it is a real, sourced number.
8. **Ratings are computed, never editorialised in secret.** When ratings exist (Phase 3), the
   methodology is published, and the inputs are auditable.
9. **Corrections are welcome and visible.** Firms and traders can request corrections; accepted
   corrections update the record and the version history.
10. **Neutral by default.** Default sort order is a neutral, published rule — never "highest
    commission first".

---

## 8. What Prop Firm Lenz is NOT `[LOCKED]`

- ❌ **Not a prop firm.** It does not fund traders, sell challenges, or operate accounts.
- ❌ **Not a broker or financial institution.** No custody, no execution, no deposits.
- ❌ **Not a financial adviser.** Nothing on the site is investment advice or a recommendation to
  trade. A disclaimer is present site-wide.
- ❌ **Not a signals, mentorship, or education service.**
- ❌ **Not a clone of Prop Firm Match** — or of any competitor. No copied branding, logo, layout,
  UI, assets, copy, content, or data.
- ❌ **Not a scraper.** Data is entered and verified by humans, not harvested.
- ❌ **Not a pay-to-rank directory.** Money cannot buy a rating, a rank, or a data change.
- ❌ **Not a review farm.** Reviews (Phase 3) are collected under an anti-manipulation policy, or not
  at all.
- ❌ **Not a guarantor.** Prop Firm Lenz reports what firms state and what traders verify; it does
  not warrant firm behaviour or guarantee payouts.
- ❌ **Not a place where AI writes the data.** See `CLAUDE.md` §3.

---

## 9. Core public routes

**Phase 1 scope** is marked ✅. Everything else is documented for architectural readiness only and
**must not be implemented without approval.**

| Route                                    | Purpose                                                                                                       | Phase            | Indexable                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------- |
| `/`                                      | Landing page — positioning, featured firms, search entry                                                      | ✅ 1             | Yes                       |
| `/prop-firms`                            | Master directory with filtering and sorting                                                                   | ✅ 1             | Yes                       |
| `/prop-firms/[slug]`                     | Firm profile — the canonical firm page                                                                        | ✅ 1             | Yes                       |
| `/compare`                               | Side-by-side comparison — **URL reserved and relationships architected in Phase 1; feature built in Phase 4** | 4 `[APPROVED]`   | No (params `noindex`)     |
| `/go/[slug]`                             | Tracked affiliate redirect                                                                                    | ✅ 1             | **No** (robots: disallow) |
| `/about`, `/contact`, `/methodology`     | Trust pages                                                                                                   | ✅ 1             | Yes                       |
| `/disclosure`, `/privacy`, `/terms`      | Legal + affiliate disclosure                                                                                  | ✅ 1             | Yes                       |
| `/platforms/[slug]`                      | Firms supporting a platform                                                                                   | 1–2 `[PROPOSED]` | Gated by thresholds       |
| `/instruments/[slug]`                    | Firms offering an asset class                                                                                 | 1–2 `[PROPOSED]` | Gated by thresholds       |
| `/offers`                                | Active verified offers                                                                                        | 1–2 `[PROPOSED]` | Yes                       |
| `/best/[category]`                       | Programmatic category pages                                                                                   | 2+               | Gated by thresholds       |
| `/payouts`, `/prop-firms/[slug]/payouts` | Payout tracking                                                                                               | Phase 2          | Yes                       |
| `/reviews`, `/prop-firms/[slug]/reviews` | Reviews                                                                                                       | Phase 3          | Yes                       |
| `/blog`, `/blog/[slug]`                  | Editorial                                                                                                     | Later            | Yes                       |
| `/faq`, `/glossary`                      | Definitions and terminology                                                                                   | Later            | Yes                       |

Route rules: no route is created without a defined intent, a metadata plan, and a content threshold
(`SEO.md` §3, §9, §10).

---

## 10. Core admin capabilities

The **Master Admin dashboard** is the only way business data enters the system. Full specification:
`ADMIN.md`.

**Phase 1 capabilities:**

1. **Authentication** — separate admin credentials, session-based, MFA-capable, rate-limited.
2. **RBAC** — roles and granular permissions, enforced server-side, deny-by-default.
3. **Dashboard** — counts, incomplete records, unverified firms, stale data, recent activity.
4. **Prop List** — searchable, filterable, sortable list of all firms with status and completeness.
5. **Firm workspace** — a tabbed editor for a single firm: Overview, Challenges, Rules, Platforms,
   Instruments, Offers, Affiliate, SEO, Media, Notes, History.
6. **LIVE → EDIT DRAFT → PREVIEW → PUBLISH** — an admin edits and previews changes to an
   already-live firm without altering the published version. Nothing reaches the public site without
   an explicit publish.
7. **Verification** — mark a firm verified, with who and when, surfaced publicly.
8. **Version history and rollback** — immutable snapshots on publish; restore any prior version.
9. **Audit logs** — append-only record of every mutation, with actor, before/after, and timestamp.
10. **Catalog management** — platforms, instruments, and the rule catalog.
11. **Media library** — uploads, alt text, reuse, and usage tracking.
12. **SEO controls** — per-entity metadata, canonical, robots, OG image; redirect manager.
13. **Internal notes** — private, never-public research notes per firm.
14. **Data completeness** — a visible score and gap list per firm.
15. **Dependency awareness** — before deleting or unpublishing, show what breaks.

**Later phases:** payout submission moderation and verification (Phase 2); review moderation and
report handling (Phase 3); content/CMS management, user management, and analytics dashboards (later).

`Lucid Prop` is the initial example/test firm used to validate the admin workspace end to end. Its
record exists as a fixture; its data is entered by a human. `[LOCKED]`

---

## 11. Success criteria for Phase 1

Phase 1 is complete when:

1. A landing page matching `DESIGN.md` renders at production quality on mobile and desktop.
2. An authenticated admin can create, edit, preview, publish, verify, roll back, and archive a firm
   **entirely through the UI**, with no code changes and no direct SQL — including editing and
   previewing a **live** firm without changing what the public sees until publish.
3. Every public firm page is server-rendered from the database with correct, unique metadata,
   canonical URL, breadcrumbs, and JSON-LD.
4. Renaming a firm's slug automatically produces a working 301 redirect.
5. Affiliate clicks are recorded and reportable, with the redirect route excluded from indexing.
6. Every admin mutation appears in `audit_logs` with actor and diff.
7. Accessibility (WCAG 2.2 AA) and Core Web Vitals budgets are met on the landing page, directory,
   and firm profile.
8. Zero hard-coded business data exists anywhere in the codebase.
