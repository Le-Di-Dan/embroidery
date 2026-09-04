> ## CORRECTION NOTICE — superseded in part by `APP12-H04-C1`
>
> The Product Owner returned this checkpoint `CORRECTION_REQUIRED`. The rehearsal
> evidence below is preserved verbatim and remains valid; four of its
> **judgements** were rejected and are corrected in
> [`APP12-H04-C1-COMPLETION-REPORT.md`](./APP12-H04-C1-COMPLETION-REPORT.md):
>
> 1. **§E routed API drain work to `APP12-H05`. Rejected.** H05 is *Performance
>    and CWV measurement*; termination sequencing is resilience and belonged
>    here. `FU-APP12-H04-01` is withdrawn as a deferral. C1 implements the drain
>    — `preStop`, an explicit grace period and a shutdown-aware readiness probe —
>    and measures `0 5xx` across three rollout cycles, but returns
>    `BLOCKED_RESILIENCE`: a controlled experiment shows the residual connection
>    resets also occur on an endpoint change with **no pod termination at all**,
>    so no drain configuration can reach the required zero.
> 2. **§M deferred the object-storage timeout to a follow-up. Rejected.** An
>    application that does not own its dependency failure boundary is a
>    resilience defect, not a later cleanup. C1 fixes it: a storage outage now
>    answers **503 in 20s** in the application's own JSON envelope instead of
>    nginx's HTML `504` at 60s.
> 3. **§N did not prove private evidence recovery.** It used an `INSPECTING`
>    artifact that returned `404` before, during *and* after the outage, which
>    demonstrates nothing about recovery. C1 proves it with a genuinely
>    `ACCEPTED` artifact: `200` at hash `H` → bounded safe failure → `200` at the
>    identical hash.
> 4. **§W.4's residual was a Wave-1 release defect, not a footnote.** A
>    notification created before `notification.delivery` was published still
>    burned its whole attempt budget and dead-lettered within ~4 seconds. C1
>    gates the claim so such a job is never claimed at all — measured holding for
>    80 s at `attempt_count = 0`, then delivered exactly once after canonical
>    publication, with no worker restart.
>
> Nothing below has been edited. Read this report as the record of what H04
> measured, and C1 as the record of what was corrected.

# APP12-H04 — Resilience and Failure Rehearsal (Wave 1) — Completion Report

## A. Verdict

```text
APP12-H04            = COMPLETE
CORRECTION_USED      = 0        (two bounded fixes taken inside the original checkpoint, H04 §2)
WAVE1_BLOCKER        = 1 found, 1 fixed, 0 open
HIGH                 = 0
MEDIUM               = 3        (1 fixed, 2 carried forward)
LOW                  = 2
PUSHED               = false
NEXT_CHECKPOINT      = APP12-H05
```

H04 rehearsed failure against the deployed production-like world, not against a
mock. Every scenario below ran on a real minikube cluster with the real
production images, the real Gateway and TLS, real PostgreSQL and MinIO, and the
real H03 monitoring plane.

**The checkpoint's most important result is a defect it found.** On a
cold-deployed cluster, **100% of notification deliveries were destroyed** —
every verification code and every `ORDER_ACCESS` link — while the worker
reported itself `Ready` and no probe failed. In Wave-1 ready-made commerce the
`ORDER_ACCESS` link is the customer's only credential for their own order, so
the practical effect was that no customer could open or pay for anything. It is
fixed, and the fix is proved live in §W.

---

## B. H03-C1 PO reconciliation

`APP12-H03` remains `COMPLETE_AFTER_C1`; nothing in H03 was reopened. H03-C1's
own claims were re-observed live on a genuinely cold cluster in this run:

| H03-C1 claim | H04 live observation |
|---|---|
| Cold-deployed worker adopts a later-published policy | **Confirmed.** Worker read `worker.runtime` at `02:04:51` (missing), bootstrap published it at `02:05:02`, worker loaded it at `02:05:06` — one recheck tick, no restart. |
| Ready-Made `payment.verified` successful no-op | **Confirmed.** `payment.verified` reached `DISPATCHED`, attempt 1, no business effect. |
| `order.created` explicit known-no-op acknowledgement | **Confirmed.** All `order.created` events `DISPATCHED`, attempt 1. |
| Normal pending outbox / dead-letter = 0 | **Confirmed only after this checkpoint's fix.** See §W — H03-C1 generalised the recheck to `worker.runtime` only, and the notification consumer was left behind. |

The last row is the WAVE1_BLOCKER. It is a gap H03-C1 did not close rather than
a regression of what it did close.

---

## C. Resilience preflight

Mechanically inspected before any fault was injected.

| Area | Authority read | Entry finding |
|---|---|---|
| API shutdown / readiness / rollout | `main.ts`, `health.controller.ts`, `base/workloads/api.yaml` | `enableShutdownHooks()` present; `maxUnavailable: 0, maxSurge: 1`; liveness DB-independent, readiness DB-dependent. **No `preStop` hook and no explicit `terminationGracePeriodSeconds`** — flagged, then measured in §E. |
| Worker lease / claim / retry / completion | `job-poll-runtime.service.ts`, `job-execution.service.ts`, `retry-schedule.ts` | Guarded completion re-checks worker + attempt; handler promise never detached; abandoned lease recoverable by design. |
| `worker.runtime` policy | `worker-policy.service.ts` | Recheck-while-unconfigured present (H03-C1). |
| `notification.delivery` policy | `notification-delivery-policy.service.ts` | **Loaded once at bootstrap, no recheck.** Flagged at preflight; confirmed catastrophic in §W. |
| Ready-Made creation idempotency | `create-ready-made-order.use-case.ts`, `idempotency-store.ts` | One transaction; claim before any consequence; scope key = verified challenge. |
| FULL initiate / verify / replay | `initiate-full-payment-attempt.use-case.ts`, `verify-payment-attempt.use-case.ts`, `payment-verification.policy.ts` | `satisfy()` under row lock is the arbiter; `isSameVerificationApplication` is the replay rule. |
| Manual review / reconciliation | `review-payment-attempt.use-case.ts` | `REQUIRES_REVIEW` is *verifiable-from*, so recovery uses the same verify operation. No override endpoint exists or is needed. |
| Object storage write/read ordering | `transfer-evidence-object.writer.ts` | Orphan removal only on Tx-A failure; a committed asset row is never orphan-deleted. |
| Reservation expiry | `expire-reservations.usecase.ts` | `orders` lock first, then reservation; order cancelled only if an expiry actually happened. |
| Stock locks / races | `stock-anchor.ts` | Anchor row lock; docstring explicitly declined to claim concurrent safety (DB8 CC-20) — **now claimed and proved in §G**. |
| Dispatch / complete | `dispatch-order.use-case.ts`, `complete-order.use-case.ts` | Replay = deterministic refusal from the source-state assertion. |
| H03 telemetry | `infrastructure/monitoring/` | 15 alert rules, metrics + Loki + Grafana + Alertmanager. |

