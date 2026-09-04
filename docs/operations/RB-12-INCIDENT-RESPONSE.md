# RB-12 — Incident response

The wrapper around every other runbook. Use it when something is seriously wrong
and you do not yet know what.

## Severity

The model is the one the alert rules already carry. Nothing more is invented
here: this repository declares no SLA, no response-time commitment and no
customer-communication promise, and writing one into a runbook would be
inventing a commitment nobody has made.

| Severity | Definition | Examples |
| --- | --- | --- |
| `critical` | Customers cannot buy, or money or credential state may be wrong | Every API pod unreachable · order creation throwing · payment verification throwing · an `ORDER_ACCESS` link undelivered · a credential exposed |
| `warning` | An operator is present, the work is not lost, but something is degrading | A fulfilment transition failing · the expiry sweep failing · verification codes failing · a job exhausting retries · telemetry incomplete |
| `none` | A single customer report with no alert | One order not moving |

The alert rules are the authority on which of these an event is. Do not reclassify
an alert during an incident; if a threshold is wrong, that is a change made after
the incident, in the repository.

## 1. Declare

State four things, in writing, before doing anything else:

```text
what is the symptom          (observed, not inferred)
who is affected              customers? operators? one order?
when did it start            from the dashboard, not from memory
severity                     from the table above
```

Name **one owner**. Everyone else observes. Two people acting on the same
production system is how a small incident becomes a compound one.

## 2. Stabilize

The goal is stopping the bleeding, not finding the cause.

Ask, in order:

1. **Did a release just happen?** `kubectl -n embroidery-production rollout
   history deploy/embroidery-api`. If the timing matches, roll back —
   [RB-03](RB-03-ROLLBACK.md) — and diagnose afterwards. A rollback is cheap and
   reversible; a live investigation under load is neither.
2. **Is the fault upstream of us?** Database, object storage, DNS, the Gateway
   controller. Nothing in the application recovers a dependency, and restarting
   pods against a broken dependency only destroys evidence —
   [RB-10](RB-10-HEALTH-DIAGNOSTICS.md).
3. **Is it fail-closed behaviour working?** A great deal of what looks alarming
   here is the system refusing correctly: a missing Secret leaving a pod
   unschedulable, a startup guard rejecting a configuration, a worker claiming
   nothing because no policy is published, a `409` on a replayed command.
   **Never disable a guard to make an alarm stop.**

## 3. Preserve evidence — before you change anything

Restarting a pod destroys its logs from the kubelet's view. Capture first:

```sh
TS=$(date -u +%Y%m%dT%H%M%SZ)
kubectl -n embroidery-production get pods -o wide                 > "incident-$TS-pods.txt"
kubectl -n embroidery-production get events --sort-by=.lastTimestamp > "incident-$TS-events.txt"
kubectl -n embroidery-production describe deploy/embroidery-api   > "incident-$TS-api-deploy.txt"
kubectl -n embroidery-production logs deploy/embroidery-api  --tail=2000 > "incident-$TS-api.log"
kubectl -n embroidery-production logs deploy/embroidery-worker --tail=2000 > "incident-$TS-worker.log"
kubectl -n embroidery-production rollout history deploy/embroidery-api > "incident-$TS-history.txt"
```

Loki retains what Alloy already collected, so a query written later still works
— but only for pods Alloy reached. `kubectl logs` is the right tool when Loki
itself is what is broken.

**These files may contain no secret.** They will not contain a customer's
identity, a token or a code, because those are redacted at the source. Before
attaching them to anything, run:

```sh
node tools/check-report-secrets.mjs
```

## 4. Stop unsafe changes

The list is short and absolute. During an incident, nobody:

- writes to the database to repair business state;
- deletes an immutable commercial or audit row — a ledger entry, a
  reconciliation, a payment attempt, an outbox row, a shipping snapshot;
- disables a guard, a validation, an authorization check or a startup assertion;
- rotates a credential to make something pass ([RB-05](RB-05-SECRET-ROTATION.md)
  — rotation is a decision, not a workaround);
- scales the worker above one replica;
- `kubectl edit`s a live resource;
- runs a command from memory that is not in a runbook.

