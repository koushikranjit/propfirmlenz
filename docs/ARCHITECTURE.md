# ARCHITECTURE.md — Prop Firm Lenz Technical Architecture

> **Status: proposed. Nothing here is implemented.**
> This document describes the intended production architecture for review and approval.
> Items marked `[PROPOSED]` or `[OPEN]` **must not be implemented until the owner approves them.**

Markers: `[LOCKED]` owner requirement · `[APPROVED]` owner-approved decision, binding ·
`[PROPOSED]` Claude's recommendation, needs approval · `[OPEN]` genuinely undecided.

---

## 0. Decision summary

The fastest way to review this document. Details follow in the numbered sections.

### 0.1 Settled — all `[LOCKED]` and binding

Rows 4–23 were approved or locked by the owner on 2026-09-03. **None may be substituted without
explicit owner approval** (`CLAUDE.md` §9).

| #   | Decision                | Outcome                                                                                                                             |
| --- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Database engine         | PostgreSQL                                                                                                                          |
| 2   | Language                | TypeScript, `strict: true`                                                                                                          |
| 3   | Public rendering        | Server-rendered (SSG/ISR)                                                                                                           |
| 4   | **Framework**           | **Next.js App Router**, React Server Components (§2.1)                                                                              |
| 5   | **Styling**             | **Tailwind CSS v4** + CSS custom-property design tokens (§2.4)                                                                      |
| 6   | **UI primitives**       | **Radix UI**, styled with the Prop Firm Lenz design system — no themed kit (§2.4)                                                   |
| 7   | **Icons**               | **Lucide**, one set only (`DESIGN.md` §14)                                                                                          |
| 8   | **Validation**          | **Zod**, shared server/client schemas (§13)                                                                                         |
| 9   | **ORM**                 | **Drizzle** + `drizzle-kit` (§4)                                                                                                    |
| 10  | **Database host**       | **Neon**, pooled endpoint for the app, direct for migrations (§3.3)                                                                 |
| 11  | **Hosting**             | **Vercel**, kept container-buildable (§16)                                                                                          |
| 12  | **Object storage**      | **Cloudflare R2** (§7)                                                                                                              |
| 13  | **Admin auth**          | **DB-backed sessions + Argon2id** (§5.2)                                                                                            |
| 14  | **Draft model**         | **`draft_payload`** — `LIVE → EDIT DRAFT → PREVIEW → PUBLISH` (`DATABASE.md` §3.2.1)                                                |
| 15  | **Supporting tables**   | RBAC, sessions, clicks, versions, redirects, notes, media usage (`DATABASE.md` §10)                                                 |
| 16  | **Rule modelling**      | Hybrid: columns + `rules`/`rule_values` (`DATABASE.md` §5.4)                                                                        |
| 17  | **Monetary values**     | Store originals with source currency; never silently convert (§18)                                                                  |
| 18  | **Canonical domain**    | `https://propfirmlenz.com` (§19)                                                                                                    |
| 19  | **UI typeface**         | **Inter**, unless the logo wordmark requires a different display face (`DESIGN.md` §4.1)                                            |
| 20  | **Neutral palette**     | The accessible palette in `DESIGN.md` §2.3, adjustable at a later visual review                                                     |
| 21  | **Logging / errors**    | **pino + Sentry** for Phase 1, unless a technical issue forces reconsideration (§12)                                                |
| 22  | **Testing**             | **Vitest · Playwright · axe · Lighthouse CI** (§14)                                                                                 |
| 23  | **`/compare` scope**    | Architect URLs and relationships now; **do not build the UI or pages in Phase 1** (§20)                                             |
| 24  | **Runtime**             | **Node.js 24 LTS** — pinned via `.nvmrc` and `engines`. Do not downgrade to 22 (`INITIALIZATION.md` §2)                             |
| 25  | **Package manager**     | **pnpm**, activated by Corepack and pinned in `packageManager`. **npm is not the project package manager** (`INITIALIZATION.md` §3) |
| 26  | **Identifier strategy** | **Admin routes by database id; public routes by slug** (§22)                                                                        |
| 27  | **DB conventions**      | UUIDv7 · soft delete · `numeric` money · amount + source currency · **no stored converted-money columns** (`DATABASE.md` §1)        |

### 0.2 Still to decide — **none blocking**

| #   | Decision                  | Status   | Note                                                                   |
| --- | ------------------------- | -------- | ---------------------------------------------------------------------- |
| 24  | Analytics                 | `[OPEN]` | Plausible or Umami. **Explicitly must not block initialisation** (§10) |
| 25  | Public auth (Phase 2+)    | `[OPEN]` | Auth.js v5 (§5.4) — not needed in Phase 1                              |
| 26  | MFA required at launch    | `[OPEN]` | Schema-ready either way (§5.2)                                         |
| 27  | SVG upload policy         | `[OPEN]` | Sanitise or reject (§7.3)                                              |
| 28  | Affiliate click retention | `[OPEN]` | Default 12 months raw (§11.3)                                          |
| 29  | Staging tier              | `[OPEN]` | Preview deployments may suffice (§16.2)                                |

---

## 1. System overview

```
                    ┌───────────────────────────────────────────┐
   Search engines   │              CDN / Edge                    │
   & users  ───────▶│  cached HTML · images · static assets      │
                    └───────────────────┬───────────────────────┘
                                        │ miss / revalidate
                    ┌───────────────────▼───────────────────────┐
                    │        Next.js application (Node)          │
                    │                                            │
                    │  PUBLIC (SSG/ISR)   ADMIN (dynamic, authn) │
                    │  /  /prop-firms     /admin/**              │
                    │  /prop-firms/[slug] server actions         │
                    │                                            │
                    │  /go/[slug]  tracked affiliate redirect     │
                    │  /sitemap.xml  /robots.txt                 │
                    ├────────────────────────────────────────────┤
                    │  Validation (Zod)                          │
                    │  Service layer  (business rules, RBAC)     │
                    │  Data access    (repositories, ORM)        │
                    └───────┬──────────────────┬─────────────────┘
                            │                  │
                   ┌────────▼───────┐  ┌───────▼────────┐
                   │  PostgreSQL    │  │ Object storage │
                   │  (pooled)      │  │  media assets  │
                   └────────────────┘  └────────────────┘
                            │
                   ┌────────▼────────────────────────────┐
                   │ Observability: logs, errors, metrics │
                   │ Analytics (privacy-first)            │
                   └──────────────────────────────────────┘
```

### Architectural principles `[LOCKED]`

1. **The database is the single source of truth.** No business data in code.
2. **Server-first.** Public content is rendered on the server for SEO and performance.
3. **Layered.** UI → validation → service → repository → database. Components never touch the DB.
4. **Deny by default.** Authorisation is enforced in the service layer, not the UI.
5. **Typed end to end.** One set of TypeScript types and Zod schemas, shared client and server.
6. **Boring and durable.** Prefer well-understood tools over novel ones. This project must be
   maintainable for years.

---

## 2. Frontend

### 2.1 Framework `[LOCKED]`

**Next.js (App Router), latest stable, React Server Components, TypeScript `strict: true`.**
Confirmed by the owner 2026-09-03.

Why it fits:

