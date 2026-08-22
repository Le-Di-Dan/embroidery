# APP7-W01-C1 — Correction Report

- Checkpoint: `APP7-W01-C1` — eliminate duplicated Order persistence / GRD-009 authority
- Parent checkpoint: `APP7-W01`
- Mode: `NARROW ARCHITECTURE CORRECTION`
- Correction budget: `1 / 1`
- Branch / HEAD at entry: `production` @ `0784e73`
- Date: 2026-08-22
- Verdict: **`APP7-W01-C1 = COMPLETE`**

---

## 1. Verdict block

```text
APP7-W01-C1 = COMPLETE
APP7-W01    = COMPLETE — CORRECTED (C1)
APP7-W01-C2 = MUST_NOT_BE_CREATED

DEFECT             = W01_DUPLICATED_ORDER_PERSISTENCE_AUTHORITY
DEFECT_DISPOSITION = REMOVED

CANONICAL_ORDER_REPOSITORY  = packages/persistence/src/order/drizzle-order.repository.ts
                              (DrizzleOrderRepository, bound to ORDER_REPOSITORY by
                               packages/persistence/src/order/order-persistence.module.ts)
CANONICAL_ORDER_CHAIN_GUARD = packages/persistence/src/order/order-chain.guard.ts
                              (OrderChainGuard)

API_ORDER_PERSISTENCE_CONSUMER    = apps/api/src/modules/order/order.module.ts
                                    imports + re-exports OrderPersistenceModule
WORKER_ORDER_PERSISTENCE_CONSUMER = apps/worker/src/jobs/order-conversion/order-conversion.module.ts
                                    imports OrderPersistenceModule; the use case injects
                                    ORDER_REPOSITORY

WORKER_LOCAL_GRD009_IMPLEMENTATION          = NONE
WORKER_LOCAL_CANONICAL_ORDER_CREATED_WRITER = NONE

ORDER_CREATED_EVENT   = exactly once
TRANSACTION_ATOMICITY = PRESERVED
CC11                  = PASS

HTTP_OPERATIONS_DELTA = 0
SCHEMA_CHANGE     = NONE
MIGRATION_CHANGE  = NONE
OPENAPI_CHANGE    = NONE
API_CLIENT_CHANGE = NONE

NEXT_CHECKPOINT = APP7-B02
```

---

## 2. The defect, and why the original reasoning failed

`APP7-W01` wrote the Order aggregate, its items, the obligation pair and the canonical
`order.created` with SQL of its own, and restated GRD-009 as `WorkerOrderChainGuard`. The
stated reason was correct as far as it went — the worker may not import `apps/api` — and the
conclusion drawn from it was wrong.

**A runtime boundary is a reason to share authority, not to copy it.** Every behavioural
suite passed, which is exactly the problem: a second implementation of a chain check does
not fail a test. It fails years later, when one copy is corrected and the other is not, and
an order pairs customer A's approved artwork with customer B's accepted price — while every
foreign key in the schema stays satisfied. That is the precise failure G-DB7-05 / INV-19
exists to catch, and W01 had built a second place for it to go wrong.

`APP7-R00` had already said what should have happened:

> `OrderRepository.createFromAcceptedQuotation` already carries GRD-009, G-DB7-05 and the
> SE-006 outbox append in one transaction. APP7 does **not** re-implement that; it supplies
> the caller, the item projection and the obligation pair.

C1 makes that literally true.

---

## 3. Target architecture, delivered

```text
                 packages/persistence  (@embroidery/persistence)
                 ├── src/order/     OrderChainGuard, DrizzleOrderRepository,
                 │                  DrizzleOrderShippingRepository, order-row.mapper,
                 │                  order-transitions, order.repository (contract),
                 │                  ordering-identity, OrderPersistenceModule
                 └── src/payment/   DrizzlePaymentObligationRepository,
                                    PaymentEvidenceRepository, payment-row.mapper,
                                    deposit-eligibility adapter + port,
                                    payment-obligation.repository (contract),
                                    PaymentPersistenceModule
                          ▲                                    ▲
                          │                                    │
        apps/api  OrderModule / PaymentModule      apps/worker  OrderConversionModule
        (import + re-export the modules)           (imports the same modules)
```

