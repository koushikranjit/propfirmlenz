# SEO.md — Prop Firm Lenz Search Architecture

> Organic search is the primary acquisition channel (`PROJECT.md` §2). SEO is therefore an
> **architectural constraint from day one**, not a later optimisation pass.
>
> **Status: design only. Nothing implemented.**

Markers: `[LOCKED]` binding requirement · `[APPROVED]` owner-approved, binding ·
`[PROPOSED]` needs approval · `[OPEN]` undecided.

**Canonical production origin: `https://propfirmlenz.com`** `[APPROVED]` — see §3.1.

---

## 1. Principles `[LOCKED]`

1. **Server-render everything indexable.** If a crawler needs it, the server sends it in the HTML.
2. **One URL per piece of content.** Every indexable page has exactly one canonical address.
3. **Never break a URL.** Slug changes create 301s. Removals return 410 or redirect.
4. **Metadata is data.** It lives in `seo_metadata`, is editable by admins, and falls back to
   deterministic templates — never to hard-coded strings scattered through components.
5. **Structured data describes reality.** JSON-LD only ever reflects data that exists in the database.
6. **No thin pages.** A page that does not clear its content threshold ships `noindex`.
7. **Performance is ranking.** The Core Web Vitals budgets in §13 are acceptance criteria, not goals.
8. **Every rule is enforced by a test.** SEO regressions are silent; only assertions catch them.

---

## 2. Rendering strategy

| Route                                      | Rendering                                                                                    | Why                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `/`                                        | Static + tag revalidation                                                                    | Fastest possible LCP on the highest-traffic page                                    |
| `/prop-firms`                              | Static + ISR; filters as server-rendered search params                                       | Indexable base URL; filtered views are not indexed (§9)                             |
| `/prop-firms/[slug]`                       | Static per firm, revalidated on publish                                                      | The core indexable asset                                                            |
| `/platforms/[slug]`, `/instruments/[slug]` | Static, gated by threshold (§10)                                                             | Programmatic, so thresholds matter                                                  |
| Trust/legal pages                          | Static                                                                                       |                                                                                     |
| `/compare`                                 | **Reserved, not built in Phase 1.** When built: dynamic, `noindex` on parameter combinations | Combinatorial explosion of near-duplicate pages (`ARCHITECTURE.md` §20)             |
| `/go/[slug]`                               | Dynamic, 302, `noindex` + robots-disallowed                                                  | Never an indexable surface `[LOCKED]`                                               |
| `/admin/**`                                | Dynamic, `noindex`, `no-store`                                                               | Includes `/admin/preview/**`, which renders drafts through the real public template |

**Rules `[LOCKED]`:**

- Primary content is **never** loaded by `useEffect` or an in-page fetch.
- No content behind "Load more" that has no crawlable paginated URL.
- No content behind a tab that is client-only — tabbed content is present in the HTML (visually
  toggled), or it lives on its own crawlable URL.
- No infinite scroll without `rel`-linked, crawlable `?page=N` URLs.
- JavaScript is never required to read the page.

---

## 3. URL architecture `[LOCKED]`

### 3.1 Canonical origin `[APPROVED]`

**`https://propfirmlenz.com`** — apex, no `www`, HTTPS only.

| Concern           | Rule                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Canonical host    | `propfirmlenz.com` (apex)                                                                                                     |
| `www`             | `www.propfirmlenz.com` → **301** → apex `[PROPOSED — confirm]`                                                                |
| Protocol          | HTTP → **301** → HTTPS; HSTS with preload                                                                                     |
| Source of truth   | One env var (`NEXT_PUBLIC_SITE_URL`) → the single `canonicalUrl()` helper. **Nothing else builds an absolute URL** `[LOCKED]` |
| Preview / staging | Vercel hostnames — **`noindex` + `Disallow: /`, unconditionally.** Never canonicalised to production `[LOCKED]`               |
| Media CDN         | `cdn.propfirmlenz.com` (Cloudflare R2) `[PROPOSED]`                                                                           |

This unblocks canonicals, the sitemap, OG image URLs, and JSON-LD `@id` values.

### 3.2 Route map

