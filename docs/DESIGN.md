# DESIGN.md — Prop Firm Lenz Design System

> Minimal, premium, financial. A dark instrument panel for people making a real financial decision.
>
> **Status: design specification only. No components built.**

Markers: `[LOCKED]` owner requirement · `[APPROVED]` owner-approved, binding ·
`[PROPOSED]` needs approval · `[OPEN]` undecided.

---

## 1. Design principles `[LOCKED]`

1. **Data is the design.** The interface's job is to make numbers comparable and rules legible.
   Decoration that competes with data is removed.
2. **Premium through restraint.** Precision, spacing, and typography — not effects. If a screen looks
   expensive because of its glow, it is wrong.
3. **Calm.** This is a financial decision tool. No urgency theatre, no pulsing badges, no countdown
   pressure (`PROJECT.md` §7.6).
4. **Mobile-first.** The phone layout is designed first and is a first-class experience.
5. **Honest states.** "Not disclosed" is designed, styled, and dignified — not an em dash the user
   has to interpret.
6. **Accessible by construction.** Contrast, focus, and keyboard operation are constraints, not a
   later audit.
7. **Original.** Prop Firm Lenz looks like itself. No competitor's visual identity is reproduced
   (§12).

---

## 2. Colour system

### 2.1 Brand colours `[LOCKED]`

| Token            | Hex       | Role                                                            |
| ---------------- | --------- | --------------------------------------------------------------- |
| `--brand-cyan`   | `#19E6D2` | Primary accent — links, focus, active states, positive emphasis |
| `--brand-blue`   | `#268BFF` | Secondary accent — informational emphasis, secondary actions    |
| `--brand-indigo` | `#4F46E5` | Gradient mid-tone, surface accents                              |
| `--brand-violet` | `#6D3DF5` | Gradient terminus, surface accents                              |

### 2.2 Gradient `[LOCKED]`

```css
--gradient-brand: linear-gradient(
  135deg,
  #19e6d2 0%,
  /* cyan   */ #268bff 38%,
  /* blue   */ #4f46e5 72%,
  /* indigo */ #6d3df5 100% /* violet */
);
```

Cyan → blue → indigo → violet. The order is fixed. The angle may vary; the sequence may not.

**Where the gradient is permitted `[LOCKED]`:**

- The official logo (which already carries it).
- **One** primary CTA per view.
- Thin accent rules — a 1–2px top border on a hero card, a section divider.
- Data visualisation that genuinely spans a range.
- Generated OG images.

**Where it is prohibited `[LOCKED]`:**

- Page or section backgrounds as a large wash.
- Card backgrounds.
- Body text (gradient text is an accessibility and rendering hazard — the one exception is the
  official wordmark, which is a fixed asset).
- More than one prominent gradient element in a single viewport.
- Table rows, badges, or any repeated element.

### 2.3 Surfaces and text `[LOCKED]`

**Official Prop Firm Lenz tokens, locked 2026-09-03.** Every value below is the owner-supplied
official palette. Contrast for every pairing is measured in §2.5 — usage constraints there are
binding, and any future adjustment must preserve them.

**Surfaces:**

| Token              | Hex       | Use                                                    |
| ------------------ | --------- | ------------------------------------------------------ |
| `--bg-base`        | `#050609` | **Main page background** — the darkest ground          |
| `--bg-near-black`  | `#080A10` | Secondary sections, wells, inputs                      |
| `--bg-card`        | `#0D1017` | Cards, panels — the default content surface            |
| `--bg-elevated`    | `#15122A` | Elevated cards, nested surfaces, hover — purple-tinted |
| `--bg-purple-deep` | `#180D35` | Dark purple feature surfaces                           |
| `--bg-violet-deep` | `#3B1B75` | Deep violet — hero/accent surfaces only                |

**Text:**

| Token              | Hex       | Use                                                       |
| ------------------ | --------- | --------------------------------------------------------- |
| `--text-primary`   | `#FFFFFF` | Headings, key values, data                                |
| `--text-secondary` | `#D9DCE5` | Body, labels, descriptions                                |
| `--text-muted`     | `#9298A8` | Supporting text, captions                                 |
| `--text-metadata`  | `#737A89` | Timestamps, counts, meta — **usage-restricted, see §2.5** |

**Borders `[PROPOSED]`** — not supplied by the owner; required because the official surfaces are
nearly identical in luminance (§2.5) and cannot be distinguished without them:

| Token              | Hex       | Use                     |
| ------------------ | --------- | ----------------------- |
| `--border-subtle`  | `#1B1F2A` | Hairlines between rows  |
| `--border-default` | `#252A38` | Card and input borders  |
| `--border-strong`  | `#394054` | Focused/hovered borders |

### 2.4 Semantic colours `[PROPOSED]`

| Token       | Hex       | Use                                                                                                                               |
| ----------- | --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `--success` | `#22C55E` | Verified, available, positive                                                                                                     |
| `--warning` | `#F59E0B` | Stale data, expiring offers                                                                                                       |
| `--danger`  | `#EF4444` | Prohibited, expired, destructive                                                                                                  |
| `--info`    | `#268BFF` | Neutral information (reuses brand blue)                                                                                           |
| `--unknown` | `#9298A8` | **"Not disclosed"** — a defined state, styled deliberately. Uses `--text-muted`, which clears AA on every official surface (§2.5) |

