# RB-15 — Alert response

One section per `runbook` id carried by the Wave-1 alert rules. An alert
notification names its id; this is where that id resolves to.

Source of truth for the rules themselves:
`infrastructure/monitoring/prometheus/rules/wave1-commerce.rules.yml`.

## How to read any alert here

Every rule obeys one principle: **an alert fires on `outcome="system_error"` and
never on `outcome="refused"`.** A customer ordering more units than exist, an
operator verifying a payment twice, a stale attempt — all of that is the
business working correctly, and a system that pages someone for it trains its
operators to ignore it.

Every threshold is an **absolute count over a window**, not a percentage. This
shop does fewer than a hundred orders a month; a percentage-based SLO on that
volume is arithmetic noise. Every rule carries a `threshold_authority` label,
and only two values are not provisional:

| `threshold_authority` | Meaning |
| --- | --- |
| `INITIAL_OPERATIONAL_THRESHOLD` | A starting guess, to be revised once R01 has real traffic. Not derived from any SLO, because none exists |
| `DOMAIN_DEADLINE` | The reservation's own `expires_at` — a delivered business rule (BR-025/BR-026) |
| `RETRY_BUDGET` | The delivered retry schedule; a terminal failure is by definition not transient |
| `CARDINALITY_CONTRACT` | The declared metric label contract |

First move for **every** alert, before anything else: open Grafana, dashboard
*Wave 1 Commerce Operations*, and look at the row named in the alert's
`dashboard` annotation. [RB-11](RB-11-LOGS-AND-METRICS.md) has the access
commands.

---

## 1. RUNBOOK-H07-API-DOWN

**Alerts:** `EmbroideryApiTargetDown` (`up{job="embroidery-api"} == 0` for 2m,
`critical`) · `EmbroideryAllApiTargetsDown`
(`absent(up{job="embroidery-api"} == 1)` for 1m, `critical`).

The second one means the shop is closed. It is deliberately separate and
deliberately shorter: with `maxUnavailable: 0` there is no legitimate moment when
every replica is gone at once. The 2-minute `for` on the first exists so a
rolling update cannot fire it.

**Triage**

```sh
kubectl -n embroidery-production get pods -l app.kubernetes.io/component=api -o wide
kubectl -n embroidery-production get endpoints embroidery-api
kubectl -n embroidery-production describe pod <api pod> | tail -40
kubectl -n embroidery-production logs deploy/embroidery-api --tail=200
curl -sS -o /dev/null -w '%{http_code}\n' https://<admin-host>/api/health/readiness
```

**Diagnose**

| Observation | Cause | Go to |
| --- | --- | --- |
| Pod `ImagePullBackOff` | Bad image reference | [RB-03](RB-03-ROLLBACK.md) |
| Pod `CreateContainerConfigError` | A missing Secret or key. Fail-closed working | [RB-05](RB-05-SECRET-ROTATION.md) |
| Pod `CrashLoopBackOff` | Read the first 40 log lines — a startup guard named a variable | [RB-10](RB-10-HEALTH-DIAGNOSTICS.md) |
| Pod Running, readiness 503 | The database check is failing, or the pod is terminating | [RB-10](RB-10-HEALTH-DIAGNOSTICS.md) layer 5 |
| Pods healthy, Service selects none | A selector or Service problem | [RB-10](RB-10-HEALTH-DIAGNOSTICS.md) layer 1 |
| A release just happened | Roll back first, diagnose after | [RB-03](RB-03-ROLLBACK.md) |

**Escalate** when both the current and the previous revision fail to become
ready. That is not the image.

**Resolved when** `up{job="embroidery-api"} == 1` for both replicas and
readiness answers 200.

---

## 2. RUNBOOK-H07-WORKER-DOWN

**Alert:** `EmbroideryWorkerTargetDown`
(`absent(up{job="embroidery-worker"} == 1)` for 5m, `critical`).

