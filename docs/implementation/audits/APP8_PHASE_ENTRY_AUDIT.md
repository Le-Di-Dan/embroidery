# APP8 — Phase Entry Audit

- Phase: `APP8 — Inventory Reservation and Production Operations`
- Checkpoint: `APP8-R00`
- Mode: `PHASE ENTRY AUDIT / REPOSITORY-TRUTH RECONCILIATION`
- Branch / HEAD at entry: `production` @ `3555896`
- Date: 2026-08-24

Every fact below is a **read** of the committed repository. No migration was
applied, no OpenAPI artifact regenerated, no client regenerated, no Figma node
opened or mutated, no test suite executed, no runtime source changed.

---

## 1. The one-sentence finding

APP8 is **not** a greenfield phase: DB7 already delivered the complete inventory
and production **persistence layer** — ports, Drizzle adapters, the `sku_stocks`
lock anchor, the LC-18 legality table, the frozen specification copy and the
GRD-013 deposit gate — and DB8 proved three of its races at P0; but **none of it
is composed into the running API**, nothing produces a `sku_stocks` row, and one
race arbiter that DB3 requires is physically absent from the delivered code.
APP8's work is therefore *composition, application services, HTTP, Admin UI and
one concurrency repair* — not building an inventory system.

---

## 2. APP7 handoff verification

| Handoff claim | Read from repository | Verdict |
|---|---|---|
| `APP7-X01 = COMPLETE` | `docs/implementation/reports/APP7-X01-COMPLETION-REPORT.md` §1 | confirmed |
| `APP7 = PASS_WITH_FOLLOW_UPS`, `BLOCKING_FOLLOW_UPS = 0` | same, §1 and §13 | confirmed |
| `APP7_PHASE = CLOSED` | `APP7-DEPOSIT-PAYMENT-AND-ORDER-CREATION.md`; `10-MASTER-APPLICATION-ROADMAP.md` line 85 | confirmed |
| `NEXT_PHASE = APP8` | master roadmap line 36 (`→ APP8`) and line 19 | confirmed |
| OpenAPI `85 / 92 / 191` | counted from `packages/contracts/openapi/openapi.generated.json` | confirmed |
| DB `37 migrations / 79 tables` | `ls packages/database/migrations/*.sql` = 37; `tools/db-manifest-check.mjs` `TOTAL_TABLES = 79`, `LAUNCH_TABLES = 78` | confirmed |
| APP7 inventory writes = 0 | no runtime caller of any inventory repository method exists (§5.3) | confirmed |
| APP7 production writes = 0 | no runtime caller of any production repository method exists (§7.3) | confirmed |
| `APP9 execution = NONE` | no shipping / remaining-payment / refund runtime beyond DB7 persistence | confirmed |

`HEAD` is `3555896`, two documentation-only commits after the `APP7-X01` closure
commit `d93d3f7` (`d93d3f7` closed the phase, `3555896` recorded its own hash —
a commit cannot contain its own hash). **No delta to explain**: neither commit
touched runtime, schema, generated artifacts or the Figma registry.

---

## 3. Read-only baseline at APP8 entry

```text
OPENAPI_BASELINE              = 85 paths / 92 operations / 191 schemas
DB_BASELINE                   = 37 migrations / 79 tables (78 launch)
APP8_HTTP_OPERATIONS_AT_ENTRY = 0
APP8_RUNTIME_WRITES_AT_ENTRY  = 0
APP8_FIGMA_BASELINE           = 0 rows
```

### 3.1 APP8 HTTP operations at entry = 0

Every operation in the committed artifact was scanned for
`invent|production|reserv|stock|sku`. Two matched, and both are APP7-owned
Catalog SKU **authoring**, not inventory:

```text
POST  /api/admin/products/{productId}/variants/{variantId}/skus  adminSku_create
PATCH /api/admin/skus/{skuId}                                    adminSku_update
```

No availability read, no reservation operation, no production operation, no
production queue, no artifact read. **`APP8_HTTP_OPERATIONS_AT_ENTRY = 0`.**

### 3.2 APP8 Figma baseline = 0

`grep -ci "APP8|APP_08"` over `docs/design/FIGMA_DESIGN_INDEX.md` returns **0**.
The page-target registry runs `APP_01` (`371:3`) … `APP_07` (`726:3`); there is
**no `APP_08` page target**. The matches for the word *production* in the
registry are the BRD0 logo "productionization" rows and the `NON-PRODUCTION`
synthetic-data labels on the APP7 package — neither is an APP8 design row.

```text
APP8_DESIGN_BASELINE = NO_EXISTING_APP8_DESIGN
DESIGN_GATE          = DESIGN_REQUIRED_BEFORE_UI
```

---

## 4. `DepositEligibilityPort` — the single APP7 authority

| Fact | Value |
|---|---|
| Token | `DEPOSIT_ELIGIBILITY_PORT` |
| Interface | `DepositEligibilityPort` |
| Declared in | `apps/api/src/modules/payment/domain/repositories/deposit-eligibility.port.ts` |
| Method | `isDepositSatisfied(orderId): Promise<boolean>` |
| Adapter | `DrizzleDepositEligibilityAdapter` |
| Provided by | `PaymentPersistenceModule` (`@embroidery/persistence`) |
| Semantics | DEPOSIT obligation `SATISFIED` → `true`; otherwise `false` |
| Transaction | read in the caller's transaction — the guard's in-tx read is the CC-17 arbiter |

**Its APP8 consumer already exists.**
`apps/api/src/modules/inventory/infrastructure/persistence/reservation-eligibility.guard.ts`
injects the port and throws `RESERVATION_NOT_ELIGIBLE` when the deposit is not
satisfied. `InventoryModule` imports `PaymentModule` **for this token only**.

Where the gate is applied today:

| Operation | Gate applied? | Evidence |
|---|---|---|
| `createReservation` | **yes** | `inventory-reservations.ts` — `assertEligible(orderId, 'createReservation')` before the anchor lock |
| `convertHold` | **yes** | same file, same gate |
| `createJob` (production) | **no** | `drizzle-production-job.repository.ts` checks that the approval exists, not the deposit |
| `transition` (production) | **no** | legality only |

**Consequence for APP8.** APP8 must **not** re-implement deposit eligibility.
The reservation path is already gated. The production path is not — and per
GRD-015 it must be, at the **application-service** layer, by calling the same
port. No SQL restatement of the rule, no second port, no duplicated predicate.

---

## 5. Inventory — physical, repository and runtime

### 5.1 Physical (delivered by the DB era)

Four tables, all present:

| Table | Migration | Key shape |
|---|---|---|
| `sku_stocks` | `0008_create_inventory_core_tables.sql` | PK `id`; **`uq_sku_stocks__sku UNIQUE(sku_id)`**; `quantity_on_hand integer NOT NULL`; `low_stock_threshold integer NULL`; **`CHECK quantity_on_hand >= 0`** |
| `inventory_ledger_entries` | `0008` | `bigint` identity PK, **append-only**; `entry_kind` CHECK over 9 kinds; `CHECK quantity > 0`; `CHECK entry_kind <> 'ADJUSTMENT' OR reason IS NOT NULL`; `actor_kind` + `admin_id` / `system_job_key` |
| `inventory_soft_holds` | `0014` | bound to **`custom_request_id`**, not an order; status CHECK `HELD/CONVERTED/RELEASED/EXPIRED`; **`expires_at NOT NULL`**; `converted_reservation_id` |
| `inventory_reservations` | `0023` | bound to **`order_id`** + `sku_stock_id`; status CHECK `RESERVED/CONSUMED/RELEASED/EXPIRED`; **`expires_at NULLABLE`**; `released_reason` required when `RELEASED`; `terminalized_at` |

