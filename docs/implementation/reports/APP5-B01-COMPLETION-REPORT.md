# APP5-B01 — Request Submission Backend

## 1. Verdict

```text
APP5-B01 = COMPLETE
```

One public operation delivered — `POST /api/public/custom-requests` — implementing
`TR-LC11-01` as a single cross-context transaction. **No migration**; the
`NO_APP5_MIGRATION` expectation held (§14).

---

## 2. Baseline

| Item | Value |
| --- | --- |
| Branch | `production` |
| HEAD at entry | `058d2f4` |
| Working tree at entry | clean |
| Accepted authority | `docs/implementation/audits/APP5_G01_SUBMISSION_MODERATION_AUTHORITY.md` (+ `APP5_PHASE_ENTRY_AUDIT.md`) |
| D01 Product Owner approval | recorded — §3 |
| Schema/migrations | untouched |
| Figma | not opened, not read live, not modified |

---

## 3. D01 approval recording (documentation preflight)

| Item | Value |
| --- | --- |
| Approval evidence id | `FIG-APPROVAL-APP5-D01-PO-001` |
| Rows promoted | **65** — every `APP5-D01` row, `REVIEW_REQUIRED` → `APPROVED_FOR_IMPLEMENTATION` |
| Rows outside `APP5-D01` touched | **0** |
| Node ids / deep links changed | **0** — byte-identical to what `APP5-D01` wrote |
| `Last Verified` dates changed | **0** — the approval is evidence of human review, not of a re-resolution |
| Figma-index check | `node tools/check-figma-design-index.mjs` → **PASS** (278 registry IDs, 278 node rows, 17 tables) |
| Figma mutation | **none** — no file opened, no OAuth, no node created, moved, renamed or restyled |

Recorded following the `APP4-D01` precedent (an in-registry promotion paragraph
in §4.11 plus the row edits); no separate approval file, because the APP3/APP4
convention places D-package approvals inline and `docs/design/approvals/` holds
only the APP1/APP2-era records.

`APP5-CUSTOM-REQUESTS.md` §10.5's "every UI checkpoint is still gated" paragraph
was updated to record the release of that gate.

---

## 4. Endpoint delivered

```text
POST /api/public/custom-requests
```

| Item | Value |
| --- | --- |
| Operation id | `publicCustomRequest_submit` |
| Success | `201` · envelope code `CUSTOM_REQUEST_SUBMITTED` |
| Response schema | `CustomRequestSubmissionResponse` — `{ requestId, code, status }` |
| Request schema | `SubmitCustomRequestBody` (+ 4 nested components) |
| Documented refusals | `400`, `401`, `403`, `409`, `422` |

---

## 5. Submission transaction map

Every row is an **existing** component; `APP5-B01` composed them and added no
second implementation of any of them.

| Transaction concern | Implementation owner |
| --- | --- |
| challenge verification (GRD-001) | `SubmissionIdentityResolver` → APP4 `VERIFICATION_CHALLENGE_REPOSITORY.findById` |
| customer resolution | APP4 `ResolveOrCreateVerifiedCustomer.resolve` via `verifiedContactEvidenceOf` (`APP4-B02`/`B04` path) |
| idempotency claim | `IdempotencyStore.claim` (`@embroidery/persistence`, LC-23) |
| request root | `CustomRequestRepository.submit` (AGG-13, delivered by the DB era) |
| COP child | same call — `SubmitRequestInput.customerOwnedProduct` |
| quantity | same call — `SubmitRequestInput.breakdown`, variant server-set |
| assets | `RequestAssetBinder` → `AssetRepository.lockScopedByIds` (`FOR SHARE`) + `CustomRequestRepository.attachAsset` |
| design case | APP3 `DesignCaseRepository.createForRequest` |
| session submit | APP3 `DesignSessionRepository.submit` (guarded on `status = 'ACTIVE'`) |
| grant | APP4 `SecureGrantIssuer.issue({ notify: true })` → `SecureGrantNotifier` → APP4 notification intake |
| outbox | `RequestSubmissionRecorder` → `OutboxEventStore.append` |
| transaction boundary | `TransactionManager.runInTransaction` — joins, never nests |