- SSG + ISR + tag-based revalidation directly serve the SEO requirements in `SEO.md`.
- Server Components keep the client bundle small — critical for the CWV budgets.
- `generateMetadata` maps cleanly onto the `seo_metadata` table.
- Route Handlers cover `/go/[slug]`, `sitemap.xml`, and `robots.txt` without a separate service.
- One deployable unit for public site + admin, with a shared type system.

**Not chosen:** Remix / React Router 7 (weaker static + ISR story for a content site); Astro plus a
separate admin SPA (best raw public performance, but splits the codebase and duplicates the type
layer); SvelteKit (fine technically, smaller TypeScript-React talent pool).

### 2.2 Rendering strategy

| Surface                     | Strategy                                                | Cache               |
| --------------------------- | ------------------------------------------------------- | ------------------- |
| `/`                         | Static, revalidated on publish (tag)                    | CDN, long TTL + SWR |
| `/prop-firms`               | Static + ISR; filters are server-rendered search params | CDN                 |
| `/prop-firms/[slug]`        | Static per firm, revalidated by tag `firm:{slug}`       | CDN                 |
| `/compare`                  | Dynamic (query-driven), `noindex` on parameter combos   | No store            |
| `/admin/**`                 | Fully dynamic, `no-store`, `noindex`                    | None                |
| `/go/[slug]`                | Dynamic, `no-store`, 302                                | None                |
| `sitemap.xml`, `robots.txt` | Generated, short revalidate                             | Short TTL           |

**Rule `[LOCKED]`:** primary content is never fetched client-side. Client fetching is permitted only
for genuinely secondary interaction (e.g. an admin autocomplete).

### 2.3 Component architecture `[PROPOSED]`

```
src/
  app/                      routes only — thin; no business logic
    (public)/
    (admin)/
    go/[slug]/
  components/
    ui/                     design-system primitives (Button, Card, Badge, Field…)
    public/                 public composites (FirmCard, ChallengeTable, CompareBar)
    admin/                  admin composites (DataTable, TabShell, PublishBar)
  lib/
    db/                     schema, client, migrations
    repositories/           data access — the ONLY place queries live
    services/               business rules, authorisation, transactions
    validation/             Zod schemas, shared client + server
    auth/                   sessions, password hashing, RBAC
    seo/                    metadata builders, JSON-LD, canonical helpers
    analytics/              server-side event capture
    utils/
  types/
  styles/                   tokens + Tailwind theme
```

- Server Components by default; `"use client"` only where interaction requires it.
- Design-system primitives are the **only** place raw colours and spacing appear (`DESIGN.md`).
- Every data-driven view implements loading, empty, error, and unauthorised states.

### 2.4 Styling and primitives `[LOCKED]`

**Tailwind CSS v4**, with the `DESIGN.md` palette exposed as **CSS custom properties** and mapped
into the Tailwind theme. Components reference **tokens only** — never raw hex values. `[LOCKED]`

**Headless primitives: Radix UI** for dialogs, popovers, tabs, selects, tooltips, and dropdowns —
adopted for accessibility correctness — **styled entirely with the Prop Firm Lenz design system.**
`[LOCKED]`

**Icons: Lucide** — one icon set, 24px grid, tree-shakeable. `[LOCKED]`

**No pre-themed component kit** (no shadcn/ui theme, no MUI, no Chakra). Radix ships behaviour and
ARIA semantics; every visual decision comes from `DESIGN.md`. This is what keeps the product from
resembling another site and protects the design language. `[LOCKED]`

---

## 3. Backend and server architecture

### 3.1 Application layering `[LOCKED as a pattern]`

```
Route Handler / Server Action / Page
        │  parses input
        ▼
Zod schema                       ← rejects invalid input at the boundary
        │  typed, validated DTO
        ▼
Service                          ← authorisation, business rules, transactions,
        │                          audit logging, cache revalidation
        ▼
Repository                       ← the only place SQL/ORM calls exist
        │
        ▼
PostgreSQL                       ← constraints as the last line of defence
```

Rules:

- Components and route handlers contain **no** business logic and **no** queries.
- Services own transactions. A publish is one transaction: write entity, write version snapshot,
  write audit log, then revalidate cache **after commit**.
- Repositories return domain types, not raw ORM rows.
- Services are pure enough to unit-test with a stubbed repository.

### 3.2 Mutation transport `[PROPOSED]`

- **Admin mutations → Server Actions.** Progressive enhancement, no hand-written API surface, typed
  end to end. Every action begins with an authorisation check — **Server Actions are public HTTP
  endpoints; treat them as such.**
- **Public/machine endpoints → Route Handlers** (`/go/[slug]`, sitemap, robots, health, future
  webhooks).
- **No public REST/GraphQL API in Phase 1.** `[OPEN]` for a later data-licensing product.

### 3.3 PostgreSQL `[LOCKED — engine]`

- **PostgreSQL 16+.**
- Extensions: `citext` (case-insensitive email), `pg_trgm` (admin fuzzy search),
  `pgcrypto` or app-generated UUIDv7 for identifiers.
- **Connection pooling is mandatory** on serverless — a pooler (PgBouncer / Neon pooled endpoint) in
  transaction mode. Note: transaction-mode pooling forbids session-scoped features (prepared
  statement caching, `LISTEN/NOTIFY`, advisory session locks). The ORM must be configured for it.
- Migrations are versioned files committed to the repository, applied in CI, never applied by hand
  in production.
- Backups: automated daily + point-in-time recovery. **Restores are tested, not assumed.**
- Separate databases for production, staging, and each developer.

**Hosting: Neon `[APPROVED]`**

PostgreSQL on **Neon**, paired with Vercel.

Operational consequences of this choice:

- **Use the pooled connection endpoint** (`-pooler` host) from the application — Vercel functions
  scale horizontally and will exhaust direct connections otherwise. Migrations use the **direct**
  endpoint, since `drizzle-kit` needs a session-mode connection.
- **Transaction-mode pooling constraints apply:** no session-scoped prepared-statement caching, no
  `LISTEN`/`NOTIFY`, no session advisory locks. Drizzle's `neon-http` or `postgres-js` driver is
  configured accordingly (§4.1).
- **Database branching per pull request** — each preview deploy gets its own branch, seeded with
  structural data only. This is what makes migration and admin changes reviewable rather than
  hopeful.
- **Scale-to-zero** on idle branches causes a cold start on the first query. Acceptable for preview
  branches; production stays warm and must be on a plan that does not suspend.
- Point-in-time recovery and daily backups configured; **restores tested, not assumed.**
- Separate branches/databases for production, staging `[OPEN]`, preview, and each developer.

---

## 4. ORM — Drizzle `[APPROVED]`

**Decision: Drizzle ORM with `drizzle-kit` migrations.**

Chosen because the schema in `DATABASE.md` leans on partial unique indexes, `CHECK` constraints,
`jsonb`, composite indexes, polymorphic reference tables, and append-only tables — all first-class in
Drizzle, and all second-class or raw-SQL-only in the alternatives.

### 4.1 Implementation consequences `[APPROVED]`

- **Driver:** `postgres-js` (or `@neondatabase/serverless`) against Neon's **pooled** endpoint, with
  prepared statements disabled for transaction-mode pooling compatibility (§3.3).
- **Schema location:** `src/lib/db/schema/`, one file per domain area, re-exported from an index.
  The schema is the single TypeScript source of truth for table types.
