# DB5 — Index Design: Production & Shipping (CTX-PRD / shipping side of CTX-ORD)

**Date:** 2026-07-18 · **Git HEAD:** `456e101`
**Tables:** TBL-059..TBL-063 (production), TBL-047..TBL-049 (shipping)
**Index IDs:** IDX-035, 036, 044..046, 082, 102, 125, 138

The smallest index footprint of any context — deliberately. Almost every
access path here is either a unique constraint or a short partial queue, and
the integrity that matters is enforced by NOT NULL snapshot references and
in-transaction gates rather than by indexes.

## 1. Production readiness and the active queue (Q-19)

**IDX-082** — `production_jobs (created_at, id) WHERE status IN ('PLANNED','STARTED')`

- Partial predicate uses exact LC-18 members; `COMPLETED` and `CANCELLED`
  rows leave the index permanently, so the queue index stays small forever.
- Ascending sort — the production queue is a worklist processed
  **oldest-first**, matching Q-17/Q-18 and unlike Q-21's newest-first admin
  listing (ADR-DB5-001 R3).
- `TOP_N` pagination; the queue is expected to hold a handful of jobs.

## 2. Order and approval linkage

**IDX-044** — `production_jobs (order_id, approval_snapshot_id)` (CST-041)

This one index does three jobs:

- Enforces **CST-041**: one job per (order, approval snapshot), the
  `production.start` idempotency backstop (D8-13).
- Its **leading prefix `(order_id)`** serves job-by-order lookup — which is
  why a separate `production_jobs (order_id)` index was **rejected**
  (IDX-R04).
- Its second key covers the approval-snapshot linkage (REL-091).

`production_specifications` uses IDX-045 (CST-042, unique
`production_job_id`); the spec is **immutable** (CST-095) and frozen from
the approval at job creation (INV-03).

### The integrity chain is references, not indexes

`order_items.approval_snapshot_id`, `production_jobs.approval_snapshot_id`
and `production_specifications.document_hash` are all **NOT NULL**
(CST-080, D7-07) and carry the exact-approval chain (INV-03, GRD-007/015).

None of the *reverse* lookups is indexed — "all jobs for this approval
snapshot", "all order items for this snapshot" — because every read walks
the chain **forward** from a known order or job. Indexing the reverse
direction would serve no catalogued query (IDX-R06).

`production_specifications.document_hash` is a copied approval hash used for
**equality verification in-transaction**, not for lookup. It is not indexed;
hash comparison happens on a row already located by `production_job_id`.

## 3. Production start gate

**CST-112 is a TX read, not a schema mechanism.** Starting production
requires, all checked inside the transaction under the **order-row lock**
(CC-12):

- an approval snapshot exists (INV-03),
- the deposit obligation is `SATISFIED` (GRD-013 / CST-111),
- an official reservation exists (INV-05),
- the order is **not** `ON_HOLD` and **not** `CANCELLING` (GRD-022).

No index encodes this. It is a multi-row, multi-context condition, and
fabricating an FK or a composite index for it would misrepresent a temporal
cross-aggregate fact as a row fact. The lock anchor is the **order row**
(CC-12), reached by PK — so the gate needs no index at all.

## 4. Rework and supersede lineage

`production_jobs.reworked_from_job_id` (COL-TBL059-04, REL-092) records
rework lineage per ADR-DB3-003 r3. **Not indexed** — the chain is walked
forward from a known job, and rework is rare.

Post-approval revision repoints `orders.current_approval_snapshot_id`
(REL-074) as an **audited pointer move**, with history preserved via
`order_transitions` `POINTER_MOVE` rows. Consequences for index design:

- The pointer is followed by PK — no index.
- Historical snapshots are **retained, never rewritten**; there is no index
  for finding snapshots to update, because updating them is prohibited
  (CST-091).
- The `POINTER_MOVE` history is read through IDX-101 (order transitions by
  order).

Rework cancellation of a prior job is a transition recorded in
`production_job_transitions` — **IDX-102** `(production_job_id, id)`.

## 5. Artifacts and notes

| Path | Index | Note |
|---|---|---|
| Artifacts by job | IDX-046 (CST-043) prefix | |
| Notes by job | IDX-138 `(production_job_id, created_at)` | append-only |
| Transitions by job | IDX-102 `(production_job_id, id)` | append-only |

