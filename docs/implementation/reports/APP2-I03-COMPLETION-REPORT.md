# APP2-I03 — Private-Bucket Bootstrap Composition — Completion Report

- **Checkpoint:** `APP2-I03` — wire idempotent private-bucket bootstrap into the
  API and worker composition roots
- **Date:** 2026-07-27
- **Branch:** `production` (nothing pushed)
- **Verdict:** **`PASS`**

---

## A. Preflight and accepted chains

`APP2_I03_PREFLIGHT = PASS`

| Command | Result |
|---|---|
| `git branch --show-current` | `production` |
| `git rev-parse HEAD` | `cdd7b863e9ae8e66b38d1d132ebe6381bc304c2e` |
| `git status --short` | empty (clean tree) |
| `git log -28 --oneline` | `cdd7b86` at HEAD over `fc7f0a1` |
| `pnpm quality` | `EXIT=0` |
| `pnpm check:openapi` | up to date |
| `pnpm check:api-client` | `55de1cc158cf5ab112dae8e8c63f45fe5fee9de1d36aedbb222f0fcec0a6216b` |
| `pnpm check:figma-design-index` | 69 registry IDs |
| `pnpm db:check:manifest` | all checks passed |
| `git diff --check` | clean |

**Chains verified from Git**, not from the prompt: `cdd7b86` is the `APP2-DB01`
evidence Commit B and its parent is `fc7f0a11d87d3be5c803fe294d39bc38451ebe8a`
(the DB01 implementation commit named in §1). Below it: `ac81a2a` (B01 evidence,
amended) → `a1cb712` (B01 implementation) → `4e54633` / `62034ac` (B01-G01) →
`8775734` / `43546a6` / `fd93ab3` / `53417db` (I02 FD1 + C1) → `bfc2a60` /
`1d748ef` (I02 base) → `a82f4f2` / `48e676d` (I01) → the jobs and storage
decision/correction chains (`146c2bd` … `52d582e`).

Entry baselines re-verified and unchanged at exit: OpenAPI
`e19c2f76a800b9382d3e013e34759df5b9cd9090de021b5f3b2be7a5cfbf5c8f`, API-client
`55de1cc1…`, database 32 migrations / 78 tables / 833 columns / 190 CHECK /
fingerprint `82864268…`, Figma 69 registry IDs.

---

## B. The proven production composition gap

Reproduced from source before any edit:

```text
$ grep -rn "ensurePrivateBuckets" --include=*.ts apps packages
packages/object-storage/src/object-storage.port.ts        (declaration)
packages/object-storage/src/s3-object-storage.adapter.ts  (implementation)
packages/object-storage/src/ensure-private-buckets.ts     (algorithm)
packages/object-storage/test/contract/…                   (test)
apps/api/test/integration/asset-intake-api.integration.spec.ts  (test)
apps/api/test/support/asset-intake-context.ts                   (test)
```

Every caller was a test. `apps/api/src/main.ts` created the app, configured
Swagger and listened; `apps/worker/src/main.ts` created the context, registered
the fatal closer and logged readiness. Neither touched storage. The buckets in
the development stack exist only because a test happened to create them on that
machine — a real deployment had nothing that would.

This checkpoint closes only that gap: no new port operation, no new SDK, no
change to the bucket algorithm.

---

## C. Existing object-storage audit

