# DATABASE.md — Prop Firm Lenz Relational Architecture

> **Status: design only. No schema files, no migrations, no database exists.**
>
> **ORM: Drizzle. Host: Neon. Draft model: `draft_payload` (§3.2.1).** All locked 2026-09-03.
> The supporting tables in §4.4, §4.6, §5.10 and §5.12 are approved.
> **No blocking schema questions remain.** Implementation still requires explicit owner approval to
> initialise the project.

Markers: `[LOCKED]` owner requirement · `[APPROVED]` owner-approved, binding ·
`[PROPOSED]` needs approval · `[OPEN]` undecided.

---

## 1. Conventions `[APPROVED]`

**Confirmed by the owner 2026-09-03.** These are binding: the schema is built directly on them, so
they carry the same force as `[LOCKED]`. Specifically approved:

- **UUIDv7 identifiers** (with `bigint` identity for the two high-volume append-only tables)
- **Soft-delete conventions** — `deleted_at` plus partial unique indexes on live rows
- **PostgreSQL `numeric` for money** — never `float`, never integer cents
- **Original amount + source currency** stored together
- **No stored converted-money columns** — conversion is derived at read time only (§1.3)

| Concern         | Convention                                                                         | Rationale                                                                            |
| --------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Naming          | `snake_case`, plural tables, singular columns                                      | PostgreSQL idiom                                                                     |
| Primary keys    | `id uuid` — **UUIDv7**, app-generated                                              | Time-ordered (good index locality) without leaking sequential counts                 |
| High-volume PKs | `bigint GENERATED ALWAYS AS IDENTITY` for `audit_logs`, `affiliate_clicks`         | Narrower keys where row counts are large and IDs are never public                    |
| Foreign keys    | `{singular_table}_id`, always indexed, explicit `ON DELETE`                        | Silent cascades are how data disappears                                              |
| Timestamps      | `timestamptz`, **always UTC**                                                      | Never `timestamp` — the difference matters                                           |
| Audit columns   | `created_at`, `updated_at` (trigger), `created_by_admin_id`, `updated_by_admin_id` | Provenance on every editable row                                                     |
| Soft delete     | `deleted_at timestamptz NULL` on business entities                                 | Recoverable; all queries filter it                                                   |
| Money           | `numeric(12,2)` **+ its own `currency char(3)`**                                   | **Never** `float`. Source currency stored alongside; never silently converted (§1.3) |
| Percentages     | `numeric(6,3)`, stored as the percent (`10.000` = 10%)                             | One convention, documented once                                                      |
| Booleans        | `NOT NULL DEFAULT false`, positively named (`is_active`, not `is_not_active`)      | Avoids three-state boolean confusion                                                 |
| Text            | `text` (never `varchar(n)` for length alone) with `CHECK` where a limit is real    | Postgres has no perf gain from `varchar(n)`                                          |
| Email           | `citext`                                                                           | Case-insensitive uniqueness                                                          |
| Enums           | **Lookup tables** where admins may extend; `text` + `CHECK` where fixed            | See §1.1                                                                             |
| Slugs           | `text`, lowercase `^[a-z0-9]+(-[a-z0-9]+)*$`, partial-unique on live rows          | See §3.3                                                                             |

### 1.1 Enum strategy `[APPROVED]`

Three options, and where each is used:

| Approach                 | Used for                                                                               | Trade-off                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Native `CREATE TYPE`** | Nothing, initially                                                                     | Fastest and smallest, but `ALTER TYPE` is awkward and cannot be rolled back in a transaction in older versions |
| **`text` + `CHECK`**     | Fixed lifecycle values: `status`, `verification_status`, `drawdown_type`, `actor_type` | Simple, greppable, migration-friendly. **Recommended default.**                                                |
| **Lookup table**         | Admin-extensible vocabularies: `platforms`, `instruments`, `rules`, `challenge_types`  | Referential integrity + admin CRUD without a migration                                                         |

**Approved:** `text` + `CHECK` for lifecycle states; lookup tables for anything an admin should be
able to add. **Native `CREATE TYPE` enums are not used** — the operational cost of `ALTER TYPE`
outweighs the marginal gain.

### 1.2 Global rules `[LOCKED]`

1. Every table has `created_at`.
2. Every foreign key is indexed (Postgres does **not** do this automatically).
3. Uniqueness on soft-deletable rows uses **partial unique indexes** (`WHERE deleted_at IS NULL`),
   so a deleted record does not block reuse of its slug.
4. `audit_logs` and `entity_versions` are **append-only** — enforced by revoked `UPDATE`/`DELETE`
   grants plus a rule/trigger.
5. Business constraints are expressed in the database, not only in application code.
6. No table stores business data seeded from code. Data enters through the admin UI. (`CLAUDE.md` §3)

### 1.3 Monetary values `[APPROVED]`

**Store original monetary values with their source currency. Never silently convert or overwrite a
source value.** Full policy: `ARCHITECTURE.md` §18.

Schema consequences:

1. **Every money column is paired with its own currency column.** There is no single site-wide
   currency, and no "normalised base currency" column that quietly becomes the truth.
   - `challenges.price` + `challenges.price_currency`
   - `challenges.account_size` + `challenges.account_currency`
   - `offers.discount_value` + `offers.discount_currency`
   - Future: `payouts.amount` + `payouts.currency` (Phase 2)
2. `CHECK (currency ~ '^[A-Z]{3}$')` on every currency column — ISO 4217, uppercase.
3. `CHECK` that a currency is present whenever its amount is present, and vice versa:
   `CHECK ((price IS NULL) = (price_currency IS NULL))`. An amount without a currency is
   meaningless, and the database refuses it.
4. **No `converted_*` columns.** Conversion is derived at read time, never persisted.
5. **Rates, when introduced, are a separate dated table** with provenance
   (`currency_rates (base, quote, rate, as_of, source)`) — `[PROPOSED — Phase 2+]`. Rates are never
   embedded in an entity row, so a historical figure can always be re-explained.
6. Sorting or filtering across currencies must declare its basis in the UI
   (`ARCHITECTURE.md` §18.3). The database stores originals; the presentation layer is responsible
   for being honest about comparison.

---

## 2. Entity map (Phase 1)

```
                        ┌──────────────┐
                        │ admin_users  │──< admin_sessions
                        └──────┬───────┘
                               │
                    admin_user_roles (M:N)
                               │
                        ┌──────▼───────┐
                        │    roles     │──< role_permissions >── permissions
                        └──────────────┘
                               │ actor
                        ┌──────▼───────┐        ┌────────────────┐
                        │  audit_logs  │        │ entity_versions│
                        └──────────────┘        └────────────────┘
                               ▲                        ▲
                               └────────┬───────────────┘
                                        │ (polymorphic: entity_type + entity_id)
                        ┌───────────────┴──────────────────────────┐
                        │              prop_firms                   │
                        └──┬───┬────┬─────┬──────┬─────┬─────┬──────┘
                           │   │    │     │      │     │     │
       ┌───────────────────┘   │    │     │      │     │     └──────────────┐
       │                       │    │     │      │     │                    │
┌──────▼──────┐     ┌──────────▼──┐ │ ┌───▼────┐ │ ┌───▼──────────┐  ┌──────▼──────┐
│ challenges  │     │firm_platforms│ │ │ offers │ │ │affiliate_links│  │internal_notes│
└──────┬──────┘     └──────┬───────┘ │ └───┬────┘ │ └───────┬──────┘  └─────────────┘
       │                   │         │     │      │         │
       │            ┌──────▼─────┐   │     └──────┼─────────┤
       │            │ platforms  │   │            │         │
       │            └────────────┘   │            │  ┌──────▼─────────┐
       │                             │            │  │affiliate_clicks│
       │      ┌──────────────────────▼──┐         │  └────────────────┘
       │      │   firm_instruments      │         │
       │      └───────────┬─────────────┘         │
       │                  │                       │
       │           ┌──────▼──────┐                │
       │           │ instruments │                │
       │           └─────────────┘                │
       │                                          │
┌──────▼──────────────────┐                       │
│      rule_values        │───┐                   │
└─────────────────────────┘   │                   │
                        ┌─────▼─────┐             │
                        │   rules   │             │
                        └───────────┘             │
                                                  │
        ┌──────────────┐   ┌──────────────┐  ┌────▼──────┐  ┌───────────┐
        │ seo_metadata │   │    media     │  │ redirects │  │   users   │──< profiles
        └──────────────┘   └──────────────┘  └───────────┘  └───────────┘
```