```
/                                        Home / landing
/prop-firms                              Directory
/prop-firms/[firm-slug]                  Firm profile              ← the canonical firm asset
/prop-firms/[firm-slug]/challenges/[s]   Challenge detail          [OPEN] — see §10.3
/platforms/[platform-slug]               Firms supporting platform  [PROPOSED]
/instruments/[instrument-slug]           Firms offering asset class [PROPOSED]
/offers                                  Active offers              [PROPOSED]
/compare?a=[slug]&b=[slug]               RESERVED — architected, not built in Phase 1  [APPROVED]
/compare/[slug-a]-vs-[slug-b]            RESERVED — curated pairs, Phase 4+            [APPROVED]
/about  /methodology  /contact           Trust pages
/disclosure  /privacy  /terms            Legal
/go/[firm-slug]                          Affiliate redirect (noindex, disallowed)
/sitemap.xml  /robots.txt
```

**Reserved segments `[LOCKED]`** — a firm slug may never collide with a route segment. The slug
validator rejects: `compare`, `go`, `admin`, `api`, `prop-firms`, `platforms`, `instruments`,
`offers`, `about`, `methodology`, `contact`, `disclosure`, `privacy`, `terms`, `sitemap`, `robots`.

### 3.3 Conventions

- **Lowercase, hyphenated, no trailing slash.** A single normalisation middleware enforces this and
  301s anything else — uppercase, trailing slash, doubled slashes.
- **No IDs in public URLs.** Slugs only. (Admin routes are id-keyed by design — they are
  authenticated and `noindex`, so this convention does not apply to them: `ARCHITECTURE.md` §22.)
- **No dates in URLs** for firm content — it must not look stale.
- **Shallow hierarchy.** `/prop-firms/[slug]`, not `/prop-firms/forex/uk/[slug]` — deep nesting locks
  the URL to a taxonomy that will change.
- **`www` vs apex** and **HTTP → HTTPS**: one canonical host, enforced by redirect — settled in
  §3.1. `[APPROVED]`

---

## 4. Canonical URLs `[LOCKED]`

- Every indexable page emits a **self-referencing** absolute canonical.
- One helper, `canonicalUrl(path)`, builds every absolute URL from a single configured origin.
  Nothing else concatenates a domain.
- Canonicals are **absolute**, include the protocol and host, and **never** include tracking or
  filter parameters.
- Filtered/sorted directory views canonicalise to the clean base URL (§9).
- `seo_metadata.canonical_url` exists as an **override** for genuine cross-URL duplication only. It is
  not the normal path.
- **A canonical must never point at a URL that redirects, 404s, or is `noindex`.** Tested. `[LOCKED]`
- Pagination: page 2+ self-canonicalises (never to page 1) so its content stays indexable.

---

## 5. Metadata

### 5.1 Resolution order `[LOCKED]`

```
seo_metadata override  →  deterministic template  →  global default
```

Templates are **pure, unit-tested functions**. `[PROPOSED]` shapes:

| Page         | Title template                                     | Description template                  |
| ------------ | -------------------------------------------------- | ------------------------------------- |
| Home         | `{Site name} — {positioning}`                      | Site description                      |
| Directory    | `Prop Firms — Compare {n} Firms \| {Site}`         | Dynamic count from the database       |
| Firm profile | `{Firm name} Review, Rules & Challenges \| {Site}` | Built from the firm's real attributes |
| Platform     | `Prop Firms Supporting {Platform} \| {Site}`       |                                       |

**Rules `[LOCKED]`:**

- Titles ≤ ~60 characters, descriptions ≤ ~155 — enforced by `CHECK` constraints (70/160) and an
  admin-side warning at the display threshold.
- **Every indexable page has a unique title and description.** Duplicates are a test failure.
- Templates interpolate only **real database values**. If a value is missing, the template branches —
  it never emits "undefined", an empty bracket, or a fabricated number. `[LOCKED]`
- Counts in titles ("Compare 47 firms") come from a live query, never a hard-coded figure.
- No meta-keywords tag. `seo_metadata.keywords` is an internal targeting note only.

### 5.2 Required tags per indexable page

`<title>` · `<meta name="description">` · `<link rel="canonical">` · `<meta name="robots">` ·
`<html lang>` · viewport · Open Graph (§6) · Twitter card · JSON-LD (§11).

---

## 6. Open Graph and social

