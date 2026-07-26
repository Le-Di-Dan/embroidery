# APP2-I02 — PostgreSQL Worker-Runtime Foundation — Completion Report

Checkpoint: `APP2-I02 — Implement the PostgreSQL worker-runtime foundation`
Verdict: **PASS** · Status: `COMPLETE — DELIVERED_FOR_REVIEW`

## A. Preflight and authority

`APP2_I02_PREFLIGHT = PASS`. Branch `production`, initial HEAD
`a82f4f21126d493645a3351bea951a8029ad6e03`, `git status --short` empty,
`git diff --check` clean. `pnpm quality`, `pnpm check:openapi`,
`pnpm check:api-client`, `pnpm check:figma-design-index` and
`pnpm db:check:manifest` all exited 0 before any edit.

Chains verified from Git, not from reports — I01 A
`48e676def522a9bfc4ab34418e52074df004db3a`, I01 B
`a82f4f21126d493645a3351bea951a8029ad6e03`; jobs A
`8211214ed2885ff8af4981e688df7cadce258e8b`, B
`27c324ee2dae8427f3f3147d25fcb7fb5480eedb`, C
`a9ef895bf78d9abcd66f52a44d153f52aadccb44`, D
`146c2bdc0735abf834f0740b5c8ceade16fded58`.

Source facts confirmed in migrations, not assumed: IDX-088 is
`ix_outbox_events__next_attempt_id__pending`, partial on `status = 'PENDING'`,
ordered `next_attempt_at NULLS FIRST, id` — which is exactly why `PENDING` is
the only automatically claimable status and why the claim's `ORDER BY` matches
it. CST-099 is the column-scoped `trg_outbox_events__reject_mutation` trigger
(migration 0030), permitting only `status, attempt_count, next_attempt_at,
claimed_by, claimed_at, dispatched_at, last_error`.
`uq_background_job_attempts__kind_key_attempt` enforces
`(job_kind, job_key, attempt_no)`. The worker was a no-op keep-alive timer.

## B. Source audit

Read before writing: both platform schema files, both policy schema files, all
of `packages/persistence/src/platform/**`, the transaction manager and
`DatabaseExecutor`, `apps/worker/**`, `packages/observability/**` (empty by
design), the worker Compose service, and the DB7 disposable-database harness.
Two findings changed the design:

1. `OutboxEventStore.claimBatch` claims `['PENDING','FAILED']`, applies no
   registered-event filter and writes no lease; `scheduleRetry` sets `FAILED`.
   These are DB7-era producer/dispatcher primitives and contradict
   APP2-DEC-JOBS-C1. They were **left untouched** and a separate seam was added
   rather than widening a class into two contradictory lifecycles.
2. `BackgroundJobAttemptStore.record` writes through `dbOutsideTransaction` by
   design. §8 requires the attempt and the outbox update in **one** transaction,
   so the new seam writes attempt rows itself, inside the caller's transaction.
   Its `assertKnownJobKind` guard was exported and reused rather than copied.

`PolicyConfigurationRepository.currentValue` already provides the canonical
policy read, so **no new persistence method was needed** for §12.

## C. Persistence transactions

`packages/persistence/src/platform/worker-job-queue.repository.ts` (328 lines).

**Claim** — one statement, so `now()` is a single database instant for due-ness,
`claimed_at` and the lease deadline; no worker host clock participates.
`registered` comes from a single JSONB parameter (a JS array inside a Drizzle
`sql` template expands to separate placeholders, which is not a PostgreSQL
array — caught by a live test, not by inspection). `due` selects with
`FOR UPDATE SKIP LOCKED`. `evidence` is a data-modifying CTE that PostgreSQL
guarantees to run exactly once and to completion, so the `WORKER_LEASE_EXPIRED`
row for an abandoned lease cannot be skipped; `ON CONFLICT DO NOTHING` on
`(job_kind, job_key, attempt_no)` makes it idempotent. `claimed` increments
`attempt_count`, sets owner, claim time and `now() + leaseDuration`, and keeps
`status = 'PENDING'`. Payload and identity are never in the `SET` list.

**Completion** — guarded update first, evidence second, one transaction, guarded
by `id = ? AND status = 'PENDING' AND claimed_by = ? AND attempt_count = ?`.
Zero updated rows returns typed `STALE_JOB_LEASE` and writes **no** attempt row.
Success → `DISPATCHED` + `dispatched_at` + cleared lease/error. Retryable →
`PENDING` + `now() + retryDelay` + bounded `last_error`. Terminal →
`DEAD_LETTER`. No path can write `FAILED`.

