# DB5 — Index Design: Catalog, Gallery & Content (CTX-CAT / CTX-GAL / CTX-CNT)

**Date:** 2026-07-18 · **Git HEAD:** `456e101`
**Tables:** TBL-011..TBL-017, TBL-064..TBL-069
**Index IDs:** IDX-010..015, 050, 052..055, 065..071, 108

This is the read-mostly half of the system: ≤100 products, a curated
gallery, a handful of content pages. Write rates are near zero (editorial
edits), so index cost is negligible and the design optimizes for public
read paths and correct publication scoping.

## 1. Public listing (Q-01)

**IDX-065** — `products (category_id, display_order, id) WHERE status='PUBLISHED'`

Composite justification:

- `category_id` is the **equality** predicate → leads.
- `display_order` is the **sort** → follows equality.
- `id` is the **tie-breaker** — `display_order` is not unique, so without it
  neither offset nor keyset paging is deterministic (ADR-DB5-001 R2).
- The partial predicate carries the **security scope**: public callers may
  never see DRAFT or ARCHIVED products. Putting it in the index rather than
  in post-fetch filtering keeps page sizes uniform (ADR-DB5-001 R4).
- **Why not narrower:** `(category_id)` alone forces a sort of the bucket.
- **Why not wider:** adding `name` or `base_price_amount` as INCLUDE columns
  is unjustified without measurement (ADR-DB5-004 R4); ≤100 rows means heap
  fetches are cheap. Recorded as a future INCLUDE candidate only.
- **Leading-prefix utility:** `(category_id)` serves per-category counts, so
  REL-020 needs no separate FK index.

The unfiltered "all published products" form may legitimately sequential-scan
100 rows; that is not a failure (ADR-DB5-004 R8, EXPLAIN scenario E1).

`archived_at` (COL-TBL012-08) is **evidence, not a filter** — archival is
expressed by `status='ARCHIVED'`, and no index uses the timestamp.

## 2. Product detail (Q-02)

| Level | Index | Note |
|---|---|---|
| entry by slug | IDX-011 (CST-011) | unique probe; Population A bytewise |
| variants | IDX-068 `(product_id, display_order)` | |
| SKUs | IDX-069 `(product_variant_id)` | also serves Q-03 |
| sides | IDX-070 `(product_id, display_order)` | |
| areas | IDX-071 `(product_side_id, display_order)` | |
| media | IDX-015 prefix (CST-013) | |

Media ordering: `product_media (product_id, display_order)` was proposed and
**rejected** (IDX-R07). CST-013's unique index leads with `product_id` and
locates the rows; sorting ≤ dozens of media rows in memory costs nothing.
Adding an index to avoid a trivial sort is the redundancy ADR-DB5-004 R5
exists to catch.

SKU code lookup uses IDX-014 (CST-012) — bytewise exact, per ADR-DB5-002 R2.

## 3. Publication and display ordering

All four publishable entities share the `DRAFT/PUBLISHED/ARCHIVED` set
(DB3 §1). Locked pattern: **publication state lives in a partial index
predicate, ordering lives in the keys.**

| Entity | Index | Predicate | Keys |
|---|---|---|---|
| products | IDX-065 | `status='PUBLISHED'` | `(category_id, display_order, id)` |
| gallery_entries | IDX-066 | `status='PUBLISHED'` | `(display_order, id)` |
| content_pages | IDX-067 | `status='PUBLISHED' AND is_indexable` | `(id)` |
| design_templates | — | — | tiny table; no index beyond IDX-013 |

## 4. Gallery (Q-04)

**IDX-066** serves the published listing; `gallery_entry_assets` is reached
via IDX-050's prefix (CST-043). A `(gallery_entry_id, display_order)` index
was **rejected** (IDX-R08) for the same reason as media.

**Security constraint carried into the design:** gallery associations may
expose **public derivatives only** (CST-123, INV-09). Classification lives
on the asset row (`assets.classification`, COL-TBL022-02), so the check is a
column test on the joined asset — it is not, and must not become, an
assumption baked into the association index. An index cannot enforce this;
D7-12 tests the representation.

`linked_product_id` (REL-096) gets no index (IDX-R15) — the table is tiny.

## 5. Content, redirects and sitemap

| Query | Predicate | Index |
|---|---|---|
| Q-05 page lookup | `(page_type, slug)` + `status='PUBLISHED'` | IDX-052 (CST-044) |
| Q-07 redirect | `source_path = ?` then check `is_active` | IDX-053 (CST-044) |
| Q-06 sitemap | `status='PUBLISHED' AND is_indexable` per table | IDX-067 + IDX-065/066 |

