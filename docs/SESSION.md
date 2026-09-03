# SESSION.md — Current State

> Read this **before starting any work** (`CLAUDE.md` §1).
> Update it at the end of any significant work (`CLAUDE.md` §11).

---

## Current Phase

**Phase 1** — Landing page UI + Master Dashboard + database + dynamic prop firm management.

**Phase 1 §1.1 (Foundation) is done** — the toolchain is initialized (2026-09-04). **No Phase 1
feature work has started**, and none may start without explicit owner approval.

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

**The one outstanding blocker is environmental, not architectural:** the `D:` drive is exFAT, which
prevents `pnpm build` from completing in place (see "Blocker" below).

Remaining `[OPEN]` items are non-blocking and each carries a stated default.

---

## Application implementation

**Initialized 2026-09-04.** Toolchain only — no features, no schema, no business data.

Present:

- ✅ Next.js 16.3.4 App Router · React 19.2.8 · TypeScript 5.9.3 strict (+7 extra strict flags)
- ✅ Tailwind CSS v4.3.3 with the official tokens in `src/styles/tokens.css`
- ✅ Radix UI 1.6.7 · Lucide 1.39.0 · Zod 4.5.4 · Inter via `next/font`
- ✅ Drizzle ORM 0.45.2 + drizzle-kit 0.31.10 — **configuration only**
- ✅ Vitest 4.1.11 · Playwright 1.62.1 · axe 4.13.0 · Lighthouse CI 0.15.1
- ✅ pino 10.3.1 · @node-rs/argon2 2.2.0
- ✅ Git on `main`, 3 commits, no remote
- ✅ Official logo PNGs in `public/brand/` (checksum-verified unmodified)

Deliberately absent:

- ❌ No database schema, no migrations, no tables, no Neon connection
- ❌ No `db:push` script; `drizzle-kit push` prohibited
- ❌ No business or prop-firm data of any kind
- ❌ No landing page, admin dashboard, or UI components
- ❌ No production credentials (`.env.example` holds names only)

---

## ⚠ Blocker — the D: drive is exFAT

**`pnpm build` cannot complete in `D:\Projects\Prop Firm Lens`.** Verified by experiment: the
identical commit builds successfully when copied to NTFS.

| Bundler | Failure on exFAT |
| --- | --- |
| Turbopack (default) | `os error 1450` — insufficient system resources reading `node_modules` |
| webpack (`--webpack`) | `EISDIR ... readlink` — exFAT has no symlinks, so `readlink` returns the wrong errno |

Workarounds already applied: pnpm `nodeLinker: hoisted`, bundler pinned to `--webpack`,
`git config --global --add safe.directory` (exFAT records no ownership). These made install,
typecheck, lint, test and commit work — **but not the build.**

**Resolution requires an owner decision** (both are outside a documentation/init task):

1. **Move the project to the NTFS `C:` drive** — recommended, non-destructive, ~349 GB free.
2. Reformat `D:` to NTFS — **destructive**, would erase the drive.

Until then: `dev`, `build`, and `start` do not work on `D:`. Everything else does.

---

## Next step

**Owner decides how to resolve the exFAT blocker**, then Phase 1 §1.1 continues.

1. ✅ Documentation, architecture, brand migration — complete 2026-09-03.
2. ✅ Git identity configured (`Koushik <koushikranjit8@gmail.com>`).
3. ✅ Initialization executed — complete 2026-09-04.
4. ⬜ **Resolve the exFAT build blocker** (move to `C:`, or reformat `D:`).
5. ⬜ Owner approves Phase 1 feature work.

Schema authoring (`INITIALIZATION.md` §11 step B) remains a **separate gated step**.

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

## In progress

Nothing. Initialization complete; blocked on the exFAT filesystem decision before `pnpm build`
can run in place.

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

**No blocking issues.** The four below are open items with agreed handling, not blockers.

| #   | Issue                                                                                                                                                                         | Impact                                                                                               | Handling                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 0   | **Git identity unset** — `user.name` and `user.email`                                                                                                                         | **`git commit` will fail.** Blocks the initial commit, nothing else                                  | Owner runs `git config --global` for both (`INITIALIZATION.md` §1.2)                                                   |
| 1   | **No logo assets in the repository** — no SVG masters, and no raster files either                                                                                             | Header mark, favicon, and OG images have nothing to reference. `public/brand/` will be empty at init | **Deferred by the owner.** Supply at least raster 2×/3× before UI work; SVG masters when convenient (`DESIGN.md` §3.3) |
| 2   | **Wordmark typeface unconfirmed**                                                                                                                                             | Display face cannot be deliberately matched or contrasted against Inter                              | Non-blocking. Default: Inter throughout (`DESIGN.md` §4.1)                                                             |
| 3   | **No separate requirements document exists.** The specification came from the instruction messages in this session; nothing was found in the workspace or session attachments | Documentation is built from that specification — any requirement not stated there is absent          | Confirm the docs capture the intent, or supply the missing source                                                      |
| 4   | Two MCP connectors (Crypto.com, Webflow) require authorisation                                                                                                                | None on this project                                                                                 | Ignore, or authorise in claude.ai connector settings                                                                   |

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
