# APP12-H03-C1 — Worker Runtime and Outbox Normal-Path Correction

Correction of `APP12-H03 — Observability and Alerting`.
Branch `feat/app11-s04-seo-infrastructure`, entry HEAD `7d84c83a`. Nothing committed, nothing pushed.

---

## A. Verdict

```text
APP12-H03-C1 = COMPLETE
APP12-H03    = COMPLETE_AFTER_C1
APP12-H04    = NEXT
CORRECTION_USED = 1 / 1   (no C2)
```

Three normal-path runtime defects, all closed, all re-proved on a cold
production-like Kubernetes deployment:

```text
A  worker runtime policy    published by the delivered bootstrap; cold worker ACTIVE
B  READY_MADE FULL          payment.verified is a successful no-op, not a dead-letter
C  order.created            claimed, acknowledged, completed; backlog returns to zero
```

None of the three needed a new mechanism. Each was the *absence* of a delivered
pattern being applied one more time.

---

## B. PO correction authority

```text
APP12-H03    = CORRECTION_REQUIRED
APP12-H03-C1 = AUTHORIZED
CORRECTION_USED = 1 / 1, NO H03-C2
APP12-H04    = NOT_AUTHORIZED (not started)
ROADMAP_LOCK = LOCKED, CHECKPOINTS = 38
```

No new checkpoint id was created. H04 was not started. Production was not
deployed. No G03 data was created. Nothing was pushed.

---

## C. Original H03 findings

`APP12-H03` shipped the observability plane and, in doing so, made three
pre-existing Wave-1 runtime defects visible for the first time. They were
recorded as follow-ups with no owner:

| Follow-up | What H03 observed | Disposition here |
|---|---|---|
| `FU-APP12-H03-01` | a freshly deployed worker is Ready, idle and claims nothing | **closed** — §D–§F |
| `FU-APP12-H03-02` | no single correlation field spans API → worker | **closed as accepted** — §S |
| `FU-APP12-H03-03` | `payment.verified` dead-letters in the APP8 handler for Ready-Made | **closed** — §G–§I |
| `FU-APP12-H03-04` | `order.created` has no consumer; the row stays `PENDING` forever | **closed** — §J–§L |
| `FU-APP12-H03-05` | `transition="release"` has no production emitter | **closed as not applicable** — §S |

The observability implementation itself is unchanged by this correction. No
metric family, label, alert rule, dashboard panel, collector pipeline or
threshold was edited — which matters, because §3 forbids hiding a defect behind
a filter and the cleanest way to check that is that none of those files appear in
the changed set (§T).

---

## D. Worker runtime-policy root cause

`APP2-I02` made the worker's ten claim/lease/timeout/retry values **versioned
business policy** rather than environment variables, for the reason
`worker-runtime-policy.ts` still states: they must be auditable, and the platform
already owned that mechanism (`policy_configurations` /
`policy_configuration_versions`, AGG-23). It shipped the consumer —
`WorkerPolicyService.load()` — and deliberately shipped **no production default**,
because a worker with no policy is a worker nobody configured.

It shipped no publisher either.

```text
who has ever written policy_configurations['worker.runtime']:
  apps/worker/src/**/tests/*-context.ts     Jest fixture contexts (5)
  apps/worker/test/process/*.spec.ts        one process fixture
  tools/smoke-app2-e01-*.mjs                the APP2-E01 disposable smoke tool
  ------------------------------------------------------------------
  a deployment artifact                     NONE
```

So the value existed in every *test* environment and in no *deployed* one. The
observable result in a cold cluster:

```text
pod          Running 1/1
probe        none — the worker has no HTTP endpoint (APP12-H02 §9 refused to invent one)
log          one line, once: WORKER_POLICY_MISSING
claims       zero, for the life of the pod
```

There is no failing probe, no restart loop and no error rate, because nothing is
failing. The only external symptom is that the outbox backlog never drains —
which is exactly the gauge `APP12-H03` added, and exactly why H03 was the first
checkpoint able to see this at all.

A second, independent half of the same defect: `load()` ran **once**, from
`onApplicationBootstrap`. The policy is published by the `staff-bootstrap` Job
and the worker is a Deployment; Kubernetes starts them concurrently and orders
neither. A single startup read therefore loses a coin toss it cannot win, and the
loser stayed idle until a human restarted the pod. The poll loop already had a
constant named `UNCONFIGURED_RECHECK_MS` and a comment describing an "am I
configured yet" check — and never re-checked anything.

---

## E. Canonical policy publication

The correction uses the **existing** authority, three times over.

```text
dataset    packages/database/seed/worker-runtime-policy.seed.json
reader     packages/database/src/seed/worker-runtime-policy-dataset.ts
publisher  apps/api/src/platform/policy/publish-worker-runtime-policy.use-case.ts
caller     apps/api/src/cli/staff-bootstrap.ts        (the delivered one-shot)
module     apps/api/src/platform/policy/policy.module.ts   (the delivered module)
```

That is the same shape `APP4-B01-C1` built and `APP6-B01` joined. It is the third
publisher on one module, not a third mechanism: no seed runner, no ordering, no
registry, no environment fallback and no default constant anywhere.

**Why the API side owns publication.**
`policy_configuration_versions.created_by_admin_id` is `NOT NULL`. The worker
holds no Admin identity; the `staff-bootstrap` CLI is the repository's only
admin-bearing path. `PublishApp4PolicyUseCase` recorded that reasoning when it
declined to route publication to the worker, and it applies unchanged here.

