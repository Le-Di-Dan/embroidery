# `APP8-B03` — Completion report

## 1. Verdict

```text
APP8-B03 = COMPLETE
NEXT_CHECKPOINT = APP8-B04
NOT_PUSHED = true
```

Admin production job creation, the production work queue and the production job
detail are delivered. `ProductionModule` is composed into the running API for the
first time. Three HTTP operations, zero migrations, zero worker behaviour, zero
production transitions.

## 2. Branch, entry HEAD, final commit

```text
BRANCH        = production
ENTRY_HEAD    = ddb63f80bda4064be52fe022cbee53b55142a731  (APP8-W01)
FINAL_COMMIT  = the single local checkpoint commit this report accompanies
PUSHED        = no
```

The final commit's own hash is not quoted here. Recording it would require a
second commit whose only content is that hash, which §22 forbids.

## 3. The exact three HTTP operations

```text
POST /api/admin/orders/{orderId}/production-jobs   adminProductionJob_create   201
GET  /api/admin/production-jobs                    adminProductionJob_list     200
GET  /api/admin/production-jobs/{jobId}            adminProductionJob_get      200

APP8_B03_HTTP_OPERATIONS = 3
```

Route naming follows the repository's established Admin shape. The job is
addressed directly because it has its own id and an operator works the queue
across orders; **creation** is nested under the order because a job cannot exist
without the order it is produced for, and the approval it freezes is resolved
from that order's row (§5.3). The path shape is therefore the same statement the
linkage rule makes.

Both controllers publish into one `adminProductionJob` domain via
`CONTROLLER_DOMAIN_KEYS` — the delivered mechanism eight other split surfaces
already use — so a routing decision does not name three public identifiers as
two domains.

**Nothing else was added.** No start, complete, cancel, artifact, note,
reservation, or customer/public production route exists anywhere in the document;
`admin-production-job.contract.spec.ts` asserts that every production route in
the **whole** OpenAPI document is one of these three.

## 4. Runtime composition

```text
PRODUCTION_RUNTIME_COMPOSED = yes (AdminProductionModule registered in AppModule)
```

At APP8 entry `ProductionModule` was imported by one integration spec and by
nothing in `AppModule`: the delivered production layer was
`REPOSITORY_DELIVERED` / `RUNTIME_COMPOSED = no`, and `createJob` had no caller
outside a test. `AdminProductionModule` composes it transitively.

A second module rather than controllers on `ProductionModule`, on the
`AdminSkuStockModule` / `InventoryModule` precedent `APP8-B01` set: mounting
Admin controllers on the persistence module would put `IdentityModule` — the
staff guards, the session store, the login rate limiter — into the injector of
the DB7 production suite, which only wants a repository.

What `AdminProductionModule` may inject, and what each absence prevents:

| Imported | For |
|---|---|
| `ProductionModule` | `PRODUCTION_JOB_REPOSITORY` — `createJob` and its in-transaction spec freeze |
| `OrderProductionContextModule` | one read-only Ordering port: the order's approval reference and subject counts |
| `OrderReservationSummaryModule` | one read-only Inventory port: display-only reservation rows |
| `PaymentPersistenceModule` | the single `DEPOSIT_ELIGIBILITY_PORT` (`APP8-G01` §7.1) |
| `IdentityModule` | the APP1 guards, and nothing else |
| `DatabaseModule` | `TransactionManager` and the read adapter's executor |

| Absent | Prevents |
|---|---|
| `OrderModule` / `OrderPersistenceModule` | any route moving an order (§13) |
| `InventoryModule` / `SKU_STOCK_REPOSITORY` | any route creating, consuming or releasing a reservation (§13) |
| Catalog / Design / Quotation modules | reconstructing the frozen specification from live state (§8.2) |
| `OutboxEventStore` | any route announcing anything |
| object storage | any route opening an internal artifact (`PO-APP8-004`) |

Worker composition was not touched. `apps/worker` has no diff in this checkpoint.

## 5. Production persistence disposition

```text
PRODUCTION_PERSISTENCE_DISPOSITION = REMAINS API-LOCAL   (PO-APP8-006, unchanged)
SECOND_PRODUCTION_REPOSITORY       = none
```

