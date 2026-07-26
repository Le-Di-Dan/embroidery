# APP2-DEC-JOBS — Completion Report

- Checkpoint: `APP2-DEC-JOBS` (decision-only)
- Decision: **IMP-D029** / [`ADR-APP2-002`](../../adr/backend/ADR-APP2-002-ASYNCHRONOUS-JOB-RUNTIME.md) (resolves **IMP-O003**)
- Verdict: **PASS_WITH_CONFIG_PARAMETERS** — `DELIVERED_FOR_REVIEW`
- Commit A (decision): `8211214ed2885ff8af4981e688df7cadce258e8b`
- Migration verdict: **NO_APP2_MIGRATION**; dependency verdict: **none**
- Base HEAD before this checkpoint: `3b167dc` (APP2-DEC-STORAGE-C2 evidence)

## A. Preflight and storage-blocker routing

Branch `production`. Storage decision **not reopened**: `ADR-APP2-001` /
IMP-D028 untouched except status/routing references. `APP2-DEC-STORAGE` is
accepted as `ACCEPTED_WITH_BLOCKED_IMPLEMENTATION_GAPS`; **no
`APP2-DEC-STORAGE-C3`** was created. Verified the storage evidence chain is
present and intact: Decision A `52d582e`, C1 `0c8afd5`, C2 `86d3b91`, C2
evidence `3b167dc`.

Three storage issues are **routed, not solved** here — owner = `APP2-B01`
entry gate; they block `APP2-B01` and downstream asset intake and do **not**
block `APP2-DEC-JOBS`, `APP2-D01`, or `APP2-I01`:

- `STORAGE-BLK-01` — content-complete upload idempotency fingerprint.
- `STORAGE-BLK-02` — versioned/discriminated idempotency result JSON shape.
- `STORAGE-BLK-03` — expired allocation reclaim / old-object cleanup ordering.

**Governance rule (recorded, now locked in the phase plan and this report):** a
checkpoint may receive **at most one correction**; after that, remaining
defects become **named blockers** with an explicit owner and activation gate,
not a further correction chain.

## B. Database / worker inventory

Read from source, not inferred from names (`packages/database/src/schema/
platform/{outbox-events,background-job-attempts,idempotency-records}.ts`,
`packages/persistence/src/platform/{outbox-event-store,
background-job-attempt-store}.ts`, `apps/worker/**`, `ADR-DB5-003`).

| Capability | Support | Class |
|---|---|---|
| Job table + status tuple | `outbox_events.status` (`PENDING/DISPATCHED/FAILED/DEAD_LETTER`); no separate jobs table | READY |
| Job family/type + payload | `event_type`+`payload`+`payload_schema_version`; `job_kind` enum | READY |
| Idempotency key | `idempotency_records` + one-event-per-transition | READY |
| Priority | none | OUT_OF_SCOPE |
| `available_at`/`run_after` | `next_attempt_at` | READY |
| `claimed_at` / claim owner | `claimed_at` / `claimed_by` | READY |
| Lease expiry | visibility timeout on `next_attempt_at` | APPLICATION_GAP + REPOSITORY_GAP |
| Heartbeat | none | OUT_OF_SCOPE |
| Attempt count / max | `attempt_count` (READY); max → `policy_configurations` | READY / APPLICATION_GAP |
| Attempt records | `background_job_attempts` (append-only) | READY |
| Last error | `last_error` + `error_class` | READY |
| Completed / failed ts | `dispatched_at` / `finished_at` | READY |
| Outbox linkage | intrinsic | READY |
| Claim / recovery indexes | IDX-088 / IDX-090 / IDX-059 / IDX-131 | READY |
| `SKIP LOCKED` | `ADR-DB5-003` (DB6-verified) | READY |

Worker today: `apps/worker` runs a **no-op keep-alive timer** and no jobs —
the queue/broker was the open decision.

## C. Candidate comparison

