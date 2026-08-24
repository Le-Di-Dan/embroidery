# `APP8-B02` — Completion report

Shared inventory persistence promotion and the DB3 CC-21 release-vs-consume
repair.

## 1. Verdict

```text
APP8-B02 = COMPLETE
NEXT_CHECKPOINT = APP8-W01
NOT_PUSHED = true
```

Two responsibilities, both delivered:

1. the inventory persistence `apps/api` and `apps/worker` both write is now
   canonical in `@embroidery/persistence` (`PO-APP8-006`, `IMP-D054`);
2. `releaseReservation` and `consumeReservation` take the reservation row lock
   **before** the terminal-state decision, which is the DB3 CC-21 arbiter that
   `APP8-R00` §5.4 Gap B found physically absent from delivered DB7 code.

No new HTTP operation, no migration, no worker behaviour, no production
persistence moved.

## 2. Branch, entry HEAD, final commit

```text
BRANCH       = production
ENTRY_HEAD   = 59bc1b21713ccbd80d757ecdb35cf0920322f0b6   (APP8-B01)
FINAL_COMMIT = recorded by the external evidence step; this report is committed
               once, in that same commit, and no second commit is created to
               record its own hash
NOT_PUSHED   = true
```

## 3. What was promoted, exactly

Six files moved (`git mv`, rename-detected in the diff), one identity file and
one composition root added:

| From (`apps/api/src/modules/inventory/`) | To (`packages/persistence/src/inventory/`) |
|---|---|
| `domain/repositories/sku-stock.repository.ts` | `sku-stock.repository.ts` |
| `infrastructure/persistence/stock-anchor.ts` | `stock-anchor.ts` |
| `infrastructure/persistence/inventory-commitments.ts` | `inventory-commitments.ts` |
| `infrastructure/persistence/inventory-reservations.ts` | `inventory-reservations.ts` |
| `infrastructure/persistence/reservation-eligibility.guard.ts` | `reservation-eligibility.guard.ts` |
| `infrastructure/persistence/drizzle-sku-stock.repository.ts` | `drizzle-sku-stock.repository.ts` |
| — (new) | `inventory-identity.ts` |
| — (new) | `inventory-persistence.module.ts` |

`apps/api/src/modules/inventory/infrastructure/` no longer exists.

### 3.1 Symbols published from `@embroidery/persistence`

```text
SKU_STOCK_REPOSITORY         Symbol — the one AGG-07 token
InventoryPersistenceModule   the one composition root
type SkuStockRepository, SkuStock, StockAvailability, SoftHold, Reservation,
     LedgerEntry, InventoryActor, SkuStockId, SoftHoldId, ReservationId
type SkuId
```

`StockAnchor`, `InventoryCommitments`, `InventoryReservations` and
`ReservationEligibilityGuard` are **not** exported. They are the aggregate's
internal split by responsibility (DB7 §10.1) and stay private, so no consumer
can reach the availability arithmetic or the deposit gate around the one
contract.

### 3.2 The two thin re-exports

Both keep every delivered import path working and, critically, the **same**
Symbol instance — there is no second token to bind:

- `apps/api/src/modules/inventory/domain/repositories/sku-stock.repository.ts`
  re-exports the AGG-07 contract and `SKU_STOCK_REPOSITORY`;
- `apps/api/src/modules/catalog/domain/repositories/placement-hierarchy.port.ts`
  re-exports `SkuId`.

`SkuId` moved for the single reason `CustomRequestId` moved in `APP7-W01-C1`:
the shared contract names it, and a type a two-application contract references
may not live inside one of those applications. Catalog remains its conceptual
owner and publishes it under its delivered name; nothing else about the Catalog
aggregate moved.

`apps/api/src/modules/inventory/inventory.module.ts` is now a composition shim:
it imports and re-exports `InventoryPersistenceModule` and declares **no
provider of its own**.

## 4. One canonical implementation — proof

