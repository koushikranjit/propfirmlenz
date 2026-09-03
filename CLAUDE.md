# CLAUDE.md — Permanent Operating Instructions for Prop Firm Lenz

> This file is the **permanent instruction set** for Claude Code working on Prop Firm Lenz.
> It outranks convenience, speed, and inference. When this file conflicts with an assumption,
> this file wins. When this file conflicts with an explicit instruction from the project owner,
> the owner wins — and this file should then be updated.

---

## 0. Document legend

Markers used across `CLAUDE.md` and `docs/`:

| Marker       | Meaning                                                                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `[LOCKED]`   | Fixed requirement from the project owner. Do not change, reinterpret, or "improve" it without explicit approval.                                |
| `[APPROVED]` | A previously proposed decision the owner has now approved. **Binding — same force as `[LOCKED]`.** Approved 2026-09-03 unless stated otherwise. |
| `[PROPOSED]` | Claude's recommendation. **Not yet approved.** Must not be implemented until the owner approves it.                                             |
| `[OPEN]`     | Genuinely undecided. Requires an owner decision before dependent work starts.                                                                   |

If you are about to write code that depends on a `[PROPOSED]` or `[OPEN]` item, **stop and ask**.

---

## 1. Start-of-session protocol

Perform these steps at the **start of every session**, before any other work:

1. **Read `CLAUDE.md`** (this file) in full.
2. **Read `docs/SESSION.md`** to learn the current phase, status, in-progress work, and known issues.
3. **Inspect the existing repository** before making changes:
   - List the project tree.
   - Read the files you are about to touch, and their immediate neighbours.
   - Read `docs/` files relevant to the task (`ARCHITECTURE.md`, `DATABASE.md`, `SEO.md`, `ADMIN.md`, `DESIGN.md`, `ROADMAP.md`, `INITIALIZATION.md`).
4. **If Git exists**, check `git status` and recent commits (`git log --oneline -20`) to understand
   uncommitted work and recent direction. If Git does **not** exist, do not initialise it unless
   explicitly asked.
5. **Confirm the current phase** from `docs/SESSION.md` and `docs/ROADMAP.md` before planning work.

Do not begin implementation until steps 1–5 are complete.

---

## 2. Verification rules — never assume

- **Never assume functionality exists.** Before referencing a component, route, table, column,
  helper, environment variable, or package — verify it exists by reading the file or schema.
- **Never assume a package is installed.** Check `package.json` before importing.
- **Never assume a migration ran.** Check the migrations directory and, when possible, the database.
- If verification is impossible, say so explicitly and ask, rather than guessing.
- **Never unnecessarily rebuild existing functionality.** Search for an existing implementation
  first. Extend or refactor it. Duplicating a component, service, or utility is a defect, not a
  shortcut. If an existing implementation is genuinely unsuitable, explain why before replacing it.

---

## 3. Data integrity — the hardest rule

**Never invent business data.** This is non-negotiable and applies to code, seeds, fixtures,
documentation, UI copy, screenshots, examples, and conversation.

Specifically, never fabricate:

- Prop firm names, descriptions, legal entities, founding dates, locations, or ownership
- Challenge/account parameters: prices, account sizes, profit targets, drawdown limits,
  profit splits, leverage, trading day requirements
- Trading rules, restrictions, or platform/instrument availability
- Payout data, payout amounts, payout speed, payout proof, or payout statistics
- Reviews, review text, review counts, ratings, or aggregate scores
- Trader results, funded-trader counts, success rates, or testimonials
- Affiliate conversions, click counts, revenue, EPC, or commission rates
- Discount codes, offer terms, or expiry dates

**The database is the single source of truth.** All firm, challenge, rule, platform, instrument,
offer, payout, and review data is entered and maintained through the admin dashboard, and read from
PostgreSQL at runtime.

- Never hard-code business data in components, constants files, or JSON fixtures.
- Never ship placeholder firms that look real. If a placeholder is unavoidable during development,
  it must be obviously fake (e.g. `Example Firm A`) and must never reach a production build.
- If a value is unknown, render an explicit empty/unknown state. **Do not fill the gap.**
- Aggregate values (ratings, averages, counts) must be computed from stored records, never estimated.

`Lucid Prop` is the designated **initial example/test firm** for admin development. Its _record_ may
exist as a test fixture; its _attribute values_ must still be entered by a human. Do not invent
Lucid Prop's prices, rules, payouts, or ratings.

---

## 4. Phase discipline