- **J1 — PostgreSQL-backed claim queue (existing persistence): selected.**
- **J2 — Redis/BullMQ: rejected** — second datastore + new dependency; job
  creation cannot share the domain Postgres transaction (outbox invariant
  INV-23 lost or rebuilt as Postgres→Redis relay); over-built at single-node
  scale.
- **J3 — RabbitMQ: rejected** — broker infra + new dependency; same
  transactional-coupling loss; unused routing model for three job families on
  one node.

Hard gates (existing-schema / transactional-outbox / durable attempts / lease
recovery / bounded retry / idempotent execution / single source of truth /
Compose complexity / testability / single-node fit / migration path /
Windows-Linux-Docker) resolve decisively to J1 — full table in the ADR.
External candidates reviewed from official current sources (BullMQ, RabbitMQ
docs, 2026-07-26); **no packages installed**.

## D. Controlled spike

Disposable Postgres 16 (Docker, throwaway DB) + the **real 31 migration
files** (78 base tables) + mirrored store SQL (no repository import, none
modified), then fully torn down — container removed, workspace deleted, dev
stack (6 containers) untouched. **Zero residue. 23/23 PASS.**

Proven: migrations/table-count; claim/cleanup/dead-letter indexes present;
CST-099 lease columns permitted + `payload` frozen (INV-23) + row `DELETE`
rejected; exclusive `SKIP LOCKED` claim (no overlap); FIFO ordering; lease
blocks reclaim; crash → reclaim-after-lease (`attempt_count` incremented);
retry deferred-then-claimable after backoff; terminal dead-letter excluded
permanently; append-only attempt survives a rolled-back domain tx;
`(kind,key,attempt_no)` uniqueness; duplicate relay → one `DISPATCHED`;
shutdown stops claims then resumes. Detail:
[`../research/APP2-DEC-JOBS-CANDIDATE-COMPARISON.md`](../research/APP2-DEC-JOBS-CANDIDATE-COMPARISON.md).

**Finding:** the S24 trigger (migration 0030, CST-099) rejects app-level row
`DELETE` on `outbox_events` — worker cleanup never deletes outbox rows;
`DISPATCHED` cleanup is the DB10 retention sweep (outside APP2). Recorded as
ADR §D9, not a blocker.

## E. Selected runtime

PostgreSQL-backed claim queue on the existing persistence. `outbox_events` is
the durable work signal (one logical job per domain transition; no separate
jobs table); `background_job_attempts` is the attempt ledger;
`idempotency_records`/`policy_configurations` support intake and config. No new
runtime dependency, `NO_APP2_MIGRATION`.

## F. Outbox / job creation

Job creation = `OutboxEventStore.append` **inside the domain transition
transaction** (`@requiresTransaction`), one event per transition
(`aggregate_kind='ASSET'`). Creation idempotency is a property of the guarded
domain transition (one `UPLOADED→INSPECTING` per asset; intake idempotency via
`idempotency_records`), not broker dedupe. `payload_schema_version` carries
payload versioning. Duplicate **relay** of one event is tolerated because
execution is idempotent.

## G. Claim / lease / concurrency

Claim = `CONTENDED_CLAIM` (`ADR-DB5-003` R1): partial `status='PENDING'` index
→ `LIMIT n` → `FOR UPDATE SKIP LOCKED` → mutate out of the claimable set; FIFO
`(next_attempt_at NULLS FIRST, id)`. **Lease = visibility timeout on
`next_attempt_at`** — the claim sets `claimed_by`/`claimed_at`/`attempt_count+1`/
`next_attempt_at=now()+lease`, satisfying R6 (exits the claimable set in the
same tx) within the CST-099 mutable set, touching neither `payload` nor
identity (INV-23). **Crash reclaim is automatic** when the lease elapses (no
reclaim method, no stuck-job scanner). Concurrency: bounded intra-process
workers (config); horizontal workers safe by `SKIP LOCKED` + lease. Heartbeat
out of scope.