```text
ONE implementation          ✔  DrizzleOrderRepository / OrderChainGuard exist once
TWO application consumers   ✔  API and Worker resolve the same classes and tokens
ZERO app-to-app imports     ✔  asserted structurally
ZERO duplicated chain guard ✔  WorkerOrderChainGuard deleted
```

### Why `@embroidery/persistence` and not a new package

Audited before moving anything. The package is already *"the NestJS persistence runtime
(DB7)"*, already depends on `@embroidery/database`, `drizzle-orm` and `pg`, already exports
a Nest module (`DatabaseModule`), and is already a dependency of **both** applications. The
whole moved cluster depends on nothing else — no cross-module type imports beyond two small
Ordering identities (§4.3). Creating a new top-level package would have been a way of
avoiding the decision, which `APP7-W01-C1` §3 explicitly forbids; putting database
persistence into `@embroidery/domain-types` would have made a Drizzle/PostgreSQL dependency
out of a package deliberately kept free of one.

The package description is widened to say so honestly: it now names the shared AGG-15 /
AGG-16 persistence alongside the runtime and the platform primitives.

### Why AGG-16 moved too

`APP7-W01-C1` §6 permits a worker-local seam **only** for facts the canonical repositories
do not already own. `PaymentObligationRepository.createForOrder` owns obligation creation,
and the worker had been inserting `payment_obligations` with its own SQL — the identical
defect, one aggregate over. Two writers of the DEPOSIT/REMAINING pair are free to drift on
currency, on the initial state, or on which quotation version an amount is attributed to.
With one correction available, leaving it would have guaranteed a `C2`.

---

## 4. Files moved, deleted and added

### 4.1 Moved (git-tracked renames, behaviour unchanged)

```text
apps/api/src/modules/order/domain/repositories/order.repository.ts
  -> packages/persistence/src/order/order.repository.ts
apps/api/src/modules/order/domain/lifecycle/order-transitions.ts
  -> packages/persistence/src/order/order-transitions.ts
apps/api/src/modules/order/infrastructure/persistence/order-chain.guard.ts
  -> packages/persistence/src/order/order-chain.guard.ts
apps/api/src/modules/order/infrastructure/persistence/order-row.mapper.ts
  -> packages/persistence/src/order/order-row.mapper.ts
apps/api/src/modules/order/infrastructure/persistence/drizzle-order.repository.ts
  -> packages/persistence/src/order/drizzle-order.repository.ts
apps/api/src/modules/order/infrastructure/persistence/drizzle-order-shipping.repository.ts
  -> packages/persistence/src/order/drizzle-order-shipping.repository.ts

apps/api/src/modules/payment/domain/repositories/payment-obligation.repository.ts
  -> packages/persistence/src/payment/payment-obligation.repository.ts
apps/api/src/modules/payment/domain/repositories/deposit-eligibility.port.ts
  -> packages/persistence/src/payment/deposit-eligibility.port.ts
apps/api/src/modules/payment/infrastructure/persistence/payment-row.mapper.ts
  -> packages/persistence/src/payment/payment-row.mapper.ts
apps/api/src/modules/payment/infrastructure/persistence/payment-evidence.repository.ts
  -> packages/persistence/src/payment/payment-evidence.repository.ts
apps/api/src/modules/payment/infrastructure/persistence/drizzle-payment-obligation.repository.ts
  -> packages/persistence/src/payment/drizzle-payment-obligation.repository.ts
apps/api/src/modules/payment/infrastructure/persistence/drizzle-deposit-eligibility.adapter.ts
  -> packages/persistence/src/payment/drizzle-deposit-eligibility.adapter.ts
```

The only edits inside the moved files are **import paths** — `@embroidery/persistence`
became relative (`../runtime/database-executor`, `../repository/drizzle-repository`,
`../platform/outbox-event-store`), and sibling paths collapsed to `./`. No statement, no
guard, no refusal code, no mapping and no transaction annotation changed.

