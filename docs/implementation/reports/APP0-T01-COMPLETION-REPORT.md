# APP0-T01 — Application Integration Harness Adapter — Completion Report

**Checkpoint:** APP0-T01 · **Branch:** `production` · **Verdict:** `PASS`
**Implementation commit:** `7bc3793a6826b50c7c4eed11b2e81ed079fdffc2` — `test(app): add reusable PostgreSQL integration harness`

---

## A. Preflight

- Initial HEAD `503d194` (`docs(app0): record APP0-C02 completion evidence`); working tree clean; C01→C02 present in `git log`.
- C02 chain verified: implementation `ef6152e`, evidence `503d194`; report `docs/implementation/reports/APP0-C02-COMPLETION-REPORT.md` present.
- PostgreSQL: dev container `embroidery-dev-postgres-1` up (host port 5434). Persistent DB baseline (read-only): database `embroidery`, **31** migrations, **0** `embroidery_db7_%`/`embroidery_db10_%` leftovers.

## B. Harness audit and reuse matrix

Canonical owner = `@embroidery/database/testing` (DB7). No second harness was created.

| Concern | Canonical owner | Reused | Adapter added | Duplicate avoided |
|---|---|---|---|---|
| Unique disposable DB name | `disposableDatabaseName` (pid-scoped) | yes | — | yes |
| DB create/drop | `createDisposableDatabase` / `drop` | yes | — | yes |
| Migration execution | `runMigrations` (via harness) | yes | — | yes |
| Migration-history verify | harness + its own spec | yes | — | yes |
| Schema/table/fingerprint verify | `verifySchemaBaseline` (DB6 checkers + fingerprint gate) | yes | — | yes |
| pg pool/client | `createDatabaseClient` (harness) | yes | — | yes |
| Readiness/retry | `DatabaseConnection.validate` (persistence) | yes | — | yes |
| Cleanup + setup-failure cleanup | harness `drop` + create-time rollback | yes | — | yes |
| Credential/error redaction | `redactUrl` (database) | yes | — | yes |
| Persistent-DB safety | harness names `embroidery_db7_*` only | yes | explicit `assertDisposableName` guard | yes |
| LIFO teardown orchestration | — | — | `CleanupStack` (`@embroidery/test-utils`) | n/a (new, package-neutral) |
| API AppModule bootstrap | `createApiApplication` / `GLOBAL_ROUTE_PREFIX` (B01) | prefix reused | `createApiIntegrationContext` | yes |
| HTTP integration client | `supertest` (existing devDep) | yes | agent in the context | yes |

## C. Locked adapter design

- **`@embroidery/test-utils`** — package-neutral only: `CleanupStack` (LIFO, runs every step even if one throws, aggregates failures). No DB lifecycle, no Nest, no business rules, no credentials.
- **`apps/api/src/tests/support/api-integration-context.ts`** — `createApiIntegrationContext(label)` provisions a disposable DB via the canonical harness, guards against the persistent name, snapshots/sets `DATABASE_URL`+`NODE_ENV` only for module init and restores them in `finally`, compiles the real `AppModule` with `LOG_SINK` overridden by a `RecordingLogSink`, creates the app (`logger:false`), applies `GLOBAL_ROUTE_PREFIX`, and exposes a Supertest agent. Teardown uses `CleanupStack` (close app → drop DB); the DB is dropped on both success and setup failure. `AppModule` is never imported into the shared package (ownership not reversed).
- **Parallelism policy** — the DB-integration and durability suites share one dev PostgreSQL container; unbounded workers saturate it (slow `docker exec` teardowns time out), so `apps/api/jest.config.mjs` caps `maxWorkers` at `50%`. Disposable DBs are pid-scoped, so bounded parallel workers stay isolated — enforced concurrency, not serialisation.
- **Fixtures** — none added (the sample uses only migrated schema + live readiness); existing per-module fixtures untouched.

## D. Implementation commit evidence

- Hash `7bc3793a6826b50c7c4eed11b2e81ed079fdffc2`; parent `503d194`; subject `test(app): add reusable PostgreSQL integration harness`.
- 16 files, +534/−12:
  `apps/api/jest.config.mjs`, `apps/api/package.json`, `apps/api/src/tests/support/{api-integration-context.ts, recording-log-sink.ts}`, `apps/api/src/tests/integration/{api-integration-context.integration.spec.ts, api-integration-context.failure.spec.ts}`, `packages/test-utils/{package.json, tsconfig.json, jest.config.mjs, README.md, src/index.ts, src/cleanup-stack.ts, src/cleanup-stack.test.ts}`, `docs/development/BACKEND_CONVENTIONS.md`, `docs/architecture/REPOSITORY_STRUCTURE.md`, `pnpm-lock.yaml`.
- Dependency changes: `@embroidery/test-utils` added to api `devDependencies`; jest/ts-jest/@types added to test-utils `devDependencies`; `pnpm-lock.yaml` updated by pnpm (no manual edit). No schema/migration/production change.

## E. Disposable PostgreSQL evidence