Per page: `og:type`, `og:title`, `og:description`, `og:url` (the canonical), `og:site_name`,
`og:image`, `og:image:width/height`, `og:image:alt`, `og:locale`.
Twitter: `summary_large_image`, plus title/description/image.

**Image strategy `[PROPOSED]`:**

1. `seo_metadata.og_image_media_id` if set (admin override).
2. Otherwise a **dynamically generated** OG image (`ImageResponse`) using the Prop Firm Lenz design
   tokens — firm name, logo, and a real headline data point.
3. Otherwise the site default OG image.

**Constraints `[LOCKED]`:** 1200×630; `og:image:alt` always present; the generated image uses the
**official logo only** (`DESIGN.md` §3) and never a redrawn mark; it never renders a fabricated
rating or statistic; `og:url` always equals the canonical.

---

## 7. Redirects and URL stability `[LOCKED]`

### Rules

| Situation                                     | Response                                                         |
| --------------------------------------------- | ---------------------------------------------------------------- |
| Firm slug changed                             | **301** old → new, created automatically in the same transaction |
| Firm archived/unpublished, replacement exists | **301** to the replacement                                       |
| Firm permanently removed, no replacement      | **410 Gone**                                                     |
| Firm never existed                            | **404**                                                          |
| URL casing / trailing slash / double slash    | **301** to the normalised form                                   |
| Affiliate outbound                            | **302** — destinations change (`ARCHITECTURE.md` §11)            |

### Mechanics

- Redirects resolve from the `redirects` table in middleware, on a normalised path key.
- **Chains are flattened** — if A→B and B→C are created, A is rewritten to point at C.
- **Loops are rejected** at write time by a service-layer traversal, not just the `from ≠ to` check.
- A slug may not be claimed by a new entity while an active redirect owns it (`DATABASE.md` §3.3).
- `hit_count` and `last_hit_at` let admins retire dead redirects with evidence.
- Redirects are permanent infrastructure. **Never bulk-delete them to "clean up".** `[LOCKED]`

---

## 8. 404, 410, and error handling `[LOCKED]`

- A missing page returns a real **404 status** with a helpful page: search, popular firms, directory
  link. **Never a soft-404** (HTTP 200 with "not found" text).
- Deliberately removed content returns **410**, which de-indexes far faster than a 404.
- Error pages are `noindex`.
- 5xx pages never return 200, and never expose internals.
- A drafted or unpublished firm returns **404** to the public — not a preview, not a stub. Draft
  preview is an authenticated admin route only (`ADMIN.md` §7).
- **A published firm with pending draft changes continues to serve its published version**, with
  unchanged metadata, canonical, and JSON-LD. Editing a draft has **no** effect on any public
  response, on the sitemap, or on cache tags — revalidation happens only at publish
  (`DATABASE.md` §3.2.1). `[LOCKED]`
- **`/admin/preview/**` — the live draft preview** (`ADMIN.md` §7A, `ARCHITECTURE.md` §21):
  `X-Robots-Tag: noindex, nofollow` as an **HTTP header** (so it is honoured even when the page is
  rendered inside an iframe), `Cache-Control: no-store`, robots-disallowed, **never in the sitemap**,
  and **never a public canonical**. Anonymous access returns **404**, not 403 — the existence of an
  unpublished firm is itself non-public. `[LOCKED]`
- **The preview emits no head metadata at all** — no `<link rel="canonical">`, no Open Graph tags,
  no JSON-LD. Component reuse governs the rendered _body_; head generation is deliberately
  suppressed, so no draft data can appear in machine-readable markup and no preview URL can be
  mistaken for a public page. Admins inspect what _will_ be emitted on publish in the SEO tab's
  dedicated panel (§15). `[LOCKED]`

---

## 9. Index / noindex policy `[LOCKED]`

