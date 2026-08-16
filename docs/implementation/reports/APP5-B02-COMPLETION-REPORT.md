# APP5-B02 — Completion report

**Checkpoint.** `APP5-B02` — Customer Attachment Intake. The pre-submission
upload lane APP5 needs before a request can carry evidence.

**Verdict.**

```text
APP5-B02 = COMPLETE
```

Human review owns acceptance. Nothing is pushed.

> This file supersedes the blocker report of the same name. The earlier run
> stopped as `APP5_B02_PERSISTENT_INTAKE_PROVENANCE_REQUIRED`; that blocker was
> closed by `APP5-DB01` and the analysis that produced it is preserved in
> `APP5-DB01-COMPLETION-REPORT.md` §1.

---

## 1. Baseline

| | |
|---|---|
| Branch | `production` |
| Entry `HEAD` | `76d1f8877c30c4706ce43a44ba8612c1b4945d6c` (`docs(app5): record the APP5-DB01 commit hash in its report`) |
| Working tree at entry | clean |
| Blocker closed by | `APP5-DB01`, commit `f661da8`, migration `0035_add_app5_intake_provenance` |
| B01 endpoint baseline | 1 public operation — `POST /api/public/custom-requests` (`publicCustomRequest_submit`) |

DB01 delivered `assets.uploaded_via_challenge_id`, `assets.intake_expires_at`,
CST-127, CST-128, REL-106, `ix_assets__challenge_status__intake_live` and
`ix_assets__intake_expires_id__live`. None of it was re-audited; all of it is
consumed.

## 2. Endpoint surface

Two public operations, both addressed *through* the challenge that authorizes
them:

| Method | Route | Operation id |
|---|---|---|
| `POST` | `/api/public/custom-request-intake/challenges/{challengeId}/assets?role=…` | `publicCustomRequestAsset_upload` |
| `GET` | `/api/public/custom-request-intake/challenges/{challengeId}/assets/{assetId}` | `publicCustomRequestAsset_status` |

**Why two and not one.** The upload response is necessarily written before the
inspector has run — Tx B commits `INSPECTING`, and inspection is asynchronous by
architecture. `APP5-B01` binds only `ACCEPTED` assets. Without the status read a
customer's client has exactly two options: submit and be refused, or guess. The
second operation is the smallest thing that removes that, and it is not a list,
not a delete and not a general asset API.

**Public inputs, in full:** the challenge id (path), the role (query), the file
(one multipart part), and `Idempotency-Key` (header). There is no `customerId`,
`requestId`, `storageKey`, `classification`, `assetKind` or inspection field —
each is either derived from the challenge or fixed by the lane.

`role` travels as a query parameter because it participates in the idempotency
fingerprint and therefore has to be known *before* the first byte is streamed; a
trailing multipart field cannot guarantee that, and widening the shared parser to
carry a third variable field would change a code path two shipped lanes already
depend on.

## 3. Provenance

Written in Tx A, inside the transaction that holds the challenge row lock, from
the locked row — never from the request:

```text
uploaded_by_customer_id   ← ResolveOrCreateVerifiedCustomer(evidence of the challenge)
uploaded_via_challenge_id ← the authorizing challenge id
intake_expires_at         ← that challenge's own expires_at
```

`RegisterAssetInput` takes them as one optional `intakeProvenance` object rather
than two independent optionals: CST-128 refuses a challenge id with no expiry, so
separate fields would let a caller build an input the database is guaranteed to
reject.

Proved in `request-intake.integration.spec.ts`: the persisted row carries
`CUSTOMER_UPLOAD` / `CUSTOMER_PRIVATE`, a non-null server-derived customer, the
exact challenge id, and an `intake_expires_at` **compared against the challenge's
own column** rather than against a recomputed instant — a second clock is the
defect `APP4-B03` recorded. `uploaded_via_session_id` stays null, so CST-127's
other lane is empty by construction.

## 4. Quota

### 4.1 The reserved-slot set

`UPLOADED`, `INSPECTING`, `ACCEPTED` — declared once as
`CHALLENGE_RESERVED_ASSET_STATES` in the asset policy, because it is a fact about
LC-06 rather than about APP5.

Counting only `ACCEPTED` is unsound and the suite proves it: twenty `INSPECTING`
rows can all become `ACCEPTED` afterwards, so a check that ignored them would
admit a twenty-first upload and leave the inspection worker to discover the
breach with no way to act on it. The invariant enforced is therefore