| Question | Answer found in source |
|---|---|
| Client/factory ownership | `packages/object-storage` — `loadObjectStorageConfig`, `createS3Client`, `createS3ObjectStorage`; the package is side-effect-free on import and constructs nothing itself |
| Clients per process | One. The API builds it once in `objectStorageProviders`; the worker had none and now builds exactly one the same way |
| `ensurePrivateBuckets` | `HeadBucket` per bucket → `CreateBucket` when absent; `BucketAlreadyOwnedByYou` already treated as success; **no policy/ACL/public-access API is ever called** |
| Error taxonomy | Closed 7-code `ObjectStorageError` + `ObjectStorageConfigError`; `classifyProviderError` maps by name, then `code`, then HTTP status, and refuses to guess (`INVALID_PROVIDER_RESPONSE`) |
| API listen ordering | `main.ts` owned `listen`; `createApiApplication` deliberately does not listen, so the OpenAPI generator can reuse it |
| Worker poll start | `JobPollRuntimeService.onApplicationBootstrap` → load policy → probe database → `started = true` → start loop |
| Readiness | API: `/api/health` (liveness) + `/api/health/readiness` (database). Worker: `readiness()` over fatal / shutting-down / not-started / policy / database |
| Offline graphs | `applyOfflineObjectStorageEnv` supplies `.invalid` placeholders to the three graphs that build `AppModule` without a store |
| Compose | `api` and `staff-bootstrap` carried `OBJECT_STORAGE_*` (added with the APP2-DB01 dev-image fix); **`worker` carried none**; MinIO published no port; the E2E stack had no object store at all |

---

## D. Bootstrap contract and memoization

One narrow contract per process, holding no storage logic of its own:

```ts
// API
class ObjectStorageBootstrapService {
  initialize(): Promise<void>;  // memoized, throws the safe class
  isReady(): boolean;           // sticky for the process lifetime
}

// Worker — the same object, exposed as the runtime's gate
class ObjectStorageBootstrapService implements WorkerStartupGate {
  ensureReady(): Promise<StartupGateResult>;  // memoized, returns a result
  initialize(): Promise<void>;                // throwing form, same attempt
  isReady(): boolean;
}
```

`this.attempt ??= this.run()` is the memoization: two concurrent callers await
the **same** promise, so one process can never issue two `CreateBucket` calls
for one name. Success is sticky — the buckets cannot become un-created, and
re-checking per request would put a network call in a hot path for a decision
nobody acts on. A *failed* attempt is cleared, so a supervisor's restart gets a
real attempt rather than a cached rejection; nothing retries on its own.

Neither app duplicates config parsing, client construction or the bucket
algorithm — all three come from the package. What is duplicated, deliberately
and declared: the ~25-line startup **classification** (§Q).

`packages/object-storage` gained no Nest dependency and no code at all: the
concurrent-bootstrap correction §10 allows was **not needed** (§H).

---

## E. API startup ordering

`main.ts` now runs an explicit sequence, extracted into `bootstrap/start-api.ts`
so it is asserted rather than described:

```text
createApiApplication → useLogger → enableShutdownHooks → (Swagger)
  → bootstrapStorage()          ← private buckets verified/created
  → listen()
```

On failure: `onError` logs the safe class, the context is closed **exactly
once**, `listen` is never called, and the process exits non-zero through the
existing bootstrap error path. No retry loop was added.

Ordering is not delegated to Nest lifecycle hooks. Hook ordering between
unrelated providers is not part of Nest's contract, and "the bucket check
happened to run before the port opened" is not a guarantee that survives the
next module.

**Offline graphs are unaffected.** Bootstrap is called only from `main.ts`, so
constructing `AppModule` still reaches no network. The OpenAPI suite now asserts
this directly: after building the document against the `.invalid` endpoint,
`ObjectStorageBootstrapService.isReady()` is `false` — the assertion that keeps
bootstrap out of module construction and lifecycle hooks.

**Readiness (§8), resolved deliberately.** The API already has
`/api/health/readiness`, and §8 says storage must be part of an existing
readiness mechanism. Adding a field to it would change `ReadinessStatusResponse`
and therefore the frozen OpenAPI artifact, which §1 forbids. The tension is
resolved the way §8's second sentence allows: **listen is the storage gate**.
The state "reachable but storage-unready" is unreachable by construction — there
is no HTTP surface until the buckets are verified — so a public field would
report something that can never be observed. No duplicate endpoint was added.

