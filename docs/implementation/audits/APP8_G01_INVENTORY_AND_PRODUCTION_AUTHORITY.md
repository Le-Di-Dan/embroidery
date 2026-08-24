# APP8-G01 — Inventory Reservation and Production Operations Authority

- Checkpoint: `APP8-G01`
- Mode: `AUTHORITY / DOCUMENTATION_ONLY`
- Branch/HEAD at entry: `production` @ `4ba1c93`
- Date: 2026-08-24
- Product Owner rulings: `PO-APP8-001` … `PO-APP8-006` — **LOCKED**

This package turns the `APP8-R00` audit and the Product Owner's six rulings into
values that later APP8 checkpoints may not invent. It changes documentation
only. No runtime source, test, schema, migration, generated artifact, OpenAPI
document, generated client or Figma node was touched.

It **supersedes nothing** in
[`APP8_PHASE_ENTRY_AUDIT.md`](./APP8_PHASE_ENTRY_AUDIT.md); it extends it, and
resolves the one decision that audit routed here (§11) plus the four authority
readings it deliberately left for a ruling. The audit and
[`APP8-R00-COMPLETION-REPORT.md`](../reports/APP8-R00-COMPLETION-REPORT.md)
remain intact as historical evidence that `PO-APP8-001` was *discovered*, not
assumed.

```text
CONTRADICTION_WITH_STRONGER_AUTHORITY = NONE FOUND
NEW_ADR_REQUIRED                      = NO
```

No ADR is created. Every ruling below resolves **inside** an already-accepted
architecture — three of them are resolutions the accepted documents explicitly
deferred to a business decision, and none selects a new architecture, mechanism
or datastore. Creating an ADR here would record a choice nobody made.

---

## 1. `PO-APP8-001` — COP orders and GRD-015

```text
PO-APP8-001 = APPROVED_OPTION_A
GRD-015_RESERVATION_CLAUSE_BINDING = PER_RESERVABLE_ORDER_SUBJECT
```

`GRD-015`'s reservation clause binds **per reservable order subject**, not as a
requirement that every order carry at least one reservation.

### 1.1 Why this is a resolution and not an override

The audit's §11 facts are re-verified here against the sources, not restated:

| Fact | Source, read directly |
|---|---|
| GRD-015 = *"exact approval snapshot ref + deposit SATISFIED + reservation RESERVED + order DEPOSIT_PAID (INV-06)"* | `DB3_TRANSITION_GUARD_CATALOG.md` row `GRD-015` |
| A COP `order_item` has `sku_id IS NULL` | `packages/database/src/schema/ordering/order-items.ts` — `ck_order_items__exactly_one_subject`, the `sku_id` XOR `customer_owned_product_id` CHECK |
| A reservation **requires** a stock anchor | `packages/database/src/schema/inventory/inventory-reservations.ts` — `skuStockId … .notNull()` |
| INV-06 is an **ordering-precondition** invariant, not a cardinality one | `DB0_INVARIANT_INVENTORY.md` INV-06: *"production not without approved design + verified deposit + reservation"* |

The guard names a precondition on a reservable quantity. It nowhere states a
per-order count, and no business rule, lifecycle spec, invariant plan or ADR
qualifies — or universalises — the clause for the COP branch. Option A therefore
**resolves an ambiguity the accepted set left open**; it contradicts no accepted
invariant. Option B would make a first-class branch that APP5, APP6 and APP7 all
delivered end to end (`APP7-E01-02` `COP_ORDER_CREATION = PASS`) permanently
unreachable.

### 1.2 Catalog-only order

Production may start only when **all** of the following hold:

```text
CATALOG_PRODUCTION_START_GATE
  1. exact approval snapshot reference is valid              (INV-03 / GRD-013 context)
  2. DEPOSIT obligation SATISFIED via DepositEligibilityPort (GRD-013)
  3. order state = DEPOSIT_PAID                              (GRD-015)
  4. order NOT ON_HOLD and NOT CANCELLING                    (GRD-022)
  5. every inventory-reservable Catalog quantity is covered by
     an active official reservation
  6. that reservation is RESERVED at the moment the production-start
     transaction consumes it
```

