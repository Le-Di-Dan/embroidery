# `APP8-B04` — Completion report

## 1. Verdict

```text
APP8-B04 = COMPLETE
NEXT_CHECKPOINT = APP8-D01
NOT_PUSHED = true
```

The guarded LC-18 production transitions are delivered as **one** HTTP
operation. Start, complete and cancel each commit their whole combined effect —
the job move, the order move where the lifecycle requires one, and the order's
inventory terminalizations — in a single transaction, or commit nothing.
One HTTP operation, zero migrations, zero worker behaviour.

## 2. Branch, entry HEAD, final commit

```text
BRANCH        = production
ENTRY_HEAD    = 072a30bad900f3163cc926ccedf8d73d4072646a  (APP8-B03)
FINAL_COMMIT  = the single local checkpoint commit this report accompanies
PUSHED        = no
```

The final commit's own hash is not quoted here: recording it would require a
second commit whose only content is that hash, which §27 forbids.

## 3. The exact HTTP mutation operation

```text
POST /api/admin/production-jobs/{jobId}/transitions   adminProductionJob_transition   200

APP8_B04_HTTP_OPERATIONS = 1
```

**One, not two, and not three.** Start, complete and cancel are the same command
against the same aggregate under the same guards, differing in the target state
and in what that state implies. Three routes would publish three operation ids
and three request contracts for one state machine, and a client would have to
know which move LC-18 permits before it could ask — which is the server's job.
With a typed target, an illegal move is one honest `PRODUCTION_INVALID_TRANSITION`
rather than a `404` on a route that happens not to exist for that state.

`transitions` is a collection because each accepted command appends a row to
`production_job_transitions`: the request creates a transition. The receipt is
`200` rather than `201` — the appended row has no id of its own and is
addressable only inside the job's history on `GET /api/admin/production-jobs/{jobId}`.

The controller publishes into the existing `adminProductionJob` domain through
`CONTROLLER_DOMAIN_KEYS`, so the family reads `_create`, `_list`, `_get`,
`_transition` and a composition decision does not name a public identifier.

No public or customer production route exists anywhere in the document;
`admin-production-job.contract.spec.ts` asserts that every production route in
the **whole** document is one of the four, and that no `/start`, `/complete`,
`/cancel`, `/artifacts` or `/notes` route was added.

## 4. The exact transition command shapes

Request — one body, `.strict()`:

```text
{ to: 'STARTED' | 'COMPLETED' | 'CANCELLED', reason?: string(1..1000, trimmed) }
```

`reason` is **mandatory** for `CANCELLED` and **refused** for the other two:
neither `TR-LC18-02` nor `TR-LC18-03` records a reason, and a silently-dropped
field is how an operator believes they recorded something they did not. Both
rules are stated in the Zod schema, where a client can be told which field is
wrong before a connection is taken; `ProductionJobRepository.transition`'s
`CANCELLATION_REASON_REQUIRED` guard remains the authority and is unchanged.

`PLANNED` is not an accepted target. `TR-LC18-01` creates a job in it and LC-18
has no move back to it; a rerun is a rework job with its own id (ADR-DB3-003),
which no APP8 checkpoint delivers.

The body accepts no `adminId`, `actorKind`, `systemJobKey`, `correlationId`,
`jobId`, `orderId`, `orderStatus`, `approvalSnapshotId`, `reservationId(s)`,
`skuId`, `quantity` or any lifecycle timestamp — asserted field by field in
`admin-production-transition.contract.spec.ts`.

Response — the committed transition, and nothing the detail route already owns:

```text
{ jobId, orderId, fromStatus, status, orderStatus, reservationIds[] }
```

`reservationIds` is what a caller cannot see from its own request: which
reservations this command terminalized. An empty list is a truthful answer for a
customer-owned-only order and for a cancellation that found nothing still
reserved, not a missing field.

## 5. Admin / System actor attribution

```text
job transition        actor_kind = ADMIN,  admin_id = authenticated Admin
order transition      actor_kind = ADMIN,  admin_id = authenticated Admin
audit event           actor_kind = ADMIN,  admin_id = authenticated Admin
reservation CONSUME   actor_kind = SYSTEM, system_job_key = 'production.start'
reservation RELEASE   actor_kind = ADMIN,  admin_id = authenticated Admin
```

The Admin id is never a request field. It is read from the bound actor through
`requireProductionAdminId`, which is `assertProductionAdminActor` with the id
returned instead of discarded — one read, one refusal, so creation and transition
cannot drift apart on what "an Admin production operation" means. A non-ADMIN
bound actor is a wiring fault and fails loudly as a sanitised 500 rather than
being shaped into an ordinary rejection.