**Idempotent by comparison, not by `ensureKey`.** `ensureKey` makes the *key*
idempotent while `publishVersion` always appends, so a bootstrap that runs on
every release would otherwise accumulate an identical version per deploy. The
publisher compares the stored value and schema version against the dataset first
and writes only on drift — and corrects drift by **appending**, because
`policy_configuration_versions` is immutable by design (DB4) and a worker that
recorded version 1 must keep meaning it.

**Two packages, one validator.** The dataset is the value source; the *validator*
stays `parseWorkerRuntimePolicy` in the worker, which is the runtime that has to
survive the numbers. Neither package imports the other. The seam that keeps them
honest is a test, not a comment:

```text
apps/worker/src/runtime/policy/worker-runtime-policy.spec.ts
  "validates the values the deployment bootstrap actually publishes"
  → loadWorkerRuntimePolicyDataset(...) → parseWorkerRuntimePolicy(...).ok === true
```

If the shipped values ever violated one of the four relations, every deployed
worker would log `WORKER_POLICY_INVALID` and claim nothing; this is the only
place that can be found before production.

**Production stays an operator action.** `APP12-H02` decided that production
staff provisioning is not a side effect of a deploy, and that decision is not
reopened. The same one-shot is committed at
`infrastructure/kubernetes/operator/staff-bootstrap-job.yaml`, in **no**
kustomization, so a missing `embroidery-staff-bootstrap` Secret can never turn an
otherwise healthy release into an unschedulable pod. `README.md` and the secret
contract now both state, in the deployment authority itself, that a release which
skips it leaves a worker that is Ready and claims nothing. No production value is
invented and no production secret is created.

---

## F. Cold-deploy worker proof

A brand-new disposable cluster, a brand-new database, the committed manifests,
and no manual policy mutation of any kind.

```text
cluster    minikube (docker driver), Kubernetes v1.32.0
registry   disposable registry:2 on the cluster network; four images pinned by digest
preflight  node tools/check-release-config.mjs staging → PASS (20 resources)
apply      kubectl apply -k infrastructure/kubernetes/overlays/staging → 20 resources
```

`kubectl apply -k` started the migrate Job, the staff-bootstrap Job and the
worker Deployment **concurrently**. Both Jobs raced the disposable PostgreSQL's
own cold start and retried into it — visible, honest, and exactly the ordering a
release has:

```text
01:21:06  staff-bootstrap attempt 1  result=FAILED_BOOTSTRAP ... ECONNREFUSED
01:21:2x  staff-bootstrap attempt 2  result=FAILED_BOOTSTRAP ... ECONNREFUSED
01:21:43  migrate                    Completed  (attempt 3)
01:21:47  staff-bootstrap attempt 3  result=CREATED staff created admin=01a06a01-…
01:21:51  worker                     "Worker runtime policy loaded (version 1, concurrency 2)."
```

The policy in the database, read back through the exact call the worker makes:

```text
config_key    = worker.runtime
version       = 1
reason        = "APP2-I02 worker runtime policy (worker.runtime v1)"
policy keys   = design_approval.agreements, notification.delivery, quotation.deposit,
                quotation.validity, secure_grant, secure_link.resolve,
                verification.challenge, worker.runtime      (7 → 8)
```

Final worker state, on the shipped image:

```text
Worker runtime policy loaded (version 1, concurrency 2).
Private object-storage buckets verified (component=worker).
Worker runtime started (worker:embroidery-worker-579b79dcdd-5ggn9:1:…); 6 handler(s) registered.
Worker readiness: ready (ok).

WORKER_POLICY_MISSING occurrences in the whole worker log: 0
manual policy mutation after worker start:                 none
test control server / in-process worker used for the proof: none
```

Six handlers — the five delivered capabilities plus the `order.created`
acknowledgement of §K.

**Fail-closed is preserved.** `reloadWhileUnconfigured()` is guarded: once a valid
policy is held it returns immediately, so a running fleet's lease duration can
never change under jobs already leased against it — the APP2-I02 rule the
correction had to keep. A missing or invalid policy still means *claim nothing*
and *report unready*; `WORKER_POLICY_MISSING` was not turned into "run
everything", and an unregistered job or event type is still not implicitly
executable (§L). Both directions are asserted in
`apps/worker/src/runtime/policy/worker-policy.service.spec.ts`.

**Two cold-start defects were found in the disposable scaffolding, not in the
repository**, and are recorded here because they cost real time: the run
directory's regenerated Secret and the already-initialised disposable PostgreSQL
and MinIO disagreed on a password, producing `password authentication failed` and
`SignatureDoesNotMatch`. Both are properties of re-running a per-run credential
generator against surviving disposable state; neither is a deployment-model
defect, and both disappeared once the scaffolding pods were recreated alongside
their Secret.

---

## G. `payment.verified` root cause

`APP7-B04` wrote `obligationKind: 'DEPOSIT'` as a literal, so the worker's parser
read it as a literal. `APP9-B03` generalised the verification command to emit the
obligation's **real** kind, which made every verified remaining payment arrive as
`JOB_PAYLOAD_INVALID` and dead-letter — `FU-APP8-W01-01`, closed by `APP9-W01`
by widening the accepted set from one kind to two.

