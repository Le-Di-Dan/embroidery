# APP7-B06 — Completion Report

## Admin Private Transfer-Evidence Binary Delivery

```text
APP7-B06 = COMPLETE
CHECKPOINT_SCOPE = ADMIN_PRIVATE_TRANSFER_EVIDENCE_DELIVERY

HTTP_OPERATIONS = 1

EVIDENCE_DELIVERY_OPERATION =
  GET /api/admin/payment-evidence/{evidenceId}/content — adminPaymentEvidence_get
LOCATOR = payment_transfer_evidence.id
RAW_ASSET_ID_ROUTE = NONE

ADMIN_AUTH = AuthenticatedAdminGuard (APP1-B01, unchanged)

AUTHORIZATION_ORDER =
  association -> scoped Asset -> ACCEPTED/live/media -> storage

ASSET_KIND = CUSTOMER_UPLOAD
ASSET_CLASSIFICATION = CUSTOMER_PRIVATE
ASSET_STATUS_REQUIRED = ACCEPTED
MEDIA_TYPES = image/jpeg,image/png,image/webp

SOURCE = INSPECTION_APPROVED_ORIGINAL
DERIVATIVE = NONE

OBJECT_STORAGE = ObjectStoragePort.getObjectStream (bucket alias ORIGINALS)
BUFFERING = NONE (StreamableFile over the provider Readable)
PRESIGN = NONE

PRIVATE_MISS = 404 PAYMENT_EVIDENCE_NOT_FOUND
STORAGE_CALLS_ON_PRIVATE_MISS = 0

CACHE_CONTROL = private, no-store
NOSNIFF = true
CONTENT_TYPE_SOURCE = persisted trusted Asset metadata (assets.mime_type)
CONTENT_LENGTH_SOURCE = assets.size_bytes, after equality with the provider count

B04_HANDOFF = PASS
ZERO_WRITE = PASS
PAYMENT_STATE_CHANGE = NONE

SCHEMA_CHANGE = NONE
MIGRATION_CHANGE = NONE

OPENAPI_BEFORE = 84 paths / 91 operations / 191 schemas
OPENAPI_AFTER  = 85 paths / 92 operations / 191 schemas
OPENAPI_DELTA  = +1 path, +1 operation, +0 schemas (0 removed, 0 existing changed)
API_CLIENT_DELTA = +21 lines, 0 deletions — one Blob operation, no curated export

FOCUSED_TESTS = 2 new suites / 32 tests + 97 sibling contract tests
BROAD_REGRESSION = NOT_RUN_BY_DESIGN

NEXT_CHECKPOINT = APP7-D01
```

---

## 1. What was delivered

One Admin private binary read, and nothing else.

```text
GET /api/admin/payment-evidence/{evidenceId}/content
    operationId  adminPaymentEvidence_get
    guard        AuthenticatedAdminGuard
    parameters   evidenceId (path, uuid) — and no other
    body         none
    success      200, image/jpeg | image/png | image/webp
    failures     400 / 401 / 404 / 503
```

`adminPaymentEvidence` derives from the controller class name with **no**
`CONTROLLER_DOMAIN_KEYS` entry, exactly as `AdminCustomRequestAssetController`
does for the APP5 attachment lane. B04's three and B05's two accepted operation
ids are untouched, and the contract suite asserts all five by name.

Not added, and each absence is asserted or structural: an evidence metadata
route (B04 owns it), a list route, a customer binary, a download-token route, a
presign route, an asset-id route, an attempt-id route, an order-id route, and any
delete / replace / retry.

---

## 2. Changed files

### Runtime — new