Semantic colours never appear as large fills. They are used at 10–15% opacity for badge backgrounds
with the full-strength colour for text and iconography.

### 2.5 Contrast — measured, not assumed `[LOCKED]`

Every pairing below was **computed** (WCAG 2.x relative luminance), not estimated. Ratios are exact
to two decimals. **These measurements constrain usage; they are not advisory.**

#### On `--bg-base` `#050609` (main background)

| Foreground          | Ratio       | Verdict                          |
| ------------------- | ----------- | -------------------------------- |
| `#FFFFFF` primary   | **20.26:1** | AAA — all text                   |
| `#D9DCE5` secondary | **14.78:1** | AAA — all text                   |
| `#9298A8` muted     | **7.02:1**  | AAA — all text                   |
| `#737A89` metadata  | **4.70:1**  | AA normal text ✅                |
| `#19E6D2` cyan      | **12.82:1** | AAA — links, icons, small text   |
| `#268BFF` blue      | **6.00:1**  | AA normal text                   |
| `#4F46E5` indigo    | **3.22:1**  | ❌ large text / non-text UI only |
| `#6D3DF5` violet    | **3.51:1**  | ❌ large text / non-text UI only |

#### On `--bg-card` `#0D1017` and `--bg-elevated` `#15122A`

| Foreground          | on `#0D1017` | on `#15122A` | Verdict                          |
| ------------------- | ------------ | ------------ | -------------------------------- |
| `#FFFFFF` primary   | 19.03:1      | 18.23:1      | AAA                              |
| `#D9DCE5` secondary | 13.88:1      | 13.30:1      | AAA                              |
| `#9298A8` muted     | 6.60:1       | 6.32:1       | AA normal text                   |
| `#737A89` metadata  | **4.42:1**   | **4.23:1**   | ❌ **FAILS AA for normal text**  |
| `#19E6D2` cyan      | 12.04:1      | 11.54:1      | AAA                              |
| `#268BFF` blue      | 5.64:1       | 5.40:1       | AA normal text                   |
| `#4F46E5` indigo    | 3.03:1       | **2.90:1**   | ❌ fails even 3:1 on elevated    |
| `#6D3DF5` violet    | 3.29:1       | 3.16:1       | ❌ large text / non-text UI only |

#### On purple surfaces `#180D35` and `#3B1B75`

| Foreground          | on `#180D35` | on `#3B1B75` | Verdict                                |
| ------------------- | ------------ | ------------ | -------------------------------------- |
| `#FFFFFF` primary   | 18.30:1      | 13.13:1      | AAA                                    |
| `#D9DCE5` secondary | 13.35:1      | 9.58:1       | AAA                                    |
| `#9298A8` muted     | 6.34:1       | 4.55:1       | AA normal text                         |
| `#737A89` metadata  | **4.25:1**   | **3.05:1**   | ❌ **FAILS AA for normal text**        |
| `#19E6D2` cyan      | 11.58:1      | 8.31:1       | AAA                                    |
| `#268BFF` blue      | 5.42:1       | **3.89:1**   | ❌ large only on deep violet           |
| `#4F46E5` indigo    | **2.91:1**   | **2.09:1**   | ❌ **fails everything**                |
| `#6D3DF5` violet    | 3.17:1       | **2.27:1**   | ❌ **fails everything on deep violet** |

#### Findings that constrain usage `[LOCKED]`

**1. `--text-metadata` `#737A89` is background-dependent.** It passes AA **only on `--bg-base`**
(4.70:1). On cards it is **4.42:1**, on elevated **4.23:1**, on deep violet **3.05:1** — all below
the 4.5:1 threshold. Therefore:

> **`#737A89` may be used for normal-size text only on `--bg-base`.** On any card or purple surface
> it is permitted only at **large text sizes** (≥24px, or ≥18.66px bold) or for non-text UI.
> **For metadata on a card, use `--text-muted` `#9298A8`** (6.60:1) instead. `[LOCKED]`

This is a real constraint, not a theoretical one — metadata on a card is one of the most common
patterns in the product (timestamps in the Prop List, "last verified" on a firm card).

**2. Indigo `#4F46E5` degrades to unusable on purple surfaces.** It is 3.22:1 on `--bg-base`, but
**2.90:1 on `#15122A`**, **2.91:1 on `#180D35`**, and **2.09:1 on `#3B1B75`** — below even the 3:1
non-text threshold. **Indigo must not carry meaning on any purple surface**, not as text, not as an
icon, not as a border that conveys state. It survives only inside the gradient.

**3. Violet `#6D3DF5` on `#3B1B75` is 2.27:1** — effectively invisible. **The brand violet must never
be placed on the deep-violet surface.**

**4. Blue `#268BFF` drops to 3.89:1 on `#3B1B75`** — large text and UI only there, though it is fine
(≥5.4:1) on every other surface.

**5. The surfaces are not distinguishable from each other by luminance.** Measured adjacent
separation: `#080A10`/`#050609` = **1.02:1**, `#0D1017`/`#050609` = 1.06:1, `#15122A`/`#050609` =
1.11:1, and **`#180D35`/`#15122A` = 1.00:1 — identical luminance.** Consequently:

> **Surface hierarchy must be carried by borders, never by background alone.** `[LOCKED]`
> Every card, panel, and elevated surface takes an explicit `--border-*` token. This is why the
> border tokens in §2.3 exist; without them, `#180D35` on `#15122A` is literally invisible.