The worker has no HTTP health contract by design, so its **metrics endpoint is
the only positive signal** that the process is alive and able to work. The
5-minute window exists because the worker's `Recreate` strategy means a
deployment legitimately has a gap.

While it is down: nothing delivers notifications, converts orders or expires
reservations. A customer who orders now will not receive their access link.

**Triage**

```sh
kubectl -n embroidery-production get pods -l app.kubernetes.io/component=worker
kubectl -n embroidery-production logs deploy/embroidery-worker --tail=200
kubectl -n embroidery-production describe pod <worker pod> | tail -40
```

**Diagnose**

| Observation | Cause |
| --- | --- |
| A deploy is in progress | Expected gap. Wait for the rollout |
| Restart count climbing | A fatal handler is exiting non-zero — the logs name it |
| `CreateContainerConfigError` | Missing Secret — [RB-05](RB-05-SECRET-ROTATION.md) |
| Running, `up == 0`, **and no `Worker metrics listening…` line in the log** | The half-started worker. See below — this is the common one |

### The half-started worker

**Symptom.** The pod is `Running 1/1` with `0` restarts and no failing probe.
`up == 0`, the metrics port refuses connections, and the log ends without either
of the two lines a healthy boot always prints:

```text
Worker metrics listening on internal port 9464     <- absent
Worker readiness: … (…).                           <- absent
```

Instead the log ends with a single opaque error from `WorkerBootstrap`, most
often the generic persistence message `The operation could not be completed.`

**What happened.** The worker's `bootstrap()` threw — typically a transient
persistence failure while the database was still settling on a first, cold
start. The top-level handler logs the message and sets a non-zero exit code, but
the process **does not exit**: the job poll runtime, the intake-cleanup timer
and the reservation-expiry timer are already running and hold the event loop
open. So the worker never finishes starting, never binds its metrics listener,
and is never restarted by the kubelet — because there is no probe to fail.

This was observed on the first cold boot of the `APP12-H07` disposable staging
cluster, immediately after the migration Job completed, and did not recur on the
next start.

