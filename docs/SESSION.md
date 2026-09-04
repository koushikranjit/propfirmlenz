# SESSION.md — Current State

> Read this **before starting any work** (`CLAUDE.md` §1).
> Update it at the end of any significant work (`CLAUDE.md` §11).

---

## Current Phase

**Phase 1** — Landing page UI + Master Dashboard + database + dynamic prop firm management.

**Phase 1 §1.1 (Foundation) is done** — the toolchain is initialized (2026-09-04). **Stages 1-3 of
Phase 1 feature work are complete** (2026-09-04). No further stage may start without explicit
owner approval.

---

## Official brand `[LOCKED]`

|                     |                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Brand**           | **Prop Firm Lenz**                                                                                                 |
| **Previous brand**  | Prop Firm Lens — renamed **2026-09-03** (historical reference only)                                                |
| **Domain**          | **`propfirmlenz.com`**                                                                                             |
| **Canonical**       | **`https://propfirmlenz.com`** — apex, no `www`                                                                    |
| **Master gradient** | `#19E6D2 → #268BFF → #4F46E5 → #6D3DF5`                                                                            |
| **Logo**            | `Prop Firm Lenz logo.png` (lockup) · `Prop Firm Lenz Icon.png` (mark) — supplied by the owner, used **unmodified** |

The **on-disk folder is still `D:\Projects\Prop Firm Lens`** — the pre-rename spelling. This is
incidental and deliberate: the brand, package name (`prop-firm-lenz`), and domain are all `Lenz`.

---

## Status

**Documentation and architecture phase COMPLETE** — owner-confirmed 2026-09-03.
**Pre-initialization cleanup COMPLETE** — 2026-09-03.
**Brand migration to Prop Firm Lenz COMPLETE** — 2026-09-03.
**Project initialization COMPLETE** — 2026-09-04. The repository is now a working Next.js
application skeleton with no features, no schema, and no business data.

`CLAUDE.md` and the **nine** `docs/` files are written, cross-referenced, and consistency-checked.
All 16 documentation defects found in the preflight review have been fixed. The architecture is
fully locked; **no blocking architectural decision remains.**

**No blocker remains.** The exFAT problem was resolved by migrating to NTFS (see below); `pnpm
build` succeeds.

Remaining `[OPEN]` items are non-blocking and each carries a stated default.

---

## Application implementation

**Phase 1 / Stage 1 (Database + Foundation) COMPLETE — 2026-09-04.**
**Phase 1 / Stage 2 (Admin auth + shell + firm workspace) COMPLETE — 2026-09-04.**
**Phase 1 / Stage 3 (Public firm profile + SEO + preview integration) COMPLETE — 2026-09-04.**

Stage 1 built the schema (26 tables, 1 migration), draft/publish, public/admin
repository isolation, Argon2id + DB sessions, RBAC, affiliate tracking and the SEO
foundation.

Stage 2 built, on top of it:

- **Admin auth flow** — login page, session cookie (`__Host-` prefixed, httpOnly,
  SameSite=Lax), logout, generic failure message for every failure mode, failed-login
  lockout. Reuses the Stage 1 Argon2id/session services; nothing was re-implemented.
- **Route protection** — Edge middleware as a cheap early reject, plus
  `requireAdmin` / `requireAdminPermission` on every route and every server action.
  Open-redirect guard on the post-login `next` path.
- **Admin shell** — sidebar grouped Prop Firms / Management / Content / SEO / System,
  permission-filtered, off-canvas drawer below 1024px, global search, breadcrumbs.
- **Dashboard** — live counts only. No fabricated statistics; honest empty states.
- **Prop firm list** — server-side search, filter, sort and pagination, all
  schema-validated with an allowlisted sort key and a capped page size.
- **Create + workspace** — `/admin/prop-firms/{id}`, 20 tabs with Overview / Company /
  Branding / Verification implemented and the rest honestly marked not implemented.
- **Draft workflow** — Save Draft / Publish / Discard wired to the Stage 1 service.
  No draft logic was duplicated in the UI.
- **Preview** — `/admin/preview/firms/{id}`: noindex, no-store, no canonical, no OG,
  no JSON-LD, 404 to anonymous, inert affiliate CTA with no `/go/` href.
- **Audit log viewer** — read-only, permission-gated, append-only preserved.

Stage 3 built the public firm surface:

- **Canonical view model** — `src/lib/view/firm-view.ts`. `getPublishedFirmView()` and
  `materializeDraft()` now return the **identical** `FirmView`, both assembled by the
  same `assembleView()`. The old narrow `FirmView` in `firm-draft.ts` and the competing
  `PublicFirm` / `PublicChallenge` detail types are **gone** — there is one profile view
  model, one assembly path (`ARCHITECTURE.md` §21.2 `[LOCKED]`).
- **`FirmProfile`** — `components/public/firm-profile/`. **One** implementation, rendered
  by both `/prop-firms/{slug}` and `/admin/preview/firms/{id}`. No `AdminFirmProfile`,
  no `PreviewFirmProfile`. The `preview` prop changes exactly one thing: the affiliate
  CTA renders inert with no `/go/` href.
- **`/prop-firms`** — server-rendered directory with a no-JavaScript GET filter form,
  crawlable pagination, country/platform/verified filters, and two distinct empty states
  ("nothing published yet" vs "nothing matches these filters").
- **`/prop-firms/{slug}`** — profile with metadata, self-referencing canonical, Open
  Graph, visible breadcrumbs, `WebPage` + `BreadcrumbList` JSON-LD, and 301/308 slug
  redirects via the `redirects` table. Draft, archived and soft-deleted firms 404.
- **Thin-content gate** — `isIndexable()` ships a stub profile as `noindex, follow` and
  excludes it from the sitemap, so the two can never disagree.
- **Sitemap** — generated from the database, `lastmod` from each firm's real
  `updated_at`, never `now()`.
- **Currency honesty** — one shared `Intl` formatter; every amount renders with its own
  source currency, nothing is converted, and a "from" price is withheld when a firm's
  prices span currencies.