#### Rules `[LOCKED]`

1. **Indigo and violet are never used for body text, labels, table values, or small icons.** They are
   **surface, gradient, and accent** colours only. On purple surfaces they fail even the 3:1 non-text
   threshold (finding 2) and must not encode state there at all. This remains the single most
   important colour rule in the system.
2. **Cyan is the accent for anything that must be read** — links, focus rings, active states. It is
   ≥8.3:1 on every official surface, the only brand colour that is.
3. **`--text-metadata` is `--bg-base` only** at normal size (finding 1).
4. **Purple surfaces are surfaces.** Text on them is white, secondary, muted, or cyan — never indigo,
   never violet, never metadata-grey at normal size.
5. Never encode meaning in colour alone. Every status badge carries text or an icon
   (`ADMIN.md` §17).
6. **Any new colour pairing is measured before use**, with the ratio recorded here.

### 2.6 Theme `[PROPOSED]`

Dark is the product's identity and the only theme in Phase 1. Tokens are defined as CSS custom
properties on `:root` so a future light theme is a token swap rather than a rewrite. Set
`color-scheme: dark` so form controls and scrollbars match. **A light theme is `[OPEN]` and out of
scope.**

---

## 3. The official logo `[LOCKED]`

**The attached official Prop Firm Lenz logo is the only approved logo.** It is the authoritative
reference for the mark, the wordmark, the proportions, and the treatment.

### 3.1 What the logo is

- **The mark** is a stylised letter **P** constructed from four rounded aperture blades arranged
  around a central **camera lens / iris**. The lens has a dark glass dome with a single specular
  highlight at the upper left. The negative-space keylines separating the blades read as a camera
  shutter — the "lens" idea is carried by the form itself, not by a literal icon stuck beside a word.
- **The gradient** runs from cyan at the upper-left, through blue, to indigo/violet at the
  lower-right — the approved brand sequence (§2.2), on the mark and on the wordmark alike.
- **The wordmark** is "Prop Firm Lenz" in a geometric sans with a large x-height and generous
  counters, medium-to-semibold weight, tight-but-not-cramped tracking. It is **two-tone**:
  _Prop Firm_ in white, _**Lenz**_ in the cyan→violet gradient. The gradient falls on the word that
  carries the brand's meaning.
- **Two lockups exist**, both supplied as PNG by the owner:

  | Asset             | File                      | Use                                                          |
  | ----------------- | ------------------------- | ------------------------------------------------------------ |
  | Horizontal lockup | `Prop Firm Lenz logo.png` | Public header, admin sidebar (expanded), footer, OG images   |
  | Standalone mark   | `Prop Firm Lenz Icon.png` | Favicon, app icons, collapsed admin sidebar, square contexts |

  Source location at time of writing: `C:\Users\koush\Downloads\PFL logo`. On initialization they are
  copied into `public/brand/` **unmodified** (`INITIALIZATION.md` §6).

- The mark's black keylines and lens are integral. **The logo is designed for dark backgrounds** and
  depends on a near-black ground to read correctly — which is exactly the product's palette.

### 3.2 Usage rules `[LOCKED]`

1. **Do not recreate, redraw, restyle, recolour, or substitute the logo.** Ever. Not "close enough",
   not "as a placeholder", not as an inline SVG rebuilt from description. Use the supplied asset.
2. **Do not generate an alternative mark or wordmark**, or an icon "in the style of" the logo.
3. **Horizontal lockup** in the public header, the admin sidebar (expanded), the footer, and OG
   images. **Standalone mark** for the favicon, app icons, the collapsed admin sidebar, and any
   square context.
4. **Clear space:** minimum on all sides equal to the height of the lens element in the mark.
   Nothing intrudes.
5. **Minimum size `[PROPOSED]`:** mark 24px; horizontal lockup 120px wide — below that the lens
   detail and the wordmark's two-tone split stop resolving.
6. **Background:** near-black or the darkest surface tokens. Never on a light background, a
   photograph, a gradient wash, or a firm's brand colour.
7. **Never:** rotate, skew, stretch, add a drop shadow or outer glow, apply a border, place inside a
   shape that is not part of the asset, animate the mark's construction, or use the mark as a
   decorative background watermark.
8. **Never** combine the Prop Firm Lenz logo with a prop firm's logo in a way that implies
   endorsement or partnership.
9. The logo is the **one** place the gradient appears without restriction; it does not license
   gradient use elsewhere.

### 3.3 Brand assets

**Supplied and approved 2026-09-03** `[LOCKED]`:

- [x] **Horizontal lockup** — `Prop Firm Lenz logo.png` (1774×887, PNG, ~514 KB)
- [x] **Standalone mark** — `Prop Firm Lenz Icon.png` (1254×1254, PNG, ~620 KB)

**Delivery sizes — generated 2026-09-05, SCALE ONLY** `[LOCKED]`:

The masters are the source of truth and are never edited. The files below are the **same artwork at
fewer pixels** — no crop, no recolour, no redraw, no added padding, nothing §3.2 rule 1 forbids.
They exist because a 620 KB PNG is not a favicon and a 514 KB PNG is not a header logo: the master
was being served whole to render a 200px-wide mark, in the header, where LCP is measured.

