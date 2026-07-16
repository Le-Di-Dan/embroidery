# DB4 — State & Transition Storage

**Date:** 2026-07-15 · **Git HEAD:** `a79f523`
**Rule set:** status = `text + CHECK` with exact DB3 value sets
([`DB3_DB4_HANDOFF.md`](./DB3_DB4_HANDOFF.md) §1; CST-060). Transition
**legality** is never encoded in CHECK (GRD-019 = TX/App; D7-02).
History tiers per [ADR-DB4-002](../adr/database/ADR-DB4-002-TRANSITION-HISTORY-STORAGE.md).
Derived states are computed, never stored (DB3 derived-state catalog);
no `global_status` column exists anywhere — every lifecycle keeps its own
authoritative column.

## 1. Lifecycle → storage map (29 lifecycles = 23 DB0 + 6 DB2 additions)

| # | Lifecycle | Authoritative state storage | History (tier) | Concurrency token / lock | Terminal behavior |
|---|---|---|---|---|---|
| LC-01 | Admin Account / Admin Session | `admin_accounts.status` / `admin_sessions.status` | C: timestamps + audit | row lock | DISABLED terminal (successor row); EXPIRED/REVOKED terminal |
| LC-02 | Verification Challenge | `contact_verification_challenges.status` | B: `contact_verification_attempts` + timestamps | one-open partial unique (CST-007); expiry checked in-tx | all non-ISSUED terminal; retry = new challenge |
| LC-03 | Secure Grant | `secure_access_grants.status` | C: timestamps + supersede chain + audit | grant state read in action tx (CC-16) | EXPIRED/REVOKED terminal; reissue = new row |
| LC-04 | Product/Category publication (+ Gallery/Content/Template reuse) | `status` on each table | C: `archived_at`/`published_at` + audit | — | ARCHIVED reversible (audited) |
| LC-05 | SKU availability | **derived — never stored** (computed balance + `products.is_display_out_of_stock`) | n/a | reservation correctness reads locked `sku_stocks` (GRD-014) | n/a |
| LC-06 | Asset / Derivative | `assets.status` / `asset_derivatives.status` | B: `asset_inspections` + tombstone timestamps | worker idempotency (CC-19) | DELETED tombstone terminal; REJECTED quarantine terminal |
| LC-07 | Design Session | `design_sessions.status` | C: timestamps (transient data) | `autosave_revision` optimistic marker (CC-01) | DELETED terminal (hard delete) |
| LC-08 | Design Version | `design_versions.status` | B: version rows + `design_reviews` + state timestamps | version row lock + CST-022 partial unique (CC-02/03/04) | APPROVED/SUPERSEDED/VOID terminal; APPROVED immutable (INV-17) |
| LC-09 | Customer Review | derived from version SENT_FOR_REVIEW | B: `design_reviews` append | first-decision-wins on version row | decisions append-only |
| LC-10 | Approval | **exists-or-not** — `approval_snapshots` row | snapshot itself + order pointer moves (`order_transitions` POINTER_MOVE) | created in approval tx | never mutated/deleted |
| LC-11 | Custom Request | `custom_requests.status` (incl. QUOTE_ACCEPTED) | **A: `custom_request_transitions`** | request row in submission/cancel tx; `request.submit` idem (CC-18) | REJECTED/CANCELLED terminal |
| LC-12 | Quotation header | `quotations.status` + `current_version_id` | B: version facts + timestamps | header lock for version seq (CC-28) | REJECTED/CANCELLED terminal; EXPIRED re-activatable via new version |
| LC-13 | Quotation Version | `quotation_versions.status` | B: version rows + `quotation_acceptances` + timestamps | state check in accept tx (CC-05/06) | ACCEPTED/SUPERSEDED/EXPIRED/REJECTED/VOID terminal; frozen once SENT |
| LC-14 | Order | `orders.status` (incl. ON_HOLD, CANCELLING) | **A: `order_transitions`** (state/delivery/saga/freeze/pointer events) | **order row lock** (CC-11..15); CST-030 unique | COMPLETED/CANCELLED terminal; no backward fulfillment |
| LC-15 | Payment Obligation | `payment_obligations.status` | B: reconciliations + `satisfied_by`/timestamps + supersede chain | obligation row lock (CC-10) | SATISFIED/CANCELLED/SUPERSEDED terminal |
| LC-16 | Payment Attempt | `payment_attempts.status` | B: `payment_provider_events` + `payment_reconciliations` + timestamps | attempt row lock; no-regress rule (CC-07/08/09) | terminal states never regress; REQUIRES_REVIEW resolvable [R] |
| LC-17 | Soft Hold / Reservation | `inventory_soft_holds.status` / `inventory_reservations.status` | B: `inventory_ledger_entries` (reasoned) + timestamps | `sku_stocks` row lock (CC-20..24) | CONVERTED/RELEASED/EXPIRED/CONSUMED terminal; idempotent |
| LC-18 | Production Job | `production_jobs.status` | **A: `production_job_transitions`** | order-row contention at start (CC-12) | COMPLETED/CANCELLED terminal; rework = new job |
| LC-19 | Delivery / Shipping freeze | order states + `shipping_details.status` (EDITABLE/FROZEN) + `frozen_at` | A: `order_transitions` (SHIPPING_FREEZE, DELIVERY_EVENT, POST_FREEZE_CORRECTION) | shipping row locked in dispatch tx (CC-15) | FROZEN irreversible; snapshot row is the evidence |
| LC-20 | Refund Record | `refunds.status` | B: refund row + reconciliations + audit | attempt row cross-check (CC-09) | EXECUTED/REJECTED terminal |
| LC-21 | Cancellation saga | order `CANCELLING` + request `CANCELLED` (no saga-state table — optional per DB3, not created) | A: `order_transitions` SAGA_STEP rows (resume source) | order row + idempotent steps (CC-13) | converges to CANCELLED; never half-terminal |
| LC-22 | Outbox Event | `outbox_events.status` | operational columns (attempt_count, timestamps) | claim skip-locked (GRD-029, CC-25) | DISPATCHED/DEAD_LETTER terminal; rows cleaned |
| LC-23 | Idempotency Record | `idempotency_records.status` | operational timestamps | unique claim (CST-048) + fingerprint (GRD-030) | COMPLETED then TTL cleanup |
| +1 | Notification Intent | `notification_intents.status` | B: `notification_delivery_attempts` | intent-key unique (CST-047) + claim (CC-26) | SATISFIED/FAILED/CANCELLED terminal; resend = new intent |
| +2 | Delivery Attempt outcomes | `outcome` value per append row (not a machine) | the rows themselves | — | append-only |
| +3 | Agreement Version | `agreement_versions.status`; **EFFECTIVE derived** | C: state timestamps + audit; CST-046 one-effective guard | publish tx reads/supersedes prior | SUPERSEDED/WITHDRAWN terminal; frozen once PUBLISHED |
| +4 | Design Template | `design_templates.status` + `current_version` | C: version rows are the publish history | publish bumps version atomically | ARCHIVED reversible (audited); clones unaffected |
| +5 | Customer Merge | `customer_merge_cases.status` | B: `customer_merge_events` | ordered locks on both customers (CC-27) | EXECUTED/REJECTED terminal |
| +6 | Background Job Attempt | `outcome` per append row; dead-letter = FAILED_TERMINAL row | the rows themselves | worker retry budget [cfg] | requeue = new job |

