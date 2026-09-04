# RB-11 — Logs and metrics inspection

How to ask this system a question, and what it will not answer.

Authority: `docs/implementation/reports/APP12-H03-COMPLETION-REPORT.md`,
`infrastructure/monitoring/`.

## Reaching the tools

Nothing in the monitoring plane is routed.

```sh
kubectl -n embroidery-production port-forward svc/embroidery-grafana      3000:3000
kubectl -n embroidery-production port-forward svc/embroidery-prometheus   9090:9090
kubectl -n embroidery-production port-forward svc/embroidery-alertmanager 9093:9093
```

Grafana: folder **Embroidery**, dashboard **Wave 1 Commerce Operations**, uid
`embroidery-wave1-commerce`. 8 rows, 31 panels, each row titled as the operator
question it answers. Data sources are provisioned read-only with fixed uids
(`embroidery-prometheus`, `embroidery-loki`).

## The dashboard, row by row

| Row | Answers | Use it for |
| --- | --- | --- |
| Is the shop up? | API instances reachable, worker reachable, 5xx count, requests by status class, rate and p95 by route template | First look, always |
| Are orders being created? | Orders created (24h), creation by outcome, refusal reasons by `reason_class` | [RB-15 section 4](RB-15-ALERT-RESPONSE.md#4-runbook-h07-order-create) |
| Are payment verifications throwing system errors? | FULL verification by outcome and kind, outcomes by reason | [RB-06](RB-06-PAYMENT-RECONCILIATION.md) |
| Are reservations processing correctly? | Reservation transitions, expiry sweep passes and releases, expired-still-held gauge | [RB-15 section 7](RB-15-ALERT-RESPONSE.md#7-runbook-h07-reservation-sweep) |
| Is the worker processing and retrying? | Attempts by outcome, retries by job type, queue backlog and oldest age | [RB-08](RB-08-STUCK-JOB-AND-OUTBOX.md) |
| Are ORDER_ACCESS notifications failing? | Delivery by purpose and outcome, failures by reason | [RB-08](RB-08-STUCK-JOB-AND-OUTBOX.md) |
| Are dispatch and completion transitions failing? | Fulfilment transitions by kind and origin, refusals by reason | [RB-07](RB-07-STUCK-ORDER.md) |
| Where do I inspect diagnostic logs? | A live Loki panel beside a LogQL recipe card | This runbook |

## The metric catalogue

Everything the system publishes. Nothing else exists, so if a question is not
answerable from this list, it is not answerable from metrics.

**HTTP** — produced only by the API's interceptor; the Gateway is not
instrumented at all, so nothing is double counted.

```text
embroidery_http_requests_total            {method, route_template, status_class}
embroidery_http_request_duration_seconds  {method, route_template, status_class}
embroidery_http_requests_in_flight        {}
```

`route_template` is **template or nothing** — a request that matched no route
contributes `other`. An identifier can never appear there.

**Commerce**

```text
embroidery_order_create_total                    {origin, outcome, reason_class}
embroidery_order_create_duration_seconds         {origin, outcome}
embroidery_payment_verification_total            {payment_kind, outcome, reason_class}
embroidery_payment_verification_duration_seconds {payment_kind, outcome}
embroidery_inventory_reservation_total           {transition, outcome, reason_class}
embroidery_fulfilment_transition_total           {transition, origin, outcome, reason_class}
```

**Worker**

```text
embroidery_worker_job_claimed_total      {job_type}
embroidery_worker_job_attempts_total     {job_type, outcome}
embroidery_worker_job_retries_total      {job_type}
embroidery_worker_job_duration_seconds   {job_type, outcome}
embroidery_worker_queue_pending          {}
embroidery_worker_queue_oldest_pending_age_seconds {}
embroidery_notification_delivery_total   {operation, outcome, reason_class}
embroidery_reservation_sweep_total       {outcome}
embroidery_reservation_sweep_expired_total  {}
embroidery_reservation_sweep_examined_total {}
```

**Invariants and dependencies**

```text
embroidery_invariant_violations   {invariant}   — expired_reservation_held
embroidery_dependency_errors_total{dependency, operation}
```

**The monitoring plane's own honesty**

```text
embroidery_metrics_series_dropped
embroidery_metrics_collector_failures_total
```

### The three `outcome` values, which every alert turns on

| `outcome` | Meaning | Alerts? |
| --- | --- | --- |
| `success` | The transaction committed | no |
| `refused` | The domain declined for a reason it publishes | **never** |
| `system_error` | Everything else, **including an error nobody has classified yet** | yes |

The asymmetry is deliberate. Guessing the other way would let a new failure mode
join the "customer ordered too many units" series and never wake anyone.

Two classifications worth memorising:

- **A verification replay is `refused` / `REPLAYED`, not a success.** Counting it
  would over-report every flaky network as a second payment.
- **A routed `REQUIRES_REVIEW` is `refused`, not a system error.** An operator
  reading a transfer wrongly is a committed, correct outcome.

Two known absences, so you do not hunt for them:

- `embroidery_inventory_reservation_total{transition="release"}` has **no
  production emitter** in Wave 1. The series is simply absent.
- `job_type="UNKNOWN_JOB_TYPE"` is not a gap but a signal: an event type was
  claimed that has no registered handler.

## Logs

Both services emit the same JSON record shape. The worker's records were once
wrapped in Nest's coloured text logger and were unparseable in Loki; they are
not any more, and `| json` works on both sides.

```json
{"schemaVersion":1,"timestamp":"…","level":"info","service":"worker",
 "event":"worker.job.completed","message":"Job attempt completed",
 "context":"JobExecutionService","correlationId":"NOTIFICATION_DELIVERY:2:1",
 "jobKind":"NOTIFICATION_DELIVERY","jobKey":"2","attemptNo":1,
 "eventType":"notification.delivery.requested","outcome":"SUCCEEDED","durationMs":…}
```

### Labels are bounded; identifiers are fields

Loki labels — and there are only these:

```text
namespace · app · container · pod · level · stream · environment
```

`level` is the one derived label, taken from the application's own field. Loki's
`service_name` and `detected_level` auto-labels are turned **off**, and
`filename` is dropped deliberately. `max_label_names_per_series: 15` rejects a
mistaken collector label at ingest.

Every request id, correlation id, job key and entity id is a **field inside the
JSON line**, queryable with `| json` and indexed by nothing. That is why they are
matched with `|=` or `| json | field = …` and never selected with `{}`.

`app` values you can select: `api`, `worker`, `storefront`, `admin`, `nginx`,
`nginx-gateway`, `migrate`, `staff-bootstrap`, plus the monitoring and
scaffolding pods.

### The five queries

**Follow one journey end to end**

```logql
{namespace=~"embroidery.*"} |= "<requestId>"
```

**One failing checkout**

```logql
{namespace=~"embroidery.*", app="api"}
  | json
  | event = "http.request.completed"
  | http_route = "/api/public/ready-made-orders"
  | http_statusCode >= 500
```

**Unhandled API faults**

```logql
{namespace=~"embroidery.*", app="api", level="error"} | json | event = "platform.error"
```

**One job kind in the worker**

```logql
{namespace=~"embroidery.*", app="worker"} | json | jobKind = "NOTIFICATION_DELIVERY"
```

**Storefront and Admin server errors**

```logql
{namespace=~"embroidery.*", app=~"storefront|admin", level="error"}
```

**One outbox row, end to end** — `jobKey` is the outbox event id:

```logql
{namespace=~"embroidery.*", app="worker"} | json | jobKey = "<outbox event id>"
```

### Correlation, and its one honest limitation

- Edge to API: `requestId`. A request carrying `X-Request-ID` through the
  Gateway produces exactly one API record with that id.
- API to worker: the outbox event id, which is the worker's `jobKey`.

**There is no single field spanning both.** The API does not stamp its request id
onto the outbox row. The chain is `requestId`, then the outbox row, joined by the
row rather than by one value. Closing it would need an `outbox_events` column,
i.e. a database change. Accepted and recorded, not a defect to work around.

The Loki data source declares derived fields for `requestId` and
`correlationId`, so a value in a rendered log line is a link that queries every
record sharing it.

## What you will not find in a log line, and why

Secure tokens, verification and step-up codes, cookies, `Authorization` values,
customer contact details and raw evidence payloads are **redacted at the
source**. This is not a Loki filter that could be turned off; the values never
enter the record.

**If you need to identify a customer, take the `requestId` to the Admin surface —
not to the logs.**

`kubectl logs` shows exactly what Loki has, minus the collector. It is the right
tool when Loki itself is the thing that is broken.

## Cardinality

Metric label sets are closed vocabularies with a cap per family. A family that
hits its cap refuses new series and increments
`embroidery_metrics_series_dropped`, which alerts — because the dashboard would
otherwise keep rendering while the data was quietly incomplete. See
[RB-15 section 10](RB-15-ALERT-RESPONSE.md#10-runbook-h07-telemetry).

The queue-backlog and invariant gauges are computed by a **scrape-time
collector** against bounded, indexed, lock-free queries capped at 1 000 rows
(measured: 0.064 ms and 0.044 ms in-database). When that collector fails,
`embroidery_metrics_collector_failures_total` rises and the two gauges are
**stale, not zero**. Treat them as unavailable.

## Validating the monitoring configuration without a cluster

All of these run offline, before anything is applied. On Git Bash under Windows
prefix each with `MSYS_NO_PATHCONV=1`, or the shell rewrites the container-side
`/work/...` argument into a Windows path and the tool reports a file it was
never given:

```sh
docker run --rm --entrypoint promtool -v "$PWD/infrastructure/monitoring:/work" \
  prom/prometheus:v3.1.0 check config /work/prometheus/prometheus.yml

docker run --rm --entrypoint promtool -v "$PWD/infrastructure/monitoring:/work" \
  prom/prometheus:v3.1.0 check rules /work/prometheus/rules/wave1-commerce.rules.yml

docker run --rm --entrypoint promtool -w /work/prometheus/tests \
  -v "$PWD/infrastructure/monitoring:/work" \
  prom/prometheus:v3.1.0 test rules wave1-commerce.rules.test.yml

docker run --rm --entrypoint amtool -v "$PWD/infrastructure/monitoring:/work" \
  prom/alertmanager:v0.28.0 check-config /work/alertmanager/alertmanager.yml

docker run --rm -v "$PWD/infrastructure/monitoring:/work" \
  grafana/loki:3.4.1 -config.file=/work/loki/loki.yml -verify-config

docker run --rm -v "$PWD/infrastructure/monitoring:/work" \
  grafana/alloy:v1.6.1 fmt /work/alloy/config.alloy

kubectl kustomize infrastructure/monitoring
```

## Forbidden actions

- Adding a label carrying an id, a slug, a filename or a customer value to a
  metric or to Alloy. That is what the cardinality cap and the drop counter
  exist to catch.
- Editing a dashboard in the browser to "fix" it. It cannot be saved
  (`allowUiUpdates: false`) — change the JSON in the repository and redeploy.
- Treating a stale gauge as a zero reading.
- Looking for a customer's identity in the logs.
- Turning off redaction, for any reason.