`APP12-B05` made `FULL` verifiable. The set was still two.

```text
producer   VERIFIABLE_OBLIGATION_KINDS = ['DEPOSIT', 'REMAINING', 'FULL']
consumer   VERIFIED_OBLIGATION_KINDS   = ['DEPOSIT', 'REMAINING']
result     every verified Ready-Made payment → JOB_PAYLOAD_INVALID → FAILED_TERMINAL
```

It is the same defect as `FU-APP8-W01-01`, one obligation kind later, and the
same shape of fix — with one difference that matters: the accepted set is now the
producer's set **exactly**, in the producer's order, which is the only shape that
cannot fall behind it again one kind at a time.

---

## H. Ready-Made successful-no-op compatibility

`FULL` joins `REMAINING` on the no-op branch of
`reservation-trigger.policy.ts`. Two files changed, both in the consumer's own
domain folder; the handler, the use case, the persistence and the runtime are
untouched.

**The decision is made from trusted domain truth.** `obligationKind` is read off
the obligation row the verifying transaction locked and written by
`PaymentDecisionRecorder`; it is not inferred from payload shape, amount,
transfer reference, a missing custom field or an id prefix. Nothing is loaded
from persistence to make it, because the event already carries the one fact the
decision needs.

**Why the answer is "nothing left to do", not "nothing yet".**

```text
verified-payment-settlement.ts        DEPOSIT   → NONE
                                      REMAINING → NONE
                                      FULL      → COMMIT_RESERVED_STOCK
```

`APP12-B05`'s verification transaction consumes the Ready-Made reservation and
decrements on-hand **before** it appends this event, and `ApplyVerifiedSettlement`
throws unless `commitReservedStock` returns `COMMITTED`. So by the time the
worker can claim the row the sale is complete: reserving here would hold units
already sold, and consuming here would decrement on-hand twice.

**The refusal path is unchanged.** The linkage check runs first, so a `FULL` row
whose aggregate contradicts its payload is still `JOB_INVARIANT_VIOLATION` and
terminal, and an unknown fourth kind is still `JOB_PAYLOAD_INVALID`. The `switch`
over the closed union is what forced this file to answer for the new kind — the
compiler refused the set change until it did.

Integration proof (real PostgreSQL, real registry, real claim, real guarded
completion), `ready-made-full-verification.integration.spec.ts`, 8 tests:

```text
order seeded exactly as a committed APP12-B05 leaves it:
  FULL obligation SATISFIED by a real SUCCEEDED attempt
  reservation CONSUMED, expiry cleared, CONSUMED ledger entry written
  on-hand already decremented, order READY_FOR_DELIVERY

two deliveries of the same event (at-least-once):
  outcomes              SUCCEEDED, SUCCEEDED       (was FAILED_TERMINAL, FAILED_TERMINAL)
  outbox rows           DISPATCHED, DISPATCHED     last_error null
  attempts              2 × SUCCEEDED, error_class null
  second reservation    0        (1 row, still CONSUMED, still the same id)
  second stock mutation 0        (on-hand unchanged)
  ledger RESERVED       0        ledger CONSUMED  1   (counted per kind, never a total)
  inventory.reserve idempotency record  0   — the handler returned before reserve()
  order / obligation    unchanged: READY_FOR_DELIVERY, SATISFIED by the same attempt
```

---

## I. CUSTOM regression

The legitimate APP8 path is unchanged and re-proved:

```text
inventory-reservation.integration.spec.ts   cases 1–10, 24 tests   PASS
  case 1–9   DEPOSIT reserves, aggregates, refuses, retries, dead-letters as before
  case 10    REMAINING is still a successful no-op
reservation-trigger.policy.spec.ts          4 tests               PASS
  "answers exactly one kind with true" → ['DEPOSIT']
order-conversion.integration.spec.ts        24 tests              PASS
```

`requiresInventoryReservation('DEPOSIT')` is asserted by name, and the closed-set
test proves exactly one kind reserves. A silent flip of the DEPOSIT branch — the
one change that would break custom commerce — fails three suites.

---

## J. `order.created` authority

```text
producers   DrizzleOrderRepository.createFromAcceptedQuotation   { orderId, code, customRequestId }
            DrizzleReadyMadeOrderRepository.create               { orderId, code, origin }
consumers   none — the claim filter is exactly registeredTypes()
result      the row is never claimed: not retried, not dead-lettered, not abandoned.
            PENDING forever, and permanently in the backlog gauge.
```

`DB3_SIDE_EFFECT_OUTBOX_CATALOG.md` SE-006 records the intent as ORD→NTF,
*"`order.created` + payment instructions"*. **That obligation is already
discharged, and not through this event.** `ADR-APP4-001` made every customer
notification a sealed envelope minted by the API and delivered through
`notification.delivery.requested`, precisely because the worker may not read a
grant, a contact or an order to compose one. Both creation flows request that
notification themselves inside the creating transaction — `APP12-B02` step 8
issues the `ORDER_ACCESS` grant with `notify: true`, and the custom path does the
same for its deposit link. The staging journey shows both events present and both
`DISPATCHED` (§P).

Building a second notification trigger out of `order.created` would therefore
send the customer a duplicate. This is **not** `BLOCKED_CROSS_BOUNDARY`: current
authority does not require a business consumer, it shows the business need
already met by a different, delivered seam.

---

## K. Known-no-op acknowledgement

