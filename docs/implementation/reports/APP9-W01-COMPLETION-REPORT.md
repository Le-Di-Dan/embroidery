# APP9-W01 — Safe `REMAINING` Consumption for `payment.verified` — Completion Report

## 1. Verdict

```text
APP9-W01 = COMPLETE
PAYMENT_VERIFIED_HANDLER_COUNT = 1
NEW_WORKER_HANDLERS = 0
DEPOSIT_RESERVATION_BEHAVIOR = UNCHANGED
REMAINING_CONSUMPTION = SUCCESSFUL_NO_OP
FU-APP8-W01-01 = CLOSED
NEW_HTTP_OPERATIONS = 0
OPENAPI_CHANGE = 0
API_CLIENT_CHANGE = 0
MIGRATIONS_ADDED = 0
SCHEMA_CHANGES = 0
NEXT_CHECKPOINT = APP9-B04
NOT_PUSHED = true
```

## 2. B03 commit housekeeping

The working tree at W01 entry carried exactly the paths the accepted `APP9-B03`
report §26 lists — 5 new files, 9 modified runtime files, 2 modified test files,
2 modified docs, 3 generated artifacts and the report itself: 22 paths, against
16 modified + 6 untracked in the tree. Nothing extra, nothing missing. It was
still uncommitted, so it was committed once, unchanged:

```text
67085e0  feat(app9): deliver admin remaining-payment verification (APP9-B03)
```

No B03 behaviour was altered to make it commit, and no B03 test was rerun for
this housekeeping. W01 started from a clean tree.

## 3. Branch, HEAD, commit, push state

```text
branch          production
B03 commit      67085e0   (created by this checkpoint's §1 housekeeping)
W01 entry HEAD  67085e0
W01 commit      none — the working tree carries the change, uncommitted
push            NOT_PUSHED = true
```

## 4. Scope delivered

The worker-side resolution of `FU-APP8-W01-01`, and nothing else: the sole
`payment.verified` consumer now accepts both obligation kinds the producer can
emit, reserves inventory for `DEPOSIT` exactly as `APP8-W01` delivered, and
consumes `REMAINING` successfully while writing no inventory at all.

Three runtime edits, one of them a new 35-line policy file:

```text
domain/payment-verified.payload.ts       obligationKind widened from a literal to
                                         a closed set; carried on the lookup
domain/reservation-trigger.policy.ts     NEW — which kind reserves (a switch over
                                         the closed union, so a third kind is a
                                         compile error, not a silent no-op)
inventory-reservation.handler.ts         the branch, placed after full validation
```

No new handler, no new event type, no new job kind, no new persistence, no HTTP
operation.

## 5. Changed `payment.verified` payload validation

Before, `parsePaymentVerifiedPayload` compared the field to one literal:

```ts
if (record['obligationKind'] !== DEPOSIT_OBLIGATION_KIND) {
  return { valid: false, errorClass: 'JOB_PAYLOAD_INVALID' };
}
```

After, it is membership in a closed exported set, and the accepted kind is
returned on the lookup so the handler branches on a typed value rather than
re-reading raw JSON:

```ts
if (!isVerifiedObligationKind(obligationKind)) {
  return { valid: false, errorClass: 'JOB_PAYLOAD_INVALID' };
}
```

Everything else in the parser is untouched: the object check, the three
non-empty identifier checks, the single `JOB_PAYLOAD_INVALID` class, and the
`payloadSchemaVersion` check the runtime performs before this file is reached.
**Payload schema version stays 1** — the version `APP9-B03` preserved.

`deriveReservationEffectKey` was narrowed from `PaymentVerifiedLookup` to
`Pick<PaymentVerifiedLookup, 'orderId'>`, the only field it ever read. The
derived key is byte-identical to before.

## 6. Accepted obligation-kind set

```text
VERIFIED_OBLIGATION_KINDS = ['DEPOSIT', 'REMAINING']   (closed, exported, asserted)
```

## 7. Unknown-kind behaviour

Unchanged and terminal. An unknown kind is not coerced onto either branch —
neither onto `DEPOSIT` (which would reserve stock a second time) nor onto
`REMAINING` (which would silently swallow it). Proven for five shapes: an
unknown future kind, a lowercased known kind, a kind that merely *starts with* a
known one (`DEPOSIT_TOPUP`), a missing kind, and a non-string kind. All return
`{ valid: false, errorClass: 'JOB_PAYLOAD_INVALID' }`, which the runtime
classifies terminally and dead-letters — the operator-visible path.

## 8. One-handler registry proof