New application code is orchestration only: one use case, three narrow
collaborators, one controller, one module.

---

## 6. G01 compliance matrix

| Rule | How | Where |
| --- | --- | --- |
| Subject XOR (§3) | `resolveSubmissionSubject` returns `undefined` for both/neither → `SUBMISSION_SUBJECT_INVALID`, evaluated **before** the transaction opens | `submission-subject.ts` |
| Challenge is the scope key (`G01-D01`) | `scopeKey = challengeId`, namespace constant `request.submit`; **no client idempotency key is accepted** | `request-submit-idempotency.ts` |
| Fingerprint (`G01-D02`) | branch → subject fields → canonically ordered lines; length-prefixed, SHA-256 | `submission-fingerprint.ts` |
| Fingerprint **deviation** | `customerNote`, asset ids **and the design document hash** are excluded. The hash is a recorded deviation from `DB3_IDEMPOTENCY_SPECIFICATION.md`: it is derived from a session that autosaves concurrently and that this transaction mutates, so including it would turn an honest retry into a conflict. `designSessionId` is the stable binding instead. Proven by the "ignores the customer note" case. | `submission-fingerprint.ts` header |
| Request code (`G01-D12`) | `REQ-` + 10 CSPRNG chars from `23456789ABCDEFGHJKMNPQRSTVWXYZ`, rejection-sampled; server-only, immutable, never authorization | `request-code.ts` |
| No client `customerId` | `.strict()` body rejects it; identity comes only from the challenge | schema spec, 7 rejection cases |
| No client `submitted_session_id` (`G01-D09`) | rejected by `.strict()`; server writes the session it actually submitted | schema spec + integration |
| No `ATTACHMENT` (`G01-D14`) | `z.enum(['COP_IMAGE','REFERENCE'])` at the contract **and** re-checked in the binder | policy + schema spec |
| ≥1 `COP_IMAGE` on COP (`G01-D10`) | `RequestAssetBinder.assertShape` | integration |
| 10 per role (`G01-D13`) | `MAX_ASSETS_PER_ROLE` | integration |
| No creation transition row (`G01-D05`) | the use case never calls `transition()`; asserted at 0 rows in both API suites | integration + races |
| No raw grant secret in the response | response is exactly `{ requestId, code, status }`; asserted against the token, customer, challenge and contact | integration |
| Notification (`G01-D05b`) | customer half = the existing grant notification; admin half = **outbox row only**, no new `NotificationReference` kind, no new worker | `request-submission.recorder.ts` |
| No APP6+ behavior | no design version, no quotation, no price, no TR-LC11-05…09 | — |

---

## 7. Idempotency evidence

| Case | Observed |
| --- | --- |
| First submission | `201`, one request at `NEW`, one of each protected consequence |
| Same challenge + same fingerprint | `201` with a **byte-identical** `data`; still 1 request, 1 design case, 1 grant, 1 outbox event. Proven under the hardest condition: the session is already `SUBMITTED`, so a second *execution* could not have succeeded |
| Same challenge + different fingerprint | `409` · `IDEMPOTENCY_CONFLICT`; request count stays 1 |
| Excluded inputs | a different `customerNote` replays instead of conflicting |
| In-flight duplicate | `DUPLICATE_OPERATION` (409) is the mapped in-progress outcome |

### Concurrent duplicate submit — `DB3 CC-18`, first implementation

Two real HTTP submissions issued **without awaiting the first**, same challenge,
same canonical fingerprint, one PostgreSQL, no mocked mutex and no injected
barrier.

Row-count evidence after the race:

| Protected consequence | Rows |
| --- | ---: |
| `custom_requests` | **1** |
| `idempotency_records` (`request.submit`, this challenge) | **1**, `COMPLETED` |
| `design_cases` | **1** |
| `design_versions` | **0** |
| `design_sessions` `SUBMITTED` → this request | **1** |
| `secure_access_grants` | **1** |
| `notification_intents` for this contact | **1** |
| `outbox_events` `request.submitted` | **1** |
| `custom_request_transitions` | **0** |

Both participants returned `201` with the **same** result: PostgreSQL made the
loser wait on `uq_idempotency_records__namespace_scope_key` and it then replayed
the completed record. The suite accepts either canonical outcome (replay `201` or
retryable `409`), because which one occurs is the database's decision; pinning it
would make the suite a test of PostgreSQL. One deterministic race, run once.

---

## 8. Focused test ledger

Every command was run because a file it measures changed. **Full regression was
not run.**

| # | Command | Impact reason | Result | Reruns |
| --: | --- | --- | --- | --: |
| 1 | `node tools/check-figma-design-index.mjs` | the D01 registry promotion (§3) | PASS · 278/278/17 | 0 |
| 2 | `pnpm --filter @embroidery/api exec jest --testPathPatterns="submission-invariants\|public-custom-request.request"` | new domain + schema units | PASS · 2 suites / 45 tests | 2 (after the `SESSION_NOT_AUTHORIZED` fix and after the harness lint fix) |
| 3 | `pnpm --filter @embroidery/api exec jest --testPathPatterns="custom-request-submission"` | the new endpoint, on real PostgreSQL | PASS · 3 suites / 45 tests | 3 (two real defects, one file split) |
| 4 | `pnpm --filter @embroidery/api typecheck` | every changed `apps/api` file | PASS | 4 |
| 5 | `pnpm --filter @embroidery/api lint` | changed runtime + test files | PASS | 1 (one `unbound-method` error, fixed) |
| 6 | `npx prettier --check` on the changed paths | formatting of changed files | PASS | 1 |
| 7 | `node tools/check-file-size.mjs` | new source and test files | B01 files within hard limits — see §11 | 1 |
| 8 | `pnpm --filter @embroidery/api openapi:generate` | one new route + 6 components | 49 paths / 54 ops / 107 schemas | 1 (re-run after the incident in §12) |
| 9 | `pnpm --filter @embroidery/api-client generate` | the OpenAPI change | 2 files, tree hash `86a1057c…` | 1 (same cause) |
| 10 | `pnpm --filter @embroidery/api openapi:check` | committed-artifact freshness | PASS | 0 |
| 11 | `pnpm --filter @embroidery/api-client check:generated` | generated-client freshness | PASS | 0 |
| 12 | `pnpm --filter @embroidery/api-client typecheck` | regenerated client compiles | PASS | 0 |
| 13 | `node tools/check-app3-p03.mjs` | B01 adds a `createZodDto` consumer, which is inside this gate's impact reason | **FAIL — pre-existing**, see §10 | 0 |

By group: **unit** #2 · **PostgreSQL integration** #3 (two suites) ·
**concurrency** #3 (races suite) · **controller/validation** #2 (the schema
suite) + #3's route wiring, envelope and origin/credential cases ·
**typecheck** #4, #12 · **lint/format** #5, #6 · **D01 registry** #1 ·
**OpenAPI/client** #8–#11 · **repository gate** #7, #13.

**Not run, deliberately:** `pnpm quality` (deleted by `GOV-Q01`), all Jest
suites, the full API integration suite, DB regression, Playwright/E2E,
Admin/Storefront tests, APP2/APP3/APP4 regression, worker tests, all-workspace
build or typecheck, SonarQube.

---

## 9. OpenAPI / client evidence

| Item | Before | After |
| --- | ---: | ---: |
| Paths | 48 | **49** |
| Operations | 53 | **54** |
| Schemas | 101 | **107** |