**Production artifacts are internal-only and unwatermarked** (INV-21/22,
COL-TBL024-06). No index exposes them through a customer-facing path, and
the association table is reached only from the job. Classification lives on
the asset row and is checked there (CST-123, D7-12) — an index cannot
enforce this and none pretends to.

## 6. Dispatch-ready, freeze and tracking

| Path | Index | Constraint |
|---|---|---|
| Shipping detail by order | IDX-035 | CST-033 unique |
| Dispatch freeze snapshot | IDX-036 | CST-034 unique |
| Fee acknowledgements | IDX-125 | append-only |

**No performance index exists in shipping.** Both access paths are unique
constraints on `order_id`, and QX-09 (freeze-state read) needs nothing more.

The freeze semantics that shape this:

- `shipping_details.status` moves `EDITABLE → FROZEN` (COL-TBL047-10) in the
  dispatch transaction, which sets `frozen_at` (GRD-017). At `FROZEN` every
  column rejects mutation (CST-094) — the row becomes effectively immutable
  and its index maintenance stops.
- `shipping_snapshots` is the immutable dispatch-time copy; CST-034 enforces
  **one freeze per order** (D8-14). **CC-15**: an edit racing the freeze is
  rejected with `IMMUTABLE_RECORD`; the dispatch transaction locks the
  detail row.
- **CST-110 — final payment before dispatch — is a TX read.** The remaining
  obligation's `SATISFIED` state is read under the order-row lock inside the
  dispatch transaction (GRD-016 / BR-006, CC-14). DB4 explicitly declined to
  fabricate this as an FK, and DB5 correspondingly creates no index: a
  dispatch gate is a temporal condition, not a row relationship.

`carrier_name` and `tracking_code` (COL-TBL047-08) are internal-only
(D-017) and **not indexed** — no catalogued query looks an order up by
tracking code. Adding that path would create an unauthenticated
order-enumeration surface for no operational benefit.

## 7. Delivery history

Delivery events are **`order_transitions` rows** with
`event_kind='DELIVERY_EVENT'` (CON-081 scope, COL-TBL045-03) — there is no
separate delivery-events table (DB4 §4). They are read through **IDX-101**
`(order_id, id)` alongside the rest of the order timeline.

A partial index on `event_kind='DELIVERY_EVENT'` was considered and
**rejected**: unlike `SAGA_STEP` (IDX-103), delivery events are read as part
of the full order timeline, not as an isolated resume source. IDX-101 serves
them at no extra cost.

## 8. Write-cost summary

| Table | Profile | Indexes (incl. PK) | Budget | Status |
|---|---|---|---|---|
| TBL-059 production_jobs | low | 3 | ≤5 | ok |
| TBL-060 specifications | insert-only immutable | 2 | ≤5 | ok |
| TBL-061 artifacts | low | 2 | ≤5 | ok |
| TBL-062 notes | append | 2 | ≤3 | ok |
| TBL-063 job_transitions | append | 2 | ≤3 | ok |
| TBL-047 shipping_details | low, freezes | 2 | ≤5 | ok |
| TBL-048 shipping_snapshots | insert-only | 2 | ≤5 | ok |
| TBL-049 fee_acks | append | 2 | ≤3 | ok |

Every table is comfortably inside budget; no exceptions requested. At <100
orders/month, production and shipping simply do not generate enough rows to
justify more.

## 9. Validation handoff

- **DB7:** D7-07 (NOT NULL snapshot references — `order_items`,
  `production_jobs.approval_snapshot_id`,
  `production_specifications.document_hash`), D7-03 (CST-094/095
  immutability), CST-041/042/033/034 uniqueness.
- **DB8:** **D8-13** (duplicate job per approval, CC-12 production start vs
  cancel/hold), **D8-14** (double freeze, CC-15), **D8-15** (dispatch without
  final payment, CC-14), D8-19 (rework/cancel interaction).
- **DB9:** seed must include a completed job, a cancelled job, a rework
  chain (`reworked_from_job_id` set), an order with a frozen shipping detail
  plus its snapshot, and an order with delivery-event transitions.
- **DB10:** no collation or bloat concerns in this context; the tables are
  small and mostly immutable.