- **Tests** — 203 passing. Added: firm-profile rendering and affiliate-safety, source-level
  architecture invariants (§21.9 cases 17, 19–22), the public read path against real
  PostgreSQL, SEO templates, and the display formatters.

**Stage 3.1 (2026-09-04)** closed the two documentation/route gaps Stage 3 left open:

- **`/go/{slug}`** — the tracked affiliate redirect. Resolves the published firm and its
  applicable link through the existing `resolveAffiliateLink` (campaign → default),
  re-validates the stored destination, records the click, then 302s. Every failure
  mode returns the same bare 404. The slug is used only for routing; the click row
  uses the ids the resolver returns.
- **`CLAUDE.md` rule 35** — now names `getPublishedFirmView()`, the actual canonical
  function. Rule substance unchanged.

**Stage 4 (2026-09-04)** built the public landing page at `/`:

- **Homepage** — hero, GET-form search into the directory, alphabetical firm grid,
  trust/methodology section, browse-by facets, recently-checked list, closing CTA
  and a definitional "what to compare" section. Server-rendered, database-driven,
  no client JavaScript except the error boundary React requires.
- **Site chrome** — sticky responsive header with a `<details>` mobile menu (no
  client JS) and a three-column footer. Navigation links ONLY to built routes;
  payouts, reviews and comparison appear as text with their phase, never as
  links that would 404.
- **Ordering** — the firm grid is alphabetical and labelled as such. `is_featured`
  exists but has no published methodology, and PROJECT.md §7 rule 10 requires a
  neutral published rule, so it is deliberately not used as a homepage signal.
- **Repository** — two narrow additions to the existing public directory
  repository: a `recently_verified` sort (on the real `verified_at`, never
  `updated_at`) and `listPublishedPlatformFacets`. No new firm view model.
- **SEO** — self-canonical `https://propfirmlenz.com`, unique title/description,
  Open Graph, `WebSite` (with a SearchAction pointing at the search that
  genuinely exists) and `WebPage`. Organization stays in the layout, unduplicated.

**Stage 5 (2026-09-04)** made the firm editor able to manage the data the public
profile already renders, and fixed a defect it exposed:

- **Publish materialised no children.** A challenge staged in a draft was
  validated, previewed, and then silently DROPPED at publish — `publishFirm`
  wrote firm columns only. `firm-publish-children.ts` now materialises
  challenges, rule values, platform and instrument associations, offers,
  affiliate links and SEO metadata inside the same transaction, and publish
  writes every firm column a draft can carry rather than five of them.
- **Preview showed only firm fields and challenges.** `firm-draft-overlay.ts`
  is a pure overlay covering every collection, so preview now reflects staged
  rules, platforms, instruments, offers and the affiliate CTA state.
- **Draft envelope extended** with `affiliateLinks` (schema version unchanged —
  an optional array, so existing drafts still parse). Commission notes are
  deliberately NOT stageable.
- **Editor tabs**: Challenges, Rules, Platforms & instruments, Offers,
  Affiliate, SEO — plus the existing Overview / Company / Branding /
  Verification. Every child edit is staged in `draft_payload` through one code
  path; none writes a published row.
- **Permissions per collection**: `challenge:edit`, `offer:edit`,
  `affiliate_link:edit`, `seo:write`, otherwise `firm:edit` — all enforced in
  the service layer, never by hiding a button.
- **Affiliate safety**: destinations validated by the form schema and by the
  same `isSafeAffiliateDestination` that guards `/go/{slug}`. The destination
  is admin-only and still absent from `FirmView`.

**Blockchain payout intelligence (2026-09-04)** — owner-directed, and the first
Phase 2 work. Specification: `docs/PAYOUTS.md`.

- **Schema** — 6 tables (migration `0002`, purely additive): networks, tracked
  wallets, raw transactions, candidates, verified payouts, verification events.
  Amounts are `numeric(78,0)` base-unit integers with `decimals` alongside;
  a USD value cannot be stored without its rate, source and rate time (CHECK).
- **Provider abstraction** — `TronProvider` (TronGrid) and `EvmExplorerProvider`
  (Etherscan v2). No mock adapter ships; fixtures exist only in the test file.
  `providerFor()` returns null when a credential is absent, and callers report
  that as a failure rather than as an empty scan.
- **Ingestion** — idempotent by unique key, paginated, resumable; a provider
  failure is recorded on the wallet, never swallowed.
- **Verification** — six conditions, all required, ending in a human holding
  `firm:verify`. Nothing auto-verifies and nothing approves in bulk. The payout
  row, candidate update and audit event commit in one transaction.
- **Public** — `/payouts` (windowed, `noindex` and out of the sitemap while
  empty), `/payouts/methodology`, and a "Verified payouts" section on each firm
  profile passed to `FirmProfile` as a REQUIRED prop, so the preview cannot omit
  it. Public reads never join raw transactions or candidates.
- **Admin** — review queue, tracked wallets with on-demand scan, and networks,
  at `/admin/payouts{,/wallets,/networks}`. Every mutation is audit-logged.
- **Language** — every label is "verified", never "total". Verified on-chain
  volume is a floor; an empty section is never shown as evidence a firm does
  not pay.
- **Tests** — 20 payout tests against real PostgreSQL (ingestion idempotency,
  dedup, exact-integer storage, provider failure, the permission gate, each
  verification condition, the audit trail, the USD constraint, verified-only
  statistics, window filtering, formatter precision). Suite: 382 passing.

Deliberately NOT built (awaiting approval):

- ❌ No trader-submitted payout evidence, public accounts, or submission queue
- ❌ No challenge detail pages, review system, comparison UI, blog
- ❌ No business or prop-firm data of any kind — no wallet, network, or payout
  row is seeded; every one is entered by an admin
- ❌ Migration `0002` is NOT applied to production, and nothing is deployed

### Route change `[owner-directed 2026-09-04]`

The admin firm workspace is **`/admin/prop-firms/{id}`**, not the previously
documented `/admin/firms/{id}`. Directed by the owner; `ADMIN.md` §6 and
`ARCHITECTURE.md` §22 were updated to match. The id-keyed rule itself is unchanged.

### Phase-discipline note `[owner-directed 2026-09-04]`

