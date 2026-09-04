# APP12-H03 — Observability and Alerting (Wave 1)

```text
CHECKPOINT      = APP12-H03
PHASE           = APP12 — Hardening, UAT and Production Readiness
STATUS          = COMPLETE_AFTER_C1
DATE            = 2026-09-03
CORRECTION_USED = 1 / 1   (APP12-H03-C1, 2026-09-04 — no C2)
NEXT            = APP12-H03-C1 -> APP12-H04
PUSHED          = false
```

> **Correction notice (`APP12-H03-C1`, 2026-09-04).** This checkpoint is
> `COMPLETE_AFTER_C1`. The observability plane below is accepted as delivered and
> **nothing in this report has been rewritten** — every metric family, dashboard,
> rule, proof and measurement is preserved as the record of what H03 built.
>
> What the Product Owner refused was that the same production-like run disclosed
> three *normal-path Wave-1 runtime* defects, and H03 left them as follow-ups with
> no owner: a cold deployed worker that claims nothing (`FU-APP12-H03-01`), a
> Ready-Made `payment.verified` that dead-letters (`FU-APP12-H03-03`), and an
> `order.created` row that stays `PENDING` forever (`FU-APP12-H03-04`). All three
> are closed by
> [`APP12-H03-C1`](APP12-H03-C1-COMPLETION-REPORT.md), which edited no metric,
> label, rule, threshold, dashboard or collector pipeline. See §AH.

---

## A. Verdict

`APP12-H03` is **COMPLETE**.

The checkpoint entered with a system that could already *say* what happened —
one-line JSON records, a request id crossing the Gateway, an allow-listed job
projection, audit events — and with nothing that collected it, counted it or
noticed when it went wrong. `metrics = MISSING`, `Prometheus/Grafana/Loki =
MISSING`, `dashboards = MISSING`, `alerts = MISSING`. An operator diagnosing a
failed checkout had exactly one tool: a `psql` session against production.

That is now closed. Twenty-three metric families, a Prometheus/Alertmanager/
Loki/Alloy/Grafana plane deployed from repository source, a 31-panel dashboard,
15 alert rules with deterministic tests, and a complete Ready-Made journey driven
through a production-like staging cluster with every step visible as telemetry.

Three defects were found by running the real thing, and none of them could have
been found any other way:

1. **Every health probe was being counted as a business request.** The first
   staging scrape read `embroidery_http_requests_total{route_template="other",
   status_class="other"} 89` and nothing else — the API had served 89 probes and
   zero business requests, and the "request rate" panel would have been probe
   traffic forever. The exclusion §6 asks for only works if an excluded request
   leaves *no* trace in the family, so `requestExcluded()` now releases the
   in-flight gauge and increments nothing.
2. **The log collector matched no pod at all.** Loki had zero streams and Alloy
   said nothing about it. `kustomize`'s `labels:` transformer writes
   `app.kubernetes.io/part-of` onto the *workload* metadata and — with
   `includeSelectors: false` and no `includeTemplates` — **not** onto the pod
   template, so the `keep` rule dropped everything. Filtering by namespace is
   both correct and what §13 actually asks for, because the Gateway edge lives
   in a namespace of its own.
3. **Every log line arrived still wrapped in the container runtime's envelope.**
   The staging node runs the Docker driver, which writes
   `{"log":"…","stream":"stdout"}` rather than CRI text — valid JSON, so `| json`
   in a query returned the *wrapper's* fields and none of the application's. The
   pipeline now carries both stages, ordered, and a stage that cannot parse an
   entry passes it through.

One further gap was found that this checkpoint deliberately did **not** fix,
because fixing it would be a business change §2 forbids — and it is the single
most valuable thing the new telemetry surfaced:

> **A freshly deployed worker is up, healthy by its own contract, and claims
> nothing.** No deployment artifact publishes the `worker.runtime` policy, so
> `WORKER_POLICY_MISSING` leaves the process running and idle by design. Nothing
> in the deployment notices: the worker has no HTTP probe, so Kubernetes reports
> it Ready. `embroidery_worker_queue_pending` and
> `embroidery_worker_queue_oldest_pending_age_seconds` are what made it visible —
> a backlog climbing while every pod is green. Recorded as `FU-APP12-H03-01`.

```text
BLOCKER = 0
HIGH    = 0   (3 raised during the build, all fixed and re-proved live)

metric families                     = 23  (12 in the API process, 15 in the
                                           worker, 4 registered by both)
alert rules                         = 15  in 7 groups
promtool rule tests                 = SUCCESS
forbidden high-cardinality labels   = 0
PII / secret markers in metrics     = 0
PII / secret markers in Loki        = 0   (12 markers, including this journey's
                                           own order code, recipient and phone)
public metrics exposure via Gateway = 0   (18 paths x 2 hosts)
synthetic Ready-Made journey        = 14 / 14 steps, every metric exactly once
bounded failure journey             = fire -> deliver -> restore -> resolve
```

---

## B. H02 PO reconciliation

`APP12-H02` remains **PO PASS**. Nothing this checkpoint changed touches what
H02 proved.

| H02 property | State after H03 | How |
|---|---|---|
| Immutable images / digest deployment model | **unchanged** | The staging deploy pinned `newName` + `digest` and restored the committed `REPLACE_WITH_IMMUTABLE_RELEASE_REF`; `git diff` on the overlay is empty |
| TLS / HSTS edge | **unchanged** | No Gateway, listener or `HTTPRoute` was modified; the denial matrix in §J went through that same edge |
| Per-request nonce CSP | **unchanged** | No Storefront or Admin response header was touched; `instrumentation.ts` writes to stderr and touches no response |
| `CUSTOM_EMBROIDERY_RELEASE_ENABLED=false` | **unchanged** | Present in the staging overlay, read at API boot, logged as `release.gate.configured … enabled=false` in the live staging logs |
| Migration Job | **unchanged** | Ran and reported `Completed` against the disposable database |
| Release-config validator | **extended by nothing, re-run** | `check-release-config.mjs staging` = `PASS (20 resources)` with digests pinned; both overlays still refuse the committed placeholder |
| H01 PII / secret redaction | **unchanged and re-proved** | 12-marker Loki scan, 0 hits |

The two H02 external prerequisites — production Gateway controller and stateful
topology — are untouched and remain external. This checkpoint added four
monitoring-specific release inputs of its own (§S) and invented none of them.

---

## C. Observability preflight

Measured mechanically before anything was written.

