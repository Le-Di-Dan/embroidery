# RB-02 — Migration

Applying the database schema history to a deployed environment.

Authority: `infrastructure/kubernetes/base/workloads/migrate-job.yaml`,
`docs/adr/database/ADR-DB1-003-MIGRATION-STRATEGY.md`,
`docs/implementation/08-DATABASE-CHANGE-CONTROL.md`.

## The one thing to understand first

**The history is forward-only. There is no down-migration, and none will be
written.** `packages/database/migrations/` is an append-only sequence; a
migration is undone by writing a *new* migration that moves forward, never by
reversing an applied one. This is why [RB-03](RB-03-ROLLBACK.md) rolls back the
application image and explicitly does not roll back the schema, and why the
schema is the thing you take a backup of before you touch it
([RB-13](RB-13-BACKUP-AND-RESTORE.md)).

At the frozen Wave-1 baseline the history is **38 migrations** and the schema
holds **79 public base tables**.

## Trigger

- A release is being deployed (RB-01 step 3).
- A new environment is being created against an empty database.

## Preconditions

1. **A backup exists and has been verified**, if the database holds anything you
   cannot lose. [RB-13](RB-13-BACKUP-AND-RESTORE.md). "Verified" means restored,
   not "the dump file exists".
2. `embroidery-secrets` exists and carries `DATABASE_URL`.
3. The migrate Job's image is set to the **same immutable reference** the API
   Deployment resolves to. The Job reuses the API image deliberately, so it runs
   the same committed tooling the application was built against; a different
   image would apply a different history.
4. The database is reachable from the cluster.

## Safe observations

Before applying, read what is already there. A read-only session against
`DATABASE_URL` is safe and is how you decide whether this is a fresh apply or a
no-op:

```sql
SELECT count(*) FROM drizzle.__drizzle_migrations;
SELECT count(*) FROM information_schema.tables
 WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
```

Expected at the Wave-1 baseline, **after** the history is applied:

```text
drizzle.__drizzle_migrations = 38
public base tables           = 79
```

On a fresh database both queries fail or return `0`; that is the fresh case.

## Actions

### 1. Apply the Job

```sh
kubectl apply -k infrastructure/kubernetes/overlays/production
kubectl -n embroidery-production wait --for=condition=complete \
  job/embroidery-migrate --timeout=600s
kubectl -n embroidery-production logs job/embroidery-migrate
```

The Job is an explicit `Job` and never an init container or an API startup
hook: every API replica running migrations would be N processes racing one
forward-only history, and the runner is not documented as concurrency-safe.

### 2. Read the log — and know what it cannot tell you

A successful run prints exactly two lines:

```text
[db:migrate] applying migrations to postgres://embroidery:***@…/<database>
[db:migrate] up to date
```

**Those two lines are identical for a fresh apply of the whole history and for a
run against an already-current database.** `up to date` is printed
unconditionally after the runner returns; it means *"the runner completed
without throwing"*, not *"there was nothing to do"*. The runner does not
enumerate the migrations it applied.

Two consequences, and they are the reason step 3 is not optional:

- **You cannot tell from the log whether anything was applied.** Only the
  post-check counts can tell you that.
- **The silent-failure case looks exactly like success.** A runner that resolved
  an empty migrations directory — the defect this deployment model was
  specifically hardened against — would print these same two lines and exit 0
  against a completely unmigrated database.

Measured on a fresh disposable staging database during the `APP12-H07`
rehearsal: the Job printed those two lines, exited 0, and the database went from
empty to 38 migrations and 79 tables. Nothing in the log said so.

The connection string is redacted — `postgres://embroidery:***@…` — so a
deployment log never carries the database password.

If you ever see an unredacted URL in a log, treat it as a credential exposure and
go to [RB-05](RB-05-SECRET-ROTATION.md).

`backoffLimit: 3`. A first attempt that fails because PostgreSQL is still
accepting connections is normal and the retry succeeds; that is not an incident.

### 3. Post-check

Re-run the two queries from *Safe observations*. Both counts must match the
baseline for the release you are deploying.

## Expected state

```text
job/embroidery-migrate                    Complete (1/1)
drizzle.__drizzle_migrations              = the release's migration count (38 at Wave-1 baseline)
public base tables                        = the release's table count (79 at Wave-1 baseline)
API readiness after the app rollout       200
```

## Abort condition

Stop, and do **not** start the application rollout, if:

- The Job does not reach `Complete` after its retries.
- The post-check counts are zero, or short of the release's expected count,
  **however successful the log looked**. That is the silent failure this
  deployment model was specifically hardened against: the runner resolving an
  empty migrations directory and reporting success. Check that the image
  actually carries `packages/database/migrations/*.sql` before believing it —
  `kubectl -n embroidery-production run --rm -it --restart=Never migrate-probe --image=<the same digest> --command -- ls /app/packages/database/migrations | head`.
- The migration count after the run does not match the expected count.

A partially applied history is the one state that needs judgement rather than a
command. Each migration runs in its own transaction, so the failure point is
recorded in `drizzle.__drizzle_migrations`: the applied ones are committed and
the failing one is not. Do not re-run blindly and do not hand-apply the
remaining SQL.

## Escalation condition

Escalate, and do not improvise, when:

- The history is partially applied. The safe path is a **restore from the
  pre-migration backup into a fresh database**
  ([RB-13](RB-13-BACKUP-AND-RESTORE.md)), then a corrected release — not a
  hand-written repair of the live schema.
- The migration failed on a constraint violation against existing data. That is
  a data problem the migration did not anticipate; it needs the change's owner,
  not an operator workaround.
- You are being asked to remove a column, drop a table, or reverse an applied
  migration to make a rollback work. That is a schema rollback, which does not
  exist here — see [RB-03](RB-03-ROLLBACK.md).

## Verification

```sh
kubectl -n embroidery-production get job embroidery-migrate
kubectl -n embroidery-production logs job/embroidery-migrate | tail -20
```

plus the two SQL counts, and then the API's own readiness after the rollout —
an API that starts but answers 503 with a database reason is the signal that the
image and the schema disagree.

## Recovery / rollback

There is no schema rollback. The recovery paths, in order of preference:

1. **Roll forward.** Write and deploy the next migration. This is the designed
   path.
2. **Restore.** [RB-13](RB-13-BACKUP-AND-RESTORE.md), into a **fresh** database,
   then repoint `DATABASE_URL`. The restore tool refuses to restore over an
   existing database, deliberately.
3. Never: hand-editing `drizzle.__drizzle_migrations` to make the runner skip a
   migration.

## Forbidden actions

- Writing a down-migration, or reversing an applied migration by hand.
- Running the Job with an image that is not the release's API image.
- Editing `drizzle.__drizzle_migrations`.
- Applying SQL directly to fix a failed migration.
- Running the migration Job concurrently, or after the application rollout.
- Restoring a backup **over** a live database. Restore into a fresh one.
