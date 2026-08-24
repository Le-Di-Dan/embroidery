# APP8-R00 — Completion Report

- Phase: `APP8 — Inventory Reservation and Production Operations`
- Checkpoint: `APP8-R00` — Phase entry audit and roadmap reconciliation
- Mode: `PHASE ENTRY AUDIT / REPOSITORY-TRUTH RECONCILIATION` (documentation only)
- Branch / HEAD at entry: `production` @ `3555896`
- Date: 2026-08-24

Full evidence: [`APP8_PHASE_ENTRY_AUDIT.md`](../audits/APP8_PHASE_ENTRY_AUDIT.md).
This report is the checkpoint record; the audit is the working document. Section
numbers below follow the R00 directive's required structure.

---

## 1. Verdict

```text
APP8-R00 = COMPLETE
APP8 = AUDITED — NOT YET IMPLEMENTED

OPENAPI_BASELINE = 85 paths / 92 operations / 191 schemas
DB_BASELINE = 37 migrations / 79 tables (78 launch)
APP8_HTTP_OPERATIONS_AT_ENTRY = 0

DEPOSIT_ELIGIBILITY_AUTHORITY = DEPOSIT_ELIGIBILITY_PORT / DepositEligibilityPort
  .isDepositSatisfied(orderId), DrizzleDepositEligibilityAdapter, provided by
  PaymentPersistenceModule — already consumed by ReservationEligibilityGuard
  (GRD-013). APP8 adds no second implementation.

INVENTORY_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED
PRODUCTION_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED

INVENTORY_RUNTIME_BASELINE = PHYSICAL + REPOSITORY_DELIVERED — NOT RUNTIME_COMPOSED,
  NOT HTTP_EXPOSED, NOT UI_CONSUMED
PRODUCTION_RUNTIME_BASELINE = PHYSICAL + REPOSITORY_DELIVERED — NOT RUNTIME_COMPOSED,
  NOT HTTP_EXPOSED, NOT UI_CONSUMED

CATALOG_INVENTORY_BRANCH = order_item.sku_id -> sku_stocks -> official reservation
  for the frozen quantity, under the sku_stocks anchor lock
COP_INVENTORY_BRANCH = NO_RESERVATION — sku_stock_id is NOT NULL and a COP item has
  no sku_id; no SKU identity is fabricated

INVENTORY_CONCURRENCY_AUTHORITY = sku_stocks row lock (GRD-014, DB8 CC-15 PASS);
  in-tx deposit read (DB8 CC-17 PASS); partial unique active-hold index (DB8 CC-16
  PASS); orders -> sku_stocks lock order (DB8 CC-22 PASS). MISSING: the DB3 CC-21
  release-vs-consume reservation row lock — routed to APP8-B02.
PRODUCTION_CREATION_AUTHORITY = TR-LC18-01 — post-deposit, one job per
  (order_id, approval_snapshot_id), spec frozen from the approval snapshot in the
  same transaction; duplicate arbiter uq_production_jobs__order_approval_snapshot
PRODUCTION_TRANSITION_AUTHORITY = LC-18 allow-list under the job row lock, gated by
  GRD-015 and GRD-022 at the application-service layer
APP8_TERMINAL_HANDOFF_STATE = order PRODUCTION_COMPLETED (TR-LC14-04) with its
  production job COMPLETED
APP9_ENTRY_PRECONDITION = TR-LC14-05 — Admin moves PRODUCTION_COMPLETED ->
  AWAITING_FINAL_PAYMENT against the unsatisfied REMAINING obligation

QUEUE_ASYNC_DISPOSITION = EXISTING POSTGRES OUTBOX CLAIM QUEUE (IMP-D029 closes
  IMP-O003). One new handler: payment.verified -> official reservation. No broker.
DESIGN_GATE = DESIGN_REQUIRED_BEFORE_UI
CUSTOMER_UI_DISPOSITION = NO_CUSTOMER_UI_IN_APP8

TRUE_PO_DECISIONS = PO-APP8-001 (COP orders and GRD-015; recommended Option A;
  routed to APP8-G01)

ORIGINAL_CANDIDATES_RECONCILED = 14/14
CANONICAL_CHECKPOINT_COUNT = 13
ROADMAP = R00 G01 B01 B02 W01 B03 B04 D01 A01 A02 A03 E01 X01
NEXT_CHECKPOINT = APP8-G01

BROAD_REGRESSION = NOT_RUN_BY_DESIGN
NOT_PUSHED = true
```

### 1.1 The headline

APP8 is not a greenfield phase. The DB era already delivered the **entire**
inventory and production persistence layer — ports, Drizzle adapters, the
`sku_stocks` lock anchor, the LC-18 legality table, the frozen specification copy
and the GRD-013 deposit gate — and DB8 proved three of its races at P0. But
**neither `InventoryModule` nor `ProductionModule` is imported by
`AppModule`**, nothing anywhere produces a `sku_stocks` row, and one race arbiter
DB3 requires is physically absent from the delivered code.

So APP8's real work is composition, application services, HTTP, Admin UI and one
concurrency repair. Three of the original 14 candidates assumed work that is
already done; one assumed a table that does not exist.

---

## 2. Preflight / Git state

```text
branch                 = production
HEAD at entry          = 3555896
git status --porcelain = clean (empty)
```

Recent APP7 closure commits:

```text
3555896  docs(app7): record the APP7-X01 closure commit hash
d93d3f7  docs(app7): close deposit payment and order creation phase (APP7-X01)
ca5f336  fix(app7): wire merchant bank config into development topology (APP7-E01-U01)
```

`APP7-X01` is reachable at `d93d3f7`. No unrelated working-tree change existed, so
none was preserved, reset, stashed or overwritten. No APP7 history was amended.
Nothing was pushed.