Quantity representation is **`integer`, whole units per SKU**. There is no
fractional unit, no unit-of-measure column, and no second quantity dimension.

**Negative-stock authority.** `ck_sku_stocks__quantity_non_negative` is a
database CHECK — INV-18 is physically enforced, not merely guarded. An audited
`ADJUSTMENT` (with a mandatory reason) is the only path that changes on-hand
other than consumption.

### 5.2 Repository — delivered

`apps/api/src/modules/inventory/`

```text
domain/repositories/sku-stock.repository.ts                   SKU_STOCK_REPOSITORY + SkuStockRepository
infrastructure/persistence/stock-anchor.ts                    lock anchor + availability arithmetic
infrastructure/persistence/reservation-eligibility.guard.ts   GRD-013 gate
infrastructure/persistence/inventory-commitments.ts           soft holds + adjustments
infrastructure/persistence/inventory-reservations.ts          reservations
infrastructure/persistence/drizzle-sku-stock.repository.ts    facade
inventory.module.ts                                           CTX-INV composition
tests/integration/                                            persistence · reservations · races
```

The port carries every operation APP8 needs: `ensureStockRow`, `loadForUpdate`,
`availability`, `adjust`, `createSoftHold`, `releaseSoftHold`, `convertHold`,
`createReservation`, `releaseReservation`, `consumeReservation`, `findBySku`,
`findHold`, `findReservation`, `listLedger`.

`available = quantity_on_hand − Σ HELD − Σ RESERVED`, computed **in-transaction
under the anchor lock**, never stored (DB4 §Inventory balance; the ledger is the
rebuild source, INV-14).

### 5.3 Runtime — **not composed**

`apps/api/src/bootstrap/app.module.ts` imports 40 modules. **`InventoryModule`
is not one of them.** The only importers of `InventoryModule` in the repository
are three integration specs and two DB9 benchmarks.

```text
INVENTORY_RUNTIME_BASELINE = PHYSICAL + REPOSITORY_DELIVERED — NOT RUNTIME_COMPOSED
```

| Layer | Status |
|---|---|
| `PHYSICAL_ONLY` | — (exceeded) |
| `REPOSITORY_DELIVERED` | **yes** — port + adapters + integration tests |
| `RUNTIME_COMPOSED` | **no** — absent from `AppModule` and from the worker |
| `HTTP_EXPOSED` | **no** — 0 operations |
| `UI_CONSUMED` | **no** — no Admin or Storefront surface |

### 5.4 Two real gaps inside the delivered layer

**Gap A — nothing creates a `sku_stocks` row.**
`ensureStockRow` has **zero non-test callers**. APP7-B01 delivered Admin SKU
authoring (`product-sku.service.ts`, `drizzle-product-sku.repository.ts`) and
neither file references `sku_stocks` or `stock` at all. `StockAnchor.requireLocked`
throws `notFoundError('That SKU has no stock record.')` when the row is absent,
so **every reservation attempt against a SKU authored today fails** — not for a
stock reason, but because the stock record does not exist. APP8 must own
stock-row creation and adjustment before any reservation path can succeed. This
is an application/HTTP gap, **not** a schema gap.

**Gap B — the DB3 CC-21 arbiter is absent from `release` / `consume`.**
`DB3_CONCURRENCY_SPECIFICATION.md` CC-21 (release vs consume) names the arbiter
as *"reservation row LOCK + idempotent transitions"*, and
`DB5_LOCKING_ACCESS_PATHS.md` repeats *"CC-21 release vs consume | reservation
row | LOCK"*. The delivered code does not take that lock:

```text
inventory-reservations.ts:266  requireReservedReservation(id, operation)
                          270    -> findReservation(id)
inventory-reservations.ts:255  findReservation(id)
                          257    -> this.db.select()...limit(1)   // no tx, no .for('update')
```

`releaseReservation` takes **no** lock at all. `consumeReservation` locks
`sku_stocks` — but only **after** the unlocked status read. Two concurrent
callers therefore both observe `status = 'RESERVED'`, both proceed, and the
result is one `RESERVATION_RELEASED` ledger row **and** one `CONSUMED` ledger row
plus an on-hand decrement for a reservation that was also released — precisely
the double-count CC-21 exists to prevent.

This race is **not** covered by DB8: `DB8_RACE_COVERAGE_MATRIX.md` renumbers, and
its `CC-16` (`DB7 note: CC-21`) is the *hold → reservation conversion* race, not
release-vs-consume. No DB8 row exercises `releaseReservation` against
`consumeReservation`.

Classification: **real defect in delivered DB7 code, inside APP8's change
impact** — release and consume are APP8-owned operations and APP8 is their first
consumer. Routed to `APP8-B02`. **Not fixed in R00.**

### 5.5 Soft holds have no producer

`createSoftHold` and `convertHold` have **no non-test caller**. Soft holds bind
to `custom_request_id` — the quotation stage, which APP6 closed without creating
one. APP8's official reservation therefore uses **`createReservation`**, not
`convertHold`. APP8 must not invent a soft-hold producer: BR-015 makes the hold
optional and no accepted authority asks APP8 to place one.

### 5.6 Reservation semantics — as accepted

| Question | Accepted answer | Source |
|---|---|---|
| What is reservable? | A **SKU**, through its `sku_stocks` row | `inventory_reservations.sku_stock_id NOT NULL` |
| What quantity? | Whole units, `integer` | `sku_stocks.quantity_on_hand`, `inventory_reservations.quantity` |
| Available from? | `on_hand − Σ HELD − Σ RESERVED`, computed under the anchor lock | `StockAnchor.availability`, DB4 §Inventory balance |
| What creates an official reservation? | TR-LC17-04, actor **system (deposit verified event)**, guards GRD-013 + GRD-014 | `DB3_LIFECYCLE_SPECIFICATIONS.md` |
| What releases it? | TR-LC17-06 — admin R / cancellation saga, GRD-020, reason mandatory | same |
| What consumes it? | TR-LC17-05 — **system, at production start / completion per goods issue** | same |
| Can it expire? | TR-LC17-07 — sweep, *"explicit `expires_at` (if policy set; **official reservations may be no-expiry per config**)"* | same |
| One item ↔ many reservations? | The physical key is `(order_id, sku_stock_id)`; the reservation is **per order per SKU**, not per OrderItem | `inventory_reservations` |
| Negative stock? | DB CHECK `quantity_on_hand >= 0` + anchor lock | `0008` migration, INV-18 |
| Audited override? | `ADJUSTMENT` with mandatory `reason` + `actor_kind` ledger row | `ck_inventory_ledger_entries__adjustment_has_reason` |