| Surface                                           | Directive                                                                                                                         |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Home, directory, firm profiles, trust/legal pages | `index, follow`                                                                                                                   |
| Programmatic pages meeting thresholds (§10)       | `index, follow`                                                                                                                   |
| Programmatic pages below thresholds               | `noindex, follow`                                                                                                                 |
| Filtered/sorted/paginated parameter views         | `noindex, follow` + canonical to base                                                                                             |
| `/compare` with parameters                        | `noindex, follow`                                                                                                                 |
| `/go/*`                                           | `noindex, nofollow` + robots `Disallow` + `X-Robots-Tag`                                                                          |
| `/admin/*`                                        | `noindex, nofollow` + robots `Disallow`                                                                                           |
| `/admin/preview/*` (draft preview)                | `noindex, nofollow` via **HTTP header** + `Disallow` + `no-store`; **no canonical, no OG, no JSON-LD**; 404 to anonymous requests |
| Search results, empty states, error pages         | `noindex, follow`                                                                                                                 |
| Preview and staging deployments                   | **`noindex` always, site-wide, no exceptions**                                                                                    |

**Parameter policy:** an allowlist of parameters that may render; everything else is ignored and
canonicalised away. Tracking parameters (`utm_*`, `gclid`, `fbclid`) never alter rendering and never
appear in a canonical.

**Admin control:** `seo_metadata.robots_index` / `robots_follow` / `include_in_sitemap` let an admin
override per entity. The admin UI must warn clearly before `noindex`-ing a page that currently
receives traffic. `[PROPOSED]`

---

## 10. Programmatic SEO strategy

Programmatic pages are the growth engine **and** the biggest quality risk. The discipline below is
what separates the two.

### 10.1 Page families `[PROPOSED]`

| Family                   | Route                                | Generated from                          |
| ------------------------ | ------------------------------------ | --------------------------------------- |
| Platform                 | `/platforms/[slug]`                  | `firm_platforms`                        |
| Instrument / asset class | `/instruments/[slug]`                | `firm_instruments`                      |
| Category / "best for"    | `/best/[category]`                   | Curated, rule-driven queries            |
| Comparison               | `/compare/[a]-vs-[b]`                | Firm pairs — **strictly gated** (§10.3) |
| Country availability     | `/prop-firms/available-in/[country]` | Restriction data                        |

### 10.2 Publication gate `[LOCKED]`

A programmatic page is indexable **only if all** of the following hold. Otherwise it renders
`noindex, follow` (and remains useful to users):

1. **≥ 5 published firms** qualify for it (below that, it is a list, not a page).
2. **≥ 250 words of unique, admin-written** introduction — not a template with a swapped noun.
3. The structured data on the page is **materially different** from every sibling page.
4. It has a **unique title and meta description**.
5. It carries at least **3 internal links in** from relevant pages.
6. Its data is fresh — no entity on it is past the staleness threshold.

The gate is evaluated at build/publish time and its result is stored, so the admin can see exactly
why a page is not indexed.

### 10.3 Avoiding thin content `[LOCKED]`

- **Never auto-generate prose.** Templated sentences with substituted firm names are the definition
  of thin content, and they violate `CLAUDE.md` §3 the moment a value is missing.
- **Never create a page per (firm × platform × size) combination.** The combinatorics produce
  thousands of near-duplicates and can trigger site-wide quality demotion.
- **Comparison pages** (`/compare/[a]-vs-[b]`) are **deferred `[APPROVED]`**: N firms produce N²/2
  pages. The URL shape is reserved now (§3.2) and the data relationships are architected
  (`ARCHITECTURE.md` §20), but **no comparison page or feature is built in Phase 1.** When it does
  ship, it ships only for a curated allowlist of genuinely-searched pairs, each with unique editorial
  content, and only after the core pages rank.
- **Challenge detail pages** are `[OPEN]` for the same reason: a challenge has little unique content
  beyond a row of numbers. **Recommendation:** render challenges as anchored sections on the firm
  profile in Phase 1; promote to standalone URLs only if search demand proves it.
- If a page has nothing unique to say, **do not create the page**.

### 10.4 Quality monitoring

Track indexed-page count against published-page count. A widening gap means Google is judging pages
thin — the response is to consolidate, not to publish more.

---

## 11. Structured data (JSON-LD) `[LOCKED]`

All JSON-LD is server-rendered, built by typed builders, and validated in tests.

