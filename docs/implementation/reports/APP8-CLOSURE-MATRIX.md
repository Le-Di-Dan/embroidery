# APP8 — Closure Matrix

- Phase: `APP8 — Inventory Reservation and Production Operations`
- Produced by: `APP8-X01`
- Date: 2026-08-26
- Companion: [`APP8-X01-COMPLETION-REPORT.md`](./APP8-X01-COMPLETION-REPORT.md)

```text
APP8 = PASS_WITH_FOLLOW_UPS
BLOCKING_FOLLOW_UPS = 0
PHASE = CLOSED
NEXT_PHASE = APP9 — Remaining Payment, Fulfillment and Completion
```

Every row is read from the committed repository — the accepted reports, the
commit ledger, the generated OpenAPI artifact, the migration directory, the
Figma registry and the delivered source. Nothing was regenerated, re-executed or
inferred.

---

## 1. Canonical checkpoint count

```text
canonical checkpoints        = 13
  R00 G01 B01 B02 W01 B03 B04 D01 A01 A02 A03 E01 X01

correction checkpoints       =  1   over 1 parent
  G01-C1  (parent G01)

unused correction slots      = 11
  B01-C1 B02-C1 W01-C1 B03-C1 B04-C1 D01-C1 A01-C1 A02-C1 A03-C1 E01-C1
  (and no second correction for G01 — G01-C2 unused)

non-checkpoint interventions =  0
pre-closure APP8 commits     = 14
closure commit               =  1
```

---

## 2. Checkpoint matrix

