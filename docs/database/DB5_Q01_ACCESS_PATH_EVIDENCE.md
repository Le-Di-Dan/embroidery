# DB5 — Q-01 Public Catalog Access-Path Evidence

**Date:** 2026-08-02 · **Checkpoint:** `APP2-B04-C1` · **Decision:** IMP-D037
**Normative for classification:** [ADR-DB5-001](../adr/database/ADR-DB5-001-PAGINATION-STRATEGY.md) R5 (as amended §R10).
**Harness:** `tools/explain-q01-public-catalog.mjs` (`pnpm explain:q01`), decision
content in `tools/explain-q01-access-path.mjs`.

This document exists because `APP2-B04` shipped the first real Q-01
implementation and two claims about it needed measuring rather than asserting:
that the delivered keyset listing is served acceptably, and that **IDX-065**
"serves Q-01". The second claim turns out to need a sharper statement than the
DB5 design documents gave it.

## 1. Machine-checked facts

`pnpm check:pagination-authority` reads this table and requires every canonical
Q-01 authority to agree with it. Editing a value here without editing the
documents (or the reverse) fails the gate.

| Fact | Value |
|---|---|
| `Q-01 pagination class` | `KEYSET` |
| `Q-01 order tuple` | `display_order, id` |
| `Q-01 cursor identity` | `display_order + id + categorySlug` |
| `IDX-065 filtered utility` | `EXACT_ONLY_WITH_CONSTANT_CATEGORY_ID` |
| `IDX-065 unfiltered utility` | `NOT_LEADING_PREFIX_ORDERED` |

## 2. Method

| Item | Value |
|---|---|
| PostgreSQL version | `PostgreSQL 16.14 on x86_64-pc-linux-musl, compiled by gcc (Alpine 15.2.0) 15.2.0, 64-bit` |
| Image | `postgres:16.14-alpine` (the tracked development image) |
| Schema | all 33 tracked migrations, applied in order |
| Statistics | `ANALYZE` after seeding (ADR-DB5-004 R8) |
| Capture | `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` |
| Page size | 20 (`DEFAULT_PAGE_SIZE`) |

The container is disposable, listens on loopback, holds no password
(`POSTGRES_HOST_AUTH_METHOD=trust`) and is removed when the run ends. The
developer's database is neither read nor written.

### 2.1 Fixture cardinality

| Rows | Count |
|---|---|
| `products` `PUBLISHED` | 60 |
| `products` `DRAFT` | 12 |
| `products` `ARCHIVED` | 8 |
| `categories` | 4 — **not seeded**; the locked taxonomy migration 0033 provisions (IMP-D032) |
| Skewed category (`thu-bong`) | 40 of the 60 published rows (dataset D-B) |
| `product_media` / `assets` / `asset_derivatives` | 60 each, one eligible `THUMBNAIL` chain per published product |

Two products share every `display_order` value. That is deliberate: without the
`id` tie-breaker a cursor landing on a duplicated position would skip or repeat
a row, and the plan would look identical either way (ADR-DB5-001 R2).

MVP scale is the point. The locked bound is 20–100 products; seeding a
production-scale catalog would measure a system this one is not.

## 3. Measured plans — planner default

All four are the statement the repository issues, including the correlated
thumbnail subquery.

| Ref | Form | Page | Ordering path | Index | Sort | Rows returned / scanned | Thumbnail loops / rows | Buffers hit / read | Plan ms / exec ms |
|---|---|---|---|---|---|---|---|---|---|
| **Q01-U1** | unfiltered | first | `Limit → Result → Sort → Hash Join → Seq Scan → Hash → Seq Scan` | `pk_assets` (subquery only) | **yes** | 20 / 64 | 20 / 1240 | 574 / 0 | 2.297 / 0.788 |
| **Q01-U2** | unfiltered | continuation | same | same | **yes** | 20 / 44 | 20 / 1240 | 574 / 0 | 2.519 / 0.804 |
| **Q01-F1** | category-filtered | first | same | same | **yes** | 20 / 61 | 20 / 1240 | 574 / 0 | 2.388 / 0.866 |
| **Q01-F2** | category-filtered | continuation | same | same | **yes** | 20 / 41 | 20 / 1240 | 574 / 0 | 2.401 / 0.757 |

Node lists are the **ordering path only**; the thumbnail subquery's own nodes
are excluded, which is why no `SubPlan` branch appears above. Timings are one
run on one machine and are context, not a budget — plan *shape* is the
assertion (DB5 EXPLAIN plan §1). Row counts and loop counts were identical
across runs.

