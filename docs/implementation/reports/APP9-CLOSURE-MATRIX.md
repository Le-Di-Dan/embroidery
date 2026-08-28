# APP9 — Closure Matrix

- Phase: `APP9 — Remaining Payment, Fulfillment and Completion`
- Produced by: `APP9-X01`
- Date: 2026-08-28
- Companion: [`APP9-X01-COMPLETION-REPORT.md`](./APP9-X01-COMPLETION-REPORT.md)

```text
APP9 = PASS_WITH_FOLLOW_UPS
BLOCKING_FOLLOW_UPS = 0
PHASE = CLOSED
NEXT_PHASE = APP10 — Customer Operations and Communication
```

Every row is read from the committed repository — the accepted reports, the
commit ledger, the generated OpenAPI artifact, the migration journal, the Figma
registry and the delivered source. Nothing was regenerated, re-executed or
inferred.

---

## 1. Canonical checkpoint count

```text
canonical checkpoints        = 13
  R00 G01 B01 B02 B03 W01 B04 B05 D01 A01 S01 E01 X01

correction checkpoints       =  2   over 2 parents
  B04-C1  (parent B04)
  A01-C1  (parent A01)

unused correction slots      =  8
  B01-C1 B02-C1 B03-C1 W01-C1 B05-C1 D01-C1 S01-C1 E01-C1
  (there is no C2 anywhere in APP9)

non-checkpoint interventions =  0
pre-closure APP9 commits     = 12
closure commit               =  1
```

Both used corrections were delivered inside their parent's commit rather than as
a separate one, which is why 13 checkpoints and 2 corrections produce 12
pre-closure commits.

---

## 2. Checkpoint matrix