- **Migrations:** generated by `drizzle-kit generate`, **committed as reviewable SQL**, applied by
  `drizzle-kit migrate` as a gated CI step against the **direct** endpoint (§16.3).
  Generated SQL is read and edited before commit — never applied unseen.
- **`drizzle-kit push` is prohibited outside a local developer database.** `[LOCKED]`
  It bypasses migration history, which is exactly the guarantee this project needs.
- **Constraints Drizzle cannot express** in its builder API (some `CHECK`s, exclusion constraints,
  the append-only triggers, `REVOKE` grants) are written as **hand-authored SQL in the migration
  files**. They are part of the schema, not optional extras (`DATABASE.md` §1.2).
- **Typed queries only.** `sql` raw fragments are permitted for genuinely advanced SQL, but must be
  wrapped in a repository function with an explicit return type — never leaked into a service.
- **Repositories** (`ARCHITECTURE.md` §3.1) are the only place Drizzle is imported. Services and
  components never see a Drizzle query builder.
- `drizzle-zod` `[PROPOSED]` to derive base insert/select schemas from tables, then refined by hand
  for business rules (§13).

### 4.2 Why not the alternatives (recorded for posterity)

The schema's correctness guarantees are the deciding factor. Prisma remains the stronger tool for
admin CRUD velocity and has the larger ecosystem; Kysely has the best raw SQL ergonomics. Neither
trade was judged worth losing first-class partial uniques and `CHECK`s.

| Criterion                                | **Drizzle**                          | **Prisma**                                 | **Kysely + node-pg**               |
| ---------------------------------------- | ------------------------------------ | ------------------------------------------ | ---------------------------------- |
| Type safety                              | Excellent, inferred from schema      | Excellent, generated client                | Excellent, hand-declared types     |
| Partial / conditional unique indexes     | Native                               | Improving; historically awkward            | Raw SQL (native)                   |
| `CHECK` constraints                      | Native                               | Not first-class — needs raw SQL migrations | Raw SQL (native)                   |
| Complex SQL (CTEs, window fns, `FILTER`) | Very good                            | Falls back to `$queryRaw` (loses types)    | Best in class                      |
| Migrations                               | `drizzle-kit`; SQL-first, reviewable | Excellent DX; more magic                   | Bring your own (`node-pg-migrate`) |
| Serverless cold start / bundle           | Small                                | Larger engine; improved but heavier        | Smallest                           |
| Transaction-mode pooling                 | Straightforward                      | Workable, needs care                       | Straightforward                    |
| DX for CRUD admin screens                | Good                                 | **Best** — relations, nested writes        | More manual                        |
| Ecosystem / hiring familiarity           | Growing fast                         | **Largest**                                | Niche                              |

**Accepted cost of choosing Drizzle:** admin CRUD screens involving nested writes across a firm and
its children require more explicit repository code than Prisma's nested-write API would. This is
absorbed in the repository layer and does not leak upward.

---

## 5. Authentication

### 5.1 Two separate identity systems `[LOCKED]`

`admin_users` and `users` are **separate tables with separate sessions, separate cookies, and
separate login routes.** A public account can never escalate to admin, because there is no path
between them. This costs a little duplication and buys a hard security boundary.

### 5.2 Admin authentication `[APPROVED]`

**Decision: secure, database-backed sessions with Argon2id password hashing.** Custom
implementation — no third-party identity provider for the admin surface.

- **Password hashing:** Argon2id (memory ≥ 19 MiB, iterations ≥ 2, parallelism 1 — OWASP baseline).
- **Sessions:** opaque random tokens (≥ 256 bits), **stored hashed** in `admin_sessions`. Never JWTs
  for admin — server-side sessions can be revoked instantly, which matters for a privileged surface.
- **Cookie:** `HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` prefix, path `/`.
- **Rotation:** new session ID on login and on privilege change.
- **Expiry:** idle timeout `[OPEN]` (proposed 8h) and absolute timeout (proposed 30 days).
- **MFA:** TOTP, schema-ready from day one; **required for `master_admin`** `[PROPOSED]`.
- **Rate limiting + lockout:** per-IP and per-account throttling; temporary lockout after repeated
  failures, recorded in `audit_logs`.
- **CSRF:** origin/`Sec-Fetch-Site` verification plus token for non-idempotent requests. Note that
  `SameSite=Lax` alone is not sufficient protection for Server Actions.
- **No public admin signup.** Admins are invited by a `master_admin`.

**Sessions live in `admin_sessions`** (`DATABASE.md` §4.4), which is now an approved table. Because
sessions are database rows rather than signed tokens, an admin can be logged out everywhere the
instant they are suspended or their role changes — the property that made this worth building
in-house rather than adopting Auth.js or a hosted provider.

**Not chosen:** Auth.js v5 credentials provider (less control over session storage and audit for a
two-table identity split); WorkOS / Clerk (externalises the identity boundary and adds vendor
coupling for a small admin team).

### 5.3 Password and account policy `[PROPOSED]`

- Minimum 12 characters, checked against a breached-password list (k-anonymity API), no composition
  rules, no forced rotation (NIST SP 800-63B).
- Password reset via single-use, short-TTL, hashed tokens; reset invalidates all sessions.
- Email change requires re-authentication and confirmation at both addresses.

### 5.4 Public user authentication `[OPEN — Phase 2+]`

Not needed in Phase 1. When payouts and reviews arrive, users must be authenticated to submit.
**Proposed: Auth.js v5** with email OTP or OAuth, backed by the same PostgreSQL. Email verification
is mandatory before any submission is accepted, as a first anti-manipulation control.

---

## 6. Authorization and RBAC

### 6.1 Model `[PROPOSED]`

```
admin_user ──< admin_user_roles >── role ──< role_permissions >── permission
```

- **Permissions** are strings: `resource:action` — e.g. `firm:create`, `firm:publish`,
  `firm:delete`, `affiliate_link:read`, `seo:write`, `audit_log:read`, `admin_user:manage`,
  `role:manage`, `media:delete`, `redirect:manage`.
- **Roles** bundle permissions. Proposed initial roles — names are architecture, not business data:
  `master_admin` (all, including role management), `admin`, `editor` (create/edit, cannot publish),
  `publisher`, `seo_manager`, `analyst` (read-only + reports).
- A permission **catalog table** (rather than a `jsonb` blob) is recommended so permission grants are
  joinable, auditable, and referentially safe. Trade-off: one extra table and a seed migration.

### 6.2 Enforcement rules `[LOCKED]`

1. Authorisation happens in the **service layer**, on every call — never only in the UI.
2. Every Server Action and Route Handler begins with `requirePermission(...)`.
3. Deny by default: an unknown or absent permission is a denial.
4. Hiding a button is presentation, **not** security.
5. Authorisation failures return 403 (or 404 where existence itself is sensitive) and are logged.
6. `master_admin` cannot demote or delete the last remaining `master_admin`.
7. Permission checks are unit-tested per role — including the negative cases.

Middleware guards `/admin/**` for authentication (a cheap early reject); it is **not** the
authorisation layer.

---

## 7. File and media handling — Cloudflare R2 `[APPROVED]`

### 7.1 Storage

