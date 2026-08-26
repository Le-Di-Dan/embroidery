# APP8-X01 — Completion Report

- Phase: `APP8 — Inventory Reservation and Production Operations`
- Checkpoint: `APP8-X01` — Phase closure, baseline reconciliation and APP9 handoff
- Mode: `FINAL CLOSURE / RECONCILIATION` — documentation only
- Branch / HEAD at entry: `production` @ `18e1b42`
- Date: 2026-08-26

---

## 1. Verdict

```text
APP8-X01 = COMPLETE

APP8 = PASS_WITH_FOLLOW_UPS
BLOCKING_FOLLOW_UPS = 0
PHASE = CLOSED

OPENAPI = 92 paths / 99 operations / 206 schemas
APP8_HTTP_OPERATIONS = 7   (B01 = 3, B03 = 3, B04 = 1)

DATABASE_MIGRATIONS = 37
DATABASE_TABLES     = 79
APP8_MIGRATIONS     = 0

APP8_WORKER_HANDLERS_ADDED = 1   (payment.verified -> official inventory reservation)

APP8_FIGMA_ROWS            = 41
APP8_FIGMA_APPROVED        = 41
APP8_FIGMA_REVIEW_REQUIRED = 0
APPROVAL_EVIDENCE          = FIG-APPROVAL-APP8-D01-PO-001

E01_JOURNEYS        = 4
E01_CASES           = 14
E01_ACCEPTANCE      = PASS
E01_RUNTIME_CHANGES = 0

PRODUCTION_PERSISTENCE = API_LOCAL   (not promoted)
INVENTORY_PERSISTENCE  = @embroidery/persistence

HANDOFF_ENTRY_STATE = order PRODUCTION_COMPLETED
APP9_EXECUTION      = NONE
NEXT_PHASE          = APP9 — Remaining Payment, Fulfillment and Completion

NOT_PUSHED = true
```

Every number above is a **read** of the committed repository, not a
regeneration. No migration was applied, no OpenAPI artifact regenerated, no
generated client rebuilt, no Figma node touched, no test suite re-run. Where the
closure directive stated an expected value the repository agreed with it, with
**one measured difference from the phase plan's *prediction*** — recorded in §6.3
rather than smoothed over.

---

## 2. Branch, commits and push state

```text
Branch                production
Entry HEAD            18e1b420ed88ff4aee9104e8e031c409e67902f8
                      test(app8): deliver the focused cross-boundary acceptance (APP8-E01)
Working tree at entry clean
Pre-closure APP8 commits  14   (9676890 … 18e1b42)
Closure commits           1    (this checkpoint, local only)
Pushed                    no
```

The final commit hash is **not** recorded in this report: a second commit created
solely to record its own hash is forbidden by the brief. (`APP7-X01` used two
commits for exactly that reason; `APP8-X01` deliberately does not repeat it.)

---

## 3. Checkpoint ledger — 13 canonical checkpoints

Reconciled against the reports on disk and the commits that produced them. The
full ledger with per-checkpoint authority is in
[`APP8-CLOSURE-MATRIX.md`](./APP8-CLOSURE-MATRIX.md) §2.

```text
R00  COMPLETE
G01  COMPLETE — CORRECTED (C1) — REVIEW_ACCEPTED
B01  COMPLETE — REVIEW_ACCEPTED
B02  COMPLETE — REVIEW_ACCEPTED
W01  COMPLETE — REVIEW_ACCEPTED
B03  COMPLETE — REVIEW_ACCEPTED
B04  COMPLETE — REVIEW_ACCEPTED
D01  COMPLETE — PRODUCT_OWNER_APPROVED
A01  COMPLETE — REVIEW_ACCEPTED
A02  COMPLETE — REVIEW_ACCEPTED
A03  COMPLETE — REVIEW_ACCEPTED
E01  COMPLETE — ACCEPTANCE PASS
X01  COMPLETE
```

No non-checkpoint intervention was required in APP8 — no unblock, no final
directive, no second correction.

---

## 4. Correction and Product Owner approval ledger