## 2. Actor / reason / correlation on transitions

Tier A tables carry `actor_kind` + typed actor refs + `reason`
(nullable-with-[R]) + `customer_visible_reason` (where DB3 requires) +
`correlation_id` NOT NULL. Tier B/C lifecycles get actor/reason via their
append records (reviews, reconciliations, ledger, merge events) and audit
rows (SE-019, mandatory correlation id).

## 3. Optimistic concurrency / locks

Only `design_sessions.autosave_revision` is an optimistic marker (CC-01).
All other CC strategies are row locks, partial/plain uniques, in-tx state
checks, or idempotency claims per
[`DB3_CONCURRENCY_SPECIFICATION.md`](./DB3_CONCURRENCY_SPECIFICATION.md) —
no speculative `lock_version` columns were added (ADR-DB1-006 allows them
"only where DB3/DB4 requires").

## 4. Invalid-state handoff

- Value sets: CHECK (CST-060; D7-01 with TS↔DB set-equality).
- Transition legality: GRD-019 App/TX with D7-02 representation fixtures.
- Immutable/terminal defense: reject-mutation triggers CST-090..100
  (D7-03/11).
- Derived states (dashboard buckets, fully-paid, effective agreement,
  availability): computed at read; guards read source facts in-tx (DB3
  derived-state rule) — nothing here becomes authoritative by storage.