**Honest divergence:** §7.3 asks for "safe bounded detail" on the expired-lease
attempt. `background_job_attempts` has no free-text detail column — deliberately,
so it cannot become a PII sink — and `NO_APP2_MIGRATION` forbids adding one, so
the detail is the classification `WORKER_LEASE_EXPIRED` in `error_class`.
Likewise `outbox_events` has `last_error` but no `error_class` column, so the
error **class** is stored in `last_error`, matching the existing store's
documented convention. Nothing was invented to paper over either.

## D. Handler and error contracts

`JobHandler` declares `eventType`, `jobKind`, `payloadSchemaVersion`,
`validatePayload`, `deriveEffectKey`, `execute(payload, context, abortSignal)`;
context carries `outboxEventId`, `attemptNo`, `workerInstanceId`,
`correlationId`, `effectKey`. `validatePayload` returns a result rather than
throwing, so the terminal-versus-retryable decision cannot depend on which error
type escaped. A schema-version mismatch is rejected before validation runs. An
empty or over-length (>200) effect key is `JOB_INVARIANT_VIOLATION` and the
handler is never called — without a usable key it cannot deduplicate its own
effect. Duplicate registration throws at startup. **The production registry is
empty**; no Asset handler exists in I02.

Taxonomy is closed and never widened by string-matching a message:
`JOB_PAYLOAD_INVALID`, `JOB_SCHEMA_UNSUPPORTED` and `JOB_INVARIANT_VIOLATION`
are always terminal; `JOB_HANDLER_TIMEOUT`, `JOB_DEPENDENCY_UNAVAILABLE`,
`JOB_TRANSIENT_FAILURE` and `JOB_UNKNOWN_FAILURE` retry below the cap and
terminate at it; `STALE_JOB_LEASE` and `WORKER_LEASE_EXPIRED` are runtime-only,
and a handler claiming one is downgraded to `JOB_UNKNOWN_FAILURE`. Only the
class is ever persisted.

## E. Policy

Source: `policy_configurations` / `policy_configuration_versions` under key
`worker.runtime`, read through `PolicyConfigurationRepository.currentValue`.
All ten values validate as positive bounded integers, and the four relations are
enforced (`backoffBase ≤ backoffMax`; `handlerTimeout + leaseSafetyMargin ≤
leaseDuration`; `shutdownGrace ≤ handlerTimeout`; `pollInterval < leaseDuration`).
Every invalid field is reported at once; reasons name fields and bounds only,
never the stored value. **No environment variable duplicates any of them, and
there is no production default.** A missing or invalid policy sets readiness
false, disables claiming and logs `WORKER_POLICY_MISSING` /
`WORKER_POLICY_INVALID`; the process stays up so an operator can publish the
policy without a crash loop.

**No development bootstrap was added.** The prompt permits one only when an
existing canonical platform-bootstrap mechanism already owns such defaults; the
repository has none for policy configurations, so inventing one would have been
inventing production defaults. Consequence, stated plainly: the development
Compose worker will report `WORKER_POLICY_MISSING` and stay idle until
`worker.runtime` is published — correct behaviour, not a regression, since it
previously idled for want of a queue decision. One non-policy constant exists,
`UNCONFIGURED_RECHECK_MS = 5000`, pacing only that "am I configured yet" check.

## F. Poll loop, concurrency, timeout

One sequential loop, never a re-arming timer — a `setInterval` would overlap
whenever a cycle outlasts its interval, and a cycle that claims a batch and
waits for slots routinely does. Empty registry → sleep, **no claim query at
all**. Claim size is `min(batchSize, free slots)`, so the runtime never leases
work it cannot start; a claimed job holds a lease, which makes the claim the
only correct place to bound concurrency. No free slot → await
`Promise.race([...inFlight, aborted(signal)])`. A claim failure backs off with
the same capped formula as job retries, bounded by the operator's own
`backoffMaxMs`. One job's failure never stops its siblings or the loop.

Per attempt: an `AbortController` aborted at `handlerTimeoutMs`, the handler
raced against the abort, the timer cleared in `finally` including on success. A
handler that ignores its signal is abandoned, not killed — Node cannot kill it.
`retryDelayMs` implements `min(base × 2^(n−1), max)` with the doubling capped at
2^30, so the cap applies to an exact integer. No jitter. No heartbeat.

## G. FU-A07

`worker:{safe-hostname}:{pid}:{uuid}`, minted once per process. The hostname is
sanitised and bounded to 40 characters — it is external input written to a
column operators read. Correlation is `{jobKind}:{outboxEventId}:{attemptNo}`,
bound with `AsyncLocalStorage` across validation, effect-key derivation,
execution and completion logging.

Log fields are an **allow-list**, not a redaction pass: only `correlationId`,
`jobKind`, `jobKey`, `attemptNo`, `workerInstanceId`, `eventType`, `outcome`,
`errorClass`, `durationMs` are emitted, so no future edit can leak a payload by
forgetting a rule. `X-Request-ID` is never fabricated — no HTTP request caused
this work. Poll cycles are silent.

