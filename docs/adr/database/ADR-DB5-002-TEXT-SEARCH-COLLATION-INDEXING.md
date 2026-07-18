# ADR-DB5-002 — Text Search, Collation and Slug/Token Lookup Indexing

- Status: Accepted
- Date: 2026-07-18
- Git HEAD: `456e101` (DB4 baseline)
- Decision IDs: DEC-DB5-02
- Query IDs: Q-02, Q-05, Q-07, Q-08, Q-28, Q-31, Q-21, Q-01, Q-04, QX-08
- Constraint IDs: CST-004, CST-008, CST-011, CST-012, CST-017, CST-019,
  CST-026, CST-029, CST-035, CST-040, CST-044, CST-047, CST-048
- Depends on: [ADR-DB1-001](./ADR-DB1-001-POSTGRESQL-VERSION.md) (`C`
  default collation, no baseline extension)

## Context

ADR-DB1-001 locked the database default collation to **`C`** and locked
that **no extension is part of the baseline**. It explicitly deferred
per-column/per-index/per-query Vietnamese collation design to DB4/DB5.
DB4 created no collation design. This ADR closes that.

The system's text lookups split cleanly into two populations that have
nothing in common except their storage type, and conflating them is the
main risk this ADR exists to prevent.

## Decision Drivers

- Under `C` collation, comparison is **bytewise**. This is exactly right
  for identifiers and exactly wrong for Vietnamese human-readable text
  (`Đ` sorts after `Z`; `à` after `z`; diacritics order arbitrarily).
- A B-tree index is only usable for an equality/range lookup when the
  query's collation matches the index's collation. A collation mismatch
  silently disables the index.
- Security-critical lookups (Q-08 grant token, Q-28 idempotency key) must
  be **exact-match, unguessable, and constant in shape** — never fuzzy,
  never case-folded, never locale-dependent.
- No extension may be assumed present (ADR-DB1-001). Any design that needs
  `pg_trgm` or `unaccent` must ship with a working fallback.
- Vietnamese full-text search is a P3 concern (outside MVP) per the query
  priority tiering; over-designing it now would be speculative.

## Options Considered

1. **One global locale-aware default collation** — rejected already by
   ADR-DB1-001 (drift, reindex risk, and it would degrade the identifier
   lookups that dominate the hot paths).
2. **`C` everywhere, sort in the application** — correct and zero-risk for
   identifiers; for user-facing lists it moves Vietnamese ordering into
   Node, which is acceptable only while result sets are page-sized.
3. **`C` default + explicit ICU collation on the few user-facing text
   columns/indexes that need linguistic order** (chosen).
4. **`pg_trgm` similarity search now** — rejected for MVP: requires a
   non-baseline extension for a P3 requirement.

## Decision

### R1 — Two text populations are formally distinguished

**Population A — technical exact-match identifiers.**
Bytewise semantics are *required*, not merely acceptable.

| Column | Table | Constraint | Query |
|---|---|---|---|
| `token_hash` | `secure_access_grants` | CST-008 | Q-08 |
| `token_hash` | `admin_sessions` | CST-004 | admin auth |
| `session_secret_hash` | `design_sessions` | CST-019 | session resume |
| `code_hash` | `contact_verification_challenges` | — | Q-31 |
| `scope_key`, `operation_namespace` | `idempotency_records` | CST-048 | Q-28 |
| `fingerprint` | `idempotency_records` | GRD-030 | Q-28 |
| `provider_event_ref`, `provider_key` | `payment_provider_events` | CST-040 | Q-16 |
| `provider_ref` | `payment_attempts` | — | Q-16 |
| `slug` | `categories`, `products`, `gallery_entries`, `design_templates`, `content_pages` | CST-011, CST-044 | Q-02, Q-04, Q-05 |
| `source_path` | `redirect_rules` | CST-044 | Q-07 |
| `code` | `custom_requests`, `orders`, `quotations`, `skus` | CST-026/029/035/012 | Q-15, Q-21 |
| `storage_key` | `assets`, `asset_derivatives` | CST-017 | Q-30 |
| `intent_key` | `notification_intents` | CST-047 | QX-03 |
| `config_key` | `policy_configurations` | CST-050 | config read |
| `correlation_id` | `audit_events`, transitions | — | Q-29 |
| `normalized_value` | `customer_contact_points`, `contact_verification_challenges` | CST-005, CST-007 | Q-31, QX-08 |
| `document_hash`, `content_hash`, `preview_hash`, `checksum` | several | CST-070 | GRD-007/008 |