- **Generation count: 2** for OpenAPI and 2 for the client — one intended run
  each, plus one forced re-run after the working-tree incident in §12 reverted
  the artifact. No generation was triggered by an implementation-only change.
- Exactly one new operation: `publicCustomRequest_submit` on
  `/api/public/custom-requests`. No other path, operation or schema changed.
- Six new components: `SubmitCustomRequestBody`, `CustomRequestCatalogSubject`,
  `CustomRequestCustomerOwnedProduct`, `CustomRequestQuantityLine`,
  `CustomRequestAssetBinding`, `CustomRequestSubmissionResponse`.
- Branch truthfulness: `catalog` and `customerOwnedProduct` are independent,
  internally complete, `additionalProperties: false` objects. Both-present and
  neither-present are **sayable and refused** with `SUBMISSION_SUBJECT_INVALID`
  — deliberate, because §3.1 of G01 requires that named refusal, and a
  discriminated union would make the API answer a shape complaint instead.
- Server-owned fields: none accepted. `additionalProperties: false` on the body
  and on every nested object; `customerId`, `requestId`, `code`, `status`,
  `submittedSessionId`, `idempotencyKey` and `correlationId` are each proven
  rejected by a unit case.
- Secret scan of the new components: no `rawToken`, `tokenHash`, session secret,
  storage key, pepper, `submittedSessionId` or `code_hash`. (`customerId` and
  `grantId` occur elsewhere in the document, in pre-existing APP4 Admin
  operations only.)
- Generated client exposes `publicCustomRequest_submit`, typed against
  `SubmitCustomRequestBody` → `CustomRequestSubmissionResponse`. Regeneration
  after the incident produced the **same tree hash**, so it is deterministic.
- Both freshness gates pass.

---

## 10. Two findings that changed the implementation

Both were found by the focused tests, not predicted.

### 10.1 A catalog replay cannot re-authorize its own session

A submission moves its session `ACTIVE → SUBMITTED`, and APP3's authorizer
refuses a session that is no longer live. With the credential check in front of
the idempotency claim, **every honest retry of a successful catalog submission
answered `401` instead of replaying** — inverting the guarantee the contract
exists to provide.

Fixed by deferring the credential refusal to the point a session is actually
about to be submitted: creation still requires it in full, while a replay
performs no session mutation for a credential to authorize. A replaying caller
already holds the verified challenge that authorized the original submission, so
it learns nothing it did not have. The Origin / Fetch Metadata check is **not**
deferred — it is about this HTTP call, not the outcome.

Consequence: the refusal is now the named `SESSION_NOT_AUTHORIZED` (`401`), whose
message is deliberately identical to APP3's own, so an unknown id, a wrong secret
and a dead session stay indistinguishable.

### 10.2 `tools/check-app3-p03.mjs` was already red at HEAD

The gate's impact reason covers "any `createZodDto` consumer", so it was run. It
fails — but it failed before this checkpoint. Measured, not assumed:

| Source | Paths / operations / schemas |
| --- | --- |
| Accepted APP3 surface (`acceptedSurface()`, last marker `APP3-S06`) | 37 / 42 / 84 |
| Committed artifact **at HEAD `058d2f4`** | 48 / 53 / 101 |

48 ≠ 37 at HEAD, so every count assertion in that gate already failed; APP4's
eleven endpoints moved the surface without updating `tools/app3-accepted-surface.mjs`.
`APP5-B01` moves it to 49 / 54 / 107 and changes nothing about the failure mode.

Repairing it means teaching an APP3-owned surface module about APP4 and APP5
surfaces, which is neither B01's scope nor B01's regression. Recorded as a
follow-up in §13. The gate's `ACTIVE_SCOPED` status in
`SCOPED_COMMAND_INDEX.md` is, in practice, stale.

---

## 11. File-size posture

No B01 file breaches a hard limit.