## H. Attempts / retry / terminal failure

Append-only `background_job_attempts`, written **outside** the domain tx
(evidence survives rollback), keyed `(job_kind, job_key, attempt_no)`
(CST-049). Success → `DISPATCHED` + `SUCCEEDED`. Retryable → `FAILED` +
`next_attempt_at` backoff + `FAILED_RETRYABLE`. Terminal (bounded retries
exhausted) → `DEAD_LETTER` (`next_attempt_at=NULL`, permanently out of the
claimable set) + `FAILED_TERMINAL`/`is_dead_letter`. Backoff curve, max
attempts, lease duration, poll interval, batch size `n` → `policy_configurations`
(config parameters, not literals). Delivery guarantee: **at-least-once +
idempotent creation + idempotent execution + durable effect; not
exactly-once** (CC-25).

## I. Worker process and FU-A07

`createApplicationContext(WorkerModule)` + `enableShutdownHooks()`; own DB pool
(DEC-DB7-003); consumes `packages/object-storage` for derivatives
(IMP-D028/`APP2-I01`). Poll loop → `event_type` handler registry → attempt
record → terminal mark. **Graceful shutdown (SIGTERM/SIGINT):** stop claiming,
let in-flight handlers complete or relinquish (lease expiry → reclaim), release
the pool — **replacing the no-op `WorkerLifecycleService` keep-alive**.
Readiness = DB-pool probe. **FU-A07** (worker structured logging +
out-of-request correlation): a `{job_kind}:{job_key}:{attempt_no}` correlation
id bound per attempt via `AsyncLocalStorage` over the IMP-D022 logger
(`X-Request-ID`/IMP-D020 does not apply to jobs). **Owner: `APP2-I02`** — a
narrow worker-runtime foundation checkpoint (not a broad platform phase).

## J. Migration / dependency verdict

**`NO_APP2_MIGRATION`** — every behaviour maps to existing columns, indexes,
triggers and repositories; proven by the spike against the real
31-migration / 78-table schema. **No new runtime dependency.** (Had a broker
won, future packages would have been named and not installed.)

## K. Handoff and blockers

- **`APP2-I02` (new):** poll/claim-lease driver (`claimBatch` `next_attempt_at`
  lease extension — repository gap), handler registry, attempt seam, FU-A07,
  graceful shutdown; no asset job family. Predecessor `APP2-DEC-JOBS`.
- **`APP2-W01`:** asset inspection/derivative job family handler +
  image-processing library decision (deferred to W01), using I02's runtime.
  Predecessors `APP2-B01`, `APP2-I02`. Allowed assumptions locked: job-creation
  port, claim/lease API, attempt API, retry policy, handler idempotency,
  logging/correlation, shutdown.
- **`APP2-B01`:** writes durable outbox intent (one `append` in the domain tx)
  after truthful Asset lifecycle transitions; **remains blocked by
  `STORAGE-BLK-01..03`** — not solved here.
- **`APP2-I01`:** independent storage foundation, unaffected.

Repository gaps (owner `APP2-I02`, **not** schema gaps): `claimBatch` lacks the
lease write (today sets only `claimed_by`/`claimed_at`/`attempt_count`); worker
has no poll loop/registry/correlation/shutdown beyond keep-alive. Map now
**19 checkpoints** (inserted `APP2-I02`).

## L. Commit A evidence

`8211214ed2885ff8af4981e688df7cadce258e8b` —
`docs(app2): select asynchronous job runtime` (6 files, docs only): ADR
`ADR-APP2-002`; register IMP-D029 + IMP-O003 resolution; phase plan (banner +
§6.1 map, `APP2-I02` inserted, W01/B01 updated); roadmap + traceability status
pointers; research/spike appendix. No code, package, lockfile, Compose, schema,
OpenAPI, generated-client, or Figma change.

## M. Validation matrix

