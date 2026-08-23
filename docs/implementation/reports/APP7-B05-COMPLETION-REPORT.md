# APP7-B05 — Customer Transfer-Evidence Upload and Own-Evidence Status

- Phase: APP7 — Deposit Payment and Order Creation
- Checkpoint: `APP7-B05`
- Mode: `IMPLEMENTATION / BACKEND / PAYMENT EVIDENCE INTAKE`
- Authority: `PO-APP7-001`, `APP7-G01` §7, `APP7-DB01`, `APP7-B03`, `ADR-APP4-001`, `IMP-D048`
- HTTP operations: 2
- Date: 2026-08-23

## 1. Verdict

```text
APP7-B05 = COMPLETE
CHECKPOINT_SCOPE = CUSTOMER_TRANSFER_EVIDENCE_INTAKE
HTTP_OPERATIONS = 2

EVIDENCE_UPLOAD_OPERATION = POST /api/public/orders/deposit/evidence
                            — publicOrderDepositEvidence_upload
EVIDENCE_STATUS_OPERATION = POST /api/public/orders/deposit/evidence/status
                            — publicOrderDepositEvidence_status

TRANSFER_EVIDENCE_REQUIRED  = false
TRANSFER_EVIDENCE_SUPPORTED = true
EVIDENCE_AUTHORITY = SUPPORTING_RECONCILIATION_ONLY

ASSET_INTAKE_LANE = PAYMENT_EVIDENCE_INTAKE_LANE
  (apps/api/src/modules/payment/domain/evidence/transfer-evidence.policy.ts)
ASSET_KIND = CUSTOMER_UPLOAD
ASSET_CLASSIFICATION = CUSTOMER_PRIVATE
MEDIA_TYPES = image/jpeg,image/png,image/webp
MAX_SOURCE_SIZE = 10 MiB (10_485_760 bytes, incremental)

ATTEMPT_BINDING =
  secure token -> secure_access_grants (row-locked re-authorization)
    -> grant.custom_request_id
      -> orders.custom_request_id (uq_orders__request)
        -> payment_obligations(kind = DEPOSIT, live)
          -> the exact payment_attempts row named by attemptId,
             re-proved on obligation id, obligation kind, order id and
             method = BANK_TRANSFER, all under the attempt's own row lock

STEP_UP = payment_attempts.step_up_challenge_id re-verified, never re-issued
          and never caller-supplied: the recorded challenge must exist, be a
          STEP_UP, be VERIFIED, and belong to a verified, non-deactivated
          contact of the grant's customer

MAX_EVIDENCE_PER_ATTEMPT = 5
QUOTA_ARBITER = payment_attempt row lock (SELECT … FOR UPDATE)
QUOTA_RACE = PASS

ASSOCIATION_TABLE = payment_transfer_evidence
ASSOCIATION_BINDING =
  PaymentTransferEvidenceRepository.bind — insert-or-confirm against
  uq_payment_transfer_evidence__attempt_asset, inside Tx B
ASSOCIATION_TIMING = TX_B_WHILE_ASSET_UPLOADED

CUSTOMER_DELETE = NONE
CUSTOMER_REPLACE = NONE
CUSTOMER_BINARY_READ = NONE

UPLOAD_IDEMPOTENCY =
  delivered Idempotency-Key header + IdempotencyAllocationStore
  claim/allocation/complete, namespace public.order.deposit-evidence.upload,
  scope digest over (custom request, proved attempt, raw key)
INSPECTION_DISPATCH = existing asset.inspection.requested outbox event, once
PAYMENT_STATE_CHANGE = NONE

SCHEMA_CHANGE = NONE
MIGRATION_CHANGE = NONE

OPENAPI_BEFORE = 79 paths / 86 operations / 180 schemas
OPENAPI_AFTER  = 81 paths / 88 operations / 184 schemas
OPENAPI_DELTA  = +2 paths / +2 operations / +4 schemas, 632 insertions,
                 0 deletions
API_CLIENT_DELTA = 2 generated files, +158 lines, 0 deletions

FOCUSED_TESTS = 9 suites / 336 tests
BROAD_REGRESSION = NOT_RUN_BY_DESIGN

NEXT_CHECKPOINT = APP7-B04
```

---

## 2. Preflight — recomputed, not read from DB01