**Reservation expiry (DEC-14) does not block APP8.** `DB0_OPEN_DECISIONS.md`
records DEC-14 as *AwDP* — architecture accepted (ADR-DB1-018), **TTL values
deferred**. But `inventory_reservations.expires_at` is **nullable** and
TR-LC17-07 explicitly permits *"official reservations may be no-expiry per
config"*. An official reservation exists only *after* a verified deposit, so it
has no business reason to lapse. APP8 therefore creates official reservations
with **no expiry** and implements **no sweep** — which invents nothing and
leaves DEC-14 exactly where DB1 left it. Recorded as an explicit `G01` lock, not
a silent default.

### 5.7 Catalog / COP branches

`order_items` carries `ck_order_items__exactly_one_subject`:

```text
(sku_id IS NOT NULL AND customer_owned_product_id IS NULL)
OR (sku_id IS NULL AND customer_owned_product_id IS NOT NULL)
```

```text
CATALOG_INVENTORY_BRANCH = order_item.sku_id -> sku_stocks(sku_id) -> official reservation
                           for the item's frozen quantity, under the anchor lock
COP_INVENTORY_BRANCH     = NO_RESERVATION. A customer-owned product has no SKU and no
                           sku_stocks row; the shop holds no sellable stock for it.
                           No SKU identity is fabricated for a COP item.
```

This is a physical impossibility, not a policy choice:
`inventory_reservations.sku_stock_id` is `NOT NULL`, and a COP item has no
`sku_id` to resolve one from.

**The consequence is a genuine authority gap** — see §11.

---

## 6. Inventory concurrency — arbiters, named exactly

DB8 renumbers CC ids; its "DB7 note" column preserves DB3's label.

| Race (DB3 id) | DB8 row | Canonical arbiter | Lock / order / predicate | Retry / idempotency | Live proof | APP8 proof still required? |
|---|---|---|---|---|---|---|
| CC-20 last-unit reservation (two orders, same SKU) | DB8 `CC-15` | **`sku_stocks` row lock (GRD-014)** | `SELECT … FOR UPDATE` on `sku_stocks`; availability recomputed post-lock | loser gets `INSUFFICIENT_STOCK`, no retry | **PASS** (P0) — `inventory-races.integration.spec.ts` CC-15, CC-15b | **no** for the repository invariant; **yes** for the APP8 *consumer* path (two deposit-verified orders through the real service) |
| CC-21 hold → reservation conversion | DB8 `CC-16` | partial unique active-hold index + anchor `FOR UPDATE` | one converts, one rejected | none | **PASS** (P0) | no — APP8 uses `createReservation`, not `convertHold` |
| CC-22 official-reservation eligibility vs deposit change | DB8 `CC-17` | `ReservationEligibilityGuard` **in-tx read** of DEPOSIT satisfaction | commits only if still SATISFIED at lock time | none | **PASS** (P1) | no |
| CC-21 **release vs consume** | **no DB8 row** | *specified* as reservation-row LOCK + idempotent transitions | **absent in delivered code** (§5.4 Gap B) | — | **none** | **YES — blocking for `APP8-B02`** |
| CC-12 production start vs hold / cancel | DB8 `CC-08` covers *job creation* only | `uq_production_jobs__order_approval_snapshot`; order-row lock for GRD-015/022 | `23505` → `PRODUCTION_JOB_ALREADY_EXISTS`; order row `FOR UPDATE` | job uniqueness is the arbiter | creation: **DEFERRED TO DB9** (same unique-arbiter shape proven at P0 by CC-07); start-vs-hold: **none** | **YES** — a targeted start-vs-hold case in `APP8-E01` |
| deadlock `sku_stocks` ↔ `orders` | DB8 `CC-22` | opposite-order `FOR UPDATE`; PostgreSQL `40P01` | mapper → `RETRYABLE_TRANSACTION_FAILURE`, bounded retry | retry must not duplicate order/outbox rows | **PASS** (P0) | no — but APP8 **must preserve the proven lock order** |
| duplicate worker / outbox delivery | DB8 `CC-19` (`SKIP LOCKED` claim), DB8 `CC-20` (idempotency claim) | claim + `uq_idempotency_records__namespace_scope_key` | `23505` → replay | this *is* the idempotency arbiter | **PASS** (P0) | no — reuse, do not rebuild |

**Lock order is inherited, not redesigned.** `DB8_LOCK_ORDER_MATRIX.md` and the
proven `CC-22` deadlock fixture fix the `orders` → `sku_stocks` direction. APP8's
reservation service takes the order-scoped read first and the anchor second, in
that order, and introduces no new lock anchor.

Isolation everywhere is `READ COMMITTED` with explicit row locks (DEC-DB7-006).
No flow opts into `SERIALIZABLE`; APP8 must not be the first.

---

## 7. Production — physical, repository and runtime

### 7.1 Physical (migration `0027_create_production_tables.sql`)

| Table | Key shape |
|---|---|
| `production_jobs` | `order_id` + `approval_snapshot_id`, **`uq_production_jobs__order_approval_snapshot UNIQUE(order_id, approval_snapshot_id)`**; status CHECK **`PLANNED / STARTED / COMPLETED / CANCELLED`**; `reworked_from_job_id`; `cancelled_reason` required when `CANCELLED`; `started_at` / `completed_at` / `cancelled_at` |
| `production_job_transitions` | `bigint` identity, append-only; `from_status` / `to_status` CHECKs; `actor_kind` + `admin_id` / `system_job_key`; **`correlation_id NOT NULL`**; reason required for `CANCELLED` |
| `production_specifications` | **`uq_production_specifications__job UNIQUE(production_job_id)`** — exactly one spec per job; `document_hash` CHECK `^sha256:[0-9a-f]{64}$`; `product_name`, `variant_label`, `side_name`, `area_name`, `physical_width_mm`, `physical_height_mm`, `quantity_total`, `production_parameters` |
| `production_artifacts` | `uq_production_artifacts__job_asset UNIQUE(production_job_id, asset_id)`; kind CHECK **`DIGITIZED_FILE / MACHINE_FILE / PHOTO / OTHER`**; `note` |
| `production_notes` | `bigint` identity, append-only; `production_job_id`, `note`, `admin_id` |

**There is no `production_job_attempts` table, and no attempt, claim, worker,
machine or operator-assignment column anywhere in the production schema.**

### 7.2 Repository — delivered

`apps/api/src/modules/production/`

`ProductionJobRepository`: `createJob`, `transition`, `attachArtifact`,
`appendNote`, `findById`, `findByOrderAndApproval`, `loadSpecification`,
`listArtifactAssetIds`.

Two properties worth stating exactly, because APP8 must not re-implement them:

- **`transition` locks the job row.** `SELECT … FROM production_jobs … FOR UPDATE`
  precedes the legality check, and the legality table is the LC-18 allow-list:
  `PLANNED → [STARTED, CANCELLED]`, `STARTED → [COMPLETED, CANCELLED]`,
  `COMPLETED → []`, `CANCELLED → []`. A cancellation without a reason is refused
  (`CANCELLATION_REASON_REQUIRED`). Each move appends a
  `production_job_transitions` row with the actor and correlation id.
