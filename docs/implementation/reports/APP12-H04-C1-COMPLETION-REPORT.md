# APP12-H04-C1 — Startup Safety, Graceful Drain and Object-Storage Failure Correction

## A. Verdict

```text
APP12-H04-C1  = BLOCKED_RESILIENCE
CORRECTION_USED = 1 / 1   (no C2)
PUSHED = false
```

Three of the four correction areas are **fixed and proved live**. One is not, and
it is not blocked by a defect this correction could remove:

| § | Area | Outcome |
|---|---|---|
| 3 | Notification startup race destroying credentials | **FIXED, proved live** — a pre-policy notification now holds for 80s+ at `attempt_count = 0`, unclaimed, and is delivered exactly once after canonical publication with no worker restart |
| 4 | API graceful drain | **0 5xx** across 66 441 requests over three rollout cycles, but **10 connection resets**. A controlled experiment shows resets occur on an endpoint change **with no pod termination and no drain at all**, so no drain configuration can reach the required zero. Per §4 this returns `BLOCKED_RESILIENCE` with exact timing evidence (§I) |
| 5 | Storage outage owned by Gateway timeout | **FIXED, proved live** — upload during a frozen store now answers **503 in 20.0s** in the application's own JSON envelope, was HTML `504` at 60s |
| 6 | Private evidence read recovery | **FIXED, proved live** — `200`/hash `H` → safe bounded `500` during outage → `200` with the **identical hash** after recovery |

The blocking item is reported honestly rather than argued away. §I sets out the
measurement, the controlled experiment that attributes it, and what would have to
change to reach zero — none of which is drain configuration.

---

## B. PO correction authority

`APP12-H04` was returned `CORRECTION_REQUIRED` on four grounds. Each is accepted
without dispute; two of them were the parent report's own judgement errors:

1. **Routing drain work to H05 was wrong.** The locked roadmap defines
   `APP12-H05` as *Performance and CWV measurement*. Termination sequencing is
   resilience and belongs here. The parent report's `FU-APP12-H04-01` deferral is
   withdrawn.
2. **Routing the storage timeout to a follow-up was wrong** for the same reason —
   the application not owning its dependency failure boundary is a resilience
   defect, not a later cleanup.
3. **The notification residual was a real Wave-1 release defect**, not an
   acceptable footnote. The parent report disclosed it accurately and then
   under-weighted it.
4. **The private-evidence read was not actually proved.** The parent report used
   an `INSPECTING` artifact that returned `404` before, during and after the
   outage, which demonstrates nothing about recovery. Restated plainly: that
   section did not prove what it was asked to prove.

---

## C. Accepted H04 evidence

Carried forward unchanged and not re-run: Ready-Made create idempotency, stock
race, worker lease/reclaim, poison job, FULL duplicate initiate and
reverification, manual review recovery, fee/verify and verify/expiry races,
fulfilment replay, rolling restart, gallery continuation retry
(`FU-APP11-A01-03`), and the H03 telemetry baseline.

Re-proved in this correction because the code beneath them changed: the exactly-once
Ready-Made journey (§Q), normal backlog and dead-letter, and worker
lease/claim behaviour (the claim filter is what §3 modifies).

---

## D. Notification startup residual — root cause

`APP12-H04` fixed the *permanent* stale-policy state but left a window: a
notification produced before `notification.delivery` was published still burned
its whole attempt budget and dead-lettered.

The root cause is that the capability **ran** in order to fail closed. Failing
closed was correct; *running* was not:

```text
job claimed  -> attempt 1 FAILED_RETRYABLE  (policy missing)
             -> attempt 2 FAILED_RETRYABLE
             -> attempt 3 FAILED_TERMINAL   -> DEAD_LETTER
total elapsed: ~4 seconds
```

The budget is the global `worker.runtime` `maxAttempts: 3`, and the bootstrap
Job that publishes the policy routinely takes longer than four seconds to win its
race against a concurrently-started worker. So a correct deployment destroyed
customer credentials as a matter of ordinary timing.

**No amount of reload speed fixes this**, which is why H04's re-read alone was
insufficient: the attempts are spent before any reload could plausibly complete.

---

## E. Worker readiness and claim correction