| # | Checkpoint | Final status | Correction | Principal authority delivered | Commit | Report | Blockers |
|---|---|---|---|---|---|---|---|
| 1 | `APP9-R00` | `COMPLETE` | none | Phase entry audit: APP9 is **not greenfield** — the whole fulfillment/refund persistence layer already ships **uncomposed** with zero non-test callers. `APP9_HTTP_OPERATIONS_AT_ENTRY = 0`, `SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED`. Three provisional assumptions disproved and removed. A verified `REMAINING` `payment.verified` would **dead-letter** today (disposition D). 14/14 candidates dispositioned into the 13-checkpoint roadmap. | `1b372a4` | [R00](./APP9-R00-COMPLETION-REPORT.md) | 0 |
| 2 | `APP9-G01` | `COMPLETE` | `C1` unused | Authority lock (`IMP-D057`), documentation only. `PO-APP9-001 = OPTION A — DEFER`: commercial cancellation and refund leave APP9 scope entirely. Froze the LC-14 tail, `PAYMENT_MVP = MANUAL_BANK_TRANSFER`, `DEPOSIT != REMAINING` under `CST-039`, per-checkpoint operation budgets, `APP9_MIGRATIONS = 0`, and the two hard boundaries `LIVE_CARRIER_TRACKING = OUT_OF_SCOPE` and `APP9_NOTIFICATION_INTENTS = OUT_OF_SCOPE`. | `1c54326` | [G01](./APP9-G01-COMPLETION-REPORT.md) | 0 |
| 3 | `APP9-B01` | `COMPLETE — REVIEW_ACCEPTED` | `C1` unused | `TR-LC14-05` alone: the Admin move `PRODUCTION_COMPLETED → AWAITING_FINAL_PAYMENT`. The `REMAINING` obligation `APP7-W01` created is **reused in place** — no new obligation minted, no balance derived. 1 HTTP operation. | `52fd098` | [B01](./APP9-B01-COMPLETION-REPORT.md) | 0 |
| 4 | `APP9-B02` | `COMPLETE — REVIEW_ACCEPTED` | `C1` unused | The customer remaining-payment capability over the existing `REQUEST_ACCESS` grant with **no new scope**: current-balance read, QR, attempt initiation, plus the existing attempt-scoped evidence lane generalised to either `CST-039` kind. A **sibling** projection, never a re-pointed deposit type. 3 HTTP operations. | `a362a0b` | [B02](./APP9-B02-COMPLETION-REPORT.md) | 0 |
| 5 | `APP9-B03` | `COMPLETE — REVIEW_ACCEPTED` | `C1` unused | Admin verification of a `REMAINING` attempt and `TR-LC14-06` in **one transaction**, emitting `payment.verified` with the **real** `obligationKind`. `DEPOSIT` behaviour unchanged. Also repaired the stale contract path list B02 left (`FU-APP9-B02-02`). 0 HTTP operations. | `67085e0` | [B03](./APP9-B03-COMPLETION-REPORT.md) | 0 |
| 6 | `APP9-W01` | `COMPLETE — REVIEW_ACCEPTED` | `C1` unused | The **sole** `payment.verified` consumer extended to accept both kinds and **no-op successfully** for `REMAINING` — no second inventory reservation, no second handler, no second event type. **Closes `FU-APP8-W01-01`.** 0 HTTP operations, 0 new worker handlers. | `5e84c77` | [W01](./APP9-W01-COMPLETION-REPORT.md) | 0 |
| 7 | `APP9-B04` | `COMPLETE — CORRECTED (C1)` | `C1` **USED / PASS** | Editable shipping preparation: save and read the pre-freeze `shipping_details` truth while `EDITABLE`, with a fee change driving the supersede/successor `REMAINING` authority (supersede **before** the successor INSERT). | `e7bcef5` | [B04](./APP9-B04-COMPLETION-REPORT.md) | 0 |
| 7a | `APP9-B04-C1` | `COMPLETE — REVIEW_ACCEPTED` | one of the phase's two corrections | **An Admin write may never mint the customer's acknowledgement.** A fee increase now requires an explicit customer acknowledgement through a customer-authenticated operation of its own; the Admin save is refused against a `SATISFIED` balance. +1 path / +1 operation / +2 schemas. B04 total ownership = 3 operations. | `e7bcef5` | [B04-C1](./APP9-B04-C1-COMPLETION-REPORT.md) | 0 |
| 8 | `APP9-B05` | `COMPLETE — REVIEW_ACCEPTED` | `C1` unused | `TR-LC14-07` dispatch — the shipping freeze, **one** snapshot and `DELIVERED` in one atomic transaction — and `TR-LC14-08` completion. `GRD-016` enforced by an **explicit in-transaction check**, because a B04 fee increase can leave `READY_FOR_DELIVERY` still owing money. 2 HTTP operations. | `a191694` | [B05](./APP9-B05-COMPLETION-REPORT.md) | 0 |
| 9 | `APP9-D01` | `COMPLETE — PRODUCT_OWNER_APPROVED` | `C1` unused | One APP9 Figma design package on the reused `APP_09` page: **36 frames / 36 registry rows**, contract-derived. Draws its own limits rather than hiding them — the missing Admin REMAINING read, the deposit-flavoured transport names, and the deferred customer fee-acknowledgement surface. | `4884e2e` | [D01](./APP9-D01-COMPLETION-REPORT.md) | 0 |
| 10 | `APP9-A01` | `COMPLETE — CORRECTED (C1)` | `C1` **USED / PASS** | The Admin fulfillment workspace, extending `/orders` and `/orders/{orderId}`. **0 new Admin routes.** Recorded the Product Owner's approval of all 36 D01 rows under `FIG-APPROVAL-APP9-D01-PO-001`. 0 new HTTP operations. | `f6848c1` | [A01](./APP9-A01-COMPLETION-REPORT.md) | 0 |
| 10a | `APP9-A01-C1` | `COMPLETE — REVIEW_ACCEPTED` | the phase's second correction | The curated API-client root barrel (`packages/api-client/src/index.ts`, 1231 lines) **split by responsibility** to satisfy the CLAUDE.md §6 hard limit on handwritten source. Root public API unchanged — 414 names in, 414 names out; 0 Admin application source files changed. | `f6848c1` | [A01-C1](./APP9-A01-C1-COMPLETION-REPORT.md) | 0 |
| 11 | `APP9-S01` | `COMPLETE — REVIEW_ACCEPTED` | `C1` unused | The customer remaining-payment surface at `/truy-cap/thanh-toan-con-lai` — the phase's **one** new Storefront route. Exact live balance only; never `total − deposit`. | `b561a96` | [S01](./APP9-S01-COMPLETION-REPORT.md) | 0 |
| 12 | `APP9-E01` | `COMPLETE — ACCEPTANCE PASS` | `C1` **UNUSED** | Focused cross-boundary acceptance: **4 journeys / 12 cases, 12/12 PASS, 0 runtime changes**, as two scoped serial commands (api / worker) because `apps/api` may not import `apps/worker`. | `7255d84` | [E01](./APP9-E01-COMPLETION-REPORT.md) | 0 |
| 13 | `APP9-X01` | `COMPLETE` | none | Phase closure, baseline reconciliation and the APP10 handoff. Documentation-only. | the closure commit | [X01](./APP9-X01-COMPLETION-REPORT.md) | 0 |