| Fact | Value |
|---|---|
| Branch | `production` |
| Entry HEAD | `f950c86` *docs(app7): record APP7-DB01 and advance the roadmap* |
| Migrations | 37 (`0000`…`0037`), unchanged |
| Tables | 79, unchanged |
| OpenAPI at entry | 79 paths / 86 operations / 180 schemas |
| OpenAPI SHA at entry | `8c54482613468af07af342386316e07d831b369dc065bd887b2f68d035e27600` |

Every figure above was recomputed from the working tree at entry rather than
copied from the `APP7-DB01` report, and all four matched what that report
predicted.

---

## 3. What was delivered

Two customer-secure operations, both `POST`, both reached only through the
`REQUEST_ACCESS` grant APP5 created at submission. The whole checkpoint is one
rule made structural, and it is the same rule `APP7-B03` was built on:

> **Nothing a customer can do moves money's state.** The maximum state B05 can
> produce is one `assets` row, one `payment_transfer_evidence` row and one
> `asset.inspection.requested` outbox event.

That is arranged, not merely asserted. `CustomerDepositEvidenceModule` injects
no `ORDER_REPOSITORY`, no Admin guard, no provider client, and it calls no
`settleAttempt`, `satisfy`, `openAttempt`, `appendReconciliation` or
`recordProviderEvent` — so `SUCCEEDED`, `SATISFIED`, `DEPOSIT_PAID`, a
reconciliation row and a provider event are unreachable from the injector.

### 3.1 The fourth intake lane

```text
PAYMENT_EVIDENCE_INTAKE_LANE
  assetKind              CUSTOMER_UPLOAD        (existing ASSET_KINDS value)
  classification         CUSTOMER_PRIVATE       (existing ASSET_CLASSIFICATIONS value)
  maxUploadBytes         10_485_760
  operationNamespace     public.order.deposit-evidence.upload
  declaresMetadataFields false
  credentialFields       ['accessToken', 'attemptId']
```

Every value is `APP7-G01` §7.1's, unchanged. The lane reuses the delivered
pipeline in full: `openMultipartUpload`, `consumeValidatedFile`'s single-pass
count/hash/signature check, `assertAcceptedMediaType`, `normalizeFilename`,
`buildOriginalObjectKey`, `IdempotencyAllocationStore`, `AssetRepository`,
`ObjectStoragePort`, `OutboxEventStore`, `UploadTimer` and the Tx A / stream /
Tx B shape. No second parser, no second reader, no second storage client, no
presign, no direct S3 call and no "complete this upload" operation.

### 3.2 The one widening of a shared contract

`AssetIntakeLane` gained `credentialFields: readonly string[]`, and the parser
gained `OpenedUpload.fields`. This was unavoidable rather than convenient.

The three shipped lanes carry their credential outside the body — a challenge in
the path, a session in a header — so their bodies are one file part and nothing
else. B05's credential is a secure-link token, and `ADR-APP4-001` §11 makes the
body its **only** carrier, declaring path, query and header `FORBIDDEN` with no
fallback. So it has to arrive as a multipart field, and it has to arrive
*before* the file, because it is what authorizes reading a single byte of it.

The parser collects those fields, enforces presence, uniqueness and ordering,
and **never interprets one**: what a field means belongs to the surface that
declared it. The three shipped lanes declare `credentialFields: []` and their
behaviour is bit-identical — `fieldCapFor` is floored at the delivered
`EXPECTED_FIELDS`, so their Busboy ceiling is the number they shipped with, and
`session-asset-intake.spec.ts`'s exhaustive shape assertion on the Admin lane
was extended to state the empty array rather than loosened.

### 3.3 The attempt is named, and naming is all it does

`APP7-B03` deliberately defined no current-attempt selector, so B05 could not
derive one. `APP7-G01` §7.3 says the attempt is resolved server-side; the B05
directive §4/§5 resolves the tension by allowing an **opaque locator that is
never authorization**. That is exactly what was built:

- the caller sends `attemptId`;
- the server re-authorizes the grant under its row lock, walks
  request → order → live `DEPOSIT` obligation, then locks the named attempt
  `FOR UPDATE` and re-proves **four** facts about it — its obligation is the one
  this grant resolved to, that obligation's kind is `DEPOSIT`, that obligation's
  order is this request's order, and its method is `BANK_TRANSFER`;
- nothing anywhere reads "latest", "first", "newest `PENDING`" or "highest
  `created_at`".

Changing the id therefore does not reach another customer's order; it reaches a
row that fails the first comparison, and the answer is the delivered
`404 / SECURE_LINK_UNAVAILABLE` — byte-identical to the answer a fictional id
gets, which the suite proves by comparing the two responses directly.

