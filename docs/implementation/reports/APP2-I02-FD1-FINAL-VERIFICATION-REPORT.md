# APP2-I02-FD1 — Final Verification Report

Directive: `APP2-I02-FD1 — Prove uncooperative timeout recovery across a real Linux process boundary`
Verdict: **PASS**

Final state:

```text
APP2-I02      = COMPLETE — CORRECTED — REVIEW_ACCEPTED
APP2-I02-C1   = SUPERSEDED_BY_FINAL_PROCESS_PROOF
APP2-I02-FD1  = COMPLETE
APP2-I02-C2   = MUST_NOT_BE_CREATED
```

---

## A. Preflight and exact chain

`APP2_I02_FD1_PREFLIGHT = PASS`.

- Branch `production`, HEAD `fd93ab3d2088efccb691d8271f7ea7fc503d0d98` — the
  exact APP2-I02-C1 evidence commit.
- `git status --short` empty; `git diff --check` clean.
- The full I02-C1 validation suite was run **before** any edit and all of it
  passed: `pnpm quality` (0), `pnpm test:worker-runtime:integration`
  (19 + 10), `pnpm test:worker-runtime:smoke` (6),
  `pnpm test:worker-runtime:signal-smoke` (5, real SIGTERM → exit 0 in 356 ms),
  `pnpm test:worker-runtime:uncooperative-timeout` (3).
- No unknown work was absorbed.

Exact chain, read from Git:

| Item | Commit |
| --- | --- |
| A | `1d748ef5ff18c7b78fe364789149c57c74abece3` — `feat(worker): add PostgreSQL job runtime foundation` |
| B | `bfc2a60b6f60abaf8ec5d8725073740f39c58a5f` — `docs(app2): record worker-runtime foundation evidence` |
| C | `53417dba9ea16d871cb50a8023514637d708f736` — `fix(worker): prevent overlapping timed-out job attempts` |
| D | `fd93ab3d2088efccb691d8271f7ea7fc503d0d98` — `docs(app2): record worker timeout correction evidence` |
| E | `43546a67df80b1f20a090cc2ffa5ab2e6971404f` — `fix(worker): prove fatal timeout process isolation` |

---

## B. Why the C1 evidence was insufficient

The reviewer's ruling is correct, and it is worth stating precisely rather than
softening.

C1's uncooperative-timeout suite ran both "workers" inside one Jest process and
overrode the `WORKER_PROCESS` seam so a fatal exit was **recorded** instead of
**performed**. Three consequences followed, and the C1 report acknowledged the
first two while still treating the conclusion as proven:

1. Worker A's handler promise — the one that never settles — remained alive in
   the test process for the whole run. Nothing was ever actually cancelled.
2. Worker B was started after an entry appeared in an `exits` array, not after
   worker A ceased to exist.
3. The suite therefore asserted **ordering**, and ordering between two objects
   in the same process says nothing about whether the first one's work stopped.

The claim under test is "an unsettled handler and a released queue row never
coexist", and its enforcement mechanism is *process death*. A test that never
kills a process cannot exercise the mechanism. My C1 report described this
limitation in its own §G and then presented the result as the definitive
no-overlap proof anyway. That was the wrong call; this directive fixes it.

---

## C. Test-only process architecture

Actual paths (as specified in the directive; no adaptation was needed):

```text
apps/worker/test/process/fixtures/process-probe.ts
apps/worker/test/process/fixtures/uncooperative-worker.fixture.ts
apps/worker/test/process/fixtures/recovery-worker.fixture.ts
apps/worker/test/process/tsconfig.fixtures.json
apps/worker/test/process/worker-fatal-timeout.process.spec.ts
```

Root script: `test:worker-runtime:fatal-process`.

**Docker.** A new `process-test` target in the existing
`infrastructure/docker/worker.Dockerfile`, built `FROM build`, which compiles the
fixtures through `tsconfig.fixtures.json` into `dist-process-test/`. The
production `runner` stage copies **nothing** from `process-test`, so no fixture
can reach the shipped image, and normal Compose never references the target. The
default `CMD` is worker A; worker B is the same image with an overridden command.

**Jest.** `roots` now includes `<rootDir>/test`, and `*.process.spec.ts` is in
`testPathIgnorePatterns` — the suite builds a Docker image, so leaving it in the
default run would make `pnpm test` pass or fail depending on what happened to be
on disk. It runs from its own script, which owns its setup.