### 1.3 COP-only order

```text
COP_PRODUCTION_START_GATE   = CATALOG gate MINUS clauses 5 and 6
COP_RESERVATION_EXPECTATION = ABSENT_BY_DESIGN
```

A customer-owned-product order item has no `sku_id`. APP8 therefore:

- **fabricates no SKU**;
- **fabricates no `sku_stocks` row**;
- **fabricates no inventory reservation**;
- **creates no COP-specific pseudo-inventory path**.

The absence of a reservation on a COP-only order is **expected behaviour, not an
error**, and must not be reported, logged or surfaced as a blocked or failed
gate.

### 1.4 Mixed Catalog + COP order

```text
MIXED_ORDER_RULE = CATALOG portions require reservation coverage;
                   COP portions require none;
                   production start is BLOCKED if any required Catalog
                   reservation is missing or not RESERVED;
                   COP items never weaken, offset or bypass a Catalog requirement.
```

### 1.5 Reservation identity and cardinality — the repository's, not a new one

The audit's §5.7 phrase *"official reservation for the item's frozen quantity"*
reads as one reservation per order **item**. The delivered schema does not permit
that when two Catalog items resolve to the same SKU:

```text
CST-016 / uq_inventory_reservations__order_stock__reserved
  UNIQUE (order_id, sku_stock_id) WHERE status = 'RESERVED'
```

The canonical identity is therefore **one active reservation per
`(order_id, sku_stock_id)`**, and the ruling is:

```text
RESERVATION_IDENTITY = (order_id, sku_stock_id), one active RESERVED row
RESERVATION_QUANTITY = must cover the order's FROZEN Catalog quantity for that SKU,
                       aggregated across every Catalog order item resolving to it
```

No per-item reservation rows are invented, and no second reservation row is
created to represent a second item. `APP8-W01` and `APP8-B04` implement exactly
this.

### 1.6 One implementation, not two

```text
GRD-015_IMPLEMENTATION_COUNT = 1
DEPOSIT_PREDICATE_COUNT      = 1
COP_FAKE_INVENTORY_PATH      = FORBIDDEN
```

The COP branch is a **clause-scope difference inside the one production-start
guard**, not a second guard, a second deposit predicate or a parallel service.

---

## 2. `PO-APP8-002` — Official reservation expiry

```text
PO-APP8-002 = OFFICIAL_RESERVATIONS_ARE_NO_EXPIRY_IN_APP8

APP8_OFFICIAL_RESERVATION_EXPIRES_AT = NULL
APP8_RESERVATION_EXPIRY_SWEEP        = NONE
APP8_TTL_VALUES_CHOSEN               = NONE
SOFT_HOLD_EXPIRY_SEMANTICS           = UNTOUCHED
DEC-14                               = REMAINS DEFERRED / NONBLOCKING
```

This is an **explicit APP8 lock, not an accidental default**. It is authorised
twice over, not merely tolerated:

| Authority | Wording, quoted |
|---|---|
| `ADR-DB1-018` r3 | *"every hold/reservation carries an `expires_at` **(or an explicit no-expiry marker where the business rules say so)**"* |
| `ADR-DB1-018` Risks | *"official reservations may be long-lived by design pending business rules"* |
| `ADR-DB1-018` Deferred Details | *"**Deferred:** soft-hold TTL, **official-reservation expiry/no-expiry rules** … **Owner:** DB3 (+ business decision for durations)"* |
| `DB4_SCHEMA_CATALOG_INVENTORY_ASSET.md` §37–38 | soft holds `expires_at` **NOT NULL**; *"reservations allow explicit no-expiry (`expires_at` NULL per policy)"* |
| `TR-LC17-07` | *"explicit `expires_at` (if policy set; **official reservations may be no-expiry per config**)"* |
| `inventory-reservations.ts` header | *"`expires_at` may be NULL (official reservations can be no-expiry per policy, ADR-DB1-018 r3)"* |