**Consumption is SYSTEM** because `TR-LC17-05` is a goods issue the production
step caused, not a stock decision an operator took (§4). The operator is recorded
where LC-18 records actors — `production_job_transitions` — and on the accepted
audit row. Writing an Admin id into the inventory ledger instead would make the
ledger claim an operator adjusted stock, which is `GRD-023`'s vocabulary and a
different fact. **Release carries the Admin**: it *is* an operator's decision to
stop the work, with the mandatory reason attached.

One request identity travels the whole transaction: `requestContext.requireRequestId()`
becomes the `correlation_id` on both transition rows and on the audit row.

Guards are APP1's, unchanged: `AuthenticatedAdminGuard` at controller level plus
`StaffOriginGuard` and `StaffJsonBodyGuard` on the mutation, the standard
response envelope, and no cookie or identity parsed in the handler.

## 6. Start — the exact `GRD-015` / `GRD-022` implementation

Every clause is decided from committed facts read **under the locks that
arbitrate them**, in `production-transition.guards.ts` (`assertStartable`) plus
the one asynchronous deposit call in the use case:

```text
1. job.status = PLANNED                            -> else PRODUCTION_INVALID_TRANSITION
2. order.status NOT IN (ON_HOLD, CANCELLING)       -> else PRODUCTION_ORDER_ON_HOLD   (GRD-022)
3. order.status = DEPOSIT_PAID                     -> else PRODUCTION_BLOCKED         (GRD-015)
4. job.approval_snapshot_id
     = orders.current_approval_snapshot_id         -> else PRODUCTION_APPROVAL_MISMATCH
5. DepositEligibilityPort.isDepositSatisfied(order) -> else PRODUCTION_DEPOSIT_NOT_SATISFIED (GRD-013)
6. every Catalog requirement derived from the FROZEN order items has an active
   RESERVED reservation covering it, decided under that reservation's row lock
   at the moment it is consumed                    -> else PRODUCTION_RESERVATION_NOT_ACTIVE
                                                      / PRODUCTION_RESERVATION_INSUFFICIENT
```

The order is the exact one the job names (`production_jobs.order_id`), never a
request field: the request carries only the job id.

**Why LC-14 legality is not the start guard.** `ON_HOLD → IN_PRODUCTION` is a
*legal* LC-14 move — it is the resume path (ADR-DB3-003 r5) — so an order
transition's own legality check would let a held order enter production.
Clause 3 is what excludes it, and clause 2 gives the hold its own truthful code
so the operator knows a hold must be lifted by order authority rather than
believing they are at the wrong step. **B04 does not move an order out of
`ON_HOLD`.**

**Why the deposit is asked and not read.** A stale `DEPOSIT_PAID` on the order
row records that the order was told the deposit landed; the port is whether the
obligation is SATISFIED. The suite forces exactly that divergence — the
obligation walked back to `PENDING` while the order row still says
`DEPOSIT_PAID` — and start refuses. There is one deposit predicate in the
repository (`APP8-G01` §7.1); no `payment_obligations` read, no SQL copy.

**Approval.** Clause 4 refuses rather than following a moved pointer.
ADR-DB3-003 r4 permits a post-approval revision flow to repoint
`orders.current_approval_snapshot_id`, and no delivered path does so today
(`FU-APP8-B03-03`). B04 implements the conservative half only and does **not**
decide which approval a planned job should follow when a repoint path ships;
that decision stays with the checkpoint that delivers pointer moves. No live
Catalog, quotation or design-session state is consulted.

`GRD-022` note: the guard is applied to completion as well, with the same code —
a held order is a held order whichever move is asked for.

## 7. Reservation requirement — the canonical helper disposition

```text
MOVED   apps/worker/src/jobs/inventory-reservation/domain/reservation-requirements.ts
     -> packages/persistence/src/inventory/reservation-requirements.ts
EXPORTED aggregateCatalogRequirements, ReservationRequirement  (@embroidery/persistence)
CONSUMERS apps/worker  ReserveOrderInventoryUseCase   (APP8-W01, import updated)
          apps/api     ProductionReservationCoordinator (APP8-B04)
COPIES   1
```

A move, not a copy. `APP8-W01` created the reservations by this rule and
`APP8-B04` decides which ones a start must consume; two implementations would let
an order be reserved for under one aggregation and started under another, and no
constraint in the schema would notice. That is `IMP-D054` on the exact terms
`PO-APP8-006` already applied to the reservation writer itself: two runtimes, one
aggregate, one implementation. The destination is the shared inventory boundary
that already owns the reservation identity contract (`CST-016`), which is what
the rule is derived from. No domain service, no new package, no new module.