| # | Checkpoint | Final status | Correction | Principal authority delivered | Commits | Report | Blockers |
|---|---|---|---|---|---|---|---|
| 1 | `APP8-R00` | `COMPLETE` | none | Phase entry audit: the whole inventory/production persistence layer already ships but is **uncomposed**; two gaps named (Gap A — no composed `InventoryModule`; Gap B — the DB3 `CC-21` release-vs-consume arbiter genuinely missing after the DB8 renumber). Canonical plan §10 onward. | `9676890`, `4ba1c93` | [R00](./APP8-R00-COMPLETION-REPORT.md) | 0 |
| 2 | `APP8-G01` | `COMPLETE — CORRECTED (C1)` | `C1` **USED / PASS** | Authority lock: `PO-APP8-001`…`PO-APP8-005`, no-expiry reservations, Admin-initiated job creation, artifact deferral, terminal handoff. `CST-016` makes reservation identity `(order_id, sku_stock_id)`, **not** per order item. | `a3c9646` | [G01](./APP8-G01-COMPLETION-REPORT.md) | 0 |
| 2a | `APP8-G01-C1` | `COMPLETE — REVIEW_ACCEPTED` | the phase's only correction | `PO-APP8-005` wording only: "executes no cancellation" means no **order** cancellation/refund saga; APP8 **does** own production-**job** cancellation. No authority was widened. | `363565c` | [G01-C1](./APP8-G01-C1-COMPLETION-REPORT.md) | 0 |
| 3 | `APP8-B01` | `COMPLETE — REVIEW_ACCEPTED` | `C1` unused | `InventoryModule` composed into the running API; Admin stock read, low-stock signal and audited signed adjustment. **Closes Gap A.** 3 HTTP operations. | `59bc1b2` | [B01](./APP8-B01-COMPLETION-REPORT.md) | 0 |
| 4 | `APP8-B02` | `COMPLETE — REVIEW_ACCEPTED` | `C1` unused | Inventory persistence promoted to `@embroidery/persistence` (IMP-D054); the DB3 `CC-21` release-vs-consume row lock added. **Closes Gap B.** 0 HTTP operations. | `51053cf` | [B02](./APP8-B02-COMPLETION-REPORT.md) | 0 |
| 5 | `APP8-W01` | `COMPLETE — REVIEW_ACCEPTED` | `C1` unused | The `payment.verified` → official inventory reservation worker consumer (`TR-LC17-04`): frozen order items, Catalog quantities aggregated per SKU, one atomic order-level reservation set, existing worker idempotency and runtime reused. 1 worker handler. | `ddb63f8` | [W01](./APP8-W01-COMPLETION-REPORT.md) | 0 |
| 6 | `APP8-B03` | `COMPLETE — REVIEW_ACCEPTED` | `C1` unused | `ProductionModule` composed into the running API; Admin job creation gated on `DEPOSIT_ELIGIBILITY_PORT` against the order-resolved Approval Snapshot with the specification frozen in the same transaction; queue and detail reads. 3 HTTP operations. | `072a30b` | [B03](./APP8-B03-COMPLETION-REPORT.md) | 0 |
| 7 | `APP8-B04` | `COMPLETE — REVIEW_ACCEPTED` | `C1` unused | Guarded `LC-18` transitions, one transaction each: start consumes every required Catalog reservation and moves the order `DEPOSIT_PAID → IN_PRODUCTION`; complete moves it to `PRODUCTION_COMPLETED`; cancel releases only what is still `RESERVED` and moves no order. Lock order `orders → production_jobs → inventory_reservations → sku_stocks`. 1 HTTP operation. | `139773b` | [B04](./APP8-B04-COMPLETION-REPORT.md) | 0 |
| 8 | `APP8-D01` | `COMPLETE — PRODUCT_OWNER_APPROVED` | `C1` unused | One APP8 Figma design package on `APP_08` (`766:3`, root section `771:3`): 9 sub-sections, **41 frames / 41 registry rows**, contract-derived rather than brief-derived. | `3f478d6` | [D01](./APP8-D01-COMPLETION-REPORT.md) | 0 |
| 9 | `APP8-A01` | `COMPLETE — REVIEW_ACCEPTED` | `C1` unused | The Admin SKU stock workspace at `/kho/skus/{skuId}`. Also **recorded the Product Owner's approval** of the complete D01 package: all 41 rows `REVIEW_REQUIRED → APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP8-D01-PO-001`. 0 new HTTP operations. | `e593aa5` | [A01](./APP8-A01-COMPLETION-REPORT.md) | 0 |
| 10 | `APP8-A02` | `COMPLETE — REVIEW_ACCEPTED` | `C1` unused | The Admin production queue at `/san-xuat`: `LC-18` multi-select status filter, truthful `orderId` filter, keyset load-more on `hasNext`/`nextCursor`, `PRODUCTION_CURSOR_INVALID` first-page recovery, the `Sản xuất` sidenav entry. 0 new HTTP operations. | `bd1fe1c` | [A02](./APP8-A02-COMPLETION-REPORT.md) | 0 |
| 11 | `APP8-A03` | `COMPLETE — REVIEW_ACCEPTED` | `C1` unused | The Admin production job detail at `/san-xuat/{jobId}`: frozen specification, reservation summary and transition history from published fields only; the three guarded transitions with a mandatory cancellation reason and copy that denies any order cancellation or refund. 0 new HTTP operations. | `284437f` | [A03](./APP8-A03-COMPLETION-REPORT.md) | 0 |
| 12 | `APP8-E01` | `COMPLETE — ACCEPTANCE PASS` | `C1` unused | Focused cross-boundary acceptance: **4 journeys / 14 cases, PASS, 0 runtime changes**, delivered as three scoped commands (api / worker / admin) because `apps/api` may not import `apps/worker`. | `18e1b42` | [E01](./APP8-E01-COMPLETION-REPORT.md) | 0 |
| 13 | `APP8-X01` | `COMPLETE` | none | Phase closure, baseline reconciliation and the APP9 handoff. Documentation-only. | the closure commit | [X01](./APP8-X01-COMPLETION-REPORT.md) | 0 |

### 2.1 Correction and approval ledger

```text
G01-C1 = USED / PASS      (PO-APP8-005 wording; commit 363565c)
B01-C1 = UNUSED
B02-C1 = UNUSED
W01-C1 = UNUSED
B03-C1 = UNUSED
B04-C1 = UNUSED
D01-C1 = UNUSED
A01-C1 = UNUSED
A02-C1 = UNUSED
A03-C1 = UNUSED
E01-C1 = UNUSED

D01_PO_APPROVAL       = PASS
FIG_APPROVAL_EVIDENCE = FIG-APPROVAL-APP8-D01-PO-001
```

No correction record was invented. Every `UNUSED` above corresponds to the
absence of a `*-C1-*` report on disk; only `APP8-G01-C1-COMPLETION-REPORT.md`
exists.

---

## 3. Contract matrix — 7 APP8-owned HTTP operations

Final committed baseline, read from `packages/contracts/openapi/openapi.generated.json`:

```text
92 paths / 99 operations / 206 schemas
delta vs APP7:  +7 paths / +7 operations / +15 schemas / 0 removed
```

