# APP9-B03 — Admin Remaining-Payment Verification + TR-LC14-06 — Completion Report

## 1. Verdict

```text
APP9-B03 = COMPLETE
NEW_HTTP_OPERATIONS = 0
REMAINING_VERIFICATION = DELIVERED
TR_LC14_06 = DELIVERED
PAYMENT_VERIFIED_TRUE_KIND = DELIVERED
WORKER_CHANGES = 0
MIGRATIONS_ADDED = 0
NEXT_CHECKPOINT = APP9-W01
NOT_PUSHED = true
```

## 2. B02 commit housekeeping

The working tree at B03 entry carried exactly the 31 paths the accepted
`APP9-B02` report §25 lists — 14 new runtime files, 4 new test files, 1 rename,
11 modifications, 3 generated artifacts, 1 report — with nothing extra and
nothing missing. It was still uncommitted, so it was committed once, unchanged:

```text
a362a0b  feat(app9): deliver the customer remaining-payment capability (APP9-B02)
```

No B02 behaviour was altered to make it commit, and no B02 test was rerun for
this housekeeping. B03 started from a clean tree.

## 3. Branch, HEAD, commit, push state

```text
branch          production
B02 commit      a362a0b   (created by this checkpoint's §1 housekeeping)
B03 entry HEAD  a362a0b
B03 commit      none — the working tree carries the change, uncommitted
push            NOT_PUSHED = true
```

## 4. Scope delivered

Admin verification of a `REMAINING` bank-transfer attempt, `TR-LC14-06` inside
the same transaction, and `payment.verified` carrying the real obligation kind.
Delivered by **generalising the one existing command**, not by adding a second.

The generalisation is a kind-keyed table plus a source-state guard. Everything
else — the transaction, the lock order, the exact-match judgement, the
reconciliation, the replay branch, the review branch — is the delivered
`APP7-B04` machinery, unchanged in behaviour for a deposit.

## 5–6. HTTP surface

```text
APP9_B03_NEW_HTTP_OPERATIONS = 0
```

Reused, byte-identical in route and identifier:

```text
POST /api/admin/payment-attempts/{attemptId}/verify
operationId = adminPaymentAttempt_verify
```

No `…/verify-final-payment`, no `…/remaining/verify`, no second verification
route of any shape. The request body is unchanged
(`observedAmount`, `observedTransferReference`, `note`) and accepts no kind.

## 7. Kind resolution

The request supplies an attempt id and nothing else identifying a payment. The
server walks, inside the transaction:

```text
payment_attempts (locked)  ->  payment_obligations (locked, same call)  ->  orders
```

`PaymentDecisionChainResolver` reads `obligation.kind` off the locked row and
resolves it through a **lookup**, not a widened comparison:

```ts
const transition = verifiedPaymentTransitionFor(locked.obligation.kind);
if (transition === undefined) {
  throw paymentVerificationError('PAYMENT_ATTEMPT_NOT_VERIFIABLE');
}
```

- No kind is read from the body, a header, a query parameter or the path — there
  is nowhere in the contract to put one.
- A third kind added to `CST-039` later resolves to `undefined` and is refused.
  That is the reason it is a lookup: a widened `!==` would have let an unknown
  kind fall through to whichever branch was written last. This is asserted
  directly in `verified-payment-transition.spec.ts`, because with only two kinds
  in the database it is unreachable over HTTP.
- The expected transfer memo is chosen by the same derived kind —
  `depositTransferReference` for `DEPOSIT`, `remainingTransferReference` for
  `REMAINING` — through a two-entry builder map rather than a kind parameter,
  because `APP7-G01` §4 forbids one on the derivation itself.

## 8–9. Transition policy

One table, `domain/verification/verified-payment-transition.ts`:

| Kind | Source (required) | Target | Transition |
|---|---|---|---|
| `DEPOSIT` | `AWAITING_DEPOSIT` | `DEPOSIT_PAID` | `TR-LC14-02` |
| `REMAINING` | `AWAITING_FINAL_PAYMENT` | `READY_FOR_DELIVERY` | `TR-LC14-06` |

The **source** column is enforced before any write:

```ts
if (orderStatus !== transition.source) {
  throw paymentVerificationError('PAYMENT_ORDER_NOT_AWAITING_PAYMENT');
}
```

It is deliberately **not** `isLegalOrderTransition`, on the precedent
`APP9-B01` recorded. `ON_HOLD → DEPOSIT_PAID` and `ON_HOLD → READY_FOR_DELIVERY`
are both *legal* LC-14 moves, so legality alone would let a verification resume a
held order as a side effect. The three jumps §7 names are all impossible:

```text
PRODUCTION_COMPLETED -> READY_FOR_DELIVERY   refused by the source guard
                                             (and not legal in LC-14 either)
ON_HOLD              -> READY_FOR_DELIVERY   refused by the source guard
READY_FOR_DELIVERY   -> READY_FOR_DELIVERY   refused by the source guard
```

`TR-LC14-05` must therefore already have happened for a balance to be verifiable.

The guard is placed **before** the match verdict, not after. A mismatch routes to
`REQUIRES_REVIEW` and appends a reconciliation — durable writes — and doing that
against an order that is not collecting this payment at all would be wrong. So a
wrong-state verification writes nothing whatever the observed facts were, which
is exactly what Case 2 proves by re-reading every table.

## 10. Transaction and locks

Unchanged from `APP7-B04`; nothing was reordered and no new locking framework or
isolation level was introduced.

```text
1. lockAttemptForVerification(attemptId)   payment_attempts  FOR UPDATE
                                           + its payment_obligations row
2. orders.findById(...)                    the order, unlocked, for the guard
3. settleAttempt -> SUCCEEDED
4. satisfy(obligation, attempt)            re-proves G-DB7-06 / G-DB7-33 under
                                           the obligation's own row lock
5. orders.transition(...)                  orders FOR UPDATE, re-proves legality
6. appendReconciliation(...)
7. recorder.recordVerified(...)            audit row + one outbox row
```

Lock order stays `payment_attempts → payment_obligations → orders`, identical to
the delivered deposit path, so no inverse ordering was introduced. The order is
read unlocked at step 2 purely to give a deterministic refusal that writes
nothing; step 5 is the row-locked arbiter, and its `INVALID_TRANSITION` is
classified to the same `PAYMENT_ORDER_NOT_AWAITING_PAYMENT` rather than escaping
as a sanitised 500. On that path the whole transaction rolls back, so the
settlement and satisfaction go with it — the classification only decides which
refusal the operator reads.

## 11. TR-LC14-06 atomic composition

Steps 3–7 above are one `runInTransaction`. There is no second transaction, no
deferred write and no worker involvement. `GRD-016`'s causal order is
**structural** rather than asserted: `satisfy()` has already committed the
obligation to `SATISFIED` in this transaction before `transition()` runs, so the
order cannot reach `READY_FOR_DELIVERY` with the balance unsettled. The order is
never moved first and settled later.

The appended `order_transitions` row carries `actor_kind = ADMIN` — the operator
whose transaction settled the payment — and `event_kind = STATE_CHANGE`, because
`ck_order_transitions__event_kind_allowed` closes that column to six values and a
verification is an ordinary LC-14 move. *Why* the order moved is carried by the
reconciliation row and the audit event, which are built for it.

## 12. Reconciliation

`APP7`'s manual behaviour, unchanged. One `payment_reconciliations` row per
committed decision, bound to the actual attempt and the actual obligation,
carrying the operator's own note, the amount they observed (not the expected
figure — the row must evidence what was seen), `resolved_status = 'SUCCEEDED'`
and the observed bank memo. Case 1 reads it back by obligation id.

No provider reconciliation, callback, webhook, automatic bank matching or refund
reconciliation was introduced. `payment_provider_events` stays unused and
`IMP-O007` stays open.

## 13. `payment.verified` payload

R00's hard-coded literal is gone. `PaymentDecisionFacts` now carries a
**required** `obligationKind`, typed to the closed verifiable set, so no caller
can omit it and silently reintroduce a default:

```json
{
  "paymentAttemptId": "…",
  "paymentObligationId": "…",
  "obligationKind": "REMAINING",
  "orderId": "…"
}
```

`eventType` is still `payment.verified`, `aggregateKind` still
`PAYMENT_ATTEMPT`, `payloadSchemaVersion` still `1`. No `final-payment.verified`,
`remaining.verified` or `order.ready-for-delivery` was minted, and the event is
appended exactly once inside the same transaction.

The kind also reaches the audit `summary` on both the verified and the
review-required actions, so an operator auditing an order with two live
obligations can tell which payment an entry is about.

## 14–15. Proof of both kinds