- Work only within the **current development phase** recorded in `docs/SESSION.md`.
- **Never implement future phases without explicit approval.** Do not "prepare" future features by
  building them early.
- You _may_ and _should_ leave the architecture ready for future phases (schema headroom, extension
  points, stable interfaces) as documented in `docs/DATABASE.md` and `docs/ARCHITECTURE.md`.
- Phase boundaries are defined in `docs/ROADMAP.md`:
  - **Phase 1** — Landing page UI + Master Dashboard + database + dynamic prop firm management
  - **Phase 2** — Payout tracking system
  - **Phase 3** — Review collection system
- If a task appears to require future-phase work, stop and ask before proceeding.

---

## 5. SEO architecture must be preserved

`docs/SEO.md` is binding. Never regress it for convenience.

- Public content pages must be **server-rendered** (SSG/ISR/SSR). Never move primary content behind
  client-side-only rendering, `useEffect` fetches, or loading spinners.
- Every indexable page must have: a unique `<title>`, a unique meta description, a **self-referencing
  canonical**, Open Graph tags, and breadcrumbs where applicable.
- Metadata comes from the database (`seo_metadata`), with deterministic fallbacks — never from
  hard-coded strings scattered in components.
- Never break URL structure. **A slug change must create a 301 redirect.** Never delete a public URL
  without a redirect or a deliberate 410.
- Keep `sitemap.xml` and `robots.txt` generated from the database. Drafts, `noindex` pages, and
  affiliate redirect routes must never appear in the sitemap.
- Structured data (JSON-LD) must be server-rendered and must only describe data that actually exists.
  **Never emit `AggregateRating` or `Review` markup before Phase 3, and never from fabricated data.**
- Do not create thin pages. Programmatic pages must satisfy the content thresholds in `docs/SEO.md`
  or ship as `noindex`.
- Do not add render-blocking scripts, unsized images, or layout-shifting elements.

---

## 6. Security and authorization must be preserved

- **Deny by default.** Every admin route, server action, and API handler must authorise on the
  server. UI-level hiding is not authorisation.
- Never bypass, weaken, or "temporarily disable" auth, RBAC, CSRF protection, rate limiting, or
  input validation — including in development branches.
- Admin authentication is **separate** from public user authentication. A public account must never
  be able to gain admin capability.
- Never log, print, or commit secrets, tokens, password hashes, session identifiers, or raw IP
  addresses.
- Validate every external input with a schema (Zod) at the boundary. Database constraints are the
  last line of defence, not the first.
- Use parameterised queries only. Never build SQL by string concatenation.
- Never expose internal error details, stack traces, or database errors to the client.
- `audit_logs` is append-only. Never add code paths that update or delete audit records.
- Destructive operations (delete, unpublish, rollback, bulk edit) require confirmation and an audit
  entry, and prefer soft deletion.

---

## 7. Accessibility and performance requirements

**Accessibility (target: WCAG 2.2 AA)**

- Semantic HTML first; ARIA only when semantics are insufficient.
- All interactive elements are keyboard-operable with a visible focus indicator.
- Text contrast ≥ 4.5:1 (≥ 3:1 for large text and meaningful UI boundaries).
  See `docs/DESIGN.md` — **indigo and violet are not permitted for body text on dark backgrounds.**
- Every image has meaningful `alt` text, or `alt=""` when decorative.
- Forms have associated labels, descriptive errors, and errors announced to assistive tech.
- Respect `prefers-reduced-motion`. Animation is never required to understand content.
- Never remove focus outlines without an equally visible replacement.

**Performance budgets**

- LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 (field targets, mobile).
- Always set explicit image dimensions or aspect ratios.
- Prefer Server Components; add client JavaScript only where interaction requires it.
- No unbounded queries — paginate lists; avoid N+1 access patterns.

---

## 8. Code quality standards

- **TypeScript, `strict: true`.** No `any`, no unchecked `as` casts, no `@ts-ignore` without a
  written justification comment.
- Production-quality, reusable architecture: shared types, shared validation schemas, shared UI
  primitives. Compose rather than copy.
- Layered structure: route/UI → validation → service → data access → database.
  **No database access from components.**
- Use design tokens from `docs/DESIGN.md`. Never hard-code hex colours, spacing, or font sizes in
  components.
- Keep files focused. Name things for what they mean in this domain (`challenge`, `firm`, `offer`),
  not generically (`item`, `data`, `thing`).
- Handle loading, empty, error, and unauthorised states explicitly for every data-driven view.
- Comment _why_, not _what_. Match the surrounding code's style and density.