`expires_at = NULL` **is** the repository's explicit no-expiry marker for this
table — the column's nullability is exactly what carries the distinction from
`inventory_soft_holds.expires_at`, which is mandatory. ADR-DB1-018 r8's sweep
governs *"explicitly-expired rows"*; with no expiry stamped there are none, so
implementing no sweep satisfies r8 rather than skipping it.

The business decision ADR-DB1-018 deferred is hereby made **for APP8's official
post-deposit reservations only**. `DEC-14` stays open for any future policy that
genuinely requires a TTL, and APP8 invents no number.

---

## 3. `PO-APP8-003` — Production job creation actor

```text
PO-APP8-003 = PRODUCTION_JOB_CREATION_IS_ADMIN_INITIATED

CREATION_ACTOR       = ADMIN
CREATION_TRANSPORT   = SYNCHRONOUS ADMIN API
CREATION_TIMING      = POST-DEPOSIT
CREATION_SOURCE      = the EXACT approval snapshot
CREATION_CARDINALITY = one job per (order_id, approval_snapshot_id)
SPEC_FREEZE          = the immutable production specification is frozen in the
                       SAME transaction as the job row
WORKER_AUTO_CREATION = FORBIDDEN
```

`TR-LC18-01` reads *"(create)→PLANNED | **system/admin** post-deposit"* and its
idempotency scope is *"per (order, approval)"*. The lifecycle permits either
actor; APP8 selects **admin**, which the accepted table already allows, and the
arbiter stays the delivered `uq_production_jobs__order_approval_snapshot`
(`23505` → `PRODUCTION_JOB_ALREADY_EXISTS`). No new idempotency mechanism is
introduced.

```text
SYSTEM_ACTOR_SCOPE_IN_APP8 = the official-reservation consumer triggered by
                             payment.verified (TR-LC17-04) — and nothing else
```

The worker gains **no** production-job responsibility. `APP8-W01` remains the
single worker checkpoint and its single handler remains
`payment.verified → official Catalog reservation`.

---

## 4. `PO-APP8-004` — Production artifacts

```text
PO-APP8-004 = PRODUCTION_ARTIFACT_MANAGEMENT_DEFERRED_NONBLOCKING

APP8_ARTIFACT_GENERATION         = OUT_OF_SCOPE
APP8_STITCH_FILE_WRITER          = NONE (no DST / PES / EXP)
APP8_MACHINE_RUNNER              = NONE
APP8_NEW_OBJECT_STORAGE          = NONE
APP8_CUSTOMER_ARTIFACT_EXPORT    = NONE
APP8_ARTIFACT_HTTP_OR_UI_SURFACE = NOT REQUIRED
EXISTING_attachArtifact          = UNTOUCHED AND UNUSED
```

`TR-LC18-03` (`STARTED→COMPLETED`) carries **no guard** — its in-tx column reads
*"mark + notes/artifacts"*, an optional accompaniment. No accepted guard,
invariant or constraint conditions job completion, order completion or any APP8
transition on an artifact existing. Deferral therefore contradicts nothing.

```text
APP8_AUTHORITATIVE_PRODUCTION_INPUT
  1. the frozen `production_specifications` row (INV-03, frozen from the exact
     Approval Snapshot in the creation transaction)
  2. the exact approved design evidence already reachable through the accepted
     APP6 authority
```

**Ownership is not assigned by symmetry.** This capability is **not** routed to
APP9. No accepted authority names an owner for it, and inventing one to keep the
roadmap tidy would manufacture a commitment nobody made.

```text
PRODUCTION_ARTIFACT_OWNER = UNASSIGNED — nonblocking deferred capability.
                            The first phase whose accepted requirements need a
                            machine file or an operator artifact takes ownership
                            and records it then.
```

---

