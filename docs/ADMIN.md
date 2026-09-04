# ADMIN.md — Prop Firm Lenz Master Admin Architecture

> The Master Admin dashboard is the **only** way business data enters Prop Firm Lenz
> (`CLAUDE.md` §3). If a thing cannot be done in the admin, it cannot be done.
>
> **Status: design only. Nothing implemented.**

Markers: `[LOCKED]` binding requirement · `[APPROVED]` owner-approved, binding ·
`[PROPOSED]` needs approval · `[OPEN]` undecided.

`Lucid Prop` is the designated **initial example/test firm** used throughout this document and used
to validate the workspace end to end. Its record exists as a fixture; **its field values are entered
by a human, never generated.** `[LOCKED]`

---

## 1. Design goals `[LOCKED]`

1. **Complete.** Every public data point is editable here. No SQL, no code changes, no exceptions.
2. **Safe.** Nothing reaches the public site without an explicit publish. Every destructive action is
   reversible or confirmed.
3. **Accountable.** Every mutation is attributable to an admin, with a before/after diff.
4. **Fast to operate.** Researching and entering a firm is repetitive work; the UI optimises for
   keyboard use, density, and low click count.
5. **Honest.** The admin surfaces what is missing and what is stale, so gaps get researched rather
   than guessed.

### UX reference

The layout patterns are informed by the external reference `master dashboard UI sample.png`
(`DESIGN.md` §11) — persistent left sidebar, top search bar, and a card-based multi-column overview
of live operational queues. **Structure only.** Prop Firm Lenz uses its own dark palette, its own
components, and its own information model. `[LOCKED]`

---

## 2. Shell and navigation

### 2.1 Sidebar `[PROPOSED]`

Persistent left sidebar, ~260px expanded / ~64px collapsed (state persisted per admin), full-height,
with the official Prop Firm Lenz logo at top (full lockup expanded, icon-only collapsed —
`DESIGN.md` §3).

```
┌──────────────────────────┐
│ ◆ Prop Firm Lenz         │   logo lockup → collapses to icon
├──────────────────────────┤
│ ⌂  Dashboard             │
│                          │
│ CONTENT                  │
│ ▤  Prop List             │   ← primary working surface
│ ⬡  Challenges            │   cross-firm view
│ ✦  Offers                │
│ ⚑  Affiliate Links       │
│                          │
│ CATALOGS                 │
│ ⊞  Platforms             │
│ ⊟  Instruments           │
│ ⚖  Rules                 │
│                          │
│ SITE                     │
│ ⌕  SEO                   │
│ ⇄  Redirects             │
│ ▣  Media Library         │
│                          │
│ SYSTEM                   │
│ ⏱  Audit Logs            │
│ ⚙  Admins & Roles        │
│ ⚙  Settings              │
├──────────────────────────┤
│ ◐  Admin name / role  ▲  │   account menu, sign out
└──────────────────────────┘
```

Rules `[LOCKED]`:

- **Sidebar items are filtered by permission.** An admin never sees a section they cannot open —
  and the route is independently authorised regardless (`ARCHITECTURE.md` §6.2).
- Groups reflect the mental model (Content / Catalogs / Site / System), not the database layout.
- Phase 2 and Phase 3 add `Payouts` and `Reviews` groups. They do not appear before their phase.
- Active state uses the cyan accent; the gradient is reserved for the logo and primary CTAs only
  (`DESIGN.md` §2.2).
- Mobile: sidebar becomes an off-canvas drawer. The admin is **usable** on tablet; it is not
  optimised for phones. `[PROPOSED]`

### 2.2 Top bar

Global search (§3) · breadcrumb trail · environment badge (**a loud, unmissable badge on
staging/preview** `[LOCKED]`) · notifications `[OPEN]` · account menu.

---

## 3. Global search `[PROPOSED]`

Keyboard-first (`⌘K` / `Ctrl+K`), available from every screen.

- **Searches:** firms (name, slug, legal name), challenges, offers, platforms, instruments, rules,
  media (filename/alt), redirects, admins.
- **Ranking:** exact slug → prefix name → trigram fuzzy (`pg_trgm`, `DATABASE.md` §8).
- **Results** are grouped by type, show status and verification badges, and are keyboard-navigable.
  Result links resolve to **id-keyed** admin routes (`ARCHITECTURE.md` §22), even when the match was
  found by slug.
