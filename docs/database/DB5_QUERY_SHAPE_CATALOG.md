# DB5 — Query Shape Catalog

**Checkpoint:** DB5 — Query, Access Path & Index Design
**Date:** 2026-07-18 · **Git HEAD:** `456e101` · **Branch:** `production`
**Nature:** Logical query shapes — **no SQL, no ORM code, no repository
code**. Tables/columns/relationships use the DB4 IDs exactly; no field
outside DB4 appears here.

Inputs: [`DB0_QUERY_CATALOG.md`](./DB0_QUERY_CATALOG.md) (Q-01..Q-33),
[`DB4_DB5_HANDOFF.md`](./DB4_DB5_HANDOFF.md) (§1 access paths, §2 QX-01..QX-11).
No query ID is renumbered.

## 1. Legend

- **Prio:** P0 security/correctness/concurrency · P1 core operational ·
  P2 history/reporting · P3 out-of-MVP (see §5).
- **Cons:** `S` strong (read-after-write critical / transaction-adjacent) ·
  `E` eventual-OK.
- **Pag:** class per [ADR-DB5-001](../adr/database/ADR-DB5-001-PAGINATION-STRATEGY.md) R1.
- **Lock:** locking requirement; `—` = none (plain read).
- **Idx:** candidate `IDX-*` from [`DB5_INDEX_CATALOG.md`](./DB5_INDEX_CATALOG.md).
- **Scope:** security scope predicate that MUST be in the query, not applied
  after the fetch.
- Cardinalities are at the locked scale (20–100 products, <100 orders/month).

---

## 2. Q-01 … Q-33

### Q-01 — Public product listing · P1

| Field | Value |
|---|---|
| Actor / owner | Public · CTX-CAT |
| Security scope | `products.status = 'PUBLISHED'` (COL-TBL012-07). Public callers may never see DRAFT/ARCHIVED. |
| Consistency | E (revalidated ISR) |
| Frequency / cardinality | High · ≤100 rows total, page-sized result |
| Tables | TBL-012 `products` → TBL-011 `categories` |
| Join path | entry `products`, optional join `categories` via REL-020 (`products.category_id`) for the category label |
| Predicates | `status='PUBLISHED'` · optional `category_id = ?` · optional availability filter reading `is_display_out_of_stock` (COL-TBL012-09) |
| Sort | `display_order` (COL-TBL012-10), `id` |
| Pagination | `OFFSET` |
| Projection | name, slug, base_price_amount, currency_code, display_order, is_display_out_of_stock, category label, thumbnail via TBL-017 |
| Locking | — |
| Archive | ARCHIVED excluded by the status predicate; `archived_at` is evidence, not the filter |
| Indexes | **IDX-065** `products (category_id, display_order, id) WHERE status='PUBLISHED'` |
| Constraint assumptions | CST-011 slug unique |
| JSONB | none |
| DB6 validation | EXPLAIN shows index scan on IDX-065 for the category-filtered form; unfiltered form may legitimately seq-scan 100 rows |

Note: availability is **computed** (TBL-018 balance − active holds/reservations),
never stored (DB4 §3). The listing shows the manual override flag only; true
per-SKU availability is Q-03.

### Q-02 — Product detail by slug · P1

| Field | Value |
|---|---|
| Actor / owner | Public · CTX-CAT |
| Security scope | `status='PUBLISHED'` |
| Consistency | E |
| Frequency / cardinality | High · 1 product graph (≤ dozens of child rows) |
| Tables | TBL-012 → TBL-013 `product_variants` → TBL-014 `skus`; TBL-015 `product_sides` → TBL-016 `embroidery_areas`; TBL-017 `product_media` → TBL-022 `assets` |
| Join path | entry `products` by slug; then REL-021 (variants), REL-022 (skus), REL-023 (sides→areas), REL-025 (media→assets) |
| Predicates | `slug = ?` AND `status='PUBLISHED'` |
| Sort | children by their `display_order` + `id` |
| Pagination | none (whole graph) |
| Locking | — |
| Indexes | **IDX-011** (CST-011 unique slug) for entry; **IDX-068** variants, **IDX-069** skus, **IDX-070** sides, **IDX-071** areas; media/assets via IDX-015 prefix |
| Constraint assumptions | CST-011 |
| Text/collation | slug is Population A — bytewise `C`, no expression index (ADR-DB5-002 R2/R3) |
| DB6 validation | unique index probe, then nested loops on small child sets |

### Q-03 — Variant & SKU availability · P1