`seo_metadata`, `media`, `audit_logs`, `entity_versions`, `internal_notes`, and `redirects` are
**cross-cutting** — they attach to many entity types.

---

## 3. Cross-cutting design decisions

### 3.1 Polymorphic references `[PROPOSED]`

`seo_metadata`, `audit_logs`, `entity_versions`, and `internal_notes` reference many entity types via
`(entity_type text, entity_id uuid)`. PostgreSQL cannot enforce a foreign key on this.

| Option                                                   | Verdict                                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| `(entity_type, entity_id)` pair                          | **Chosen.** One table, easy to query, no schema churn per new entity   |
| One nullable FK column per type + `CHECK` exactly-one    | Real FKs, but a migration for every new entity type; wide, sparse rows |
| A table per entity type (`firm_seo`, `challenge_seo`, …) | Real FKs, best integrity; N× the tables and N× the query paths         |

**Mitigation for the lost FK:** `entity_type` is `CHECK`-constrained to a known list; a scheduled
integrity job reports orphans; the service layer deletes dependents inside the same transaction as
the parent.

**Exception `[PROPOSED]`:** if the owner prefers strict integrity over flexibility, use per-entity SEO
tables (`prop_firm_seo`, `challenge_seo`) and keep polymorphism only for `audit_logs`. This is a
legitimate trade — flag it at review.

### 3.2 Draft / published state `[LOCKED — behaviour]`

Every publishable entity carries:

```sql
status          text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','published','archived'))
published_at    timestamptz
```

- Public queries filter `status = 'published' AND deleted_at IS NULL`. **Always.**
- `published_at` is set on first publish and preserved thereafter (it is the public "since" date).

### 3.2.1 The draft model `[LOCKED]`

**Decision: `draft_payload` on the firm aggregate.** Administrators edit and preview changes to an
already-live firm **without altering the published version**. Published data changes **only** on an
explicit publish action.

```
LIVE  →  EDIT DRAFT  →  PREVIEW  →  PUBLISH
```

#### State machine

```
                    create
                       │
                       ▼
        ┌────────────────────────────┐
        │  UNPUBLISHED DRAFT         │  status = 'draft'
        │  columns = working state   │  draft_payload = NULL
        │  draft_payload = NULL      │  not public · 404 · absent from sitemap
        └─────────────┬──────────────┘
                      │ publish
                      ▼
        ┌────────────────────────────┐
        │  PUBLISHED (clean)         │  status = 'published'
        │  columns = live            │  draft_payload = NULL
        └─────────────┬──────────────┘
                      │ edit
                      ▼
        ┌────────────────────────────────────────────┐
        │  PUBLISHED + PENDING DRAFT                 │
        │  columns   = live — UNCHANGED              │  ← the public keeps seeing this
        │  draft_payload = pending edits (jsonb)     │
        └───┬────────────────┬───────────────┬───────┘
            │ preview        │ publish       │ discard
            ▼                ▼               ▼
   overlay rendered   columns ← draft   draft_payload = NULL
   through the real   draft_payload     columns untouched
   public template    = NULL
```

`archived` is reachable from `published` and behaves as unpublished for all public queries.

#### Why the whole aggregate lives in one `jsonb`

A firm's pending edits span `prop_firms`, `challenges`, `rule_values`, `firm_platforms`,
`firm_instruments`, `offers`, and `seo_metadata`. Two models were possible:

| Model                                                            | Verdict                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Draft state inside one `draft_payload jsonb` on `prop_firms`** | **Chosen.** Pending child rows never exist as real rows, so **there is no path by which draft data can reach a public query** — public repositories simply never read the column. Publish and discard are each a single atomic operation over one field |
| Per-table `is_draft` flag on every child row                     | Rejected. Every public query would need a correct `AND is_draft = false`; one missed predicate leaks unpublished data. Atomic publish and discard across seven tables becomes a multi-table dance                                                       |

The safety property is the point: **draft data is structurally unable to leak**, rather than relying
on every future query being written correctly. `[LOCKED]`

**Accepted cost:** draft children are not relationally validated by the database until publish. This
is mitigated by validating `draft_payload` against the same Zod schemas on every save, and by the
database constraints applying in full at publish time, when real rows are written.

#### Payload shape `[LOCKED]`

A versioned envelope, so the format can evolve without orphaning saved drafts:

```jsonc
{
  "schema_version": 1,
  "base_version": 7, // entity_versions.version_number this draft forked from
  "updated_at": "2026-09-03T10:00:00Z",
  "updated_by_admin_id": "…",
  "firm": {/* changed prop_firms columns only */},
  "challenges": [{ "_op": "create|update|delete", "id": "…" /* fields */ }],
  "rule_values": [{ "_op": "…", "rule_id": "…" /* value */ }],
  "platforms": [{ "_op": "…", "platform_id": "…" }],
  "instruments": [{ "_op": "…", "instrument_id": "…" }],
  "offers": [{ "_op": "…", "id": "…" /* fields */ }],
  "affiliate_links": [{ "_op": "…", "id": "…" /* fields */ }],
  "seo": {/* changed seo_metadata fields */},
}
```

- **Sparse, not a full copy.** Only changed fields and changed children are recorded, so a diff is
  the payload itself and `entity_versions` remains the full-snapshot store (§5.12).
- `_op` is required on every child entry: `create`, `update`, or `delete`.
- **`affiliate_links` `[added 2026-09-04]`** — staged like every other child, so a destination change
  can be previewed and published atomically instead of redirecting real visitors the moment it is
  typed. The array is optional, so drafts saved before it existed still parse and `schema_version` is
  unchanged. **`commission_notes` is deliberately not stageable**: commercial terms are admin-only
  and must never ride into a published snapshot or an entity version.
- **One pending op per child `[LOCKED]`.** Staging the same child twice REPLACES the pending op
  rather than queueing a second one — otherwise a draft accumulates intermediate states that publish
  replays in order, and two identical creates collide on a unique index. Ops are keyed by row id; by
  `platform_id` / `instrument_id` / `rule_id` for the collections with no row id of their own; and by
  natural key (slug, title, label) for a create that has no id yet.
- **Publish materialises every collection, in one transaction `[LOCKED]`.** Applying the draft means
  applying the OPS to the tables, not writing back the materialised `FirmView` — the view collapses a
  rule's `value_boolean` / `value_numeric` / `value_text` into one display state, so publishing from
  it would lose which column the answer lives in.
- `base_version` gives optimistic concurrency: if the firm has been published by someone else since
  the draft was forked, the draft is **stale** — the admin is warned and shown the difference rather
  than silently overwriting (`ADMIN.md` §7, §17).

#### Column and index

```sql
draft_payload jsonb                                     -- NULL = no pending changes
CHECK (draft_payload IS NULL OR jsonb_typeof(draft_payload) = 'object')
CHECK (draft_payload IS NULL OR draft_payload ? 'schema_version')

CREATE INDEX prop_firms_has_draft_idx ON prop_firms (updated_at DESC)
       WHERE draft_payload IS NOT NULL AND deleted_at IS NULL;
```

The partial index backs the dashboard's "Drafts in progress" queue (`ADMIN.md` §4) without adding
weight to the far more frequent public queries.

#### Hard rules `[LOCKED]`