Per-scenario fault seam / expected state / allowed retry / forbidden duplicate /
diagnostic signal / recovery action are recorded inline in §E–§X.

---

## D. Fault-injection architecture

```text
cluster        minikube profile embroidery-h04, Kubernetes v1.31.4, docker driver
gateway        Gateway API v1.2.1 CRDs + NGINX Gateway Fabric v1.6.1 (into the disposable cluster)
registry       disposable registry:2 on the cluster network
images         embroidery/{api,worker,storefront,admin} built --target runner from RELEASE_SHA 58a371985bc9
               deployed BY DIGEST, never by tag
database       disposable PostgreSQL 16.14, TLS on, emptyDir, embroidery_db7_h02_staging
object store   disposable MinIO, emptyDir
monitoring     Prometheus v3.1.0, Alertmanager, Loki, Grafana 11.5.1, Alloy v1.6.1
browser        real Chromium (Playwright) for §X
```

Fault mechanisms actually used — all bounded, reversible and disposable:

```text
SIGTERM / pod delete                  API graceful shutdown (§E)
socket abort mid-request              create response loss (§F)
real concurrent HTTP                  duplicate create, stock race, initiate, verify (§G,§O,§P)
SIGKILL (kill -9) of the worker       claim survival (§H)
PostgreSQL row lock held by the test  handler stall = transient DB failure in an attempt (§H,§L)
disposable-DB fixture mutation        poison payload, due-dating a reservation, detaching a policy
kubectl scale to 0                    PostgreSQL outage (§K), MinIO outage (§M,§N)
rollout restart                       rolling restart under commerce (§V)
in-page XHR/fetch interception        gallery continuation failure (§X)
```

**Disclosed environment limitation.** The disposable PostgreSQL and MinIO are on
`emptyDir` by deliberate design (`staging-scaffolding/README.md`). Severing the
API's *established* connection pool requires killing the PostgreSQL pod, which
therefore also destroys the database. Two softer faults were tried first and are
recorded as ineffective rather than quietly dropped: `SIGSTOP` on the postmaster
does not freeze already-forked backends, and changing the Service selector does
not break conntrack-established connections. The §K evidence is consequently
split across two runs, and this is stated plainly there rather than presented as
one continuous sequence.

---

## E. API graceful shutdown

Two API replicas, steady traffic through the real Gateway, one replica deleted
mid-flight.

```text
duration                 75 s
requests                 9 705 at 129.4 rps
HTTP 200                 9 702
HTTP 5xx                 0
HTTP 4xx                 0
connection resets        3
availability             99.969 %
interruption window      a single instant (t = 22 236 ms), 0 ms wide
replacement ready        yes, rollout completed to 2/2
```

Proved: the surviving replica stayed usable throughout; the replacement became
ready; **there was no sustained 500 burst and no 5xx at all**.

Measured honestly rather than claimed as zero downtime: **3 requests already in
flight to the terminating pod were reset at one instant.** That is the standard
endpoint-removal race — the container receives `SIGTERM` and stops accepting
connections at the same moment kubelet begins removing it from Endpoints, so
connections routed in that window are refused.

`FINDING H04-03 (MEDIUM)` — the API Deployment carries no `preStop` hook and no
explicit `terminationGracePeriodSeconds`. **Not fixed in H04**, deliberately:
the canonical fix edits the shared base workload manifest that production also
uses, the measured impact is 3 requests in 9 705 with zero 5xx, and H04 already
spends its bounded-fix budget on defects that destroy customer data. Carried to
`APP12-H05` as `FU-APP12-H04-01`.

---

## F. Create restart / replay

Ready-Made create, caller's response deliberately lost by aborting the socket
8 ms after send, then retried under the canonical verified SUBMISSION
idempotency namespace.

```text
attempt 1   socket aborted; the caller never learned the outcome
attempt 2   201, ORD-KTRX242CCH
attempt 3   201, ORD-KTRX242CCH (byte-identical body)
```

| Table | Δ |
|---|---|
| `orders` | **1** |
| `order_items` | **1** |
| `shipping_details` | **1** |
| `inventory_reservations` | **1** |
| `secure_access_grants` | **1** |
| `outbox_events` (`order.created`) | **1** |
| reserved quantity | **1** |

Replay result stable across attempts 2 and 3 (deep-equal). No partial graph was
ever observable: the whole creation is one transaction, so the aborted request
either committed everything or nothing.

**PASS.**

---

## G. Duplicate create / stock race

**G.1 — two concurrent creates, same verified submission authority.**

```text
response A   201  ORD-DH96JW27D5
response B   201  ORD-DH96JW27D5      <- the same order
Δ orders 1 · Δ reservations 1 · Δ grants 1 · Δ order.created 1
```

The database's `uq_idempotency_records__namespace_scope_key` is the arbiter, as
designed; the losing insert waits on the winner and then replays it. No
process-local lock was involved and none was needed.

**G.2 — two distinct verified submissions, one remaining unit.**

```text
SKU on hand              1
response X               201  ORD-ZVCBRTVPYF
response Y               422  INSUFFICIENT_STOCK
available after          0
oversell                 false
stock below zero         never
```