**Decision: Cloudflare R2.** Object storage, never the application filesystem or the database.

Implementation consequences:

- **S3-compatible API** — use the AWS S3 SDK (`@aws-sdk/client-s3`) pointed at the R2 endpoint, so
  the storage layer stays portable behind a small adapter interface.
- **No egress fees**, which matters for an image-heavy, CDN-served comparison site.
- **Public delivery** via a custom domain on the R2 bucket (e.g. `cdn.propfirmlenz.com`) with
  immutable, content-hashed object keys and long-lived cache headers.
- **Presigned PUT URLs** are generated server-side for direct browser upload (§7.2); the bucket
  itself is never publicly writable.
- **Credentials** (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, bucket, public base
  URL) live in Vercel's secret manager, never in the repository.
- `media.storage_provider` is set to `r2`, and `media.public_url` stores the CDN URL
  (`DATABASE.md` §5.8). The column stays provider-agnostic so a future migration is a data change,
  not a schema change.
- Image derivative generation is done **at upload time with `sharp`** (§7.2) rather than relying on a
  transform service — one less vendor dependency, and the derivatives are then plain cached objects.

**Not chosen:** AWS S3 + CloudFront (egress cost), Vercel Blob (less portable, higher unit cost),
Supabase Storage (not applicable given Neon).

### 7.2 Upload pipeline `[PROPOSED]`

1. Admin requests a **presigned upload URL** from an authorised server action.
2. Browser uploads **directly to storage** — bytes never pass through the app server.
3. Server verifies the object, then processes it (`sharp`): strips EXIF, generates AVIF/WebP
   derivatives, extracts dimensions and a blur placeholder.
4. A `media` row is written with `checksum_sha256` for de-duplication.
5. **Alt text is required at upload time** — enforced in the schema and the UI (`DESIGN.md` §13,
   `SEO.md` §13).

### 7.3 Constraints `[LOCKED]`

- Validate MIME type by **magic bytes**, not by file extension or client-declared type.
- Allowlist: `image/png`, `image/jpeg`, `image/webp`, `image/avif`, `image/svg+xml` (SVG sanitised
  server-side or rejected `[OPEN]`), plus `application/pdf` for future payout evidence.
- Size caps enforced server-side (proposed: 5 MB images).
- Serve from a CDN with immutable, content-hashed URLs.
- **Deletion is dependency-aware** — `ADMIN.md` §14. Never orphan a referenced asset.
- Firm logos are stored as uploaded and never restyled (`CLAUDE.md` §12.2).

---

## 8. Caching and revalidation

### 8.1 Layers

1. **CDN/edge** — cached HTML and assets for public routes.
2. **Framework data cache** — tagged fetches / `unstable_cache` around repository reads.
3. **Database** — indexes and, later, materialised views for expensive aggregates.

### 8.2 Tag strategy `[PROPOSED]`

| Tag                                     | Invalidated when                                                         |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `firm:{slug}`                           | That firm or any child (challenge, rule, offer, media, SEO) is published |
| `firms:list`                            | Any firm is published, unpublished, archived, or reordered               |
| `platform:{slug}` / `instrument:{slug}` | A catalog entry or a firm↔catalog link changes                           |
| `offers:active`                         | Any offer is published, edited, or expires                               |
| `sitemap`                               | Any indexable entity is published or unpublished                         |

Rules `[LOCKED]`:

- Revalidation happens **after** the database transaction commits — never inside it.
- A publish is not complete until its tags are revalidated; failure is logged and retried.
- Admin routes are `no-store`, always.
- Offer expiry is **time-based** and must not rely on cache invalidation alone — expiry is filtered
  in the query _and_ the page carries a short revalidate window.

---

## 9. SEO rendering architecture

Owned by `SEO.md`; the mechanics live here.

- `generateMetadata` reads `seo_metadata` for the entity, falling back to deterministic templates.
  **Templates are pure functions, unit-tested** — never ad-hoc strings in components.
- Canonical URLs are produced by a single `canonicalUrl()` helper using one configured origin.
  Nothing else constructs absolute URLs.
- JSON-LD is generated by typed builders (`buildOrganizationLd`, `buildBreadcrumbLd`, …), rendered
  server-side, and validated in tests. **Rating/review markup does not exist before Phase 3.**
- `sitemap.xml` is a sitemap index generated from the database, split by entity type, with `lastmod`
  from `updated_at`, excluding drafts and `noindex` entities.
- Redirects resolve from the `redirects` table in middleware, with a normalised path lookup, loop
  detection, and chain flattening.
- Slug changes automatically enqueue a 301 (`ADMIN.md` §15) — this is a service-layer guarantee, not
  an admin's responsibility to remember.

---

## 10. Analytics `[OPEN — explicitly non-blocking]`

**Decision deferred by the owner. Analytics must not block project initialisation.** `[LOCKED]`

Practically this means: build Phase 1 with **no page-analytics vendor wired in**. The affiliate click
pipeline (§11) is first-party and server-side, so the data that actually matters commercially does
not depend on this choice at all. A vendor can be added later behind the `lib/analytics/` boundary
without touching any page.

Requirements when it is decided: privacy-respecting, no measurable CWV cost, must not be defeated by
ad blockers for **affiliate click** data.

| Option                  | Notes                                                                    |
| ----------------------- | ------------------------------------------------------------------------ |
| **Umami (self-hosted)** | Free, cookieless, owns the data; needs hosting                           |
| **Plausible (cloud)**   | Cookieless, lightweight, paid, trivial to run                            |
| **Vercel Analytics**    | Zero-config CWV field data; limited product analytics                    |
| **GA4**                 | Free and powerful; heavy, privacy-hostile, blocked often, consent burden |

**Recommendation:** Plausible or Umami for page analytics, **plus Vercel Analytics (or a
`web-vitals` beacon) for Core Web Vitals field data.** GA4 only if the owner needs it for an ad
platform.

**Critical `[LOCKED]`:** affiliate click tracking is **first-party and server-side** (§11). It never
depends on a client script, because client analytics are blocked for a large share of trading
audiences — exactly the audience being measured.

---

## 11. Affiliate click tracking

### 11.1 Route contract

```
GET /go/[firm-slug]?o=[offer-id]&p=[placement]&c=[campaign]
```

1. Resolve the firm; resolve the active `affiliate_link` (campaign → default).
2. If none active → **404**. Never redirect to a guessed or stale destination.
3. Re-validate the stored destination (`isSafeAffiliateDestination`). A destination that is not an
   absolute `https://` URL with a dotted host and no embedded credentials → **404**. Never repaired,
   never fallen back from.
4. Classify the request: bot signature, prefetch header.
5. Record the click into `affiliate_clicks`.
6. **Redirect 302** — never 301.

**Write ordering `[owner-directed 2026-09-04]`.** The click is recorded **before** the redirect is
returned, so a click is never lost to a response the runtime has already flushed. This supersedes
the earlier deferred-write design (`waitUntil`) for this route; §11.3's "never block the redirect"
now means "keep the write to a single fast insert", which it is. Revisit only with measurements.

**Not yet implemented:** `?o=[offer-id]` and offer-bound link resolution. `resolveAffiliateLink`
implements campaign → default only, and the route deliberately ignores an unknown `o` parameter
rather than writing an unvalidated offer id into a reporting dimension.

