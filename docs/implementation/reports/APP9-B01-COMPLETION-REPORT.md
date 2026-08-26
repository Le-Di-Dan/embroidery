# APP9-B01 — Final-Payment Lifecycle Entry (`TR-LC14-05`) — Completion Report

## 1. Verdict

```text
APP9-B01                 = COMPLETE
TR_LC14_05               = DELIVERED
APP9_B01_HTTP_OPERATIONS = 1
MIGRATIONS_ADDED         = 0
WORKER_CHANGES           = 0
NOTIFICATION_INTENTS     = 0
PROVIDER_WEBHOOK_CHANGES = 0
BLOCKING_FINDINGS        = 0
NEXT_CHECKPOINT          = APP9-B02
NOT_PUSHED               = true
```

## 2. Branch, HEAD, commit and push state

```text
BRANCH          production
ENTRY_HEAD      1c54326  docs(app9): lock commerce completion authority (APP9-G01)
COMMIT          not committed — the working tree carries the change for review
PUSHED          no
```

Nothing was pushed. No remote was contacted.

## 3. Scope delivered

Exactly `TR-LC14-05`, and nothing from `B02`/`B03`/`B04`/`B05`:

```text
PRODUCTION_COMPLETED  -> AWAITING_FINAL_PAYMENT
actor:                   ADMIN
required domain fact:    a live REMAINING obligation exists for the order
effect:                  the order enters AWAITING_FINAL_PAYMENT, and the
                         already-existing REMAINING obligation becomes payable
                         by lifecycle state
```

Not implemented, and confirmed absent from the diff: customer `REMAINING` read,
QR generation, bank-transfer instructions, payment attempt initiation, transfer
evidence, Admin verification, `TR-LC14-06`, `payment.verified` changes, worker
changes, shipping read/write, fee acknowledgement, dispatch, freeze, snapshot,
delivery, completion, Figma, Admin frontend, Storefront frontend, cancellation,
refund, notification intents, carrier tracking, migrations.

## 4. HTTP operation added

```text
NEW_APP9_B01_HTTP_OPERATIONS = 1
```

One, and no helper endpoint. There is no separate "make payable" route, no
"remaining eligibility" probe, and no generic lifecycle endpoint beside a
B01-specific one.

## 5. Route and operation ID

```text
POST /api/admin/orders/{orderId}/transitions
operationId  adminOrder_transition
success code ORDER_TRANSITIONED           HTTP 200
body         { "to": "AWAITING_FINAL_PAYMENT" }   strict, one-member enum
```

Chosen from repository convention, not invented: `POST {id}/transitions` with a
typed target is the shape `adminCustomRequest_transition` (`APP5-B05`) and
`adminProductionJob_transition` (`APP8-B04`) already publish, and `200` rather
than `201` because the appended `order_transitions` row has no id of its own.

The operation id joins `APP7-B02`'s published `adminOrder` domain through a new
`CONTROLLER_DOMAIN_KEYS` entry (`AdminOrderLifecycleController: 'adminOrder'`),
the same mechanism ten other split surfaces use. Without it the split module
would have minted `adminOrderLifecycle_transition`, letting a composition
decision name a public identifier. `adminOrder_list` and `adminOrder_detail` are
unchanged, asserted in the contract suite.

The target enum has exactly one member. `READY_FOR_DELIVERY` is `TR-LC14-06`'s
(a consequence of verification, not a command), `DELIVERED` and `COMPLETED` are
`APP9-B05`'s, and `ON_HOLD`/`CANCELLING` need a reason and belong to the deferred
cancellation branch. A later checkpoint widens the enum by delivering the
behaviour behind the value.

## 6. Actor and authorization boundary

```text
AuthenticatedAdminGuard   controller level   (APP1, unchanged)
StaffOriginGuard          on the mutation    (APP1, unchanged)
StaffJsonBodyGuard        on the mutation    (APP1, unchanged)
```

No new actor type, no customer version, no public `REQUEST_ACCESS` route, no
weakening of any existing guard. The handler accepts no operator identity: the
ADMIN actor is bound by the guard and read back inside the use case
(`requireOrderLifecycleAdminId`), never from a body, header or parameter. A
non-ADMIN bound actor is treated as a wiring fault and travels to the platform
filter as a sanitised 500, not shaped into an ordinary refusal.