`ADMIN.md` §2.1 says Payouts and Reviews "do not appear before their phase". The owner
asked for the full sidebar now, so those entries exist as **navigation only** and lead
to honest "not implemented yet" pages.

**Superseded for Payouts, same day.** The owner directed blockchain payout
intelligence as CRITICAL, which is Phase 2 work (`ROADMAP.md` Phase 2). `CLAUDE.md` §0
gives the owner precedence over phase discipline. Payouts is now a real, implemented
section; Reviews remains navigation only. The blockchain half of Phase 2 is built; the
trader-submission half (public accounts, evidence handling, moderation queue) is not —
see `PAYOUTS.md` §12.

---

## ✅ Resolved — migrated from exFAT to NTFS `[2026-09-04]`

The exFAT build blocker is **fixed**. The project was **copied** (not moved) to NTFS:

| | |
| --- | --- |
| **Working location** | `C:ProjectsProp Firm Lenz` (NTFS) |
| Original | `D:ProjectsProp Firm Lens` (exFAT) — **retained untouched as a backup** |
| Git history | Preserved in full — 5 commits, branch `main`, `git fsck` clean |

**exFAT workarounds removed**, since they existed only for that filesystem:

- `nodeLinker: hoisted` deleted from `pnpm-workspace.yaml` — the **isolated linker is restored**,
  verified: `.pnpm` store with 774 entries, 26 symlinked top-level entries, and transitive deps
  (`postcss`, `scheduler`) correctly hidden. **Phantom-dependency protection is back**, so the
  ESLint import boundary is no longer the sole defence.
- The `.npmrc` and the exFAT comment in `eslint.config.mjs` are gone.

**Retained deliberately:** `next build --webpack`. That was the documented choice in
`INITIALIZATION.md` §4 ("prove the toolchain on stable webpack; opt in later"), not an exFAT
workaround. Turbopack remains an explicit future opt-in.

`git config --global --add safe.directory` for the D: path is retained — the D: copy still exists
and would otherwise be unusable.

**Build now succeeds** (5.0s, 5 routes) and the dev server starts in 519ms.

### Note: `CLAUDE.md` carries a Next.js-generated block

`next dev` appends a `<!-- BEGIN:nextjs-agent-rules -->` section to `CLAUDE.md` and **re-adds it
automatically** if deleted. It is Next.js's text, **not owner-authored policy**, and it is committed
only to keep the working tree clean. It can be suppressed by patching
`node_modules/next/dist/server/lib/generate-agent-files.js`, which is not recommended.

---

## Next step

**Owner approves the next stage.** Stages 1–5 are complete and verified.

1. ✅ Documentation, architecture, brand migration — complete 2026-09-03.
2. ✅ Git identity configured (`Koushik <koushikranjit8@gmail.com>`).
3. ✅ Initialization executed — complete 2026-09-04.
4. ✅ exFAT build blocker resolved — migrated to NTFS 2026-09-04.
5. ✅ Stage 1 (database + foundation) — 2026-09-04.
6. ✅ Stage 2 (admin auth + shell + firm workspace) — 2026-09-04.
7. ✅ Stage 3 (public firm profile + SEO + preview integration) — 2026-09-04.
8. ✅ Stage 3.1 (public affiliate route + documentation hardening) — 2026-09-04.
9. ✅ Stage 4 (public homepage) — 2026-09-04.
10. ✅ Stage 5 (admin firm data management) — 2026-09-04.
11. ✅ Blockchain payout intelligence — owner-directed, 2026-09-04.
12. ✅ Core prop firm workflow locked — owner-directed, 2026-09-04.
13. ⬜ Owner applies migrations `0002` and `0003` to production and approves the next stage.

The nearest unbuilt pieces, in dependency order: the iframe split-pane preview in the
workspace (`ARCHITECTURE.md` §21.4), the remaining workspace tabs that populate
challenges/rules/platforms/instruments/offers, the affiliate-link admin UI that makes
`/go/{slug}` reachable with real data, the trust and legal pages (`/about`,
`/methodology`, `/disclosure`, `/privacy`, `/terms` — Phase 1 scope, still unbuilt),
and caching with revalidation tags. **None may start without approval.**

---

## Completed

**2026-09-03**

- `CLAUDE.md` — permanent operating instructions, session protocol, and the full permanent rules
  and constraints
- `docs/PROJECT.md` — product definition, business and affiliate model, data philosophy, trust
  principles, routes, admin capabilities
- `docs/ARCHITECTURE.md` — proposed production architecture with a decision summary and 12 open
  questions
- `docs/DATABASE.md` — Phase 1 schema design (14 enumerated entities + 9 supporting tables flagged
  for approval), constraints, indexes, and future-phase preparation
- `docs/SEO.md` — SEO architecture, URL policy, programmatic-SEO gates, structured data, CWV budgets
- `docs/ADMIN.md` — Master Admin architecture, with the Lucid Prop acceptance walkthrough
- `docs/DESIGN.md` — design system, verified contrast ratios, official logo specification, UX
  reference library
- `docs/ROADMAP.md` — Phases 1–3 in detail, later phases documented but not implemented
- `docs/SESSION.md` — this file
- **UX references inspected** — 13 files at `C:\Users\koush\Downloads\PFM UI`, recorded in
  `DESIGN.md` §11. Not copied into the repository; the folder was not modified.
- **Official logo inspected** — horizontal lockup and standalone mark recorded as the sole approved
  brand asset in `DESIGN.md` §3.
- **Owner review completed; 12 architecture decisions approved and applied** across all nine files.
  Added: `ARCHITECTURE.md` §18 (currency), §19 (canonical domain), §20 (`/compare` architecture);
  `DATABASE.md` §1.3 (currency schema rules); `SEO.md` §3.1 (canonical origin + reserved segments);
  `PROJECT.md` §6.9 (original values preserved); `CLAUDE.md` §12.4b–d (approved stack, currency,
  `/compare` scope). Blocking decisions reduced from 14 to 5.
- **Pre-initialization cleanup** — all 16 preflight defects fixed; Node 24 / pnpm / admin-by-id /
  DB conventions / rollup semantics recorded as locked; `ARCHITECTURE.md` §22 and
  `DATABASE.md` §5.10b added.