- **Commands** as well as records: "Create firm", "Go to audit logs", "New redirect".
- **Scoped:** results are filtered by the admin's permissions before rendering. `[LOCKED]`
- Debounced, server-side, capped, and **never** returns internal notes or affiliate destination URLs
  in the result payload. `[LOCKED]`

---

## 4. Dashboard

The landing screen answers: _what needs my attention right now?_

**Layout `[PROPOSED]`** — a responsive card grid, following the reference's multi-column queue
pattern:

**Row 1 — counts (compact stat tiles):**
Published firms · Draft firms · Total challenges · Active offers · Firms needing verification ·
Average data completeness.

**Row 2 — action queues (the working surface):**

| Card                   | Contents                                                                      | Why it matters                                                      |
| ---------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Incomplete records** | Firms with completeness < threshold, worst first, with the top missing fields | Turns gaps into a work queue instead of a guess (`PROJECT.md` §6.5) |
| **Needs verification** | `verification_status IN ('unverified','needs_review')`                        | Trust surface                                                       |
| **Stale data**         | `verified_at` older than the staleness threshold                              | Prop firm rules change constantly                                   |
| **Expiring offers**    | `ends_at` within 7 days, plus already-expired-but-published                   | Prevents publicly visible dead offers                               |
| **Recent activity**    | Last N `audit_logs` entries, actor + action + entity, deep-linked             | Situational awareness across a team                                 |
| **Drafts in progress** | Unpublished edits, oldest first                                               | Stops work being forgotten mid-edit                                 |

**Rules `[LOCKED]`:**

- Every number is a live query. **No hard-coded or cached-stale figures.**
- Empty states say "nothing needs attention", not a zero in an empty card.
- Every card row deep-links into the relevant workspace tab.
- **No revenue, conversion, or click estimates on the dashboard until real data exists**
  (`CLAUDE.md` §3).

---

## 5. Prop List

The firm index — the primary navigation surface into the workspace.

**Table columns `[PROPOSED]`:** logo · name (+ slug) · status badge · verification badge ·
completeness meter · challenge count · offer count · affiliate link presence · last updated (+ by
whom) · row actions.

**Controls:**

- **Search** by name/slug (fuzzy).
- **Filters:** status, verification status, completeness band, has/lacks affiliate link, platform,
  instrument, country, updated-within.
- **Sort** on any column; default `updated_at DESC`.
- **Server-side pagination.** Never load all rows. `[LOCKED]`
- **Saved views** `[PROPOSED]` — e.g. "Drafts", "Needs verification", "Missing affiliate link".
- **Bulk actions** `[PROPOSED]` — publish, unpublish, archive, re-verify, reorder. **Every bulk
  action requires typed confirmation, writes one audit entry per affected row, and is permission-
  gated separately from the single-row action.** `[LOCKED]`
- **Density toggle** (comfortable/compact) — this is a data-entry tool; compact is the default for
  experienced operators. `[PROPOSED]`

**Row actions:** Open workspace · Preview (draft) · View public page · Duplicate `[PROPOSED]` ·
Archive · Delete (soft, dependency-checked — §14).

---

## 6. Firm workspace

Opening `Lucid Prop` enters a dedicated workspace at **`/admin/prop-firms/{id}`**. This is where an admin
spends nearly all of their time, so it is designed as a persistent context, not a form.

**Admin routes are keyed by the stable database id, never the slug** (`ARCHITECTURE.md` §22)
`[LOCKED]`. A slug rename is a supported mid-draft edit, so a slug-keyed workspace URL would break
the open tab, the preview iframe, and every deep link the moment the admin typed a new slug. The
workspace **displays** the slug prominently — it is the firm's public identity — but never routes on
it. Public routes remain slug-keyed (`SEO.md` §3).

### 6.1 Persistent header

Always visible, never scrolls away:

```
┌───────────────────────────────────────────────────────────────────────────┐
│ [logo]  Lucid Prop                     ● Draft changes   Completeness 82%  │
│         /prop-firms/lucid-prop         ⛉ Verified 12 Aug 2026 by K. R.     │
│                                                                            │
│   [ Save draft ]  [ Discard draft ]  [ Publish ]              [ ⛶ ]  [ ⋯ ] │
└───────────────────────────────────────────────────────────────────────────┘
```

- The header spans **both** panes of the split layout (§7A.2) and never scrolls away.
- Unsaved-changes state is explicit and blocks navigation with a prompt. `[LOCKED]`
- `[ ⛶ ]` opens **full-page preview** in a new tab. The side-by-side pane means there is no separate
  "Preview" step button — preview is continuously visible (§7A).