---

## F. Worker startup / readiness ordering

```text
onApplicationBootstrap:
  policies.load()
  queue.probeWorkerDatabase()
  startupGate.ensureReady()      ← awaited BEFORE `started`
  started = true; loop = pollForever()
```

Because the gate is awaited before `started`, there is no window in which the
loop exists and the gate does not hold. A closed gate returns before the loop is
ever created, so **no claim query is issued at all** — not "claimed and
discarded".

The gate is an abstraction, `WORKER_STARTUP_GATE`, injected by the runtime and
**not provided** by `WorkerRuntimeModule`. Binding a permissive default in the
generic runtime is exactly how an unguarded worker reaches production unnoticed;
a graph that forgets to bind one fails to resolve, out loud, at construction.
The composition root (`WorkerObjectStorageModule`, `@Global`) binds it to the
bucket bootstrap with `useExisting`, so the runtime keeps no S3 knowledge.

Failure is a **result, not a throw**. Throwing out of `onApplicationBootstrap`
would reject `createApplicationContext`, leaving no handle with which to close
the context — and the database pool would keep a failed process alive. Instead
the runtime records the class, readiness reports `STARTUP_GATE_CLOSED`, and
`main.ts` closes the context exactly once and sets exit code 1.

A missing **policy** deliberately keeps its old behaviour (process up, idle):
an operator publishes that policy into the database the worker is already
reading. An unreachable **store** is a hard precondition for the work the worker
exists to do, so it fails the start.

Readiness now requires: valid `worker.runtime` policy · database probe · every
startup gate open · runtime started · not shutting down / fatal. An empty
production registry remains a ready, idle worker — `APP2-W01` is not a readiness
precondition.

---

## G. Error and security behaviour

Four internal classes, mapped from the existing taxonomy, never from a message
string:

| Provider condition | Startup class |
|---|---|
| `ObjectStorageConfigError` | `OBJECT_STORAGE_CONFIGURATION_INVALID` |
| `ACCESS_DENIED` | `OBJECT_STORAGE_ACCESS_DENIED` |
| `PROVIDER_UNAVAILABLE` / `PROVIDER_TIMEOUT` / `REQUEST_ABORTED` | `OBJECT_STORAGE_UNAVAILABLE` |
| `OBJECT_NOT_FOUND` / `CONFLICT` / `INVALID_PROVIDER_RESPONSE` / anything unrecognised | `OBJECT_STORAGE_BOOTSTRAP_INVALID_RESPONSE` |

Access-denied is never downgraded to "unavailable" — one needs a credential or
ownership fix, the other invites a restart. An unknown failure is never guessed
into a retryable class.

Log lines carry `component=api|worker operation=ensurePrivateBuckets ready=false
error=<class>` and nothing else. The failure's own message names only the class;
the SDK error travels as `cause` and is never formatted. Bucket names are not
logged. Both real-process smokes assert that neither the access key id nor the
secret appears anywhere in the process output.

---

## H. Concurrent bootstrap / race proof

The cross-process smoke starts the built API and the built worker back-to-back
against one MinIO that begins with **zero** buckets, so both reach
`ensurePrivateBuckets` while the store is still empty.

Result: both processes start, both log their verification, and the store holds
**exactly two** buckets. The existing `BucketAlreadyOwnedByYou` branch already
makes a lost race a success for the loser, so **no package-level correction was
required** and `packages/object-storage` was not modified. Access-denied and
unknown failures remain unswallowed — proven by unit cases that assert each maps
to its own class rather than to "unavailable".

Bucket inventory is read from the store's own data directory
(`docker exec … ls /data`), so "no unexpected bucket" is a direct observation,
not an API view filtered by credentials.

---

## I. Compose and environment wiring