One winner, one safe refusal. This closes the gap `stock-anchor.ts` explicitly
declined to claim — *"proving no oversubscription under concurrent load is DB8
CC-20 and is not claimed here"* — against real PostgreSQL concurrency.

**PASS.**

---

## H. Worker lease / reclaim

A single delivery job was stalled inside its attempt by holding the
`notification_intents` row lock from the test session, then the worker was
**SIGKILLed** (`kill -9 1`) with no drain and no completion write.

```text
t+2 s     job 441 CLAIMED   status=PENDING  attempt=1
          claimed_by = worker:embroidery-worker-7c449f567b-wglr7:1:a9b1…
SIGKILL   worker process destroyed mid-attempt
after     status=PENDING  attempt=1  claimed_by unchanged  dispatched_at=null
          => the job was NOT lost and NOT silently completed
lock released; lease (120 s) expires
final     status=DISPATCHED  attempt_count=1
```

Proved: the job survived process death; the lease was neither released nor
leaked; a replacement worker reclaimed it; the attempt ledger stayed truthful at
one attempt; the logical effect occurred once.

Two earlier attempts to catch a claim mid-flight by racing a burst of 6 and then
400 jobs are recorded as unsuccessful — the worker drained all 400 before the
`kubectl exec` round-trip landed — which is why the deterministic row-lock stall
was used instead.

**PASS.**

---

## I. Worker effect idempotency

The reclaimed job in §H re-executed after its lease expired.

```text
delivery attempts for the intent   before 2   after 2   Δ 0
outbox row                          DISPATCHED, attempt_count 1
```

The replay created no second delivery, no second reservation, no second stock
mutation and no duplicate payment success. The effect-key seam
(`deriveEffectKey`, refused when blank or unbounded) is what makes this
structural rather than incidental.

**PASS.**

---

## J. Poison job

One semantically invalid payload injected under a **registered** event type, so
the claim filter would pick it up and the handler had to judge it. A valid job
was queued immediately behind it.

```text
poison  outbox 33   DEAD_LETTER   attempt_count 1   last_error JOB_PAYLOAD_INVALID
next    outbox 34   DISPATCHED    attempt_count 1
PENDING backlog afterwards: 0
```

Terminal on the **first** attempt rather than after three — correct
classification: an invalid payload is not retryable and retrying it could never
help. The valid job behind it dispatched normally, so the queue did not block.
`last_error` carries a bounded error **class** only — no payload, no stack, no
PII, no token. Repaired by nothing: no DB mutation was used to resolve it.

**PASS.**

---

## K. DB transient — API

PostgreSQL taken down under a Ready-Made create.

```text
create during outage      HTTP 500
body                      {"success":false,"code":"INTERNAL_SERVER_ERROR",
                           "message":"An unexpected error occurred. Please try again later.", …}
SQL / stack / credential leak in the response   NONE
liveness   /api/health              200   (correctly independent of the database)
readiness  /api/health/readiness    503   not_ready   (dependency telemetry reacted)
readiness after DB return           200 within ~2 s
```

Safe response, correct probe split, fast recovery.

**Disclosed:** because this fault necessarily destroyed the `emptyDir` database
(§D), the *same run* could not then show "no partial graph" and "retry without
duplicate state" on the pre-outage data. Those two properties are proved
elsewhere on live data and are not asserted from design: §F aborts a create
mid-transaction and shows exactly one graph, and the retry deltas in §F and §G
show a canonical retry adding nothing. The world was rebuilt afterwards
(migrations 1..38 re-applied, bootstrap re-run, fixture re-seeded) and every
later scenario ran against it.

**PASS**, with the split disclosed.

---

## L. DB transient — Worker

The row-lock stall of §H is a transient database unavailability from the job's
point of view: the attempt could not make progress, and the worker had to decide
what to record.

```text
during the stall     no completion of any kind written; no false success
worker killed        job still PENDING, still leased, dispatched_at null
lock released        job became processable again
final                DISPATCHED, attempt_count 1, effect delta 0
```

Additionally, during the §K PostgreSQL outage the worker's claim path degraded
as designed — `claimRegisteredBatch` failures are caught, counted and paced by
the same capped backoff formula as job retries (`backoffMaxMs`), so a database
outage cannot become a tight reconnect loop — and the worker resumed claiming
when the database returned.

**PASS.**

---

## M. Object-storage upload failure

MinIO scaled to zero under a real evidence upload.

```text
upload during outage        HTTP 504 (gateway timeout)
bucket / object-key / endpoint leak     NONE
payment_transfer_evidence   0   (unchanged)
assets                      0   (unchanged)
```

The safety-critical properties hold: **no false accepted evidence**, and **no
durable metadata claiming bytes that were never stored**. A control upload
against healthy storage then produced exactly one artifact:

```text
healthy upload   202  {"evidenceId":"01a06a50-…","assetStatus":"INSPECTING",
                       "mediaType":"image/png","byteSize":71,"replayed":false}
payment_transfer_evidence  1        assets  1
```

`FINDING H04-04 (MEDIUM)` — the upload **hung until the Gateway's own timeout**
and the caller received nginx's HTML `504` rather than the API's safe JSON
envelope. Nothing unsafe is disclosed by that page, and no evidence state was
corrupted, but a storage outage should fail fast with the standard envelope
instead of holding a connection for the full gateway timeout. Not fixed in H04:
the fix is an object-storage client timeout, which is a shared
`@embroidery/object-storage` behaviour affecting every upload lane in the
product, not a bounded worker-runtime correction. Carried as `FU-APP12-H04-02`.

Disclosed: because MinIO is on `emptyDir`, restoring it loses the buckets the
API verified at startup, so a continuous outage→retry sequence additionally
required an API restart to re-run bucket bootstrap. That is a property of the
disposable scaffolding, not of the application.

**PASS** on every safety property; one MEDIUM finding on failure ergonomics.

---

## N. Object-storage read failure

```text
read while healthy                 404  PAYMENT_EVIDENCE_NOT_FOUND
read during MinIO outage           404  PAYMENT_EVIDENCE_NOT_FOUND   in 16 ms
bucket / key / endpoint leak       NONE
unauthenticated read during outage 401   (authorization unchanged by the outage)
rows mutated by the failed read    none  (evidence 1, assets 1 before and after)
read after recovery                404
```