---

## 3. Contract matrix — 9 APP9-owned HTTP operations

```text
OPENAPI_PATHS      = 100
OPENAPI_OPERATIONS = 108
OPENAPI_SCHEMAS    = 222
```

Read from `packages/contracts/openapi/openapi.generated.json` by counting, not
by regenerating.

| # | Owner | Method | Path | Operation id |
|---|---|---|---|---|
| 1 | `B01` | `POST` | `/api/admin/orders/{orderId}/transitions` | `adminOrder_transition` |
| 2 | `B02` | `POST` | `/api/public/orders/final-payment` | `publicOrderFinalPayment_current` |
| 3 | `B02` | `POST` | `/api/public/orders/final-payment/qr` | `publicOrderFinalPayment_qr` |
| 4 | `B02` | `POST` | `/api/public/orders/final-payment/attempts` | `publicOrderFinalPayment_initiate` |
| 5 | `B04` | `PUT` | `/api/admin/orders/{orderId}/shipping-detail` | `adminOrderShipping_save` |
| 6 | `B04` | `GET` | `/api/admin/orders/{orderId}/shipping-detail` | `adminOrderShipping_read` |
| 7 | `B04-C1` | `POST` | `/api/public/orders/shipping-fee-acknowledgements` | `publicOrderShippingFee_acknowledge` |
| 8 | `B05` | `POST` | `/api/admin/orders/{orderId}/dispatch` | `adminOrder_dispatch` |
| 9 | `B05` | `POST` | `/api/admin/orders/{orderId}/completion` | `adminOrder_complete` |

Per-checkpoint arithmetic, reconciled against each report's own before/after:

```text
APP9 entry                    99 operations
B01      +1                  100
B02      +3                  103
B03      +0                  103
W01      +0                  103   (worker only)
B04      +2                  105
B04-C1   +1                  106
B05      +2                  108
------------------------------------
APP9-owned                     9
```

`B03` adds none because Admin verification extends the delivered APP7 attempt
operation rather than adding a balance-specific twin. `W01` adds none because it
extends an existing worker consumer.

---

## 4. Database matrix

```text
APP9_OWNED_MIGRATIONS   = 0
REPOSITORY_TOTAL        = 37
LAST MIGRATION          = 0037_add_app7_transfer_evidence_association   (APP7)
SCHEMA CHANGES IN APP9  = none
```

Read from `packages/database/migrations/meta/_journal.json` (37 entries). APP8
closed at 37 and APP9 remains at 37, exactly as `APP9-R00` predicted with
`APP9_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED`: `shipping_details`,
`shipping_snapshots` and `shipping_fee_acknowledgements` shipped in migration
`0023`, and their reject-mutation triggers in `0030`, long before APP9 began.
No migration test was run and no schema was touched.

---

## 5. Worker matrix

```text
NEW_WORKER_HANDLERS   = 0
EXTENDED_HANDLERS     = 1   InventoryReservationHandler
NEW_EVENT_TYPES       = 0
```

| Event | Obligation kind | Delivered behaviour |
|---|---|---|
| `payment.verified` | `DEPOSIT` | the existing APP8 official inventory reservation, unchanged |
| `payment.verified` | `REMAINING` | a **successful no-op** — reaches `DISPATCHED`, never `DEAD_LETTER`, files one `background_job_attempts` row with `outcome = SUCCEEDED`, and produces **zero** inventory effect |

One consumer per event type is enforced at worker startup, which is why APP9
extends the sole registrant rather than adding a second. `APP9-E01` measured the
no-op against an order that was **already reserved**, with ledger effects counted
per `entry_kind` rather than as a total.

---

## 6. Figma matrix

```text
APP9_FIGMA_ROWS = 36
STATUS          = APPROVED_FOR_IMPLEMENTATION   (36 / 36)
APPROVAL        = FIG-APPROVAL-APP9-D01-PO-001
PAGE            = APP_09   (reused, no new page)
```

Verified read-only: 36 unique `FIG-APP9-*` registry ids, every one carrying
`APPROVED_FOR_IMPLEMENTATION`, all under the single approval token recorded by
`APP9-A01`. `node tools/check-figma-design-index.mjs` passes across the whole
registry (450 ids / 450 node rows / 21 tables, composites verified). No frame was
redrawn and no approval evidence was altered.

---

## 7. Follow-up matrix — every item classified exactly once

`BLOCKING = 0` for every row.

### Closed in APP9