1. **Public repositories never select `draft_payload`.** Public domain types do not contain the
   field. A test asserts no public serialiser can reach it.
2. **Publishing is one transaction** (`ARCHITECTURE.md` §3.1): validate → run the pre-publish
   checklist → apply firm fields → apply child ops as real rows → write the `entity_versions`
   snapshot → write `audit_logs` → set `published_at` on first publish only → **set
   `draft_payload = NULL`** → commit → _then_ revalidate cache tags and the sitemap.
3. **Discard** sets `draft_payload = NULL` and writes a `firm.draft_discarded` audit entry. The
   published columns are not touched.
4. **A slug rename lives in the draft** and does not move the live URL. At publish, the column is
   updated and the 301 is inserted **in the same transaction** (§3.3). A draft-time uniqueness check
   warns early; the authoritative check runs at publish.
5. **Before first publish** (`status = 'draft'`), the columns _are_ the working state and
   `draft_payload` stays `NULL` — there is no live version to protect, and the Prop List needs the
   firm's name and slug in queryable columns.
6. `draft_payload` is scrubbed of secrets before it reaches `audit_logs` (§4.7).

### 3.3 Slugs and URL stability `[LOCKED]`

```sql
slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
CREATE UNIQUE INDEX ON prop_firms (slug) WHERE deleted_at IS NULL;
```

- Slug uniqueness must also be checked against `redirects.from_path` so a new firm cannot claim a URL
  that redirects elsewhere. Enforced in the service layer (cross-table, so not a DB constraint).
- **Changing a slug automatically inserts a 301** into `redirects`, in the same transaction.
- Slugs are never reused after deletion while a redirect exists for them.
- **The slug is public identity, not internal identity.** `id` is the immutable key: all foreign
  keys, all admin routes, and all internal references use it (`ARCHITECTURE.md` §22). A rename is
  therefore a single column update with no referential or routing consequence. `[LOCKED]`

### 3.4 Ordering `[PROPOSED]`

`display_order integer NOT NULL DEFAULT 0` on user-orderable entities, with ties broken by `name` or
`created_at` for deterministic pagination. Sparse values (10, 20, 30) allow insertion without a
rewrite.

---

## 4. Phase 1 tables — identity and access

### 4.1 `users` (public users)

Exists in Phase 1 **as schema only**. No public signup ships until Phase 2 (`ROADMAP.md`).

| Column                                     | Type                               | Notes                                      |
| ------------------------------------------ | ---------------------------------- | ------------------------------------------ |
| `id`                                       | `uuid` PK                          | UUIDv7                                     |
| `email`                                    | `citext` NOT NULL                  | Partial unique `WHERE deleted_at IS NULL`  |
| `email_verified_at`                        | `timestamptz`                      | Gate for any submission (Phase 2/3)        |
| `password_hash`                            | `text` NULL                        | NULL when OAuth-only                       |
| `status`                                   | `text` NOT NULL DEFAULT `'active'` | `CHECK IN ('active','suspended','banned')` |
| `last_login_at`                            | `timestamptz`                      |                                            |
| `created_at` / `updated_at` / `deleted_at` | `timestamptz`                      |                                            |

Indexes: unique `(email) WHERE deleted_at IS NULL`; `(status)`; `(created_at DESC)`.

**Separation `[LOCKED]`:** `users` and `admin_users` are distinct tables. There is no column, join, or
code path that promotes a public user to an admin.

### 4.2 `profiles` (1:1 with `users`)

| Column               | Type                                                        | Notes                                                          |
| -------------------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| `id`                 | `uuid` PK                                                   |                                                                |
| `user_id`            | `uuid` NOT NULL **UNIQUE** → `users.id` `ON DELETE CASCADE` | Enforces 1:1                                                   |
| `display_name`       | `text` NOT NULL                                             |                                                                |
| `slug`               | `text`                                                      | Partial unique; only if public profiles ship                   |
| `avatar_media_id`    | `uuid` → `media.id` `ON DELETE SET NULL`                    |                                                                |
| `country_code`       | `char(2)`                                                   | ISO 3166-1 alpha-2                                             |
| `bio`                | `text`                                                      | `CHECK (length(bio) <= 1000)`                                  |
| `trading_experience` | `text`                                                      | `CHECK` in a fixed list; used for review credibility (Phase 3) |
| `is_public`          | `boolean` NOT NULL DEFAULT false                            |                                                                |

**Why split from `users`?** `users` is authentication (hot, sensitive, rarely read publicly);
`profiles` is presentation (public, joined often). Separating them keeps credential columns out of
every public query and makes a future "delete profile, keep account" flow trivial.

### 4.3 `admin_users`

| Column                                     | Type                                | Notes                                           |
| ------------------------------------------ | ----------------------------------- | ----------------------------------------------- |
| `id`                                       | `uuid` PK                           |                                                 |
| `email`                                    | `citext` NOT NULL                   | Partial unique `WHERE deleted_at IS NULL`       |
| `password_hash`                            | `text` NOT NULL                     | Argon2id                                        |
| `full_name`                                | `text` NOT NULL                     | For audit-log readability                       |
| `status`                                   | `text` NOT NULL DEFAULT `'invited'` | `CHECK IN ('invited','active','suspended')`     |
| `mfa_enabled`                              | `boolean` NOT NULL DEFAULT false    |                                                 |
| `mfa_secret_encrypted`                     | `text` NULL                         | Encrypted at rest, never returned to the client |
| `mfa_recovery_codes`                       | `text[]` NULL                       | Stored hashed                                   |
| `last_login_at`, `last_login_ip_hash`      |                                     | Hashed only `[LOCKED]`                          |
| `failed_login_count`                       | `integer` NOT NULL DEFAULT 0        |                                                 |
| `locked_until`                             | `timestamptz`                       | Lockout window                                  |
| `invited_by_admin_id`                      | `uuid` → `admin_users.id`           | Self-reference                                  |
| `created_at` / `updated_at` / `deleted_at` |                                     |                                                 |

### 4.4 `admin_sessions` `[APPROVED]`

Required by the approved database-backed session auth (`ARCHITECTURE.md` §5.2). Approved 2026-09-03.

`id`, `admin_user_id` → `admin_users` `ON DELETE CASCADE`, `token_hash text NOT NULL UNIQUE`
(SHA-256 of an opaque token — **never the token itself**), `expires_at`, `last_seen_at`,
`ip_hash`, `user_agent_hash`, `revoked_at`, `created_at`.

Index `(admin_user_id)`, `(expires_at)` for cleanup.

### 4.5 `roles`

| Column                      | Type                             | Notes                                       |
| --------------------------- | -------------------------------- | ------------------------------------------- |
| `id`                        | `uuid` PK                        |                                             |
| `key`                       | `text` NOT NULL **UNIQUE**       | Stable code identifier, e.g. `master_admin` |
| `name`                      | `text` NOT NULL                  | Human label                                 |
| `description`               | `text`                           |                                             |
| `is_system`                 | `boolean` NOT NULL DEFAULT false | System roles cannot be renamed or deleted   |
| `created_at` / `updated_at` |                                  |                                             |

### 4.6 `permissions` and `role_permissions` `[APPROVED]`

Required by the RBAC model. Approved 2026-09-03, including `admin_user_roles`.

- `permissions`: `id`, `key text UNIQUE` (`resource:action`), `resource`, `action`, `description`.
- `role_permissions`: PK `(role_id, permission_id)`, both FKs `ON DELETE CASCADE`.
- `admin_user_roles`: PK `(admin_user_id, role_id)`, `granted_by_admin_id`, `granted_at`.

**Not chosen:** a `permissions jsonb` array on `roles`. Simpler and one fewer table, but grants become
unjoinable, unvalidated, and hard to audit — "who can publish?" degrades into a JSON scan.

**Constraint (service-enforced):** the system must always retain at least one active `master_admin`.

### 4.7 `audit_logs` `[LOCKED — append-only]`

