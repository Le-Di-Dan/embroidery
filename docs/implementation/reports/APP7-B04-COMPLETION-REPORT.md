# APP7-B04 — Completion Report

## Admin Deposit Read, Manual Verification and Review/Reconciliation

- Checkpoint: `APP7-B04`
- Mode: `IMPLEMENTATION / BACKEND / ADMIN PAYMENT VERIFICATION`
- Branch/HEAD at entry: `production` @ `1666a55`
- Date: 2026-08-23

---

## 1. Verdict

```text
APP7-B04 = COMPLETE
CHECKPOINT_SCOPE = ADMIN_DEPOSIT_VERIFICATION_AND_RECONCILIATION

HTTP_OPERATIONS = 3

ADMIN_PAYMENT_READ_OPERATION = GET  /api/admin/orders/{orderId}/payments         adminOrderPayment_read
ADMIN_VERIFY_OPERATION       = POST /api/admin/payment-attempts/{attemptId}/verify  adminPaymentAttempt_verify
ADMIN_REVIEW_OPERATION       = POST /api/admin/payment-attempts/{attemptId}/review  adminPaymentAttempt_review

PAYMENT_MODEL = MANUAL_BANK_TRANSFER
PROVIDER      = NONE
IMP-O007      = OPEN

VERIFY_AUTHORITY = payment_attempts (FOR UPDATE)
                     -> payment_obligations (kind = DEPOSIT, same row)
                       -> orders (obligation.order_id)
                   every link read inside the mutation transaction
EXPECTED_AMOUNT_SOURCE    = payment_obligations.amount
EXPECTED_CURRENCY_SOURCE  = payment_obligations.currency_code
EXPECTED_REFERENCE_SOURCE = depositTransferReference(orders.code)
                            = 'ORD' + <10-char order-code body> + 'DC', ^[A-Z0-9]{15}$

ZERO_EVIDENCE_VERIFICATION = PASS
EVIDENCE_AUTHORITY         = SUPPORTING_ONLY
BINARY_EVIDENCE_DELIVERY   = NONE

SUCCESS_TRANSACTION = lockAttemptForVerification -> settleAttempt(SUCCEEDED)
                      -> satisfy(obligation, attempt, at)
                      -> orders.transition(AWAITING_DEPOSIT -> DEPOSIT_PAID)
                      -> appendReconciliation -> audit_events -> outbox payment.verified
ATTEMPT_SUCCESS_STATE  = SUCCEEDED
DEPOSIT_SUCCESS_STATE  = SATISFIED
ORDER_SUCCESS_STATE    = DEPOSIT_PAID

PAYMENT_WRITER        = @embroidery/persistence PAYMENT_OBLIGATION_REPOSITORY
                        (DrizzlePaymentObligationRepository + PaymentAttemptRepository)
ORDER_WRITER          = @embroidery/persistence ORDER_REPOSITORY (DrizzleOrderRepository)
RECONCILIATION_WRITER = @embroidery/persistence PaymentEvidenceRepository.appendReconciliation

MISMATCH_BEHAVIOR        = 200; attempt -> REQUIRES_REVIEW with mandatory review_reason;
                           reconciliation appended with resolved_status = REQUIRES_REVIEW;
                           DEPOSIT unchanged; Order unchanged; no payment.verified
EXPLICIT_REVIEW_BEHAVIOR = 200; attempt -> REQUIRES_REVIEW; reconciliation appended;
                           DEPOSIT unchanged; Order unchanged; no outbox; no provider event
REQUIRES_REVIEW_RESOLUTION = PERMITTED — LC-16 TR-LC16-06, and the delivered
                             settleAttempt already admits REQUIRES_REVIEW into its
                             settle-from set. The same verify operation resolves it,
                             recorded as action = RESOLVE_REVIEW.

DUPLICATE_VERIFY_BEHAVIOR = state-idempotent convergence. An identical retry against an
                            attempt already SUCCEEDED, whose obligation is SATISFIED by
                            that exact attempt, returns 200 with replayed = true and
                            writes nothing. A retry with different observed facts is a
                            409, not a replay.
SAME_ATTEMPT_RACE = PASS
CC10_ARBITER      = payment_obligations row lock inside satisfy() + the PENDING state
                    predicate. The loser's whole transaction rolls back, so it never
                    becomes a second satisfying success.
CC10_PROOF     = PASS
ROLLBACK_PROOF = PASS

PAYMENT_VERIFIED_EVENT = payment.verified (SE-007), aggregate PAYMENT_ATTEMPT,
                         exactly once per satisfied deposit
PROVIDER_EVENTS_WRITTEN     = 0
INVENTORY_PRODUCTION_WRITES = 0

SCHEMA_CHANGE    = NONE
MIGRATION_CHANGE = NONE (37 migrations, unchanged)

OPENAPI_BEFORE = 81 paths / 88 operations / 184 schemas
OPENAPI_AFTER  = 84 paths / 91 operations / 191 schemas
OPENAPI_DELTA  = +3 paths, +3 operations, +7 schemas; 0 removed, 0 existing changed
API_CLIENT_DELTA = +313 lines, 0 deletions, 2 generated files

FOCUSED_TESTS      = 5 suites / 77 tests (B04) + 29 (shared payment persistence)
                     + 74 (two sibling contract suites re-run on changed input)
BROAD_REGRESSION   = NOT_RUN_BY_DESIGN

NEXT_CHECKPOINT = APP7-B06
```

