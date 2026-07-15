# DB3 → DB7/DB8 Test Handoff

**Date:** 2026-07-15 · **Git HEAD:** `0563866`
**Harness baseline:** ADR-DB1-016 (real pinned PostgreSQL; rollback mode cho
constraint tests; truncate mode + real parallel connections cho race tests).

## 1. DB7 candidates (constraint/representation)

| # | Test | Source |
|---|---|---|
| D7-01 | Invalid status value rejected per CHECK set (mọi lifecycle §1 DB4 handoff) + TS↔DB set equality introspection | ADR-DB1-008 |
| D7-02 | Transition legality representation: TR-* matrix fixtures — invalid from→to bị guard/app reject (repository-level tests) | GRD-019 |
| D7-03 | Immutable mutation rejection (generic iteration: versions/snapshots/frozen shipping/agreement versions/order items/spec) kể cả bypass app | GRD-024/ADR-DB1-010 |
| D7-04 | Single active review partial unique | INV-16 |
| D7-05 | Non-negative stock check (+ override chỉ qua adjustment có reason) | INV-18/GRD-023 |
| D7-06 | Exact money: numeric-only introspection | INV-11 |
| D7-07 | Required snapshot references NOT NULL (order items→approval; job→snapshot+hash; approval→version+terms) | INV-03/GRD-007/008 |
| D7-08 | Unique idempotency (namespace,key) + fingerprint conflict path | INV-24/GRD-030 |
| D7-09 | Unique provider event ref | INV-07 |
| D7-10 | Required reason constraints (override, cancel, void, withdraw, merge...) | audit spec |
| D7-11 | Append-only categories reject UPDATE/DELETE | ADR-DB1-010 |
| D7-12 | No plaintext grant token / no secret-shaped fields in notification records | ADR-DB3-004/ADR-DB2-003 |
| D7-13 | One active verified contact link; one open challenge; one active grant; request→order unique; one effective agreement version | DB4 handoff §2 |
| D7-14 | Clone independence: template update không đổi cloned session/version content | GAP-08 |
| D7-15 | Golden-hash vectors (JCS+SHA-256) cross-machine | INV-32 |

## 2. DB8 candidates (transaction/concurrency)

Mỗi scenario ghi: preconditions → concurrent actors → expected winner/loser
→ final authoritative state → side effects → audit → idempotency result.
Chi tiết race semantics tại [`DB3_CONCURRENCY_SPECIFICATION.md`](./DB3_CONCURRENCY_SPECIFICATION.md).