```text
reserved slots per challenge ≤ 20  ⇒  eventual ACCEPTED count ≤ 20
```

which is strictly stronger than `G01-D13`'s maximum, never weaker.
`REJECTED`, `DELETION_PENDING` and `DELETED` release their slot — none can reach
`ACCEPTED` again, and holding capacity against a customer whose file was refused
would lock them out of their own request.

### 4.2 Serialization

`ChallengeIntakeAuthorizer.authorizeAndReserve` takes `SELECT … FOR UPDATE` on
the challenge row (`VerificationChallengeRepository.lockById`, added here),
re-validates state/purpose/expiry/consumption, then counts through
`ix_assets__challenge_status__intake_live`. The caller's insert happens under
that same lock.

The challenge row is the lock because the quota is a count, and a count is
read-then-write. There is no asset row to lock — the row that would breach the
limit is the one being created — and a counter column would be a second source of
truth for something the assets already say. `lockTarget` (the APP4 advisory lock)
is deliberately not reused: it covers a *(kind, value, purpose)* target and exists
because a new challenge has no row yet; here the row exists and is the natural
arbiter.

**The check runs twice and only the second one decides.** The pre-stream check
refuses a hopeless caller before ten megabytes are uploaded; it commits and
releases its lock before any byte is read, so two callers can both pass it. Tx A
re-runs it under the lock that inserts the row. That is the arbiter, and it is
what the race test exercises.

One consequence is named rather than hidden: Tx A can refuse *after* the object
exists. The service then deletes that object — it allocated the key moments
earlier, nothing references it, and `deleteObject` is idempotent. An orphan with
no asset row is invisible to the sweep, which finds objects only through rows.

### 4.3 Evidence

| Claim | Result |
|---|---|
| 19 slots held → the twentieth upload is admitted | **PASS** (live count 20 after) |
| 20 slots held → refused as `REQUEST_INTAKE_QUOTA_REACHED`, **no object written** | **PASS** |
| 20 `INSPECTING` rows also refuse a twenty-first | **PASS** |
| a `REJECTED` row releases its slot and the next upload succeeds | **PASS** |
| a full challenge does not exhaust a different challenge's capacity | **PASS** |
| two concurrent attempts for the final slot → exactly **one** fulfilled, live count 20, loser gets `REQUEST_INTAKE_QUOTA_REACHED` | **PASS** |

The race uses two distinct idempotency keys, so the idempotency arbiter cannot be
what separates them — the only thing between those two callers and a twenty-first
reservation is the challenge row lock. The assertion is on the resulting row
count, not on which caller won: either winner is correct, and asserting one would
be a flaky test of scheduling.

## 5. Upload pipeline

Reused unchanged from `APP2-B01` / `APP3-B06B`; no parallel intake stack, no
presign, no browser storage credential, no second "complete" call:

```text
parse multipart (openMultipartUpload, REQUEST_INTAKE_LANE)
  → allowlist the declared type (assertAcceptedMediaType)
  → durable allocation claim commits            ← before any file byte is read
  → stream through PassThrough into private storage
      while consumeValidatedFile counts, hashes and verifies the signature
  → Tx A: lock challenge, re-authorize, count slots, registerOrRecover (UPLOADED)
  → Tx B: beginInspection (INSPECTING) + asset.inspection.requested + complete claim
  → inspector decides ACCEPTED / REJECTED
```

The one deliberate difference from the Session lane: **no normalization event**.
A customer's evidence photograph is never rendered into a design, so requesting a
derivative for it would be work with no consumer. Asserted as a count of zero.

The asset is never marked `ACCEPTED` by intake, and no scanner is called
synchronously. `state` in the upload response is `INSPECTING` because that is what
Tx B just committed, not because it is a placeholder.

## 6. Cleanup

**Owner.** `apps/worker/src/jobs/app5-intake-cleanup/` — `IntakeCleanupUseCase`
driven by `IntakeCleanupRuntimeService`, a sequential loop on a 300 s interval
with an abortable sleep and a batch of 100. It registers **no** handler: expiry
produces no outbox event, which is precisely why a sweep is needed.

**Eligibility** (`markExpiredForDeletion`), all required:

- `intake_expires_at` set and in the past;
- live `CUSTOMER_UPLOAD` / `CUSTOMER_PRIVATE`;
- not already `DELETION_PENDING` or `DELETED`;
- `NOT EXISTS` a `custom_request_assets` row for the asset.