| Column                       | Type                                        | Notes                                                             |
| ---------------------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| `id`                         | `bigint` identity PK                        | High volume                                                       |
| `actor_type`                 | `text` NOT NULL                             | `CHECK IN ('admin','user','system')`                              |
| `actor_admin_id`             | `uuid` → `admin_users` `ON DELETE SET NULL` | Preserve the log if the admin is removed                          |
| `actor_user_id`              | `uuid` → `users` `ON DELETE SET NULL`       |                                                                   |
| `actor_label`                | `text`                                      | Denormalised name/email **at the time of the action**             |
| `action`                     | `text` NOT NULL                             | Dotted verb: `firm.published`, `role.granted`, `firm.rolled_back` |
| `entity_type`                | `text`                                      |                                                                   |
| `entity_id`                  | `uuid`                                      |                                                                   |
| `before` / `after`           | `jsonb`                                     | Full snapshots                                                    |
| `diff`                       | `jsonb`                                     | Precomputed changed keys — makes the history UI fast              |
| `ip_hash`, `user_agent_hash` | `text`                                      | **Never raw** `[LOCKED]`                                          |
| `request_id`                 | `text`                                      | Correlates with application logs                                  |
| `created_at`                 | `timestamptz` NOT NULL DEFAULT `now()`      |                                                                   |

Constraints: `CHECK` that the actor column matches `actor_type`.
Indexes: `(entity_type, entity_id, created_at DESC)`, `(actor_admin_id, created_at DESC)`,
`(action, created_at DESC)`, `(created_at DESC)`.

**Append-only enforcement:** `REVOKE UPDATE, DELETE ON audit_logs FROM app_role;` plus a trigger
raising on `UPDATE`/`DELETE`. Retention is by partition drop, never by `DELETE`. `[LOCKED]`

**Secrets are never logged** — `before`/`after` are scrubbed of `password_hash`, `mfa_secret_encrypted`,
and `affiliate_links.destination_url` query secrets before writing.

---

## 5. Phase 1 tables — core domain

### 5.1 `prop_firms`

The central entity.

| Column                                        | Type                                        | Notes                                                                                                            |
| --------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `id`                                          | `uuid` PK                                   |                                                                                                                  |
| `slug`                                        | `text` NOT NULL                             | Partial unique; drives the public URL                                                                            |
| `name`                                        | `text` NOT NULL                             |                                                                                                                  |
| `legal_name`                                  | `text`                                      |                                                                                                                  |
| `tagline`                                     | `text`                                      | `CHECK (length(tagline) <= 160)`                                                                                 |
| `description`                                 | `text`                                      | Long-form, admin-authored                                                                                        |
| `founded_year`                                | `integer`                                   | `CHECK (founded_year BETWEEN 1900 AND extract(year from now())+1)`                                               |
| `headquarters_country`                        | `char(2)`                                   | ISO 3166-1                                                                                                       |
| `headquarters_city`                           | `text`                                      |                                                                                                                  |
| `website_url`, `support_email`, `support_url` | `text`                                      | URL-shaped `CHECK`                                                                                               |
| `logo_media_id`, `cover_media_id`             | `uuid` → `media` `ON DELETE SET NULL`       |                                                                                                                  |
| `brand_color`                                 | `text`                                      | `CHECK (brand_color ~ '^#[0-9a-f]{6}$')` — for the firm's own accent, never for Prop Firm Lenz chrome            |
| `status`                                      | `text` NOT NULL DEFAULT `'draft'`           | `draft` / `published` / `archived`                                                                               |
| `draft_payload`                               | `jsonb`                                     | **Pending unpublished edits** (§3.2.1). `NULL` = no pending changes. **Never read by a public query** `[LOCKED]` |
| `verification_status`                         | `text` NOT NULL DEFAULT `'unverified'`      | `unverified` / `verified` / `needs_review`                                                                       |
| `verified_at`                                 | `timestamptz`                               | Shown publicly as "Last verified"                                                                                |
| `verified_by_admin_id`                        | `uuid` → `admin_users` `ON DELETE SET NULL` |                                                                                                                  |
| `data_completeness_score`                     | `smallint`                                  | 0–100, recomputed on write; `CHECK (0..100)`                                                                     |
| `is_featured`                                 | `boolean` NOT NULL DEFAULT false            |                                                                                                                  |
| `display_order`                               | `integer` NOT NULL DEFAULT 0                |                                                                                                                  |
| `published_at`                                | `timestamptz`                               |                                                                                                                  |
| `created_by_admin_id`, `updated_by_admin_id`  | `uuid` → `admin_users`                      |                                                                                                                  |
| `created_at` / `updated_at` / `deleted_at`    |                                             |                                                                                                                  |

**Deliberately absent:** `rating`, `review_count`, `payout_total`. These are Phase 2/3 **derived**
values and must not exist as invented columns before the data does. `[LOCKED]`

Indexes:

```sql
CREATE UNIQUE INDEX prop_firms_slug_live_uq ON prop_firms (slug) WHERE deleted_at IS NULL;
CREATE INDEX prop_firms_public_idx  ON prop_firms (status, display_order, name)
                                    WHERE deleted_at IS NULL AND status = 'published';
CREATE INDEX prop_firms_featured_idx ON prop_firms (is_featured, display_order)
                                     WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX prop_firms_verification_idx ON prop_firms (verification_status, verified_at);
CREATE INDEX prop_firms_name_trgm_idx ON prop_firms USING gin (name gin_trgm_ops);  -- admin search
```

### 5.2 `challenges`

**The real unit of comparison** (`PROJECT.md` §6.3). One firm → many challenges.

| Column                                                                 | Type                                               | Notes                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| `id`                                                                   | `uuid` PK                                          |                                                                             |
| `prop_firm_id`                                                         | `uuid` NOT NULL → `prop_firms` `ON DELETE CASCADE` | A challenge cannot outlive its firm                                         |
| `name`                                                                 | `text` NOT NULL                                    |                                                                             |
| `slug`                                                                 | `text` NOT NULL                                    | Unique **per firm**                                                         |
| `challenge_type`                                                       | `text` NOT NULL                                    | `CHECK IN ('one_step','two_step','three_step','instant_funding','other')`   |
| `account_size`                                                         | `numeric(14,2)` NOT NULL                           |                                                                             |
| `account_currency`                                                     | `char(3)` NOT NULL                                 | ISO 4217                                                                    |
| `price`                                                                | `numeric(12,2)`                                    | NULL = not disclosed                                                        |
| `price_currency`                                                       | `char(3)`                                          |                                                                             |
| `profit_target_p1_pct`, `profit_target_p2_pct`, `profit_target_p3_pct` | `numeric(6,3)`                                     | NULL = not applicable / unknown                                             |
| `max_daily_loss_pct`                                                   | `numeric(6,3)`                                     |                                                                             |
| `max_total_drawdown_pct`                                               | `numeric(6,3)`                                     |                                                                             |
| `drawdown_type`                                                        | `text`                                             | `CHECK IN ('static','trailing','eod_trailing')` — the normalised vocabulary |
| `drawdown_basis`                                                       | `text`                                             | `CHECK IN ('initial_balance','equity','highest_equity','highest_balance')`  |
| `min_trading_days`                                                     | `smallint`                                         |                                                                             |
| `max_trading_days`                                                     | `smallint`                                         | **NULL means unlimited — and the UI must say so explicitly**                |
| `profit_split_pct`                                                     | `numeric(6,3)`                                     |                                                                             |
| `payout_frequency_days`                                                | `smallint`                                         |                                                                             |
| `first_payout_days`                                                    | `smallint`                                         |                                                                             |
| `leverage`                                                             | `text`                                             | e.g. `1:100` — free-form because firms express it inconsistently            |
| `fee_refundable`                                                       | `boolean`                                          | NULL = unknown                                                              |
| `has_scaling_plan`                                                     | `boolean`                                          |                                                                             |
| `status`, `display_order`                                              |                                                    | As §3.2                                                                     |
| audit + soft-delete columns                                            |                                                    |                                                                             |