| Field | Value |
|---|---|
| Actor / owner | Public/Customer · CTX-CAT + CTX-INV |
| Security scope | public product only |
| Consistency | **S (near add-to-request)** |
| Frequency / cardinality | High · ≤ dozens of SKUs |
| Tables | TBL-014 `skus` → TBL-018 `sku_stocks`; TBL-020 `inventory_soft_holds`, TBL-021 `inventory_reservations` |
| Join path | `skus` (REL-022 from variant) → `sku_stocks` via REL-026 → aggregate active holds (REL-029) and reservations (REL-031) |
| Predicates | product/variant scope · holds `status='HELD'` · reservations `status='RESERVED'` |
| Sort | none |
| Pagination | none |
| Locking | — (read-only estimate; the authoritative check is Q-32 under lock) |
| Indexes | IDX-016 (CST-014), **IDX-113** holds by stock (partial HELD), **IDX-114** reservations by stock (partial RESERVED), IDX-069 |
| Derived-state note | `available = quantity_on_hand − Σ active holds/reservations`, computed, never stored (DB4 §3) |
| DB6 validation | partial index scans on the two active sets |

**Correctness boundary:** Q-03 is a *display* estimate. It must never be
used as the reservation gate — that is Q-32 inside the locked transaction
(CC-20/23). Treating Q-03 as authoritative would reintroduce the oversell
race that GRD-014 exists to prevent.

### Q-04 — Gallery listing · P1

| Field | Value |
|---|---|
| Actor / owner | Public · CTX-GAL |
| Security scope | `gallery_entries.status='PUBLISHED'` (COL-TBL064-04) |
| Consistency | E |
| Cardinality | small |
| Tables | TBL-064 → TBL-065 `gallery_entry_assets` → TBL-022 |
| Join path | entry `gallery_entries`; REL-095 to assets |
| Predicates | `status='PUBLISHED'` · optional `linked_product_id` |
| Sort | `display_order` (COL-TBL064-05), `id` |
| Pagination | `OFFSET` |
| Locking | — |
| Indexes | **IDX-066** `gallery_entries (display_order, id) WHERE status='PUBLISHED'`; assets via IDX-050 prefix |
| Security | associations expose **public derivatives only** (CST-123); classification lives on the asset row (COL-TBL022-02) and must be checked, not assumed |

### Q-05 — Published content/page lookup · P1

| Field | Value |
|---|---|
| Actor / owner | Public · CTX-CNT |
| Security scope | `status='PUBLISHED'` |
| Consistency | E |
| Cardinality | 1 |
| Tables | TBL-066 `content_pages` |
| Predicates | `page_type = ?` AND `slug = ?` AND `status='PUBLISHED'` |
| Sort / pagination | none |
| Indexes | **IDX-052** (CST-044 unique `(page_type, slug)`) — exact probe |
| Text | Population A, bytewise |

### Q-06 — Sitemap / indexable set · P2

| Field | Value |
|---|---|
| Actor / owner | System · CTX-CNT |
| Security scope | public, indexable only |
| Consistency | E |
| Cardinality | small (≤ few hundred URLs) |
| Tables | TBL-066, TBL-012, TBL-064 (three independent scans, unioned in the app) |
| Predicates | per table: `status='PUBLISHED' AND is_indexable = true` |
| Sort | `id` |
| Pagination | `BATCH_SCAN` (full enumeration by the generator) |
| Indexes | **IDX-067** `content_pages (id) WHERE status='PUBLISHED' AND is_indexable`; products/gallery reuse IDX-065/IDX-066 |
| Note | three small scans, not a UNION view; no cross-context join |

### Q-07 — Redirect resolution · P1

| Field | Value |
|---|---|
| Actor / owner | Public · CTX-CNT |
| Consistency | **S** (a stale redirect is a visible routing bug) |
| Cardinality | 1 |
| Tables | TBL-067 `redirect_rules` |
| Predicates | `source_path = ?` AND `is_active = true` |
| Indexes | **IDX-053** (CST-044 unique `source_path`) — probe, then check `is_active` on the fetched row |
| Redundancy note | a partial index on `is_active` is **rejected**: the unique probe returns one row and the flag check is free |

### Q-08 — Secure link lookup (token → grant) · **P0**

| Field | Value |
|---|---|
| Actor / owner | Customer · CTX-CUS |
| Security scope | **this query is the authorization boundary.** Resolution is by `token_hash` only; the grant's `status`, `expires_at` and `custom_request_id` scope are then evaluated in the acting transaction (CST-116 / GRD-002/003, ADR-DB3-004 r9). |
| Consistency | **S** |
| Frequency / cardinality | High · exactly 1 |
| Tables | TBL-008 `secure_access_grants` |
| Predicates | `token_hash = ?` |
| Sort / pagination | none |
| Locking | — at lookup; the acting transaction re-reads grant state (CC-16 revoke-wins) |
| Indexes | **IDX-007** (CST-008 unique `token_hash`) |
| Text | Population A. Bytewise equality on a hash. **Never** case-folded, never a nondeterministic collation, never a prefix/fuzzy match (ADR-DB5-002 R1/R5) |
| Constraint assumptions | CST-008 unique |
| DB6 validation | unique index probe; D7-12 asserts no plaintext token column exists |

**Locked rule:** the lookup key is the *hashed* token. A plaintext token
never reaches a query predicate. Status/expiry are **not** put in the index
predicate — an expired-grant lookup must still resolve so the caller can be
told `GRANT_INVALID` rather than silently getting "not found", and because
a partial index on `status='ACTIVE'` would stop matching the instant a
grant is revoked mid-request.