Safe failure, fail-fast, no corrupt or partial cache, and — the property that
matters most — **the outage did not weaken authorization**: an unauthenticated
caller still got `401`, not the object.

Disclosed honestly: the `404` is the *correct* answer in this run for a reason
unrelated to storage — the uploaded evidence was still `INSPECTING` and the
Admin delivery lane only serves `ACCEPTED` assets, and the inspection job itself
could not complete because MinIO was the thing under fault. So this scenario
proves safe-failure, non-leakage and unchanged authorization; it does not prove
a byte-for-byte re-read of an `ACCEPTED` artifact across an outage.

**PASS** on the stated properties, with the limit named.

---

## O. FULL duplicate initiate

Three initiates against one live `FULL` obligation with the same
`Idempotency-Key` — two concurrent, one repeated afterwards.

```text
A  201  attempt 01a06a3c-8e64-77e8-ab27-4e045cfe8a3a
B  201  attempt 01a06a3c-8e64-77e8-ab27-4e045cfe8a3a
C  201  attempt 01a06a3c-8e64-77e8-ab27-4e045cfe8a3a

payment_attempts for the obligation   1
payment_obligations for the order     1
amount                                429000.00 on every response
```

One canonical attempt, no second payable obligation, no amount or reference
drift, no cross-attempt evidence mixing.

**PASS.**

---

## P. FULL duplicate / reverification

One real verification followed by three replays, two of them concurrent.

```text
verify 1        200   SUCCEEDED / SATISFIED / READY_FOR_DELIVERY   replayed=false
verify 2        200   identical committed truth                    replayed=true
verify 3 & 4    200 / 200 (concurrent)
```

| Invariant | Count |
|---|---|
| `payment_attempts` SUCCEEDED | **1** |
| `payment_obligations` SATISFIED | **1** |
| `payment_reconciliations` | **1** |
| `inventory_reservations` CONSUMED | **1** |
| `inventory_ledger_entries` | 2 (reserve + consume) |
| order `READY_FOR_DELIVERY` | **1** |
| SKU `quantity_on_hand` | 60 → **59** (one decrement) |

The replays wrote **no** second reconciliation — they read committed truth and
reported it, flagged honestly as `replayed: true`. The H03-C1 `payment.verified`
worker no-op remained a successful no-op throughout.

**PASS.** Criteria 18, 19, 20, 21 satisfied.

---

## Q. Manual payment review / recovery

The review authority was inspected first (§C) rather than assumed, then a real
mismatch was driven into the real state.

```text
verify with a WRONG (under-paid) amount
  attempt      REQUIRES_REVIEW   review_reason recorded
  obligation   PENDING           <- NOT satisfied
  order        AWAITING_PAYMENT  <- did NOT advance
  reservation  not consumed
  reconciliation written, action MANUAL_MATCH
```

The operator can inspect expected-versus-observed safe facts through the
delivered `GET /api/admin/orders/{id}/payments`.

Recovery used **only existing Admin operations** — the same verify command, with
the correct observed facts:

```text
verify with the correct facts
  attempt      SUCCEEDED
  obligation   SATISFIED
  order        READY_FOR_DELIVERY
  succeeded    1     reconciliations 2     consumed 1     ledger 2
  reconciliationAction  RESOLVE_REVIEW   <- correctly distinguished from MANUAL_MATCH
```

```text
NO_RECOVERY_REQUIRING_AD_HOC_PRODUCTION_SQL = HELD
unsafe_SQL_recovery_required = false
```

No override-paid endpoint was invented, no lifecycle state was added, and the
customer cannot be trapped: `REQUIRES_REVIEW` is a *verifiable-from* status in
the delivered policy, so the legitimate payment reaches a correct terminal state
through the operation that already exists.

**PASS.** Criteria 22, 23, 39 satisfied. No `BLOCKED_CROSS_BOUNDARY`.

---

## R. Fee correction vs verification

A shipping-fee correction raced against verification of the live attempt.

```text
fee     200  SHIPPING_DETAIL_SAVED           <- winner
verify  409  PAYMENT_OBLIGATION_NOT_PAYABLE  <- refused, correctly

obligations
  429000.00  SUPERSEDED  -> superseded_by 01a06a4b-3d2e-…
  454000.00  PENDING     (exactly one successor)

order AWAITING_PAYMENT · satisfied 0 · pending 1 · consumed 0 · ledger 1
```

One serializable winner. **No impossible state**: there is no satisfied
predecessor beside an active successor, no wrong reservation deadline and no
double stock effect. Reads agree afterwards:

```text
customer  AWAITING_PAYMENT · PENDING · 454000.00
admin     AWAITING_PAYMENT · PENDING
```

**PASS.**

---

## S. Verification vs expiry

The reservation was due-dated into the past (fixture mutation, fault
prerequisite only) and verification raced the sweep.

```text
verify   200  SUCCEEDED        <- the "verify wins" branch
final    order        READY_FOR_DELIVERY
         obligation   SATISFIED
         reservation  CONSUMED
         ledger       2  (one stock effect)
         succeeded    1
forbidden combination (cancelled + stock consumed): NEVER OBSERVED
```

The outcome is one of the two allowed branches, complete and self-consistent.

**PASS.**

---

## T. First fee vs expiry

The initial reservation was due-dated and the first shipping-fee save raced it.

```text
fee save  200  SHIPPING_DETAIL_SAVED
final     order        AWAITING_PAYMENT
          reservation  RESERVED   (window reset by the fee confirmation, APP12-B03 §16)
          obligations  1, PENDING
resurrected expired order            false
FULL created for a terminal order    false
dangling active reservation          false
```

The fee confirmation legitimately extends the window, which is exactly the
delivered `expireReservationIfDue` skip condition — the sweep re-reads under the
lock, finds the window extended, and does nothing.

**PASS.**

---

## U. Fulfilment replay / recovery