The function is byte-identical apart from its two type imports; its docblock
gained the `APP8-B04` reason for living there. `order-reserve-idempotency.ts` and
`reservation-requirements.spec.ts` now import the type and the function from
`@embroidery/persistence`. The spec stayed in `apps/worker` deliberately: it also
asserts the W01-local idempotency fingerprint over the same requirement set, and
splitting it would have separated two properties that are only correct together.

## 8. The exact cross-aggregate transaction boundary

One `TransactionManager.runInTransaction` per command, wrapping — in this order —
every guard, the job move, every reservation terminalization, the order move, the
audit append and the outbox append. The canonical `OrderRepository`, the
canonical shared `SkuStockRepository` and the API-local `ProductionJobRepository`
all participate in it through the ambient `transactionContext` their executors
resolve; that is the mechanism `APP8-W01` already proved across a runtime
boundary. **No repository method needed refactoring to participate** — none of
them opens a transaction of its own.

There is **no compensation anywhere**. A failed start leaves the job `PLANNED`,
the order `DEPOSIT_PAID`, every reservation `RESERVED`, on-hand untouched, and no
transition, ledger, audit or outbox row at all. The rollback is the mechanism;
nothing is written to undo something that never committed.

## 9. The exact lock sequence

```text
1. orders                 FOR UPDATE   OrderRepository.loadForUpdate
2. production_jobs        FOR UPDATE   ProductionJobRepository.loadForUpdate
3. inventory_reservations FOR UPDATE   per required SKU, ascending skus.id
4. sku_stocks             FOR UPDATE   reached inside consume, same SKU order
```

The same order for all three targets, so no B04 command is the reverse of
another. Steps 3 and 4 are walked sequentially with `for…of`/`await` — never
`Promise.all`, which would issue the locks in completion order and throw the
determinism away.

Two new lock-taking reads were added for this, both narrow and both on canonical
repositories: `OrderRepository.loadForUpdate` and
`ProductionJobRepository.loadForUpdate`. They exist because a transition must
**decide** from committed state and not only move it; `transition()` re-takes the
same rows and finds the locks already held.

`findById` before the order lock reads one field — which order the job belongs to
— and decides nothing. Inside `consumeOrderReservation` the `sku_stocks` row is
resolved by SKU **without** a lock, which is identity rather than state
(`uq_sku_stocks__sku` gives one row per SKU and no path moves a reservation
between anchors); the anchor's balance is only touched after `applyConsume` locks
it, preserving `APP8-B02`'s reservation-row-then-anchor direction exactly.

`DB8_LOCK_ORDER_MATRIX.md` §1 gains the B04 row and §2 gains the
`orders → production_jobs → inventory_reservations → sku_stocks` entry, which
supersedes that file's earlier statement that "`orders` then `sku_stocks` never
happens directly". It now does, in exactly one direction, and the document
records why there is no reverse path: dispatch takes `orders` and never touches
inventory, and `APP8-W01` takes no `orders` lock at all.

```text
ISOLATION = READ COMMITTED + explicit row locks
SERIALIZABLE = none · advisory locks = none · distributed locks = none · NOWAIT = none
```

## 10. Decision-grade reservation reads — `FU-APP8-B02-02` / `FU-APP8-B03-02`

```text
B03_RESERVATION_SUMMARY_USED_AS_DECISION_AUTHORITY = NO
```

`ORDER_RESERVATION_SUMMARY_PORT` is not injected into
`AdminProductionTransitionModule` at all, and `OrderReservationSummaryModule` is
not imported. The surest way for a start decision not to be taken from an
unlocked read is for the decision path to be unable to reach one.

What B04 does instead: derive the ordered Catalog requirements from the frozen
order items, then hand each `(order, SKU, quantity)` to the canonical
`consumeOrderReservation`, which takes the reservation rows for that
`(order_id, sku_stock_id)` pair `FOR UPDATE` **before** reading a status and
decides everything — which row is active, whether its quantity covers the
requirement, and the terminal write — under that lock. The `sku_stocks` id
lookup that precedes it is identifier discovery from which no state decision is
made (§9).

Two order-scoped operations were added to the canonical shared contract —
`consumeOrderReservation` and `releaseOrderReservationIfActive` — and the
terminal writes themselves were **extracted, not duplicated**, into
`packages/persistence/src/inventory/reservation-terminalization.ts`. The
by-id paths (`consumeReservation`, `releaseReservation`) and the by-(order, SKU)
paths now share one row-lock helper, one on-hand decrement and one ledger append,
so the CC-21 repair `APP8-B02` made cannot be bypassed by the new entry point.

## 11. Start results — Catalog, COP, mixed