### 3.4 Tx A, stream, Tx B

```text
parse multipart as far as the two credential fields   (file stream unread, Busboy stalled)
validate credential shape                             — malformed = the non-enumerating 404
charge the delivered secure-link abuse budget         — before any image byte
begin (pre-stream, courtesy only)
  re-authorize grant under its row lock
  resolve order + live DEPOSIT obligation
  lock the exact attempt FOR UPDATE
  re-verify the attempt's own STEP_UP
  refuse a terminal attempt; refuse a full attempt
commit                                                — releases every lock it took

allocate asset id, association id, object key, claim token
claim the idempotency scope
stream bytes → private bucket (counted, hashed, signature-checked, one pass)

Tx A
  claim still held under its row lock
  registerOrRecover the UPLOADED asset (kind/classification fixed by the lane)
commit                                                — failure here removes the orphan object

Tx B
  claim still held under its row lock
  re-authorize grant + re-lock and re-prove the exact attempt
  list this attempt's associations under that lock
  refuse at 5 (EVIDENCE_QUOTA_REACHED), unless this exact asset is already bound
  bind payment_transfer_evidence (insert-or-confirm)
  beginInspection  →  INSPECTING
  append one asset.inspection.requested outbox event
  complete the idempotency claim with the replayable result
commit
```

No network call happens inside either transaction. There is no `try`/`catch`
inside Tx B that could let a subset commit and no compensation path: a failure
anywhere leaves no association, no inspection event and no completed record.

### 3.5 The association is bound pre-inspection, on purpose

`APP7-G01` §7.4's one deliberate divergence from `custom_request_assets`, and it
is implemented as written: the row is created in Tx B while the asset is still
pre-`ACCEPTED`. The suite asserts the asset is `INSPECTING` at the moment the
association exists. `APP7-B06`'s Admin preview refuses anything not `ACCEPTED`,
which is what keeps an un-inspected or rejected image recorded-but-never-served.

---

## 4. Two judgment calls, recorded rather than left implicit

### 4.1 No freshness window on the re-verified step-up

`APP7-G01` §7.5 requires the attempt's own step-up to be *"re-verified, not
re-issued"*. It does not say whether the initiation freshness window is
re-applied, and the two readings lead to different products, so the choice is
stated here and in `attempt-step-up.verifier.ts`.

**Implemented:** the recorded challenge must exist, be a `STEP_UP`, be
`VERIFIED`, and belong to a verified, non-deactivated contact of the grant's
customer. No `stepUpWindowSeconds` comparison is applied.

**Why.** `APP7-G01` §7.2 states the temporal bound on evidence exactly once and
it is about the attempt — *"once the attempt reaches a terminal state
(`SUCCEEDED`, `FAILED`, `EXPIRED`), that attempt accepts no further evidence"*.
No accepted document states an evidence-freshness window. GRD-003's sensitive
set names "pay", which initiation is and evidence explicitly is not (§7.6:
uploading evidence changes no payment state at all). And re-applying the
initiation window would make the capability unreachable in its own normal flow:
a customer opens the attempt, leaves for their banking application, transfers,
and returns with a screenshot — a round trip that routinely outlasts a fifteen
minute window. Evidence would be refused in precisely the case it exists for,
and §7.2's attempt-state rule would almost never be the operative bound.

**What is still enforced.** A challenge that is not a `STEP_UP`, is not
`VERIFIED`, or whose contact the customer no longer holds is refused with
`REVERIFICATION_REQUIRED` — both proved against a real database.

### 4.2 The credential field is `accessToken`, not `token`

Not a preference — a constraint the two ends of the delivered pipeline impose
together, and it was found by reading the generated client rather than by
reasoning about it.

`serialize-openapi-document.ts` sorts every object key recursively so the
committed artifact's bytes cannot depend on insertion order, and the generated
client appends multipart parts in published order. The first generation
therefore emitted `formData.append('attemptId')`, `append('file')`,
`append('token')` — a body whose credential arrives **after** the bytes, which
the parser refuses, correctly. The published contract would have been one no
generated client could use.

Renaming the credential is the fix that keeps every other rule intact: the file
part stays `file` as in all three shipped lanes, the ordering rule stays
absolute, and no generated file was hand-edited. The status body takes the same
name so the two B05 operations do not disagree. The contract suite now asserts
the sort relation directly — `every credential field < 'file'` — so a future
rename cannot break it silently.

---

## 5. Persistence ownership