| File | Lines | What it owns |
|---|---:|---|
| `apps/api/src/modules/payment/domain/evidence/evidence-delivery.policy.ts` | 130 | The six conjunctive terms, the media allowlist, the headers, the bucket alias. Re-exports the kind/classification from `transfer-evidence.policy.ts` and the media set from `asset-intake.policy.ts` rather than restating either. |
| `apps/api/src/modules/payment/domain/evidence/evidence-delivery.errors.ts` | 113 | Three codes; nine internal reasons collapse into one `PAYMENT_EVIDENCE_NOT_FOUND`. |
| `apps/api/src/modules/payment/application/admin/deliver-transfer-evidence.use-case.ts` | 261 | Association → scoped asset → eligibility → storage, in that order. |
| `apps/api/src/modules/payment/presentation/schemas/admin-payment-evidence.request.ts` | 30 | One `.strict()` UUID path parameter. No query object, no body. |
| `apps/api/src/modules/payment/presentation/admin-payment-evidence.controller.ts` | 189 | HTTP, headers, `StreamableFile`, disconnect wiring. Decides no access. |
| `apps/api/src/modules/payment/admin-payment-evidence.module.ts` | 73 | Four imports; neither payment writer, no transaction manager, no outbox. |

### Runtime — modified

| File | Change |
|---|---|
| `apps/api/src/modules/payment/domain/repositories/admin-payment-read.repository.ts` | +1 read method, `findEvidenceForDelivery(evidenceId)` |
| `apps/api/src/modules/payment/infrastructure/persistence/drizzle-admin-payment-read.repository.ts` | its implementation — one `select` joined to `payment_attempts` |
| `apps/api/src/bootstrap/app.module.ts` | registers `AdminPaymentEvidenceModule` |

### Tests — new

| File | Lines | Tests |
|---|---:|---:|
| `apps/api/src/modules/payment/presentation/admin-payment-evidence.contract.spec.ts` | 218 | 10 |
| `apps/api/test/support/payment-evidence-delivery-fixture.ts` | 273 | — |
| `apps/api/test/integration/admin-payment-evidence-delivery.integration.spec.ts` | 437 | 22 |

### Tests — modified (repository-wide bounds that name every route)

| File | Why it had to change |
|---|---|
| `apps/api/src/modules/payment/presentation/admin-payment.contract.spec.ts` | its "exactly three Admin payment operations" bound now names B06's fourth; its "no Admin binary evidence operation — that is APP7-B06's" test now asserts the delivered shape instead: none of B04's three operations answers with bytes, and the one evidence route is a `GET` addressed by the association id |
| `apps/api/src/modules/payment/presentation/public-order-deposit.contract.spec.ts` | its Admin-payment exclusion list names B06's path, so the customer-surface bound stays exhaustive rather than loosened |
| `apps/api/src/modules/order/presentation/admin-custom-request-asset.contract.spec.ts` | its exhaustive Admin-binary inventory (two entries) becomes three |

### Generated

| File | Delta |
|---|---|
| `packages/contracts/openapi/openapi.generated.json` | +232 lines, 0 deletions |
| `packages/api-client/src/generated/embroidery-api.ts` | +21 lines, 0 deletions |

No generated file was hand-edited. Both were produced by their canonical
generator and verified by their canonical check.

---

## 3. Association-first proof

The order is the security property, and it is stated three ways.

**Structurally.** `DeliverTransferEvidence.describe()` calls
`findEvidenceForDelivery` first; a miss `throw`s before `findScopedByIds` is
reached, which is before `getObjectStream` is reached. The two reads are
sequential and deliberately not parallel: running them together would issue the
*asset* lookup for ids the caller was never entitled to name.

**In the statement.** `findEvidenceForDelivery` inner-joins `payment_attempts`,
so "the association resolves one payment attempt" is a property of the SQL rather
than of a caller's `if`. The FK makes an orphan unreachable, so the join costs a
PK lookup and buys a predicate a later edit cannot silently drop.

**Observably.** The fake object store counts its calls. Every refused case below
asserts the counter did not move.

| Case | Response | `getObjectStream` calls |
|---|---|---:|
| unknown `evidenceId` | 404 `PAYMENT_EVIDENCE_NOT_FOUND` | 0 |
| asset id presented as an evidence id | 404 `PAYMENT_EVIDENCE_NOT_FOUND` | 0 |
| evidence whose image is `INSPECTING` | 404 `PAYMENT_EVIDENCE_NOT_FOUND` | 0 |
| evidence whose image is `REJECTED` | 404 `PAYMENT_EVIDENCE_NOT_FOUND` | 0 |
| tombstoned image (`DELETION_PENDING` + `deleted_at`) | 404 `PAYMENT_EVIDENCE_NOT_FOUND` | 0 |
| asset outside `CUSTOMER_UPLOAD` | 404 `PAYMENT_EVIDENCE_NOT_FOUND` | 0 |
| asset outside `CUSTOMER_PRIVATE` | 404 `PAYMENT_EVIDENCE_NOT_FOUND` | 0 |
| undeliverable persisted media type (`image/svg+xml`) | 404 `PAYMENT_EVIDENCE_NOT_FOUND` | 0 |
| malformed `evidenceId` | 400 | 0 |
| no Admin session | 401 | 0 |