Q-07's `is_active` partial index was **rejected** (IDX-R05): the unique
probe on `source_path` returns exactly one row, and testing a boolean on
that row is free. A partial index would add write cost and serve nothing.

Q-06 runs **three independent small scans** unioned in the application, not
a database-level UNION view — cross-context read composition stays in the
application layer (ADR-DB1-009 rule 14).

`content_pages.body` (COL-TBL066-04) is **never indexed**. It is rendered
content with no version history in MVP; no query filters on it, and a
full-text index would be a P3 feature built speculatively
(ADR-DB5-002 R6).

## 6. Effective agreement version (QX-07) — P0

**IDX-108** — `agreement_versions (agreement_id, effective_from DESC, id DESC) WHERE status='PUBLISHED'`

This is the only P0 path in this context, because GRD-008 resolves the
effective agreement set **inside the approval transaction**: an approval
snapshot must record the exact version and hash the customer accepted
(REL-055, CST-024).

- `agreement_id` equality leads.
- `effective_from DESC` puts the newest candidate first; the query takes the
  first row with `effective_from <= now()` and stops.
- `status='PUBLISHED'` in the predicate **structurally excludes**
  DRAFT/SUPERSEDED/WITHDRAWN, so "not superseded or withdrawn" needs no
  separate clause — the states are mutually exclusive members of one set.
- `EFFECTIVE` is **derived, never stored** (COL-TBL069-03). No index implies
  otherwise.
- The `now()` comparison is a **range scan on the key**, never an index
  predicate (ADR-DB5-003 R3).

IDX-108 is not redundant with IDX-055 (CST-045, `(agreement_id, version)`):
same leading column, different second key. Ordering by `version` would be
wrong — a version published later can have an earlier `effective_from`.

**CST-046** (at most one effective version per agreement) remains an
exclusion **candidate** (IDX-056, conditional). Its primary defense is the
publish transaction; adopting the exclusion constraint would require an
extension, which is disproportionate at a handful of rows. See
[`DB5_CONSTRAINT_INDEX_MAP.md`](./DB5_CONSTRAINT_INDEX_MAP.md) §4.

## 7. Text and collation

All lookup keys in this context — `slug`, `source_path`, `page_type`,
`code`, `agreement_type`, `config_key` — are **Population A** (ADR-DB5-002
R1): bytewise `C` comparison, stored pre-normalized, no expression index.

Vietnamese linguistic ordering of `products.name`, `categories.name`,
`gallery_entries.title` is **Population B** and is deliberately **not
indexed**: no catalogued listing sorts by name (all sort by
`display_order`). When a name-sorted listing appears, ADR-DB5-002 R4 locks
the mechanism (`vi-x-icu`) and R9/ADR-DB5-004 R10 require the DB10 REINDEX
step to activate in the same change.

## 8. Write-cost summary

| Table | Profile | Indexes (incl. PK) | Budget | Status |
|---|---|---|---|---|
| TBL-011 categories | read-mostly | 2 | ≤6 | ok |
| TBL-012 products | read-mostly | 3 | ≤6 | ok |
| TBL-013 product_variants | read-mostly | 2 | ≤6 | ok |
| TBL-014 skus | read-mostly | 3 | ≤6 | ok |
| TBL-015 product_sides | read-mostly | 2 | ≤6 | ok |
| TBL-016 embroidery_areas | read-mostly | 2 | ≤6 | ok |
| TBL-017 product_media | read-mostly | 2 | ≤6 | ok |
| TBL-064 gallery_entries | read-mostly | 3 | ≤6 | ok |
| TBL-065 gallery_entry_assets | read-mostly | 2 | ≤6 | ok |
| TBL-066 content_pages | read-mostly | 3 | ≤6 | ok |
| TBL-067 redirect_rules | read-mostly | 2 | ≤6 | ok |
| TBL-068 agreements | read-mostly | 2 | ≤6 | ok |
| TBL-069 agreement_versions | append-ish (immutable once published) | 3 | ≤6 | ok |

Every table is well inside budget. This context is where over-indexing would
be *cheapest* and therefore most tempting; the rejections in §2/§4/§5
(IDX-R05, R07, R08, R11, R15) are recorded so the restraint is auditable
rather than accidental.

## 9. Validation handoff

- **DB7:** CST-011/012/013/044/045 uniqueness; D7-12 gallery/asset
  classification representation.
- **DB8:** approve-vs-publish race on agreement versions (CST-046 direction).
- **DB9:** seed must include DRAFT and ARCHIVED rows alongside PUBLISHED, or
  the partial indexes are never exercised; and at least two agreement
  versions with staggered `effective_from` for QX-07.
- **DB10:** if a `vi-x-icu` index is ever added here, activate the
  collation-drift REINDEX step in the same change.