`uploaded_via_challenge_id` is deliberately **not** part of eligibility. REL-106
is `ON DELETE SET NULL` over a hard-TTL-deleted parent, so requiring it would make
every asset ineligible at exactly the moment its challenge was swept — the moment
cleanup becomes necessary. The index used is
`ix_assets__intake_expires_id__live`, whose key order the query's `ORDER BY`
matches; `FOR UPDATE SKIP LOCKED` lets two replicas divide the backlog.

**Two-phase deletion**, the schema's own contract (ADR-DB1-011):

```text
phase 1  status = DELETION_PENDING, deletion_requested_at stamped   (DB only)
phase 2  deleteObject → then deleted_at stamped, status = DELETED
```

The object-store call sits *between* two transactions, never inside one: at batch
100 a stalled bucket inside a transaction is how a slow store becomes a database
incident. A crash between the call and the write leaves a pending row whose object
is already gone, which is harmless because `deleteObject` is idempotent.

| Case | Result |
|---|---|
| expired + unbound → `DELETED`, object deleted, reason recorded | **PASS** |
| not expired → untouched | **PASS** |
| request-bound → untouched even when expired | **PASS** |
| `CATALOG_MEDIA` / `PRODUCTION_FILE` lanes → untouched | **PASS** |
| no `intake_expires_at` (every APP1–APP4 asset) → untouched | **PASS** |
| **challenge hard-deleted, `uploaded_via_challenge_id` now NULL** → still found and swept | **PASS** |
| store refuses → holds at `DELETION_PENDING`, `deleted_at` still null, next pass finishes it | **PASS** |
| second pass over a swept row → no-op | **PASS** |

**This is not SE-014/SE-015.** It sweeps exactly the lane `APP5-B02` created.
Session assets, catalog media, production files and every other retention
obligation remain unimplemented — see §12.

## 7. B01 interoperability

```text
B02 upload (role = COP_IMAGE)
  → asset INSPECTING with full provenance
  → inspector marks ACCEPTED
  → SubmitCustomRequestUseCase (real TR-LC11-01, customer-owned-product branch)
  → custom_request_assets row: (request, asset, COP_IMAGE)
```

**PASS.** The COP branch was chosen deliberately: `G01-D10` requires at least one
`COP_IMAGE`, and until this checkpoint nothing in the system could produce one —
the COP journey was unsubmittable end to end. That is the gap closed.

Two negatives in the same suite prove the binder is still the authority rather
than a formality this lane bypassed: an `INSPECTING` asset is refused, and an
`ACCEPTED` asset uploaded under a *different* challenge is refused (different
challenge → different resolved customer → `uploadedByCustomerId` mismatch). Both
leave zero binding rows.

The provenance survives the binding: the bound row still carries its challenge id
and intake expiry.

## 8. Public errors

Four APP5-owned codes, plus `APP2-B01`'s intake codes mapped verbatim rather than
re-wrapped — re-coding them would produce a second vocabulary for the same
failures and one of the two would drift.

| Code | Status | Covers |
|---|---|---|
| `REQUEST_INTAKE_NOT_AUTHORIZED` | 401 | unknown, wrong purpose, unverified, expired, already submitted |
| `REQUEST_INTAKE_ROLE_INVALID` | 403 | anything but `COP_IMAGE` / `REFERENCE` |
| `REQUEST_INTAKE_QUOTA_REACHED` | 409 | the twenty-slot bound |
| `REQUEST_INTAKE_ASSET_NOT_FOUND` | 404 | unknown / another customer's / another challenge's attachment |

Five authorization causes reach the caller as one answer; distinguishing them
would confirm that a guessed challenge id exists. A unit test asserts that no
message matches `/scan|signature|magic|mime|bucket|storage|s3|sql|constraint|ck_|uq_|assets|challenge id|customer id/i`,
and that the authorization message does not say *not found*, *unknown*, *expired*
or *already*. `QUOTA_REACHED` is 409 rather than 429 because a client that backed
off and retried would never succeed.

## 9. Focused validation ledger