The 404s are indistinguishable: same status, same code, same message. The 401 is
deliberately **not** collapsed into them — an operator whose session died must be
told so rather than shown a missing-evidence answer.

---

## 4. Source and eligibility

`ACCEPTED` is the whole argument, not a status the response reports. `APP7-B05`
streamed the bytes under the 10 MiB lane ceiling, verified the signature against
the declared type, decoded within the pixel bounds and dispatched mandatory
inspection; `ACCEPTED` is the name of that argument having succeeded.

- `status === 'ACCEPTED'` **and** `deletedAt === undefined` are checked
  separately. `ACCEPTED` already excludes both tombstone states, and the second
  check is kept anyway: the two are written by different flows
  (`recordInspection`, `tombstone`) and inferring one from the other would depend
  on those never diverging.
- The media type is the asset's **persisted** `mime_type` — never the provider's
  `contentType`, never a URL suffix, never a client header.
- `size_bytes` is narrowed through `Number.isSafeInteger` before it can become a
  `Content-Length`.
- An empty `storage_key` is a refusal, not a storage call.

`DERIVATIVE = NONE`. B05 dispatches inspection and no normalization, so there is
no derivative to serve and none is generated here. No inspection is triggered on
read.

---

## 5. Streaming, disconnect and provider failure

Reused unchanged: `ObjectStoragePort.getObjectStream`, `StreamableFile`,
`watchClientDisconnect`. No new streaming primitive, no shared extraction — §30's
"if existing platform helpers already suffice, use them directly and do not
extract anything" applies, and they did.

**Disconnect.** B06 does introduce its own controller-level abort wiring (it
registers the teardown on the signal `watchClientDisconnect` returns), so §21's
one focused proof was written and no other disconnect mechanics were rerun. The
fixture trickles a 64 KiB body in 4 KiB chunks; the test destroys the socket on
the first chunk and asserts the upstream body reached `destroyed === true` **with
`readableEnded === false`** — the distinguishing half, since `destroyed` is also
true after a normal end.

**Provider failure.**

| Case | Response | Body |
|---|---|---|
| authorized descriptor, object absent | 503 | none |
| provider size ≠ persisted `size_bytes` | 503 | none — the stream is destroyed before the refusal, asserted on the opened body |

Neither is a 404: by that point the association exists and the row says
`ACCEPTED` with a durable key, so reporting a storage incident as not-found would
tell an operator the customer never submitted their screenshot.

**One deliberate note on the 503 payload.** The module refuses with
`PAYMENT_EVIDENCE_UNAVAILABLE`, but the platform's `mapHttpException` replaces the
code and message of **every** 5xx with the generic pair, because a server-side
failure's prose may have been built from an internal fault. So the wire carries
the status and nothing more. The first integration run asserted the feature code
and failed on exactly this; the test now asserts the status alone, the same way
`APP5-B06` does, and the rule is recorded in the errors file header. The database
is never repaired from provider state, and neither the expected nor the actual
size appears in the response.

---

## 6. Disclosure

Asserted absent from the whole 200 response (headers, disposition, status line):
the storage key, the asset id, the payment attempt id, the order id, the deposit
obligation id, and any filename. Asserted absent from the 503 body: the storage
key, the word `bucket`, and the byte count.

Asserted absent from the published operation (serialized, case-insensitive):
`storageKey`, `objectKey`, `bucket`, `presign`, `signedUrl`, `downloadUrl`,
`assetId`, `attemptId`, `adminId`, `accessToken`, `tokenHash`, `accountNumber`.