Every failure mode returns the SAME bare 404, so the route cannot be used to enumerate unpublished
firms. The slug is used **only** for routing; the click row, the foreign keys and every reporting
join use the ids the resolver returns, so a later slug rename cannot orphan a recorded click (§22).

### 11.2 Recorded fields

`affiliate_link_id`, `prop_firm_id` (denormalised for reporting), `offer_id`, `placement`,
`clicked_at`, `country_code`, `device_type`, `referrer_host`, `landing_path`, `session_id`,
`user_id` (nullable), `is_bot`, `ip_hash`, `user_agent_hash`.

- `referrer_host` is the referring **host only**, never the full referring URL, which can carry
  personal data in its query string.
- `landing_path` is populated only for a **same-origin** referer. Another site's pathname is their
  data, not our landing page.
- `session_id` is reserved for a future **public visitor** session. The admin session id is never
  written to it — logging a session identifier is prohibited (`CLAUDE.md` §6) `[LOCKED]`.
- `placement` and `campaign` arrive from the query string and are therefore attacker-controlled.
  Both are allowlisted by shape; a malformed value is **dropped, never rejected**, because a bad
  parameter must not cost a real click.

### 11.3 Rules `[LOCKED]`

- **302, never 301** — destinations change; a cached 301 is unrecoverable.
- **Never store raw IP or raw user agent.** Salted SHA-256 only; the salt is a rotated secret.
- **The destination comes only from `affiliate_links.destination_url`.** No query parameter, header,
  or path segment may supply, extend, or steer it. This route is the only one that sends a visitor
  off-site, so it is the only one that could become an open redirect — the protection is structural,
  not a filter, and is re-checked against the stored value before any `Location` header is emitted.
- The click write is a single insert and precedes the redirect (§11.1). Target: < 50 ms server time.
- `/go/*` is `Disallow`ed in `robots.txt`, carries `X-Robots-Tag: noindex`, and never appears in the
  sitemap or in any internal `<a>` intended for crawling.
- Outbound affiliate anchors carry `rel="sponsored nofollow noopener"`.
- Bot traffic is **flagged**, not deleted — filtering happens at report time.
- **Conversions are only ever ingested from a partner network** (postback or manual import). Never
  modelled or inferred (`PROJECT.md` §5).
- The table grows fast: monthly partitioning **or** a rollup table plus retention policy is required
  before launch. `[PROPOSED]` — start with a `affiliate_click_daily_rollups` table and a 12-month
  raw-row retention window.

---

## 12. Error handling

- **Typed failures.** Services return a discriminated `Result<T, AppError>` for expected failures
  (not found, forbidden, validation, conflict). Exceptions are reserved for genuine bugs.
- **Error taxonomy:** `ValidationError` → 400, `AuthenticationError` → 401, `AuthorizationError` →
  403, `NotFoundError` → 404, `ConflictError` → 409, `RateLimitError` → 429, `InternalError` → 500.
- **Never leak internals.** Clients receive a safe message and a correlation ID; the detail goes to
  the logs. `[LOCKED]`
- **Boundaries:** route-level `error.tsx` and `not-found.tsx`, plus a root boundary. Errors are
  styled per `DESIGN.md`, not raw framework output.
- **Logging:** structured JSON via **`pino`** `[LOCKED for Phase 1]` with a request ID, actor ID,
  route, and duration. Never log secrets, tokens, password hashes, session IDs, or raw IPs.
  `[LOCKED]`
- **Monitoring:** **Sentry** `[LOCKED for Phase 1]` with source maps, release tracking, and PII
  scrubbing on.
- Both are locked for Phase 1 **unless a technical issue requires reconsideration** — e.g. a
  serverless-runtime incompatibility or an unacceptable bundle cost. Any substitution follows the
  change protocol in `CLAUDE.md` §9.
- **SEO-relevant status codes `[LOCKED]`:** unknown firm → 404; deliberately removed firm → **410**;
  renamed firm → **301**. Never a soft-404 (200 with "not found" text).

---

## 13. Validation `[LOCKED]`

- **Zod** as the single schema library, **shared between client and server**. `[LOCKED]`
- Validate at every boundary: form input, server action arguments, route params, search params,
  environment variables (fail fast at boot), and any external API payload.
- One schema per concept, derived into insert/update variants — never duplicated per layer.
- **Business rules live in services, not schemas.** Zod checks shape and range; "an offer's
  `ends_at` must be after `starts_at`, and only one default affiliate link may exist per firm" is a
  service concern **and** a database constraint.
- **Three layers of defence `[LOCKED]`:** Zod at the boundary → service invariants → database
  constraints. The database must remain correct even if the application is wrong.
- Slugs are generated and validated by one shared utility: lowercase, `a-z0-9-`, no leading/trailing
  or doubled hyphens, uniqueness checked against live _and_ redirected paths, and rejected when they
  collide with a reserved route segment (`SEO.md` §3.2).
- **`draft_payload` is validated on every save** with the same schemas used at publish, so a draft
  cannot accumulate invalid state that only fails at the last moment (`DATABASE.md` §3.2.1).

---

## 14. Testing `[LOCKED for Phase 1]`

| Layer         | Tool                                                                      | Scope                                                                                                                  |
| ------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Unit          | **Vitest**                                                                | Services, validation, slugs, metadata builders, JSON-LD, RBAC logic                                                    |
| Integration   | **Vitest** against a **Neon database branch** (or Testcontainers locally) | Repositories, constraints, transactions, draft/publish/rollback, redirects — against **real PostgreSQL**, never a mock |
| Component     | **Vitest + Testing Library**                                              | Design-system primitives, forms, states                                                                                |
| E2E           | **Playwright**                                                            | Admin firm lifecycle; public directory and firm page; affiliate redirect                                               |
| Accessibility | **axe-core** in Playwright                                                | Every public page and every admin screen                                                                               |
| Performance   | **Lighthouse CI** with budgets                                            | Landing, directory, firm profile                                                                                       |
| Types/lint    | `tsc --noEmit`, ESLint, Prettier                                          | Whole repo, in CI                                                                                                      |

**Non-negotiable test cases `[LOCKED]`:**

1. An unauthenticated request to every `/admin` route and every server action is rejected.
2. Each role is denied every permission it does not hold.
3. Publishing writes a version snapshot **and** an audit log entry, atomically, and clears
   `draft_payload`.
4. **Editing and saving a draft on a live firm changes nothing the public can see** — the published
   response is byte-identical before and after.
5. **Discarding a draft leaves the published columns untouched.**
6. **No public query or serialiser can reach `draft_payload`** (`DATABASE.md` §3.2.1).
7. A stale draft (`base_version` behind the current published version) is detected and refuses to
   publish silently.
8. Rollback restores into `draft_payload`, **not** into the published columns.
9. A slug change creates a working 301 and preserves the old URL.
10. **A slug change does not break an open admin draft or workspace URL** — admin routes are keyed by
    database id, not slug (§22).
11. Draft firms never appear on the public site, in the sitemap, or in search results.
12. `/go/[slug]` records a click and returns 302; `/go/*` is `noindex` and robots-disallowed.
13. Every indexable page emits a unique title, description, and self-referencing canonical.
14. The partial unique index permits exactly one default affiliate link per firm.
15. `audit_logs` rows cannot be updated or deleted.

