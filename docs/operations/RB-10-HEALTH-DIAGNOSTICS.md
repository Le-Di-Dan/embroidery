# RB-10 — Health diagnostics

Turning a symptom into a diagnosis. Start here when you do not yet know what is
wrong.

## The triage order

Work **outside in**. Each layer below depends on the ones above it, so a failure
high up explains everything below and there is no point diagnosing the API while
DNS is broken.

```text
1  DNS / TLS / Gateway edge
2  Storefront  ·  Admin
3  API
4  Worker
5  PostgreSQL
6  Object storage
7  Monitoring plane  (Prometheus · Alertmanager · Loki · Grafana)
```

Layer 7 is last on purpose: **the application does not depend on the monitoring
plane.** The metrics listener is started with a reported failure rather than a
thrown one, and both applications have been observed serving the full commerce
journey while Prometheus, Loki and Grafana were still starting. A broken
dashboard is never the cause of a broken checkout.

## Layer 1 — Gateway, TLS, DNS

```sh
curl -sSI  https://<storefront-host>/            # 200, and HSTS present
curl -sSI  http://<storefront-host>/             # 301 to https
curl -sSI  https://<admin-host>/                 # 200
openssl s_client -connect <storefront-host>:443 -servername <storefront-host> \
  < /dev/null 2>/dev/null | openssl x509 -noout -dates -subject
kubectl -n embroidery-production get gateway,httproute
kubectl -n embroidery-production describe gateway embroidery | tail -30
```

| Symptom | Diagnosis |
| --- | --- |
| DNS does not resolve | Outside the cluster entirely |
| TLS handshake fails | `embroidery-tls` — [RB-05](RB-05-SECRET-ROTATION.md) |
| Gateway not `Programmed` | No controller for `gatewayClassName`, or the class is unset |
| `HTTPRoute` not `Accepted` | Hostname mismatch, or no parent Gateway |
| `502` / `503` from the edge with the Gateway healthy | No ready backend — go to layer 2 or 3 |
| HTML `504` after ~60s | A backend exceeded the edge timeout. If the route is an asset or evidence route, go to [RB-09](RB-09-STORAGE-INCIDENT.md) |

## Layer 2 — Storefront and Admin

```sh
curl -sS -o /dev/null -w '%{http_code}\n' https://<storefront-host>/healthz
curl -sS -o /dev/null -w '%{http_code}\n' https://<admin-host>/healthz
kubectl -n embroidery-production get pods -l app.kubernetes.io/component=storefront
kubectl -n embroidery-production logs deploy/embroidery-storefront --tail=100
```

```logql
{namespace=~"embroidery.*", app=~"storefront|admin", level="error"}
```

To separate an edge fault from an application fault, reach the app directly and
bypass the Gateway. The two Services listen on **different** ports — the
Storefront on 3000, the Admin on 3001:

```sh
kubectl -n embroidery-production port-forward svc/embroidery-storefront 3100:3000
kubectl -n embroidery-production port-forward svc/embroidery-admin      3102:3001
kubectl -n embroidery-production port-forward svc/embroidery-api        4100:4000
```

A page that answers 200 here and fails through the Gateway is a layer-1 problem.

| Symptom | Diagnosis |
| --- | --- |
| `/healthz` 200 but pages 500 | A server-render fault. Read the Loki query above |
| `/sitemap.xml` or `/robots.txt` 500 | `STOREFRONT_PUBLIC_ORIGIN` is unset. There is **no fallback**, by design |
| A withheld Wave-2 route answers 200 | The release flag is wrong — check `release.gate.configured` in the API log and the ConfigMap |
| Contact links missing | The `NEXT_PUBLIC_*` values were not passed as build args. Requires a **rebuild**, not a config change |

## Layer 3 — API

```sh
curl -sS https://<admin-host>/api/health              # liveness
curl -sS https://<admin-host>/api/health/readiness    # readiness — checks the database
kubectl -n embroidery-production get pods -l app.kubernetes.io/component=api
kubectl -n embroidery-production describe pod <api pod> | tail -40
kubectl -n embroidery-production logs deploy/embroidery-api --tail=200
```

Probes: liveness `/api/health` every 20s (3 failures), readiness
`/api/health/readiness` every 10s (3 failures), startup `/api/health` every 5s
with 30 failures allowed. Health and readiness are excluded from the HTTP metric
family, so they never inflate the request counters.

