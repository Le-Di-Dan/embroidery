# APP2-I02-C1 — Worker Timeout Correction — Report

Checkpoint: `APP2-I02-C1 — Prevent overlapping timed-out attempts and prove real SIGTERM shutdown`
Verdict: **PASS** · `APP2-I02 = COMPLETE — CORRECTED — DELIVERED_FOR_REVIEW`

## A. Preflight and I02 chain

`APP2_I02_C1_PREFLIGHT = PASS`. Branch `production`, HEAD
`bfc2a60b6f60abaf8ec5d8725073740f39c58a5f` (the exact I02 evidence commit),
`git status --short` empty. `pnpm quality`,
`pnpm test:worker-runtime:integration` (19 + 10),
`pnpm test:worker-runtime:smoke` (6), `pnpm check:openapi`,
`pnpm check:api-client`, `pnpm db:check:manifest` and `git diff --check` all
exited 0 before any edit. No unknown work absorbed. I02 A
`1d748ef5ff18c7b78fe364789149c57c74abece3`, B `bfc2a60b…`; I01 A `48e676de…`,
B `a82f4f21…`; jobs A `8211214e…`, B `27c324ee…`, C `a9ef895b…`, D `146c2bdc…`.

## B. Defect reproduction

The reviewer is right, and the I02 report was wrong to record this as a
limitation rather than a defect. The old `attempt()` did
`await Promise.race([handler.execute(...), abortRejection(signal)])`. When the
handler ignored its `AbortSignal` the abort branch won, the handler promise was
**dropped on the floor**, and the runtime called `completeRetryableAttempt` —
which sets `status = 'PENDING'`, clears `claimed_by` and arms `next_attempt_at`.
The row became claimable while the original handler was still executing in the
same process, so any worker could run it again with the **same** `effectKey`.
Node cannot cancel a running promise, so nothing stopped the first one.

Reproduced before the fix by I02's own "case 19": a never-settling handler
asserting a `FAILED_RETRYABLE` row with a released lease. That assertion *was*
the bug, written down as expected behaviour. It is now the cooperative case, and
the uncooperative case has its own suite.

## C. Timeout and fatal state machine

`leaseExpiresAt` was already in `ClaimedWorkerJob` and already returned by the
claim statement, so **no persistence change was needed** (§5.1, §12). In
`job-execution.service.ts` the handler promise is created once with both
branches attached and is **never detached** — it cannot become an unhandled
rejection and cannot be forgotten. At `handlerTimeoutMs` the controller aborts,
the abort instant is recorded (`ABORT_REQUESTED`), and the runtime then waits on
that same promise, bounded by:

```text
hardStopWaitMs = min(abortRequestedAt + leaseSafetyMarginMs,
                     leaseExpiresAt − fatalExitSafetyMs) − now
```

`fatalExitSafetyMs = 250` is an internal constant in
`runtime/lifecycle/worker-process.ts`: positive, bounded, not an environment
variable, and **validated at policy startup** — `parseWorkerRuntimePolicy` now
rejects any policy whose `leaseSafetyMarginMs` does not exceed it.

**Cooperative** (§5.4): the handler settles inside the deadline. The outcome is
`JOB_HANDLER_TIMEOUT` whether it resolved or rejected — a late success is still
a timeout, and `SUCCEEDED` would hide a handler that routinely overruns.
Completion uses the existing atomic transaction, retryable or terminal by
`maxAttempts`, and the lease is released normally.

**Uncooperative** (§5.5): unsettled at the deadline. No completion is written,
`claimed_by` and `next_attempt_at` are untouched, no attempt row is appended and
no further poll happens. `WorkerFatalService` then, in order: flips
`FATAL_HANDLER_UNRESPONSIVE` **synchronously**, emits exactly one allow-list log
line (`correlationId`, `jobKind`, `jobKey`, `attemptNo`, `workerInstanceId`,
`eventType`, `outcome=FATAL_HANDLER_UNRESPONSIVE` — nothing else), closes
context and pool once, and exits `1`. The close is itself bounded by
`fatalExitSafetyMs`, so a pool that refuses to close cannot spend the head start
the deadline reserved.

## D. Shutdown and process exit