| # | Scenario (CC) | Preconditions | Actors | Winner | Loser outcome | Final state | Effects/audit/idem |
|---|---|---|---|---|---|---|---|
| D8-01 | Duplicate payment callback (CC-07) | attempt PROCESSING; obligation PENDING | 2× same provider event | first claim | replay stored result | attempt SUCCEEDED; obligation SATISFIED once | 1 outbox `payment.verified`; 2 callback evidence rows; audit 1 application |
| D8-02 | Out-of-order callback (CC-08) | attempt SUCCEEDED | late `failed` event | terminal state | recorded-not-applied | SUCCEEDED giữ nguyên | contradiction → REQUIRES_REVIEW khi nội dung mâu thuẫn |
| D8-03 | Manual reconcile vs callback (CC-09) | attempt REQUIRES_REVIEW | admin + provider event | first commit | second → REQUIRES_REVIEW lại | reconciled state | reconciliation record; audit R |
| D8-04 | Obligation satisfaction race (CC-10) | 2 success paths | 2 tx | 1 application | no-op replay | SATISFIED once | single order event |
| D8-05 | Last-unit reservation (CC-20) | stock=1; 2 orders deposit-verified | 2 reserve tx | first lock | `INSUFFICIENT_STOCK` → blocked-production path | 1 RESERVED; balance 0 | ledger 1 entry; admin alert cho loser |
| D8-06 | Release vs consume (CC-21) | RESERVED | cancel saga + production start | first commit | `INVALID_TRANSITION` | terminal 1 trong 2 | ledger consistent |
| D8-07 | Expiry sweep vs deposit success (CC-22) | reservation near expiry | sweep + reserve/keep path | first commit | re-check path per LC-17 | no double release | audit both |
| D8-08 | Concurrent approval vs revision (CC-04) + approve-vs-supersede (CC-02) | version SENT | customer ×2 / admin send mới | first decision/commit | `INVALID_TRANSITION`/`APPROVAL_VERSION_MISMATCH` | 1 decision; snapshot ≤1 | approval idem replay |
| D8-09 | Simultaneous send-for-review (CC-03) | 2 drafts cùng case | admin ×2 | first insert | partial-unique failure | 1 SENT_FOR_REVIEW | — |
| D8-10 | Accept old quote vs revise / expiry (CC-05/06) | version SENT (+sweep) | customer + admin/sweep | first commit | `QUOTE_VERSION_STALE` | 1 accepted hoặc expired | acceptance evidence ≤1 |
| D8-11 | Concurrent version creation (CC-28) | header SENT | admin ×2 | seq lock | replay | 1 new version | — |
| D8-12 | Duplicate order creation (CC-11) | approval event redelivered | 2 consumers | unique(request→order) | replay order ref | 1 order + 2 obligations | 1 `order.created` event |
| D8-13 | Production start vs cancel/hold (CC-12) | order DEPOSIT_PAID | admin start + saga/hold | order-row first commit | `ORDER_ON_HOLD`/`PRODUCTION_BLOCKED` | consistent order/job | audit both attempts |
| D8-14 | Shipping freeze vs edit (CC-15) | READY_FOR_DELIVERY | dispatch + edit | first commit | `IMMUTABLE_RECORD` sau freeze | FROZEN đúng nội dung winner | audit edit trail |
| D8-15 | Final payment vs dispatch (CC-14) | AWAITING_FINAL_PAYMENT | dispatch trước callback | GRD-016 chặn | dispatch fail | dispatch chỉ sau SATISFIED | — |
| D8-16 | Notification duplicate delivery (CC-26) + duplicate outbox → 1 intent | outbox redelivery | 2 consumers/workers | intent-key claim | collapse | 1 intent; attempts append | no duplicate customer message |
| D8-17 | Outbox multi-worker claim (CC-25) | N pending events | 2 relays | claim/skip-locked | skip | each event dispatched once* (*at-least-once tolerated, consumer idem) | dead-letter path on exhausted retry |
| D8-18 | Customer merge race (CC-27) | 2 customers, in-flight case tx | merge + case action | ordered locks | retry with new mapping | refs repointed; snapshots untouched | merge history + audit |
| D8-19 | Cancellation compensation retry (CC-13) | saga step fails mid-way | retry runner | idempotent steps | n/a | CANCELLING→CANCELLED converges; không half-state | step audits không nhân đôi |
| D8-20 | Revoke vs in-flight sensitive action (CC-16) | grant ACTIVE | revoke + approve | first commit | `GRANT_INVALID` | consistent | audit failure |
| D8-21 | Concurrent verification (CC-17) + duplicate submission (CC-18) | guest flow | 2 devices | link lock / submit idem | replay | 1 customer link; 1 request | — |
| D8-22 | Stale autosave (CC-01) | 2 tabs | 2 writers | marker winner | `STALE_WRITE` + current state | latest content | no audit (operational) |
| D8-23 | Asset callback duplicates (CC-19) | processing retry | worker ×2 | idem claim | replay | 1 result/derivative | — |
| D8-24 | Stock adjustment vs reservation (CC-24) + soft-hold races (CC-23) | concurrent ops on SKU row | admin + system | row lock order | check-guarded | non-negative luôn | ledger reasons |
| D8-25 | Fingerprint conflict (GRD-030) | completed key | same key, khác payload | stored result giữ | `IDEMPOTENCY_CONFLICT` | unchanged | audited |

## 3. Coverage note

Mọi CC-01..CC-28 đều có row (một số gộp có chủ đích: CC-02+04, CC-05+06,
CC-17+18, CC-23+24); mọi guard critical (GRD-004/006/007/009/011..017/020/
022/029/030) xuất hiện ≥1 scenario. E2E mapping: D8-01→E2E-10; D7-03→E2E-03/
04; GRD-015 chain→E2E-05/06.
