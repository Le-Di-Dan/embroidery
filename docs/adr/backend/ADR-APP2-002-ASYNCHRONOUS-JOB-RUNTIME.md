# ADR-APP2-002 — Asynchronous Job Runtime

- Status: Accepted (delivered for review)
- Date: 2026-07-26
- Phase / checkpoint: APP2 / `APP2-DEC-JOBS`
- Decision ID: IMP-D029 (resolves IMP-O003)
- Supersedes: none
- Depends on (not reopened): `ADR-DB5-003` (worker claim/index access paths),
  `ADR-APP2-001` / IMP-D028 (object storage & asset intake)

## Context

APP2 introduces the first real asynchronous work in the product: asset
inspection and derivative generation (`APP2-W01`), plus APP2-owned
cleanup/reconciliation. `IMP-O003` requires the concrete queue/broker and job
runtime to be locked by ADR **before** `APP2-W01`. The worker process today
(`apps/worker`) holds a single no-op keep-alive timer and runs no jobs; the
queue/broker was an explicitly open decision.

The database layer already **pre-designed** the durable path. `ADR-DB5-003`
locked skip-locked exclusive claim access paths; the schema ships:

- `outbox_events` (TBL-073) — transactional outbox with the dispatch columns
  `status` (`PENDING|DISPATCHED|FAILED|DEAD_LETTER`), `attempt_count`,
  `next_attempt_at`, `claimed_by`, `claimed_at`, `dispatched_at`, `last_error`,
  and versioned `payload`/`payload_schema_version`. Claim index
  `ix_outbox_events__next_attempt_id__pending` (partial on `status='PENDING'`,
  key `(next_attempt_at NULLS FIRST, id)`); cleanup index on `DISPATCHED`.
- `background_job_attempts` (TBL-075) — append-only attempt evidence keyed
  `(job_kind, job_key, attempt_no)` (CST-049), `outcome`
  (`SUCCEEDED|FAILED_RETRYABLE|FAILED_TERMINAL`), `is_dead_letter` with its own
  partial index, `error_class` (classification, never PII).
- `idempotency_records` (TBL-074), `policy_configurations` (TBL-…) — idempotent
  intake and configuration source.
- Repositories `OutboxEventStore` (append-in-domain-tx, `claimBatch`
  `FOR UPDATE SKIP LOCKED`, `markDispatched`/`scheduleRetry`/`markDeadLetter`)
  and `BackgroundJobAttemptStore` (`record` written **outside** the domain tx).

This ADR selects the runtime that drives that path and locks its semantics.

### Preflight — storage decision not reopened

`APP2-DEC-STORAGE` is accepted (`ACCEPTED_WITH_BLOCKED_IMPLEMENTATION_GAPS`).
This ADR does not touch `ADR-APP2-001`/IMP-D028. Three storage issues are
**routed, not solved** here (owner = `APP2-B01` entry gate; they block `B01` and
downstream asset-intake, and do **not** block `APP2-DEC-JOBS`, `APP2-D01`,
`APP2-I01`):

- `STORAGE-BLK-01` — content-complete upload idempotency fingerprint.
- `STORAGE-BLK-02` — versioned/discriminated idempotency result JSON shape.
- `STORAGE-BLK-03` — expired allocation reclaim / old-object cleanup ordering.

### Governance — one-correction limit

A checkpoint may receive **at most one** correction. After that, any remaining
defect becomes a **named blocker** with an explicit owner and activation gate,
rather than a further correction chain. Recorded in the completion report.

## Decision Drivers

- **Single source of truth / transactional coupling.** A job must be created in
  the *same* transaction as the domain state change it reacts to, or the two can
  disagree. This is the outbox invariant (INV-23) and it rules the decision.
- **Existing schema is READY** — the durable queue, claim path, attempt
  evidence, retry/backoff columns, dead-letter representation and claim indexes
  already exist (`ADR-DB5-003`). Default expectation `NO_APP2_MIGRATION`.
- **Single-node APP2** at locked scale (<100 orders/month) needs durability,
  bounded retry and crash recovery — not high-throughput brokered fan-out.