## H. Shutdown and readiness

`createApplicationContext(WorkerModule)` + `enableShutdownHooks()` unchanged;
Nest keeps sole ownership of the signals. On shutdown: stop claiming (the sleep
aborts rather than running to term), await the loop, then let work that still
owns a valid lease finish normally within `shutdownGraceMs` — aborting it would
turn a job about to succeed into a retry. Past the grace period the runtime
stops waiting and logs it; those leases expire and the next reclaimer writes the
`WORKER_LEASE_EXPIRED` evidence, so no attempt disappears silently. The pool and
context close exactly once, via `DatabaseModule.onApplicationShutdown`.

Readiness = valid policy + successful DB probe + started runtime + not shutting
down. It does **not** depend on handlers, MinIO, I01 storage, B01 or W01.

**Gap disclosed:** §15 says to use the current worker health mechanism. There is
none — the Compose worker service has no healthcheck — and the two ways to add
one are an HTTP server (forbidden) or a second process that cannot observe
in-process readiness. Readiness therefore remains an in-process contract plus a
startup log line, asserted by tests. No Compose healthcheck was invented.

## I. Unit tests

115 tests / 11 suites in `@embroidery/worker`; 107 tests / 8 suites in
`@embroidery/persistence` (including the live suites below). Covered: policy
validation and every relation, retry formula and overflow, registry duplicates
and empty registry, payload/schema validation, error classification and
disposition, correlation and worker identity, timeout `AbortSignal`, poll
concurrency and claim backoff, graceful shutdown, and the safe log projection
(a polluted context leaks no payload, cookie, request id or stack).

## J. PostgreSQL integration

All 27 required cases against disposable databases with all 31 migrations; 29
in total (extras: an unconfigured live worker, and a live worker ignoring an
unregistered type).

| Suite | Cases | Result |
| --- | --- | --- |
| `worker-job-queue-claim.integration.spec.ts` | 1–9 | 9 passed |
| `worker-job-queue-completion.integration.spec.ts` | 10–18, 22 | 10 passed |
| `worker-runtime-execution.integration.spec.ts` | 19, 20, 21, 25 | 4 passed |
| `worker-runtime-lifecycle.integration.spec.ts` | 23, 24, 26, 27 (+2) | 6 passed |

Concurrency evidence is real, not simulated: cases 4 and 8 issue genuinely
parallel transactions and assert exactly one winner and exactly one abandoned-
attempt row. Case 25 commits an idempotency-guarded effect and then fails — the
shape of a crash between "effect done" and "completion recorded"; the replay
observes the effect and does not repeat it (1 write, ≥1 replay,
`FAILED_RETRYABLE` then `SUCCEEDED`). Case 27 proves the drop by asking
`pg_database` from a second disposable database rather than trusting teardown.
`pnpm test:worker-runtime:integration` → 29 passed, exit 0.

## K. Worker smoke

`pnpm test:worker-runtime:smoke` → 6 passed, exit 0. Spawns the built
`dist/main.js` as its own OS process against a disposable database: it boots,
logs `Worker readiness: ready (ok)`, reports `0 handler(s) registered`, leaves a
seeded event it cannot handle at `PENDING`/`attempt_count = 0`, stops claiming
and closes the context on SIGTERM, and exits well inside a 15 s budget. Two
active-resource samples many poll cycles apart are identical, which is the
handle-leak check; `PipeWrap` is excluded because those are the child's own
stdio, an artifact of observing it.

**Platform limitation, stated rather than hidden:** the child raises the signal
with `process.emit('SIGTERM', 'SIGTERM')`, invoking the exact listener Nest
registered. Windows has no real SIGTERM — `child.kill('SIGTERM')` calls
`TerminateProcess` without running any handler — so an OS-signal test would
silently prove nothing on the development platform. OS delivery is the only
unexercised link. The smoke is excluded from the default `jest` run and lives
behind its own script, which builds first: `turbo run test` builds dependencies
but not the package under test, so leaving it in would make it pass or fail
depending on whether a stale `dist` existed. Verified from a deleted `dist`.

## L. Dependencies, migration, boundaries

New dependency: **none** — `pnpm-lock.yaml` is unmodified and `package.json`
gained only two scripts. `NO_APP2_MIGRATION`: 31 migration files, unchanged.
Touched only `apps/worker/**`, `packages/persistence/**` and root
`package.json`. Untouched: `apps/api/**`, `apps/admin/**`, `apps/storefront/**`,
`packages/object-storage/**`, database schema/migrations, OpenAPI, generated
client, Figma/design index, Nginx. `packages/observability/**` needed no change
— the canonical logging shape was reproducible without it.

