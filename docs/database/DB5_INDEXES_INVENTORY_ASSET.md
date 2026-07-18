# DB5 — Index Design: Inventory & Asset (CTX-INV / CTX-AST)

**Date:** 2026-07-18 · **Git HEAD:** `456e101`
**Tables:** TBL-018..TBL-024
**Index IDs:** IDX-016..020, 064, 086, 087, 099, 109, 110, 113..115,
119, 126, 127, 132, 133

Inventory is the most **lock-contended** context in the system (CC-20 through
CC-24). Index design here is governed by one question: how long is the
`sku_stocks` row lock held?

## 1. The SKU stock lock anchor

**`sku_stocks` (TBL-018) is the single lock anchor for all stock
arithmetic** (GRD-014). Every path that changes availability —
reserve, hold, convert, release, consume, adjust — takes `FOR UPDATE` on
this row first.

| Path | Index | Note |
|---|---|---|
| Reach the anchor | **IDX-016** (CST-014, unique `sku_id`) | 1–1 with the SKU |
| Active holds for the anchor | **IDX-113** `(sku_stock_id, id) WHERE status='HELD'` | |
| Active reservations for the anchor | **IDX-114** `(sku_stock_id, id) WHERE status='RESERVED'` | |

IDX-113 and IDX-114 are `required` **because of lock-hold time, not raw
speed**. Q-32 computes
`available = quantity_on_hand − Σ active holds − Σ active reservations`
*while holding the anchor lock*. Every other reservation attempt for that
SKU is blocked for the duration. A sequential scan of the holds table inside
that window would convert a microsecond lock into a millisecond one and
serialize the checkout path under concurrency (CC-20 last-unit race). The
partial predicates matter for the same reason: terminal rows
(`CONVERTED`/`RELEASED`/`EXPIRED`/`CONSUMED`) accumulate forever and must
never be scanned inside the lock.

**Availability is computed, never stored** (DB4 §3). No index implies a
materialized balance. `quantity_on_hand` is an authoritative counter
reconciled by the ledger, and **CST-061** (`quantity_on_hand >= 0`) is the
final arbiter (INV-18, D7-05).

## 2. Reservation and hold access paths

| Path | Predicate | Index | Verdict |
|---|---|---|---|
| Duplicate-hold integrity | `(custom_request_id, sku_stock_id) WHERE HELD` | IDX-017 (CST-015) | integrity |
| Duplicate-reservation integrity | `(order_id, sku_stock_id) WHERE RESERVED` | IDX-018 (CST-016) | integrity |
| Holds by request (release path) | `custom_request_id = ?` | IDX-127 | recommended |
| Reservations by order (cancel/consume) | `order_id = ?` | IDX-126 | recommended |

IDX-126/127 coexist with the partial uniques on purpose: the uniques cover
**active** rows only, while cancellation and audit paths must see terminal
rows too (retained per DB4 `Del` semantics). Same pattern as the grants case
in Identity — a partial index is never used as a full access path.

## 3. Expiry sweeps (QX-10)

| Sweep | Predicate | Index |
|---|---|---|
| Soft holds | `status='HELD'` | IDX-109 `(expires_at, id)` |
| Reservations | `status='RESERVED' AND expires_at IS NOT NULL` | IDX-110 `(expires_at, id)` |

The `expires_at IS NOT NULL` clause on IDX-110 is required, not defensive:
COL-TBL021-05 permits NULL meaning **no expiry** (ADR-DB1-018 r3). Omitting
it would carry rows into the sweep index that can never expire — pure waste
that grows with order volume.

`inventory_soft_holds.expires_at` is NOT NULL by contrast (COL-TBL020-05,
CST-080) — no TTL config means holds are disabled entirely — so IDX-109
needs no such clause.

**CC-22 semantics are preserved by the design, not by the index:** the sweep
takes the **same** row lock the business path takes. Committed-first wins; a
deposit-verified reserve that commits first keeps the hold, and the payment
path recreates or alerts per LC-17. The sweep never wins by default, which
is why its consistency can be `E` without risking a lost hold mid-payment.

The `now()` comparison is a **range scan on the key**, never an index
predicate (ADR-DB5-003 R3).

## 4. Ledger

**IDX-115** — `inventory_ledger_entries (sku_stock_id, id)` — is the
**only** non-PK index on this append-only table, deliberately.

- It serves ledger replay, which is the **rebuild source of truth** for
  stock balances (DB4 §3).
- Replay uses `IMMUTABLE_CURSOR` on `id` (ADR-DB5-001 R5). `id` is `bigint`
  identity, so the order is monotonic, total and gap-free in scan terms — an
  offset-paged replay that skipped a row under concurrent appends would
  silently produce a wrong balance.
- **Rejected:** indexes on `soft_hold_id`, `reservation_id`, `order_id`
  (REL-028). These are correlation evidence; no catalogued query reads the
  ledger by them. Three nullable-column indexes on an append-heavy table
  would be textbook over-indexing.
- **Rejected:** `entry_kind` index — the ledger is read by stock row and
  replayed in full, never filtered by kind.

## 5. Asset lifecycle and processing queues