## 7. Source and target lifecycle state

```text
SOURCE  PRODUCTION_COMPLETED   (asserted explicitly, against the locked row)
TARGET  AWAITING_FINAL_PAYMENT
```

Canonical LC-14 names only. No alias (`READY_FOR_HANDOFF`, `FULFILLED`,
`FINAL_PAYMENT_PENDING`) appears anywhere in the change.

The source state is asserted **in addition to** the delivered legality machinery,
not instead of it. `isLegalOrderTransition` remains the repository's authority
and is re-checked inside `OrderRepository.transition`, but LC-14 legality alone
cannot express this guard: `ON_HOLD → AWAITING_FINAL_PAYMENT` is a *legal* move —
it is the resume path — so a legality-only check would let a held order open
final payment. No alternative state graph is hard-coded in the controller; the
controller holds no lifecycle rule at all.

## 8. Live `REMAINING` guard behaviour

Read through the one AGG-16 authority, kind-aware:

```text
PaymentObligationRepository.findLiveForOrder(orderId, 'REMAINING')
  -> filters kind = REMAINING
  -> filters status in (PENDING, SATISFIED), matching
     uq_payment_obligations__order_kind__live, so at most one row can qualify
  -> filters order_id, so another order's obligation is invisible
```

Consequences, each proved by a test:

- a `DEPOSIT` obligation cannot satisfy the guard — an order carrying only a
  `DEPOSIT` is refused;
- a `SUPERSEDED` `REMAINING` row is not live and is refused;
- a missing `REMAINING` obligation is a domain refusal
  (`ORDER_REMAINING_PAYMENT_MISSING`, HTTP 409), **never** a repair: no
  obligation is created, and the obligation count is asserted unchanged;
- the command does not create, recalculate, supersede or satisfy the obligation.
  Its amount, currency, status and `satisfied_at` are asserted byte-identical
  after a successful transition.

No payable flag was invented. There is no `payable` column, no derived readiness
field, and the contract suite forbids `payable`, `isPayable` and `paid` as
property names. The order's LC-14 state *is* the window.

No amount is derived. No `total - deposit`, no quotation read, no sum over frozen
lines, and the receipt deliberately publishes no amount or currency at all.

Refusal semantics follow the repository's established pattern — a closed failure
union with an exhaustive `Record` to `HttpException`, mirroring
`admin-order-read.errors.ts` and `production-operations.errors.ts`. No new
generic error system was introduced.

## 9. Transaction and concurrency behaviour

```text
one runInTransaction wraps every guard read and the one write

1. orders FOR UPDATE   OrderRepository.loadForUpdate — the decision's own lock
2. payment_obligations read (not locked) inside the same transaction; the
                       order lock already serialises every competing B01
                       command, so a second lock would add contention without
                       adding a guarantee
3. orders              OrderRepository.transition — re-checks LC-14 legality and
                       appends order_transitions, inside the same transaction
```

No new locking framework, no advisory lock, no `SERIALIZABLE`, no `NOWAIT`. The
delivered `loadForUpdate` seam — added by `APP8-B04` for exactly this shape of
command — is reused unchanged.

Guarantees:

- **two concurrent B01 commands cannot append two effective transitions.** Both
  contend on the same `orders` row; the loser reads the committed
  `AWAITING_FINAL_PAYMENT` and fails the source-state assertion.
- **the command cannot transition from stale order state.** Every fact the guards
  use is read after the lock is taken; nothing is decided from an unlocked read.
- **the `REMAINING` guard is evaluated against authoritative persistence** — the
  canonical repository, inside the transaction, never a cached or projected
  summary.
- **no partial lifecycle write survives a failure.** There is one write and it is
  inside the transaction the guards hold.

## 10. Replay behaviour

```text
REPLAY_BEHAVIOUR = DETERMINISTIC_DOMAIN_REFUSAL
```

The repository-consistent behaviour, reported as it actually is rather than
forced into a preferred shape: `TR-LC14-05` is legal from one state, so after the
first command commits the order is no longer in it and a retry meets
`ORDER_INVALID_TRANSITION` (HTTP 409). No second idempotency subsystem was
introduced and no shared idempotency policy was changed.