`REMAINING` (Case 1) — asserted from the database, not the response: attempt
`SUCCEEDED` with `succeeded_at` set and both provider columns NULL; the
`REMAINING` obligation `SATISFIED` with `satisfied_by_attempt_id` equal to that
exact attempt; one reconciliation bound to both ids carrying the `RM` memo; the
order at `READY_FOR_DELIVERY` with exactly one `AWAITING_FINAL_PAYMENT →
READY_FOR_DELIVERY` transition by an `ADMIN` actor; exactly one outbox row, whose
payload is deep-equal to the four fields above with `obligationKind: REMAINING`.
The **deposit** obligation is asserted per kind to be still `PENDING` with zero
attempts and zero reconciliations.

`DEPOSIT` (Case 4) — the same reads on the delivered path: `AWAITING_DEPOSIT →
DEPOSIT_PAID`, `obligationKind: DEPOSIT`, the `DC` memo still expected, and the
`REMAINING` obligation left exactly where `APP7-W01` created it.

Case 5 is the sharpest kind proof available: the *deposit's* memo for that very
order is a real, correctly-formed reference, and on a balance attempt it is still
routed to review. A resolver that had kept deriving `DC` would have matched it
and dispatched the order.

## 16. Replay

`APP7`'s semantics, preserved and re-proved for the balance (Case 3). A retried
verification of an already-committed decision returns the committed truth with
`replayed: true`; a deep-equal comparison of the per-kind obligation snapshot,
the full transition list and the full outbox list before and after the retry
shows no duplicate settlement, satisfaction, transition, reconciliation or event,
and `payment.verified` is asserted separately to still be exactly one row.

One ordering fact B03 had to get right and the case pins: the replay branch runs
**before** the source-state guard. A committed verification has already moved the
order off its source state, so guarding first would answer a lost-response retry
with "this order is not awaiting that payment" — a refusal that reads as "the
payment failed" for a payment that succeeded.

No second idempotency system was added.

## 17. Admin review disposition

`adminPaymentAttempt_review` **did** change, because it shares the code B03 had
to generalise — the same `PaymentDecisionChainResolver` and the same
`PaymentDecisionRecorder`. §14's condition is therefore met and the change is the
minimum it forces:

- a `REMAINING` attempt now **reaches** review instead of being refused as not
  verifiable, because the shared resolver decides both operations and an
  escalation path that could not reach half the payments its sibling can settle
  would be the odd rule;
- it passes the derived kind to the recorder, which puts it in the audit summary;
- its `orderStatus` fallback is the status the chain observed rather than the
  literal `'AWAITING_DEPOSIT'`, which would have been wrong for a balance.

Its behaviour is otherwise identical: it settles the attempt to
`REQUIRES_REVIEW`, appends a reconciliation, moves no order, satisfies no
obligation and emits no event. Case 7 proves that for a `REMAINING` attempt. No
review UI was touched.

The review branch of *verification* was extracted into a new collaborator,
`RouteAttemptToReview` — see §26/§27; behaviour unchanged.

## 18–20. Confirmed absences

```text
worker changes                              NO   apps/worker: 0 files touched
inventory / reservation / production        NO   Case 1 asserts countDownstreamWrites() === 0
shipping / dispatch / freeze / completion   NO
customer final-payment API changes          NO   APP9-B02's three operations untouched
Admin UI / Storefront / Figma               NO
cancellation / refund                       NO   PO-APP9-001 = OPTION A — DEFER respected
notification intents                        NO
migration / schema                          NO   37 migrations, 79 tables unchanged
provider / callback / webhook               NO   IMP-O007 stays open
new event type                              NO   payment.verified remains the only one
new HTTP operation                          NO
```

### W01 defect intentionally pending

After B03 a verified `REMAINING` obligation emits `payment.verified` with
`obligationKind: REMAINING`. The sole registrant for that event type is
`InventoryReservationHandler`, whose payload parser rejects any non-`DEPOSIT`
kind with the terminal `JOB_PAYLOAD_INVALID`, so such an event will
**dead-letter** until `APP9-W01` extends that one consumer.

That is `FU-APP8-W01-01`, and it is left open deliberately. B03 did not edit
`apps/worker`, did not suppress the event, did not emit `DEPOSIT` to keep the
consumer happy, did not add a second event, and did not make worker success a
condition of its own acceptance. B03 proves producer correctness only. No W01
consumer test was run.

## 21. OpenAPI before and after

```text
OPENAPI_PATHS_BEFORE       96      OPENAPI_PATHS_AFTER       96
OPENAPI_OPERATIONS_BEFORE  103     OPENAPI_OPERATIONS_AFTER  103
OPENAPI_SCHEMAS_BEFORE     214     OPENAPI_SCHEMAS_AFTER     214
```