```text
G01-C1 = USED / PASS      commit 363565c — PO-APP8-005 wording only
B01-C1 = UNUSED           B02-C1 = UNUSED           W01-C1 = UNUSED
B03-C1 = UNUSED           B04-C1 = UNUSED           D01-C1 = UNUSED
A01-C1 = UNUSED           A02-C1 = UNUSED           A03-C1 = UNUSED
E01-C1 = UNUSED

D01_PO_APPROVAL       = PASS
FIG_APPROVAL_EVIDENCE = FIG-APPROVAL-APP8-D01-PO-001
```

**One correction in the whole phase.** `APP8-G01-C1` did not widen authority: it
corrected the reading of `PO-APP8-005` so that "APP8 executes no cancellation"
means no **order** cancellation/refund saga, while APP8 **does** own
production-**job** cancellation (`PLANNED` / `STARTED` → `CANCELLED` with a
mandatory reason and the release of any still-active Catalog reservation). That
distinction is what `APP8-B04` then implemented and what `APP8-E01` J4 proved.

The ten `UNUSED` records are verified by absence: only
`APP8-G01-C1-COMPLETION-REPORT.md` exists in `docs/implementation/reports/`. No
correction record was invented.

**The PO approval is D01's, recorded by A01.** The Product Owner reviewed the
**complete** `APP8-D01` package; `APP8-A01` recorded the promotion of all 41 rows
from `REVIEW_REQUIRED` to `APPROVED_FOR_IMPLEMENTATION` under
`FIG-APPROVAL-APP8-D01-PO-001`, lifted `BLOCKED_PENDING_PO_DESIGN_APPROVAL`, and
only then implemented against them. No design approval was assumed by a frontend
checkpoint.

---

## 5. Final OpenAPI baseline — read-only

Read from the committed artifact
`packages/contracts/openapi/openapi.generated.json`. **Not regenerated.**

```text
paths      = 92
operations = 99
schemas    = 206
```

The directive's expected values were `92 / 99 / 206`. The repository agrees
exactly, and nothing was regenerated to make it agree.

```text
OPENAPI_REGEN     = NOT_REQUIRED_BY_CHANGE_IMPACT
API_CLIENT_REGEN  = NOT_REQUIRED_BY_CHANGE_IMPACT
```

`APP8-X01` changes no controller, DTO, decorator or schema source, so neither
regeneration is justified (`06-OPENAPI-AND-CLIENT-CONTRACT.md`,
`VALIDATION_GOVERNANCE.md` §3).

### 5.1 Delta against the APP7 frozen baseline

```text
APP7 closing baseline    85 paths /  92 operations / 191 schemas
APP8 closing baseline    92 paths /  99 operations / 206 schemas
delta                    +7 paths /  +7 operations / +15 schemas
removed operations                    0
```

Seven new operations on seven new path keys — every APP8 operation introduced its
own path, so paths and operations move together.

---

## 6. APP8-owned HTTP operations — 7

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

`R00`, `G01` (+`C1`), `B02`, `W01`, `D01`, `A01`, `A02`, `A03` and `E01` added
**no** HTTP operation. Every backend checkpoint stayed inside the 1–5 operation
band of `04-BACKEND-API-DELIVERY-STANDARD.md`.

### 6.1 Why the three Admin screens added zero operations

`A01`, `A02` and `A03` are pure consumers of already-accepted contracts. That is
the whole point of the D01→A0n ordering: a UI checkpoint that needs a new
operation has discovered a backend gap, not a frontend task. None did.

### 6.2 Why start / complete / cancel is one operation

`POST /api/admin/production-jobs/{jobId}/transitions` is a single command
endpoint carrying the requested `LC-18` transition, not three verbs on three
paths. The guard, the order move and the reservation terminalization are one
transaction per command, so one endpoint is the honest surface.

### 6.3 Measured difference from the phase plan's prediction

```text
phase plan §11 predicted   8 operations   (B04 = 2)
repository holds           7 operations   (B04 = 1)
```

The prediction is superseded by the measurement. §11 of the phase plan is
annotated accordingly; the delivered contract is not changed to match a
pre-entry estimate.

---

## 7. Final database baseline — read-only

No migration was applied and no database was started. No DB integration suite was
run.