```text
apps/worker/src/jobs/order-created-acknowledgement/
  order-created-acknowledgement.handler.ts    118 lines
  order-created-acknowledgement.module.ts      35
  domain/order-created.payload.ts              74
  domain/order-created.errors.ts               42
```

The seventh capability on the one runtime and the smallest there will ever be: it
imports no persistence module, no storage, no clock and no policy service —
`WorkerRuntimeModule` alone, for the registry.

```text
event type        order.created
job kind          OUTBOX_DISPATCH   — the transport kind, and here the honest one
payload read      orderId + code only; the divergent third field is not parsed
effect key        order-created-ack:v1:<orderId>
work performed    none: no read, no write, no transaction, no network call, no log line
outcome           one SUCCEEDED attempt; the outbox row completes through the
                  same guarded seam a real handler's success takes
```

**Why `OUTBOX_DISPATCH` and not `ORDER_CREATION`.** `ORDER_CREATION` belongs to
`APP7-W01`, which really does create orders from `design.approved`. Filing rows
that did nothing under it would put them in an operator's order-creation
dead-letter query. There is no domain work to name, which is precisely why the
transport kind fits — and it is already in `BACKGROUND_JOB_KINDS`, so the write-
time guard and the `job_type` metric vocabulary are both unchanged.

**Why it logs nothing.** The runtime already emits a structured
`worker.job.completed` record carrying the job kind, the job key and the
correlation id. A line here could add exactly one thing that record does not
carry — a **business identifier** — and that is how an order code reaches a log
aggregator. The first draft of this handler logged the order code; the staging
Loki marker scan caught it moving that count from 0 to 1, for no benefit, and the
line was removed before the final image (§Q).

**One terminal refusal.** A row whose aggregate linkage contradicts its payload is
`JOB_INVARIANT_VIOLATION` and dead-letters, because settling it would erase the
only evidence that a producer is broken. The permanently pending row was at least
that evidence; an acknowledgement that hid it would be worse than the defect.

---

## L. Unknown-event safety

The acknowledgement is **not** a catch-all, and the property is asserted rather
than argued. The claim filter is exactly `registeredTypes()`, so an unregistered
event type is never claimed at all.

`order-created-acknowledgement.integration.spec.ts` (real PostgreSQL, real
registry, real claim), 7 tests:

```text
registry           exactly one handler for order.created, jobKind OUTBOX_DISPATCH
known event        claimed → SUCCEEDED → DISPATCHED, attempt_count 1, last_error null
no claim loop      a settled row is not claimed again (runOnce → undefined)
attempt ledger     exactly one row: OUTBOX_DISPATCH / SUCCEEDED / error_class null
no business write  orders, inventory_reservations, inventory_ledger_entries,
                   payment_obligations and idempotency_records all unchanged;
                   the order stays AWAITING_SHIPPING_FEE
linkage mismatch   FAILED_TERMINAL, DEAD_LETTER, last_error JOB_INVARIANT_VIOLATION
unknown event      after draining every claimable row:
                     status PENDING, attempt_count 0, zero attempt rows
```

The last case seeds a genuinely unregistered type
(`app12.h03.c1.unregistered.event`) and then drains the queue, so "not claimed"
is measured against a worker that was demonstrably claiming.

---

## M. Backlog correctness

No metric was redefined and no row was excluded. The backlog is clean because the
rows are settled.

After two complete Ready-Made lifecycles on the deployed cluster:

```text
outbox_events by type and status
  notification.delivery.requested  DISPATCHED  2
  order.created                    DISPATCHED  2      ← was PENDING, forever
  payment.verified                 DISPATCHED  2      ← was DEAD_LETTER

outbox pending total        0
outbox dead-letter total    0
oldest pending age          0 s

background_job_attempts
  INVENTORY_RESERVATION  SUCCEEDED  2
  NOTIFICATION_DELIVERY  SUCCEEDED  2
  OUTBOX_DISPATCH        SUCCEEDED  2
  FAILED_TERMINAL        0
```

Gauges, straight from the deployed worker's scrape:

```text
embroidery_worker_queue_pending{service="worker"}                    0
embroidery_worker_queue_oldest_pending_age_seconds{service="worker"} 0
embroidery_invariant_violations{invariant="expired_reservation_held"} 0
```

---

## N. Metrics correctness

Exactly-once, per journey, re-proved after the correction (counters below are
the totals after **two** journeys):

```text
embroidery_order_create_total{origin=READY_MADE,outcome=success}                  2
embroidery_order_create_total{origin=READY_MADE,outcome=refused,
                              reason_class=VERIFIED_CONTACT_REQUIRED}             2
embroidery_payment_verification_total{payment_kind=FULL,outcome=success}          2
embroidery_payment_verification_total{payment_kind=FULL,outcome=refused,
                                      reason_class=REPLAYED}                      2
embroidery_inventory_reservation_total{transition=create,outcome=success}          2
embroidery_inventory_reservation_total{transition=consume,outcome=success}         2
embroidery_fulfilment_transition_total{transition=shipping_fee_set,…}              2
embroidery_fulfilment_transition_total{transition=dispatch,…}                      2
embroidery_fulfilment_transition_total{transition=complete,…}                      2
embroidery_notification_delivery_total{operation=order_access,outcome=success}     1  (per worker process)
embroidery_worker_job_attempts_total{job_type=…,outcome=succeeded}                 1  each (per worker process)
```