- **Local Compose simplicity / testability** — no second datastore to run,
  seed, or reset; jobs are testable with the disposable-Postgres harness.
- At-least-once with idempotent consumers is already the accepted contract
  (`ADR-DB5-003` CC-25). The design optimizes for never losing work, not for
  exactly-once claiming.

## Options Considered

### J1 — PostgreSQL-backed claim queue (existing persistence) — **chosen**

The `outbox_events` relay is the durable work signal; `background_job_attempts`
is the attempt ledger; claim is `FOR UPDATE SKIP LOCKED`. No new datastore, no
new runtime dependency, `NO_APP2_MIGRATION`. Transactionally coupled to domain
writes by construction.

### J2 — Redis + BullMQ — rejected

A **second datastore** and a new runtime dependency. Job creation cannot share
the domain Postgres transaction, so the outbox invariant is lost or must be
rebuilt as a Postgres→Redis relay (i.e. J1 plus Redis). Adds a Compose service,
a persistence/eviction configuration surface, and a second source of truth for
work state. No benefit at single-node APP2 scale. Redis durability
(AOF/RDB) is weaker than the Postgres row already written.

### J3 — RabbitMQ — rejected

A broker with its own delivery/ack semantics and infrastructure. Same
transactional-coupling loss as J2 (publish is not in the domain tx), heavier
local Compose, and its routing/exchange model is unused by three job families on
one node. At-least-once via consumer ack duplicates what the outbox already
guarantees.

### Hard-gate comparison

| Gate | J1 Postgres | J2 Redis/BullMQ | J3 RabbitMQ |
|---|---|---|---|
| Existing-schema compatible | ✅ ships it | ❌ external | ❌ external |
| Transactional-outbox compatible | ✅ native | ❌ relay needed | ❌ relay needed |
| Durable attempts | ✅ TBL-075 | ⚠️ in Redis | ⚠️ in broker |
| Lease recovery | ✅ visibility timeout | ✅ built-in | ✅ ack/redeliver |
| Bounded retry | ✅ `next_attempt_at` | ✅ | ✅ |
| Idempotent execution | ✅ (consumer) | ✅ (consumer) | ✅ (consumer) |
| Single source of truth | ✅ | ❌ two stores | ❌ two stores |
| Local Compose complexity | ✅ none added | ❌ +service | ❌ +service |
| Testability (disposable PG) | ✅ | ⚠️ +Redis | ⚠️ +broker |
| Single-node APP2 fit | ✅ | over-built | over-built |
| Future migration path | ✅ port-behind seam | n/a | n/a |
| Windows/Linux/Docker | ✅ (already) | ✅ | ✅ |
| New runtime dependency | **none** | Redis + `bullmq` | RabbitMQ + client |

## Decision

**J1 — a PostgreSQL-backed claim queue on the existing persistence.** No new
runtime dependency; `NO_APP2_MIGRATION`.

### D1 — Outbox is the durable work signal; no separate jobs table

APP2 fans out **one logical job per domain transition**, so a dedicated typed
job-queue table is **OUT_OF_SCOPE**. `outbox_events` carries the work: a domain
transition appends exactly one event (`aggregate_kind='ASSET'`) inside its own
transaction (`OutboxEventStore.append`, `@requiresTransaction`). The
`payload_schema_version` column carries payload versioning.

### D2 — Idempotent job creation

Creation idempotency is a property of the **domain transition**, not of a broker
dedupe. The Asset lifecycle transition that appends the event is itself guarded
(one `UPLOADED→INSPECTING` transition per asset; intake idempotency via
`idempotency_records`, IMP-D028/C2). A replayed transition does not append a
second event. At-least-once **relay** of one event is tolerated because
execution is idempotent (D6).

### D3 — Claim and FIFO ordering

Claim is the `CONTENDED_CLAIM` path (`ADR-DB5-003` R1): partial-index →
`LIMIT n` → `FOR UPDATE SKIP LOCKED` → mutate out of the claimable set. Query
predicate `status IN ('PENDING','FAILED') AND (next_attempt_at IS NULL OR
next_attempt_at <= now())`, order `(next_attempt_at NULLS FIRST, id)` — FIFO by
insert order (R3/R4). `SKIP LOCKED` gives non-blocking fairness; a bounded batch
plus backoff prevents head-of-line blocking.