- **dev:** `worker` now carries the shared `x-object-storage-env` anchor (the
  same eight existing variable names the API uses) and both `api` and `worker`
  wait for `minio: service_healthy`. Ordering only — the application bootstrap
  stays authoritative, because a healthy container is not a verified bucket and
  Compose ordering does not exist in Kubernetes at all. Internal endpoint is
  `http://minio:9000`; MinIO still publishes **no** host port and is still not
  routed through Nginx; SonarQube's port is untouched.
- **e2e:** the isolated edge gained an ephemeral tmpfs MinIO, and the API host
  process is given explicit `OBJECT_STORAGE_*` values pointing at it. This was
  not optional: the API no longer listens without a reachable store, so an E2E
  run would have failed at API start with a message about buckets rather than
  about the journey under test. It is published on `127.0.0.1` exactly like this
  file's PostgreSQL and for the same reason — every application in the E2E stack
  is a *host* process, so a Compose-internal-only endpoint is unreachable. The
  values are passed explicitly rather than inherited, so a developer's ambient
  `OBJECT_STORAGE_*` can never send an E2E run at a real store.
- `.env.example` documents that the two bucket variables are now **startup**
  requirements for both processes.

No new variable name was invented.

---

## J. API tests

| Proof | Where |
|---|---|
| bootstrap runs before listen | `start-api.spec.ts` — asserts the call order `['bootstrapStorage', 'listen']` |
| bootstrap called exactly once on success | same |
| listen never called on failure | same |
| context closed exactly once on failure | same — `['bootstrapStorage', 'close']` |
| a successful start does not close | same |
| no retry loop | same |
| memoization: concurrent callers share one attempt | `object-storage-bootstrap.service.spec.ts` |
| sticky success | same |
| never ready after failure | same |
| a later attempt can run after a failure | same |
| safe class surfaced, provider message not | same |
| classification of all seven provider codes + config error + unknown | same |
| safe message carries no endpoint or key | same |
| OpenAPI generation performs no storage call | `build-openapi-document.spec.ts` |
| normal API integration graph still constructible | full API suite, 92 suites / 1136 tests |

Startup-order tests use injected doubles, as required. No API route was added —
the OpenAPI artifact is byte-identical.

The real-process API proof is the **composition** smoke (§L), which §12 allows
in place of an API-only one.

---

## K. Worker regressions

| Suite | Result |
|---|---|
| `pnpm --filter @embroidery/worker test` | **15 suites / 141 tests passed** (was 130 — 11 new gate cases) |
| `test:worker-runtime:integration` | 2 suites / 10 passed |
| `test:worker-runtime:smoke` | 6 passed |
| `test:worker-runtime:signal-smoke` | 5 passed — **real Linux SIGTERM → exit 0 in 388 ms** |
| `test:worker-runtime:uncooperative-timeout` | 3 passed |
| `test:worker-runtime:fatal-process` | **16 passed** — worker A `ExitCode 1` / `Running false` 16 958 ms before the lease deadline, `attemptsBeforeReclaim=0`, worker B handler start +1.6 s, final `DISPATCHED` with `attempt_count=2`, worker B exit 0 |

New worker gate cases: claims nothing when closed · readiness reports
`STARTUP_GATE_CLOSED` · not ready while pending · gate precedes the first claim ·
empty registry ready once gates open · plus six bootstrap-service cases.

The I02 integration harness opens the gate explicitly with a test double and
supplies non-connecting `.invalid` placeholders, so those suites still prove
queue behaviour with no object store and no network call. That override is
declared in the harness, not implicit.

---

## L. Cross-process composition smoke

`pnpm test:storage-bootstrap:composition` — **11/11 passed**, both processes the
real built entry points:

```text
empty store before                         ✓  []
API listening + worker ready               ✓
both verified the buckets                  ✓  component=api and component=worker
exactly two buckets after the race         ✓
anonymous listing and root listing refused ✓
API bootstrap line precedes "listening"    ✓  (ordering read from real output)
worker idle with 0 handlers                ✓
both shut down cleanly                     ✓
restart is idempotent, bucket set unchanged✓
no credential in either process's output   ✓
zero residue (container removed, DB dropped)✓
```