| File                 | Size     | Used by                                                     |
| -------------------- | -------- | ----------------------------------------------------------- |
| `logo-576.png`       | 576×288  | Public header and footer, admin sidebar and drawer, sign-in |
| `icon-32.png`        | 32×32    | Browser tab                                                 |
| `icon-192.png`       | 192×192  | Browser tab (high-DPI), admin mobile top bar                |
| `icon-512.png`       | 512×512  | Install / home-screen icon                                  |
| `apple-icon-180.png` | 180×180  | iOS home screen                                             |
| `og-cover.png`       | 1200×600 | Open Graph and Twitter card, on every page                  |

Paths are declared once in `src/lib/seo/site.ts` (`BRAND`, `OG_IMAGE`), so no surface can drift onto
a different file. Regenerating them means rescaling the master — never redrawing.

**Sizing note.** The lockup carries a wide black margin: the visible mark is roughly two-thirds of
the image box. A "standard" 32px logo therefore renders a ~19px wordmark. The header uses
`h-11 sm:h-14`, the footer `h-14 sm:h-16`, the admin sidebar `h-12`, and sign-in `h-20`.

Still outstanding `[OPEN — deferred by the owner]`, **not blocking**:

- [ ] **SVG masters** — horizontal lockup and standalone mark (vector, so the mark stays crisp at
      every size). _Interim: the PNGs above. The header mark is raster, so it will not be
      pixel-perfect at every DPI until vectors exist._
- [ ] A **maskable** PWA icon. The current icon has no safe-zone padding, so an Android launcher
      may crop the aperture blades. That needs the master re-exported with padding by the owner —
      padding must not be invented here.
- [ ] A confirmed **wordmark typeface** — the letterforms read as a geometric sans (Poppins/Geist
      family of shapes), but the actual face must be confirmed rather than guessed, since the UI
      typeface should either match or deliberately contrast (§4.1)
- [ ] Confirmation of whether a **monochrome/white** version exists for constrained contexts

Assets live in `/public/brand/` once the project is initialised, and are **never edited in place**.

---

## 4. Typography

### 4.1 Typefaces `[APPROVED]`

**Decision: Inter is the UI typeface — unless the official logo wordmark requires a different face.**

| Role                   | Typeface                                                       | Rationale                                                                                        |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **UI / body**          | **Inter** (variable), self-hosted via `next/font` `[APPROVED]` | Exceptional legibility at small sizes; true tabular figures; the standard for dense financial UI |
| **Numerals in tables** | Inter with `font-variant-numeric: tabular-nums`                | **Mandatory** — columns of prices and percentages must align on the decimal `[LOCKED]`           |
| **Display / headings** | Inter, tightened tracking                                      | Follows from the Inter decision; revisit only if §3.3 resolves against it                        |
| **Mono**               | JetBrains Mono / `ui-monospace` `[PROPOSED]`                   | Codes, IDs, technical values                                                                     |

**The one condition `[APPROVED]`:** if confirming the logo wordmark (§3.3) shows it uses a
distinctly different face — the letterforms read as a geometric sans in the Poppins/Geist family, not
Inter — then the **display/heading** face is reconsidered so the header does not sit a near-miss
typeface beside the logo. **Inter remains the body and UI face regardless**, because its legibility
at 13–15px in dense tables is the property this product needs and a geometric display sans is not.

Practically: a near-match is worse than a deliberate contrast. If the wordmark is not Inter, pair
Inter with the wordmark's actual face for display sizes only, or let the logo stand alone as the sole
appearance of that face.

Self-hosted via `next/font` with `display: swap` and preloaded subsets — no external font request,
no layout shift (`SEO.md` §13).

### 4.2 Scale `[PROPOSED]`

Fluid, mobile-first. `--text-*` tokens, `clamp()` between the mobile and desktop bounds.

| Token     | Mobile → Desktop | Weight | Line height | Use                                            |
| --------- | ---------------- | ------ | ----------- | ---------------------------------------------- |
| `display` | 36 → 56px        | 600    | 1.05        | Landing hero only                              |
| `h1`      | 28 → 40px        | 600    | 1.15        | Page title                                     |
| `h2`      | 22 → 30px        | 600    | 1.25        | Section                                        |
| `h3`      | 18 → 22px        | 600    | 1.35        | Card / subsection                              |
| `body-lg` | 16 → 18px        | 400    | 1.6         | Lead paragraphs                                |
| `body`    | 15 → 16px        | 400    | 1.6         | Default                                        |
| `body-sm` | 14px             | 400    | 1.55        | Table cells, secondary                         |
| `caption` | 12 → 13px        | 500    | 1.4         | Meta, timestamps                               |
| `label`   | 12px             | 600    | 1.3         | Uppercase, `0.06em` tracking                   |
| `data`    | 15 → 16px        | 600    | 1.2         | **Tabular numerals** — the numbers that matter |

**Rules `[LOCKED]`:** minimum body size 14px (12px only for true meta); measure 60–75 characters for
prose; headings never justified; never rely on tracking below `-0.02em` at body sizes.

---

## 5. Spacing, radii, elevation

**Spacing `[PROPOSED]`** — 4px base: `0.5→2px, 1→4, 2→8, 3→12, 4→16, 5→20, 6→24, 8→32, 10→40, 12→48,
16→64, 20→80, 24→96`. Section rhythm: 64px mobile → 96–120px desktop. Card padding: 16px mobile →
24px desktop. **Nothing off-scale.** `[LOCKED]`

