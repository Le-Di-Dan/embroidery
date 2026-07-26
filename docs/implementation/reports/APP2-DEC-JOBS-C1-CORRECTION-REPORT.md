# APP2-DEC-JOBS-C1 — Correction Report

- Checkpoint: `APP2-DEC-JOBS-C1` (docs-only correction; the **only** correction
  permitted for `APP2-DEC-JOBS`)
- Decision (unchanged id): **IMP-D029** / [`ADR-APP2-002`](../../adr/backend/ADR-APP2-002-ASYNCHRONOUS-JOB-RUNTIME.md)
- Verdict: **PASS** — `APP2-DEC-JOBS = COMPLETE — CORRECTED, DELIVERED_FOR_REVIEW`
- Correction Commit C: `a9ef895bf78d9abcd66f52a44d153f52aadccb44`
- Migration verdict: **NO_APP2_MIGRATION**; dependency verdict: **none**
- Input chain: Decision A `8211214…`, evidence B `27c324e…`

## A. Preflight and retry-state defect

Preflight clean (HEAD `27c324e`, tree clean, `ADR-APP2-002` / IMP-D029 present,
outbox status tuple `PENDING/DISPATCHED/FAILED/DEAD_LETTER`, IDX-088 confirmed
partial `WHERE status='PENDING'`). **Defect:** the original §D3/§D6 claimed
`status IN ('PENDING','FAILED')` and set retryable failures to `status='FAILED'`,
but **IDX-088** (`ix_outbox_events__next_attempt_id__pending`) is partial on
`status='PENDING'` — a `FAILED` row is therefore **not on the automatic claim
path** (no index, no scheduler converts it). Acknowledged and corrected without
reopening any accepted decision, adding an index/table/scheduler, or migrating.

## B. Corrected state / sub-state model

APP2 automatic runtime states: **`PENDING`** (queued, leased, or waiting for
retry backoff), **`DISPATCHED`** (successful terminal), **`DEAD_LETTER`**
(terminal failure). **`FAILED` remains schema-valid but is never emitted or
claimed** by the APP2 runtime — reserved for a future/manual recovery policy;
the DB value is neither deleted nor renamed. `PENDING` sub-states (existing
columns; `next_attempt_at` dual-purpose by `claimed_by` nullness):

| Sub-state | `status` | `claimed_by` | `claimed_at` | `next_attempt_at` |
|---|---|---|---|---|
| Fresh queued | `PENDING` | `NULL` | `NULL` | `NULL` |
| Waiting for retry backoff | `PENDING` | `NULL` | `NULL` | `retry_due_at` |
| Actively leased | `PENDING` | `worker_id` | `claim_time` | `lease_expires_at` |

No `lease_expires_at` column added.

## C. Claim and lease contract

Exact claim (§D3): `WHERE status='PENDING' AND (next_attempt_at IS NULL OR
next_attempt_at <= now()) ORDER BY next_attempt_at NULLS FIRST, id LIMIT
:batch_size FOR UPDATE SKIP LOCKED`. In the same transaction each selected row
gets `claimed_by`, `claimed_at`, `attempt_count := attempt_count+1`,
`next_attempt_at := now()+lease_duration`; the row **stays `PENDING`** (exits the
claimable *time window* while retaining IDX-088; CST-099 mutable set only;
`payload`/identity untouched, INV-23). Returns event identity, `event_type`,
`payload_schema_version`, `payload`, the incremented attempt number, lease
deadline.

## D. Success / retry / terminal transactions

Execution identity: `job_kind` = handler kind mapped from `event_type`;
**`job_key = outbox_events.id`**; `attempt_no` = incremented `attempt_count`;
`correlation_id = "{job_kind}:{job_key}:{attempt_no}"`. Each outcome runs **one
completion transaction** — attempt row **and** outbox mutation atomic — guarded
by `WHERE id AND status='PENDING' AND claimed_by=thisWorker AND
attempt_count=thisAttempt`, **after** the handler durable-effect tx commits:

- **Success:** `SUCCEEDED` attempt (`is_dead_letter=false`, safe fields NULL) +
  outbox → `DISPATCHED`, `dispatched_at=now()`, `next_attempt_at=NULL`,
  `claimed_*=NULL`, `last_error=NULL`, `error_class=NULL`.
- **Retryable:** `FAILED_RETRYABLE` attempt (redacted class + bounded detail) +
  outbox → **`PENDING`**, `next_attempt_at=now()+backoff`, `claimed_*=NULL`,
  bounded `last_error`/`error_class`. **Never `FAILED`.**
- **Terminal** (non-retryable **or** `attempt_no >= max_attempts`):
  `FAILED_TERMINAL`/`is_dead_letter=true` attempt + outbox → `DEAD_LETTER`,
  `next_attempt_at=NULL`, `claimed_*=NULL`, bounded `last_error`/`error_class`.

## E. Lease-expiry and attempt evidence

Expired lease = `status='PENDING'`, `claimed_by IS NOT NULL`,
`next_attempt_at <= now()`. The **next claim transaction** (no scanner, no
delete) appends the crashed prior attempt (`FAILED_RETRYABLE`,
`error_class='WORKER_LEASE_EXPIRED'`) with a **conflict-safe insert on
`unique(job_kind, job_key, attempt_no)` (CST-049)** so concurrent reclaimers
cannot duplicate it, then increments `attempt_count` and re-claims the same row.
The crashed attempt number is the row's existing `attempt_count`; the new attempt
is the incremented value.