- **`createJob` freezes the specification from the approval snapshot, in the same
  transaction.** It loads `approval_snapshots` by the id the job names and copies
  `document_hash`, `product_name`, `variant_label`, `side_name`, `area_name`,
  `physical_width_mm`, `physical_height_mm`, `quantity_total`. Nothing is read
  live from Catalog, Product, quotation or a design session (INV-03 / G-DB7-07).

### 7.3 Runtime — **not composed**

`ProductionModule` is absent from `AppModule`; its only importer is its own
integration spec.

```text
PRODUCTION_RUNTIME_BASELINE = PHYSICAL + REPOSITORY_DELIVERED — NOT RUNTIME_COMPOSED
```

| Layer | Status |
|---|---|
| `REPOSITORY_DELIVERED` | **yes** |
| `RUNTIME_COMPOSED` | **no** |
| `HTTP_EXPOSED` | **no** — 0 operations |
| `UI_CONSUMED` | **no** |

### 7.4 What the repository does *not* enforce — APP8's application work

| Rule | Enforced in repository? | Owner |
|---|---|---|
| GRD-013 deposit gate on job creation | **no** | APP8 application service, via `DepositEligibilityPort` |
| GRD-015 production-start gate (approval + deposit + reservation `RESERVED` + order `DEPOSIT_PAID`) | **no** | APP8 application service |
| GRD-022 order not `ON_HOLD` / `CANCELLING` | **no** | APP8 application service, under the order row lock |
| Order `DEPOSIT_PAID → IN_PRODUCTION` alongside job `STARTED` | **no** | APP8 application service (`OrderRepository.transition`) |
| Order `IN_PRODUCTION → PRODUCTION_COMPLETED` on job `COMPLETED` | **no** | APP8 application service |
| Reservation `CONSUMED` at production start | **no** | APP8 application service |

---

## 8. Production creation authority

`TR-LC18-01` (`DB3_LIFECYCLE_SPECIFICATIONS.md`):

```text
(create) -> PLANNED
actor      system/admin post-deposit
guards     GRD-013 satisfied context; spec frozen from exact Approval Snapshot (INV-03)
effect     job + immutable spec
idem       per (order, approval)
```

```text
PRODUCTION_CREATION_AUTHORITY = TR-LC18-01 — created post-deposit against the exact
                                Approval Snapshot; specification frozen in the same tx
CARDINALITY                   = one job per (order_id, approval_snapshot_id)
                                — NOT per OrderItem
DUPLICATE ARBITER             = uq_production_jobs__order_approval_snapshot -> 23505
                                -> PRODUCTION_JOB_ALREADY_EXISTS  (DB8 CC-08)
FROZEN AT CREATION            = document_hash, product_name, variant_label, side_name,
                                area_name, physical_width_mm, physical_height_mm,
                                quantity_total  (copied from approval_snapshots)
REWORK                        = a NEW job linked by reworked_from_job_id — never a
                                restart of a terminal job (ADR-DB3-003)
```

`system/admin` is a genuine either in the accepted spec, and it is **not** a
product-behaviour fork: whichever actor initiates it, the guards, the frozen
facts and the uniqueness arbiter are identical. APP8 resolves it as a repository
convention rather than a PO decision — **Admin-initiated creation**, because
`production_job_transitions.actor_kind` must name a real actor, the operator is
the one who decides a job enters the shop floor, and BR-016 gives exactly one
Admin. The `SYSTEM` actor stays available for the reservation worker, which is
the one step DB3 marks unambiguously system-owned (TR-LC17-04).

---

## 9. Production specification and frozen data

`production_specifications` already carries every field the approval snapshot
holds, is `UNIQUE` per job, has no `updated_at`, and is written once inside
`createJob`.

```text
PRODUCTION_SPEC_AUTHORITY = production_specifications, one per job, frozen at
                            creation from approval_snapshots. Immutable in practice:
                            no repository method updates it (ADR-DB3-003 — spec never mutated).
SUFFICIENT FOR CATALOG    = yes
SUFFICIENT FOR COP        = yes — the approval snapshot is the source for both branches;
                            product_name / variant_label describe the approved subject
                            whatever it is, and no SKU field appears in the spec at all
MIGRATION REQUIRED        = no
```

No missing frozen fact was found. Explicitly: APP8 must never read live
`products`, `product_variants`, `quotation_versions` or a design session to fill
a production input. If a fact is genuinely absent from the spec, that is a
schema/authority question for a future checkpoint — never a licence to re-read
mutable state.

---

## 10. Production artifact boundary

| Question | Read |
|---|---|
| Kinds | `DIGITIZED_FILE`, `MACHINE_FILE`, `PHOTO`, `OTHER` (CHECK) |
| Storage | metadata row + `asset_id` → the existing asset / object-storage abstraction |
| Creator | `attachArtifact` — no caller exists |
| Customer visibility | **none** — INV-21/22, "internal, unwatermarked files" |
| Generation | **nothing in the repository generates a stitch file.** No DST/PES/EXP writer, no digitizing pipeline, no export |

```text
PRODUCTION_ARTIFACT_DISPOSITION = READ-ONLY / DEFERRED FOR APP8
```

APP8 does **not** invent DST/PES/stitch-file generation, a customer export, or a
new object-storage architecture. The operator's authoritative production input in
APP8 is the **frozen specification** plus the approved design already reachable
through APP6. Artifact attach/delivery is carried as a nonblocking item and
routed to `APP8-G01` for an explicit launch-requirement ruling.

---

## 11. TRUE PO DECISION — COP orders and GRD-015

**`PO-APP8-001` — does a COP-only order require an inventory reservation to enter
production?**

The facts, none of them inferred:

- `GRD-015` (`DB3_TRANSITION_GUARD_CATALOG.md`): production start requires
  *"exact approval snapshot ref + deposit SATISFIED + **reservation RESERVED** +
  order DEPOSIT_PAID"*.
- A COP `order_item` has `sku_id IS NULL` and therefore **cannot** have a
  reservation: `inventory_reservations.sku_stock_id` is `NOT NULL`.
- BR-015 states the reservation gate ("after approval and successful deposit")
  and says nothing about customer-owned products.
- No searched document — business rules, lifecycle, guard catalog, invariant
  enforcement plan, ADR-DB3-002/003 — qualifies GRD-015's reservation clause for
  the COP branch.
- APP5, APP6 and APP7 all delivered the COP branch end to end; `APP7-E01-02`
  proves `COP_ORDER_CREATION = PASS`.

Two materially different, product-valid behaviours remain:

| Option | Behaviour |
|---|---|
| **A (recommended)** | GRD-015's reservation clause binds **per reservable order item**. A Catalog item requires an active `RESERVED` reservation; a COP item requires none. A COP-only order reaches production on approval + deposit + `DEPOSIT_PAID`. A mixed order requires reservations for its Catalog items only. |
| B | GRD-015 is read literally: every order needs at least one `RESERVED` reservation. A COP-only order can **never** enter production. |

Option B makes a delivered first-class product branch permanently unusable and
contradicts the MVP's core custom-embroidery journey, so A is recommended. But
the choice changes customer-visible behaviour, so it is the Product Owner's.