- `custom-request-submission.integration.spec.ts` first reached **666** lines
  (hard test limit 600). Split by responsibility, not by line range: what a
  submission **writes** (402) and how it **refuses** (275), with the shared
  request builders and row counters lifted into the fixture rather than copied.
- `submit-custom-request.use-case.ts` is **380** lines — over the 300-line review
  threshold, under the 400-line hard limit. Left as one file deliberately: it is
  one transaction with one order, and its three genuine sub-responsibilities are
  already extracted (identity, assets, outbox). Splitting it further to satisfy a
  soft cap is the correction §20 forbids.

---

## 12. Working-tree incident during validation

While establishing whether `check-app3-p03.mjs` was red at HEAD, a temporary
`git worktree` was created and directory junctions were pointed at the main
repository's `node_modules`. `git worktree remove --force` followed those
junctions and deleted the targets, which took `packages/contracts`,
`packages/eslint-config` and `packages/typescript-config` with them.

Recovery, and verification that it was complete:

1. `git checkout --` restored all three tracked packages;
2. `pnpm install --frozen-lockfile` restored `node_modules` (926 packages,
   lockfile unchanged);
3. `git diff --stat HEAD -- packages/contracts packages/eslint-config
   packages/typescript-config` shows **one** changed file — the intentionally
   regenerated `openapi.generated.json`;
4. the artifact was regenerated and the client re-generated, producing the
   **same tree hash** as before the incident;
5. typecheck, lint, format and all five test suites were re-run green afterwards.

No commit contained the deletion, and no untracked or ignored file was lost.
Recorded because a completion report that omits it would misrepresent how the
evidence was produced.

---

## 13. Changed files

**Runtime — new**

```text
apps/api/src/modules/order/custom-request-submission.module.ts
apps/api/src/modules/order/domain/submission/request-asset-policy.ts
apps/api/src/modules/order/domain/submission/request-code.ts
apps/api/src/modules/order/domain/submission/request-submission.errors.ts
apps/api/src/modules/order/domain/submission/request-submit-idempotency.ts
apps/api/src/modules/order/domain/submission/submission-fingerprint.ts
apps/api/src/modules/order/domain/submission/submission-subject.ts
apps/api/src/modules/order/application/request-asset-binder.ts
apps/api/src/modules/order/application/request-submission.recorder.ts
apps/api/src/modules/order/application/submission-identity.resolver.ts
apps/api/src/modules/order/application/submit-custom-request.use-case.ts
apps/api/src/modules/order/presentation/public-custom-request.controller.ts
apps/api/src/modules/order/presentation/schemas/public-custom-request.request.ts
apps/api/src/modules/order/presentation/schemas/custom-request-submission.response.ts
```

**Runtime — modified (narrow, additive)**

```text
apps/api/src/bootstrap/app.module.ts                                    + CustomRequestSubmissionModule
apps/api/src/modules/order/domain/repositories/custom-request.repository.ts   + submittedSessionId, + findBoundAssetIds
apps/api/src/modules/order/infrastructure/persistence/drizzle-custom-request.repository.ts
apps/api/src/modules/asset/domain/repositories/asset.repository.ts      + Asset.uploadedByCustomerId
apps/api/src/modules/asset/infrastructure/persistence/asset-row.mapper.ts
```

**Tests**

```text
apps/api/src/modules/order/domain/submission/submission-invariants.spec.ts
apps/api/src/modules/order/presentation/schemas/public-custom-request.request.spec.ts
apps/api/test/support/custom-request-submission-fixture.ts
apps/api/test/integration/custom-request-submission.integration.spec.ts
apps/api/test/integration/custom-request-submission-refusals.integration.spec.ts
apps/api/test/integration/custom-request-submission-races.integration.spec.ts
apps/api/src/modules/asset/application/asset-intake-contracts.spec.ts     (fixture field)
```

**Generated contract / client**

```text
packages/contracts/openapi/openapi.generated.json
packages/api-client/src/generated/embroidery-api.ts
packages/api-client/src/generated/embroidery-api.schemas.ts
```