**Radii `[PROPOSED]`:** `sm 6px` (badges, inputs) · `md 10px` (buttons, small cards) ·
`lg 14px` (cards, panels) · `xl 20px` (hero, modals) · `full 9999px` (pills, avatars).
One radius family throughout — mixing radii is the fastest way to look unconsidered.

**Elevation `[LOCKED]`** — on near-black, **shadows barely read; borders and background steps do the
work.** Elevation is expressed as: `bg-base → bg-elevated + border-default` → `bg-elevated-2 +
border-strong`. Shadows are used only on genuinely floating layers (dropdowns, modals, popovers), and
are deep and soft rather than dark and tight.

---

## 6. Layout

- **Container:** max-width 1280px `[PROPOSED]`, 16px gutters mobile → 32px desktop. Wide data tables
  may extend to 1440px in their own scroll container.
- **Breakpoints:** `sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536`.
- **Grid:** 12-column desktop, 4-column mobile, 24px gutters.
- **Mobile-first `[LOCKED]`:** every component is designed at 375px first. Desktop is the
  enhancement.
- **Wide content scrolls inside its own container** — the page body never scrolls horizontally.
  `[LOCKED]`

---

## 7. Core components

### 7.1 Buttons

| Variant         | Treatment                                                       |
| --------------- | --------------------------------------------------------------- |
| **Primary**     | Brand gradient fill, white text, `md` radius. **One per view.** |
| **Secondary**   | `bg-elevated-2`, `border-default`, white text                   |
| **Ghost**       | Transparent, `text-secondary`; hover → `bg-elevated`, white     |
| **Destructive** | `--danger` at 12% with a danger border and danger text          |
| **Link**        | Cyan text, underline on hover                                   |

Sizes: `sm 32px · md 40px · lg 48px`. Touch targets ≥ 44×44px `[LOCKED]`. Every button has a
visible focus ring (§8), a disabled state, and a loading state that **preserves its width** so
nothing shifts.

### 7.2 Cards

`bg-elevated` + `border-default` + `radius-lg`. Hover on interactive cards: border → `border-strong`,
background → `bg-elevated-2`. **No transform, no scale, no lift** — motion on a grid of cards is
noise (§9).

**Firm card** — the most important component: firm logo (as uploaded, never restyled), name,
verification badge, 3–4 headline data points with tabular numerals and explicit labels, platform and
instrument chips, and one clear action. Unknown values render as a styled **"Not disclosed"**, never
as a dash or a zero. `[LOCKED]`

### 7.3 Data tables `[LOCKED]`

The core comparison surface, and the highest-risk component for both CLS and accessibility.

- Real `<table>` with `<caption>`, `<th scope>`, and a programmatic sort state
  (`aria-sort`) — not a grid of divs.
- **Sticky header**; **sticky first column** (the firm) on horizontal scroll.
- **Tabular numerals**, right-aligned numerics, left-aligned text, decimal alignment.
- **Column widths fixed from first paint** — never measured-then-applied (`SEO.md` §13).
- Row separators are `border-subtle` hairlines. **No zebra striping** — it fights the dark palette
  and adds visual noise to dense data.
- Hover: `bg-elevated` on the row. Sorted column: cyan header text plus a direction icon.
- Each header cell carries a definition tooltip for normalised terms (`PROJECT.md` §6.2) — available
  on focus, not hover alone.
- **Mobile:** the table becomes stacked cards with `label: value` pairs, **or** scrolls horizontally
  with a sticky firm column. Chosen per table; both are specified, neither is improvised.
- Empty, loading (skeleton with the correct row height), and error states are all designed.

### 7.4 Filters

Left rail on desktop, bottom sheet on mobile. Filter state lives in the URL (server-rendered,
shareable, `noindex` per `SEO.md` §9). Active filters appear as removable pills with a
"Clear all". **Result count updates and is announced to assistive technology.** `[LOCKED]`
Filters that would return zero results are disabled with the count shown, rather than silently
producing an empty page.

### 7.5 Badges and status

Pill, `radius-full`, 12px semibold, semantic colour at 12% background with full-strength text and a
1px border. **Always paired with text or an icon — never colour alone.** `[LOCKED]`
Used for: status (Draft/Published/Archived), verification (Verified/Needs review), offers
(discount, expiring), and availability (Allowed/Prohibited/Not disclosed).

### 7.6 Forms

Label above input (never placeholder-as-label `[LOCKED]`), `bg-inset` field on `border-default`,
cyan focus ring, helper text below, inline errors in `--danger` with an icon and
`aria-describedby`. Units shown inline. Required fields marked in the label, not by colour.
The "Not disclosed" affordance is a first-class control, not an empty input (`ADMIN.md` §6.3).

### 7.7 Navigation

**Public header:** official logo (left), primary nav (centre/left), search, primary CTA (right).
Sticky with a subtle background blur at scroll (§10). Mobile: logo + hamburger → full-height drawer.
**Admin:** persistent sidebar (`ADMIN.md` §2.1).
**Breadcrumbs** on every page below the root, visible and matching the JSON-LD exactly
(`SEO.md` §11).
**Footer:** grouped link columns, the affiliate disclosure link, legal links, and the
"not financial advice" disclaimer.

---

## 8. Focus and interaction states `[LOCKED]`

```css
--focus-ring: 0 0 0 2px var(--bg-base), 0 0 0 4px var(--brand-cyan);
```

- Every interactive element has a **visible** focus indicator. Focus outlines are never removed
  without an equally visible replacement.