---

## 9. Change protocol

**Explain important architectural changes before making them.** Before you:

- add or change a database table, column, constraint, or index
- add a dependency
- change routing, URL structure, or slug generation
- change the authentication or authorization model
- change caching or revalidation behaviour
- introduce a new architectural pattern or replace an existing one
- alter design tokens or the design system

…describe the change, its rationale, its impact (especially on SEO and existing data), and its
migration path — **then wait for approval.**

Routine work inside an approved pattern does not require this ceremony.

---

## 10. Testing

Test changes appropriately to the risk:

- **Business logic and validation** — unit tests (**Vitest**).
- **Database, RBAC, draft/publish/rollback, redirects** — integration tests against a **real
  PostgreSQL** (a Neon branch in CI), never a mock.
- **Critical admin flows and public routes** — end-to-end tests (**Playwright**).
- **Every page** — accessibility check (axe) and metadata assertion.
- Run type-check and lint before declaring work complete.
- **Report results faithfully.** If tests fail, say so and include the output. If a step was
  skipped, say it was skipped. Never describe unverified work as verified.

---

## 11. End-of-session protocol

At the end of any significant piece of work, **update `docs/SESSION.md`**:

- Move finished items into **Completed** (with the date).
- Update **In progress** and **Next task**.
- Record any **Important decisions** made, and by whom.
- Add or clear **Known issues**.
- If the phase changed, update **Current Phase** — but only with explicit owner approval.

Keep the update short and factual. `SESSION.md` is a handoff document, not a changelog.

---

## 12. Permanent Prop Firm Lenz rules and constraints

These apply for the life of the project.

### 12.1 Product constraints `[LOCKED]`

1. Prop Firm Lenz is a **prop firm comparison, data, and transparency platform** — not a prop firm,
   not a broker, and not a financial adviser.
2. It never takes custody of funds, never offers accounts, and never gives financial advice.
3. Data accuracy and transparency outrank conversion optimisation. When they conflict, accuracy wins.
4. Affiliate relationships must be **disclosed**, and must never alter rankings, ratings, or data
   presentation in a way that is not disclosed to the user.
5. Every public data point must be traceable to a database record entered by an admin.

### 12.2 Originality constraints `[LOCKED]`

6. **Do not copy Prop Firm Match** — not their branding, logo, layout, exact UI, components, assets,
   copy, content, data, or design. No scraping, no cloning, no "inspired by" reproductions of their
   distinctive screens.
7. The same applies to any other competitor's proprietary assets and copy.
8. **The official Prop Firm Lenz logo is the only approved logo.** Do not generate, redraw, restyle,
   substitute, or "improve" the logo. Do not create alternate marks or wordmarks. It is specified in
   `docs/DESIGN.md` §3.
9. Third-party firm logos are used only as uploaded, factual identifiers of the firm they represent,
   stored in `media`, and never restyled or embedded in Prop Firm Lenz branding.

### 12.2b External UX references `[LOCKED]`

UX reference screenshots are held **outside the repository** at
`C:\Users\koush\Downloads\PFM UI` (13 files), catalogued in `docs/DESIGN.md` §11.

- They are screenshots **of another product**. Use them **only** to understand layout, information
  hierarchy, navigation patterns, dashboard structure, content density, spacing, tables, cards,
  filters, forms, and general UX conventions.
- **Never** copy their branding, logo, colour scheme, exact UI, text, content, assets, or data, and
  never reproduce the reference product's visual identity.
- **Never copy the reference files into this repository**, and **never modify, move, or delete
  anything in that folder.** It is read-only.
- Any data visible in those screenshots (firm names, ratings, prices, payout figures, review counts,
  discount codes) is **another company's business data**. It falls under §3 and must never be
  reproduced, seeded, or used as an example.
- The output is always an **original Prop Firm Lenz design** built from `docs/DESIGN.md` tokens and
  components.

### 12.3 Design constraints `[LOCKED]`

10. Aesthetic: **minimal, premium, financial/trading**. Dark theme; near-black background; dark cards;
    white primary text; gray secondary text.
11. **Official brand colours `[LOCKED]`** — Cyan `#19E6D2` · Blue `#268BFF` · Indigo `#4F46E5` ·
    Violet `#6D3DF5`, and the master gradient **cyan → blue → indigo → violet**.
    **Surfaces:** `#050609` (base) · `#080A10` (near-black) · `#0D1017` (card) · `#15122A`
    (elevated) · `#180D35` (dark purple) · `#3B1B75` (deep violet).
    **Text:** `#FFFFFF` · `#D9DCE5` · `#9298A8` · `#737A89`.
    Measured contrast and the binding usage constraints are in `docs/DESIGN.md` §2.5 — in particular
    `#737A89` is AA-safe **only on `#050609`**, and indigo/violet fail on purple surfaces.