| Case | Job | Order | Reservations | On-hand | Ledger |
|---|---|---|---|---|---|
| S1 Catalog-only | `PLANNED → STARTED` | `DEPOSIT_PAID → IN_PRODUCTION` | 1 → `CONSUMED` | −25, once | `RESERVED`, `CONSUMED` |
| S2 COP-only | `PLANNED → STARTED` | `DEPOSIT_PAID → IN_PRODUCTION` | **0 required, 0 rows** | n/a | **0 entries** |
| S3 mixed | `PLANNED → STARTED` | `DEPOSIT_PAID → IN_PRODUCTION` | Catalog only, `CONSUMED` | −25, once | Catalog only |

S2 is `PO-APP8-001` §1.3 made executable: the COP order starts with
`reservationIds = []` and the suite asserts `inventory_reservations` and
`inventory_ledger_entries` are both **empty** — no SKU, no stock row and no
reservation was fabricated to give the branch something to consume. S3 proves the
COP line neither weakens nor is touched by the Catalog requirement.

Each start appends exactly one `production_job_transitions` row, one
`order_transitions` row, one `audit_events` row, one `outbox_events` row and one
`CONSUMED` ledger entry per consumed reservation.

The refusals — S4 deposit not satisfied, S5 `ON_HOLD` and `CANCELLING`, S8
approval mismatch, and a released required reservation — each leave the job
`PLANNED`, the order `DEPOSIT_PAID`, the reservation `RESERVED`, on-hand
unchanged and zero transition rows.

## 12. Multi-SKU rollback result (§21.5)

Case S6: a two-SKU order where only the SKU that sorts **first** — the one the
ascending-`skus.id` walk would consume before reaching the failure — has a
reservation.

```text
HTTP                            409 PRODUCTION_RESERVATION_NOT_ACTIVE
inventory_reservations          1 row, still RESERVED   (the early one, not consumed)
sku_stocks.quantity_on_hand     unchanged
inventory_ledger_entries        ['RESERVED']            (no CONSUMED beside it)
production_job_transitions      0
order_transitions               unchanged (order still DEPOSIT_PAID)
audit_events                    0
outbox_events                   unchanged
```

This is the checkpoint's key property, so the test inspects every row class after
the induced late failure rather than only the response. The `[firstSku, lateSku]`
split is computed from the sorted pair, so the case is a genuine *late* failure
whichever way the two generated ids happen to sort.

## 13. Repeated start (§21.7 / case S7)

```text
second POST  -> 409 PRODUCTION_INVALID_TRANSITION
on-hand      -> decremented exactly once
ledger       -> ['RESERVED', 'CONSUMED']   (no second CONSUMED)
job transitions  -> 1
order            -> IN_PRODUCTION, unchanged
```

Replay-success is deliberately **not** implemented: §11 permits it only where an
accepted authority already requires it, and none does. No second idempotency
subsystem was introduced; the job row lock and LC-18 are the whole arbiter.

## 14. Complete transaction results

| Case | Result |
|---|---|
| C1 success | job `STARTED → COMPLETED` **and** order `IN_PRODUCTION → PRODUCTION_COMPLETED`, one transaction, 2 job transitions, 3 order transitions total |
| C2 one side invalid | order forced `ON_HOLD` → `409 PRODUCTION_ORDER_ON_HOLD`, neither side moves, job transitions stay at 1 |
| C3 repeated | `409 PRODUCTION_INVALID_TRANSITION`, no duplicate transition on either side |

Completion moves no inventory (the ledger stays `['RESERVED', 'CONSUMED']`),
creates no refund, touches no shipping, and **does not continue to
`AWAITING_FINAL_PAYMENT`** — `TR-LC14-05` is APP9's. C1 asserts that absence
explicitly rather than leaving it to be inferred.

```text
APP8_TERMINAL_HANDOFF = job COMPLETED + order PRODUCTION_COMPLETED
```

## 15. Cancellation results

| Case | Job | Order | Reservations | Ledger |
|---|---|---|---|---|
| X1 `PLANNED`, Catalog | `→ CANCELLED` | **unchanged** `DEPOSIT_PAID` | `RESERVED → RELEASED`, reason preserved on the row | `RESERVED`, `RESERVATION_RELEASED` |
| X2 `PLANNED`, COP-only | `→ CANCELLED` | unchanged | **0 rows, 0 fabricated** | **0 entries** |
| X3 `STARTED` | `→ CANCELLED` | **unchanged** `IN_PRODUCTION` | stays `CONSUMED` | `RESERVED`, `CONSUMED` — no fake release |
| X4 no reason | refused `400` | unchanged | unchanged `RESERVED` | unchanged |

X1 also asserts on-hand is **unchanged**: a release returns the quantity to
availability, and the goods never left. X3 asserts on-hand stays decremented:
stock that has left is not restored by cancelling the paperwork.

A second cancellation of an already-cancelled job is `409
PRODUCTION_INVALID_TRANSITION` and leaves exactly one transition and one release
ledger entry — an already-released reservation is not released twice.