| Pod state | Diagnosis |
| --- | --- |
| `ImagePullBackOff` | Bad image reference. [RB-01](RB-01-DEPLOYMENT.md) |
| `CreateContainerConfigError` | A required Secret or key is missing. Fail-closed working correctly — [RB-05](RB-05-SECRET-ROTATION.md) |
| `CrashLoopBackOff` | Read the first 40 log lines: a startup guard rejected a configuration value by **name** |
| Running, readiness 503 | The database check is failing — layer 5 — or the pod is **terminating** |
| Ready, but 5xx | [RB-15 section 3](RB-15-ALERT-RESPONSE.md#3-runbook-h07-api-5xx) |

**Readiness 503 during a rollout is correct, not a fault.** On `SIGTERM` the API
reports 503 immediately while a 10-second `preStop` holds the pod serving, so
endpoint removal reaches the Gateway before the process stops accepting
connections. The whole drain is bounded at 45 seconds.

Startup guards fail closed and name the variable, never the value. The one most
often met: `DATABASE_SSL_MODE "disable" is not permitted when
NODE_ENV=production`. **Do not relax a guard to make a pod start** — a
configuration production can never use is not evidence of anything.

## Layer 4 — Worker

The worker has **no Service, no HTTP endpoint and no Kubernetes probe**. Do not
look for endpoints; there are none. Three signals only:

```sh
kubectl -n embroidery-production get pods -l app.kubernetes.io/component=worker
kubectl -n embroidery-production logs deploy/embroidery-worker --tail=200
```

```promql
up{job="embroidery-worker"}
embroidery_worker_queue_pending
embroidery_worker_queue_oldest_pending_age_seconds
```

Confirm a healthy boot by its two closing lines. A worker that printed neither
is half-started — see
[RB-15 section 2](RB-15-ALERT-RESPONSE.md#the-half-started-worker):

```sh
kubectl -n embroidery-production logs deploy/embroidery-worker --tail=40 \
  | grep -E 'Worker metrics listening|Worker readiness'
```

| Signal | Diagnosis |
| --- | --- |
| `up == 0`, and neither line above appears | The half-started worker — restart it ([RB-15 section 2](RB-15-ALERT-RESPONSE.md#the-half-started-worker)) |
| `up == 0` | The process is gone or the metrics listener is not bound |
| Ready, `up == 1`, backlog rising, no attempts | **Ready and claiming nothing.** [RB-04](RB-04-STAFF-BOOTSTRAP.md) |
| Restart count climbing | A fatal handler is exiting non-zero. Read the logs |
| Backlog rising during a deploy | Expected — `Recreate`, one replica. It must fall afterwards |

## Layer 5 — PostgreSQL

The database is an **external address**. This repository owns no manifest for
it. The application's own view of it is the readiness endpoint.

```sh
curl -sS https://<admin-host>/api/health/readiness
kubectl -n embroidery-production logs deploy/embroidery-api --tail=200 | grep -i -E 'persistence|database'
```

```promql
sum by (operation) (increase(embroidery_dependency_errors_total{dependency="database"}[15m]))
```

Read-only checks, from a session you already have:

```sql
SELECT 1;
SELECT count(*) FROM pg_stat_activity;
SELECT count(*) FROM drizzle.__drizzle_migrations;   -- 38 at the Wave-1 baseline
```

A readiness endpoint that answers 503 with a database reason **after** a
successful rollout usually means the image and the schema disagree — go to
[RB-02](RB-02-MIGRATION.md).

## Layer 6 — Object storage

[RB-09](RB-09-STORAGE-INCIDENT.md). The signature is a response at about
**20 seconds**.

## Layer 7 — Monitoring plane

Nothing here is routed. Every Service is `ClusterIP` and no `HTTPRoute`
references any of them, so Grafana, Prometheus and Alertmanager are unreachable
from the customer and Admin hostnames — a property of the topology, not of a
rule someone maintains.

```sh
kubectl -n embroidery-production port-forward svc/embroidery-grafana      3000:3000
kubectl -n embroidery-production port-forward svc/embroidery-prometheus   9090:9090
kubectl -n embroidery-production port-forward svc/embroidery-alertmanager 9093:9093
```

| Symptom | Diagnosis |
| --- | --- |
| Grafana 401 anonymously | Correct. The dashboards are not public |
| A dashboard panel is empty | Either the series has no data, or the collector is failing — [RB-15 section 10](RB-15-ALERT-RESPONSE.md#10-runbook-h07-telemetry) |
| A dashboard change will not save | Correct. Provisioned with `editable: false` and `allowUiUpdates: false`, so the file on disk and the dashboard you are looking at can never diverge |
| No logs in Loki for one pod | Alloy collects only pods on its own node; check the DaemonSet |

## Symptom-to-layer map

| A customer says | Start at |
| --- | --- |
| "The site will not load" | 1 |
| "The site loads but nothing works" | 3 |
| "I cannot check out" | 3, then [RB-15 section 4](RB-15-ALERT-RESPONSE.md#4-runbook-h07-order-create) |
| "I paid and nothing happened" | [RB-06](RB-06-PAYMENT-RECONCILIATION.md) |
| "I never got my link" | [RB-08](RB-08-STUCK-JOB-AND-OUTBOX.md) |
| "The images will not load" | 6 |
| "My order has not moved" | [RB-07](RB-07-STUCK-ORDER.md) |
| An operator says "Admin will not save" | 3, then 5 |

## Forbidden actions

- Restarting a pod before reading its logs. The restart destroys the evidence
  and the fault usually returns.
- Relaxing a startup guard, a TLS mode or a validation rule to make something
  start.
- Scaling the worker above one replica. One claiming process, no broker: two
  pods are a double claim.
- `kubectl edit` on a live resource. The next `apply -k` reverts it and the
  diagnosis becomes unreproducible.
- Deleting a Deployment to reset it.
