# INITIALIZATION.md — Approved Project Initialization Procedure

> **Status: approved procedure, NOT YET EXECUTED.**
> The repository is documentation-only. Nothing in this document has been run.
>
> Executing this procedure requires **explicit owner approval** (`CLAUDE.md` §12.5 rule 49).

Markers: `[LOCKED]` binding · `[APPROVED]` owner-approved, binding · `[PROPOSED]` needs approval.

---

## 0. Scope

**What this procedure produces:** a working toolchain — framework scaffold, dependencies, tooling,
configuration, and the first commit.

**What it explicitly does NOT produce `[LOCKED]`:**

- ❌ No database schema files
- ❌ No migrations
- ❌ No database tables
- ❌ No application features, pages, or UI components
- ❌ No business or prop-firm data of any kind
- ❌ No production credentials

Schema authoring is a **separate, gated step** (§11) requiring its own approval.

---

## 0a. Official brand, domain, and assets `[LOCKED]`

Everything created during initialization uses these values. There is no other brand, domain, or logo.

| Concern                         | Official value                                      |
| ------------------------------- | --------------------------------------------------- |
| **Brand name**                  | **Prop Firm Lenz**                                  |
| Previous name (historical only) | Prop Firm Lens — renamed 2026-09-03                 |
| **Domain**                      | **`propfirmlenz.com`**                              |
| **Canonical origin**            | **`https://propfirmlenz.com`** — apex, **no `www`** |
| `NEXT_PUBLIC_SITE_URL`          | `https://propfirmlenz.com`                          |
| Media CDN                       | `cdn.propfirmlenz.com` (Cloudflare R2) `[PROPOSED]` |
| npm package name                | `prop-firm-lenz`                                    |
| Master gradient                 | `#19E6D2 → #268BFF → #4F46E5 → #6D3DF5`             |

**Logo assets `[LOCKED]`** — supplied by the owner, authoritative:

| Asset             | File                      | Destination     |
| ----------------- | ------------------------- | --------------- |
| Horizontal lockup | `Prop Firm Lenz logo.png` | `public/brand/` |
| Standalone mark   | `Prop Firm Lenz Icon.png` | `public/brand/` |

Source at time of writing: `C:\Users\koush\Downloads\PFL logo`.

**Rules:**

1. **Copy the supplied files unmodified.** Do not recreate, redraw, redesign, restyle, recolour, or
   substitute the logo, and never rebuild it as inline SVG from a description (`CLAUDE.md` §12.2).
2. Favicons and app icons are produced by **resizing the supplied icon PNG only** — never by
   redrawing the mark.
3. The colour tokens in §4.2 are the official palette. Their **measured contrast constraints**
   (`DESIGN.md` §2.5) are binding — they are not style suggestions.
4. **The on-disk folder is still named `Prop Firm Lens`.** That is incidental; the brand, package
   name, and domain are all `Lenz`. See §1.3.

---

## 1. Prerequisites

### 1.1 Verified present