### 4.2 Deleted

```text
D apps/worker/.../infrastructure/persistence/order-chain.guard.ts   (WorkerOrderChainGuard)
```

Deleted outright, not renamed, wrapped or reduced to a helper. There is no thin adapter
either: the worker injects `ORDER_REPOSITORY` and the guard runs inside it, so DI needed no
shim.

### 4.3 Added

```text
A packages/persistence/src/order/ordering-identity.ts        CustomRequestId, RequestActor
A packages/persistence/src/order/order-persistence.module.ts OrderPersistenceModule
A packages/persistence/src/payment/payment-persistence.module.ts PaymentPersistenceModule
A apps/api/src/modules/order/domain/repositories/order.repository.ts        (re-export)
A apps/api/src/modules/payment/domain/repositories/payment-obligation.repository.ts (re-export)
A apps/api/src/modules/payment/domain/repositories/deposit-eligibility.port.ts       (re-export)
A apps/worker/.../tests/canonical-order-authority.spec.ts     structural recurrence guard
```

`CustomRequestId` and `RequestActor` moved because the shared `OrderRepository` contract
names them and a type a two-application contract references may not live inside one of those
applications. `custom-request.repository.ts` now imports and re-exports both, so there is
exactly **one** declaration and every delivered import is unchanged. Nothing else about
AGG-13 moved; the Custom Request is still written by the API alone.

### 4.4 Renamed, because the responsibility changed

```text
R apps/worker/.../domain/repositories/order-conversion.repository.ts
    -> conversion-authority.repository.ts
R apps/worker/.../infrastructure/persistence/sql-order-conversion.repository.ts
    -> sql-conversion-authority.repository.ts
```

`APP7-W01-C1` §6 requires the remaining seam to be named for what it actually does. It is
now **reads only** — the frozen Approval Snapshot projection, the accepted version and its
priced lines, the active-SKU set, the customer-owned product — and writes no row of any
kind. Keeping the old name would have advertised an order-conversion *repository* that no
longer converts anything.

Two members were removed from it as dead after the correction:

- `findOrderByRequest` — the replay probe now asks the canonical
  `OrderRepository.findByRequest`, so the worker no longer reads `orders` at all;
- `FrozenApprovalSnapshot.customerId` — the order's `customer_id` comes from the chain
  `OrderChainGuard` verified, so the stored customer provably matches the approval that was
  checked. `QUOTATION_BELONGS_TO_ANOTHER_REQUEST` was likewise removed from the worker's
  refusal set: it is the guard's own code, and a copy of it here would mean the worker had
  started deciding the chain again. The file records both, so neither comes back by
  accident.

### 4.5 Compatibility exports

Three, all in `apps/api`, all pure re-exports with no logic:
`order.repository.ts`, `payment-obligation.repository.ts`, `deposit-eligibility.port.ts`.

They exist because ~10 delivered consumers — the three AGG-15 suites, the two payment
suites, three DB9 benchmarks, the DB10 durability suite and the Inventory eligibility guard
— import those paths, and a re-export changes none of them. Critically, each re-exports the
**same Symbol instance**, so no injection token was split in two; that is asserted, not
assumed (§7).

### 4.6 Dependency-graph delta

```text
apps/api      dependencies unchanged
apps/worker   dependencies unchanged  (@embroidery/persistence was already one)
packages/persistence  dependencies unchanged
app-to-app edges      0 before, 0 after
```

No workspace dependency was added anywhere. The correction is a relocation, not a new edge.

---

## 5. The W01 use case after correction

```text
transaction
  claim order.create on (request, approval snapshot)
    replay?      -> return the recorded order, write nothing
    in progress? -> transient, come back
  OrderRepository.findByRequest              — replay a swept claim
  re-read the Approval Snapshot, require it to name this request
  resolve the exactly-one ACCEPTED quotation version
  resolve the frozen subject (one ACTIVE SKU, or the frozen COP)
  project the frozen lines from the accepted version's priced lines
  OrderRepository.createFromAcceptedQuotation   -> GRD-009, orders, order_items, order.created
  PaymentObligationRepository.createForOrder    -> DEPOSIT
  PaymentObligationRepository.createForOrder    -> REMAINING
  complete the claim with the replayable result
commit
```