`releaseOrderReservationIfActive` returning `undefined` is the ordinary case, not
an error: nothing is fabricated so that cancelling a `STARTED` job looks like
cancelling a `PLANNED` one.

## 16. Confirmation: the order's commercial state is not moved

```text
B04_ORDER_COMMERCIAL_MOVE_ON_PRODUCTION_JOB_CANCEL = NONE
```

Searched for a stronger already-accepted invariant requiring an order transition
as part of production-job cancellation itself; **none exists**. `APP8-G01` §5.2
names the job move and the release of a still-active Catalog reservation and
nothing else, and §5.1 keeps the full order cancellation/refund saga —
`CANCELLING`, `CANCELLED`, refund calculation and payment, remaining-payment
settlement, shipping and delivery reversal, final settlement, `IMP-O008` — outside
APP8.

So a cancelled production job hands the order to later cancellation/recovery
authority in whatever state it was. Both X1 and X3 assert the order's status
after the cancellation explicitly, and the response's `orderStatus` reports it
truthfully rather than implying a move.

## 17. Concurrency proof (§21.4)

The **preferred** pair: production start versus an order hold, driven through the
delivered `OrderRepository.transition` rather than a raw `UPDATE`, so what races
the start is the real order authority.

```text
holder      inTransaction: OrderRepository.loadForUpdate(order)   -- lock 1 held
start       POST .../transitions {to:'STARTED'}                   -- fired, not awaited
observer    pg_stat_activity.wait_event_type = 'Lock' > 0         -- start is provably blocked
holder      OrderRepository.transition(order -> ON_HOLD, reason)  -- commits
start       wakes, re-reads ON_HOLD under its own lock            -- 409 PRODUCTION_ORDER_ON_HOLD
```

No sleep, no retry loop, no timing assumption: the sequence is a `Barrier` plus a
bounded condition on PostgreSQL's own answer to "is that transaction waiting?" —
the same convention `APP8-B02`'s CC-21 races use. Under an implementation that
read the order's status without locking, the start would never have waited and
`waitForLockWaiter` would fail rather than the assertions.

After it: reservation still `RESERVED`, on-hand unchanged, ledger `['RESERVED']`,
zero job transitions, order `ON_HOLD`. No partial job, order or inventory effect,
and no deadlock.

`--runInBand` is required for this suite: the lock observation is over the whole
database, and a parallel suite on the same server would make it ambiguous.

## 18. Audit / transition / ledger / outbox disposition

| Effect | Disposition | Authority |
|---|---|---|
| `production_job_transitions` | one row per accepted move, in the same transaction | `TR-LC18-02/03/04/05`, delivered `transition()` unchanged |
| `order_transitions` | one row per order move, in the same transaction | `TR-LC14-03/04`, delivered `transition()` unchanged |
| `inventory_ledger_entries` | one `CONSUMED` per consumed reservation (with the on-hand delta), one `RESERVATION_RELEASED` per released one | G-DB7-29 |
| `audit_events` | `production_job.started` / `.completed` / `.cancelled`, ADMIN actor, target `PRODUCTION_JOB`, summary = order + approval + both status pairs + the terminalized reservation ids | `DB3_AUDIT_SPECIFICATION.md`: *"Production start/complete/cancel(rework) \| TR-LC18-\* \| admin \| **R** (cancel/rework) \| job + approval refs"* |
| `outbox_events` | `production.started`, `production.completed` — appended in the owning transaction | `SE-009`: *"TR-LC18-02/03 production start/complete → `production.started` / `production.completed`, per (job, action)"* |
| production-job **cancellation** event | **none appended** | No accepted side effect names one. `SE-012` is the *order* cancellation saga, which `PO-APP8-005` keeps outside APP8. Minting `production.cancelled` for symmetry is exactly the invention §17 forbids. |

The audit actions are new **constants** but not a new vocabulary: the
specification line above names the three events, and the strings follow the
locked lowercase dot-namespaced convention every recorder in this repository
uses (`sku_stock.adjusted`, `payment_attempt.verified`, `design_version.approved`).
`PRODUCTION_JOB` has been an accepted `AUDIT_TARGET_KINDS` and
`OUTBOX_AGGREGATE_KINDS` entry since DB7 — neither list changed.

Job **creation** remains unaudited. It is not in that specification line, and
§16 forbids retrofitting one; `FU-APP8-B03-01` stays **carried and nonblocking**.

Payloads carry references only — job, order, approval, the two states — and no
specification, customer, contact, money or artifact reference. No worker handler
was added: the two event types have no registered consumer, so the claim filter
never claims them and the rows wait for the checkpoint that delivers their
notification, which is what an outbox is for.

## 19. Confirmation: B03's display summary was not used as decision authority

