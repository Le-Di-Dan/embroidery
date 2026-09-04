# RB-04 — Staff bootstrap and policy publication

Creating the first Admin account **and** publishing the versioned policy every
worker reads at startup. These are one command because they are one
transaction of authority: `policy_configuration_versions.created_by_admin_id` is
`NOT NULL`, so the policy cannot be published without an Admin, and the
`staff-bootstrap` CLI is the only admin-bearing path in this repository.

Authority: `infrastructure/kubernetes/operator/staff-bootstrap-job.yaml`,
`infrastructure/kubernetes/README.md`,
`docs/implementation/reports/APP12-H03-C1-COMPLETION-REPORT.md` section E.

## The failure this runbook exists to prevent

A cluster where this one-shot has never run has a worker pod that is:

```text
Running   1/1   Ready   0 restarts   no failing probe   no error loop
```

and that **claims nothing**. Nothing delivers notifications. Nothing converts
orders. Nothing expires reservations. A customer who checks out gets an order
and never gets the link to open it.

The worker has no HTTP probe, so Kubernetes cannot see this. The only external
symptoms are:

- `embroidery_worker_queue_pending` rising and never falling;
- `embroidery_worker_queue_oldest_pending_age_seconds` growing without bound;
- exactly **one** deduped log line naming the missing policy key;
- the worker's own readiness reporting `WORKER_POLICY_MISSING` or
  `CAPABILITY_POLICY_MISSING`.

This is fail-closed behaviour working correctly. A worker nobody has configured
must not guess a lease duration and start claiming.

## Trigger