`ProductionModule` is **imported**, not promoted. Nothing in `apps/worker` writes
production — `PO-APP8-003` makes creation Admin-initiated and synchronous, and
`PO-APP8-004` removes every artifact/machine-runner consumer — so promoting it
would be symmetry with Inventory rather than the demonstrated cross-runtime need
`IMP-D054` requires.

The delivered `ProductionJobRepository` is **unmodified**: no method added, no
method changed, no LC-18 legality touched. The reads B03 needs live on a separate
`AdminProductionReadRepository` seam — the same split `APP7-B02` established with
`AdminOrderReadRepository`, and for the same reason: a queue projection does not
belong inside the aggregate every write path resolves, and two read routes must
not acquire `transition()`.

## 6. Create authority and actor

```text
CREATION_ACTOR     = ADMIN (AuthenticatedAdminGuard binds it; the use case asserts the kind)
CREATION_TRANSPORT = synchronous Admin API
CREATION_TIMING    = post-deposit
CREATION_SOURCE    = the exact Approval Snapshot the order names
CREATION_STATE     = PLANNED (TR-LC18-01)
WORKER_AUTO_CREATION = none — no worker handler was added or changed
```

The Admin id is never a request field. `assertProductionAdminActor` reads the
bound actor from `RequestContextService` and refuses a non-ADMIN loudly as a
wiring fault, exactly as `inventory-admin-actor.ts` does.

It **asserts** rather than returning an id, and that is a deliberate, reported
limitation rather than an oversight — see §22 `FU-APP8-B03-01`.

## 7. Exact order ↔ approval-snapshot linkage — proof

The approval id is **read off the order row**:
`orders.current_approval_snapshot_id`, `NOT NULL` by REL-074. A client-supplied
`approvalSnapshotId` is a **confirmation**, compared against that value; a
mismatch is refused with `PRODUCTION_APPROVAL_MISMATCH` and creates nothing.

This is strictly stronger than proving the two rows independently exist, which is
all the FK layer can do and all the delivered repository did. Its `createJob`
reads `approval_snapshots` by id and copies the row; an approval belonging to a
*different* order satisfies both `fk_production_jobs__order_id` and
`fk_production_jobs__approval_snapshot_id`. The delivered DB7 suite records the
hole in as many words:

> *"The approval belongs to another request, so its FK to **this** order's chain
> is satisfied but the job is orphaned commercially."*

Resolving the id from the order closes it, and closes it for the unnamed case
too: a request that supplies no approval cannot pick the wrong one.

No live Catalog, quotation, design-session or custom-request state is consulted
to decide the production specification. The read adapter's SQL touches
`production_jobs`, `production_specifications` and `production_job_transitions`
and no other table.

Proved by `production-job-creation.integration.spec.ts`:

- *"refuses an approval snapshot belonging to another order, creating nothing"* —
  order A + order B's snapshot → `409 PRODUCTION_APPROVAL_MISMATCH`, 0 jobs, 0
  specifications;
- *"accepts the order's own approval when the caller names it"*;
- *"creates exactly one PLANNED job against the order's own approval"* — the
  returned `approvalSnapshotId` equals the order's, unsent.

## 8. Deposit gate — proof

```text
GATE   = DepositEligibilityPort.isDepositSatisfied(orderId)
TOKEN  = DEPOSIT_ELIGIBILITY_PORT  (@embroidery/persistence, one Symbol)
BOUND  = DrizzleDepositEligibilityAdapter, by PaymentPersistenceModule
COPIES = 0 — no SQL duplicated, no second predicate, no payment table read here
```

The same authority `ReservationEligibilityGuard` resolves for GRD-013
(`APP8-G01` §7.1). Refusal is `PRODUCTION_DEPOSIT_NOT_SATISFIED` (409), raised
**before** the insert and inside the same transaction, so nothing commits.

Proved: *"creates no job, no specification and no partial row"* (counts 0/0), and
*"creates the job once the same order's deposit becomes satisfied"* — which also
shows the refusal is a gate that can open, not a verdict about the order.

## 9. Duplicate creation semantics

```text
ARBITER   = uq_production_jobs__order_approval_snapshot (CST-041)
MAPPING   = 23505 -> PRODUCTION_JOB_ALREADY_EXISTS (delivered constraint catalog)
HTTP      = 409, translated from the PersistenceError
REPLAY    = none — a duplicate POST is refused, never turned into success
NEW_IDEMPOTENCY_SUBSYSTEM = none
```