| Requirement          | Required          | Verified on this machine                       | Status |
| -------------------- | ----------------- | ---------------------------------------------- | ------ |
| Node.js              | **24 LTS**        | **v24.19.0** (`C:\Program Files\nodejs\`)      | ✅     |
| npm (bootstrap only) | ≥ 10              | **11.17.0**                                    | ✅     |
| Git                  | ≥ 2.40            | **2.55.0.windows.3** (`C:\Program Files\Git\`) | ✅     |
| Corepack             | bundled with Node | **0.35.0**                                     | ✅     |
| Disk                 | ≥ 5 GB            | 447 GB free on `D:`                            | ✅     |

### 1.2 Must be done before running anything `[LOCKED]`

| #   | Prerequisite      | Command                                                                                | Why                                                      |
| --- | ----------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | **Git identity**  | `git config --global user.name "<name>"`<br>`git config --global user.email "<email>"` | **Currently UNSET. `git commit` fails without it** (§10) |
| 2   | **Activate pnpm** | `corepack enable`<br>`corepack prepare pnpm@latest --activate`                         | pnpm is not yet available (§3)                           |

### 1.3 Environment notes `[LOCKED]`

- **Node and Git are installed but not on the automation shell's `PATH`.** Invoke via full paths, or
  prepend for the session:
  ```powershell
  $env:PATH = "C:\Program Files\nodejs;C:\Program Files\Git\cmd;$env:PATH"
  ```
- **The project path contains a space** (`D:\Projects\Prop Firm Lens`). Every path must be quoted, and
  the npm package name must be set explicitly (§4) — the directory name is not a valid package name.
- **The on-disk directory is still named `Prop Firm Lens`** (the pre-rename spelling). The **brand**
  is `Prop Firm Lenz` and the package name is `prop-firm-lenz`; the folder name is incidental and is
  **not** renamed as part of the brand migration. Renaming the directory is optional and, if done,
  must happen **before** `git init` — never after. `[LOCKED]`

### 1.4 Not required for initialization

Neon, Cloudflare R2, Vercel, Sentry, and the domain are **not needed to initialize**. Their names are
declared in `.env.example` (§8); no credentials are configured now (`[LOCKED]`).

---

## 2. Node.js 24 `[APPROVED]`

**Node.js 24 LTS. Do not downgrade to Node 22.**

Pinned in two places so the toolchain, CI, and Vercel agree:

```
.nvmrc                 24
package.json engines   { "node": ">=24 <25" }
```

Vercel's project settings must select the Node 24 runtime to match.

---

## 3. pnpm `[APPROVED]`

**pnpm is the project package manager. npm is NOT.** `[LOCKED]`

```powershell
corepack enable
corepack prepare pnpm@latest --activate
pnpm -v                      # record the exact version
```

Then pin that exact version in `package.json`:

```jsonc
{ "packageManager": "pnpm@<exact.version.from.above>" }
```

Rules `[LOCKED]`:

1. **Never run `npm install` or `yarn` in this project.** The lockfile is `pnpm-lock.yaml`; a stray
   `package-lock.json` is a defect and must be deleted, not committed.
2. `packageManager` is pinned to an **exact** version, so Corepack gives every machine and CI the
   same pnpm.
3. Vercel must be configured to install with pnpm.
4. Chosen for **strict `node_modules`**: pnpm refuses phantom dependencies, which directly protects
   the import boundary in `ARCHITECTURE.md` §21.2 (`components/public/**` may not reach admin code).

---

## 4. Next.js initialization

```powershell
# 4a. Confirm the current flag set before running
pnpm dlx create-next-app@latest --help

# 4b. Scaffold in place
pnpm dlx create-next-app@latest . `
  --ts --app --tailwind --eslint --src-dir `
  --import-alias "@/*" --use-pnpm --empty --no-turbopack
```

- `--empty` — no marketing boilerplate to delete.
- `--no-turbopack` — prove the toolchain on stable webpack; opt in later.
- **If it refuses the non-empty directory:** scaffold into the scratchpad and copy everything except
  `docs/` and `CLAUDE.md`. Verify before assuming either way.

**Immediately after `[LOCKED]`:**

```jsonc
{
  "name": "prop-firm-lenz", // NOT derived from the directory name
  "private": true,
  "packageManager": "pnpm@<exact>",
  "engines": { "node": ">=24 <25" },
}
```

### 4.1 TypeScript configuration

Harden beyond the Next.js default:

```jsonc
{
  "compilerOptions": {
    "strict": true, // [LOCKED]
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true, // see note
    "verbatimModuleSyntax": true,
    "paths": { "@/*": ["./src/*"] },
  },
}
```

`exactOptionalPropertyTypes` is genuinely strict and may fight third-party types. If it does, it is
**dropped and reported** — never worked around with `any` (`CLAUDE.md` §8).

**ESLint additions:** `@typescript-eslint` strict rules; `eslint-plugin-import` with
`no-restricted-imports` enforcing **`components/public/**` ✗→ `components/admin/**`**
(`CLAUDE.md` §12.4f rule 36); a rule banning raw hex colours in components (`DESIGN.md` §14).

### 4.2 Tailwind CSS v4

v4 is CSS-first — no `tailwind.config.js`.

- `src/styles/tokens.css` — the official `DESIGN.md` §2.3 palette as CSS custom properties, verbatim:

  ```css
  :root {
    /* surfaces */
    --bg-base: #050609;
    --bg-near-black: #080a10;
    --bg-card: #0d1017;
    --bg-elevated: #15122a;
    --bg-purple-deep: #180d35;
    --bg-violet-deep: #3b1b75;
    /* text */
    --text-primary: #ffffff;
    --text-secondary: #d9dce5;
    --text-muted: #9298a8;
    --text-metadata: #737a89; /* §2.5: bg-base only at normal size */
    /* brand */
    --brand-cyan: #19e6d2;
    --brand-blue: #268bff;
    --brand-indigo: #4f46e5;
    --brand-violet: #6d3df5;
    --gradient-brand: linear-gradient(
      135deg,
      #19e6d2 0%,
      #268bff 38%,
      #4f46e5 72%,
      #6d3df5 100%
    );
    color-scheme: dark;
  }
  ```

  **The usage constraints in `DESIGN.md` §2.5 travel with these tokens** — notably that
  `--text-metadata` is AA-safe only on `--bg-base`, and that indigo/violet must not carry meaning on
  purple surfaces.

- `src/app/globals.css` — `@import "tailwindcss"`, then the tokens, then `@theme inline { … }`
  mapping tokens to utilities.
- `next/font` loading **Inter** with `display: swap`.
- A global `prefers-reduced-motion` reset (`DESIGN.md` §9).

### 4.3 Radix, Lucide, Zod

```powershell
pnpm add radix-ui lucide-react zod
```

No Radix styles are imported — behaviour and ARIA only (`ARCHITECTURE.md` §2.4).

---

## 5. Package installation

Order matters only in that runtime deps come before dev tooling; otherwise a single pass.

```powershell
# runtime
pnpm add drizzle-orm postgres zod radix-ui lucide-react pino @node-rs/argon2