| Path | Predicate | Index |
|---|---|---|
| Storage key uniqueness | `storage_key` | IDX-019 (CST-017) |
| Derivative storage key | `storage_key WHERE NOT NULL` | IDX-064 |
| Q-26 asset inspection queue | `status IN ('UPLOADED','INSPECTING')` | IDX-086 `(created_at, id)` |
| Q-26 derivative queue | `status IN ('PENDING','PROCESSING')` | IDX-087 `(created_at, id)` |
| Duplicate derivative pipeline | `(asset_id, kind) WHERE status <> 'FAILED'` | IDX-020 (CST-018) |
| **Q-30** derivative resolve | `asset_id = ?` | **IDX-099** |
| Inspection history | `(asset_id, inspected_at)` | IDX-132 |
| Deletion sweep | `status='DELETION_PENDING'` | IDX-133 |
| Merge: assets by uploader | `uploaded_by_customer_id IS NOT NULL` | IDX-119 |

Both queue indexes are `SWEEP`-class (ADR-DB5-003 R1) and stay tiny because
the claimable set **drains**: assets move to `ACCEPTED`/`REJECTED`,
derivatives to `READY`/`FAILED`, and leave the partial index permanently.

### Why IDX-099 exists alongside IDX-020

IDX-020's predicate is `status <> 'FAILED'`. Q-30 filters `status = 'READY'`.
A human can see that `'READY' <> 'FAILED'`, but the **planner cannot**:
`status` is `text` with a CHECK constraint (ADR-DB1-008), and PostgreSQL
does not derive predicate implication across a CHECK's `IN` list to prove
that an equality on one member implies a `<>` on another. The partial index
would therefore not be matched, and Q-30 — a **P0** hot path resolving
signed asset access — would fall back to a scan.

IDX-099 `(asset_id)` is plain and always matchable. Recorded as a justified
overlap in
[`DB5_INDEX_COST_REDUNDANCY_REPORT.md`](./DB5_INDEX_COST_REDUNDANCY_REPORT.md) §4.
This is the clearest example in the catalog of why "a partial unique already
covers those columns" is not a sufficient redundancy argument.

## 6. Authorized asset access (Q-30) — P0

The index makes the derivative *findable*; it does **not** make the access
*authorized*. The locked separation:

- `assets.classification` (COL-TBL022-02) is **private-by-default**
  (INV-09) and drives signed access (CON-044).
- Customer-visible previews must be watermarked
  (`asset_derivatives.is_watermarked`, INV-22).
- Production artifacts are internal-only (INV-21) — TBL-061 associations are
  never exposed through a customer path.
- Authorization is checked against the **owning entity** (request, order,
  gallery entry) before the asset is resolved; there is deliberately no
  index that makes "fetch any asset by id" a convenient customer-facing
  path. See [`DB5_SECURITY_SCOPE_REVIEW.md`](./DB5_SECURITY_SCOPE_REVIEW.md).

## 7. Context-specific associations (ADR-DB4-003)

There is **no polymorphic `asset_links` table** (DB4 locked). Each consumer
owns its association table, and each is covered by its CST-043 unique index
prefix — IDX-046 (production artifacts), IDX-047 (design version assets),
IDX-048 (session assets), IDX-049 (template assets), IDX-050 (gallery),
IDX-051 (request assets).

Consequence for index design, worth stating plainly: **no index spans asset
consumers.** "All associations of this asset" is not a catalogued query and
gets no index. Asset lineage is walked from the owning entity down, never
from the asset up. Building a reverse index would create exactly the
cross-context read path ADR-DB4-003 rejected.

## 8. Write-cost summary

| Table | Profile | Indexes (incl. PK) | Budget | Status |
|---|---|---|---|---|
| TBL-018 sku_stocks | **hot-write, lock anchor** | 2 | ≤3 | ok — deliberately minimal |
| TBL-019 ledger | **append-heavy** | 2 | ≤3 | ok |
| TBL-020 soft_holds | moderate churn | 5 | ≤5 | at budget |
| TBL-021 reservations | moderate churn | 5 | ≤5 | at budget |
| TBL-022 assets | moderate | 5 | ≤5 | at budget |
| TBL-023 inspections | append | 2 | ≤3 | ok |
| TBL-024 derivatives | moderate | 5 | ≤5 | at budget |

`sku_stocks` carries only two indexes (PK + CST-014) — the minimum possible.
This is the deliberate consequence of it being the lock anchor: every index
on it would be maintained inside the most contended transaction in the
system. It is also why Q-20's low-stock index was **rejected** (IDX-R01):
a partial index with a column-vs-column predicate would be re-evaluated on
every stock mutation to accelerate a scan of a few dozen rows.

## 9. Validation handoff

- **DB7:** D7-05 (non-negative stock, CST-061), D7-13 (CST-014), D7-12
  (asset classification representation), CST-018/043 uniqueness.
- **DB8:** D8-05 (last-unit reservation, CC-20), D8-24 (hold races,
  CC-23/24), D8-23 (duplicate derivative pipeline, CC-19); reservation
  expiry vs deposit-verified reserve (CC-22).
- **DB9:** seed must include terminal holds/reservations (so the partial
  indexes are proven to exclude them), reservations with NULL `expires_at`,
  a `FAILED` derivative alongside a `READY` one (the IDX-020/IDX-099
  distinction), and enough ledger rows to make replay meaningful.
- **DB10:** watch `sku_stocks` index count — adding one is a lock-path
  regression, not a neutral change.
