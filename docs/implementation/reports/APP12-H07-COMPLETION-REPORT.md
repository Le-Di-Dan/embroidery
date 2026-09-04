# APP12-H07 — Wave-1 Operational Runbooks and Operator Recovery — Completion Report

## A. Verdict

```text
APP12-H07 = COMPLETE
APP12-H08 = NEXT
CORRECTION_USED = 0 / 1
```

Sixteen runbooks were written, and both required runbook-only operator
rehearsals passed on a disposable production-like Kubernetes staging cluster
built from the committed manifests.

The headline is not the documents. It is that **writing a runbook and then
running it found four things no previous checkpoint had recorded**, three of
which are about the system rather than the prose:

1. **`[db:migrate] up to date` distinguishes nothing.** It is printed
   unconditionally after the runner returns, so a fresh apply of all 38
   migrations and a genuine no-op produce byte-identical output. `APP12-H02`
   reported the two cases as if the log told them apart. Measured here on a
   fresh database: those two lines, exit 0, and the database went from empty to
   38/79 with nothing in the log saying so. The post-check counts are the only
   proof — and the silent-failure case this deployment model was hardened
   against looks exactly the same.
2. **A worker whose `bootstrap()` throws never finishes starting and never
   exits.** Observed on the cluster's first cold boot. The top-level handler
   logs one opaque line and sets a non-zero exit code, but the poll runtime and
   two timers already hold the event loop open, so the pod sits `Running 1/1`,
   `0` restarts, no failing probe — with **no metrics listener bound**. The two
   gauges every worker diagnosis depends on are therefore unavailable in one of
   the states they exist to diagnose.
3. **No notification provider is integrated, in any deployable
   configuration.** The only bound channel adapter appends the message to an
   in-memory array. A notification reaching `DISPATCHED` has been delivered to
   nobody. Wave 1 sells to customers whose only credential for a paid order is
   an `ORDER_ACCESS` link, so this is a hard go-live blocker, and it was
   confirmed live rather than inferred.
4. **The gate written to check the runbooks failed on its own first run**, on a
   real defect: `pnpm db:check:manifest` is printed by three DB10 documents and
   is not a script of anything. Its own suite then caught two further defects in
   the gate itself.

`API Δ = 0`, `route Δ = 0`, `migration Δ = 0`. No business endpoint, Admin
screen, lifecycle state or recovery command was added. No production deployment.
No `G03` data. Nothing pushed.

---

## B. H06 / brand reconciliation

Entry state accepted without reopening:

```text
APP12-H06                            = COMPLETE — PO PASS
PO_BRAND_SYMBOL_SYSTEM_APPLICATION   = COMPLETE
ROADMAP_LOCK = LOCKED · CHECKPOINTS = 38
```

Both were committed at entry to this checkpoint as
`feat(app12): deliver SEO/public readiness and the brand symbol system`
(94 files). Nothing in H06 or the brand directive was reopened, re-argued or
modified. The H06 follow-ups routed to `V01`, `V02` and `BRD0`
(`FU-APP12-H06-01`, `-03`, `-04`, `-05`, `FU-APP12-PO-BRAND-01/03/04`) were
**not absorbed**, per §6.

Gallery hardening remains `NONBLOCKING_DEFER`. No Wave-1 Ready-Made blocker
attributable to Gallery was found, so the deferral stands untouched.

---

## C. Operational preflight

Every seam below was read from source or manifest before a word of procedure was
written. Nothing was assumed from a prior report.

| Seam | Authority read | What the runbooks depend on |
| --- | --- | --- |
| Kubernetes model | `infrastructure/kubernetes/**`, its `README.md` | base + overlays, `kubectl apply -k`, no Helm, no controller |
| Immutable images | H02 §F, overlay `images:` | digest pinning; `REPLACE_WITH_IMMUTABLE_RELEASE_REF` fails the preflight |
| Release-config validator | `tools/check-release-config.mjs` | `MISSING` / `MALFORMED` / `IMAGE` / `ROUTING` classes; never prints a value |
| Migration Job | `base/workloads/migrate-job.yaml`, `packages/database/src/cli/migrate-deployment.ts` | API image reuse, `backoffLimit: 3`, redacted URL, **and the two-line log** |
| A→B→A rollback | H02 §Y | `rollout undo`, `revisionHistoryLimit: 5` |
| `worker.runtime` bootstrap | `operator/staff-bootstrap-job.yaml`, `packages/database/seed/worker-runtime-policy.seed.json` | 10-value policy, compare-then-append, `result=` line |
| `notification.delivery` bootstrap | `NOTIFICATION_DELIVERY_POLICY_KEY`, H04-C1 §E | the claim gate; `CAPABILITY_POLICY_MISSING` |
| API / worker readiness | `health.controller.ts`, `worker.yaml` | `/api/health`, `/api/health/readiness`; the worker has **no** probe |
| Prometheus / Alertmanager / Grafana / Loki / Alloy | `infrastructure/monitoring/**` | 15 rules / 7 groups, 31 panels / 8 rows, 7 Loki labels |
| Payment review / reconciliation | `admin-payment-attempt.controller.ts`, H04 §Q | `verify`, `review`, exact match, `REQUIRES_REVIEW`, replay |
| Order / shipping / payment Admin ops | the six admin controllers | the exact routes each runbook prints |
| Worker job / outbox persistence | `schema/platform/outbox-events.ts` | 4 statuses, 7 mutable columns, `SKIP LOCKED` |
| Reservation expiry | `payment-window.policy.ts` | 24h, reset on first fee, unchanged on correction |
| Storage failure behaviour | `packages/object-storage/src/request-options.ts`, H04-C1 §J–M | the 20s deadline, and the two S3 options that do **not** bound a call |
| H03 dashboards / alerts | the rules file and the dashboard JSON | the ten `RUNBOOK-H07-*` ids |
| H04 recovery evidence | H04 §Q, §U; H04-C1 §F, §K–M | what recovery is proved and what is not |

The alert rules were the single most valuable input: `APP12-H03` had already
minted the ten runbook ids H07 would have to answer, so H07 filled in documents
rather than discovering which alerts exist. That contract is now mechanically
enforced (§W).

---

## D. Runbook index