**Why it matters more than it looks.** The two gauges
[RB-08](RB-08-STUCK-JOB-AND-OUTBOX.md) tells you to diagnose a non-claiming
worker with are served by the listener that never bound. In this state the
worker's telemetry is **unavailable, not zero** — the same trap as
[section 10](#10-runbook-h07-telemetry). Read the outbox rows directly.

**Recovery.**

```sh
kubectl -n embroidery-production rollout restart deploy/embroidery-worker
kubectl -n embroidery-production rollout status  deploy/embroidery-worker --timeout=180s
kubectl -n embroidery-production logs deploy/embroidery-worker --tail=40 \
  | grep -E 'Worker metrics listening|Worker readiness'
```

Both lines must appear. Nothing is lost by the restart: unclaimed rows are
untouched and leases expire on their own.

**Escalate** if it recurs on a warm cluster. A transient fault on a cold start
is one thing; a repeatable one means the bootstrap fails for a reason that will
not clear, and a worker that neither works nor exits is an availability defect,
not an operational condition. Filed as `FU-APP12-H07-03`.

**Never** scale the worker above one replica to "get through" a backlog. One
claiming process, no broker: two pods are a double claim.

**Then** check the backlog drained: [RB-08](RB-08-STUCK-JOB-AND-OUTBOX.md).

---

## 3. RUNBOOK-H07-API-5XX

**Alert:** `EmbroideryApiServerErrorBurst` — more than five
`status_class="5xx"` responses in ten minutes, sustained for five, `critical`.

5xx only. A 4xx is a client sending something the API refuses, which is the same
class of event as a business refusal and must not page.

**Triage** — find the route first, then the records.

Dashboard row *Is the shop up?*, panel *Request rate by route template*, split by
status class. Or:

```promql
sum by (route_template) (increase(embroidery_http_requests_total{status_class="5xx"}[15m]))
```

```logql
{namespace=~"embroidery.*", app="api", level="error"} | json | event = "platform.error"
```

**Diagnose by route**

| Route family | Go to |
| --- | --- |
| `/api/public/ready-made-orders` | section 4 |
| `/api/admin/payment-attempts/:attemptId/verify` | section 5 |
| dispatch / completion / shipping-detail | section 6 |
| asset or evidence routes, ~20s latency | [RB-09](RB-09-STORAGE-INCIDENT.md) |
| everything at once | a dependency — [RB-10](RB-10-HEALTH-DIAGNOSTICS.md) |

Check `embroidery_dependency_errors_total` early: it is counted at the API's
single exception-filter boundary and recognises the failure by error **type**
(`PersistenceError`, `ObjectStorageError`), never by a message heuristic.

---

## 4. RUNBOOK-H07-ORDER-CREATE

**Alert:** `EmbroideryOrderCreateSystemErrors` — more than one
`outcome="system_error"` in fifteen minutes, sustained for five, `critical`.

Two in fifteen minutes. At this volume a single one may be genuinely a one-off;
two is a pattern, and a customer who cannot place an order is revenue lost
silently — nobody complains, they leave.

**This alert never fires on "out of stock".** Insufficient stock is a published
refusal and is counted as `refused`.

**Triage**

Dashboard row *Are orders being created?* — panel *Order creation by outcome*
for the `origin`, table *Why checkouts are being refused* to confirm the
refusals are ordinary.

```promql
sum by (origin, reason_class) (increase(embroidery_order_create_total{outcome="system_error"}[15m]))
```

```logql
{namespace=~"embroidery.*", app="api"}
  | json | event = "http.request.completed"
  | http_route = "/api/public/ready-made-orders"
  | http_statusCode >= 500
```

**Diagnose:** almost always the database or a defect. Order creation reserves
stock under an anchor lock inside one transaction, so a persistence fault
surfaces here first. Check `embroidery_dependency_errors_total{dependency="database"}`,
then [RB-10](RB-10-HEALTH-DIAGNOSTICS.md) layer 5.

**Escalate** if the errors correlate with a release. [RB-03](RB-03-ROLLBACK.md).

---

## 5. RUNBOOK-H07-PAYMENT-VERIFY

**Alert:** `EmbroideryFullVerificationSystemErrors` — more than one
`outcome="system_error"` in fifteen minutes, sustained for five, `critical`.

**Read this before telling any customer their payment failed.** Money state may
be un-advanceable, which is not the same as a payment having failed.

A `REQUIRES_REVIEW` routing and a lost-response replay are both recorded as
`refused` and **do not reach this alert**. If this fired, an operator's
verification threw.

**Triage**

Dashboard row *Are payment verifications throwing system errors?*

```promql
sum by (payment_kind, reason_class) (increase(embroidery_payment_verification_total{outcome="system_error"}[15m]))
```

```logql
{namespace=~"embroidery.*", app="api", level="error"} | json | event = "platform.error"
```

**Act**

1. Identify the affected orders and establish the **committed** truth for each,
   with the five-invariant query in
   [RB-06](RB-06-PAYMENT-RECONCILIATION.md#expected-state). Do this before
   anything else.
2. If the fault was transient, re-run the verification normally
   ([RB-06](RB-06-PAYMENT-RECONCILIATION.md)). The replay path protects you: a
   retry of a call whose response was lost returns the committed truth with
   `replayed: true` and writes nothing a second time.
3. If verification throws consistently, **stop verifying**. Every attempt is a
   chance to leave money state ambiguous. Escalate.

**Never** repair a payment, an obligation, a reservation or an order in SQL.

---

## 6. RUNBOOK-H07-FULFILMENT

**Alert:** `EmbroideryFulfilmentSystemErrors` — more than one
`outcome="system_error"` in fifteen minutes, sustained for five, `warning`.

`warning` rather than `critical` deliberately: an operator is present, sees the
failure in the Admin UI, and the customer's order is not lost. A repeated failure
does block the order from shipping.

Covers setting a shipping fee, dispatching, and completing.

**Triage**

Dashboard row *Are dispatch and completion transitions failing?*

```promql
sum by (transition, reason_class) (increase(embroidery_fulfilment_transition_total{outcome="system_error"}[15m]))
```

**Diagnose**

| `transition` | Then |
| --- | --- |
| shipping fee | The order stays `AWAITING_SHIPPING_FEE` and the reservation window keeps running — [RB-07](RB-07-STUCK-ORDER.md) |
| dispatch / completion | Payment is already settled, so nothing is at risk; re-read the order and retry once |

A `409 ORDER_INVALID_TRANSITION` is **not** in this alert. It is the replay
guard, counted as `refused`, and it means the work is already done.

---

## 7. RUNBOOK-H07-RESERVATION-SWEEP

**Alerts:** `EmbroideryReservationSweepFailing` (more than two
`outcome="system_error"` in fifteen minutes, `warning`) ·
`EmbroideryExpiredReservationsHeld`
(`max(embroidery_invariant_violations{invariant="expired_reservation_held"}) > 0`
for 15m, `warning`, `threshold_authority: DOMAIN_DEADLINE`).

The second uses the reservation's **own `expires_at`** — a delivered business
rule, not an invented SLA — and is duration-qualified because a small non-zero
reading between passes is normal.

**Consequence:** stock is held for orders that are no longer entitled to it, so a
purchasable SKU can read as out of stock. Customers who *could* buy, cannot.

**Triage**

Dashboard row *Are reservations processing correctly?* — *Expiry sweep* for
passes and releases, *Expired reservations still held* for the effect.

```promql
sum by (outcome) (increase(embroidery_reservation_sweep_total[15m]))
increase(embroidery_reservation_sweep_examined_total[15m])
max(embroidery_invariant_violations{invariant="expired_reservation_held"})
```

```logql
{namespace=~"embroidery.*", app="worker"} | json | jobKind = "INVENTORY_RESERVATION"
```

**Diagnose**

| Observation | Cause |
| --- | --- |
| Sweep passes are zero | The worker is not running or not claiming — sections 2 and 8, then [RB-04](RB-04-STAFF-BOOTSTRAP.md) |
| Passes running, `system_error` climbing | A database fault — [RB-10](RB-10-HEALTH-DIAGNOSTICS.md) layer 5 |
| Passes succeeding, gauge non-zero and rising | A genuine defect. Escalate |
| The collector is failing | The gauge is **stale, not zero** — section 10 |

**Never** release a reservation by hand. There is no `release` operation in the
Wave-1 runtime — the series
`embroidery_inventory_reservation_total{transition="release"}` has no production
emitter at all — and a reservation released outside the sweep is stock the
system believes is still held.

---

## 8. RUNBOOK-H07-WORKER-JOBS

**Alerts:** `EmbroideryWorkerJobFailures`
(`increase(embroidery_worker_job_attempts_total{outcome="failed_terminal"}[15m]) > 0`
by `job_type`, `critical`, `threshold_authority: RETRY_BUDGET`) ·
`EmbroideryWorkerQueueBacklog`
(`max(embroidery_worker_queue_oldest_pending_age_seconds) > 900` for 10m,
`warning`).

The failure threshold is **zero** because the retry schedule has already absorbed
every transient failure by that point: a terminal failure is by definition not
transient.

The backlog measures **due** work — a job waiting out its backoff is not
backlog. Fifteen minutes of a non-empty due queue at this volume means nothing
is claiming.

**Full procedure: [RB-08](RB-08-STUCK-JOB-AND-OUTBOX.md).** Its diagnostic path
is Grafana → Prometheus → Loki → the persisted rows, in that order.

**The first thing to check, and the most common cause on a new cluster:** a
worker that is up, Ready, and claiming nothing because no `worker.runtime`
policy has been published. There is no failing probe and no restart loop; these
two gauges are the only external symptom. [RB-04](RB-04-STAFF-BOOTSTRAP.md).

---

## 9. RUNBOOK-H07-NOTIFICATION

**Alerts:** `EmbroideryOrderAccessDeliveryFailing`
(`operation="order_access"`, `outcome="system_error"`, **threshold zero**,
`critical`) · `EmbroideryVerificationDeliveryFailing`
(`operation="verification"`, more than two in fifteen minutes, `warning`).

The threshold on the first is zero, deliberately. **An `ORDER_ACCESS` link is a
customer's only credential for the order they just paid for**; a single
undelivered one is a support incident, and there is no volume at which some of
them failing is acceptable. The second is a warning above zero because a
customer can request another verification code — they cannot request another
order-access link.

**Triage**

Dashboard row *Are ORDER_ACCESS notifications failing?* — the `reason_class` on
the failures table is the diagnosis:

| `reason_class` | Means |
| --- | --- |
| an unreadable envelope | A key or producer problem. Has `NOTIFICATION_DELIVERY_ENVELOPE_KEY` been rotated? [RB-05](RB-05-SECRET-ROTATION.md) |
| an unavailable transport | A channel problem, outside the application |

```promql
sum by (operation, reason_class) (increase(embroidery_notification_delivery_total{outcome="system_error"}[15m]))
```

```logql
{namespace=~"embroidery.*", app="worker"} | json | jobKind = "NOTIFICATION_DELIVERY"
```

**Act:** [RB-08](RB-08-STUCK-JOB-AND-OUTBOX.md) case D. A dead-lettered
notification has a delivered, guarded replay at
`/support/customer-access`, which re-delivers the **sealed original** and mints
nothing new. `409 REISSUE_REQUIRED` means the link is no longer valid and a new
one must be issued through the customer flow.

**Distinguish this from a closed claim gate.** If the rows are `PENDING` with
`attempt_count = 0` and were never claimed, nothing failed — the
`notification.delivery` policy is missing, the delivery is merely delayed, and
[RB-04](RB-04-STAFF-BOOTSTRAP.md) recovers it with the credential intact.

---

## 10. RUNBOOK-H07-TELEMETRY

**Alerts:** `EmbroideryMetricSeriesDropped`
(`max(embroidery_metrics_series_dropped) > 0` for 10m, `warning`,
`threshold_authority: CARDINALITY_CONTRACT`) ·
`EmbroideryTelemetryCollectorFailing`
(more than three `embroidery_metrics_collector_failures_total` in fifteen
minutes, `warning`).

Neither is a customer-facing fault. Both mean **your instruments are lying**, so
handle them before trusting anything else you read.

### Series dropped

A metric family hit its cardinality cap and refused new series, which means a
label is carrying something unbounded. The dashboard keeps rendering and the
data is quietly incomplete — this alert is the only signal that the contract has
been broken in production.

```promql
max(embroidery_metrics_series_dropped)
```

Find the family at its cap and look at what its labels carry. The usual cause is
a new label value that is an identifier, a slug, a filename or a customer value.
The fix is a **code change** — remove the unbounded label — not a raised cap.

### Collector failing

The queue-backlog and invariant gauges are computed at scrape time against the
database. When that collector fails, those gauges are **stale, not zero**.

```text
embroidery_worker_queue_pending
embroidery_worker_queue_oldest_pending_age_seconds
embroidery_invariant_violations
```

Treat all three as **unavailable** while this is firing, and read the persisted
rows directly instead ([RB-08](RB-08-STUCK-JOB-AND-OUTBOX.md) step 4). Then
check the database ([RB-10](RB-10-HEALTH-DIAGNOSTICS.md) layer 5): the collector
failing usually means it cannot reach it.

**The trap:** a zero backlog reading during this alert is not evidence that the
queue is empty.
