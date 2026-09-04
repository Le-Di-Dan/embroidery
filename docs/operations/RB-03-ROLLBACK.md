# RB-03 — Rollback

Taking a release back.

Authority: `docs/implementation/reports/APP12-H02-COMPLETION-REPORT.md` section
Y (rollback evidence, measured A → B → A).

## The distinction that governs this whole runbook

```text
APPLICATION IMAGE ROLLBACK        !=        DATABASE ROLLBACK
  supported, rehearsed,                       does not exist
  seconds, reversible                         forward-only history
```

Rolling back the application image does **not** roll back the schema, and
nothing here will. A release whose migration cannot coexist with the previous
image is not rollback-safe, and finding that out during an incident is too late:
that is why RB-02's precondition is a verified backup.

**Before you roll back, ask one question: did this release apply a migration?**

- **No** — roll back freely. This is the ordinary case and the procedure below
  is complete.
- **Yes** — the previous image will run against the *new* schema. Most forward
  migrations are additive and the previous image simply ignores what it does not
  know about, which is why additive-only is the delivered convention. If the
  migration was not additive, a rollback is a **restore**
  ([RB-13](RB-13-BACKUP-AND-RESTORE.md)), not a `rollout undo`, and it is an
  escalation.

## Trigger

- A deployed release is faulty: 5xx burst, a failing business path, a
  configuration defect that reached production.
- A rollout is stuck and the new revision will not become ready.

## Preconditions

1. You know the **previous** revision and that it was healthy. Every Deployment
   carries `revisionHistoryLimit: 5`, so the last five are addressable.
2. You know whether this release applied a migration (see above).
3. You have taken the observations below, so the rollback can be *verified* to
   have changed something.

## Safe observations

```sh
kubectl -n embroidery-production rollout history deploy/embroidery-api
kubectl -n embroidery-production get deploy -o wide            # current image digests
kubectl -n embroidery-production get pods
kubectl -n embroidery-production describe deploy/embroidery-api | grep -A3 'Pod Template'
```

Record the current digest before you undo it. You will need it to roll
*forward* again once the defect is fixed.

## Actions

### Case A — the rollout failed and never became ready

Nothing is serving the bad revision: `maxUnavailable: 0` kept the healthy pods
in rotation the entire time. Verify that first:

```sh
kubectl -n embroidery-production get pods
# expect: previous-revision pods 1/1 Running, new-revision pod 0/1
#         ImagePullBackOff | CreateContainerConfigError | CrashLoopBackOff
curl -sS -o /dev/null -w '%{http_code}\n' https://<admin-host>/api/health/readiness   # 200
```

Then simply undo, which removes the failing ReplicaSet:

```sh
kubectl -n embroidery-production rollout undo deploy/embroidery-api
kubectl -n embroidery-production rollout status deploy/embroidery-api --timeout=300s
```

### Case B — the release rolled out and is faulty

```sh
kubectl -n embroidery-production rollout undo deploy/embroidery-api
kubectl -n embroidery-production rollout status deploy/embroidery-api --timeout=300s
```

Repeat per Deployment for every workload the release changed. Roll back the
**whole** release, not one component: a Storefront built against a different API
contract is a second incident.

```sh
kubectl -n embroidery-production rollout undo deploy/embroidery-storefront
kubectl -n embroidery-production rollout undo deploy/embroidery-admin
kubectl -n embroidery-production rollout undo deploy/embroidery-worker
```

To go back to a specific earlier revision rather than the immediately previous
one:

```sh
kubectl -n embroidery-production rollout undo deploy/embroidery-api --to-revision=<n>
```

### Case C — pinning the exact previous digest instead

`rollout undo` is revision-relative. When you want to be explicit — and after an
incident you usually do — set the image to the digest you recorded:

```sh
kubectl -n embroidery-production set image deploy/embroidery-api \
  api=<registry>/embroidery/api@sha256:<previous digest>
kubectl -n embroidery-production rollout status deploy/embroidery-api --timeout=300s
```

A digest, never a tag. This is the same immutable-reference rule the preflight
enforces at deploy time.

### The worker is different

`Recreate`, one replica. A worker rollback has a gap with no worker running.
That gap is safe — jobs stay `PENDING` in `outbox_events` with their lease
expired and are claimed by the replacement — but it means the backlog gauge
rises during the rollback and settles afterwards. Do not treat the rise as a
second incident; check that it *falls* afterwards
([RB-08](RB-08-STUCK-JOB-AND-OUTBOX.md)).

## Expected state

```text
rollout status                "deployment successfully rolled out"
get deploy -o wide            image = the previous digest
API readiness                 200
Storefront /                  200
worker                        claiming again, backlog falling
```

One `000` or one connection error immediately after an undo, while a port-forward
or connection re-attaches to the replacement pod, is normal and settles on the
next poll. Poll twice before concluding anything.

## Abort condition

- **The previous revision also fails to become ready.** Stop. Two broken
  revisions do not point at the image; they point at configuration, a secret, or
  a dependency. Go to [RB-10](RB-10-HEALTH-DIAGNOSTICS.md) and stop changing
  revisions — each attempt costs a ReplicaSet from a history that is only five
  deep.
- **The release applied a non-additive migration.** Do not undo. Escalate.

## Escalation condition

- A rollback is required *and* the schema has moved in a way the previous image
  cannot read. This is a restore, not a rollback:
  [RB-13](RB-13-BACKUP-AND-RESTORE.md), and it is a data-loss decision that is
  not an operator's to take alone.
- Money state may be wrong. A payment recorded under the faulty release does not
  become un-recorded by a rollback; the ledger is append-only and the
  reconciliation history is durable. Go to
  [RB-06](RB-06-PAYMENT-RECONCILIATION.md) to establish what is actually true
  before deciding anything.

## Verification

```sh
kubectl -n embroidery-production get deploy -o wide
kubectl -n embroidery-production get pods
curl -sS -o /dev/null -w '%{http_code}\n' https://<admin-host>/api/health/readiness
curl -sS -o /dev/null -w '%{http_code}\n' https://<storefront-host>/
kubectl -n embroidery-production logs deploy/embroidery-api --tail=30 | grep release.gate.configured
```

Then the dashboard's *Is the shop up?* row, and confirm the 5xx count stops
growing rather than merely being lower.

## Forbidden actions

- Rolling back the schema. There is no down-migration.
- Rolling back one workload and leaving the rest on the new release, except as a
  deliberate, recorded decision.
- `kubectl edit` on a live Deployment as a rollback mechanism. The next
  `apply -k` reverts it.
- Deleting a Deployment to "reset" it. That takes the healthy pods away too.
- Rolling back repeatedly to see whether it helps. Five revisions is the whole
  history; burning it removes the option you will need.
