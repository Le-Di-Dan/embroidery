# Wave-1 Operations Index

The canonical entry point for operating the Wave-1 (ready-made direct commerce)
release. `APP12-H07` owns this directory.

Wave 1 is **ready-made direct commerce only**. `CUSTOM_EMBROIDERY_RELEASE_ENABLED`
is `false` in every deployed environment, so no runbook here recovers a custom
order, a quotation, a design session or a production job: those operations are
refused at the edge and cannot be in an incident.

## 0. The one rule

**Every recovery in this directory runs through a delivered operation** — a
`kubectl` command against a committed manifest, a repository-owned tool, or an
Admin screen. There is no procedure that repairs business state with SQL, and
there is deliberately no "force paid", "force dispatch" or "release reservation"
command anywhere in this system. If you reach a situation that appears to need
one, you have found a gap in the delivered system: stop, follow
[RB-12 Incident response](RB-12-INCIDENT-RESPONSE.md), and escalate. Do not
invent the missing capability at the psql prompt.

Reading the database is safe and is used throughout. **Writing** to it is not a
recovery mechanism.

## 1. Which runbook

| You have | Go to |
| --- | --- |
| A release to ship | [RB-01 Deployment](RB-01-DEPLOYMENT.md) |
| A schema history to apply | [RB-02 Migration](RB-02-MIGRATION.md) |
| A release to take back | [RB-03 Rollback](RB-03-ROLLBACK.md) |
| A new cluster, or a worker that claims nothing | [RB-04 Staff bootstrap and policy publication](RB-04-STAFF-BOOTSTRAP.md) |
| A credential to change | [RB-05 Secret rotation](RB-05-SECRET-ROTATION.md) |
| A payment that does not match | [RB-06 Payment reconciliation](RB-06-PAYMENT-RECONCILIATION.md) |
| An order that is not moving | [RB-07 Stuck order](RB-07-STUCK-ORDER.md) |
| A job or outbox event that is not draining | [RB-08 Stuck job and outbox](RB-08-STUCK-JOB-AND-OUTBOX.md) |
| Uploads or private images failing | [RB-09 Storage incident](RB-09-STORAGE-INCIDENT.md) |
| "Is it up?" — a symptom with no diagnosis yet | [RB-10 Health diagnostics](RB-10-HEALTH-DIAGNOSTICS.md) |
| A question only the logs or metrics answer | [RB-11 Logs and metrics inspection](RB-11-LOGS-AND-METRICS.md) |
| Something serious, and no diagnosis | [RB-12 Incident response](RB-12-INCIDENT-RESPONSE.md) |
| A backup to take, or a database to restore | [RB-13 Backup and restore](RB-13-BACKUP-AND-RESTORE.md) |
| A go-live to sign off | [RB-14 Go-live checklist](RB-14-GO-LIVE-CHECKLIST.md) |
| **An alert that just fired** | [RB-15 Alert response](RB-15-ALERT-RESPONSE.md) |

## 2. Alert id to procedure

Every alert in `infrastructure/monitoring/prometheus/rules/wave1-commerce.rules.yml`
carries a `runbook` annotation. This table is what that id resolves to. The
alerts carrying each id are named so you can confirm you are in the right place.