The four §22 properties still hold and now hold for a path that previously could
not complete at all: the verify **replay** is `refused/REPLAYED` and never a
second success; a refusal is `refused`, never `system_error`; the reservation
`create` and `consume` are one each per order; and no counter moved for a
transaction that rolled back.

Stock across the two sales: `60 → 59 → 58`. One decrement per sale, one `CONSUMED`
ledger row per sale, one reservation per order.

---

## O. Alert correctness

**Normal lifecycle fires nothing.** Immediately after a complete Ready-Made
journey on the deployed cluster:

```text
alert_rules = 15   firing = 0   pending = 0
```

`EmbroideryWorkerJobFailures`, `EmbroideryWorkerQueueBacklog` and
`EmbroideryOrderAccessDeliveryFailing` are all silent — not suppressed, not
re-scoped, and not edited: the rules file is byte-identical to H03's.

**A genuine bounded failure still fires, delivers and resolves.** One worker
outage, injected by scaling the Deployment to zero and restored by scaling it
back:

```text
T0  01:29:08   worker scaled to 0                       (the injected failure)
T1  01:29:27   EmbroideryWorkerTargetDown  pending      (absent(up{job=...}==1))
T2  01:34:44   EmbroideryWorkerTargetDown  firing       (after its 5m `for`)
T3  01:34:44   Alertmanager holds the alert
T4  01:35:0x   delivered to the recording receiver, severity=critical
               annotations carry summary, description, runbook RUNBOOK-H07-WORKER-DOWN
               and dashboard "Wave 1 Commerce Operations"
T5  01:35:25   worker scaled back to 1 (restoration, on the final image)
T6  01:35:28   "Worker runtime started …; 6 handler(s) registered." / readiness ok
T7  01:36:01   no longer firing
T8  01:40:0x   resolved notification delivered to the same receiver,
               status=resolved, endsAt=2026-09-04T01:35:42Z
               (one `group_interval: 5m` after the firing notification, as configured)
```

The delivered payload carries no order code, no customer fact and no token — the
labels are `alertname`, `domain`, `environment`, `service`, `severity` and
`threshold_authority`, all bounded vocabularies.

The five monitoring config gates were re-run unchanged (§V): 15 rules found, and
`promtool test rules` **SUCCESS** — including the cases that drive refusals far
above every failure threshold and assert silence.

---

## P. Live Ready-Made lifecycle

Two full journeys against the cold-deployed cluster, both driven over real HTTP
against the real API, through the real deployed worker. The second ran on the
final worker image.

```text
catalog.seeded            app12-s02-e2e-ao-thun
customer.seeded           SUBMISSION + STEP_UP challenges VERIFIED
order.create              201  ORD-95MAC6P8EE  AWAITING_SHIPPING_FEE  READY_MADE
order.refused             422  (an unknown challenge — a real refusal, no alert)
admin.login               204
fulfilment.shipping_fee   200
grant.rebound             the application's own ORDER_ACCESS grant, digest rebound
payment.read              200  AWAITING_PAYMENT / FULL PENDING
payment.attempt           201  PENDING, replayed=false
payment.verify            200  SUCCEEDED → order READY_FOR_DELIVERY
payment.verify.replay     200  replayed=true          (no second success)
fulfilment.dispatch       200  DELIVERED
fulfilment.complete       200  COMPLETED
```

Worker-side, for that journey:

```text
notification.delivery.requested   claimed by the deployed worker → SUCCEEDED → DISPATCHED
order.created                     claimed by the deployed worker → SUCCEEDED → DISPATCHED
payment.verified (FULL)           claimed by the deployed worker → SUCCEEDED → DISPATCHED
dead-letter for the journey       0
pending outbox after settle       0
reservation / stock               exactly once
```

Two credentials are seeded rather than driven, unchanged from H03 and for the
same structural reason: the delivered notification channel is process memory only
by design, so a verification code and an `ORDER_ACCESS` token delivered inside a
pod cannot be read from outside it. Everything else — the order, its line, its
shipping detail, its reservation, its idempotency record, its outbox rows, its
notification, its fee, its obligation, its attempt, its verification, its stock
consumption, its dispatch and its completion — is produced by the application.

**The core proof used the cold-deployed Kubernetes worker.** No separately booted
in-process worker was used for any normal-path assertion.

---

## Q. Security and redaction

```text
Loki marker scan (final image, journey 2)
  order code ORD-95MAC6P8EE   0     ← the first draft of the acknowledgement made this 1
  recipient name              0
  address line                0
  +849 (phone prefix)         0
  SECURE_LINK_TOKEN           0
  Authorization               0
  set-cookie                  0
  __Host-                     0
  Bearer                      0
  STEP_UP                     0
  token_hash                  0
  password                    2     ← embroidery-postgres (disposable scaffolding) logging
                                      "password authentication failed for user" during its
                                      own cold start. No value, not an application log.

Loki stream labels: app, container, environment, level, namespace, pod, stream  (7, bounded)
```

Monitoring-plane denial through the staging Gateway — 18 paths across both
customer hosts, re-run unchanged from H03:

```text
staging.embroidery.local        /metrics /internal/metrics /api/metrics
                                /prometheus/graph /alertmanager /grafana
                                /loki/api/v1/labels /api/v1/query /-/healthy   → 404 ×9
admin.staging.embroidery.local  the same nine                                 → 307 ×6 / 404 ×3
metrics_leak on every one of the 18                                           → 0
```

