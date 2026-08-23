# APP7-B04-FD1 — Final Report

## Remove the Last Invented Constraint from Observed Bank Evidence

- Checkpoint: `APP7-B04-FD1`
- Parent: `APP7-B04`
- Supersedes: `APP7-B04-C1`'s observed-reference bound
- Mode: `FINAL_MANDATORY_DIRECTIVE / NO_FURTHER_CORRECTION`
- Branch/HEAD at entry: `production` @ `371a2f8`
- Date: 2026-08-23

---

## 1. Verdict

```text
APP7-B04-FD1 = COMPLETE
APP7-B04-C1  = SUPERSEDED_BY_FINAL_CONTRACT_REPAIR
APP7-B04     = COMPLETE — CORRECTED — REVIEW_READY
APP7-B04-C2  = MUST_NOT_BE_CREATED

EXPECTED_REFERENCE =
  SERVER_DERIVED_G01_B03_CANONICAL_REFERENCE

OBSERVED_REFERENCE =
  ADMIN_OBSERVED_RECONCILIATION_FACT

OBSERVED_REFERENCE_PATTERN        = NONE
OBSERVED_REFERENCE_MIN_LENGTH     = NONE
OBSERVED_REFERENCE_MAX_LENGTH     = NONE
OBSERVED_REFERENCE_NORMALIZATION  = NONE
OBSERVED_REFERENCE_TRANSFORMATION = NONE

LONG_OBSERVED_REFERENCE_ACCEPTANCE = PASS
LOWERCASE_MISMATCH_REVIEW_PROOF    = PASS
EXACT_REFERENCE_SUCCESS_PROOF      = PASS

PAYMENT_STATE_MACHINE_CHANGE = NONE
TRANSACTION_CHANGE           = NONE
CC10_CHANGE                  = NONE

HTTP_OPERATIONS  = 3
SCHEMA_CHANGE    = NONE
MIGRATION_CHANGE = NONE
MIGRATIONS       = 37

RACE_TESTS_RUN   = NO
BROAD_REGRESSION = NOT_RUN_BY_DESIGN

NEXT_CHECKPOINT = APP7-B06
```

---

## 2. The defect, and why it is the same one twice

`APP7-B04-C1` removed the canonical pattern from `observedTransferReference` and
replaced it with:

```ts
const observedReferenceSchema = z.string().max(2_000);
```

The C1 report's own authority audit, in the same document, established:

> `COL-TBL057-08` (`payment_reconciliations.bank_reference`) is nullable `text`
> with no CHECK, no length and no character set, so there was no pre-B04 bound to
> preserve.

and then justified the ceiling as *"the bound this same body already applies to
the operator's written reason"*. That is not authority for `bank_reference`. It
is authority for a **note**, borrowed by adjacency.

So C1 fixed the large version of the defect and left the small one: the
application still asserted something no accepted document says — that a real bank
memo longer than 2000 characters cannot exist — and would have answered `400`
rather than recording it. The rule the two passes together establish is worth
stating plainly, because it is the one I got wrong twice:

> A constraint on a field is authorized by the thing being constrained, never by
> a neighbouring field that happens to be nearby. "The column has no bound" is a
> finding to honour, not a gap to fill.

Body-size abuse is the delivered HTTP transport layer's concern. A Payment-domain
field constraint is not a substitute for it, and none was added here.

---

## 3. The correction

```ts
const observedReferenceSchema = z.string();
```

Removed: `.max(2_000)`. Already absent since C1 and still absent: `.min()`,
`.regex()`, `.trim()`, case transforms, `.transform()`, Unicode normalization,
character replacement, enum and format. No number replaced the `2000` and no
limit was borrowed from the note, the review reason, the expected reference, the
QR payload, `orders.code`, a provider reference or an HTTP abuse policy.

Both bodies share the schema, so `verify` (required) and `review` (optional)
carry the identical final rule — there is no operation where one is bounded and
the other is not.

### What was deliberately not touched

- **The operator's written reason** keeps `.trim().min(1).max(2_000)` on both
  bodies. The asymmetry is the point and is now asserted by a test: a
  human-authored explanation has an accepted length policy, an observed financial
  fact does not.
- **The expected reference** keeps its full authority.
  `DEPOSIT_REFERENCE_PATTERN` still governs `depositTransferReference`, its own
  spec is untouched, and the published `expectedTransferReference` still carries
  a canonical 15-character example — asserted by a test.
- **The comparison** is unedited. `judgeObservedTransfer` still compares exact
  string equality with no case folding and no normalization.
- **The observed amount** keeps its decimal pattern (§11 freezes the money
  comparison).