| Checkpoint | Ops | Method + path | operationId |
|---|---:|---|---|
| `B01` | 3 | `GET /api/admin/skus/{skuId}/stock` | `adminSkuStock_get` |
| | | `POST /api/admin/skus/{skuId}/stock/adjustments` | `adminSkuStock_adjust` |
| | | `GET /api/admin/skus/{skuId}/stock/ledger` | `adminSkuStock_ledger` |
| `B03` | 3 | `POST /api/admin/orders/{orderId}/production-jobs` | `adminProductionJob_create` |
| | | `GET /api/admin/production-jobs` | `adminProductionJob_list` |
| | | `GET /api/admin/production-jobs/{jobId}` | `adminProductionJob_get` |
| `B04` | 1 | `POST /api/admin/production-jobs/{jobId}/transitions` | `adminProductionJob_transition` |
| **Total** | **7** | | |

`R00`, `G01` (+`C1`), `B02` (persistence promotion), `W01` (worker), `D01`
(design), `A01`, `A02`, `A03` (frontend) and `E01` (acceptance) added **no** HTTP
operation.

**Plan delta, recorded rather than smoothed over.** §11 of the phase plan
predicted **8** operations, with `B04 = 2`. `B04` delivered **1**: start,
complete and cancel are one `POST .../transitions` command endpoint, not two.
The delivered total is therefore **7**, and the phase plan's prediction is
superseded by the measurement, not the other way round.

---

## 4. Database matrix

Final committed baseline, read without applying anything and without starting a
database:

```text
migrations = 37   (packages/database/migrations/0000…0037)
tables     = 79   (tools/db-manifest-check.mjs: 79 table rows for 79 tables)

APP8_MIGRATIONS = 0
APP8_TABLES     = 0
```

APP8 introduces **no** schema change at all. Every table it uses —
`sku_stocks`, `inventory_reservations`, `inventory_soft_holds`,
`inventory_ledger_entries`, `production_jobs`, `production_specifications`,
`production_job_transitions` — already existed at phase entry and was found
**uncomposed**, which is exactly what `APP8-R00` audited. The highest migration
on disk remains APP7's `0037_add_app7_transfer_evidence_association.sql`.

`APP8-X01` applies no migration, adds none and changes no schema file.

---

## 5. Worker matrix

```text
APP8_WORKER_HANDLERS_ADDED = 1
```

| Capability | Trigger | Owner | Position in `WorkerModule` |
|---|---|---|---|
| Official inventory reservation | `payment.verified` (DEPOSIT) | `APP8-W01` | the **fifth** outbox capability (`InventoryReservationModule`) |

Read from `apps/worker/src/bootstrap/worker.module.ts`: the worker composes six
job modules — `AssetInspectionModule` (APP2-W01), `AssetNormalizationModule`
(APP3-W01A), `NotificationDeliveryModule` (APP4-W01), `OrderConversionModule`
(APP7-W01), `InventoryReservationModule` (**APP8-W01**) and the scheduled
`IntakeCleanupModule` (APP5-B02). APP8 contributed exactly one, and introduced
no new runtime, claim filter, backoff curve or dead-letter policy.

`production.started` and `production.completed` are appended as `SE-009` events
by `APP8-B04` in the owning transaction and have **no consumer** — recorded as
`FU-APP8-B04-01`, nonblocking (§7).

---

## 6. Figma matrix

Read from `docs/design/FIGMA_DESIGN_INDEX.md`. No Figma node was opened, created
or mutated, and `tools/check-figma-design-index.mjs` was **not** re-run: `X01`
changes no registry row, which is the only condition that would justify running
it (`CMD-CHECK-FIGMA-DESIGN-INDEX`, scoped validation).

```text
APP8 registry rows            = 41
APPROVED_FOR_IMPLEMENTATION   = 41
REVIEW_REQUIRED (APP8)        =  0
SUPERSEDED / STALE (APP8)     =  0
Approval Evidence             = FIG-APPROVAL-APP8-D01-PO-001   (all 41 rows)
FIGMA_RUNTIME_DESIGN_GATE     = SATISFIED
```

Page `APP_08` (`766:3`), root section `771:3`, nine sub-sections. One row is
named `FIG-APP8-STALE-CONFLICT-SPEC` (`787:149`) — that is a frame **name**
describing the "state changed — reload" specification, not a registry status;
its status is `APPROVED_FOR_IMPLEMENTATION` like the other 40. Recorded so a
future grep for `STALE` is not misread, exactly as `APP7-X01` recorded the same
trap for `FIG-APP7-A01-STALE-CONFLICT`.