Counts are the expected unchanged baseline. The artifact **was** regenerated,
because the published contract genuinely changed: the verify operation's summary
and description asserted "the obligation is the DEPOSIT one" and
"`AWAITING_DEPOSIT` → `DEPOSIT_PAID`", which B03 made false, and its `409`
description named the old refusal set. Three response-property descriptions were
added to `PaymentDecisionResponse` for the same reason.

The whole diff is 8 insertions / 5 deletions, and every line is a `description`
or `summary`:

```text
+ PaymentDecisionResponse.depositObligationId   description added
+ PaymentDecisionResponse.depositStatus         description added
+ PaymentDecisionResponse.orderStatus           description added
~ verify   summary                              "deposit attempt" -> "payment attempt"
~ verify   description                          both kinds, both transitions, derived kind
~ verify   409 description                      the four refusal codes named
~ review   200 description                      "deposit" -> "obligation"
~ review   409 description                      "not a deposit bank transfer" reworded
```

`git diff` on the artifact matches **zero** lines containing `operationId`, and
no path or schema key was added or removed. Proof that no operation was added is
therefore both the unchanged counts and the empty operationId diff.

**Field names were deliberately not renamed.** `PaymentDecisionResponse` keeps
`depositObligationId` and `depositStatus` even though they now carry the
`REMAINING` obligation on a balance verification. Renaming them is a breaking
contract change that the delivered `APP7-A01` Admin workspace consumes in six
places, and §5 forbids touching Admin UI in this checkpoint. They are documented
instead, and the mismatch is routed forward as `FU-APP9-B03-01`.

## 22. Generated client

Regenerated, because the OpenAPI artifact changed:
`CMD-API-CLIENT-GENERATE` then `CMD-API-CLIENT-CHECK` (tree hash
`6f65593e…`, no drift). The diff is 11 insertions / 2 deletions and is entirely
JSDoc comment text — no exported operation, type or field changed. Nothing was
hand-edited.

## 23. Focused tests and exact counts

| Command | Suites | Tests | Result |
|---|--:|--:|---|
| `CMD-TEST-APP9-B03-UNIT` — `jest --testPathPatterns="verified-payment-transition\|payment-verification[.]spec\|admin-payment[.]contract[.]spec"` | 3 | 53 | pass |
| `CMD-TEST-APP9-B03-INTEGRATION` — `jest --runInBand --testPathPatterns="admin-final-payment-verification[.]integration"` | 1 | 12 | pass |

Cases delivered, against §17:

| § | Case | Where |
|---|---|---|
| Case 1 | REMAINING success, atomic, 7 assertions | integration |
| Case 2 | wrong order state (`PRODUCTION_COMPLETED`), every table re-read unchanged | integration |
| Case 3 | replay — no duplicate settlement, transition, reconciliation or event | integration |
| Case 4 | DEPOSIT regression — `AWAITING_DEPOSIT → DEPOSIT_PAID`, kind `DEPOSIT` | integration |
| Case 5 | kind derived from decision truth — the deposit memo is refused on a balance | integration |
| Case 7 | review regression, required because shared code changed | integration |
| — | the transition table's closed set, unreachable over HTTP | unit |

Case 6 was not added: no resolver change makes an invalid or mismatched attempt
behave differently from what `APP7-B04`'s own refusals suite already covers.

Other validations run once each: `tsc --noEmit` (clean), `eslint` over
`src/modules/payment` plus the two new test files (clean after two fixes),
`prettier --write` on the changed files, `openapi:generate`, `openapi:check`,
`api-client generate`, `api-client check:generated`,
`node tools/check-report-secrets.mjs`.

## 24. Test reruns and the intervening changes

Three reruns, each after a specific change to code under test. No "final
confidence" run was performed, no group was rerun after a Markdown-only edit, and
no group was rerun merely before writing this report.

| # | Command | Intervening change that justified it |
|--:|---|---|
| 1 | `CMD-TEST-APP9-B03-UNIT` | `verified-payment-transition.ts` signatures widened from `PaymentObligationKind \| string` to `string`, and its unused `PaymentObligationKind` import removed, to clear two `no-redundant-type-constituents` errors. Prettier then reformatted the file. |
| 2 | `CMD-TEST-APP9-B03-INTEGRATION` | same commit of lint fixes: the redundant `as VerifiableObligationKind` assertion was removed from `payment-decision-chain.resolver.ts`, which is on the path every case exercises. Prettier also reformatted the suite and its fixture. |
| 3 | `CMD-TEST-APP9-B03-INTEGRATION` | `routeToReview` was extracted from `VerifyPaymentAttemptUseCase` into the new injectable `RouteAttemptToReview`, and the provider was registered — a real change to the verification path and its DI graph (see §27). |