The use case keeps exactly what is W01's: decoding the hand-off, coordinating the claim,
reading the frozen conversion inputs, resolving the subject, projecting the lines, and
owning the transaction. It **does not** pre-validate the chain and hand the repository a
boolean — the guard's own identity is what must be single, not merely its answer.

The projection now emits the canonical `OrderItem` type from the shared package rather than
a worker-local look-alike, so what it builds is exactly what the aggregate freezes.

---

## 6. Atomicity and `order.created`

`TransactionManager.runInTransaction` is still opened in the use case, and both canonical
repositories participate in it through the ambient `transactionContext` their executor
resolves — the same mechanism by which they participate in an API use case's transaction. No
change to the shared repositories' transaction seam was needed: `@requiresTransaction`
already meant "join the caller's", and it does.

```text
order.create claim + authority re-read + Order + OrderItems
  + DEPOSIT + REMAINING + order.created + claim completion
```

still commit together or not at all. No nested independent commit, no second connection, no
`try`/`catch` inside the boundary, no network call (INV-23).

`order.created` is appended **only** by `DrizzleOrderRepository.createFromAcceptedQuotation`.
The worker appends none — asserted structurally (§7) and behaviourally: one successful
conversion produces exactly one event, and duplicate delivery, replay and the CC-11 race all
produce no second one.

---

## 7. Structural recurrence guard

`apps/worker/src/jobs/order-conversion/tests/canonical-order-authority.spec.ts` — 7
assertions, deliberately small, over this one capability. It scans production source only
(`tests/` excluded, comments stripped, so the files that *explain* the correction are not
counted as violating it).

| Assertion | What it prevents |
|---|---|
| `ORDER_REPOSITORY` and `PAYMENT_OBLIGATION_REPOSITORY` are the **same Symbol** in API and worker | A re-export that quietly minted its own token, splitting one binding into two |
| `OrderChainGuard` / `DrizzleOrderRepository` are published by the shared package | The canonical classes silently moving back into an app |
| No worker file declares a `*OrderChainGuard` class or lives at `*chain.guard*` | The deleted guard returning under any name |
| No worker file names `QUOTATION_BELONGS_TO_ANOTHER_REQUEST` or reads `approval_snapshots … customer_id` | The chain being re-decided by its two distinctive outputs |
| No worker file `INSERT INTO orders / order_items / payment_obligations` | A second canonical writer |
| No worker file sets `eventType: 'order.created'` | A second producer of SE-006 |
| No worker file imports from `apps/api` | The app-to-app dependency the original defect was avoiding |

It is not an architecture linter and must not grow into one. It was verified to actually
bite rather than merely pass: a temporary probe file declaring a `ProbeOrderChainGuard`,
an `INSERT INTO orders`, an `order.created` append and the guard's refusal code failed
**4 of the 7** assertions, naming the file by path. The probe was deleted and the suite
returned to 7/7.

---

## 8. Behavioural regression — only what the execution path changed

Everything below now runs through the canonical repositories, which is why each was rerun.

### 8.1 Worker conversion — 7 suites / **64 PASS**

Catalog conversion (order at `AWAITING_DEPOSIT`, exact accepted version and snapshot frozen,
`ORD-` code, exact total, one line naming the resolved SKU with snapshot display copy, both
obligations bound to the exact version, no attempt, no inventory/production row, one
`order.created`, `order.create` claim recorded, approval untouched); COP conversion (exact
frozen COP, no fabricated Catalog identity, both obligations); duplicate delivery; the four
bounded refusals (0 SKUs, >1 SKU, unaccepted quotation, foreign approval snapshot — each
with zero orders); rollback leaving zero partial conversion including zero idempotency
record; frozen evidence surviving a live `products` rename.

### 8.2 CC-11 — **3 PASS**