---

## 2. Changed files

### New — API runtime

| File | Lines | Responsibility |
|---|---:|---|
| `modules/payment/domain/verification/observed-amount.ts` | 65 | exact `bigint`-hundredths money equality; no arithmetic |
| `modules/payment/domain/verification/payment-verification.policy.ts` | 175 | the verifiability classification, the exact-match verdict, the replay predicate |
| `modules/payment/domain/verification/payment-verification.errors.ts` | 146 | the closed refusal vocabulary and its HTTP mapping |
| `modules/payment/domain/verification/reconciliation-evidence.ts` | 44 | `MANUAL_MATCH` / `RESOLVE_REVIEW` selection from the closed DB4 set |
| `modules/payment/domain/repositories/admin-payment-read.repository.ts` | 127 | the read-only CTX-PAY projection port |
| `modules/payment/infrastructure/persistence/drizzle-admin-payment-read.repository.ts` | 206 | four column-named `select`s, no transaction, no lock |
| `modules/payment/application/admin/admin-payment.view.ts` | 131 | the runtime views |
| `modules/payment/application/admin/payment-admin-actor.ts` | 43 | the server-derived Admin id |
| `modules/payment/application/admin/payment-decision-chain.resolver.ts` | 110 | the attempt → obligation → order chain, proved under the attempt lock |
| `modules/payment/application/admin/payment-decision.recorder.ts` | 153 | audit + SE-007 outbox |
| `modules/payment/application/admin/read-admin-order-payments.query.ts` | 201 | the zero-write deposit read |
| `modules/payment/application/admin/verify-payment-attempt.use-case.ts` | 378 | the one transaction that can move money state |
| `modules/payment/application/admin/review-payment-attempt.use-case.ts` | 171 | the deliberate escalation; cannot satisfy anything |
| `modules/payment/presentation/admin-order-payment.controller.ts` | 178 | the read operation |
| `modules/payment/presentation/admin-payment-attempt.controller.ts` | 232 | the two mutations |
| `modules/payment/presentation/schemas/admin-payment.request.ts` | 106 | strict request contracts |
| `modules/payment/presentation/schemas/admin-payment.response.ts` | 341 | published response contracts |
| `modules/payment/admin-order-payment.module.ts` | 55 | the read composition root, and its absences |
| `modules/payment/admin-payment-verification.module.ts` | 85 | the write composition root, and its absences |

### New — shared persistence

| File | Lines | Responsibility |
|---|---:|---|
| `packages/persistence/src/payment/payment-attempt.repository.ts` | 145 | attempt settlement, the locked verification read, two lookups |

### Modified