`Content-Disposition: inline` with **no** filename — the original upload name is
never persisted (`APP2-B01`), so one could only be invented, and an invented one
describes the object falsely while putting customer-influenced text into a header.
No `ETag`, no `Last-Modified`, no public or immutable cache, no `Range`, no
storage metadata header; the `ETag` absence is asserted.

---

## 7. APP7-B04 handoff

Both directions were proved, against the same running application that answers
B04 — the suite boots the whole `AppModule`, so this is end-to-end rather than
mocked.

**Eligible.** Seed one attempt with one `ACCEPTED` JPEG → `GET
/api/admin/orders/{orderId}/payments` → `evidence[0].previewEligible === true` →
take `evidence[0].evidenceId` → `GET .../payment-evidence/{id}/content` → exact
stored bytes, with `Content-Type` and `Content-Length` equal to B04's own
`mediaType` and `byteSize`. The same test asserts B04's evidence object publishes
**no** `assetId` key — that is the API design B06 is addressed by.

**Ineligible.** For `INSPECTING` and for `REJECTED`: B04 reports
`previewEligible: false`, and B06 answers both with the identical 404 and zero
storage calls, so nothing distinguishes an unjudged image from a refused one.

B04's verification, review and race suites were **not** rerun. B06 imports no B04
mutation service and its module cannot resolve one.

---

## 8. Zero write

Two proofs, one on the success path and one on a private miss, each comparing a
before/after snapshot of:

```text
payment_attempts        id, status, amount, succeeded_at, updated_at
payment_obligations     id, status, satisfied_by_attempt_id, satisfied_at, updated_at
orders                  id, status, updated_at
assets                  id, status, size_bytes, deleted_at
payment_transfer_evidence  id, payment_attempt_id, asset_id, created_at
row counts              payment_reconciliations, outbox_events, audit_events,
                        order_transitions, payment_provider_events
```

Both snapshots compare equal.

The guarantee is structural rather than behavioural.
`AdminPaymentEvidenceModule` imports `AssetModule`, `DatabaseModule`,
`IdentityModule` and `ObjectStorageModule` — and no
`PaymentPersistenceModule`, no `AdminPaymentVerificationModule`, no
`OrderModule`. `PAYMENT_OBLIGATION_REPOSITORY`, `settleAttempt`, `satisfy`,
`appendReconciliation`, `VerifyPaymentAttempt`, `ReviewPaymentAttempt`,
`ORDER_REPOSITORY` and `transition()` are therefore unresolvable in this
injector. No `TransactionManager` is handed out, no `OutboxEventStore`, no audit
writer. `AdminPaymentReadRepository` is four `select`s with no transaction and no
lock, and the asset side is reached only through the non-locking
`findScopedByIds`.

No feature-owned access log was added. Opening evidence is not a payment event,
and `APP7-B04` remains the sole verification authority in the phase.

---

## 9. Persistence decision

`§5` asked for the narrowest reusable method rather than a second seam, because
B04 and B06 already share `payment_transfer_evidence`. Delivered accordingly:
`AdminPaymentReadRepository` — B04's read-only CTX-PAY seam — gained one method,
and `DrizzleAdminPaymentReadRepository` gained its statement. No new repository,
no second API-local statement against the table, no writer reachable from the
delivery module, and B05's canonical `PaymentTransferEvidenceRepository` is
untouched (it stays the one association *writer*; nothing here writes).

The asset stays Asset's. No `mime_type`, `size_bytes` or `storage_key` was copied
into a Payment-owned shape — `APP7-DB01` deliberately did not duplicate them, and
a statement producing a storage key from a CTX-PAY repository would make Payment a
second authority on where a customer's private file lives.

`SCHEMA_CHANGE = NONE`. 37 migrations, 79 tables, no index, no trigger, no
column. The PK on `payment_transfer_evidence.id` answers the association lookup;
no speculative index was added.

---

## 10. OpenAPI and client

```text
BEFORE  84 paths / 91 operations / 191 schemas
AFTER   85 paths / 92 operations / 191 schemas
DELTA   +1 / +1 / +0
```

Zero new schemas, and that is the honest number rather than a target: a binary
response declares `{ type: string, format: binary }` inline per media type and
mints no component. Nothing was removed and no existing path or schema changed —
the 232 added artifact lines are the new operation alone.