## M. Commit A

`1d748ef5ff18c7b78fe364789149c57c74abece3` —
`feat(worker): add PostgreSQL job runtime foundation`, 42 files, +4359 / −109,
including the removal of `worker-lifecycle.service.ts` and its spec. No report.

## N. Validation

All exit 0: `pnpm --filter @embroidery/persistence lint | typecheck | test`;
`pnpm --filter @embroidery/worker lint | typecheck | test | build`;
`pnpm test:worker-runtime:integration`; `pnpm test:worker-runtime:smoke`;
`pnpm check:frontend-boundaries`; `pnpm check:spike-boundaries`;
`pnpm check:e2e`; `pnpm check:openapi`; `pnpm check:api-client`;
`pnpm check:figma-design-index`; `node --test tools/check-figma-design-index.test.mjs`;
`pnpm db:check:manifest`; `node tools/check-file-size.mjs`; `pnpm quality`;
`git diff --check`.

§21 placeholder substitutions: `<persistence>` = `@embroidery/persistence`,
`<worker>` = `@embroidery/worker`. Frozen baselines re-verified after Commit A:

| Artifact | Value |
| --- | --- |
| OpenAPI | `ae015dd65dc2f64c902145f19d5fa5fae6cd6423a54934c1126cd289e3d30946` |
| API client | `89c1aace328eef1ee05a74950faa48bf907babece025a6abb9ca1baa1574502f` |
| Database | 31 migrations / 78 tables / 833 columns |
| DB fingerprint | `4ca56a5967730d257edb34e72d6c40373156704cab7c87e3a684803c8321672f` |
| Figma registry | 69 IDs, unchanged |

No persistent development database was mutated: every suite runs on a
`createDisposableDatabase` instance and drops it. No raw payload, secret or
stack trace appears in any log projection (asserted). No Jest run reported an
open handle or required `--forceExit`.

Two real defects were found by tests and fixed before Commit A, not reasoned
away: (1) the poll loop awaited `Promise.race(inFlight)` with all slots full and
never observed shutdown, so SIGTERM hung — now raced against the shutdown
signal; (2) a unit double returned more jobs than `batchSize`, which would have
let the suite "prove" a concurrency bound the runtime did not have — it now
honours `LIMIT` as the real claim does.

## O. Acceptance

Every §24 criterion is met: clean preflight; exact chains; no dependency or
migration; registered-event filtering with an empty registry that claims
nothing; database-time atomic lease claim; deduplicated expired-attempt
evidence; atomic success/retry/terminal transactions; `FAILED` never emitted;
stale worker and stale attempt both rejected; payload identity immutable; typed
handler and bounded effect key; no production Asset handler; closed safe errors;
exact bounded retry; canonical policy source with safe missing-policy behaviour
and enforced relations; safe worker identity and ALS correlation; no request-id
fabrication or unsafe logs; bounded poll, concurrency and timeout; graceful
shutdown and readiness; unit tests, 27 integration cases and the worker smoke
all pass; zero residue, no development-database mutation, no open handles; full
quality pass; frozen artifacts unchanged; storage blockers untouched; two
scoped commits; clean tree, not pushed.

## P. Handoff and blockers

```text
APP2-I01 = COMPLETE — REVIEW_ACCEPTED
APP2-I02 = COMPLETE — DELIVERED_FOR_REVIEW
APP2-B01 = BLOCKED_BY_STORAGE-BLK-01..03_AND_UPLOAD_SIZE_PARAMETER
APP2-W01 = BLOCKED_BY_APP2-B01
APP2-S01 = DESIGN_AUTHORITY_UI02 — BLOCKED_BY_PUBLIC_BACKEND
APP2-S02 = BLOCKED_BY_UI03_RECONCILIATION_AND_PUBLIC_BACKEND
APP2 product engineering = FOUNDATIONS_COMPLETE_WITH_B01_BLOCKED
```

Open for the reviewer, not decided here: publishing a `worker.runtime` policy
value for development and production (§E), and whether a worker readiness
healthcheck is wanted given the constraints in §H. `STORAGE-BLK-01..03` and the
four Product Owner parameters are untouched.

## Q. Scope

No upload path, no asset intake, no image processing, no derivatives, no
publication, no API endpoint, no Admin or Storefront UI. The worker claims
nothing until a handler is registered, which W01 owns.

## R. Evidence closure

Initial HEAD `a82f4f21126d493645a3351bea951a8029ad6e03`. Commit A
`1d748ef5ff18c7b78fe364789149c57c74abece3`. Commit B is this report plus the
minimal phase/roadmap/traceability status updates. Exactly two commits, clean
tree, not pushed.