Registry consumers: `APP8-A01` (`/kho/skus/{skuId}`), `APP8-A02` (`/san-xuat`),
`APP8-A03` (`/san-xuat/{jobId}`). Each recorded the exact node IDs it
implemented against in its own report.

---

## 7. Follow-up matrix — every item classified exactly once

```text
CLOSED                       =  5
CLOSED_FALSE_POSITIVE        =  2
NONBLOCKING_OPEN             = 20
ROUTED_TO_LATER_PHASE        =  2
NOT_RELEVANT_TO_APP8         =  3
BLOCKING                     =  0
```

Duplicates are merged, not double-counted: `FU-APP8-A01-01` = `NF-APP8-A03-01`,
`FU-APP8-A01-02` = `NF-APP8-A03-04`, `FU-APP8-B01-04` = `FU-APP8-B02-01`,
`FU-ADMIN-SHARED-DIALOG-01` = `NF-APP8-A03-03`, and
`FU-APP8-D01-SECRET-CHECKER-APP6-B04-01` = `FU-APP6-B04-REPORT-SECRET-HEURISTIC-01`.

### 7.1 CLOSED — resolved inside APP8

| Item | Disposition |
|---|---|
| `FU-APP8-B01-03` | `CLOSED_BY_APP8-B01` — the shared `CTX-INV` fixture was stale (`seedInventoryChain` omitted `product_sides.code` / `embroidery_areas.code`, both later made `NOT NULL`), leaving every DB7/DB8 inventory suite red. Repaired in B01. |
| `FU-APP8-B02-03` | `CLOSED_BY_APP8-W01` — the inventory structural guard now lives beside the worker capability it guards (`canonical-inventory-authority.spec.ts`, 8/8). |
| `FU-APP8-B02-02` | `CLOSED_BY_APP8-B04` — the named risk (an unlocked `findReservation` mistaken for a decision-grade read) is structurally eliminated: `ORDER_RESERVATION_SUMMARY_PORT` is not injected into `AdminProductionTransitionModule` at all, so the decision path cannot reach an unlocked read. The lookup remains on the contract for non-decision callers; no delivered path uses it for a decision. |
| `FU-APP8-B03-02` | `CLOSED_BY_APP8-B04` — B04 derives requirements from frozen order items and hands each `(order, SKU, quantity)` to `consumeOrderReservation`, which takes the `(order_id, sku_stock_id)` rows `FOR UPDATE` **before** reading status. |
| `NF-APP8-A03-05` | `CLOSED_BY_APP8-A03` — `production-queue-render.test.tsx`'s whole-package absence assertion was correctly narrowed once A03 legitimately exported `adminProductionJobGet` / `adminProductionJobTransition`. |

### 7.2 CLOSED_FALSE_POSITIVE

| Item | Why it is not a defect |
|---|---|
| `FU-APP8-B03-04` | The `orderCode` empty-string fallback is unreachable: `fk_production_jobs__order_id` is `NOT NULL` with `ON DELETE restrict`. The fallback exists only so an impossible state cannot throw. |
| `NF-APP8-A03-06` | `.job-effects` printing `DEPOSIT_PAID` / `IN_PRODUCTION` / `RESERVED` / `CONSUMED` on an otherwise Vietnamese surface is what the **approved** frames `786:10`…`786:130` specify. Implementing the approved design is not debt. |

### 7.3 NONBLOCKING_OPEN — real debt, named owner, blocks nothing