| Command | Impact reason | Result | Reruns |
|---|---|---|---:|
| `pnpm --filter @embroidery/api test -- request-intake` | the four suites created here | **48/48**, 4 suites | 4 |
| `pnpm --filter @embroidery/worker test -- intake-cleanup` | the cleanup suite created here | **8/8** | 2 |
| `pnpm --filter @embroidery/api openapi:generate` | the public surface changed | 51 paths / 56 operations / 109 schemas | 2 |
| `pnpm --filter @embroidery/api openapi:check` | freshness | **up to date** | 1 |
| `pnpm --filter @embroidery/api-client generate` | the artifact changed | 2 files, tree hash `1dc98a5b…` | 1 |
| `pnpm --filter @embroidery/api-client check:generated` | freshness | **up to date** | 1 |
| `pnpm --filter @embroidery/api-client typecheck` | generated types changed | **PASS** | 1 |
| `pnpm --filter @embroidery/api typecheck` | API source changed | **PASS** | 4 |
| `pnpm --filter @embroidery/worker typecheck` | worker source changed | **PASS** | 3 |
| `pnpm --filter @embroidery/api lint` | API source changed | **PASS** | 2 |
| `pnpm --filter @embroidery/worker lint` | worker source changed | **PASS** | 3 |
| `pnpm format:check` | global control | **PASS** | 1 |
| `pnpm --filter @embroidery/database build` · `@embroidery/persistence build` | the API resolves the schema package to `dist` (IMP-D018), and DB01's columns had to be visible to it | **PASS** | 1 |

**Explicitly confirmed:**

- **The DB01 suites were not rerun.** Neither `app5-intake-provenance` (20/20) nor
  `app5-intake-provenance-upgrade` (5/5) was executed in this checkpoint. The
  migration and schema they prove were not touched.
- **No historical APP3 gate was run**, including `tools/check-app3-p03.mjs`.
- **No full regression.** Not run: full Jest, the full API integration suite, the
  full worker suite, full asset/APP3/APP4 regression, B01's test group, B01's
  duplicate-submit race, full DB regression, Playwright/E2E, Storefront/Admin
  tests, all-workspace build, SonarQube, the Figma checker, `pnpm quality`.

Reruns are edits followed by re-verification, not repeated identical runs: the
intake suite reran after the authorizer was split into locking and non-locking
paths (a status read was taking `FOR UPDATE` for a decision it does not make);
the binding suite reran three times while its fixture acquired the secrets, the
grant policy and the request context that `TR-LC11-01` genuinely requires; lint
reran after `require-await` and `no-unnecessary-type-assertion` findings in test
doubles. Nothing was backgrounded and nothing was polled.

## 10. OpenAPI / client

