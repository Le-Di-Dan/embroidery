# APP7-B04-C1 — Correction Report

## Separate Expected Transfer Reference from Observed Bank Evidence

- Checkpoint: `APP7-B04-C1`
- Parent: `APP7-B04`
- Mode: `NARROW CONTRACT / RECONCILIATION CORRECTION`
- Correction budget: `1 / 1` — this is the only allowed correction
- Branch/HEAD at entry: `production` @ `7a65527`
- Date: 2026-08-23

---

## 1. Verdict

```text
APP7-B04-C1 = COMPLETE
APP7-B04 = COMPLETE — CORRECTED (C1)
APP7-B04-C2 = MUST_NOT_BE_CREATED

DEFECT =
  OBSERVED_TRANSFER_REFERENCE_WAS_CONSTRAINED_AS_EXPECTED_IDENTIFIER

EXPECTED_REFERENCE =
  SERVER_DERIVED_G01_B03_CANONICAL_REFERENCE

OBSERVED_REFERENCE =
  ADMIN_OBSERVED_RECONCILIATION_FACT

OBSERVED_REFERENCE_CANONICAL_PATTERN = NONE
OBSERVED_REFERENCE_NORMALIZATION     = NONE

NONCANONICAL_REFERENCE_REVIEW_PROOF = PASS
EXACT_REFERENCE_SUCCESS_PROOF       = PASS

PAYMENT_STATE_MACHINE_CHANGE = NONE
TRANSACTION_CHANGE           = NONE
CC10_CHANGE                  = NONE

HTTP_OPERATIONS  = 3
SCHEMA_CHANGE    = NONE
MIGRATION_CHANGE = NONE

RACE_CONFIDENCE_LOOPS = REMOVED
BROAD_REGRESSION      = NOT_RUN_BY_DESIGN

NEXT_CHECKPOINT = APP7-B06
```

---

## 2. The defect, as delivered

`APP7-B04` shipped this request schema:

```ts
const observedReferenceSchema = z
  .string()
  .trim()
  .regex(DEPOSIT_REFERENCE_PATTERN, 'A deposit reference is ORD, ten code characters, then DC.');
```

and the `APP7-B04` completion report §7 defended it in these words:

> the request schema shape-checks against `DEPOSIT_REFERENCE_PATTERN` so a typo
> is a `400` rather than a silent trip into review

That reasoning is wrong, and the Product Owner is right to reject it.

`^ORD[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}DC$` describes the reference **this
system derives** from `orders.code` and prints in the customer's payment
instructions. It does not, and cannot, describe what a bank memo actually
contains. A customer can type the right characters in lowercase, drop one, add a
hyphen, let their banking app truncate the field, or write "tien coc ao thun"
instead — and every one of those is precisely the contradiction `APP7-B04` §17
and §18 require to become a durable `REQUIRES_REVIEW` with reconciliation
evidence.

By validating the **observed** value against the **expected** value's format, the
delivered contract made those cases unreachable. The operator got a `400`, the
attempt stayed `PENDING`, and no row anywhere recorded what the bank transaction
had actually contained. That is the one fact manual reconciliation exists to
capture, and B04 was destroying it at the DTO boundary — which the delivered
`refshape` test asserted as correct behaviour.

The defect was in the request contract only. The comparison, the transaction, the
state machine and the persistence were already right: `judgeObservedTransfer`
already compared verbatim with no case folding and no normalization, and
`appendReconciliation` already stored `bank_reference` untransformed. Nothing
downstream of the schema needed to change.

---

## 3. The correction

```ts
const observedReferenceSchema = z.string().max(2_000);
```

- **No pattern.** The canonical alphabet is gone from this field, and no
  replacement alphabet was invented for C1.
- **No `.trim()`.** Leading and trailing whitespace is part of what the operator
  observed; trimming it would silently edit a financial fact.
- **No uppercasing, punctuation stripping, whitespace collapsing, Unicode
  normalization or character replacement.** The string that arrives is the string
  compared and the string persisted.
- **No minimum length.** An empty memo is a real observation — a transfer can
  arrive carrying none — so it is accepted and recorded as what it is. It simply
  will not match.
- **A size ceiling only.** `COL-TBL057-08` (`payment_reconciliations.bank_reference`)
  is nullable `text` with no CHECK, no length and no character set, so there was
  no pre-B04 bound to preserve. The 2000-character ceiling is the bound this same
  body already applies to the operator's written reason, and it exists for that
  rule's reason alone: an authenticated operator should not be able to write an
  unbounded blob into the money record by accident. It constrains size and
  nothing else — every byte, in any case, in any script, reaches the comparison.

Both bodies share the schema, so the explicit review operation's optional
observed reference is corrected by the same edit.

### What was deliberately not touched

The expected reference keeps its authority in full. `DEPOSIT_REFERENCE_PATTERN`
still governs `depositTransferReference`, still appears in `deposit-reference.spec.ts`,
and the derived `expectedTransferReference` is still published with a canonical
15-character example. C1 stops imposing the identifier's shape on evidence; it
does not weaken the identifier.