### Q-09 — Request detail, customer view · **P0**

| Field | Value |
|---|---|
| Actor / owner | Customer (secure) · composed by CTX-ORD |
| Security scope | **owner-scoped**: resolved grant (Q-08) must bind to this `custom_request_id` (INV-08, REL-010). Lookup by request id alone is prohibited (IDOR). |
| Consistency | S |
| Frequency | High · 1 graph |
| Tables | TBL-037 `custom_requests` → TBL-027 `design_cases` → TBL-028 current `design_versions`; TBL-050 `quotations` → TBL-051 current `quotation_versions`; TBL-043 `orders` → TBL-054 `payment_obligations` |
| Join path | entry `custom_requests` by id **and** grant scope; REL-062 pointers to `current_design_case_id`/`current_quotation_id`; REL-044 / REL-068 current-version pointers; REL-071 order; REL-081 obligations |
| Predicates | `custom_requests.id = ?` AND grant scope match |
| Sort | obligations by `kind` |
| Pagination | none |
| Locking | — |
| Indexes | PK probes throughout; **IDX-075** `payment_obligations (order_id)`; pointer targets are PK lookups |
| Constraint assumptions | CST-020, CST-030, CST-035 (1–1 pointers), CST-039 |
| Note | header **current pointers** are followed directly — no "max(version)" scan. That is why the pointer columns exist (REL-044/068). |

### Q-10 — Design version history · P2

| Field | Value |
|---|---|
| Actor / owner | Customer/Admin · CTX-DSN |
| Security scope | owner (via grant) or admin |
| Consistency | S |
| Cardinality | ≤ tens |
| Tables | TBL-028 `design_versions` (+ TBL-030 `design_reviews`) |
| Predicates | `design_case_id = ?` |
| Sort | `version DESC, id DESC` |
| Pagination | `OFFSET` |
| Indexes | **IDX-023** (CST-021 unique `(design_case_id, version)`) — scanned backwards |
| Projection | metadata only — **no export assets** (INV-21/22) |
| Redundancy | no descending index needed; a B-tree scans backwards (ADR-DB5-004 R5) |

### Q-11 — Current review version · **P0**

| Field | Value |
|---|---|
| Actor / owner | Customer · CTX-DSN |
| Security scope | owner via grant |
| Consistency | **S**, transaction-adjacent (single-active-review invariant) |
| Cardinality | **≤1 by construction** |
| Tables | TBL-028 |
| Predicates | `design_case_id = ?` AND `status = 'SENT_FOR_REVIEW'` |
| Locking | the send/approve transactions lock the version row (CC-02/04); this read is adjacent |
| Indexes | **IDX-024** = CST-022 **partial unique** `(design_case_id) WHERE status='SENT_FOR_REVIEW'` |
| Constraint assumptions | **INV-16 / GRD-004** — the partial unique is the arbiter (CC-03) |
| DB7/DB8 | D7-04 / D8-09 (critical) |

The partial unique is simultaneously the integrity mechanism and the exact
access path. No separate performance index is permitted here.

### Q-12 — Quotation version history · P2

| Field | Value |
|---|---|
| Actor / owner | Customer/Admin · CTX-QUO |
| Consistency | S · ≤ tens |
| Tables | TBL-051 |
| Predicates | `quotation_id = ?` |
| Sort | `version DESC, id DESC` · `OFFSET` |
| Indexes | **IDX-039** (CST-036) scanned backwards |

### Q-13 — Current quotation · P1

| Field | Value |
|---|---|
| Actor / owner | Customer · CTX-QUO |
| Security scope | owner via grant |
| Consistency | S · 1 row |
| Tables | TBL-050 → TBL-051 (+ TBL-052 lines) |
| Join path | `quotations` by `custom_request_id` (REL-065) → `current_version_id` pointer (REL-068) → lines via REL-066 |
| Indexes | **IDX-037** (CST-035 unique `custom_request_id`), PK on version, **IDX-040** prefix (CST-037) for lines |
| Note | deposit/remaining come from the **version** (COL-TBL051-16), not recomputed |

### Q-14 — Approval snapshot lookup · **P0**

| Field | Value |
|---|---|
| Actor / owner | Admin/System · CTX-DSN/ORD |
| Security scope | internal |
| Consistency | **S**, in-transaction |
| Cardinality | 1 |
| Tables | TBL-031 `approval_snapshots` (+ TBL-032, TBL-033 children) |
| Predicates | `design_version_id = ?` **or** via `orders.current_approval_snapshot_id` (REL-074) PK probe |
| Indexes | **IDX-025** (CST-023 unique `design_version_id`); children via IDX-063 / IDX-026 prefixes |
| Constraint assumptions | CST-023, INV-01/03; row is immutable (CST-091) |

### Q-15 — Order lookup · P1