| Item | Theme |
|---|---|
| `FU-APP8-A01-01` (= `NF-APP8-A03-01`) | **SKU code absent in the Inventory and Reservation UI.** Neither `AdminSkuStockResponse` nor `AdminProductionReservationResponse` publishes `skuCode`; both surfaces label by shortened `skuId` with the full value in `title`. Resolving it needs a contract change, not a UI change. |
| `FU-APP8-A01-02` (= `NF-APP8-A03-04`) | **`packages/api-client/src/index.ts` is 1168 lines** (1078 at APP8 entry; A01 +28, A02 +29, A03 +33), over the 400-line hard limit. Splitting the public boundary is a package-wide refactor no UI checkpoint may perform. Measured again at closure: **1168**. |
| `FU-APP8-A01-03` | **Route-language inconsistency** — `/kho/skus/{skuId}` and `/san-xuat` are the D01-approved Vietnamese identities; every other Admin route is an English slug. An IA decision, not a defect. |
| `FU-APP8-A01-04` | **No Inventory sidenav entry**, because no parameterless destination exists to point at — an all-SKU stock list would need an operation `APP8-B01` deliberately does not publish. `Sản xuất` was added; `Kho` remains unbuildable. |
| `FU-APP8-A01-05` | Pre-existing **APP6** admin lint error — unused `UNKNOWN_REQUEST_STATUS_LABEL` in `request-quotation-bootstrap.test.tsx:35`. Present at the APP8 entry baseline; still present at closure. APP6-owned. |
| `FU-APP8-A01-06` | Pre-existing **storefront** styling-gate violations: **19**, all in `apps/storefront`, identical before and after APP8; **0** in `apps/admin`. |
| `FU-APP8-A02-01` | The approved error frame (`782:206`) designs three read failures and no `403`; a `403` is not a state `APP8-B03` produces on that route. Design-reconciliation note. |
| `FU-APP8-A02-02` | The `orderId` control commits on every well-shaped keystroke (`router.replace`, no extra request). A debounce is a UX refinement. |
| `FU-APP8-A02-03` | Queue prose restates a server ordering/source behaviour no client test can hold to account. |
| `FU-APP8-B01-01` | **No operation authors `low_stock_threshold`.** The column is `NULL` on every lazily created anchor, so `lowStock` is currently always `false`. Threshold authoring is out of scope by `G01`. |
| `FU-APP8-B01-02` | **The stock ledger is capped at 100 with a `truncated` flag, not paginated.** The approved design deliberately offers no "load more" for a contract that has none. |
| `FU-APP8-B01-04` (= `FU-APP8-B02-01`) | Pre-existing **APP6** API lint: three `no-unnecessary-type-assertion` errors in `approve-design-version.use-case.ts` (194 / 241 / 285). Confirmed present at APP8 entry HEAD and still present. APP6-owned. |
| `FU-APP8-B01-05` | `SkuStockRepository.availability` takes the anchor row lock by design (`GRD-014`), so a `GET` serialises against concurrent writes on the same SKU. Correct at the locked scale; recorded because it is surprising. |
| `FU-APP8-B03-01` | **Production job creation records no actor.** `production_jobs` / `production_specifications` have no actor column and `DB3_AUDIT_SPECIFICATION.md`'s production row is scoped to start/complete/cancel. B04 wrote those three and invented nothing for creation. |
| `FU-APP8-B03-03` | `orders.current_approval_snapshot_id` is an audited pointer `ADR-DB3-003` r4 permits a post-approval revision to move. No delivered path moves it. B04 implements the conservative half: a start whose job approval is no longer the order's is refused. |
| `FU-APP8-B04-01` | **`production.started` / `production.completed` have no consumer.** Both are accepted `SE-009` types appended in the owning transaction; no worker handler is registered, so the claim filter never claims them. Nothing depends on them yet. |
| `FU-APP8-W01-02` | **No sweeper deletes `idempotency_records`**, so the swept-claim replay path is untested and currently unreachable. |
| `NF-APP8-A03-02` | `AdminProductionReservationResponseStatus` publishes `EXPIRED`, which no approved frame draws. A03 labelled it and reused the terminal treatment rather than inventing a colour. |
| `FU-ADMIN-SHARED-DIALOG-01` (= `NF-APP8-A03-03`) | **Nine hand-rolled Admin modal shells.** A03 added the ninth rather than promoting one for a single new caller, which would create the shared abstraction without reconciling the other eight. Cross-phase; carried since APP7. |
| `FU-APP7-S01-SCSS-GATE-01` | Tooling-coverage debt carried in at `R00`. Unchanged by APP8. |
| `FU-APP6-B04-REPORT-SECRET-HEURISTIC-01` (= `FU-APP8-D01-SECRET-CHECKER-APP6-B04-01`) | `tools/check-report-secrets.mjs` takes no path argument and flags one line in `APP6-B04-COMPLETION-REPORT.md:93`. Pre-existing, APP6-owned, and **APP6 history is not rewritten from inside APP8's closure**. Re-observed at `APP8-D01` and again at `APP8-X01`. |

### 7.4 ROUTED_TO_LATER_PHASE