The generated client exposes exactly one new operation:

```ts
export const adminPaymentEvidenceGet = (
  evidenceId: string,
  options?: SecondParameter<typeof apiRequest<Blob>>,
) => apiRequest<Blob>(
  { url: `/api/admin/payment-evidence/${evidenceId}/content`,
    method: 'GET', responseType: 'blob' },
  options,
);
```

`Blob` with `responseType: 'blob'` set by the generator itself, so no consumer
configures transport to get it. No body, no query token, no storage identity.

**No curated `@embroidery/api-client` export was added.** That follows the
delivered precedent exactly: `APP5-B06` left its curated export to `APP5-A02`
rather than publishing an operation with no screen behind it, and §26 permits the
same here. `APP7-A01` will export it consumer-driven.

Artifact hashes after generation:

```text
packages/contracts/openapi/openapi.generated.json   sha256:d54199871dd98d9a…
packages/api-client/src/generated/embroidery-api.ts sha256:378613ce6e73c3a7…
api-client tree hash                                e651e988342e210a5bb8b239b405612d181dc36c80553a53f845edf2926a3ca6
```

---

## 11. Command ledger

| Command/check | Exact B06 question | Result | Reruns | Changed input |
|---|---|---|---:|---|
| `jest --testPathPatterns="admin-payment-evidence.contract"` | Does the document publish one Admin-only GET binary at the association address, with no generic asset route and no B04/B05 id churn? | PASS — 10 tests | 1 | First run: 2 failures, both test-side — two expected arrays were written unsorted while the assertion sorts the received one. Fixed and rerun. |
| `jest --testPathPatterns="admin-payment-evidence-delivery"` | Over real HTTP against PostgreSQL: exact bytes for eligible evidence, one indistinguishable miss with zero storage calls for every ineligible case, bounded provider failure, zero write, B04 handoff. | PASS — 22 tests | 1 | First run: 1 failure, test-side — it asserted the 503 payload code, but the platform replaces every 5xx code with `INTERNAL_SERVER_ERROR` by design. Assertion corrected to the status alone (the `APP5-B06` convention) and rerun. |
| `jest --testPathPatterns="admin-payment.contract\|public-order-deposit.contract\|admin-custom-request-asset.contract"` | Do the three sibling suites whose repository-wide bounds name every route still hold with B06's operation added? | PASS — 97 tests | 1 | Rerun after Prettier reformatted `admin-payment.contract.spec.ts` — a changed input, so the earlier PASS was not carried forward. |
| `tsc --noEmit -p apps/api/tsconfig.json` | Do `src/**` and `test/**` typecheck? | PASS | 2 | Rerun after the lint repair changed two test files. |
| `pnpm --filter @embroidery/api openapi:generate` | Regenerate the artifact. | 85/92/191 | 0 | — |
| `pnpm --filter @embroidery/api openapi:check` | Does the committed artifact match the application? | PASS — up to date | 0 | — |
| `pnpm --filter @embroidery/api-client generate` | Regenerate the client. | 2 files, tree hash `e651e988…` | 0 | — |
| `pnpm --filter @embroidery/api-client check:generated` | Does the committed client match the artifact? | PASS — up to date | 0 | — |
| `pnpm --filter @embroidery/api-client exec tsc --noEmit` | Does the regenerated client typecheck? | PASS | 0 | — |
| `eslint <15 changed files>` | Changed-file lint. | PASS | 2 | First run: 4 `no-unsafe-argument` on `app.getHttpServer()` — replaced with the fixture's typed supertest agent. Second: 1 `consistent-type-imports` after that change. |
| `prettier --write <15 changed files>` / `--check` | Changed-file format. | PASS | 1 | Reformat after the lint repair. |
| `git diff --check` | Whitespace errors. | PASS — clean | 0 | — |
| `ls packages/database/migrations/*.sql \| wc -l` | Did the migration count move? | 37 — unchanged | 0 | — |