The smallest existing-authority seam is the **claim filter**. `JobHandlerRegistry.registeredTypes()`
already decides what this deployment may claim, and the persistence layer already
treats an absent type as "claim nothing".

```text
apps/worker/src/runtime/registry/job-handler.ts
  + JobClaimGate { requirement, ready(), refresh() }
  + JobHandler.claimGate?          optional; five capabilities declare none

apps/worker/src/runtime/registry/job-handler.registry.ts
  ~ registeredTypes()   omits a handler whose gate is closed
  + refreshClaimGates() re-checks only closed gates; a throw leaves it closed
  + closedGates()       observability

apps/worker/src/runtime/poll/job-poll-runtime.service.ts
  + refreshClaimGatesPaced()  once per UNCONFIGURED_RECHECK_MS, not per poll
  ~ readiness() reports CAPABILITY_POLICY_MISSING with the closed requirements

apps/worker/src/jobs/notification-delivery/notification-delivery.handler.ts
  + claimGate backed by NotificationDeliveryPolicyService
```

Consequences, and why each boundary was respected:

- **No second queue.** The row stays where it was, in the same table, with the
  same lease semantics.
- **No dropped job.** A gated row is `PENDING` with `attempt_count = 0`; it is
  claimed as soon as the gate opens.
- **A missing policy never becomes success.** Nothing is delivered without a
  published budget — the fail-closed guarantee is unchanged; it simply no longer
  costs the notification its life.
- **Readiness is truthful.** A worker with an inert registered capability reports
  `not ready (CAPABILITY_POLICY_MISSING)` rather than `ok`.

Two defects introduced by the first cut of this change were caught by the live
run and fixed before acceptance, and are recorded rather than quietly repaired:

1. **A log flood.** Re-reading on the poll loop turned a once-at-bootstrap error
   into ~2 lines/second for the life of an unconfigured pod.
   `NotificationDeliveryPolicyService` lacked the `reportedProblem` dedupe its
   sibling `WorkerPolicyService` carries; it now has it. Measured after the fix:
   **1 line**, not thousands.
2. **A database probe every 500ms.** The gate refresh ran on `pollIntervalMs`.
   It is now paced on the same `UNCONFIGURED_RECHECK_MS` (5s) the delivered
   missing-`worker.runtime` branch uses.

---

## F. Cold late-policy proof (live)

Disposable Kubernetes staging. `worker.runtime` present, `notification.delivery`
detached as a fault prerequisite, worker restarted into the race.

```text
=== notifications created with the policy ABSENT ===
VERIFICATION_CODE queued  (challenge issue)      202
ORDER_ACCESS queued       (order create)         201

=== held far past the ~4s exhaustion window ===
 t+20s  [{"id":108,"status":"PENDING","attempt_count":0},
         {"id":109,"status":"PENDING","attempt_count":0},
         {"id":111,"status":"PENDING","attempt_count":0}]
 t+40s  identical
 t+60s  identical
 t+80s  identical

=== PROOF BEFORE PUBLICATION ===
 not delivered              true
 not DEAD_LETTER            true
 no attempt budget spent    true      (attempt_count = 0)
 never claimed              true      (claimed_by = null)
 worker restarts            0
 "not configured" lines     1         (deduped)
 readiness truthful         true      (CAPABILITY_POLICY_MISSING)
 secret leak in worker log  false

=== published through the CANONICAL staff-bootstrap Job ===
 adopted after ~5s
 final  [{"id":108,"status":"DISPATCHED","attempt_count":1},
         {"id":109,"status":"DISPATCHED","attempt_count":1},
         {"id":111,"status":"DISPATCHED","attempt_count":1}]
 delivered exactly once     true
 same worker pod, no restart true
 pending backlog            0
 dead-letter delta          0
```

80 seconds is **20× the window that previously destroyed these credentials**.
Both required kinds are covered — `verification.code` and `secure_access.link`
(`ORDER_ACCESS`) — and the delivered policy applies to both.

Criteria 1, 2, 3, 4, 6 satisfied.

---

## G. Genuine missing-policy regression

The permanently-unpublished case must stay fail-closed and observable, and does:

