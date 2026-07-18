# DB5 — Index Design: Design & Ordering (CTX-DSN / CTX-ORD)

**Date:** 2026-07-18 · **Git HEAD:** `456e101`
**Tables:** TBL-025..TBL-049
**Index IDs:** IDX-021..030, 032..034, 046..049, 051, 073, 074, 085, 100,
101, 103, 104, 116..118, 125, 136, 137

This context carries the two most critical partial-unique indexes in the
system (IDX-024 single active review, IDX-032 request→order) and the
customer-facing workflow that both protect.

## 1. Design sessions, autosave and expiry

`design_sessions` (TBL-025) is a **high-write** table: autosave updates it
continuously (CC-01). Its index budget is therefore the tightest in the
context.

| Path | Predicate | Index |
|---|---|---|
| Session identity | `session_secret_hash` | IDX-021 (CST-019) |
| Q-25 expiry sweep | `status='ACTIVE'` | IDX-085 `(last_activity_at, id)` |
| Session assets | `(session_id, asset_id)` | IDX-048 (CST-043) |

**Total: three indexes including PK.** Deliberately minimal.

- **Rejected:** `submitted_request_id` (IDX-R12) — a rare provenance lookup
  on a hot-write table.
- **Rejected:** the four catalog geometry refs (REL-040: product, variant,
  side, area). These are forward references read by PK; four FK indexes
  would tax every keystroke-level save for no catalogued read.
- `autosave_revision` (COL-TBL025-05) is the **only** optimistic marker in
  the schema (CC-01, GRD-027). It is compared in-transaction against a row
  already located by PK or secret hash — it is **not** a lookup key and is
  never indexed. Indexing an optimistic counter would be a pure write tax.