```text
migrations = 37   (packages/database/migrations/0000…0037)
tables     = 79   (tools/db-manifest-check.mjs: "79 table rows for 79 tables")
```

### 7.1 APP8 migration disposition

```text
APP8_MIGRATIONS = 0
APP8_TABLES     = 0
```

APP8 is a **composition** phase, not a schema phase. `APP8-R00` audited the
entry state and found the whole inventory/production persistence layer already
shipped by the DB era but **uncomposed** — no `InventoryModule`, no
`ProductionModule` in the running API. Everything APP8 delivers runs on tables
that already existed: `sku_stocks`, `inventory_reservations`,
`inventory_soft_holds`, `inventory_ledger_entries`, `production_jobs`,
`production_specifications`, `production_job_transitions`.

The highest migration on disk is still APP7's
`0037_add_app7_transfer_evidence_association.sql`. `APP8-X01` adds no schema
change of its own.

The one genuine persistence *defect* APP8 found — the missing DB3 `CC-21`
release-vs-consume arbiter, absent because DB8 renumbered the CC ids and DB3's
CC-21 row had no implementation left — was repaired by `APP8-B02` as a **row
lock in code**, not as a migration. Nothing in the schema needed to change for
it.

---

## 8. Worker-handler baseline

```text
APP8_WORKER_HANDLERS_ADDED = 1
```

Read from `apps/worker/src/bootstrap/worker.module.ts`. The worker composes six
job modules:

| Module | Owner | Kind |
|---|---|---|
| `AssetInspectionModule` | APP2-W01 | outbox capability 1 |
| `AssetNormalizationModule` | APP3-W01A | outbox capability 2 |
| `NotificationDeliveryModule` | APP4-W01 | outbox capability 3 |
| `OrderConversionModule` | APP7-W01 | outbox capability 4 |
| **`InventoryReservationModule`** | **APP8-W01** | **outbox capability 5** |
| `IntakeCleanupModule` | APP5-B02 | scheduled, not outbox |

APP8 contributed exactly one, consuming `payment.verified` and producing the
official inventory reservation set (`TR-LC17-04`). It introduced no new worker
runtime, claim filter, backoff curve, dead-letter policy or idempotency
mechanism — it reused the delivered ones.

Two APP8-appended event types have **no** consumer: `production.started` and
`production.completed` (`SE-009`, appended by `APP8-B04` in the owning
transaction). Recorded as `FU-APP8-B04-01`, nonblocking — nothing depends on them
yet, and inventing a handler for a consumer nobody has asked for would be
speculative.

---

## 9. Final Figma baseline — read-only

Read from `docs/design/FIGMA_DESIGN_INDEX.md`. No Figma node was opened, created
or mutated, and `tools/check-figma-design-index.mjs` was **not** re-run: `X01`
changes no registry row, which is the only condition that would justify running
it (`CMD-CHECK-FIGMA-DESIGN-INDEX`, scoped validation —
`VALIDATION_GOVERNANCE.md`, `SCOPED_COMMAND_INDEX.md`).

```text
APP8 registry rows           = 41
APPROVED_FOR_IMPLEMENTATION  = 41
REVIEW_REQUIRED (APP8)       =  0
SUPERSEDED / STALE (APP8)    =  0
Approval Evidence            = FIG-APPROVAL-APP8-D01-PO-001  (all 41 rows)
FIGMA_RUNTIME_DESIGN_GATE    = SATISFIED
```

Page `APP_08` (`766:3`), root section `771:3`, nine sub-sections, 41 frames.

One row is named `FIG-APP8-STALE-CONFLICT-SPEC` (`787:149`) — a frame **name**
describing the "state changed — reload" specification, not a registry status; its
status is `APPROVED_FOR_IMPLEMENTATION` like the other 40. Recorded so a future
grep for `STALE` in the registry is not misread.

Registry consumers, each of which recorded its exact node IDs in its own report:
`APP8-A01` (`/kho/skus/{skuId}`), `APP8-A02` (`/san-xuat`), `APP8-A03`
(`/san-xuat/{jobId}`).

---

## 10. Admin route baseline

The Admin application now serves 21 route files. APP8 added three:

```text
/kho/skus/{skuId}      APP8-A01   SKU stock workspace
/san-xuat              APP8-A02   production queue
/san-xuat/{jobId}      APP8-A03   production job detail
```