### D4 — Lease = visibility timeout on `next_attempt_at`

`outbox_events` has **no** `lease_expires_at` column and its state set has no
in-flight status. The lease is therefore a **visibility timeout carried on
`next_attempt_at`**: the claiming transaction sets `claimed_by`, `claimed_at`,
`attempt_count := attempt_count + 1`, and `next_attempt_at := now() + leaseDuration`.
This satisfies `ADR-DB5-003` **R6** — the claim exits the claimable set in the
same transaction — using only the CST-099 mutable column set (verified by the
S24 trigger in the spike), and touches neither `payload` nor identity (INV-23).

### D5 — Reclaim after crash is automatic; heartbeat is out of scope

If a worker crashes after claiming and before completing, the row is **not**
lost: when the lease elapses (`next_attempt_at <= now()`) it re-enters the
claimable set and another worker reclaims it, `attempt_count` incrementing again.
No separate reclaim method or stuck-job scanner is required. **Heartbeat /
mid-job lease extension is OUT_OF_SCOPE for APP2** (single-node, bounded
inspection/derivative durations covered by a generous lease); deferred to the
first phase with genuinely long-running jobs.

### D6 — Attempts, retry, terminal failure

- **Success:** `markDispatched` sets `status='DISPATCHED'` (structurally leaves
  the claim index), clears `claimed_*`; record a `SUCCEEDED` attempt.
- **Retryable failure:** `scheduleRetry` sets `status='FAILED'`,
  `next_attempt_at := now() + backoff`, `last_error := <errorClass>`; record a
  `FAILED_RETRYABLE` attempt. The row is claimable again only after backoff.