`pnpm test:storage-bootstrap:worker` — **9/9**, the worker alone against a store
that starts with **no buckets at all** (asserted first, so a pre-provisioned
store cannot make it pass vacuously): buckets created, both usable by their
owner, anonymous access refused, verification logged, ready, idle, exit 0, no
credential leak, zero residue.

**Platform limitation, stated rather than hidden:** on Windows
`child.kill('SIGTERM')` calls `TerminateProcess`, so a host-process child dies
*by signal* with a null exit code and Nest's hooks never run. The composition
smoke accepts either termination shape and still fails on a non-zero exit; the
real-SIGTERM exit-0 evidence is the Linux container smoke above, which is
exactly the split APP2-I02-C1 established.

---

## M. Dependency, migration and artifact boundaries

- **No external dependency.** The worker gained
  `@embroidery/object-storage: workspace:*` — the existing workspace package it
  now imports. The lockfile delta is three lines, one `link:` entry.
- **No migration, no schema change.** Database baseline unchanged: 32 / 78 / 833
  / `82864268…`.
- OpenAPI `e19c2f76…`, API-client `55de1cc1…`, Figma 69 — all unchanged and
  re-verified by their own gates.
- No Sharp, no `APP2-W01` handler, no asset-intake behaviour change, no
  Admin/Storefront source, no Nginx route, no public media behaviour.

**Production-image defect found and fixed.** The shipped worker `runner` image
could not start: it copied only `packages/database` and `packages/persistence`,
so the new object-storage import failed at runtime, and the `dev` stage built
only `@embroidery/persistence...`, so the dev worker container had no compiled
`object-storage/dist`. Both fixed; the dev stage now builds
`@embroidery/worker^...`, so a future workspace dependency is included
automatically instead of failing at startup. This is the same class of defect
APP2-I02-C1 found in the same file and APP2-DB01's entry fix found in
`api.Dockerfile` — it surfaces only when something actually runs the image,
which is why the signal smoke caught it here.

---

## N. Commit A evidence

```text
6252e4d322ee21aa01827ff22a0954393e7a63ac
feat(storage): wire private-bucket startup bootstrap
39 files changed, 1970 insertions(+), 18 deletions(-)
```

| Area | Files |
|---|---|
| API production | `src/main.ts`, `src/bootstrap/start-api.ts`, `src/modules/asset/asset-intake.module.ts`, `.../storage/object-storage-bootstrap.service.ts`, `.../storage/object-storage-bootstrap.errors.ts` |
| API tests | `src/bootstrap/start-api.spec.ts`, `.../object-storage-bootstrap.service.spec.ts`, `src/openapi/build-openapi-document.spec.ts` |
| Worker production | `src/main.ts`, `src/bootstrap/worker.module.ts`, `src/runtime/worker-runtime.module.ts`, `src/runtime/poll/job-poll-runtime.service.ts`, `src/runtime/startup/startup-gate.ts`, `src/storage/object-storage.module.ts`, `src/storage/object-storage.provider.ts`, `src/storage/object-storage-bootstrap.service.ts`, `src/storage/object-storage-bootstrap.errors.ts`, `package.json` |
| Worker tests | `src/runtime/poll/job-poll-runtime.service.spec.ts`, `src/storage/object-storage-bootstrap.service.spec.ts`, `src/runtime/storage-bootstrap-worker.smoke.integration.spec.ts`, `test/composition/storage-bootstrap-composition.smoke.spec.ts`, `test/support/disposable-minio.ts`, `src/runtime/tests/offline-object-storage-env.ts`, `src/runtime/tests/worker-runtime-context.ts`, `src/bootstrap/worker-persistence.integration.spec.ts`, `src/runtime/worker-smoke.integration.spec.ts`, `src/runtime/worker-signal-smoke.integration.spec.ts`, `test/process/worker-fatal-timeout.process.spec.ts`, `jest.config.mjs` |
| Infrastructure | `infrastructure/docker/worker.Dockerfile`, `infrastructure/compose/docker-compose.dev.yml`, `infrastructure/compose/docker-compose.e2e.yml`, `.env.example` |
| E2E orchestration | `packages/e2e-testing/support/orchestration/{config,api-service,environment}.mjs` |
| Scripts / lockfile | `package.json`, `pnpm-lock.yaml` |