`docs/operations/`, 16 documents, 4 007 lines. `README.md` is the canonical
index and carries the alert-id resolution table.

| Document | Owns |
| --- | --- |
| `README.md` | The index, the alert-id table, the topology, the vocabulary, the severity model |
| `RB-01-DEPLOYMENT.md` | Preflight, wave flag, ordering, rollout, config-only change, smoke |
| `RB-02-MIGRATION.md` | Forward-only history, the two-line log, post-check, partial-apply escalation |
| `RB-03-ROLLBACK.md` | Image rollback vs database rollback; three cases; the worker's gap |
| `RB-04-STAFF-BOOTSTRAP.md` | Policy publication; the Ready-but-idle worker; adoption without restart |
| `RB-05-SECRET-ROTATION.md` | Consumer map, blast radius, replace-then-restart, per-secret verification |
| `RB-06-PAYMENT-RECONCILIATION.md` | The five facts, five cases, the five invariants |
| `RB-07-STUCK-ORDER.md` | The four Ready-Made states and who each is waiting for |
| `RB-08-STUCK-JOB-AND-OUTBOX.md` | Grafana → Prometheus → Loki → rows; six cases; the replay that exists and the ones that do not |
| `RB-09-STORAGE-INCIDENT.md` | The 20s signature; no object surgery; the 1 MiB edge limit |
| `RB-10-HEALTH-DIAGNOSTICS.md` | Seven layers, outside in; the symptom-to-layer map |
| `RB-11-LOGS-AND-METRICS.md` | The metric catalogue, the label contract, the six queries, offline validators |
| `RB-12-INCIDENT-RESPONSE.md` | Declare, stabilize, preserve, stop, recover, verify, record, follow up |
| `RB-13-BACKUP-AND-RESTORE.md` | What is owned and rehearsed; the eight-item pre-R01 requirement |
| `RB-14-GO-LIVE-CHECKLIST.md` | Ten sections; section 4 is deliberately unsatisfiable today |
| `RB-15-ALERT-RESPONSE.md` | One section per `RUNBOOK-H07-*` id |

Every one carries the same nine headings §3 requires — trigger, preconditions,
safe observations, exact commands or UI actions, expected state, abort,
escalation, verification, recovery/rollback, forbidden actions — except the
index, RB-11 and RB-15, which are reference and alert-triage documents whose
procedures live in the runbooks they route to.

---

## E. Deployment

`RB-01`. Preflight → wave flag → migration → apply → per-Deployment rollout →
bootstrap → smoke.

Proved live from the committed tree:

```text
node tools/check-release-config.mjs production
  RELEASE CONFIG production: FAIL (21)
    MISSING: STOREFRONT_PUBLIC_ORIGIN — declared but empty; expected an absolute origin …
    MISSING: PAYMENT_MERCHANT_BANK_BIN — declared but empty; expected exactly six digits …
    IMAGE:   Deployment/embroidery-admin/admin — still carries the repository placeholder tag
    …
node tools/check-release-config.mjs staging
  RELEASE CONFIG staging: FAIL (6)   — placeholder image refs only
```

No output line carried a configured value. The runbook's finding-class table is
taken from this output, not paraphrased.

Wave-2 isolation, measured through the deployed Storefront:

```text
/                      200      /yeu-cau/moi           404
/healthz               200      /truy-cap/bao-gia      404
/robots.txt            200      /truy-cap              200
/kham-pha              200      /truy-cap/don-hang     200
admin /login           200      admin /healthz         200
admin /orders          307      (redirect to login, unauthenticated)
```

`FU-APP12-H02-05` is carried explicitly and un-softened into
`RB-14 §4.1`: production Gateway API controller, PostgreSQL topology,
object-storage topology, edge endpoint-reconfiguration behaviour and edge
body-limit alignment, all `REQUIRED_BEFORE_R01`, ADR required. No controller,
address, storage class or certificate was invented anywhere.

`FU-APP12-H02-04` (the ConfigMap is not hash-suffixed) is closed as an operator
procedure: `RB-01 §7` states that a config-only change needs an explicit
`kubectl rollout restart`, and separates it from the `NEXT_PUBLIC_*` case, which
needs an image **rebuild** and cannot be changed by any environment variable.

---

## F. Migration

`RB-02`. Documented truthfully, and corrected by the rehearsal.

**Fresh 1..38**, on the disposable cluster's empty database:

```text
job/embroidery-migrate                       Complete (1/1)
drizzle.__drizzle_migrations                 38
information_schema public BASE TABLE         79
log line 1  [db:migrate] applying migrations to postgres://embroidery:***@…
log line 2  [db:migrate] up to date
```

**The correction.** Those are the only two lines, and they are the same two lines
an already-current run prints. `migrate-deployment.ts` logs `up to date`
unconditionally after `runMigrations` returns — it means "the runner completed
without throwing", not "there was nothing to do", and the runner enumerates
nothing. `APP12-H02` §H presented the two cases as distinguishable by the log;
they are not. RB-02 now says so, and states the consequence plainly: the
post-check counts are the only proof, and a runner that resolved an **empty**
migrations directory would produce this identical output against a completely
unmigrated database.

The credential is redacted in the log, verified in the captured output above.

No down-migration is claimed. The rollback boundary is stated as the first thing
in the document: forward-only, corrected by rolling forward or by restoring into
a fresh database, never by reversing an applied migration or editing
`drizzle.__drizzle_migrations`.

No migration `0039`. Migrations remain 38.

---

## G. Rollback

`RB-03`, reusing the H02 immutable-image authority unchanged
(`rollout undo`, `revisionHistoryLimit: 5`, digest pinning, the single observed
`000` while a port-forward re-attaches).

The distinction §4 asks for is the document's opening section:

```text
APPLICATION IMAGE ROLLBACK   !=   DATABASE ROLLBACK
  supported, rehearsed              does not exist
```

with the one question that governs it — *did this release apply a migration?* —
and the escalation that follows when the answer is a non-additive yes: that is a
restore, not a `rollout undo`, and it is a data-loss decision.

Three cases are separated because they need different actions: a rollout that
never became ready (nothing is serving the bad revision — `maxUnavailable: 0`),
a rollout that succeeded and is faulty, and an explicit digest pin. The worker's
`Recreate` gap is called out so the backlog rise during a rollback is not
mistaken for a second incident.