**Population B — user-facing Vietnamese text.**
Linguistic order/search may be required.

`products.name`, `categories.name`, `gallery_entries.title`,
`content_pages.title`, `design_templates.name`, `customers.display_name`,
`customer_contact_points.display_value`, `shipping_details` address fields,
`order_items.product_name` and other frozen display copies.

### R2 — Population A uses the `C` database default, unchanged

- No `COLLATE` clause on any Population A column or index.
- Comparison is bytewise; equality is byte equality.
- The existing unique constraints (CST-004/008/011/012/017/019/026/029/
  035/040/044/047/048/050) already provide the B-tree index that serves
  each lookup. **No additional performance index is created for any
  Population A exact lookup** — that would be a pure duplicate.
- This is the reason `C` was chosen in ADR-DB1-001, and it is why the hot
  security lookups (Q-08, Q-28) need no special handling: they are unique
  index probes on bytewise-compared text.

### R3 — Normalization happens in the application, before the column

`normalized_value` (contacts), slugs, and codes are stored **already
normalized** — lowercase email, E.164-style phone (CON-163/164), slugified
paths. Consequences, locked:

- **No `lower()` expression index is needed anywhere.** A functional index
  on `lower(email)` would be a workaround for a normalization gap that
  this schema does not have.
- The uniqueness constraints are therefore genuine business uniqueness, not
  approximations of it.
- Normalization rules are owned by the writing module and tested at DB7;
  a normalization change is a data migration, not an index change.

`customer_contact_points.display_value` retains the as-entered form for
display and is **never** a lookup key.

### R4 — Population B: explicit ICU collation, applied narrowly

- Vietnamese linguistic ordering uses the **explicit ICU collation
  `vi-x-icu`**, applied per index/query — never as a database, schema, or
  table default.
- It is applied **only** where a query actually sorts or searches by that
  text in a user-visible linguistic order.
- At MVP scale the honest assessment is that **almost nothing needs it in
  the database**:
  - Q-01 product listing sorts by `display_order` (editorial), not by name.
  - Q-04 gallery listing sorts by `display_order`.
  - Q-05 content lookup is by `(page_type, slug)` — Population A.
  - Admin listings sort by `created_at`.
- Therefore **no ICU-collated index is created at DB6 for the MVP query
  set.** The collation choice is *locked* so that when a name-ordered
  listing appears, it is implemented one way; it is not *built* now.
- Where a page-sized result needs Vietnamese order today, sorting in the
  application over ≤100 rows is the locked approach (ADR-DB1-001 permits
  "application-side sorting where simpler"), and it is simpler here.

### R5 — Nondeterministic collations are permitted but unused in MVP

Case/accent-insensitive matching would need a **nondeterministic** ICU
collation. Locked constraints on any future use:

- A nondeterministic collation **cannot** back a `LIKE`/pattern index and
  interacts poorly with `text_pattern_ops`.
- It must never be applied to Population A: it would make two distinct
  tokens compare equal, which is a **security defect** for `token_hash`
  and a correctness defect for `scope_key`.
- No MVP query requires it. Status: permitted, not used.

### R6 — Vietnamese search is deferred with an explicit ladder

No search feature in the MVP query set requires substring or fuzzy search.
When one appears (admin customer/request search is the likely first), the
locked escalation ladder is:

1. **Prefix search on a normalized column** — `text_pattern_ops` B-tree
   under `C` collation serves `LIKE 'abc%'`. No extension. Covers most
   admin lookup needs.