# dev / tooling
pnpm add -D drizzle-kit vitest @vitejs/plugin-react `
            @testing-library/react @testing-library/jest-dom happy-dom `
            prettier eslint-plugin-import

# e2e (scaffolds its own config + workflow)
pnpm create playwright
pnpm add -D @axe-core/playwright @lhci/cli
```

Rules `[LOCKED]`:

1. **Report the actual resolved versions** after install. Do not assume Tailwind v4, Zod v4, and
   `drizzle-zod` are mutually compatible — **verify, and report any conflict** rather than pinning
   around it silently.
2. `@node-rs/argon2` is chosen over `argon2` — prebuilt binaries, no `node-gyp` on Vercel.
   **Argon2 requires the Node runtime, not Edge**: every auth route carries
   `export const runtime = "nodejs"`.
3. `drizzle-zod` is `[PROPOSED]`, not required. Add only if it works cleanly with the resolved Zod.
4. **No analytics package** is installed — deferred and explicitly non-blocking
   (`ARCHITECTURE.md` §10).

---

## 6. Project directory structure

```
D:\Projects\Prop Firm Lens\              ← on-disk path (pre-rename spelling; brand is Prop Firm Lenz)
├── CLAUDE.md, docs/                    ← existing, untouched
├── drizzle/                            ← migrations (empty at init)
├── public/brand/                       ← official logo PNGs, copied unmodified, never edited
├── e2e/                                ← Playwright specs
├── src/
│   ├── app/
│   │   ├── (public)/
│   │   ├── (admin)/admin/
│   │   │   ├── firms/[id]/             ← workspace — ID-keyed (ARCHITECTURE.md §22)
│   │   │   └── preview/firms/[id]/     ← preview iframe target — ID-keyed
│   │   ├── go/[slug]/route.ts
│   │   ├── robots.ts, sitemap.ts
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                         design-system primitives
│   │   ├── public/firm-profile/        ← SHARED by public route AND preview
│   │   └── admin/                      ← public/** may never import from here
│   ├── lib/
│   │   ├── db/{client.ts,schema/}      only place Drizzle is imported
│   │   ├── repositories/               only place queries live
│   │   ├── services/                   business rules, RBAC, transactions
│   │   ├── validation/                 Zod schemas incl. env
│   │   ├── auth/                       sessions, Argon2id, permissions
│   │   ├── seo/                        canonicalUrl, metadata, JSON-LD
│   │   ├── analytics/                  no-op boundary (no vendor)
│   │   └── utils/
│   ├── types/  └── styles/
└── .env.example, .nvmrc, .gitattributes, drizzle.config.ts,
    vitest.config.ts, playwright.config.ts, lighthouserc.json
```

**Directories are created empty at init.** No route files, components, or schema modules are
authored (§0).

---

## 7. Drizzle setup

Configuration only — **no schema, no migrations, no database connection attempted.**

```ts
// drizzle.config.ts
export default {
  dialect: "postgresql",
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL_DIRECT! }, // DIRECT, not pooled
  strict: true,
  verbose: true,
};
```

```ts
// src/lib/db/client.ts — app runtime, POOLED endpoint
const sql = postgres(env.DATABASE_URL, { prepare: false }); // required by Neon's pooler
```

Rules `[LOCKED]`:

1. **Two endpoints, two purposes.** App → **pooled**; `drizzle-kit` → **direct** (session mode).
2. `prepare: false` is mandatory — Neon's pooler is transaction-mode and breaks prepared statements.
3. `src/lib/db/schema/index.ts` is created **empty** at init.
4. **`drizzle-kit push` is PROHIBITED.** See §12.

---

## 8. Environment file setup

`.env.example` is **committed with names only — never values** `[LOCKED]`.
`.env.local` is gitignored and is **not created with real credentials during initialization**.

```bash
# .env.example
NODE_ENV=
NEXT_PUBLIC_SITE_URL=https://propfirmlenz.com

DATABASE_URL=                 # Neon POOLED  — application runtime
DATABASE_URL_DIRECT=          # Neon DIRECT  — migrations only

AUTH_SESSION_PEPPER=          # session-token hashing pepper
IP_HASH_SALT=                 # salted IP/UA hashing — rotated

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=           # https://cdn.propfirmlenz.com

SENTRY_DSN=
SENTRY_AUTH_TOKEN=            # build-time only, source-map upload
LOG_LEVEL=info
```

All parsed through `src/lib/validation/env.ts` (Zod) at boot, so a missing variable fails the build
rather than the first request (`ARCHITECTURE.md` §13). Secrets are never logged (`CLAUDE.md` §6).

---

## 9. `.gitignore` and `.gitattributes`

### `.gitignore`

Extend the generated file with:

```gitignore
# env
.env
.env*.local

# build / tooling
.vercel
/coverage
/playwright-report
/test-results
/blob-report
/.lighthouseci
next-env.d.ts

# wrong package manager — pnpm only (§3)
package-lock.json
yarn.lock
```

### `.gitattributes` `[LOCKED]`

Required. `core.autocrlf` is **unset** on this machine, and relying on it is less reliable than
declaring intent in the repository:

```gitattributes
* text=auto eol=lf

*.png binary
*.jpg binary
*.webp binary
*.avif binary
*.ico binary
*.woff2 binary
*.pdf binary

pnpm-lock.yaml -diff linguist-generated
drizzle/**/*.sql linguist-language=SQL
```

This keeps LF in the repository regardless of contributor platform, and prevents the CRLF churn that
would otherwise make every migration diff unreadable.

---

## 10. Git initialization

**Prerequisite: git identity must be configured (§1.2) — `git commit` fails otherwise.**

```powershell
git init -b main
git add -A
git status                    # review before committing
git commit                    # message below
```

Initial commit message `[LOCKED]`:

```
chore: initialise Prop Firm Lenz (Phase 1 foundation)