`order-conversion-race.integration.spec.ts`, rerun because the canonical write and guard
path changed. Two separately compiled `WorkerModule` instances on independent pools against
one database — queue-claimed race, use-case-entered race, plus 4 repeats. Every round:

```text
1 Order   1 exact item set   2 obligations   1 order.created   1 idempotency record
```

### 8.3 The three DB7 Order suites — 3 suites / **36 PASS**

`order.integration.spec.ts`, `order-outbox.integration.spec.ts`,
`order-races.integration.spec.ts`. Rerun because their canonical implementation moved and
their module wiring changed. The AGG-15 fixture repair from `APP7-W01` is intact and
untouched.

### 8.4 Payment persistence — **29 PASS**

`payment-persistence.integration.spec.ts`, rerun for the same reason: the AGG-16
implementation it directly executes moved. `payment-races` was **not** rerun — no
concurrency behaviour changed, and the moved files are byte-identical apart from import
paths.

`inventory` suites were **not** run. The Inventory eligibility guard consumes
`DEPOSIT_ELIGIBILITY_PORT` through a pure re-export of the same Symbol; typecheck proves the
resolution and no behaviour it executes changed.

---

## 9. Accepted W01 behaviour, unchanged

Nothing in §10 of the directive was reopened. Quotation selection, the money values and the
35 %/40 % question, OrderItem cardinality, Catalog/COP semantics, SKU eligibility,
idempotency scope, the effect key, the worker retry taxonomy, the order code format, the
`ORDER_CREATION` job kind and the AGG-15 fixture values are all exactly as `APP7-W01`
delivered them, and their suites pass unchanged. No new business decision was made.

---

## 10. Command ledger

| Command / check | Changed architectural question | Result | Reruns | Why sufficient |
|---|---|---|---:|---|
| `grep` over `apps/api` for every importer of the Order/Payment persistence paths | Who breaks if these files move? | 10 consumers, all through the two contract files | 0 | Settled the compatibility-re-export decision before a single move |
| `pnpm --filter @embroidery/persistence build` | Does the package still compile with two aggregate areas and no self-import? | **PASS** | 1 | Run 1 before the module-export fix, run 2 after — a changed input |
| `pnpm --filter @embroidery/api typecheck` | Do all 10 consumers still resolve through the re-exports? | **PASS** | 1 | Rerun after the Nest module-export fix — a changed input |
| `pnpm --filter @embroidery/worker typecheck` | Does the worker compile against the canonical contracts? | **PASS** | 2 | Run 2 red on a dead `customerId` in a spec fixture; run 3 clean — each a changed input |
| `npx jest .../canonical-order-authority.spec.ts` (worker) | Is the duplication structurally impossible to reintroduce? | 7/7 **PASS** | 2 | Run 1 flagged the fixture and legitimate reads (regex too loose); run 2 flagged this file's own explanatory comments; run 3 clean after scoping to production source and stripping comments — each a changed input |
| `npx jest src/jobs/order-conversion` (worker) | Does the whole conversion still behave through the canonical repositories? | 7 suites / **64 PASS** | 1 | Run 1 after rewiring, run 2 after removing the dead fixture field — a changed input |
| `npx jest .../order.integration .../order-outbox .../order-races` (api) | Do the DB7 suites survive the extraction and rewiring? | 3 suites / **36 PASS** | 1 | Run 1 red — `Nest cannot export a provider that is not part of the currently processed module`; the fix is to re-export the module, not the token. Run 2 green |
| `npx jest .../payment-persistence.integration.spec.ts` (api) | Does the moved AGG-16 implementation still behave? | **29 PASS** | 0 | Smallest proof for the moved payment cluster; `payment-races` needs no rerun |
| `npx eslint` — persistence `src`, api order+payment, worker capability | Lint across every changed area | clean, 0 findings | 0 | — |
| `npx prettier --write` on all changed files | Format | 3 files reformatted, rest unchanged | 0 | — |
| `git diff --check` | Whitespace errors | clean | 0 | — |
| `sha256sum` + `node -e` over `openapi.generated.json`; `git status` on contracts / api-client / migrations; migration count | Did the contract, client or schema move? | `44faf1fb…b549a80`, 74/81/170, clean, 36 migrations | 0 | Read-only boundary check; **no** generation run |
| `wc -l` over every moved and changed source file | File-size limits | largest source 365 (hard max 400) | 0 | — |