Sidenav: APP8 added **one** entry, `Sản xuất`. `Kho` was **not** added, and its
absence is deliberate and recorded — there is no parameterless inventory
destination to point at, because an all-SKU stock list would need an operation
`APP8-B01` does not publish (`FU-APP8-A01-04`). Inventory reachability is the
per-line link from the order detail. Adding a nav entry to a route that needs a
`skuId` would have been a dead link dressed as navigation.

Both APP8 route identities are Vietnamese while every earlier Admin route is an
English slug. That is the D01-approved identity, implemented as briefed, and is
carried as the nonblocking IA follow-up `FU-APP8-A01-03`. `X01` renames nothing.

---

## 11. Inventory authority — as delivered

```text
GET  /api/admin/skus/{skuId}/stock
POST /api/admin/skus/{skuId}/stock/adjustments
GET  /api/admin/skus/{skuId}/stock/ledger

UI: /kho/skus/{skuId}
```

| Authority | Delivered |
|---|---|
| on-hand / held / reserved / available | yes — server truth, including a valid **negative** available, rendered without being clamped |
| audited signed adjustment | yes — mandatory reason, duplicate-submit guard, post-write re-read, `INVENTORY_STOCK_WOULD_GO_NEGATIVE` refusal |
| bounded ledger | yes — capped page with a `truncated` flag and a truncation notice, and deliberately **no** pagination affordance for a contract that has no paging (`FU-APP8-B01-02`) |
| low-stock signal | read-only, from the column and the `Q-20` predicate |
| threshold authoring | **no** — no operation sets `low_stock_threshold`; the column is `NULL` on every lazily created anchor, so `lowStock` is currently always `false` (`FU-APP8-B01-01`) |
| all-SKU list | **no** |
| manual reservation mutation | **no** |
| `skuCode` on the response | **no** — the surface labels by shortened `skuId` with the full value in `title` (`FU-APP8-A01-01`) |

`SkuStockRepository.availability` takes the anchor row lock by design
(`GRD-014`), so the stock `GET` is decision-grade and serialises against
concurrent writes on the same SKU (`FU-APP8-B01-05`).

---

## 12. Reservation authority — as delivered

```text
payment.verified -> official inventory reservation
```

| Authority | Delivered |
|---|---|
| source of quantities | the **frozen** order items, never a live catalog or quotation read |
| aggregation | per SKU, so one reservation identity per `(order_id, sku_stock_id)` — `CST-016`, **not** per order item |
| branch | **Catalog only** |
| COP | creates **no** inventory identity, no SKU, no reservation — and its absence renders as an ordinary valid state, never as "missing" |
| atomicity | one atomic multi-SKU reservation set per order; partial reservation is not a reachable outcome |
| idempotency / runtime | the existing worker mechanisms, reused unchanged |
| lazy stock-anchor creation on the order path | **no** |
| expiry | none — `PO-APP8-001` locks no-expiry reservations |

Canonical inventory persistence lives under `@embroidery/persistence`
(`APP8-B02`, IMP-D054), and `APP8-B02` proved no API-local inventory persistence
remains: a source scan of `apps/api` for `from 'drizzle-orm'` and for the
inventory table objects returns empty. The `CC-21` release-vs-consume arbiter is
a row lock in `reservation-terminalization.ts`, shared by the by-id and
by-`(order, SKU)` entry points so it cannot be bypassed by a new caller. The
per-SKU Catalog requirement aggregation in `reservation-requirements.ts` is the
**same** code the worker reserves with and `APP8-B04` consumes with.

---

## 13. Production authority — as delivered

```text
POST /api/admin/orders/{orderId}/production-jobs
GET  /api/admin/production-jobs
GET  /api/admin/production-jobs/{jobId}
POST /api/admin/production-jobs/{jobId}/transitions

UI: /san-xuat, /san-xuat/{jobId}
```

Lifecycle (`LC-18`):

```text
PLANNED -> STARTED
STARTED -> COMPLETED
PLANNED -> CANCELLED
STARTED -> CANCELLED
```

Start atomically commits, in one transaction:

```text
job    PLANNED      -> STARTED
order  DEPOSIT_PAID -> IN_PRODUCTION
Catalog reservations RESERVED -> CONSUMED
```

Complete atomically commits:

```text
job    STARTED        -> COMPLETED
order  IN_PRODUCTION  -> PRODUCTION_COMPLETED
```

Cancel releases only what is still `RESERVED` and moves **no** order.

| Authority | Delivered |
|---|---|
| creation gate | `DEPOSIT_ELIGIBILITY_PORT` (`GRD-013`) against the order-resolved Approval Snapshot |
| specification | frozen in the same transaction as creation — never a live catalog, quotation or design-session read |
| lock order | `orders → production_jobs → inventory_reservations → sku_stocks` |
| decision-grade reads | every terminal decision is taken under the row lock; `ORDER_RESERVATION_SUMMARY_PORT` is **not injected** into the transition module at all, so an unlocked read is unreachable from a decision path |
| COP / mixed | a COP-only order starts with 0 required and 0 reservation rows; a mixed order consumes its Catalog rows only and fabricates no COP row |
| production-job cancellation | owned by APP8, with a mandatory reason; explicitly **separate** from commercial order cancellation/refund, in code and in the approved copy |
| actor on creation | **none** — `production_jobs` / `production_specifications` have no actor column, and `DB3_AUDIT_SPECIFICATION.md`'s production row is scoped to start/complete/cancel. B04 wrote those three transitions and invented nothing for creation (`FU-APP8-B03-01`) |
| operator / machine assignment, priority, SLA, attempts, claims, artifacts, rework | **none** — out of scope by `G01`, and recorded as scope exclusions on `FIG-APP8-SCOPE-BOUNDARY` rather than merely absent |

**Production persistence remains API-local.** It lives at
`apps/api/src/modules/production/infrastructure/persistence/`; `packages/persistence/src/`
has no `production/`. §11 of the phase plan predicted "inventory + production"
promotion; `APP8-B02` narrowed it to inventory, and this report records the
repository, not the prediction. No claim of production-persistence promotion is
made anywhere in the APP8 closure set.

---

## 14. E01 final acceptance evidence — reused, not re-run

```text
APP8-E01            = COMPLETE
ACCEPTANCE          = PASS
JOURNEYS            = 4
CASES               = 14   (budget 14, no exception used)
RUNTIME CHANGES     = 0
HTTP OPERATIONS     = 0 added
MIGRATIONS          = 0
FIGMA ROWS          = 0
OPENAPI             = 92 / 99 / 206, file unmodified
BLOCKING DEFECTS    = 0
```

| Journey | Subject |
|---|---|
| J1 | inventory — stock read, audited adjustment, ledger |
| J2 | `payment.verified` → official reservation, through the real worker runtime |
| J3 | production — create / start / complete |
| J4 | cancellation boundary — job cancellation without order cancellation |

`APP8-E01` is delivered as **three scoped acceptance commands**, one per
workspace, because `apps/api` may not import `apps/worker` and neither may be
imported by `apps/admin`. Both new Jest configs are `maxWorkers: 1` and
`testMatch`-scoped to their own acceptance directory, so neither can become a
repository-wide aggregate (`VALIDATION_GOVERNANCE.md` §1.1). No accepted file
was modified, and no production code was changed to make a test green.

E01 found **no material product or runtime defect**. Six corrections were made to
the acceptance code itself (wrong expected values, a missing Jest transform
allowance, assertions written against the wrong DOM attribute), each named with
its rerun in E01 §15.

---

## 15. No-rerun disposition — what X01 deliberately did not execute

`APP8-E01` is the phase's final functional acceptance. Re-running a green suite
on unchanged input produces cost, not evidence.

```text
E01's 14 cases                     not re-run
B01 stock suites                   not re-run
B02 CC-21 race suites              not re-run
W01 worker acceptance              not re-run
B03 create/read suites             not re-run
B04 transition/concurrency suites  not re-run
A01 / A02 / A03 UI suites          not re-run
APP7 acceptance                    not re-run
full Jest / full Playwright        not run
DB integration suites              not run
OpenAPI generation                 not run
generated-client regeneration      not run
migration application              not run
Docker startup                     not run
the live Figma checker             not run
SonarQube                          not run
```