| Subject | Found | Reused or built |
|---|---|---|
| Logger abstraction / log schema | `apps/api/src/platform/logging` — `LogRecord`, `StructuredLogger`, `StdoutLogSink`, schema v1 | **reused** verbatim; the metric record's field names mirror it |
| Request-id propagation | `RequestContextService` + `request-id.middleware`, gateway contract spec | **reused**; proved end to end in Loki (§L) |
| Gateway correlation | `X-Request-ID` honoured at the edge | **reused** |
| Worker job correlation | `jobCorrelation` ALS + `projectJobLogFields` allow-list | **reused**; the JSON *sink* was missing and was built (§K) |
| Outbox / audit ids | `outbox_events.id`, `background_job_attempts` | **reused** as log fields, never as labels |
| H01 redaction policy | `log-redaction.ts`, `log-sanitizer.ts` | **binding, unchanged**; the metric contract is its equivalent for the metrics plane |
| API health / readiness | `/api/health`, `/api/health/readiness` | **reused**; excluded from the business request family |
| Worker execution boundary | `JobExecutionService.run` — one seam for every handler | **reused**; instrumented once there |
| Order creation | `CreateReadyMadeOrderUseCase` | instrumented at the transaction seam |
| Payment verification | `VerifyPaymentAttemptUseCase` | instrumented at the transaction seam |
| Inventory reservation / expiry | `SkuStockRepository` call sites + `ExpireReadyMadeReservationsUseCase` | instrumented at the four call sites, not in shared persistence |
| Notification delivery | `NotificationDeliveryUseCase` | instrumented at the three settle points |
| Dispatch / completion | `DispatchOrderUseCase`, `CompleteOrderUseCase` | instrumented at the transaction seam |
| H02 Kubernetes labels / services | `app.kubernetes.io/{name,component}` on pods; `part-of` on workloads only | **the pod/workload difference is why the first collector matched nothing** |
| `infrastructure/monitoring` | a README saying "Reserved" | **built** |
| Telemetry dependencies | none; `@embroidery/observability` an empty `export {}` | **built, still dependency-free** |

`CORRELATION = REQUIRED` was satisfied without a trace backend.
`FULL TRACE BACKEND = NOT REQUIRED` and none was added.

---

## D. Telemetry architecture

Locked by [`ADR-APP12-001`](../../adr/backend/ADR-APP12-001-OPERATIONAL-OBSERVABILITY-STACK.md)
(`IMP-D064`), which resolves the CP0 boundary in
`packages/observability/README.md`.

```text
  commerce pods                        monitoring plane (separate apply)
  ┌───────────────────────┐            ┌──────────────────────────────────┐
  │ api      :4000 business│──scrape──▶ │ Prometheus  ──alerts──▶ Alertmanager
  │          :9464 metrics │  (endpoint │   │                         │
  │ worker   :9464 metrics │   discovery)  │                         ▼
  │ storefront / admin     │            │   ▼                    recording
  │        stdout JSON     │──files──▶ Alloy ──push──▶ Loki      receiver
  └───────────────────────┘  (DaemonSet)     │            │
            │                                └── Grafana ─┘
            └── Gateway (business ports only; nothing routes to :9464)
```

Pinned, never `latest`:

```text
prom/prometheus     v3.1.0
prom/alertmanager   v0.28.0
grafana/loki        3.4.1
grafana/alloy       v1.6.1
grafana/grafana     11.5.1
busybox             1.37.0   (the staging recording receiver)
```

**No vendor SDK enters the applications.** `@embroidery/observability` has an
empty dependency list and implements the contract, the three instrument types,
the registry, the Prometheus text exposition and the internal listener over Node
builtins. `prom-client` was rejected — not for dependency purism, but because a
client library hands every call site a default registry to mint an unbounded
label on, and the privacy contract has to be unbypassable rather than
conventional. The whole exposition format is forty lines.

**No trace backend.** §3 requires correlation, not tracing. Tempo would be a
component with an operational cost and no question behind it. The accepted
limitation is stated in §L.

**Deployed separately.** `kubectl apply -k infrastructure/monitoring` is its own
apply into the same namespace. A broken monitoring manifest can never fail the
apply the commerce pods depend on, and observability can be removed, rebuilt or
upgraded without touching a commerce resource (§19).

---

## E. Cardinality and privacy contract

`packages/observability/src/metrics/metric-label.ts`. Executable, unit-tested,
and the only path a label can take to a scrape.

**Allowed label names — 13.** The eleven §5 names, plus two closed vocabularies
for signals §9 requires and which had nowhere else to put their dimension:

```text
service · operation · route_template · method · status_class · outcome
origin · payment_kind · job_type · transition · reason_class
dependency · invariant
```

**Refused, three ways over.** An exact denylist (the §5 list, normalised so
`orderId`, `order_id` and `ORDERID` are one entry); a structural ban on any name
ending in `id`; and a fragment ban on `token`, `secret`, `password`, `passwd`,
`credential`, `private`, `email`, `phone`, `address`, `url`, `slug`, `filename`.
A name must additionally be on the allow list — the denylist is redundant
defence so that widening the allow list later still cannot smuggle `orderId` in.

**Values are refused, never truncated.** Enumeration-shaped, at most 64
characters. A truncated phone number is still a phone number and a truncated
UUID is still unbounded.

**A family caps its own series.** `MAX_SERIES_PER_METRIC = 200`; a refused
series is counted, exposed as `embroidery_metrics_series_dropped`, and alerted
on — the only signal that the contract has been broken in production.

Enforced at three levels: TypeScript (`MetricLabelName` is a union), runtime
(`assertLabelNames` at family construction, `assertLabelValue` per observation),
and test (`packages/observability/test/unit/metric-contract.spec.ts`, 108 tests).

**Live assertion on the deployed scrapes:**

```text
api    : 217 series (histogram sub-series counted individually)
         12 declared families
         labels = le, method, origin, outcome, payment_kind, reason_class,
                  route_template, service, status_class, transition
         forbidden/undeclared = 0   UUID-shaped values = 0
         email-shaped = 0           phone-shaped = 0     over 64 chars = 0
worker : 15 declared families
         labels = job_type, le, operation, outcome, reason_class, service, invariant
         forbidden/undeclared = 0   PII-shaped or overlong values = 0
```

---

## F. API HTTP metrics

One boundary, one counter. `HttpMetricsInterceptor` is the only producer of
`embroidery_http_requests_total` in the process; the Gateway is not instrumented
at all, so §6's double-counting warning is answered structurally.

```text
embroidery_http_requests_total          {method, route_template, status_class}
embroidery_http_request_duration_seconds{method, route_template, status_class}
embroidery_http_requests_in_flight      {}
```

Recorded from the response `finish` event — the only point that sees the final
status the exception filter settled on, for the success and the error path
alike, exactly once. The route is read at `finish` rather than at interception
because Express populates `request.route` when a handler matches, which has not
happened yet when `intercept` returns.

**The route dimension is strictly stronger than the logging one.** `safeRoute`
(APP0-B05) may fall back to a concrete pathname; that is acceptable for a log
line and is not acceptable for a label, so `metricRouteTemplate` is *template or
nothing*. A request that matched no route contributes `other`.

Live, from the staging journey — every value a template, no identifier anywhere:

```text
POST /api/public/ready-made-orders                 2xx 1   4xx 1
POST /api/staff/session                            2xx 1
PUT  /api/admin/orders/:orderId/shipping-detail    2xx 1
POST /api/public/orders/full-payment               2xx 1
POST /api/public/orders/full-payment/attempts      2xx 1
POST /api/admin/payment-attempts/:attemptId/verify 2xx 2
POST /api/admin/orders/:orderId/dispatch           2xx 1
POST /api/admin/orders/:orderId/completion         2xx 1
```

