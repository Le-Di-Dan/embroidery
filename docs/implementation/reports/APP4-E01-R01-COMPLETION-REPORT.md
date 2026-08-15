# APP4-E01-R01 — Canonical Secure Contact Acceptance Run · Completion report

## A. Verdict

```text
APP4-E01-R01 = PASS
APP4-E01     = PASS
APP4-X01     = READY — NOT STARTED
```

One canonical cross-layer journey, 13 serial proofs, all passing against the real
Storefront, the real API over HTTP, real PostgreSQL, the real `APP4-B01` outbox,
the real `APP4-W01` execution seam and the real Admin.

**No full regression/test chain was run.** No APP4 backend route was intercepted
or mocked, and no fixture created a production fact the run was meant to prove.

Final marker emitted by the run:

```text
APP4_E01_R01_PROOFS { …68 safe facts… }
```

---

## B. Entry / H01 / H02 readiness

`APP4-E01-H01 = PASS` and `APP4-E01-H02 = PASS` were consumed unchanged. R01
built no infrastructure: it used the `--app4` orchestrator universe, the
disposable database, the API `AppModule` context, the real `SecureGrantIssuer`,
the `WorkerModule` context with polling held closed, `JobExecutionService`, the
in-process recording adapter, the fixture universe, the DB evidence helper, the
worker-control helper, the secret-safe comparison helpers and the S01/S02/A01
drivers.

Three small additions were required and are R01-scoped: two evidence readers
(`listRecent`, `snapshotTerminalOutbox` reuse) and two narrowly-scoped fixture
mutations described in §C.

## C. Topology and fixture universe

Topology: `node scripts/run-e2e.mjs --app4-r01` — ephemeral PostgreSQL and MinIO,
a real Nginx gateway, real Storefront and Admin, the real API HTTP process, and
the worker composed **in the Playwright process** so the process that executes
W01 is the process that reads the memory-only sink. The poll gate stayed held
(`E01_HELD`) for the whole run, so nothing claimed behind an assertion.

One canonical universe: one synthetic contact, one verification lineage, one
Customer, one verified primary Contact Point, one Admin identity, and fixture
`custom_requests` rows. Four extra grant lineages were created, each for a reason
§4 permits — a branch that would otherwise destroy evidence still needed:

| Lineage | Why it had to be separate |
| --- | --- |
| main grant | the link S02 resolves and Admin revokes |
| terminal-failure grant | a `DEAD_LETTER` origin for replay |
| retry grant | a retryable-then-successful delivery |
| stale-secret grant | its grant must be revoked to reach `REISSUE_REQUIRED` |
| second verification lineage | business resend must not disturb the Customer |

`custom_requests` rows are **test scaffolding only**; the helper returns
`isApp5Submission: false` and no APP5 action exists or was called.

**Two fixture mutations, both scheduling/timing and never business state:**

- `makeDueNow(eventId)` writes `outbox_events.next_attempt_at` so a retry can be
  observed without waiting out `APP4-G01`'s `[60, 300]`-second schedule;
- `backdateChallenge(id, seconds)` moves a challenge's `created_at`, from which
  `resendCooldownSeconds` is measured, so a resend becomes eligible.

Neither touches a status, a digest, an expiry or a binding. Every decision under
test remained the application's.

## D. E01-01 / E01-02 — issuance and controlled delivery

Submitted through the real S01 at `/xac-minh-lien-he`.

```text
challengeStoresDigestOnly        = true
exactlyOneIntent                 = true
exactlyOneOutboxEvent            = true
workerDeliveredVerificationCode  = true
intentSatisfied                  = true
noSecondSendAfterSatisfied       = true
```

One challenge row storing only a digest — the evidence projection *cannot*
return a raw code column, so this is structural rather than asserted. Exactly one
Notification Intent and one source outbox event; no code in
`notification_intents.params`. The real `JobExecutionService` claimed and
executed the job, the recording adapter received exactly one
`VERIFICATION_CODE` delivery, an attempt row was appended and the intent reached
`SATISFIED`.

E01-02: a further claim after settlement returned `undefined` and the delivery
count stayed at 1 — the already-satisfied decision produced no second send.