- `:focus-visible` for keyboard focus; no ring on mouse click.
- Hover, active, disabled, and loading states are defined for every interactive component.
- Skip-to-content link, visible on focus.
- Focus is trapped in modals and returned to the trigger on close.

---

## 9. Motion `[LOCKED]`

**Restrained.** Motion confirms an action or eases a transition. It never decorates.

| Token           | Duration | Easing                          |
| --------------- | -------- | ------------------------------- |
| `--motion-fast` | 120ms    | `cubic-bezier(0.4, 0, 0.2, 1)`  |
| `--motion-base` | 180ms    | `cubic-bezier(0.4, 0, 0.2, 1)`  |
| `--motion-slow` | 240ms    | `cubic-bezier(0.16, 1, 0.3, 1)` |

**Permitted:** opacity and colour transitions on hover/focus; dropdown and modal enter/exit;
skeleton shimmer; a subtle fade-and-rise (≤ 8px) on first section reveal, **once**.

**Prohibited `[LOCKED]`:** looping animation; parallax; animated gradient backgrounds; card
lift/scale on hover; number count-up animations on data (they make real figures feel like
marketing); anything animating `width`, `height`, `top`, or `left`; carousels that auto-advance;
motion required to understand content.

**`prefers-reduced-motion: reduce` disables all non-essential motion** — implemented as a global
rule, not per-component. `[LOCKED]`

---

## 10. Glow and glassmorphism `[LOCKED]`

Both are explicitly **minimal**.

**Glow — permitted, sparingly:**

- One ambient radial cyan/violet field behind the landing hero, at very low opacity (≤ 8%), heavily
  blurred, **never behind body text or a data table**.
- A soft cyan halo on the focused primary CTA.

**Glow — prohibited:** glowing text; glowing borders on cards or rows; neon outlines; glow on any
repeated element; glow anywhere in the admin.

**Glassmorphism — permitted:** the sticky header at scroll (`backdrop-filter: blur(12px)` over a
`rgba` near-black at ~72%), and modal/drawer scrims.

**Glassmorphism — prohibited:** glass cards in a grid; glass over data tables (it destroys numeric
legibility and text contrast); stacked translucent layers; glass anywhere contrast cannot be
guaranteed. **Every glass surface must still meet §2.5 contrast against its worst-case backdrop.**

---

## 11. UX reference library `[LOCKED — boundaries]`

External UX references are held **outside the repository** at:

```
C:\Users\koush\Downloads\PFM UI          (13 files, read-only)
```

**These are screenshots of another product (Prop Firm Match) and one third-party admin dashboard.**
They are **not** to be copied into this repository, redistributed, or reproduced.

### 11.1 What each reference informs