Proved: after a second identical request, exactly one `order_transitions` row has
`to_status = AWAITING_FINAL_PAYMENT`, and the `outbox_events` and `audit_events`
counts are unchanged from immediately after the first.

## 11. Side effects actually produced

```text
orders                    status updated, updated_at stamped
order_transitions         one appended row:
                            from PRODUCTION_COMPLETED
                            to   AWAITING_FINAL_PAYMENT
                            event_kind STATE_CHANGE
                            actor_kind ADMIN, admin_id = the bound operator
                            correlation_id = the request id
outbox_events             0 appended
audit_events              0 appended
payment_obligations       0 written
payment_attempts          0 written
notification_intents      0 written
```

The `order_transitions` row is the repository's own existing behaviour, preserved
rather than re-implemented: it carries LC-14's actor and correlation evidence,
which is the "audit / transition metadata already required by repository
conventions". Nothing else was invented — see §22 for the one deliberate
non-emission routed forward as nonblocking.

## 12. Confirmation — no notification intent

```text
NOTIFICATION_INTENTS_ADDED = 0
```

No `notification_intents` row, no email, no SMS, no notification template, no
customer communication retry, and no module in the change imports a notification
authority. `APP9-G01` §8 keeps customer communication in APP10, and the success
test asserts the `audit_events` and `outbox_events` counts are unmoved.

## 13. Confirmation — no provider or webhook behaviour

```text
PAYMENT_MVP = MANUAL_BANK_TRANSFER   (preserved)
```

No payment provider, provider checkout, callback, webhook or automatic bank
reconciliation appears in the change. The contract suite forbids `providerKey`,
`providerRef`, `webhook` and `callback` anywhere in the B01 schemas — name,
description or example. The final-payment amount remains the existing live
`REMAINING` obligation, and B01 neither reads nor publishes it.

## 14. Confirmation — no migration or schema change

```text
MIGRATIONS_ADDED = 0
SCHEMA_CHANGES   = 0
```

`git status packages/database/migrations` is empty. No table, column, constraint,
index or trigger was added or altered. No ad-hoc SQL for `orders` or
`payment_obligations` was written anywhere in the runtime change; the only raw
SQL added is in the test harness, for reading committed state back and for
manufacturing one `SUPERSEDED` obligation whose writer belongs to `APP9-B04`.

## 15. OpenAPI before and after

Measured, not predicted:

```text
OPENAPI_PATHS_BEFORE       92
OPENAPI_PATHS_AFTER        93     (+1)
OPENAPI_OPERATIONS_BEFORE  99
OPENAPI_OPERATIONS_AFTER  100     (+1)
OPENAPI_SCHEMAS_BEFORE    206
OPENAPI_SCHEMAS_AFTER     208     (+2)

APP9_B01_OWNED_OPERATIONS   1     adminOrder_transition
```

The two new schemas are `TransitionAdminOrderBody` and
`AdminOrderTransitionResultResponse` — the request and the receipt of the one new
operation. The before figures match the `APP9-R00` entry baseline recorded in the
phase document.

## 16. Generated-client disposition

The repository's normal flow was followed and nothing was hand-edited:

```text
pnpm --filter @embroidery/api openapi:generate        (CMD-OPENAPI-GENERATE)
pnpm --filter @embroidery/api-client generate         (CMD-API-CLIENT-GENERATE)
pnpm --filter @embroidery/api-client check:generated  (CMD-API-CLIENT-CHECK)  PASS
```

Generated diff: `+31` lines in `embroidery-api.ts` (the `adminOrderTransition`
operation and its result type), `+80` lines in `embroidery-api.schemas.ts` (the
two new schemas and the envelope type), `+321` lines in
`openapi.generated.json`. Additions only — no generated line was removed or
rewritten, so no accepted operation id or type was reissued. Client tree hash
`f1788a56521bfd1dd0f084b95339275e4870e79f16e7cd890aec1fbac1bcc55b`.

## 17. Focused tests actually run