Next.js App Router + TypeScript strict, Tailwind v4 with design tokens,
Radix + Lucide, Zod, Drizzle config, Vitest/Playwright, security and SEO
baseline. Node 24 LTS, pnpm pinned via Corepack.

No schema, no migrations, no application features, no business data.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Rules `[LOCKED]`:

1. Branch is `main` (`init.defaultBranch` is unset, so `-b main` is required).
2. **No remote is added and nothing is pushed** unless explicitly instructed.
3. `git status` is reviewed before the commit — nothing unexpected, no `.env.local`, no
   `package-lock.json`.

---

## 11. Database and migration strategy

**Initialization stops before any schema.** This is a deliberate gate.

| Step | Action                                                                                                   | Gate                              |
| ---- | -------------------------------------------------------------------------------------------------------- | --------------------------------- |
| A    | `drizzle.config.ts` + **empty** `schema/index.ts`                                                        | ✅ part of init                   |
| B    | Author the `DATABASE.md` schema in Drizzle                                                               | ⛔ **separate owner approval**    |
| C    | `pnpm db:generate` → **read and edit the emitted SQL by hand**                                           | reviewed before commit            |
| D    | Hand-add what Drizzle cannot express: remaining `CHECK`s, append-only triggers, `REVOKE` on `audit_logs` | same migration file               |
| E    | `pnpm db:migrate` against a **Neon branch** first, never production                                      |                                   |
| F    | **Structural seeds only** — roles, permissions, rule catalog                                             | **zero business data** `[LOCKED]` |