The 307s are the Admin shell's own unauthenticated redirect to `/login`; none
returns a metric. H01's redaction policy is untouched — no response header, no
log projection and no error shape was modified by this correction.

---

## R. H02 deployment regression

```text
node tools/check-release-config.mjs staging      PASS (20 resources) with digests pinned
node tools/check-release-config.mjs production   FAIL, by design — every externally
                                                 owned value is empty, exactly as H02
                                                 intends for an overlay straight from Git
kubectl kustomize overlays/production            15 resources   (unchanged)
kubectl kustomize overlays/staging               20 resources   (unchanged)
kubectl kustomize infrastructure/monitoring      25 resources   (unchanged)
CUSTOM_EMBROIDERY_RELEASE_ENABLED                false, logged at API boot in staging
worker                                           still non-public: no Service on 4000,
                                                 no HTTPRoute, metrics-only ClusterIP
metrics                                          still internal-only (§Q, 18/18 denied)
node tools/check-report-secrets.mjs              PASS (646 documents, 5135 tracked files)
```

The immutable-image model was honoured: digests pinned for the apply, the
committed `REPLACE_WITH_IMMUTABLE_RELEASE_REF` placeholder restored afterwards.

**Deployment delta.** One new file, in no kustomization:
`infrastructure/kubernetes/operator/staff-bootstrap-job.yaml`. Both rendered
overlays are unchanged in resource count and content.

---

## S. Follow-up closure

```text
FU-APP12-H03-01 = CLOSED_BY_APP12_H03_C1
  the deployed worker now receives the canonical Wave-1 policy from the delivered
  bootstrap and adopts a late publication without a restart (§D–§F).

FU-APP12-H03-03 = CLOSED_BY_APP12_H03_C1
  READY_MADE FULL payment.verified is a successful no-op; no dead-letter, no
  second reservation, no second stock or ledger mutation (§G–§I).

FU-APP12-H03-04 = CLOSED_BY_APP12_H03_C1
  order.created is claimed, acknowledged and completed; permanent pending = 0,
  and a genuinely unknown event type is still never silently acknowledged (§J–§L).

FU-APP12-H03-02 = CLOSED_ACCEPTED_CORRELATION_MODEL
  H03 already proved Gateway → API by requestId and API → outbox → worker by the
  outbox id and the job correlation key. A single field spanning both halves
  would require carrying a request id into `outbox_events`, which is a migration
  H03 does not require and C1 may not add. The two-hop model is accepted as the
  Wave-1 correlation model.

FU-APP12-H03-05 = CLOSED_NOT_APPLICABLE_CURRENT_WAVE1_RUNTIME
  mechanically confirmed: `transition="release"` has no emitter because no
  Wave-1 runtime path releases a reservation without consuming or expiring it.
  `grep -rn "transition: 'release'"` over production source returns nothing, and
  the two live transitions are `create` (checkout) and `consume` (verification),
  with `expire` owned by the sweep. A business release command was NOT created to
  populate a metric; the vocabulary entry stays, unused, for the sweep and the
  cancellation paths a later wave will add.
```

No follow-up is left with a vague or future owner. `BLOCKING_FOLLOW_UPS = 0`.

---

## T. Files changed

New — the policy dataset and its publisher:

```text
packages/database/seed/worker-runtime-policy.seed.json
packages/database/src/seed/worker-runtime-policy-dataset.ts
packages/database/src/seed/worker-runtime-policy-dataset.spec.ts
apps/api/src/platform/policy/publish-worker-runtime-policy.use-case.ts
apps/api/src/platform/policy/tests/publish-worker-runtime-policy.integration.spec.ts
```

New — the `order.created` acknowledgement:

```text
apps/worker/src/jobs/order-created-acknowledgement/order-created-acknowledgement.handler.ts
apps/worker/src/jobs/order-created-acknowledgement/order-created-acknowledgement.handler.spec.ts
apps/worker/src/jobs/order-created-acknowledgement/order-created-acknowledgement.module.ts
apps/worker/src/jobs/order-created-acknowledgement/domain/order-created.payload.ts
apps/worker/src/jobs/order-created-acknowledgement/domain/order-created.errors.ts
apps/worker/src/jobs/order-created-acknowledgement/tests/order-created-acknowledgement-context.ts
apps/worker/src/jobs/order-created-acknowledgement/tests/order-created-acknowledgement.integration.spec.ts
```

New — tests and deployment:

```text
apps/worker/src/runtime/policy/worker-policy.service.spec.ts
apps/worker/src/jobs/inventory-reservation/domain/reservation-trigger.policy.spec.ts
apps/worker/src/jobs/inventory-reservation/tests/ready-made-full-verification.integration.spec.ts
infrastructure/kubernetes/operator/staff-bootstrap-job.yaml
docs/implementation/reports/APP12-H03-C1-COMPLETION-REPORT.md
```

Modified:

```text
packages/database/src/index.ts                       export the third dataset reader
apps/api/src/platform/policy/policy.module.ts        register the third publisher
apps/api/src/cli/staff-bootstrap.ts                  call it, last of the four
apps/worker/src/runtime/policy/worker-policy.service.ts   reloadWhileUnconfigured + one line per problem
apps/worker/src/runtime/poll/job-poll-runtime.service.ts  the recheck now rechecks
apps/worker/src/runtime/poll/job-poll-runtime.service.spec.ts   the policy double gains the method
apps/worker/src/bootstrap/worker.module.ts           the sixth outbox capability
apps/worker/src/jobs/inventory-reservation/domain/payment-verified.payload.ts   FULL accepted
apps/worker/src/jobs/inventory-reservation/domain/payment-verified.payload.spec.ts
apps/worker/src/jobs/inventory-reservation/domain/reservation-trigger.policy.ts  FULL reserves nothing
apps/worker/src/jobs/inventory-reservation/inventory-reservation.handler.ts      doc only
apps/worker/src/jobs/order-conversion/tests/order-conversion-context.ts          claim narrowed
infrastructure/kubernetes/README.md                  the bootstrap is a release step
infrastructure/kubernetes/base/config/secret-contract.md
infrastructure/kubernetes/overlays/staging/staff-bootstrap-job.yaml   (comment only)
docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md            IMP-D065
docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md
```

**Not changed, deliberately:** every file under `infrastructure/monitoring/`,
every file under `packages/observability/`, every metric family, label,
alert rule, threshold, dashboard panel and collector pipeline. A correction that
had to edit one of those to make a defect disappear would be hiding it.

One test harness change deserves naming. `order-conversion-context.ts` now
narrows its claim to `design.approved`. Registering a consumer for
`order.created` — a row **that capability itself appends** on every successful
conversion — made an unfiltered claim hand that row to the next `runOnce()`, so
each assertion silently read the previous case's acknowledgement instead of its
own conversion. Four cases inverted. The filter still comes from the production
registry, and "a live worker asks for `design.approved`" is asserted directly
against `registeredTypes()` in the spec.

---

## U. File-size evidence

Limits: 400 lines source, 600 lines test. Largest new or touched files:

```text
316  ready-made-full-verification.integration.spec.ts        (test)
219  order-created-acknowledgement.integration.spec.ts       (test)
188  order-created-acknowledgement-context.ts                (test)
159  publish-worker-runtime-policy.integration.spec.ts       (test)
134  worker-policy.service.spec.ts                           (test)
132  order-created-acknowledgement.handler.spec.ts           (test)
118  order-created-acknowledgement.handler.ts                (source)
109  publish-worker-runtime-policy.use-case.ts               (source)
103  worker-runtime-policy-dataset.ts                        (source)
 74  order-created.payload.ts                                (source)
 42  order-created.errors.ts                                 (source)
 35  order-created-acknowledgement.module.ts                 (source)

touched files, after the change
541  inventory-reservation.integration.spec.ts               (test, unchanged)
370  job-execution.service.ts                                (source, unchanged)
324  job-poll-runtime.service.ts                             (source, +9)
259  order-conversion-context.ts                             (test, +13)
141  worker-policy.service.ts                                (source, +47)
```

Every file is inside both the hard limit and the review threshold.

---

## V. Validation

Every command below was run in this session. None is a repository-wide aggregate.

```text
git diff --check                                              clean
prettier --check (changed files)                              PASS

pnpm --filter @embroidery/worker typecheck                    PASS
pnpm --filter @embroidery/worker lint                          PASS
pnpm --filter @embroidery/worker test                          67 suites / 1111 tests PASS
pnpm --filter @embroidery/database typecheck                   PASS
pnpm --filter @embroidery/database lint                        PASS
pnpm --filter @embroidery/database test                        18 pass / 9 fail — identical to HEAD (§AE)
pnpm --filter @embroidery/api lint                             PASS
pnpm --filter @embroidery/api typecheck                        PASS
pnpm --filter @embroidery/api test -- platform/policy|cli       5 suites / 42 tests PASS
pnpm --filter @embroidery/api test -- modules/payment|order     64 pass / 4 fail — fewer than HEAD (§AE)
pnpm --filter @embroidery/observability test                    4 suites / 108 tests PASS

pnpm --filter @embroidery/api openapi:check                     up to date (125/138/278)
node tools/check-category-source-of-truth.mjs                   PASS (2578 files)
node tools/check-report-secrets.mjs                             PASS (646 documents, 5135 tracked files)
node tools/check-release-config.mjs staging                     PASS (20 resources, digests pinned)
node tools/check-release-config.mjs production                  refuses, by design

CMD-PROMTOOL-CHECK-CONFIG                                       SUCCESS
CMD-PROMTOOL-CHECK-RULES                                        SUCCESS — 15 rules
CMD-PROMTOOL-TEST-RULES                                         SUCCESS
CMD-AMTOOL-CHECK-CONFIG                                         3 receivers, 0 templates
CMD-LOKI-VERIFY-CONFIG                                          PASS
CMD-ALLOY-FMT                                                   exit 0
CMD-KUSTOMIZE-MONITORING                                        25 resources
kubectl kustomize overlays/staging                              20 resources
kubectl kustomize overlays/production                           15 resources

cold disposable staging deploy                                  §F
normal Ready-Made lifecycle × 2                                 §P
clean backlog proof                                             §M
bounded genuine failure: fire → deliver → resolve               §O
disposable teardown and shared-dev hygiene                      §W
```

`SCOPED_COMMAND_INDEX.md` needs no new row: this correction introduces no new
tool or checkpoint command, and every gate above is an existing indexed entry or
a package-owned script.