The unique index is the arbiter, not a pre-read. There is deliberately **no**
`findByOrderAndApproval` check before the insert: that would leave a window
between read and write that the constraint does not have, so two concurrent
creations for the same pair both reach the insert and exactly one commits.

§6 permits replay-success only where an already-accepted authority requires it.
None does, so B03 refuses.

Proved: *"leaves exactly one job and one specification behind"* — second POST →
`409 PRODUCTION_JOB_ALREADY_EXISTS`, `production_jobs` = 1,
`production_specifications` = 1, `production_job_transitions` = 0, and the
surviving row is the first job.

## 10. Frozen-specification fidelity

The delivered `createJob` freezes the specification from the approval **inside
the same transaction** as the job row; B03 changed none of it. The frozen set is
the repository-delivered one: `document_hash`, `product_name`, `variant_label`,
`side_name`, `area_name`, `physical_width_mm`, `physical_height_mm`,
`quantity_total`, plus the optional `production_parameters` the request may
supply.

Proved twice:

- *"freezes the specification from that approval, not from live catalog state"* —
  the detail reports `productName = 'Tee'`, `quantityTotal = 25`, a
  `sha256:`-formatted hash, and the approval id the order named;
- *"keeps the specification when the live catalog product is renamed"* — the live
  `products.name` is changed after creation and the specification does not move
  (INV-03).

Dimensions are transported as the strings `numeric` stores, never as rounded JSON
numbers; asserted in the contract suite.

## 11. Queue — filters, ordering, pagination

```text
ORDER      = created_at DESC, id DESC     (deterministic; id completes the total order)
PAGINATION = keyset, opaque cursor on (createdAt, id); limit 1..100, default 20
FILTERS    = status (repeatable, whole LC-18 vocabulary), orderId
INDEX      = ix_production_jobs__created_id__active (IDX-082) — used, not added
DEFAULT_STATUS_FILTER = none
```

No default triage subset: none is defined by any accepted authority, and a silent
one would hide the `COMPLETED` and `CANCELLED` jobs an operator went looking for.
`APP7-B02` settled the identical question the same way for orders.

**No priority filter and no priority field.** No such column exists
(`APP8-G01` §7.2). Likewise no SLA, operator, machine, attempt or claim filter or
field. The contract suite asserts the query parameter set is exactly
`{cursor, limit, orderId, status}` and the queue row's property set is exactly
`{jobId, orderId, approvalSnapshotId, status, createdAt, startedAt?, completedAt?,
cancelledAt?}`.

Proved: newest-first ordering; a two-page walk with no repeated or skipped row at
the boundary; single- and multi-value status filtering; order narrowing; a
malformed cursor refused as `400 PRODUCTION_CURSOR_INVALID` rather than silently
restarting; an unknown query parameter refused.

## 12. Detail fields

Job identity and state: `jobId`, `orderId`, `orderCode`, `approvalSnapshotId`,
`status`, `createdAt`, `updatedAt`, `startedAt?`, `completedAt?`, `cancelledAt?`,
`cancelledReason?`, `reworkedFromJobId?` (REL-092 lineage, as stored).

Frozen specification: the full immutable `production_specifications` row (§10),
read from that table alone.

Deliberately absent: artifact payloads and storage references
(`PO-APP8-004`, INV-21/22), production notes (§8.5), every customer fact
including the approval snapshot's frozen `[PII]` contact copy, and all money. The
contract suite bans `contact`, `price`, `amount`, `currency`, `artifact`,
`storage`, `bucket`, `token` and `secret` as response property substrings across
all eight published schemas.

## 13. Transition-history disposition

```text
TRANSITION_HISTORY = DELIVERED
SOURCE             = production_job_transitions (TBL-063), read via IDX-102 (production_job_id, id)
ORDER              = insert order (the sequence id) — the only correct replay order
```

Fields: `fromStatus`, `toStatus`, `actorKind`, `adminId?` / `systemJobKey?`
(whichever the kind implies), `reason?`, `correlationId`, `occurredAt`. No
production-attempt model is invented; no customer can appear.