Not a new assertion — the delivered `APP8-W01` case still stands, unmodified,
and it now runs against the changed handler:

```ts
expect(registered).toContainEqual({
  eventType: 'payment.verified', jobKind: 'INVENTORY_RESERVATION',
});
expect(registered.filter((t) => t.eventType === 'payment.verified')).toHaveLength(1);
```

It reads the live `JobHandlerRegistry` from a booted `WorkerModule`, so it is
also the proof that the registry's duplicate-ownership guard was never given a
second owner to reject. `git status` shows no change under `src/bootstrap/`, and
no `RemainingPaymentVerifiedHandler`, `FinalPaymentVerifiedHandler` or
`PaymentVerifiedRouterHandler` exists.

## 9. DEPOSIT behaviour proof

Zero semantic change. The DEPOSIT path reaches `ReserveOrderInventoryUseCase`
through the same call, with the same lookup, after the same linkage check;
`reserve-order-inventory.usecase.ts`, `inventory-reservation.errors.ts` and every
APP8 reservation algorithm are **untouched** (neither appears in `git status`).

The proof is the delivered live-runtime suite, cases 1–9, unmodified and green
against the changed parser and handler: catalog single-SKU and multi-SKU
reservation, the COP-only order, the ledger `RESERVED` counts per `entry_kind`,
redelivery convergence on one reservation set, insufficient stock, the
all-or-nothing multi-SKU set, the missing anchor, and the stale event whose
deposit is unsatisfied — including their retry/dead-letter outcomes
(`['FAILED_RETRYABLE', 'FAILED_TERMINAL']`) and their `DEAD_LETTER` outbox row.

## 10. REMAINING successful-no-op behaviour

```text
EVENT_VALID             = true
HANDLER_SUCCESS         = true
INVENTORY_RESERVATIONS  = 0
INVENTORY_STOCK_EFFECTS = 0
DEAD_LETTER             = false
```

The branch sits **after** the whole canonical event is validated — shape by the
parser, then the `aggregateKind`/`aggregateId` linkage check the handler already
performed. A REMAINING row carrying a producer linkage defect is therefore still
refused with `EVENT_LINKAGE_MISMATCH`, not waved through because of its kind.
The no-op means "correctly consumed, no inventory action required", not "ignored
before validation".

## 11. Exact worker/job/outbox persistence for REMAINING

Written:

```text
outbox_events            status -> DISPATCHED   (the same terminal state a
                                                 reservation reaches)
background_job_attempts  one row per delivery: outcome SUCCEEDED, error_class NULL,
                         job_kind INVENTORY_RESERVATION, job_key = outbox event id
```

Not written:

```text
inventory_reservations      0 rows
inventory_ledger_entries    0 RESERVED entries
sku_stocks                  no column mutated (quantity_on_hand unchanged)
idempotency_records         0 rows in namespace inventory.reserve
```

No new table, no "consumed remaining payments" record, and no fake reservation or
fake effect invented to make the attempt look busy. The completion path is
`JobExecutionService.completeSuccess`, reached by the handler simply returning.

On the effect key: the runtime derives it *before* `execute` and uses it for the
non-empty/bounded invariant check and for the log context only — nothing
persists it (a search for `effectKey`/`effect_key` across `apps/worker/src`
returns the execution service, the handler contract and the test doubles, and no
table). So a REMAINING job still derives the order-scoped key, and no second
idempotency namespace was invented for it.

## 12. Inventory writes proven absent for REMAINING

Asserted directly on database rows, not on return values (case 10):

```ts
expect(await reservations(order)).toHaveLength(0);
expect(await reservedLedgerCount(order)).toBe(0);   // counted by entry_kind
expect(idempotency records for scope_key = orderId).toBe(0);
expect(stock[0]?.quantity_on_hand).toBe(10);        // seeded 10, unmoved
```

`sku_stocks` carries no reserved column — committed stock *is* the
`inventory_reservations` rows, which the first assertion counts at zero — so what
remains to prove is that on-hand was not moved either, and it is.

## 13. Redelivery / idempotency

Proven inside case 10 rather than by a separate seeded order: two outbox rows for
one verification, the duplicate at-least-once permits. Both are claimed and
executed one attempt at a time through the real runtime, both reach `SUCCEEDED`,
both outbox rows reach `DISPATCHED`, and every assertion in §12 holds *after* the
second delivery. A no-op that were secretly stateful would have diverged on the
second one.

No application-level state was added: the harmlessness is structural — the
handler writes nothing, so there is nothing for a second delivery to duplicate.

## 14. Retry / dead-letter behaviour