- **`docs/INITIALIZATION.md` created** — the approved initialization procedure (19 sections),
  **written but not executed.**

---

### Core prop firm workflow locked `[owner-locked 2026-09-04]`

The sixteen core fields are fixed (`ADMIN.md` §6.2). The primary editor is one page with
expandable sections and **no tab strip**; only the name is required to save a draft.

Added this stage: migration `0003` (additive — `founded_on`, `founder_name`, `ceo_name`,
`trustpilot_rating`, `trustpilot_url` on `prop_firms`, plus `firm_announcements` and
`firm_faqs`); a real R2 logo upload signed with SigV4 in `node:crypto` (no new dependency, and
an honest "not configured" state when credentials are absent); a searchable country picker over
ISO-3166 with derived flag emoji; years-in-operation derived at read time; discount title/code/
description on the existing `offers` table with a public copy-code button; announcements and FAQs
as ordinary draftable children; and a firm-scoped payout wallet configuration point that writes
against the existing firm record.

Public profile UNCHANGED in structure and now richer: flag, founder, CEO, Trustpilot (labelled as
Trustpilot's, never ours), derived years, announcements, FAQs (with `FAQPage` JSON-LD only when
real FAQs are rendered) and copy-code discounts. Every section still renders only with real data.

One defect found by the new tests: `publishFirm` was not writing the new firm columns, so a
staged founder or founding date would have been silently dropped at publish. Fixed.

### Admin/public separation confirmed `[owner-directed 2026-09-04]`

**Simple admin + rich database + rich public profile.** The owner reviewed the public
profile and confirmed it must stay long and detailed; simplifying the admin must never
remove a public section or a database capability.

Audited and confirmed already separate: the firm editor's primary screen is Basic
Information with Advanced / SEO / Verification collapsed; payout tracking, reviews and the
audit log are their own admin sections; there is no affiliate portal; public reads go
through `FirmView` while the admin writes `draft_payload`.

One defect found and fixed: the editor's Advanced section carried **15 tabs, 7 of them dead
placeholders** — including Payouts (Phase 2) and Reviews (Phase 3), which duplicated the
separate sections. The tab bar now holds only the 8 tabs that write firm data; Payout
Tracking and the Audit log are links under "Managed elsewhere", and unbuilt work is named
once in a line of text. `ADMIN.md` §6.2 records the scope rule.

The public profile was **not** changed: 11 sections, covering overview, key facts, the full
challenge table (size, price, targets, daily loss, max drawdown with type and basis, profit
split, trading days, leverage, payout terms), rules, platforms, instruments, offers,
verified payouts, reviews-not-yet, CTA and provenance. Pros/cons, FAQ, alternatives and
comparisons remain absent because no data model or data exists for them.

---

## In progress

Nothing. The payout system is complete, validated and committed locally.

**Two things need the owner, and neither was done automatically:**

1. **Migrations `0002` and `0003` have not been applied to production.** Both are additive
   only (8 CREATE TABLEs and 5 ADD COLUMNs in total; no drop or alter of an existing object) and
   both are verified against real PostgreSQL by the test suite. Applying them is the owner's call.
2. **Nothing was deployed or pushed.**

Until a network and a wallet are recorded by an admin, `/payouts` correctly shows an
empty state, is `noindex`, and is absent from the sitemap. No seed data exists.

### Deviations from `INITIALIZATION.md`, and why `[recorded 2026-09-04]`

| # | Documented | Actual | Reason |
| --- | --- | --- | --- |
| 1 | `create-next-app . --no-turbopack` | Scaffolded in scratchpad, then copied | The folder name `Prop Firm Lens` is not a valid npm package name, so `.` was rejected. This is the §4 documented fallback |
| 2 | `--no-turbopack` flag | `next build --webpack` in the script | The flag no longer exists in create-next-app; `--webpack` on `next build` achieves the same intent |
| 3 | `corepack enable` | `corepack enable --install-directory <user dir>` | Writing shims to `C:\Program Files\nodejs` needs admin rights |
| 4 | pnpm default (isolated) linker | `nodeLinker: hoisted` | exFAT has no symlinks. **Cost: pnpm's phantom-dependency protection is lost**, so the `components/public` → `components/admin` boundary rests entirely on the ESLint rule |
| 5 | — | `git config --global --add safe.directory` | exFAT records no ownership; git refuses otherwise |
| 6 | — | `*.md` added to `.prettierignore` | `pnpm format` reflowed all hand-formatted docs. Content verified intact; excluded going forward |
| 7 | — | `.gitignore` negation `!.env.example` | The scaffold's `.env*` rule excluded the environment contract, which must be committed |

---

## Next task

**Documentation, architecture, and pre-initialization cleanup are all complete**
(owner-confirmed 2026-09-03).

**Next: owner sets Git identity, then approves execution of `docs/INITIALIZATION.md`** — Phase 1 §1.1
(Foundation): Corepack/pnpm, Next.js App Router with TypeScript strict, Tailwind v4 + design tokens,
Radix + Lucide, Zod, Drizzle config, pino/Sentry, testing, and CI.

`docs/INITIALIZATION.md` is the approved procedure. It is **written but not executed.**

No implementation task is available until initialisation is approved. The project remains
**documentation-only**.

---

## Important decisions

### Made by the owner `[LOCKED]`

| Decision             | Detail                                                                                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product              | Prop firm comparison, data, and transparency platform                                                                                                                                                           |
| Database             | PostgreSQL                                                                                                                                                                                                      |
| Language             | TypeScript                                                                                                                                                                                                      |
| Data source of truth | The database — no hard-coded business data, no invented data                                                                                                                                                    |
| Phase order          | 1 landing + admin + DB · 2 payouts · 3 reviews                                                                                                                                                                  |
| Design               | Near-black background, dark cards, white/gray text, cyan `#19E6D2` · blue `#268BFF` · indigo `#4F46E5` · violet `#6D3DF5`, cyan→blue→indigo→violet gradient, mobile-first, minimal animation/glow/glassmorphism |
| Logo                 | The official Prop Firm Lenz logo is the only approved logo; never recreated or substituted                                                                                                                      |
| Originality          | Do not copy Prop Firm Match branding, logo, UI, assets, content, or design                                                                                                                                      |
| UX references        | `C:\Users\koush\Downloads\PFM UI` — layout/UX patterns only, read-only, never copied into the repo                                                                                                              |
| Example firm         | `Lucid Prop` is the initial example/test firm                                                                                                                                                                   |
| Current stage        | Documentation and architecture only — no initialisation, dependencies, Git, DB, or code                                                                                                                         |