One canonical seam, in the shared package, for the reason `APP7-W01-C1` settled
one aggregate over: `APP7-B06` will list the same associations to serve the
Admin preview, and two writers of one table drift on exactly what is hardest to
notice — what "bound" means, and which lock the five-per-attempt rule is decided
under.

`packages/persistence/src/payment/payment-transfer-evidence.repository.ts`,
`PaymentTransferEvidenceRepository`, four operations and no fifth:

| Operation | What it owns |
|---|---|
| `lockAttemptForEvidence` | `SELECT … FOR UPDATE` on the attempt, then its obligation, in one transaction |
| `countForAttempt` | the cheap pre-stream count |
| `bind` | insert-or-confirm against `uq_payment_transfer_evidence__attempt_asset` |
| `listForAttempt` | the bounded, ordered read that answers both the Tx B count and the status projection |

There is no update, no delete and no detach: append-only is enforced by the
absence, not by a flag. It is registered in `PaymentPersistenceModule` and
exported as the class, because it has no port — it is CTX-PAY persistence
consumed by CTX-PAY surfaces.

Asset facts are **not** joined in. `listForAttempt` returns association rows; the
API reads `mediaType`, `byteSize` and status through
`AssetRepository.findScopedByIds` under the `CUSTOMER_UPLOAD`/`CUSTOMER_PRIVATE`
scope, so no module reads another module's persistence internals and an id
outside the lane is simply absent.

---

## 6. Security chain, and what each refusal discloses

| Attempted | Answer | Discloses |
|---|---|---|
| unknown / expired / revoked / superseded token | `404 SECURE_LINK_UNAVAILABLE` | nothing |
| malformed token or malformed attempt id | `404 SECURE_LINK_UNAVAILABLE` | nothing — a prober cannot learn which half was wrong |
| another customer's real attempt id | `404 SECURE_LINK_UNAVAILABLE` | nothing — byte-identical to a fictional id, proved by comparing both responses |
| a `REMAINING` obligation's attempt | `404 SECURE_LINK_UNAVAILABLE` | nothing |
| a non-`BANK_TRANSFER` attempt | `404 SECURE_LINK_UNAVAILABLE` | nothing |
| the attempt's step-up no longer stands | `403 REVERIFICATION_REQUIRED` | only reachable after proving a live grant |
| the attempt is `SUCCEEDED`/`FAILED`/`EXPIRED` | `409 EVIDENCE_ATTEMPT_CLOSED` | as above |
| the attempt already holds five | `409 EVIDENCE_QUOTA_REACHED` | as above |
| oversize / unsupported / signature mismatch | `413` / `415` / `415` | the three delivered media classes and nothing finer |

No message names a scanner, a signature byte, a SQLSTATE, a constraint, a
bucket, an object path or a stack frame. The raw token, the raw
`Idempotency-Key`, the storage key, the checksum and the content fingerprint
appear in no response and in no log; the suite asserts every one of them is
absent from both response bodies, and asserts `idempotency_records` contains the
raw key nowhere in `scope_key` or `result`.

---

## 7. Changed files

### New — API

| File | Lines | What it owns |
|---|---:|---|
| `modules/payment/domain/evidence/transfer-evidence.policy.ts` | 102 | the lane, the cap, the eligible attempt states, the two field names |
| `modules/payment/domain/evidence/transfer-evidence.errors.ts` | 76 | the two codes B05 owns; everything else is reused |
| `modules/payment/domain/evidence/transfer-evidence-credential.ts` | 59 | the body's credential shape rule |
| `modules/payment/domain/evidence/transfer-evidence-fingerprint.ts` | 73 | the idempotency scope and fingerprint |
| `modules/payment/domain/evidence/transfer-evidence-result.codec.ts` | 64 | the allocation and completed records |
| `modules/payment/application/evidence/attempt-step-up.verifier.ts` | 128 | §4.1's rule |
| `modules/payment/application/evidence/evidence-attempt.authorizer.ts` | 134 | the whole chain, under both row locks |
| `modules/payment/application/evidence/transfer-evidence-object.writer.ts` | 160 | allocation, streaming, orphan removal |
| `modules/payment/application/evidence/transfer-evidence-transactions.service.ts` | 262 | Tx A and Tx B |
| `modules/payment/application/evidence/upload-transfer-evidence.service.ts` | 390 | the order of one request |
| `modules/payment/application/evidence/read-transfer-evidence.query.ts` | 118 | the zero-write status read |
| `modules/payment/application/evidence/transfer-evidence.view.ts` | 93 | the two runtime projections |
| `modules/payment/presentation/public-order-deposit-evidence.controller.ts` | 366 | the two operations |
| `modules/payment/presentation/schemas/public-order-deposit-evidence.request.ts` | 173 | the published request contracts |
| `modules/payment/presentation/schemas/public-order-deposit-evidence.response.ts` | 135 | the published response contracts |
| `modules/payment/customer-deposit-evidence.module.ts` | 104 | the composition root, and its absences |