---

## 4. Nothing else narrowed the value

Source inspection across every layer the string crosses, which is why a single
integration proof closes the changed path:

```text
Zod observedReferenceSchema        the only narrowing layer  -> removed
controller  body.observedTransferReference                   -> passed through
command     VerifyPaymentAttemptCommand / ReviewPaymentAttemptCommand
                                                             -> passed through
policy      judgeObservedTransfer                            -> compares, does not alter
use case    appendReconciliation({ bankReference })          -> passed through
persistence paymentReconciliations.bankReference             -> `text`, unbounded
```

No `substring`, no truncating cast, no display copy standing in for the persisted
evidence.

---

## 5. Regressions

### New — long observed memo (`APP7-B04-FD1`)

```ts
const long = `${seeded.expectedReference}-${'x'.repeat(5_000)}`;
expect(long.length).toBeGreaterThan(2_000);
```

Asserted after `POST …/verify`:

```text
HTTP 200                                   (not 400)
attemptStatus                REQUIRES_REVIEW
reconciliations              exactly 1
reconciliation.bank_reference        === long        (byte-for-byte)
reconciliation.bank_reference.length === long.length (so a silent truncation to
                                                      2000 cannot pass by prefix
                                                      equality)
depositStatus                PENDING
orderStatus                  AWAITING_DEPOSIT
payment.verified             0
payment_provider_events      0
obligation.satisfied_by_attempt_id   NULL
```

The separate length assertion is deliberate: `toBe(long)` alone would also pass
if some layer had truncated *both* sides, and prefix equality is exactly the
failure mode a truncating cast produces.

A long memo remains a **mismatch**, not a success.

### Retained — lowercase mismatch (`APP7-B04-C1`)

Kept unchanged and re-run: a lowercase canonical memo reaches the business logic,
commits `REQUIRES_REVIEW`, and persists byte-identically. It remains the proof
that non-canonical evidence is not normalized into success.

### Retained — exact success (`APP7-B04`)

Kept unchanged and re-run: the genuine canonical reference at the exact amount
still yields `SUCCEEDED` → `SATISFIED` → `DEPOSIT_PAID`. FD1 did not weaken the
expected-reference authority.

### New — contract assertions

`maxLength` is now asserted **absent** alongside `pattern`, `format`, `enum` and
`minLength`, and a second test pins the note/reason bound so removing the
observed bound cannot silently remove that one too.

---

## 6. Changed files

| File | Change |
|---|---|
| `modules/payment/presentation/schemas/admin-payment.request.ts` | `observedReferenceSchema` becomes `z.string()`; the header records why a neighbouring field is not authority |
| `modules/payment/presentation/admin-payment.contract.spec.ts` | observed memo asserted free of `pattern`/`format`/`enum`/`minLength`/`maxLength`; new assertion pins the note/reason bound |
| `test/integration/admin-payment-review.integration.spec.ts` | new long-memo regression |
| `packages/contracts/openapi/openapi.generated.json` | 2 lines removed |
| `packages/api-client/src/generated/embroidery-api.schemas.ts` | 2 lines removed |

No runtime use case, repository, module, controller, policy or recorder was
touched — the same as C1. No schema, no migration, no route, no operation.

---

## 7. OpenAPI and client delta

The whole artifact diff:

```diff
 "observedTransferReference": {
-  "maxLength": 2000,
   "type": "string"
 },
```

— once in `ReviewPaymentAttemptBody`, once in `VerifyPaymentAttemptBody`.

```text
OPENAPI_BEFORE = 84 paths / 91 operations / 191 schemas
OPENAPI_AFTER  = 84 paths / 91 operations / 191 schemas
OPENAPI_DELTA  = 2 lines removed; 0 paths, 0 operations, 0 schemas added,
                 removed or otherwise changed
API_CLIENT_DELTA = 2 deletions in one file (`@maxLength 2000` on both bodies)

OPENAPI_SHA256  = 42db932a9516e964070410fe95961e59137e2a59d7036f7ec8c76f4d15bbf914
API_CLIENT_TREE = 1030185e9a334000de8a78d24ac35d68dad8f9e265de114ee7e508a5ce141b0b
```

Operation ids untouched: `adminOrderPayment_read`, `adminPaymentAttempt_verify`,
`adminPaymentAttempt_review`.

---

## 8. Command ledger