---

## H. Staff bootstrap

`RB-04`. Canonical publication only — the committed
`operator/staff-bootstrap-job.yaml`, applied by hand, in no kustomization.

Proved live on the cold cluster:

```text
kubectl apply -f infrastructure/kubernetes/operator/staff-bootstrap-job.yaml
kubectl wait --for=condition=complete job/embroidery-staff-bootstrap
[StaffBootstrap] result=CREATED staff created admin=01a06d55-…

published keys: design_approval.agreements · notification.delivery ·
                quotation.deposit · quotation.validity · secure_grant ·
                secure_link.resolve · verification.challenge · worker.runtime
worker adoption   ~1.7s      worker restarts   0
```

and re-run later in Exercise B:

```text
[StaffBootstrap] result=REUSED_EXISTING staff reused admin=01a06d55-…
```

Both `result=` values are successes, exactly as the runbook states. **No
password or encoded credential appeared in either log.**

H04-C1 is preserved verbatim as behaviour and re-proved in §T: pre-policy
notifications remain unclaimed with their attempt budget intact, and a late
publication is adopted with **no worker restart**. No manual policy-row editing
appears anywhere; RB-04 forbids it explicitly.

The failure this runbook exists to prevent was observed for real before the
bootstrap ran: the worker `Running 1/1`, `0` restarts, no failing probe, and the
customer-facing verification endpoint answering `503 Verification is temporarily
unavailable.` A cluster that skips this one-shot is not merely idle — it cannot
take an order.

---

## I. Secret rotation

`RB-05`. The consumer inventory is generated from actual consumers, with a
per-variable owner, trigger, mechanism, reload behaviour, verification and
rollback, plus the blast radius each rotation actually has:

```text
SECURE_LINK_TOKEN_SECRET_PEPPER      every live ORDER_ACCESS link stops resolving
VERIFICATION_CODE_SECRET_PEPPER      every outstanding code stops verifying
NOTIFICATION_DELIVERY_ENVELOPE_KEY   every un-delivered envelope becomes unopenable
OBJECT_STORAGE_*                     set both or neither — one alone fails startup
DATABASE_URL                         ordered: new password → secret → API → worker → retire old
```

The three startup constraints that make a copy-paste a startup failure rather
than a shared blast radius are stated with their reasoning (the two peppers must
differ; neither may equal the envelope key; neither may equal the Design Session
pepper).

Mechanism verification without real secrets: the whole cluster ran on per-run
synthetic values created with `--from-env-file` and `create secret tls`, and the
`envFrom`-is-read-at-container-start property was exercised every time a rotation
required a restart. `PAYMENT_MERCHANT_*` are correctly excluded as non-secrets
and routed to the config-change procedure.

**No value appears in this report, in any runbook, or in any committed file.**
Every documented read prints key **names** only; `-o yaml` on a Secret is listed
under forbidden actions.

---

## J. Payment reconciliation

`RB-06`, the Wave-1 critical document. Built from the delivered authority only —
`verify`, `review`, `GET /api/admin/orders/{id}/payments`, and the Admin screen's
own Vietnamese copy, so the runbook names the buttons an operator actually sees
(`Đối chiếu và xác nhận`, `Đưa vào cần đối chiếu`, `CẦN ĐỐI CHIẾU`).

Covered: the FULL attempt; evidence; expected-versus-observed; mismatch and
`REQUIRES_REVIEW`; the stale/superseded attempt after a fee correction; a
successful verification; and response-loss replay.

The five facts the document rests on, each load-bearing in the exercise:

1. verification is the only operation that can move money state;
2. `REQUIRES_REVIEW` is a durable business decision answered `200`, not a
   failure;
3. there is no separate resolve operation — you resolve with the **same** verify
   action, and the system records `RESOLVE_REVIEW` rather than `MANUAL_MATCH`;
4. the comparison is exact — no tolerance, no rounding, no floating point;
5. evidence is never a precondition and never a payment fact.

Verified through existing authority only, live (§S):

```text
FULL obligation SATISFIED   once
payment attempt SUCCEEDED   once
reservation     CONSUMED    once
stock decremented           once   (sku_stocks 60 → 59)
order           READY_FOR_DELIVERY
```

No force-paid endpoint is documented, because none exists. No SQL recovery
appears; the only SQL in RB-06 is read-only verification, labelled as such.

---

## K. Stuck order

`RB-07`, on the actual Ready-Made states — `AWAITING_SHIPPING_FEE`,
`AWAITING_PAYMENT`, `READY_FOR_DELIVERY`, `DELIVERED` — plus `ON_HOLD`,
`CANCELLING`, `CANCELLED` for completeness, taken from
`READY_MADE_ORDER_STATES` and the LC-14 transition map rather than from prose.

The organising observation is that three of the four transitions are operator
actions, so most "stuck" orders are waiting for a person: each state names **who
is waiting** before it names a command.

Deadlines are the delivered ones and no SLA is invented: the reservation window
is `created_at + 24h` (BR-025), reset to `now() + 24h` on the first fee
confirmation and left unchanged by a correction or a replay. H03 telemetry is
used for the failure signal (the fulfilment-transition panel), and a
`409 ORDER_INVALID_TRANSITION` is explained as the replay guard — counted
`refused`, meaning the work is already done — rather than an error to retry
around.

Recovery is by read/refetch, never by forcing state. Live confirmation of the
transitions themselves is in §S: fee → `AWAITING_PAYMENT`, verification →
`READY_FOR_DELIVERY`.

---

## L. Stuck job / outbox

`RB-08`. The diagnostic path is exactly §4's:
**Grafana → Prometheus → Loki → safe persisted facts**, with the database read
last and read-only.

Six cases, each separated by the three columns that actually distinguish them
(`attempt_count`, `claimed_by`, `last_error`):

```text
A1  PENDING/0/unclaimed, every kind      no worker.runtime            → RB-04
A2  PENDING/0/unclaimed, one kind        closed claim gate            → RB-04
A3  PENDING/0/unclaimed, forever         no registered handler        → escalate
B   PENDING, future next_attempt_at      backoff — not stuck          → wait
C   FAILED                               retrying                     → fix the dependency
D   DEAD_LETTER                          budget spent                 → notification replay, or escalate
E/F worker down · expired lease          → RB-15 §2 · wait 120s
```