`CMD-TEST-APP9-B03-UNIT` was not rerun after change 3: the extraction touched no
file that group covers, and the OpenAPI document it builds was re-checked
independently by `openapi:check`.

Reruns 1 and 2 were avoidable — formatting and lint should have run before the
first test pass rather than after it. Recorded rather than glossed, since §18
exists to stop exactly that.

## 25. Validations deliberately not run, and why

```text
full pnpm test / full Jest              no change justifies a repository-wide aggregate
all payment tests                       the APP7 mismatch, terminal-state, race and
                                        evidence suites exercise no changed decision path
                                        beyond the success path Case 4 re-proves
APP9-B01 tests                          the order module is untouched
APP9-B02 tests                          the customer surface is untouched; its shared
                                        helper `remainingTransferReference` is only read
APP7-E01 / APP8-E01                     cross-layer acceptance, not a B03 impact
worker acceptance / W01 consumer tests  apps/worker is untouched and the W01 defect is
                                        deliberately still open
inventory reservation tests             Case 1 asserts zero downstream writes directly
DB race suites                          no lock order, isolation level or arbiter changed
shipping tests                          none exist; shipping is APP9-B04/B05
Playwright / Docker / full build        no frontend or infrastructure change
Admin / Storefront tests                no frontend change
Figma checks                            no design or frontend UI checkpoint
manual real-bank QR scan                no QR, encoder or memo algorithm changed
SonarQube                               repository-global control, not run per checkpoint
```

## 26. Changed files

**New (4)**

```text
apps/api/src/modules/payment/domain/verification/verified-payment-transition.ts
apps/api/src/modules/payment/domain/verification/verified-payment-transition.spec.ts
apps/api/src/modules/payment/application/admin/route-attempt-to-review.service.ts
apps/api/test/support/admin-final-payment-fixture.ts
apps/api/test/integration/admin-final-payment-verification.integration.spec.ts
```

**Modified — runtime (7)**

```text
domain/verification/payment-verification.errors.ts     DEPOSIT_NOT_PAYABLE ->
                                                       PAYMENT_OBLIGATION_NOT_PAYABLE;
                                                       + PAYMENT_ORDER_NOT_AWAITING_PAYMENT;
                                                       NOT_VERIFIABLE message generalised
domain/verification/payment-verification.policy.ts     ExpectedDepositFacts ->
                                                       ExpectedTransferFacts (internal type)
application/admin/payment-decision-chain.resolver.ts   kind lookup, kind-keyed memo builder,
                                                       orderStatus/kind/transition on the chain
application/admin/verify-payment-attempt.use-case.ts   source guard, kind-driven target,
                                                       kind on the event, INVALID_TRANSITION
                                                       classified, review branch extracted
application/admin/review-payment-attempt.use-case.ts   §17
application/admin/payment-decision.recorder.ts         required obligationKind on facts,
                                                       real kind in payload and audit summary
admin-payment-verification.module.ts                   RouteAttemptToReview provider
presentation/admin-payment-attempt.controller.ts       published descriptions (§21)
presentation/schemas/admin-payment.response.ts         three property descriptions (§21)
```

**Modified — tests (2)**

```text
domain/verification/payment-verification.spec.ts       the renamed internal type
presentation/admin-payment.contract.spec.ts            §28 — the stale B02 path list
```

**Modified — docs (2)** · **Generated (3)**

```text
docs/implementation/SCOPED_COMMAND_INDEX.md            two CMD-TEST-APP9-B03-* rows
docs/implementation/phases/APP9-REMAINING-…            §29
packages/contracts/openapi/openapi.generated.json
packages/api-client/src/generated/embroidery-api.ts
packages/api-client/src/generated/embroidery-api.schemas.ts
```

## 27. File sizes

```text
admin-payment.contract.spec.ts                568 / 600   OK   (test)
admin-final-payment-verification.integration  434 / 600   OK   (test)
admin-payment.response.ts                     363 / 400   OK
verify-payment-attempt.use-case.ts            350 / 400   OK
admin-payment-attempt.controller.ts           244 / 400   OK
review-payment-attempt.use-case.ts            183 / 400   OK
payment-verification.policy.ts                178 / 400   OK
payment-decision.recorder.ts                  174 / 400   OK
payment-verification.errors.ts                172 / 400   OK
payment-decision-chain.resolver.ts            154 / 400   OK
admin-final-payment-fixture.ts                153 / 600   OK   (test)
route-attempt-to-review.service.ts            119 / 400   OK
verified-payment-transition.ts                 70 / 400   OK
verified-payment-transition.spec.ts            66 / 600   OK
```