Restated as §27 asks. `AdminProductionTransitionModule` imports no
`OrderReservationSummaryModule`; `ORDER_RESERVATION_SUMMARY_PORT` is unresolvable
from the transition use case, its coordinator and its guards; and `findReservation`
(the other unlocked read) is not called. See §10.

## 20. Schema

```text
MIGRATIONS = 0
```

`packages/database` has **no diff**. No state or version column, no new
production or order status, no cancellation table, no transition cache, no
reservation linkage table, no distributed lock, no idempotency table, no
speculative index. The delivered state machines and row locks are the whole
mechanism.

## 21. OpenAPI

```text
OPENAPI_BEFORE = 91 paths / 98 operations / 204 schemas
OPENAPI_AFTER  = 92 paths / 99 operations / 206 schemas
DELTA          = +1 path / +1 operation / +2 schemas
REMOVED        = 0
```

The +2 schemas are the request body and the response class. Generated **once**,
when the contract source was final; `openapi:check` reports *"OpenAPI artifact is
up to date"*.

One name collision was found and avoided before generation: `APP8-B03` already
publishes `AdminProductionTransitionResponse` for a *transition-history* row on
the detail. B04's receipt is `AdminProductionTransitionResultResponse`, so the
two remain distinct components.

## 22. Generated client

```text
GENERATED_CLIENT = REGENERATED_ONCE
FILES            = embroidery-api.schemas.ts, embroidery-api.ts
TREE_HASH        = c05ae85d11d38c6e59675af1dd894596430719ac5bd6a77e00f6b5da08a2ee3d
CHECK            = check-generated-client.mjs -> up to date
```

No generated file was hand-edited. `packages/api-client` and `packages/contracts`
typecheck clean.

## 23. Focused test ledger

| Command / suite | Result | Why it was run |
|---|---|---|
| `pnpm --filter @embroidery/persistence typecheck` + `build` | PASS | the aggregation helper moved here and the two contracts gained methods |
| `pnpm --filter @embroidery/api exec tsc --noEmit` | PASS | every new API source file is in this workspace |
| `pnpm --filter @embroidery/worker exec tsc --noEmit` | PASS | W01's imports changed with the helper move |
| `jest --runInBand src/modules/production` (8 suites, **113 tests**) | PASS | the checkpoint's own closure, and B03 contract compatibility in the same run |
| — `admin-production-transition.contract.spec.ts` (33) | PASS | the published B04 contract, Docker-free, run **before** the generation slot was spent |
| — `admin-production-job.contract.spec.ts` (16) | PASS | §21.6 — the B03 surface after the module gained a mutation; its route-count assertions were updated from three to four |
| — `production-start.integration.spec.ts` (14) | PASS | cases S1–S8, C1–C3, real PostgreSQL, real HTTP, real Admin guard |
| — `production-cancellation.integration.spec.ts` (7) | PASS | cases X1–X4 plus the double-cancel and reason-on-start refusals |
| — `production-transition-races.integration.spec.ts` (1) | PASS | §21.4, the start-versus-order-hold proof |
| — `production-job-creation` / `production-reads` / `production-persistence` (42) | PASS | §21.6 — B03's creation, queue and detail after the shared harness gained the transition module |
| `jest src/modules/inventory` (6 suites, 72 tests) | PASS | `inventory-reservations.ts` changed, so §21.8's condition for rerunning the B02 races is met — `inventory-races` (CC-21 included) and `inventory-reservations` both PASS unchanged |
| `jest src/jobs/inventory-reservation/domain` in `@embroidery/worker` (19) | PASS | §21.7 — the aggregation and idempotency-fingerprint specs after the physical move |
| `jest src/jobs/inventory-reservation/tests/canonical-inventory-authority.spec.ts` (8) | PASS | it asserts there is exactly one inventory authority; the move is exactly the kind of change that could break it |
| `jest src/openapi` (7 suites, 62 tests) | PASS | `operation-id.ts` changed and the committed artifact moved |
| `openapi:generate` + `openapi:check` | PASS | one generation, one drift check |
| `api-client generate` + `check:generated` | PASS | the repository workflow for a contract change |
| `tsc --noEmit` in `packages/api-client`, `packages/contracts` | PASS | the generated client and the artifact changed |
| `prettier --write` on the changed governed files | PASS | global control, scoped to changed input |
| `eslint` on the changed directories in all three workspaces | PASS (0 problems) | global control, at the smallest changed scope |

**Two pre-existing red tests were found and repaired**, both in
`src/modules/inventory` and both invalidated by `APP8-B03` rather than by this
checkpoint — B03's report lists the suites it deliberately did not rerun, which is
why they were not caught then:

