# DB3 — Concurrency Specification (authoritative CC registry)

**Date:** 2026-07-15 · **Git HEAD:** `0563866`
**Baseline:** READ COMMITTED default; explicit row locking (`FOR UPDATE`
direction — exact syntax via DB6 spike per ADR-DB1-002) on contended rows;
optimistic markers where noted; idempotency per
[`DB3_IDEMPOTENCY_SPECIFICATION.md`](./DB3_IDEMPOTENCY_SPECIFICATION.md).
Strategy codes: `LOCK` pessimistic row lock · `UNIQ` DB uniqueness arbitration
· `OPT` optimistic marker/state-check-in-tx · `IDEM` idempotency claim ·
`SAGA` resumable orchestration. Failure behavior mặc định: loser nhận stable
failure code, không partial write. Mỗi row là một DB8 test case
([`DB3_TEST_HANDOFF.md`](./DB3_TEST_HANDOFF.md)).

## Design (DSN)

| CC | Scenario | Risk | Owner row | Strategy | Winner/loser semantics |
|---|---|---|---|---|---|
| CC-01 | Concurrent autosave / stale revision (multi-tab) | lost design edits | session row | OPT (revision marker) | latest marker wins; stale writer gets `STALE_WRITE` + current state |
| CC-02 | Approve vs supersede (new version being sent) | approval lands on superseded version | version row | OPT (state check in approval tx) + LOCK version row | first commit wins; loser `APPROVAL_VERSION_MISMATCH`/`REVIEW_ALREADY_ACTIVE` |
| CC-03 | Simultaneous send-for-review (two drafts) | two active reviews (INV-16) | case scope | **UNIQ (partial unique)** + GRD-004 | first insert wins; second gets constraint failure mapped to `REVIEW_ALREADY_ACTIVE` |
| CC-04 | Approve vs request-revision (same version, two devices) | contradictory decisions | version row | LOCK + first-decision-wins | second gets `INVALID_TRANSITION` with recorded first decision |

## Quotation (QUO)

| CC | Scenario | Risk | Owner | Strategy | Semantics |
|---|---|---|---|---|---|
| CC-05 | Accept old version vs new version sent | acceptance on superseded price | version row | OPT state-check in tx | accept fails `QUOTE_VERSION_STALE`; customer re-reads |
| CC-06 | Expiry sweep vs acceptance | accept expired quote | version row | LOCK (sweep + accept contend) | committed-first wins; accept-after-expire fails |
| CC-28 | Concurrent version creation (double admin action) | duplicate versions | quotation header | LOCK header + version seq | single next-version; duplicate replays |

## Payment (PAY)

| CC | Scenario | Risk | Owner | Strategy | Semantics |
|---|---|---|---|---|---|
| CC-07 | Duplicate callbacks (same provider event) | double-apply (INV-07) | idempotency + attempt | **IDEM (provider event id) + UNIQ** | first applies; duplicates replay stored outcome; callback event vẫn được append làm evidence |
| CC-08 | Out-of-order callbacks (fail after success, late events) | state regression | attempt row | OPT (machine never regresses) | terminal states immutable; contradiction → REQUIRES_REVIEW |
| CC-09 | Manual reconcile vs provider callback / refund vs late callback | conflicting resolution | attempt row | LOCK attempt + shared cross-check | first commit wins; second → REQUIRES_REVIEW (không im lặng ghi đè) |
| CC-10 | Obligation satisfaction race (two success paths) | double satisfaction | obligation row | LOCK + exactly-once application | single SATISFIED transition; second becomes no-op replay |

## Inventory (INV)