---

## O. Validation matrix

| Command | Substitution | Result |
|---|---|---|
| `pnpm --filter @embroidery/object-storage lint / typecheck / test / build` | — | clean · clean · **150 passed** · built |
| `pnpm --filter @embroidery/api lint / typecheck / test / build` | — | clean · clean · **92 suites / 1136 passed** · built |
| `pnpm --filter @embroidery/worker lint / typecheck / test / build` | — | clean · clean · **15 suites / 141 passed** · built |
| `pnpm test:object-storage:contract` | — | **20 passed** |
| `pnpm test:storage-bootstrap:api` | created | **3 suites / 35 passed** |
| `pnpm test:storage-bootstrap:worker` | created | **9 passed** |
| `pnpm test:storage-bootstrap:composition` | created | **11 passed** |
| `pnpm test:worker-runtime:integration` | — | **10 passed** |
| `pnpm test:worker-runtime:smoke` | — | **6 passed** |
| `pnpm test:worker-runtime:signal-smoke` | — | **5 passed** (real SIGTERM, exit 0, 388 ms) |
| `pnpm test:worker-runtime:uncooperative-timeout` | — | **3 passed** |
| `pnpm test:worker-runtime:fatal-process` | — | **16 passed** |
| `pnpm docker:dev:config` | — | valid; `OBJECT_STORAGE_ENDPOINT: http://minio:9000` on api, worker and staff-bootstrap |
| `pnpm check:openapi` / `check:api-client` / `check:figma-design-index` | — | unchanged |
| `node --test tools/check-figma-design-index.test.mjs` | — | pass |
| `pnpm db:check:manifest` | — | all checks passed |
| `node tools/check-file-size.mjs` | — | pass (17 above the review threshold, none over a hard limit) |
| `pnpm quality` | — | **`EXIT=0`** |
| `git diff --check` | — | clean |

**Residue:** `pg_database` shows no `embroidery_*` database other than the
persistent `embroidery`; no `embroidery-i03-*` or `embroidery-fd1-*` container
and no test image remains. The persistent development database was never
migrated or mutated.

**Two failures worth recording rather than hiding.**

1. The first `test:worker-runtime:signal-smoke` run **failed**: the shipped
   image could not start because it never shipped `@embroidery/object-storage`
   (§M). That is the defect the smoke exists to catch, and it was fixed in
   `worker.Dockerfile` rather than worked around in the test.
2. Two disposable MinIO containers survived those failed runs, because the
   signal smoke's `afterAll` stopped the container and the image but not the
   store I had added. Fixed in the same file; the leftovers were removed and the
   final state verified empty.

---

## P. Acceptance matrix

