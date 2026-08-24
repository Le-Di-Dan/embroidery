# APP8-B01 — Inventory Runtime Composition and Admin Stock Operations

## 1. Verdict

```text
APP8-B01 = COMPLETE
NEXT_CHECKPOINT = APP8-B02
NOT_PUSHED = true
```

Gap A is closed. `InventoryModule` is composed into the running API through a
new `AdminSkuStockModule`, a Catalog SKU acquires its `sku_stocks` anchor
lazily and idempotently through the inventory path, and an Admin can read
truthful availability, read the movement ledger, and apply an audited
adjustment that is refused — writing nothing — when it would take stock below
zero. No migration was added, no reservation concurrency was touched, and no
production code was opened.

## 2. Branch and commit evidence

```text
BRANCH        = production
ENTRY_HEAD    = 363565c4fbd96e9c1127e4b0118a44e12ee77904
                docs(app8): correct the cancellation authority boundary (APP8-G01-C1)
FINAL_COMMIT  = recorded by the commit that carries this report
PUSHED        = no
```

The commit hash is not restated in a second commit: this report is committed
*with* the implementation, so the hash is the commit's own.

## 3. HTTP operations delivered

```text
APP8_B01_HTTP_OPERATIONS = 3
```

| Method | Path | Operation id | Guards |
|---|---|---|---|
| `GET` | `/api/admin/skus/{skuId}/stock` | `adminSkuStock_get` | `AuthenticatedAdminGuard` |
| `POST` | `/api/admin/skus/{skuId}/stock/adjustments` | `adminSkuStock_adjust` | `AuthenticatedAdminGuard` + `StaffOriginGuard` + `StaffJsonBodyGuard` |
| `GET` | `/api/admin/skus/{skuId}/stock/ledger` | `adminSkuStock_ledger` | `AuthenticatedAdminGuard` |

The canonical prediction of **3** stands; it was not reduced to 2. Operation C
is the ledger read rather than an availability list, chosen on repository
truth: `listLedger` is a **delivered** contract with no HTTP consumer and
`inventory_ledger_entries` is the INV-14 rebuild source that explains every
change to `quantity_on_hand`, so publishing it costs no new persistence code.
An all-SKU availability list would have needed a query the accepted port does
not have, invented before `APP8-A01` exists to say what it must contain —
which §6 forbids.

`admin/skus` is shared with `APP7-B01`'s `PATCH /api/admin/skus/{skuId}`. That
is deliberate and safe: each B01 route adds a `stock` segment, so Nest matches
on segment count and method regardless of registration order. The contract
suite asserts the whole `/api/admin/skus` surface is exactly these three plus
that untouched PATCH, so a fourth route fails the build rather than slipping
in.

**No set-absolute operation.** The delivered repository authority is
delta-based; an absolute write would discard whatever a concurrent transaction
had just committed.

## 4. Runtime composition changes

| Change | File |
|---|---|
| New surface module, importing `InventoryModule`, `IdentityModule`, `DatabaseModule`, `AuditModule`, `AuditContextModule` | `apps/api/src/modules/inventory/admin-sku-stock.module.ts` |
| `AdminSkuStockModule` registered in the composition root | `apps/api/src/bootstrap/app.module.ts` |

```text
INVENTORY_RUNTIME_BASELINE (entry) = PHYSICAL + REPOSITORY_DELIVERED — NOT RUNTIME_COMPOSED
INVENTORY_RUNTIME_BASELINE (exit)  = PHYSICAL + REPOSITORY_DELIVERED + RUNTIME_COMPOSED + HTTP_EXPOSED
```

`InventoryModule` itself is **unchanged**: no controller was mounted on it, so
the DB7/DB8 inventory suites and the DB9 benchmarks still resolve a repository
without booting the APP1 authentication stack. `ProductionModule` is untouched.
Nothing was promoted to `@embroidery/persistence` — that is `APP8-B02`'s
IMP-D054 work (`PO-APP8-006`), and B01 needed none of it because only the API
writes stock in this checkpoint.