| CC | Scenario | Risk | Owner | Strategy | Semantics |
|---|---|---|---|---|---|
| CC-20 | Last-unit reservation (two orders) | negative stock (INV-18) | SKU stock row | **LOCK** + GRD-014 | first reserves; second gets `INSUFFICIENT_STOCK` → blocked-production path |
| CC-21 | Release vs consume (cancel vs production start) | double-count | reservation row | LOCK + idempotent transitions | first terminalizes; second no-op/`INVALID_TRANSITION` |
| CC-22 | Reservation expiry sweep vs deposit-verified reserve/keep | hold lost mid-payment | reservation row | LOCK; reserve path re-checks in tx | committed-first wins; payment path recreates/alerts per LC-17 |
| CC-23 | Soft hold vs official reservation / concurrent holds | oversold holds | stock row | LOCK | serialize; convert consumes hold atomically |
| CC-24 | Stock adjustment vs reservation | check bypass | stock row | LOCK + DB check | non-negative check final arbiter |

## Order / Production (ORD/PRD)

| CC | Scenario | Risk | Owner | Strategy | Semantics |
|---|---|---|---|---|---|
| CC-11 | Duplicate order creation (approval event redelivery / double click) | two orders (INV-19) | request scope | **UNIQ (request→order)** + IDEM | first creates; duplicates replay order ref |
| CC-12 | Production start vs cancel/hold (incl. revision-vs-start) | producing a dead/stale order | order row | **LOCK order row**; GRD-015/022 re-check in tx | committed-first wins; start-after-hold fails `ORDER_ON_HOLD`/`PRODUCTION_BLOCKED` |
| CC-13 | Cancellation saga races + step retry (delivered-vs-cancel bị chặn bởi S9) | half-compensated state | order row + saga steps | SAGA (CANCELLING state, idempotent steps) | steps replay; saga resumable; state converges CANCELLED |
| CC-14 | Final payment verified vs dispatch attempt | dispatch without payment | order row | LOCK + GRD-016 in dispatch tx | dispatch fails until SATISFIED committed |
| CC-15 | Shipping freeze vs concurrent edit | edit after freeze | shipping detail row | LOCK trong dispatch tx; frozen trigger | edit-after-freeze rejected `IMMUTABLE_RECORD` |

## Secure access / Customer (CUS)

| CC | Scenario | Risk | Owner | Strategy | Semantics |
|---|---|---|---|---|---|
| CC-16 | Revoke vs in-flight sensitive action; reissue vs old token | action on dead grant | grant row | OPT: grant state checked in action tx (ADR-DB3-004 r9) | revoke committed trước → action fails `GRANT_INVALID` |
| CC-17 | Concurrent challenges / concurrent verify | duplicate customers, double link | (contact,purpose) scope | UNIQ (one open challenge) + LOCK contact link | one challenge; one verified link; loser replays |
| CC-27 | Customer merge vs concurrent case activity | orphaned refs mid-merge | both customer rows | LOCK both (ordered) + merge audit | merge serialized; in-flight actions re-read post-merge mapping |
| CC-18 | Duplicate request submission | dup cases (REQ-REQ-004) | submission key | IDEM | replay request ref |

## Asset / Outbox / Notification (AST/PLT/NTF)

| CC | Scenario | Risk | Owner | Strategy | Semantics |
|---|---|---|---|---|---|
| CC-19 | Duplicate asset-processing callbacks / job retry after partial failure | double derivatives | (asset, job, attempt) | IDEM + append attempts | replay recorded result |
| CC-25 | Multi-worker outbox claim | double dispatch | outbox row | **LOCK claim (skip-locked direction)** + idempotent consumers | one claimer; at-least-once tolerated downstream |
| CC-26 | Notification duplicate attempt / retry overlap | duplicate messages | intent row | IDEM (intent key) + LOCK intent on attempt spawn | one active attempt per channel; duplicates collapse |

## DB6 spike dependencies

CC-20/21/22/23/24 (row-lock trên stock/reservation), CC-25 (skip-locked),
CC-12 (order-row lock) phụ thuộc DB6 locking spike (ADR-DB1-002); nếu builder
output sai → documented raw-SQL adapter, spec này không đổi.