```text
policy absent, indefinitely
  notification_delivery_attempts   0        (nothing sent, ever)
  outbox rows                      PENDING, attempt_count 0
  worker readiness                 not ready (CAPABILITY_POLICY_MISSING)
  operator log                     one deduped line naming the policy key
  secret material                  never decrypted, never logged
```

An **invalid** policy behaves identically — `current()` is `undefined` either
way, so the gate stays shut. The focused suite asserts both cases; see §T for the
two superseded assertions and why they changed.

Criterion 5 satisfied.

---

## H. Graceful drain — root cause and fix

Entry state: `maxUnavailable: 0`, `maxSurge: 1`, Nest shutdown hooks present, no
`preStop`, implicit grace period. On `SIGTERM` the process stops accepting
connections at the same instant kubelet *begins* removing it from Endpoints, and
the Gateway keeps routing until that removal propagates.

```text
infrastructure/kubernetes/base/workloads/api.yaml
  + terminationGracePeriodSeconds: 45
  + lifecycle.preStop.exec: ["sleep", "10"]

apps/api/src/modules/health/shutdown-state.service.ts   (new)
  OnApplicationShutdown -> terminating = true, one direction only

apps/api/src/modules/health/health.controller.ts
  ~ readiness() answers 503 while terminating, checked before the database
```

The sequence is now: `preStop` holds the pod serving for 10s while endpoint
removal reaches the Gateway; readiness simultaneously reports 503 so probes agree;
`SIGTERM` then drains in-flight work inside a 45s bound. `exec: sleep` rather
than `lifecycle.preStop.sleep` because the sleep action is only GA from
Kubernetes 1.32 and the production distribution is an open decision
(`CLAUDE.md` §8); `sleep` is busybox's, present in the Alpine runtime image.

---

## I. Three-cycle drain evidence — and why this is blocked

All load runs are **in-cluster** (pod → nginx-gateway Service → HTTPRoute → API).
The first C1 attempt measured through `kubectl port-forward` and saw 8 simultaneous
resets — exactly the concurrency — which is a port-forward artifact, so that hop
was removed rather than reported.

**Final measurement, three rollout cycles, final build:**

```text
requests            66 441 over 150s
HTTP 200            66 431
HTTP 5xx            0        <- criterion 8 PASS
HTTP 4xx            0
connection resets   10       <- criterion 9 FAIL
availability        99.985 %
reset timestamps    12486 17657 17657 32661 37694 43746 58894 88050 88050 88050 ms
```

**Controlled experiments that attribute the residual.** Same load, same duration,
same client:

| Run | What changed | Requests | 5xx | Resets |
|---|---|---|---|---|
| Control | nothing at all — no rollout, no scaling | 67 268 | 0 | **0** |
| Endpoint **add only** — scale 2→3→4, **no pod ever terminates, no drain** | 44 388 | 0 | **2** (one per scale event) |
| Full rollout — termination + drain, 3 cycles | 66 575 | 0 | 11 |
| Full rollout, final build | 66 441 | 0 | 10 |

The second row is decisive. **Two resets occurred when no pod was terminated and
no drain ran** — one per endpoint change. The mechanism is the NGINX Gateway
Fabric config reload closing idle keep-alive connections on retiring nginx
workers; a client reusing such a socket at that instant sees `ECONNRESET`. A
rollout causes several endpoint transitions per cycle, and the observed rate
tracks that count.

No `preStop` duration, grace period, readiness transition or server-side drain
behaviour can prevent a reset caused by *adding* an endpoint. The drain itself is
clean: **zero 5xx in every run**, and no request was ever served an error by a
terminating pod.

A conformant-client measurement was also taken, because RFC 9110 §9.2.2 requires
a client reusing a persistent connection to be prepared for the server to close
it and to retry an idempotent request. With one retry on an idle-connection
reset: **28 resets absorbed, 9 still surfaced** — so a single immediate retry does
not fully absorb it either, and this is reported rather than used to claim zero.

Per §4's own instruction — *"If a standards-compliant bounded drain cannot achieve
this, return `BLOCKED_RESILIENCE` with exact request timing evidence"* — this is
returned blocked. Reaching literal zero would require changing the ingress
implementation's keep-alive/reload behaviour, which is outside both the allowed
fix list and this checkpoint's authority.