**No `draft_payload` on `challenges`** `[LOCKED]` — pending challenge edits live inside the parent
firm's `draft_payload` (§3.2.1), so an unpublished challenge never exists as a row.

Constraints and indexes:

```sql
CREATE UNIQUE INDEX challenges_firm_slug_uq ON challenges (prop_firm_id, slug) WHERE deleted_at IS NULL;
CREATE INDEX challenges_firm_idx  ON challenges (prop_firm_id, display_order) WHERE deleted_at IS NULL;
CREATE INDEX challenges_filter_idx ON challenges (account_size, price, challenge_type)
                                   WHERE status='published' AND deleted_at IS NULL;
CHECK (max_trading_days IS NULL OR min_trading_days IS NULL OR max_trading_days >= min_trading_days)
CHECK (profit_split_pct IS NULL OR profit_split_pct BETWEEN 0 AND 100)
CHECK (max_daily_loss_pct IS NULL OR max_daily_loss_pct BETWEEN 0 AND 100)
CHECK (account_size > 0)
CHECK (price IS NULL OR price >= 0)

-- currency policy (§1.3): an amount is never stored without its source currency
CHECK (price_currency   IS NULL OR price_currency   ~ '^[A-Z]{3}$')
CHECK (account_currency ~ '^[A-Z]{3}$')
CHECK ((price IS NULL) = (price_currency IS NULL))
```

**Currency `[APPROVED]`:** `price_currency` and `account_currency` store the currency the firm
actually publishes. They are **not** normalised to a base currency, and no `converted_price` column
exists. A firm pricing in EUR is stored in EUR (§1.3, `ARCHITECTURE.md` §18).

**`NULL` discipline `[LOCKED]`:** every nullable field above means _"not disclosed / unknown"_ — never
zero, never a default. The rendering layer must distinguish `0%` from _unknown_.

### 5.3 `rules` (catalog)

A catalog of **rule definitions**, not rule values.

| Column                    | Type                             | Notes                                                                             |
| ------------------------- | -------------------------------- | --------------------------------------------------------------------------------- |
| `id`                      | `uuid` PK                        |                                                                                   |
| `key`                     | `text` NOT NULL UNIQUE           | e.g. `news_trading_allowed`, `weekend_holding_allowed`                            |
| `label`                   | `text` NOT NULL                  | Display name                                                                      |
| `description`             | `text`                           | The canonical published definition (`PROJECT.md` §6.2)                            |
| `category`                | `text` NOT NULL                  | `CHECK IN ('trading','risk','payout','account','platform','restriction','other')` |
| `data_type`               | `text` NOT NULL                  | `CHECK IN ('boolean','number','percent','currency','text','enum')`                |
| `enum_options`            | `text[]`                         | Required when `data_type='enum'`                                                  |
| `unit`                    | `text`                           | e.g. `%`, `days`, `lots`                                                          |
| `applies_to`              | `text` NOT NULL DEFAULT `'both'` | `CHECK IN ('firm','challenge','both')`                                            |
| `is_comparable`           | `boolean` NOT NULL DEFAULT true  | Drives inclusion in comparison tables                                             |
| `is_filterable`           | `boolean` NOT NULL DEFAULT false | Drives directory filters                                                          |
| `display_order`, `status` |                                  |                                                                                   |

`CHECK (data_type <> 'enum' OR enum_options IS NOT NULL)`

### 5.4 `rule_values` — the hybrid model `[APPROVED]`

**Decision: the hybrid model, approved 2026-09-03.** The single most consequential schema decision,
now settled.

| Option                                     | Pros                                                           | Cons                                                             |
| ------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| **(A) Fixed columns on `challenges` only** | Fast, typed, trivially queryable, indexable                    | Every new rule is a migration; firm-specific quirks don't fit    |
| **(B) Pure EAV (`rules` + `rule_values`)** | Infinitely flexible; admins add rules with no deploy           | Slow to filter, weak typing, painful comparison queries          |
| **(C) Hybrid — APPROVED**                  | Hot rules as columns (fast paths); long tail in EAV (flexible) | Two places to look; needs a documented rule for which goes where |

**The placement rule `[APPROVED]`** — this is the "documented rule" the trade-off column demands, and
it is binding:

- **Column on `challenges`** if the rule is **filtered, sorted, or shown in a comparison table** —
  drawdown %, drawdown type and basis, profit split, price, account size, targets, trading days
  (i.e. everything in §5.2).
- **`rule_values`** for everything else: narrative restrictions, firm-specific policies, per-firm
  quirks, anything with a source URL and a caveat.

**Promotion path:** if a long-tail rule becomes filterable or comparable, it is **promoted to a
column** via an expand-then-contract migration (`ARCHITECTURE.md` §16.3) — backfilled from
`rule_values`, reads switched, then the old rows retired. Promotion is a deliberate, reviewed change,
never an ad-hoc dual-write.

```
rule_values
  id                uuid PK
  rule_id           uuid NOT NULL → rules ON DELETE RESTRICT
  scope             text NOT NULL CHECK (scope IN ('firm','challenge'))
  prop_firm_id      uuid NULL → prop_firms ON DELETE CASCADE
  challenge_id      uuid NULL → challenges ON DELETE CASCADE
  value_boolean     boolean
  value_numeric     numeric(14,4)
  value_text        text
  note              text            -- admin clarification shown to users
  source_url        text            -- provenance (PROJECT.md §6.6)
  created_at, updated_at, created_by_admin_id
```

Constraints:

```sql
-- exactly one target, matching the scope
CHECK ( (scope='firm'      AND prop_firm_id IS NOT NULL AND challenge_id IS NULL)
     OR (scope='challenge' AND challenge_id IS NOT NULL AND prop_firm_id IS NULL) )

-- exactly one value column populated
CHECK ( (value_boolean IS NOT NULL)::int
      + (value_numeric IS NOT NULL)::int
      + (value_text    IS NOT NULL)::int = 1 )

CREATE UNIQUE INDEX rule_values_firm_uq      ON rule_values (rule_id, prop_firm_id) WHERE scope='firm';
CREATE UNIQUE INDEX rule_values_challenge_uq ON rule_values (rule_id, challenge_id) WHERE scope='challenge';
CREATE INDEX rule_values_firm_lookup_idx     ON rule_values (prop_firm_id, rule_id);
```

`ON DELETE RESTRICT` on `rule_id` is deliberate: deleting a rule definition that firms have answered
must be blocked, not silently cascaded (`ADMIN.md` §14).

### 5.5 `platforms` (catalog) + `firm_platforms`

```
platforms
  id uuid PK, key text UNIQUE, name text NOT NULL, slug text UNIQUE,
  logo_media_id uuid → media, website_url text, description text,
  status text, display_order int, created_at, updated_at

firm_platforms                       -- M:N
  prop_firm_id uuid → prop_firms ON DELETE CASCADE
  platform_id  uuid → platforms  ON DELETE RESTRICT
  is_primary   boolean NOT NULL DEFAULT false
  notes        text
  PRIMARY KEY (prop_firm_id, platform_id)
```

Index `(platform_id)` for the reverse lookup (`/platforms/[slug]` → firms).

**`[OPEN]`** Should platform support be modelled per **challenge** as well as per firm? Some firms
offer different platforms per program. A `challenge_platforms` table would handle it. Deferring costs
a migration later; adding it now costs admin-UI complexity. **Needs a decision.**

Catalog rows are entered by an admin. No platform list is hard-coded or seeded from assumption.
`[LOCKED]`

### 5.6 `instruments` (catalog) + `firm_instruments`