```text
pnpm --filter @embroidery/api exec jest \
  --testPathPatterns="admin-order(-lifecycle)?[.]contract[.]spec" \
  --testPathIgnorePatterns=/node_modules/
    -> 2 suites, 19 tests, PASS                      (CMD-TEST-APP9-B01-CONTRACT)

pnpm --filter @embroidery/api exec jest --runInBand \
  --testPathPatterns="final-payment-entry[.]integration" \
  --testPathIgnorePatterns=/node_modules/
    -> 1 suite, 7 tests, PASS                     (CMD-TEST-APP9-B01-INTEGRATION)

pnpm --filter @embroidery/api exec jest \
  --testPathPatterns="openapi/(operation-id|build-openapi-document|openapi-artifact)[.]spec" \
  --testPathIgnorePatterns=/node_modules/
    -> 3 suites, 28 tests, PASS
       (run because `operation-id.ts` is a changed executable file)
```

Static and contract checks:

```text
pnpm --filter @embroidery/api exec tsc --noEmit                          PASS
pnpm --filter @embroidery/api exec eslint src/modules/order \
  src/openapi/operation-id.ts src/bootstrap/app.module.ts                PASS
pnpm exec prettier --check <the changed api paths>                       PASS
pnpm --filter @embroidery/api-client check:generated                     PASS
node tools/check-report-secrets.mjs                                      FAIL
  -> 2 findings, both pre-existing and neither in a B01 file:
     APP6-B04-COMPLETION-REPORT.md:93 and APP9-G01-COMPLETION-REPORT.md:381
     (the second is G01's own record of the first). This report adds no
     finding. Inherited nonblocking evidence — see FU-APP9-G01-01 in §22.
```

Both new scoped commands are indexed in
[`SCOPED_COMMAND_INDEX.md`](../SCOPED_COMMAND_INDEX.md) as
`CMD-TEST-APP9-B01-CONTRACT` and `CMD-TEST-APP9-B01-INTEGRATION`.

## 18. Cases proven

| # | Case | Evidence |
|---|---|---|
| 1 | **Success.** `PRODUCTION_COMPLETED` + live `REMAINING` + Admin actor → order `AWAITING_FINAL_PAYMENT` | `orders.status` re-read from the database; one appended `order_transitions` row with `from/to`, `STATE_CHANGE`, `ADMIN` and a persisted `admin_id`; the obligation's id, amount, currency, status and `satisfied_at` unchanged; `payment_attempts`, `outbox_events` and `audit_events` counts unmoved |
| 2a | **Missing live `REMAINING`.** Only a `DEPOSIT` exists → refused | `409 ORDER_REMAINING_PAYMENT_MISSING`; order still `PRODUCTION_COMPLETED`; obligation kinds still `['DEPOSIT']` — nothing auto-created; transition count unmoved |
| 2b | **Non-live `REMAINING`.** The row forced to `SUPERSEDED` → refused | `409 ORDER_REMAINING_PAYMENT_MISSING`; order and transition history unchanged |
| 3a | **Illegal source state.** Order `IN_PRODUCTION` → refused | `409 ORDER_INVALID_TRANSITION`; order unchanged |
| 3b | **Legal-but-wrong source state.** Order `ON_HOLD`, whose move to `AWAITING_FINAL_PAYMENT` *is* in the LC-14 `ALLOWED` set → refused | `409 ORDER_INVALID_TRANSITION`; order still `ON_HOLD`. This is the case that proves the guard is the source state, not legality — a legality-only check would have let a held order through |
| 4 | **Replay.** The same command sent twice | second call `409 ORDER_INVALID_TRANSITION`; exactly one `order_transitions` row to `AWAITING_FINAL_PAYMENT`; `outbox_events` and `audit_events` unchanged from after the first |
| 5 | **Actor boundary.** No session cookie on the new route | `401`; order unchanged and no transition appended. Included because the *route* is new, even though the guard itself is APP1's and untouched |
| C1..C6 | **The published contract.** One operation, the `adminOrder` domain, `APP7-B02`'s two ids untouched, no payable/eligibility path anywhere, the one-member enum body, the seven documented statuses plus the platform's global `500`, the exact receipt property set, and the forbidden-text/forbidden-name screens | `admin-order-lifecycle.contract.spec.ts`, built from the real application document in process |

Case 3 used two source states rather than one because a single representative
could not prove the guard: `IN_PRODUCTION` is refused by legality alone, so only
`ON_HOLD` distinguishes B01's guard from the machinery it sits on.

## 19. Validations deliberately not run

Per §14–§16 of the checkpoint directive and
[`VALIDATION_GOVERNANCE.md`](../VALIDATION_GOVERNANCE.md) §3, and because the
change touches none of them:

```text
full pnpm test / full Jest              all API integration tests
all order tests                         all payment tests
worker acceptance suite                 DB race suite
Playwright / Docker E2E                 full repository build
APP8-E01                                APP9-R00 / APP9-G01 re-validation
all OpenAPI checks                      all generated-client checks
all lifecycle scripts                   repository-wide aggregate commands
Admin frontend / Storefront suites       SonarQube full scan
```

`CMD-TEST-APP7-B02-INTEGRATION` was **not** run: `AdminOrderModule` and both B02
queries are byte-identical, and the only B02 file touched is its contract suite,
which was run.

`node tools/check-figma-design-index.mjs` was not run: B01 is a backend
checkpoint with no design or frontend UI change and no Figma node touched.

## 20. Changed files

New (10):

```text
apps/api/src/modules/order/admin-order-lifecycle.module.ts
apps/api/src/modules/order/application/admin/open-final-payment.use-case.ts
apps/api/src/modules/order/application/admin/order-lifecycle-actor.ts
apps/api/src/modules/order/domain/lifecycle/order-final-payment.errors.ts
apps/api/src/modules/order/presentation/admin-order-lifecycle.controller.ts
apps/api/src/modules/order/presentation/schemas/admin-order-transition.request.ts
apps/api/src/modules/order/presentation/schemas/admin-order-transition.response.ts
apps/api/src/modules/order/presentation/admin-order-lifecycle.contract.spec.ts
apps/api/src/modules/order/tests/integration/final-payment-context.ts
apps/api/src/modules/order/tests/integration/final-payment-entry.integration.spec.ts
```

Modified (8):

```text
apps/api/src/bootstrap/app.module.ts                  register the new module
apps/api/src/openapi/operation-id.ts                  one CONTROLLER_DOMAIN_KEYS entry
apps/api/src/modules/order/presentation/admin-order.contract.spec.ts
                                                      the operation inventory beneath
                                                      /api/admin/orders (see §22)
packages/contracts/openapi/openapi.generated.json     generated
packages/api-client/src/generated/embroidery-api.ts   generated
packages/api-client/src/generated/embroidery-api.schemas.ts   generated
docs/implementation/phases/APP9-REMAINING-PAYMENT-AND-FULFILLMENT.md   §15 roadmap
docs/implementation/SCOPED_COMMAND_INDEX.md           two new scoped commands
```

No file outside those was touched. No unrelated refactoring was performed.

## 21. File-size check

Limits: runtime/application source ≤ 400, tests ≤ 600.

| Lines | File | |
|---:|---|---|
| 71 | `admin-order-lifecycle.module.ts` | source |
| 172 | `open-final-payment.use-case.ts` | source |
| 42 | `order-lifecycle-actor.ts` | source |
| 101 | `order-final-payment.errors.ts` | source |
| 164 | `admin-order-lifecycle.controller.ts` | source |
| 54 | `admin-order-transition.request.ts` | source |
| 101 | `admin-order-transition.response.ts` | source |
| 225 | `openapi/operation-id.ts` | source (modified, +10) |
| 353 | `bootstrap/app.module.ts` | source (modified, +12) |
| 192 | `admin-order-lifecycle.contract.spec.ts` | test |
| 400 | `final-payment-context.ts` | test |
| 227 | `final-payment-entry.integration.spec.ts` | test |
| 324 | `admin-order.contract.spec.ts` | test (modified, +6) |

Every file is inside its hard limit. No source file crosses the 300-line review
threshold except `app.module.ts` (353, pre-existing, a composition root that
grows by one entry per module and is excluded from splitting by its nature) and
`operation-id.ts` (225). No test file crosses the 500-line review threshold. No
file was split, and no refactor was performed to reduce an unaffected file.

## 22. Nonblocking findings

### `FU-APP9-B01-01` — `SE-010` outbox event not emitted

```text
CLASSIFICATION = NONBLOCKING_OPEN
OWNER          = the Product Owner, before APP10 consumes it
```