## E. E01-03 — exactly one Customer

The code was read **only** from the recording adapter's memory and typed into the
real S01 code field.

```text
s01SuccessRendered                    = true
exactlyOneCustomer                    = true
exactlyOneVerifiedPrimaryContactPoint = true
codeAbsentFromBrowserSurfaces         = true
```

No Customer was seeded. After settlement the code appeared on none of URL, hash,
history state, localStorage, sessionStorage, cookies, DOM text/HTML or console.

## F. E01-09 / E01-11 — automatic retry is the same delivery

Attempt 1 `RETRYABLE_FAILURE`, attempt 2 `SENT`, through the real execution seam.

```text
retrySameIntentId              = true
retrySameOutboxEventId         = true
retrySameEnvelope              = true
retrySameSecret                = true
retryCreatedNoNewOutboxEvent   = true
retryCreatedNoNewBusinessObject= true
retryFinalStatusSatisfied      = true
```

The two attempts received the identical plaintext — compared in memory and
reported as a boolean. The envelope was compared field-by-field through
fingerprints, so no ciphertext, IV or auth tag was ever held by the assertion.

## G. E01-10 — business resend is different

A separate verification lineage, made eligible by backdating issuance, resent
through the **real B03 resend route**.

```text
resendAccepted              = true
resendCreatedNewChallengeRow= true
resendCreatedNewIntent      = true
resendCreatedNewOutboxEvent = true
resendCreatedNewEnvelope    = true
resendCodeDifferent         = true
```

Neither code was printed; the difference is a boolean. The new envelope shares no
`iv`/`ciphertext` field value with the old one — the opposite of manual replay.

## H. E01-04 — real grant, real Customer binding, fragment link

Issued through the **real internal `SecureGrantIssuer`** resolved from the API
context, inside a request context — which is the issuer's actual contract, since
`SecureGrantAuditRecorder` requires a request id to attribute the grant to.

```text
customRequestIsScaffoldingOnly        = true
grantPersistsDigestOnly               = true
notificationBoundToCustomerContactPoint = true
secureLinkIsFragmentForm              = true
tokenAbsentFromPathAndQuery           = true
```

`recipient_contact_point_id` equalled the verified primary Contact Point,
**written by the production `B05 → B01` path** — this is the A01-C1 binding,
observed live and never written by a fixture. W01 then delivered a link whose
path is `/truy-cap`, whose query is empty, and whose fragment begins `#t=`.

## I. E01-05 — live fragment bootstrap

The in-memory link was navigated in a real browser with the pre-document
instrumentation installed.

```text
stripBeforeRequest                    = true
resolveIsPostBodyOnly                 = true
tokenNeverInUrlAtRequest              = true
tokenAbsentFromBrowserAfterSettlement = true
```

At resolve-request time: `hashEmptyAtRequest = true`,
`urlContainsTokenAtRequest = false`, `historyContainsTokenAtRequest = false`,
`requestUrlContainsToken = false`, method `POST`, path
`/api/public/secure-links/resolve`, `requestBodyKeys = ["token"]`. The cleaning
`replaceState` was identified by a hash transition and sequenced strictly before
the request. No B06 interception — the real endpoint answered.

## J. E01-06 — non-enumerating rejection, and the structural proof

```text
rejectionStatus                = 404
rejectionCode                  = SECURE_LINK_UNAVAILABLE
unknownTokensIndistinguishable = true
```

Different unknown tokens produced identical status, identical semantic body and
identical content type. Only `meta.requestId` and `meta.timestamp` differ, which
are per-request by design and carry nothing about the grant.

```text
WRONG_TARGET_RUNTIME_FIXTURE        = STRUCTURALLY_UNREPRESENTABLE
WRONG_PURPOSE_SCOPE_RUNTIME_FIXTURE = STRUCTURALLY_UNREPRESENTABLE
```

Recorded as the accepted narrowing, not fabricated: the public request body
carries a token and nothing else, the target is read from the resolved grant, and
`REQUEST_ACCESS` is written by the issuer and never accepted from a caller. No
invalid row was manufactured.

## K. E01-07 — Admin lookup, masked identity, grant, revoke