## 5. How Gap A was closed

`SkuStockAnchorProvisioner.ensure(skuId)` is the first and only non-test caller
of `ensureStockRow`. All three operations call it inside their own transaction
before touching stock.

- **Lazy and inventory-owned**, as `APP8-B01` §5 prefers. `APP7-B01`'s SKU
  authoring was not reopened, and Catalog still does not know a stock model
  exists.
- **Idempotent by the database.** `ensureStockRow` inserts
  `ON CONFLICT DO NOTHING` against `uq_sku_stocks__sku` (CST-014) and then
  reads. Nothing in the application counts, retries or coordinates.
- **Zero is the repository's initial value**, not an invented business default:
  an anchor that has never been adjusted describes a SKU with nothing on hand.
  The first real quantity arrives only through the audited adjustment.
- **No COP fake row.** Every route is keyed on `skuId`. A COP subject has
  `sku_id IS NULL` and no SKU id to address, so the surface makes the
  `PO-APP8-001` COP branch unrepresentable rather than merely avoided.
- **The FK is the authority on existence.** There is no `skus` read and no
  Catalog port in this module's injector. `fk_sku_stocks__sku_id` (REL-026)
  decides, and its `REFERENCE_NOT_FOUND` is translated to
  `INVENTORY_SKU_NOT_FOUND` (404). `RECORD_NOT_FOUND` is deliberately **not**
  translated — that is `ensureStockRow`'s "the insert conflicted but the row
  could not be read" branch, a real fault, and it travels on as one.

This reading is consistent with the `sku_stocks` docblock — rows "are created by
admin stock initialisation, **not lazily on the order path**". This *is* the
admin path.

## 6. Schema

```text
INVENTORY_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED — honoured
MIGRATIONS_ADDED             = 0
```

No table, column, constraint, index or trigger was added or altered. No
convenience stock table, no duplicated available quantity, no cached reservation
total, no new audit table, no new role table, no speculative index.

## 7. Security and guard wiring

- `AuthenticatedAdminGuard` at controller level, on all three routes.
- `StaffOriginGuard` + `StaffJsonBodyGuard` on the one mutation.
- The Admin id is **never a parameter**: `requireInventoryAdminActorId` reads
  the actor the guard bound, and takes nothing but the context service. This
  matters because `inventory_ledger_entries.admin_id` is no-FK evidence — the
  database would accept a fabricated id, so the application is the whole of its
  integrity.
- No new role model, no customer grant, no step-up, no internal token, no
  permission table.
- No public or customer route exists; the contract suite asserts that no
  `/api/public` path mentions stock, inventory or a ledger.

## 8. Error semantics

Two new codes, both inventory-specific, both justified under §9 by the
repository genuinely lacking a way to express the failure:

| Code | Status | Why an existing code did not serve |
|---|---|---|
| `INVENTORY_SKU_NOT_FOUND` | 404 | Whether the SKU exists is the FK's answer, and a sanitised `REFERENCE_NOT_FOUND` names no subject an operator can act on. |
| `INVENTORY_STOCK_WOULD_GO_NEGATIVE` | 409 | `ck_sku_stocks__quantity_non_negative` (CST-061/INV-18) stays the backstop, but a CHECK violation reaches the operator as a generic constraint failure. DB3 LC-17 is explicit that the GRD-023 override covers adjustments and **never** negative stock. |

Everything else reuses a delivered mechanism and adds no vocabulary: a
malformed id or body is the Zod pipe's `400` (including a zero delta, a
fractional delta and a blank reason), no session is `401`, a foreign origin is
`403`, a non-JSON body is `415`, and an unexpected fault is the platform
filter's sanitised `500`.

## 9. OpenAPI