| Schema                      | Where                     | Notes                                                                                              |
| --------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| `Organization`              | Site-wide                 | Prop Firm Lenz itself: name, official logo, sameAs                                                 |
| `WebSite` + `SearchAction`  | Home                      | Only if on-site search exists                                                                      |
| `BreadcrumbList`            | Every page below the root | Mirrors the visible breadcrumb exactly                                                             |
| `ItemList`                  | Directory, category pages | Ordered firm list                                                                                  |
| `FAQPage`                   | Pages with genuine FAQs   | Only visible, real Q&A                                                                             |
| `Product` / `Offer`         | Challenge data            | `[OPEN]` — a challenge is arguably a service, not a product. Mismatched types risk a manual action |
| `AggregateRating`, `Review` | **Phase 3 only**          | See below                                                                                          |

### Hard rules `[LOCKED]`

1. **Never emit `AggregateRating` or `Review` markup before Phase 3**, and then only from genuine,
   published, moderated reviews with real counts.
2. Structured data must **match the visible page content**. Marking up data the user cannot see is a
   spam signal.
3. Never mark up a price, rating, or count that is `NULL` in the database. Omit the property.
4. `structured_data_override` (jsonb) is validated against the schema shape before render — an
   admin-supplied blob is never emitted raw.
5. Breadcrumb JSON-LD and the visible breadcrumb are generated from **one** source, so they cannot
   drift.

---

## 12. Internal linking `[LOCKED]`

Internal links are the primary ranking lever available without external outreach.

**Architecture:**

- Every firm profile links to: its platforms, its instruments, the directory, related firms, and
  every definition term it uses (drawdown type, challenge type).
- Every category/platform page links to each qualifying firm.
- The directory links to every published firm — **crawlable, paginated** (`?page=N` with real links),
  never infinite-scroll-only.
- **Definition links**: the first use of a normalised term on a page links to its glossary entry.
  This is both a UX feature and a topical-authority signal.
- Breadcrumbs on every page below the root, visible and marked up.
- **No orphan pages.** Every indexable URL is reachable from at least one other indexable page. A
  build-time check enforces this. `[PROPOSED]`

**Anchor text:** descriptive and varied. Never "click here". Never keyword-stuffed.

**Outbound:** affiliate links are `rel="sponsored nofollow noopener"` through `/go/`. Editorial
citations to firm terms pages are `rel="nofollow"` where they are commercial, plain otherwise.
`[LOCKED]`

---

## 13. Image optimisation and Core Web Vitals

### Images `[LOCKED]`

- Modern formats (AVIF/WebP) with fallbacks, served from a CDN.
- **Explicit `width`/`height` or aspect-ratio on every image** — `media` stores dimensions precisely
  so this is always possible (`DATABASE.md` §5.8). This is the single largest CLS defence.
- Responsive `srcset`/`sizes`; never ship a 2000px logo into a 40px slot.
- Lazy-load below the fold; **eagerly load the LCP image** with `fetchpriority="high"`.
- Blur/LQIP placeholder from `media.blur_placeholder`.
- Meaningful `alt` on every image (required at upload); `alt=""` for decorative.
- Firm logos are displayed as uploaded — never restyled or recoloured (`CLAUDE.md` §12.2).

### Core Web Vitals budgets `[LOCKED]`

| Metric                      | Target (mobile, field p75)    |
| --------------------------- | ----------------------------- |
| **LCP**                     | ≤ 2.5 s                       |
| **INP**                     | ≤ 200 ms                      |
| **CLS**                     | ≤ 0.1                         |
| TTFB                        | ≤ 600 ms                      |
| JS shipped to a public page | ≤ 150 KB gzipped `[PROPOSED]` |

**Practices:** Server Components by default; `next/font` with `font-display: swap` and preloaded
subsets (no layout shift, no FOUT jump); no render-blocking third-party scripts; reserved space for
every dynamic region (banners, badges, tables); no animation that moves layout
(`DESIGN.md` §9 — transform/opacity only); Lighthouse CI with hard budgets in the pipeline.

**Table-heavy pages** (directory, comparison) are the CLS and INP risk. Column widths are fixed or
percentage-based from the first paint, never measured-then-applied.

---

## 14. Sitemap and robots

### `sitemap.xml` `[LOCKED]`

A **sitemap index**, generated from the database, split by entity type:

```
/sitemap.xml                 → index
  /sitemaps/static.xml
  /sitemaps/firms.xml
  /sitemaps/platforms.xml
  /sitemaps/instruments.xml
```