| Command/check | Exact changed input/question | Result | Reruns | Why sufficient |
|---|---|---|---:|---|
| `jest admin-payment.contract` | The request schema lost `.max(2_000)`. Does the document now publish the observed memo with no constraint, and is the note bound still there? | PASS — 27 tests | 0 | One run. Two assertions cover both halves. |
| `jest admin-payment-review -t "longer than any invented bound"` | New regression. Does a 5000-character memo reach the business logic and persist untruncated? | PASS — 1 test (14 skipped) | 0 | Selected by name. Closes the only changed path; source inspection (§4) already showed Zod was the sole narrowing layer. |
| `jest admin-payment-review -t "non-canonical memo"` | Its file changed. Does the C1 lowercase proof still hold? | PASS — 1 test (14 skipped) | 0 | Selected by name; the other 14 cases did not run. |
| `jest admin-payment-verification -t "settles the attempt, satisfies the deposit"` | The canonical reference now passes through an unconstrained schema. Does exact success still hold? | PASS — 1 test (16 skipped) | 0 | The single proof §17.18 requires; the other 16 B04 cases did not run. |
| `tsc --noEmit` (api) | Does the widened schema still typecheck? | PASS | 0 | — |
| `openapi:generate` | What is the exact delta? | 84/91/191, 2 lines | 0 | One generation. |
| `openapi:check` | Is the committed artifact current? | PASS | 0 | — |
| `api-client generate` → `check:generated` → `typecheck` | Is the client truthful? | PASS — 2 deletions | 0 | — |
| `prettier --write` (3 changed files) | — | 0 reformatted | 0 | — |
| `eslint` (3 changed files) | — | PASS, 0 findings | 0 | — |
| `git diff --check` | — | clean | 0 | — |

**`admin-payment-races.integration.spec.ts` was not run.** This change is
request-schema-only; the concurrency inputs, the locking and the persistence path
are untouched, and §10 forbids running it merely because a directive exists. The
C1 loop removal stands and no loop was recreated — the suite remains one
same-attempt race, one CC-10 race and one rollback proof.

Also not run: the full B04 set, the shared payment-persistence suite, B03, B05,
the full API and worker suites, every DB gate, Playwright, Figma and SonarQube.
No PASS command was rerun on unchanged input.

---

## 9. Acceptance criteria

All 31 of §17 are met. The load-bearing ones:

| # | Criterion | Evidence |
|---|---|---|
| 1–6 | plain string; no regex, minLength, maxLength, trim, normalization or transformation | `z.string()`; contract test asserts all five keywords absent from the published schema |
| 7 | verify and review share the final rule | one `observedReferenceSchema`, referenced by both bodies; the contract test loops over both paths |
| 8 | note/reason bound unchanged | new contract assertion pins `maxLength: 2000` on `note` and `reviewReason` |
| 9–10 | expected reference strict; comparison unchanged | `deposit-reference.ts` and `payment-verification.policy.ts` not in the changed set; contract test asserts the canonical published example |
| 11 | lowercase mismatch still reaches review | C1 regression re-run |
| 12–14 | >2000 accepted, not truncated, persisted exactly | long-memo regression, with a separate length assertion |
| 15–17 | mismatch never satisfies, never transitions, emits nothing | `expectDepositUntouched` on the long-memo path |
| 18 | exact canonical reference still succeeds | exact-success regression re-run |
| 19–20 | 3 operations; observed fields carry no pattern/format/enum/minLength/maxLength | contract suite |
| 21–22 | client current; no schema or migration change | `check:generated` PASS; 5 changed files, none a migration; 37 migrations |
| 23–25 | no concurrency change; races not rerun; loops still absent | races file not in the changed set and not executed |
| 26–27 | change-impact only; no PASS rerun on unchanged input | §8 ledger |
| 28–31 | report exists; no C2; B06 sole Next; nothing pushed | §10 |

---

## 10. History, commit and push status

The `APP7-B04` and `APP7-B04-C1` reports are unedited. The chain is:

```text
APP7-B04     implemented Admin verification, and constrained the observed memo
             by the expected identifier's pattern
  -> APP7-B04-C1 separated the server-derived identifier from the observed fact,
                 but replaced the pattern with a 2000-character bound borrowed
                 from the note field beside it
  -> APP7-B04-FD1 removed that bound; the observed fact now carries no
                  field-level constraint, because its column has none
```

```text
APP7-B04-FD1 = COMPLETE
APP7-B04-C1  = SUPERSEDED_BY_FINAL_CONTRACT_REPAIR
APP7-B04     = COMPLETE — CORRECTED — REVIEW_READY
APP7-B04-C2  = MUST_NOT_BE_CREATED

COMMIT      = 4f3e677
PUSH_STATUS = NOT_PUSHED
NEXT_CHECKPOINT = APP7-B06
```