- Disposable names (pid-scoped, `[a-z0-9_]` only): `embroidery_db7_t01_readiness_<pid>`, `…t01_run_a…`, `…t01_run_b…`, `…t01_close_fail…`, `…t01_double_close…`, plus catalog probes `…t01_catalog…` / `…t01_fail_catalog…`. Never `embroidery`.
- Each API context applies all **31** migrations through the canonical harness before the first request; schema/fingerprint verification (`4ca56a59…672f`) is owned and exercised by the DB7 harness's own spec, which these contexts reuse rather than re-run per boot.
- Two sequential real runs (`t01-run-a`, `t01-run-b`): distinct names, each existed then dropped after `close()` — asserted by exact-name catalog queries.
- Cleanup: `close()` closes the app then drops the DB (LIFO); when `app.close()` is forced to reject, the DB is **still dropped** and the failure surfaces as `AggregateError`; `close()` is idempotent (second call is a no-op).
- Persistent DB before/after the full run: `embroidery` present, **31** migrations, **0** `embroidery_db7_%`/`embroidery_db10_%` leftovers (two `db10_*` orphans from an earlier interrupted durability run were dropped out-of-band; no `t01_*` residue ever remained).

## F. Integration proof

- `GET /api/health/readiness` through the real `AppModule` + disposable DB → **200**, body `{ status: ready, service: api, database: { status: up, reason: ok, pool: { max } } }` — real `DatabaseHealthService`, not a mock.
- `GET /api/health` liveness → **200**, raw body (no `data`/`meta`/`success`): the envelope opt-out is preserved end-to-end.
- Structured logging: exactly **one** `http.request.completed` record per readiness request, captured through the overridden sink, with method/route/status `GET /api/health/readiness 200` and a non-empty `requestId` (B02 correlation valid).
- Env isolation: `DATABASE_URL`/`NODE_ENV` unchanged after context setup.

## G. Validation matrix

| Command | Exit | Suites / tests / result |
|---|---:|---|
| `pnpm --filter @embroidery/test-utils typecheck` / `lint` | 0 / 0 | clean |
| `pnpm --filter @embroidery/test-utils test` | 0 | 1 suite / **5** |
| `pnpm --filter @embroidery/api typecheck` / `lint` | 0 / 0 | clean |
| `pnpm --filter @embroidery/api test` | 0 | **63** suites / **778** (was 61 / 767; +2 / +11) |
| `pnpm --filter @embroidery/database test` | 0 | 5 / **152** |
| `pnpm --filter @embroidery/persistence test` | 0 | 6 / **88** |
| `pnpm check:openapi` | 0 | artifact byte-identical |
| `pnpm check:api-client` | 0 | tree hash `3ca2b2e…` unchanged |
| `node tools/check-file-size.mjs` | 0 | no new file over limit |
| `git diff --check` | 0 | clean |
| `pnpm quality` (PostgreSQL up) | 0 | full chain green (api 778; worker 6; admin/storefront 2 each; db-manifest 78 tables) |

Note: an initial full-quality run failed on durability suites' `docker exec dropdb` under container saturation; resolved by cutting the adapter's disposable-DB churn (one shared catalog probe per file, exact-name checks) and the `maxWorkers` cap. The final `pnpm quality` is green.

## H. Deviations / follow-ups

- **D-1 (design choice):** the API context uses `Test.createTestingModule({ imports:[AppModule] }).overrideProvider(LOG_SINK)` + `createNestApplication` + `setGlobalPrefix(GLOBAL_ROUTE_PREFIX)` rather than `createApiApplication()`, because the runtime bootstrap offers no seam to override the log sink for capture. It reuses `AppModule` and the exported prefix invariant; runtime bootstrap is unchanged. Non-blocking.
- **D-2 (§17):** `@embroidery/contracts` runtime guards are already consumed by the api-client error-normalizer and by API tests via ts-jest (workspace symlinks resolve outside `node_modules`); no contracts-package runtime refactor was needed or performed. Owner: a future dedicated checkpoint if the API ever needs contracts at plain-Node runtime.
- **F-1 (informational):** `maxWorkers: '50%'` bounds api Jest concurrency for shared-container stability; revisit if CI provisions a per-worker database server.

## I. Acceptance matrix

| Gate group | Evidence | Result |
|---|---|---|
| C02 evidence chain verified | §A | PASS |
| Canonical harness mapped; no parallel harness | §B | PASS |
| Migration/lifecycle/cleanup reuse | §B, §E | PASS |
| Minimal test-utils + API adapter | §C, §D | PASS |
| Real AppModule + PostgreSQL integration | §F | PASS |
| Unique disposable DBs; success+failure cleanup; no leak | §E | PASS |
| Persistent DB unchanged; env restored | §E, §F | PASS |
| Two sequential runs; bounded-concurrency policy enforced+documented | §C, §E | PASS |
| Existing DB/API/persistence suites preserved | §G | PASS |
| OpenAPI + generated client unchanged | §G | PASS |
| Full quality PASS | §G | PASS |

## J. Scope confirmation

No second database harness; no schema/migration change; no persistent-DB mutation; no OpenAPI/generated-client change; no frontend/worker/Nginx change; no feature work; no auth. APP0-DEC-COMPONENT-TEST not started.

## K. Evidence closure

- Implementation commit `7bc3793a6826b50c7c4eed11b2e81ed079fdffc2` (frozen; gates re-run PASS after commit).
- Evidence commit subject: `docs(app0): record APP0-T01 completion evidence`.
- Working tree before the evidence commit: clean (only the untracked report + staged phase doc).
- Push status: **NOT PUSHED**.
- Verdict: **`PASS`**.
