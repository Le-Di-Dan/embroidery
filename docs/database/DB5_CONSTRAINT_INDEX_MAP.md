# DB5 — Constraint → Index Map

**Date:** 2026-07-18 · **Git HEAD:** `456e101`
**Rule:** every `CST-*` with an index consequence is mapped to exactly one
constraint-owned index. **No duplicate performance index is created where a
unique index already covers the path** (ADR-DB5-004 R5).

## 1. Legend

- **Kind:** `PK` · `UQ` · `pUQ` partial unique · `XCL` exclusion candidate ·
  `FK-sup` FK-support candidate.
- **Owned by constraint?** yes = the index exists *because* the constraint
  does; DB6 creates it as part of the constraint, not as a separate index.
- **Extra perf index?** whether a *separate* index on overlapping columns is
  also justified, and why.
- **DB6 owner** = migration group (G1–G19, [`DB4_DB6_HANDOFF.md`](./DB4_DB6_HANDOFF.md)).
- **DB7** = verification test id.

## 2. Primary keys

| CST | Kind | Scope | Index | Owned | Extra perf? | DB7 |
|---|---|---|---|---|---|---|
| CST-001 | PK | all 78 tables | `pk_<table>` on `id` | yes | **no** — PK probe serves every by-id lookup | D7 PK family |

`uuid7` PKs are additionally time-ordered, which keeps insert locality good
and avoids the random-insert page-split penalty a `uuid4` PK would cause on
append-heavy tables. `bigint` identity PKs on append-only tables are
monotonic and double as the `IMMUTABLE_CURSOR` sort key (ADR-DB5-001 R2/R5).

## 3. Uniqueness constraints