**There is no generic requeue command and RB-08 does not invent one.** The one
replay that exists is delivered and guarded —
`POST /api/admin/notification-intents/{intentId}/replay`, surfaced in the Admin
UI at `/support/customer-access` — and the runbook states precisely what it is: a
**transport** replay of the sealed original that mints nothing new, leaves the
original `FAILED` and its dead-lettered record untouched, is idempotent
(`CREATED` / `EXISTING`), and refuses with `REISSUE_REQUIRED` when the credential
is no longer valid. Everything else that dead-letters is routed to the owning
surface, with an explicit instruction to record a `BLOCKED` finding rather than
hand-edit a row if no delivered operation can produce the missing effect.

Vocabulary is kept honest against the two easiest confusions: the row's
`PENDING/DISPATCHED/FAILED/DEAD_LETTER` versus the metric's
`succeeded/retrying/failed_terminal`, and `UNKNOWN_JOB_TYPE` as a signal rather
than a gap.

The `notification.delivery` claim-gate behaviour is documented as the guarantee
it is — **a missing policy costs a notification its delivery time, never its
life** — and re-proved live in §T.

---

## M. Storage incident

`RB-09`, on H04-C1 semantics. The operator's first discriminator is **timing**: a
response at about 20 seconds is the storage deadline firing, and a fast `500` is
something else.

Carried forward as delivered facts, not restated as advice:

```text
operation deadline        20s, on the abort signal — NOT on S3 client options
                          (both requestHandler forms measured, neither bounds a stalled call)
upload during outage      503 in ~20s, app-owned JSON envelope, 0 orphan asset rows
private read during outage 500 in ~20s, no partial bytes, anonymous still 401
after recovery            byte-identical, no replacement uploaded
```

No object-key, endpoint, bucket or credential leakage is possible in an error,
and an error that leaks one is classified as a security finding rather than a
diagnostic aid. **No direct object-store surgery is documented**, because no
pre-existing approved procedure exists; deleting, overwriting or moving objects
is in the forbidden list, as is uploading a replacement before establishing that
an object is actually lost.

The `nginx 413` at 1 MiB is separated from storage incidents entirely and routed
to `RB-14 §4.1` as the pre-R01 edge alignment (`FU-APP12-H04-C1-01`).

---

## N. Health diagnostics

`RB-10`. Seven layers, outside in — Gateway/TLS/DNS, Storefront/Admin, API,
Worker, PostgreSQL, object storage, monitoring plane — each with its commands,
its symptom table and its onward route. The monitoring plane is deliberately
last: the applications do not depend on it, so a broken dashboard is never the
cause of a broken checkout.

Two traps are stated rather than left to be discovered: readiness `503` during a
rollout is the delivered drain behaviour and is correct; and the worker has no
Service, no HTTP endpoint and no probe, so `kubectl get endpoints` will never
answer a question about it.

A symptom-to-layer map turns a customer sentence into a starting layer, and the
new port-forward block (Storefront 3000, Admin **3001**, API 4000 — measured,
because the two app Services do not share a port) lets an operator separate an
edge fault from an application fault in one command.

---

## O. Logs / metrics inspection

`RB-11`. The full metric catalogue as delivered, the three `outcome` values and
why `refused` never pages, the two classifications worth memorising (a replay is
`refused`/`REPLAYED`; a routed `REQUIRES_REVIEW` is `refused`), and the two known
absences so nobody hunts for them (`transition="release"` has no production
emitter; `UNKNOWN_JOB_TYPE` is a signal).

The Loki label contract is stated exactly — seven labels, `level` the only
derived one, auto-labels off, `filename` dropped — with the rule that every
request id, correlation id, job key and entity id is a **field**, which is why
they are matched with `| json | field =` and never selected with `{}`. The five
dashboard recipes are reproduced plus a sixth for one outbox row by `jobKey`,
which is the query that diagnosed a dead letter with no database session at all.

The correlation limitation is carried honestly: no single field spans an API
request and the worker attempt it produced, and closing it needs an
`outbox_events` column.

What is **not** in a log line is stated with the instruction that follows from
it: take the `requestId` to the Admin surface, not to the logs.

The seven offline configuration validators are reproduced with the
`MSYS_NO_PATHCONV=1` prefix Git Bash needs, matching the scoped command index.

---

## P. Incident response

`RB-12`. The severity model is the one the alert rules already carry —
`critical` / `warning` / no alert — and nothing more. **No SLA, no
response-time target, no customer-communication promise and no paging rotation
is invented**, and the document says why for each: no delivered authority defines
one, and `production_alert_receiver` is still `REQUIRED_BEFORE_R01`.

The eight steps §4 asks for are all present: declare (with one named owner),
stabilize (roll back first if a release correlates; recognise fail-closed
behaviour working), preserve evidence **before** changing anything (a capture
block plus the secret checker), stop unsafe changes (seven absolutes), recover
through an approved procedure (a diagnosis-to-runbook table), verify the
invariants rather than the symptom (money/stock, queue, schema, surface), record
a timeline in UTC with the commands actually run including the ones that did not
help, and follow up — where the highest-value item is named as editing the
runbook that was wrong while you still remember what was missing.

---

## Q. Backup / restore authority

`RB-13`. The repository-owned mechanism is real and rehearsed by DB10, and the
runbook documents it precisely: `db:backup`, `db:restore`, `db:pitr:rehearse`,
`db:retention`, the manifest as the point of the tool, the sha256 gate **before**
anything is restored, the refusal to restore over an existing database, and the
row-count and migration-journal parity assertions that make `pg_restore`
returning 0 insufficient.

**The production gap is stated rather than glossed.** These tools reach
PostgreSQL through `docker exec` against a named container, which is the
development and disposable-staging topology; production PostgreSQL topology is
ADR-reserved and unresolved. Encryption at rest, an off-site copy, a cadence, an
RPO and an RTO are all deferred and production-blocking.

The exact pre-R01 acceptance requirement is written as an eight-item list
(`RB-13 §2`) and mirrored in the go-live checklist. **No vendor-specific
production step is invented.**