**Not run, deliberately:** `pnpm quality`, `quality:e2e`, full Jest, the full API / worker /
DB suites, `payment-races`, Inventory and Production suites, Playwright, SonarQube, and
OpenAPI or client generation. No PASS command was rerun on unchanged input; every rerun
above names the input that changed.

---

## 11. Follow-up closure

```text
FU-APP7-W01-ORDER-CHAIN-GUARD-DUPLICATION-01 = CLOSED_BY_APP7_W01_C1
```

`APP7-W01` recorded it as accepted debt. It was not debt — it was the defect, and C1 removes
it rather than routing it forward. It is not carried into `APP7-B02` or `APP7-X01`.

---

## 12. History preserved

The original `APP7-W01` report is **not** rewritten. The record reads:

```text
APP7-W01 initial implementation
  -> PO review found duplicated DB7 Order persistence / GRD-009
  -> APP7-W01-C1 extracted one canonical shared implementation, consumed by both apps
```

`APP7-W01-COMPLETION-REPORT.md` §21 still states the duplication as a known risk, which is
now the accurate history of how the defect was found.

---

## 13. Acceptance criteria

All 35 conditions in the directive §20 are met:

| # | Condition | Evidence |
|---:|---|---|
| 1–4 | One Order implementation, one GRD-009, both apps consume it, no app-to-app edge | §3, §4.6, §7 |
| 5–7 | `WorkerOrderChainGuard` deleted; no copied GRD-009 SQL; no second `order.created` writer | §4.2, §4.4, §7 |
| 8–10 | `createFromAcceptedQuotation` remains canonical; refusal vocabulary and row mapping preserved | §4.1, §8.3 |
| 11 | W01 projection/read logic remains separate | §4.4, §5 |
| 12 | Obligation behaviour unchanged | §5, §8.1, §8.4 |
| 13–15 | Atomic; exactly one `order.created`; replay emits none | §6, §8.1 |
| 16 | CC-11 on real independent actors | §8.2 |
| 17–20 | Catalog, COP, wrong chain refuses with zero Order, rollback leaves nothing | §8.1 |
| 21–23 | Money, REQ/QUO/ORD generator and AGG-15 fixture untouched | §9 |
| 24 | Three DB7 Order suites pass after extraction | §8.3 |
| 25–27 | No schema/migration; no HTTP/OpenAPI/client; no B02 work | §1, §10 |
| 28–30 | Change-impact tests only; no broad regression; no rerun on unchanged input | §10 |
| 31–34 | Report exists; follow-up closed; `C2 = MUST_NOT_BE_CREATED`; B02 sole Next | §1, §11, §14 |
| 35 | Nothing pushed | §14 |

---

## 14. Commits

```text
956364a  feat(app7): consume design.approved into exactly one order (APP7-W01)   [parent, unamended]
0784e73  docs(app7): record APP7-W01 completion and advance the roadmap (APP7-W01) [parent, unamended]
59399f6  refactor(app7): share one canonical Order and Payment persistence (APP7-W01-C1)
<this commit> docs(app7): record APP7-W01-C1 and mark W01 corrected (APP7-W01-C1)
```

No `R00` / `G01` / `B01` / `W01` history was amended.

```text
NOT_PUSHED
```

---

## 15. Verdict

```text
APP7-R00 = COMPLETE
APP7-G01 = COMPLETE
APP7-B01 = COMPLETE — CORRECTED — REVIEW_ACCEPTED
APP7-W01 = COMPLETE — CORRECTED (C1)
APP7-B02 = INCOMPLETE — Next
remaining = INCOMPLETE

NEXT CHECKPOINT = APP7-B02
```

Delivered for Product Owner review. `APP7-B02` has not been started.