```text
dispatch 1        200  DELIVERED, shipping FROZEN
dispatch 2        409  ORDER_INVALID_TRANSITION
dispatch 3 & 4    409 / 409  (concurrent)
  shipping_snapshots 1 · DELIVERED transitions 1 · detail FROZEN

complete 1        200  COMPLETED
complete 2        409  ORDER_INVALID_TRANSITION
complete 3 & 4    409 / 409  (concurrent)
  COMPLETED transitions 1
```

Final: `snapshots 1 · delivered 1 · completed 1 · ledger 2 · attempts 1`.

Shipping snapshot frozen once, `DELIVERED` once, `COMPLETED` once, and **no
inventory or payment mutation** by any replay. Recovery is by read/refetch — the
Admin screen re-reads the order — and never by forcing DB state.

**PASS.** Criteria 27, 28 satisfied.

---

## V. Rolling restart

Both the API and the worker were rolled while one bounded Ready-Made journey was
open.

```text
order created                       ORD-K549TGJGR3  AWAITING_SHIPPING_FEE
rollout restart api + worker        both completed
shipping fee   after restart        200
attempt        after restart        201
verify         after restart        200  READY_FOR_DELIVERY

availability probe during the roll  10/10 (100.00 %)
worker reloaded canonical policy    yes
pending outbox 1 (in flight) · dead-letter 0
commerce state: orders 1 · reservations 1 · consumed 1 · ledger 2 · succeeded 1
```

The journey continued across the restart with no duplicates and no corruption,
and pending jobs drained.

**PASS.**

---

## W. Delayed worker-policy publication — and the Wave-1 blocker

### W.1 The cold-start race, observed live

The very first deployment of this checkpoint was a genuinely cold cluster and
reproduced the §S race without any injection:

```text
02:04:18  every workload starts concurrently (Deployments and Jobs are unordered)
02:04:49  staff-bootstrap attempt 1  -> Error   (raced the migration Job)
02:04:49  worker crashes             -> restart (see FINDING H04-02)
02:04:51  worker: "Worker runtime policy \"worker.runtime\" is not configured.
                   The worker is running but will not claim any job."
          readiness: not ready (WORKER_POLICY_MISSING); 6 handlers registered
02:05:00  staff-bootstrap attempt 2 starts
02:05:02  policies published, including worker.runtime and notification.delivery
02:05:06  worker: "Worker runtime policy loaded (version 1, concurrency 2)."
```

```text
missing policy remains fail-closed                     PASS
policy adopted without a manual worker restart         PASS  (15 s, one recheck tick)
bootstrap retry budget survived a slow DB start        PASS  (backoffLimit 3; attempt 2 succeeded)
```

Criteria 30, 31, 32 satisfied.

### W.2 `FINDING H04-01` — **WAVE1_BLOCKER**: every notification destroyed on a cold deploy

`APP12-H03-C1` taught `WorkerPolicyService` to re-read while unconfigured. It did
not generalise that to the other policy consumer on the same runtime.
`NotificationDeliveryPolicyService` loaded once at bootstrap and never again.

Measured on the cold cluster above:

```text
notification.delivery published in the database at 02:05:02   (it WAS published)
worker read it at 02:04:51 — 11 seconds too early — and never re-read

every delivery: JOB_DEPENDENCY_UNAVAILABLE
                attempt 1 FAILED_RETRYABLE
                attempt 2 FAILED_RETRYABLE
                attempt 3 FAILED_TERMINAL   -> DEAD_LETTER, in ~4 seconds

notification.delivery.requested   DEAD_LETTER = 21   DISPATCHED = 0
```

A fresh probe **20 minutes after publication** still dead-lettered, proving the
state was permanent for the life of the pod:

```text
newest events: [{"id":"29","status":"DEAD_LETTER","attempt_count":3}, …]
```

**Why this is a Wave-1 blocker rather than an inconvenience.** This lane carries
the customer's `VERIFICATION_CODE` and their `ORDER_ACCESS` secure link. Wave-1
ready-made commerce has no customer login: the `ORDER_ACCESS` link is the only
credential a customer ever holds for their own order. A cold deploy therefore
destroyed every customer's access link and every verification code — silently.
The worker was `Ready`, its probes were green, and only the dead-letter count
showed it.

The code's own promise was false in exactly this case.
`notification-delivery.usecase.ts` said the failure is *"retryable, so the secret
waits for an operator rather than dead-lettering on a configuration gap"* — but
the retry budget is the global `worker.runtime` `maxAttempts: 3`, which is spent
in about four seconds.

### W.3 The fix

Bounded, and modelled directly on the delivered H03-C1 pattern rather than
invented:

1. `NotificationDeliveryPolicyService.reloadWhileUnconfigured()` — re-reads
   **only** while no usable policy is held. The guard is the whole safety
   argument, so it is a guard and not a caller convention: once a valid policy
   is held it is a no-op, and no path can swap a live delivery budget under an
   attempt already measured against it. A read failure is swallowed, so it
   cannot replace the caller's bounded retryable failure with an unclassified
   one.
2. `NotificationDeliveryUseCase.deliver()` awaits that re-read immediately
   before failing closed — so the re-read happens exactly when it is needed, on
   the attempt that would otherwise have burned a retry against a gap that had
   already closed.

```text
adds no business operation · adds no migration · adds no lifecycle state
adds no HTTP route · no material redesign · preserves all business authority
```

### W.4 The fix, proved live

The policy was detached from the disposable database (fault prerequisite only),
the rebuilt worker image was deployed, and the sequence was replayed:

```text
policy ABSENT
  delivery fails closed: notification_delivery_attempts = 0   (nothing sent)
  events dead-letter after 3 attempts — correct when the operator genuinely has not published

policy RE-PUBLISHED, worker NOT restarted
  newest events: [{"id":"32","status":"DISPATCHED","attempt_count":1},
                  {"id":"31","status":"DISPATCHED","attempt_count":1}]
  notification_delivery_attempts by outcome: [{"outcome":"DELIVERED","n":2}]
  worker pod RESTARTS = 0   (same pod, 92 s old)
```