The observed **amount** keeps its decimal pattern. `APP7-B04-C1` §10 freezes the
money comparison and the amount is not a canonical identifier — its pattern is
the shape of any decimal amount, not of an issued value. Widening it was out of
scope and was not done.

---

## 4. The comparison is unchanged, and still strict

`judgeObservedTransfer` was not edited. Equality remains exact string equality:

```text
expected: ORD7K3MPQ2XVDDC
observed: ord7k3mpq2xvddc
=> NOT SUCCESS
=> REQUIRES_REVIEW
```

Accepting the lowercase value at the request boundary does **not** make it
equivalent. It makes the contradiction representable, so it can be recorded.

---

## 5. Race-test governance correction (§11)

`APP7-B04` shipped two tests whose only purpose was repeated execution:

```text
'repeats the same-attempt race five more times, always exactly one application'
'repeats CC-10 three more times, always one winner and one intact loser'
```

Both are removed. This was a validation-discipline defect, not a runtime one:
repeating a race is running a passing command again on unchanged input, which
buys confidence rather than evidence. Either the arbiter is the obligation row
lock — in which case one execution proves it — or it is timing, in which case
eight executions prove nothing either. The determinism lives in the assertions
(`[200, 409]`, one satisfying attempt, one `DEPOSIT_PAID` transition row, one
`payment.verified`), not in the repeat count. The reasoning is recorded in the
suite header so the loops are not reintroduced.

No barrier, locking or concurrency assertion was changed. The suite is now three
tests: one same-attempt race, one CC-10 race, one rollback proof.

---

## 6. Changed files

| File | Change |
|---|---|
| `modules/payment/presentation/schemas/admin-payment.request.ts` | `observedReferenceSchema` loses the canonical pattern and the `.trim()`; the unused `DEPOSIT_REFERENCE_PATTERN` import is dropped; the header records the expected-vs-observed rule |
| `modules/payment/presentation/admin-payment.contract.spec.ts` | the `refshape` expectation is replaced by two assertions — the observed memo publishes no `pattern`/`enum`/`minLength` and only `maxLength: 2000`, and the derived expected reference still carries a canonical example |
| `test/integration/admin-payment-review.integration.spec.ts` | the `400` shape test becomes the discriminating lowercase → `REQUIRES_REVIEW` regression |
| `test/integration/admin-payment-races.integration.spec.ts` | both repetition loops removed; header records why |
| `packages/contracts/openapi/openapi.generated.json` | 2 lines |
| `packages/api-client/src/generated/embroidery-api.schemas.ts` | 2 lines |

No runtime use case, repository, module, controller, policy or recorder was
touched. No schema, no migration, no new route, no new operation.

---

## 7. Discriminating regression

Replaces the delivered test that asserted the defect as correct behaviour:

```ts
const lowercase = seeded.expectedReference.toLowerCase();
expect(lowercase).not.toBe(seeded.expectedReference);

POST …/verify { observedAmount: '765000.00',
                observedTransferReference: lowercase,
                note: '…' }
```

Asserted:

```text
HTTP 200                              (not 400 — it reaches the business logic)
attemptStatus            REQUIRES_REVIEW
depositStatus            PENDING
orderStatus              AWAITING_DEPOSIT
reconciliations          exactly 1
reconciliation.bank_reference  === the exact lowercase string
reconciliation.resolved_status REQUIRES_REVIEW
attempt row (raw SQL)    REQUIRES_REVIEW
payment.verified         0
payment_provider_events  0
obligation.satisfied_by_attempt_id  NULL
```

The `bank_reference` assertion is the one that matters: it proves the value was
stored verbatim rather than uppercased or normalised toward the expected one, so
a later audit can still distinguish *what the customer was instructed to use*
from *what the transaction actually contained*.

The existing foreign-order-reference case (a valid canonical reference belonging
to a **different** order, at the exact amount → `REQUIRES_REVIEW`, both orders
untouched) is retained unchanged.

### Exact-success regression

The delivered success test is retained and re-run on its own: the genuine
canonical reference at the exact amount still yields `SUCCEEDED` → `SATISFIED` →
`DEPOSIT_PAID` with one reconciliation, one `payment.verified`, one audit row,
zero provider events and zero APP8 writes. C1 did not weaken the expected
reference.

---

## 8. OpenAPI and client delta

The whole artifact diff, both hunks:

```diff
 "observedTransferReference": {
-  "pattern": "^ORD[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}DC$",
+  "maxLength": 2000,
   "type": "string"
 },
```

— once in `ReviewPaymentAttemptBody`, once in `VerifyPaymentAttemptBody`. Nothing
else in the document changed.

```text
OPENAPI_BEFORE = 84 paths / 91 operations / 191 schemas
OPENAPI_AFTER  = 84 paths / 91 operations / 191 schemas
OPENAPI_DELTA  = 2 lines, both the observed-reference request property
                 0 paths, 0 operations, 0 schemas added or removed
                 0 response schemas changed

API_CLIENT_DELTA = 2 insertions / 2 deletions in one file
                   `@pattern …` -> `@maxLength 2000` on both bodies

OPENAPI_SHA256  = 2b7051156f2860ac16fe3aa505721035e05cbb1c6d8886629572f7f35b4e2225
API_CLIENT_TREE = 13d78dd75a438b094219a7e1230a9440ec6823c3e5f99056f4b9107d4ddc51db
```