```text
TRUE_PO_DECISIONS = PO-APP8-001   (recommended: Option A)
ROUTED TO         = APP8-G01
BLOCKING          = blocks APP8-B04 (production transitions) and APP8-E01 case 7.
                    Does NOT block B01, B02, W01 or B03.
```

`APP8-G01` is `Next` because it is cheap, blocking for the phase's second half,
and the right place to lock the four other authority readings this audit
resolved (no-expiry reservations, Admin-initiated job creation, artifact
deferral, terminal handoff).

---

## 12. Production state machine and the APP8 terminal handoff

### 12.1 APP8-owned transitions

| From | To | Trigger | Actor | Guard | TX owner | Idempotency / concurrency | Audit / outbox |
|---|---|---|---|---|---|---|---|
| *(none)* | reservation `RESERVED` | `payment.verified` outbox event | **SYSTEM** (worker) | GRD-013 (port) + GRD-014 (anchor lock) | reservation service | outbox claim + `idempotency_records`; CC-20 anchor lock | ledger `RESERVED`; SE-008 |
| *(none)* | job `PLANNED` | Admin, post-deposit | ADMIN | GRD-013 via port; approval must exist | production service | `uq_production_jobs__order_approval_snapshot` → `23505` | `production_job_transitions` |
| `PLANNED` | `STARTED` | Admin start | ADMIN | **GRD-015** + **GRD-022** | production service | job row lock; order row lock (CC-12) | transition row; SE-009 |
| order `DEPOSIT_PAID` | order `IN_PRODUCTION` | same act as job `STARTED` (TR-LC14-03 = TR-LC18-02) | ADMIN | GRD-015 / GRD-022 | **same transaction** | order row lock | `order_transitions` |
| reservation `RESERVED` | `CONSUMED` | production start (goods issue, TR-LC17-05) | SYSTEM | reservation active | **same transaction** | reservation row lock (**to be added, §5.4 Gap B**) | ledger `CONSUMED`; on-hand decrement |
| `STARTED` | `COMPLETED` | Admin complete | ADMIN | legality | production service | job row lock | transition row |
| order `IN_PRODUCTION` | order `PRODUCTION_COMPLETED` | job `COMPLETED` (TR-LC14-04) | SYSTEM/ADMIN | job `COMPLETED` | **same transaction** | order row lock | `order_transitions` |
| `PLANNED` / `STARTED` | `CANCELLED` | Admin, reason mandatory | ADMIN | legality + reason | production service | job row lock | transition row |
| reservation `RESERVED` | `RELEASED` | job cancelled / admin, reason mandatory (TR-LC17-06, GRD-020) | ADMIN | reservation active | reservation service | reservation row lock (**Gap B**) | ledger `RESERVATION_RELEASED` |

The canonical order allow-list in
`packages/persistence/src/order/order-transitions.ts` already permits every order
move above:

```text
DEPOSIT_PAID         -> ['IN_PRODUCTION', 'ON_HOLD', 'CANCELLING']
IN_PRODUCTION        -> ['PRODUCTION_COMPLETED', 'ON_HOLD', 'CANCELLING']
PRODUCTION_COMPLETED -> ['AWAITING_FINAL_PAYMENT', 'ON_HOLD', 'CANCELLING']
```

APP8 adds **no** order status and changes **no** allow-list row.

### 12.2 The handoff

```text
APP8_TERMINAL_HANDOFF_STATE = order PRODUCTION_COMPLETED  (TR-LC14-04),
                              with its production job COMPLETED
APP9_ENTRY_PRECONDITION     = TR-LC14-05 — Admin moves PRODUCTION_COMPLETED ->
                              AWAITING_FINAL_PAYMENT against the existing, still
                              unsatisfied REMAINING obligation created by APP7-W01
```

APP8 stops there. `AWAITING_FINAL_PAYMENT`, `READY_FOR_DELIVERY`, `DELIVERED`,
`COMPLETED`, shipping freeze, dispatch, refund and settlement are APP9.

---

## 13. Worker / queue / outbox disposition

**`IMP-O003` is CLOSED.** `IMP-D029` (APP2, corrected by `APP2-DEC-JOBS-C1`)
resolved it: the runtime is a **PostgreSQL-backed claim queue on the existing
persistence** — `outbox_events` is the durable work signal, one logical job per
domain transition appended in the same transaction; claim is
`FOR UPDATE SKIP LOCKED` on the partial `status='PENDING'` index, FIFO
`(next_attempt_at NULLS FIRST, id)`; the lease is a visibility timeout on
`next_attempt_at`; attempts append to `background_job_attempts`. No broker, no
Redis, no second datastore. **APP8 introduces none.**

```text
QUEUE_ASYNC_DISPOSITION = EXISTING POSTGRES OUTBOX CLAIM QUEUE (IMP-D029). No new
                          broker, no new queue table, no new runtime dependency.
```

Delivered worker convention (`apps/worker/src/`): one handler per event type,
registered in `JobHandlerRegistry` (duplicate registration throws), resolved by
`JobExecutionService`. Existing handlers: `asset-inspection`,
`asset-normalization`, `notification-delivery`, `order-conversion`
(`design.approved` → Order + `order.created`), `app5-intake-cleanup`.

| APP8 responsibility | Owner | Why |
|---|---|---|
| **Official reservation after deposit verification** | **worker consumer of `payment.verified`** | TR-LC17-04's actor is *system (deposit verified event)*, and TR-LC14-02's after-commit effect is the *"official reservation trigger (LC-17)"*. APP7 already emits `payment.verified` (`PAYMENT_VERIFIED_EVENT_TYPE`). This is a **real asynchronous owner**, so a `Wxx` checkpoint is justified. |
| Stock read / adjustment | sync API | Admin-initiated, immediate feedback |
| Production job creation | sync API | Admin-initiated |
| Production transitions | sync API | Admin-initiated, and the order move must share the transaction |
| Reservation release / consume | sync, inside the owning production transaction | goods issue is not a separate asynchronous fact |
| Reservation expiry sweep | **none** | official reservations are no-expiry (§5.6) |

Retry source, effect key, dead-letter semantics and after-commit ordering are the
existing APP2 runtime's, reused unchanged. Idempotency uses the delivered
`idempotency_records` claim (DB8 `CC-20`, P0 `PASS`) — APP8 builds no new one.

**IMP-D054 applies.** `APP7-W01-C1` established that persistence reachable from
both the API and the worker lives in `@embroidery/persistence`, not duplicated in
the worker. The inventory and production repositories today live under
`apps/api/src/modules/`. Because the reservation worker needs the inventory
repository, APP8 must **promote** those repositories into
`@embroidery/persistence` rather than copy them — the exact correction
`APP7-W01` received. This is `APP8-B02`'s scope.

---

## 14. Existing and missing HTTP surface

### 14.1 Existing

| Operation | Classification |
|---|---|
| `POST /api/admin/products/{productId}/variants/{variantId}/skus` | `EXISTING_BUT_NOT_APP8` — Catalog SKU authoring (APP7-B01) |
| `PATCH /api/admin/skus/{skuId}` | `EXISTING_BUT_NOT_APP8` |
| `GET /api/admin/orders`, `GET /api/admin/orders/{orderId}` | `EXISTING_AND_USABLE` — APP8 Admin surfaces link from here |