Every one of these has an unchanged input: `APP8-X01` touches only Markdown under
`docs/`.

---

## 16. Closure quality commands actually run

Closure is a documentation checkpoint. No implementation input changed, so no
implementation validation is justified (`VALIDATION_GOVERNANCE.md` §2 and §3).
The three global quality mechanisms are Prettier, ESLint and SonarQube; the
established closure convention (`APP7-X01` §16) runs none of them against code
because closure changes none, and this checkpoint follows it.

| Command / operation | Scope | Result |
|---|---|---|
| `node -e` count over `packages/contracts/openapi/openapi.generated.json` | OpenAPI baseline | **92 / 99 / 206** |
| the same read, filtered to `stock` / `production-job` paths | APP8 operation ownership | **7** operations, matching B01 = 3 / B03 = 3 / B04 = 1 |
| `ls packages/database/migrations/*.sql` | migration count | **37**, highest `0037_add_app7_…` |
| `node tools/db-manifest-check.mjs` | table baseline | **79 table rows for 79 tables**; all checks passed. Read-only, touches no database |
| read + count APP8 rows in `docs/design/FIGMA_DESIGN_INDEX.md` | Figma baseline | **41 rows, 41 approved, 0 `REVIEW_REQUIRED`**, evidence `FIG-APPROVAL-APP8-D01-PO-001` |
| read `apps/worker/src/bootstrap/worker.module.ts` | worker baseline | 6 job modules; APP8 contributed **1** |
| `find apps/admin/src/app -name page.tsx` | Admin route baseline | 21 routes; APP8 added **3** |
| `wc -l packages/api-client/src/index.ts` | follow-up truth | **1168** lines — `FU-APP8-A01-02` still open |
| `grep` over `apps/api/.../approve-design-version.use-case.ts` and `apps/admin/test/components/request-quotation-bootstrap.test.tsx` | follow-up truth | the pre-existing APP6 lint subjects are still present |
| `grep -oE "FU-APP8-[A-Z0-9-]+"` over the APP8 reports | follow-up reconciliation | 26 distinct APP8 `FU`/`NF` items plus 6 carried in, all classified in §17 |
| `git log --oneline` over the APP8 range | commit ledger | **14** pre-closure APP8 commits reconciled |
| `node tools/check-report-secrets.mjs` | every report (the tool takes no path argument) | **0 findings** in `APP8-X01-COMPLETION-REPORT.md` and `APP8-CLOSURE-MATRIX.md`; 1 pre-existing finding in `APP6-B04-COMPLETION-REPORT.md:93` (§17.4) |
| `git diff --check` | whitespace | clean |
| `git status` | working tree | clean after the closure commit |

**Prettier: not applicable.** `.prettierignore` excludes `docs/` as a locked
baseline, so the global Prettier control does not format documentation and none
was applied. **ESLint: not applicable** — no JavaScript or TypeScript file
changed. **SonarQube: not run** — the established closure convention does not
require it here, and inventing it would be a new gate, not a closure activity.

No tooling was modified. Extending a checker is an implementation change, and
`X01` has no authority to make one.

---

## 17. Follow-up reconciliation

The full matrix, with the reasoning for each item, is
[`APP8-CLOSURE-MATRIX.md`](./APP8-CLOSURE-MATRIX.md) §7. Summary:

```text
CLOSED                =  5
CLOSED_FALSE_POSITIVE =  2
NONBLOCKING_OPEN      = 20
ROUTED_TO_LATER_PHASE =  2
NOT_RELEVANT_TO_APP8  =  3

BLOCKING_FOLLOW_UPS   =  0
```

Duplicates were merged rather than counted twice: `FU-APP8-A01-01` =
`NF-APP8-A03-01` (SKU code), `FU-APP8-A01-02` = `NF-APP8-A03-04` (api-client
barrel), `FU-APP8-B01-04` = `FU-APP8-B02-01` (APP6 API lint),
`FU-ADMIN-SHARED-DIALOG-01` = `NF-APP8-A03-03` (dialog debt), and
`FU-APP8-D01-SECRET-CHECKER-APP6-B04-01` =
`FU-APP6-B04-REPORT-SECRET-HEURISTIC-01` (report secret heuristic).