Expand-then-contract migrations only; applied as a gated CI step, never at application boot
(`ARCHITECTURE.md` §16.3).

---

## 12. Prohibition: `drizzle-kit push` `[LOCKED]`

**`drizzle-kit push` is prohibited in this project.**

- It diffs the schema straight onto a database, **bypassing migration history entirely**.
- The audit, rollback, and reviewability guarantees this project depends on all assume every schema
  change exists as a committed, reviewed SQL file.
- **No `db:push` script will exist in `package.json`** — the footgun is removed rather than
  documented around.
- This applies to local development too. Local schema changes go through
  `db:generate` → review → `db:migrate`, exactly like production.

---

## 13. No business data during initialization `[LOCKED]`

Restating `CLAUDE.md` §3, because initialization is precisely where fake data tends to creep in "just
to see it render":

- ❌ No prop firms, challenges, offers, rules, platforms, or instruments
- ❌ No prices, drawdowns, profit splits, payouts, reviews, or ratings
- ❌ No seed fixtures resembling real firms
- ❌ No placeholder data copied from the UX references (`CLAUDE.md` §12.2b)
- ✅ Structural seeds only — roles, permissions, and the rule **catalog definitions**

`Lucid Prop` is the designated example firm. Its record is created **by a human through the admin
UI**, after Phase 1's admin exists. It is not seeded here.

---

## 14. Development scripts

```jsonc
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "format": "prettier --write .",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:integration": "vitest run --config vitest.integration.config.ts",
  "test:e2e": "playwright test",
  "test:a11y": "playwright test --grep @a11y",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:check": "drizzle-kit check",
  "db:studio": "drizzle-kit studio",
  "verify": "pnpm typecheck && pnpm lint && pnpm test",
}
```

**Note the deliberate absence of `db:push`** (§12).

---

## 15. Security baseline