| Claim | Evidence |
|---|---|
| API and the future worker resolve one token | `inventory-persistence.contract.spec.ts` — `expect(SKU_STOCK_REPOSITORY).toBe(API_SKU_STOCK_REPOSITORY)`. A Symbol is only equal to itself. |
| One composition root, published | same suite — `InventoryPersistenceModule` is exported from the package. |
| No second provider binding in the API | same suite — source scan for `provide: SKU_STOCK_REPOSITORY` under the API inventory module: empty. |
| No API-local inventory persistence remains | same suite — source scan for `from 'drizzle-orm'` and for the Drizzle table objects (`skuStocks`, `inventorySoftHolds`, `inventoryReservations`, `inventoryLedgerEntries`): empty. |
| The worker may consume it without importing `apps/api` | `InventoryPersistenceModule` imports only `DatabaseModule` and `PaymentPersistenceModule`, both package-internal; `apps/worker` typechecks clean against the new package index. |
| No API-to-worker or worker-to-API import introduced | no `apps/worker` file changed; the API imports only `@embroidery/persistence`. |

The scan deliberately does **not** match SQL table names in prose, because the
Admin controller and response schema document those tables in docblocks and in
OpenAPI descriptions, and it does not forbid `@embroidery/database` outright,
because `admin-sku-stock.response.ts` legitimately publishes
`schema.INVENTORY_ENTRY_KINDS` as an enum. The camelCase Drizzle table
identifiers appear in statements and never in prose, which is why they are the
signal.

This structural guard is the inventory sibling of
`apps/worker/src/jobs/order-conversion/tests/canonical-order-authority.spec.ts`
(`APP7-W01-C1` §12) and is deliberately the same size: token identity plus a
narrow source scan over one capability. It is not an architecture linter.

## 5. Production persistence was not moved

```text
PRODUCTION_PERSISTENCE_DISPOSITION = REMAINS API-LOCAL   (unchanged)
```

No file under `apps/api/src/modules/production/` was touched, and nothing
production-related is exported from `@embroidery/persistence`. `PO-APP8-006` and
`APP8-G01` §6 make the test *demonstrated cross-runtime need*, not symmetry:
`PO-APP8-003` makes job creation Admin-initiated and synchronous, and
`PO-APP8-004` removes every artifact/machine-runner consumer, so no accepted
APP8 runtime outside `apps/api` writes production. Inspection at this checkpoint
found no such consumer, so the disposition stands unchanged. The reasoning is
recorded in `inventory-persistence.module.ts`'s docblock so a later reader does
not mistake the asymmetry for an oversight.

## 6. Deposit authority — identity still singular

```text
DEPOSIT_ELIGIBILITY_PORT = Symbol, @embroidery/persistence (payment/)
ADAPTER                  = DrizzleDepositEligibilityAdapter
PROVIDER                 = PaymentPersistenceModule
CONSUMER                 = ReservationEligibilityGuard (now package-internal)
```

`InventoryPersistenceModule` **imports** `PaymentPersistenceModule` rather than
re-declaring anything. No second Symbol, no second interface, no copied SQL
predicate, and no circular import back into `apps/api`. Asserted directly:
`expect(DEPOSIT_ELIGIBILITY_PORT).toBe(API_DEPOSIT_ELIGIBILITY_PORT)` in the
contract suite.
`apps/api/src/modules/payment/domain/repositories/deposit-eligibility.port.ts`
remains the `APP7-W01-C1` re-export, unchanged.

## 7. The CC-21 defect, exactly

`DB3_CONCURRENCY_SPECIFICATION.md` CC-21 names the arbiter as *"reservation row
LOCK + idempotent transitions"*; `DB5_LOCKING_ACCESS_PATHS.md` repeats it. The
delivered code took no such lock:

```text
releaseReservation / consumeReservation
  -> requireReservedReservation(id, op)
       -> findReservation(id)
            -> this.db.select()...limit(1)      // no tx, no FOR UPDATE
  -> status decision made on an unlocked read
```

`releaseReservation` locked nothing at all; `consumeReservation` locked
`sku_stocks` — after the status read, and on a different row from the one whose
state was being decided. Two callers could each observe `RESERVED` and both
proceed.

### 7.1 The repair

`requireReservedReservation` is **deleted** — no dead duplicate was left behind —
and replaced by `lockReservedReservation(tx, id, operation)`, which is the only
path either terminal operation takes:

```text
SELECT * FROM inventory_reservations WHERE id = $1 LIMIT 1 FOR UPDATE
  -> row missing         -> notFoundError            (unchanged)
  -> status !== RESERVED -> RESERVATION_NOT_ACTIVE   (unchanged)
```

The lock is taken first, the status is read from the locked row, and the
decision is made inside the caller's transaction. `findReservation` keeps its
unlocked read: it is a lookup, not a decision, and no terminal path uses it any
more.

### 7.2 Lock sequence after the repair

```text
releaseReservation   inventory_reservations row  FOR UPDATE
                     -> status decision
                     -> UPDATE reservation -> RELEASED (+ reason, terminalized_at)
                     -> INSERT ledger RESERVATION_RELEASED (on_hand_delta 0)

consumeReservation   inventory_reservations row  FOR UPDATE
                     -> status decision
                     -> sku_stocks row           FOR UPDATE      (anchor, unchanged)
                     -> UPDATE reservation -> CONSUMED
                     -> UPDATE sku_stocks.quantity_on_hand -= quantity
                     -> INSERT ledger CONSUMED (on_hand_delta -quantity)
```

Reservation row first, anchor second. No delivered path locks the anchor and
then an *existing* reservation row — `createReservation` and `convertHold` lock
the anchor and then **insert**, and a row nobody can name yet cannot be waited
on — so no cycle is introduced and the proven `orders` to `sku_stocks` direction
(`DB8_LOCK_ORDER_MATRIX.md`, DB8 `CC-22`) is untouched. The anchor remains the
sole authority for on-hand mutation. Isolation stays `READ COMMITTED` with
explicit locks (DEC-DB7-006); nothing opts into `SERIALIZABLE`.

## 8. Deterministic race results

Added to
`apps/api/src/modules/inventory/tests/integration/inventory-races.integration.spec.ts`
— the existing DB8-CP2 harness: independently pooled Nest actors, real separate
PostgreSQL backends, `Barrier` coordination.

Sequencing is by the lock itself, not by timing. The winner holds its
transaction open after its terminal write; the loser then starts; a **third**
connection polls `pg_stat_activity` until a backend on this database reports
`wait_event_type = 'Lock'` — PostgreSQL's own answer to whether that transaction
is blocked — and only then is the winner released. The wait is bounded and
throws with a diagnostic if nothing ever blocks, so a repair that stopped taking
the lock fails here rather than hanging.

| | Case A — `CC-21a` release wins | Case B — `CC-21b` consume wins |
|---|---|---|
| Seed | on-hand 10, one `RESERVED` reservation of 4 | same |
| Winner | `releaseReservation(reason)` | `consumeReservation` |
| Loser | `consumeReservation` | `releaseReservation(reason)` |
| Loser outcome | rejected, `RESERVATION_NOT_ACTIVE` | rejected, `RESERVATION_NOT_ACTIVE` |
| Final status | `RELEASED` | `CONSUMED` |
| `RESERVATION_RELEASED` ledger rows | **1** | **0** |
| `CONSUMED` ledger rows | **0** | **1** |
| `sku_stocks.quantity_on_hand` | **10** (untouched) | **6** (decremented once) |

Both pass. Exactly one operation transitions the reservation out of `RESERVED`;
the loser appends no second terminal ledger entry, a lost consume never touches
on-hand, and a lost release never returns inventory.

### 8.1 The tests are not vacuous — negative control

The repair was temporarily reverted (`.for('update')` removed from
`lockReservedReservation`), the package rebuilt, and the two cases re-run:

```text
CC-21a  FAILED — loser outcome "committed", expected "rejected"
CC-21b  FAILED — loser outcome "committed", expected "rejected"
```

Under the unlocked read the loser blocks on the `UPDATE` row lock instead, then
proceeds against an already-terminal reservation and commits a second terminal
effect — precisely the double-count CC-21 exists to prevent. The lock was then
restored and the package rebuilt before any reported run.

## 9. Terminal-status, ledger and on-hand assertions

Asserted per case in §8 against the database, not against return values:

- `inventory_reservations.status` read on a third connection after both
  transactions settle;
- `count(*)` over `inventory_ledger_entries` filtered by `reservation_id` **and**
  `entry_kind`, so "no second terminal entry" is a count of the specific kind,
  not a total;