`verify-payment-attempt.use-case.ts` reached **426 lines** — over the 400 hard
limit — once the guard, the kind plumbing and their reasoning were added. It was
split by responsibility rather than by line range: `routeToReview` became
`RouteAttemptToReview`, an injectable whose single job is *record a contradicted
transfer*, leaving the use case with *decide and settle a verification*. The seam
is the one place the two already met, the moved code is behaviour-identical, and
the split was re-proved by rerun 3.

`admin-payment.contract.spec.ts` at 568 and the integration suite at 434 are both
over the 500 / 300 review thresholds but under their 600 test hard limit, and are
recorded rather than split.

## 28. Nonblocking findings

```text
FU-APP9-B02-02  NEW / REPAIRED IN B03 — a genuine APP9-B02 defect
  `admin-payment.contract.spec.ts` carries a third exhaustive `public/orders`
  path list, in a different file from the two APP9-B02 updated. B02 left it
  stale, so that suite was **red on the branch** from a362a0b until B03 added the
  three final-payment paths to it. The published surface was always correct; the
  test's own list was not. Repaired here because B03's own contract work runs
  that suite, and leaving a red test on the branch was not an option. The B02
  report's claim that APP7's surface was undisturbed remains true; its claim to
  have run the validations the change justified was incomplete — this suite was
  one of them and was not run.

FU-APP9-B03-01  NEW / NONBLOCKING
  `PaymentDecisionResponse.depositObligationId` and `.depositStatus` now carry
  the REMAINING obligation on a balance verification, under deposit-flavoured
  names. Not renamed: the delivered APP7-A01 Admin workspace reads both in six
  places and §5 forbids frontend changes here. Documented in the published
  contract instead. Owner: APP9-A01, which owns the Admin fulfillment workspace
  and is the checkpoint that first renders a final payment.

FU-APP9-B03-02  NEW / NONBLOCKING
  `AdminOrderPaymentsView` / `adminOrderPayment_read` still projects only the
  DEPOSIT obligation for an order, so an operator cannot see the balance, its
  attempts or its reconciliations through the Admin read. B03 owns verification,
  not the read, and the endpoint is outside its stated scope. Owner: APP9-A01.

FU-APP8-W01-01  OPEN BY DESIGN — see §20. Owner: APP9-W01, the next checkpoint.

FU-APP9-G01-01  INHERITED / NONBLOCKING — unchanged, no B03 correction
  `node tools/check-report-secrets.mjs` still fails on the same two false
  positives APP9-G01, B01 and B02 recorded:
    docs/implementation/reports/APP6-B04-COMPLETION-REPORT.md:93
    docs/implementation/reports/APP9-G01-COMPLETION-REPORT.md:381
  Both are prose about a token, not a token. No new B03 finding. Nothing was
  edited — neither the old reports nor the checker.

FU-APP9-B01-01 · FU-APP9-B01-02 · FU-APP9-B02-01 · IMP-O008 · FU-APP8-B04-02
  CARRIED_FORWARD / NONBLOCKING. None was fixed and none expanded B03.
```

## 29. Roadmap

`docs/implementation/phases/APP9-REMAINING-PAYMENT-AND-FULFILLMENT.md` §15:

```text
R00   COMPLETE
G01   COMPLETE
B01   COMPLETE
B02   COMPLETE
B03   COMPLETE
W01   NEXT
B04   INCOMPLETE
B05   INCOMPLETE
D01   INCOMPLETE
A01   INCOMPLETE
S01   INCOMPLETE
E01   INCOMPLETE
X01   INCOMPLETE
```

Exactly one `NEXT`.

## 30. Next checkpoint

```text
NEXT_CHECKPOINT = APP9-W01
```

`APP9-W01` — extend the single `payment.verified` consumer so a `REMAINING`
verification is consumed and no-ops instead of dead-lettering, closing
`FU-APP8-W01-01`. Not begun.

## 31. Push state

```text
NOT_PUSHED = true
```

Nothing was pushed. The one commit this checkpoint created is `a362a0b`, the
accepted `APP9-B02` housekeeping commit from §2; B03's own change is uncommitted
in the working tree for human review.