**Docs / evidence**

```text
docs/design/FIGMA_DESIGN_INDEX.md                          §4.11 promotion + 65 rows + §10 summary
docs/implementation/phases/APP5-CUSTOM-REQUESTS.md         status table + UI gate release
docs/implementation/reports/APP5-B01-COMPLETION-REPORT.md  this file
```

No schema, no migration, no Figma node, no unrelated cleanup.

---

## 14. Roadmap

| Checkpoint | Status | Note |
| --- | --- | --- |
| `APP5-R00` | `COMPLETE` | Phase-entry audit and roadmap reconciliation |
| `APP5-G01` | `COMPLETE` | Submission, moderation and intake-abuse authority |
| `APP5-D01` | `COMPLETE` | Product Owner approved; registry approval recorded |
| `APP5-B01` | `COMPLETE` | Request submission backend |
| `APP5-B02` | `INCOMPLETE` | **Next** — customer attachment intake |
| `APP5-B03` | `INCOMPLETE` | Grant-scoped request status read |
| `APP5-B04` | `INCOMPLETE` | Admin request queue & detail |
| `APP5-B05` | `INCOMPLETE` | Admin notes & guarded transitions |
| `APP5-S01` | `INCOMPLETE` | Request creation & submission |
| `APP5-S02` | `INCOMPLETE` | Confirmation & grant-scoped status |
| `APP5-A01` | `INCOMPLETE` | Admin request queue |
| `APP5-A02` | `INCOMPLETE` | Admin request detail & moderation |
| `APP5-E01` | `INCOMPLETE` | Cross-layer acceptance |
| `APP5-X01` | `INCOMPLETE` | Phase closure |

---

## 15. Residual risks and follow-ups

| # | Item | Disposition |
| --- | --- | --- |
| 1 | **`FU-APP5-B01-APP3-SURFACE-GATE-01`** — `tools/check-app3-p03.mjs` (and the ~90 gates sharing `app3-accepted-surface.mjs`) compare the live artifact against a surface frozen at `APP3-S06`. Red since APP4, now further from the baseline. | Not B01's regression (§10.2). Route to `APP5-X01` or a governance checkpoint: either teach the module about post-APP3 surfaces or reclassify the gates `HISTORICAL_SCOPED` in `SCOPED_COMMAND_INDEX.md`. |
| 2 | `SUBMISSION_IDEMPOTENCY_TTL_MS` is a constant (24 h) because DB3 defers TTL class values to policy config (CON-144) and no policy row exists. | Bounds only how long a *stuck* `IN_PROGRESS` claim blocks a genuine retry; no successful path waits on it. Replace with a policy read when CON-144 publishes. |
| 3 | Asset binding is exercised only against **seeded** accepted uploads — `APP5-B02` owns the customer upload lane, so no production path yet produces a bindable `COP_IMAGE`. | By design (§6 of the brief). `APP5-B02` closes it; `APP5-E01` proves the two together. |
| 4 | The `request.submitted` outbox event has **no consumer**. | `G01-D05b` — deliberate. The durable fact is written now so the consumer can be added at `APP12` without reopening this transaction. Already an `APP12`/`X01` handoff. |
| 5 | The concurrency proof establishes that both submissions were **in flight** simultaneously and that exactly one of each consequence exists; it cannot observe the precise interleaving. | Accepted: the safety property is what the checkpoint requires, and arranging the ordering would make the test assert its own arrangement. |
| 6 | An anonymous caller holding a verified `SUBMISSION` challenge id can replay a completed submission and read `{requestId, code, status}` without the session cookie (§10.1). | Deliberate and bounded: that challenge id **is** the submission credential (GRD-001), the code is never an authorization input (CST-026), and no secret is disclosed. Recorded so `APP5-B03` does not mistake it for grant-scoped access. |

---

```text
NEXT CHECKPOINT: APP5-B02 — Customer attachment intake
```