```
instruments
  id uuid PK, key text UNIQUE, name text NOT NULL, slug text UNIQUE,
  asset_class text NOT NULL CHECK (asset_class IN
      ('forex','indices','commodities','metals','energies','crypto','stocks','futures','options','other')),
  description text, status text, display_order int

firm_instruments
  prop_firm_id uuid → prop_firms ON DELETE CASCADE
  instrument_id uuid → instruments ON DELETE RESTRICT
  is_allowed boolean NOT NULL DEFAULT true    -- models restrictions, not just availability
  notes text
  PRIMARY KEY (prop_firm_id, instrument_id)
```

`is_allowed` matters: "this firm explicitly prohibits crypto" is different information from "this
firm has no crypto row", and the site must be able to say which. `[LOCKED]`

**`[OPEN]`** Same question as platforms: per-challenge instrument availability?

### 5.7 `offers`

| Column                    | Type                                                 | Notes                                               |
| ------------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| `id`                      | `uuid` PK                                            |                                                     |
| `prop_firm_id`            | `uuid` NOT NULL → `prop_firms` `ON DELETE CASCADE`   |                                                     |
| `affiliate_link_id`       | `uuid` NULL → `affiliate_links` `ON DELETE SET NULL` | Binds a promo to its tracked URL                    |
| `title`                   | `text` NOT NULL                                      |                                                     |
| `description`, `terms`    | `text`                                               |                                                     |
| `code`                    | `text`                                               | The discount code                                   |
| `discount_type`           | `text`                                               | `CHECK IN ('percent','fixed','free_trial','other')` |
| `discount_value`          | `numeric(10,2)`                                      |                                                     |
| `discount_currency`       | `char(3)`                                            | Required when `discount_type='fixed'`               |
| `starts_at`, `ends_at`    | `timestamptz`                                        | `ends_at` NULL = open-ended                         |
| `status`, `display_order` |                                                      |                                                     |
| audit + soft-delete       |                                                      |                                                     |

```sql
CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
CHECK (discount_type <> 'percent' OR discount_value BETWEEN 0 AND 100)
CHECK (discount_type <> 'fixed'   OR discount_currency IS NOT NULL)
CREATE UNIQUE INDEX offers_firm_code_uq ON offers (prop_firm_id, lower(code))
       WHERE code IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX offers_active_idx ON offers (status, ends_at, display_order)
       WHERE status='published' AND deleted_at IS NULL;
```

**Expiry `[LOCKED]`:** "active" is computed at query time
(`status='published' AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now())`).
It is **never** a stored boolean, because a stored flag goes stale the moment nobody runs the job.

### 5.8 `media`

| Column                     | Type                                        | Notes                                                     |
| -------------------------- | ------------------------------------------- | --------------------------------------------------------- |
| `id`                       | `uuid` PK                                   |                                                           |
| `storage_provider`         | `text` NOT NULL                             | `r2` / `s3` / `vercel_blob`                               |
| `storage_key`              | `text` NOT NULL UNIQUE                      | Path in the bucket                                        |
| `public_url`               | `text` NOT NULL                             | CDN URL                                                   |
| `mime_type`                | `text` NOT NULL                             | Validated by magic bytes                                  |
| `byte_size`                | `bigint` NOT NULL                           |                                                           |
| `width`, `height`          | `integer`                                   | **Required for images** — prevents CLS (`SEO.md` §13)     |
| `blur_placeholder`         | `text`                                      | Base64 LQIP                                               |
| `checksum_sha256`          | `char(64)` NOT NULL UNIQUE                  | De-duplication                                            |
| `alt_text`                 | `text` NOT NULL                             | **Required at upload** `[LOCKED]` — accessibility and SEO |
| `title`, `caption`         | `text`                                      |                                                           |
| `uploaded_by_admin_id`     | `uuid` → `admin_users` `ON DELETE SET NULL` |                                                           |
| `created_at`, `deleted_at` |                                             |                                                           |

`CHECK (mime_type NOT LIKE 'image/%' OR (width IS NOT NULL AND height IS NOT NULL))`

**`media_usages` `[APPROVED]`** — required by "dependency/impact awareness" (`ADMIN.md` §14):
`media_id`, `entity_type`, `entity_id`, `field`, PK on all four. Lets the admin answer _"what breaks
if I delete this logo?"_ before deletion, rather than after.

### 5.9 `affiliate_links`

| Column                 | Type                                               | Notes                                               |
| ---------------------- | -------------------------------------------------- | --------------------------------------------------- |
| `id`                   | `uuid` PK                                          |                                                     |
| `prop_firm_id`         | `uuid` NOT NULL → `prop_firms` `ON DELETE CASCADE` |                                                     |
| `label`                | `text` NOT NULL                                    | Internal name                                       |
| `destination_url`      | `text` NOT NULL                                    | The affiliate URL — **treated as a secret in logs** |
| `network`              | `text`                                             | e.g. the partner network name                       |
| `campaign`             | `text`                                             | Optional campaign key used by `/go?c=`              |
| `is_default`           | `boolean` NOT NULL DEFAULT false                   |                                                     |
| `status`               | `text` NOT NULL DEFAULT `'active'`                 | `CHECK IN ('active','paused','archived')`           |
| `starts_at`, `ends_at` | `timestamptz`                                      |                                                     |
| `commission_notes`     | `text`                                             | **Commercial — never rendered publicly** `[LOCKED]` |
| audit + soft-delete    |                                                    |                                                     |

```sql
-- exactly one default per firm
CREATE UNIQUE INDEX affiliate_links_default_uq ON affiliate_links (prop_firm_id)
       WHERE is_default AND deleted_at IS NULL AND status = 'active';

CREATE UNIQUE INDEX affiliate_links_campaign_uq ON affiliate_links (prop_firm_id, campaign)
       WHERE campaign IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX affiliate_links_firm_idx ON affiliate_links (prop_firm_id, status);
CHECK (destination_url ~ '^https://')      -- affiliate destinations must be HTTPS
```

The partial unique index is the mechanism that makes "one default link per firm" a **database
guarantee** rather than an application hope.

### 5.10 `affiliate_clicks` `[APPROVED]`

Required to implement the affiliate tracking requirement (`PROJECT.md` §5, `ARCHITECTURE.md` §11).
Approved 2026-09-03.

| Column                       | Type                                                     | Notes                                                                                                                                                                                             |
| ---------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                         | `bigint` identity PK                                     |                                                                                                                                                                                                   |
| `affiliate_link_id`          | `uuid` NOT NULL → `affiliate_links` `ON DELETE RESTRICT` | Never lose click history to a link deletion                                                                                                                                                       |
| `prop_firm_id`               | `uuid` NOT NULL                                          | **Denormalised** for reporting speed                                                                                                                                                              |
| `offer_id`                   | `uuid` NULL → `offers` `ON DELETE SET NULL`              |                                                                                                                                                                                                   |
| `placement`                  | `text`                                                   | `hero`, `directory_row`, `firm_profile`, `offer_card`, …                                                                                                                                          |
| `clicked_at`                 | `timestamptz` NOT NULL DEFAULT `now()`                   |                                                                                                                                                                                                   |
| `country_code`               | `char(2)`                                                | From the edge, not from IP storage                                                                                                                                                                |
| `device_type`                | `text`                                                   |                                                                                                                                                                                                   |
| `referrer_host`              | `text`                                                   | **Host only**, never the full URL                                                                                                                                                                 |
| `landing_path`               | `text`                                                   |                                                                                                                                                                                                   |
| `session_id`                 | `text`                                                   | First-party, rotating                                                                                                                                                                             |
| `user_id`                    | `uuid` NULL → `users` `ON DELETE SET NULL`               |                                                                                                                                                                                                   |
| `is_bot`                     | `boolean` NOT NULL DEFAULT false                         | Flagged, not deleted                                                                                                                                                                              |
| `is_internal`                | `boolean` NOT NULL DEFAULT false                         | `[APPROVED]` Internal / admin / test traffic — requests carrying a valid admin session. **Secondary protection and classification only** (§5.10a). Excluded from all reporting alongside `is_bot` |
| `ip_hash`, `user_agent_hash` | `text`                                                   | Salted SHA-256. **Raw values are never stored** `[LOCKED]`                                                                                                                                        |