Cases **16–23** are the live-preview isolation cases in §21.9. **Twenty-three in total.**

---

## 15. Security posture (summary)

Full rules in `CLAUDE.md` §6. Architecturally:

- HTTPS only; HSTS with preload.
- **Content Security Policy** with nonces; no `unsafe-inline` scripts. `[PROPOSED]`
- Security headers: `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy`, `X-Frame-Options`/`frame-ancestors`.
- Rate limiting on login, password reset, and all public mutations `[PROPOSED]` (Upstash Redis or a
  Postgres-backed limiter).
- Secrets in the platform's secret manager. **Never in the repository.** `.env.example` documents
  names only, never values.
- Dependency scanning (Dependabot/Renovate) and `npm audit` in CI.
- Admin surface `noindex` and, optionally, IP-restricted `[OPEN]`.
- GDPR posture: hashed IPs, defined retention, exportable/erasable user data from Phase 2.

---

## 16. Deployment — Vercel `[APPROVED]`

### 16.1 Hosting

**Decision: Vercel**, paired with Neon (§3.3) and Cloudflare R2 (§7).

Rationale: ISR, tag-based revalidation, and per-PR preview deployments are exactly the SEO-critical
mechanics this product depends on, and Vercel provides them natively.

Implementation consequences:

- **Preview deployments** pair with a **Neon database branch** per pull request, so schema changes
  and admin flows are reviewed against real, isolated data.
- **`waitUntil`** is used for the deferred affiliate click write (§11), so the redirect is never
  blocked.
- **Function limits apply** — long-running work (bulk operations, future analytics ingestion) must be
  designed as batched or queued jobs, not as a single long request.
- Secrets in Vercel's environment/secret manager, scoped per environment.
- **Keep the application container-buildable.** A standard Docker build is maintained so the choice
  remains reversible; nothing may depend on a Vercel-only primitive without an adapter.
  `[LOCKED]`
- Custom domain `propfirmlenz.com` with the apex/`www` policy in §19.

### 16.2 Environments

`local` → `preview` (per PR, seeded, `noindex` + robots-disallowed **always** `[LOCKED]`) →
`staging` `[OPEN]` → `production`.

### 16.3 Pipeline `[PROPOSED]`

```
push → typecheck → lint → unit → integration (ephemeral DB) → build
     → deploy preview → E2E + axe + Lighthouse
     → manual approval → migrate → deploy production → smoke test
```

- **Migrations run as an explicit, gated CI step** before the deploy — never automatically at
  application boot. `[LOCKED]`
- **Expand-then-contract** migrations only: add nullable → backfill → switch reads → drop later.
  Never a destructive migration in a single release. `[LOCKED]`
- Rollback plan documented per release; database rollbacks are forward-fix by default.

### 16.4 Operational readiness

Health endpoint; uptime monitoring; error alerting; nightly backup verification; a documented
restore procedure; log retention `[OPEN]`; a runbook for "the site is down" and "a firm's data is
wrong in production".

---

## 17. Open questions

**None are blocking.** The architecture is fully specified; every item below has a stated default
that applies if it is never revisited.

| #   | Question                                                            | Default if unresolved                                         |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1   | **Analytics** — Plausible, Umami, GA4, or none? (§10)               | **None in Phase 1.** Explicitly must not block initialisation |
| 2   | **MFA required for admins at launch**, or schema-ready only? (§5.2) | Schema-ready; enforced for `master_admin`                     |
| 3   | **SVG uploads** — sanitise or reject? (§7.3)                        | **Reject** — the safe default                                 |
| 4   | **Affiliate click retention** (§11.3)                               | 12 months raw, then rollup-only                               |
| 5   | **Staging tier** — persistent, or preview deploys only? (§16.2)     | Preview deployments only                                      |
| 6   | **Session timeouts** (§5.2)                                         | 8h idle, 30d absolute                                         |
| 7   | **Public auth provider** — Phase 2+ (§5.4)                          | Auth.js v5. Not needed in Phase 1                             |
| 8   | **`www` → apex redirect** (§19)                                     | Redirect `www` to apex                                        |
| 9   | **Email sender domain** + SPF/DKIM/DMARC (§19)                      | Required before admin invites and password resets             |

Resolved 2026-09-03: ORM, database host, hosting, object storage, admin auth, canonical domain,
currency policy, `/compare` scope, framework, styling, UI primitives, icons, validation, draft model,
neutral palette, logging/monitoring, testing stack.

---

## 18. Monetary values and currency `[APPROVED]`

**Rule: store original monetary values with their source currency. Never silently convert, and never
overwrite a source value.**

### 18.1 Storage

Every money column is paired with its own currency column, and both record **what the firm actually
publishes**:

```
challenges.price            numeric(12,2)   -- as published by the firm
challenges.price_currency   char(3)         -- ISO 4217, as published
challenges.account_size     numeric(14,2)
challenges.account_currency char(3)
offers.discount_value       numeric(10,2)
offers.discount_currency    char(3)
```

A firm that prices in EUR is stored in EUR. A firm that prices in USD is stored in USD. There is no
"normalised" base-currency column that silently becomes the truth.

### 18.2 Conversion `[LOCKED]`

1. **Conversion is display-only and derived at read time.** A converted figure is never written into
   a source column, never persisted as the entity's value, and never used as the audit record.
2. **Every converted figure is visibly labelled as a conversion**, with the rate and the rate date
   shown (e.g. "≈ $540 USD · at 0.92 EUR/USD, 3 Sep 2026").
3. **Rates are stored with provenance**, not fetched inline at render. A future
   `currency_rates (base, quote, rate, as_of, source)` table `[PROPOSED — Phase 2+]` holds dated
   rates so a displayed conversion is reproducible and explainable.
4. **Never invent or estimate a rate** (`CLAUDE.md` §3). If no stored rate is available for the pair
   and date, the UI shows the original value only — it does not guess.

### 18.3 Comparison and sorting `[LOCKED]`

Cross-currency comparison is the trap. Rules:

- Sorting or filtering by price across mixed currencies **must state its basis** in the UI
  ("sorted by price, converted to USD at 3 Sep 2026 rates").
- The original value and currency remain visible in the row. The conversion is secondary.
- A comparison presented as like-for-like when it is not is a **data-integrity defect**, not a
  cosmetic issue.
- Default behaviour when no rate exists: group or badge by currency rather than mixing.

### 18.4 Formatting

`Intl.NumberFormat` with the record's own currency code, in a single shared formatter. Currency
symbols are never hard-coded, and a value is never rendered without its currency.

---

## 19. Canonical domain `[APPROVED]`

**Production origin: `https://propfirmlenz.com`**

| Concern           | Rule                                                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical host    | `propfirmlenz.com` — **apex, no `www`**                                                                                                                  |
| `www`             | `www.propfirmlenz.com` → 301 → apex `[PROPOSED — confirm]`                                                                                               |
| Protocol          | HTTP → 301 → HTTPS; HSTS with preload                                                                                                                    |
| Config            | One environment variable (`NEXT_PUBLIC_SITE_URL`) feeds the single `canonicalUrl()` helper (§9). **Nothing else constructs an absolute URL.** `[LOCKED]` |
| Preview / staging | Vercel-assigned hostnames. **`noindex` + `Disallow: /` unconditionally** (`SEO.md` §14) — they must never be canonicalised to production or indexed      |
| Media CDN         | `cdn.propfirmlenz.com` on the R2 bucket `[PROPOSED]`                                                                                                     |
| Email             | Sender domain, SPF/DKIM/DMARC `[OPEN]` — needed before admin invitations and password resets                                                             |