| Id | Substance | Disposition |
|---|---|---|
| `FU-APP8-W01-01` | a verified `REMAINING` `payment.verified` would dead-letter | **CLOSED** by `APP9-W01` |
| `FU-APP9-B01-03` | `admin-order.contract.spec.ts` was already red at entry `HEAD` | **CLOSED** — inherited defect fixed in passing by `B01` |
| `FU-APP9-B02-02` | `admin-payment.contract.spec.ts` carried a third, stale exhaustive path list; red on the branch from `a362a0b` | **CLOSED** by `APP9-B03`. The published surface was always correct |
| API-client root barrel at 1231 lines | `A01` edited handwritten source standing at three times the CLAUDE.md §6 hard limit | **CLOSED — RESOLVED BY `APP9-A01-C1`**. Split by responsibility; root public API unchanged (414 in / 414 out). Not carried forward as open |

### Nonblocking, open

| Id | Substance | Note |
|---|---|---|
| `FU-APP9-B01-02` | no `ORDER`-target audit row is written for an LC-14 transition | transition history is complete; the audit projection is not |
| `FU-APP9-B03-01` | `PaymentDecisionResponse.depositObligationId` / `.depositStatus` carry the **REMAINING** obligation under deposit-flavoured names | **partially resolved.** `UI_SIDE = ADDRESSED` by `A01` (treated strictly as transport names, never reaching the screen); `BACKEND_DTO_DEBT = REMAINS OPEN` |
| `FU-APP9-B03-02` | no Admin read projects the REMAINING obligation, its attempts or reconciliations | **partially resolved.** UI side is `ACCEPTED_UI_DEGRADATION` — the limitation is drawn on screen and the balance is never derived as `total − deposit`; the backend read remains owed. `adminOrderPayment_read` filters `kind = 'DEPOSIT'` in SQL |
| `FU-APP9-W01-01` | `inventory-reservation.integration.spec.ts` at 541/600 | split DEPOSIT cases from kind-routing cases before an eleventh is added |
| `FU-APP9-B04-01` | `shipping-detail-context.ts` at 535/600 | above the 500 review threshold, below the hard cap |
| `FU-APP9-B04-02` | `APP9_PHASE_ENTRY_AUDIT.md` line 530 prescribes `createForOrder` + `cancel` for recalculation, which cannot produce the `SUPERSEDED` chain `TR-LC15-04` requires | a stale prescription in an audit document; the delivered code is correct |
| `FU-APP9-B04-03` | `SecureAccessGrantRepository.listActiveForRequest` filters `status = 'ACTIVE'` with no expiry predicate | `B04` checks `expiresAt` explicitly at its own call site; other consumers were not audited |
| `FU-APP9-B04-04` | `fulfillment_note` (TBL-047) has no writer anywhere and is not copied into `shipping_snapshots` | either give it a writer or record it as intentionally dormant |
| `FU-APP9-B04-C1-01` | repository-wide ESLint was not run; a stale `packages/persistence/dist` hides real `apps/api` lint errors | build persistence **first** — a lesson, now standing practice |
| `FU-APP9-B05-01` | the delivered `dispatch(...)` doc comment overstates `GRD-016` | comment only; the explicit in-transaction check is correct |
| `FU-APP9-B05-02` | `Order` does not expose `completed_at` | the column is written; `toOrder` does not map it |
| `FU-APP9-B05-03` | `dispatch(...)`'s actor parameter is optional | `B05` always passes an ADMIN actor; the signature permits omission |
| `FU-APP9-A01-01` | `AdminShippingDetailResponse.feeAmount`, `.carrierName`, `.trackingCode`, `.ward`, `.district`, `.frozenAt` are `nullable: true, type: "object"` in the artifact, so Orval renders a record type instead of `string \| null` | `A01` narrows them at the feature seam with a real `typeof` check; the DTO declarations remain owed |
| `FU-ADMIN-SHARED-DIALOG-01` | no shared Admin confirm-dialog primitive; `FulfillmentConfirmDialog` is one more copy | cross-phase, still **unowned** |
| `FU-APP9-S01-02` | a fourth statement of the exact-money rule | duplication, not divergence |
| `FU-APP9-S01-03` | a third copy of the modal frame and the evidence controller | Storefront duplication; relates to `FU-ADMIN-SHARED-DIALOG-01` |
| `FU-APP9-S01-04` | no static boundary suite for the `secure-final-payment` feature | optional in `E01` and deliberately not delivered there |
| `FU-APP9-E01-01` | `app9-e01-journeys.acceptance.spec.ts` at 563/600 | kept whole on purpose — splitting would give each half its own disposable database and destroy the one-order chain the suite exists to prove |