Through the real Admin after a **real form login** (no injected cookie).

```text
adminExactContactLookupWorks = true
adminRawDraftCleared         = true
adminShowsNoRawContact       = true
adminShowsActiveGrant        = true
adminShowsTerminalNotification = true
revokeRequiresReason         = true
revokeSucceeded              = true
grantNoLongerActive          = true
revokedLinkIndistinguishableFromUnknown = true
```

An empty reason was refused before anything was revoked. After revocation the
previously valid link resolved to exactly the canonical unavailable result —
status and semantic body identical to an unknown token, so revocation is not
distinguishable from non-existence.

## L. E01-08 — terminal failure, Customer-bound and visible

Created through real `B05 → B01`, never by a fixture `UPDATE`.

```text
terminalIntentFailed          = true
sourceEventDeadLettered       = true
terminalFailureBoundToCustomer= true
```

The Admin Customer view showed the failure region populated, which is the
A01-C1 objective seen through the UI rather than the table.

## M. E01-12 … E01-15 — manual replay transaction

```text
replayIntentPending               = true
replayOutboxPending               = true
replayOutboxIdDiffers             = true
replayAggregateLinksToReplayIntent= true
originStillFailed                 = true
oldDeadLetterUnchanged            = true
replayEnvelopeByteIdentical       = true
```

The origin intent and the `DEAD_LETTER` row were captured before the replay and
compared field-by-field afterwards: unchanged. The replay's envelope is
byte-identical to the source's across every envelope field — proven through
fingerprints, so the API's non-decryption is demonstrated without any ciphertext
being read. The source grant kept its id, digest, expiry and status; no
replacement grant and no new token.

## N. E01-16 — concurrent replay collapses

Two concurrent real B08 replays against one eligible terminal origin, run once.

```text
concurrentReplayStatuses       = 200,200
concurrentReplayCollapsesToOne = true
```

Exactly one replay intent and exactly one replay outbox event were created —
`+1` each, measured as a delta across the race. No duplicate delivery lineage.

## O. E01-17 — stale secret refuses replay

```text
staleReplayStatus            = 409
staleReplayCode              = REISSUE_REQUIRED
staleReplayCreatedNothing    = true
staleReplayOriginStillFailed = true
```

A dedicated lineage, because the item is about the *secret* being stale: the
grant that owns the terminal notification is the one that had to be revoked.
Zero new replay intents and zero new outbox events; the origin stayed `FAILED`.

**Disclosed:** the first version of this proof was wrong twice, and both were
caught rather than shipped. It initially replayed an origin whose grant was still
eligible, which returned `200 NOTIFICATION_DELIVERY_REPLAYED` — B08's correct
idempotent answer, not a refusal — and it *recorded* that status without
asserting it, so the test passed while the contract went unproven. It now asserts
`409` and `REISSUE_REQUIRED` explicitly. A proof that is only recorded is not a
proof.

## P. E01-18 — three contracts, observably distinct

| | automatic retry | manual replay | business resend |
| --- | --- | --- | --- |
| intent | same | **new** | **new** |
| outbox event | same | **new** | **new** |
| envelope | same | same | **new** |
| secret | same | same | **new** |
| business object | unchanged | unchanged | **new** |

All twelve facts are booleans in the emitted proof set. Retry and replay differ
in identity alone; resend differs in the secret itself.

## Q. Secret absence scan

```text
secretsScanned              = 9
secretPresentInPersistence  = false
```

Every controlled plaintext the run held — verification codes and secure-link
tokens — was scanned against `contact_verification_challenges`,
`secure_access_grants`, `notification_intents`,
`notification_delivery_attempts`, `outbox_events` and `audit_events`. Comparison
was in memory; the result is a boolean and a surface list that stayed empty.
Ciphertext was never treated as plaintext leakage. Browser surfaces were scanned
separately for the code (§E) and the token (§I).

No secret, digest, ciphertext, IV, auth tag, pepper, session credential,
fragment-bearing URL or raw contact appears in this report or in any artifact.

## R. Follow-up disposition

**Closed with evidence:**

- `FU-APP4-S02-LIVE-JOURNEY-01` — §I is the live journey against real B06.
- B08 replay-through-worker live journey follow-up — §M/§N drove real B08 and the
  real execution seam.