"Rows scanned" counts only the ordering path's leaf scans; the thumbnail
subquery is counted separately because conflating them would hide the two facts
worth knowing — whether a page costs one pass over the catalog, and whether the
subquery stays bounded by the page.

**The continuation pages scan fewer rows than the first pages** (44 vs 64, 41 vs
61). That is the keyset predicate doing its job: rows before the cursor are
eliminated at the scan, not paged past.

**The thumbnail subquery runs exactly 20 times — once per returned row, never
once per catalog row.** That is the no-N+1 property of the B04 design, measured.

## 4. Structural probe — `enable_seqscan = off`

A sequential scan at 80 rows says nothing about whether an index *could* serve
the ordering. Disabling it forces the planner to show what the index offers.

| Ref | Form | Ordering path | Indexes used | Sort |
|---|---|---|---|---|
| **Q01-P1** | unfiltered | `Limit → Result → Sort → Nested Loop → Bitmap Heap Scan → Bitmap Index Scan → Memoize → Index Scan` | `ix_products__category_display_id__published` (IDX-065), `pk_categories`, … | **yes** |
| **Q01-P2** | category-filtered | same | same | **yes** |

IDX-065 is used — as a **bitmap** index scan, which selects rows and discards
order. Both forms still need a sort node.

## 5. Reference form — `category_id` as a constant

This is **not** the statement the delivered contract issues. It exists to
isolate one variable.

| Ref | Statement | Ordering path | Index | Sort |
|---|---|---|---|---|
| **Q01-P3** | `where status='PUBLISHED' and category_id = <uuid> order by display_order, id limit 20` | `Limit → Index Scan` | `ix_products__category_display_id__published` | **no** |

An ordered, sort-free `Limit → Index Scan` on IDX-065, exactly as the DB5 index
design intended.

## 6. What this means for IDX-065

IDX-065 is `products (category_id, display_order, id) WHERE status='PUBLISHED'`.
Its ordering is reachable only when `category_id` is an **equality constant**,
because that is the leading key. Q01-P3 proves the index delivers precisely that
when given one.

The delivered public contract does not give it one. `GET /api/public/products`
filters by **category slug** — `categories.slug = ?` across the join to
`categories` — so `products.category_id` is not a constant at plan time in
either form. Consequently:

- **Category-filtered:** IDX-065 contributes its partial predicate and row
  selection, but not the ordering. A sort node appears. *Exact leading-prefix
  ordering is available only to a `category_id`-constant form.*
- **Unfiltered:** there is no `category_id` equality at all, so the leading key
  is unconstrained. IDX-065 cannot supply `(display_order, id)` order under any
  planner setting. **No document may describe the unfiltered listing as an exact
  IDX-065 leading-prefix match.**

This is a sharper statement than the DB5 design documents made, and it
supersedes the "Aligned? yes" cell for Q-01 in the pagination matrix and E1's
"category-filtered: Index Scan IDX-065, **no sort node**" expectation. It does
not contradict the index's justification: the partial predicate is still the
Q-01 security scope, and the leading prefix still serves per-category counts.

## 7. Verdict

**The current access path is accepted for Catalog Alpha.**

| Criterion | Evidence |
|---|---|
| Page served correctly | 20 rows, correct keyset boundary, total order via `(display_order, id)` |
| Cost | ≤ 64 rows scanned per page, 574 shared buffer hits, **0 reads**, sub-millisecond execution |
| Sort | top-N heapsort over ≤ 60 rows — no spill, no disk |
| N+1 | none — the thumbnail subquery is bounded by the page |

A sequential scan and an in-memory sort over an MVP-scale relation are the
correct plan, not a defect (ADR-DB5-004 R8; EXPLAIN scenario E1 already
anticipated the unfiltered seq scan; `DB9_QUERY_PLAN_CATALOG` PERF-R01 measured
`Limit → Sort → Seq Scan` for this shape and passed it).

**No index is added by this correction**, and none is warranted: adding one to
remove a sort over 60 rows is the speculative optimization ADR-DB5-004 R4/R5
exists to refuse.

## 8. Routed, not resolved

| Item | Owner | Activation |
|---|---|---|
| Whether Q-01 should filter by resolved `category_id` rather than `categories.slug`, making IDX-065's ordering reachable | DB10 / a future catalog checkpoint | an ADR-DB5-001 R8 threshold, or a measured page cost that matters |
| Latency budgets for Q-01 | DB10 | a production baseline exists |

Measured tuning ownership stays with DB9/DB10 (`DB9_DB10_HANDOFF.md`). This
document records what is true today; it does not open a tuning programme.