| # | Criterion | Evidence |
|---|---|---|
| 1 | Clean exact preflight | §A |
| 2 | DB01 A/B and prior chains verified | §A |
| 3 | Production gap reproduced | §B |
| 4 | Existing port preserved | no change to `packages/object-storage` |
| 5 | One memoized bootstrap per process | §D |
| 6 | Concurrent calls share one promise | §D, unit cases in both apps |
| 7 | Exactly ORIGINALS + DERIVATIVES ensured | §H, §L |
| 8 | API does not listen before bootstrap | §E, §J, §L ordering case |
| 9 | API does not listen on failure | §J |
| 10 | API closes once on failure | §J |
| 11 | OpenAPI generation makes no storage call | §E, §J |
| 12 | Worker does not poll/claim before bootstrap | §F, §K |
| 13 | Worker readiness false before bootstrap | §K |
| 14 | Worker readiness true only after all gates | §K |
| 15 | Bootstrap failure claims zero jobs | §K (`queue.claims` empty) |
| 16 | Worker context/pool close once on failure | §F (`main.ts` closes the handle it holds) |
| 17 | Empty registry remains valid idle | §K, §L |
| 18 | I02 normal/fatal shutdown preserved | §K — all five regression suites |
| 19 | Concurrent API+worker startup succeeds | §L |
| 20 | Real create race handled safely | §H |
| 21 | Access-denied/unknown not swallowed | §G, unit cases |
| 22 | Buckets remain private | §H, §L |
| 23 | Anonymous access denied | §L |
| 24 | No extra bucket | §H, §L |
| 25 | Repeat startup idempotent | §L restart case |
| 26 | Existing config names reused | §I |
| 27 | Internal endpoint `minio:9000` | §O |
| 28 | Compose dependency/health wiring | §I |
| 29 | No MinIO host port (dev) | §I |
| 30 | No MinIO Nginx route | unchanged |
| 31 | No SonarQube port change | unchanged |
| 32 | Safe logs, no credentials | §G, §L |
| 33 | Real API bootstrap smoke | §L (composition, permitted by §12) |
| 34 | Real Linux worker bootstrap smoke | §L |
| 35 | Cross-process composition proof | §L |
| 36 | Real SIGTERM exits cleanly | §K |
| 37 | Object-storage contract passes | §O |
| 38 | Worker regression suites pass | §K |
| 39 | Zero disposable residue | §O |
| 40 | No persistent dev DB mutation | §O |
| 41 | No dependency | §M |
| 42 | No migration/schema change | §M |
| 43-46 | DB / OpenAPI / client / Figma unchanged | §M |
| 47 | No Sharp, no W01 handler | §M |
| 48 | No frontend/public media change | §M |
| 49 | Commit A implementation-only | §N |
| 50 | Commit B evidence-only | this report + status pointers |
| 51 | Exactly two commits | `6252e4d` + this one |
| 52 | Complete report | this document |
| 53 | Clean final tree | verified after Commit B |
| 54 | Nothing pushed | `origin/production` still at `8775734` |
| 55 | W01 / A01 not started | no such files exist |

---

## Q. Handoff and scope closure

**Declared duplication.** The four-class startup mapping exists once in each app
(~25 lines, cross-referenced in both files). Sharing it would require a new
application-layer workspace package, which is outside this checkpoint's allowed
areas; §5 explicitly permits the contract to live separately when framework
boundaries require it, and the things it forbids duplicating — config parsing,
client construction, the bucket algorithm and the provider error taxonomy — all
remain single-sourced in `@embroidery/object-storage`. The worker's
`disposable-minio.ts` is likewise a third copy of an established test-only
pattern, for the reason its own header already records: no package exposes a
testing entry point, and reaching into another workspace's `test/` directory
would couple two packages' private test infrastructure.

**Deliberate judgement, flagged for review.** §11 says "do not publish a MinIO
host port". The development stack still publishes none. The **E2E** compose file
now does publish one on `127.0.0.1`, because every app in that stack is a host
process and the API cannot start without a reachable store. It is one line to
change if the reviewer reads that rule as absolute.

**Not done, on purpose:** no `APP2-W01` handler, no Sharp, no image processing,
no public media delivery, no readiness-endpoint schema change (it would move the
frozen OpenAPI artifact), no correction prompt.

**Final state**

```text
APP2-I03 = COMPLETE — DELIVERED_FOR_REVIEW
APP2-W01 = READY — NOT STARTED
APP2-A01 = BLOCKED_BY_APP2-W01
```