- `sku_stocks.quantity_on_hand` read directly.

Delivered semantics are preserved and none were redesigned: reservations start
`RESERVED`; release still requires its reason; consume still performs the
goods-issue decrement under the anchor lock; the ledger stays append-only;
negative stock stays impossible; APP8 official reservations remain no-expiry; no
soft-hold producer, no expiry sweep, no reservation HTTP endpoint. The loser's
refusal is the delivered `RESERVATION_NOT_ACTIVE` guard violation — no new
idempotency subsystem, and no replay-returns-success behaviour was invented.

## 10. Schema

```text
MIGRATIONS = 0
```

`packages/database/migrations/` is untouched. No reservation version column, no
new uniqueness constraint, no advisory-lock table, no distributed-lock
infrastructure, no Redis, no broker, no queue table, no idempotency table. The
arbiter is the row lock DB3 already required.

## 11. `APP8-B01` compatibility

```text
GET  /api/admin/skus/{skuId}/stock             unchanged
POST /api/admin/skus/{skuId}/stock/adjustments unchanged
GET  /api/admin/skus/{skuId}/stock/ledger      unchanged
```

`AdminSkuStockModule`, the controller, both request/response schema files, all
five B01 application classes and `inventory-admin-actor.ts` are byte-unchanged.
The only B01-facing edit is that `InventoryModule` now re-exports the shared
module instead of binding local providers, so B01 resolves the promoted
implementation rather than a copy.

`apps/api/test/integration/admin-sku-stock-api.integration.spec.ts` passes
against the composed application: lazy `ensureStockRow`, truthful availability,
audited adjustment, mandatory reason, negative stock rejected, no COP fake stock
row, Admin-only security — all through the shared implementation.

## 12. OpenAPI / generated client

```text
OPENAPI_BEFORE            = 88 paths / 95 operations / 195 schemas
OPENAPI_AFTER             = 88 paths / 95 operations / 195 schemas  (unchanged)
APP8_B02_HTTP_OPERATIONS  = 0
OPENAPI_REGEN             = NOT_REQUIRED_BY_CHANGE_IMPACT
API_CLIENT_REGEN          = NOT_REQUIRED_BY_CHANGE_IMPACT
```

Verified by change impact rather than by reflex regeneration: the complete
changed-file list (§15) contains no controller, no DTO or request/response
schema, no Swagger decorator, no operation-id source and no module that
registers a controller. The one module edited — `InventoryModule` — has no
`controllers` array and never had one. There is therefore no contract input that
could have moved the document.

## 13. Test command ledger

Run from `apps/api`, `apps/worker` and `packages/persistence`. Every command
names the input that justified it; no passing command was repeated on unchanged
input.

| # | Command | Why run | Result |
|---:|---|---|---|
| 1 | `packages/persistence` → `pnpm exec tsc --noEmit` | six files moved into the package with rewritten imports | pass |
| 2 | `packages/persistence` → `pnpm run build` | `apps/api` resolves the package through `dist` | pass |
| 3 | `apps/api` → `pnpm exec tsc --noEmit` | contract path, `SkuId` re-export and module composition changed | pass |
| 4 | `apps/api` → `jest src/modules/inventory/tests/integration/inventory-races.integration.spec.ts` | first run of the CC-21 arbiter and its two new cases | 6/6 pass |
| 5 | negative control: lock removed, package rebuilt, `jest … -t "CC-21"` | prove the two new cases are not vacuous | 2 failed, as required (§8.1) |
| 6 | lock restored → `packages/persistence` → `pnpm run build` | restore the repaired input | pass |
| 7 | `apps/api` → `jest src/modules/inventory/tests/integration test/integration/admin-sku-stock-api.integration.spec.ts src/modules/inventory/presentation` | the whole inventory implementation closure moved; B01's HTTP surface must still resolve it | 6 suites / 82 tests pass |
| 8 | `packages/persistence` → `pnpm run lint` | new source directory in the package | pass |
| 9 | `apps/api` → `pnpm run lint` | changed API sources | 3 pre-existing errors, see §17 |
| 10 | `prettier --write` over the changed/added governed files | formatting gate on changed files only | 3 reformatted |
| 11 | `apps/api` → `jest …/inventory-races.integration.spec.ts` | rerun justified: prettier reformatted that spec file after run 4 | 6/6 pass |
| 12 | `apps/api` → `jest src/modules/inventory/inventory-persistence.contract.spec.ts` | the new structural composition guard | 4/4 pass |
| 13 | `apps/api` → `pnpm exec eslint src/modules/inventory …/placement-hierarchy.port.ts` | the contract spec was added after run 9 | pass |
| 14 | `apps/worker` → `pnpm exec tsc --noEmit` | the package index the worker consumes gained exports | pass |