### Approved by the owner — 2026-09-03 `[APPROVED]`

Binding. Same force as `[LOCKED]`.

| #   | Decision                                                                                                   | Where                                                        |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | **ORM: Drizzle** + `drizzle-kit`; `drizzle-kit push` prohibited outside local dev                          | `ARCHITECTURE.md` §4                                         |
| 2   | **Database: Neon PostgreSQL**, pooled endpoint for the app, direct for migrations, branch per PR           | `ARCHITECTURE.md` §3.3                                       |
| 3   | **Hosting: Vercel**, kept container-buildable so the choice stays reversible                               | `ARCHITECTURE.md` §16                                        |
| 4   | **Media storage: Cloudflare R2**, S3-compatible SDK, presigned direct upload                               | `ARCHITECTURE.md` §7                                         |
| 5   | **Admin auth: DB-backed sessions + Argon2id**, opaque tokens stored hashed                                 | `ARCHITECTURE.md` §5.2                                       |
| 6   | **Nine supporting tables approved** — sessions, RBAC (×3), clicks, versions, redirects, notes, media usage | `DATABASE.md` §4.4, §4.6, §5.10, §5.12                       |
| 7   | **Hybrid rule model**, with the binding placement rule and a promotion path                                | `DATABASE.md` §5.4                                           |
| 8   | **Monetary values: store originals with source currency; never silently convert or overwrite**             | `ARCHITECTURE.md` §18, `DATABASE.md` §1.3, `PROJECT.md` §6.9 |
| 9   | **Canonical domain: `https://propfirmlenz.com`** — apex, no `www`                                          | `SEO.md` §3.1, `ARCHITECTURE.md` §19                         |
| 10  | **UI typeface: Inter**, unless the logo wordmark requires a different display face                         | `DESIGN.md` §4.1                                             |
| 11  | **Official logo remains the authoritative brand asset** — never recreated or redrawn                       | `DESIGN.md` §3, `CLAUDE.md` §12.2                            |
| 12  | **`/compare`: architect URLs and relationships now; do not build the feature in Phase 1**                  | `ARCHITECTURE.md` §20, `ROADMAP.md` Phase 4                  |

### Locked by the owner — second round, 2026-09-03 `[LOCKED]`

| #   | Decision                                                                                                                                                                                       | Where                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 13  | **Draft model: `draft_payload`** — `LIVE → EDIT DRAFT → PREVIEW → PUBLISH`. Published data unchanged until an explicit publish. Full state machine, payload envelope, and hard rules specified | `DATABASE.md` §3.2.1, `ADMIN.md` §7 |
| 14  | **Framework: Next.js App Router**, React Server Components, TypeScript `strict`                                                                                                                | `ARCHITECTURE.md` §2.1              |
| 15  | **Styling: Tailwind CSS v4** + CSS custom-property design tokens                                                                                                                               | `ARCHITECTURE.md` §2.4              |
| 16  | **UI primitives: Radix UI**, styled with the Prop Firm Lenz design system — no pre-themed kit                                                                                                  | `ARCHITECTURE.md` §2.4              |
| 17  | **Icons: Lucide**, one set only                                                                                                                                                                | `DESIGN.md` §14                     |
| 18  | **Validation: Zod**, shared server/client schemas                                                                                                                                              | `ARCHITECTURE.md` §13               |
| 19  | **Logging/monitoring: pino + Sentry** for Phase 1, unless a technical issue requires reconsideration                                                                                           | `ARCHITECTURE.md` §12               |
| 20  | **Testing: Vitest · Playwright · axe · Lighthouse CI**                                                                                                                                         | `ARCHITECTURE.md` §14               |
| 21  | **Analytics: deferred, explicitly non-blocking.** No vendor wired in for Phase 1                                                                                                               | `ARCHITECTURE.md` §10               |
| 22  | **Neutral palette locked** as specified, adjustable at a later visual review provided AA contrast holds                                                                                        | `DESIGN.md` §2.3                    |
| 23  | **Logo authoritative; SVG masters/favicons deferred** to a separate exercise                                                                                                                   | `DESIGN.md` §3.3                    |
| 24  | **Currency** — reaffirmed: keep source values, no silent conversion, cross-currency sorting must declare its basis or group by currency                                                        | `ARCHITECTURE.md` §18               |
| 25  | **`/compare`** — reaffirmed: architecture only in Phase 1                                                                                                                                      | `ARCHITECTURE.md` §20               |

### Locked by the owner — third round, 2026-09-03 `[LOCKED — Phase 1]`