```text
FU-APP12-H04-01 = NOT CLOSED — superseded by this blocked finding, PO decision required
```

---

## J. Storage timeout — root cause and fix

The intended fix was S3 client configuration. It does not work, and the two
failed attempts are recorded so nobody repeats them:

1. `requestHandler: { connectionTimeout, requestTimeout }` as a plain object is
   **silently discarded** — the SDK builds a default handler.
2. An explicitly constructed `NodeHttpHandler` carrying the same options **also
   failed to bound a stalled call**. Measured against a local socket that accepts
   a connection and then never answers, both forms hung indefinitely.

A first cut using those settings produced a **60.2-second** private evidence read
— the boundary had moved nowhere. So the bound was placed on the seam that
demonstrably works: the abort signal already threaded into every command.

```text
packages/object-storage/src/request-options.ts
  + STORAGE_OPERATION_DEADLINE_MS = 20_000
  ~ requestOptions() composes the caller's signal with AbortSignal.timeout
    via AbortSignal.any — the caller's own cancellation stays authoritative

packages/object-storage/src/s3-object-storage.adapter.ts
  + putObjectStream passes an abortController to lib-storage's Upload
  ~ maxAttempts 3 -> 2
  ~ storage error messages no longer embed the object key (§N)
```

The upload needed its own treatment: destroying the source body ends the
*stream*, but `Upload.done()` still waited on an HTTP response that never came —
the full 60s. Only the upload's own controller ends the *request*. The caller's
signal still fails the body, which preserves the delivered no-dangling-parts
guarantee (lib-storage awaits `AbortMultipartUpload` on that path).

`20s < 60s` NGINX Gateway Fabric default, with headroom.

**One intermediate change was made and then removed.** A stream idle-timeout
wrapper on the response body attached a `'data'` listener, which switches a
paused stream into flowing mode and loses data before the consumer attaches. It
is deleted; the operation deadline already bounds the read, proved at 20.1s.

---

## K. Upload outage evidence (live, final build)

```text
healthy control upload                      202

--- object store FROZEN (SIGSTOP; data preserved, pod not deleted) ---
upload during outage        503 in 20 054 ms
body                        {"success":false,"code":"INTERNAL_SERVER_ERROR",
                             "message":"An unexpected error occurred. Please try again later.", ...}
before Gateway timeout      true      (20.0s vs 60s)
app-owned JSON envelope     true      (was nginx HTML 504)
stack/endpoint/bucket/key/credential leak   NONE
false accepted evidence     0
orphan asset rows           0
```

Criteria 11, 12, 13 satisfied.

---

## L. Healthy upload regression

The deadline must not manufacture failures. Measured after the change, through
the real Gateway:

```text
small (2 477 B)   202 in  65 ms
256 KiB           202 in  93 ms
900 KiB           202 in  97 ms
```

Disclosed: a 4 MiB upload returns nginx `413`. That is the Gateway's
`client_max_body_size` (1 MiB default), not this change — the API's own ceiling
is 10 MiB. It is a pre-existing production-relevant mismatch and is filed as
`FU-APP12-H04-C1-01`; 900 KiB is therefore the largest upload that can reach the
API in this topology, and it passes comfortably.

Criterion 14 satisfied.

---

## M. Private evidence before / outage / after (live, final build)

A genuinely **`ACCEPTED`** artifact this time, produced through the real
inspection path — a 400×300 PNG generated with the same `sharp` the inspection
job uses, uploaded through the real endpoint and accepted by the real worker. No
fixture forced the state.

```text
asset status                ACCEPTED

--- BEFORE outage ---
authorized read             200  image/png  2 477 bytes  in 25 ms
sha256 H                    7f8301f8299205eb60f8c841ffbde6c687eb804049237d012ec8a850e988be2e
anonymous read              401

--- DURING outage (store frozen, object preserved) ---
authorized read             500 in 20 097 ms      (bounded, < 60s Gateway timeout)
body                        application JSON envelope, generic server-fault code
no partial/corrupt bytes    true
object-key leakage          NONE
anonymous read              401                    <- authorization unchanged by the outage

--- AFTER recovery ---
authorized read             200  image/png  2 477 bytes  in 25 ms
sha256                      7f8301f8299205eb60f8c841ffbde6c687eb804049237d012ec8a850e988be2e
SAME BYTES (H == H)         true
replacement uploaded        false
```