- `[ ⋯ ]`: view public page, duplicate, archive, delete, version history, audit log.
- Completeness and verification are visible from **every** tab — they are the two quality signals
  that matter most.

### 6.2 Tabs `[PROPOSED]`

| Tab             | Contents                                                                                                                                         | Backing tables                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| **Overview**    | Name, slug, legal name, tagline, description, founded year, HQ, website, support, logo, cover, featured flag, display order                      | `prop_firms`, `media`           |
| **Challenges**  | Sortable list + editor for each program: type, size, price, targets, drawdown (type + basis), trading days, profit split, payout terms, leverage | `challenges`                    |
| **Rules**       | Long-tail rules from the catalog, grouped by category, with per-rule notes and source URLs                                                       | `rules`, `rule_values`          |
| **Platforms**   | Multi-select from catalog; primary flag; per-firm notes                                                                                          | `firm_platforms`                |
| **Instruments** | Multi-select; **allowed / explicitly prohibited**; notes                                                                                         | `firm_instruments`              |
| **Offers**      | Promo list: title, code, discount, window, terms, bound affiliate link                                                                           | `offers`                        |
| **Affiliate**   | Links, default selection, campaigns, status, windows, private commission notes                                                                   | `affiliate_links`               |
| **SEO**         | Title, description, canonical, OG image, robots, sitemap, slug + redirect, JSON-LD preview                                                       | `seo_metadata`                  |
| **Media**       | Assets attached to this firm, with alt text and usage                                                                                            | `media`, `media_usages`         |
| **Notes**       | Private internal notes — research trail, contacts, open questions                                                                                | `internal_notes`                |
| **History**     | Version list, diffs, rollback, plus this firm's audit trail                                                                                      | `entity_versions`, `audit_logs` |

**Tab rules `[LOCKED]`:**

- Tabs are **URL-addressable** (`?tab=challenges`) so links, refreshes, and the back button work.
- Each tab shows a **completeness indicator** so gaps are visible without opening every tab.
- Tabs are lazy-loaded but never lose unsaved state on switch.
- **The `Notes` and `Affiliate` tabs are permission-gated separately** — commission terms and
  research notes are commercially sensitive, and neither is ever exposed publicly. `[LOCKED]`

### 6.3 Form conventions `[LOCKED]`

- **Unknown is an explicit choice.** Every optional numeric/boolean field offers a distinct
  "Not disclosed" state that stores `NULL`. A blank input must never silently become `0`
  (`PROJECT.md` §6.5, `DATABASE.md` §5.2).
- Units are shown inline (`%`, `days`) so 0.8-vs-80 errors are visible at entry.
- **Every money field has its own adjacent currency selector**, and the admin enters the value in the
  currency the firm actually publishes — **never pre-converted.** `[APPROVED]`
  The currency defaults to the firm's previously used currency, is never silently inherited from a
  site default, and cannot be left blank when an amount is present (`DATABASE.md` §1.3).
  The admin UI never offers a "convert to USD" action on entry; conversion is a read-time display
  concern only (`ARCHITECTURE.md` §18).
- Validation is inline, on blur, with the same Zod schema the server uses.
- Every field can carry a **source URL** where provenance matters (rules especially).
- Keyboard-first: tab order follows visual order; `⌘S` saves the draft.
- Autosave to draft `[OPEN]` — proposed: autosave drafts every 30s, never autosave a publish.

---

## 7. LIVE → EDIT DRAFT → PREVIEW → PUBLISH `[LOCKED]`

The core safety mechanism. Backed by the `draft_payload` model (`DATABASE.md` §3.2.1).

```
  ┌──────────┐   edit    ┌───────────────────┐  preview  ┌──────────┐ publish ┌───────────┐
  │   LIVE   │──────────▶│  LIVE + DRAFT     │──────────▶│ REVIEWED │────────▶│   LIVE    │
  │ published│           │  public unchanged │           │          │         │ (updated) │
  └──────────┘           └─────────┬─────────┘           └──────────┘         └───────────┘
       ▲                           │ discard
       └───────────────────────────┘
              published columns never touched
```

**The guarantee `[LOCKED]`:** while a draft exists, the public site continues to serve the published
version, byte for byte. Editing, saving, and previewing change nothing public. **Only an explicit
publish action changes published data.**

### Child collections go through the draft too `[LOCKED — 2026-09-04]`