| Field | Value |
|---|---|
| Actor / owner | Customer/Admin · CTX-ORD |
| Security scope | owner via grant, or admin |
| Consistency | S · 1 graph |
| Tables | TBL-043 → TBL-044 `order_items`, TBL-047 `shipping_details`, TBL-048 `shipping_snapshots` |
| Predicates | by `id`, or `code` (COL-TBL043-01), or `custom_request_id` (COL-TBL043-02) |
| Sort | items by `position` |
| Indexes | **IDX-031** (CST-029 `code`), **IDX-032** (CST-030 `custom_request_id`), **IDX-033** prefix (CST-031) for items, **IDX-035**/**IDX-036** (CST-033/034) |
| Note | `code` is a **display/lookup** key, never an authorization input (COL-TBL037-01 rule applies equally to orders) |

### Q-16 — Payment reconciliation · **P0**

| Field | Value |
|---|---|
| Actor / owner | Admin/System · CTX-PAY |
| Security scope | internal / financial |
| Consistency | **S**, transaction-adjacent |
| Cardinality | small per window |
| Tables | TBL-056 `payment_provider_events` → TBL-055 `payment_attempts` → TBL-054 `payment_obligations` |
| Join path | entry depends on the form (below); REL-086 event→attempt, REL-084 attempt→obligation |
| Predicates | (a) `provider_key = ? AND provider_event_ref = ?` — exact event · (b) `received_at` range · (c) `payment_attempt_id IS NULL` — unmatched events · (d) attempt `status IN ('FAILED','REQUIRES_REVIEW')` |
| Sort | `received_at DESC, id DESC` |
| Pagination | **`KEYSET`** — append-heavy and concurrently written by callbacks (ADR-DB5-001 R5) |
| Locking | reconciliation actions lock the attempt row (CC-09); the listing read does not |
| Indexes | (a) **IDX-043** = CST-040 unique · (b) **IDX-079** `(received_at DESC, id DESC)` · (c) **IDX-081** partial `WHERE payment_attempt_id IS NULL` · (d) **IDX-076** partial on attempt status · plus **IDX-080** `(payment_attempt_id)` and **IDX-078** `(provider_key, provider_ref)` |
| Constraint assumptions | **CST-040** (INV-07/GRD-012) is the duplicate-callback arbiter |
| JSONB | `redacted_payload` is **opaque evidence**; reconciliation filters on relational columns only (ADR-DB4-004 #6). No index. |
| DB7/DB8 | D7-09 / D8-01 (critical) |

### Q-17 — Pending deposit list · P1

| Field | Value |
|---|---|
| Actor / owner | Admin · CTX-ORD/PAY |
| Consistency | S · small |
| Tables | TBL-043 → TBL-054 |
| Predicates | `orders.status='AWAITING_DEPOSIT'` AND obligation `kind='DEPOSIT' AND status='PENDING'` |
| Sort | `orders.created_at, id` · `TOP_N` |
| Indexes | **IDX-074** `orders (status, created_at, id)`; **IDX-075** obligations by order |
| Constraint assumptions | **CST-039** — Deposit and Remaining are **independent obligations**; this query must not infer one from the other |

### Q-18 — Pending final payment list · P1

Same shape as Q-17 with `orders.status='AWAITING_FINAL_PAYMENT'` and
obligation `kind='REMAINING' AND status='PENDING'`. Indexes IDX-074,
IDX-075. The independence of the two obligations (CST-039/INV-04) is the
reason these are two queries and not one parameterized guess.

### Q-19 — Production queue · P1

| Field | Value |
|---|---|
| Actor / owner | Admin · CTX-PRD |
| Consistency | S, transaction-adjacent · small |
| Tables | TBL-059 `production_jobs` → TBL-043 → TBL-031 |
| Predicates | `production_jobs.status IN ('PLANNED','STARTED')` |
| Sort | `created_at, id` · `TOP_N` |
| Locking | start/cancel transactions lock the **order** row (CC-12) |
| Indexes | **IDX-082** partial `(created_at, id) WHERE status IN ('PLANNED','STARTED')`; order/snapshot by PK; **IDX-044** (CST-041) prefix `order_id` covers job-by-order |
| Constraint assumptions | CST-041, INV-03 (exact approval snapshot) |

### Q-20 — Admin low-stock dashboard · P1

| Field | Value |
|---|---|
| Actor / owner | Admin · CTX-INV |
| Consistency | S · ≤ dozens |
| Tables | TBL-018 (+ active holds/reservations for the reserved column) |
| Predicates | `low_stock_threshold IS NOT NULL AND quantity_on_hand <= low_stock_threshold` |
| Sort | `id` · `TOP_N` |
| Indexes | **none — sequential scan is correct** |
| Rationale | the predicate compares two columns of the same row, so no plain B-tree is selective for it. `sku_stocks` has one row per SKU (CST-014) — ≤ dozens at locked scale. A partial index `WHERE quantity_on_hand <= low_stock_threshold` is *legal* but would be re-evaluated on **every stock mutation**, taxing the hottest inventory write path (CC-20/23/24) to accelerate a scan of a few dozen rows. **Rejected — recorded as IDX-R01.** |
| Revisit | if `sku_stocks` exceeds ~10,000 rows |

### Q-21 — Request listing by status · P1

| Field | Value |
|---|---|
| Actor / owner | Admin · CTX-ORD |
| Consistency | S · ≤ hundreds |
| Tables | TBL-037 |
| Predicates | `status = ?` (or an explicit status set) |
| Sort | `created_at DESC, id DESC` · `OFFSET` |
| Indexes | **IDX-073** `custom_requests (status, created_at DESC, id DESC)` |
| Composite rationale | equality (`status`) first, then the sort keys in matching direction — see [`DB5_INDEX_CATALOG.md`](./DB5_INDEX_CATALOG.md) §4 |
| Status set | exact LC-11 members incl. `QUOTE_ACCEPTED` |

### Q-22 — Admin dashboard aggregate · P1

Composition of Q-11/17/18/19/20/21/23/24 plus alert buckets. **No single
index, no materialized view.** Decomposed per bucket in
[`DB5_ADMIN_DASHBOARD_ACCESS_PATHS.md`](./DB5_ADMIN_DASHBOARD_ACCESS_PATHS.md).
Consistency S; each bucket is `TOP_N` + a count.

### Q-23 — Failed / unmatched payments · P1

| Field | Value |
|---|---|
| Actor / owner | Admin · CTX-PAY · internal/financial |
| Consistency | S · small |
| Tables | TBL-055 (+ TBL-056 unmatched events) |
| Predicates | `status IN ('FAILED','REQUIRES_REVIEW')`; unmatched events `payment_attempt_id IS NULL` |
| Sort | `created_at DESC, id DESC` · `OFFSET` |
| Indexes | **IDX-076**, **IDX-081** |

### Q-24 — Expiring quotations · P1

| Field | Value |
|---|---|
| Actor / owner | Admin/System · CTX-QUO |
| Consistency | E · small |
| Tables | TBL-051 |
| Predicates | `status='SENT' AND valid_until < <horizon>` |
| Sort | `valid_until, id` · `TOP_N` |
| Locking | the expiry sweep locks the version row (CC-06) — accept-vs-expire is committed-first-wins |
| Indexes | **IDX-084** partial `(valid_until, id) WHERE status='SENT'` |
| Nulls | `valid_until` is nullable in DRAFT only; the `status='SENT'` predicate excludes those rows (required at send, COL-TBL051-18) |

### Q-25 — Session expiration cleanup · P1

| Field | Value |
|---|---|
| Actor / owner | System/Worker · CTX-DSN |
| Consistency | E · batch |
| Tables | TBL-025 `design_sessions` |
| Predicates | `status='ACTIVE' AND last_activity_at < now() − TTL` |
| Sort | `last_activity_at, id` · `BATCH_SCAN` |
| Locking | per-row (SWEEP class, ADR-DB5-003 R1) |
| Indexes | **IDX-085** partial `(last_activity_at, id) WHERE status='ACTIVE'` |
| Time predicate | the `now()` comparison is a **range scan on the key**, never an index predicate (ADR-DB5-003 R3) |
| Cascade | `design_session_assets` and challenges are cascade-temp children (REL-042/008) |

### Q-26 — Asset processing queue · P1

| Field | Value |
|---|---|
| Actor / owner | System/Worker · CTX-AST |
| Consistency | E · batch |
| Tables | TBL-022 `assets`, TBL-024 `asset_derivatives` (two independent scans) |
| Predicates | assets `status IN ('UPLOADED','INSPECTING')` · derivatives `status IN ('PENDING','PROCESSING')` |
| Sort | `created_at, id` · `BATCH_SCAN` |
| Indexes | **IDX-086**, **IDX-087** |
| Concurrency | CC-19 — duplicate processing callbacks collapse via idempotency; CST-018 partial unique prevents duplicate derivative pipelines |

### Q-27 / QX-04 — Outbox relay claim · **P0**

| Field | Value |
|---|---|
| Actor / owner | System/Worker · CTX-PLT |
| Consistency | **S (claim)** |
| Frequency | **High — polled**; highest-write table |
| Tables | TBL-073 `outbox_events` |
| Predicates | `status='PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= now())` |
| Sort | `next_attempt_at NULLS FIRST, id` (FIFO) |
| Pagination | `BATCH_SCAN`, `LIMIT n` [cfg] |
| Locking | **`FOR UPDATE SKIP LOCKED`** (CC-25, GRD-029, CST-124) — DB6 spike |
| Indexes | **IDX-088** partial `(next_attempt_at NULLS FIRST, id) WHERE status='PENDING'` |
| Claim exit | the transaction must set `status`/`claimed_by`/`claimed_at` (column-scoped per CST-099) so the row leaves the claimable set (ADR-DB5-003 R6) |
| JSONB | `payload` immutable (INV-23) and **never** filtered on — no GIN |
| DB8 | D8-17 |

### Q-28 / QX-05 — Idempotency key check · **P0**

| Field | Value |
|---|---|
| Actor / owner | System · CTX-PLT |
| Consistency | **S**, in-transaction |
| Frequency / cardinality | High · exactly 1 |
| Tables | TBL-074 `idempotency_records` |
| Predicates | `operation_namespace = ? AND scope_key = ?` |
| Locking | the claim transaction relies on the unique index as arbiter (UNIQ strategy) |
| Indexes | **IDX-058** = CST-048 unique `(operation_namespace, scope_key)` |
| Fingerprint | mismatch on the same key → conflict (CST-125 / GRD-030); `fingerprint` is compared **after** the probe, not indexed separately |
| Cleanup | TTL sweep on `expires_at` → **IDX-093**; stuck `IN_PROGRESS` → **IDX-094** |
| DB7/DB8 | D7-08 / D8-25 (critical) |

### Q-29 — Audit history lookup · P2

| Field | Value |
|---|---|
| Actor / owner | Admin · CTX-AUD · internal |
| Consistency | S · large append-only |
| Tables | TBL-072 `audit_events` |
| Predicates | (a) `target_kind = ? AND target_id = ?` · (b) actor (`admin_id`/`customer_id`) · (c) `occurred_at` range · (d) `correlation_id = ?` |
| Sort | `occurred_at DESC, id DESC` |
| Pagination | **`IMMUTABLE_CURSOR`** (append-only, rows never change) |
| Indexes | (a) **IDX-095** `(target_kind, target_id, occurred_at DESC, id DESC)` · (b) **IDX-098** partial by admin actor · (c) **IDX-096** `(occurred_at DESC, id DESC)` · (d) **IDX-097** `(correlation_id)` |
| JSONB | `summary` opaque; queries filter on actor/action/target/time **columns** (ADR-DB4-004 #7). No GIN. |
| Note | REL-103 target is polymorphic **by justified exception**; there is no FK, so the composite index is the only access path |

### Q-30 — Signed asset access resolution · **P0**

| Field | Value |
|---|---|
| Actor / owner | Customer/Admin · CTX-AST |
| Security scope | **scoped**: the caller's authorization to the *owning* entity is checked before the asset is resolved; `classification` (COL-TBL022-02) is private-by-default (INV-09) |
| Consistency | S · 1 |
| Tables | TBL-022 → TBL-024 |
| Predicates | `assets.id = ?` (PK) then derivative `asset_id = ? AND kind = ?` |
| Indexes | PK; **IDX-099** `asset_derivatives (asset_id)` |
| Redundancy note | CST-018's partial unique (`WHERE status <> 'FAILED'`) is **not** relied on as this access path: the query filters `status='READY'`, and the planner cannot infer that `'READY' <> 'FAILED'` through a text CHECK. IDX-099 exists for this reason and the reasoning is recorded in the cost report. |
| Security | customer-visible derivatives must be watermarked (`is_watermarked`, INV-22); production artifacts are internal-only (INV-21) |

### Q-31 — Verification challenge lookup · **P0**

| Field | Value |
|---|---|
| Actor / owner | System · CTX-CUS · security-sensitive |
| Consistency | **S**, in-transaction |
| Cardinality | ≤1 |
| Tables | TBL-006 `contact_verification_challenges` |
| Predicates | `contact_kind = ? AND normalized_value = ? AND purpose = ? AND status='ISSUED'` |
| Indexes | **IDX-006** = CST-007 partial unique |
| Text | `normalized_value` is Population A, pre-normalized (ADR-DB5-002 R3) — no `lower()` index |
| Rate limiting | attempt window is QX-11 |
| Concurrency | CC-17 — the partial unique is the arbiter for concurrent challenges |

### Q-32 — Reservation-eligible check · **P0**

| Field | Value |
|---|---|
| Actor / owner | System · CTX-INV |
| Consistency | **S, inside the write transaction** |
| Cardinality | 1 stock row + its active holds/reservations |
| Tables | TBL-018 (**lock anchor**), TBL-020, TBL-021 |
| Predicates | `sku_stocks.sku_id = ?` (or PK) — **`FOR UPDATE`**; then active holds `status='HELD'`, reservations `status='RESERVED'` for that stock row |
| Locking | **`FOR UPDATE` on the `sku_stocks` row** — the single lock anchor for all stock arithmetic (CC-20/21/22/23/24, GRD-014) |
| Indexes | **IDX-016** (CST-014) to reach the anchor; **IDX-113**, **IDX-114** for the active sets |
| Constraint assumptions | **CST-061** `quantity_on_hand >= 0` is the final arbiter (INV-18) |
| Gate | official reservation additionally requires approval + deposit SATISFIED (CST-111 — a TX read, not a schema fact) |
| DB8 | D8-05 / D8-24 |

### Q-33 — Analytics event readiness · **P3**

| Field | Value |
|---|---|
| Actor / owner | System · analytics tool **deferred** |
| Consistency | E · batch |
| Tables | TBL-073 (emission stream) |
| Predicates | `event_type` set |
| Sort | `id` |
| Indexes | **none — rejected (IDX-R02)** |
| Rationale | an `event_type` index on the highest-write table in the system, for a P3 consumer that does not exist and whose tooling is an open decision, is exactly the speculative index ADR-DB5-004 R4 prohibits. The relay reads by `id` order. Revisit when the analytics tool is selected and its access pattern is known. |

---

## 3. Operational queries QX-01 … QX-11

### QX-01 — Transition history · P2

Three independent tables by parent: TBL-042 `custom_request_transitions`
(`custom_request_id`), TBL-045 `order_transitions` (`order_id`),
TBL-063 `production_job_transitions` (`production_job_id`).
Sort `id` (bigint identity = insert order); `IMMUTABLE_CURSOR`; consistency S.
Indexes **IDX-100**, **IDX-101**, **IDX-102** — each `(parent_id, id)`.
Append-only (CST-098). Actor columns are evidence, not filters.

### QX-02 — Cancellation saga resume · **P0**

Tables TBL-045 + TBL-043. Predicates `order_id = ?` AND
`event_kind='SAGA_STEP'`; plus finding orders in `status='CANCELLING'`.
Sort `id`; `IMMUTABLE_CURSOR` — replay must be **gap-free and
deterministic**, which is why offset is prohibited here.
Indexes **IDX-103** partial `(order_id, id) WHERE event_kind='SAGA_STEP'`,
**IDX-104** partial `orders (id) WHERE status='CANCELLING'`.
Locking: the saga locks the order row (CC-13). Source for D8-19.

### QX-03 — Notification retry scan · P1

TBL-070 `notification_intents`, `status IN ('PENDING','PROCESSING')`,
sort `(created_at, id)`, `BATCH_SCAN`, `CONTENDED_CLAIM` class.
Index **IDX-091**. Attempt counts come from TBL-071 via **IDX-092**
`(intent_id, attempted_at)`. Consistency E; CC-26 — `intent_key` (CST-047)
collapses duplicates. Notification lifecycle is **separate from outbox**
(REL-101 is a nullable one-way ref) — the two are never joined in a claim.

### QX-04 — Outbox claim

= Q-27 above. Not duplicated.

### QX-05 — Idempotency lookup / cleanup

Lookup = Q-28 (IDX-058). Cleanup: `expires_at < now()` → **IDX-093**
`(expires_at, id)`; stuck records `status='IN_PROGRESS' AND claimed_at <
now() − timeout` → **IDX-094** partial `(claimed_at, id) WHERE
status='IN_PROGRESS'`. `BATCH_SCAN`; consistency E for cleanup, S for lookup.

### QX-06 — Grant revocation / expiry sweep · P2

TBL-008, `status='ACTIVE' AND expires_at < now()`, sort `(expires_at, id)`,
`BATCH_SCAN`, index **IDX-105** partial.
**Hygiene only** — guards read `expires_at` directly in the acting
transaction (CST-116), so a lagging sweep can never grant access it
shouldn't. Consistency E is safe *because* of that.

### QX-07 — Agreement effective version · **P0**

TBL-069 `agreement_versions`: `agreement_id = ?` AND `status='PUBLISHED'`
AND `effective_from <= now()` AND not superseded/withdrawn (excluded by the
status predicate), sort `effective_from DESC, id DESC`, `TOP_N` (1).
Index **IDX-108** partial `(agreement_id, effective_from DESC, id DESC)
WHERE status='PUBLISHED'`.
Consistency **S** — GRD-008 evaluates this **inside** the approval
transaction; CST-046 (exclusion candidate) is the integrity backstop.
`EFFECTIVE` is derived, never stored (COL-TBL069-03).

### QX-08 — Customer merge review · P2

TBL-009 `customer_merge_cases`, `status='REQUESTED'`, sort `(created_at, id)`,
`TOP_N`. **No index — sequential scan (IDX-R03).** The table holds a handful
of rows over the product's life; CST-010's partial unique leads with
`survivor_customer_id` and is useless as a queue scan, and adding a second
partial index for a rare admin screen fails ADR-DB5-004 R4.
Duplicate-candidate signals read normalized contacts via IDX-004.
Locking: merge locks **both** customer rows in a deterministic order (CC-27).

### QX-09 — Shipping freeze state · **P0**

TBL-047 by `order_id` (CST-033 → **IDX-035**) + existence of TBL-048
(CST-034 → **IDX-036**). Consistency S, read in the dispatch transaction.
Locking: dispatch locks the shipping detail row (CC-15); freeze sets
`status='FROZEN'` and `frozen_at` (GRD-017), after which the row rejects
mutation (CST-094).
Final-payment-before-dispatch (GRD-016/CST-110) is a **cross-aggregate TX
read**, deliberately not an FK — the obligation state is read under the
order-row lock in the same transaction.

### QX-10 — Hold / reservation expiry sweep · P1

TBL-020 `status='HELD' AND expires_at < now()` → **IDX-109**;
TBL-021 `status='RESERVED' AND expires_at IS NOT NULL AND expires_at < now()`
→ **IDX-110**. Sort `(expires_at, id)`; `BATCH_SCAN`; consistency S
(per-row locked). CC-22: the sweep takes the **same** row lock the business
path takes — committed-first wins, and the payment path recreates or alerts
per LC-17. The `expires_at IS NOT NULL` clause is required because NULL
means no-expiry (ADR-DB1-018 r3).

### QX-11 — Challenge / attempt rate window · **P0**

TBL-007 `contact_verification_attempts` by `challenge_id` within a time
window on `attempted_at`; also per-contact windows via the challenge.
Index **IDX-111** `(challenge_id, attempted_at)`. Consistency S — GRD-026
rate limiting is evaluated in the issuing/verifying transaction.
Append-only (CST-098); cascade-temp with the challenge (REL-008).

---

## 4. Additional retained access paths

These are read paths implied by DB3/DB4 that are not separate Q-IDs. They
are listed so index coverage is complete and nothing is served by accident.

| Path | Tables | Index | Note |
|---|---|---|---|
| Admin session resolution | TBL-003 by `token_hash` | IDX-003 (CST-004) | Population A |
| Admin session expiry sweep | TBL-003 `status='ACTIVE'`, `expires_at` | IDX-121 | hard-ttl cleanup |
| Admin sessions by account | TBL-003 `admin_account_id` | IDX-120 | revoke-all-sessions |
| Customer contacts by customer | TBL-005 `customer_id` | IDX-134 | CST-006 is partial (`is_primary`) and does not serve this |
| Merge repointing scans | TBL-037/043/022/008 by `customer_id` | IDX-117, IDX-118, IDX-119, IDX-107 | CC-27; must find every row owned by the loser |
| Customer tombstone follow | TBL-004 `merged_into_customer_id` | IDX-129 | historical snapshots are never rewritten |
| Merge step evidence | TBL-010 by `merge_case_id` | IDX-135 | append-only |
| Challenge by contact point | TBL-006 `contact_point_id` | IDX-130 | REL-006 |
| Ledger replay / history | TBL-019 `(sku_stock_id, id)` | IDX-115 | rebuild source of truth |
| Holds/reservations by owner | TBL-020 `custom_request_id`, TBL-021 `order_id` | IDX-127, IDX-126 | partial uniques cover active rows only |
| Asset inspections | TBL-023 `(asset_id, inspected_at)` | IDX-132 | append-only |
| Asset deletion pipeline | TBL-022 `status='DELETION_PENDING'` | IDX-133 | tombstone phase 2 |
| Design reviews by version | TBL-030 `(design_version_id, decided_at)` | IDX-116 | first-decision-wins (CC-04) |
| Approval snapshots by request | TBL-031 `custom_request_id` | IDX-136 | case timeline |
| Moderation notes | TBL-041 `(custom_request_id, created_at)` | IDX-137 | |
| Production notes | TBL-062 `(production_job_id, created_at)` | IDX-138 | |
| Refunds by order / queue | TBL-058 `order_id`; status queue | IDX-122, IDX-123 | LC-20 |
| Reconciliation by attempt | TBL-057 `payment_attempt_id` | IDX-124 | append-only evidence |
| Shipping fee acknowledgements | TBL-049 `order_id` | IDX-125 | |
| Dead-letter visibility | TBL-075 `WHERE is_dead_letter` | IDX-131 | separate from the claim path |
| Outbox cleanup | TBL-073 `status='DISPATCHED'`, `dispatched_at` | IDX-090 | hard-ttl |
| Policy config read | TBL-076 `config_key` → pointer | IDX-060 (CST-050) | header pointer to current version |

---

## 5. Priority roll-up

**P0 (security / correctness / concurrency)** — Q-08, Q-09, Q-11, Q-14,
Q-16, Q-27, Q-28, Q-30, Q-31, Q-32, QX-02, QX-07, QX-09, QX-11.
**P1 (core operational)** — Q-01..Q-05, Q-07, Q-13, Q-15, Q-17..Q-21,
Q-23..Q-26, QX-03, QX-10.
**P2 (history / reporting)** — Q-06, Q-10, Q-12, Q-29, QX-01, QX-05
(cleanup), QX-06, QX-08.
**P3 (out of MVP)** — Q-33, Vietnamese fuzzy/full-text search
(ADR-DB5-002 R6).

Index implementation order follows this tiering
([`DB5_DB6_HANDOFF.md`](./DB5_DB6_HANDOFF.md) §2).

## 6. Coverage statement

44 query IDs are specified here: Q-01..Q-33 (33) and QX-01..QX-11 (11),
plus the 24 additional retained access paths in §4. Every one names either a
serving `IDX-*` or an explicit **no index required** rationale (Q-20,
Q-33, QX-08 — recorded as IDX-R01..R03). Per-item traceability is in
[`DB5_COMPLETENESS_MATRIX.md`](./DB5_COMPLETENESS_MATRIX.md).