### New — persistence and tests

| File | Lines |
|---|---:|
| `packages/persistence/src/payment/payment-transfer-evidence.repository.ts` | 253 |
| `modules/payment/presentation/public-order-deposit-evidence.contract.spec.ts` | 415 |
| `apps/api/test/support/transfer-evidence-fixture.ts` | 348 |
| `apps/api/test/integration/transfer-evidence.integration.spec.ts` | 323 |
| `apps/api/test/integration/transfer-evidence-authorization.integration.spec.ts` | 455 |

### Modified

| File | Change |
|---|---|
| `modules/asset/domain/intake-lane.ts` | `credentialFields` added to the contract; Admin lane declares `[]` |
| `modules/asset/infrastructure/http/multipart-upload.parser.ts` | collects declared credential fields, enforces presence/uniqueness/ordering, exposes `OpenedUpload.fields`; per-lane field cap floored at the delivered value |
| `modules/design/domain/session-asset-intake.policy.ts` | declares `credentialFields: []` |
| `modules/order/domain/intake/request-intake.policy.ts` | declares `credentialFields: []` |
| `modules/design/session-asset-intake.spec.ts` | the exhaustive Admin-lane shape assertion states the new empty array |
| `modules/payment/presentation/public-order-deposit.contract.spec.ts` | its two "and nothing else" bounds now name B05's two paths explicitly, so they stay exhaustive instead of being loosened |
| `bootstrap/app.module.ts` | registers `CustomerDepositEvidenceModule` |
| `packages/persistence/src/index.ts`, `payment-persistence.module.ts` | export and provide the new repository |
| `packages/contracts/openapi/openapi.generated.json` | +632 lines, 0 deletions |
| `packages/api-client/src/generated/*` | +158 lines, 0 deletions |

Every source file is inside the CLAUDE.md §6 hard limits (source ≤ 400, tests
≤ 600). Two files were split for that reason and by responsibility, not by line
range: `TransferEvidenceObjectWriter` took everything that touches object
storage out of the upload service, and the integration suite was divided into an
intake half and an authorization half.

---

## 8. Evidence

### 8.1 Contract, in process (no database, no container)

`public-order-deposit-evidence.contract.spec.ts` — 84 tests. It proves the
document says exactly what this checkpoint claims:

- exactly two paths under `/api/public/orders` beyond B03's three, one `POST`
  method on each, and the two operation ids;
- **no** `delete`, `patch` or `put` on any path matching `evidence`; no
  `content`/`preview`/`thumbnail`/`download` route; no Admin, provider, webhook
  or reconciliation path anywhere;
- the multipart body is exactly `accessToken`, `attemptId`, `file`, with `file`
  `format: binary`, the 10 MiB figure and the three accepted types stated, and
  `image/gif`, `image/svg`, `application/pdf`, `image/heic` absent;