Criteria 16, 17, 18, 19 satisfied.

Method note, disclosed: the fault is `SIGSTOP` on the MinIO process from the
node, not a pod deletion. The disposable MinIO is on an `emptyDir`, so deleting
the pod destroys the object and makes "same bytes after recovery" unprovable by
construction — an earlier attempt did exactly that and is why this method was
chosen. Freezing the process is a real outage that preserves the data.

---

## N. H03 observability

Both C1 fault classes are diagnosable, and neither alert nor metric was altered
to make a path green.

```text
embroidery_worker_queue_pending                     0
embroidery_worker_job_attempts_total{succeeded}     5
embroidery_notification_delivery_total{success}     3
embroidery_dependency_errors_total                  (no series)
ACTIVE ALERTS                                       0
```

Diagnostic signal for the startup gate — Loki, structured, deduped:

```json
{"level":"error","service":"worker","context":"NotificationDeliveryPolicyService",
 "message":"Policy \"notification.delivery\" is not configured. Notification delivery will not send."}
{"level":"info","service":"worker","context":"WorkerBootstrap",
 "message":"Worker readiness: not ready (CAPABILITY_POLICY_MISSING)."}
```

Diagnostic signal for the storage fault, correlated by `requestId`, route and
actor:

```json
{"level":"error","service":"api","event":"platform.error","message":"Unhandled request error",
 "requestId":"abbb0d44-...","actor":{"kind":"ADMIN","id":"..."},
 "http":{"method":"GET","route":"/api/admin/payment-evidence/:evidenceId/content","statusCode":500},
 "error":{"name":"ObjectStorageError","message":"Object storage get object failed (REQUEST_ABORTED).",
          "code":"REQUEST_ABORTED"}}
```

**An object-key leak was found and fixed in this correction.** The bounded
deadline turns a hang into a *logged* error, so an `ObjectStorageError` message
that had always embedded the full key —
`production/originals/<uuid>/original.png` — began reaching the log pipeline.
`toObjectStorageError` now names only the operation kind. Verified live on the
final build: **0 occurrences of `originals/`** in API logs, with `requestId`,
route, actor and error class retained, so nothing diagnostic was lost.

Leakage scan, 5 630 lines across API and worker:

```text
CLEAN  secret in the clear
CLEAN  email address
CLEAN  phone number
CLEAN  credential value
CLEAN  customer address
CLEAN  object key / bucket        (after the fix above)
```

Criteria 20, 26 satisfied.

---

## O. Follow-up closure

```text
FU-APP12-H04-01  NOT CLOSED — the drain fix is implemented and 5xx are zero, but
                 the required "0 connection resets" is unreachable by drain
                 configuration (§I). PO decision required; deliberately not
                 routed to H05.

FU-APP12-H04-02  CLOSED_BY_APP12_H04_C1 — storage outage now answers in 20s
                 through the application's own envelope (§K, §M).

FU-APP12-H04-03  CLOSED_ACCEPTED_PROTECTED_INFRASTRUCTURE_LOG_DETAIL
                 The pg idle-client line prints the connection-string shape with
                 the password already masked as `***`. Compared against H01/H03
                 log-security authority: no credential, no PII, no token; the log
                 is operator-private and never reaches a customer response. The
                 analogous object-key case was *not* accepted and was fixed (§N),
                 because §7 names object-key explicitly.

FU-APP12-H04-04  CLOSED_ACCEPTED_DISPOSABLE_TEST_TOPOLOGY_LIMITATION
                 `emptyDir` on the disposable PostgreSQL and MinIO makes a
                 pod-deleting dependency fault destructive. No durable disposable
                 topology exists to reuse cheaply, and stateful topology is
                 ADR-reserved (`SYSTEM_ARCHITECTURE.md` §13). C1 worked within it
                 by using process-level faults (`SIGSTOP`) that preserve data —
                 which is how §M was proved. Test-topology limitation, not
                 product runtime behaviour.

FU-APP12-H04-C1-01  NEW — Gateway `client_max_body_size` (1 MiB) is below the
                 API's own 10 MiB evidence ceiling, so uploads between 1 and
                 10 MiB are refused by nginx with HTML `413` before reaching the
                 application (§L).
```