Indexes: `(affiliate_link_id, clicked_at DESC)`, `(prop_firm_id, clicked_at DESC)`,
`(clicked_at DESC) WHERE NOT is_bot AND NOT is_internal`.

#### 5.10a `is_internal` — secondary protection only `[APPROVED]`

**The primary affiliate-preview protection is structural, and `is_internal` does not replace it.**
`[LOCKED]`

| Layer                          | Mechanism                                                                                                    | Guarantee                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| **Primary — structural**       | Under preview, `AffiliateCta` renders with **no affiliate `href`**; the iframe has no `allow-top-navigation` | **No request is issued, so no click row is ever created.** Does not depend on any filter being correct |
| **Secondary — classification** | `/go/[slug]` sets `is_internal = true` for a request carrying a valid admin session                          | Catches internal, admin, and test traffic that reaches `/go` by some other route                       |

Rules `[LOCKED]`:

1. **Preview CTAs must not have an affiliate href.**
2. **Preview must never create a real affiliate click.**
3. `is_internal` is **classification and defence in depth only**. It must never be treated as the
   reason preview is safe, and a change that made preview rely on it would be a defect.
4. Rows flagged `is_internal` are **excluded from every report and rollup**, alongside `is_bot`.
   They are flagged, never deleted — the same policy as bot traffic.

#### 5.10b Growth plan and rollups `[PROPOSED]`

Monthly range partitioning on `clicked_at`, plus an `affiliate_click_daily_rollups` aggregate table.

```
affiliate_click_daily_rollups
  date               date     NOT NULL
  prop_firm_id       uuid     NOT NULL          -- dimension
  affiliate_link_id  uuid     NOT NULL          -- dimension
  placement          text                       -- dimension
  country_code       char(2)                    -- dimension
  reportable_clicks  bigint   NOT NULL DEFAULT 0  -- NOT bot AND NOT internal
  bot_clicks         bigint   NOT NULL DEFAULT 0
  internal_clicks    bigint   NOT NULL DEFAULT 0  -- admin / preview / test traffic
  total_clicks       bigint   NOT NULL DEFAULT 0  -- reportable + bot + internal
  UNIQUE (date, prop_firm_id, affiliate_link_id, placement, country_code)
```

**Rollup rules `[LOCKED]`** — consistent with the `is_internal` behaviour approved in §5.10a:

1. **`reportable_clicks` is the only figure shown in any report, chart, or export.** It counts rows
   where `NOT is_bot AND NOT is_internal`, matching the partial index in §5.10 exactly.
2. **`bot_clicks` and `internal_clicks` are retained separately, never merged and never discarded.**
   Excluded traffic is _classified_, not deleted — the same policy as raw rows.
3. `total_clicks` exists solely for reconciliation (`reportable + bot + internal = total`). It is a
   diagnostic, and must never be presented as a performance figure.
4. **No rollup row is ever created for a partner-reported conversion.** Conversions come only from
   network postbacks and live in their own future table (`ARCHITECTURE.md` §11.3).

Raw rows retained 12 months, then dropped by partition. **Retention window needs owner approval**
(`ARCHITECTURE.md` §17 — default 12 months if never revisited).

**Conversions** are a separate future table, populated only from partner postbacks. Never inferred.
`[LOCKED]`

### 5.11 `seo_metadata`

| Column                       | Type                                  | Notes                                                                                        |
| ---------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------- |
| `id`                         | `uuid` PK                             |                                                                                              |
| `entity_type`                | `text`                                | `CHECK IN ('prop_firm','challenge','platform','instrument','article','page','static_route')` |
| `entity_id`                  | `uuid` NULL                           |                                                                                              |
| `route_path`                 | `text` NULL                           | For static routes with no row (`/`, `/about`)                                                |
| `title`                      | `text`                                | `CHECK (length(title) <= 70)`                                                                |
| `meta_description`           | `text`                                | `CHECK (length(meta_description) <= 160)`                                                    |
| `canonical_url`              | `text`                                | **Override only** — normally derived                                                         |
| `og_title`, `og_description` | `text`                                | Fall back to `title`/`meta_description`                                                      |
| `og_image_media_id`          | `uuid` → `media` `ON DELETE SET NULL` |                                                                                              |
| `twitter_card`               | `text`                                | `CHECK IN ('summary','summary_large_image')`                                                 |
| `robots_index`               | `boolean` NOT NULL DEFAULT true       |                                                                                              |
| `robots_follow`              | `boolean` NOT NULL DEFAULT true       |                                                                                              |
| `include_in_sitemap`         | `boolean` NOT NULL DEFAULT true       |                                                                                              |
| `structured_data_override`   | `jsonb`                               | Escape hatch; validated before render                                                        |
| `keywords`                   | `text[]`                              | Internal targeting notes, **not** a meta-keywords tag                                        |
| audit columns                |                                       |                                                                                              |

```sql
CHECK ( (entity_id IS NOT NULL AND route_path IS NULL)
     OR (entity_id IS NULL AND route_path IS NOT NULL) )
CREATE UNIQUE INDEX seo_entity_uq ON seo_metadata (entity_type, entity_id) WHERE entity_id IS NOT NULL;
CREATE UNIQUE INDEX seo_route_uq  ON seo_metadata (route_path)             WHERE route_path IS NOT NULL;
```

**Every field is optional.** A missing row means "use the deterministic template" — it does not mean
"no metadata". `[LOCKED]`

### 5.12 Supporting Phase 1 tables `[APPROVED]`

Required by explicitly requested Phase 1 _behaviour_ (`ADMIN.md`). Approved 2026-09-03.

**`entity_versions`** — version history and rollback (`ADMIN.md` §9):
`id`, `entity_type`, `entity_id`, `version_number int`, `snapshot jsonb NOT NULL` (the full entity
plus its children), `label text`, `is_published boolean`, `created_by_admin_id`, `created_at`.
`UNIQUE (entity_type, entity_id, version_number)`; index `(entity_type, entity_id, version_number DESC)`.
Append-only, same as `audit_logs`.

**`redirects`** — URL stability (`SEO.md` §7):
`id`, `from_path text NOT NULL` (normalised: lowercase, leading slash, no trailing slash, no query),
`to_path text NOT NULL`, `status_code smallint NOT NULL DEFAULT 301 CHECK (status_code IN (301,302,307,308,410))`,
`is_active boolean`, `reason text`, `source text CHECK (source IN ('auto_slug_change','manual','import'))`,
`hit_count bigint DEFAULT 0`, `last_hit_at`, audit columns.
`CREATE UNIQUE INDEX ON redirects (from_path) WHERE is_active;`
`CHECK (from_path <> to_path)` — blocks the trivial loop; multi-hop loop detection is service-layer.

**`internal_notes`** — private admin notes (`ADMIN.md` §12):
`id`, `entity_type`, `entity_id`, `body text NOT NULL`, `is_pinned boolean`,
`created_by_admin_id`, `created_at`, `updated_at`.
Index `(entity_type, entity_id, is_pinned DESC, created_at DESC)`.
**Never exposed on any public route or in any public API response.** `[LOCKED]`

---

## 6. Future-phase tables (documented, **not** implemented)

Designed now only so Phase 1 does not paint the schema into a corner. **Do not create these.**
`[LOCKED]`

### 6.1 Phase 2 — payout tracking

| Table                  | Purpose                              | Key relationships and notes                                                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `payouts`              | One trader-reported payout event     | → `prop_firms`, → `users`, → `challenges` (nullable). `amount numeric(14,2)`, `currency`, `requested_at`, `received_at`, `processing_hours` (generated), `method`, `status` (`pending`/`verified`/`rejected`/`disputed`). Index `(prop_firm_id, received_at DESC)` |
| `payout_transactions`  | Individual transfers within a payout | → `payouts` `ON DELETE CASCADE`. Supports split/partial payouts                                                                                                                                                                                                    |
| `payout_verifications` | The evidence and moderation trail    | → `payouts`, → `admin_users`. `evidence_media_id` → `media`, `method` (`screenshot`/`firm_confirmed`/`bank_record`), `outcome`, `reviewed_at`, `notes`. **Separate from `payouts` so evidence and PII can be retained, redacted, or purged independently**         |