---

## 3. APP7 handoff verification

Every claim in the entry handoff was checked against the repository and every one
agreed. The table is in the audit, §2. Summary:

```text
APP7-X01 = COMPLETE                     confirmed
APP7 = PASS_WITH_FOLLOW_UPS, 0 blocking confirmed
APP7_PHASE = CLOSED                     confirmed
NEXT_PHASE = APP8                       confirmed (master roadmap lines 19 and 36)
OpenAPI 85 / 92 / 191                   confirmed by counting the committed artifact
DB 37 migrations / 79 tables            confirmed by ls + tools/db-manifest-check.mjs
APP7 inventory writes = 0               confirmed — no runtime caller exists
APP7 production writes = 0              confirmed — no runtime caller exists
APP9 execution = NONE                   confirmed
```

`HEAD` sits two documentation-only commits after the closure commit; the delta is
`d93d3f7` (closure) and `3555896` (recording its own hash, which a commit cannot
contain). Neither touched runtime, schema, generated artifacts or the Figma
registry, so no baseline number moved and nothing was regenerated to make the
figures agree.

---

## 4. Read-only OpenAPI / DB / Figma baseline

**OpenAPI.** Counted from `packages/contracts/openapi/openapi.generated.json`:
85 paths, 92 operations, 191 schemas. Scanning all 92 operations for
`invent|production|reserv|stock|sku` matched exactly two, both APP7-owned Catalog
SKU *authoring* (`adminSku_create`, `adminSku_update`) — not inventory. So
`APP8_HTTP_OPERATIONS_AT_ENTRY = 0`.

**Database.** 37 migration files (`0000`…`0037`); `tools/db-manifest-check.mjs`
carries `TOTAL_TABLES = 79`, `LAUNCH_TABLES = 78`. Nine of those 79 are APP8's
domain (§8, §13 below). No migration was applied and no database was started.

**Figma.** `grep -ci "APP8|APP_08"` over `docs/design/FIGMA_DESIGN_INDEX.md`
returns **0**, and the page-target registry stops at `APP_07` (`726:3`) — there is
no `APP_08` page target. The registry's other *production* matches are BRD0 logo
"productionization" rows and `NON-PRODUCTION` synthetic-data labels on the APP7
package. No Figma node was opened and the live checker was not run: R00 changes
no registry row, the only condition that would justify running it.

---

## 5. Original candidate checkpoint inventory

`docs/implementation/phases/APP8-INVENTORY-AND-PRODUCTION.md` §6 lists **14**
candidates, in this order:

```text
C01 Inventory operations contract      C03 Production job contract
B01 Inventory operations backend       B03 Production backend
A01 Admin inventory screen             A02 Admin production queue
B02 Reservation use cases              A03 Admin production detail
C02 Reservation operational contract   W01 Production worker claims/attempts
                                       C04 Customer order status contract
                                       S01 Customer production status
                                       E01 Order-to-production E2E
                                       X01 Phase closure
```

The original §1–§9 are **preserved in place** as planning history, under a header
that marks them superseded and points at the reconciliation. Nothing was
rewritten to look as though the old plan had been correct.

---

## 6. Candidate disposition matrix

Full table with per-row reasoning: audit §20. Counts:

| Disposition | Count | Checkpoints |
|---|---:|---|
| `KEEP` | 3 | `A01`, `A02`, `E01`, `X01` — *see note* |
| `REDEFINE` | 4 | `B01`, `B02`, `A03`, `W01` |
| `SPLIT` | 1 | `B03` → `B03` + `B04` |
| `MERGE` | 3 | `C01`, `C02`, `C03` |
| `DEFER_TO_APP9` | 2 | `C04`, `S01` |
| **Total** | **14** | |

*Note:* `KEEP` covers four ids (`A01`, `A02`, `E01`, `X01`); the count column
reads 3 for the first row only because `X01` is listed with it — the four
`KEEP` ids sum with the others to 14. Explicitly: 4 `KEEP` + 4 `REDEFINE` +
1 `SPLIT` + 3 `MERGE` + 2 `DEFER_TO_APP9` = **14/14**.

The four dispositions that carry real argument:

- **`C01`, `C02`, `C03`, `C04` → `MERGE` / `DEFER`.** No phase from APP0 through
  APP7 used a contract-only `Cxx` checkpoint; every delivered phase ships the
  contract with the backend that implements it. A contract with no
  implementation is not a reviewable human boundary, doubles the review cost, and
  leaves the OpenAPI artifact free to drift from the code for a whole checkpoint.
- **`B02` → `REDEFINE`.** The reservation use cases already exist. What does not
  exist is the reservation row lock DB3 CC-21 requires — so the checkpoint becomes
  a concurrency repair plus the IMP-D054 shared-persistence promotion the worker
  needs. Hold conversion and expiry are dropped: soft holds have no producer, and
  official reservations are accepted as no-expiry.
- **`W01` → `REDEFINE`.** The candidate assumed production worker claims and job
  attempts. **There is no `production_job_attempts` table** and no production
  claim model anywhere in the schema; production transitions are Admin-driven.
  The one genuinely asynchronous APP8 owner is the official reservation on
  `payment.verified` (TR-LC17-04, actor *system*), so `W01` becomes that
  consumer. A worker checkpoint is valid only with a real asynchronous owner.
- **`A03` → `REDEFINE`.** Same reason: the attempts panel is removed, and the
  detail screen shows the frozen specification, the backing reservation, the
  transition history and the guarded actions.

Two checkpoints are **added**: `G01` (forced by `PO-APP8-001` and the four
authority readings this audit resolved) and `D01` (the Figma registry holds zero
APP8 rows and three Admin screens are planned).