## F. Timeout / shutdown invariants

No heartbeat (out of scope). Startup validation rejects unsafe relationships:
`handler_timeout_ms + lease_safety_margin_ms <= lease_duration_ms`,
`shutdown_grace_ms <= handler_timeout_ms`, `poll_interval_ms < lease_duration_ms`.
Handlers receive an `AbortSignal`; on timeout → abort → classify as retryable
timeout → retryable completion transaction. Handlers never intentionally run past
the lease and must be idempotent even under infra-caused overlap.

## G. Outbox terminology and handler idempotency

`outbox_events` **is** the queue — no relay-created job row, no second queue
entity. The worker directly claims the event, executes a typed handler, and marks
the event `DISPATCHED`/`PENDING`-backoff/`DEAD_LETTER`. Duplicate worker delivery
is handled by **handler idempotency**. Handler contract (`APP2-I02` owns the
generic seam): job kind, payload schema validator, idempotency/effect-key
derivation, `execute(payload, context, abortSignal)`. The generic runtime
guarantees one active lease, at-least-once, bounded retry, and attempt evidence;
each handler guarantees its own durable-effect idempotency (later asset handlers
derive the key from outbox id / asset id / derivative kind + DB arbiters +
deterministic object keys — not solved here).

## H. Controlled spike

Disposable Postgres 16 + real 31 migrations (78 tables) + mirrored store SQL (no
repository import/modification), fully torn down (container removed, workspace
deleted, dev stack 6 containers untouched). **Zero residue. 25/25 PASS**,
covering all 17 required cases: fresh claimable / leased-not-claimable; retryable
→ `PENDING`+future `next_attempt_at`, claimable after backoff; **no `FAILED` in
the automatic path**; terminal `DEAD_LETTER` never claimed; success `DISPATCHED`
never claimed; expired-lease `FAILED_RETRYABLE` old attempt; reclaim with next
attempt number; two reclaimers → one attempt row (CST-049); success/retry/
terminal attempt+mutation atomic; ownership guard rejects stale worker (wrong
`claimed_by` and wrong `attempt_count`); handler-effect-commit + lost-completion
replays safely; shutdown stops then resumes. Case counts recorded, not prose.

## I. Commit C evidence

`a9ef895bf78d9abcd66f52a44d153f52aadccb44` —
`docs(app2): correct job retry and lease semantics` (6 files, docs only): ADR
correction (header note + §D3/§D4/§D5/§D6 rewrite + new §D12–§D15 + repository
gaps + inventory + spike/consequences); register IMP-D029 C1 clause; phase-plan
banner; roadmap + traceability pointers; research/spike appendix. No source,
test, package, lockfile, Compose, env, schema, migration, OpenAPI,
generated-client, or Figma change.

## J. Validation matrix

| Gate | Result |
|---|---|
| `git diff --check` | clean |
| `node tools/check-file-size.mjs` | pass (docs not flagged) |
| `pnpm check:openapi` | up to date (unchanged) |
| `pnpm check:api-client` | tree hash `89c1aace…` (unchanged) |
| `pnpm check:figma-design-index` (+ `--test`) | pass (39 IDs) |
| `pnpm db:check:manifest` | pass (78 tables / 833 columns) |
| `pnpm quality` | exit 0 |
| Controlled spike | 25/25, zero residue |

Baselines unchanged: OpenAPI `ae015dd6…`, client `89c1aace…`, DB `4ca56a59…`,
Figma 39 IDs.

## K. Acceptance matrix

All 34 criteria met: decision chain verified (1); contradiction acknowledged
(2); `PENDING` is the only automatic claim/retry state (3); `FAILED` not
emitted/claimed (4); sub-states locked (5); claim query locked (6); lease
mutation locked (7); execution identity locked (8); success (9), retryable (10),
terminal (11), expired-lease evidence (12) locked; concurrent reclaim
deduplicated (13); timeout/lease (14) and shutdown (15) relations locked; attempt
timing locked (16); no separate relay/job row (17); handler idempotency boundary
(18) and policy ownership (19) locked; spike passes all cases (20);
`NO_APP2_MIGRATION` (21); no dependency (22); storage blockers untouched (23); no
implementation/config/Figma change (24); quality/artifact/DB pass (25); Commit C
docs-only (26); Commit D evidence-only (27); report cites Commit C (28) and is
≤180 lines (29); exactly two commits (30); tree clean (31); not pushed (32); no
C2 created (33); next checkpoint not executed (34).

## L. Scope confirmation

Corrected only the retry/lease/attempt state machine and its contracts. **Not
touched:** storage / `STORAGE-BLK-01..03`, runtime selection (still PostgreSQL,
no broker), image-processing library (`APP2-W01`), UI (`APP2-D01`), priority /
heartbeat. No `APP2-DEC-JOBS-C2` created.

## M. Evidence closure

Two docs-only commits: Commit C `a9ef895…` (correction) and Commit D (this
report + the note in the original completion report). Not squashed; Commit C not
amended after this report. Not pushed. STOP at the review boundary — no
`APP2-D01`/`APP2-I01`/`APP2-I02`/`APP2-B01`/`APP2-W01` implementation, no
migrations, no Figma, no `APP2-DEC-JOBS-C2`, no next prompt.