`next.config.ts` headers:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
X-Frame-Options: SAMEORIGIN          ← see below
/admin/*  → X-Robots-Tag: noindex, nofollow
/go/*     → X-Robots-Tag: noindex, nofollow
```

**Critical `[LOCKED]`:** `X-Frame-Options` **must be `SAMEORIGIN`, not `DENY`.** The admin live
preview embeds `/admin/preview/**` in a same-origin iframe (`ARCHITECTURE.md` §21.4); `DENY` would
break it. CSP `frame-ancestors 'self'` is the real control.

Also at init:

- **CSP ships `Content-Security-Policy-Report-Only` first**, with nonces via middleware, and is
  enforced only once violations are clean. Enforcing a strict CSP blind on day one reliably breaks
  things that only surface in production.
- Auth routes carry `export const runtime = "nodejs"` (Argon2id cannot run on Edge).
- Rate limiting is scaffolded behind an interface; the store (Upstash vs Postgres) stays open and is
  not needed until auth exists.
- Secrets in the platform secret manager only. `.env.example` has names, never values.

---

## 16. SEO baseline

- `src/lib/seo/canonical.ts` — the single `canonicalUrl()` helper, fed by `NEXT_PUBLIC_SITE_URL`.
  **Nothing else in the codebase builds an absolute URL** (`SEO.md` §3.1) `[LOCKED]`.
- `metadataBase` from the same variable; root metadata with title template and defaults.
- `src/app/robots.ts` — production rules per `SEO.md` §14, and
  **`Disallow: /` unconditionally when `VERCEL_ENV !== "production"`** `[LOCKED]`.
- `src/app/sitemap.ts` — index shell, returns empty until entities exist.
- `not-found.tsx` / `error.tsx` returning true status codes; no soft-404s.
- Reserved-segment slug guard (`compare`, `go`, `admin`, `api`, …) in the slug utility
  (`SEO.md` §3.2).
- Metadata and JSON-LD builders exist as **unit-tested pure functions from day one**, before there is
  data to feed them.

---

## 17. Verification commands

Run after initialization, and **report actual output — including failures** (`CLAUDE.md` §10).

```powershell
# toolchain
node -v                         # expect v24.x
pnpm -v                         # expect the pinned version
git --version

# project identity
Get-Content package.json | Select-String '"name"|"packageManager"|"engines"'

# quality gates
pnpm typecheck
pnpm lint
pnpm build
pnpm test                       # no tests yet — must exit cleanly, not error

# hygiene
git status --porcelain          # expect clean after commit
Test-Path package-lock.json     # expect False  (pnpm only)
Test-Path pnpm-lock.yaml        # expect True
Test-Path .env.local            # expect False  (no credentials at init)
```

### Acceptance checklist `[LOCKED]`

- [ ] `node -v` reports **24.x**
- [ ] `pnpm -v` matches `packageManager` exactly
- [ ] **No `package-lock.json`, no `yarn.lock`**; `pnpm-lock.yaml` present and committed
- [ ] `pnpm typecheck` passes with zero errors
- [ ] `pnpm lint` passes
- [ ] `pnpm build` succeeds
- [ ] `.env.example` committed with **names only**; `.env.local` absent
- [ ] `.gitattributes` present with `* text=auto eol=lf`
- [ ] `drizzle/` empty; `schema/index.ts` empty; **no migrations**
- [ ] **No `db:push` script exists**
- [ ] **No business data anywhere in the repository**
- [ ] `X-Frame-Options: SAMEORIGIN` (not `DENY`)
- [ ] Admin route directories are **`[id]`-keyed**, not `[slug]`
- [ ] One commit on `main`, no remote configured
- [ ] Resolved dependency versions reported, with any compatibility conflict stated plainly

---

## 18. Stop conditions `[LOCKED]`

Stop and ask rather than improvising if:

- `create-next-app` refuses the directory, or produces an unexpected structure
- Tailwind v4, Zod, or `drizzle-zod` versions conflict
- `exactOptionalPropertyTypes` produces errors that cannot be fixed without weakening types
- Any step requires a credential that has not been provided
- Any step would create schema, migrations, or business data
- Anything in this document conflicts with `CLAUDE.md` or a locked decision

---

## 19. After initialization

1. Update `docs/SESSION.md` — completed work, new state, next task (`CLAUDE.md` §11).
2. Report every file created, the resolved dependency versions, and every verification result
   **including failures**.
3. **Stop.** Schema authoring (§11 step B) requires separate approval.