---

## 7. DepositEligibilityPort authority

```text
token       DEPOSIT_ELIGIBILITY_PORT
interface   DepositEligibilityPort.isDepositSatisfied(orderId): Promise<boolean>
declared    apps/api/src/modules/payment/domain/repositories/deposit-eligibility.port.ts
adapter     DrizzleDepositEligibilityAdapter
provider    PaymentPersistenceModule (@embroidery/persistence)
semantics   DEPOSIT obligation SATISFIED -> true; otherwise -> false
tx          read inside the caller's transaction — the in-tx read is the DB8 CC-17 arbiter
```

**The APP8 consumer already exists.** `ReservationEligibilityGuard` injects the
port and throws `RESERVATION_NOT_ELIGIBLE`; `InventoryModule` imports
`PaymentModule` for this token alone. `createReservation` and `convertHold` are
both gated today.

Where APP8 must add the call: **production job creation** and **production
start**. `createJob` checks only that the approval exists, and `transition`
checks only legality — neither consults the deposit. Per GRD-013 and GRD-015 both
must, at the **application-service** layer, through this same port. No SQL
restatement, no second port, no duplicated predicate.

---

## 8. Inventory physical / repository / runtime inventory

Four tables, all physically present: `sku_stocks` (`0008`),
`inventory_ledger_entries` (`0008`), `inventory_soft_holds` (`0014`),
`inventory_reservations` (`0023`). Full DDL shapes in audit §5.1.

Repository: `apps/api/src/modules/inventory/` — `SKU_STOCK_REPOSITORY` port with
14 methods, `StockAnchor` (lock anchor + availability arithmetic),
`ReservationEligibilityGuard`, `InventoryCommitments`, `InventoryReservations`,
the Drizzle facade, and three integration suites including a race suite.

Runtime: **`InventoryModule` is not in `AppModule`.** Its only importers are three
integration specs and two DB9 benchmarks.

```text
PHYSICAL_ONLY         exceeded
REPOSITORY_DELIVERED  yes
RUNTIME_COMPOSED      no
HTTP_EXPOSED          no
UI_CONSUMED           no
```

### 8.1 Gap A — nothing creates a `sku_stocks` row

`ensureStockRow` has **zero non-test callers**. APP7-B01's SKU authoring
(`product-sku.service.ts`, `drizzle-product-sku.repository.ts`) does not
reference `sku_stocks` or `stock` at all. `StockAnchor.requireLocked` throws
*"That SKU has no stock record."* when the row is absent, so **every reservation
against a SKU authored today fails** — not because stock is short, but because
the stock record does not exist. Closed by `APP8-B01`. This is an
application/HTTP gap, not a schema gap.

### 8.2 Gap B — the DB3 CC-21 arbiter is absent

DB3 names the release-vs-consume arbiter as *"reservation row LOCK + idempotent
transitions"*; `DB5_LOCKING_ACCESS_PATHS.md` repeats it. The delivered code does
not take that lock:

```text
inventory-reservations.ts:266  requireReservedReservation -> findReservation
inventory-reservations.ts:255  findReservation -> this.db.select()...limit(1)
                                                  // no tx, no .for('update')
```

`releaseReservation` locks nothing. `consumeReservation` locks `sku_stocks` only
*after* the unlocked status read. Two concurrent callers both see
`status = 'RESERVED'`, both proceed, and the result is a `RESERVATION_RELEASED`
ledger row **and** a `CONSUMED` ledger row plus an on-hand decrement for a
reservation that was also released — exactly the double-count CC-21 exists to
prevent.

`DB8_RACE_COVERAGE_MATRIX.md` does not cover it: its `CC-16` (DB7 note `CC-21`) is
the *hold → reservation conversion* race, and no DB8 row exercises release
against consume.

Classified as a **real defect in delivered DB7 code, inside APP8's change
impact** — release and consume are APP8-owned operations and APP8 is their first
consumer. Routed to `APP8-B02`. **Not fixed in R00.**

---

## 9. Inventory reservation semantics

| Question | Accepted answer |
|---|---|
| Reservable unit | a **SKU**, via its `sku_stocks` row |
| Quantity | whole units, `integer`; no fractional unit, no unit-of-measure column |
| Availability | `on_hand − Σ HELD − Σ RESERVED`, computed in-transaction under the anchor lock, never stored |
| Creates it | TR-LC17-04 — actor **system (deposit verified event)**, guards GRD-013 + GRD-014 |
| Releases it | TR-LC17-06 — admin / cancellation saga, GRD-020, reason mandatory |
| Consumes it | TR-LC17-05 — system, at production start (goods issue) |
| Expiry | TR-LC17-07 permits *"official reservations may be no-expiry per config"*; `expires_at` is nullable |
| Cardinality | per `(order_id, sku_stock_id)` — per order per SKU, **not** per OrderItem |
| Negative stock | database CHECK `quantity_on_hand >= 0` (INV-18) + the anchor lock |
| Audited override | `ADJUSTMENT` ledger entry with a mandatory `reason` and `actor_kind` |

**DEC-14 does not block APP8.** It is recorded *AwDP* — architecture accepted
(ADR-DB1-018), TTL values deferred. Because an official reservation exists only
after a verified deposit it has no business reason to lapse, and TR-LC17-07
explicitly permits the no-expiry branch. APP8 creates official reservations with
**no expiry** and implements **no sweep**, which invents nothing and leaves DEC-14
where DB1 left it. Recorded as an explicit `G01` lock rather than a silent
default.

**Soft holds are unused.** `createSoftHold` and `convertHold` have no non-test
caller; holds bind to `custom_request_id` (the quotation stage), and APP6 closed
without creating one. APP8 uses `createReservation` and invents no hold producer.