| File | Change |
|---|---|
| `packages/persistence/src/payment/payment-obligation.repository.ts` | `VerifiableAttempt`, `lockAttemptForVerification`, `resolvedStatus`/`bankReference` on `appendReconciliation` |
| `packages/persistence/src/payment/drizzle-payment-obligation.repository.ts` | split by responsibility; delegates the four attempt-row methods |
| `packages/persistence/src/payment/payment-evidence.repository.ts` | writes `resolved_status` and `bank_reference` |
| `packages/persistence/src/payment/payment-persistence.module.ts` | registers `PaymentAttemptRepository` |
| `packages/persistence/src/index.ts` | exports `VerifiableAttempt`, `PaymentAttemptRepository` |
| `packages/database/src/index.ts` | exports `PAYMENT_RECONCILIATION_ACTIONS` + `PaymentReconciliationAction` |
| `apps/api/.../order-deposit-context.port.ts` + adapter | adds `findOrderById` to the read-only Ordering port |
| `apps/api/.../payment/domain/repositories/payment-obligation.repository.ts` | re-exports `VerifiableAttempt` |
| `apps/api/src/bootstrap/app.module.ts` | registers the two B04 modules |
| `modules/payment/presentation/public-order-deposit.contract.spec.ts` | its repository-wide "no other payment route" bound now names B04's three paths, so it stays exhaustive instead of being loosened |
| `modules/order/presentation/admin-order.contract.spec.ts` | its "nothing beneath `/api/admin/orders`" bound now names `{orderId}/payments` and still asserts no write exists under that prefix |
| `packages/contracts/openapi/openapi.generated.json` | +3 operations |
| `packages/api-client/src/generated/*` | regenerated |

### New — tests

| File | Lines | Tests |
|---|---:|---:|
| `modules/payment/domain/verification/payment-verification.spec.ts` | 155 | 17 |
| `modules/payment/presentation/admin-payment.contract.spec.ts` | 474 | 24 |
| `apps/api/test/support/admin-payment-fixture.ts` | 349 | — |
| `apps/api/test/integration/admin-payment-verification.integration.spec.ts` | 545 | 17 |
| `apps/api/test/integration/admin-payment-review.integration.spec.ts` | 412 | 14 |
| `apps/api/test/integration/admin-payment-races.integration.spec.ts` | 277 | 5 |

Every runtime file is at or under the 400-line hard limit and every test file under
600. `node tools/check-file-size.mjs` reports **no** `FAIL` for any file in the
changed set. (The gate reports a large pre-existing backlog elsewhere, untouched.)

---

## 3. Admin actor derivation

`AuthenticatedAdminGuard` binds the ADMIN actor from the `adm_session` cookie
against a live `admin_sessions` row before either handler runs.
`requirePaymentAdminActorId` reads it back from `RequestContextService` and
accepts no parameter through which a caller could supply an identity. A
non-ADMIN bound actor is a wiring fault and travels to the platform filter as a
sanitised 500 rather than being shaped into a client refusal.

This matters more here than anywhere else in the repository:
`payment_reconciliations.admin_id` is the DEV-DB6-015 **no-FK** evidence column,
so nothing in the database would reject a fabricated id — the application is the
whole of its integrity. No migration and no FK was added.

Both mutations additionally carry `StaffOriginGuard` and `StaffJsonBodyGuard`,
the exact combination every Admin mutation in this repository already uses. Both
are proved over the wire: a foreign `Origin` is `403`, a `text/plain` body is
`415`, and neither leaves any state changed.

---

## 4. Read projection

Returns the order's LC-14 state, the DEPOSIT obligation with its own frozen
amount and currency, the derived DC reference, every attempt with its LC-16
state, per-attempt evidence metadata, and the reconciliation history.

- **No 40 % recomputation.** `expectedAmount` is `payment_obligations.amount`.
  The query holds no percentage, no multiplication and no quotation reader.
- **No live Catalog or quotation read.** The adapter names four tables and all
  four are CTX-PAY. The order comes from `ORDER_DEPOSIT_CONTEXT_PORT`
  (three columns) and the assets from `ASSET_REPOSITORY`.
- **No REMAINING.** `findDepositObligation` filters `kind = 'DEPOSIT'` in SQL.
  Proved: the seeded REMAINING obligation's id does not appear anywhere in the
  response, and the serialized body contains no `remaining`.
- **Zero-write.** The module resolves no transaction manager, no
  `PAYMENT_OBLIGATION_REPOSITORY` and no `ORDER_REPOSITORY`. Proved by snapshot:
  two reads leave every status, timestamp and row count identical.
- **No `paid` flag.** Canonical LC-14 / LC-15 / LC-16 state names only
  (`APP7-G01` §12.2).

---

## 5. Evidence metadata boundary

Association-first: `payment_transfer_evidence` rows for **this** obligation's
attempts are listed, and only those asset ids are then resolved through
`findScopedByIds` filtered to `CUSTOMER_UPLOAD` / `CUSTOMER_PRIVATE`. An id
outside that lane is absent rather than returned, so no arbitrary `assetId` can
be fetched and no probe learns that a private asset exists.