If the only way forward appears to break one of these, that is the moment to
escalate, not the moment to make an exception.

## 5. Recover through an approved procedure

| Diagnosis | Runbook |
| --- | --- |
| A bad release | [RB-03](RB-03-ROLLBACK.md) |
| A missing or wrong secret | [RB-05](RB-05-SECRET-ROTATION.md) |
| A worker claiming nothing | [RB-04](RB-04-STAFF-BOOTSTRAP.md) |
| A payment that will not settle | [RB-06](RB-06-PAYMENT-RECONCILIATION.md) |
| An order not moving | [RB-07](RB-07-STUCK-ORDER.md) |
| A backlog or a dead letter | [RB-08](RB-08-STUCK-JOB-AND-OUTBOX.md) |
| Storage | [RB-09](RB-09-STORAGE-INCIDENT.md) |
| A failed migration | [RB-02](RB-02-MIGRATION.md), then [RB-13](RB-13-BACKUP-AND-RESTORE.md) |
| Data loss | [RB-13](RB-13-BACKUP-AND-RESTORE.md) |
| No diagnosis yet | [RB-10](RB-10-HEALTH-DIAGNOSTICS.md) |

## 6. Verify the invariants, not the symptom

An incident is not over because the alert resolved. Check what could have been
damaged.

**Money and stock**, for every order touched during the window:

```sql
SELECT o.code, o.status,
  (SELECT count(*) FROM payment_obligations WHERE order_id = o.id AND status = 'SATISFIED') AS satisfied,
  (SELECT count(*) FROM payment_attempts a JOIN payment_obligations ob ON ob.id = a.payment_obligation_id
    WHERE ob.order_id = o.id AND a.status = 'SUCCEEDED') AS succeeded,
  (SELECT count(*) FROM inventory_reservations WHERE order_id = o.id AND status = 'CONSUMED') AS consumed
FROM orders o
WHERE o.created_at >= '<incident start>'
ORDER BY o.created_at;
```

Never more than one of each. A `READY_FOR_DELIVERY` order with `satisfied = 0`
is an impossible state and is itself an incident.

**Queue**

```sql
SELECT status, count(*) FROM outbox_events GROUP BY status;
```

`DEAD_LETTER` must not have grown for reasons you have not accounted for.

**Schema**

```sql
SELECT count(*) FROM drizzle.__drizzle_migrations;   -- 38 at the Wave-1 baseline
```

**Surface**

The [RB-01](RB-01-DEPLOYMENT.md) smoke, including the Wave-2 isolation checks.
An incident that ended with a wrong release flag would open the custom surface.

## 7. Record the timeline

Facts and timestamps, in UTC:

```text
detected      how, and by what — an alert, a customer, an operator
severity      and any reclassification, with the reason
diagnosed     what was actually wrong, and what proved it
acted         every command run, in order, by whom
recovered     when, and what verified it
affected      orders, customers, notifications — by id, never by contact detail
outstanding   what is not yet verified
```

Write the commands you actually ran, including the ones that did not help. An
incident record whose command list is a tidy reconstruction is a record nobody
can learn from.

**No secret, no customer contact detail and no token in the record.** Order
codes, request ids, correlation ids, job keys, pod names and timestamps are the
right identifiers.

## 8. Follow up

Each follow-up gets an owner and a destination in the repository, not a
resolution in the incident record:

- a defect → a checkpoint or a correction;
- a wrong alert threshold → a change to
  `infrastructure/monitoring/prometheus/rules/wave1-commerce.rules.yml`, with the
  reasoning, never a silenced alert;
- a runbook that was wrong or incomplete → **edit that runbook now**, while you
  still remember what was missing. That is the single highest-value follow-up
  there is;
- a missing capability → a recorded gap. Not a habit of manual repair.

## What is deliberately not in this runbook

- **No customer-communication template or promise.** No delivered authority
  defines one; inventing it here would commit the business to something it has
  not agreed.
- **No time-bound response target.** No SLA exists.
- **No paging rotation.** `production_alert_receiver` is
  `REQUIRED_BEFORE_R01` — until it is supplied, Alertmanager's route tree is
  delivered and its destination is not
  ([RB-14](RB-14-GO-LIVE-CHECKLIST.md)).