## 14. Deliberately not run

| Not run | Why |
|---|---|
| full monorepo Jest, full API suite, full DB suites | no demonstrated impact; the changed implementation closure is inventory persistence and its two consumers, all covered above |
| `packages/persistence` unit/integration suites (`platform/`, `query/`, `runtime/`, `transaction/`) | none of their imports changed; the addition is a new sibling directory |
| worker suites, including `canonical-order-authority.spec.ts` | no `apps/worker` file changed and the order/payment contracts it asserts on are untouched; the worker typecheck (run 14) is the change-impact proof |
| APP7 payment acceptance, production suites, Admin UI, Storefront | outside the change closure |
| DB9 benchmarks (`db9-cp2-*.bench.ts`) | they import `InventoryModule` and `SKU_STOCK_REPOSITORY`, both of which still resolve — proven by the API typecheck and by the token identity the contract suite asserts. A benchmark measures latency, not correctness, and nothing here changes a read path. |
| Playwright / E2E, Docker full stack | no UI and no runtime topology change |
| the future `payment.verified` → reservation worker acceptance | `APP8-W01` is not implemented; §11.4 forbids it here |
| OpenAPI regeneration | §12 — no contract input changed |

## 15. Changed files

**Moved** (6, rename-detected):

```text
apps/api/src/modules/inventory/domain/repositories/sku-stock.repository.ts
apps/api/src/modules/inventory/infrastructure/persistence/stock-anchor.ts
apps/api/src/modules/inventory/infrastructure/persistence/inventory-commitments.ts
apps/api/src/modules/inventory/infrastructure/persistence/inventory-reservations.ts
apps/api/src/modules/inventory/infrastructure/persistence/reservation-eligibility.guard.ts
apps/api/src/modules/inventory/infrastructure/persistence/drizzle-sku-stock.repository.ts
  -> packages/persistence/src/inventory/*.ts
```

**Added** (5):

```text
packages/persistence/src/inventory/inventory-identity.ts
packages/persistence/src/inventory/inventory-persistence.module.ts
apps/api/src/modules/inventory/domain/repositories/sku-stock.repository.ts   (re-export)
apps/api/src/modules/inventory/inventory-persistence.contract.spec.ts
docs/implementation/reports/APP8-B02-COMPLETION-REPORT.md                    (this file)
```

**Modified** (6):

```text
packages/persistence/src/index.ts
packages/persistence/src/inventory/inventory-reservations.ts   (CC-21 repair)
apps/api/src/modules/inventory/inventory.module.ts
apps/api/src/modules/catalog/domain/repositories/placement-hierarchy.port.ts
apps/api/src/modules/inventory/tests/integration/inventory-races.integration.spec.ts
docs/implementation/phases/APP8-INVENTORY-AND-PRODUCTION.md     (§12 roadmap)
```

## 16. File-size disposition

