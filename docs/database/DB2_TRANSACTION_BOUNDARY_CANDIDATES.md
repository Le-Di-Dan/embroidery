# DB2 — Transaction Boundary Candidates

**Date:** 2026-07-15 · **Git HEAD:** `f90f78c`
**Baseline:** transaction boundary owned by application use case
(ADR-DB1-009); explicit transactions mandated for the SYSTEM_ARCHITECTURE §11
list; outbox written inside the business transaction (INV-23). No transaction
code is written here.

**Orchestration rule:** cross-context workflows are **not** wrapped in one
database transaction unless a single invariant demands it; each row states
whether it is single-context or event-orchestrated.

Legend: Consistency `strong` = invariant must hold within the tx;
`event` = downstream contexts converge via outbox events. DB8 = concurrency
verification requirement.

| Use case | Aggregates mutated | Contexts | Shape | Consistency requirement | Idempotency | Concurrency risk | Outbox | DB3 guard dependency | DB8 verification |
|---|---|---|---|---|---|---|---|---|---|
| Request submission | AGG-13 (+AGG-10 version 1, AGG-04 grant) | ORD+DSN+CUS | single orchestrated use case, one tx | request+case+grant exist together or not at all | submission key (REQ-REQ-004) | duplicate submits | yes (notify, admin alert) | verified-customer precondition | duplicate-submission race |
| Formal design version creation | AGG-10 | DSN | single-context | version chain integrity | admin action idempotent-safe | low | optional | naming/state rules | — |
| Send one active review version | AGG-10 | DSN | single-context | **INV-16**: at most one awaiting review | resend returns current | concurrent send/supersede | yes (notify) | review expiry rules | **yes** (partial-unique race) |
| Approval snapshot creation | AGG-10 state + AGG-11 create | DSN (+CNT ref read) | single-context tx | snapshot + version state + terms ref atomically | approval action key | approve vs revise race; approve on superseded version | yes (approval event) | GAP-03 ordering; re-verification (GAP-12) | **yes** |
| Quotation version creation | AGG-14 | QUO | single-context | INV-02 freeze at send; header pointer consistent | admin send idempotent | concurrent revise/send | yes (notify) | state names | yes |
| Quotation acceptance | AGG-14 | QUO | single-context | acceptance recorded once against exact version | secure-flow duplicate clicks | double accept; accept on expired | yes (event) | acceptance-vs-approval ordering (DEC-16) | yes |
| Order creation | AGG-15 | ORD | single-context (inputs = accepted snapshot refs) | **INV-19 no duplicate order** per case | creation key per request/commercial state | double creation race | yes (event) | creation boundary conditions (DB3) | **yes** |
| Payment callback reconciliation | AGG-16 + CON-102 + CON-141 | PAY+PLT | single-context tx | one application per provider event; INV-07 | **provider-ref key, server-side** | duplicate/out-of-order/concurrent callbacks | yes (payment-verified event) | provisional payment states | **yes (critical)** |
| Payment obligation satisfaction | AGG-16 | PAY | single-context (inside callback tx or reconciliation tx) | obligation satisfied exactly once | inherited from callback | double satisfaction | yes | partial-payment policy (DB3) | **yes** |
| Official inventory reservation | AGG-07 | INV (triggered by PAY event) | single-context tx, row-locked | INV-05 gate inputs; INV-18 non-negative | reservation-per-order key | concurrent reservations on same SKU | yes (reserved event) | insufficient-stock behavior | **yes (critical)** |
| Reservation release/consume/expire | AGG-07 | INV | single-context | idempotent transitions; balance integrity | operation-natural keys | sweep vs manual race | yes | release policies (cancellation → DB3) | **yes** |
| Production start | AGG-17 (+read gates) | PRD | single-context tx with guard reads | guards satisfied at start (INV-06 inputs); spec frozen | start idempotent | start vs reopen race | yes | rework policy (DEC-23) | yes |
| Production completion | AGG-17 | PRD | single-context | completion once | idempotent re-mark | low | yes (→ORD, obligation) | — | — |
| Delivery completion | AGG-15 | ORD | single-context | delivery requires verified remaining payment; completion after delivery | idempotent re-mark | low | yes (notify) | final gates wording | yes (gate bypass attempts) |
| Cancellation/refund coordination | AGG-15/AGG-13 + PAY/INV via events | ORD orchestrates | **event-orchestrated saga**, per-context txs | each context consistent; overall converges | cancellation key | cancel vs payment/production races | yes (multi-step) | **entire policy = DB3 (O-009/GAP-04)** | **yes** |
| Outbox enqueue with state change | any + CON-140 | owner + PLT | same tx as the state change (INV-23) | event exists iff commit | n/a (relay idempotent consumers) | relay claim contention | is the mechanism | — | **yes (claim/skip-locked)** |
| Session submit handover | AGG-09 → feeds W1 | DSN | joins request-submission tx (read side) | session marked submitted with request created | submission key | expire vs submit race | — | session TTL (O-008) | yes |
| Verified-contact → customer link | AGG-02/AGG-03 | CUS | single-context | one active verified link per contact | challenge key | concurrent verify | yes (verified event) | dedup/merge rules detail | yes |

## Notes for DB3/DB4/DB8

1. **Isolation/locking:** default READ COMMITTED; INV/PAY rows above are the
   candidates for explicit row locking (`FOR UPDATE`) and are the target of
   the DB6 locking spike (ADR-DB1-002) and DB8 races.
2. **Saga explicitness:** cancellation/refund and W4/W6 joints are
   event-orchestrated; DB3 must define per-step compensation semantics, not a
   distributed transaction.
3. Every row's audit obligations follow `07 §12`/INV-14 (actor, timestamp,
   reason on sensitive transitions).