`design_document` (JSONB) is **not indexed** — opaque read-whole
(ADR-DB4-004 #1). See
[`DB5_JSONB_INDEX_REVIEW.md`](./DB5_JSONB_INDEX_REVIEW.md).

## 2. Design case and versions

| Path | Predicate | Index |
|---|---|---|
| One thread per request | `custom_request_id` | IDX-022 (CST-020) |
| Q-10 version history | `design_case_id` | IDX-023 (CST-021), scanned backwards |
| **Q-11 current review version** | `(design_case_id) WHERE status='SENT_FOR_REVIEW'` | **IDX-024 (CST-022)** |
| Reviews by version | `(design_version_id, decided_at)` | IDX-116 |
| Version assets | `(design_version_id, asset_id)` | IDX-047 (CST-043) |

### IDX-024 — the single-active-review index (P0)

This is the most important index in the context and one of the few where
the integrity mechanism and the access path are **the same object**:

- It enforces **INV-16 / GRD-004**: at most one version per case may be in
  `SENT_FOR_REVIEW`.
- It arbitrates **CC-03** (simultaneous send-for-review): the first insert
  wins, the second gets a constraint violation mapped to
  `REVIEW_ALREADY_ACTIVE`. The uniqueness *is* the concurrency control —
  no lock is required for this race.
- It is the exact access path for **Q-11**, which returns ≤1 row by
  construction.

**No separate performance index is permitted on this path**, and the partial
predicate must use the exact DB3 state name `SENT_FOR_REVIEW` (DB3 §1). A
weakened non-unique variant would silently destroy INV-16.

Verified by D7-04 and D8-09 (both marked critical in DB4).

Q-10 needs no descending index: IDX-023 is scanned backwards for
`version DESC, id DESC` (ADR-DB5-004 R5). `version` is already unique within
the case (CST-021), so the order is total even before the `id` tie-breaker.

## 3. Approval snapshots and templates

| Path | Index |
|---|---|
| **Q-14** approval by version | IDX-025 (CST-023, unique `design_version_id`) |
| Snapshots by request (case timeline) | IDX-136 |
| Thread colors | IDX-063 (CST-051) prefix |
| Agreement acceptances | IDX-026 (CST-024) prefix |
| Template versions | IDX-027 (CST-025) |
| Template assets | IDX-049 (CST-043) |

`approval_snapshots` rows are **fully immutable** (CST-091), so their index
maintenance cost is insert-only — the cheapest possible profile. The
snapshot is the integrity anchor of the whole production chain (INV-01/03):
`order_items.approval_snapshot_id`, `production_jobs.approval_snapshot_id`
and `production_specifications` all reference it, and none of those reverse
lookups is indexed because all are read forward from a known snapshot.

## 4. Custom requests

| Path | Predicate | Index |
|---|---|---|
| **Q-21** listing by status | `status = ?` | **IDX-073** `(status, created_at DESC, id DESC)` |
| Lookup by code | `code` | IDX-028 (CST-026) |
| Merge / customer view | `customer_id` | IDX-117 |
| QX-01 transitions | `(custom_request_id, id)` | IDX-100 |
| Moderation notes | `(custom_request_id, created_at)` | IDX-137 |
| COP / breakdowns / assets | — | IDX-029/030/051 (CST-027/028/043) |

### IDX-073 composite justification

- `status` is the **equality** predicate → leads. LC-11 has ~10 members, so
  each bucket is a fraction of the table.
- `created_at DESC, id DESC` matches Q-21's sort **exactly and in the same
  direction**, so the scan needs no sort node (ADR-DB5-001 R3).
- **Why not narrower:** `(status)` alone forces a sort of the whole bucket.
- **Why not wider:** adding `customer_id` serves no catalogued query.
- **Leading-prefix utility:** `(status)` also serves the Q-22 dashboard
  per-status counts, so the dashboard needs **no index of its own**.

The status set must use exact LC-11 members including **`QUOTE_ACCEPTED`**
(DB3 §1) — the state between `QUOTED` and `DIGITIZING` that ADR-DB3-001
locked. Omitting it from an admin queue predicate would make accepted
quotations invisible to operations.

`custom_requests.code` is a **display and lookup key, never an authorization
input** (COL-TBL037-01). IDX-028 exists for admin lookup; customer access is
always grant-scoped (Q-08 → Q-09).

## 5. Orders

| Path | Predicate | Index |
|---|---|---|
| **Q-17/Q-18** payment queues | `status = ?` | **IDX-074** `(status, created_at, id)` |
| Lookup by code | `code` | IDX-031 (CST-029) |
| **Request → order** | `custom_request_id` | **IDX-032 (CST-030)** |
| **QX-02** cancelling orders | `status='CANCELLING'` | IDX-104 |
| Merge | `customer_id` | IDX-118 |
| Items | `(order_id, position)` | IDX-033 (CST-031) |
| QX-01 transitions | `(order_id, id)` | IDX-101 |

### IDX-032 — request→order uniqueness (P0)

Enforces **INV-19 / GRD-009**: one order per request. It arbitrates
**CC-11** (duplicate order creation from approval-event redelivery or a
double click) — first creates, duplicates replay the order reference via
idempotency. It is simultaneously Q-09's and Q-15's access path. Verified by
D8-12 (critical).

The order-creation *gate* (approval exists + accepted current version) is
**CST-113 — a TX read**, deliberately not fabricated as an FK or an index.

### Order status ordering

IDX-074 sorts **ascending** (`created_at, id`) because Q-17/Q-18/Q-19 are
worklists processed **oldest-first**, unlike Q-21's newest-first admin
listing. The direction difference is intentional and each index matches its
query's direction (ADR-DB5-001 R3).

`orders.status` has 11 members (LC-14) including **`ON_HOLD`** and
**`CANCELLING`**. Both appear in real predicates:

- `ON_HOLD` excludes an order from the production-start gate (GRD-022,
  CST-112) — a TX read, no index.
- `CANCELLING` is the saga's working state and gets **IDX-104**, a partial
  index that should hold near-zero rows.

## 6. Cancellation and saga resume (QX-02) — P0

| Path | Predicate | Index |
|---|---|---|
| Open cancellation review | `(order_id) WHERE status='PENDING'` | IDX-034 (CST-032) |
| Orders mid-cancellation | `status='CANCELLING'` | IDX-104 |
| Saga step replay | `(order_id, id) WHERE event_kind='SAGA_STEP'` | IDX-103 |

There is **no saga-state table** (DB4 §4 — deliberately not created). Resume
derives from `order_transitions` SAGA_STEP rows plus aggregate states, which
is exactly why IDX-103 is `required` rather than nice-to-have: it is the
only access path to the resume source (D8-19).

Both partial indexes are tiny by construction — `CANCELLING` and `PENDING`
review are transient states — which keeps saga resume cheap regardless of
order-table growth.

Pagination for QX-02 is `IMMUTABLE_CURSOR` on `id`, never offset: replay
must be **gap-free and deterministic** (ADR-DB5-001 R5).

## 7. Shipping freeze (QX-09) — P0

| Path | Index |
|---|---|
| Shipping detail by order | IDX-035 (CST-033) |
| Dispatch freeze snapshot | IDX-036 (CST-034) |
| Fee acknowledgements | IDX-125 |

Both access paths are unique constraints; **no performance index is needed**
in shipping. The freeze semantics that matter for index design:

- `shipping_details.status` goes `EDITABLE → FROZEN` (COL-TBL047-10); at
  `FROZEN` all columns reject mutation (CST-094, GRD-017/024). A frozen row
  is effectively immutable, so its index maintenance stops.
- `shipping_snapshots` (TBL-048) is the immutable dispatch-time copy;
  CST-034's unique on `order_id` enforces **one freeze per order** (D8-14).
- **Final payment before dispatch is CST-110 — a TX read**, not an FK and
  not an index. The remaining obligation's `SATISFIED` state is read under
  the order-row lock inside the dispatch transaction (GRD-016, CC-14).
  Fabricating an FK or index for it would misrepresent a cross-aggregate
  temporal fact as a row fact.

## 8. Transition history (QX-01)

Three tables, three identical `(parent_id, id)` indexes:
IDX-100 (requests), IDX-101 (orders), IDX-102 (production jobs, see the
Production doc).

- All are append-only (CST-098) with `bigint` identity PKs, so `id` alone is
  a total, monotonic order — `IMMUTABLE_CURSOR` needs no second sort key.
- **There is no global weakly-typed transition table** (ADR-DB4-002, DB4
  locked). The hybrid model means three small indexes instead of one large
  hot one, which is better for both write locality and query selectivity.
- Actor columns (`admin_id`, `customer_id`, `grant_id`, `system_job_key`)
  are **evidence, not filters** — none is indexed. Actor-based investigation
  goes through `audit_events` (Q-29), which is the table designed for it.
- `correlation_id` on transitions is not indexed; correlation search is an
  audit path (IDX-097).

## 9. Write-cost summary

| Table | Profile | Indexes (incl. PK) | Budget | Status |
|---|---|---|---|---|
| TBL-025 design_sessions | **hot-write (autosave)** | 3 | ≤3 | at budget |
| TBL-026 session_assets | temp | 2 | ≤5 | ok |
| TBL-027 design_cases | low | 2 | ≤5 | ok |
| TBL-028 design_versions | low (immutable once sent) | 3 | ≤5 | ok |
| TBL-029 version_assets | low | 2 | ≤5 | ok |
| TBL-030 design_reviews | append | 2 | ≤3 | ok |
| TBL-031 approval_snapshots | insert-only immutable | 3 | ≤5 | ok |
| TBL-032/033 snapshot children | insert-only | 2 each | ≤5 | ok |
| TBL-034..036 templates | read-mostly | 2 each | ≤6 | ok |
| TBL-037 custom_requests | moderate | 4 | ≤5 | ok |
| TBL-038..040 request children | low | 2 each | ≤5 | ok |
| TBL-041 moderation_notes | append | 2 | ≤3 | ok |
| TBL-042 request_transitions | **append-heavy** | 2 | ≤3 | ok |
| TBL-043 orders | moderate | 5 | ≤5 | at budget |
| TBL-044 order_items | insert-only immutable | 2 | ≤5 | ok |
| TBL-045 order_transitions | **append-heavy** | 3 | ≤3 | at budget |
| TBL-046 cancellation_requests | rare | 2 | ≤5 | ok |
| TBL-047 shipping_details | low, freezes | 2 | ≤5 | ok |
| TBL-048 shipping_snapshots | insert-only | 2 | ≤5 | ok |
| TBL-049 fee_acks | append | 2 | ≤3 | ok |

Three tables sit at budget: `design_sessions` (hot-write, minimal by
design), `orders` (5 indexes, all serving P0/P1 paths), and
`order_transitions` (3 on an append-heavy table — PK, IDX-101, IDX-103;
IDX-103 is justified as the sole saga-resume path).

## 10. Validation handoff

- **DB7:** **D7-04** (single active review, CST-022), D7-13 (CST-020/026/
  029/030/033), D7-03 (immutability families), D7-07 (snapshot NOT NULLs).
- **DB8:** **D8-09** (concurrent send-for-review, CC-03), **D8-12**
  (duplicate order creation, CC-11), D8-08 (approve races, CC-02/04),
  D8-14 (double freeze, CC-15), D8-19 (cancellation saga, CC-13),
  D8-22 (stale autosave, CC-01).
- **DB9:** seed must include a case with a `SENT_FOR_REVIEW` version and
  several superseded ones; an order in `ON_HOLD` and one in `CANCELLING`
  with SAGA_STEP transitions; requests spread across all LC-11 states
  including `QUOTE_ACCEPTED`; a frozen shipping detail with its snapshot.