No `EXISTING_STALE_UNUSED` operation was found.

### 14.2 Missing, derived from use cases (not symmetry)

| Family | Ops | Justified by |
|---|---|---|
| Admin stock read + adjust | 3 | Gap A — nothing creates a `sku_stocks` row, so no reservation can ever succeed; `ADJUSTMENT` with reason is the accepted audited override |
| Admin production job create + queue + detail | 3 | TR-LC18-01; the operator needs a work list and a job view |
| Admin production transitions | 2 | TR-LC18-02/03 + TR-LC14-03/04 |

Total predicted: **8 new operations across 3 backend checkpoints** — each within
the normal 1–3 band, none near the hard maximum of 5. No "inventory API" or
"production API" mega-checkpoint.

Reservation `reserve` is deliberately **not** an HTTP operation: TR-LC17-04's
actor is the system, and exposing a manual reserve endpoint would create a second
path to a rule the worker already owns. Release is reached through job
cancellation, not as a standalone endpoint.

---

## 15. Admin UX and Storefront disposition

Admin routes today: `/`, `/assets`, `/products…`, `/design-templates…`,
`/requests…`, `/orders`, `/orders/[orderId]`, `/support/customer-access`,
`/login`. There is no inventory or production surface.

APP8 Admin need:

1. **Inventory** — availability per SKU, low-stock signal, audited adjustment,
   reservation visibility, insufficient-stock intervention.
2. **Production queue** — jobs by status, the operator's work list.
3. **Production job detail** — frozen specification, the reservation backing it,
   transition history, and the guarded start / complete / cancel actions.

```text
CUSTOMER_UI_DISPOSITION = NO_CUSTOMER_UI_IN_APP8
```

Reasons, from documents rather than preference: `01-PRODUCT-REQUIREMENTS.md`
line 250 lists *"Quản lý trạng thái sản xuất"* under **Admin** operations, and no
searched product, journey or business-rule document requires a customer-visible
production state. APP9's plan already owns *"Customer remaining-payment and
completion status"*, and APP10 owns customer communication. Adding a Storefront
surface here would either duplicate APP9's or publish internal shop-floor state.
If the Product Owner later wants it, the honest customer-safe vocabulary is the
**order** status (`IN_PRODUCTION`, `PRODUCTION_COMPLETED`) — never job status,
operator identity, notes, artifacts or inventory quantities.

---

## 16. Schema and repository disposition

```text
INVENTORY_SCHEMA_DISPOSITION  = NO_MIGRATION_REQUIRED
PRODUCTION_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED
```

Every APP8 requirement is representable by the delivered physical schema. No
migration is proposed for a speculative index, DTO convenience, UI convenience or
a candidate-plan assumption — notably: **no `production_job_attempts` table**,
because the attempt/claim model is not in the accepted design and rework is a new
job via `reworked_from_job_id`.

Repository status per capability:

| Capability | Port | Adapter | Method | Guard | TX boundary | Consumable? |
|---|---|---|---|---|---|---|
| Stock row creation | yes | yes | `ensureStockRow` | anchor | valid | yes — needs a caller |
| Availability read | yes | yes | `availability` | anchor lock | valid | yes |
| Audited adjustment | yes | yes | `adjust` | reason mandatory | valid | yes |
| Official reservation | yes | yes | `createReservation` | GRD-013 + GRD-014 | valid | yes |
| Reservation release | yes | yes | `releaseReservation` | status only | **row lock missing** | needs B02 |
| Reservation consume | yes | yes | `consumeReservation` | status only | **row lock missing** | needs B02 |
| Ledger read | yes | yes | `listLedger` | — | valid | yes |
| Job creation + spec freeze | yes | yes | `createJob` | approval exists | valid | yes — GRD-013 at service layer |
| Job transition | yes | yes | `transition` | LC-18 + job row lock | valid | yes — GRD-015/022 at service layer |
| Artifact attach / list | yes | yes | `attachArtifact`, `listArtifactAssetIds` | uniqueness | valid | deferred |
| Note append | yes | yes | `appendNote` | — | valid | yes |
| Order transition | yes (`@embroidery/persistence`) | yes | `transition` | allow-list | valid | yes |

**Shared persistence is preserved.** No inventory or production DB logic is
duplicated between the API and the worker; `APP8-B02` promotes the two modules
into `@embroidery/persistence` so both consume one implementation (IMP-D054).

---

## 17. Security and actor model

`BR-016`: *"The current system has one Admin account and no role hierarchy."*

Delivered pattern, reused **exactly**: `@UseGuards(AuthenticatedAdminGuard)` on
the controller; `@UseGuards(StaffOriginGuard, StaffJsonBodyGuard)` additionally on
each mutation.

```text
APP8 ACTORS = ADMIN (every HTTP operation)
              SYSTEM (the reservation worker; systemJobKey on ledger + transition rows)
              CUSTOMER — none
```

No new auth architecture, no new permission scheme, no customer grant scope, no
internal token. `inventory_ledger_entries.actor_kind` and
`production_job_transitions.actor_kind` already carry the ADMIN/SYSTEM split with
`admin_id` / `system_job_key`, so attribution needs no new column.

---

## 18. Failure semantics

Mapped to the existing `guardViolationError` / `notFoundError` conventions and
the standard envelope. Codes already present in delivered code are marked
**existing**; the rest are the honest names for conditions APP8 introduces.

| Condition | Code | Source |
|---|---|---|
| Not deposit-eligible | `RESERVATION_NOT_ELIGIBLE` | **existing** — `ReservationEligibilityGuard` |
| Insufficient inventory | `INSUFFICIENT_STOCK` | **existing** — `StockAnchor.assertSufficient` |
| Non-positive quantity | `QUANTITY_INVALID` | **existing** — `StockAnchor` |
| No stock record for SKU | not-found, *"That SKU has no stock record."* | **existing** — `StockAnchor.requireLocked` |
| Reservation not active (stale / already terminal / invalid release or consume) | `RESERVATION_NOT_ACTIVE` | **existing** |
| Reservation absent | not-found | **existing** |
| Production job already exists | `23505` on `uq_production_jobs__order_approval_snapshot` → `PRODUCTION_JOB_ALREADY_EXISTS` | DB8 `CC-08` |
| Invalid production transition | `INVALID_TRANSITION` | **existing** |
| Cancellation without reason | `CANCELLATION_REASON_REQUIRED` | **existing** |
| Production start gate failed | `PRODUCTION_BLOCKED` | GRD-015 (`DB3_TRANSITION_GUARD_CATALOG.md`) |
| Order on hold / cancelling | `ORDER_ON_HOLD` | GRD-022 |
| Concurrent competing order lost the last unit | `INSUFFICIENT_STOCK` | CC-20 — the loser's honest answer |
| Deadlock under contention | `40P01` → `RETRYABLE_TRANSACTION_FAILURE` | **existing** mapper, DB8 `CC-22` |
| Worker retry after committed success | replay via `idempotency_records` / outbox claim — converges, no duplicate | **existing**, DB8 `CC-20` |
| Missing production specification | unreachable — the spec is written inside `createJob`'s transaction | INV-03 |