One injectable seam, `WORKER_PROCESS`, is the only thing in the runtime that can
end the process; tests override it and record the code instead of dying.
Idle/cooperative external SIGTERM → Nest closes, exit **0**, which needed
`enableShutdownHooks(undefined, { useProcessExit: true })` (Nest otherwise
re-raises the signal, so a clean drain would report **143** — failure, to an
orchestrator). Unresponsive handler → fatal path above, exit **1**. Normal
shutdown whose in-flight work is still unsettled at `shutdownGraceMs` (§7) → the
lease is **not** released and `exitAfterForcedShutdown()` exits non-zero;
reporting 0 would claim a drain that did not happen.

Guards: `triggered` makes the fatal exit and the forced exit mutually exclusive
and each once-only; `closed` makes the close once-only; the poll loop breaks on
`fatal.isFatal`; `awaitInFlight` uses a **zero** grace in the fatal state, since
the runaway handler will never settle. Nest remains the sole owner of
SIGTERM/SIGINT — `main.ts` adds no listener.

## E. Real OS SIGTERM

`pnpm test:worker-runtime:signal-smoke` — 5 tests, exit 0. It builds the
production `runner` target, runs it as PID 1 in a Linux container
against a disposable PostgreSQL, waits for `Worker readiness: ready (ok)` with
`0 handler(s) registered`, confirms the seeded event it cannot handle is still
`PENDING`/`attempt_count = 0`, then delivers a genuine kernel signal with
`docker kill --signal=TERM`:

```text
[signal-smoke] real SIGTERM → exit 0 in 362ms
```

Logs show `Poll loop stopped claiming.` and `Worker runtime stopped (SIGTERM)`,
so the handler ran on real delivery. Container and image are removed inside the
test and their absence asserted. `process.emit('SIGTERM')` remains only in the
fast `worker-smoke` suite and is no longer acceptance evidence.

**Pre-existing defect found by this suite.** The `runner` image had never been
executed — the development stack uses the `dev` target — and it did not start:
`deps`/`prod-deps` never copied the `packages/database` or
`packages/persistence` manifests, so those packages had no `node_modules` and
`packages/persistence/dist` could not resolve `@nestjs/common`. Fixed by adding
both, installing with `--filter "@embroidery/worker..."` and shipping their
`node_modules`. Without this the required evidence could not exist.

## F. Cooperative timeout

`worker-cooperative-timeout.integration.spec.ts` — 2 tests, live database.

- A handler resolving *on* its abort records
  `attempt 1 / FAILED_RETRYABLE / JOB_HANDLER_TIMEOUT`; the row returns to
  `PENDING` with `last_error = JOB_HANDLER_TIMEOUT` and `claimed_by = NULL`, no
  exit is requested, readiness stays `{ ready: true }`. The late success is
  **not** `SUCCEEDED`.
- Repeated timeouts terminate at `maxAttempts`: attempts 1 `FAILED_RETRYABLE`
  and 2 `FAILED_TERMINAL`, both `JOB_HANDLER_TIMEOUT`, row `DEAD_LETTER`, lease
  released, still no exit and still ready — a cooperative handler never reaches
  the fatal path however often it times out.

## G. Uncooperative timeout and reclaim

`worker-uncooperative-timeout.integration.spec.ts` — the §10 sequence, live.

| Step | Evidence |
| --- | --- |
| 1–3 | claimed by worker A, `attempt_count = 1`, handler never settles |
| 7 | `exits = [1]`, state `FATAL_HANDLER_UNRESPONSIVE`, exit **before** `leaseExpiresAt` with **> 1 000 ms** to spare |
| 4–5 | `status = PENDING`, `claimed_by =` worker A, `attempt_count = 1`, `last_error = NULL`, **zero** attempt rows, `next_attempt_at` byte-identical to the claim |
| 6 | `readiness = { ready: false, reason: 'FATAL_HANDLER_UNRESPONSIVE' }` |
| 8 | a newly seeded due event still has `attempt_count = 0` after 600 ms |
| 9 | worker B started after expiry, distinct `workerInstanceId`, same database |
| 10–11 | attempts are exactly `1 / FAILED_RETRYABLE / WORKER_LEASE_EXPIRED` then `2 / SUCCEEDED` |
| 12 | the job's two executions are ordered A → B, and B's began **after** A's exit was recorded |
| 13 | both contexts closed, the shared disposable database dropped once by its owner |

On step 12, stated plainly: both runtimes share the Jest process and the exit is
recorded rather than performed, so worker A's runaway promise is still pending
in-process where production would have no process at all. Counting "live
handlers" would measure the harness, so ordering — what the runtime actually
guarantees — is asserted instead; the process boundary itself is proved by §E.

## H. Persistence and schema invariants