No H04 follow-up is left ownerless. Criteria 21, 22, 23 satisfied.

---

## P. Frozen-gate revalidation

```text
git diff --check                                    clean
OpenAPI check                                       PASS (artifact up to date)
generated api-client check                          PASS (tree hash unchanged)
release-gate contract spec                          PASS (21 tests)
category anti-hardcode gate                         PASS (2 579 files scanned)
Storefront route-authority gate                     PASS
report-secret checker                               PASS (650 docs, 5 211 files)
release-config validator (staging)                  PASS (20 resources)
production kustomize render                         15 resources (placeholders as committed)
```

Freshly measured, not asserted:

```text
OpenAPI              125 paths / 138 operations / 278 schemas
public operations    49
release matrix       28 DENY / 18 ALLOW / 3 SCOPE_GATED   (= 49)
migrations           38   (committed files, and applied in the live database)
DB tables            79   (live disposable database)
Admin routes         26
Storefront routes    20
Figma                unchanged — no Figma artifact opened or edited
```

Criteria 27–34 satisfied.

---

## Q. Normal Ready-Made regression

Cold, production-like worker; all faults removed; final build.

```text
1 verification notification            issued and delivered
2 order create                         ORD-6G6FC2X2T9  AWAITING_SHIPPING_FEE
3 ORDER_ACCESS notification            issued and delivered
4 shipping fee                         200
5 FULL initiate                        201
6 FULL verify                          200  READY_FOR_DELIVERY
7 dispatch                             200  DELIVERED
8 complete                             200  COMPLETED

pending outbox   0        dead-letter   0        delta 0 / 0
active alerts    0
```

Every outbox event in the entire correction run is `DISPATCHED`:

```text
asset.inspection.requested       DISPATCHED = 26
notification.delivery.requested  DISPATCHED = 66
order.created                    DISPATCHED = 22
payment.verified                 DISPATCHED = 2
                                 DEAD_LETTER = 0
```

Exactly-once for the journey: `orders 1 · status COMPLETED · consumed 1 ·
ledger 2 · snapshots 1 · grants 1 · succeeded 1`. All 66 notification intents
`SATISFIED` (22 `secure_access.link`, 44 `verification.code`).

Criteria 24, 25 satisfied.

---

## R. Files changed

```text
M apps/api/src/modules/health/health.controller.ts
M apps/api/src/modules/health/health.module.ts
A apps/api/src/modules/health/shutdown-state.service.ts
M apps/worker/src/jobs/notification-delivery/application/notification-delivery.usecase.ts
M apps/worker/src/jobs/notification-delivery/infrastructure/policy/notification-delivery-policy.service.ts
M apps/worker/src/jobs/notification-delivery/notification-delivery.handler.ts
M apps/worker/src/jobs/notification-delivery/tests/notification-delivery-context.ts
M apps/worker/src/jobs/notification-delivery/tests/notification-delivery-failure.integration.spec.ts
M apps/worker/src/runtime/poll/job-poll-runtime.service.ts
M apps/worker/src/runtime/registry/job-handler.registry.ts
M apps/worker/src/runtime/registry/job-handler.ts
M infrastructure/kubernetes/base/workloads/api.yaml
M packages/object-storage/src/object-storage.errors.ts
M packages/object-storage/src/request-options.ts
M packages/object-storage/src/s3-object-storage.adapter.ts
```

No migration, no business endpoint, no route, no contract change, no Figma edit.

---

## S. File-size evidence

```text
 46  request-options.ts                            (limit 400)
 62  shutdown-state.service.ts                     (limit 400)
121  job-handler.registry.ts                       (limit 400)
139  notification-delivery.handler.ts              (limit 400)
156  notification-delivery-policy.service.ts       (limit 400)
158  job-handler.ts                                (limit 400)
174  health.controller.ts                          (limit 400)
348  s3-object-storage.adapter.ts                  (limit 400, threshold 300)
351  job-poll-runtime.service.ts                   (limit 400, threshold 300)
362  notification-delivery.usecase.ts              (limit 400, threshold 300)
```