- `admin-sku-stock.contract.spec.ts` — *"publishes no inventory reservation, hold
  or production route at all"* scanned the **whole** document, so it failed on
  B03's three accepted production routes (and would now fail on B04's fourth).
  Narrowed to what `APP8-B01` can truthfully claim: no reservation or soft-hold
  route, and no production route of its own. The accepted production surface's
  own count is still asserted, in `admin-production-job.contract.spec.ts`.
- `inventory-persistence.contract.spec.ts` — *"keeps no API-local inventory
  persistence implementation"* flagged B03's read-only
  `drizzle-order-reservation-summary.adapter.ts`. Narrowed to what INV-19 is
  actually about — a second **writer** — by requiring a write signal
  (`insert`/`update`/`delete`/`for('update')`/`requireTransaction`) alongside the
  Drizzle usage, so the read adapter passes and any write path still fails.

## 24. Deliberately not run

| Not run | Reason |
|---|---|
| full monorepo Jest, full API suite, full DB suite | §21.10; no demonstrated impact |
| `APP8-W01`'s 25-case live integration suite | §21.7 — the helper move is physical; the aggregation's runtime behaviour is byte-identical, and the domain specs plus a worker typecheck cover the changed imports |
| other worker suites (asset inspection, normalization, notification, order conversion) | `apps/worker` has no behavioural diff |
| `APP7` payment acceptance, payment suites | `PaymentPersistenceModule` is imported, not modified |
| other DB8 races, DB9 benchmarks | no index, isolation or lock-anchor change outside the documented B04 flow |
| Playwright, Admin UI, Storefront | no frontend diff; `APP8-A02`/`A03` own the screens |
| Docker full stack | no infrastructure change |
| SonarQube | §21.9 — checkpoint governance does not require it for a backend slice with no new global control |

No passing command was repeated on unchanged input.

## 25. Changed files

**New — API (10)**

```text
apps/api/src/modules/production/admin-production-transition.module.ts
apps/api/src/modules/production/application/admin/production-reservation.coordinator.ts
apps/api/src/modules/production/application/admin/production-transition.guards.ts
apps/api/src/modules/production/application/admin/production-transition.recorder.ts
apps/api/src/modules/production/application/admin/transition-production-job.use-case.ts
apps/api/src/modules/production/presentation/admin-production-transition.controller.ts
apps/api/src/modules/production/presentation/schemas/admin-production-transition.request.ts
apps/api/src/modules/production/presentation/schemas/admin-production-transition.response.ts
apps/api/src/modules/production/presentation/admin-production-transition.contract.spec.ts
apps/api/src/modules/production/tests/integration/production-transition-support.ts
```

**New — API tests (3)**

```text
apps/api/src/modules/production/tests/integration/production-start.integration.spec.ts
apps/api/src/modules/production/tests/integration/production-cancellation.integration.spec.ts
apps/api/src/modules/production/tests/integration/production-transition-races.integration.spec.ts
```

**New — shared persistence (1)**

```text
packages/persistence/src/inventory/reservation-terminalization.ts
```

**Moved (1)**

```text
apps/worker/src/jobs/inventory-reservation/domain/reservation-requirements.ts
  -> packages/persistence/src/inventory/reservation-requirements.ts
```

**Modified — shared persistence (5)**

```text
packages/persistence/src/index.ts                              exports the moved helper
packages/persistence/src/inventory/sku-stock.repository.ts     +2 order-scoped operations
packages/persistence/src/inventory/inventory-reservations.ts   terminal writes delegated; +2 methods
packages/persistence/src/inventory/drizzle-sku-stock.repository.ts  +2 delegations
packages/persistence/src/order/order.repository.ts             + loadForUpdate
packages/persistence/src/order/drizzle-order.repository.ts     + loadForUpdate
```

**Modified — API (7)**

```text
apps/api/src/bootstrap/app.module.ts                                     AdminProductionTransitionModule registered
apps/api/src/openapi/operation-id.ts                                     one CONTROLLER_DOMAIN_KEYS entry
apps/api/src/modules/production/domain/production-operations.errors.ts   +6 refusal codes
apps/api/src/modules/production/domain/repositories/production-job.repository.ts       + loadForUpdate
apps/api/src/modules/production/infrastructure/persistence/drizzle-production-job.repository.ts  + loadForUpdate
apps/api/src/modules/production/application/admin/production-admin-actor.ts            + requireProductionAdminId
apps/api/src/modules/production/tests/integration/admin-production-context.ts          transition module + inventory/order seeding helpers
```

**Modified — API tests repaired (3)**

```text
apps/api/src/modules/production/presentation/admin-production-job.contract.spec.ts   three operations -> four
apps/api/src/modules/inventory/presentation/admin-sku-stock.contract.spec.ts         §23, pre-existing red
apps/api/src/modules/inventory/inventory-persistence.contract.spec.ts                §23, pre-existing red
```