| File                                 | Useful for                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PFM HOME Landing page UI.png`       | Landing page section order; hero → trust stats → offers strip → filter tabs → dense firm table → resources → FAQ → footer                                                |
| `screenshot_2026-09-03-10_55_20.png` | Above-the-fold density at desktop width; header/nav layering; stat-chip row                                                                                              |
| `PFM CHALLENGE UI.png`               | The comparison table pattern: many numeric columns, per-column sort, inline definition tooltips, price + strikethrough                                                   |
| `DEDICATED FIRM OPEN PROFILE UI.png` | Firm profile IA: sticky sub-nav, tabbed sections, long-form rule sections, challenge grid, restricted-countries block                                                    |
| `PFM Compare Firms UI.png`           | Two-firm selector pattern; curated "popular comparisons" link grid — directly relevant to `SEO.md` §10.3                                                                 |
| `PFM PROP FIRM RULES UI.png`         | Rules presented as per-firm cards with categorised headings and expandable "read more"                                                                                   |
| `PFM PAYOUT UI.png`                  | **Phase 2 reference.** Payout metrics table; aggregate columns; FAQ placement                                                                                            |
| `PFM REVIEW UI.png`                  | **Phase 3 reference.** Category rating columns; review-count weighting; filters                                                                                          |
| `PFM OFFER UI.png`                   | Offer/discount list density; code + CTA pairing; long single-column list rhythm                                                                                          |
| `PFM Spreads UI.png`                 | Numeric matrix table with per-instrument columns and colour-coded values                                                                                                 |
| `PFM BEST SELLER UI.png`             | Ranked list pattern; rank badge + firm + action row                                                                                                                      |
| `PFM FAVOURITE FIRM UI.png`          | Ranked list with a proportional bar column — a good pattern for showing relative magnitude in a table                                                                    |
| `master dashboard UI sample.png`     | **Admin reference.** Sidebar grouping, collapsed-state affordance, top search bar, multi-column card queues, compact status chips, user block pinned at the sidebar foot |

### 11.2 Patterns extracted (structure only)

1. **Persistent utility header + section nav** — a two-tier header separating global utilities from
   section navigation.
2. **Dense, sortable, multi-column data tables as the primary comparison surface** — with sticky
   headers, per-column sort affordances, and inline definition tooltips on ambiguous headers.
3. **Chip/tab row above the table** to switch entity views (Firms / Challenges / Offers) without
   leaving the page.
4. **A filter bar of pill controls** with an expandable advanced panel, plus a persistent result
   count.
5. **Tabbed firm profile** with a sticky in-page sub-nav for long rule content.
6. **Long-form rule content grouped under categorical headings** with progressive disclosure —
   validating the `rules` catalog model (`DATABASE.md` §5.3).
7. **Offer strip near the top** of index pages as a recurring merchandising slot.
8. **FAQ block above the footer** on index pages — good for both users and `FAQPage` markup.
9. **Ranked lists with a magnitude bar** for relative comparison.
10. **Admin: sidebar + top search + card-based queue dashboard**, with compact status chips and
    timestamps on every row (`ADMIN.md` §2, §4).
11. **Consistent trust affordance** — a persistent "how we verify and rank" entry point beside data,
    which maps directly to `PROJECT.md` §7 and the `/methodology` route.

### 11.3 Hard boundaries `[LOCKED]`

From these references, Prop Firm Lenz takes **layout, information hierarchy, navigation patterns,
content density, and general UX conventions — nothing else.**

**Prohibited, without exception:**

- ❌ Copying the branding, logo, wordmark, or any visual identity
- ❌ Copying the colour scheme (the references are magenta/pink-led; Prop Firm Lenz is
  cyan→violet — §2)
- ❌ Copying exact component designs, layouts pixel-for-pixel, or distinctive screens
- ❌ Copying any text, headline, microcopy, FAQ answer, or body content
- ❌ Copying any asset — icons, illustrations, images, logos
- ❌ Copying any data — firm names, ratings, review counts, payout figures, prices, discount codes
  (this is business data; see `CLAUDE.md` §3)
- ❌ Reproducing the reference product's visual identity in any recognisable form

**Positively required:** an original Prop Firm Lenz design, built from this document's tokens and
components. Where a reference shows _what information belongs on a screen_, that is a legitimate
input. Where it shows _how that product looks_, it is not.

**Handling `[LOCKED]`:** the reference folder is **read-only**. Files are never modified, moved,
deleted, or copied into the project.

---

## 12. Originality `[LOCKED]`

Restating `CLAUDE.md` §12.2 because it belongs here too:

1. **Do not copy Prop Firm Match** — branding, logo, layout, exact UI, components, assets, copy,
   content, data, or design.
2. The same applies to every other competitor.
3. **The official Prop Firm Lenz logo is the only approved logo** (§3). It is never recreated,
   redesigned, replaced, or substituted.
4. Third-party firm logos are factual identifiers only: displayed as uploaded, never restyled,
   recoloured, or combined with Prop Firm Lenz branding.
5. Prop Firm Lenz's visual signature is its own: near-black ground, cyan-led accenting, the
   cyan→violet gradient used sparingly, dense and calm data typography, and generous space.

---

## 13. Accessibility `[LOCKED]`

Target: **WCAG 2.2 AA.**

- Contrast per §2.5 — measured, with indigo/violet restricted.
- Semantic HTML first; ARIA only where semantics fall short.
- Full keyboard operation; logical tab order; visible focus (§8); focus trapped and returned in
  modals; skip link.
- Every image has `alt` (required at upload — `DATABASE.md` §5.8) or `alt=""` when decorative.
- Forms: associated labels, inline errors, `aria-describedby`, errors announced.
- Tables: `<caption>`, `<th scope>`, `aria-sort`.
- Dynamic results announced via a polite live region.
- `prefers-reduced-motion` honoured globally (§9).
- Zoom to 200% without loss of content or function; reflow at 320px width.
- Status never conveyed by colour alone.
- Verified with axe in CI plus manual keyboard and screen-reader passes on the landing page,
  directory, firm profile, and every admin screen.

---

## 14. Implementation notes

- All tokens are **CSS custom properties** on `:root`, mapped into the Tailwind theme. Components
  reference tokens; **raw hex values never appear in a component.** `[LOCKED]`
- Design-system primitives live in `components/ui/` and are the only place base styling exists
  (`ARCHITECTURE.md` §2.3).
- Radix primitives supply behaviour and accessibility; all visuals are ours (`ARCHITECTURE.md` §2.4).
- **Icons: Lucide** `[LOCKED]` — consistent 24px grid, tree-shakeable, permissive licence.
  **One icon set only**; no mixing, no one-off SVGs where a Lucide icon exists.
- Every component ships with: default, hover, focus, active, disabled, loading, empty, and error
  states — plus mobile and desktop layouts.

---

## 15. Admin split-pane live preview `[LOCKED — Phase 1]`

The firm workspace's editor + preview layout. Behaviour: `ADMIN.md` §7A. Mechanism:
`ARCHITECTURE.md` §21.

### 15.1 Split layout

| Breakpoint             | Layout                                                   | Ratio                                   |
| ---------------------- | -------------------------------------------------------- | --------------------------------------- |
| **≥ 1280px** (`xl`)    | Side-by-side, draggable divider                          | **~50 / 50**, min 30% either side       |
| **1024–1279px** (`lg`) | Side-by-side, editor-weighted                            | ~60 / 40, preview collapsible to a rail |
| **< 1024px**           | **Edit / Preview segmented toggle**, one pane full-width | —                                       |

- CSS Grid with a resizable column; the divider is a real **8px keyboard-operable separator**
  (`role="separator"`, `aria-orientation="vertical"`, arrow keys move it in 5% steps). `[LOCKED]`
- Divider: `--border-default`, `--border-strong` on hover/focus, `col-resize` cursor.
- Pane widths persist per admin `[PROPOSED]`.
- Below 1024px the toggle is a **tablist**, not a stacked scroll — stacking pushes the preview below
  the fold, where it stops being a preview.

### 15.2 Editor pane

Standard admin surface: `--bg-base`, workspace tabs, forms per §7.6. Independent scroll. The
workspace header spans both panes and does not scroll (`ADMIN.md` §6.1).

### 15.3 Preview pane

- **Chrome:** `--bg-inset` surround with a `--border-default` frame, so the previewed page reads as a
  distinct object rather than as part of the admin.
- **Toolbar** (top): `PREVIEW` badge · viewport selector `375 / 768 / Fill` · refresh · full-page.
  The viewport selector is a **labelled radio group**, not a dropdown — one click, always visible.
- **The previewed document renders on its own `--bg-base`** with the real public layout, unaffected
  by admin styling (separate document — `ARCHITECTURE.md` §21.4).
- Narrow viewports (375/768) are centred in the pane with the surround visible either side, so the
  simulated device edge is obvious.
- **Loading:** a skeleton at the previewed viewport's dimensions — never a spinner over a blank pane,
  and never a layout jump when the frame loads.

### 15.4 The PREVIEW indicator `[LOCKED]`

Two markers, deliberately redundant:

1. **A banner inside the previewed document**, pinned to its top, non-dismissible — so it survives
   full-page preview and scrolling.
2. **A badge in the pane toolbar.**

```
┌────────────────────────────────────────────────────────────┐
│ ⚠  PREVIEW — DRAFT, NOT PUBLISHED · 3 pending changes      │  ← --warning
├╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱┤  ← 4px hatched edge
│                                                            │
│                  the real public page                      │
```

- `--warning` (`#F59E0B`) at 12% background, full-strength text and icon, plus a 4px hatched edge
  along the top of the previewed frame. **Warning, not danger** — this is a caution state, not an
  error.