A `PLANNED` job reports an **empty** history rather than a synthetic creation
row: `(create)→PLANNED` is not one of LC-18's transition rows, and manufacturing
one would put a move in the audit table that never happened.

Proved: an empty history on a fresh job, and `PLANNED->STARTED` then
`STARTED->CANCELLED` reported in that order with the cancellation reason carried.

## 14. Reservation-summary disposition

```text
RESERVATION_SUMMARY = DELIVERED — read-only, non-decision-grade
NOT_DEFERRED        = the §8.4 gap clause was not needed
```

Composed from two unlocked reads: the order's Catalog/COP subject counts and the
reservations standing against the order. Published as `required`,
`catalogItemCount`, `customerOwnedItemCount`, and per-reservation
`{reservationId, skuStockId, skuId, quantity, status}` over **every** LC-17
state, so a released reservation is distinguishable from one that never existed.

`required` is `false` exactly when the order has no Catalog line, which is
`PO-APP8-001` §1.3's `COP_RESERVATION_EXPECTATION = ABSENT_BY_DESIGN`. That is
what stops a screen rendering an expected absence as missing coverage.

It is obtained through a **new narrow Inventory port**,
`ORDER_RESERVATION_SUMMARY_PORT`, rather than through `SKU_STOCK_REPOSITORY`.
Two reasons, both structural:

1. importing `InventoryModule` would give a production read route
   `createReservation`, `release` and `consume` — the three methods §13 forbids
   B03 from calling;
2. `SkuStockRepository` is the contract `apps/api` and `apps/worker` share since
   `APP8-B02`; adding a read to it would put a method on the worker's reservation
   writer that no worker path calls.

The adapter takes **no lock, no transaction and no `FOR UPDATE`**, deliberately.
`FU-APP8-B02-02` requires a *decision-grade* reservation read to hold the
`sku_stocks` anchor (GRD-014); this one is display-only and is documented as such
in the port, the view, the adapter and the published OpenAPI description.
`APP8-B04` owns `GRD-015` and must read under the anchor lock; it may not use
this summary as its input.

`findReservation` is not used at all.

Proved: a COP-only order reports `required: false`, `catalogItemCount: 0`,
`customerOwnedItemCount: 1`, empty list — and zero `inventory_reservations` rows
exist, so nothing was fabricated; a Catalog order with a `RESERVED` row reports
it truthfully with the SKU an operator recognises; a Catalog order without one
reports `required: true` with an empty list, which is truthful and explicitly not
a verdict.

## 15. Schema

```text
PRODUCTION_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED
MIGRATIONS = 0
```

`packages/database` has no diff. No `production_job_attempts`, no priority, no
operator/machine assignment, no claim or queue state, no cached summary, no
duplicated specification column, no speculative index.

## 16. OpenAPI

```text
OPENAPI_BEFORE = 88 paths /  95 operations / 195 schemas
OPENAPI_AFTER  = 91 paths /  98 operations / 204 schemas
DELTA          = +3 paths / +3 operations / +9 schemas
REMOVED        = 0
```

+3 operations exactly as predicted. The +9 schemas are the eight published
response classes plus the creation request body; none is a rename or a
replacement.

Generated once, when the contract source was final. `pnpm openapi:check` reports
*"OpenAPI artifact is up to date"*.

## 17. Generated client

```text
GENERATED_CLIENT = REGENERATED_ONCE
FILES            = embroidery-api.schemas.ts, embroidery-api.ts
TREE_HASH        = a14ff9fa6c330e649678a2dcbab044641aca299cbd3ff9aa926ab3ef31a0c551
CHECK            = check-generated-client.mjs -> up to date
```

No generated file was hand-edited. `packages/api-client` and
`packages/contracts` typecheck clean.

## 18. Focused test ledger