Published per image: `evidenceId` (the **association** id, never the asset id),
`assetStatus`, `mediaType`, `byteSize`, `createdAt`, `previewEligible`. Nothing
else — no `storageKey`, bucket, URL, checksum, fingerprint, scanner detail,
secure token, grant id or step-up challenge id. No byte is served: `APP7-B06`
owns the single Admin private delivery.

`previewEligible` is `assetStatus === 'ACCEPTED'` and nothing else. Proved for
all three states, and proved not to be a payment fact: a deposit with a
`REJECTED` screenshot verifies exactly as normally as one with none.

---

## 6. Transaction and lock order

```text
BEGIN
  payment_attempts       FOR UPDATE   lockAttemptForVerification
  payment_obligations    (read, in-tx, no lock — satisfy() is the arbiter)
  orders                 (read for the code — immutable)
  ... judge ...
  payment_obligations    FOR UPDATE   satisfy()
  orders                 FOR UPDATE   transition()
  payment_reconciliations INSERT
  audit_events            INSERT
  outbox_events           INSERT
COMMIT
```

Recorded against `DB8_LOCK_ORDER_MATRIX.md`: order dispatch takes `orders` then
reads `payment_obligations` **without a lock**, so no code path takes these two
locks in opposite orders and no new deadlock pair is introduced.

No external or network call occurs inside the transaction. The outbox row is the
whole of the after-commit handoff (INV-23).

---

## 7. Money and reference comparison

`numeric(14,2)` reaches this process as a **string** and is never converted to a
JS `number`. Both sides are scanned into `bigint` hundredths and compared as
`bigint`, so `765000`, `765000.0` and `765000.00` are one value while `764999`
and `765001` are refused. No tolerance, no epsilon, no rounding.

The currency is checked against the obligation's own column, not against a
request field: `ck_payment_obligations__currency_vnd` closes it to `VND`, so an
observed currency would be a field whose only legal value the server already
holds. There is no such field on either body.

The reference is compared verbatim — no case folding, no punctuation stripping.
`APP7-G01` §4 designed the 15-character uppercase alphanumeric form precisely so
it survives a bank's own normalisation; folding here would accept a memo that is
not the one the customer was given. The request schema shape-checks against
`DEPOSIT_REFERENCE_PATTERN` so a typo is a `400` rather than a silent trip into
review, and equality against the order's own derived value is still proved
server-side — proved by a test that sends **another order's** valid reference and
gets `REQUIRES_REVIEW`, with both orders left untouched.

`quotation/domain/pricing/vnd-amount.ts` is deliberately **not** imported: it is
the quotation module's pricing calculator (add, multiply, round-half-up), and
reaching across a module boundary for it in order to use one equality would put
every one of those operations one import away from a path that must never
perform them.

---

## 8. Reconciliation action mapping

`PAYMENT_RECONCILIATION_ACTIONS` is a closed CHECK set. B04 adds nothing to it
and invents no string.

```text
attempt was REQUIRES_REVIEW when the operation began -> RESOLVE_REVIEW
anything else                                        -> MANUAL_MATCH
```

The rule keys on the status **before** the decision, because `RESOLVE_REVIEW`
describes the work — an open review was taken up and answered — and that is true
whether the answer was `SUCCEEDED` or a fuller `REQUIRES_REVIEW`. Where it landed
is carried by `resolved_status`, which TBL-057 leaves without a CHECK precisely
so it can record LC-16's set verbatim.

An explicit review of a `PENDING` attempt is therefore `MANUAL_MATCH` with
`resolved_status = REQUIRES_REVIEW`. The alternative was `RESOLVE_REVIEW` for an
operation that resolves nothing, which would make the vocabulary lie about the
one thing it exists to record.

`amount` and `bank_reference` carry what the operator observed. A reason-only
review writes `NULL` to both rather than a fabricated zero.

---

## 9. Why both bodies require a written reason

`payment_reconciliations.reason` is `NOT NULL` and the delivered
`appendReconciliation` refuses a blank one; `ck_payment_attempts__review_reason_required`
makes `review_reason` `NOT NULL` on `REQUIRES_REVIEW` entry. So `verify` requires
`note` and `review` requires `reviewReason`, both trimmed and bounded at 2000
characters on the APP5 moderation precedent.