Object-storage recovery is called out as a separate, unsolved recovery: `assets`
rows restore as references and the bytes are the object store's problem, so a
"successful" database recovery can still point at missing objects.

A **rehearsal against a repository-owned mechanism in disposable staging was not
run**, and this is disclosed rather than implied: the disposable PostgreSQL was a
Kubernetes pod, not the Docker container `backup-runtime.mjs` addresses, so
running `db:backup` against it would have proved a path the tool does not
actually support in that topology. DB10 rehearsed the tools against disposable
databases (DR-02/03 PITR, DR-04 corrupt artifact, DR-05 lost volume); H07 adds no
counter-evidence and claims none. Filed as `FU-APP12-H07-04`.

---

## R. Go-live checklist

`RB-14`, ten sections, opening with the sentence that governs it: **this
checklist is not satisfiable today, and says so.**

Referenced accepted evidence: H01 security, H02 production configuration, H03
observability, H04 resilience, H05 performance, H06 SEO/public readiness, H07
runbooks — each as a row naming the checkpoint whose accepted report is the
evidence.

Re-measured facts to check rather than copy: `Wave2=false` explicitly,
OpenAPI 125/138/278, public operations 49, release matrix 28/18/3,
migrations 38, DB tables 79, Admin routes 26, Storefront routes 20.

Unresolved external inputs, none tickable and none softened:

```text
4.1  production edge architecture, DB topology, object-storage topology,
     edge endpoint-reconfiguration behaviour, edge body-limit   (FU-APP12-H02-05)
4.2  origins, object-storage address, real social URLs, hostnames, gatewayClassName
4.3  merchant config — AND a human scanning a real QR with a real banking app
4.4  every secret, with the secret checker
4.5  NOTIFICATION_PROVIDER = NOT_INTEGRATED                     ← new, hard blocker
4.6  production_alert_receiver, grafana credential, monitoring persistence/retention
4.7  backup/restore authority, all eight items
4.8  canonical store facts (address, hours, phone, e-mail — all NOT_AVAILABLE)
```

Plus: no test or `G03` data in production; operational readiness including an
operator who has actually performed a `REQUIRES_REVIEW` resolution in staging;
and the sign-off, which states that R01 `GO` is required and that production
deployment is **separately authorized**.

The closing rule is the one that protects the whole document: *"Repository-ready"
and "value supplied" are different states, and conflating them is how a shop goes
live with a payment account that belongs to nobody.*

---

## S. Payment runbook-only exercise (Exercise A)

**PASS.**

Environment: a disposable minikube profile `embroidery-h07` (Kubernetes v1.31.4),
namespace `embroidery-staging`, the committed base + staging overlay, four
images built from the monorepo root `--target runner` and loaded into the
cluster, the disposable PostgreSQL and MinIO scaffolding, migration Job, and the
canonical staff-bootstrap one-shot. Database `embroidery_db7_h02_staging` — the
disposable prefix the fixture guard requires.

The case was driven into real state through the real application, never seeded:
a real verification challenge, verified with a real code produced by the real
worker path; a real Ready-Made order; a real Admin shipping-fee confirmation; a
real step-up; a real customer-opened payment attempt.

```text
order            ORD-GFJNRV3YDT   AWAITING_SHIPPING_FEE   399000.00
shipping fee     25000            SHIPPING_DETAIL_SAVED   payable 424000.00
customer read    AWAITING_PAYMENT · FULL PENDING · reference ORDGFJNRV3YDTFL
attempt          01a06d5b-…       PENDING 424000.00
```

The transfer reference matches the derived pattern RB-06 documents,
`^ORD[A-Z0-9]{10}FL$`, character for character.

**The operator then followed RB-06 and nothing else.**

Step 1 — safe observations, the runbook's own call:

```text
GET /api/admin/orders/{id}/payments
  ORD-GFJNRV3YDT · AWAITING_PAYMENT · READY_MADE
  attempts[0]  BANK_TRANSFER  PENDING  424000.00  evidence []
  reconciliations []
```

Step 2 — the statement showed 400 000, not 424 000. RB-06 **Case B**: enter what
the bank actually shows and let the server decide.

```text
POST /api/admin/payment-attempts/{id}/verify
  observedAmount 400000 · observedTransferReference ORDGFJNRV3YDTFL · note …

HTTP/1.1 200 OK
  attemptStatus        REQUIRES_REVIEW
  depositStatus        PENDING
  orderStatus          AWAITING_PAYMENT
  reconciliationAction MANUAL_MATCH
  replayed             false

state: satisfied=0 succeeded=0 requires_review=1 reserved=1 consumed=0 reconciliations=1
```

Exactly what RB-06 Case B predicts: `200`, a durable review, nothing satisfied,
the order not advanced, the reservation not consumed.

Step 3 — the operator reconciled with the bank, found 424 000 received with the
correct memo, and resolved it **with the same verify action**, as the runbook
and the Admin copy both instruct:

```text
HTTP/1.1 200 OK
  attemptStatus        SUCCEEDED
  depositStatus        SATISFIED
  orderStatus          READY_FOR_DELIVERY
  reconciliationAction RESOLVE_REVIEW      <- correctly distinguished from MANUAL_MATCH
```

Step 4 — the five invariants, verified together as RB-06 requires:

```text
satisfied=1  succeeded=1  consumed=1  reserved=0  reconciliations=2
status=READY_FOR_DELIVERY
sku_stocks.quantity_on_hand  60 -> 59        (decremented exactly once)
reconciliation history        MANUAL_MATCH, RESOLVE_REVIEW
```

Replay and settled guards, also from the runbook (Case D):

```text
same facts again      200  SUCCEEDED  replayed: true
different facts       409  PAYMENT_ATTEMPT_ALREADY_SETTLED
after both:  satisfied=1 succeeded=1 consumed=1 reconciliations=2 onhand=59
```

Required outcomes, all met:

```text
correct diagnosis                 yes — Case B recognised from the runbook alone
safe reconciliation               yes — the delivered verify operation only
no SQL                            yes — SQL was read-only verification, nothing else
no duplicate payment success      yes — succeeded = 1 after a replay and a 409
no duplicate stock/reservation    yes — consumed = 1, on-hand decremented once
correct final state               yes — READY_FOR_DELIVERY
```