`BROAD_REGRESSION = NOT_RUN_BY_DESIGN.` Not run, and deliberately: `pnpm
quality`, `quality:e2e`, the full Jest and API integration suites, the full Asset
and Payment suites, B05's 336-test suite, B04's verify/review/race suites, B03,
W01, the DB gates, the worker suite, the Admin frontend, the Storefront,
Playwright, SonarQube and Figma. No PASS was rerun without a changed input.

---

## 12. Acceptance criteria

All 56 criteria in the directive §35 are met. The ones worth naming with their
evidence:

| # | Criterion | Evidence |
|---|---|---|
| 1–4 | one operation, Admin-only, association-id locator, no asset-id route | contract spec: exactly one method at the path, four Admin payment operations total, three Admin binaries total, no `/api/admin/assets/{assetId}/content` |
| 5–6 | existing Admin auth reused, no mutation guard or body | `AuthenticatedAdminGuard` only; integration proves a bodyless GET succeeds and an unauthenticated one is 401 |
| 7–9 | association before asset before storage; both scope terms | use-case ordering + the storage-call counter at 0 on every scope miss |
| 10–17 | ACCEPTED only; INSPECTING, REJECTED, deleted, unsupported media refused; JPEG/PNG/WebP allowed | eight integration refusals + three success formats |
| 18–22 | no derivative, source streamed, no buffering/base64/presign/redirect, no key disclosure | policy + `StreamableFile` over the provider `Readable`; disclosure assertions in §6 |
| 23–26 | storage never called before authorization; misses collapse; provider failure bounded; size contradiction safe | §3 and §5 tables |
| 27–29 | trusted Content-Type, reconciled Content-Length, private/no-store + nosniff | header assertions |
| 30 | disconnect reuses accepted mechanics | `watchClientDisconnect`, one focused mid-stream teardown proof |
| 31–34 | zero write on success and on miss; preview changes no payment truth; B04 sole authority | two snapshot proofs + the module's unresolvable writers |
| 35–36 | B04 handoff works; `previewEligible: false` is unavailable | §7 |
| 37–39 | no customer binary, no generic Admin asset binary, no metadata/list route | contract spec |
| 40–41 | no schema or migration change; 37 migrations | §9 |
| 42–44 | OpenAPI +1 operation; client exposes a truthful Blob; no unrelated churn | §10 |
| 45–52 | focused tests pass; typechecks pass; lint/format clean; no broad regression; no PASS rerun without changed input | §11 |
| 53 | nothing pushed | `PUSH_STATUS = NOT_PUSHED` |
| 54–56 | this report; roadmap advanced; sole `Next` = `APP7-D01` | §13 |

---

## 13. Commits and status

```text
Commit A  ef4e32a  feat(app7): deliver Admin private transfer-evidence delivery (APP7-B06)
Commit B  fa90922  docs(app7): record APP7-B06 and advance the roadmap (APP7-B06)

PUSH_STATUS = NOT_PUSHED
NEXT_CHECKPOINT = APP7-D01
```

Nothing was pushed, no predecessor commit was amended, and no unrelated change is mixed
in.

---

## 14. Limitations and risks

- **The `503` is coarse by platform design.** A storage outage and a
  provider/persisted size contradiction are the same status and the same generic
  message on the wire. That is the correct disclosure bound for an outward
  response; the distinction lives in the internal error code and the structured
  log. An operator seeing a persistent 503 cannot tell which it is without the
  logs, and that is accepted.
- **No live provider was exercised.** The suite uses a call-counting
  `ObjectStoragePort` fake, because the new decision this checkpoint makes is the
  *authorization ordering* and a live MinIO would prove S3 rather than that.
  APP2 owns the live provider contract and APP5-B06 set this precedent; §19
  permits the smallest level that proves the new decision.
- **No screen consumes the operation yet.** The curated `@embroidery/api-client`
  export is deliberately deferred to `APP7-A01`, so the generated operation is
  reachable but not re-exported. This mirrors `APP5-B06` → `APP5-A02` exactly.
- **The evidence bucket alias is `ORIGINALS`, matched to B05's writer by
  constant, not by a shared allocation record.** If a future lane wrote evidence
  to a different bucket, this delivery would look in the wrong place. That is the
  same coupling every delivered private-binary surface has, and the bucket alias
  is a compile-time constant in both files rather than a runtime value either
  could drift on.