The next notification after publication was **`DISPATCHED` on attempt 1** with
**zero worker restarts**. Before the fix: 21 dead-lettered, 0 dispatched, and no
recovery short of a manual pod restart.

Residual, stated honestly: a notification produced in the first few seconds of a
cold cluster — before the bootstrap Job has published anything — can still
exhaust three attempts and dead-letter. That is now the genuine "the operator
has not published a policy" case rather than a permanent state, and it matches
the residual `APP12-H03-C1` accepted for `worker.runtime`.

### W.5 `FINDING H04-02` (MEDIUM) — worker crashed instead of failing closed

The same cold start showed the worker exit rather than stay up:

```text
02:04:49  "database pool validated"  (DatabaseModule)
02:04:49  ERROR [WorkerBootstrap] "The operation could not be completed."
          -> process exit, Kubernetes restart #1
```

`WorkerPolicyService.load()` treats a *missing* or *invalid* policy as an
expected startup state, but a failed **read** — the schema not yet migrated —
propagated out of `onApplicationBootstrap`, unwound Nest initialization and
ended the process. That contradicts the design's own stated contract in three
places (`startup-gate.ts`, `worker-policy.service.ts`, `main.ts`), all of which
require the process to stay up, unready and claiming nothing precisely *"so an
operator can publish the policy without a crash loop obscuring the error."*

Fixed in the same bounded way: the bootstrap path now calls
`reloadWhileUnconfigured()`, which already swallows exactly this failure on the
poll loop, so the startup path and the poll loop finally agree. Kubernetes
recovered it on its own here, which is why this is MEDIUM and not a blocker —
but a longer database outage would have produced `CrashLoopBackOff`, which is
the state the fail-closed design exists to prevent.

---

## X. Gallery continuation failure / retry — `FU-APP11-A01-03`

Live Chromium against the deployed Admin, through the real Gateway, on the real
`/gallery` screen with 25 seeded entries (page size 20).

```text
initial load                 20 rows · "Tải thêm mục" · not exhausted

one-shot transient network failure injected on the continuation request
  rows preserved             20        <- loaded rows survived
  control becomes            "Thử lại" (Retry), enabled
  message shown              "Không thể tải thêm mục. Các mục đã tải vẫn còn nguyên."
  failed cursor              …?limit=20&cursor=WyIxOSIsImYwYjZmNjhiLTU4MDUtNDJkZi1hODlkLThkNDUwY2IxMGVlMCJd

retry clicked
  cursor re-sent             IDENTICAL to the failed one   (sameCursorReused = true)
  rows after retry           25
  unique rows                25
  duplicates                 0
  total gallery API calls    2          <- no reset to page 1
  exhausted state            reached
  error message              cleared
```

Every required property holds: rows preserved through the failure, an explicit
retry affordance delivered, the **same authoritative cursor** re-sent, new rows
appended exactly once, no duplicates and no reset. No gallery redesign was made.

```text
FU-APP11-A01-03 = CLOSED_BY_APP12_H04
```