- `lastmod` from the entity's real `updated_at`. **Never `now()`** — a sitemap that claims everything
  changed today is ignored.
- **Excluded:** drafts, archived entities, soft-deleted rows, anything with
  `robots_index = false` or `include_in_sitemap = false`, `/go/*`, `/admin/*`, parameterised URLs.
- ≤ 50,000 URLs and ≤ 50 MB per file (split before that in practice).
- Regenerated on publish via the `sitemap` cache tag.
- **A URL in the sitemap must return 200 and be self-canonical.** Tested. `[LOCKED]`

### `robots.txt` `[PROPOSED]`

```
User-agent: *
Allow: /
Disallow: /admin
Disallow: /api
Disallow: /go/
Disallow: /*?*sort=
Disallow: /*?*filter=

Sitemap: https://propfirmlenz.com/sitemap.xml
```

**Preview and staging environments serve `Disallow: /` unconditionally.** `[LOCKED]`

Note the distinction: `Disallow` prevents _crawling_, not _indexing_. Anything that must not be
indexed also carries a `noindex` header or tag — and a page cannot be both `Disallow`ed and
`noindex`-honoured, since a blocked page's `noindex` is never read. `/go/*` therefore uses an
`X-Robots-Tag` HTTP header, which is visible even to a crawler that fetches the URL.

---

## 15. SEO admin controls

Per-entity, in the firm workspace SEO tab (`ADMIN.md` §6):

- Title, meta description — with live length indicators and a SERP preview.
- Canonical override (with a warning that this is rarely correct).
- OG image selection or upload; live social preview.
- `robots_index` / `robots_follow` / `include_in_sitemap` toggles.
- Slug editing — **with an explicit warning and automatic 301 creation**.
- Structured-data preview showing exactly what JSON-LD will be emitted.
- **SEO readiness check** blocking publish on: missing title, missing description, duplicate title,
  slug collision, missing alt text on the logo, canonical pointing at a non-200 URL. `[PROPOSED]`

Site-wide, under an `seo:manage` permission:

- Redirect manager: list, create, edit, deactivate; hit counts; loop and chain detection.
- Global defaults: title suffix, default OG image, organisation JSON-LD.
- `robots.txt` additions (with a preview and a hard guard against `Disallow: /` in production).
- Sitemap inspection: URL count per section, last generation time, exclusion reasons.

---

## 16. Future SEO analytics `[OPEN — later phase]`

Documented for architectural readiness; **not implemented**.

- **Google Search Console API** ingestion → store impressions, clicks, CTR, and average position per
  URL per day, joined to the entity so the admin can see performance inside the firm workspace.
- **Rank tracking** per target keyword `[OPEN]` — third-party API or manual.
- **Index coverage monitoring** — alert when indexed-page count diverges from published-page count.
- **Content decay detection** — flag pages whose clicks fall over a rolling window, feeding the
  re-verification queue.
- **Internal link graph analysis** — surface orphan and under-linked pages.
- **CWV field data** per URL from the CrUX API or a `web-vitals` beacon.

Schema readiness: a future `seo_page_metrics` table keyed `(url_path, date)` with a nullable
`entity_type`/`entity_id`, so metrics attach to entities without coupling to the ingestion source.

---

## 17. Launch checklist `[LOCKED]`

Before the first production deploy:

- [ ] Canonical origin `https://propfirmlenz.com` live; `www`→apex and HTTP→HTTPS redirects verified
- [ ] `robots.txt` correct in production; `Disallow: /` verified on preview/staging
- [ ] `sitemap.xml` generates, contains only 200-status self-canonical URLs
- [ ] Every indexable page: unique title, unique description, self-referencing canonical
- [ ] Breadcrumbs visible and marked up, matching each other
- [ ] JSON-LD validates; **no rating or review markup present**
- [ ] 404 returns 404; 410 works; no soft-404 anywhere
- [ ] Slug change produces a working 301 (tested end to end)
- [ ] `/go/*` is `noindex`, disallowed, absent from the sitemap
- [ ] Draft firms are invisible publicly and absent from the sitemap
- [ ] CWV budgets met on home, directory, and firm profile
- [ ] All images have dimensions and alt text
- [ ] Search Console and analytics verified
- [ ] Automated SEO assertions passing in CI