**Aggregates** (average payout time, totals) are **derived** — materialised views or rollup tables,
recomputed on verification. Never hand-entered. `[LOCKED]`

### 6.2 Phase 3 — reviews

| Table            | Purpose                      | Notes                                                                                                                                                                                                                                                                         |
| ---------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reviews`        | One review per user per firm | → `prop_firms`, → `users`. `UNIQUE (prop_firm_id, user_id) WHERE deleted_at IS NULL` — **one review per user per firm, enforced by the database**                                                                                                                             |
|                  |                              | Category scores (`trading_conditions`, `customer_support`, `platform`, `payout_process`) as `numeric(2,1) CHECK (1..5)`; `overall_rating`; `title`; `body`; `status` (`pending`/`published`/`rejected`/`hidden`); `is_verified_trader`; `verification_method`; `published_at` |
| `review_reports` | Abuse/manipulation reports   | → `reviews`, → `users` (reporter), `reason`, `status`, `resolved_by_admin_id`. `UNIQUE (review_id, reporter_user_id)`                                                                                                                                                         |

Firm rating aggregates land on `prop_firms` **only when Phase 3 ships** — as
`rating_avg numeric(3,2)`, `rating_count integer`, recomputed from published reviews.
**These columns must not be created early**, because a nullable rating column is an invitation to
fill it with a guess. `[LOCKED]`

### 6.3 Later phases

| Table             | Purpose                                   | Notes                                                                                                                                |
| ----------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `favorites`       | User ↔ firm                               | PK `(user_id, prop_firm_id)`; a rollup `favorite_count` on the firm                                                                  |
| `submissions`     | Public "add a firm" submissions           | Staging only — **never writes directly to `prop_firms`**; an admin promotes it                                                       |
| `update_requests` | Correction requests from firms or traders | → `prop_firms`, `field`, `current_value`, `proposed_value`, `evidence_url`, `status`. Feeds the verification workflow                |
| `articles`        | Blog/editorial                            | `slug` unique, `author_admin_id`, `body`, `status`, `published_at`, → `seo_metadata`                                                 |
| `pages`           | Editable static pages                     | `path` unique, `body`, `status`                                                                                                      |
| `faqs`            | Q&A, reusable per-entity                  | `question`, `answer`, optional `entity_type`/`entity_id`, `display_order`. Powers `FAQPage` JSON-LD — **only for genuine questions** |

---

## 7. Constraint summary

The constraints that carry the most weight:

| #   | Constraint                                                                | Why                                                  |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1   | `prop_firms.slug` partial-unique on live rows                             | URL identity; deletion must free the slug            |
| 2   | `challenges (prop_firm_id, slug)` partial-unique                          | Scoped identity                                      |
| 3   | `affiliate_links` one active default per firm                             | Deterministic `/go` resolution                       |
| 4   | `rule_values` exactly-one-target + exactly-one-value                      | Prevents malformed EAV rows                          |
| 5   | `seo_metadata` exactly one of `entity_id` / `route_path`                  | Prevents ambiguous metadata                          |
| 6   | `reviews (prop_firm_id, user_id)` unique (Phase 3)                        | Anti review-stuffing, at the DB level                |
| 7   | `media.checksum_sha256` unique                                            | De-duplication                                       |
| 8   | `audit_logs` / `entity_versions` append-only                              | Tamper evidence                                      |
| 9   | `offers.ends_at > starts_at`                                              | Impossible windows                                   |
| 10  | `ON DELETE RESTRICT` on catalog FKs (`rules`, `platforms`, `instruments`) | Deleting a referenced catalog entry must fail loudly |
| 11  | Percent columns bounded 0–100                                             | Catches unit errors (0.8 vs 80) at write time        |
| 12  | `redirects.from_path` unique among active                                 | One destination per URL                              |

---

## 8. Index strategy

Beyond the per-table indexes above:

- **Every foreign key gets an index.** Postgres creates none automatically; without them, cascades
  and reverse lookups sequentially scan.
- **Partial indexes for public reads** — `WHERE status='published' AND deleted_at IS NULL` matches
  the shape of every public query and keeps the index small.
- **Composite order matters** — leading column is the equality filter, trailing columns the sort.
- **`pg_trgm` GIN indexes** on `prop_firms.name` and `challenges.name` for admin fuzzy search
  (`ADMIN.md` §3). Full-text search (`tsvector`) is `[OPEN]` and only needed if public search ships.
- **Covering indexes (`INCLUDE`)** for the directory listing, if `EXPLAIN` shows heap fetches
  dominating. Add on evidence, not on speculation.
- **Do not pre-index on guesswork.** Every index costs write throughput. Add from `EXPLAIN ANALYZE`
  against realistic volumes.

Expected Phase 1 volumes are small (hundreds of firms, thousands of challenges); the only table with
real growth is `affiliate_clicks`, which is why it gets a partitioning plan and the others do not.

---

## 9. Data integrity operations

- **Migrations** are versioned SQL, reviewed in PRs, applied in CI. Expand-then-contract only.
  (`ARCHITECTURE.md` §16.3) `[LOCKED]`
- **Seeds** contain _structural_ data only — roles, permissions, and the rule catalog. **No firms, no
  challenges, no offers, no ratings.** `[LOCKED]`
- **`Lucid Prop`** is the designated initial example/test firm. Its record may be created as a
  fixture; **its field values must be entered by a human, not generated.** `[LOCKED]`
- **Backups**: daily automated + PITR; restores tested on a schedule.
- **Integrity job**: a scheduled check for polymorphic orphans, unreferenced media, redirect loops,
  and firms with `verified_at` older than the staleness threshold.

---

## 10. Open questions requiring an owner decision

**No blocking questions remain.** The four below are non-blocking and can be settled during Phase 1.

1. **SEO polymorphism (§3.1)** — one polymorphic `seo_metadata` table, or per-entity SEO tables?
   _Default if unresolved: the polymorphic table as specified._
2. **Per-challenge platforms/instruments (§5.5, §5.6)** — model now or defer? Deferring costs a
   migration later. _Default: defer._
3. **Affiliate click retention (§5.10)** — how long are raw rows kept before rollup-only?
   _Default: 12 months raw, then rollup-only._
4. **Public search (§8)** — is `tsvector` full-text search needed in Phase 1, or is admin-side
   `pg_trgm` sufficient? _Default: `pg_trgm` only._

**Resolved 2026-09-03:**

| Question                 | Resolution                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ORM                      | **Drizzle** (`ARCHITECTURE.md` §4)                                                                                                                                                   |
| Database host            | **Neon** (`ARCHITECTURE.md` §3.3)                                                                                                                                                    |
| Rule modelling (§5.4)    | **Hybrid** column + catalog model approved, with the placement rule and promotion path                                                                                               |
| Multi-currency (§1.3)    | **Store originals with source currency; never silently convert.** No base-currency column                                                                                            |
| Supporting tables        | **All nine approved:** `admin_sessions`, `permissions`, `role_permissions`, `admin_user_roles`, `affiliate_clicks`, `entity_versions`, `redirects`, `internal_notes`, `media_usages` |
| Soft vs hard delete      | **Soft delete** is the model throughout — `deleted_at` with partial unique indexes (§1.1, §3.3). Hard deletion is not a product operation                                            |
| **Draft model (§3.2.1)** | **`draft_payload` on the firm aggregate.** `LIVE → EDIT DRAFT → PREVIEW → PUBLISH`; published columns unchanged until an explicit publish. Locked 2026-09-03                         |
