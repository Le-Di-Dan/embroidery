# RB-08 — Stuck job and outbox

Work that is not draining: a job that is not being claimed, one that is retrying
forever, one that has dead-lettered, or a notification that never arrived.

Authority: `packages/database/src/schema/platform/outbox-events.ts`,
`apps/worker/src/runtime/`,
`packages/database/seed/worker-runtime-policy.seed.json`,
`docs/implementation/reports/APP12-H04-C1-COMPLETION-REPORT.md`.

## The model, in the shape a diagnosis needs it

One table, `outbox_events`, is both the queue and the record. Its status column
is the row's dispatch state and has exactly four values:

```text
PENDING      due, or waiting out a backoff, or waiting for a handler that can claim it
DISPATCHED   done
FAILED       an attempt failed and the retry budget is not spent
DEAD_LETTER  the retry budget is spent; nothing will try again
```

Do not confuse those with the **metric** outcome labels — `succeeded`,
`retrying`, `failed_terminal` — which describe one attempt, not the row.

The mutable columns are exactly `status`, `attempt_count`, `next_attempt_at`,
`claimed_by`, `claimed_at`, `dispatched_at`, `last_error`. The payload and the
event identity are immutable and a database trigger enforces it. There is
deliberately no `updated_at`.

The delivered claim/retry policy (`worker.runtime`, published by
[RB-04](RB-04-STAFF-BOOTSTRAP.md)):

```text
concurrency 2 · batchSize 5 · pollIntervalMs 500 · leaseDurationMs 120000
handlerTimeoutMs 60000 · leaseSafetyMarginMs 5000 · shutdownGraceMs 10000
maxAttempts 3 · backoffBaseMs 1000 · backoffMaxMs 30000
```

**Three attempts, then dead letter.** A `failed_terminal` attempt is by
definition not transient — the retry budget has already absorbed everything that
was.

## Before you diagnose a missing notification: no provider is integrated

```text
NOTIFICATION_PROVIDER = NOT_INTEGRATED   (REQUIRED_BEFORE_R01)
```

The only channel adapter bound in **every** deployment is the recording
development adapter. It makes no network call, opens no socket, loads no SDK,
and writes to no table, file or log: it appends the message to an array in the
worker process's memory, and that array dies with the process.

So in every currently deployable configuration, a notification that reaches
`DISPATCHED` has been **delivered to nobody**. `DISPATCHED` means the worker
handed the message to the bound channel and the channel accepted it — nothing
more.

If a customer did not receive a code or an order-access link and the outbox row
is `DISPATCHED`, the job worked and there is no delivery fault to find. That is
the missing provider, and it is a
[go-live blocker](RB-14-GO-LIVE-CHECKLIST.md), not an incident. Everything below
diagnoses the queue, which is a different question.

## Trigger

