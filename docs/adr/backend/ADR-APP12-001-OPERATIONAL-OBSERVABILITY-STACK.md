# ADR-APP12-001 — Operational Observability Stack

- Status: Accepted
- Date: 2026-09-03
- Phase / checkpoint: APP12 / `APP12-H03`
- Decision ID: IMP-D064 (resolves the CP0 "observability tooling" boundary
  recorded in `packages/observability/README.md`)
- Supersedes: none
- Depends on (not reopened): `APP0-B05` (structured log schema, request
  correlation), `ADR-APP2-002` / IMP-D029 (job runtime and its retry budget),
  `APP12-H01` (log redaction policy), `APP12-H02` (Kubernetes deployment model,
  Gateway API edge)

## Context

`CLAUDE.md` §8 lists no observability vendor among the open decisions by name,
but `packages/observability/README.md` has carried a standing boundary since
CP0: *"Observability tooling/vendor is an open decision. No vendor SDK may be
added here without an ADR."* The package has been an empty `export {}` ever
since.

`APP12-H03`'s phase-entry evidence measured what existed:

```text
structured logs            = DEV_WIRED
request id                 = DEV_WIRED
cross-service correlation  = CODE_EXISTS, end-to-end unproven
worker/job correlation     = CODE_EXISTS
audit events               = CODE_EXISTS
metrics                    = MISSING
Prometheus/Grafana/Loki    = MISSING
dashboards                 = MISSING
alerts                     = MISSING
```

So the applications could already *say* what happened, in a correlated,
redacted, one-line-JSON form — and nothing collected it, nothing counted it and
nothing noticed when it went wrong. An operator diagnosing a failed checkout had
one option: a `psql` session against the production database. That is precisely
the outcome the locked roadmap forbids ("without unsafe DB manipulation").

This ADR selects the stack that closes it.

## Decision

### D1 — Prometheus is the metrics protocol and store

Metrics are exposed in the Prometheus text exposition format (version 0.0.4) and
scraped by Prometheus. Alerting is Prometheus rules evaluated against those
metrics.

**Why not push, and why not a hosted vendor.** A pull model needs no credential
in the application, no outbound network path from a commerce pod, and no vendor
account. The application's obligation ends at "answer an HTTP GET on an internal
port", which is testable in a unit suite and has no failure mode that can affect
a customer. A hosted vendor would add an egress dependency to the commerce pods
and an account nobody has provisioned; `APP12-H03` §19 requires that application
startup not depend on the monitoring plane, and a push client is the easiest way
to violate that accidentally.

### D2 — Loki is the log store, Grafana Alloy the collector

Application stdout is collected by a Grafana Alloy DaemonSet and stored in Loki.

**Why not Elasticsearch.** Loki indexes labels, not content. The applications
already emit one JSON object per line with the correlation fields inside it, so
full-text indexing would buy nothing that `| json | requestId = "…"` does not,
at several times the memory.

**Why Alloy and not Promtail.** `APP12-H03` §13 forbids introducing Promtail,
and it is right to: Promtail is in maintenance and takes no new features. Alloy
is its supported successor and the collector the Grafana stack is converging on.

### D3 — Grafana is the dashboard, Alertmanager the notifier

Dashboards are provisioned from repository source with `allowUiUpdates: false`,
so a dashboard cannot be edited in the browser and silently diverge from the
file that defines it.

### D4 — No trace backend

`APP12-H03` §3 is explicit: `CORRELATION = REQUIRED`, `FULL TRACE BACKEND = NOT
REQUIRED` unless one already exists. None does. The request id crosses the
Gateway into the API, into the outbox row, into the worker's job correlation and
into every log record on the way, and that chain is what makes a journey
followable. Tempo would be a component with an operational cost and no question
behind it.

**This is a deliberate limitation, not an oversight.** There are no spans, no
latency waterfalls and no automatic service maps. Correlation is by field
equality in Loki. Should the topology grow past two services, revisit.

### D5 — No vendor SDK in `@embroidery/observability`

The CP0 boundary is **kept**, not lifted. `@embroidery/observability` has an
empty dependency list and implements the cardinality contract, the three
instrument types, the registry, the text exposition and the internal listener in
plain TypeScript over Node builtins.