| CST | Kind | Table | Columns / predicate | IDX | Owned | Extra perf index? | Redundancy | DB6 | DB7/DB8 |
|---|---|---|---|---|---|---|---|---|---|
| CST-002 | UQ | admin_accounts | email | IDX-001 | yes | no | — | G1 | D7-13 |
| CST-003 | pUQ | admin_accounts | (status) `WHERE ACTIVE` | IDX-002 | yes | no | — | G1 | D7-13 |
| CST-004 | UQ | admin_sessions | token_hash | IDX-003 | yes | no — resolve is this probe | — | G1 | D7-12 |
| CST-005 | pUQ | customer_contact_points | (contact_kind, normalized_value) `WHERE verified & !deactivated` | IDX-004 | yes | no; **IDX-134 `(customer_id)` is a different path**, not a duplicate | disjoint columns | G2 | D7-13 / D8-21 |
| CST-006 | pUQ | customer_contact_points | (customer_id) `WHERE is_primary` | IDX-005 | yes | **yes — IDX-134**: CST-006 is partial to primary contacts and cannot serve "all contacts of a customer" | partial vs full, both real | G2 | D7-13 |
| CST-007 | pUQ | contact_verification_challenges | (contact_kind, normalized_value, purpose) `WHERE ISSUED` | IDX-006 | yes | no — **is** Q-31's path | — | G2 | D7-13 / D8-21 |
| CST-008 | UQ | secure_access_grants | token_hash | IDX-007 | yes | no — **is** Q-08's path | — | G2 | D7-12 |
| CST-009 | pUQ | secure_access_grants | (customer_id, custom_request_id) `WHERE ACTIVE` | IDX-008 | yes | **yes — IDX-107 `(customer_id)`**: merge must find non-active grants too | partial vs full; correctness, not speed | G2 | D7-13 / D8-20 |
| CST-010 | pUQ | customer_merge_cases | (survivor, loser) `WHERE REQUESTED` | IDX-009 | yes | no — queue scan rejected (IDX-R03) | leading col useless for queue | G2 | D8-18 |
| CST-011 | UQ | categories/products/gallery_entries/design_templates | slug | IDX-010/011/012/013 | yes | no | — | G3/G4 | D7 |
| CST-012 | UQ | skus | code | IDX-014 | yes | no | — | G3 | D7 |
| CST-013 | UQ | product_media | (product_id, asset_id, role) | IDX-015 | yes | no — prefix `product_id` serves Q-02 (IDX-R07) | prefix covers | G3 | D7 |
| CST-014 | UQ | sku_stocks | sku_id | IDX-016 | yes | no — **is** the Q-32 lock-anchor path | — | G5 | D7-13 |
| CST-015 | pUQ | inventory_soft_holds | (custom_request_id, sku_stock_id) `WHERE HELD` | IDX-017 | yes | **yes — IDX-113 `(sku_stock_id,…)` and IDX-127 `(custom_request_id)`**: different leading column / non-active rows | different access directions | G5 | D8-24 |
| CST-016 | pUQ | inventory_reservations | (order_id, sku_stock_id) `WHERE RESERVED` | IDX-018 | yes | **yes — IDX-114, IDX-126** (same reasoning) | as above | G5 | D8-05 |
| CST-017 | UQ | assets | storage_key | IDX-019 | yes | no | — | G6 | D7 |
| CST-018 | pUQ | asset_derivatives | (asset_id, kind) `WHERE status<>'FAILED'` | IDX-020 | yes | **yes — IDX-099 `(asset_id)`**: the `<>` predicate is not matchable from Q-30's `status='READY'` filter | see cost report §4 | G6 | D8-23 |
| CST-019 | UQ | design_sessions | session_secret_hash | IDX-021 | yes | no | — | G7 | D7-12 |
| CST-020 | UQ | design_cases | custom_request_id | IDX-022 | yes | no | — | G7 | D7-13 |
| CST-021 | UQ | design_versions | (design_case_id, version) | IDX-023 | yes | no — Q-10 scans it backwards | direction free | G7 | D7 |
| **CST-022** | **pUQ** | design_versions | (design_case_id) `WHERE SENT_FOR_REVIEW` | **IDX-024** | yes | **no — and none is permitted**: this index *is* both the INV-16 arbiter and Q-11's exact path | — | G7 | **D7-04 / D8-09** |
| CST-023 | UQ | approval_snapshots | design_version_id | IDX-025 | yes | no | — | G8 | D7-13 / D8-08 |
| CST-024 | UQ | approval_snapshot_agreement_acceptances | (snapshot, agreement_version) | IDX-026 | yes | no — prefix serves child fetch | prefix covers | G8 | D7 |
| CST-025 | UQ | design_template_versions | (template, version) | IDX-027 | yes | no | — | G7 | D7-14 |
| CST-026 | UQ | custom_requests | code | IDX-028 | yes | no | — | G9 | D7-13 |
| CST-027 | UQ | customer_owned_products | custom_request_id | IDX-029 | yes | no | — | G9 | D7 |
| CST-028 | UQ | quantity_breakdowns | (request, variant, size_label) | IDX-030 | yes | no — prefix serves child fetch | prefix covers | G9 | D7 |
| CST-029 | UQ | orders | code | IDX-031 | yes | no | — | G10 | D7-13 |
| **CST-030** | **UQ** | orders | custom_request_id | **IDX-032** | yes | no — **is** the duplicate-order arbiter and Q-09/Q-15's path | — | G10 | **D8-12** |
| CST-031 | UQ | order_items | (order_id, position) | IDX-033 | yes | no — prefix + sort both covered | prefix covers | G10 | D7 |
| CST-032 | pUQ | order_cancellation_requests | (order_id) `WHERE PENDING` | IDX-034 | yes | no | — | G10 | D8-19 |
| CST-033 | UQ | shipping_details | order_id | IDX-035 | yes | no — **is** QX-09's path | — | G11 | D7 |
| CST-034 | UQ | shipping_snapshots | order_id | IDX-036 | yes | no | — | G11 | D8-14 |
| CST-035 | UQ | quotations | custom_request_id; code | IDX-037; IDX-038 | yes | no | — | G12 | D7-13 |
| CST-036 | UQ | quotation_versions | (quotation_id, version) | IDX-039 | yes | no — Q-12 scans backwards | direction free | G12 | D8-11 |
| CST-037 | UQ | quotation_line_items | (version, position) | IDX-040 | yes | no | prefix covers | G12 | D7 |
| CST-038 | UQ | quotation_acceptances | quotation_version_id | IDX-041 | yes | no | — | G12 | D8-10 |
| **CST-039** | **pUQ** | payment_obligations | (order_id, kind) `WHERE status IN (PENDING,SATISFIED)` | **IDX-042** | yes | **yes — IDX-075 `(order_id)`**: Q-09 must show SUPERSEDED obligations, which the partial excludes | partial vs full, both real | G13 | D8-04 / D7-13 |
| **CST-040** | **UQ** | payment_provider_events | (provider_key, provider_event_ref) | **IDX-043** | yes | no — **is** the duplicate-callback arbiter | — | G13 | **D7-09 / D8-01** |
| CST-041 | UQ | production_jobs | (order_id, approval_snapshot_id) | IDX-044 | yes | no — prefix `order_id` covers job-by-order (IDX-R04) | prefix covers | G14 | D8-13 |
| CST-042 | UQ | production_specifications | production_job_id | IDX-045 | yes | no | — | G14 | D7-07 |
| CST-043 | UQ | 6 association tables | owner + asset (+role) | IDX-046..051 | yes | no — prefixes serve all children | prefix covers | G6/G7/G9/G14/G15 | D7 |
| CST-044 | UQ | content_pages; redirect_rules; agreements | (page_type,slug); source_path; agreement_type | IDX-052; 053; 054 | yes | no (IDX-R05) | — | G15 | D7 |
| CST-045 | UQ | agreement_versions | (agreement_id, version) | IDX-055 | yes | **yes — IDX-108**: QX-07 sorts by `effective_from`, not `version` | different sort key | G15 | D7 |
| **CST-046** | **XCL** | agreement_versions | one effective PUBLISHED version per agreement | **IDX-056** *(conditional)* | dir | IDX-108 is the query path | — | G15 | D7-13 / D8 |
| CST-047 | UQ | notification_intents | intent_key | IDX-057 | yes | no | — | G16 | D8-16 |
| **CST-048** | **UQ** | idempotency_records | (operation_namespace, scope_key) | **IDX-058** | yes | no — **is** Q-28's path and the double-execution arbiter | — | G17 | **D7-08 / D8-25** |
| CST-049 | UQ | background_job_attempts | (job_kind, job_key, attempt_no) | IDX-059 | yes | **yes — IDX-131** dead-letter partial (different predicate) | disjoint purpose | G17 | D7 |
| CST-050 | UQ | policy_configurations; config_versions | config_key; (config, version) | IDX-060; IDX-061 | yes | no | — | G18 | D7 |
| CST-051 | UQ | business_profiles; thread_colors | customer_id; (snapshot, position) | IDX-062; IDX-063 | yes | no | prefix covers children | G2/G8 | D7 |
| CST-017f | pUQ | asset_derivatives | storage_key `WHERE NOT NULL` | IDX-064 | yes | no | — | G6 | D7 |