### 17.1 Closed inside APP8

```text
FU-APP8-B01-03  CLOSED_BY_APP8-B01   stale shared CTX-INV fixture repaired
FU-APP8-B02-03  CLOSED_BY_APP8-W01   structural guard moved beside the capability
FU-APP8-B02-02  CLOSED_BY_APP8-B04   unlocked reservation read unreachable from a decision path
FU-APP8-B03-02  CLOSED_BY_APP8-B04   consume decides under FOR UPDATE, not from a summary
NF-APP8-A03-05  CLOSED_BY_APP8-A03   over-broad absence assertion correctly narrowed
```

### 17.2 Routed to APP9

```text
FU-APP8-W01-01  a remaining-payment payment.verified would dead-letter today
FU-APP8-B04-02  a cancelled job leaves the order mid-lifecycle with nothing scheduled
```

Both are APP9's by construction, not oversights. `PO-APP8-005` says APP8 does not
run the commercial saga; a phase that recorded these as its own blockers would be
claiming scope `G01` denied it.

### 17.3 Nonblocking open — the themes the directive named

Every theme listed in the closure directive was reconciled against current
repository truth rather than carried forward as prose:

| Theme | Current truth |
|---|---|
| SKU code absent in Inventory/Reservation UI | still absent — neither response publishes `skuCode`; a contract change, not a UI change |
| oversized `packages/api-client/src/index.ts` | **measured at closure: 1168 lines** (1078 at entry) — still over the 400-line hard limit |
| route-language inconsistency | `/kho/…` and `/san-xuat` remain the D01-approved identities; nothing renamed |
| no Inventory sidenav | still true, and still correct — no all-SKU route exists to link |
| queue copy / `orderId` UX notes | unchanged; UX refinements, no defect |
| shared Admin dialog debt | now **nine** hand-rolled modal shells |
| `production.started` / `production.completed` consumer absence | confirmed — appended, unclaimed, nothing depends on them |
| production cancellation / recovery saga absence | correct by `PO-APP8-005`; routed to APP9 |
| idempotency retention / sweeper | no sweeper; the swept-claim replay path stays unreachable |
| low-stock-threshold authoring | no operation authors it; `lowStock` is therefore always `false` today |
| ledger pagination | none — the contract has no paging and the design offers no affordance for one |
| approval-pointer revision behavior | `ADR-DB3-003` r4 permits a move; no delivered path moves it; B04 refuses a start whose approval no longer matches |
| production creation actor attribution | none — the audit specification scopes actor evidence to start/complete/cancel |
| unrelated APP6 / storefront lint and style debt | verified still present: 3 API lint errors, 1 admin test lint error, 19 storefront styling violations — **all pre-existing, none APP8's** |

### 17.4 Pre-existing cross-phase item

`tools/check-report-secrets.mjs` takes no path argument — it scans every report in
the repository at once. It reports one line in `APP6-B04-COMPLETION-REPORT.md`
(line 93: a `token` followed by what the heuristic reads as a plaintext value).
That file predates APP8 and no APP8 checkpoint touched it.

It is classified as **APP6-owned and nonblocking**, and APP6 history is **not**
rewritten to absorb it. Editing a closed phase's accepted report from inside
APP8's closure would falsify the record of what APP6 knew when it closed. The
two documents this checkpoint wrote return **0 findings**, which is the evidence
`APP8-X01` owes.

### 17.5 Nothing was implemented to close

```text
threshold authoring          not implemented
all-SKU inventory list       not implemented
ledger pagination            not implemented
shared dialog refactor       not implemented
route renaming               not performed
api-client barrel split      not performed
production notification handlers   not implemented
cancellation / recovery saga not implemented
approval pointer revision    not implemented
idempotency sweeper          not implemented
APP9 remaining payment / shipping / delivery / refund / artifacts   not implemented
```

Closure records debt. It does not pay it, and it does not create new checkpoints
to pay it.

---

## 18. No implementation repair in X01