| Command / suite | Result | Why it was run |
|---|---|---|
| `npx tsc --noEmit -p apps/api/tsconfig.json` | PASS | every changed source file is in this workspace |
| `npx jest src/modules/production` (4 suites, **58 tests**) | PASS | the checkpoint's own closure |
| — `admin-production-job.contract.spec.ts` (16) | PASS | the published contract + the composition-root proof, Docker-free, run **before** the generation slot was spent |
| — `production-job-creation.integration.spec.ts` (11) | PASS | §16.1 cases 1–6, real PostgreSQL, real HTTP, real Admin guard |
| — `production-reads.integration.spec.ts` (15) | PASS | §16.2 queue and §16.3 detail |
| — `production-persistence.integration.spec.ts` (16) | PASS | §16.5 — `createJob` is now called by a runtime path for the first time; this suite directly covers it |
| `npx jest src/openapi` (7 suites, 62 tests) | PASS | `operation-id.ts` changed and the committed artifact moved; both are asserted here |
| `npx tsc --noEmit` in `packages/api-client`, `packages/contracts` | PASS | the generated client and the artifact changed |
| `pnpm openapi:generate` + `pnpm openapi:check` | PASS | one generation, one drift check |
| `node scripts/generate-client.mjs` + `check-generated-client.mjs` | PASS | repository workflow for a contract change |
| `npx prettier --write` on the changed governed files | PASS | global control, scoped to changed input |
| `npx eslint` on the changed directories | PASS (0 problems) | global control, at the smallest changed scope |

The `src/openapi` run failed on first execution — `build-openapi-document.spec.ts`
and `openapi-artifact.spec.ts` reported `{matches: false, reason: 'stale'}`
against the committed artifact. That is the drift check doing its job before
regeneration; both pass after the single generation.

## 19. Deliberately not run

| Not run | Reason |
|---|---|
| full monorepo Jest, full API suite, full DB suite | §16.7; no demonstrated impact |
| all worker suites, `APP8-W01` acceptance | `apps/worker` has no diff |
| all inventory races, `APP8-B01` stock API tests | `SkuStockRepository` and its adapter are unchanged; the new inventory port is additive and touches neither |
| `APP7` full acceptance, payment suites | `PaymentPersistenceModule` is imported, not modified |
| Playwright, Admin UI, Storefront tests | no frontend diff; `APP8-A02`/`A03` own the screens |
| Docker full stack, DB9 benchmarks | no infrastructure or index change |
| SonarQube | §16.6 — checkpoint governance does not require it for a backend slice with no new global control |

## 20. Changed files

**New — Production (14)**

```text
apps/api/src/modules/production/admin-production.module.ts
apps/api/src/modules/production/application/admin/create-production-job.use-case.ts
apps/api/src/modules/production/application/admin/production-admin-actor.ts
apps/api/src/modules/production/application/admin/production-job.view.ts
apps/api/src/modules/production/application/admin/read-production-job-detail.query.ts
apps/api/src/modules/production/application/admin/read-production-queue.query.ts
apps/api/src/modules/production/domain/production-operations.errors.ts
apps/api/src/modules/production/domain/repositories/admin-production-read.repository.ts
apps/api/src/modules/production/infrastructure/persistence/drizzle-admin-production-read.repository.ts
apps/api/src/modules/production/presentation/admin-order-production-job.controller.ts
apps/api/src/modules/production/presentation/admin-production-job.controller.ts
apps/api/src/modules/production/presentation/admin-production-job.payload.ts
apps/api/src/modules/production/presentation/schemas/admin-production-job.request.ts
apps/api/src/modules/production/presentation/schemas/admin-production-job.response.ts
```

**New — Ordering port (3)**

```text
apps/api/src/modules/order/domain/repositories/order-production-context.port.ts
apps/api/src/modules/order/infrastructure/persistence/drizzle-order-production-context.adapter.ts
apps/api/src/modules/order/order-production-context.module.ts
```

**New — Inventory port (3)**

```text
apps/api/src/modules/inventory/domain/repositories/order-reservation-summary.port.ts
apps/api/src/modules/inventory/infrastructure/persistence/drizzle-order-reservation-summary.adapter.ts
apps/api/src/modules/inventory/order-reservation-summary.module.ts
```

**New — tests (4)**

```text
apps/api/src/modules/production/presentation/admin-production-job.contract.spec.ts
apps/api/src/modules/production/tests/integration/admin-production-context.ts
apps/api/src/modules/production/tests/integration/production-job-creation.integration.spec.ts
apps/api/src/modules/production/tests/integration/production-reads.integration.spec.ts
```

**Modified (5)**

```text
apps/api/src/bootstrap/app.module.ts                       AdminProductionModule registered
apps/api/src/openapi/operation-id.ts                       one CONTROLLER_DOMAIN_KEYS entry
packages/contracts/openapi/openapi.generated.json          regenerated once
packages/api-client/src/generated/embroidery-api.ts        regenerated once
packages/api-client/src/generated/embroidery-api.schemas.ts regenerated once
```