The alternative was a default string, which would put text nobody wrote into the
money record. On the mismatch path the operator's own note becomes
`review_reason` verbatim; no sentence is composed from the mismatch, because
`APP7-B04` §18 forbids fabricating a review vocabulary and the reconciliation row
already carries the observed amount, the observed reference and `resolved_status`
as evidence of exactly what contradicted.

---

## 10. Idempotency — the deliberate non-invention

`APP7-G01` §10 records it: manual verification claims **no** idempotency
namespace, because DB3's `payment.callback` claim is scoped per provider event id
and this flow has no provider — a claim would have to be keyed on something
fabricated. The arbiter that already exists is stronger, and is the one LC-16
CC-10 names: `satisfy()` re-reads the obligation under its row lock, so a second
application finds it `SATISFIED` and is refused.

Retry safety is that same committed truth read back. A verification whose
response was lost is answered `200` with `replayed: true` when, and only when,
three things hold: the attempt is `SUCCEEDED`, the obligation is `SATISFIED` **by
that exact attempt**, and the observed facts still match the same expected facts.
The second condition is what makes it convergence rather than credulity — an
attempt that succeeded without satisfying the obligation is a state no committed
verification can produce, and one whose deposit was satisfied by a different
attempt is CC-10's loser. Both are refused, as is a retry carrying different
observed facts.

`BACKEND_CONVENTIONS.md` §12 lists payment reconciliation as requiring
idempotency; it is satisfied here by state idempotency — the operation converges
on retry — rather than by a second claim mechanism, which is exactly what §22 of
the directive asks for.

---

## 11. Race and rollback evidence

Both races run as **two independent HTTP requests issued concurrently** against
the running application. Each takes its own pool connection and opens its own
transaction, so the arbiter under test is the database's row lock — not a process
mutex, a queue, or an `await` that happened to serialize the calls. No production
constraint was weakened to manufacture either race.

**Same-attempt race.** Both requests carry identical exact observed facts. Both
answer `200` — neither operator may be told the payment failed — exactly one
reports `replayed: false`, and the database shows one `SUCCEEDED` attempt, one
`SATISFIED` deposit, one `DEPOSIT_PAID` transition row, one reconciliation, one
`payment.verified` and one audit row. Repeated five more times.