- **Terminal failure (bounded retries exhausted):** `markDeadLetter` sets
  `status='DEAD_LETTER'`, `next_attempt_at := NULL` (permanently out of the
  claimable set, R5); record a `FAILED_TERMINAL` attempt (`is_dead_letter=true`,
  the operator's manual-review row).
- Attempt records are **append-only** and written **outside** the domain
  transaction (`BackgroundJobAttemptStore.record`, `dbOutsideTransaction`) so
  the evidence survives a rolled-back domain tx. `job_kind` is the closed set
  (`ASSET_PROCESSING`, `OUTBOX_DISPATCH`, …); `job_key` is the aggregate id;
  `attempt_no` mirrors the outbox `attempt_count`.

### D7 — Backoff / limits are configuration, not literals

Backoff curve, max attempts, lease duration, poll interval and claim batch size
`n` live in `policy_configurations` (echoing `ADR-DB5-003` Deferred). They are
**config parameters** (verdict `PASS_WITH_CONFIG_PARAMETERS`), owned by
`APP2-I02`/`APP2-W01`, never hard-coded.

### D8 — Delivery guarantee

Target and only claim: **at-least-once delivery + idempotent job creation +
idempotent job execution + durable effect.** Exactly-once delivery is **not**
claimed (CC-25). Handlers must be idempotent (e.g. derivative writes keyed by
deterministic storage key).

### D9 — Outbox rows are never app-deleted

The S24 trigger (CST-099) **rejects row `DELETE` on `outbox_events`** (append +
column-scoped). Confirmed in the spike. Worker cleanup must therefore **never**
delete outbox rows; `DISPATCHED` accumulation is bounded by the retention sweep
(DB10 tooling, cleanup index `ix_outbox_events__dispatched_id__dispatched`), not
by APP2. This is an operational note, not a blocker.

### D10 — Worker process contract

- **Bootstrap:** `NestFactory.createApplicationContext(WorkerModule)` with
  `enableShutdownHooks()` (as today); own DB pool via `DatabaseModule`
  (DEC-DB7-003), independent sizing from the API.
- **Object-storage dependency:** the worker consumes `packages/object-storage`
  (`ObjectStoragePort`, IMP-D028/`APP2-I01`) for derivative work — injected, no
  vendor coupling.
- **Poll loop:** claim batch → dispatch to a handler registry keyed by
  `event_type`/`aggregate_kind` → record attempt → mark terminal. Interval and
  batch from config (D7).
- **Concurrency:** intra-process bounded worker concurrency (config); horizontal
  workers are safe by `SKIP LOCKED` + lease.
- **Graceful shutdown (SIGTERM/SIGINT):** stop claiming immediately, allow
  in-flight handlers to complete or relinquish (their lease expires → reclaim),
  release the pool, exit. This **replaces** the no-op `WorkerLifecycleService`
  keep-alive.
- **Health/readiness:** DB-pool reachability probe (aligns with existing
  `/api/health/readiness` pattern for the API).

### D11 — Structured logging and out-of-request correlation (FU-A07)

Worker jobs have **no HTTP request**, so `X-Request-ID` (IMP-D020) does not
apply. A **job correlation id** (`{job_kind}:{job_key}:{attempt_no}`) is bound
per attempt via the built-in `AsyncLocalStorage` seam (same primitive as
IMP-D020, different entry point) and emitted through the IMP-D022 structured
logger. **`FU-A07` is owned by `APP2-I02`** (below). No business/audit event
names in logs; `error_class` only, never provider payloads or PII.

## Repository gaps (owner `APP2-I02`/`APP2-W01`) — not schema gaps

Per the audit discipline: a missing repository behaviour is a repository
implementation gap, not a schema gap.

1. `OutboxEventStore.claimBatch` currently sets `claimed_by`/`claimed_at`/
   `attempt_count` but **does not set the `next_attempt_at` lease** — so a
   claimed row is re-selectable on the next poll (repeated delivery bounded only
   by luck). D4 requires the lease write. **Repository implementation gap**
   (owner `APP2-I02`), representable with the existing mutable column set —
   **no migration**.
2. `apps/worker` has **no poll loop, handler registry, attempt-recording seam,
   correlation, or graceful shutdown** beyond the keep-alive. **Application
   gap** (owner `APP2-I02`).
3. Reclaim needs **no** new method — it is lease-driven (D5).

## Migration and dependency verdict

- **Migration:** `NO_APP2_MIGRATION`. Every required behaviour maps to existing
  columns, indexes, triggers and repositories. Proven by the controlled spike
  (23/23) against the real 31-migration / 78-table schema.
- **Dependency:** **none.** No new runtime package or service. (Had an external
  broker won, future packages would have been named here and not installed.)

## Inventory classification (existing DB/runtime authority)

| Capability | Support | Class |
|---|---|---|
| Job table + status tuple | `outbox_events.status` (4-state); no separate jobs table (per-event fan-out) | READY |
| Job family/type + payload | `event_type` + `payload` + `payload_schema_version`; `job_kind` enum | READY |
| Idempotency key | `idempotency_records` + one-event-per-transition | READY |
| Priority | none | OUT_OF_SCOPE (FIFO, single-node) |
| `available_at` / `run_after` | `next_attempt_at` | READY |
| `claimed_at` / claim owner | `claimed_at` / `claimed_by` | READY |
| Lease expiry | visibility timeout on `next_attempt_at` | APPLICATION_GAP + REPOSITORY_GAP (D4/gap 1) |
| Heartbeat | none | OUT_OF_SCOPE (deferred) |
| Attempt count / max | `attempt_count` (READY); max in `policy_configurations` | READY / APPLICATION_GAP |
| Attempt records | `background_job_attempts` | READY |
| Last error | `last_error` + `error_class` | READY |
| Completed / failed ts | `dispatched_at` / `finished_at` | READY |
| Outbox linkage | intrinsic | READY |
| Claim / recovery indexes | IDX-088 / IDX-090 / IDX-059 / IDX-131 | READY |
| `SKIP LOCKED` | `ADR-DB5-003` (DB6-verified) | READY |

## Handoff

### `APP2-I02` — worker job-runtime foundation (new, narrow prerequisite)

Inserted between `APP2-DEC-JOBS`/`APP2-B01` and `APP2-W01` (mirrors the storage
`APP2-I01` foundation). Owns: the poll loop + claim/lease **driver**
(`claimBatch` lease extension, gap 1), the `event_type`→handler registry, the
attempt-recording seam, `FU-A07` (structured logging + out-of-request
correlation), and graceful shutdown replacing the keep-alive. It does **not**
implement any asset job family. Predecessor: `APP2-DEC-JOBS`.

### `APP2-W01` — asset inspection / derivatives

Allowed assumptions: a **job-creation port** (append-in-domain-tx), a
**claim/lease API** (D3/D4), an **attempt API** (D6), a **retry policy** (D7),
**handler idempotency** (D8), **logging/correlation** (D11), and **shutdown**
(D10) — all supplied by `APP2-I02`. W01 adds the asset job family handler and
selects the **image-processing library** (deferred to W01, not decided here).
Predecessors: `APP2-B01`, `APP2-I02`.

### `APP2-B01` — asset intake

Only recorded here: `B01` writes durable **outbox intent** (one
`OutboxEventStore.append` inside the domain transaction) after truthful Asset
lifecycle transitions. `B01` **remains blocked by `STORAGE-BLK-01..03`** (owner
`B01` entry gate) — not solved by this ADR.

### `APP2-I01` — object-storage foundation

Independent and unaffected; may implement the storage foundation only.

## Consequences

**Positive**

- Zero new infrastructure or dependency; the durable path already exists and is
  transactionally coupled to domain writes.
- Crash recovery, retry, dead-letter and FIFO fairness are proven against the
  real schema (spike 23/23), including the R6 lease and the CST-099/INV-23
  trigger boundary.
- The worker keep-alive placeholder gets a real owner (`APP2-I02`).

**Negative / accepted**

- At-least-once delivery persists (CC-25); handlers must be idempotent.
- `claimBatch` needs the lease write before any multi-worker use (gap 1) — a
  repository change, tracked, not a migration.
- No priority / heartbeat today; both are explicitly out of scope and
  re-openable by ADR when a later phase needs them.
- `DISPATCHED` rows are never app-deleted (D9); cleanup depends on the retention
  sweep owned outside APP2.

## Controlled spike (evidence)

Disposable Postgres 16 + the **real 31 migrations** (78 tables) + mirrored store
SQL (no repository import), then fully torn down (zero residue). **23/23 PASS**:
migrations/table-count; claim/cleanup/dead-letter indexes present; CST-099 lease
columns permitted + `payload` frozen (INV-23) + row `DELETE` rejected (D9);
exclusive `SKIP LOCKED` claim (no overlap); FIFO ordering; lease blocks reclaim;
crash → reclaim-after-lease (attempt incremented); retry deferred-then-claimable
after backoff; terminal dead-letter excluded permanently; append-only attempt
survives rolled-back domain tx; `(kind,key,attempt_no)` uniqueness; duplicate
relay → one `DISPATCHED`; shutdown stops claims then resumes. Detail:
[`../../implementation/research/APP2-DEC-JOBS-CANDIDATE-COMPARISON.md`](../../implementation/research/APP2-DEC-JOBS-CANDIDATE-COMPARISON.md).

## References

- `ADR-DB5-003` — worker queue and claim access paths (R1/R3/R4/R5/R6).
- `docs/database/DB3_CONCURRENCY_SPECIFICATION.md` — CC-25 at-least-once.
- `packages/database/src/schema/platform/outbox-events.ts`,
  `background-job-attempts.ts`.
- `packages/persistence/src/platform/outbox-event-store.ts`,
  `background-job-attempt-store.ts`.
- `apps/worker/src/bootstrap/worker-lifecycle.service.ts` (keep-alive to
  replace).
- PostgreSQL 16 `SKIP LOCKED` —
  https://www.postgresql.org/docs/16/sql-select.html#SQL-FOR-UPDATE-SHARE
  (checked 2026-07-26).
- BullMQ (reviewed, not adopted) — https://docs.bullmq.io/ (checked 2026-07-26).
- RabbitMQ (reviewed, not adopted) — https://www.rabbitmq.com/docs (checked
  2026-07-26).