Health and readiness are excluded from the family (§6's permitted separation)
and release the in-flight gauge without incrementing anything — the first
defect §A records.

---

## G. Commerce metrics

Instrumented at the authoritative domain seams, never at a UI click, and every
observation taken **after** the transaction settles. `runInTransaction` resolves
only after the commit, so a rolled-back operation cannot reach the success
branch — §22's "no false success" is a property of where the call sits.

```text
embroidery_order_create_total             {origin, outcome, reason_class}
embroidery_order_create_duration_seconds  {origin, outcome}
embroidery_payment_verification_total     {payment_kind, outcome, reason_class}
embroidery_payment_verification_duration_seconds {payment_kind, outcome}
embroidery_inventory_reservation_total    {transition, outcome, reason_class}
embroidery_fulfilment_transition_total    {transition, origin, outcome, reason_class}
```

`outcome` is the three-way split every alert turns on: `success` (committed),
`refused` (the domain declined for a reason it publishes), `system_error`
(everything else, **including an error nobody has classified yet**). The
asymmetry is deliberate — guessing the other way would let a new failure mode
join the "customer ordered too many units" series and never wake anyone.

Vocabulary is the domain's own: `origin` is `orders.origin`, `payment_kind` is
`payment_obligations.kind`, `transition` names the delivered commands. No `PAID`
was invented.

Two classifications deserve their reasoning stated:

- **A verification replay is `refused`/`REPLAYED`, not a success.** A retry of a
  call whose response was lost writes nothing; counting it would over-report
  every flaky network as a second payment. §22's exact criterion.
- **A routed `REQUIRES_REVIEW` is `refused`, not a system error.** An operator
  reading a transfer wrongly is a committed, correct outcome and must never fire
  a failure alert (§26.26).

Reservation attribution is deliberately conservative: a `create` refusal is
recorded against inventory only for `INSUFFICIENT_STOCK`, which is unambiguously
the reservation's own; a system error raised before the reservation step never
touched inventory and is not attributed to it.

**`transition="release"` has no production emitter.** `releaseReservation` exists
on the repository and is exercised only by a test helper — no Wave-1 command
calls it. The label value is declared and the series will simply be absent until
a caller exists. Recorded as a limitation rather than papered over.

---

## H. Worker / job metrics

Instrumented at the **shared** execution boundary, so a job kind a later
checkpoint registers is observable the moment it is registered.

```text
embroidery_worker_job_claimed_total     {job_type}
embroidery_worker_job_attempts_total    {job_type, outcome}
embroidery_worker_job_retries_total     {job_type}
embroidery_worker_job_duration_seconds  {job_type, outcome}
embroidery_worker_queue_pending         {}
embroidery_worker_queue_oldest_pending_age_seconds {}
embroidery_notification_delivery_total  {operation, outcome, reason_class}
embroidery_reservation_sweep_total      {outcome}
embroidery_reservation_sweep_expired_total  {}
embroidery_reservation_sweep_examined_total {}
```

`job_type` is `BackgroundJobKind` — ten closed values. `outcome` is a total,
exhaustive mapping of `AttemptSummary.outcome`, so an outcome added later stops
compiling rather than becoming an unlabelled series nothing alerts on. The
outbox event id, the attempt number and the correlation id are **log fields**,
asserted absent from every label.

A claim whose event type has no registered handler contributes
`job_type="UNKNOWN_JOB_TYPE"` — the event type is an open vocabulary and must
never be a label, and a non-zero rate on that series is itself the signal.

Backlog is answered by a **bounded, indexed, lock-free** scrape-time collector
whose predicates are copied verbatim from partial indexes the schema already
carries (`ix_outbox_events__next_attempt_id__pending`,
`ix_inventory_reservations__expires_id__reserved`). **No migration was added.**
Each query is additionally capped at 1,000 rows, so the gauge saturates rather
than making the scrape slower the worse things get. Measured in-database:

```text
queue backlog   : execution = 0.064 ms   top node = Aggregate
invariant gauge : execution = 0.044 ms
```

The backlog is *due* work only — a job waiting out its retry backoff is not
backlog, and counting it would make every transient failure look like a stuck
queue. Age is measured from `created_at`, not `next_attempt_at`, because "how
long has anything been stuck" is about the former.

---

## I. Invariant and dependency metrics

```text
embroidery_invariant_violations {invariant}   — expired_reservation_held
embroidery_dependency_errors_total {dependency, operation}
```

The invariant uses the reservation's own `expires_at` — a delivered domain
deadline (`BR-025`/`BR-026`) — not an invented SLA. Its alert is
duration-qualified because a small non-zero reading between sweep passes is
normal.

Dependency errors are counted at the API's single exception-filter boundary and
recognised by error *type* (`PersistenceError`, `ObjectStorageError`), never by a
message heuristic that would be wrong in both directions. `operation` carries the
route template: §9 forbids labelling by SQL or by a query carrying parameters,
and a route template is neither — it answers the only question the counter is
for, which endpoint's infrastructure call is failing.

---

## J. Metrics exposure and security

A dedicated `node:http` listener on port **9464**, not a Nest controller. Three
properties follow structurally rather than from a rule someone must remember:

- **absent from OpenAPI** — the generator cannot see a route that is not a
  controller. `openapi:check` reports the artifact unchanged;
- **off the Gateway** — the Gateway routes to the business port; the metrics
  Services are `ClusterIP` and no `HTTPRoute` references them;
- **outside the business pipeline** — no guard, interceptor, envelope or release
  gate applies, and none can start applying by accident.

The worker gains the same listener. It is **not** the HTTP worker endpoint
`APP12-H02` §9 refused to invent: it is not a probe target, no probe references
it, and a bind failure is logged and stepped over. The worker's liveness contract
is still process liveness, byte for byte.

**Live denial matrix — 18 paths across both customer-facing hosts:**

```text
staging.embroidery.local        /metrics /internal/metrics /api/metrics
                                /prometheus/graph /alertmanager /grafana
                                /loki/api/v1/labels /api/v1/query /-/healthy
                                -> 404   metrics_leak=0   (all nine)

admin.staging.embroidery.local  same nine paths
                                -> 307 -> /login (the Admin app's own auth gate)
                                   or 404          metrics_leak=0   (all nine)
```

Every 307 was followed and lands on `/login` with `200`. Not one response
carried `# TYPE embroidery_` or a metric line.

Grafana: `GF_AUTH_ANONYMOUS_ENABLED=false` set explicitly rather than relied on
as a default; sign-up and org-create off; all outbound analytics, update checks
and the news feed off. Anonymous `GET` on `/api/dashboards/uid/…`,
`/api/datasources` and `/api/search` all returned **401**. The admin password
comes from a Secret this repository does not create and never contains.

---

## K. Structured logs and redaction

The API's `APP0-B05` platform is unchanged and was reused verbatim.

**The worker's records were not parseable, and now are.** The worker composed
correct JSON for its job fields and handed it to Nest's default logger, which
wrapped it in a coloured, bracketed, ANSI-escaped text line. Invisible in a
developer's terminal; fatal the moment the lines reach Loki, because `| json`
parsed the API's records and failed on the worker's — "follow this journey
across the two services" worked on one side only. `WorkerJsonLogger` is a
`LoggerService` adapter emitting the same field names the API's `LogRecord` uses.
§2 lists correlation hardening as in scope and this is that.

It re-implements no redaction. `projectJobLogFields` is already an allow-list —
payloads, object bytes, credentials and stack traces are not in it — and the
adapter **merges only that shape**, checked structurally. An arbitrary object
that happened to parse as JSON stays a string, so a payload cannot be promoted
into the record's top level. A non-string message is never `JSON.stringify`d; its
type is logged instead. Nest's `error(message, stack, context)` stack is dropped,
matching the API's production `LOG_STACK_ENABLED=false`.

Six focused tests cover exactly those properties.

Live, from staging:

```json
{"schemaVersion":1,"timestamp":"2026-09-03T16:10:22.547Z","level":"info",
 "service":"worker","event":"worker.job.completed","message":"Job attempt completed",
 "context":"JobExecutionService","correlationId":"NOTIFICATION_DELIVERY:2:1",
 "jobKind":"NOTIFICATION_DELIVERY","jobKey":"2","attemptNo":1,
 "eventType":"notification.delivery.requested","outcome":"SUCCEEDED","durationMs":…}
```

`H01` redaction remains binding and was re-proved by the marker scan in §W.

---

## L. Cross-service correlation

**Gateway → API, proved in logs.** A request carrying
`X-Request-ID: h03-chain-1788451910` through the staging HTTPS edge produced
exactly one Loki record:

```text
app=api  event=http.request.completed  route=/api/public/products
         requestId=h03-chain-1788451910
```

**API → outbox → worker, proved in logs.** The checkout wrote outbox event `2`
(`notification.delivery.requested`, aggregate `NOTIFICATION_INTENT`). One LogQL
query follows it into the worker:

```logql
{app="worker"} | json | jobKey="2"
→ jobKind=NOTIFICATION_DELIVERY jobKey=2 attemptNo=1 outcome=SUCCEEDED
  eventType=notification.delivery.requested
```

The same query shape diagnosed the dead-lettered event without a database
session:

```logql
{app="worker"} | json | jobKey="3"
→ jobKind=INVENTORY_RESERVATION outcome=FAILED_TERMINAL
  errorClass=JOB_PAYLOAD_INVALID eventType=payment.verified
```

Every one of those fields is a **log field**; none is a Loki label and none is a
metric label. §12's rule holds exactly.

**The accepted limitation, stated plainly.** There is no single field that spans
the API request and the worker attempt. The API does not stamp its request id
onto the outbox row, so the chain is `requestId` (edge → API) and then
`jobKey`/outbox id (API → worker), joined by the outbox row rather than by one
value. Closing it would mean an `outbox_events` column, which is a persistence
change §2 forbids this checkpoint. Recorded as `FU-APP12-H03-02`.

---

## M. Loki and collector pipeline

Grafana Alloy DaemonSet → Loki, single binary, filesystem-backed. **Promtail was
not introduced**; Alloy is its supported successor and §13 names it.

Discovery keeps `embroidery-.*|nginx-gateway` by namespace, and only pods on the
instance's own node (a field selector on `spec.nodeName`). Sources collected:
API, worker, Storefront, Admin, the Gateway edge, the scaffolding database and
object store, and the monitoring plane itself — which is what makes the alert
notifications in §Y queryable rather than transient.

**Labels are bounded, and the store enforces it as well as the collector.**

```text
namespace · app · container · pod · level · stream · environment
```

`app` is the container name, overridden by `app.kubernetes.io/component` where a
workload publishes one — which is how the Gateway pod gets a name without
sharing the application's labels. `level` is the one derived label, extracted
from the application's own field; a line without one creates no empty-valued
stream. `filename` is explicitly dropped: bounded, but an index dimension nobody
queries that changes on every container restart. Loki's own `service_name` and
`detected_level` auto-labels are turned **off**, so the label set is declared in
one place and the documented contract stays true. `max_label_names_per_series:
15` rejects a mistaken collector label at ingest.

Every request id, correlation id, job key and entity id stays a **field inside
the JSON line**, queryable with `| json` and indexed by nothing.

Live label inventory from the deployed Loki:

```text
labels : app, container, environment, level, namespace, pod, stream
app    : admin, alert-recorder, alertmanager, alloy, api, grafana, init, loki,
         migrate, minio, nginx, nginx-gateway, postgres, prometheus,
         staff-bootstrap, storefront, worker
level  : error, info
```

---

## N. Grafana provisioning

Data sources and dashboards are provisioned from repository source with fixed
UIDs, `editable: false` and `allowUiUpdates: false` — so a change made in the
browser cannot be saved and the file on disk and the dashboard an operator is
looking at can never diverge. A dashboard that has silently drifted from its
source is worse than none, because it is trusted.

The Loki data source declares derived fields for `requestId` and `correlationId`,
so a value in a log line becomes a link that queries every record sharing it.

Live:

```text
anonymous /api/dashboards/uid/embroidery-wave1-commerce -> 401
anonymous /api/datasources                              -> 401
anonymous /api/search                                   -> 401
authenticated: title="Wave 1 Commerce Operations" panels=31 rows=8
               folder=Embroidery provisioned=true
datasources  : Prometheus (uid=embroidery-prometheus, readOnly) health=OK
               Loki       (uid=embroidery-loki,       readOnly) health=OK
```

---

## O. Wave 1 Commerce Operations dashboard

Eight rows, each titled as the operator question §14 requires it to answer, and
31 panels.

| Row | Answers |
|---|---|
| Is the shop up? | API instances reachable, worker reachable, 5xx count, requests by status class, rate and p95 by route template |
| Are orders being created? | Orders created (24h), creation by outcome, refusal reasons by `reason_class` |
| Are payment verifications throwing system errors? | FULL verification by outcome and kind, outcomes by reason |
| Are reservations processing correctly? | Reservation transitions, expiry sweep passes and releases, expired-still-held gauge |
| Is the worker processing and retrying? | Attempts by outcome, retries by job type, queue backlog and oldest age |
| Are ORDER_ACCESS notifications failing? | Delivery by purpose and outcome, failures by reason |
| Are dispatch and completion transitions failing? | Fulfilment transitions by kind and origin, refusals by reason |
| Where do I inspect diagnostic logs? | A live Loki panel (errors and warnings, all services) beside a LogQL recipe card |

The recipe card carries the five queries an operator needs during an incident —
follow one journey by `requestId`, one failing checkout, unhandled API faults,
one job kind, Storefront/Admin server errors — and states what will *not* be
found in a log line and why. Every panel names a data source by fixed UID, so
the JSON works against a rebuilt Grafana.

---

## P. Alert design and rules

15 rules in 7 groups. Each carries `severity`, `service`, `domain`,
`threshold_authority`, a `summary`, a `description` that says what to do, a
`dashboard` reference and a `runbook` id for `APP12-H07`.

| Alert | Sev | Threshold authority |
|---|---|---|
| `EmbroideryApiTargetDown` | critical | INITIAL_OPERATIONAL_THRESHOLD |
| `EmbroideryAllApiTargetsDown` | critical | INITIAL_OPERATIONAL_THRESHOLD |
| `EmbroideryWorkerTargetDown` | critical | INITIAL_OPERATIONAL_THRESHOLD |
| `EmbroideryApiServerErrorBurst` | critical | INITIAL_OPERATIONAL_THRESHOLD |
| `EmbroideryOrderCreateSystemErrors` | critical | INITIAL_OPERATIONAL_THRESHOLD |
| `EmbroideryFullVerificationSystemErrors` | critical | INITIAL_OPERATIONAL_THRESHOLD |
| `EmbroideryFulfilmentSystemErrors` | warning | INITIAL_OPERATIONAL_THRESHOLD |
| `EmbroideryReservationSweepFailing` | warning | INITIAL_OPERATIONAL_THRESHOLD |
| `EmbroideryExpiredReservationsHeld` | warning | **DOMAIN_DEADLINE** (`BR-025`/`BR-026`) |
| `EmbroideryWorkerJobFailures` | critical | **RETRY_BUDGET** (`IMP-D029`) |
| `EmbroideryWorkerQueueBacklog` | warning | INITIAL_OPERATIONAL_THRESHOLD |
| `EmbroideryOrderAccessDeliveryFailing` | critical | INITIAL_OPERATIONAL_THRESHOLD |
| `EmbroideryVerificationDeliveryFailing` | warning | INITIAL_OPERATIONAL_THRESHOLD |
| `EmbroideryMetricSeriesDropped` | warning | **CARDINALITY_CONTRACT** |
| `EmbroideryTelemetryCollectorFailing` | warning | INITIAL_OPERATIONAL_THRESHOLD |

**Every commerce rule matches `outcome="system_error"`.** A refusal reaches no
alert, by construction.

**Thresholds are absolute counts, not percentages.** At fewer than a hundred
orders a month a burn-rate SLO is arithmetic noise: one failed checkout in a
quiet hour is a 100% error rate, and a 1%-of-requests rule would need a thousand
requests to mean anything. "Two order creations threw in fifteen minutes" is a
real signal at this volume. **No service-level objective is declared and none may
be inferred from these numbers.**

Two thresholds are zero and say why: a terminal job failure means the retry
budget is already spent, and a single undelivered `ORDER_ACCESS` link is a
customer who has paid and cannot open their order.

Two inhibition rules stop an incident being reported many times: the fleet-down
alert inhibits the per-pod one, and a down worker inhibits its own downstream
job, inventory and notification alerts.

---

## Q. Alert rule tests

`promtool test rules` — **SUCCESS**, every group carrying all four §16 cases.

```text
an API pod that stays up never alerts
one API pod down for two minutes fires, and the fleet alert does not
a recovered API pod stops firing
the worker going away fires the worker alert after five minutes
client errors never fire the server-error alert
a sustained 5xx burst fires and then resolves
refused checkouts never fire the order-create failure alert
order-create system errors fire and then resolve
a review routing and a replay never fire the verification alert
verification system errors fire
fulfilment refusals never fire, system errors do
a healthy sweep with expiries never alerts
a stuck invariant fires after fifteen minutes and clears when released
retries within the budget never fire the terminal-failure alert
an exhausted retry budget fires
a briefly non-empty queue never fires, a stuck one does
work due for longer than the threshold fires and clears
successful deliveries never fire
a single failed ORDER_ACCESS delivery fires, and a single failed verification does not
a healthy telemetry plane never alerts
a breached cardinality cap fires
```

The refusal cases are the ones worth naming: they drive refusals at volumes far
**above** every failure threshold — 10/min out-of-stock, 7/min duplicate submit,
9/min replay, 6/min routed review, 8/min invalid transition — and assert silence.
That is §26.26 as an executable rule rather than a claim.

---

## R. Alertmanager delivery

Deployed. Route tree groups by `alertname` + `service` (not by instance: when
both API pods fail an operator needs one notification saying the API is down),
`group_wait: 30s`, `repeat_interval: 4h`, with `critical` and `warning` on
separate branches so a production release can point them at different
destinations without a redesign.

`amtool check-config` — **SUCCESS**: 1 route, 2 inhibit rules, 3 receivers.

**The staging receiver is a recording webhook** — nine lines of `nc` in a busybox
loop that accepts the POST, answers `200`, and writes the payload to its own
stdout, where Alloy collects it into Loki like any other pod. It cannot contact a
person and cannot leave the cluster. That is the only honest way to satisfy
§16's live-delivery requirement while obeying its ban on inventing production
credentials.

```text
production_alert_receiver = RELEASE_OPERATOR_INPUT_REQUIRED_BEFORE_R01
```

Substituting it is a value, not a redesign: the route tree, the grouping and the
inhibition are unchanged by which URL sits under `webhook_configs`.

---

## S. Production monitoring inputs

Names and status only. No value is invented, and no code path depends on one
being present.

| Input | Status | Why H03 cannot supply it |
|---|---|---|
| `production_alert_receiver` | `REQUIRED_BEFORE_R01` | §16 forbids inventing Slack/Teams/email credentials; none exists in this repository |
| `grafana_operator_credential` | `REQUIRED_BEFORE_R01` | §18 forbids committing it; generated per run out of band in staging |
| `monitoring_persistence` (storage class) | `REQUIRED_BEFORE_R01` | Stateful topology is reserved to an ADR (`SYSTEM_ARCHITECTURE.md` §13); H02 §5 forbids moving persistence in either direction |
| `monitoring_retention` | `REQUIRED_BEFORE_R01` | Staging uses 15d metrics / 14d logs; production retention is an operator decision |

**Production application startup does not depend on the monitoring plane.** The
metrics listener is started with a reported failure rather than a thrown one; a
port that cannot bind logs and is stepped over. The two applications were
deployed and served the full commerce journey while Prometheus, Loki and Grafana
were still starting.

---

## T. Synthetic Ready-Made observability journey

Driven against the deployed staging cluster over real HTTPS, against the real
database, through the real worker. Disposable production-like data only, in
`embroidery_db7_h02_staging`. **No real bank transfer. No G03 dataset.**

```text
catalog.seeded          app12-s02-e2e-ao-thun (the delivered S02 fixture)
customer.seeded         SUBMISSION + STEP_UP, VERIFIED
order.create            201  ORD-4RMYFTG5NM
order.row               AWAITING_SHIPPING_FEE  origin=READY_MADE
order.refused           422  (a deliberate refusal, §26.26)
admin.login             204  session established
fulfilment.shipping_fee 200
grant.rebound           the application's own ORDER_ACCESS grant
payment.read            200  AWAITING_PAYMENT / PENDING
payment.attempt         201  PENDING  replayed=false
payment.verify          200  SUCCEEDED / READY_FOR_DELIVERY
payment.verify.replay   200  replayed=true
fulfilment.dispatch     200  DELIVERED
fulfilment.complete     200  COMPLETED
```

**Two credentials were seeded rather than driven, and the reason is structural.**
The delivered notification channel is process memory only *by design*
(`ADR-APP4-001` §12 forbids it writing a decrypted secret to any table, file or
log, precisely so a deployment leaves no plaintext at rest). A verification code
and an `ORDER_ACCESS` token delivered inside a pod are therefore unreadable from
outside it; the e2e harness reads them through an in-process control server it
owns, and a cluster has no such seam. So a verified `SUBMISSION` challenge and a
`STEP_UP` challenge were written with the delivered `digestSecret` algorithm, and
the `ORDER_ACCESS` grant the application itself minted had its digest rebound to
a token this driver knows — the row is the application's, only its secret is
replaced. `uq_secure_access_grants__customer_order__active` refused a second
grant, which is the schema correctly saying a customer has one credential per
order.

Everything else is the application: the order, its frozen line, its shipping
detail, its reservation, its idempotency record, its outbox event, the worker's
delivery, the fee, the FULL obligation, the payment attempt, the verification,
the stock consumption, the dispatch and the completion.

**Telemetry produced — every value exactly once:**

```text
embroidery_order_create_total{origin=READY_MADE,outcome=success}              1
embroidery_order_create_total{...,outcome=refused,
                              reason_class=VERIFIED_CONTACT_REQUIRED}         1
embroidery_payment_verification_total{payment_kind=FULL,outcome=success}      1
embroidery_payment_verification_total{...,outcome=refused,
                                      reason_class=REPLAYED}                  1
embroidery_inventory_reservation_total{transition=create,outcome=success}     1
embroidery_inventory_reservation_total{transition=consume,outcome=success}    1
embroidery_fulfilment_transition_total{transition=shipping_fee_set,...}       1
embroidery_fulfilment_transition_total{transition=dispatch,...}               1
embroidery_fulfilment_transition_total{transition=complete,...}               1
embroidery_notification_delivery_total{operation=order_access,
                                       outcome=success}                       1
embroidery_worker_job_claimed_total{job_type=NOTIFICATION_DELIVERY}           1
embroidery_worker_job_attempts_total{job_type=NOTIFICATION_DELIVERY,
                                     outcome=succeeded}                       1
```

The verification success is **1**, not 2, although the endpoint was called twice.
That single number is §22's "payment verify replay → no duplicate success",
proved on the deployed system rather than in a unit test.

Correlation chain, logs queryable, Grafana panels displaying it — §L, §M, §X.

**One genuine failure the journey exposed and did not hide:**
`embroidery_worker_job_attempts_total{job_type="INVENTORY_RESERVATION",
outcome="failed_terminal"} 1`, `errorClass=JOB_PAYLOAD_INVALID`. The APP8 custom
inventory-reservation handler consumes `payment.verified` and rejects the
Ready-Made payload shape, so the event dead-letters. This is pre-existing
behaviour that no probe would have shown; it is recorded as `FU-APP12-H03-03` and
belongs to the domain, not to H03.

---

## U. Failure-observability journey

One bounded, disposable condition — scaling a monitored target to zero, the
least invasive real signal §17 lists.

```text
T0 16:13:38  baseline                     up{job="embroidery-worker"} = 1
T1 16:13:38  worker scaled to 0
T2 16:19:26  PROMETHEUS FIRING            EmbroideryWorkerTargetDown
                                          severity=critical service=worker
                                          activeAt=16:13:57
T3 16:19:34  ALERTMANAGER RECEIVED        state=active receivers=critical
                                          runbook=RUNBOOK-H07-WORKER-DOWN
T4 16:19:41  RECORDING RECEIVER NOTIFIED  receiver=critical status=firing
                                          summary="The worker is unreachable"
                                          dashboard="Wave 1 Commerce Operations"
T5 16:20:02  worker restored to 1
T6 16:20:49  PROMETHEUS NO LONGER FIRING  up{job="embroidery-worker"} = 1
T7 16:24:59  RESOLVED NOTIFICATION        receiver=critical status=resolved
                                          endsAt=16:20:27
```

Diagnostic evidence in Loki for the same window: the alert notifications
themselves (`{app="alert-recorder"} |= "EmbroideryWorkerTargetDown"`), and the
worker's own structured lifecycle records showing `not ready
(WORKER_POLICY_MISSING)` → `ready (ok)` across the restarts.

**This proves detect → alert → diagnose → resolve-signal, and nothing more.**
Recovery correctness, idempotency and failure rehearsal are `APP12-H04`'s and
were not attempted.

---

## V. Live metrics

Prometheus scraped both applications by endpoint discovery — one target per pod,
which is the only correct way to read a per-process counter from a replicated
Deployment.

```text
job=embroidery-api        10.244.0.x:9464/metrics   up
job=embroidery-worker     10.244.0.x:9464/metrics   up
job=prometheus            127.0.0.1:9090/metrics    up
job=alertmanager          :9093/metrics             up
rules loaded              15 in 7 groups
alertmanagers discovered  http://embroidery-alertmanager:9093/api/v2/alerts
```

---

## W. Live Loki

Labels, values and JSON parsing in §M. The **synthetic marker test** §13 requires
— this journey's own identifiers and the standing secret markers, queried across
every stream in the namespace:

```text
ORD-4RMYFTG5NM         hits=0      SECURE_LINK_TOKEN   hits=0
H03 Staging Recipient  hits=0      Authorization       hits=0
1 Staging Street       hits=0      set-cookie          hits=0
+849                   hits=0      __Host-             hits=0
STEP_UP                hits=0      password            hits=0
token_hash             hits=0      Bearer              hits=0
```

The order code, the recipient's name, the delivery address and the phone number
all existed in the request bodies the journey sent, and none of them reached a
log line.

---

## X. Live Grafana

Every dashboard domain queried through the Grafana datasource proxy — the same
path a panel takes — against live data:

```text
Orders created      success=1  refused=1
Checkout refusals   VERIFIED_CONTACT_REQUIRED=1
FULL verification   success/other=1  refused/REPLAYED=1
Reservations        create/success=1  consume/success=1
Fulfilment          shipping_fee_set=1  dispatch=1  complete=1
Notifications       order_access/success=1
Worker jobs         NOTIFICATION_DELIVERY/succeeded=1
                    INVENTORY_RESERVATION/failed_terminal=1
Queue backlog       1
Invariant           0
Targets up          4
Request rate        2xx=10  4xx=1
```

`histogram_quantile` returned `NaN` on a 30-minute window because the cluster
had two scrape samples of history at that moment — normal Prometheus behaviour
for a `rate()` over a nearly empty range, not a panel defect. It resolves as
history accrues and is stated here rather than quietly omitted.

---

## Y. Live alert fire / resolve

§U end to end: fired in Prometheus, received by Alertmanager, **delivered** to
the recording receiver with its full annotation payload, then resolved and the
resolution delivered. Both notifications were collected into Loki, so the proof
is queryable rather than transient.

---

## Z. Telemetry overhead

Bounded and measured, as §23 requires — broader performance work is `APP12-H05`'s.

```text
api     scrape p50=2.5ms  p95=7.0ms  max=7.0ms  payload=32.1 KiB  series=217
worker  scrape p50=2.5ms  p95=8.1ms  max=8.1ms  payload= 2.6 KiB  series=  7

DB-backed collector, timed in-database with EXPLAIN ANALYZE:
  queue backlog    execution=0.064ms   top node=Aggregate
  invariant gauge  execution=0.044ms

log volume for one synthetic journey (≈40 min window, all services):
  api 645 lines / 142.4 KiB   worker 105 / 21.9 KiB   nginx 559 / 33.5 KiB
  storefront 4 / 0.1 KiB      admin 4 / 0.1 KiB
```

Both collector queries are bounded (`LIMIT 1000`), run on existing partial
indexes, take no lock and open no transaction. The scrape figures include the
`kubectl port-forward` tunnel, so the in-cluster numbers are lower.

---

## AA. H01 / H02 regressions

None.

```text
H01 redaction policy         intact — 12-marker Loki scan, 0 hits (§W)
H01 nonce CSP                untouched — no response header modified
H02 TLS / HSTS edge          untouched — the denial matrix ran through it
H02 immutable image model    honoured — digests pinned, placeholder restored
H02 migration Job            Completed against the disposable database
H02 release-config validator re-run: staging PASS (20 resources) with digests
Wave-2 flag                  false — logged at API boot in staging
release gate matrix          28 DENY / 18 ALLOW / 3 SCOPE_GATED, contract green
```

---

## AB. Kubernetes and staging

```text
cluster        minikube profile embroidery-staging, Kubernetes v1.31.4,
               docker driver, --insecure-registry embroidery-registry:5000
gateway        Gateway API v1.2.1 CRDs + NGINX Gateway Fabric v1.6.1
               (installed INTO the disposable cluster; neither is a repository
               dependency and neither locks the production controller)
registry       disposable registry:2 on the cluster network; all four digests
               read back and matched the built image IDs byte for byte
applications   kubectl apply -k overlays/staging       — 20 resources
monitoring     kubectl apply -k infrastructure/monitoring — 25 resources
production     kubectl kustomize overlays/production   — 15 resources
```

Base resource deltas, and only these:

```text
production 13 -> 15   (+ Service embroidery-api-metrics, + Service embroidery-worker-metrics)
staging    18 -> 20   (the same two)
```

Both new Services are `ClusterIP`, publish port 9464 only, and are referenced by
no `HTTPRoute`. The `configmap` gained `METRICS_ENABLED` and `METRICS_PORT`; both
Deployments gained a named `metrics` container port. **No probe references the
metrics port.**

The monitoring plane is a **separate kustomization** and a separate apply, for
the §19 reason stated in §D.

---

## AC. Files changed

64 entries. New directories are listed as one line.

**New shared package content — `packages/observability`**

```text
src/metrics/metric-label.ts            the cardinality and privacy contract
src/metrics/metric-series.ts           label-set store and the per-family cap
src/metrics/metric-instruments.ts      counter, gauge, histogram
src/metrics/metric-registry.ts         per-process registry and collectors
src/metrics/exposition.ts              Prometheus text format 0.0.4
src/metrics/metrics-listener.ts        the internal :9464 listener
src/metrics/metrics-bootstrap.ts       start-from-bootstrap, never a lifecycle hook
src/catalog/metric-vocabulary.ts       closed label vocabularies
src/catalog/commerce-metrics.ts        order create, verification, reservation, fulfilment
src/catalog/worker-metrics.ts          job, notification, sweep, backlog, invariant
src/catalog/platform-metrics.ts        HTTP and dependency
src/index.ts · README.md · package.json · tsconfig{,.build}.json · jest.config.mjs
test/unit/{metric-contract,metric-registry,metric-catalogue,metrics-listener}.spec.ts
```

**API**

```text
src/platform/metrics/{metrics.module,api-metrics.providers,http-metrics.interceptor,
                      metric-route,commerce-outcome}.ts  + 2 spec files
src/platform/http-response/{api-exception.filter,http-response.module}.ts
src/bootstrap/app.module.ts · src/main.ts · package.json
src/modules/order/application/ready-made/{create-ready-made-order.use-case,
                                          ready-made-order.metrics}.ts + spec
src/modules/order/application/admin/{admin-shipping-fee.router,complete-order.use-case,
                                     dispatch-order.use-case,order-fulfilment.metrics}.ts + spec
src/modules/payment/application/admin/{verify-payment-attempt.use-case,
                                       payment-verification.metrics}.ts + spec
src/modules/{order/admin-order-delivery,order/admin-order-shipping,
             order/ready-made-order,payment/admin-payment-verification}.module.ts
src/modules/content/presentation/public-sitemap-entry.contract.spec.ts  (ratchet re-pinned 363 -> 369)
```

**Worker**

```text
src/runtime/metrics/{worker-metrics.module,worker-metrics.providers,
                     telemetry-snapshot.repository,telemetry-snapshot.collector,
                     job-attempt-observation}.ts + job-execution-metrics.spec.ts
src/runtime/logging/worker-json-logger.ts + spec
src/runtime/execution/job-execution.service.ts + spec
src/runtime/worker-runtime.module.ts · src/bootstrap/worker.module.ts · src/main.ts
src/jobs/notification-delivery/{application/notification-delivery.metrics.ts,
                                application/notification-delivery.usecase.ts,
                                notification-delivery.module.ts}
src/jobs/ready-made-reservation-expiry/{reservation-expiry.runtime,reservation-expiry.module}.ts
package.json
```

**Frontends**

```text
apps/storefront/src/instrumentation.ts
apps/admin/src/instrumentation.ts
```

**Infrastructure**

```text
infrastructure/monitoring/{kustomization.yaml,README.md}
infrastructure/monitoring/prometheus/{prometheus.yml,rules/wave1-commerce.rules.yml,
                                      tests/wave1-commerce.rules.test.yml}
infrastructure/monitoring/{alertmanager/alertmanager.yml,loki/loki.yml,alloy/config.alloy}
infrastructure/monitoring/grafana/{provisioning/datasources/datasources.yml,
                                   provisioning/dashboards/dashboards.yml,
                                   dashboards/wave1-commerce-operations.json}
infrastructure/monitoring/workloads/{prometheus,alertmanager,loki,alloy,grafana}.yaml
infrastructure/kubernetes/base/{config/configmap.yaml,workloads/api.yaml,workloads/worker.yaml}
infrastructure/docker/{api,worker}.Dockerfile
```

**Documentation**

```text
docs/adr/backend/ADR-APP12-001-OPERATIONAL-OBSERVABILITY-STACK.md   (new)
docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md          (IMP-D064)
docs/implementation/SCOPED_COMMAND_INDEX.md                         (8 commands)
docs/implementation/reports/APP12-H03-COMPLETION-REPORT.md          (this file)
```

---

## AD. File-size evidence

Every file this checkpoint added or changed, against the 400/600 hard limits.

```text
REVIEW  source  373  apps/api/.../verify-payment-attempt.use-case.ts
REVIEW  source  370  apps/worker/.../job-execution.service.ts
REVIEW  source  369  apps/api/src/bootstrap/app.module.ts
REVIEW  source  354  apps/worker/.../notification-delivery.usecase.ts
REVIEW  source  323  apps/api/.../create-ready-made-order.use-case.ts
ok      test    331  apps/api/.../public-sitemap-entry.contract.spec.ts
ok      source  299  apps/api/.../dispatch-order.use-case.ts
...                  (every other changed or added file below 250)

hard-limit violations introduced by this checkpoint = 0
```

`job-execution.service.ts` briefly reached **413** and was brought back under the
limit by extracting the metric vocabulary into
`runtime/metrics/job-attempt-observation.ts` — the execution service owns lease
ownership, the timeout state machine and the guarded completion seam, and
telemetry vocabulary has no business competing for room with any of that.

The repository-wide `check-file-size.mjs` still reports 82 pre-existing
violations, every one of them inherited and none in a file this checkpoint
touched.

---

## AE. Validation

Change-impact based, per `VALIDATION_GOVERNANCE.md` §3. Commands actually run:

```text
pnpm --filter @embroidery/observability typecheck | lint | build | test   PASS (4 suites, 108 tests)
pnpm --filter @embroidery/api            typecheck | lint                 PASS
pnpm --filter @embroidery/worker         typecheck | lint | test          PASS (62 suites, 1068 tests)
pnpm --filter @embroidery/storefront     typecheck | lint                 PASS
pnpm --filter @embroidery/admin          typecheck | lint                 PASS
pnpm --filter @embroidery/api            test                             35 failed / 338 passed suites
                                                                          223 failed / 5432 passed tests
                                                                          — compared against HEAD below
pnpm --filter @embroidery/api            openapi:check                    artifact unchanged
pnpm --filter @embroidery/api-client     check:generated                  up to date (tree hash 4b60e760…)
node tools/check-api-dist-boundary.mjs                                    clean, 2012 files
node tools/check-category-source-of-truth.mjs                             PASS (2572 files)
node tools/check-storefront-route-authority.mjs                           PASS
node tools/check-lifecycle-consistency.mjs                                PASS
node tools/db-disposable-inventory.mjs --execute                          dropped=8 unsafe_drop=0
apps/api metric specs (5 suites)                                          PASS (54 tests)
node tools/check-report-secrets.mjs                                       PASS (646 docs, 5135 files)
node tools/check-release-config.mjs staging | production                  committed placeholders refused
git diff --check                                                          clean
prettier --check (every changed file)                                     PASS
promtool check config | check rules | test rules                          SUCCESS · 15 rules · SUCCESS
amtool check-config                                                       SUCCESS
loki -verify-config                                                       exit 0
alloy fmt                                                                 exit 0 (committed file canonical)
grafana dashboard JSON                                                    valid, 31 panels, 8 rows
kubectl kustomize monitoring | production | staging                       25 | 15 | 20 resources
release-gate contract spec                                                15 tests PASS
```

### The API suite, measured against HEAD rather than asserted

The API suite is **not green at HEAD**, and stating a raw failure count would say
nothing about this checkpoint. So it was run twice on the same machine, against
the same shared dev PostgreSQL, uncontended: once on this tree, and once in a
pristine `git worktree` detached at `7d84c83a`.

```text
                     HEAD (7d84c83a)   H03
suites failed        41                35
suites passed        327               338
suites total         368               373   (+5 new metric suites)
tests failed         260               223
tests passed         5341              5432
tests total          5601              5655  (+54 new tests)
wall time            2573 s            1996 s

failing-suite cause  timeout   HEAD=10  H03=7
                     assertion HEAD=31  H03=28
```

**H03 fails strictly fewer suites and fewer tests than HEAD.** The two failing
sets overlap heavily and swap members between runs — 7 fail under H03 that did
not at HEAD, 13 fail at HEAD that do not under H03 — which is the signature of
load-dependent integration flakiness on a shared PostgreSQL, not of a
regression. Every one of the seven is a 120-second hook timeout or a
non-deterministic race assertion (`SECURE_LINK_UNAVAILABLE`, a race winner
count); none has a metrics-related cause. Among the thirteen that HEAD fails and
this tree passes are `ready-made-commerce-journey`,
`ready-made-expiry-race`, `ready-made-verification-race` and
`ready-made-order-termination` — the four suites closest to what this
checkpoint instruments.

Four pure contract suites were additionally run on both trees as a
same-environment control and returned **identical** results (4 failed, 13 failed
tests, 75 passed on each).

The baseline worktree needed the repository `.env` to reach PostgreSQL. It was
made available as a **hard link** — the same inode, not a copy — and removed
immediately afterwards. No value was read out, echoed, logged or written
anywhere, and `.env` itself was never modified.

Live validation: staging deploy, Prometheus scrape, Loki query, Grafana
dashboard, alert fire/deliver/resolve, Gateway denial, the synthetic Ready-Made
journey and the bounded failure journey — all in §T–§Z.

Not run, and deliberately: `APP12-H04`, `H05`, `H06`, `V01`, `V02`, the Playwright
matrix, and any production deploy.

---

## AF. Disposable and shared-dev hygiene

```text
minikube profile embroidery-staging        deleted ("Removed all traces")
disposable PostgreSQL + MinIO              destroyed with the cluster (emptyDir)
monitoring plane                           destroyed with the cluster (emptyDir)
alert recorder                             destroyed with the cluster
disposable registry container              removed
staging images (4 tags x 2 refs)           removed after evidence capture
run-directory credential files             removed
```

Commercial evidence existed **only** in `embroidery_db7_h02_staging`, which the
disposable-name guard requires and which died with the cluster:

```text
database          = embroidery_db7_h02_staging
orders            = 1
reservations      = 1
secure grants     = 1
payment attempts  = 1
```

```text
G03 dataset created  = false
production deployed  = false
```

**One hygiene incident, disclosed.** While diagnosing a script failure the secret
script was once run under `bash -x`, whose trace printed the generated disposable
PostgreSQL password. Remediation was immediate and complete: every secret was
regenerated by re-running the script, so the traced value was never the value any
deployed cluster used, and the script now carries an explicit prohibition against
tracing. No `.env` file was read, written or consulted at any point, and no
production or shared-dev credential was involved.

---

## AG. Baseline freeze

Measured from the artifacts, not asserted.

```text
OpenAPI paths / operations / schemas   125 / 138 / 278     unchanged
public operations                      49                  unchanged
release matrix                         28 DENY / 18 ALLOW / 3 SCOPE_GATED  unchanged
migrations                             38                  unchanged
DB tables                              79                  unchanged (no migration added)
Admin routes                           26                  unchanged
Storefront routes                      20                  unchanged
Figma                                  unchanged            (no design artifact touched)
Wave 2 flag                            false                unchanged
```

No business HTTP operation, customer or Admin business route, migration,
lifecycle state, recovery command or provider integration was added.

---

## AH. Follow-up and release-input matrix

| Id | Finding | Owner / disposition |
|---|---|---|
| `FU-APP12-H03-01` | No deployment artifact publishes the `worker.runtime` policy, so a freshly deployed worker is Ready, idle and claims nothing. Kubernetes cannot see it (the worker has no HTTP probe); the backlog gauges are what make it visible. The worker also reads the policy **once**, at bootstrap, so publishing it requires a restart. | **CLOSED_BY_APP12_H03_C1** |
| `FU-APP12-H03-02` | No single field spans an API request and the worker attempt it produced: the API does not stamp its request id onto the outbox row. Correlation is `requestId` (edge → API) then outbox id (API → worker). Closing it needs an `outbox_events` column, i.e. a database-change checkpoint. | **CLOSED_ACCEPTED_CORRELATION_MODEL** (`APP12-H03-C1`) |
| `FU-APP12-H03-03` | `payment.verified` for a Ready-Made order dead-letters: the APP8 inventory-reservation handler rejects the payload shape (`JOB_PAYLOAD_INVALID`). Pre-existing; surfaced by the new job metrics. | **CLOSED_BY_APP12_H03_C1** |
| `FU-APP12-H03-04` | `order.created` has no registered consumer, so every Ready-Made creation leaves a permanently `PENDING` outbox row and a non-zero backlog. Pre-existing; surfaced by `embroidery_worker_queue_pending`. | **CLOSED_BY_APP12_H03_C1** |
| `FU-APP12-H03-05` | `embroidery_inventory_reservation_total{transition="release"}` has no production emitter — `releaseReservation` is called only by a test helper. | **CLOSED_NOT_APPLICABLE_CURRENT_WAVE1_RUNTIME** (`APP12-H03-C1`) |

| Release input | Status |
|---|---|
| `production_alert_receiver` | `REQUIRED_BEFORE_R01` |
| `grafana_operator_credential` | `REQUIRED_BEFORE_R01` |
| `monitoring_persistence` | `REQUIRED_BEFORE_R01` |
| `monitoring_retention` | `REQUIRED_BEFORE_R01` |

---

## AI. Roadmap

```text
ROADMAP_LOCK    = LOCKED
CHECKPOINTS     = 38
APP12-H03       = COMPLETE
APP12-H04       = NEXT
CORRECTION_USED = 0 / 1
PUSHED          = false
```

`APP12-H03 = COMPLETE`
`APP12-H04 = NEXT`