No persistence change: `leaseExpiresAt` was already projected. No table, column,
status, attempt outcome, heartbeat or lease extension was added.
`FATAL_HANDLER_UNRESPONSIVE` is operational state and a log outcome only — never
written to `outbox_events.status` or `background_job_attempts.outcome`.
`NO_APP2_MIGRATION` holds: 31 migration files, unchanged. No new dependency —
`pnpm-lock.yaml` untouched; `package.json` gained two scripts. The locked
invariant (§8) is documented at the top of `worker-fatal.service.ts` and
enforced by construction: the only path that releases a lease after a timeout is
the cooperative branch, reachable only once the handler promise has settled.

## I. Commit C

`53417dba9ea16d871cb50a8023514637d708f736` — `fix(worker): prevent overlapping
timed-out job attempts`, 19 files, +1199 / −58. No report.

## J. Validation

All exit 0: `pnpm --filter @embroidery/persistence lint | typecheck | test`
(107 tests / 8 suites); `pnpm --filter @embroidery/worker lint | typecheck |
test | build` (130 tests / 14 suites); `pnpm test:worker-runtime:integration`
(19 + 10); `pnpm test:worker-runtime:smoke` (6);
`pnpm test:worker-runtime:signal-smoke` (5);
`pnpm test:worker-runtime:uncooperative-timeout` (3, stable over three
consecutive runs); `pnpm check:frontend-boundaries`;
`pnpm check:spike-boundaries`; `pnpm check:e2e`; `pnpm check:openapi`;
`pnpm check:api-client`; `pnpm check:figma-design-index`;
`node --test tools/check-figma-design-index.test.mjs`; `pnpm db:check:manifest`;
`node tools/check-file-size.mjs`; `pnpm quality`; `git diff --check`.
§14 substitutions: `<persistence>` = `@embroidery/persistence`, `<worker>` =
`@embroidery/worker`. Frozen baselines re-verified after Commit C: OpenAPI
`ae015dd65dc2f64c902145f19d5fa5fae6cd6423a54934c1126cd289e3d30946`, API client
`89c1aace328eef1ee05a74950faa48bf907babece025a6abb9ca1baa1574502f`, database
31 migrations / 78 tables / 833 columns, fingerprint
`4ca56a5967730d257edb34e72d6c40373156704cab7c87e3a684803c8321672f`, Figma
registry 69 IDs.

Residue: `docker ps -a --filter name=embroidery-i02c1` and
`docker images embroidery-i02c1-worker:test` both return nothing afterwards;
every database is a dropped `createDisposableDatabase` instance. No Jest run
reported an open handle or needed `--forceExit`. No payload, return value,
stack, credential, cookie or raw error appears in any log projection — asserted
by the allow-list tests. One flaky test of my own was found and fixed rather
than re-run until green: the cooperative suite read the row after a 10 ms
backoff had already let attempt 2 dead-letter it. It now uses a long first
backoff, and passes three times in a row.

## K. Acceptance

Every §17 criterion is met: clean exact preflight; accepted queue semantics
untouched; `leaseExpiresAt` available without a persistence change; abort
requested at timeout; cooperative wait bounded; a late success cannot become
`SUCCEEDED`; cooperative timeout completes normally; uncooperative writes no
completion; lease remains owned; claims stop; readiness false; context and pool
close once; fatal exit non-zero and before lease expiry; the reclaimer writes
exactly one lease-expiry attempt; the attempt number advances; no handler
overlap; real OS SIGTERM exits zero; `process.emit` is no longer acceptance
smoke; normal shutdown stays bounded; no heartbeat, schema, status, outcome,
dependency or migration change; no Asset, storage, API or frontend change; all
tests and quality pass; zero residue and no open handles; frozen baselines
unchanged; two scoped commits; clean tree; not pushed.

## L. Scope and evidence closure

Touched `apps/worker/**`, `infrastructure/docker/worker.Dockerfile` (required to
make the signal smoke possible) and two root scripts. Untouched: `apps/api/**`,
`apps/admin/**`, `apps/storefront/**`, `packages/object-storage/**`,
`packages/persistence/**`, database schema/migrations, OpenAPI, generated client,
Figma/design index, Nginx, and every normal Compose service. Entry HEAD
`bfc2a60b…`; Commit C `53417dba9ea16d871cb50a8023514637d708f736`; Commit D is
this report plus the APP2 status pointers. Exactly two commits, clean tree, not
pushed. `APP2-I02-C2` must not be created.