Unchanged in every direction. REMAINING never retries and never dead-letters
because it never fails. DEPOSIT's operational refusals still retry once and
dead-letter at the cap (cases 6–9). Unknown kinds and malformed payloads still
return a terminal `JOB_PAYLOAD_INVALID` from `validatePayload`, which the runtime
has always classified terminally. No `retryPlan` was added, and the global
`worker.runtime` schedule still governs.

## 15. `FU-APP8-W01-01` = CLOSED

The defect was: `payment.verified` + `obligationKind = REMAINING` →
`JOB_PAYLOAD_INVALID` → terminal `DEAD_LETTER`. Case 10 now drives exactly that
event through the live runtime and observes `SUCCEEDED` / `DISPATCHED` with zero
inventory writes, twice. Recorded in the phase plan §4 and in its roadmap status
block.

## 16–18. What was not touched

```text
apps/api                        0 files changed
B03 producer                    payment-decision.recorder.ts untouched
payment attempt/obligation      untouched
order lifecycle / TR-LC14-06    untouched
HTTP operations added           0
OpenAPI document                not regenerated, not changed
generated API client            not regenerated, not changed
migrations                      0 added; migration tooling not run
schema                          0 changes
shipping / fulfillment          untouched (APP9-B04/B05)
cancellation / refund           untouched
notification intents            untouched
provider / callback / webhook   untouched
Admin UI / Storefront / Figma   untouched
```

`git status` lists 7 paths in total: five under
`apps/worker/src/jobs/inventory-reservation/` and two docs — no
`packages/contracts`, no `packages/api-client`, no `apps/api`, no migration.

## 19–20. Focused tests actually run, and their counts

| # | Command | Result |
|--:|---|---|
| 1 | `CMD-TEST-APP9-W01-UNIT` | 1 suite, **19 tests**, all passed (0.7 s) |
| 2 | `CMD-TEST-APP9-W01-INTEGRATION` | 1 suite, **31 tests**, all passed (6.4 s) |

As executed, from `apps/worker`:

```text
npx jest --config jest.config.mjs \
  src/jobs/inventory-reservation/domain/payment-verified.payload.spec.ts

npx jest --config jest.config.mjs \
  src/jobs/inventory-reservation/tests/inventory-reservation.integration.spec.ts
```

Both are now indexed in `SCOPED_COMMAND_INDEX.md` in the repository's
root-runnable `pnpm --filter` form; that form was confirmed to resolve the same
two files with `jest --listTests`, which executes no test.

Coverage against the required cases:

```text
Case 1  parser accepts DEPOSIT       unit — payload plus the kind, returned
Case 2  parser accepts REMAINING     unit — the event that used to dead-letter
Case 3  unknown kind stays invalid   unit — 5 shapes, terminal JOB_PAYLOAD_INVALID
Case 4  DEPOSIT regression           integration cases 1–9, unmodified, green
Case 5  REMAINING successful no-op   integration case 10 (5 assertions)
Case 6  REMAINING redelivery         integration case 10, structurally — two rows
Case 7  malformed REMAINING payload  unit — ids still validated for each kind
```

The 31 integration tests are the 26 delivered `APP8-W01` tests plus case 10's 5.

## 21. Lint / format / type-check order

Source first, tests last — the discipline §13 asks for:

```text
1. inspect        handler, parser, use case, runtime execution service
2. implement      3 runtime files, 2 test files
3. prettier --write on the 5 changed files
4. tsc -p tsconfig.json          worker package only, the smallest scope
5. fix            4 excess-property errors in the effect-key spec
6. eslint src/jobs/inventory-reservation
7. tests          unit, then integration
8. docs           roadmap, command index, this report
```

`tsc` and `eslint` were clean before the first test ran. No lint or type fix was
made after a test pass, so B03's format-then-rerun cycle did not recur.

## 22. Test reruns and the exact intervening change

One suite was rerun, twice, and both reruns were forced by a change to the test
file itself — never by a confidence pass:

| # | Command | Intervening change that justified it |
|--:|---|---|
| 1 | `CMD-TEST-APP9-W01-INTEGRATION` | Case 10 asserted `sku_stocks.quantity_reserved`, a column that does not exist (reserved stock is the `inventory_reservations` rows), and joined `background_job_attempts` on `outbox_event_id`, which is not that table's linkage — its `job_key` is. Both assertions were rewritten. |
| 2 | `CMD-TEST-APP9-W01-INTEGRATION` | The rewritten attempt query used `job_key = ANY(<js array>)`, which Drizzle does not bind as a PostgreSQL array (`op ANY/ALL (array) requires array on right side`). Changed to a two-parameter `IN (…)`. |