`DB3_SIDE_EFFECT_OUTBOX_CATALOG.md` names `SE-010` — *"TR-LC14-05 final payment
requested → `payment.final-requested`, per (order), ORD→NTF"*. B01 emits it
**not**, on the explicit instruction of the checkpoint directive §10 ("do not
invent a new event solely because the lifecycle specification names a
customer-facing final-payment request side effect") and consistent with the
`APP9-R00` reading that APP9 adds no notification behaviour
(`NF-APP9-R00-04`, `APP9 NOTIFICATION DISPOSITION = OUTBOX EVENTS ONLY, NO
NOTIFICATION INTENT`).

The two readings are in tension and the tension is recorded rather than resolved
here: the audit permits an outbox event, the directive forbids minting one. The
conservative reading was taken because `SE-010`'s only consumer is `NTF`, which
`APP9-G01` §8 defers to APP10 whole, so an emitted event would sit in the outbox
with no accepted consumer. Adding it later is additive and needs no migration
(`outbox_events` already exists, and `order.created` is an accepted precedent for
an event with no consumer). **Not** actioned in B01; routed forward.

### `FU-APP9-B01-02` — no `ORDER`-target audit row for an LC-14 transition

```text
CLASSIFICATION = NONBLOCKING_OPEN
```

`DB3_AUDIT_SPECIFICATION.md` names *"Order creation/transition/hold/resume |
TR-LC14-\* | system/admin"*. No delivered code appends an `ORDER`-target
`audit_events` row today — `APP7-W01`'s creation does not, and `APP8-B04` audits
the `PRODUCTION_JOB` with the order move recorded in its summary. B01 follows the
delivered precedent and relies on `order_transitions`, which already carries the
actor kind, the admin id, the from/to pair and the correlation id. Introducing a
new audit vocabulary for one transition would have been a repository-wide
convention decision inside a one-transition checkpoint. Routed forward for
whichever checkpoint or authority package decides the LC-14 audit convention as a
whole.

### `FU-APP9-G01-01` — inherited, unchanged

```text
CLASSIFICATION = NONBLOCKING_OPEN  (inherited, not B01's)
```

`node tools/check-report-secrets.mjs` was red at entry `HEAD` on a pre-existing
false positive in an old APP6 completion report. Re-run for this report, the
checker still fails with exactly the same two findings and no new one:

```text
docs/implementation/reports/APP6-B04-COMPLETION-REPORT.md:93
docs/implementation/reports/APP9-G01-COMPLETION-REPORT.md:381
```

The second is `APP9-G01`'s own record of the first, so the finding set is
unchanged — the checker takes no file arguments and scans every tracked report,
so a B01-only invocation is not available. B01 did **not** edit either report,
change the checker or create a correction for it, and did not treat the failure
as a B01 result. It remains exactly as `APP9-G01` classified it.

### `FU-APP9-B01-03` — `admin-order.contract.spec.ts` was red at entry `HEAD`

```text
CLASSIFICATION = INHERITED_DEFECT_FIXED_IN_PASSING
```

The `APP7-B02` contract suite asserted that exactly three operations exist
beneath `/api/admin/orders`, all `GET`. `APP8-B03` added
`POST /api/admin/orders/{orderId}/production-jobs` without updating that
assertion, so the suite was already failing at entry `HEAD` — reproduced by
running the `HEAD` version of the file, which reports both the pre-existing
`production-jobs` row and B01's new `transitions` row as unexpected.

B01 had to touch the same assertion anyway, so it was corrected in the same edit
rather than left red: the list now names all five operations and the test title no
longer claims the prefix carries no write. B02's two operation ids, its two
response schemas and every other assertion in that suite are untouched, and the
suite passes.

## 23. Roadmap status

[`APP9-REMAINING-PAYMENT-AND-FULFILLMENT.md`](../phases/APP9-REMAINING-PAYMENT-AND-FULFILLMENT.md)
§15 now reads:

```text
R00   COMPLETE
G01   COMPLETE
B01   COMPLETE
B02   NEXT
B03   INCOMPLETE
W01   INCOMPLETE
B04   INCOMPLETE
B05   INCOMPLETE
D01   INCOMPLETE
A01   INCOMPLETE
S01   INCOMPLETE
E01   INCOMPLETE
X01   INCOMPLETE
```

Exactly one `NEXT`. B02 was not begun.

## 24. Next checkpoint

```text
NEXT_CHECKPOINT = APP9-B02
NOT_PUSHED      = true
```