Challenges, rule answers, platform and instrument associations, offers, affiliate links and SEO
metadata are all staged in `draft_payload` and materialised by publish, in its transaction.

There is **one** staging path. There is deliberately no "write straight to the table if the firm is
unpublished" shortcut: one code path means one set of semantics to reason about and test, and an
unpublished firm reaches the same end state by the same route while still being previewable first.

Per-collection permissions, enforced in the SERVICE layer — hiding a control is presentation, not
authorisation:

| Collection                    | Permission            |
| ----------------------------- | --------------------- |
| Challenges                    | `challenge:edit`      |
| Offers                        | `offer:edit`          |
| Affiliate links               | `affiliate_link:edit` |
| SEO metadata                  | `seo:write`           |
| Rules, platforms, instruments | `firm:edit`           |

**Deletes are staged, not immediate.** Removing a published child records a `delete` op; the row is
soft-deleted — or, for the association tables that carry no history worth keeping, removed — only
when someone publishes. "Unstage" is a separate action meaning *undo my pending edit*, which is a
different thing from *delete the published row*.

### Rules

1. **Nothing is public until published.** Saving is always safe. `[LOCKED]`
2. **A published firm can hold pending draft changes** in `draft_payload`, covering the firm and all
   of its children — challenges, rules, platforms, instruments, offers, and SEO. The public keeps
   seeing the published columns throughout. `[LOCKED]`
3. **Preview** renders the draft through the **real public components** at an authenticated route
   (`/admin/preview/firms/[id]`), `noindex`, never accessible anonymously.
   The preview overlays `draft_payload` onto the published rows via a single `materializeDraft()`
   function that returns **the same domain type** the public page consumes — so preview cannot drift
   from production rendering. `[LOCKED]`
   In Phase 1 this is surfaced as a **continuous side-by-side pane** in the workspace, not a separate
   step — see **§7A**. A shareable expiring preview token is `[OPEN]`.
4. **Stale-draft detection.** `draft_payload.base_version` records the published version the draft
   forked from. If the firm has been published by someone else since, the draft is stale: the admin
   is warned and shown the difference **before** publishing, never silently overwritten
   (`DATABASE.md` §3.2.1).
   **A slug rename in the draft does not move or break the workspace or preview URL**, because both
   are keyed by id (`ARCHITECTURE.md` §22). The live public URL is unaffected until publish, when the
   column is updated and the 301 is written in the same transaction. `[LOCKED]`
5. **Discard** clears `draft_payload`, writes a `firm.draft_discarded` audit entry, and leaves the
   published columns untouched. It requires confirmation, because the discarded work is not
   recoverable.
6. **Publish is one transaction** (`ARCHITECTURE.md` §3.1):
   validate → pre-publish checklist → apply firm fields → apply child `_op`s as real rows → write
   `entity_versions` snapshot → write `audit_logs` → set `published_at` (first publish only) →
   **clear `draft_payload`** → **commit** → then revalidate cache tags and the sitemap.
7. **Before first publish** the firm is an unpublished draft: the columns are the working state and
   `draft_payload` stays `NULL`. It is 404 to the public and absent from the sitemap.
8. **Publish is blocked** by the pre-publish checklist:
   - required fields present (name, slug, description)
   - SEO readiness (`SEO.md` §15)
   - slug uniqueness against live rows **and** active redirects
   - logo present with alt text
   - no offer published with a past `ends_at`
   - completeness ≥ the configured minimum `[OPEN]`

   The checklist runs against the **materialised draft** — the state that _would_ go live — not
   against the current published columns. Blocks are listed with a deep link to each offending
   field. An override requires an elevated permission and is recorded in the audit log. `[PROPOSED]`

9. **Unpublish** requires confirmation and a redirect decision (redirect where, or 410 — `SEO.md` §7).
   Unpublishing does not discard a pending draft.

---

## 7A. Live side-by-side preview `[LOCKED — Phase 1]`

The firm workspace provides a **true live preview**: the admin editor on the left, the real public
page rendered from the current draft on the right.

Technical architecture: `ARCHITECTURE.md` §21. Layout and visual treatment: `DESIGN.md` §15.

### 7A.1 The behaviour, by worked example `[LOCKED]`

|                | Published (public site) | Draft (preview pane) |
| -------------- | ----------------------- | -------------------- |
| Offer discount | **20%**                 | **25%**              |

An admin opens `Lucid Prop`, changes an offer's discount from 20% to 25%, and saves the draft.