`prom-client` was the obvious alternative and was rejected. The reason is not
purism about dependencies — it is that the privacy contract has to be
*unbypassable*. With a client library in the process, any code can reach the
default registry and mint a metric whose label carries an order id, and the
contract becomes a convention. With the implementation here,
`metric-label.ts` is the only path a label can take to a scrape, and a
forbidden one is a thrown `MetricContractError` in a unit test rather than a
customer's phone number in a production time series. The exposition format that
buys this is forty lines.

Prometheus, Loki, Grafana, Alloy and Alertmanager are **deployed components**,
not libraries linked into the applications. The boundary the README protects —
no vendor SDK inside the package — is unchanged by deploying them.

### D6 — Operational metrics are not a business API

The scrape is served by a dedicated `node:http` listener on port 9464, not by a
NestJS controller. Three properties follow structurally rather than by rule:

- it is absent from the OpenAPI document, because the generator cannot see a
  route that is not a controller;
- it is unreachable from the Gateway, because the Gateway routes to a different
  port and no `HTTPRoute` references the metrics Service;
- it is outside the business request pipeline, so no guard, interceptor,
  envelope or release gate applies to it — and none can start applying to it by
  accident.

The worker gains this listener too. It is **not** the HTTP worker endpoint
`APP12-H02` §9 refused to invent: it is not a probe target, no probe references
it, and a failure to bind it is logged and stepped over. The worker's liveness
contract remains process liveness.

### D7 — Alerts fire on system errors, never on business refusals

Every commerce metric carries `outcome ∈ {success, refused, system_error}`. A
refusal is a rule the domain published and declined under; a system error is
everything else, *including an error nobody has classified yet*. Every alert
rule matches `system_error`.

The asymmetry is the decision. Classifying an unknown error as a refusal would
let a new failure mode join the "customer ordered too many units" series and
never wake anyone; classifying it as a failure produces, at worst, an alert
that turns out to be a refusal someone forgot to publish — which is a bug
report.

### D8 — Thresholds are initial operational thresholds, not SLOs

This shop does fewer than a hundred orders a month. A burn-rate SLO on that
volume is arithmetic noise. Commerce alerts therefore use **absolute
system-error counts over a window**, and every one is labelled
`threshold_authority: INITIAL_OPERATIONAL_THRESHOLD`. Where a delivered budget
already exists — the reservation window (`BR-025`/`BR-026`), the job retry
schedule — the rule uses it and says so (`DOMAIN_DEADLINE`, `RETRY_BUDGET`).

No service-level objective is declared by this ADR, and none may be inferred
from these numbers.

## Consequences

**Positive.**

- An operator answers every question `APP12-H03` §14 lists from one dashboard,
  with no SQL and no database session.
- The cardinality and privacy contract is executable and unit-tested, so
  breaking it is a red test rather than a production incident.
- The monitoring plane deploys, fails and upgrades independently of commerce.

**Negative, and accepted.**

- No traces. See D4.
- No cluster-resource telemetry (kube-state-metrics, node-exporter, cAdvisor).
  `APP12-H05` owns performance measurement.
- The exposition format is hand-written and must track the Prometheus text
  format if it ever changes. It has not changed since 2014.
- The metrics store and the log store are ephemeral in this checkpoint.
  Production persistence is a release input, not a decision this ADR takes —
  stateful topology is reserved to a separate ADR by
  `SYSTEM_ARCHITECTURE.md` §13, and `APP12-H02` §5 forbids moving persistence
  between in-cluster and managed in either direction.

## Release inputs this ADR does not resolve

```text
production_alert_receiver     = REQUIRED_BEFORE_R01
grafana_operator_credential   = REQUIRED_BEFORE_R01
monitoring_persistence        = REQUIRED_BEFORE_R01
monitoring_retention          = REQUIRED_BEFORE_R01
```

Each is a value an operator supplies. `APP12-H03` §16 and §19 forbid inventing
any of them, and no code path in this checkpoint depends on one being present.

## Pinned versions

No `latest`, anywhere.

```text
prom/prometheus     v3.1.0
prom/alertmanager   v0.28.0
grafana/loki        3.4.1
grafana/alloy       v1.6.1
grafana/grafana     11.5.1
```