The three operation ids are untouched: `adminOrderPayment_read`,
`adminPaymentAttempt_verify`, `adminPaymentAttempt_review`.

---

## 9. Command ledger

| Command/check | Exact changed input/question | Result | Reruns | Why sufficient |
|---|---|---|---:|---|
| `jest admin-payment.contract` | The request schema changed. Does the published document now distinguish the derived expected reference from the observed memo? | PASS — 26 tests | 1 | First run after the schema edit. Re-run once after Prettier reformatted the spec — a changed input. Two new assertions cover both halves of the rule. |
| `jest admin-payment-review -t "non-canonical memo"` | The discriminating regression is new. Does a lowercase memo reach the business logic and commit a durable review with the exact value persisted? | PASS — 1 test (13 skipped) | 0 | Selected by name, so the 13 unaffected cases in the file did not run. |
| `jest admin-payment-verification -t "settles the attempt, satisfies the deposit"` | Did relaxing the request contract weaken the expected-reference authority? | PASS — 1 test (16 skipped) | 0 | The single exact-success proof §9 asks for; the other 16 B04 success cases were not rerun. |
| `jest admin-payment-races` | The race source itself was edited to remove the repetition loops. Do the three deterministic proofs still hold? | PASS — 3 tests | 0 | One execution, exactly as §11 permits. The 5×/3× loops are gone and were **not** run again. |
| `tsc --noEmit` (api) | Does the relaxed schema still typecheck against the use cases? | PASS | 1 | Once after the schema edit, once after widening the contract-spec shape type. |
| `openapi:generate` | What is the exact delta? | 84/91/191, 2 lines | 0 | One generation. |
| `openapi:check` | Is the committed artifact current? | PASS | 0 | — |
| `api-client generate` → `check:generated` → `typecheck` | Is the client truthful? | PASS — 2/2 lines | 0 | — |
| `prettier --write` (4 changed files) | — | 1 file reformatted | 0 | — |
| `eslint` (4 changed files) | — | PASS, 0 findings | 0 | — |
| `git diff --check` | — | clean | 0 | — |

Not run, by design: the full B04 77-test set (narrower selection was possible in
every case), the shared payment-persistence suite (no shared source changed), the
B03 and B05 suites, the full API and worker suites, every DB gate, Playwright,
Figma and SonarQube. **No same-attempt or CC-10 race was rerun for confidence,
and no PASS command was rerun on unchanged input.**

---

## 10. Acceptance criteria

All 31 of §16 are met. The load-bearing ones:

| # | Criterion | Evidence |
|---|---|---|
| 1–2 | expected reference stays canonical and server-derived | `depositTransferReference` untouched; `deposit-reference.spec.ts` untouched; contract test asserts the published expected example still matches `^[A-Z0-9]{15}$` |
| 3–4 | `observedTransferReference` drops the pattern; no replacement alphabet | contract test asserts `pattern` and `enum` are both `undefined`; the artifact diff shows the removal |
| 5–7 | not uppercased, not punctuation-stripped, not normalized into success | no `.trim()` and no transform in the schema; `judgeObservedTransfer` unedited; the regression asserts the stored value is byte-identical to what was sent |
| 8 | exact canonical reference still succeeds | exact-success regression |
| 9–11 | lowercase reaches business logic, becomes `REQUIRES_REVIEW`, value persisted exactly | discriminating regression, all four assertions |
| 12–15 | deposit unsatisfied, order `AWAITING_DEPOSIT`, no `payment.verified`, no provider event | `expectDepositUntouched` on the mismatch path |
| 16–17 | no money-comparison, transaction or CC-10 behaviour change | no runtime file changed at all |
| 18–20 | 3 operations, no B06 operation, no schema change | contract suite bounds; `git status` shows six files, none a migration |
| 21–22 | request schema distinguishes expected from observed; client current | artifact diff; `check:generated` PASS |
| 23–25 | races not rerun for confidence; loops removed | ledger; suite is now 3 tests |
| 26–27 | change-impact only; no PASS rerun on unchanged input | ledger names the changed input for every rerun |
| 28–31 | report exists; C2 must not be created; B06 sole Next; nothing pushed | §11 below |

---

## 11. History, commit and push status

History is preserved rather than rewritten. The `APP7-B04` completion report
still contains its original §7 paragraph defending the shape check, and this
report quotes it as the defect:

```text
APP7-B04
  -> PO review found the observed reference incorrectly constrained to the
     expected identifier's format
  -> APP7-B04-C1 separates the server-derived expected identifier from the
     Admin-observed reconciliation fact
```

```text
APP7-B04-C1 = COMPLETE
APP7-B04    = COMPLETE — CORRECTED (C1)
APP7-B04-C2 = MUST_NOT_BE_CREATED

COMMIT      = dc93c7e
PUSH_STATUS = NOT_PUSHED
NEXT_CHECKPOINT = APP7-B06
```