No new HTTP status code and no new public error vocabulary is invented. APP8
adds `PRODUCTION_BLOCKED` and `ORDER_ON_HOLD` only because the accepted guard
catalog already names them.

---

## 19. Imported APP7 follow-ups

| Follow-up | Classification for APP8 |
|---|---|
| `FU-APP7-S01-EXACT-MONEY-PROMOTION-01` | `NOT_RELEVANT_TO_APP8` — Storefront money presentation; APP8 has no Storefront surface |
| `FU-APP7-S01-SHARED-DIALOG-01` | `NOT_RELEVANT_TO_APP8` — Storefront primitive |
| `FU-ADMIN-SHARED-DIALOG-01` | `CARRY_NONBLOCKING` — APP8 Admin adds confirm dialogs for guarded transitions; if a third Admin scrim/focus-trap copy would be written, prefer extracting the shared primitive **within that checkpoint's own scope**, never as separate debt work |
| `FU-APP7-S01-SCSS-GATE-01` | `CARRY_NONBLOCKING` — tooling coverage; APP8 SCSS complies with ≤ 400 lines under feature-local tests, as APP7's did |
| `FU-APP7-B01-01` | `NOT_RELEVANT_TO_APP8` — Catalog audit-row readability |
| `FU-APP6-B04-REPORT-SECRET-HEURISTIC-01` | `CARRY_NONBLOCKING` — pre-existing, APP6-owned; APP6 history is not rewritten |
| `IMP-O007` (payment provider) | `NOT_RELEVANT_TO_APP8` — stays open, outside APP8 ownership |
| APP7 S01 design/backend reconciliation (4 items) | `NOT_RELEVANT_TO_APP8` — APP7-D01 frames / design maintenance |
| `IMP-O003` | `CLOSED_ALREADY` — resolved by IMP-D029 (§13) |
| `DEC-14` (reservation TTL) | `CARRY_NONBLOCKING` — unblocked for APP8 by the accepted no-expiry branch (§5.6); TTL values stay deferred |

APP8 spends no time on unrelated debt.

---

## 20. Original candidate reconciliation

The original candidate plan is
`docs/implementation/phases/APP8-INVENTORY-AND-PRODUCTION.md` §6, 14 candidates.
It is preserved as planning history; the canonical roadmap is appended, not
substituted for it.

```text
ORIGINAL_CANDIDATES_RECONCILED = 14/14
```

| # | Original checkpoint | Original intent | Repository truth now | Disposition | Canonical replacement / owner | Reason |
|---:|---|---|---|---|---|---|
| 1 | `APP8-C01` Inventory operations contract | contract-first, ≤ 5 endpoints | no phase from APP0–APP7 ever used a contract-only `Cxx` checkpoint; contracts ship with the backend that implements them | `MERGE` | `APP8-B01` | a contract with no implementation is not a reviewable human boundary; splitting it doubles the review cost and lets the OpenAPI artifact drift from the code for a checkpoint |
| 2 | `APP8-B01` Inventory operations backend | quantities, authorization, audit, repository queries | the repository queries, quantities, audit ledger and authorization guard **all exist**; what is missing is a `sku_stocks` producer and an HTTP surface | `REDEFINE` | `APP8-B01` — Admin stock read + audited adjustment (3 ops) | the delivered layer is not rebuilt; the checkpoint becomes composition + application service + HTTP, and closes Gap A |
| 3 | `APP8-A01` Admin inventory screen | availability, adjustment, reservation visibility, conflict states | no Admin inventory route exists; no APP8 Figma row exists | `KEEP` | `APP8-A01` | still needed, now gated behind `APP8-D01` |
| 4 | `APP8-B02` Reservation use cases | hold / conversion / release / expiry under existing lock order | `createReservation` / `releaseReservation` / `consumeReservation` exist; **release and consume take no reservation row lock** (Gap B); soft holds have no producer; official reservations are no-expiry | `REDEFINE` | `APP8-B02` — shared-persistence promotion + CC-21 lock repair (0 ops) | the real work is a concurrency repair and an IMP-D054 promotion, not new use cases; hold conversion and expiry are dropped as unreachable / not applicable |
| 5 | `APP8-C02` Reservation operational contract | Admin order / reservation status + actions | reservation status belongs on the existing order detail and the production job detail; a standalone reservation contract has no operator use case | `MERGE` | `APP8-B03` / `APP8-A03` | avoids a surface whose only justification is symmetry |
| 6 | `APP8-C03` Production job contract | queue, detail, create, start, transitions | contract-only, same objection as #1 | `MERGE` | `APP8-B03` + `APP8-B04` | contracts ship with their backend |
| 7 | `APP8-B03` Production backend | eligibility, approved-design linkage, lifecycle guards, audit, outbox | the repository already owns approved-design linkage (frozen spec), lifecycle legality and transition audit; GRD-013/015/022 and the order moves are absent | `SPLIT` | `APP8-B03` (create + reads, 3 ops) and `APP8-B04` (transitions, 2 ops) | one checkpoint mixing creation, reads and three guarded state changes exceeds a reviewable slice and the 1–3 operation band |
| 8 | `APP8-A02` Admin production queue | filters, priorities, status, loading / error / empty | no route exists | `KEEP` | `APP8-A02` | still needed; "priorities" is dropped — no priority column exists and none is accepted |
| 9 | `APP8-A03` Admin production detail | approved design evidence, reservation, attempts, guarded transitions | no route exists; **there are no job attempts** | `REDEFINE` | `APP8-A03` | frozen specification + reservation + transition history + guarded actions; the attempts panel is removed as an invalid assumption |
| 10 | `APP8-W01` Production worker claims / attempts | deterministic claim, bounded retry, duplicate safety, terminal / manual review | **invalid assumption** — no `production_job_attempts` table, no production claim model, no machine runner; production transitions are Admin-driven. The one genuinely asynchronous APP8 owner is the **official reservation on `payment.verified`** (TR-LC17-04, system actor) | `REDEFINE` | `APP8-W01` — reservation-on-deposit-verified worker consumer | a worker checkpoint is valid only with a real asynchronous owner; there is exactly one, and it is not the one the candidate named |
| 11 | `APP8-C04` Customer order status contract | bounded customer-safe status read | no product requirement for a customer production surface; APP9 owns customer completion status | `DEFER_TO_APP9` | APP9 | §15 |
| 12 | `APP8-S01` Customer production status | customer-safe progress | same | `DEFER_TO_APP9` | APP9 | §15 |
| 13 | `APP8-E01` Order-to-production E2E | competing orders, reserve, job, transitions, retry | valid and required | `KEEP` | `APP8-E01` | scope refined in §22 |
| 14 | `APP8-X01` Phase closure | hand off to APP9 | valid and required | `KEEP` | `APP8-X01` | terminal state now stated exactly: order `PRODUCTION_COMPLETED` |

One checkpoint is **added** that the candidate plan lacked: `APP8-G01`, forced by
the `PO-APP8-001` decision (§11) and the four authority readings this audit
resolved. `APP8-D01` is also added, because the Figma registry has zero APP8 rows
and three Admin screens are planned.

---

## 21. Canonical APP8 roadmap