- **Generations:** OpenAPI 2 (the second after `_read` was renamed `_status`, so
  the published id matches `publicDesignSessionAsset_status`'s precedent), client
  1.
- **Delta:** +2 paths, +2 operations, +2 schemas
  (`CustomRequestAssetIntakeResponse`, `CustomRequestAssetStatusResponse`);
  +527 lines in the artifact.
- **No-private-field review.** The two response schemas publish
  `assetId, role, state, mediaType, byteSize` and `assetId, state, bindable`.
  Greps for `storageKey`, `objectKey`, `bucket`, `claimToken` and
  `contentFingerprint` across the generated client return nothing. The stored
  idempotency record carries the bucket alias, object key, checksum and content
  fingerprint because a replay needs them; the projection is where they stop, and
  a unit test asserts each is absent from the serialized view.

## 11. Changed files

**API runtime**

- `modules/order/domain/intake/` — `request-intake.policy.ts`,
  `request-intake.errors.ts`, `request-intake-result.codec.ts`,
  `request-intake-fingerprint.ts` *(new)*
- `modules/order/application/intake/` — `challenge-intake.authorizer.ts`,
  `request-intake-transactions.service.ts`, `request-asset-intake.service.ts`,
  `request-asset-status.service.ts`, `request-intake-projection.ts` *(new)*
- `modules/order/presentation/public-custom-request-asset.controller.ts`,
  `presentation/schemas/request-asset-intake.{request,response}.ts` *(new)*
- `modules/order/custom-request-intake.module.ts` *(new)*;
  `bootstrap/app.module.ts` *(registered)*
- `modules/asset/domain/repositories/asset.repository.ts` — `Asset` gains the two
  DB01 columns; `RegisterAssetInput` gains `intakeProvenance`; new
  `countChallengeReservedSlots`
- `modules/asset/domain/asset-intake.policy.ts` —
  `CHALLENGE_RESERVED_ASSET_STATES`
- `modules/asset/infrastructure/persistence/{asset-row.mapper,drizzle-asset.repository}.ts`
- `modules/customer/domain/repositories/verification-challenge.repository.ts` +
  `infrastructure/persistence/drizzle-verification-challenge.repository.ts` —
  `lockById`

**Worker**

- `jobs/app5-intake-cleanup/` — policy, repository port, SQL repository, use
  case, runtime, module *(new)*
- `bootstrap/worker.module.ts` — registers the capability
- `runtime/worker-runtime.module.ts` — exports `WORKER_CLOCK` (one clock per
  process, so a suite replacing *the* clock replaces all of it)

**Tests**

- `modules/order/domain/intake/request-intake.spec.ts` *(20 cases)*
- `modules/order/tests/integration/request-intake-context.ts` *(harness)*
- `modules/order/tests/integration/request-intake.integration.spec.ts` *(19)*
- `modules/order/tests/integration/request-intake-quota.integration.spec.ts` *(6)*
- `modules/order/tests/integration/request-intake-binding.integration.spec.ts` *(3)*
- `jobs/app5-intake-cleanup/tests/intake-cleanup.integration.spec.ts` *(8)*
- `modules/asset/application/asset-intake-contracts.spec.ts` — its `Asset`
  fixture gains the two new fields

**Generated**

- `packages/contracts/openapi/openapi.generated.json`
- `packages/api-client/src/generated/embroidery-api{,.schemas}.ts`

**Docs**

- `docs/implementation/phases/APP5-CUSTOM-REQUESTS.md`
- `docs/implementation/reports/APP5-B02-COMPLETION-REPORT.md` *(this file,
  replacing the blocker report)*

No migration, no schema change, no Figma change. Every runtime source file is
under 400 lines and every test file under 600.

## 12. Roadmap

```text
APP5-R00  = COMPLETE   phase-entry audit
APP5-G01  = COMPLETE   submission / moderation / intake authority
APP5-D01  = COMPLETE   design package, Product Owner approved
APP5-B01  = COMPLETE   request submission backend
APP5-DB01 = COMPLETE   intake provenance persistence
APP5-B02  = COMPLETE   customer attachment intake
APP5-B03  = INCOMPLETE **next — grant-scoped request status read**
APP5-B04  = INCOMPLETE Admin request queue & detail
APP5-B05  = INCOMPLETE Admin notes & transitions
APP5-S01  = INCOMPLETE request creation & submission
APP5-S02  = INCOMPLETE confirmation & status
APP5-A01  = INCOMPLETE Admin queue
APP5-A02  = INCOMPLETE Admin detail / moderation
APP5-E01  = INCOMPLETE cross-layer acceptance
APP5-X01  = INCOMPLETE phase closure
```

## 13. Residual risks

- **The cleanup sweep covers APP5 challenge-intake assets only.** It is
  explicitly *not* SE-014/SE-015: design-session assets, catalog media,
  production files and every other retention obligation remain unimplemented,
  and no claim to the contrary is made anywhere in this checkpoint. The general
  backlog is still open and still unowned.
- **Storage orphans are bounded but not zero.** A crash between the object write
  and Tx A leaves an object with no row, which no sweep can find — the same
  window `APP2-B01` and `APP3-B06B` already carry, unchanged by this lane. The
  quota-refusal path deletes its own object explicitly; a process death during
  that delete does not.
- **The sweep interval is a constant, not policy.** 300 s and batch 100 live in
  `intake-cleanup.policy.ts`. If operations later needs them tunable, that is a
  policy-configuration change, not a code change to this job.
- **`RequestAssetStatusService` reports `DELETION_PENDING` and `DELETED` as
  `REJECTED`.** Deliberate — the only decision the answer drives is "may I submit
  this?", and for both the answer is no, permanently — but it means the public
  vocabulary is narrower than LC-06 and a future UI cannot distinguish "refused by
  inspection" from "swept". Recorded so `APP5-S01` decides rather than inherits.
- **No rate limit on intake beyond the quota.** Twenty uploads per challenge is
  the only bound; challenge *issuance* is rate-limited by GRD-026 upstream, which
  is what bounds the total. A per-IP limit would need the distributed limiter
  APP12 owns, and the in-process one is explicitly not a substitute.

## 14. Commit

Follows repository convention. **Not pushed.**

---

```text
NEXT CHECKPOINT: APP5-B03 — Grant-scoped request status read
```
