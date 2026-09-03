# ROADMAP.md — Prop Firm Lenz Development Phases

> **Phase discipline is binding** (`CLAUDE.md` §4). Work only within the current phase recorded in
> `SESSION.md`. **Never implement a future phase without explicit approval.**
>
> Architecture may _prepare_ for future phases. Implementation may not run ahead of them.

Markers: `[LOCKED]` owner requirement · `[APPROVED]` owner-approved, binding ·
`[PROPOSED]` needs approval · `[OPEN]` undecided.

---

## Phase 0 — Documentation and architecture (current)

**Goal:** a complete, reviewed, approved architecture before a single line of application code.

**In scope:**

- `CLAUDE.md` and the eight `docs/` files
- UX reference review and design-system definition
- Architectural decisions raised and resolved with the owner

**Explicitly out of scope `[LOCKED]`:** framework initialisation, dependencies, Git, database,
schema/ORM files, application code, UI components, landing page, admin dashboard.

**Exit criteria:**

1. ✅ All documentation reviewed by the owner — **complete 2026-09-03.**
2. ✅ Every blocking decision resolved — **complete 2026-09-03, all 17 settled.**
3. ✅ Logo SVG masters — **deferred by the owner**, addressed separately if required.
4. ⬜ **Explicit approval to initialise the project.** ← the only remaining gate

---

## Phase 1 — Landing page + Master Dashboard + database + dynamic firm management `[LOCKED]`

**Goal:** a production-quality public landing experience, and a Master Admin complete enough that
**every** prop firm data point is managed through the UI — no code changes, no SQL.

This phase is _not_ "a prototype". Its output is production software: real auth, real RBAC, real
audit trail, real SEO, real accessibility.

### 1.1 Foundation `[LOCKED stack]`

- Project initialisation: **Next.js App Router**, React Server Components, TypeScript `strict`,
  ESLint, Prettier
- **Tailwind CSS v4** with `DESIGN.md` tokens as CSS custom properties
- **Radix UI** primitives + **Lucide** icons, styled by the design system — no pre-themed kit
- **Zod** validation schemas, shared server/client
- Design tokens and the `components/ui/` primitive library (`DESIGN.md`)
- Official logo assets integrated (never recreated; raster interim until SVGs arrive)
- Layered architecture scaffolding: validation → service → repository (`ARCHITECTURE.md` §3.1)
- Environment validation, structured logging (**pino**), error taxonomy, **Sentry**
- CI: typecheck, lint, unit, integration, build
- **No analytics vendor wired in** — deferred, and explicitly not a blocker

### 1.2 Database `[APPROVED stack]`

- **Neon** PostgreSQL provisioned; pooled endpoint for the app, direct endpoint for migrations
- **Drizzle** schema in `src/lib/db/schema/`; `drizzle-kit` migrations committed as reviewable SQL
- Phase 1 schema (`DATABASE.md` §4–5) with all constraints and indexes, including the
  hand-authored SQL for `CHECK`s, append-only triggers, and `REVOKE` grants
- **Currency columns paired with every money column** (`DATABASE.md` §1.3)
- Neon database branch per pull request; migrations as a gated CI step
- Backups and PITR verified by an actual test restore
- **Structural seeds only** — roles, permissions, rule catalog. **No business data.** `[LOCKED]`

### 1.3 Authentication and RBAC

- Admin auth: Argon2id, opaque DB sessions, secure cookies, rate limiting, lockout
- MFA (TOTP) — at minimum schema-ready; required for `master_admin` `[PROPOSED]`
- Roles, permissions, `requirePermission` enforced in the service layer
- Admin invitation flow; session revocation
- **Deny-by-default verified by tests for every role** (`ARCHITECTURE.md` §14)

### 1.4 Master Admin dashboard

Per `ADMIN.md`:

- Shell: sidebar, top bar, global search (`⌘K`)
- Dashboard with live counts and action queues
- **Prop List** with search, filters, sort, server-side pagination
- **Firm workspace** with all eleven tabs
- **LIVE → EDIT DRAFT → PREVIEW → PUBLISH** via `draft_payload`, with the pre-publish checklist,
  stale-draft detection, and preview through the real public template (`DATABASE.md` §3.2.1)