H04, H05, H06, V01 and V02 were not executed.

---

## W. Disposable and shared-dev hygiene

```text
disposable_db_removed          true   (the staging namespace and its PostgreSQL are gone)
disposable_minio_removed       true
monitoring_staging_removed     true
disposable_registry_removed    true
disposable_cluster_removed     true   (minikube profile deleted)
disposable images removed      true
run-directory credential files removed  true
shared_dev_commercial_residue  0
G03_data_created               false
production_deployed            false
```

Every credential in this run was generated per run by
`create-staging-secrets.sh`, lived only inside the disposable cluster and the run
directory, and went with them. Nothing was written to `.env`, no secret-bearing
variable was read out, and no credential was rotated to make anything pass. The
script's "NEVER run under `set -x`" prohibition — added by H03 after the incident
disclosed in that report — was honoured.

The shared development database and object store were not used for any part of
this correction. The commercial evidence lives entirely in the disposable
staging database, which no longer exists. Measured on the developer stack after
teardown:

```text
embroidery   ready_made_orders=0   worker_runtime_policy=0   pending_order_created=0
```

One orphan disposable database, `embroidery_db10_restore_b_24308`, survives on
the developer PostgreSQL. It is **not** this correction's: the name is a DB10
durability-test fixture and its 20 pending `order.created` rows are benchmark
data. It is reported rather than dropped — deleting a database this checkpoint
did not create is a destructive act outside its scope, and the operator should
decide.

---

## X. Baseline freeze

```text
OpenAPI                 125 paths / 138 operations / 278 schemas   unchanged
public operations       49                                          unchanged
release matrix          28 DENY / 18 ALLOW / 3 SCOPE_GATED          unchanged
migrations              38                                          unchanged
DB schema delta         0
DB tables               79                                          unchanged
Admin routes            26                                          unchanged
Storefront routes       20                                          unchanged
Figma                   unchanged — no design artifact was opened or edited

NEW_BUSINESS_HTTP_OPERATIONS = 0
NEW_BUSINESS_ROUTES          = 0
NEW_LIFECYCLE_STATES         = 0
NEW_RECOVERY_COMMANDS        = 0
MIGRATION_0039               = not created
```

---

## Y. Parent report correction notice

`docs/implementation/reports/APP12-H03-COMPLETION-REPORT.md` carries a correction
notice at its head. Its original observability evidence is preserved verbatim —
the 23 metric families, the 31-panel dashboard, the 15 rules, the rule tests, the
live fire/deliver/resolve journey, the cardinality proofs, the denial matrix and
the Loki scan are all still the record of what H03 delivered. Only the follow-up
table is annotated, and only to point at this document.

---

## Z. Roadmap

```text
ROADMAP_LOCK  = LOCKED
CHECKPOINTS   = 38
22    APP12-H03      Observability and alerting (build)                  COMPLETE_AFTER_C1
22·C1 APP12-H03-C1   Worker runtime, Ready-Made event, outbox normal path  COMPLETE
23    APP12-H04      Resilience and failure rehearsal (Wave 1)             NEXT
CORRECTION_USED = 1 / 1   (no C2)
PUSHED = false
```

---

## AE. Regression comparison against HEAD

Neither the API nor the `@embroidery/database` suite is green at `7d84c83a`. Both
were therefore measured twice — in this tree, and in a `git worktree` at the
entry HEAD with the same packages built — rather than quoted as a raw number.

```text
@embroidery/worker
  HEAD  60 suites,  1056 tests,  0 failures
  C1    67 suites,  1111 tests,  0 failures      +7 suites, +55 tests

@embroidery/database
  HEAD  26 suites (9 failed),  456 tests (22 failed)
  C1    27 suites (9 failed),  467 tests (22 failed)   identical failures, +11 passing
  the 9 are historical migration-count baselines ("the full 34-migration chain",
  "78 tables") against a repository at 38 migrations. Pre-existing, untouched.

@embroidery/api  (modules/payment | modules/order)
  HEAD  65 suites (6 failed),  1093 tests (27 failed)
  C1    68 suites (4 failed),  1119 tests (27 failed)   same failing tests, fewer
                                                        failing suites, +26 passing
```

C1 fails strictly no test that HEAD passes, in any workspace.

---

## AF. What only a live cluster could have caught

Three things in this correction were invisible to every test in the repository
and were found by running the deployed system:

1. **The bootstrap Job races the database it needs.** `backoffLimit: 3` was
   *exactly* enough: two attempts died on `ECONNREFUSED` against a disposable
   PostgreSQL that was still starting, and the third succeeded. A slower database
   would have exhausted the budget, left `worker.runtime` unpublished, and
   reproduced the very defect this correction closes. Recorded, not fixed — the
   retry budget is H02's and a deploy-ordering change is not this correction's to
   make.

2. **The acknowledgement's log line put an order code into Loki.** It looked
   harmless in review — an operator-facing identifier, not a secret. The staging
   marker scan moved from 12 markers / 0 hits to 12 markers / 1 hit, and the line
   was removed. A log statement is a data-flow decision; only a log aggregator
   shows you that.

3. **A registered handler changed what an unrelated suite claimed.** Adding a
   consumer for `order.created` inverted four assertions in the order-conversion
   integration suite, because that capability appends the row it now had to
   compete for. No unit test could see it; the integration suite failed loudly and
   correctly.