This unblocks canonical URLs, the sitemap, Open Graph image URLs, and JSON-LD `@id` values, all of
which were previously waiting on a domain.

---

## 20. `/compare` — architecture now, feature later `[APPROVED]`

**Approved scope: architect the URLs and relationships now. Do not build the comparison feature in
Phase 1 unless explicitly instructed later.**

### 20.1 What is architected in Phase 1

- **Route shape reserved:**
  `/compare?a={firm-slug}&b={firm-slug}` — the tool form, dynamic, `noindex`.
  `/compare/{slug-a}-vs-{slug-b}` — the future curated, indexable form (`SEO.md` §10.3).
  Both shapes are reserved now so no other route or firm slug can claim them.
- **Slug collision guard:** the slug validator rejects any firm slug that would collide with a
  reserved route segment (`compare`, `go`, `admin`, `api`, `prop-firms`, `platforms`, `instruments`,
  `offers`, `sitemap`, `robots`). `[LOCKED]`
- **Comparability is a schema property, not a later bolt-on:**
  - `rules.is_comparable` and `rules.is_filterable` already exist (`DATABASE.md` §5.3).
  - The normalised vocabulary (`drawdown_type`, `drawdown_basis`, `challenge_type`) exists precisely
    so two firms can be placed side by side without a translation step.
  - Hot rules are columns on `challenges`, which is what makes a comparison query cheap.
  - The currency rules in §18 define how a cross-currency comparison must behave.
- **Repository readiness:** the firm repository exposes a `findManyBySlugs()` shape that a future
  comparison page can call without new data access work.
- **SEO policy fixed now:** parameterised `/compare` is `noindex, follow` and canonicalises to
  `/compare`; curated pair pages remain gated behind `SEO.md` §10.3 thresholds.

### 20.1b What is explicitly NOT built in Phase 1 `[LOCKED]`

- No comparison page, UI, selector, or comparison table component.
- No curated `/compare/[a]-vs-[b]` pages.
- No "popular comparisons" index.
- No comparison entries in the sitemap or the navigation.

`/compare` is removed from the Phase 1 route list in `PROJECT.md` §9 and `ROADMAP.md` §1.5, and moved
to Phase 4.

---

## 21. Live preview architecture `[LOCKED — Phase 1]`

The admin firm workspace renders a **side-by-side editor and public-page preview**. The preview shows
the current **draft** state; the live site continues to serve the **published** state.

UX specification: `ADMIN.md` §7A. Layout and visual treatment: `DESIGN.md` §15.

### 21.1 The governing rule `[LOCKED]`

**The preview renders the same public components as the production page. There is no second
implementation of the firm profile.** A parallel "preview UI" is prohibited — it would drift from
production within weeks and the preview would stop being trustworthy, which defeats its entire
purpose.

### 21.2 Structure — one component tree, two data sources

```
lib/view/firm-view.ts     ← THE canonical FirmView. One definition, no variants.

components/public/firm-profile/
  FirmProfile.tsx         ← the shared page body. Used by BOTH routes. No admin imports.
  FirmHeader.tsx
  KeyFacts.tsx
  ChallengeTable.tsx
  RulesSection.tsx
  PlatformsSection.tsx    ← platforms + instruments
  OffersSection.tsx
  AffiliateCta.tsx
  FirmLogo.tsx
  Section.tsx             ← section wrapper + the honest "no data" state

app/(public)/prop-firms/[slug]/page.tsx
      └─ getPublishedFirmView(slug) ──────┐
                                          ├──▶ FirmView ──▶ <FirmProfile firm={…} />
app/(admin)/admin/preview/firms/[id]/page.tsx
      └─ materializeDraft(id) ────────────┘
```

**The type is the contract `[LOCKED]`.** `getPublishedFirmView()` and `materializeDraft()` return
the **identical** `FirmView` type, and both build it through the same `assembleView()` in
`repositories/public-firm-view.ts`. Adding a field to the public view without supplying it from the
draft materialiser is a **compile error**, not a silent visual difference. This is what makes drift
structurally impossible rather than a matter of discipline.

**One profile view model `[LOCKED]`.** There is no second firm-detail shape.
`repositories/public-firms.ts` owns only the DIRECTORY summary (`FirmSummary`) and the sitemap
query — genuinely different concerns from a profile — and holds no competing detail type.

**Import boundary `[LOCKED]`:** `components/public/**` must never import from `components/admin/**`.
Enforced by an ESLint import rule. No admin-only variant of a public component may exist.

### 21.3 `materializeDraft()` contract `[LOCKED]`

```
materializeDraft(firmId) → FirmView
```

1. Load the published rows for the firm and all children.
2. Overlay `draft_payload` (`DATABASE.md` §3.2.1): apply changed firm fields, then apply each child
   `_op` — `create` (synthesised, never written), `update` (merged), `delete` (omitted).
3. Return the same `FirmView` the public route builds.

- **Pure and read-only.** It performs no writes. Ever. `[LOCKED]`
- When `draft_payload IS NULL` it returns exactly the published view — so previewing a clean firm
  shows the live page.
- Synthesised draft children get stable temporary ids so React keys and anchors stay consistent
  across preview reloads.

### 21.4 Rendering mechanism — iframe `[LOCKED]`

The preview pane embeds an **iframe** pointing at the authenticated preview route. It does **not**
render the public component tree inline inside the admin page.

**Why the iframe is required, not merely convenient:**

| Concern                | Inline rendering                                                                                                                                                          | Iframe                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Responsive preview** | `@media` queries resolve against the **browser** viewport, not the pane width — a "375px mobile preview" would render the desktop layout. **The feature would be a lie.** | The iframe has its own viewport. 375px wide = genuine mobile rendering |
| CSS isolation          | Admin chrome styles and the public theme share a cascade; collisions are inevitable                                                                                       | Separate document, separate cascade                                    |
| Layout fidelity        | The public `layout.tsx`, container widths, and sticky headers assume they own the document                                                                                | Identical to production                                                |
| Full-page preview      | Needs a second code path                                                                                                                                                  | The same URL, opened in a tab                                          |
| Accidental mutation    | Admin server actions are in scope of the same tree                                                                                                                        | Sandboxed document                                                     |

The responsive argument alone settles it: a preview that cannot honestly show the mobile layout is
not a preview.

**Iframe attributes `[LOCKED]`:**

```html
<iframe
  src="/admin/preview/firms/{id}?v={draftVersion}"
  sandbox="allow-same-origin allow-scripts"   <!-- NO allow-forms, NO allow-top-navigation -->
  title="Public page preview (draft)"
  loading="lazy" />
```

- **No `allow-forms`** — nothing inside the preview can submit anything.
- **No `allow-top-navigation`** — the preview can never navigate the admin page out from under the
  editor.
- The iframe is **not mounted** when the preview pane is hidden (mobile Edit view), so it costs
  nothing when unused.