- **Live side-by-side editor + preview** — ~50/50 desktop split with a draggable divider,
  Edit/Preview toggle below 1024px, viewport selector (375/768/fill), full-page preview, and a
  persistent PREVIEW/DRAFT indicator. Renders the **real public components** via `materializeDraft()`
  in a sandboxed iframe; inert affiliate CTAs, no analytics, `noindex`, never in the sitemap
  (`ADMIN.md` §7A, `ARCHITECTURE.md` §21, `DESIGN.md` §15)
- Verification with `verified_at` / `verified_by`
- **Version history, diffs, and rollback-to-draft**
- Append-only audit logs, global and per-entity
- Catalog management: platforms, instruments, rules
- Media library with required alt text and usage tracking
- SEO tab + site-wide redirect manager
- Internal notes (permission-gated, never public)
- Data completeness scoring and gap lists
- Dependency/impact warnings on every destructive action

### 1.5 Public site

- **Landing page** — production-quality, mobile-first, matching `DESIGN.md`
- **Directory** (`/prop-firms`) with server-rendered filters and sorting
- **Firm profile** (`/prop-firms/[slug]`) rendered entirely from the database
- Trust pages: `/about`, `/methodology`, `/contact`
- Legal: `/disclosure`, `/privacy`, `/terms`
- **`/compare` — architecture only** `[APPROVED]`: reserve both URL shapes, add the reserved-segment
  slug guard, and keep the comparison-enabling relationships in the schema.
  **Do not build the comparison page, UI, or curated pair pages** (`ARCHITECTURE.md` §20).
  The feature itself is Phase 4.

### 1.6 SEO

- SSG/ISR with tag-based revalidation on publish
- `generateMetadata` from `seo_metadata` with tested template fallbacks
- Canonicals, Open Graph, dynamic OG images
- Breadcrumbs (visible + JSON-LD, single source)
- `Organization`, `WebSite`, `BreadcrumbList`, `ItemList` JSON-LD
  — **no rating or review markup** `[LOCKED]`
- Generated `sitemap.xml` (index, split by type) and `robots.txt`
- Redirect middleware; automatic 301 on slug change
- Proper 404 / 410; no soft-404s
- Automated SEO assertions in CI (`SEO.md` §17)

### 1.7 Affiliate tracking

- `/go/[slug]` — resolve → 302 → deferred click write
- `affiliate_clicks` with hashed IP/UA, bot flagging, placement attribution
- `noindex` + robots-disallowed + `X-Robots-Tag`
- `rel="sponsored nofollow noopener"` on outbound anchors
- Basic click reporting in the admin (clicks by firm, link, placement, date)
- Site-wide affiliate disclosure

### 1.8 Quality

- WCAG 2.2 AA on all public pages and admin screens; axe in CI
- Core Web Vitals budgets met (`SEO.md` §13)
- Unit, integration (real PostgreSQL), and E2E coverage of the **23 non-negotiable cases**
  (`ARCHITECTURE.md` §14 cases 1–15, §21.9 cases 16–23)

### Phase 1 exit criteria `[LOCKED]`

The `PROJECT.md` §11 success criteria, plus the full **Lucid Prop walkthrough** (`ADMIN.md` §18)
completed end to end through the UI alone — and **zero hard-coded business data anywhere in the
codebase.**

---

## Phase 2 — Payout tracking system `[LOCKED]`

**Goal:** proprietary payout data that cannot be copied from any firm's marketing page — the first
real moat.

**Master Dashboard:**

- Payout submission queue with moderation
- Verification workflow: evidence review, approve / reject / dispute, reasons recorded
- Evidence media handling with restricted access and a redaction/retention policy
- Payout analytics per firm; anomaly and manipulation flags
- Full audit trail on every moderation decision

**Public — landing:** payout signals surfaced (e.g. recently verified payouts), driven entirely by
verified records.

**Public — firm profiles:** a payout section per firm — verified payout history, processing time
distribution, and payout method coverage.

**Public — new routes:** `/payouts` tracker and `/prop-firms/[slug]/payouts`.

**Also required:** public user accounts (`ARCHITECTURE.md` §5.4), email verification before any
submission, and submission rate limiting.

**Data rules `[LOCKED]`:**