**Modified — worker (3)**

```text
apps/worker/src/jobs/inventory-reservation/application/reserve-order-inventory.usecase.ts  import moved
apps/worker/src/jobs/inventory-reservation/domain/order-reserve-idempotency.ts             import moved
apps/worker/src/jobs/inventory-reservation/domain/reservation-requirements.spec.ts         import moved
```

**Generated (3)**

```text
packages/contracts/openapi/openapi.generated.json
packages/api-client/src/generated/embroidery-api.ts
packages/api-client/src/generated/embroidery-api.schemas.ts
```

**Documentation (5)**

```text
docs/database/DB8_LOCK_ORDER_MATRIX.md                          §1 row + §2 cross-flow order
docs/implementation/phases/APP8-INVENTORY-AND-PRODUCTION.md     status header + §12 table
docs/implementation/10-MASTER-APPLICATION-ROADMAP.md            APP8 row + NEXT_CHECKPOINT
docs/implementation/SCOPED_COMMAND_INDEX.md                     two APP8-B04 commands
docs/implementation/reports/APP8-B04-COMPLETION-REPORT.md        this report
```

`packages/database` and every other `apps/worker` file are unchanged.

## 26. File-size disposition

```text
LARGEST_SOURCE = 374  transition-production-job.use-case.ts     (limit 400, threshold 300)
LARGEST_TEST   = 513  admin-production-context.ts               (limit 600, threshold 500)
```

Everything is inside the hard limits. Responsibilities were split rather than
line ranges: the transition command, the state guards, the reservation
coordination, the audit/outbox recorder, the controller, the request schema and
the response schema are seven files, and the suites are split by target (start
and complete, cancellation, races). The use case was over 400 lines on its first
assembly and the inventory loops became `ProductionReservationCoordinator` —
which is also where the two-actor rule now lives, in one place instead of two
call sites.

`admin-production-context.ts` is above the 500-line review threshold. It is one
harness for eight suites, and the B04-specific state-forcing helpers were put in
a separate `production-transition-support.ts` rather than added to it for exactly
that reason.

## 27. Nonblocking findings

| Id | Finding | Route |
|---|---|---|
| `FU-APP8-B04-01` | **`production.started` and `production.completed` have no consumer.** Both are accepted `SE-009` event types and are appended in the owning transaction, but no worker handler is registered for them, so the claim filter never claims them and the rows stay `PENDING`. That is the outbox behaving correctly — a producer may precede its consumer — but the rows accumulate until the checkpoint that delivers the production notification arrives. Worth a look from whichever phase owns `SE-009`'s notification side. | the checkpoint delivering production notifications |
| `FU-APP8-B04-02` | **A cancelled production job leaves the order mid-lifecycle with nothing scheduled to resolve it.** By `PO-APP8-005` that is correct — APP8 does not run the commercial saga — but an order at `IN_PRODUCTION` whose only job is `CANCELLED` has no delivered path forward until the cancellation/recovery authority ships. The Admin production detail shows the state truthfully; nothing alerts on it. | the checkpoint that owns order cancellation/recovery |
| `FU-APP8-B03-01` | **Production job creation still records no actor** — carried, unchanged. `DB3_AUDIT_SPECIFICATION.md`'s production row is scoped to start/complete/cancel, so B04 wrote those three and invented nothing for creation (§16, §18). | open, nonblocking |
| `FU-APP8-B03-03` | **`orders.current_approval_snapshot_id` can be repointed.** B04 implements the conservative half only: a start whose job approval is no longer the order's is refused (§6). Which approval a *planned* job should follow after a repoint is still undecided, and `uq_production_jobs__order_approval_snapshot` would permit a second job for the new snapshot. | the checkpoint that delivers pointer moves |

Not absorbed and untouched: `FU-APP8-W01-01` (APP9 remaining-payment behaviour),
`FU-APP8-W01-02` (idempotency-record retention), `FU-APP8-B03-04` (`orderCode`
fallback), low-stock threshold authoring, ledger pagination.

## 28. Roadmap

```text
R00   COMPLETE
G01   COMPLETE          (corrected by APP8-G01-C1)
B01   COMPLETE
B02   COMPLETE
W01   COMPLETE
B03   COMPLETE
B04   COMPLETE
D01   INCOMPLETE — Next
A01   INCOMPLETE
A02   INCOMPLETE
A03   INCOMPLETE
E01   INCOMPLETE
X01   INCOMPLETE
```

Exactly one `Next`.

## 29. Next checkpoint

```text
NEXT_CHECKPOINT = APP8-D01
```

## 30. Push state

```text
NOT_PUSHED = true
```

One local checkpoint commit. Nothing pushed.