```text
OPENAPI_BEFORE = 85 paths / 92 operations / 191 schemas
OPENAPI_AFTER  = 88 paths / 95 operations / 195 schemas
DELTA          = +3 paths / +3 operations / +4 schemas
```

The four new schemas are `AdjustSkuStockBody`, `AdminSkuStockResponse`,
`AdminSkuStockLedgerResponse` and `AdminSkuStockLedgerEntryResponse`. No
existing operation id, path or schema changed.

## 10. Generated client

Regenerated (`CMD-API-CLIENT-GENERATE`) and verified up to date
(`CMD-API-CLIENT-CHECK`, tree hash
`1af38e2e55096e73e06959162699b1fc72c18939ac255ef4f6f735c087448399`). Two
generated files changed; neither was hand-edited.

## 11. Command ledger

| Command/check | Exact changed question/input | Result | Reruns | Why sufficient |
|---|---|---|---|---|
| `pnpm --filter @embroidery/api exec tsc --noEmit` | the new module, application layer, DTOs and controller compile against the accepted ports | PASS | 2 — first run found a duplicate identifier and a missing export; second run after the `HttpException` type-import fix | The workspace's own typecheck is the only thing that proves the new graph and the extended `LedgerEntry` type line up. |
| `CMD-TEST-APP8-B01-UNIT` | the adjustment body's rules and the three published operations | PASS (38 tests) | 1 — the first run predated the platform's `X-Request-ID` parameter and `500` response augmentations, which the assertions had not accounted for | Docker-free; builds the real OpenAPI document in process, so it also proves the surface is reachable from the composition root. Re-run once more after the `stock-operations.errors.ts` import fix, since that file is in its closure. |
| `CMD-TEST-APP8-B01-API` | the whole B01 stack over HTTP against a real database | PASS (14 tests) | 2 — a uuid7 prefix collision in the suite's own SKU codes, then the stale CTX-INV fixture below | The only place "a refused adjustment committed no ledger row" can be proved, because it counts rows directly. |
| `CMD-TEST-INVENTORY-PERSISTENCE-INTEGRATION` | `listLedger` now projects `occurredAt` — this suite directly exercises `listLedger` | PASS (17 tests) | 1 — first run red on the pre-existing fixture defect in §14 | §13.2 requires running an existing suite exactly when the change touches code it exercises. It does. |
| `pnpm exec prettier --write` (changed files only) | formatting of the changed governed files | PASS | 0 | Global control, applied to the changed files only. |
| `pnpm --filter @embroidery/api lint` | ESLint over the changed workspace | PASS for every changed file | 1 — one `consistent-type-imports` error of mine, fixed | Global control at the smallest supported scope. Three pre-existing errors in an unrelated APP6 file are recorded in §14, not fixed here. |
| `CMD-OPENAPI-GENERATE` | three new operations changed the contract | PASS | 0 | One generation pass, taken after the contract suite was already green. |
| `CMD-OPENAPI-CHECK` | the committed artifact matches the code | PASS | 0 | The drift gate. |
| `CMD-API-CLIENT-GENERATE` / `CMD-API-CLIENT-CHECK` | the contract changed, so the client must | PASS | 0 | Repository workflow for a changed operation set. |

No passing command was repeated against unchanged input; every rerun above names
the input that changed.

## 12. Tests deliberately not run, and why