**One runbook edit came out of this exercise**, per §5. A replay returns
`reconciliationAction` computed from the attempt's state *now* rather than the
action that was written: the replay answered `MANUAL_MATCH` although the stored
history correctly reads `MANUAL_MATCH, RESOLVE_REVIEW`. Nothing was written, but
an operator recording the replay's answer would record the wrong action. RB-06
Case D now says so and points at the history as the record. The exercise was
re-checked after the edit.

---

## T. Stuck-job runbook-only exercise (Exercise B)

**PASS.**

The condition is bounded, real, and the one H04-C1 identified as the Wave-1
hazard: the `notification.delivery` policy detached (a fixture mutation used
**only** as a fault prerequisite, exactly as H04-C1 did), the worker restarted
into the closed claim gate, and then two genuine verification challenges issued
through the real public endpoint.

```text
worker readiness   not ready (CAPABILITY_POLICY_MISSING)
work created       2 × notification.delivery.requested   at 17:00:39Z
```

**The operator then followed RB-08 and nothing else.**

Step 1/2 — Grafana row *Is the worker processing and retrying?*, read through
the worker's metrics endpoint:

```text
embroidery_worker_queue_pending                     2
embroidery_worker_queue_oldest_pending_age_seconds  36 and rising
embroidery_worker_job_claimed_total                 series ABSENT
embroidery_worker_job_attempts_total                series ABSENT
```

Backlog rising with attempts flat at zero is RB-08's step-1 reading for **case
A** — nothing is claiming.

Step 3 — the runbook's case-A2 grep, run verbatim:

```text
kubectl logs deploy/embroidery-worker --tail=200 \
  | grep -iE 'CAPABILITY_POLICY_MISSING|notification.delivery'

  Policy "notification.delivery" is not configured. Notification delivery will not send.
  Worker readiness: not ready (CAPABILITY_POLICY_MISSING).

"is not configured" lines in the whole log:  1     (the dedupe holds)
```

Step 4 — the persisted facts, the runbook's second query verbatim:

```text
 id | event_type                      | status  | attempt_count | claimed_by | last_error
  9 | notification.delivery.requested | PENDING |             0 |            |
 10 | notification.delivery.requested | PENDING |             0 |            |
```

`PENDING`, `attempt_count = 0`, never claimed, no error — RB-08 case A2, and the
diagnosis is complete without a single ambiguous step.

Held to prove the central claim — that a missing policy costs delivery time and
never the credential:

```text
t+  0s   9,10  PENDING attempt=0 claimed=null
t+ 60s   9,10  PENDING attempt=0 claimed=null
t+120s   9,10  PENDING attempt=0 claimed=null
        (193 seconds from creation; not dead-lettered, no attempt budget spent)
```

**Recovery — the documented safe path only**, the canonical bootstrap Job:

```text
17:04:04Z  kubectl delete job … ; kubectl apply -f operator/staff-bootstrap-job.yaml
17:04:09Z  [StaffBootstrap] result=REUSED_EXISTING
17:04:08.516Z  Notification delivery policy loaded (version 1, 3 attempts).
17:04:08.539Z  worker.job.completed  jobKey=9   attemptNo=1  outcome=SUCCEEDED  9ms
17:04:08.551Z  worker.job.completed  jobKey=10  attemptNo=1  outcome=SUCCEEDED  20ms

adoption latency    ~4.5s from Job start
worker restarts     0
```

Verification, the queries RB-08 prints:

```text
outbox_events                                       DISPATCHED 10 · nothing else
embroidery_worker_queue_pending                     0
embroidery_worker_queue_oldest_pending_age_seconds  0
embroidery_worker_job_attempts_total{NOTIFICATION_DELIVERY,succeeded}  2
embroidery_notification_delivery_total{verification,success}           2
dead-letter delta                                   0
```

Required outcomes, all met:

```text
diagnosis from H03 telemetry      yes — backlog + absent attempt series + the log line
documented safe recovery only     yes — the canonical bootstrap Job, nothing else
job drains to correct terminal    yes — both DISPATCHED, attempt_count 1, delivered once
no DB status rewrite              yes — the only write was the fault prerequisite
```

No runbook edit was required by this exercise; RB-08's case A2 matched the
observed condition, its queries produced the diagnosis, and its recovery worked
first time. The exercise was not broadened into H04 rehearsal territory.

---

## U. Findings and blockers

### Raised by H07

| Id | Finding | Severity | Owner |
| --- | --- | --- | --- |
| `FU-APP12-H07-01` | `pnpm db:check:manifest` and `pnpm db:migrate:checksums` are printed by `DB10_RESTORE_RUNBOOK.md`, `DB10_CROSS_MACHINE_SETUP.md` and `DB10_DISASTER_RECOVERY_MATRIX.md` and are **not scripts of any package** — the root `package.json` no longer carries them (GOV-Q01). The real invocations are `node tools/db-manifest-check.mjs` and `node packages/database/tools/db-migration-checksum-check.mjs`. An operator following the DB10 restore runbook hits a dead command at step 4. RB-13 prints the correct invocations and flags the staleness; the DB10 documents themselves are DB-phase artifacts and were **not** rewritten by H07. | Medium | `APP12-V02` |
| `FU-APP12-H07-02` | The disposable staging PostgreSQL's readiness probe runs `pg_isready -d embroidery` while `POSTGRES_DB` is `embroidery_db7_h02_staging`, so the container logs `FATAL: database "embroidery" does not exist` every 5 seconds for its whole life. Test scaffolding only, never production topology, but it fills the log an operator would read during a staging incident. | Low | `APP12-V02` |
| `FU-APP12-H07-03` | **A worker whose `bootstrap()` throws is left permanently half-started.** The top-level handler logs one opaque line and sets `process.exitCode = 1`, but the job poll runtime, the intake-cleanup timer and the reservation-expiry timer already hold the event loop open, so the process never exits. The pod stays `Running 1/1`, `0` restarts, no failing probe — with **no metrics listener bound**, so the two gauges every worker diagnosis depends on are unavailable in exactly that state. Observed on the cluster's first cold boot (a transient `PersistenceError`, generic message `The operation could not be completed.`), not reproduced on the next start. Recoverable by an operator (`rollout restart`), which is why this is not `BLOCKED_CROSS_BOUNDARY`; documented in RB-15 §2 and RB-10 layer 4. | **High** | `APP12-H08` |
| `FU-APP12-H07-04` | No backup/restore rehearsal was run in H07's staging. `backup-runtime.mjs` reaches PostgreSQL by `docker exec` against a named container; the disposable staging database was a Kubernetes pod, so the tool does not address it. Disclosed in §Q rather than substituted with a weaker proof. | Medium | pre-R01, with `FU-APP12-H02-05` |
| `FU-APP12-H07-05` | **`NOTIFICATION_PROVIDER = NOT_INTEGRATED`.** The only channel adapter bound in every deployment is the recording development adapter: it appends to an in-memory array and reaches nothing outside the process. A notification reaching `DISPATCHED` has been **delivered to nobody**. Wave 1 sells to customers whose only credential for a paid order is an `ORDER_ACCESS` link, and whose only way to start a checkout is a verification code. Confirmed live: both were produced and sealed correctly and landed in process memory. This is the open "Authentication and OTP provider" decision, and §1 forbids H07 integrating one. | **BLOCKER (pre-R01)** | ADR + a later checkpoint; recorded in `RB-14 §4.5` |