## 5. `PO-APP8-005` — APP8 terminal boundary

```text
PO-APP8-005 = APP8_ENDS_AT_PRODUCTION_COMPLETED

APP8_TERMINAL_JOB_STATE   = COMPLETED             (LC-18 terminal)
APP8_TERMINAL_ORDER_STATE = PRODUCTION_COMPLETED  (TR-LC14-04)
```

APP8 **must not execute** any of:

| Forbidden in APP8 | Owner |
|---|---|
| `PRODUCTION_COMPLETED → AWAITING_FINAL_PAYMENT` (`TR-LC14-05`) | APP9 |
| remaining-payment collection (`GRD-016`) | APP9 |
| shipping freeze and dispatch (`GRD-017`, `TR-LC14-07`) | APP9 |
| delivery and completion (`GRD-018`, `TR-LC14-08`) | APP9 |
| cancellation execution, refund and final settlement (`GRD-020`, `GRD-021`, `TR-LC20-02`) | APP9 |

```text
APP9_ENTRY_PRECONDITION = TR-LC14-05 — an Admin moves an order at
  PRODUCTION_COMPLETED, whose job is COMPLETED, to AWAITING_FINAL_PAYMENT
  against the REMAINING obligation APP7 created and deliberately left unsatisfied.

APP7_REMAINING_OBLIGATION = PRESERVED UNSATISFIED. APP8 does not satisfy,
  cancel, re-price or otherwise touch it.
```

---

## 6. `PO-APP8-006` — Shared-persistence promotion is need-driven

`IMP-D054` is applied **narrowly**. Its rule is *a runtime application boundary
is not an ownership boundary* — for persistence that **two runtimes actually
write**. It is not "all persistence belongs in the shared package".

```text
PO-APP8-006 = SHARED_BY_DEMONSTRATED_CROSS_RUNTIME_NEED

INVENTORY_PERSISTENCE_DISPOSITION = PROMOTE/REUSE via @embroidery/persistence
  WHY: APP8-W01's payment.verified handler (apps/worker) and the Admin API
       (apps/api) both write reservations and the inventory ledger against the
       same sku_stocks lock anchor. Two runtimes, one aggregate — the exact
       IMP-D054 condition.
  FORBIDDEN: duplicated inventory DB logic in apps/worker;
             an alternate worker-only inventory adapter.

PRODUCTION_PERSISTENCE_DISPOSITION = REMAINS API-LOCAL
  WHY: PO-APP8-003 makes job creation Admin-initiated and synchronous, and
       PO-APP8-004 removes every artifact/machine-runner consumer. No accepted
       APP8 runtime outside apps/api writes production. Promoting it would be
       symmetry, not need.
  CONDITION FOR LATER PROMOTION: a concrete accepted cross-runtime consumer,
       proven by repository inspection at that time — and then only the required
       production persistence is promoted, never the module wholesale.
```

This refines the `APP8-B02` wording in the R00 plan **without** changing the
checkpoint order, `APP8-B02`'s position or its required repair. `APP8-B02` still
owns the CC-21 release-vs-consume row lock (audit §5.4 Gap B), which remains that
checkpoint's blocking deliverable.

---

## 7. Authority locks inherited from `APP8-R00`, restated as canonical

### 7.1 Deposit authority — one source of truth

```text
DEPOSIT_ELIGIBILITY_PORT = Symbol, @embroidery/persistence (payment/)
DepositEligibilityPort   = isDepositSatisfied(orderId): Promise<boolean>
ADAPTER                  = DrizzleDepositEligibilityAdapter
PROVIDER                 = PaymentPersistenceModule
CONSUMER (delivered)     = ReservationEligibilityGuard  (GRD-013)
```

APP8 creates **no** duplicated SQL predicate, **no** second port and **no**
second source of truth.
`apps/api/src/modules/payment/domain/repositories/deposit-eligibility.port.ts`
is a re-export of the same Symbol instance, not a second definition.