**CC-10.** Two eligible attempts on one deposit, both exact by construction
(`openAttempt` copies the obligation's own amount and currency), verified
concurrently. Result is always `[200, 409]`: `satisfied_by_attempt_id` is the
winner, the order transitions once, `payment.verified` exists once across *all*
attempts of that obligation, and the loser is still `PENDING` with zero
reconciliations and zero events — its whole transaction rolled back. Repeated
three more times.

**Rollback.** `PaymentDecisionRecorder` is replaced in the **testing module
only** with one whose `recordVerified` throws. It runs after the attempt has been
settled, the obligation satisfied, the order transitioned and the reconciliation
appended, still inside the one transaction. After the `500`: attempt `PENDING`
with `succeeded_at` null, obligation `PENDING` with `satisfied_by_attempt_id`
null, order `AWAITING_DEPOSIT` with zero `DEPOSIT_PAID` transition rows, zero
reconciliations, zero outbox rows, zero audit rows. No fault-injection code
exists in the runtime.

---

## 12. Outbox and audit

`payment.verified` (SE-007) is appended inside the successful transaction with
aggregate kind `PAYMENT_ATTEMPT`. Its exactly-once property is the obligation's
row lock, not a counter: `satisfy()` refuses a second application, so at most one
transaction per deposit can reach the append. Payload, asserted byte-for-byte:

```json
{ "paymentAttemptId": "...", "paymentObligationId": "...",
  "obligationKind": "DEPOSIT", "orderId": "..." }
```

Canonical references only — no amount, no code, no contact, no bank value, no
operator note, no evidence metadata, no storage fact, no provider payload.

There is **no** review event. `DB3_SIDE_EFFECT_OUTBOX_CATALOG.md` SE-007
publishes `payment.verified` / `payment.failed` and nothing else, and §25 forbids
inventing one for symmetry. The admin alert LC-16 `TR-LC16-05` specifies is the
audit row.

Audit is not a judgement call: `DB3_TRANSITION_GUARD_CATALOG.md` marks GRD-011's
Audit column **yes**, and `DB3_LIFECYCLE_SPECIFICATIONS.md` marks `TR-LC16-03`
*"yes (critical)"* and `TR-LC16-05`/`-06` *"yes R"*. Two actions,
`payment_attempt.verified` and `payment_attempt.review_required`, both on target
kind `PAYMENT_ATTEMPT` (already in `AUDIT_TARGET_KINDS`, no migration). The
review paths carry the operator's reason in `audit_events.reason`; the redacted
summary holds ids, the two statuses and the observed figures, and never the free
-form note.

---

## 13. One defect found and fixed during implementation

The first integration run returned `500` on every successful verification.
`orders.transition` was being called with `eventKind: 'DEPOSIT_VERIFIED'`, and
`ck_order_transitions__event_kind_allowed` closes that column to six values
(`STATE_CHANGE`, `DELIVERY_EVENT`, `SAGA_STEP`, `SHIPPING_FREEZE`,
`POINTER_MOVE`, `POST_FREEZE_CORRECTION`). This was an invented vocabulary and
the CHECK rejected it. A deposit verification is an ordinary LC-14 move, so the
argument was removed and the repository writes `STATE_CHANGE`; *why* the order
moved is carried by the reconciliation row and the audit event, which are built
for it.

Adding `lockAttemptForVerification` also pushed
`drizzle-payment-obligation.repository.ts` to 404 lines, one over the CLAUDE.md
§6 hard limit. It was split by responsibility — not by line range — into
`PaymentAttemptRepository`, delegated to on the pattern
`PaymentEvidenceRepository` and `DrizzleOrderShippingRepository` already set, so
the aggregate still presents one `PaymentObligationRepository` contract.
`openAttempt` deliberately stayed with the obligation, because it is decided
under the *obligation's* row lock. The 29-test shared payment persistence suite
was re-run against the split and passes unchanged.

---

## 14. Command ledger

| Command/check | Exact B04 question | Result | Reruns | Changed input causing rerun |
|---|---|---|---:|---|
| `jest src/modules/payment/domain/verification` | Is the money comparison exact and the LC-16 classification right, with no database? | PASS — 17 tests | 0 | — |
| `jest src/modules/payment/presentation/admin-payment.contract` | Does the published document say exactly what B04 claims — 3 operations, strict bodies, safe DTOs? | PASS — 24 tests | 1 | First run failed one assertion: the platform augments every operation with a `500`. The assertion was corrected to state it. |
| `jest test/integration/admin-payment-verification` | Against real PostgreSQL and real HTTP: does the read report exact DEPOSIT facts and write nothing, and does a verification settle → satisfy → transition atomically? | PASS — 17 tests | 2 | First run: 11 read tests passed, 4 verify tests `500`. Diagnosed with a throwaway debug spec reading the log sink — `DEPOSIT_VERIFIED` violated `ck_order_transitions__event_kind_allowed`. Re-run after the fix; re-run again after the evidence-metadata tests were added. |
| `jest test/integration/admin-payment-review` | Does anything short of an exact match ever satisfy a deposit? | PASS — 14 tests | 0 | — |
| `jest test/integration/admin-payment-races` | One application under a same-attempt race and under CC-10; no partial state after a mid-transaction failure. | PASS — 5 tests | 1 | First run: 4 failures, all test-side — `outbox_events.aggregate_id` is polymorphic **text** (REL-104) and the join needed a cast. |
| `jest payment-persistence.integration` | Does `PaymentPersistenceModule` still compose, and do the delivered AGG-16 guards still hold, after the writer was extended and split? | PASS — 29 tests | 1 | Re-run after the `PaymentAttemptRepository` split — a changed shared input. |
| `jest "public-order-deposit.contract\|admin-order.contract"` | Do the two sibling "and nothing else" path bounds still hold now that B04 adds three routes? | PASS — 74 tests | 0 | Both were edited to **name** B04's paths rather than be loosened. |
| `jest "admin-payment\|payment-verification"` | Everything B04 owns, after Prettier reformatted five files. | PASS — 5 suites / 77 tests | 0 | Formatting was a changed input. |
| `tsc --noEmit` (api, persistence, worker, api-client) | Does every consumer of the extended shared contract still compile? | PASS ×4 | 1 | api re-run after the two packages were rebuilt — `dist` was the stale input. |
| `pnpm --filter @embroidery/database build`, `... persistence build` | — | PASS | 1 | persistence rebuilt after the repository split. |
| `openapi:generate` | What is the exact delta? | 84 / 91 / 191 | 0 | One generation. |
| `openapi:check` | Is the committed artifact current? | PASS | 1 | Re-run after Prettier touched source. |
| `api-client generate` → `check:generated` → `typecheck` | Is the client truthful and additive? | PASS — +313 lines, 0 deletions | 0 | — |
| `node tools/check-file-size.mjs` | Does anything in the changed set exceed a §6 hard limit? | PASS for every changed file | 1 | First run found `drizzle-payment-obligation.repository.ts` at 404. Split by responsibility and re-checked. |
| `eslint` (changed files, 3 packages) | — | PASS, 0 findings | 0 | — |
| `prettier --write` (changed files) | — | 5 files reformatted | 0 | — |
| `git diff --check` | — | clean | 0 | — |

Not run, by design: `pnpm quality`, `quality:e2e`, the full Jest run, the full
API / Payment / Order / worker suites, the B03 integration suites, the B05
336-test suite, every DB manifest / fingerprint / checksum gate, Playwright,
Figma and SonarQube. No PASS command was rerun on unchanged input.

---

## 15. Artifact hashes

```text
OPENAPI_SHA256   = 332f8964278e18909afd19a76e997b413443f5a0d49d1e9da133f36e4abe66a6
API_CLIENT_TREE  = 87de5b8fb6a0fc496a71de3c11b77b41142860fa752f87f334f6abc7f0c67b34
MIGRATIONS       = 37 (unchanged)
```

---

## 16. Acceptance criteria

All 76 of `APP7-B04` §46 are met. The ones worth naming with their evidence:

| # | Criterion | Evidence |
|---|---|---|
| 1–5 | exactly 3 operations, no fourth | contract suite: exhaustive path/operation bounds, and no Admin binary, customer, provider or webhook route anywhere |
| 6–8 | existing Admin auth and mutation guards reused; actor server-derived | real session cookie; `403` on foreign Origin; `415` on non-JSON; `adminId` absent from both request schemas |
| 9–13 | DEPOSIT only, obligation-sourced amount and currency, B03 reference, no 40 % recompute | read suite; `expectedAmount` = the obligation column; REMAINING never exposed and never verifiable (`409 PAYMENT_ATTEMPT_NOT_VERIFIABLE`) |
| 14–18 | evidence read through the typed association, zero evidence valid, status never payment authority, no storage internals, no binary route | three-state evidence test; zero-evidence verification; `REJECTED`-evidence verification succeeds |
| 19–24 | BANK_TRANSFER enforced, chain server-proved, exact amount/currency/reference, no float | domain suite (17) + integration refusals |
| 25–36 | success is one atomic transaction through the shared writers; `payment.verified` once; 0 provider events; 0 APP8 writes | success test asserts every one from raw SQL |
| 37–43 | mismatch never succeeds; canonical REQUIRES_REVIEW with mandatory reason; explicit review satisfies and transitions nothing | review suite (14) |
| 44–52 | terminal states never regress; winner preserved; retry and both races add no second effect | terminal-state tests + both race proofs, each repeated |
| 53 | rollback leaves no partial state | rollback proof |
| 54–55 | read reflects committed success; read is zero-write | post-verification read test; snapshot equality |
| 56–59 | no provider integration; IMP-O007 open; no APP8/APP9; no migration | `payment_provider_events` count 0 asserted on every path; 37 migrations |
| 60–62 | OpenAPI +3 exactly; client truthful; no unrelated churn | structural delta: 0 removed, 0 existing schemas or paths changed |
| 63–72 | focused suites pass; no broad regression; no PASS rerun on unchanged input | §14 ledger |
| 73–76 | nothing pushed; report exists; B04 COMPLETE; sole Next = B06 | §17 |

---

## 17. Commits and push status

```text
Commit A = B04 runtime + shared persistence extension + focused tests
           + OpenAPI/client artifacts
Commit B = this report + roadmap evidence

PUSH_STATUS = NOT_PUSHED
```

```text
Commit A = dec42cc
```

Commit B is this report and the roadmap evidence.

---

## 18. Handoff to `APP7-B06`

B04 exposes evidence **metadata** and `previewEligible`, and no bytes. `APP7-B06`
owns exactly one Admin private evidence binary delivery operation:
association-first, Admin-authorized, `ACCEPTED`-only, zero-write, and no
existence oracle — the delivered `DeliverRequestAssetUseCase` precedent
(`APP5-B06`). The association id this checkpoint publishes is the locator it
should address; the asset id is deliberately never published.

```text
NEXT_CHECKPOINT = APP7-B06
```