### `APP12-H07` is not blocked

§2's test is whether a legitimate Wave-1 incident has **no safe delivered
recovery path**. Every incident class in this directory has one:

| Incident | Delivered recovery |
| --- | --- |
| payment mismatch / review | the same verify operation — proved in §S |
| worker claiming nothing | the canonical bootstrap Job — proved in §T |
| half-started worker | `rollout restart` — `FU-APP12-H07-03` |
| dead-lettered notification | the guarded Admin replay |
| bad release | `rollout undo` |
| storage outage | recovery is on the storage side; the application needs none |
| data loss | `db:restore` into a fresh database |

`FU-APP12-H07-05` is a **missing capability**, not a missing recovery: no amount
of runbook can deliver a message when nothing is integrated to deliver it, and
§2 forbids inventing the capability inside documentation. It is therefore
recorded as a pre-R01 go-live blocker in the checklist that exists for exactly
that purpose — not as an H07 blocker.

```text
APP12-H07 = COMPLETE            (not BLOCKED_CROSS_BOUNDARY)
NO_RECOVERY_REQUIRING_AD_HOC_PRODUCTION_SQL = HELD
unsafe_SQL_recovery_required = false
```

### Inherited, untouched (§6)

```text
FU-APP12-H06-03 -> V02      FU-APP12-PO-BRAND-01 -> V01
FU-APP12-H06-05 -> BRD0     FU-APP12-PO-BRAND-03 -> BRD0
                            FU-APP12-PO-BRAND-04 -> V02
Gallery hardening -> NONBLOCKING_DEFER / later-wave authority
```

None was absorbed.

---

## V. Files changed

**Added — 16 runbooks (4 007 lines)**

```text
docs/operations/README.md                        155
docs/operations/RB-01-DEPLOYMENT.md              244
docs/operations/RB-02-MIGRATION.md               190
docs/operations/RB-03-ROLLBACK.md                183
docs/operations/RB-04-STAFF-BOOTSTRAP.md         217
docs/operations/RB-05-SECRET-ROTATION.md         237
docs/operations/RB-06-PAYMENT-RECONCILIATION.md  333
docs/operations/RB-07-STUCK-ORDER.md             206
docs/operations/RB-08-STUCK-JOB-AND-OUTBOX.md    370
docs/operations/RB-09-STORAGE-INCIDENT.md        196
docs/operations/RB-10-HEALTH-DIAGNOSTICS.md      221
docs/operations/RB-11-LOGS-AND-METRICS.md        276
docs/operations/RB-12-INCIDENT-RESPONSE.md       200
docs/operations/RB-13-BACKUP-AND-RESTORE.md      233
docs/operations/RB-14-GO-LIVE-CHECKLIST.md       274
docs/operations/RB-15-ALERT-RESPONSE.md          472
```

**Added — the documentation-integrity gate**

```text
tools/check-runbook-references.mjs         276   (≤ 400)
tools/check-runbook-references.test.mjs    282   (≤ 600)
```

Not a recovery command and not an operational one: every check is a lookup
against the repository tree, in the same family as `check-figma-design-index.mjs`.
It closes the convention half of `FU-APP12-H02-02` (repository tools carry unit
tests) for the tool it adds.

**Modified**

```text
docs/implementation/SCOPED_COMMAND_INDEX.md   + CMD-CHECK-RUNBOOK-REFERENCES
                                              + CMD-TEST-RUNBOOK-REFERENCES
docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md   roadmap status
```

**Not changed:** no application source, no test, no manifest, no migration, no
OpenAPI artifact, no generated client, no Figma entry.

---

## W. Validation

Change-impact only, selected from `VALIDATION_GOVERNANCE.md` §3. No
repository-wide aggregate was run.

| Command | Result |
| --- | --- |
| `git diff --check` / `--cached --check` | clean |
| `node tools/check-runbook-references.mjs` | **PASS** — 165 links, 37 paths, 9 tools, 9 scripts, 10 alert ids |
| `node --test tools/check-runbook-references.test.mjs` | **18/18 pass** |
| `node tools/check-release-config.mjs production` | FAIL (21) — expected; every externally-owned value empty |
| `node tools/check-release-config.mjs staging` | FAIL (6) — expected; committed placeholder image refs |
| `pnpm --filter @embroidery/api openapi:check` | artifact up to date — **no drift** |
| `pnpm --filter @embroidery/api-client check:generated` | up to date, tree hash `60443066…` |
| `node tools/check-storefront-route-authority.mjs` | pass — route authority unchanged |
| `node tools/check-report-secrets.mjs` | see below |
| `npx prettier --check` on every touched file | all matched files use Prettier style |
| file size | 276 / 282 lines, both inside the limits |

Live, on the disposable staging cluster: the deployment, migration, bootstrap,
health-diagnostic and both rehearsal command sets in §E, §F, §H, §S and §T.

