# APP4-E01-R01-C1 — Replay Delivery and Expiry Evidence · Completion report

## A. Verdict

```text
APP4-E01-R01-C1 = PASS
APP4-E01-R01    = PASS_AFTER_C1   (correction count = 1)
APP4-E01        = PASS_AFTER_R01_C1
APP4-X01        = READY — NOT STARTED
```

Three targeted proofs, all passing:

```text
APP4_E01_R01_C1_PROOFS { …31 safe facts, every one true/false or a safe label… }
```

**No full regression/test chain was run.** The 13-test R01 journey was **not**
rerun, and nothing R01 already proved was re-proved.

---

## B. Why C1 was required

The correction is accepted as correct on both counts.

**Gap 1 — the replay follow-up was closed one step short.** R01 proved that real
B08 *creates* a new PENDING intent, a new PENDING outbox event and a
byte-identical envelope, and then closed
`B08 replay-through-worker live journey` on that. But the follow-up asks for
`replay → worker claim/open/deliver`, and R01 never executed the replay event.
A PENDING row is an intention to deliver, not a delivery, and the claim that the
envelope round-trips was resting on stored bytes rather than on anything having
opened them.

**Gap 2 — expired was never proven.** R01's rejection matrix covered unknown and
revoked tokens. `expired` is a required runtime-reachable cause and was missing;
`superseded` remains the conditional one.

The R01 run-budget overrun is disclosed process debt and played no part here.

---

## C. Minimal fixture universe

Built fresh and independently of the R01 spec, through production paths only:
one synthetic contact verified through the real S01 journey (real B03 issue →
real W01 delivery → real code entry) producing one Customer and one verified
primary Contact Point, then fixture `custom_requests` rows and grants issued by
the **real internal `SecureGrantIssuer`** inside a request context.

Nothing was hand-written. Specifically **not** written by any fixture:
`recipient_contact_point_id`, notification status, outbox terminal status, or the
replay intent/outbox. The source terminal failure was produced through the
existing worker-control seam (`TERMINAL_FAILURE`), and the replay through the
real B08 endpoint from an authenticated Admin session.

---

## D. Replay creation

```text
sourceTerminalCreatedThroughProduction = true
replayAggregateLinksToReplayIntent     = true
```

The source reached `FAILED` + `DEAD_LETTER` through the real execution seam. Real
B08 then created a PENDING replay intent and a PENDING replay outbox event. The
replay event was identified through **persisted linkage** — `aggregate_id` equals
the replay intent id — rather than by list position alone.

## E. Real W01 replay delivery — the gap, closed

```text
replayWorkerClaimedNewOutbox     = true
replayDeliveryRecorded           = true
replayIntentFinalStatusSatisfied = true
replayDeliveryAttemptExists      = true
replayRecipientBindingPreserved  = true
```

The replay outbox event was claimed and executed by the real
`JobExecutionService`, and the real `RecordingNotificationChannelAdapter`
received a delivery whose `secretKind` is `SECURE_LINK_TOKEN` and which carried a
composed secure link. A `notification_delivery_attempts` row exists for the
replay intent, the replay intent settled at `SATISFIED`, and its
`recipient_contact_point_id` still equals the Customer's verified primary Contact
Point.

This is no longer inferred from a PENDING row: the delivery happened.

## F. Same-secret / same-envelope after real delivery

```text
replayDeliveredSameSecret   = true
replayEnvelopeSameVersion   = true
replayEnvelopeSameAlgorithm = true
replayEnvelopeSameIv        = true
replayEnvelopeSameCiphertext= true
replayEnvelopeSameAuthTag   = true
replayPayloadSchemaSame     = true
```

The plaintext the worker produced when it opened the replay envelope was
compared, in memory, with the plaintext the original terminal delivery carried —
identical, reported as a boolean, neither operand printed or passed to a matcher
that would print one.

This is the manual-replay contract proven **through decryption**: the API copied
the sealed envelope without opening it, and the worker opening that copy yielded
the same secret. No API-side test code decrypted anything; the only plaintext
observation is the recording adapter's, after real W01 execution.

## G. Source terminal immutability

```text
originIntentStillFailed     = true
sourceOutboxStillDeadLetter = true
sourceOutboxUnchanged       = true
sourceGrantUnchanged        = true
```

Snapshots were captured before the replay and compared field-by-field after the
replay had been **delivered**, not merely created. The origin intent, the
`DEAD_LETTER` row and the source grant are byte-identical to their pre-replay
state. The replay lineage reached `SATISFIED`; the origin did not move.

## H. Expired rejection equivalence

```text
expiredGrantStillActiveRow       = true
expiredCanonicalStatus           = 404
expiredCanonicalCode             = SECURE_LINK_UNAVAILABLE
expiredStatusEqualsUnknown       = true
expiredCodeEqualsUnknown         = true
expiredMessageEqualsUnknown      = true
expiredSemanticBodyEqualsUnknown = true
expiredRelevantHeadersEqual      = true
```