1. Only **verified** payouts appear publicly.
2. Aggregates are **computed** from verified records — never entered, estimated, or modelled.
3. Unverified and rejected submissions are never shown as fact.
4. Verification methodology is published.
5. Trader identity is protected; evidence is never published raw.
6. **No payout data is ever invented, seeded, or demonstrated with fabricated examples.**
   (`CLAUDE.md` §3)

**Reference:** `PFM PAYOUT UI.png` — structure only (`DESIGN.md` §11).

---

## Phase 3 — Review collection system `[LOCKED]`

**Goal:** trustworthy, verified trader reviews — the second moat, and the highest-integrity-risk
feature in the product.

**Master Dashboard:**

- Review moderation queue: approve / reject / hide, with reasons
- Trader verification (linking a review to a real account/payout where possible)
- `review_reports` handling and resolution
- Manipulation detection: velocity, clustering, duplicate patterns, suspicious sources
- Rating recomputation, with the methodology visible to admins

**Public — landing:** aggregate rating signals from real published reviews.

**Public — firm profiles:** review section with category breakdown (trading conditions, support,
platform, payout process), distribution, and individual reviews.

**Public — new routes:** `/reviews`, `/prop-firms/[slug]/reviews`, and a review submission flow.

**Enabled only at this point:** `AggregateRating` and `Review` structured data — from real,
published, moderated reviews with real counts (`SEO.md` §11).
**Also enabled:** the `rating_avg` / `rating_count` columns on `prop_firms` (`DATABASE.md` §6.2) —
deliberately not created before now.

**Integrity rules `[LOCKED]`:**

1. One review per user per firm — enforced by a database unique constraint.
2. Email-verified accounts only.
3. Verified-trader status is earned by evidence, never assigned by hand.
4. Ratings are computed from published reviews; the methodology is public.
5. Firms cannot pay to remove, hide, or alter a review. Ever.
6. Moderation actions are audited and appealable.
7. **Reviews, ratings, and counts are never fabricated, seeded, or generated — including for demos
   or screenshots.** (`CLAUDE.md` §3)

**Reference:** `PFM REVIEW UI.png` — structure only.

---

## Later phases — documented, **not** implemented `[LOCKED]`

Recorded so the architecture stays ready. **Do not build any of this.**

### Phase 4 — Comparison and discovery

**The `/compare` feature** — URL shapes and relationships were reserved in Phase 1
(`ARCHITECTURE.md` §20); this is where the page, selector, and comparison table are actually built ·
curated `/compare/[a]-vs-[b]` pages behind the `SEO.md` §10.3 gate · `/best/[category]` programmatic
pages behind the §10.2 threshold gate · saved comparisons · advanced multi-criteria filtering ·
cross-currency comparison basis disclosure (`ARCHITECTURE.md` §18.3).

### Phase 5 — User accounts and personalisation

`favorites` · saved searches and alerts · notification preferences · rule-change alerts per followed
firm · a public trader profile `[OPEN]`.

### Phase 6 — Content and editorial

`articles` (blog) · `pages` (editable static) · `faqs` with `FAQPage` markup · a glossary publishing
the normalised vocabulary (`PROJECT.md` §6.2) · editorial workflow and scheduling.

### Phase 7 — Community data intake

`submissions` — public "add a firm", staged and admin-promoted, **never** writing to `prop_firms`
directly · `update_requests` — correction requests from firms and traders, feeding verification ·
a firm-facing claim/verification flow `[OPEN]`.

### Phase 8 — Analytics and intelligence

Search Console ingestion and per-URL performance (`SEO.md` §16) · affiliate conversion ingestion
**from partner postbacks only** · content decay detection · index coverage monitoring · internal
link graph analysis.

### Phase 9 — Scale and expansion

**Currency _display_ conversion** `[OPEN]` — the `currency_rates` table, dated rates with provenance,
and labelled conversions in the UI. Note that **currency _storage_ is already settled**: originals
with their source currency, never converted (`ARCHITECTURE.md` §18) · internationalisation and
`hreflang` `[OPEN]` · a public data API `[OPEN]` · spreads/commissions data
(ref: `PFM Spreads UI.png`) · deeper challenge-level modelling.

---