```text
CANONICAL_CHECKPOINT_COUNT = 13
ROADMAP = R00 -> G01 -> B01 -> B02 -> W01 -> B03 -> B04 -> D01 -> A01 -> A02 -> A03 -> E01 -> X01
```

| Order | Checkpoint | Purpose | Depends on | Main area | HTTP ops | Schema? | Worker? | Design? | Acceptance focus |
|---:|---|---|---|---|---:|---|---|---|---|
| 1 | `R00` | phase entry audit and roadmap reconciliation | APP7 closed | docs | 0 | no | no | no | this document |
| 2 | `G01` | APP8 authority lock: `PO-APP8-001` (COP ↔ GRD-015), no-expiry official reservations, Admin-initiated job creation, artifact deferral, terminal handoff | R00 | docs | 0 | no | no | no | every APP8 rule traced to accepted authority or an explicit PO ruling |
| 3 | `B01` | compose `InventoryModule`; Admin stock read, low-stock signal and audited adjustment — closes Gap A | G01 | api | 3 | no | no | no | a SKU gains a stock row; an adjustment without a reason is refused; the ledger explains every change |
| 4 | `B02` | promote inventory + production persistence into `@embroidery/persistence` (IMP-D054); add the reservation row lock to release and consume — closes Gap B | B01 | packages, api | 0 | no | no | no | a concurrent release + consume never double-counts; the existing CC-15/16/17 proofs still pass |
| 5 | `W01` | worker consumer of `payment.verified` → official reservation for each Catalog order item (TR-LC17-04) | B02 | worker | 0 | no | **yes** | no | an eligible Catalog order reserves exactly its frozen quantity; COP creates none; redelivery creates no duplicate |
| 6 | `B03` | Admin production job creation (GRD-013 via the port, spec frozen) + queue and detail reads | W01 | api | 3 | no | no | no | duplicate creation returns the existing job; the spec matches the approval snapshot exactly |
| 7 | `B04` | Admin production transitions: start (+ order `IN_PRODUCTION` + reservation `CONSUMED`), complete (+ order `PRODUCTION_COMPLETED`), cancel (+ reservation `RELEASED`) | B03 | api | 2 | no | no | no | GRD-015 / GRD-022 enforced under the order row lock; every move is one transaction |
| 8 | `D01` | one APP8 design package: Admin inventory, production queue, production job detail — all states | B04 | design | 0 | no | no | **yes** | registry rows created with exact node ids; the contract facts from B01/B03/B04 are known |
| 9 | `A01` | Admin inventory screen | D01 | admin | 0 | no | no | consumes | availability, adjustment, insufficient-stock intervention |
| 10 | `A02` | Admin production queue | D01 | admin | 0 | no | no | consumes | status filters, loading / error / empty |
| 11 | `A03` | Admin production job detail + guarded transitions | A02 | admin | 0 | no | no | consumes | frozen spec, reservation, history, guarded actions, stale / conflict states |
| 12 | `E01` | focused cross-layer acceptance | A03 | e2e | 0 | no | no | no | the 14 targets in §22 |
| 13 | `X01` | closure and APP9 handoff | E01 | docs | 0 | no | no | no | order reaches `PRODUCTION_COMPLETED`; APP9 execution stays zero |

Predicted totals: **8 new HTTP operations**, **0 migrations**, **1 worker
handler**, **1 design package**, **3 Admin screens**.

Design precedes only the UI that consumes it, and follows the backend contracts
it must draw truthfully. Every checkpoint answers *"would a Product Owner
meaningfully review this boundary before the next work?"* with yes: `G01` locks a
customer-visible behaviour; `B01` makes stock exist at all; `B02` changes a
concurrency guarantee; `W01` introduces the phase's only asynchronous owner;
`B03` and `B04` separate creation from state change; `D01` is an approval gate by
definition; `A01`–`A03` are one screen each; `E01` and `X01` are the accepted
phase closers.

---

## 22. Future `APP8-E01` target — defined, NOT executed

Targeted cases reusing accepted lower-level evidence. Not a full-suite rerun.

| # | Case |
|---:|---|
| 1 | A deposit-eligible Catalog order reserves exactly the frozen quantity of each Catalog order item — no more, no less |
| 2 | An order whose DEPOSIT obligation is not SATISFIED creates no reservation and no production job (`RESERVATION_NOT_ELIGIBLE`) |
| 3 | Two competing deposit-eligible orders for the last unit: exactly one reserves, the other gets `INSUFFICIENT_STOCK`; on-hand never goes negative and no oversubscription occurs |
| 4 | Duplicate `payment.verified` delivery, duplicate job creation and a repeated Admin transition each converge on existing truth — one reservation, one job, one transition row |
| 5 | Reservation resolves through the item's frozen `sku_id`, not a live catalog read |
| 6 | A COP order item fabricates no SKU, no `sku_stocks` row and no reservation |
| 7 | A COP order reaches production readiness only through the `PO-APP8-001` branch the Product Owner locks in `G01` |
| 8 | Job creation is one job per `(order, approval snapshot)`, with a specification identical to the approval snapshot's frozen facts |
| 9 | `PLANNED → COMPLETED` directly is refused; cancel without a reason is refused; a terminal job cannot restart |
| 10 | An Admin retry after a committed start neither double-consumes the reservation nor writes a second transition row |
| 11 | Ledger, `order_transitions`, `production_job_transitions` and outbox rows exist only where the state change committed — and a rolled-back transaction leaves none |
| 12 | The order reaches exactly `PRODUCTION_COMPLETED`, with its job `COMPLETED` and its reservation `CONSUMED` |
| 13 | `AWAITING_FINAL_PAYMENT`, shipping, delivery, refund and settlement execution remain **zero**; the REMAINING obligation is still unsatisfied and uncollected |
| 14 | Admin renders insufficient-stock, on-hold and stale-concurrent-transition states truthfully, without exposing an internal error |

---

## 23. Verdict

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
  NOT HTTP_EXPOSED, NOT UI_CONSUMED. Two gaps: no sku_stocks producer;
  release/consume take no reservation row lock.
PRODUCTION_RUNTIME_BASELINE = PHYSICAL + REPOSITORY_DELIVERED — NOT RUNTIME_COMPOSED,
  NOT HTTP_EXPOSED, NOT UI_CONSUMED. No production_job_attempts table exists.

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
PRODUCTION_TRANSITION_AUTHORITY = LC-18 allow-list under the job row lock
  (PLANNED->STARTED|CANCELLED, STARTED->COMPLETED|CANCELLED, terminals closed),
  gated by GRD-015 and GRD-022 at the application-service layer
APP8_TERMINAL_HANDOFF_STATE = order PRODUCTION_COMPLETED (TR-LC14-04) with its
  production job COMPLETED
APP9_ENTRY_PRECONDITION = TR-LC14-05 — Admin moves PRODUCTION_COMPLETED ->
  AWAITING_FINAL_PAYMENT against the unsatisfied REMAINING obligation

QUEUE_ASYNC_DISPOSITION = EXISTING POSTGRES OUTBOX CLAIM QUEUE (IMP-D029 closes
  IMP-O003). One new handler: payment.verified -> official reservation. No broker.
DESIGN_GATE = DESIGN_REQUIRED_BEFORE_UI (0 APP8 Figma rows, no APP_08 page target)
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