| Item | Destination | Why |
|---|---|---|
| `FU-APP8-W01-01` | **APP9** | A *remaining-payment* `payment.verified` would dead-letter today. The producer writes `obligationKind` as a literal and `TR-LC17-04` is gated on the deposit event; when APP9 collects the remaining obligation it must decide that routing. Not APP8's to decide. |
| `FU-APP8-B04-02` | **APP9** | A cancelled production job leaves the order mid-lifecycle with nothing scheduled to resolve it. By `PO-APP8-005` that is **correct** — APP8 does not run the commercial saga. Order cancellation / refund is APP9's. |

### 7.5 NOT_RELEVANT_TO_APP8 — classified at `R00`, unchanged

```text
FU-APP7-S01-EXACT-MONEY-PROMOTION-01
FU-APP7-S01-SHARED-DIALOG-01
FU-APP7-B01-01
```

### 7.6 Blocking

```text
BLOCKING = 0
```

No item prevents accepted APP8 scope or the terminal handoff. Nothing in §7 was
implemented by `APP8-X01`; closure **records** debt, it does not pay it.

---

## 8. Shared-authority matrix

Recorded exactly as the repository holds it.

| Statement | Truth | Evidence |
|---|---|---|
| Canonical inventory persistence lives under `@embroidery/persistence` | **yes** | `packages/persistence/src/inventory/` — `sku-stock.repository.ts`, `drizzle-sku-stock.repository.ts`, `inventory-reservations.ts`, `reservation-terminalization.ts`, `reservation-requirements.ts`, `reservation-eligibility.guard.ts`, `inventory-commitments.ts`, `inventory-identity.ts`, `stock-anchor.ts`, `inventory-persistence.module.ts` (`APP8-B02`, IMP-D054) |
| No API-local inventory persistence remains | **yes** | `APP8-B02`: source scan of `apps/api` for `from 'drizzle-orm'` and for `skuStocks` / `inventorySoftHolds` / `inventoryReservations` / `inventoryLedgerEntries` — empty |
| `CC-21` reservation terminalization uses row locking | **yes** | one shared row-lock helper, one on-hand decrement and one ledger append in `reservation-terminalization.ts`; the by-id and by-`(order, SKU)` entry points share it, so the `CC-21` repair cannot be bypassed (`APP8-B02`, `APP8-B04` §10) |
| Catalog reservation requirement aggregation is shared by worker and API | **yes** | `reservation-requirements.ts` — the same per-SKU aggregation over frozen Catalog order items feeds `APP8-W01`'s reservation set and `APP8-B04`'s consume set |
| `APP8-B04` uses canonical **order-scoped** reservation terminalization | **yes** | `consumeOrderReservation` / `releaseOrderReservationIfActive` added to the canonical contract; the terminal writes were **extracted, not duplicated** (`APP8-B04` §10) |
| Production persistence was promoted to `@embroidery/persistence` | **NO** | `packages/persistence/src/` has no `production/`. Production persistence remains **API-local**: `apps/api/src/modules/production/infrastructure/persistence/`. §11 of the phase plan predicted "inventory + production"; `APP8-B02` narrowed it to inventory, and the repository agrees with `APP8-B02`, not with the prediction. |

---

## 9. Terminal state and handoff

```text
APP8 terminal success:
  production_job.status = COMPLETED
  order.status          = PRODUCTION_COMPLETED

APP8 executes none of:
  PRODUCTION_COMPLETED -> AWAITING_FINAL_PAYMENT
  remaining payment            shipping
  delivery                     refund
  commercial cancellation saga final settlement

HANDOFF_ENTRY_STATE = order PRODUCTION_COMPLETED
NEXT_PHASE          = APP9 — Remaining Payment, Fulfillment and Completion
APP9_EXECUTION      = NONE
```

Read from `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` §2, not from
memory. APP9 begins at `TR-LC14-05`: the Admin moves an order at
`PRODUCTION_COMPLETED`, whose production job is `COMPLETED`, to
`AWAITING_FINAL_PAYMENT` against the `REMAINING` obligation `APP7-W01` created
and deliberately left unsatisfied.

---

## 10. Closure verdict

```text
APP8-X01            = COMPLETE
APP8                = PASS_WITH_FOLLOW_UPS
BLOCKING_FOLLOW_UPS = 0
PHASE               = CLOSED
NEXT_PHASE          = APP9 — Remaining Payment, Fulfillment and Completion
NOT_PUSHED          = true
```