Reconciliation found **no true runtime blocker**. Every discrepancy it found was
documentation-level: the phase document's header and §12 roadmap block still read
`A03 is NEXT` and `X01 INCOMPLETE — Next` after `A03` and `E01` were committed and
accepted, the master roadmap still carried APP8 as `IN PROGRESS` listing only ten
complete checkpoints, and §11's predicted operation total (8) had been overtaken
by the delivered one (7). Those are corrected here — that is what
documentation-only reconciliation means.

```text
production source changed   = 0 files
test source changed         = 0 files
schema / migrations changed = 0 files
generated artifacts changed = 0 files
Figma nodes changed         = 0
tooling changed             = 0 files
.env written                = never
```

Had a runtime blocker appeared, the correct outcome was `APP8-X01 = BLOCKED` and
`PHASE = OPEN`, with no repair attempted inside `X01`. None appeared.

---

## 19. Files changed

| File | Change |
|---|---|
| `docs/implementation/reports/APP8-X01-COMPLETION-REPORT.md` | new — this report |
| `docs/implementation/reports/APP8-CLOSURE-MATRIX.md` | new — the audit-grade closure matrix |
| `docs/implementation/phases/APP8-INVENTORY-AND-PRODUCTION.md` | header and §12 statuses reconciled to final; §11 annotated with the measured operation total; phase marked `CLOSED` |
| `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | APP8 marked complete and closed with its measured baselines; the next phase advanced to APP9 |

**Location note.** The directive named
`docs/implementation/APP8-CLOSURE-MATRIX.md`, but every prior closure matrix
(`APP2`…`APP7`) lives in `docs/implementation/reports/`. The instruction to use
"prior phase closure-matrix convention" is followed, and the file is placed with
its six siblings rather than orphaned one directory up. This is recorded rather
than done silently.

---

## 20. X01 file-size disposition

```text
logic/source files changed = 0
test files changed         = 0
```

The 400-line source and 600-line test limits are not engaged: `X01` changed only
Markdown under `docs/`, which repository configuration excludes from the
file-size gate. The one open file-size violation in the repository —
`packages/api-client/src/index.ts` at 1168 lines — is `FU-APP8-A01-02`, carried
nonblocking and **not** touched here (§17.5).

---

## 21. Final phase verdict

```text
APP8-X01 = COMPLETE

APP8 = PASS_WITH_FOLLOW_UPS
BLOCKING_FOLLOW_UPS = 0
PHASE = CLOSED
```

`PASS_WITH_FOLLOW_UPS` rather than `PASS` because 20 nonblocking items and 2
APP9-routed items genuinely remain open. None prevents accepted APP8 scope or the
terminal handoff.

---

## 22. Terminal handoff

```text
APP8 terminal success state:
  production_job.status = COMPLETED
  order.status          = PRODUCTION_COMPLETED

APP8 executed none of:
  PRODUCTION_COMPLETED -> AWAITING_FINAL_PAYMENT
  remaining payment            shipping
  delivery                     refund
  commercial cancellation saga final settlement
  artifacts                    approval-pointer revision

HANDOFF_ENTRY_STATE = order PRODUCTION_COMPLETED
APP9_EXECUTION      = NONE
```

APP9 begins at `TR-LC14-05`: the Admin moves an order at `PRODUCTION_COMPLETED`,
whose production job is `COMPLETED`, to `AWAITING_FINAL_PAYMENT` against the
`REMAINING` obligation `APP7-W01` created alongside `DEPOSIT` and deliberately
left unsatisfied. Creating that obligation was APP7's; executing it is APP9's,
and APP8 neither collects it nor touches it.

---

## 23. Next phase

Read from `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` §2, not from
memory:

```text
NEXT_PHASE = APP9 — Remaining Payment, Fulfillment and Completion
```

Scope, as the roadmap states it: remaining obligation, fulfillment freeze, and
completion / cancellation / refund according to locked policy — delivered as a
Customer order/payment and Admin fulfillment package.

`APP9-R00` was **not** started. No APP9 code, table, route, module, report or
roadmap entry was created by this checkpoint.

---

## 24. Push state

```text
NOT_PUSHED = true
```

One local closure commit on `production`. Nothing was pushed, no branch was
created, no pull request opened, no tag written.

**STOP.** APP9 does not begin here.