| #   | Decision                                                                                                                                                                                                                                  | Where                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 26  | **Live side-by-side editor + preview** in the firm workspace. Desktop ~50/50 with a draggable divider; Edit/Preview toggle below 1024px; viewport selector (375/768/fill); full-page preview; persistent PREVIEW/DRAFT indicator          | `ADMIN.md` §7A, `DESIGN.md` §15                  |
| 27  | **The preview renders the SAME public components as production.** A separate preview UI is prohibited. Enforced by a shared `FirmView` type (drift becomes a compile error) and an import boundary                                        | `ARCHITECTURE.md` §21.1–21.2, `CLAUDE.md` §12.4f |
| 28  | **Iframe rendering mechanism** — required so responsive preview is genuine (media queries resolve against the iframe viewport, not the browser's). Sandboxed without `allow-forms` / `allow-top-navigation`                               | `ARCHITECTURE.md` §21.4                          |
| 29  | **Preview isolation** — no affiliate attribution (inert CTAs), no analytics, no publishing, no draft leakage to public queries, `noindex` header, never in sitemap, never a public canonical, no head metadata at all, 404 to anonymous   | `ARCHITECTURE.md` §21.6–21.8, `SEO.md` §8, §9    |
| 30  | **Refresh on Save Draft**, not per keystroke; scroll position preserved                                                                                                                                                                   | `ARCHITECTURE.md` §21.5                          |
| 31  | **`affiliate_clicks.is_internal` approved** for internal/admin/test traffic. **Secondary protection and classification only** — the primary guarantee stays structural: preview CTAs carry no affiliate href and no click is ever created | `DATABASE.md` §5.10a, `ARCHITECTURE.md` §21.7    |

### Locked by the owner — fourth round, 2026-09-03 `[LOCKED]`

Pre-initialization decisions.

| #   | Decision                                                                                                                                                                               | Where                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 32  | **Node.js 24 LTS.** Pinned in `.nvmrc` and `engines`. **Do not downgrade to Node 22**                                                                                                  | `INITIALIZATION.md` §2, `CLAUDE.md` §12.4b |
| 33  | **pnpm is the package manager**, activated via Corepack, exact version pinned in `packageManager`. **npm is not the project package manager** — `package-lock.json` is a defect        | `INITIALIZATION.md` §3                     |
| 34  | **Admin routes use stable database IDs; public routes use slugs.** A slug rename must never break an admin draft, workspace URL, preview, or deep link                                 | `ARCHITECTURE.md` §22, `ADMIN.md` §6       |
| 35  | **`DATABASE.md` §1 conventions confirmed** — UUIDv7, soft delete, `numeric` money, original amount + source currency, **no stored converted-money columns**                            | `DATABASE.md` §1                           |
| 36  | **`affiliate_click_daily_rollups` corrected** — separate `reportable_clicks` / `bot_clicks` / `internal_clicks` / `total_clicks`, consistent with the approved `is_internal` exclusion | `DATABASE.md` §5.10b                       |
| 37  | **`docs/INITIALIZATION.md` created** — the approved initialization procedure, not yet executed                                                                                         | `INITIALIZATION.md`                        |

### Locked by the owner — fifth round, 2026-09-03 `[LOCKED]`

Brand migration.

| #   | Decision                                                                                                                                                                   | Where                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 38  | **Brand renamed: Prop Firm Lens → Prop Firm Lenz.** 45 references migrated across all 10 files                                                                             | all files                                                     |
| 39  | **Domain: `propfirmlenz.com`** (was `propfirmlens.co`). Canonical `https://propfirmlenz.com`, apex, no `www`. 21 references migrated                                       | `SEO.md` §3.1, `ARCHITECTURE.md` §19, `INITIALIZATION.md` §0a |
| 40  | **npm package name: `prop-firm-lenz`**                                                                                                                                     | `INITIALIZATION.md` §4                                        |
| 41  | **Official logo supplied** — `Prop Firm Lenz logo.png` + `Prop Firm Lenz Icon.png`. Authoritative; used unmodified; never recreated or redrawn                             | `DESIGN.md` §3.3, `INITIALIZATION.md` §0a                     |
| 42  | **Official palette locked** — surfaces `#050609` `#080A10` `#0D1017` `#15122A` `#180D35` `#3B1B75`; text `#FFFFFF` `#D9DCE5` `#9298A8` `#737A89`; brand gradient unchanged | `DESIGN.md` §2.3                                              |
| 43  | **Contrast measured and usage-constrained** — see "Accessibility findings" below                                                                                           | `DESIGN.md` §2.5                                              |

### Accessibility findings — measured, binding `[LOCKED]`

Computed WCAG ratios, not estimates. Three constraints came out of the new palette:

1. **`#737A89` (metadata) is background-dependent.** 4.70:1 on `#050609` (passes AA) but
   **4.42:1 on cards `#0D1017`**, **4.23:1 on `#15122A`**, **3.05:1 on `#3B1B75`** — all **fail AA**.
   → Normal-size metadata text is permitted **only on `--bg-base`**; on cards use `--text-muted`
   `#9298A8` (6.60:1).
2. **Indigo `#4F46E5` fails even the 3:1 non-text threshold on purple surfaces** — 2.90:1 on
   `#15122A`, 2.91:1 on `#180D35`, 2.09:1 on `#3B1B75`. → It must not carry meaning on any purple
   surface; it survives only inside the gradient.
   **Violet `#6D3DF5` on `#3B1B75` is 2.27:1** — must never be placed there.
3. **The official surfaces are near-identical in luminance** — `#180D35` on `#15122A` is **1.00:1**,
   and every other adjacent pair is 1.02–1.11:1. → **Surface hierarchy must come from borders, not
   background steps.** Three `--border-*` tokens were added `[PROPOSED]` for this reason.

**Purple colours are used as surfaces and accents only** — never as normal-size text. Confirmed.

### Still proposed — non-blocking `[PROPOSED]`

| Decision                                                                                   | Where                                      |
| ------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Separate `users` and `admin_users` tables                                                  | `DATABASE.md` §4.1                         |
| Draggable divider position persisted per admin; debounced draft autosave                   | `DESIGN.md` §15.1, `ARCHITECTURE.md` §21.5 |
| Programmatic-SEO publication gate (5 firms / 250 words / 3 inbound links)                  | `SEO.md` §10.2                             |
| Defer challenge-detail pages                                                               | `SEO.md` §10.3                             |
| `drizzle-zod` for derived base schemas; `www`→apex redirect; `cdn.propfirmlenz.com` for R2 | `ARCHITECTURE.md` §4.1, §19                |

### Notable constraints recorded

- **Indigo `#4F46E5` (3.1:1) and violet `#6D3DF5` (3.4:1) fail WCAG AA for normal text on the
  near-black background.** They are restricted to gradients, surfaces, large text, and non-text UI.
  Cyan (12.5:1) is the accent for anything that must be read. (`DESIGN.md` §2.5)
- No rating, review, or payout columns exist in the Phase 1 schema — deliberately, so there is
  nothing to fill with a guess before the data exists. (`DATABASE.md` §5.1)
- `AggregateRating` / `Review` structured data is prohibited before Phase 3. (`SEO.md` §11)

---

## Known issues

**No blocking issues.** The items below are open with agreed handling, not blockers.

| #   | Issue                                                                                                                                                                         | Impact                                                                                               | Handling                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 0   | **Git identity unset** — `user.name` and `user.email`                                                                                                                         | **`git commit` will fail.** Blocks the initial commit, nothing else                                  | Owner runs `git config --global` for both (`INITIALIZATION.md` §1.2)                                                   |
| 1   | **No logo assets in the repository** — no SVG masters, and no raster files either                                                                                             | Header mark, favicon, and OG images have nothing to reference. `public/brand/` will be empty at init | **Deferred by the owner.** Supply at least raster 2×/3× before UI work; SVG masters when convenient (`DESIGN.md` §3.3) |
| 2   | **Wordmark typeface unconfirmed**                                                                                                                                             | Display face cannot be deliberately matched or contrasted against Inter                              | Non-blocking. Default: Inter throughout (`DESIGN.md` §4.1)                                                             |
| 3   | **No separate requirements document exists.** The specification came from the instruction messages in this session; nothing was found in the workspace or session attachments | Documentation is built from that specification — any requirement not stated there is absent          | Confirm the docs capture the intent, or supply the missing source                                                      |
| 4   | Two MCP connectors (Crypto.com, Webflow) require authorisation                                                                                                                | None on this project                                                                                 | Ignore, or authorise in claude.ai connector settings                                                                   |
| 5   | **A `redirects` row with `status_code = 410` currently 404s** rather than returning a true 410                                                                                 | A deliberately-removed URL reports "not found" instead of "gone" — a weaker but not incorrect signal | Needs the URL-normalisation middleware (`SEO.md` §3.3, §8), which is not built yet                                     |
| 6   | **Media upload is deferred.** The firm editor manages media REFERENCES only; there is no upload endpoint, no R2 integration, and therefore no file-type or size validation | An admin cannot attach a firm logo yet, so `FirmLogo` renders its empty box | Deliberate: inventing an upload backend was out of scope. The media library and its validation land together |
| 7   | **Vitest worker cap.** `maxWorkers: 2` in `vitest.config.mts`                                                                                                       | Five test files each boot a PostgreSQL-in-WASM instance; at the default worker count they exhausted memory and killed a fork mid-run, surfacing as a spurious "worker exited unexpectedly" with a different pass count each time | Capped at 2 workers, verified stable across repeated runs. Raise only with a measured check                            |
| 8   | **Public pages are `force-dynamic`.** No ISR, no cache tags                                                                                                                   | Correct but unoptimised; every request hits the database                                             | Caching and revalidation tags are a later stage (`ARCHITECTURE.md` §8)                                                 |

**Resolved 2026-09-03:** all 17 blocking decisions, including the draft model, framework, and
canonical domain.

---

## Session log

| Date       | Work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Result                                                                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-03 | Created `CLAUDE.md` and eight `docs/` files; inspected 13 UX references and the official logo                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Documentation complete; awaiting review                                                                                                                              |
| 2026-09-03 | Documentation review completed by the owner; **12 architecture decisions approved** and recorded across `CLAUDE.md` §12.4b–d, `ARCHITECTURE.md` §0/§3.3/§4/§5.2/§7/§16/§18/§19/§20, `DATABASE.md` §1.3/§5.4/§10, `SEO.md` §3.1/§10.3, `DESIGN.md` §4.1/§15, `PROJECT.md` §6.9, `ROADMAP.md`                                                                                                                                                                                                                                                                             | Blocking decisions cut from 14 to 5; stack settled. **Still documentation-only**                                                                                     |
| 2026-09-03 | **Remaining decisions locked** — draft model, framework, styling, primitives, icons, validation, logging, testing, analytics deferral, palette, logo, currency, `/compare`. Wrote the full `draft_payload` specification (`DATABASE.md` §3.2.1: state machine, payload envelope, six hard rules) and rewrote `ADMIN.md` §7 as `LIVE → EDIT DRAFT → PREVIEW → PUBLISH`                                                                                                                                                                                                   | **Zero blocking decisions.** Architecture complete. **Still documentation-only**                                                                                     |
| 2026-09-03 | **Live side-by-side preview added to Phase 1 scope.** New sections: `ARCHITECTURE.md` §21 (9 subsections — component sharing, `materializeDraft` contract, iframe rationale, refresh model, 8 isolation guarantees, affiliate safety, head suppression, 9 test cases), `ADMIN.md` §7A (7 subsections — worked example, layouts, controls, indicator), `DESIGN.md` §15 (6 subsections — split layout, panes, indicator, a11y, performance), `CLAUDE.md` §12.4f (rules 34–44). Also updated `SEO.md` §8–9, `DATABASE.md` §5.10, `ROADMAP.md` §1.4, `ADMIN.md` §6.1/§7/§18 | Requirement fully recorded. **Still documentation-only — no code, no dependencies, no Git, no database.** Awaiting approval to initialise                            |
| 2026-09-03 | **Incident:** a PowerShell renumbering pass on `DESIGN.md` re-encoded UTF-8 as ANSI, corrupting every em-dash, arrow, and box character. Detected in the same turn, repaired by round-tripping the double-encode and rewriting without BOM; content verified intact (666 lines, all headings and special characters correct). **Lesson: use the Edit tool for markdown, not `Get-Content`/`Set-Content` round-trips** — Windows PowerShell 5.1 reads BOM-less UTF-8 as ANSI                                                                                             | Resolved; no content lost                                                                                                                                            |
| 2026-09-03 | **Preflight review.** Read `CLAUDE.md` + all 8 `docs/` files completely; verified repository, git, and environment. Corrected an earlier incorrect claim that Node/Git were absent — both installed (Node **24.19.0**, Git **2.55.0**), simply not on the automation shell's PATH. Found **16 documentation defects**                                                                                                                                                                                                                                                   | Reported; no changes made                                                                                                                                            |
| 2026-09-03 | **Pre-initialization cleanup.** Applied 6 owner decisions (Node 24, pnpm, admin-by-id, DB conventions, rollup fix, defect fixes). Fixed all 16 defects. Added `ARCHITECTURE.md` §22 (identifier strategy) and `DATABASE.md` §5.10b (rollup semantics). Created `docs/INITIALIZATION.md`                                                                                                                                                                                                                                                                                 | Documentation clean and consistent. **Still documentation-only**                                                                                                     |
| 2026-09-03 | **Brand migration to Prop Firm Lenz.** 45 brand + 21 domain references migrated across all 10 files; npm package name → `prop-firm-lenz`. Official logo PNGs recorded as authoritative. Official palette locked in `DESIGN.md` §2.3 with **all 48 foreground/background pairings computed** and three binding usage constraints derived (§2.5). Added `INITIALIZATION.md` §0a (brand/domain/assets) and border tokens. Two literal filesystem paths deliberately left at the pre-rename spelling                                                                        | Brand consistent; accessibility measured, not assumed. **Still documentation-only — no code, no dependencies, no Git, no database.** Awaiting approval to initialise |
| 2026-09-04 | **Project initialized.** Next.js 16.3.4 App Router, TS strict, Tailwind v4 + official tokens, Radix, Lucide, Zod, Drizzle config, Vitest/Playwright/axe/LHCI, pino, argon2. pnpm 11.25.0 via Corepack, Node 24.19.0. Logo PNGs copied checksum-verified. Git on `main`, 3 commits, no remote. **No schema, no migrations, no business data.** | typecheck ✅ lint ✅ test ✅ format ✅ · **build ❌ blocked by exFAT on D:** (verified building fine on NTFS) |
| 2026-09-04 | **Migrated exFAT → NTFS.** Copied to `C:ProjectsProp Firm Lenz` with full git history; D: retained as backup. Removed `nodeLinker: hoisted`; **isolated linker restored and verified**. Fresh `pnpm install` (774 pkgs). | format ✅ typecheck ✅ lint ✅ test ✅ **build ✅ (5.0s)** dev ✅ (519ms) · logos checksum-identical |
| 2026-09-04 | **Phase 1 Stage 1: database + application foundation.** 26 tables, 1 migration (67 CHECKs, append-only triggers), draft/publish with optimistic concurrency, public/admin repository isolation, Argon2id + DB sessions, RBAC, affiliate tracking, SEO foundation. Added `uuid` (UUIDv7) and `@electric-sql/pglite` (real-Postgres tests). | format ✅ typecheck ✅ lint ✅ **87 tests ✅** build ✅ db:check ✅ |
| 2026-09-04 | **Phase 1 Stage 2: admin auth, shell and prop firm workspace.** Login/logout, Edge middleware + per-route RBAC, sidebar shell, dashboard with live counts only, firm list with validated server-side query, create + id-keyed workspace, draft/publish/discard wired to the Stage 1 service, preview route (noindex, no canonical/OG/JSON-LD, 404 anonymous, inert affiliate CTA), audit log viewer. No new dependencies. | format ✅ typecheck ✅ lint ✅ **120 tests ✅** build ✅ (21 routes) db:check ✅ |
| 2026-09-04 | **Phase 1 Stage 3: public firm profile, SEO architecture and preview integration.** Unified the two competing view models into the canonical `FirmView` (`lib/view/firm-view.ts`); `getPublishedFirmView()` and `materializeDraft()` now share `assembleView()`. Built the single `FirmProfile` component tree used by both the public route and the admin preview, `/prop-firms` (filters, crawlable pagination, honest empty states) and `/prop-firms/{slug}` (metadata, canonical, OG, breadcrumbs, WebPage + BreadcrumbList JSON-LD, 301/308 slug redirects). Database-driven sitemap with a thin-content gate. No new dependencies. | format ✅ typecheck ✅ lint ✅ **203 tests ✅** build ✅ (24 routes) |
| 2026-09-04 | **Phase 1 Stage 3.1: public affiliate routing + documentation hardening.** Built `/go/{slug}` on the existing `resolveAffiliateLink` / `recordAffiliateClick` services — no resolution logic duplicated. Added `isSafeAffiliateDestination` (application-layer open-redirect guard over the DB's `^https://` CHECK) and pure request-classification helpers (bot, prefetch, device, referrer host, same-origin landing path, allowlisted `p`/`c`). Click is recorded before the 302 `[owner-directed]`; `ARCHITECTURE.md` §11.1–11.3 updated to match. Corrected `CLAUDE.md` rule 35 to name `getPublishedFirmView()`. No new dependencies. | format ✅ typecheck ✅ lint ✅ **244 tests ✅** build ✅ (25 routes) |
| 2026-09-04 | **Phase 1 Stage 4: public homepage.** Built `/` inside the `(public)` group (the placeholder root route is gone): hero with real computed counts, GET-form search into `/prop-firms`, alphabetical firm grid, trust/methodology section, DB-driven browse-by facets, recently-checked list on real `verified_at`, closing CTA, definitional "what to compare" prose. Rewrote the site header (sticky, `<details>` mobile menu, no client JS) and footer (three columns, affiliate disclosure, unbuilt sections as text not links). Added `loading`/`error`/`not-found` for the public group. Two narrow repository additions; no new firm view model. `WebSite` + `WebPage` JSON-LD only. Capped vitest at 2 workers after PGlite instances exhausted memory. No new dependencies. | format ✅ typecheck ✅ lint ✅ **272 tests ✅** build ✅ (26 routes) |
| 2026-09-04 | **Phase 1 Stage 5: admin firm data management.** Fixed a real defect — `publishFirm` wrote firm columns only, so staged challenges/rules/offers were validated, previewed, then silently dropped. Added `firm-publish-children.ts` (all six child collections + SEO materialised in the publish transaction), `firm-draft-overlay.ts` (pure, full-coverage preview overlay), `firm-children.ts` (one staging path for every child op, with per-collection permissions), an admin children repository, child form schemas, server actions, and six editor tabs. Extended the draft envelope with `affiliateLinks`. Fixed an unrelated build blocker: empty values in a copied `.env.example` failed the env schema. No new dependencies. | format ✅ typecheck ✅ lint ✅ **330 tests ✅** build ✅ (26 routes) |