## Cross-phase invariants `[LOCKED]`

These hold in every phase, forever:

1. The database is the single source of truth. No hard-coded business data.
2. No invented firm data, payouts, reviews, ratings, trader results, or conversions.
3. Public pages are server-rendered; the SEO architecture is never regressed.
4. Authorisation is server-side and deny-by-default.
5. Every mutation is audited.
6. URLs never break — slug changes create 301s.
7. WCAG 2.2 AA and the Core Web Vitals budgets are met.
8. The official logo is the only logo; no competitor's identity is reproduced.
9. Affiliate relationships are disclosed and never alter data or ranking.
10. Architectural changes are explained before implementation.

---

## Blocking decisions before Phase 1

### ✅ None remaining

All **17** blocking decisions were resolved on 2026-09-03 across three approval rounds. The
architecture is fully specified. **The only outstanding gate is explicit owner approval to initialise
the project.**

| #   | Decision                                  | Outcome                                                                                                        | Where                               |
| --- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1   | ORM                                       | **Drizzle** + `drizzle-kit`                                                                                    | `ARCHITECTURE.md` §4                |
| 2   | **Draft model**                           | **`draft_payload`** — `LIVE → EDIT DRAFT → PREVIEW → PUBLISH`; published data unchanged until explicit publish | `DATABASE.md` §3.2.1, `ADMIN.md` §7 |
| 3   | Database host                             | **Neon** PostgreSQL, pooled endpoint                                                                           | `ARCHITECTURE.md` §3.3              |
| 4   | Hosting                                   | **Vercel**, kept container-buildable                                                                           | `ARCHITECTURE.md` §16               |
| 5   | Object storage                            | **Cloudflare R2**, S3-compatible SDK                                                                           | `ARCHITECTURE.md` §7                |
| 6   | Admin auth                                | **DB-backed sessions + Argon2id**                                                                              | `ARCHITECTURE.md` §5.2              |
| 7   | Canonical domain                          | **`https://propfirmlenz.com`** — apex, no `www`                                                                | `SEO.md` §3.1                       |
| 8   | Logo SVG masters                          | **Deferred by the owner** — addressed separately if required. Raster interim                                   | `DESIGN.md` §3.3                    |
| 9   | Supporting tables                         | **All nine approved**                                                                                          | `DATABASE.md` §10                   |
| 10  | Rule modelling                            | **Hybrid** column + catalog, with placement rule and promotion path                                            | `DATABASE.md` §5.4                  |
| 11  | Currency                                  | **Store originals with source currency; never silently convert**                                               | `ARCHITECTURE.md` §18               |
| 12  | `/compare`                                | **Architecture only**; UI and pages in Phase 4                                                                 | `ARCHITECTURE.md` §20               |
| 13  | Palette + typeface                        | **Accessible neutral palette** + **Inter**, both locked                                                        | `DESIGN.md` §2.3, §4.1              |
| 14  | Analytics                                 | **Deferred — explicitly must not block initialisation.** No vendor wired in for Phase 1                        | `ARCHITECTURE.md` §10               |
| 15  | Framework                                 | **Next.js App Router**, RSC, TypeScript strict                                                                 | `ARCHITECTURE.md` §2.1              |
| 16  | Styling / primitives / icons / validation | **Tailwind v4 · Radix · Lucide · Zod**                                                                         | `ARCHITECTURE.md` §2.4, §13         |
| 17  | Logging / testing                         | **pino + Sentry · Vitest · Playwright · axe · Lighthouse CI**                                                  | `ARCHITECTURE.md` §12, §14          |

### Non-blocking, decide during Phase 1

Each has a stated default that applies if never revisited (`ARCHITECTURE.md` §17,
`DATABASE.md` §10, `DESIGN.md` §16):

SEO polymorphism vs per-entity tables · per-challenge platforms/instruments · MFA required at launch
or schema-ready · SVG upload sanitise-or-reject · affiliate click retention window · public full-text
search · staging tier · session idle/absolute timeouts · version, audit, and log retention ·
staleness threshold · completeness weights and publish minimum · draft autosave · shareable preview
tokens · container max-width · per-table mobile strategy · wordmark typeface · light theme ·
`www`→apex redirect · email sender domain.