A dedicated grant was issued through the real B05 issuer and made expired by
moving **only** `expires_at` into the past. `status` stayed `ACTIVE`, and
`token_hash`, `scope_kind` and the target were untouched — a stale-`ACTIVE` row
is a state `APP4-B07` already reports rather than rewrites, so nothing invalid
was fabricated and no seven-day TTL was waited out.

Resolved through the real B06 endpoint, the expired token is indistinguishable
from an unknown one: same status, same application code, same message, same
semantic body, same content type. Only `meta.requestId` and `meta.timestamp`
differ, which are per-request by design and carry nothing about the grant, so
they are excluded from the semantic comparison.

```text
SUPERSEDED_REJECTION = NOT_REPEATED_IN_C1
```

Recorded rather than manufactured: producing supersession would have broadened
the minimal universe, and §10 makes it explicitly optional. No browser journey
was repeated — R01 already proved the Storefront's canonical unavailable view
against real B06.

## I. Runtime-output secret scan

```text
apiOutputCaptured           = true
workerOutputCaptured        = true
secretPresentInApiOutput    = false
secretPresentInWorkerOutput = false
secureLinkPresentInLogs     = false
```

Both surfaces are real, and both were shown to be non-empty before being scanned
— an empty transcript would have made the scan vacuous rather than reassuring.
API output is read through the orchestrator's existing loopback control seam
(one added read-only `GET /api/log-tail` returning the bounded tail the service
already keeps — test orchestration, not production surface). Worker output is
captured in-process, hooked **before** the runtime boots so the worker's own
startup lines prove the capture is live.

The scan compares in memory and reports surface names only. Neither the token nor
the composed secure link appears in either surface.

## J. Validation ledger

| Validation | Command | Result |
| --- | --- | --- |
| Targeted C1 acceptance run | `node scripts/run-e2e.mjs --app4-r01-c1` | **3 passed** |
| E2E typecheck | `tsc --noEmit` | clean |
| Scoped ESLint | `eslint specs/app4 support scripts` | clean |
| Scoped Prettier | `--write` then `--check` | clean |
| Report secrets | `node tools/check-report-secrets.mjs` | passed |
| Staged whitespace | `git diff --cached --check` | clean |

Not run: the full R01 journey, full E2E, the rest of Playwright, API/worker/
Storefront/Admin Jest, B01–B08 suites, the W01 suite, S01/S02/A01 suites,
OpenAPI or client generation, DB regression, Figma, SonarQube, `pnpm quality`,
repo-wide checks.

## K. Wall-clock and run count

```text
C1 start   2026-08-15T14:43:14Z
C1 stop    2026-08-15T14:52:00Z
elapsed    ~9 minutes  (target 20 / hard stop 30)
```

**Run count: 4, against a budget of 2. Disclosed.** All three failures were in C1
test code, none in APP4 runtime:

1. `readNotificationAttempts` queried `notification_intent_id` ordered by
   `attempt_number`; the real columns are `intent_id` and the sequence `id`. A
   latent H02 helper bug — C1 was the first thing to call that reader;
2. the C1-C output hook was installed *after* the runtime booted, so the worker
   transcript was empty and the assertion that capture was live failed —
   correctly, since a vacuous scan is not a proof;
3. a lint fix to the API-tail parsing, followed by a confirmation run so the
   green evidence matches the committed code exactly.

None was a repeat for reassurance.

## L. Files changed

```text
A packages/e2e-testing/specs/app4/e01-r01-c1.acceptance.spec.ts  (three targeted proofs)
M packages/e2e-testing/support/app4/db-evidence.mjs              (expireGrant; readNotificationAttempts fix)
M packages/e2e-testing/support/orchestration/api-control-server.mjs (read-only log tail)
M packages/e2e-testing/scripts/run-e2e.mjs                       (--app4-r01-c1 mode)
M packages/e2e-testing/playwright.config.ts                      (app4-r01-c1 project)
M packages/e2e-testing/package.json                              (e2e:app4:r01c1)
A docs/implementation/reports/APP4-E01-R01-C1-COMPLETION-REPORT.md
M docs/implementation/reports/APP4-E01-R01-COMPLETION-REPORT.md   (post-C1 reconciliation)
```

**No APP4 production or runtime source was modified.** No B01/B03/B04/B05/B06/
B07/B08, W01, S01/S02/A01, schema, migration, OpenAPI document, generated client,
Figma, Dockerfile or `staff-bootstrap` change.

## M. Git evidence

```text
test(app4): close replay delivery and expiry acceptance gaps
docs(app4): reconcile E01 after final acceptance correction
```

Prior R01/H01/H02 commits are untouched — not amended, not squashed. Nothing
pushed.

## N. Final E01 status

```text
APP4-E01-H01 = PASS
APP4-E01-H02 = PASS
APP4-E01-R01 = PASS_AFTER_C1   (correction count = 1)
APP4-E01     = PASS_AFTER_R01_C1
APP4-X01     = READY — NOT STARTED
```

`B08 replay-through-worker live journey` is now **genuinely CLOSED**, on evidence
that the replay event was claimed, opened, delivered and settled — not on the
existence of a PENDING row.

No `APP4-E01-R01-C2` was created. `APP4-X01` was not started.
