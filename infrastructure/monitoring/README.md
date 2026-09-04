# monitoring

The Wave-1 monitoring plane (`APP12-H03`). Prometheus, Alertmanager, Loki,
Grafana Alloy and Grafana, plus the alert rules and the dashboard, as
repository source.

## Applying it

```bash
# The applications (unchanged by H03 except for two metrics Services).
kubectl apply -k infrastructure/kubernetes/overlays/staging

# The monitoring plane. A SEPARATE apply, deliberately.
kubectl create secret generic embroidery-grafana-admin \
  --namespace embroidery-staging --from-literal=admin-password='<generated per run>'
kubectl apply -k infrastructure/monitoring
```

Two applies, not one. `APP12-H03` §19 requires that production application
startup does not depend on the monitoring plane, and the mirror of that is that
the monitoring plane must be removable, rebuildable and upgradeable without
touching a commerce resource. A single kustomization would couple them.

The Grafana password is **never** in this repository. It is generated per run
and passed out of band; production is a release input
(`grafana_operator_credential = REQUIRED_BEFORE_R01`).

## Reaching it

Nothing here is routed. Every Service is `ClusterIP` and no `HTTPRoute`
references any of them, so the Prometheus UI, the Alertmanager UI, the Loki API
and Grafana are unreachable from the customer and Admin Gateways — a property of
the topology, not of a rule someone has to maintain. An operator uses
`kubectl port-forward`, which `APP12-H03` §4 permits for staging and which
requires cluster credentials:

```bash
kubectl -n embroidery-staging port-forward svc/embroidery-grafana      3000:3000
kubectl -n embroidery-staging port-forward svc/embroidery-prometheus   9090:9090
kubectl -n embroidery-staging port-forward svc/embroidery-alertmanager 9093:9093
```

## Validating it before applying

Every file here is checked by the tool that owns its format. All four run
without a cluster.

```bash
# Scrape configuration
docker run --rm --entrypoint promtool \
  -v "$PWD/infrastructure/monitoring:/work" prom/prometheus:v3.1.0 \
  check config /work/prometheus/prometheus.yml

# Alert rules — syntax
docker run --rm --entrypoint promtool \
  -v "$PWD/infrastructure/monitoring:/work" prom/prometheus:v3.1.0 \
  check rules /work/prometheus/rules/wave1-commerce.rules.yml

# Alert rules — behaviour (APP12-H03 §16)
docker run --rm --entrypoint promtool -w /work/prometheus/tests \
  -v "$PWD/infrastructure/monitoring:/work" prom/prometheus:v3.1.0 \
  test rules wave1-commerce.rules.test.yml

# Alertmanager routing
docker run --rm --entrypoint amtool \
  -v "$PWD/infrastructure/monitoring:/work" prom/alertmanager:v0.28.0 \
  check-config /work/alertmanager/alertmanager.yml

# Loki
docker run --rm -v "$PWD/infrastructure/monitoring:/work" \
  grafana/loki:3.4.1 -config.file=/work/loki/loki.yml -verify-config

# Alloy
docker run --rm -v "$PWD/infrastructure/monitoring:/work" \
  grafana/alloy:v1.6.1 fmt /work/alloy/config.alloy

# Rendered Kubernetes resources
kubectl kustomize infrastructure/monitoring
```

On Git Bash prefix each `docker run` with `MSYS_NO_PATHCONV=1`, or the mount
path is rewritten into a Windows path and the container sees nothing.

## The two rules that shape everything here

**A metric label is bounded, always.** The contract lives in code, in
`packages/observability/src/metrics/metric-label.ts`, and it is executable: a
label name that ends in `id` or contains a token, address, phone, email, URL or
filename fragment is refused, and a value that is not enumeration-shaped is
refused rather than truncated. Loki labels obey the same rule — namespace, app,
container, pod, level, and nothing else. Every request id, correlation id, job
key and entity id stays a **field inside the JSON line**, queryable with
`| json` and indexed by nothing.

**An alert fires on a system error and never on a business refusal.** A customer
ordering more units than exist, an operator verifying a payment twice, a stale
attempt — those are the business working correctly. `outcome="refused"` reaches
no alert; `outcome="system_error"` reaches all of them. The rule tests in
`prometheus/tests/` prove it by driving refusals at volumes far above every
failure threshold and asserting silence.

## What is deliberately not here

- **No trace backend.** §3 requires correlation, not distributed tracing, and
  the request and job correlation the applications already carry satisfies it.
  Tempo would be a component with no question behind it.
- **No kube-state-metrics, node-exporter or cAdvisor.** Cluster-resource
  telemetry answers a question `APP12-H05` owns.
- **No Promtail.** §13 forbids introducing it; Alloy is its supported successor.
- **No persistent volumes.** Stateful topology is reserved to an ADR
  (`SYSTEM_ARCHITECTURE.md` §13), and inventing a PersistentVolumeClaim here
  would take the decision `APP12-H02` declined to take for PostgreSQL.
  Production persistence and retention are release inputs.
- **No production alert receiver.** §16 forbids inventing Slack, Teams or email
  credentials. The routing tree is complete and proved end to end against a
  recording webhook; production substitutes a URL, not a design.

## Release inputs

| Input | Status |
|---|---|
| `production_alert_receiver` | `REQUIRED_BEFORE_R01` |
| `grafana_operator_credential` | `REQUIRED_BEFORE_R01` |
| `monitoring_persistence` (storage class) | `REQUIRED_BEFORE_R01` |
| `monitoring_retention` | `REQUIRED_BEFORE_R01` |