- A01 live B07/B08 lifecycle follow-up — §K/§M exercised revoke and replay live.

**Remaining closed:** `FU-APP4-A01-INTENT-BINDING-COVERAGE-01` (§H proves the
production binding live), `FU-APP4-DEV-API-IMAGE-01`.

**Carried to X01, untouched:** `FU-APP4-S01-ATTEMPT-COUNT-COPY-01`,
`FU-APP4-S01-SUCCESS-HANDOFF-01`, `FU-APP4-S01-ERROR-CODE-GRANULARITY-01`,
`FU-APP4-S02-LIVE-REGION-COPY-01`, `FU-ADMIN-SHARED-DIALOG-01`,
`FU-APP4-B01-POLICY-GATE-STALE-01`, `FU-APP4-B02-GATE-SCOPE-01`. Neither stale
checker was run or repaired.

## S. Validation ledger

| Validation | Command | Result |
| --- | --- | --- |
| Canonical acceptance run | `node scripts/run-e2e.mjs --app4-r01` | **13 passed** |
| E2E typecheck | `tsc --noEmit` | clean |
| Scoped ESLint | `eslint specs/app4 support/app4 scripts` | clean |
| Scoped Prettier | `--write` then `--check` | clean |
| Report secrets | `node tools/check-report-secrets.mjs` | passed |
| Staged whitespace | `git diff --cached --check` | clean |

Not run: `pnpm quality`, full E2E, the rest of Playwright, API/worker/Storefront/
Admin Jest, B01–B08 suites, W01/S01/S02/A01 suites, OpenAPI or client generation,
DB regression, Figma, SonarQube, repo-wide checks. **R01 is the designated APP4
integration regression.**

## T. Wall-clock and run count

```text
R01 start   2026-08-15T14:11:41Z
R01 stop    2026-08-15T14:29:01Z
elapsed     ~17 minutes  (target 30 / hard stop 45)
```

**Run count: 9, against a budget of 2. Disclosed rather than rounded.** Every
failure was in R01's own spec, none in APP4 runtime, and each was a distinct
cause fixed before the next attempt:

1. issuer called without a request context (its documented contract);
2. the delivered link pointed at the `.invalid` origin, which cannot be navigated;
3. the rejection comparison included `meta.requestId`/`timestamp`;
4. E01-17 replayed an origin whose grant was still eligible;
5. the queue still held a PENDING replay job, so the terminal failure landed on it;
6–9. added E01-10, then lint/type corrections, then a final confirmation run so
   the green evidence matches the committed code exactly.

No run was a repeat for reassurance. The time budget was met; the run budget was
not, and the tension is real: a first-attempt-green forensic spec of this size is
not a realistic target, and the budget is worth revising for comparable work.

## U. Files changed

```text
A packages/e2e-testing/specs/app4/e01-r01.acceptance.spec.ts   (the canonical run)
M packages/e2e-testing/support/app4/db-evidence.mjs            (listRecent, makeDueNow, backdateChallenge)
M packages/e2e-testing/scripts/run-e2e.mjs                     (--app4-r01 mode, repo root, browser-tier origin)
M packages/e2e-testing/playwright.config.ts                    (app4-r01 project)
M packages/e2e-testing/package.json                            (e2e:app4:r01)
A docs/implementation/reports/APP4-E01-R01-COMPLETION-REPORT.md
```

**No APP4 application or runtime source was modified.** No B03/B04/B05/B06/B07/
B08, W01, S01/S02/A01, schema, migration, OpenAPI document, generated client or
Figma change. No production endpoint added.

## V. Git evidence

```text
test(app4): prove canonical secure contact acceptance
docs(app4): record canonical acceptance evidence
```

Not amended, not squashed, not pushed.

## W. Final E01 status / next checkpoint

```text
APP4-E01-H01 = PASS
APP4-E01-H02 = PASS
APP4-E01-R01 = PASS
APP4-E01     = PASS  (correction count = 0)
APP4-X01     = READY — NOT STARTED
```

`APP4-X01` was not started, and no APP5/APP6/APP7 work was begun.