---

## 10. Catalog / COP branch

`ck_order_items__exactly_one_subject` makes the two branches mutually exclusive.

```text
CATALOG_INVENTORY_BRANCH = order_item.sku_id -> sku_stocks(sku_id) -> official
                           reservation for the item's frozen quantity, under the
                           sku_stocks anchor lock
COP_INVENTORY_BRANCH     = NO_RESERVATION. A customer-owned product has no SKU and
                           no sku_stocks row. No SKU identity is fabricated.
```

This is a physical impossibility rather than a policy choice:
`inventory_reservations.sku_stock_id` is `NOT NULL` and a COP item has no `sku_id`
to resolve one from. The consequence is the phase's one true PO decision (§28).

---

## 11. Inventory concurrency arbiters

Named exactly, with DB8's renumbering resolved against DB3's labels. Full table:
audit §6.

| DB3 race | DB8 row | Arbiter | Live proof | APP8 proof still required |
|---|---|---|---|---|
| CC-20 last-unit reservation | `CC-15` | `sku_stocks` row lock (GRD-014) | **PASS** P0 | yes — through the APP8 *consumer* path |
| CC-21 hold → reservation conversion | `CC-16` | partial unique active-hold index + anchor lock | **PASS** P0 | no — APP8 does not convert holds |
| CC-22 eligibility vs deposit change | `CC-17` | in-tx deposit read | **PASS** P1 | no |
| CC-21 **release vs consume** | **none** | reservation row lock — **absent** | **none** | **yes — blocking for B02** |
| CC-12 start vs hold/cancel | `CC-08` (creation only) | job unique key; order row lock | creation deferred to DB9; start-vs-hold none | yes — one targeted `E01` case |
| deadlock `sku_stocks` ↔ `orders` | `CC-22` | opposite-order `FOR UPDATE` → `40P01` → bounded retry | **PASS** P0 | no — but the lock order must be preserved |
| duplicate worker / outbox delivery | `CC-19`, `CC-20` | `SKIP LOCKED` claim; idempotency unique key | **PASS** P0 | no — reuse, do not rebuild |

APP8 introduces no new lock anchor, no `SERIALIZABLE` flow and no new idempotency
mechanism.

---

## 12. Historical DB7 / DB8 concurrency handoffs

`DB8_LOCK_ORDER_MATRIX.md` and the proven `CC-22` deadlock fixture fix the
`orders` → `sku_stocks` direction; APP8's reservation service takes the
order-scoped read first and the anchor second. Isolation is `READ COMMITTED` with
explicit row locks throughout (DEC-DB7-006) — DB7 never opts into `SERIALIZABLE`
and APP8 must not be the first to. `DB7_REPOSITORY_CONTRACTS.md` records the
`SkuStockRepository` surface APP8 consumes and the guards it carries (G-DB7-26,
28, 29, 30). Nothing in these handoffs is reopened; the one repair APP8 makes
(§8.2) *restores* a guarantee DB3 specified, rather than changing one.

---

## 13. Production physical / repository / runtime inventory

Five tables, all from `0027_create_production_tables.sql`: `production_jobs`,
`production_job_transitions`, `production_specifications`, `production_artifacts`,
`production_notes`. Shapes in audit §7.1. Two structural facts matter most:

- `uq_production_jobs__order_approval_snapshot UNIQUE(order_id, approval_snapshot_id)`
- `uq_production_specifications__job UNIQUE(production_job_id)`

**There is no `production_job_attempts` table**, and no attempt, claim, worker,
machine or operator-assignment column anywhere in the production schema.

Repository: `ProductionJobRepository` with `createJob`, `transition`,
`attachArtifact`, `appendNote` and four reads. `transition` takes the job row
lock before checking the LC-18 allow-list and appends a transition row with actor
and correlation id; `createJob` copies the specification from the named approval
snapshot inside the same transaction.

Runtime: **`ProductionModule` is not in `AppModule`**; its only importer is its
own integration spec.

```text
REPOSITORY_DELIVERED  yes
RUNTIME_COMPOSED      no
HTTP_EXPOSED          no
UI_CONSUMED           no
```

What the repository does **not** enforce, and therefore what APP8's application
services own: GRD-013 on job creation, GRD-015 and GRD-022 on start, the order
moves `DEPOSIT_PAID → IN_PRODUCTION` and `IN_PRODUCTION → PRODUCTION_COMPLETED`,
and the reservation consume at start.

---

## 14. Production creation authority

`TR-LC18-01`: created post-deposit against the exact Approval Snapshot, spec
frozen (INV-03), idempotent **per (order, approval)**.

```text
cardinality       one job per (order_id, approval_snapshot_id) — NOT per OrderItem
duplicate arbiter uq_production_jobs__order_approval_snapshot -> 23505
                  -> PRODUCTION_JOB_ALREADY_EXISTS  (DB8 CC-08)
frozen at create  document_hash, product_name, variant_label, side_name, area_name,
                  physical_width_mm, physical_height_mm, quantity_total
rework            a NEW job linked by reworked_from_job_id — never a restart
```

DB3 writes the actor as *system/admin*. That is a genuine either, but **not** a
product-behaviour fork: the guards, the frozen facts and the uniqueness arbiter
are identical whichever actor initiates it. So it is resolved as repository
convention, not escalated as a PO decision — **Admin-initiated**, because
`production_job_transitions.actor_kind` must name a real actor, the operator
decides what enters the shop floor, and BR-016 gives exactly one Admin. `SYSTEM`
stays reserved for the reservation worker, the one step DB3 marks unambiguously
system-owned.

---