**Probe table.** Created inside the disposable database only, after the 31
canonical migrations, exactly as specified:

```sql
CREATE TABLE worker_runtime_process_probe (
  id bigserial PRIMARY KEY, job_key text NOT NULL, worker_role text NOT NULL,
  worker_id text NOT NULL, event_name text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
```

This is test setup, not a migration: `packages/database/migrations` still holds
31 files and `pnpm db:check:manifest` still reports 78 tables / 833 columns.
Events are limited to the six allowed names. `recorded_at` defaults to the
**database's** `clock_timestamp()`, so every probe row and the lease deadline
share one clock and cross-worker ordering never depends on a container's.

The probe writes through its own connection rather than the worker's pool: worker
A dies while its Nest context is closing, and a row travelling through the pool
being torn down is precisely the evidence most likely to vanish.

**Worker A** registers only `test.worker.uncooperative-timeout`; its handler
records `HANDLER_STARTED`, ignores `AbortSignal`, returns a promise that never
settles and performs no external side effect. It loads the real `worker.runtime`
policy from the disposable database, uses the **production** exit seam, and runs
as PID 1. Handlers are registered in `onModuleInit`, which runs before
`onApplicationBootstrap` — the same ordering a production module would have.

**Worker B** is a separate container with a distinct real worker instance id and
a cooperative handler that records `HANDLER_STARTED` and `HANDLER_SUCCEEDED`. It
watches for the row to reach `DISPATCHED`, then closes and exits 0 on its own.

Policy published for the run (all relations satisfied, safety margin well above
the 250 ms `fatalExitSafetyMs`):

```text
concurrency 1 · batchSize 1 · pollIntervalMs 250 · leaseDurationMs 20000
handlerTimeoutMs 1000 · leaseSafetyMarginMs 2000 · shutdownGraceMs 1000
maxAttempts 3 · backoffBaseMs 100 · backoffMaxMs 1000
```

Hard stop = `min(timeout + 2000, leaseExpiry − 250)` ≈ 3 s after the claim,
leaving ~17 s of lease to observe a real termination strictly before expiry.

---

## D. Worker A — real fatal termination

Externally observed, not inferred:

- Probe rows show worker A `PROCESS_START`, `PROCESS_READY`, `HANDLER_STARTED`.
- The target row was claimed by worker A with `attempt_count = 1`.
- Container logs (**both streams**) contain the single allow-list fatal line
  `{"correlationId":…,"jobKind":"OUTBOX_DISPATCH",…,"outcome":"FATAL_HANDLER_UNRESPONSIVE"}`.
- The probe table contains `FATAL_STATE_ENTERED`, recorded from inside the fatal
  closer — which the fatal path awaits before exiting, so it is deterministic
  rather than a race against a polling observer.
- `docker inspect` reports `Running: false` and `ExitCode: 1`.
- Logs contain no payload marker, no credential and no stack frame.

No signal was sent to worker A. It was never killed, never stopped, never
emitted to. It ended itself through the production `process.exit(1)`.

Measured across three consecutive runs:

| Run | `ExitCode` | `Running` | `FinishedAt` | Lease deadline | Margin |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 | false | `2026-07-26T16:51:16.268Z` | `2026-07-26T16:51:33.237Z` | 16 969 ms |
| 2 | 1 | false | `2026-07-26T16:52:03.241Z` | `2026-07-26T16:52:20.209Z` | 16 968 ms |
| 3 | 1 | false | `2026-07-26T16:52:48.332Z` | `2026-07-26T16:53:05.304Z` | 16 972 ms |

Termination is strictly before the lease deadline in every run, by ~17 seconds.

---

## E. Lease preservation

Snapshot taken **after** worker A's container had actually stopped and **before**
the lease expired, identical in all three runs:

```text
status           = PENDING
claimed_by       = worker A's real instance id
attempt_count    = 1
next_attempt_at  = the original lease deadline, unchanged
last_error       = NULL
```

`background_job_attempts` for the job: **zero rows** before the reclaim
(`attemptsBeforeReclaim = 0`). No completion of any kind was written, and the
row is byte-for-byte the row worker A claimed.

---

## F. Worker B — reclaim

Worker B was started only after both conditions held: `docker inspect` reported
worker A not running, and `clock_timestamp()` had passed the lease deadline.
`workerARunningDuringB` was captured immediately before `docker run` and is
`false`.

Result, identical in all three runs:

```text
final status         = DISPATCHED
final attempt_count  = 2
worker B exit code   = 0
attempt 1            = FAILED_RETRYABLE / WORKER_LEASE_EXPIRED
attempt 2            = SUCCEEDED / (no error class)
```

Exactly one lease-expiry attempt, exactly two attempt rows, no third attempt,
and a `PROCESS_STOPPING` probe row before worker B closed.

---

## G. Definitive no-overlap proof

| Run | Worker A `FinishedAt` | Worker B `HANDLER_STARTED` | Gap |
| --- | --- | --- | --- |
| 1 | `16:51:16.268Z` | `16:51:34.591Z` | +18 323 ms |
| 2 | `16:52:03.241Z` | `16:52:21.441Z` | +18 200 ms |
| 3 | `16:52:48.332Z` | `16:53:06.639Z` | +18 307 ms |

Worker B's handler began ~18 seconds **after worker A's process ceased to
exist**. Because worker A was gone, its runaway handler could not have been
running alongside worker B's — this is the step the in-process C1 evidence could
not take, and it is what makes the claim a proof rather than an inference.

Supporting assertions in the same suite:

- `HANDLER_STARTED` appears exactly twice for the job, once per role, under two
  distinct real worker instance ids.
- Worker A's logs contain `Worker runtime started` exactly once, and worker A
  recorded exactly one `HANDLER_STARTED` — it never claimed or executed twice.
- `attempt_count` never moved past 1 while worker A held the row.
- Exactly one `WORKER_LEASE_EXPIRED` attempt exists; there is no duplicate and
  no third attempt.

All cross-worker ordering uses the database clock (`clock_timestamp()`) and
Docker's own `FinishedAt`. The two are compared directly; the ~18 second gap is
orders of magnitude larger than any plausible skew between the Docker daemon and
the PostgreSQL container on one host, so the conclusion does not rest on them
being perfectly synchronised.

---

## H. Cleanup and repeated runs

Removed in the test body (so the result can be asserted) and again defensively in
`afterAll`: both containers, the test image, and the disposable database.
Assertions afterwards: `docker ps -a --filter name=embroidery-fd1-` is empty,
`docker images embroidery-fd1-worker:test` is empty, and the dropped database is
absent from `pg_database` — checked from a second disposable database, because a
connection to the dropped one could not answer the question.

Verified after the whole run: `docker ps -a --filter name=embroidery-fd1` → 0,
`docker images embroidery-fd1-worker:test` → 0. No test network was created. The
normal development stack and the persistent development database were never
touched — every container received only the disposable database's URL.

The suite passed **three consecutive runs** (16 tests each), with the stable
numbers tabulated above.

---

## I. Production-code change verdict

**No production runtime change was required.**

The directive's §14 instructs running the real process test against current C1
behaviour first, and changing production only if it proves a defect. The first
complete run exercised the whole fatal path correctly: the state machine, the
hard-stop deadline, the single fatal log, the bounded close, the real exit 1 and
the preserved lease all behaved as C1 specified. Commit E therefore contains
test, fixture and harness code only.

Two defects were found and fixed, both **mine, in the test**:

1. The first run's log assertions read only `stdout`. Nest's `Logger.error`
   writes to stderr, so the one line proving the fatal path had run was
   invisible. Fixed by reading both streams.