- `EmbroideryWorkerQueueBacklog` or `EmbroideryWorkerJobFailures`
  ([RB-15 section 8](RB-15-ALERT-RESPONSE.md#8-runbook-h07-worker-jobs)).
- `EmbroideryOrderAccessDeliveryFailing`
  ([RB-15 section 9](RB-15-ALERT-RESPONSE.md#9-runbook-h07-notification)).
- A customer did not receive an order-access link or a verification code.
- The backlog gauge is rising and not falling.

## Preconditions

- Cluster read access, and a `port-forward` to Grafana
  ([RB-11](RB-11-LOGS-AND-METRICS.md)).
- Read-only database access for the persisted facts.

## The diagnostic path — Grafana, then Prometheus, then Loki, then the rows

Follow it in that order. Each step narrows the next one, and the last step is
the only one that touches the database.

### Step 1 — Grafana: is anything claiming at all?

Dashboard *Wave 1 Commerce Operations*, row **Is the worker processing and
retrying?** Three panels answer three different questions:

| Panel | Reading | Means |
| --- | --- | --- |
| *Queue backlog* | rising, and *Job attempts by outcome* is flat at zero | **Nothing is claiming.** Go to case A. |
| *Job attempts by outcome* | `retrying` climbing | Something is failing and being retried. Case C. |
| *Job attempts by outcome* | `failed_terminal` non-zero | Rows have dead-lettered. Case D. |
| *Retries by job type* | one `job_type` dominating | The failure is one capability, not the worker. |

Backlog here is **due** work only. A job waiting out its retry backoff is not
backlog; counting it would make every transient failure look like a stuck queue.
Age is measured from `created_at` — "how long has anything been stuck".

### Step 2 — Prometheus: which kind, and is it even registered?

```promql
embroidery_worker_queue_pending
embroidery_worker_queue_oldest_pending_age_seconds
sum by (job_type) (increase(embroidery_worker_job_claimed_total[15m]))
sum by (job_type, outcome) (increase(embroidery_worker_job_attempts_total[15m]))
sum by (operation, outcome, reason_class) (increase(embroidery_notification_delivery_total[15m]))
```

`job_type="UNKNOWN_JOB_TYPE"` on the claim counter is its own signal: an event
type was claimed that has no registered handler. The event type is an open
vocabulary and can never be a metric label, so a non-zero rate on that series
**is** the diagnosis.

### Step 3 — Loki: what did the worker actually say?

```logql
{namespace=~"embroidery.*", app="worker"} | json | jobKind = "NOTIFICATION_DELIVERY"
```

and, to follow one specific row end to end — `jobKey` is the outbox event id:

```logql
{namespace=~"embroidery.*", app="worker"} | json | jobKey = "<outbox event id>"
```

That query alone diagnosed a dead-lettered event with no database session at
all:

```text
jobKind=INVENTORY_RESERVATION outcome=FAILED_TERMINAL
errorClass=JOB_PAYLOAD_INVALID eventType=payment.verified
```

`requestId` and `correlationId` are log **fields**, never labels — which is why
they are matched with `| json | field = …` or a bare `|=`, not selected with
`{}`.

The accepted limitation: **no single field spans an API request and the worker
attempt it produced.** The API does not stamp its request id onto the outbox row.
The chain is `requestId` (edge to API), then the outbox id (API to worker),
joined by the row rather than by one value.

### Step 4 — the persisted facts (read-only)

```sql
SELECT status, count(*) FROM outbox_events GROUP BY status;

SELECT id, event_type, aggregate_kind, status, attempt_count,
       next_attempt_at, claimed_by, claimed_at, left(last_error, 200) AS last_error,
       created_at
  FROM outbox_events
 WHERE status IN ('PENDING', 'FAILED', 'DEAD_LETTER')
 ORDER BY created_at
 LIMIT 50;
```

The three columns that separate every case below are `attempt_count`,
`claimed_by` and `last_error`.

## Cases

### Case A — `PENDING`, `attempt_count = 0`, `claimed_by` null, never claimed

The row has never been offered to a handler. Two causes, and they are
distinguishable.

**A1 — no `worker.runtime` policy.** The worker is Ready, has no failing probe,
no restart loop, and claims **nothing at all**. Every job kind is affected.

```sh
kubectl -n embroidery-production logs deploy/embroidery-worker --tail=200 \
  | grep -iE 'WORKER_POLICY_MISSING|WORKER_POLICY_INVALID|not configured'
```

One deduped line, not a flood. **Recovery: [RB-04](RB-04-STAFF-BOOTSTRAP.md).**
The worker adopts a newly published policy in about five seconds, with no
restart, and every held row is then claimed normally with its full attempt
budget intact.

**A2 — a closed claim gate on one capability.** Only one job kind is affected;
the rest of the worker is working. The delivered instance is
`notification.delivery`: with no published policy, that handler is omitted from
the claim filter, so its rows are never claimed rather than being attempted and
burned.

```sh
kubectl -n embroidery-production logs deploy/embroidery-worker --tail=200 \
  | grep -iE 'CAPABILITY_POLICY_MISSING|notification.delivery'
```

**This is the design, and it is worth understanding before you act on it.** A
missing policy costs a notification its *delivery time*, never its *life*: the
row stays `PENDING` with `attempt_count = 0`, is not dead-lettered, spends no
attempt budget, and is delivered exactly once when the policy arrives. Held for
80 seconds — twenty times the window that previously destroyed these
credentials — the rows were untouched, and were all delivered within five
seconds of publication with zero restarts.

**Recovery: [RB-04](RB-04-STAFF-BOOTSTRAP.md).** Nothing else, and nothing
sooner.

**A3 — no registered handler for the event type.** An event type nothing
consumes is never claimed at all, and its row stays `PENDING` forever with no
error anywhere. It shows up as a backlog that never drains while every other
kind flows normally, and `UNKNOWN_JOB_TYPE` may appear on the claim counter.
This is a **release defect**, not an operator condition: escalate. Do not delete
the rows.

### Case B — `PENDING` with `next_attempt_at` in the future

The row is waiting out its backoff. `attempt_count` is 1 or 2. **This is not
stuck.** Backoff is exponential from 1s, capped at 30s, three attempts total.
Wait, and watch `attempt_count`.

### Case C — `FAILED`, retrying

Read `last_error` and the Loki records for that `jobKey`. The retry budget will
either absorb it or exhaust it within roughly a minute. The question is whether
the cause is transient (database blip, storage outage) or permanent (a payload
the handler rejects).

- Transient: fix the dependency. [RB-09](RB-09-STORAGE-INCIDENT.md) for storage,
  [RB-10](RB-10-HEALTH-DIAGNOSTICS.md) for the database. The retries will
  succeed on their own.
- Permanent: it will dead-letter. Go to case D.

### Case D — `DEAD_LETTER`

The budget is spent. Nothing will try again, and **there is no generic requeue
command**. This is deliberate: a queue that anyone can replay is a queue in which
an effect can happen twice, and the effects here are money and credentials.

What you can do depends on what dead-lettered.

**A notification** — and this is the case that reaches a customer — has a
delivered, guarded replay:

Admin UI: `https://<admin-host>/support/customer-access`. Find the notification
(masked destination, template, attempt timeline with a bounded failure class per
attempt) and replay it.

API:

```sh
curl -sS --cookie <admin session> \
  'https://<admin-host>/api/admin/notification-intents?status=FAILED'

curl -sS -X POST --cookie <admin session> \
  https://<admin-host>/api/admin/notification-intents/<intentId>/replay
```

What replay is and is not:

- It is a **transport** replay. The original code or link is re-delivered
  exactly as it was sealed. **Nothing new is minted.**
- The original notification stays `FAILED` and its dead-lettered delivery record
  is left untouched. A *new* notification is created with a fresh delivery
  budget.
- Replaying twice returns the same replay rather than sending again. `outcome`
  says which: `CREATED` or `EXISTING`.
- `409 REPLAY_NOT_APPLICABLE` — it did not fail delivery; there is nothing to
  replay.
- `409 REISSUE_REQUIRED` — the code or link has expired, been used, been revoked
  or been superseded. Issue a new one through the customer flow. **Do not try to
  reconstruct it.**
- `409 REPLAY_SOURCE_UNAVAILABLE` — no single dead-lettered delivery record to
  replay from.

**Anything else** that dead-lettered has no replay operation, by design. Read
`last_error` and the Loki record, establish the business consequence from the
aggregate the row points at — `aggregate_kind` / `aggregate_id` are a
deliberately polymorphic reference with no foreign key — and recover through the
owning surface:

| Dead-lettered | Where the truth is | What to do |
| --- | --- | --- |
| a notification | `notification_intents` | replay, above |
| an inventory reservation event | the order and its reservation | [RB-07](RB-07-STUCK-ORDER.md); verification already commits the reservation in its own transaction |
| an order acknowledgement | the order | [RB-07](RB-07-STUCK-ORDER.md) — the order itself is unaffected |
| anything with `JOB_PAYLOAD_INVALID` | — | a release defect. Escalate. |

If a customer-visible effect genuinely did not happen and there is no delivered
operation that can make it happen, that is a `BLOCKED` finding to record and
escalate — not a row to hand-edit.

### Case E — the worker is not running at all

[RB-15 section 2](RB-15-ALERT-RESPONSE.md#2-runbook-h07-worker-down).

Note that a worker *deployment* legitimately has a gap: the worker is `Recreate`
with one replica, because with one claiming process and no broker an overlapping
old and new pod would be a double claim. A rising backlog during a deploy is
expected. It must fall afterwards.

### Case F — rows claimed by a worker that no longer exists

`claimed_by` names a pod that is gone and `claimed_at` is older than the
120-second lease. The lease expires and the row is reclaimed by the live worker
automatically. Wait two minutes before doing anything. Do **not** clear
`claimed_by` by hand.

## Expected state

```text
outbox_events PENDING     -> falling to 0, or only rows with a future next_attempt_at
embroidery_worker_queue_oldest_pending_age_seconds  -> falling
embroidery_worker_job_attempts_total{outcome="succeeded"}  -> increasing
DEAD_LETTER               -> not growing
```

## Abort condition

- `DEAD_LETTER` is growing while you work. Something is systematically failing;
  stop diagnosing individual rows and go to
  [RB-12](RB-12-INCIDENT-RESPONSE.md).
- A dead-lettered `ORDER_ACCESS` notification cannot be replayed
  (`REISSUE_REQUIRED`). The customer has an order they cannot open and the link
  is gone. That is a customer-facing incident.
- You are about to write to `outbox_events`.

## Escalation condition

- Case A3: an event type with no registered consumer. A release defect.
- `JOB_PAYLOAD_INVALID`: a producer and a consumer disagree about a payload
  shape. A release defect.
- A dead-lettered job whose effect matters and for which no delivered recovery
  operation exists.

## Verification

```promql
embroidery_worker_queue_pending                      # reaches 0
embroidery_worker_queue_oldest_pending_age_seconds   # reaches 0
sum(increase(embroidery_worker_job_attempts_total{outcome="failed_terminal"}[15m]))  # 0
```

```sql
SELECT status, count(*) FROM outbox_events GROUP BY status;
```

A backlog that is *lower* is not proof. A backlog that reaches zero is. For a
replayed notification, confirm the **new** notification reached `DISPATCHED` —
the original stays `FAILED`, and that is correct.

## Recovery / rollback

There is nothing to roll back. Every recovery here is either "the worker resumes
and drains", or "a delivered guarded operation creates new work". Nothing edits
a historical record.

## Forbidden actions

- `UPDATE outbox_events SET status = 'PENDING'` — or any other write to that
  table. The immutable columns are trigger-protected; the mutable ones belong to
  the dispatcher, and rewriting them is how one effect happens twice.
- `DELETE FROM outbox_events`, including for dead-lettered rows. They are the
  record of what did not happen.
- Clearing `claimed_by` or `claimed_at` to force a reclaim. The lease expires on
  its own in 120 seconds.
- Restarting the worker in a loop to "unstick" it. Restarting does not change
  the claim filter, the policy or the payload; it only hides which of the three
  is the cause.
- Replaying a notification by reconstructing a link or a code. A replay
  re-delivers the sealed original; a link that is no longer valid is reissued
  through the customer flow, never rebuilt.
- Editing `policy_configurations` to open a claim gate. See
  [RB-04](RB-04-STAFF-BOOTSTRAP.md).