12. Restrained animation. Minimal glow. Minimal glassmorphism. No decorative excess.
13. Mobile-first and fully responsive. The mobile layout is a first-class design, not a fallback.
14. Full detail in `docs/DESIGN.md`, which is binding.

### 12.4 Technical constraints `[LOCKED]`

15. TypeScript everywhere, strict mode.
16. **PostgreSQL** is the database. The database is the single source of truth.
17. Public pages are server-rendered for SEO.
18. Admin is fully dynamic, authenticated, authorised, and audited.
19. All prop firm content is **dynamic** — managed through the admin dashboard, never hard-coded.
20. Affiliate links are stored in the database and served through a tracked, `noindex` redirect route.

### 12.4b Locked stack `[LOCKED]`

Binding as of 2026-09-03. **Do not substitute any of these without explicit owner approval.**

| Concern                     | Decision                                                                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime                     | **Node.js 24 LTS** — pinned in `.nvmrc` and `engines`. **Do not downgrade to Node 22.**                                                                                    |
| Package manager             | **pnpm**, activated via Corepack, version pinned in `packageManager`. **npm is not the project package manager** — never run `npm install`                                 |
| Framework                   | **Next.js App Router**, React Server Components, TypeScript `strict: true`                                                                                                 |
| Styling                     | **Tailwind CSS v4** + CSS custom-property design tokens                                                                                                                    |
| UI primitives               | **Radix UI**, styled with the Prop Firm Lenz design system — no pre-themed kit                                                                                             |
| Icons                       | **Lucide** — one icon set only                                                                                                                                             |
| Validation                  | **Zod**, shared server/client schemas                                                                                                                                      |
| ORM                         | **Drizzle** (with `drizzle-kit` migrations; `drizzle-kit push` prohibited outside local dev)                                                                               |
| Database host               | **Neon** (PostgreSQL; pooled endpoint for the app, direct for migrations)                                                                                                  |
| Hosting                     | **Vercel** (application kept container-buildable)                                                                                                                          |
| Object / media storage      | **Cloudflare R2**                                                                                                                                                          |
| Admin authentication        | **Database-backed sessions**, opaque tokens stored hashed, **Argon2id** password hashing                                                                                   |
| Draft model                 | **`draft_payload`** — `LIVE → EDIT DRAFT → PREVIEW → PUBLISH` (§12.4e)                                                                                                     |
| Identifiers                 | **Admin routes by database id; public routes by slug.** A slug rename must never break an admin draft, workspace URL, or preview (`docs/ARCHITECTURE.md` §22)              |
| DB conventions              | UUIDv7 · soft delete (`deleted_at` + partial unique) · `numeric` money · original amount + source currency · **no stored converted-money columns** (`docs/DATABASE.md` §1) |
| Rule modelling              | **Hybrid** — hot rules as `challenges` columns, long tail in `rules` / `rule_values`                                                                                       |
| Canonical production domain | **`https://propfirmlenz.com`**                                                                                                                                             |
| UI typeface                 | **Inter** — unless the official logo wordmark requires a different display face                                                                                            |
| Palette                     | Official surfaces + text tokens in `docs/DESIGN.md` §2.3, with measured contrast and usage constraints in §2.5                                                             |
| Brand assets                | `Prop Firm Lenz logo.png` (lockup) and `Prop Firm Lenz Icon.png` (mark) — used **unmodified**; never recreated, redrawn, or substituted                                    |
| Logging / error monitoring  | **pino + Sentry** for Phase 1, unless a technical issue requires reconsideration                                                                                           |
| Testing                     | **Vitest · Playwright · axe · Lighthouse CI**                                                                                                                              |
| Analytics                   | **Undecided — and explicitly must not block initialisation.** Build Phase 1 with no page-analytics vendor wired in                                                         |
| Supporting tables           | `admin_sessions`, `permissions`, `role_permissions`, `admin_user_roles`, `affiliate_clicks`, `entity_versions`, `redirects`, `internal_notes`, `media_usages`              |

### 12.4c Monetary values `[APPROVED]`

21. **Store original monetary values with their source currency.** Every money column is paired with
    its own `currency` column, and both record what the firm actually publishes.
