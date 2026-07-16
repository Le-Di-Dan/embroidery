# DB4 — Context Schema: Production & Shipping (CTX-PRD / CTX-ORD shipping)

**Date:** 2026-07-15 · **Git HEAD:** `a79f523` · Logical only.
Tables: TBL-059..063 (Production), TBL-047..049 (Shipping, owned by Order).

## 1. Production structures

| Table | Role |
|---|---|
| `production_jobs` (TBL-059) | LC-18 job; NOT NULL exact `approval_snapshot_id` (INV-03); unique (order, approval) (CST-041); `reworked_from_job_id` lineage |
| `production_specifications` (TBL-060) | immutable 1–1 spec frozen from the approval at job creation: copied `document_hash` (hash linkage, D7-07), display copies, dimensions, quantity, production parameters |
| `production_artifacts` (TBL-061) | job↔asset associations (digitized/machine files, photos) — internal, unwatermarked (INV-21/22) |
| `production_notes` (TBL-062) | append-only notes |
| `production_job_transitions` (TBL-063) | Tier A transition history (ADR-DB4-002) |

### Assertions

1. **Exact approval linkage:** job + spec both carry NOT NULL approval
   refs + copied hash; the start gate re-checks approval/deposit/
   reservation/order-state in-tx (GRD-015/022 = CST-112; CC-12/D8-13).
2. **New spec/job per superseding approval:** rework/revision always
   cancels the old job ([R]) and creates a new job + new immutable spec
   against the new snapshot (ADR-DB3-003 r2/3); CST-041 makes "same order,
   same approval" jobs idempotent and forces a new approval for a new job.
   Existing specs are trigger-immutable (CST-095) — no amendment path
   exists.
3. **Hold/rework representable:** pause = order ON_HOLD (order-side state),
   not a job state; job CANCELLED with reason=rework + `reworked_from`
   lineage records the chain.

## 2. Shipping structures (Order-owned per ADR-DB2-002)

| Table | Role |
|---|---|
| `shipping_details` (TBL-047) | mutable preparation record (recipient, VN address fields, final fee, carrier/tracking internal, fulfillment note); status EDITABLE/FROZEN |
| `shipping_snapshots` (TBL-048) | immutable dispatch-time copy (one per order, CST-034) incl. `dispatched_at` |
| `shipping_fee_acknowledgements` (TBL-049) | append-only customer acknowledgement of post-order fee increases (grant + step-up evidence, old/new amounts) |

### Assertions

1. **Freeze atomic boundary:** the dispatch transaction (TR-LC14-07)
   validates GRD-016 (final payment) + completeness, creates the snapshot
   row, sets detail FROZEN + `frozen_at`, and writes an
   `order_transitions` SHIPPING_FREEZE event — one tx (GRD-017; CC-15/
   D8-14). After freeze, both detail and snapshot reject mutation
   (CST-094).
2. **Post-freeze corrections are compensating:** address mistakes after
   dispatch become `order_transitions` POST_FREEZE_CORRECTION events with
   reason (audited), never edits (DB3 shipping spec §2).
3. **Fee changes before dispatch:** fee increase after order exists
   requires an acknowledgement row (TBL-049) + remaining-obligation
   recalculation via `payment_reconciliations` (OBLIGATION_RECALC) and
   obligation supersede chain; decreases are audited + recalculated without
   acknowledgement. Payable truth is always the current obligations —
   never a live fee read.
4. **Final payment gate stays TX/App:** GRD-016 is CST-110 — deliberately
   **not** fabricated as an FK/constraint; the schema supplies the facts
   (obligation kind/status rows) read under lock in the dispatch tx
   (D8-15).
5. **Pickup/no-ship readiness:** detail is optional (0..1) with
   `fulfillment_note`; no separate fulfillment state machine (ADR-DB2-002
   r9).

## 3. State & history

LC-18 = Tier A (`production_job_transitions`); LC-19 has no separate
machine — delivery lives in order states + freeze events (`order_transitions`);
shipping detail EDITABLE→FROZEN is Tier C state + the freeze event row.
Retention: production commercial; shipping PII anonymized after retention
window (snapshot redaction only via break-glass privacy procedure).