- every credential field name sorts before `file` (§4.2's invariant);
- 29 server-owned fields rejected from both bodies, including `assetKind`,
  `classification`, `storageKey`, `objectKey`, `bucket`, `checksum`,
  `paymentObligationId`, `stepUpChallengeId`, `grantId`, `customerId`,
  `assetId`, `evidenceId`, `amount`, `method`, `providerKey`, `filename`;
- the upload response publishes `assetStatus` as the single-value enum
  `['INSPECTING']`, and the item response publishes exactly the four customer
  states with `DELETION_PENDING`/`DELETED` absent;
- 22 forbidden response-property substrings and 9 forbidden text substrings,
  checked across all four schemas;
- the list is `maxItems: 5` with no cursor, page, limit, total or `hasMore`;
- no example token anywhere.

### 8.2 Real PostgreSQL, real MinIO, real HTTP

Both suites boot the whole `AppModule` against a disposable PostgreSQL with
every migration applied **and a live disposable MinIO**, so the bytes are
genuinely streamed through the production S3 adapter into a real private bucket.
Nothing under test is overridden: the real controller, global pipe and exception
filter, the real Busboy parser, the real `consumeValidatedFile`, the real
peppered digest, the real `IdempotencyAllocationStore`, the real repositories.
The attempt is opened through `PaymentObligationRepository.openAttempt` — the
writer `APP7-B03` uses — so what B05 binds to is an attempt production actually
wrote, with its recorded grant and step-up.

**`transfer-evidence.integration.spec.ts` — 17 tests.** One PNG produces exactly
one asset (`CUSTOMER_UPLOAD`/`CUSTOMER_PRIVATE`, `uploaded_by_customer_id` from
the grant, `intake_expires_at` and `uploaded_via_challenge_id` both null), one
association and exactly one inspection event; the association exists while the
asset is `INSPECTING`; a filename of `../../etc/passwd; DROP TABLE assets.png`
reaches neither the object key nor any persisted column; the two responses leak
no storage key, asset id, token, grant id, challenge id, customer id, order id,
obligation id, bucket, `sha256` or scanner string; a `REJECTED` asset is
reported as `REJECTED` **and the whole payment state is unchanged**; an attempt
with no evidence answers `200` with an empty list; two attempts on one deposit
keep separate lists; two consecutive status reads change nothing; an SVG
declared `image/png`, a JPEG declared `image/png`, an `application/pdf` and a
10 MiB + 1 stream are all refused with zero durable effect; JPEG is accepted.

**`transfer-evidence-authorization.integration.spec.ts` — 22 tests.** The
cross-order proof uses two real seeded customers; `SUCCEEDED`, `FAILED` and
`EXPIRED` attempts each refuse with `EVIDENCE_ATTEMPT_CLOSED` and their terminal
state is preserved byte-for-byte; a `REQUIRES_REVIEW` attempt accepts supporting
evidence and stays exactly as it was; a settled attempt still lists what was
submitted; the step-up rules refuse with `REVERIFICATION_REQUIRED`; replay,
conflict, cross-scope and raw-key cases; the quota, the independent per-attempt
quota, and the race; and the two zero-state-change proofs.

### 8.3 Quota, exactly as §31 requires

```text
0 → upload succeeds                                   PASS
4 → upload #5 succeeds                                PASS  (5 associations)
5 → upload #6 refused EVIDENCE_QUOTA_REACHED          PASS  (still 5)
4 + two concurrent finalizations → final count 5      PASS  (202 + 409)
separate attempts have independent quotas             PASS  (5 and 1)
```

The race is two concurrent HTTP requests, each on its own pool connection and
its own transaction. Nothing is serialised through a single connection, and the
loser receives the accepted quota refusal rather than a database error. The
suite does **not** rely on the database rejecting row six — `APP7-DB01` proved
it deliberately does not.

### 8.4 Replay

Same key, same bytes → `202`, `replayed: true`, the same `evidenceId`, and the
database holds **one** association and **one** inspection event. Same key,
different bytes → `409 IDEMPOTENCY_CONFLICT` and still one association. Same key
on another customer's attempt → a different scope, so it claims fresh and each
attempt ends with one association of its own. The raw key appears nowhere in
`idempotency_records`.

### 8.5 Zero payment-state change

Snapshotted before and after every upload and status read, as one compared
value: order status and `updated_at`; both obligations' kind, status, amount,
`satisfied_by_attempt_id`, `satisfied_at` and `updated_at`; every attempt's
status, amount, `succeeded_at`, `failed_at`, `review_reason` and `updated_at`;
and the row counts of `payment_reconciliations`, `payment_provider_events` and
`refunds`. All unchanged, including across the `REJECTED`-evidence case and the
`REQUIRES_REVIEW` case. The three evidence tables (`payment_reconciliations`,
`payment_provider_events`, `refunds`) remain at zero rows.

---

## 9. Command ledger

| Command/check | Exact B05 question | Result | Reruns | Why sufficient |
|---|---|---|---:|---|
| `node -e` over `openapi.generated.json` + `sha256sum` (entry) | What is the accepted surface this checkpoint starts from? | 79 / 86 / 180, SHA `8c544826…` | 0 | Recomputed, not read from the DB01 report; matched it. |
| `pnpm --filter @embroidery/persistence exec tsc --noEmit` | Does the new repository typecheck against the real schema? | PASS | 0 | Ran once after the repository; no persistence input changed afterwards. |
| `pnpm --filter @embroidery/persistence build` | Can the API resolve the new export? | PASS | 0 | Once, required before the API typecheck. |
| `pnpm --filter @embroidery/api exec tsc --noEmit -p tsconfig.json` | Does every runtime and test file typecheck under strict mode? | PASS | 4 | Once after the runtime files; once after the tests; once after the `accessToken` rename; once after the two file splits. Each rerun cites a changed input, and one caught a missing `openAttempt` import in the split spec. |
| `jest --testPathPatterns="public-order-deposit(-evidence)?\.contract"` | Does the published document say exactly what B05 claims, and does B03's surface bound still hold? | PASS — 2 suites / 145 tests | 2 | First run after the controller and schemas. Re-run after `@HttpCode(200)` on the status route, and again after the `accessToken` rename — both changed inputs. |
| `jest --testPathPatterns="transfer-evidence" --runInBand` | Against real PostgreSQL, real MinIO and real HTTP: does one upload produce one asset, one association and one dispatch; is a foreign attempt refused with zero effect; does the bound hold at five under a real race; does any payment state move? | PASS — 2 suites / 39 tests | 3 | First run found 12 failures, all test-side (the flat error envelope, and Nest's `201` default on the status `POST`). The `201` was a **runtime** defect and was fixed with `@HttpCode(HttpStatus.OK)`; the envelope assertions were corrected. Re-run after the `accessToken` rename, and once more after the suite was split. |
| `jest --testPathPatterns="multipart-upload.parser\|validated-file.reader\|asset-intake-contracts\|session-asset-intake\|domain/intake/request-intake"` | Do the three shipped lanes behave identically after the shared lane contract was widened? | PASS — 5 suites / 123 tests | 2 | First run failed one assertion — the exhaustive Admin-lane shape check, which is exactly the assertion that *should* notice a new field. It was extended to state `credentialFields: []` rather than loosened. Re-run after that, and after the `MAX_FIELDS` cleanup. |
| `jest --testPathPatterns="payment-persistence.integration"` | Does `PaymentPersistenceModule` still compose, and do the delivered AGG-16 guards still hold, now that a fifth provider lives in it? | PASS — 29 tests | 0 | One run; the shared writer package changed, so §41 admits it. |
| `pnpm --filter @embroidery/api openapi:generate` | What is the exact published delta? | 81 / 88 / 184 | 2 | One generation after the contract suite was green; a second after the `accessToken` rename, which is a contract input. No route, decorator or schema changed afterwards. |
| `pnpm --filter @embroidery/api openapi:check` | Is the committed artifact what the current source produces? | PASS — up to date | 2 | Once after each generation. |
| `pnpm --filter @embroidery/api-client generate` | Does the client expose both operations truthfully? | 2 files, +158 lines | 2 | The **first** generation is what surfaced §4.2: it emitted `token` after `file`. The second, after the rename, appends `accessToken`, `attemptId`, `file` — the order the parser requires. |
| `pnpm --filter @embroidery/api-client check:generated` | Does the committed client match the artifact? | PASS — tree hash `0d7fd92c…` | 1 | Once after each generation. |
| `pnpm --filter @embroidery/api-client exec tsc --noEmit` | Does the regenerated client typecheck? | PASS | 1 | Once after each generation. |
| `npx eslint <changed files>` | Any lint defect in the changed set? | PASS | 2 | First run found one dead constant left by the field-cap refactor. Fixed and re-run. |
| `npx prettier --check <changed files>` | Formatting? | PASS | 1 | Once after the writes, once after the splits. |
| `node tools/check-file-size.mjs` | Does anything in the changed set exceed a CLAUDE.md §6 hard limit? | PASS for every changed file | 1 | First run found two: the upload service at 513 and the integration spec at 766. Both were split by responsibility and re-checked. (The gate also reports a large pre-existing backlog in `tools/`, untouched and out of scope.) |
| `git diff --check` | Whitespace defects? | PASS | 0 | Once at the end. |

**Not run, by design** (`APP7-B05` §41): `pnpm quality`, `quality:e2e`, the full
Jest run, the full API/Asset/Payment/worker suites, the `APP7-B02`/`B03`
integration suites, the `APP7-W01` race, every DB manifest/fingerprint gate,
Playwright, SonarQube and the Figma gate. No schema changed, so no database gate
is owed; no worker source changed, so the worker suite is not owed.

---

## 10. Acceptance criteria

| # | Criterion | Met by |
|---:|---|---|
| 1–3 | Exactly 2 customer-secure operations; upload + own metadata/status; no third | contract suite: two paths, one `POST` each, `evidence` paths enumerated exhaustively |
| 4–5 | No customer binary read; no Admin evidence operation | contract suite: no `content`/`preview`/`download` path; no Admin/provider/webhook path; integration: four probe paths all `404` |
| 6–7 | `REQUEST_ACCESS` reused; no new grant or token | `ReauthorizeSecureGrant` only; module issues nothing |
| 8–12 | Exact attempt, locator ≠ authority, full chain proved, foreign attempt refused, `BANK_TRANSFER` enforced | `EvidenceAttemptAuthorizer`'s four comparisons; cross-order and fictional-vs-foreign tests |
| 13–14 | Attempt's own STEP_UP re-verified; nothing caller-supplied | `AttemptStepUpVerifier`; no `challengeId` field on either body |
| 15–17 | Existing lane reused; fourth lane added; no duplicate framework | `PAYMENT_EVIDENCE_INTAKE_LANE`; every pipeline component imported from Asset |
| 18–24 | `CUSTOMER_UPLOAD`, `CUSTOMER_PRIVATE`, three types, 10 MiB, signature check, no filename persisted, no client key | lane constants + four media tests + the two filename tests |
| 25–27 | DB01 table used; written in Tx B; bound while `UPLOADED` | `commitEvidenceBinding`; the pre-inspection test |
| 28–29 | One `ASSET_INSPECTION`; no new job kind or queue | `inspectionEventCount` = 1; the delivered event type and payload version |
| 30–35 | Attempt row is the lock; application guard at five; no DB change; race ends at five; sixth refused; independent quotas | §8.3 |
| 36–37 | Append-only; no delete/replace/detach/rebind | no such operation exists, in the contract or the repository |
| 38–41 | Replay: one asset, one association, one dispatch; raw key never stored | §8.4 |
| 42–45 | Metadata is own-attempt only, bounded 0–5, no storage key, no scanner detail | the per-attempt list test + the leak test + the contract suite |
| 46–50 | Upload alters no attempt/obligation/order state; read is zero-write; no reconciliation | §8.5 |
| 51–54 | Evidence optional; zero evidence valid; no Admin verification; no provider | empty-list test; zero rows in all three money-evidence tables |
| 55 | No schema or migration change | 37 migrations / 79 tables, untouched |
| 56–58 | OpenAPI exactly +2 operations; client truthful; no unrelated churn | +2/+2/+4, 632 insertions and **0 deletions**; client re-generated and verified |
| 59–64 | Focused tests pass; race passes; typechecks pass; lint/format clean; no broad regression; no PASS rerun without a changed input | §9 |
| 65 | Nothing pushed | `NOT_PUSHED` |
| 66–68 | Report exists; B05 `COMPLETE`; sole Next is `APP7-B04` | this document and §11 |

---

## 11. Roadmap

```text
APP7-R00  = COMPLETE
APP7-G01  = COMPLETE
APP7-B01  = COMPLETE — CORRECTED — REVIEW_ACCEPTED
APP7-W01  = COMPLETE — CORRECTED (C1) — REVIEW_ACCEPTED
APP7-B02  = COMPLETE — REVIEW_ACCEPTED
APP7-B03  = COMPLETE — REVIEW_ACCEPTED
APP7-DB01 = COMPLETE — REVIEW_ACCEPTED
APP7-B05  = COMPLETE
APP7-B04  = INCOMPLETE — Next
APP7-B06  = INCOMPLETE
APP7-D01  = INCOMPLETE
APP7-A01  = INCOMPLETE
APP7-S01  = INCOMPLETE
APP7-E01  = INCOMPLETE
APP7-X01  = INCOMPLETE
```

Exactly one Next. No B04, B06, D01, A01, S01, E01 or X01 code was written.

---

## 12. Contract hashes

```text
OPENAPI_SHA256 (before) = 8c54482613468af07af342386316e07d831b369dc065bd887b2f68d035e27600
OPENAPI_SHA256 (after)  = b2ab63ae7bf08406ca0e54eb1bc044abcfa39a381a3f01dab670b751a7c29160
API_CLIENT_TREE_HASH    = 0d7fd92ce12e5437abb74c6ea17871a3b8450965007490ba31301e71dfb1a78d
```

No raw token, `Idempotency-Key`, storage key, bucket name or credential appears
anywhere in this report, in the repository, or in any response this checkpoint
publishes. All test secrets are synthetic values set on `process.env` and
restored; no `.env` file was read, written or consulted, and no credential was
rotated.

```text
NOT_PUSHED
```