- **propfirmlenz.com continues to show 20%.** Unchanged. No cache invalidation, no sitemap change,
  no `updated_at` on the published row.
- **The preview pane shows 25%.**
- Both are rendered by the **same** `OffersSection` component. The only difference is the data
  source (`ARCHITECTURE.md` §21.2).
- On **Publish**, the public site shows 25% and the pane and the live page agree again.
- On **Discard**, the draft is dropped and the pane returns to 20%.

This is the whole feature in one example, and it is the acceptance test.

### 7A.2 Desktop layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [logo] Lucid Prop      ● Draft changes    Completeness 82%   ⛉ Verified …     │
│        /prop-firms/lucid-prop                                                 │
│  [ Save draft ]  [ Discard draft ]  [ Publish ]  [ ⋯ ]                        │
├───────────────────────────────────┬──────────────────────────────────────────┤
│  EDITOR                    ~50%   ║  PREVIEW                          ~50%   │
│                                   ║                                          │
│  Overview │ Challenges │ Rules …  ║  ⚠ PREVIEW — DRAFT, NOT PUBLISHED        │
│                                   ║  ┌────────────────────────────────────┐  │
│  Offer title  [ … ]               ║  │                                    │  │
│  Discount     [ 25 ] %            ║  │   real public page, draft data     │  │
│  Code         [ … ]               ║  │   (iframe · same components)       │  │
│  Ends         [ … ]               ║  │                                    │  │
│                                   ║  └────────────────────────────────────┘  │
│                                   ║  [📱 375] [▭ 768] [🖥 Fill]  ⟳  ⛶        │
└───────────────────────────────────┴──────────────────────────────────────────┘
                                    ▲
                            draggable divider