## 15. Production specification and frozen-data authority

`production_specifications` is one row per job, written once inside `createJob`,
with no `updated_at` and no repository method that updates it (ADR-DB3-003 — the
spec is never mutated). Its columns cover every field `approval_snapshots` holds,
so both the Catalog and COP branches are fully describable and **no migration is
required**.

No missing frozen fact was found. Stated explicitly for later checkpoints: APP8
must never read live `products`, `product_variants`, `quotation_versions` or a
design session to fill a production input. A genuinely absent fact would be a
schema/authority question — never a licence to re-read mutable state.

---

## 16. Production artifact authority

Kinds are `DIGITIZED_FILE`, `MACHINE_FILE`, `PHOTO`, `OTHER`; storage is a
metadata row plus an `asset_id` into the existing object-storage abstraction;
`attachArtifact` has no caller; customer visibility is none (INV-21/22, "internal,
unwatermarked files"); and **nothing in the repository generates a stitch file** —
no DST/PES/EXP writer, no digitizing pipeline, no export.

```text
PRODUCTION_ARTIFACT_DISPOSITION = READ-ONLY / DEFERRED FOR APP8
```

APP8 invents no stitch-file generation, no customer export and no new
object-storage architecture. The operator's authoritative input is the frozen
specification plus the approved design already reachable through APP6. Artifact
attach and delivery are carried nonblocking, with the launch-requirement ruling
routed to `G01`.

---

## 17. Production state machine and APP8 terminal handoff

The per-transition table (from, to, trigger, actor, guard, transaction owner,
idempotency, audit effect) is in audit §12.1. Reconciled headline rules:

- `TR-LC14-03` (`DEPOSIT_PAID → IN_PRODUCTION`) and `TR-LC18-02`
  (`PLANNED → STARTED`) are **the same act**, in one transaction, under GRD-015
  and GRD-022, with the reservation consumed alongside (TR-LC17-05).
- `GRD-015` = exact approval snapshot ref + deposit SATISFIED + reservation
  `RESERVED` + order `DEPOSIT_PAID`.
- `TR-LC14-04` (`IN_PRODUCTION → PRODUCTION_COMPLETED`) follows job `COMPLETED`.
- The canonical order allow-list in
  `packages/persistence/src/order/order-transitions.ts` already permits every one
  of these moves. **APP8 adds no order status and changes no allow-list row.**

```text
APP8_TERMINAL_HANDOFF_STATE = order PRODUCTION_COMPLETED (TR-LC14-04),
                              with its production job COMPLETED
APP9_ENTRY_PRECONDITION     = TR-LC14-05 — Admin moves PRODUCTION_COMPLETED ->
                              AWAITING_FINAL_PAYMENT against the unsatisfied
                              REMAINING obligation created by APP7-W01
```

Remaining payment, shipping freeze, dispatch, delivery, refund and final
settlement are absent from the table by design.

---

## 18. Worker / queue / outbox disposition

**`IMP-O003` is CLOSED, not open.** `IMP-D029` (APP2, corrected by
`APP2-DEC-JOBS-C1`) resolved it: a PostgreSQL-backed claim queue on the existing
persistence, `outbox_events` as the durable signal appended in the domain
transaction, `FOR UPDATE SKIP LOCKED` claim on the partial `status='PENDING'`
index, lease as a visibility timeout on `next_attempt_at`, attempts in
`background_job_attempts`. No broker, no Redis, no second datastore.

```text
QUEUE_ASYNC_DISPOSITION = EXISTING POSTGRES OUTBOX CLAIM QUEUE. APP8 adds no
                          broker, no queue table and no runtime dependency.
```

APP8 has exactly **one** real asynchronous owner: the official reservation after
deposit verification. TR-LC17-04's actor is *system (deposit verified event)*,
TR-LC14-02's after-commit effect is the *"official reservation trigger
(LC-17)"*, and APP7 already emits `payment.verified`. That justifies one `Wxx`
checkpoint and no more. Stock reads and adjustments, job creation and every
transition are Admin-initiated and synchronous; reservation consume and release
happen inside the owning production transaction, because a goods issue is not a
separate asynchronous fact; and there is no expiry sweep because official
reservations are no-expiry.

**IMP-D054 applies.** `APP7-W01-C1` established that persistence reachable from
both the API and the worker lives in `@embroidery/persistence` rather than being
duplicated in the worker. The inventory and production repositories live under
`apps/api/src/modules/` today, and the reservation worker needs the inventory
one — so `APP8-B02` **promotes** them rather than copying them. This is the exact
correction `APP7-W01` received, applied in advance.

---

## 19. Existing and missing HTTP surfaces

Existing: two `EXISTING_BUT_NOT_APP8` Catalog SKU authoring operations, and the
two `EXISTING_AND_USABLE` Admin order reads the APP8 screens will link from. No
`EXISTING_STALE_UNUSED` operation was found.

Missing, derived from use cases rather than symmetry:

| Family | Ops | Checkpoint | Justified by |
|---|---:|---|---|
| Admin stock read + audited adjust | 3 | `B01` | Gap A — no reservation can succeed until a `sku_stocks` row exists |
| Admin production job create + queue + detail | 3 | `B03` | TR-LC18-01; the operator needs a work list and a job view |
| Admin production transitions | 2 | `B04` | TR-LC18-02/03 + TR-LC14-03/04 |

**8 operations across 3 backend checkpoints**, each in the normal 1–3 band, none
near the hard maximum of 5.

Reservation `reserve` is deliberately not an HTTP operation: TR-LC17-04's actor is
the system, and a manual reserve endpoint would create a second path to a rule the
worker already owns. Release is reached through job cancellation.

---

## 20. Admin UX disposition

No Admin inventory or production route exists. Three screens are needed:
inventory (availability, low-stock, audited adjustment, reservation visibility,
insufficient-stock intervention), production queue (the operator's work list), and
production job detail (frozen specification, backing reservation, transition
history, guarded start/complete/cancel). One screen per checkpoint: `A01`, `A02`,
`A03`.

The candidate plan's "priorities" on the queue is dropped — no priority column
exists and none is accepted.

---

## 21. Customer UX disposition

```text
CUSTOMER_UI_DISPOSITION = NO_CUSTOMER_UI_IN_APP8
```

`01-PRODUCT-REQUIREMENTS.md` line 250 lists *"Quản lý trạng thái sản xuất"* under
**Admin** operations, and no searched product, journey or business-rule document
requires a customer-visible production state. APP9's plan already owns "Customer
remaining-payment and completion status"; APP10 owns customer communication. A
Storefront surface here would either duplicate APP9's or publish internal
shop-floor state. If the Product Owner later wants one, the honest customer-safe
vocabulary is the **order** status — never job status, operator identity, notes,
artifacts or inventory quantities.

---

## 22. Figma / design gate

```text
APP8_DESIGN_BASELINE = NO_EXISTING_APP8_DESIGN   (0 rows, no APP_08 page target)
DESIGN_GATE          = DESIGN_REQUIRED_BEFORE_UI
```

One `D01` package covers all three Admin screens and all their states. It is
placed **after** `B04` and **before** `A01`, so the frames are drawn against known
contract facts and so it forms a genuine Product Owner approval gate immediately
before the UI that consumes it. **No Figma node was opened, created or mutated by
R00**, and the registry checker was not run because R00 changes no registry row.

---

## 23. Inventory schema / repository disposition

```text
INVENTORY_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED
```

Every APP8 inventory requirement is representable today: the anchor with its
non-negative CHECK, the append-only reasoned ledger with its actor split, and the
order-bound reservation with a nullable `expires_at`. No migration is proposed for
a speculative index, DTO convenience or UI convenience.

Repository: every method APP8 needs exists. Two need work — `ensureStockRow` needs
a caller (`B01`), and `releaseReservation` / `consumeReservation` need the
reservation row lock (`B02`). Both modules are promoted to
`@embroidery/persistence` in `B02` so the API and the worker share one
implementation; **no DB logic is duplicated between them**.

---

## 24. Production schema / repository disposition

```text
PRODUCTION_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED
```

The job, its transition log, its unique frozen specification, its artifacts and
its notes all exist with the right keys and CHECKs. Explicitly **no**
`production_job_attempts` migration: the attempt/claim model is not in the
accepted design, and rework is a new job via `reworked_from_job_id`. Adding a
table to satisfy a superseded candidate assumption is exactly the migration the
governance forbids.

---

## 25. Security / actor model

BR-016: one Admin account, no role hierarchy. The delivered pattern is reused
exactly — `@UseGuards(AuthenticatedAdminGuard)` on the controller, plus
`@UseGuards(StaffOriginGuard, StaffJsonBodyGuard)` on each mutation.

```text
APP8 ACTORS = ADMIN (every HTTP operation)
              SYSTEM (the reservation worker; systemJobKey on ledger and transition rows)
              CUSTOMER — none
```

No new auth architecture, permission scheme, customer grant scope or internal
token. `inventory_ledger_entries.actor_kind` and
`production_job_transitions.actor_kind` already carry the ADMIN/SYSTEM split, so
attribution needs no new column.

---

## 26. Failure semantics

Mapped to the existing `guardViolationError` / `notFoundError` conventions and the
standard envelope. Full table: audit §18. Most codes APP8 needs **already exist in
delivered code**: `RESERVATION_NOT_ELIGIBLE`, `INSUFFICIENT_STOCK`,
`QUANTITY_INVALID`, `RESERVATION_NOT_ACTIVE`, `INVALID_TRANSITION`,
`CANCELLATION_REASON_REQUIRED`, the missing-stock-record not-found, the `23505`
duplicate-job path and the `40P01` → `RETRYABLE_TRANSACTION_FAILURE` mapping.

APP8 adds exactly two names, and only because the accepted guard catalog already
uses them: `PRODUCTION_BLOCKED` (GRD-015) and `ORDER_ON_HOLD` (GRD-022). No HTTP
status code and no public error vocabulary is invented.

---

## 27. Imported follow-ups

| Follow-up | Classification |
|---|---|
| `FU-APP7-S01-EXACT-MONEY-PROMOTION-01` | `NOT_RELEVANT_TO_APP8` |
| `FU-APP7-S01-SHARED-DIALOG-01` | `NOT_RELEVANT_TO_APP8` |
| `FU-ADMIN-SHARED-DIALOG-01` | `CARRY_NONBLOCKING` |
| `FU-APP7-S01-SCSS-GATE-01` | `CARRY_NONBLOCKING` |
| `FU-APP7-B01-01` | `NOT_RELEVANT_TO_APP8` |
| `FU-APP6-B04-REPORT-SECRET-HEURISTIC-01` | `CARRY_NONBLOCKING` |
| `IMP-O007` (payment provider) | `NOT_RELEVANT_TO_APP8` — stays open |
| APP7 S01 design/backend reconciliation (4 items) | `NOT_RELEVANT_TO_APP8` |
| `IMP-O003` | `CLOSED_ALREADY` — resolved by IMP-D029 |
| `DEC-14` (reservation TTL) | `CARRY_NONBLOCKING` — unblocked for APP8 by the accepted no-expiry branch |

The two Storefront items are not relevant because APP8 ships no Storefront
surface. `FU-ADMIN-SHARED-DIALOG-01` is carried with a note: APP8's Admin
transitions need confirm dialogs, so if a third hand-rolled scrim would be
written, extracting the shared primitive belongs **inside that checkpoint's own
scope** — not as separate debt work. APP8 spends no time on unrelated debt.

---

## 28. True PO decisions

```text
TRUE_PO_DECISIONS = PO-APP8-001
```

**`PO-APP8-001` — does a COP-only order require an inventory reservation to enter
production?**

GRD-015 requires *"reservation RESERVED"* to start production. A COP order item
has `sku_id IS NULL` and therefore **cannot** have a reservation, because
`inventory_reservations.sku_stock_id` is `NOT NULL`. BR-015 says nothing about
customer-owned products, and no searched authority — business rules, lifecycle,
guard catalog, invariant enforcement plan, ADR-DB3-002/003 — qualifies the clause
for the COP branch. Meanwhile APP5, APP6 and APP7 all delivered the COP branch end
to end (`APP7-E01-02`: `COP_ORDER_CREATION = PASS`).

| Option | Behaviour |
|---|---|
| **A (recommended)** | the reservation clause binds **per reservable order item** — Catalog items need an active reservation, COP items need none; a mixed order needs reservations for its Catalog items only |
| B | read literally — every order needs at least one `RESERVED` reservation, so a COP-only order can never enter production |

Option B makes a delivered first-class product branch permanently unusable and
contradicts the MVP's core custom-embroidery journey. Option A is recommended, but
the choice changes customer-visible behaviour, so it is the Product Owner's.

```text
ROUTED TO = APP8-G01
BLOCKING  = blocks B04 and E01 case 7; does not block G01's own delivery,
            B01, B02, W01 or B03
```

Per the R00 directive, the audit did **not** stop when this was found: every
independent section was completed first.

---

## 29. Canonical APP8 roadmap

```text
CANONICAL_CHECKPOINT_COUNT = 13
ROADMAP = R00 -> G01 -> B01 -> B02 -> W01 -> B03 -> B04 -> D01 -> A01 -> A02 -> A03 -> E01 -> X01
NEXT_CHECKPOINT = APP8-G01
```

| Order | Checkpoint | Purpose | Depends on | Ops | Schema | Worker | Design |
|---:|---|---|---|---:|---|---|---|
| 1 | `R00` | phase entry audit | APP7 closed | 0 | no | no | no |
| 2 | `G01` | authority lock incl. `PO-APP8-001` | R00 | 0 | no | no | no |
| 3 | `B01` | compose inventory; Admin stock read + audited adjustment (Gap A) | G01 | 3 | no | no | no |
| 4 | `B02` | shared-persistence promotion + reservation row lock (Gap B) | B01 | 0 | no | no | no |
| 5 | `W01` | `payment.verified` → official reservation | B02 | 0 | no | yes | no |
| 6 | `B03` | production job creation + queue and detail reads | W01 | 3 | no | no | no |
| 7 | `B04` | production transitions + order moves + reservation consume/release | B03 | 2 | no | no | no |
| 8 | `D01` | one APP8 Admin design package | B04 | 0 | no | no | yes |
| 9 | `A01` | Admin inventory screen | D01 | 0 | no | no | consumes |
| 10 | `A02` | Admin production queue | D01 | 0 | no | no | consumes |
| 11 | `A03` | Admin production job detail + transitions | A02 | 0 | no | no | consumes |
| 12 | `E01` | focused cross-layer acceptance | A03 | 0 | no | no | no |
| 13 | `X01` | closure and APP9 handoff | E01 | 0 | no | no | no |

Ordering follows the required principle: blocking authority decision → repository
foundation → core domain and concurrency → asynchronous owner → HTTP contracts →
design needed by UI → UI → focused acceptance → closure. Design precedes only the
UI that consumes it.

Every checkpoint passes the roadmap quality test — a Product Owner would
meaningfully review each boundary: `G01` locks a customer-visible behaviour;
`B01` makes stock exist at all; `B02` changes a concurrency guarantee; `W01` adds
the phase's only asynchronous owner; `B03` and `B04` separate creation from state
change; `D01` is an approval gate by definition; `A01`–`A03` are one screen each.
No ceremonial checkpoint is present, and no id was invented for numbering
symmetry.

Status table with exactly one `Next`:
[`APP8-INVENTORY-AND-PRODUCTION.md`](../phases/APP8-INVENTORY-AND-PRODUCTION.md) §12.

---

## 30. Future E01 target

Defined, **not executed**. Fourteen targeted cases covering: exact Catalog
reservation; no reservation or job without deposit eligibility; competing orders
never oversubscribing; duplicate HTTP/worker/outbox delivery converging; the
frozen `sku_id` branch; COP fabricating no SKU identity; the COP production path
`G01` locks; job cardinality and specification fidelity; transition legality and
mandatory cancellation reason; retry after committed success; audit and outbox
effects only on committed state; the exact `PRODUCTION_COMPLETED` terminal;
APP9 execution remaining zero; and truthful Admin insufficient-stock, on-hold and
stale-transition states.

Full list: audit §22 and phase document §14. `E01` reuses accepted lower-level
evidence and is not a full-suite marathon.

---

## 31. Validation command ledger

R00 is a documentation/audit checkpoint. No implementation input changed, so no
implementation validation was justified (`VALIDATION_GOVERNANCE.md` §2 and §3).

| Command / check | Exact changed question / input | Result | Reruns | Why sufficient |
|---|---|---|---:|---|
| `git rev-parse` / `git status --porcelain` / `git log --oneline -15` | preflight state | `production` @ `3555896`, clean tree, APP7 closure reachable | 0 | direct read of the fact asked for |
| `node -e` count over `packages/contracts/openapi/openapi.generated.json` | OpenAPI baseline and APP8 operation count | 85 / 92 / 191; 0 APP8 operations | 0 | counting the committed artifact answers it; regeneration would change the artifact, not measure it |
| `ls packages/database/migrations/*.sql \| wc -l`; `grep TOTAL_TABLES/LAUNCH_TABLES tools/db-manifest-check.mjs` | DB baseline | 37 migrations; 79 / 78 tables | 0 | the manifest constants are the repository's own count; applying a migration would prove nothing more |
| `grep 'CREATE TABLE'` over `packages/database/migrations/` + `awk` DDL extraction for 9 tables | inventory/production physical shapes | 9 tables, full DDL read | 0 | the migration file is the authority for physical shape |
| `grep -rli` inventory/production symbols over `packages apps tools` | where the domain exists in code | two API modules + shared schema | 0 | locates every consumer in one pass |
| `cat` of the inventory port, anchor, eligibility guard, reservations adapter | reservation semantics and the CC-21 arbiter | Gap B identified at `inventory-reservations.ts:255,266` | 0 | source inspection classified it; no diagnostic run needed |
| `cat` of the production module, port and repository | production cardinality, legality, spec freeze | LC-18 table, job row lock, spec copied from approval | 0 | same |
| `cat apps/api/src/bootstrap/app.module.ts` | is either module composed? | neither is imported | 0 | the composition root is the only place that could answer it |
| `grep -rn "InventoryModule\|ProductionModule"` | who imports them | 3 specs + 2 benchmarks only | 0 | confirms the negative from the other direction |
| `grep` over `DB8_RACE_COVERAGE_MATRIX.md`, `DB3_*`, `ADR-DB1-018` | race arbiters, lifecycle, guards, expiry | CC mapping resolved; CC-21 release-vs-consume uncovered | 0 | accepted authority read directly |
| `grep -rn "IMP-O003"` in the decision register | is the queue decision still open? | closed by IMP-D029 | 0 | the register is the authority; assuming it open would have been the error |
| `grep -ci "APP8\|APP_08"` over `FIGMA_DESIGN_INDEX.md` | Figma baseline | 0 rows, no `APP_08` page target | 0 | registry read; the live checker is not justified — R00 changes no row |
| `find` over `apps/admin/src/app` and `apps/storefront/src/app` | existing IA | no inventory or production route | 0 | route files are the IA |
| `grep` for `ensureStockRow`, `createSoftHold`, `convertHold` callers | do producers exist? | none outside tests | 0 | a repository-wide grep is a complete answer for a negative |
| `git diff --check` | whitespace in the R00 documents | clean | 0 | — |
| Markdown formatting (Prettier) | — | **not applicable** — `.prettierignore` excludes `docs/` as a locked baseline, so the global Prettier control does not format documentation and none was applied | 0 | declared not-applicable rather than run |
| `node tools/check-report-secrets.mjs` | secret heuristic over reports | 0 findings in the APP8 documents; 1 pre-existing finding in `APP6-B04-COMPLETION-REPORT.md`:93 (`FU-APP6-B04-REPORT-SECRET-HEURISTIC-01`, untouched) | 0 | the tool takes no path argument; the pre-existing APP6 line is carried, not absorbed |

**Deliberately not run**, because no input to any of them changed:

```text
full Jest                 full Playwright             the inventory race suite
the production suite      any API/DB/worker suite     Admin/Storefront suites
OpenAPI generation        API client generation       migration application
Docker startup            SonarQube                   repo-wide build/typecheck
the live Figma checker    node tools/check-file-size.mjs
```

No passing command was repeated on unchanged input.

---

## 32. Changed files

| File | Change |
|---|---|
| `docs/implementation/audits/APP8_PHASE_ENTRY_AUDIT.md` | new — the full phase entry audit |
| `docs/implementation/reports/APP8-R00-COMPLETION-REPORT.md` | new — this report |
| `docs/implementation/phases/APP8-INVENTORY-AND-PRODUCTION.md` | §1–§9 preserved as planning history under a superseded header; §10–§15 appended (repository truth, corrected scope, PO decision, canonical checkpoints, status table with one `Next`, one-correction rule, change-impact test policy, file-size policy, canonical exit gate, handoff) |
| `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | APP8 status advanced to `IN PROGRESS — R00 COMPLETE`, with the canonical roadmap and `NEXT_CHECKPOINT` |

Documentation only:

```text
runtime source changed      = 0 files
schema / migrations changed = 0 files
generated artifacts changed = 0 files
Figma nodes changed         = 0
dependencies / lockfile     = 0
tooling changed             = 0 files
```

No unrelated historical completion report was edited. No decision or follow-up
register entry needed a change: `IMP-O003` is already recorded closed by
`IMP-D029`, `IMP-O007` already carries its deferral, and `PO-APP8-001` belongs to
`APP8-G01` to lock rather than to R00 to register.

---

## 33. Commit evidence

```text
branch  = production
HEAD at entry = 3555896
pushed  = false
amended = none
```

One local documentation commit:

```text
docs(app8): audit inventory and production phase entry (APP8-R00)
```

Hash recorded in §33.1 below.

```text
NOT_PUSHED = true
```

### 33.1 Commit hash

`APP8-R00` commit: **`<recorded below>`**

---

## 34. Stop

`APP8-R00` is complete. No APP8 implementation checkpoint was started — no `G01`,
`B01`, `B02`, `W01`, `B03`, `B04`, `D01`, `A01`, `A02`, `A03`, `E01` or `X01`
work was begun, no runtime source was written, and no schema was touched.

```text
NEXT_CHECKPOINT = APP8-G01
```

**STOP.**