| Not run | Why |
|---|---|
| `inventory-races.integration.spec.ts`, `inventory-reservations.integration.spec.ts` | B01 changed no reservation, hold or race code. CC-20/21/22 belong to `APP8-B02`; running them here would be confidence, not evidence. The one repository line B01 touched (`listLedger`'s projection) is exercised by the persistence suite that *was* run. |
| Full monorepo Jest, all API integration tests, all DB tests | Forbidden by §13.4 without a demonstrated changed dependency; there is none. |
| Playwright / any E2E project | B01 ships no UI and no customer surface. |
| Worker suites | No worker code changed; `APP8-W01` is unstarted. |
| APP7 acceptance and payment suites | Untouched. The one APP7 artifact this checkpoint shares a base path with is asserted unchanged by the B01 contract suite instead. |
| DB9 benchmarks | No query plan or index changed. |
| SonarQube | Not run: the repository's checkpoint workflow reserves it for the phase/closure policy, and a single API slice does not trigger it. Recorded here rather than silently skipped. |

## 13. Changed files

**New (12)**

```text
apps/api/src/modules/inventory/admin-sku-stock.module.ts                              77
apps/api/src/modules/inventory/domain/stock-operations.errors.ts                      90
apps/api/src/modules/inventory/application/admin/inventory-admin-actor.ts             43
apps/api/src/modules/inventory/application/admin/sku-stock.view.ts                   108
apps/api/src/modules/inventory/application/admin/sku-stock-anchor.provisioner.ts      86
apps/api/src/modules/inventory/application/admin/read-sku-stock.query.ts              58
apps/api/src/modules/inventory/application/admin/read-sku-stock-ledger.query.ts       53
apps/api/src/modules/inventory/application/admin/stock-adjustment.recorder.ts         79
apps/api/src/modules/inventory/application/admin/adjust-sku-stock.use-case.ts        125
apps/api/src/modules/inventory/presentation/admin-sku-stock.controller.ts            271
apps/api/src/modules/inventory/presentation/schemas/admin-sku-stock.request.ts        67
apps/api/src/modules/inventory/presentation/schemas/admin-sku-stock.response.ts      139
```

**New tests (3)**

```text
apps/api/src/modules/inventory/presentation/schemas/admin-sku-stock.request.spec.ts  100
apps/api/src/modules/inventory/presentation/admin-sku-stock.contract.spec.ts         351
apps/api/test/integration/admin-sku-stock-api.integration.spec.ts                    419
```

**Modified (7)**

```text
apps/api/src/bootstrap/app.module.ts                                          registers AdminSkuStockModule
apps/api/src/modules/inventory/domain/repositories/sku-stock.repository.ts    LedgerEntry gains occurredAt
apps/api/src/modules/inventory/infrastructure/persistence/
  drizzle-sku-stock.repository.ts                                             maps created_at into it
apps/api/src/modules/inventory/tests/integration/inventory-fixture.ts         pre-existing defect repair (§14)
packages/contracts/openapi/openapi.generated.json                             regenerated
packages/api-client/src/generated/embroidery-api.ts                           regenerated
packages/api-client/src/generated/embroidery-api.schemas.ts                   regenerated
```

The `LedgerEntry` extension is one mapped column, not a new abstraction: an
operational stock history without a timestamp is not usable, `created_at` has
been on the table since DB7, and the ledger is append-only so the value never
moves. Ordering still comes from the identity sequence.

## 14. File-size disposition

Every changed application file is inside policy — source ≤ 400, tests ≤ 600.
Largest source file is the controller at 271 (below the 300 review threshold);
largest test is the HTTP suite at 419.

`apps/api/src/bootstrap/app.module.ts` is 315 lines and crossed the 300 review
threshold before this checkpoint; B01 added 13 lines of registration and
comment. It is a composition root that is almost entirely documentation of why
each module is registered, and splitting it is not this checkpoint's call —
recorded, not acted on.

## 15. Findings routed onward (all nonblocking)

| Id | Finding | Owner |
|---|---|---|
| `FU-APP8-B01-01` | **No operation sets `low_stock_threshold`.** The signal is published truthfully from the column and the Q-20 predicate, but the column is `NULL` on every lazily created anchor, so `lowStock` is currently always `false`. Threshold authoring needs a fourth operation or a widened adjustment body, and `APP8-B01` §6 forbids inventing one before the screen exists. | `APP8-A01` (or the checkpoint that first needs the alert) |
| `FU-APP8-B01-02` | **The ledger page is capped at 100 with a `truncated` flag, not paginated.** `listLedger` is the delivered contract and returns a SKU's whole history; adding a paging parameter to an accepted port before a screen exists would be speculative. IDX-115 already supports `(sku_stock_id, id)` keyset paging when it is needed. | `APP8-A01` |
| `FU-APP8-B01-03` | **Pre-existing (repaired here): the shared CTX-INV fixture was stale.** `seedInventoryChain` did not supply `product_sides.code` or `embroidery_areas.code`, both made `NOT NULL` by a later migration, so **every** DB7/DB8 inventory integration suite was red at entry HEAD for a reason unrelated to inventory. Two literal values were added because B01 changed `listLedger` and could not otherwise run the suite that exercises it. No production code was involved. | closed here |
| `FU-APP8-B01-04` | **Pre-existing: three ESLint errors in `apps/api/src/modules/design/application/deciding/approve-design-version.use-case.ts`** (`no-unnecessary-type-assertion`, lines 194/241/285). Confirmed present at entry HEAD with the B01 changes stashed. Left alone — unrelated refactoring is forbidden mid-checkpoint. | unassigned (APP6 owner) |
| `FU-APP8-B01-05` | **The stock read takes the anchor row lock.** `SkuStockRepository.availability` is a decision-grade computation and locks by design (GRD-014), so a GET serialises against concurrent inventory writes on the same SKU. At the locked scale (one row per SKU, dozens of SKUs — DB5 Q-20/Q-32) that is one indexed row touch, and the alternative is a number nobody can act on. Recorded so a future high-volume reading of this surface is a decision rather than a surprise. | `APP8-A01` |

## 16. Scope exclusions honoured

No reservation worker, no CC-21 release-vs-consume repair, no soft-hold
producer, no expiry sweep, no production job creation, transition or
cancellation, no customer UI, no Admin UI, no Figma, no APP9 work, no
cancellation/refund saga, no production artifact, no migration, no
queue/broker change. `releaseReservation` and `consumeReservation` are byte-for-
byte unchanged; the lock order is unchanged; isolation stays `READ COMMITTED`
with explicit row locks and no `SERIALIZABLE` anywhere.

## 17. Acceptance criteria

- [x] Inventory runtime is composed into the running API.
- [x] A valid Catalog SKU can obtain/use its `sku_stocks` anchor through the B01 inventory path.
- [x] Stock-row creation is idempotent.
- [x] No COP fake stock row is created.
- [x] Admin can read truthful stock/availability information.
- [x] Admin can perform an audited stock adjustment.
- [x] Adjustment reason is mandatory.
- [x] Negative resulting stock is rejected.
- [x] Failed adjustment leaves no committed adjustment ledger row.
- [x] Existing inventory repository/anchor logic is reused rather than duplicated.
- [x] No reservation concurrency repair is mixed into B01.
- [x] No schema migration exists.
- [x] Admin security guards follow current conventions.
- [x] OpenAPI accurately contains the new APP8-B01 operations.
- [x] Generated client is reconciled.
- [x] Focused change-impact tests pass.
- [x] No unjustified broad regression is run.
- [x] Changed application source/test files respect size policy.
- [x] Canonical phase table marks B01 complete with exactly one `NEXT = B02`.
- [x] Completion report exists.
- [x] Nothing is pushed.

## 18. Roadmap status

```text
R00   COMPLETE
G01   COMPLETE          (corrected by APP8-G01-C1)
B01   COMPLETE          (3 HTTP operations; InventoryModule composed; Gap A closed)
B02   INCOMPLETE — Next
W01   INCOMPLETE
B03   INCOMPLETE
B04   INCOMPLETE
D01   INCOMPLETE
A01   INCOMPLETE
A02   INCOMPLETE
A03   INCOMPLETE
E01   INCOMPLETE
X01   INCOMPLETE
```

```text
NEXT_CHECKPOINT = APP8-B02
NOT_PUSHED = true
```