22. **Never silently convert.** A converted figure is never written into the source column, never
    replaces the source value, and never becomes the stored value.
23. Any currency conversion is **display-only and derived at read time**, visibly labelled as a
    conversion, with its rate and rate date shown.
24. Comparisons and filters that span currencies must state the basis they use. A cross-currency
    comparison presented as if it were like-for-like is a data-integrity defect.

### 12.4d `/compare` scope `[LOCKED]`

25. **Architect `/compare` URLs and relationships now** — route shape, canonical policy, `noindex`
    rules, reserved-segment slug guard, and the data relationships that make comparison possible.
26. **Do not build the comparison UI or pages in Phase 1.** Architecture only. The feature is Phase 4.

### 12.4e Draft model `[LOCKED]`

**`LIVE → EDIT DRAFT → PREVIEW → PUBLISH`.** Full specification: `docs/DATABASE.md` §3.2.1 and
`docs/ADMIN.md` §7.

27. Pending edits to a published firm live in **`prop_firms.draft_payload` (jsonb)** — covering the
    firm and every child (challenges, rules, platforms, instruments, offers, SEO).
28. **Published columns are never modified by editing, saving, or previewing a draft.** They change
    only on an explicit publish action. While a draft exists, the public site serves the published
    version unchanged.
29. **No public query, repository, domain type, or serialiser may read `draft_payload`.** Draft data
    must be _structurally_ unable to leak, not merely filtered out.
30. **Preview** renders the draft through the **real public template** at an authenticated,
    `noindex` admin route, via a single `materializeDraft()` overlay returning the same domain type
    the public page consumes.
31. **Publish is one transaction**, ending by clearing `draft_payload`, then revalidating cache tags.
    **Discard** clears `draft_payload` and leaves published data untouched.
32. **Rollback restores into `draft_payload`**, never straight to live.
33. A draft records `base_version`; a draft forked from a superseded version is **stale** and must
    warn before publishing rather than overwrite silently.

### 12.4f Live preview `[LOCKED — Phase 1]`

The firm workspace renders a **side-by-side editor and public-page preview**. Specification:
`docs/ADMIN.md` §7A · `docs/ARCHITECTURE.md` §21 · `docs/DESIGN.md` §15.

34. **The preview renders the same public components as the production page.**
    **Never build a separate preview UI.** A parallel implementation of the firm page is prohibited —
    it drifts from production and the preview stops being trustworthy, which defeats the feature.
35. `getPublishedFirm()` and `materializeDraft()` return the **identical** `FirmView` type. Adding a
    field to the public view without supplying it from the draft materialiser must be a **compile
    error**, not a silent visual difference.
36. `components/public/**` must never import from `components/admin/**`.
37. The preview is an **iframe** on an authenticated route — required so that responsive preview is
    genuine (media queries resolve against the iframe's viewport, not the browser's). Sandboxed
    without `allow-forms` or `allow-top-navigation`.
38. **`materializeDraft()` is pure and read-only. It never writes.**
39. **Previewing must never create affiliate click or conversion attribution.** Affiliate CTAs render
    inert in preview — correct styling and copy, no `/go/` href — so no request exists to attribute.
40. Preview fires **no analytics events**, no view counts, no popularity increments.
41. Preview is `noindex` (HTTP header), `no-store`, robots-disallowed, **never in the sitemap**,
    **never a public canonical**, and emits **no** canonical, Open Graph, or JSON-LD.
42. Preview **can never publish**. Publishing is only the explicit workspace header action.
43. Preview **can never expose draft data through a public production query** — public repositories
    do not read `draft_payload`, and the preview route requires `firm:read`.
44. Anonymous access to a preview URL returns **404**, not 403.

### 12.5 Process constraints `[LOCKED]`

45. Documentation-first: `docs/` is updated alongside the code it describes.
46. Phase discipline (Section 4) is enforced.
47. Architectural changes are explained before implementation (Section 9).
48. `docs/SESSION.md` is updated at the end of significant work (Section 11).
49. Do not initialise frameworks, install dependencies, initialise Git, create databases, or generate
    schema files **until the owner explicitly approves project initialisation.**
    _Status as of 2026-09-03: the stack is fully locked (§12.4b–e) and no architectural decision is
    outstanding. **Initialisation itself has not yet been approved.**_

---

## 13. When in doubt

Ask. A clarifying question costs one message. An invented prop firm rule, a broken canonical URL, or
a bypassed authorisation check costs far more.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