| File | Lines | Limit | Note |
|---|---:|---:|---|
| `packages/persistence/src/inventory/inventory-reservations.ts` | 331 | 400 | above the 300 review threshold. The growth is the CC-21 arbiter and the docblock stating the lock order — behaviour a future reader must not have to reconstruct. Splitting it would separate the three reservation lifecycle operations from the lock that arbitrates two of them, which is the opposite of a responsibility split. |
| `packages/persistence/src/inventory/drizzle-sku-stock.repository.ts` | 198 | 400 | unchanged from delivery |
| `packages/persistence/src/inventory/sku-stock.repository.ts` | 161 | 400 | unchanged |
| `packages/persistence/src/inventory/inventory-commitments.ts` | 154 | 400 | unchanged |
| `packages/persistence/src/inventory/stock-anchor.ts` | 137 | 400 | unchanged |
| `packages/persistence/src/inventory/inventory-persistence.module.ts` | 59 | 400 | new |
| `packages/persistence/src/inventory/reservation-eligibility.guard.ts` | 37 | 400 | unchanged |
| `packages/persistence/src/inventory/inventory-identity.ts` | 20 | 400 | new |
| `packages/persistence/src/index.ts` | 185 | 400 | +30 |
| `apps/api/…/inventory/inventory.module.ts` | 31 | 400 | net −2 |
| `apps/api/…/inventory/domain/repositories/sku-stock.repository.ts` | 29 | 400 | re-export only |
| `apps/api/…/catalog/domain/repositories/placement-hierarchy.port.ts` | 59 | 400 | +8 |
| `apps/api/…/inventory/tests/integration/inventory-races.integration.spec.ts` | 397 | 600 | +156, below the 500 test threshold |
| `apps/api/…/inventory/inventory-persistence.contract.spec.ts` | 96 | 600 | new |

Nothing exceeds a hard maximum.

## 17. Non-blocking findings

| Id | Finding | Owner |
|---|---|---|
| `FU-APP8-B02-01` | **Pre-existing, unchanged: three ESLint `no-unnecessary-type-assertion` errors** in `apps/api/src/modules/design/application/deciding/approve-design-version.use-case.ts` (lines 194/241/285). Identical to `FU-APP8-B01-04`, which recorded them as confirmed present at entry HEAD with the B01 changes stashed. Not absorbed — `APP8-B02` §12 forbids it and unrelated refactoring is forbidden mid-checkpoint. This row exists only so the `apps/api` lint result in §13 is not mistaken for a regression. | unassigned (APP6 owner) |
| `FU-APP8-B02-02` | **`findReservation` is now the only unlocked reservation read on the contract.** It is correct as a lookup and no terminal path uses it, but it remains available to a future caller who might mistake it for a decision-grade read. If `APP8-B03`/`B04` need a reservation for a decision, they must take the lock, not call this. Recorded rather than removed: it is part of the delivered AGG-07 contract. | `APP8-B04` |
| `FU-APP8-B02-03` | **The inventory structural guard lives in `apps/api`, not `apps/worker`.** Its order sibling lives beside the capability it guards. Once `APP8-W01` creates the worker reservation capability, the "imports nothing from another application" and "writes no canonical inventory row" halves belong there too, scoped to that directory. | `APP8-W01` |

Carried forward untouched, as `APP8-B02` §12 requires: `FU-APP8-B01-01`
(low-stock-threshold authoring), `FU-APP8-B01-02` (ledger pagination),
`FU-APP8-B01-04` (see above), `FU-APP8-B01-05` (GET stock lock behaviour).
`FU-APP8-B01-03` remains closed.

## 18. Scope exclusions honoured

No `payment.verified` handler, no worker registry change, no new HTTP operation,
no manual reservation endpoint, no reservation expiry, no soft-hold producer, no
production persistence promotion, no production job creation/transition/
cancellation, no Admin UI, no Storefront UI, no Figma, no APP9 work, no artifact
generation, no migration, no new queue or idempotency architecture, no
third-party concurrency library. Dependency manifests are unchanged — the
promotion needed nothing the package did not already have.

## 19. Roadmap

```text
R00   COMPLETE
G01   COMPLETE          (corrected by APP8-G01-C1)
B01   COMPLETE
B02   COMPLETE
W01   INCOMPLETE — Next
B03   INCOMPLETE
B04   INCOMPLETE
D01   INCOMPLETE
A01   INCOMPLETE
A02   INCOMPLETE
A03   INCOMPLETE
E01   INCOMPLETE
X01   INCOMPLETE
```

Exactly one `Next`. `docs/implementation/phases/APP8-INVENTORY-AND-PRODUCTION.md`
§12 carries the same table.

## 20. Stop

```text
APP8-B02 = COMPLETE
NEXT_CHECKPOINT = APP8-W01
NOT_PUSHED = true
```

`APP8-W01` is not started.