### 21.5 Refresh model `[LOCKED]`

**The preview updates on Save Draft, not on every keystroke.** This matches the required workflow and
avoids a server round-trip per character.

```
Edit fields  →  Save Draft  →  draftVersion++  →  iframe reloads  →  Preview reflects the draft
```

- The iframe `src` carries a `?v={draftVersion}` cache-buster; incrementing it forces a fresh server
  render with `no-store`.
- **Scroll position is preserved across reloads** — the preview restores its scroll offset, so the
  admin does not lose their place on a long firm profile. `[LOCKED]`
- A "Refresh preview" control is available for manual re-render.
- Debounced auto-save with auto-refresh is `[PROPOSED]` — deliberately not the default, because
  silent autosave to a draft that is one click from publish deserves an explicit decision.

### 21.6 Isolation guarantees `[LOCKED]`

The preview must be inert. Every guarantee below is a required test case (§14).

| #   | Guarantee                                             | Mechanism                                                                                                                                                                               |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Draft data never reaches a public query**           | Public repositories never select `draft_payload` (`DATABASE.md` §3.2.1). `materializeDraft` is only reachable from authenticated admin routes                                           |
| 2   | **The public page is unchanged while a draft exists** | Separate data sources; publishing is the only writer. Asserted by a byte-identical response test                                                                                        |
| 3   | **Preview can never publish**                         | The route is a read-only GET; the iframe has no `allow-forms`; no mutation action exists in the public component tree; publish is only reachable from the workspace header              |
| 4   | **No affiliate attribution from previewing**          | §21.7                                                                                                                                                                                   |
| 5   | **No analytics events**                               | The analytics boundary is a no-op under `PreviewContext`; no beacons, no view counters, no popularity increments                                                                        |
| 6   | **Not indexable**                                     | `X-Robots-Tag: noindex, nofollow` header, `no-store`, robots-disallowed, absent from the sitemap (`SEO.md` §8, §14)                                                                     |
| 7   | **Never a public canonical**                          | §21.8                                                                                                                                                                                   |
| 8   | **Requires authorisation**                            | The preview route enforces `firm:read` server-side like any other admin route (§6.2). Anonymous access returns 404, not 403 — the existence of an unpublished firm is itself non-public |

### 21.7 Affiliate safety `[LOCKED]`

**Previewing must never create affiliate click or conversion attribution.**

Primary mechanism — **structural**: under `PreviewContext`, `AffiliateCta` renders as an **inert
element with no `href` to `/go/`**. No request is issued, so there is nothing to attribute. This does
not depend on any downstream filter being correct.

Defence in depth:

- The iframe's missing `allow-top-navigation` means even a stray anchor cannot navigate out.
- `/go/[slug]` treats a request carrying a valid **admin session** as internal traffic, recorded as
  **`affiliate_clicks.is_internal = true`** `[APPROVED]` and excluded from all reporting alongside
  `is_bot` (`DATABASE.md` §5.10a).
  **`is_internal` is secondary protection and classification only.** The primary guarantee is
  structural — preview CTAs carry no affiliate href, so no click exists to classify. A change that
  made preview _rely_ on `is_internal` would be a defect. `[LOCKED]`
- The CTA still renders with correct **styling and copy** — the admin must see what the real button
  looks like. Only its destination is removed, with a tooltip explaining why.

**In-preview navigation `[LOCKED]`:** all links inside the preview pane are inert — the pane previews
one page. Full-page preview follows the same rule `[PROPOSED]`, so an admin can never wander from a
draft preview into live pages without noticing.

### 21.8 Head, metadata, and structured data `[LOCKED]`

The preview route emits **no** canonical, Open Graph tags, or JSON-LD.

Component reuse (§21.1) governs the **rendered body**. Head generation is `generateMetadata`, not a
component, and is deliberately suppressed in preview so that:

- no self-canonical to an admin URL can ever exist,
- no draft data appears in machine-readable markup,
- there is no route by which a preview URL could be mistaken for a public page.

Admins inspect metadata and JSON-LD in the **SEO tab's dedicated preview panel** (`ADMIN.md` §6.2,
`SEO.md` §15), which shows exactly what will be emitted **on publish**. Keeping the two concerns
separate is deliberate: the body preview answers "how does this look", the SEO panel answers "what
will search engines receive".

### 21.9 Required test cases `[LOCKED]`

**Continuing the non-negotiable list in §14** — these are cases 16–23. (Case 4 in §14 already covers
"editing a draft leaves the public response byte-identical", so it is not repeated here.)

16. The preview renders the **draft** values while the public page renders the **published** values —
    the worked example in `ADMIN.md` §7A.1.
17. Both routes render the **same** `FirmProfile` component; no duplicate implementation exists.
18. An anonymous request to a preview URL returns 404.
19. No `/go/` request originates from a rendered preview.
20. The preview response carries `X-Robots-Tag: noindex` and `Cache-Control: no-store`.
21. The preview response contains no `<link rel="canonical">`, no `og:` tags, and no JSON-LD.
22. No preview URL appears in any sitemap.
23. `materializeDraft()` performs no writes (asserted against a read-only database role).

---

## 22. Identifier strategy — admin by id, public by slug `[LOCKED]`

**Admin routes are keyed by the stable database id. Public routes are keyed by the slug.**
Locked 2026-09-03.

### 22.1 The rule

| Surface                                        | Key                          | Example                                                                          |
| ---------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| **Admin** — workspace, preview, all sub-routes | **`prop_firms.id` (UUIDv7)** | `/admin/prop-firms/{id}`, `/admin/preview/firms/{id}` |
| **Public** — every indexable page              | **slug**                     | `/prop-firms/{slug}`                                                             |
| **Affiliate redirect**                         | slug                         | `/go/{slug}`                                                                     |

### 22.2 Why

A slug is **mutable business data**; an id is **immutable identity**. Renaming a slug is an
explicitly supported operation that can happen _while a draft is open_ (`ADMIN.md` §7 rule 4,
`DATABASE.md` §3.2.1 hard rule 4). If admin URLs were slug-keyed, then the moment an admin typed a
new slug into the draft:

- the open workspace URL would point at a firm that no longer answers to that slug **or**
- it would resolve via the published slug, silently diverging from the draft being edited,
- the preview iframe `src` would break or reload the wrong entity,
- bookmarks, audit-log deep links, and "open in new tab" would rot on every rename.

Keying admin routes by id makes the rename a pure data change with **no routing consequence at all**.
Public URLs keep slugs because they are the SEO asset (`SEO.md` §3), and their stability is protected
by the automatic 301 instead.

### 22.3 Consequences `[LOCKED]`

1. **A slug change never breaks an admin draft, workspace URL, preview URL, or open tab.** This is
   test case 10 (§14).
2. Admin deep links (from audit logs, dashboard queues, global search) are built from ids.
3. The admin **displays** the slug prominently — it is the firm's public identity — but never routes
   on it.
4. Ids are UUIDv7 (`DATABASE.md` §1). They appear only in admin URLs, which are `noindex` and
   authenticated, so the "no ids in URLs" SEO convention (`SEO.md` §3.3) is a **public**-route rule
   and is not violated.
5. A slug-based admin URL, if one is ever requested, **redirects to the id form** rather than serving
   a second canonical admin address.