## 4. Exclusion constraint (CST-046)

| Aspect | Decision |
|---|---|
| Semantics | at most one **effective** PUBLISHED version per agreement; `effective_from` windows must not overlap among non-superseded/withdrawn rows |
| Index consequence | a GiST exclusion constraint would create a backing GiST index (IDX-056) |
| Status | **conditional** |
| Primary defense | the publish transaction supersedes the prior version (DB4 locked); GRD-008 reads the effective version in-transaction via IDX-108 |
| Why not required at launch | the exclusion form needs a range expression over `effective_from` and a `btree_gist`-style composition on `agreement_id`; that implies an **extension**, which is non-baseline (ADR-DB1-001). Adding an extension to back up a guard that already holds is disproportionate at a handful of agreement rows. |
| If adopted | DB6 raw SQL + extension request per ADR-DB5-002 R7 |
| Verification | D7-13 asserts the representation; the approve-vs-publish race is a DB8 case regardless of whether the exclusion exists |

This is the one place where DB5 declines to add an index that the constraint
catalog nominates, and it does so without weakening the constraint: the
invariant remains enforced by the publish transaction, which DB4 already
locked as its primary defense.

## 5. FK-support candidates

FK constraints do **not** create indexes in PostgreSQL. Each is reviewed
individually in [`DB5_FK_INDEX_REVIEW.md`](./DB5_FK_INDEX_REVIEW.md). No FK
index is created mechanically (ADR-DB5-004 R4).

## 6. Constraints with no index consequence

`CST-060`..`CST-074` (CHECK), `CST-080` (nullability), `CST-090`..`CST-100`
(immutability/append-only triggers) and `CST-110`..`CST-125` (TX/App-only
rules) create **no index**. Recorded explicitly so the mapping is complete:
a CHECK is evaluated per row on write and never drives an access path, and a
TX/App rule is by definition not a schema mechanism.

Two are worth calling out because they are sometimes mistaken for index
work:

- **CST-110** (final payment before dispatch) — a cross-aggregate read under
  the order-row lock, deliberately **not** an FK and therefore not an index.
- **CST-124** (outbox exclusive claim) — a *locking pattern*, not a
  constraint; its access path is IDX-088 plus `SKIP LOCKED`
  ([ADR-DB5-003](../adr/database/ADR-DB5-003-WORKER-CLAIM-INDEXING.md)).

## 7. Roll-up

| Item | Count |
|---|---|
| `CST-*` in DB4 | 125 |
| With a uniqueness/PK index consequence | 51 (CST-001..CST-051, incl. the CST-017 derivative form) |
| Constraint-owned indexes produced | 64 (`IDX-001`..`IDX-064`; several CSTs cover multiple tables) |
| Exclusion candidates | 1 (CST-046 → IDX-056, conditional) |
| Separate performance index justified alongside a unique | 7 (CST-006, 009, 015, 016, 018, 039, 045, 049) |
| Duplicate indexes created | **0** |
| Constraints with no index consequence | 74 |

Every partial-unique predicate above uses **exact DB3 state-set members**
from [`DB3_DB4_HANDOFF.md`](./DB3_DB4_HANDOFF.md) §1. No invented state
appears in any predicate.