**The gate found three real defects, which is the only reason to trust it.** On
its first run it reported `pnpm db:check:manifest` is not a script of the root
package — `FU-APP12-H07-01`, a stale command an operator would have hit at step
4 of the DB10 restore runbook. Its own suite then caught two defects in the gate
itself: a `pnpm` script pattern that did not allow hyphens (silently truncating
`check:storefront-route-authority` to `check:storefront`), and a link pattern
that read the ordinary same-document form `](#heading)` as a file named
`#heading`. Both are fixed, both carry a regression test, and the second is
recorded in the source comment.

Not run, and why: no application source or test changed, so no workspace lint,
typecheck or Jest suite is justified; no OpenAPI operation changed, so no
regeneration; no Figma entry changed, so no design-index gate; no browser
surface changed, so no Playwright tier.

---

## X. Hygiene

**Disposable teardown**

```text
namespace embroidery-staging          deleted
minikube profile embroidery-h07       deleted ("Removed all traces")
4 release images (api/worker/storefront/admin :h07)   removed
disposable PostgreSQL + MinIO         destroyed with the cluster (emptyDir)
synthetic secret env files            removed
per-run TLS keys and certificates     removed  (2 pairs, never committed)
captured verification codes / tokens  removed
scratch scripts, rendered manifests   removed
packages/e2e-testing/h07-drain.mjs    removed (temporary harness driver)
minikube profile list                 no profile found
```

**Shared development hygiene**

```text
shared `embroidery` database: orders matching the H07 codes   0
disposable databases on the dev server                        none
development stack containers                                  all 7 running, untouched
```

Every commercial row H07 created — two orders, their items, reservations,
obligations, attempts, reconciliations, grants and outbox events — lived only in
`embroidery_db7_h02_staging` on the disposable cluster and was destroyed with it.
`order_items` is undeletable by design, which is exactly why no commercial
evidence was allowed anywhere near shared data.

```text
G03 data created      = false
production deployed   = false
pushed                = false
secret values in report or runbooks = none
```

Two disclosures about the rehearsal method, stated rather than smoothed over:

- **The Gateway API controller was not installed.** The Gateway and HTTPRoute
  resources could not be applied (no CRDs), and every surface was reached by
  `kubectl port-forward`. H02 already proved the Gateway, TLS, HSTS and the
  HTTP→HTTPS redirect live; neither required exercise depends on the edge, and
  RB-01's full deployment rehearsal is not one of them.
- **The plaintext verification codes and the `ORDER_ACCESS` token were read
  through the delivered worker path run on the host.** The only bound channel
  adapter is memory-only inside the worker process, so a code produced by the
  staging worker is unreadable from outside it. The staging worker was scaled to
  zero, the delivered handler was run against the same disposable database with
  the same envelope key, and the code it decrypted was typed back into the real
  public endpoint. No secret was logged, printed into this report, or retained.

---

## Y. Baseline freeze

Unchanged, and re-measured where a command exists to measure it.

```text
OpenAPI              125 paths / 138 operations / 278 schemas   (openapi:check — no drift)
public operations    49
release matrix       28 DENY / 18 ALLOW / 3 SCOPE_GATED
migrations           38                                        (measured live: 38)
DB tables            79                                        (measured live: 79)
Admin routes         26
Storefront routes    20                                        (route authority gate passes)
Figma                unchanged — no design or frontend UI checkpoint
generated client     unchanged (tree hash 60443066…)
API Δ                0
route Δ              0
migration Δ          0
```

---

## Z. External pre-R01 inputs

Names and status only. No value is invented anywhere in this checkpoint.

```text
REQUIRED_BEFORE_R01, ADR REQUIRED
  FU-APP12-H02-05   production Gateway API controller / gatewayClassName
                    production PostgreSQL topology
                    production object-storage topology
                    edge endpoint-reconfiguration behaviour
                    edge body-limit alignment (FU-APP12-H04-C1-01)
  notification provider (FU-APP12-H07-05)          ← BLOCKER, new
  backup/restore authority — 8 items (RB-13 §2)

REPOSITORY_READY, EXTERNAL_RELEASE_VALUE_REQUIRED
  STOREFRONT_PUBLIC_ORIGIN · STAFF_ALLOWED_ORIGINS · DESIGN_SESSION_ALLOWED_ORIGINS
  OBJECT_STORAGE_ENDPOINT / REGION / buckets
  PAYMENT_MERCHANT_BANK_BIN / ACCOUNT_NUMBER / ACCOUNT_NAME / BANK_DISPLAY_NAME
  NEXT_PUBLIC_ZALO_CONTACT_URL · NEXT_PUBLIC_MESSENGER_CONTACT_URL   (FU-APP10-I01-02)
  DATABASE_URL · OBJECT_STORAGE_ACCESS_KEY_ID / SECRET_ACCESS_KEY
  DESIGN_SESSION_SECRET_PEPPER · VERIFICATION_CODE_SECRET_PEPPER
  SECURE_LINK_TOKEN_SECRET_PEPPER · NOTIFICATION_DELIVERY_ENVELOPE_KEY
  STAFF_BOOTSTRAP_PASSWORD (optional) · embroidery-tls tls.crt / tls.key
  Gateway / HTTPRoute hostnames
  production_alert_receiver · grafana_operator_credential
  monitoring_persistence · monitoring_retention
  canonical store facts: address · opening hours · phone · e-mail

STATED AND UNRESOLVED
  no RPO, no RTO, no SLA, no customer-communication commitment, no paging rotation
```

`FU-APP12-H02-05` remains explicit before R01. Store facts remain explicit
before R01. The production alert receiver remains explicit and unresolved.
Production deployment remains separately authorized.

---

## AA. Roadmap

```text
ROADMAP_STATUS  = LOCKED
ROADMAP_LOCK    = LOCKED
CHECKPOINTS     = 38            unchanged; none invented, reordered, merged, split or renamed

APP12-H06       = COMPLETE — PO PASS
APP12-H07       = COMPLETE
APP12-H08       = NEXT

CORRECTION_USED for H07 = 0 / 1
```

Exactly one `NEXT`. H08 was not started. No Gallery feature work was added, no
business HTTP operation, no Admin screen, no lifecycle state, no migration 0039,
no recovery command, no provider integration, no production infrastructure value.
No ad-hoc SQL is a recovery mechanism anywhere in this directory. No `G03` data
was created, production was not deployed, and nothing was pushed.