Both were defects in **new test assertions**, not in runtime behaviour: on the
first run all 26 delivered cases and 3 of case 10's 5 assertions already passed,
including every behavioural claim — `['SUCCEEDED', 'SUCCEEDED']`, both outbox
rows `DISPATCHED`, and zero reservations, ledger entries and idempotency records.
No runtime file changed after the first integration run.

`CMD-TEST-APP9-W01-UNIT` passed once and was **not** rerun: no file it covers
changed after that pass. Neither command was rerun after the Markdown edits.

## 23. Validations deliberately not run, and why

```text
full pnpm test / full Jest              no change justifies a repository-wide aggregate
all worker tests                        four other handlers and their runtime paths are
                                        untouched
all inventory reservation tests         the one suite that exercises the changed handler
                                        was run in full; nothing else reaches it
APP8-E01 acceptance                     cross-boundary acceptance, not a W01 impact; the
                                        handler it covers is proven by the suite above
APP9-B03 tests                          the producer is untouched; W01 consumes what B03
                                        already proved it emits
API integration / payment tests         apps/api has 0 changed files
DB race suites                          no lock order, isolation level or arbiter changed
Playwright / Docker / full build        no frontend or infrastructure change
Admin / Storefront tests                no frontend change
Figma checks                            not a design or frontend UI checkpoint
OpenAPI generation / api-client         0 HTTP surface change; regenerating would be drift
migration tooling                       0 migrations
SonarQube                               repository-global control, not run per checkpoint
```

## 24. Changed files

**New (1)**

```text
apps/worker/src/jobs/inventory-reservation/domain/reservation-trigger.policy.ts
```

**Modified — runtime (2)**

```text
domain/payment-verified.payload.ts   closed kind set; kind on the lookup; effect-key
                                     parameter narrowed to the field it reads
inventory-reservation.handler.ts     the REMAINING no-op branch, after validation
```

**Modified — tests (2)**

```text
domain/payment-verified.payload.spec.ts          REMAINING accepted; closed-set assertion;
                                                 5 unknown-kind shapes; per-kind id checks
tests/inventory-reservation.integration.spec.ts  case 10 (+5 tests); cases 1–9 unchanged
```

**Modified — docs (2)**

```text
docs/implementation/phases/APP9-REMAINING-…    FU-APP8-W01-01 closure; status block
docs/implementation/SCOPED_COMMAND_INDEX.md    two CMD-TEST-APP9-W01-* rows
```

No generated file changed.

## 25. File sizes

```text
payment-verified.payload.ts               136 / 400   OK
reservation-trigger.policy.ts              35 / 400   OK
inventory-reservation.handler.ts          121 / 400   OK
payment-verified.payload.spec.ts          121 / 600   OK
inventory-reservation.integration.spec.ts 541 / 600   OK — over the 500 review threshold
```

The integration suite sits at 541 of a 600 hard cap, past the 500 review
threshold. It was **not** split: it is one capability's live-runtime proof, its
ten cases share one booted `WorkerModule` and one disposable database, and
splitting it by line count would double the boot cost and break the
queue-emptiness discipline between cases (`runOnce` claims from the whole queue).
Flagged instead — see §26.

## 26. Nonblocking findings

```text
FU-APP9-W01-01  NONBLOCKING  inventory-reservation.integration.spec.ts is at 541/600.
                             Split by responsibility — the DEPOSIT reservation cases
                             from the kind-routing cases — before an eleventh case is
                             added.
```

No new blocking finding. The follow-ups listed in the checkpoint brief §19 were
not touched: `FU-APP9-G01-01`, `FU-APP9-B01-01` (`SE-010`), `FU-APP9-B01-02`,
`FU-APP9-B02-01`, `FU-APP9-B03-01`, `FU-APP9-B03-02`, `IMP-O008` and
`FU-APP8-B04-02` all remain open and outside W01's scope.

## 27. Roadmap status

```text
R00   COMPLETE
G01   COMPLETE
B01   COMPLETE
B02   COMPLETE
B03   COMPLETE
W01   COMPLETE
B04   NEXT
B05   INCOMPLETE
D01   INCOMPLETE
A01   INCOMPLETE
S01   INCOMPLETE
E01   INCOMPLETE
X01   INCOMPLETE
```

Exactly one `NEXT`. `FU-APP8-W01-01 = CLOSED`.

## 28–29. Stop state

```text
NEXT_CHECKPOINT = APP9-B04
NOT_PUSHED = true
```

B04 was not begun.