**Documentation (3)**

```text
docs/implementation/phases/APP8-INVENTORY-AND-PRODUCTION.md   status header + §12 table
docs/implementation/10-MASTER-APPLICATION-ROADMAP.md          APP8 row + NEXT_CHECKPOINT
docs/implementation/reports/APP8-B03-COMPLETION-REPORT.md      this report
```

The delivered `ProductionJobRepository`, its Drizzle adapter, `ProductionModule`,
`packages/database` and `apps/worker` are **unchanged**.

## 21. File-size disposition

```text
LARGEST_SOURCE = 385  admin-production-job.response.ts        (limit 400, threshold 300)
LARGEST_TEST   = 405  admin-production-job.contract.spec.ts   (limit 600, threshold 500)
```

Every file is inside the hard limits. Three source files sit above the 300-line
review threshold and each is a single responsibility that splitting would harm:
the response schema file is the one published contract surface (splitting it
would let the queue and detail shapes drift); the read adapter is four
column-named SELECTs over three tables; the two controllers are already split by
resource, and merging them would exceed the threshold outright.

## 22. Nonblocking findings

| Id | Finding | Route |
|---|---|---|
| `FU-APP8-B03-01` | **Production job creation records no actor.** `production_jobs` and `production_specifications` have no actor column; LC-18 actor evidence lives on `production_job_transitions`, which only a *transition* appends, and `DB3_AUDIT_SPECIFICATION.md`'s production row is scoped to *"Production start/complete/cancel(rework) \| TR-LC18-\*"* — creation is not in it. So who planned a job is not recoverable from the database. B03 mints no audit action of its own because §14/§19 forbid inventing one, and asserts the ADMIN actor without persisting it. The first checkpoint that writes production transitions should decide whether creation deserves an accepted audit action. | `APP8-B04` |
| `FU-APP8-B03-02` | **The reservation summary is unlocked by construction.** It is correct as of the instant read and stale thereafter. `APP8-B04` must take `GRD-015` under the `sku_stocks` anchor lock against rows it read there, never from `ORDER_RESERVATION_SUMMARY_PORT`. Restated here because the port, the view and the OpenAPI description all say so and the risk is a later checkpoint reusing a convenient read. | `APP8-B04` (`FU-APP8-B02-02`) |
| `FU-APP8-B03-03` | **`orders.current_approval_snapshot_id` is an audited pointer that can move.** ADR-DB3-003 r4 permits a post-approval revision to repoint it; no delivered path does so today, and `order_items.approval_snapshot_id` still equals it for every order the canonical writer creates. When a repoint path ships, "the job's approval is the order's *current* approval" becomes a decision about which approval a *planned* job should follow, and `uq_production_jobs__order_approval_snapshot` will permit a second job for the new snapshot. | the checkpoint that delivers pointer moves |
| `FU-APP8-B03-04` | **`orderCode` falls back to an empty string** if the order behind a job cannot be resolved. `fk_production_jobs__order_id` is `NOT NULL` with `restrict`, so the state is unreachable; the fallback exists only so an impossible state cannot crash a read. Worth revisiting if a detail projection ever gains a second cross-context lookup. | none — informational |

Not absorbed, per §17: `FU-APP8-W01-01` (APP9-owned remaining-payment
behaviour), `FU-APP8-W01-02` (idempotency-record retention), low-stock threshold
authoring, and ledger pagination. None was touched.

## 23. Roadmap

```text
R00   COMPLETE
G01   COMPLETE          (corrected by APP8-G01-C1)
B01   COMPLETE
B02   COMPLETE
W01   COMPLETE
B03   COMPLETE
B04   INCOMPLETE — Next
D01   INCOMPLETE
A01   INCOMPLETE
A02   INCOMPLETE
A03   INCOMPLETE
E01   INCOMPLETE
X01   INCOMPLETE
```

Exactly one `Next`.

## 24. Next checkpoint

```text
NEXT_CHECKPOINT = APP8-B04
```

## 25. Push state

```text
NOT_PUSHED = true
```

One local checkpoint commit. Nothing pushed.