2. One assertion targeted the poll loop's `Fatal runtime state: claiming
   stopped.` warning. That line is genuinely unreachable in this ordering: the
   fatal closer calls `app.close()`, whose `onApplicationShutdown` aborts the
   shutdown signal, so the loop's `while (!signal.aborted)` condition ends it
   before the fatal guard at the top of the body is reached. Claiming still
   stops — by the shutdown path rather than the guard — and the guard remains
   correct for the window between the synchronous state flip and the close.
   Fixed by asserting the fatal *log line* and the `FATAL_STATE_ENTERED` probe,
   both of which are deterministic, instead of an unreachable warning.

Neither required touching `apps/worker/src`.

---

## J. Commit E

`43546a67df80b1f20a090cc2ffa5ab2e6971404f` —
`fix(worker): prove fatal timeout process isolation`, 9 files, +899 / −12:

```text
apps/worker/jest.config.mjs                                   (roots + ignore)
apps/worker/tsconfig.json                                     (include test/**)
apps/worker/test/process/fixtures/process-probe.ts            (new)
apps/worker/test/process/fixtures/uncooperative-worker.fixture.ts (new)
apps/worker/test/process/fixtures/recovery-worker.fixture.ts  (new)
apps/worker/test/process/tsconfig.fixtures.json               (new)
apps/worker/test/process/worker-fatal-timeout.process.spec.ts (new)
infrastructure/docker/worker.Dockerfile                       (process-test target)
package.json                                                  (one script)
```

No report and no status closure in this commit.

---

## K. Full validation

Every command exited 0:

| Command | Result |
| --- | --- |
| `pnpm --filter @embroidery/worker lint` | 0 |
| `pnpm --filter @embroidery/worker typecheck` | 0 |
| `pnpm --filter @embroidery/worker test` | 0 — 130 tests / 14 suites |
| `pnpm --filter @embroidery/worker build` | 0 |
| `pnpm test:worker-runtime:integration` | 0 — 19 + 10 |
| `pnpm test:worker-runtime:smoke` | 0 — 6 |
| `pnpm test:worker-runtime:signal-smoke` | 0 — 5, real SIGTERM → exit 0 in 356 ms |
| `pnpm test:worker-runtime:uncooperative-timeout` | 0 — 3 |
| `pnpm test:worker-runtime:fatal-process` | 0 — 16, three consecutive runs |
| `pnpm check:frontend-boundaries` | 0 |
| `pnpm check:spike-boundaries` | 0 |
| `pnpm check:e2e` | 0 |
| `pnpm check:openapi` | 0 |
| `pnpm check:api-client` | 0 |
| `pnpm check:figma-design-index` | 0 |
| `pnpm db:check:manifest` | 0 |
| `node tools/check-file-size.mjs` | 0 |
| `pnpm quality` | 0 |
| `git diff --check` | 0 |

Frozen artifacts, re-verified after Commit E:

| Artifact | Value |
| --- | --- |
| OpenAPI | `ae015dd65dc2f64c902145f19d5fa5fae6cd6423a54934c1126cd289e3d30946` |
| API client | `89c1aace328eef1ee05a74950faa48bf907babece025a6abb9ca1baa1574502f` |
| Database | 31 migrations / 78 tables / 833 columns |
| DB fingerprint | `4ca56a5967730d257edb34e72d6c40373156704cab7c87e3a684803c8321672f` |
| Figma registry | 69 IDs, unchanged |

`pnpm-lock.yaml` is unmodified — no new dependency. `package.json` gained one
script.

---

## L. Acceptance

Against §19, every condition holds:

- worker A actually terminates in Linux with exit 1 — `Running: false`,
  `ExitCode: 1`, real `FinishedAt`;
- termination is before lease expiry — by ~17 s in all three runs;
- the lease is unchanged after termination — `PENDING`, same owner, same
  `attempt_count`, same `next_attempt_at`, `last_error` NULL;
- no attempt row exists before reclaim — zero;
- worker B starts only after A terminated and the lease expired — both checked,
  `workerARunningDuringB = false`;
- worker B records one lease-expiry attempt and succeeds attempt 2;
- worker B's handler starts after worker A's `FinishedAt` — by ~18 s;
- no worker-A process exists during worker-B execution;
- all disposable resources are removed and their absence asserted;
- the fatal-process test passes three consecutive runs;
- all prior I02 tests and full quality pass;
- frozen artifacts remain unchanged;
- exactly two scoped commits exist;
- the tree is clean and nothing is pushed.

---

## M. Scope and evidence closure

Touched: `apps/worker/test/process/**` (new), `apps/worker/jest.config.mjs`,
`apps/worker/tsconfig.json`, `infrastructure/docker/worker.Dockerfile`
(test-only target), `package.json` (one script), and the APP2 status/report
files in Commit F.

Untouched: `apps/api/**`, `apps/admin/**`, `apps/storefront/**`,
`packages/object-storage/**`, `packages/persistence/**`, `apps/worker/src/**`,
database schema and migrations, OpenAPI, the generated client, the Figma design
index, Nginx, and every normal Compose service. No new dependency, no migration,
no Asset handler.

Entry HEAD `fd93ab3d2088efccb691d8271f7ea7fc503d0d98`. Commit E
`43546a67df80b1f20a090cc2ffa5ab2e6971404f`. Commit F is this report plus the
final APP2 status updates. Exactly two commits, clean tree, not pushed.

Downstream, unchanged by this directive:

```text
APP2-B01 = BLOCKED_BY_STORAGE-BLK-01..03_AND_UPLOAD_SIZE_PARAMETER
APP2-W01 = BLOCKED_BY_APP2-B01
```