- A brand-new environment.
- `EmbroideryWorkerQueueBacklog` firing on a worker that is up
  ([RB-15 section 8](RB-15-ALERT-RESPONSE.md#8-runbook-h07-worker-jobs)).
- Worker logs carrying `WORKER_POLICY_MISSING`, `WORKER_POLICY_INVALID` or
  `CAPABILITY_POLICY_MISSING`.
- A release that changed the published policy dataset.

## Preconditions

1. The `embroidery-staff-bootstrap` Secret exists. Its three keys are
   `STAFF_BOOTSTRAP_EMAIL`, `STAFF_BOOTSTRAP_PASSWORD`,
   `STAFF_BOOTSTRAP_DISPLAY_NAME` and in production **all three are optional** —
   missing values skip the staff step, exit 0 and mutate nothing. The policy
   publication still runs.
2. `embroidery-secrets` exists.
3. The migration Job has completed ([RB-02](RB-02-MIGRATION.md)).
4. The Job's `image:` is set to the **same immutable reference** the overlay's
   `embroidery/api` resolves to. A different one bootstraps against a different
   build of the schema and the datasets.

## Safe observations

Is a policy published at all? Read-only:

```sql
SELECT config_key, max(version) AS latest
  FROM policy_configuration_versions v
  JOIN policy_configurations c ON c.id = v.policy_configuration_id
 GROUP BY config_key
 ORDER BY config_key;
```

`worker.runtime` must be present. Its published value is the ten-field
claim/lease/timeout/retry policy in
`packages/database/seed/worker-runtime-policy.seed.json`:

```text
concurrency 2 · batchSize 5 · pollIntervalMs 500 · leaseDurationMs 120000
handlerTimeoutMs 60000 · leaseSafetyMarginMs 5000 · shutdownGraceMs 10000
maxAttempts 3 · backoffBaseMs 1000 · backoffMaxMs 30000
```

`notification.delivery` gates the notification-delivery capability specifically.
Its absence does **not** stop the rest of the worker; it stops that one handler
from claiming, which is the correction described below.

And the worker's own view:

```sh
kubectl -n embroidery-production logs deploy/embroidery-worker --tail=100 \
  | grep -iE 'policy|readiness|claim'
```

## Actions

```sh
# 1. Set the image to the release's API digest, in a copy — never commit a digest
#    into the manifest.
kubectl -n embroidery-production apply -f \
  infrastructure/kubernetes/operator/staff-bootstrap-job.yaml

kubectl -n embroidery-production wait --for=condition=complete \
  job/embroidery-staff-bootstrap --timeout=300s

kubectl -n embroidery-production logs job/embroidery-staff-bootstrap
```

The manifest is deliberately in **no** kustomization. It is applied by hand so
that a missing `embroidery-staff-bootstrap` Secret can never turn an otherwise
healthy release into an unschedulable pod.

### Reading the result

The CLI prints exactly one parseable `result=<STATUS>` line and never the
password or the encoded credential.

| `result=` | Meaning |
| --- | --- |
| `CREATED` | The first Admin was created. Success. |
| `REUSED_EXISTING` | An Admin already existed and was reused. Also success. |
| anything else | Failure; the process exits non-zero. |

Re-running is safe. The staff step is create-or-reuse. Every policy publication
compares the stored value and schema version against the dataset **first** and
writes only on drift, so an unchanged dataset appends no version. Drift is
corrected by **appending** a version, never by mutating history:
`policy_configuration_versions` is immutable by design, and a worker that
recorded version 1 must keep meaning it.

### Re-running it on every release is safe, and is the recommended habit

Because publication is idempotent by comparison, running the one-shot as a
standing release step costs nothing on an unchanged dataset and removes the
class of incident this runbook opens with.

## Expected state — the worker adopts without a restart

The worker re-reads the policy on its own recheck interval **while it has
none**, and adopts the first valid one it sees, in roughly five seconds. It
needs no restart, and a policy that is already valid is never re-read, so a
running fleet's lease duration cannot change under jobs already leased against
it.

Measured behaviour, live, with notifications created while the policy was
absent and held for 80 seconds — 20 times the window that previously destroyed
them:

```text
during absence   status PENDING · attempt_count 0 · claimed_by null
                 not delivered · not DEAD_LETTER · no attempt budget spent
                 worker restarts 0 · one deduped "not configured" line
                 readiness truthful (CAPABILITY_POLICY_MISSING)
after publication (~5s)
                 status DISPATCHED · attempt_count 1
                 delivered exactly once · same worker pod, no restart
                 pending backlog 0 · dead-letter delta 0
```

That is the guarantee to hold onto: **a missing policy costs a notification its
delivery time, never its life.** It is never dead-lettered for want of
configuration.

## Abort condition

- The Job does not reach `Complete` after `backoffLimit: 3`. Read its logs; do
  not re-apply in a loop.
- The log prints a `result=` other than `CREATED` or `REUSED_EXISTING`.
- The worker logs `WORKER_POLICY_INVALID` after a successful publication. That
  means the published values violate one of the runtime's four relations, and
  every deployed worker is claiming nothing. This is a release defect, not an
  operator action — escalate.

## Escalation condition

- `WORKER_POLICY_INVALID`, as above.
- The Job completes, the policy is present in the database, and the worker still
  reports itself unready after two recheck intervals.
- You are being asked to insert a policy row by hand to get a worker claiming.
  Do not. The publisher compares-then-appends for reasons the immutability of
  the version table depends on.

## Verification

```sh
kubectl -n embroidery-production logs job/embroidery-staff-bootstrap | grep '^result='
kubectl -n embroidery-production logs deploy/embroidery-worker --tail=50
```

and the two gauges, which are the only external proof the worker is working:

```promql
embroidery_worker_queue_pending
embroidery_worker_queue_oldest_pending_age_seconds
```

Both must be falling, or already zero. A backlog that is merely *lower* is not
proof; a backlog that reaches zero is.

Finally, confirm the Admin can log in at `https://<admin-host>/login`.

## Recovery / rollback

There is nothing to roll back. The publication is additive and idempotent, the
staff step is create-or-reuse, and no version is ever mutated or removed. If a
wrong dataset was published, publish the corrected one — it appends a new
version and the worker adopts it on its next cold read.

## Forbidden actions

- Inserting or updating `policy_configurations` / `policy_configuration_versions`
  by hand.
- Running the Job with an image other than the release's API digest.
- Committing a real digest, or any bootstrap value, into
  `staff-bootstrap-job.yaml`.
- Printing or logging `STAFF_BOOTSTRAP_PASSWORD`, or passing it as a command-line
  argument.
- Adding the Job to a kustomization so it runs on every `apply -k`.
- Restarting the worker to "make it pick up" a policy. It does that on its own,
  and a restart hides whether the adoption path actually works.