2. **`pg_trgm` GIN/GiST** for substring and similarity — requires an
   extension request (R7).
3. **PostgreSQL full-text search** (`tsvector` + GIN) — note that PG ships
   **no Vietnamese text-search configuration**; using `simple` plus
   application-side normalization is the realistic form, and its quality
   ceiling should be measured before adopting it.
4. **External search engine** — explicitly out of scope; no provider is
   selected here (that remains an open decision).

Choosing rung 2 or 3 requires an ADR at that time, with measured evidence
that rung 1 is insufficient.

### R7 — Extension policy: request + fallback, never assumed

Per ADR-DB1-001, no extension is baseline. Any DB5 design that would need
`pg_trgm` or `unaccent`:

- must be raised as a **DB6 extension request** with proof the extension
  exists in the pinned image, and
- must state its **fallback** if the request is refused.

**Current status: no extension is requested by DB5.** The MVP index set
runs entirely on core PostgreSQL 16 B-tree. This is a deliberate outcome —
it keeps the image, the backup/restore path, and the upgrade runbook free
of extension coupling.

### R8 — Hashing is independent of collation (reaffirmed)

`document_hash`, `content_hash`, `preview_hash`, `checksum` are
`sha256:<hex>` strings produced by canonicalization (ADR-DB1-012). Their
reproducibility (INV-32) depends on the canonicalization package, **not**
on database collation. Changing any collation must not be treated as
affecting hash comparison — hash equality is byte equality on ASCII hex.

### R9 — Collation drift and REINDEX

Because DB5 introduces **no** locale-aware collation, the collation-drift
exposure recorded in ADR-DB1-001 remains **inactive**. Locked handoffs:

- **DB6:** record `initdb` encoding/collation/ctype/provider; assert the
  `C` baseline.
- **DB10:** the REINDEX-on-collation-drift runbook step stays written but
  dormant. It **activates** the moment any `vi-x-icu` index is created
  (R4). Creating such an index without activating the runbook step is a
  defect.

## Consequences

**Positive**

- Every hot lookup in the system (Q-02, Q-05, Q-07, Q-08, Q-15, Q-21,
  Q-28, Q-30, Q-31, Q-16) is a bytewise unique-index probe with no
  collation dependence and no extra index.
- Zero extension coupling; backup/restore and major-version upgrade stay
  simple.
- The `C` baseline from ADR-DB1-001 is now *justified by the query set*,
  not merely inherited.

**Negative / accepted**

- Vietnamese linguistic sorting is an application concern until a
  name-ordered listing exists. Accepted while result sets are page-sized;
  it does not scale to sorting a large set in Node, which is the trigger
  to build the ICU index.
- No substring search on names in MVP. Accepted: no MVP requirement.

## Deferred

| Item | Owner | Acceptance condition |
|---|---|---|
| Creating a `vi-x-icu` index | DB6+ | a query sorts/searches Population B in the database; DB10 REINDEX step activated same change |
| `pg_trgm` adoption | future ADR | rung-1 prefix search measured insufficient; extension proven in pinned image; fallback stated |
| Vietnamese FTS configuration quality | future ADR | measured recall/precision on real data |

## References

- [ADR-DB1-001](./ADR-DB1-001-POSTGRESQL-VERSION.md) — `C` default, extension policy
- [`DB1_CORRECTION_REPORT.md`](../../database/DB1_CORRECTION_REPORT.md) §E — collation scoping
- [`DB5_SECURITY_SCOPE_REVIEW.md`](../../database/DB5_SECURITY_SCOPE_REVIEW.md) — token lookup paths
- PostgreSQL 16 collation support — https://www.postgresql.org/docs/16/collation.html (checked 2026-07-18)
- PostgreSQL 16 text search configurations (no Vietnamese config shipped) —
  https://www.postgresql.org/docs/16/textsearch-dictionaries.html (checked 2026-07-18)