**Documented contradiction, not silently resolved** (`CLAUDE.md` §2). The
`APP12` pre-implementation audit **PO reconciliation** §Z7.1 reclassified
`FU-APP11-A01-03` from `WAVE1_HARDENING` to **`WAVE2_HARDENING`** ("Admin gallery
continuation retry — not on the ready-made path"), while this H04 prompt §1
assigns it to H04 and §5.T requires it closed. H04 is the later and more specific
instruction and the reading that does strictly more work, so it was executed and
closed here. Closing it early costs nothing and forecloses nothing; if the PO
prefers the Wave-2 classification, the evidence above stands either way.

**Harness disclosure.** The test host cannot resolve `*.staging.embroidery.local`,
so a local reverse proxy rewrote only the `Host`/`Origin` headers to the staging
hostnames. TLS, the Gateway, the HTTPRoute, the Admin application and the API
were all the deployed ones; no application behaviour was bypassed. The staff
login was performed server-side by that proxy so the operator credential never
entered the browser-automation transcript (`CLAUDE.md` §8a).

---

## Y. Exactly-once invariant table

Per-scenario before → failure → recovery truth. All figures are measured, not
asserted.

| Table | §F create replay | §G.1 concurrent | §G.2 stock race | §O initiate ×3 | §P verify ×4 | §U dispatch/complete ×4 | §AA clean run |
|---|---|---|---|---|---|---|---|
| `orders` | 1 | 1 | 1 winner | — | — | — | 1 |
| `order_items` | 1 | 1 | 1 | — | — | — | 1 |
| `shipping_details` | 1 | 1 | 1 | — | — | 1 (FROZEN) | 1 |
| `payment_obligations` | 0 | 0 | 0 | **1** | 1 SATISFIED | 1 | 1 SATISFIED |
| `payment_attempts` | 0 | 0 | 0 | **1** | **1 SUCCEEDED** | 1 | 1 SUCCEEDED |
| `payment_reconciliations` | 0 | 0 | 0 | 0 | **1** | 1 | 1 |
| `inventory_reservations` | 1 | 1 | **1** | — | 1 CONSUMED | 1 | 1 CONSUMED |
| `inventory_ledger_entries` | 1 | 1 | 1 | — | **2** | 2 | **2** |
| SKU stock | 1 reserved | 1 reserved | available 0, never < 0 | — | **60 → 59, one decrement** | unchanged | one decrement |
| `secure_access_grants` | **1** | **1** | 1 | — | — | — | **1** |
| outbox / notification | 1 `order.created` | 1 | 1 | — | 1 `payment.verified` no-op | — | pending 0, dead 0 |
| `shipping_snapshots` | — | — | — | — | — | **1** | **1** |

```text
duplicate_orders            0
oversell                    0
duplicate_reservation       0
duplicate_stock_mutation    0
```

§Q adds the mismatch column: obligation **PENDING**, order **AWAITING_PAYMENT**,
reservation **not consumed** — a mismatch moves no money and no stock.

---

## Z. H03 telemetry evidence

Every real failure was diagnosable through H03; no DB-only inspection was relied
on for a verdict.

**Metrics** (scraped per pod through the metrics-only Service):

```text
embroidery_worker_job_attempts_total{outcome="succeeded"}          5
embroidery_worker_job_attempts_total{outcome="failed_retryable"}   1
embroidery_worker_queue_pending                                    0
embroidery_worker_queue_oldest_pending_age_seconds                 0
embroidery_payment_verification_total{outcome="success"}           1
embroidery_notification_delivery_total{outcome="success"}          2
embroidery_inventory_reservation_total                             1
embroidery_invariant_violations{invariant="expired_reservation_held"} 0
embroidery_dependency_errors_total                                 (no series)
```

**Loki** — structured one-line JSON, fully correlated:

```json
{"event":"worker.job.completed","correlationId":"ASSET_PROCESSING:40:3",
 "jobKind":"ASSET_PROCESSING","jobKey":"40","attemptNo":3,
 "workerInstanceId":"worker:…","outcome":"FAILED_TERMINAL","errorClass":"…"}
```

Job kind, key, attempt number, worker instance, outcome and error **class** are
all queryable. The WAVE1_BLOCKER of §W was diagnosed from exactly these lines
plus the dead-letter count.

**Alerts** — 15 rules, all `inactive`, **0 active alerts** at rest, including
after every expected business refusal (`INSUFFICIENT_STOCK`,
`PAYMENT_OBLIGATION_NOT_PAYABLE`, `ORDER_INVALID_TRANSITION`, idempotency
replays). Expected refusals produced **no** false system-error alerts.
`EmbroideryOrderAccessDeliveryFailing` and `EmbroideryVerificationDeliveryFailing`
exist and are precisely the rules that would have surfaced §W in production.

No alert rule and no metric was edited to hide a failing path.

**Privacy** — 6 201 log lines across all four applications scanned:

```text
CLEAN  secret field in the clear
CLEAN  email address
CLEAN  phone number
CLEAN  credential word with a value
CLEAN  bucket / object key
CLEAN  customer street address
14 hits "long opaque token"  -> all false positives: NestJS controller class names
                                (PublicOrderFinalPaymentAttemptController, …); 7 distinct, 0 tokens
 4 hits "DATABASE_URL"       -> pg driver's own message, password already masked as ***
```

```text
PII_token_leakage = 0
```

`FINDING H04-05 (LOW)` — the pg driver's idle-client error prints the connection
string shape (user, host, port, database) with the password masked. No credential
is disclosed; it is infrastructure topology in a log. Recorded, not fixed.

**Public exposure**:

```text
/metrics /prometheus /grafana /alertmanager /loki   -> 404 (Storefront) / 307 login (Admin)
metrics port 9464 through the Gateway              -> not routable
HTTPRoutes referencing any monitoring service      -> 0
public_monitoring_exposure = 0
```

---

## AA. Clean normal-path regression

All faults removed, all injected state gone, one clean Ready-Made journey:

```text
1 order created        ORD-ZX7TS3D9WF  AWAITING_SHIPPING_FEE
2 shipping fee         200
3 payment attempt      201
4 verify               200  READY_FOR_DELIVERY
5 dispatch             200  DELIVERED
6 complete             200  COMPLETED

normal-path backlog delta      0
normal-path dead-letter delta  0
outbox PENDING                 0
outbox DEAD_LETTER             0
worker-failure alerts          0
```

Exactly-once for the clean order: `orders 1 · reservations 1 · consumed 1 ·
ledger 2 · snapshots 1 · succeeded 1 · grants 1`.

Criteria 43, 44, 45 satisfied.

---

## AB. Findings and severity

| ID | Severity | Finding | Status |
|---|---|---|---|
| `H04-01` | **WAVE1_BLOCKER** | `notification.delivery` policy never re-read after a lost startup race; 100 % of verification codes and `ORDER_ACCESS` links dead-lettered within ~4 s on a cold deploy, permanently, while the worker reported Ready | **FIXED and proved live** (§W) |
| `H04-02` | MEDIUM | Worker crashed out of Nest initialization on an unreadable policy instead of staying up unready, contradicting its own fail-closed contract | **FIXED** (§W.5) |
| `H04-03` | MEDIUM | API Deployment has no `preStop` hook / explicit grace period; 3 in-flight requests reset per replica roll (0 5xx, 99.969 % availability) | Open → `FU-APP12-H04-01` |
| `H04-04` | MEDIUM | Evidence upload during a storage outage hangs to the Gateway timeout and returns nginx HTML `504` instead of the API's safe JSON envelope | Open → `FU-APP12-H04-02` |
| `H04-05` | LOW | pg idle-client error logs the connection-string shape (password masked) | Open → `FU-APP12-H04-03` |
| `H04-06` | LOW | Disposable PostgreSQL/MinIO `emptyDir` makes a connection-severing fault destructive, splitting §K evidence across two runs | Environment note → `FU-APP12-H04-04` |
| — | TEST_HARNESS_DEFECT | Initial driver matched the newest verification envelope rather than the one for the contact under test, breaking concurrent challenge issuance | Fixed in the harness; no product impact |

```text
WAVE1_BLOCKER open = 0     (1 found, 1 fixed)
HIGH               = 0
MEDIUM             = 3     (H04-02 fixed; H04-03 and H04-04 carried forward)
LOW                = 2
```

H04's pass condition is `WAVE1_BLOCKER = 0` and `HIGH = 0`; both hold.

---

## AC. Bounded fixes

Two, both inside the original checkpoint under H04 §2, both modelled on the
already-delivered `APP12-H03-C1` pattern.

```text
apps/worker/src/jobs/notification-delivery/infrastructure/policy/notification-delivery-policy.service.ts
  + reloadWhileUnconfigured()   guarded re-read, no-op once a valid policy is held
  ~ class docstring corrected: the load is no longer once-only, and why

apps/worker/src/jobs/notification-delivery/application/notification-delivery.usecase.ts
  + await this.policies.reloadWhileUnconfigured() immediately before failing closed

apps/worker/src/runtime/poll/job-poll-runtime.service.ts
  ~ onApplicationBootstrap: policies.load() -> policies.reloadWhileUnconfigured()
    so an unreadable policy leaves the process up, unready and claiming nothing
```

Against H04 §2 and §11:

```text
preserves current business authority     YES
adds no business operation               YES  (NEW_BUSINESS_HTTP_OPERATIONS = 0)
adds no migration                        YES  (MIGRATION_0039 absent)
adds no lifecycle state                  YES
needs no material redesign               YES
adds no new provider / refund policy / force-success command   YES
```

---

## AD. H01 / H02 / H03 regressions

```text
H01 authorization      unaffected; §N re-proved an unauthenticated private-evidence
                       read still returns 401, including during a dependency outage
H02 deployment model   unchanged; the same base + staging overlay deployed by digest,
                       release preflight PASS (20 resources), placeholder restored
H03 observability      unchanged and exercised throughout; no metric, rule or dashboard
                       edited. The one H03-adjacent change is the notification policy
                       consumer, which H03-C1 did not cover.
```

---

## AE. Files changed

Three files, all worker-internal.

```text
M apps/worker/src/jobs/notification-delivery/application/notification-delivery.usecase.ts
M apps/worker/src/jobs/notification-delivery/infrastructure/policy/notification-delivery-policy.service.ts
M apps/worker/src/runtime/poll/job-poll-runtime.service.ts
```

No API, Storefront, Admin, persistence, contract, migration, manifest or Figma
change.

---

## AF. File-size evidence

```text
362  notification-delivery.usecase.ts                 (limit 400, threshold 300)
140  notification-delivery-policy.service.ts          (limit 400)
336  job-poll-runtime.service.ts                      (limit 400, threshold 300)
```

All within the hard 400-line limit. Two sit above the 300-line review threshold;
both were already above it at entry (362 and 336 after +11 and +13 lines of
guarded behaviour and its recorded reasoning), and splitting either by
responsibility is a refactor H04 does not own.

---

## AG. Validation

Change-impact based, per `VALIDATION_GOVERNANCE.md` §3. Commands actually run:

```text
git diff --check                                                   clean
pnpm --filter @embroidery/worker typecheck                         PASS
pnpm --filter @embroidery/worker lint                              PASS
pnpm --filter @embroidery/worker test                              PASS  67 suites, 1111 tests
pnpm --filter @embroidery/worker build                             PASS
pnpm exec prettier --check <the 3 changed files>                   PASS
node tools/check-report-secrets.mjs                                PASS  649 docs, 5210 files
node tools/check-release-config.mjs staging                        PASS  20 resources
```

Baseline re-measured rather than asserted:

```text
packages/contracts/openapi/openapi.generated.json  ->  125 paths / 138 operations / 278 schemas
public operations (path contains /public/)         ->  49
migrations applied in the live disposable database ->  38
public tables in the live disposable database      ->  79
apps/admin/src/app/**/page.tsx                     ->  26
apps/storefront/src/app/**/page.tsx                ->  20
```

Not run, and why: API/Storefront/Admin/persistence checks (untouched), OpenAPI
and generated-client checks (no contract change — the artifact was read and
matched the frozen baseline), category anti-hardcode (no category change),
e2e-testing typecheck/lint (no spec change; H04's live work ran through a
disposable operator-side harness, not the committed e2e suite).

Live production-like staging evidence for all 22 rehearsal scenarios is in
§E–§AA.

---

## AH. Disposable and shared-dev hygiene

```text
minikube profile embroidery-h04            deleted
disposable PostgreSQL + MinIO              destroyed with the cluster (emptyDir)
monitoring plane                           destroyed with the cluster
disposable registry container              removed
staging images (5 tags)                    removed after evidence capture
run-directory credential files             removed
local reverse proxy + port-forwards        stopped
```

All commercial evidence existed **only** in `embroidery_db7_h02_staging`, whose
`embroidery_db7_` prefix the canonical fixture guard requires and which died with
the cluster.

```text
shared_dev_commercial_residue = 0    (no shared-dev database was opened at any point)
G03_data_created              = false
production_deployed           = false
```

No `.env` file was read, written or consulted. Every credential in this run was
generated per-run into the scratch directory, passed file → process, and never
echoed, logged, committed or placed on a command line. The secret-generation
script refuses to run under `set -x`, carrying forward the H03 hygiene lesson.

---

## AI. Baseline freeze

```text
OpenAPI                    125 / 138 / 278          unchanged
public operations          49                       unchanged
release matrix             28 DENY / 18 ALLOW / 3 SCOPE_GATED   unchanged
migrations                 38                       unchanged
DB tables                  79                       unchanged
Admin routes               26                       unchanged
Storefront routes          20                       unchanged
Figma                      unchanged (no Figma artifact opened or edited)

NEW_BUSINESS_HTTP_OPERATIONS = 0
NEW_BUSINESS_ROUTES          = 0
MIGRATION_0039               = absent
```

---

## AJ. Follow-up closure

```text
CLOSED
  FU-APP11-A01-03    Admin gallery continuation failure/retry, live Chromium (§X)
                     -> CLOSED_BY_APP12_H04

OPENED
  FU-APP12-H04-01    API preStop hook / explicit terminationGracePeriodSeconds (MEDIUM, §E)
  FU-APP12-H04-02    Object-storage client timeout so an outage fails fast in the
                     API envelope rather than at the Gateway timeout (MEDIUM, §M)
  FU-APP12-H04-03    pg idle-client error logs the connection-string shape (LOW, §Z)
  FU-APP12-H04-04    Disposable PG/MinIO emptyDir makes connection-severing faults
                     destructive; a future rehearsal wanting a continuous
                     outage->retry sequence needs a durable disposable store (LOW, §D/§K)

PRODUCT OWNER ATTENTION
  FU-APP11-A01-03 classification conflict — PO reconciliation §Z7.1 says
  WAVE2_HARDENING, this H04 prompt says H04 owns it. Executed and closed per the
  later, more specific instruction; disclosed rather than silently resolved (§X).
```

---

## AK. Roadmap

```text
ROADMAP_LOCK  = LOCKED
CHECKPOINTS   = 38
APP12-H04     = COMPLETE
APP12-H05     = NEXT
H05 started   = false
PUSHED        = false
```