### 7.2 Schema

```text
INVENTORY_SCHEMA_DISPOSITION  = NO_MIGRATION_REQUIRED
PRODUCTION_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED
APP8_MIGRATIONS_ADDED_IN_G01  = 0
```

`production_job_attempts` is **not created**. No claim, machine or operator
column is added to satisfy the superseded candidate plan's assumption. Rework
remains a **new job** linked by `reworked_from_job_id` (ADR-DB3-003), never a
spec mutation.

### 7.3 Async runtime

```text
QUEUE_RUNTIME = the existing PostgreSQL outbox/claim runtime (IMP-D029, closing IMP-O003)

APP8 ADDS: no Redis, no broker, no queue table, no second datastore,
           no alternate idempotency subsystem.
APP8_WORKER_HANDLERS = 1 — payment.verified -> official Catalog reservation (APP8-W01)
```

Concurrency is inherited, not redesigned: `sku_stocks` is the sole lock anchor
(GRD-014); the `orders → sku_stocks` lock order proven by DB8 `CC-22` is
preserved; isolation stays `READ COMMITTED` with explicit row locks; idempotency
reuses `idempotency_records` and the outbox claim.

### 7.4 Customer UI

```text
CUSTOMER_UI_DISPOSITION = NO_CUSTOMER_UI_IN_APP8
```

No Storefront inventory or production screen is added in APP8. The exit-gate
clause "internal notes, artifacts, operator identity and inventory quantities
reach no customer surface" is satisfied because APP8 ships no customer surface at
all.

### 7.5 Design

```text
APP8_FIGMA_BASELINE = 0 rows (no APP_08 page target)
DESIGN_GATE         = DESIGN_REQUIRED_BEFORE_UI
DESIGN_OWNER        = APP8-D01, immediately before APP8-A01
G01_FIGMA_CHANGES   = 0
```

---

## 8. Roadmap lock

```text
R00 -> G01 -> B01 -> B02 -> W01 -> B03 -> B04 -> D01 -> A01 -> A02 -> A03 -> E01 -> X01
```

Unchanged by this checkpoint — no ruling above altered a dependency, a
checkpoint's ownership or the predicted totals (8 new HTTP operations, 0
migrations, 1 worker handler, 1 design package, 3 Admin screens). The single
canonical status table lives in
[`APP8-INVENTORY-AND-PRODUCTION.md`](../phases/APP8-INVENTORY-AND-PRODUCTION.md)
§12 and is deliberately not duplicated here.

```text
AFTER_G01: R00 = COMPLETE, G01 = COMPLETE, B01 = Next, all later = INCOMPLETE
NEXT_CHECKPOINT = APP8-B01
```

---

## 9. What each ruling unblocks

| Ruling | Consumed by |
|---|---|
| `PO-APP8-001` | `APP8-B04` (production transitions) and `APP8-E01` case 7 — the two the audit named as blocked |
| `PO-APP8-002` | `APP8-W01` (reservation creation writes `expires_at = NULL`); removes any sweep from the phase |
| `PO-APP8-003` | `APP8-B03` (Admin creation endpoint); keeps `APP8-W01` single-purpose |
| `PO-APP8-004` | `APP8-B03` / `APP8-A03` scope; `APP8-D01` draws no artifact management |
| `PO-APP8-005` | `APP8-B04` terminal transition; `APP8-X01` handoff |
| `PO-APP8-006` | `APP8-B02` promotion scope |

---

## 10. Verdict

```text
APP8-G01 = COMPLETE
PO-APP8-001 = APPROVED_OPTION_A
PO-APP8-002..006 = LOCKED
CONTRADICTION_WITH_STRONGER_AUTHORITY = NONE FOUND
NEW_ADR_REQUIRED = NO
MIGRATIONS = 0 · RUNTIME SOURCE CHANGES = 0 · FIGMA CHANGES = 0
NEXT_CHECKPOINT = APP8-B01
NOT_PUSHED = true
```