| Gate | Result |
|---|---|
| `git diff --check` | clean |
| `node tools/check-file-size.mjs` | pass (docs not flagged) |
| `pnpm check:openapi` | up to date (unchanged) |
| `pnpm check:api-client` | tree hash `89c1aace…` (unchanged) |
| `pnpm check:figma-design-index` | pass (39 registry IDs) |
| `pnpm db:check:manifest` | pass (78 tables / 833 columns) |
| `node --test tools/check-figma-design-index.test.mjs` | pass |
| `pnpm quality` | exit 0 |
| Controlled spike | 23/23, zero residue |

Baselines unchanged: OpenAPI `ae015dd6…`, client `89c1aace…`, DB 31
migrations / 78 tables / 833 columns / `4ca56a59…`, Figma 39 IDs.

## N. Acceptance matrix

All 24 criteria met: storage not reopened (1); no C3 (2); `STORAGE-BLK-01..03`
preserved/routed (3); DB job authority audited (4); PostgreSQL vs external
brokers compared (5); one runtime selected (6); outbox semantics locked (7);
claim/lease/reclaim locked (8); attempts/retry/terminal locked (9); worker
concurrency/shutdown locked (10); FU-A07 owned by `APP2-I02` (11); controlled
spike completed (12); migration verdict explicit — `NO_APP2_MIGRATION` (13);
dependency verdict explicit — none (14); W01 handoff exact (15); B01 blockers
untouched (16); no implementation changes (17); quality/artifact/DB checks pass
(18); two docs-only commits (19); report cites Commit A and ≤240 lines (20);
working tree clean after Commit B (21); not pushed (22); APP2 engineering not
started (23); next checkpoint not executed (24).

## O. Scope confirmation

Decided: job runtime + outbox/claim/lease/attempt/retry/terminal semantics +
worker contract + FU-A07 owner. **Not decided:** storage architecture,
`STORAGE-BLK-01..03`, image-processing library (`APP2-W01`), Admin/Storefront
UI (`APP2-D01`), production Kubernetes topology, APP12 distributed platform,
priority/heartbeat (re-openable by ADR). No `APP2-DEC-JOBS-C*` follow-on
created.

## P. Evidence closure

Two docs-only commits: Commit A `8211214…` (decision) and Commit B (this
report). Not squashed; Commit A not amended after this report. Not pushed. STOP
at the review boundary — no `APP2-D01`/`APP2-I01`/`APP2-I02`/`APP2-W01`/
`APP2-B01` implementation, no migrations, no Figma, no next prompt.

## Q. Subsequent correction (`APP2-DEC-JOBS-C1`)

This report describes the decision as delivered. It was subsequently corrected
by **`APP2-DEC-JOBS-C1`** (Commit C `a9ef895bf78d9abcd66f52a44d153f52aadccb44`;
report [`APP2-DEC-JOBS-C1-CORRECTION-REPORT.md`](./APP2-DEC-JOBS-C1-CORRECTION-REPORT.md)),
the **only** correction permitted for this checkpoint. The §C/§G claim predicate
`status IN ('PENDING','FAILED')` and the retryable-failure `status='FAILED'`
mutation contradicted the canonical launch index **IDX-088** (partial `WHERE
status='PENDING'`). The corrected state machine: **`PENDING` is the only
automatic claim/retry state**; retryable failure returns the row to `PENDING`
with a backoff `next_attempt_at` (never `FAILED`); `DISPATCHED`/`DEAD_LETTER`
terminal; **`FAILED` reserved, never emitted or claimed** by the APP2 runtime.
C1 also locks ownership-guarded atomic completion transactions, `job_key =
outbox_events.id`, expired-lease attempt evidence (CST-049 conflict-safe), the
no-heartbeat timeout invariant, the handler idempotency contract, and the
policy-key set. `NO_APP2_MIGRATION`, no dependency; correction spike **25/25**.
Read `ADR-APP2-002` and the C1 report as authoritative where they differ from
§C/§G/§H above.