```

- **~50% / 50%** at ≥1280px, with a **draggable divider** (min 30% either side), persisted per admin
  `[PROPOSED]`.
- The workspace header and its action buttons span both panes and never scroll away.
- The two panes scroll independently.
- **The preview pane is available from every tab**, not only the Offers tab — editing a challenge
  and watching the challenge table update is the point.

### 7A.3 Responsive behaviour `[LOCKED]`

**Never force two narrow columns.**

| Viewport        | Layout                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| **≥ 1280px**    | Side-by-side, ~50/50, draggable divider                                                                              |
| **1024–1279px** | Side-by-side, editor-weighted (~60/40); preview collapsible to a rail                                                |
| **< 1024px**    | **Edit / Preview segmented toggle** — one pane at a time, full width. The iframe is not mounted while Edit is active |

The toggle is chosen over a stacked layout below 1024px because stacking puts the preview far below
the fold, where it stops functioning as a preview.

### 7A.4 Preview controls

| Control                 | Behaviour                                                                                                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Viewport selector**   | `375` (mobile) · `768` (tablet) · `Fill` (desktop). Sets the **iframe's actual width**, so media queries respond genuinely (`ARCHITECTURE.md` §21.4). Widths above the pane are scaled down visually, never faked |
| **Refresh**             | Re-renders the preview from the saved draft                                                                                                                                                                       |
| **Full-page preview**   | Opens the same preview route in a new tab at full browser width — same URL, same components, no iframe                                                                                                            |
| **Open published page** | Opens the live public page, for side-by-side comparison of draft against live                                                                                                                                     |

### 7A.5 The preview indicator `[LOCKED]`

- A **persistent, non-dismissible banner inside the preview document** — so it appears in the pane
  **and** in full-page preview, and cannot be lost by scrolling.
- Reads **`PREVIEW — DRAFT, NOT PUBLISHED`**, plus which state is shown: _"Draft, 3 pending changes"_
  or _"No pending changes — identical to the published page"_.
- Styled with the `--warning` token and a hatched edge treatment (`DESIGN.md` §15.4) so it is
  unmistakably not the live site.
- The preview pane header carries a matching badge.

### 7A.6 What the preview does not do `[LOCKED]`

Inside the preview, the following are inert — rendered with correct styling and copy so the admin
sees the real design, but with no effect:

- **Affiliate CTAs** — no `href` to `/go/`, no click recorded, no attribution
  (`ARCHITECTURE.md` §21.7).
- **All navigation links** — the pane previews one page.
- **Analytics** — no events, no view counts, no popularity increments.
- **Forms** — the iframe has no `allow-forms`.
- **Publishing** — unreachable from the preview; publish is only the header button.

And in the document head: **no canonical, no Open Graph, no JSON-LD** (`ARCHITECTURE.md` §21.8).
Metadata and structured data are inspected in the **SEO tab's** dedicated panel, which shows what
will be emitted **on publish**.

### 7A.7 Non-functional requirements `[LOCKED]`

- **Never a fake preview.** The pane renders the production components. A separate preview-only
  implementation of the firm page is prohibited (`ARCHITECTURE.md` §21.1).
- **Authorisation:** the preview route requires `firm:read`, enforced server-side. Anonymous access
  returns **404** — the existence of an unpublished firm is not public.
- **`noindex`, `no-store`, robots-disallowed, never in the sitemap, never a public canonical.**
- **Accessibility:** the iframe has a descriptive `title`; the viewport selector is a labelled radio
  group; the Edit/Preview toggle is a proper tablist; the preview is reachable and announced in the
  keyboard order (`DESIGN.md` §15.5).
- **Performance:** the iframe is lazy and unmounted when hidden; the preview reloads on **Save
  Draft**, not per keystroke; scroll position is preserved across reloads.

---

## 8. Verification `[LOCKED]`

Verification is a trust product feature (`PROJECT.md` §7), not an internal status flag.

- States: `unverified` → `verified` → `needs_review`.
- Verifying records `verified_at` and `verified_by_admin_id`, and requires the `firm:verify`
  permission — **deliberately separable from `firm:edit`**, so the person who enters data need not be
  the person who confirms it.
- **Public pages display "Last verified {date}"** when verified.
- **Any edit to a verified firm's substantive data moves it to `needs_review`** automatically. A
  verification that survives silent edits is worthless. `[LOCKED]`
- Cosmetic fields (display order, featured flag, internal notes) do **not** trip re-verification —
  the substantive field list is explicit and maintained in code.
- Staleness threshold `[OPEN]` — proposed 90 days; past it the firm enters the dashboard's stale
  queue and the public "last verified" date is styled as a caution.
- A verification checklist per firm records **what** was checked and against which source
  `[PROPOSED]`.

---

## 9. Version history and rollback `[LOCKED]`

- **Every publish writes an immutable snapshot** to `entity_versions` — the firm plus its children
  (challenges, rule values, platform/instrument links, offers, SEO) as one `jsonb` document, so a
  restore is coherent rather than partial.
- The History tab lists versions with number, timestamp, actor, and an optional label.
- **Diff view** shows field-level before/after between any two versions, grouped by tab, with added
  and removed child records called out.
- **Rollback** restores a prior snapshot **into `draft_payload` — never straight to live.** `[LOCKED]`
  The restored state becomes a pending draft with `base_version` set to the current published
  version, so the live site is untouched until the admin reviews, previews, and publishes it. That
  publish creates a new version in its turn.
  History is therefore append-only: rolling back never erases what happened.
- **Rollback onto an existing draft** requires confirmation, because it replaces unsaved pending
  work. The admin is shown what will be discarded.
- Rollback requires the `firm:publish` permission, a confirmation dialog naming the target version,
  and writes a `firm.rolled_back` audit entry.
- **Rollback is dependency-aware** (§14): if a restored version references media, a platform, or a
  rule that has since been deleted, the admin is warned **before** restoring, with the specific
  broken references listed.
- Version retention `[OPEN]` — proposed: keep all versions for 24 months, then thin to one per month.

---

## 10. Audit logs `[LOCKED]`

- **Every mutation writes an entry**, whatever the route: form, bulk action, or server action.
  A code path that mutates without auditing is a defect.
- Recorded: actor (id **and** denormalised label at the time), action, entity, before/after,
  precomputed diff, hashed IP, request id, timestamp (`DATABASE.md` §4.7).
- **Append-only, enforced at the database level** — no application code can update or delete an
  entry.
- Global view: filter by actor, action, entity type, entity, and date range; every row deep-links to
  the entity.
- Scoped view: each firm's History tab shows only that firm's trail.
- Reading audit logs requires `audit_log:read` — it is a sensitive surface, since it contains
  before/after values for commercial fields.
- **Secrets are scrubbed before writing** (`password_hash`, MFA secrets, affiliate destination
  secrets). `[LOCKED]`
- Retention `[OPEN]` — proposed 24 months minimum, dropped by partition, never by `DELETE`.

---

## 11. Permissions and RBAC

Model and enforcement: `ARCHITECTURE.md` §6. Administration surface:

- **Admins:** invite (email invitation, no self-signup), assign roles, suspend, reset MFA, view
  active sessions, revoke sessions.
- **Roles:** create custom roles, edit permission sets, view which admins hold each role. System
  roles cannot be deleted or renamed.
- **Permission matrix view** — roles × permissions grid, the fastest way to answer "who can publish?"

**Guard rails `[LOCKED]`:**

1. An admin cannot edit their own roles or permissions.
2. The last active `master_admin` cannot be demoted, suspended, or deleted.
3. Every role and permission change writes an audit entry naming both parties.
4. Permission changes take effect on the next request — sessions are not silently trusted.
5. Suspending an admin revokes their sessions immediately.

**Proposed initial roles** (names are architecture, not business data):

| Role           | Capability                                                                 |
| -------------- | -------------------------------------------------------------------------- |
| `master_admin` | Everything, including admins, roles, and settings                          |
| `admin`        | All content and site operations; not roles or settings                     |
| `editor`       | Create and edit firms and children; **cannot publish or verify**           |
| `publisher`    | Editor plus publish, verify, and rollback                                  |
| `seo_manager`  | SEO metadata, redirects, sitemap controls; read-only elsewhere             |
| `analyst`      | Read-only across content, plus reports; no affiliate destinations or notes |

---

## 12. Internal notes `[LOCKED]`

- Per-entity, private, markdown-capable, with author and timestamp; pinnable.
- Purpose: the research trail — where a rule was sourced, who was contacted, what is unconfirmed,
  which claim needs re-checking.
- **Never rendered on any public route, never in a public API response, never in an OG image, never
  in JSON-LD.** A test asserts that no public serialiser can reach `internal_notes`.
- Gated behind its own permission — notes may contain partner correspondence.
- Notes are **not** a substitute for structured data. If a fact belongs in a field, it goes in the
  field; the note records how it was confirmed.

---

## 13. Data completeness `[LOCKED]`

Turns "we don't know" into a work queue instead of an invitation to invent.

- **Score:** weighted 0–100 per firm, recomputed on every write, stored in
  `prop_firms.data_completeness_score`.
- **Weights `[PROPOSED]`** — required for publish (name, slug, description, logo, ≥1 challenge, SEO
  title/description) weigh most; high-value fields (drawdown type and basis, profit split, payout
  frequency, platforms, instruments) next; nice-to-have (founded year, HQ city, cover image,
  long-tail rules) least. **Weights need owner approval — they encode editorial priorities.**
- Displayed as a meter in the Prop List, the workspace header, and per tab.
- **A gap list** names the specific missing fields with deep links — not just a percentage.
- Feeds the dashboard's "Incomplete records" queue.

**The rule `[LOCKED]`:** completeness is improved by **researching and entering** data, never by
filling fields with plausible values. A low score is an honest state, and the public UI's
"Not disclosed" is the correct rendering of it.

---

## 14. Dependency and impact awareness `[LOCKED]`

Before any destructive or far-reaching action, the admin is shown **what else it touches.**

| Action                                    | Impact shown before confirming                                                                                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delete/archive a **firm**                 | Challenges, offers, affiliate links, rule values, media usages affected; **the public URL and what will happen to it** (301 target or 410)                            |
| Delete a **challenge**                    | Its rule values; whether it is referenced by an offer                                                                                                                 |
| Delete a **platform / instrument / rule** | **How many firms reference it.** `ON DELETE RESTRICT` blocks the delete outright — the UI must explain why and link to the referencing firms (`DATABASE.md` §5.4–5.6) |
| Delete **media**                          | Every entity and field using it, via `media_usages`. Blocked while referenced                                                                                         |
| Change a **slug**                         | The old URL, the 301 that will be created, and any internal links that will need updating                                                                             |
| Delete an **affiliate link**              | Historical click volume attached to it — deletion is blocked (`ON DELETE RESTRICT`); the link is archived instead                                                     |
| **Unpublish** a firm                      | Its inbound internal links, sitemap removal, and the required redirect decision                                                                                       |
| **Rollback**                              | References in the target version that no longer exist (§9)                                                                                                            |

**Rules `[LOCKED]`:**

1. Destructive actions are **soft deletes** by default.
2. Confirmation dialogs state the consequence in plain language — never a bare "Are you sure?".
3. Deleting something referenced elsewhere is **blocked, with the references listed**, not cascaded
   silently.
4. Bulk destructive actions require typed confirmation of the affected count.
5. Everything is audited before it is applied.

---

## 15. Redirect management

Full policy: `SEO.md` §7.

- **Automatic:** a slug change creates a 301 in the same transaction as the change. The admin is
  informed; it is not optional and not forgettable. `[LOCKED]`
- **Manual:** create, edit, and deactivate redirects; choose 301/302/307/308/410.
- **Validation at write time:** normalised paths, loop detection across the whole chain, chain
  flattening, and a warning when the target does not currently return 200.
- **Diagnostics:** hit counts and last-hit timestamps, so dead redirects can be retired on evidence;
  a "404s with traffic" report `[PROPOSED]` turns real misses into redirect candidates.
- Requires the `redirect:manage` permission. Every change is audited.
- **Never bulk-delete redirects.** They are permanent infrastructure. `[LOCKED]`

---

## 16. Catalog and library management

**Platforms / Instruments / Rules** — CRUD over the catalogs (`DATABASE.md` §5.3, §5.5, §5.6), each
showing a usage count and blocking deletion while referenced. Rule definitions carry the **published
canonical description** that appears in the public glossary, so editing one changes site-wide
terminology — the UI must say so before saving. `[LOCKED]`

**Media library** — grid and list views; filter by type, usage, and upload date; **alt text required
at upload**; usage panel per asset; dependency-aware deletion; de-duplication by checksum with a
"this file already exists" prompt.

---

## 17. Admin non-functional requirements `[LOCKED]`

- **Security:** every route and action authorised server-side; `noindex`; `no-store`; CSRF-protected;
  rate-limited; sessions revocable (`ARCHITECTURE.md` §5, §6).
- **Accessibility:** WCAG 2.2 AA applies to the admin too — full keyboard operation, visible focus,
  labelled fields, announced errors, no colour-only status encoding (badges carry text or an icon).
- **Performance:** server-side pagination everywhere; no unbounded queries; tables virtualised only
  where row counts justify it.
- **Reliability:** optimistic concurrency via `draft_payload.base_version` `[LOCKED]` — if the firm
  was published by someone else since the draft was forked, the admin is told and shown the
  difference rather than silently overwriting a colleague's work (§7 rule 4). A same-draft
  last-write-wins guard on concurrent editors of the _same_ draft is `[PROPOSED]`.
- **Feedback:** every mutation produces a clear success or failure message; failures state what to do
  next.

---

## 18. Phase 1 acceptance — the Lucid Prop walkthrough `[LOCKED]`

Phase 1's admin is complete when an authenticated admin can, **entirely through the UI and with no
code changes or SQL**:

1. Create `Lucid Prop` as a draft.
2. Upload its logo with alt text; set description, HQ, founded year, and website.
3. Add its challenges with real prices, targets, drawdown type and basis, and profit split — leaving
   genuinely unknown fields explicitly "Not disclosed".
4. Attach platforms and instruments from the catalogs, marking any explicitly prohibited.
5. Record long-tail rules with source URLs.
6. Add an offer with a code and an expiry window.
7. Add an affiliate link and mark it default.
8. Set SEO title, description, and OG image; see the JSON-LD preview.
9. Preview the draft in the **side-by-side pane**, rendered by the real public components —
   at 375px, 768px, and full width, plus full-page preview in a new tab.
10. Publish — and see the public page live, in the sitemap, with correct metadata.
11. Verify the firm; see "Last verified" on the public page.
12. Edit a challenge; observe the firm move to `needs_review`.
13. Publish again; roll back to the previous version; confirm the restore lands as a **draft**.
14. Rename the slug; confirm the old public URL 301s to the new one — and confirm the **workspace
    URL, the open draft, and the preview iframe are all unaffected**, because admin routes are
    id-keyed (`ARCHITECTURE.md` §22).
15. Open the audit log and see every one of the above steps, with actor and diff.
16. Attempt each step as a role lacking the permission, and be denied — in the UI **and** at the
    server.
17. **The live-preview proof (§7A.1):** with `Lucid Prop` published showing a 20% offer, change the
    draft to 25% and save. **The public page still shows 20%; the preview pane shows 25%.**
    Publish — both show 25%. Repeat, then **Discard** instead, and confirm the pane returns to 20%
    with the published page never having changed.
18. Confirm the preview issues **no** `/go/` request, emits no canonical or JSON-LD, carries
    `X-Robots-Tag: noindex`, appears in no sitemap, and returns **404** when opened anonymously.