- **Never uses the brand gradient or cyan.** Preview chrome must never be mistakable for product
  chrome. `[LOCKED]`
- Carries **text, not colour alone** (§2.5 rule 3), and states which state is shown: pending-changes
  count, or _"No pending changes — identical to the published page"_.
- Not dismissible, not collapsible, not animated.

### 15.5 Accessibility `[LOCKED]`

- The iframe has a descriptive `title` ("Public page preview, draft").
- The divider is keyboard-operable (§15.1) and announces its position.
- The Edit/Preview toggle is a proper `tablist` with `aria-selected` and arrow-key navigation.
- The viewport selector is a labelled radio group; the current viewport is announced on change.
- Preview refreshes announce completion via a polite live region, so a screen-reader user knows the
  content changed.
- **Inert controls inside the preview are `aria-disabled` with an accessible explanation**, not
  merely visually flattened — a keyboard user must understand why a CTA does nothing (`ADMIN.md`
  §7A.6).
- The preview pane is skippable in the tab order; an admin editing forms should not have to tab
  through a rendered page.

### 15.6 Performance

- The iframe is **lazy** and unmounted while hidden (mobile Edit view) — it costs nothing when
  unused.
- Reloads on **Save Draft**, not per keystroke, and **preserves scroll position**
  (`ARCHITECTURE.md` §21.5).
- The preview pane is excluded from the public Core Web Vitals budgets (§13) — it is an admin
  surface — but must not make the workspace itself feel slow.

---

## 16. Design decisions

### Locked 2026-09-03

| Decision             | Outcome                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **UI typeface**      | **Inter** (§4.1), subject to the single wordmark condition                                                                               |
| **Neutral palette**  | The accessible palette in §2.3 — adjustable at a later visual review, provided §2.5 contrast is preserved                                |
| **Icons**            | **Lucide**, one set only (§14)                                                                                                           |
| **Styling**          | Tailwind CSS v4 + CSS custom-property tokens (`ARCHITECTURE.md` §2.4)                                                                    |
| **UI primitives**    | Radix UI, styled with this design system — no pre-themed kit                                                                             |
| **Logo**             | The official logo is authoritative. **Never recreated or redrawn** (§3). SVG masters and favicons to be addressed separately if required |
| **Currency display** | Source value primary; conversion secondary, dated, labelled (below)                                                                      |

### Still open — none blocking

1. **Wordmark typeface** (§3.3) — determines whether the _display_ face stays Inter or deliberately
   contrasts. _Default: Inter throughout._
2. Container max-width: 1280px, or wider for data tables? (§6) _Default: 1280px, 1440px for tables._
3. Mobile table strategy per table: stacked cards or horizontal scroll? (§7.3)
   _Default: decided per table during build._
4. Light theme — out of scope? (§2.6) _Default: dark only; tokens structured so it stays possible._
5. Minimum logo sizes and clear space (§3.2). _Default: as proposed._
6. Logo SVG masters and favicon set (§3.3) — **deferred by the owner**, to be addressed separately.
   _Interim: raster PNG at 2×/3×; the header will not be pixel-perfect until vectors arrive._

### Currency display `[APPROVED]` — design consequence

The approved currency policy (`ARCHITECTURE.md` §18) has a direct design requirement: **every
monetary value renders with its own currency**, and any conversion appears as clearly secondary
text with its rate date. Two treatments are needed in the component library:

```
$1,299 USD                        ← primary: the source value, always
≈ €1,195  ·  rate 3 Sep 2026      ← secondary: text-tertiary, smaller, never the headline figure
```

A converted figure never takes the primary slot, never appears without its date, and never appears at
all when no stored rate exists for the pair.