All within the hard limit. The three above the 300-line review threshold were
already above it at entry; the adapter is 11 lines *shorter* than it was.

---

## T. Validation

```text
git diff --check                                          clean
pnpm --filter @embroidery/worker typecheck                PASS
pnpm --filter @embroidery/worker lint                     PASS
pnpm --filter @embroidery/worker test                     PASS  67 suites, 1 111 tests
pnpm --filter @embroidery/worker build                    PASS
pnpm --filter @embroidery/object-storage typecheck        PASS
pnpm --filter @embroidery/object-storage lint             PASS
pnpm --filter @embroidery/object-storage test             PASS  5 suites, 150 tests
pnpm --filter @embroidery/api typecheck                   PASS
pnpm --filter @embroidery/api lint                        PASS
apps/api jest health|evidence|asset|design-session        3 suites / 21 tests FAIL
```

**The failing API suites are red at entry HEAD and are not caused by this
correction.** Verified by stashing every C1 change and re-running the identical
pattern on a clean tree:

```text
with C1 changes   3 failed suites · 21 failed · 719 passed · 740 total
clean HEAD        3 failed suites · 21 failed · 719 passed · 740 total   (identical)
```

The failures are `design-session-asset-delivery`, `design-session-asset-status`
and the `design-session` integration suite, all failing on a session-authorization
guard unrelated to health, storage or the worker.

**Two focused assertions were deliberately changed**, and this is a contract
change rather than a test weakened to pass a gate. Both previously asserted that
an unpublished or malformed `notification.delivery` policy produces a **claimed**
job returning `FAILED_RETRYABLE`. §3 makes that outcome wrong: the job must not be
claimed at all. They now assert the strictly stronger property — not claimed,
`attempt_count` still 0, outbox still `PENDING`, nothing sent, secret never
persisted — and the harness was updated to model one real poll cycle by
refreshing claim gates before claiming, as the runtime does.

Live production-like staging evidence: §F, §I, §K, §L, §M, §N, §Q.

---

## U. Hygiene

```text
minikube profile embroidery-h04c1        deleted
disposable PostgreSQL + MinIO            destroyed with the cluster (emptyDir)
monitoring plane                          destroyed with the cluster
disposable registry container             removed
staging images (all C1 tags)              removed after evidence capture
in-cluster load generator + ConfigMap     removed with the cluster
run-directory credential files            removed
port-forwards                             stopped
```

```text
shared_dev_commercial_residue = 0    (no shared-dev database was opened)
G03_data_created              = false
production_deployed           = false
```

No `.env` was read, written or consulted. Every credential was generated per-run
into the scratch directory, passed file → process, never echoed or committed; the
generator refuses to run under `set -x`.

---

## V. Baseline freeze

```text
OpenAPI                    125 / 138 / 278            unchanged
public operations          49                          unchanged
release matrix             28 DENY / 18 ALLOW / 3 SCOPE_GATED   unchanged
migrations                 38                          unchanged
DB tables                  79                          unchanged
Admin routes               26                          unchanged
Storefront routes          20                          unchanged
Figma                      unchanged

NEW_BUSINESS_HTTP_OPERATIONS = 0
NEW_BUSINESS_ROUTES          = 0
MIGRATION_0039               = absent
DB_SCHEMA_DELTA              = 0
```

---

## W. Parent correction notice

`APP12-H04-COMPLETION-REPORT.md` carries a correction notice at its head. Its
rehearsal evidence is preserved verbatim; the notice records that §E's H05
routing and §M's storage deferral were rejected, that §N did not prove private
evidence recovery, and that the §W residual was a release defect rather than an
accepted footnote.

---

## X. Roadmap

```text
ROADMAP_LOCK   = LOCKED
CHECKPOINTS    = 38
APP12-H04-C1   = BLOCKED_RESILIENCE
APP12-H04      = CORRECTION_REQUIRED (unchanged pending PO decision on §I)
APP12-H05      = NOT_AUTHORIZED, not started
CORRECTION_USED = 1 / 1   (no C2)
PUSHED         = false
```