| `runbook` annotation | Alerts | Procedure |
| --- | --- | --- |
| `RUNBOOK-H07-API-DOWN` | `EmbroideryApiTargetDown`, `EmbroideryAllApiTargetsDown` | [RB-15 section 1](RB-15-ALERT-RESPONSE.md#1-runbook-h07-api-down) |
| `RUNBOOK-H07-WORKER-DOWN` | `EmbroideryWorkerTargetDown` | [RB-15 section 2](RB-15-ALERT-RESPONSE.md#2-runbook-h07-worker-down) |
| `RUNBOOK-H07-API-5XX` | `EmbroideryApiServerErrorBurst` | [RB-15 section 3](RB-15-ALERT-RESPONSE.md#3-runbook-h07-api-5xx) |
| `RUNBOOK-H07-ORDER-CREATE` | `EmbroideryOrderCreateSystemErrors` | [RB-15 section 4](RB-15-ALERT-RESPONSE.md#4-runbook-h07-order-create) |
| `RUNBOOK-H07-PAYMENT-VERIFY` | `EmbroideryFullVerificationSystemErrors` | [RB-15 section 5](RB-15-ALERT-RESPONSE.md#5-runbook-h07-payment-verify) |
| `RUNBOOK-H07-FULFILMENT` | `EmbroideryFulfilmentSystemErrors` | [RB-15 section 6](RB-15-ALERT-RESPONSE.md#6-runbook-h07-fulfilment) |
| `RUNBOOK-H07-RESERVATION-SWEEP` | `EmbroideryReservationSweepFailing`, `EmbroideryExpiredReservationsHeld` | [RB-15 section 7](RB-15-ALERT-RESPONSE.md#7-runbook-h07-reservation-sweep) |
| `RUNBOOK-H07-WORKER-JOBS` | `EmbroideryWorkerJobFailures`, `EmbroideryWorkerQueueBacklog` | [RB-15 section 8](RB-15-ALERT-RESPONSE.md#8-runbook-h07-worker-jobs) |
| `RUNBOOK-H07-NOTIFICATION` | `EmbroideryOrderAccessDeliveryFailing`, `EmbroideryVerificationDeliveryFailing` | [RB-15 section 9](RB-15-ALERT-RESPONSE.md#9-runbook-h07-notification) |
| `RUNBOOK-H07-TELEMETRY` | `EmbroideryMetricSeriesDropped`, `EmbroideryTelemetryCollectorFailing` | [RB-15 section 10](RB-15-ALERT-RESPONSE.md#10-runbook-h07-telemetry) |

## 3. The system, in the shape an operator needs it

```text
                    Gateway (Gateway API, TLS terminate, HSTS, HTTP->HTTPS 301)
                     |                                    |
      storefront host                             admin host
        / -> Service embroidery-storefront          / -> Service embroidery-admin
     /api -> Service embroidery-api              /api -> Service embroidery-api

  Deployment embroidery-api         2 replicas · RollingUpdate maxUnavailable=0 · probes
  Deployment embroidery-storefront  2 replicas · RollingUpdate maxUnavailable=0 · probes
  Deployment embroidery-admin       2 replicas · RollingUpdate maxUnavailable=0 · probes
  Deployment embroidery-worker      1 replica  · Recreate · NO Service · NO HTTP probe
  Job        embroidery-migrate     the forward-only history, once per release
  Job        embroidery-staff-bootstrap   applied BY HAND, in no kustomization

  PostgreSQL and object storage are EXTERNAL ADDRESSES (DATABASE_URL,
  OBJECT_STORAGE_ENDPOINT). No manifest in this repository owns them.

  Monitoring plane (separate kustomization, ClusterIP only, never routed):
  Prometheus · Alertmanager · Loki · Grafana Alloy (DaemonSet) · Grafana
```

Four facts about that picture cause most confusion, so they are stated here
rather than discovered:

1. **The worker has no Service, no HTTP endpoint and no Kubernetes probe.** Its
   liveness contract is process liveness: a fatal handler exits non-zero and the
   kubelet restarts it. Everything you can learn about the worker comes from its
   **logs** and its **metrics port**, never from `kubectl get endpoints`.
2. **A worker with no `worker.runtime` policy is Ready, healthy-looking, and
   claims nothing.** There is no failing probe and no restart loop. Its only
   external symptom is the outbox backlog gauge. See
   [RB-04](RB-04-STAFF-BOOTSTRAP.md).
3. **The ConfigMap is not hash-suffixed.** Editing it does not roll the pods; a
   config-only change needs an explicit `kubectl rollout restart`. See
   [RB-01](RB-01-DEPLOYMENT.md).
4. **The monitoring plane is not routed.** Grafana, Prometheus and Alertmanager
   are reached with `kubectl port-forward` and cluster credentials, never from
   the customer or Admin hostname.

## 4. Vocabulary an operator has to keep straight

| Word | Where it lives | What it is |
| --- | --- | --- |
| `PENDING` / `DISPATCHED` / `FAILED` / `DEAD_LETTER` | `outbox_events.status` | The **row's** dispatch state |
| `succeeded` / `retrying` / `failed_terminal` | `embroidery_worker_job_attempts_total{outcome=…}` | The **metric's** attempt outcome |
| `success` / `refused` / `system_error` | every commerce metric's `outcome` | Committed · the domain said no · a fault |
| `REQUIRES_REVIEW` | `payment_attempts.status` | A durable, recorded decision — not a form error |
| `SATISFIED` | `payment_obligations.status` | The single source of "this is paid". There is no `PAID` order state |
| `RESERVED` / `CONSUMED` | `inventory_reservations.status` | Held stock · permanently committed stock |

`refused` never pages anyone. A customer ordering more units than exist, an
operator verifying twice, a stale attempt — those are the business working. Only
`system_error` is a fault.

## 5. Severity model

Wave 1 uses the severity the alert rules already carry, and nothing more. There
is no SLA, no customer-communication promise and no on-call rotation in this
repository; inventing one here would be inventing a commitment.

| Severity | Means | Response |
| --- | --- | --- |
| `critical` | Customers cannot buy, or money/credential state may be wrong | Start [RB-12](RB-12-INCIDENT-RESPONSE.md) immediately |
| `warning` | An operator is present and the work is not lost, but something is degrading | Diagnose within the working day |
| (no alert) | A single report from one customer | Diagnose from the order first — [RB-07](RB-07-STUCK-ORDER.md) |

## 6. Conventions used by every runbook

- `NAMESPACE` is written as `embroidery-production` throughout. Substitute your
  own; nothing else changes.
- Commands are given exactly as they are run. Where a value is externally owned
  it appears as an angle-bracket placeholder and is **never** invented here.
- Every runbook has the same nine headings: trigger, preconditions, safe
  observations, actions, expected state, abort, escalate, verification,
  forbidden. Read "forbidden" before you act, not after.

## 7. What is not here, and why

- **No production Gateway API controller, PostgreSQL topology or object-storage
  topology.** These are ADR-reserved (`FU-APP12-H02-05`,
  `REQUIRED_BEFORE_R01`). Runbooks parameterize them by name and never invent an
  address, a storage class or a vendor procedure. See
  [RB-14](RB-14-GO-LIVE-CHECKLIST.md).
- **No production alert receiver.** Alertmanager's route tree is delivered; the
  destination is a release input (`production_alert_receiver`).
- **No off-site or encrypted backup.** The repository owns `db:backup` and
  `db:restore`; off-site copy and encryption at rest are deferred and
  production-blocking. See [RB-13](RB-13-BACKUP-AND-RESTORE.md).
- **No down-migration.** The history is forward-only. "Rollback" means the
  application image, never the schema. See [RB-03](RB-03-ROLLBACK.md).