### Accepted limitations

| Id | Substance | Why accepted |
|---|---|---|
| `FU-APP9-G01-01` | `node tools/check-report-secrets.mjs` is inherited-red on two prose false positives (`APP6-B04:93`, `APP9-G01:381`) — the heuristic reads a described value as a plaintext one | confirmed again in `X01`, byte-identical, with no third finding added. The gate takes no file arguments, so it cannot be scoped |
| `FU-APP9-B02-01` | a `REMAINING` evidence upload travels the `deposit`-named APP7 route | `APP9-B02` §12 forbids renaming accepted APP7 evidence operations |
| `FU-APP9-S01-01` | two approved D01 summary rows are undrawn | by necessity — no API publishes the values (`FU-APP9-B03-02`) |
| `FU-APP9-E01-02` | cross-process event linkage is **shape-asserted**, not one shared physical row | a consequence of the `apps/api` ↛ `apps/worker` boundary. Closable only by a mechanism no phase has (a shared committed database across two Jest projects). The API half asserts the produced row column by column; the worker half inserts a row of exactly that shape |

### Deferred to a later phase

| Id | Substance | Owner |
|---|---|---|
| `FU-APP9-B01-01` | `SE-010` `payment.final-requested` is not emitted | APP10 — `APP9_NOTIFICATION_INTENTS = OUT_OF_SCOPE` under `G01` |
| customer shipping-fee acknowledgement UI | `BACKEND_READY / UI_DEFERRED` — the operation exists, no customer surface does. No customer projection returns a server-authoritative proposed fee | APP10 (customer communication) |
| `IMP-O007` | payment provider / callback / webhook integration; `payment_provider_events` unused | open — `PAYMENT_MVP = MANUAL_BANK_TRANSFER` |
| `IMP-O008` | per-stage default refund dispositions (`CON-144`) | routed forward by `PO-APP9-001 = OPTION A — DEFER` |
| `FU-APP8-B04-02` | the S6 commercial branch of production-job cancellation | conditional on `IMP-O008`; unchanged, still routed forward |

---

## 8. Route matrix

```text
NEW_ADMIN_ROUTES      = 0
NEW_STOREFRONT_ROUTES = 1
```

| App | Route | Provenance |
|---|---|---|
| Admin | `/orders` | `a3956fd` — **APP7-A01**, extended by APP9-A01 |
| Admin | `/orders/{orderId}` | `a3956fd` — **APP7-A01**, extended by APP9-A01 |
| Storefront | `/truy-cap/thanh-toan-con-lai` | `b561a96` — **APP9-S01**, the phase's one new route |

Verified by `git log --diff-filter=A` on each route file. `APP9-S02` does not
exist. `node tools/check-storefront-route-authority.mjs` passes.

---

## 9. Terminal state and handoff

```text
APP9 delivers the commerce-completion path end to end:

  TR-LC14-05   PRODUCTION_COMPLETED   -> AWAITING_FINAL_PAYMENT      ADMIN
  TR-LC14-06   AWAITING_FINAL_PAYMENT -> READY_FOR_DELIVERY          synchronous,
                                                                     inside the Admin
                                                                     verification tx
  TR-LC14-07   READY_FOR_DELIVERY     -> DELIVERED                   ADMIN, atomic
                                                                     freeze + one snapshot
  TR-LC14-08   DELIVERED              -> COMPLETED                   ADMIN

APP9 executes none of:
  commercial cancellation        refund approval / execution
  customer notification          provider / webhook payment integration
  live carrier tracking          customer shipping-fee acknowledgement UI

HANDOFF_ENTRY_STATE = order COMPLETED
NEXT_PHASE          = APP10 — Customer Operations and Communication
APP10_EXECUTION     = NONE
```

Read from `docs/implementation/phases/APP10-CUSTOMER-OPERATIONS-AND-COMMUNICATION.md`
and `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` §2, not from memory.
APP10 owns profiles and contact points, merge governance, agreements,
notification delivery visibility and a simple Zalo/Messenger handoff — which is
where the deferred customer communication (`FU-APP9-B01-01`) and the deferred
customer shipping-fee acknowledgement surface hand off.

---

## 10. Closure verdict

```text
APP9-X01            = COMPLETE
APP9                = PASS_WITH_FOLLOW_UPS
BLOCKING_FOLLOW_UPS = 0
PHASE               = CLOSED
NEXT_PHASE          = APP10 — Customer Operations and Communication
NOT_PUSHED          = true
```
