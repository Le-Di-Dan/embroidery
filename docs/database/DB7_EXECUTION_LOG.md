# DB7 Execution Log

Append-only checkpoint history for DB7 (Application Persistence Integration).
Corrections are added as dated addenda; earlier entries are never rewritten.

Canonical companions:

- Scope/ownership: [`DB7_SCOPE_AND_COVERAGE_MATRIX.md`](./DB7_SCOPE_AND_COVERAGE_MATRIX.md)
- Repository contracts: [`DB7_REPOSITORY_CONTRACTS.md`](./DB7_REPOSITORY_CONTRACTS.md)
- Guards: [`DB7_TX_APP_GUARD_MATRIX.md`](./DB7_TX_APP_GUARD_MATRIX.md)
- Error mapping: [`DB7_ERROR_MAPPING_CATALOG.md`](./DB7_ERROR_MAPPING_CATALOG.md)
- Tests: [`DB7_TEST_MATRIX.md`](./DB7_TEST_MATRIX.md)

---

## DB7-CP0 — Application-persistence audit and scope lock

**Starting HEAD:** `d18589a1db60818ed1c3c9e5450cc40ba9526260` (branch `production`)
**Scope:** preflight verification of the DB6 baseline; 78-table persistence-ownership
classification; repository-boundary derivation; TX/App guard inventory;
transaction-context architecture decision. No application code changed.

### Preflight evidence (executed 2026-07-20)

| # | Check | Command / method | Result |
|---|---|---|---|
| 1 | Branch | `git branch --show-current` | `production` |
| 2 | HEAD | `git rev-parse HEAD` | `d18589a1db60818ed1c3c9e5450cc40ba9526260` |
| 3 | DB6 closure commit reachable | `git cat-file -t d18589a` | `commit` (= HEAD) |
| 4 | Tree clean | `git status --porcelain -uall` | empty |
| 5 | Migrations `0000`–`0031` byte-identical | `node tools/db-migration-checksum-check.mjs` | `all 31 migration files match the frozen manifest` |
| 6 | Migration count | `ls migrations/*.sql \| wc -l` | `31` |
| 7 | Disposable DB applies 31 migrations | `embroidery_db7_preflight` + `tsx src/cli/migrate.ts` | `[db:migrate] up to date` |
| 8 | Live tables checker | `db-live-tables-check.mjs` | PASS — `columns: 833 / 833` |
| 9 | Live constraints checker | `db-live-constraints-check.mjs` | PASS — `relationship ceiling: 160 / 160` |
| 10 | Live indexes checker | `db-live-indexes-check.mjs` | PASS — `duplicate index definitions: 0` |
| 11 | Live JSONB checker | `db-live-jsonb-check.mjs` | PASS |
| 12 | Live money checker | `db-live-money-check.mjs` | PASS — 15 money tables, all with currency-scale CHECK |
| 13 | Live triggers checker | `db-live-triggers-check.mjs` | PASS — `triggers: 30 / 30` |
| 14 | Fingerprint gate | `db-fingerprint-gate.mjs` | `match — 4ca56a5967730d257edb34e72d6c40373156704cab7c87e3a684803c8321672f` |
| 15 | Disposable DB removed | `DROP DATABASE embroidery_db7_preflight` | dropped; zero disposable DB left |
| 16 | Persistent dev DB read-only inspection | `SELECT count(*) FROM drizzle.__drizzle_migrations` | `31` — read only, not mutated |
| 17 | No Prisma in code | `grep -ril prisma` (excluding `node_modules`) | only decision/ADR documents recording its **rejection**; zero code/config |
| 18 | No DB7 partial implementation | `find apps/*/src` | only `health` module, `worker-lifecycle`, config/bootstrap — no persistence code |
| 19 | No DB8–DB10 work started | `ls docs/database/DB8*` etc. | none exist |

### Decisions

| ID | Decision | Rationale |
|---|---|---|
| DEC-DB7-001 | **DB7 scope = "Application Persistence Integration"**, superseding the one-line `DB_ROADMAP.md` title "Database Constraint Tests". | `DB_ROADMAP.md` was written at DB0 as a coarse outline. `DB6_DB7_DB10_HANDOFF.md` §1 (written last, at DB6 closure) defines DB7 concretely as "Repository layer, integration & negative validation" with nine named obligations. The two are not contradictory — the roadmap's "constraint/migration verification" is a strict *subset* of the handoff's obligations (negative integration tests through the real repository call path). The handoff is the later and more specific canonical document, so it governs. Recorded rather than silently resolved. `DB_ROADMAP.md` is updated at CP7 to name the wider scope. |
| DEC-DB7-002 | The same reconciliation applies to DB8/DB9/DB10 titles. `DB_ROADMAP.md` labels DB9 "Seed & Fixture Design" and DB10 "Database Acceptance Audit"; `DB6_DB7_DB10_HANDOFF.md` §3/§4 assign DB9 = measured performance and DB10 = backup/retention/durability. **DB7 starts none of them** either way, so the discrepancy is non-blocking; it is flagged for the DB8 owner, not resolved by DB7. | Out of DB7's authority to relabel later checkpoints. |
| DEC-DB7-003 | **New workspace package `@embroidery/persistence`** hosts the NestJS persistence runtime (module, connection provider, transaction manager, health, error mapping) *and* the CTX-PLT platform-primitive persistence (outbox, idempotency, background job attempts). | Two applications (`apps/api`, `apps/worker`) need the runtime, so per `CLAUDE.md` §5 ("narrowest valid scope: … app shared → workspace package") it cannot live in `apps/api/src/shared`. It is not added to `@embroidery/database` because that package is deliberately framework-free (its `index.ts` states so) and adding NestJS decorators would force `experimentalDecorators`/`emitDecoratorMetadata` onto the schema+CLI package. CTX-PLT is classified by `DB2_BOUNDED_CONTEXT_MAP.md` as "Platform (workflow infrastructure) owner, **not a business module** … infrastructure concepts only", and both applications consume it, so it belongs in the same package rather than in `apps/api/src/modules`. Owner/purpose/consumers recorded per `REPOSITORY_STRUCTURE.md` §16. |
| DEC-DB7-004 | **Framework-free persistence-error taxonomy and SQLSTATE/constraint mapper live in `@embroidery/database`** (`src/errors/`), not in `@embroidery/persistence`. | The mapping input is *physical schema knowledge* — constraint names, trigger names, SQLSTATEs — which is exactly what `@embroidery/database` owns. Keeping it framework-free lets the CLI tools and the integration harness use the identical mapping as the NestJS runtime, so there is one mapping, not two. |
| DEC-DB7-005 | **Integration harness lives in `@embroidery/database` (`src/testing/`)**, driven from the existing pinned dev Postgres container, creating one deterministic disposable database per suite. | Reuses the already-canonical `tools/live-db.mjs` checkers, the pinned `postgres:16.14-alpine` image, and `runMigrations`. Adds no new heavy dependency (no Testcontainers): the container is already part of the documented local/CI stack, and DB6's own reproducibility runbook uses exactly this disposable-database-inside-the-pinned-container pattern. |
| DEC-DB7-006 | **Transaction context = hybrid**: `AsyncLocalStorage` carries the active transaction handle, with an *explicit* application boundary (`TransactionManager.runInTransaction`). Repositories resolve their executor through the context; they never receive a driver client as a parameter and never open a transaction themselves. | See §7.7 analysis in `DB7_SCOPE_AND_COVERAGE_MATRIX.md`. Chosen over pure explicit propagation (which forces every repository method to carry a `tx` parameter, leaking `PgTransaction` into application signatures and violating rule §5.14) and over pure implicit context (which hides the boundary). Nested calls **join** the outer transaction by default and can request a savepoint explicitly; a repository call with no active context runs on the pool. Verified by tests, including a concurrent-async-task leakage test. |
| DEC-DB7-007 | **No repository-per-table.** 78 tables map to 15 bounded contexts and a bounded set of aggregate repositories plus query repositories. Child/snapshot/append-only tables are owned *by* their aggregate root repository and have no independent public API. | `CLAUDE.md` §5, `BACKEND_CONVENTIONS.md` §9/§22, prompt §10.1/§10.2. |
| DEC-DB7-008 | The `order` module (`apps/api/src/modules/order/`) hosts **both** AGG-13 Custom Request and AGG-15 Order, i.e. the whole CTX-ORD "Ordering" context. | `DB2_BOUNDED_CONTEXT_MAP.md` explicitly decided "Request: **inside Ordering (CTX-ORD)** as a separate aggregate", while `REPOSITORY_STRUCTURE.md` §7 names the directory `order/`. `REPOSITORY_STRUCTURE.md` outranks the DB-phase documents in `CLAUDE.md` §2, so the directory name is `order/` and it carries two aggregates. |

### Observations (non-blocking, logged)

| ID | Observation | Handling |
|---|---|---|
| OBS-DB7-001 | `DB6_REPRODUCIBILITY_RUNBOOK.md` and `DB6_DB7_DB10_HANDOFF.md` describe the persistent dev database as sitting at migration **29**. It is in fact at **31** (verified read-only: `SELECT count(*) FROM drizzle.__drizzle_migrations` → `31`). | Non-blocking and *safer* than documented — the persistent DB already matches the DB6 closure schema. DB7 does not mutate it either way; every DB7 integration run uses a disposable database. Prompt §15.7's "do not upgrade from migration 29" is satisfied vacuously: DB7 performs no migration against the persistent DB. Corrected in the DB7 completion report rather than by editing closed DB6 documents. |

### Result

CP0 **PASS** — scope deterministic, 78/78 tables classified, zero unowned table, zero
conflicting write owner, transaction architecture decided, no hard blocker.

**Files changed:** `docs/database/DB7_EXECUTION_LOG.md` (new),
`docs/database/DB7_SCOPE_AND_COVERAGE_MATRIX.md` (new),
`docs/database/DB7_REPOSITORY_CONTRACTS.md` (new),
`docs/database/DB7_TX_APP_GUARD_MATRIX.md` (new).

**Tests:** none (documentation checkpoint); preflight evidence above is the executable
evidence.

**Defects found:** OBS-DB7-001 (stale documented migration count). **Corrections:** logged,
not silently applied to closed DB6 documents.

**Commits:** `e16115f` `docs(database): lock DB7 application-persistence scope`.

**Next checkpoint:** DB7-CP1 — Database runtime foundation.

---

## DB7-CP1 — Database runtime foundation

**Starting HEAD:** `e16115f`
**Scope:** NestJS persistence runtime, pool lifecycle, transaction abstraction, health
behavior, dependency boundaries, and the disposable-database integration harness the later
checkpoints need.

### Files changed

New package `packages/persistence` (`@embroidery/persistence`): `database.module.ts`,
`runtime/database.tokens.ts`, `runtime/database-connection.ts`,
`runtime/database-executor.ts`, `transaction/transaction-context.ts`,
`transaction/transaction-manager.ts`, `health/database-health.service.ts`, `index.ts`, plus
package/tsconfig/eslint/jest configuration and two integration suites.

`packages/database`: new `src/errors/driver-error.ts`, new `src/testing/` harness
(`disposable-database.ts`, `verify-schema-baseline.ts`, `workspace-paths.ts`, `index.ts`),
`./testing` subpath export; `src/migrations/run-migrations.ts` and `schema-status.ts` take
an explicit migrations folder; `src/cli/migrate.ts` and `status.ts` resolve it themselves;
`src/client/transaction.ts` `isSqlState` now unwraps the driver error; `src/index.ts`
re-exports.

`apps/api`: `health.module.ts` imports `DatabaseModule`; `health.controller.ts` gains
`GET /api/health/readiness`; `health.controller.spec.ts` becomes an integration suite.
`apps/worker`: `worker.module.ts` imports `DatabaseModule`; the module-boot test moved out
of the lifecycle unit spec into `worker-persistence.integration.spec.ts`.

### Decisions

| ID | Decision | Rationale |
|---|---|---|
| DEC-DB7-009 | Liveness (`GET /api/health`) stays dependency-free; readiness (`GET /api/health/readiness`) reports database state and answers `503` when it is `down`. | A liveness probe that fails on a database outage makes an orchestrator restart a healthy process it cannot help. `degraded` (pool contended but reachable) stays in rotation; only `down` withdraws the instance. |
| DEC-DB7-010 | `TransactionManager.runInTransaction` accepts `() => T \| Promise<T>`. | A guarded read that computes synchronously is still a legitimate transaction; forcing `async` on it produced only ceremony (and a `require-await` lint error). |
| DEC-DB7-011 | The API and worker each own a pool rather than sharing configuration. | They are deployed and scaled independently, so shared pool *sizing* would be wrong even though the runtime code is shared. |

### Defects found and corrected

| ID | Defect | Correction |
|---|---|---|
| DEF-DB7-001 | `@embroidery/database` resolved `MIGRATIONS_FOLDER` from `import.meta.url`, making the module ESM-only. The CommonJS NestJS applications and every ts-jest suite failed to compile it (`TS1343`), so **the DB6 package could not be consumed by the applications it exists to serve**. | The migrations folder is now an explicit parameter, with `migrationsFolderFrom(packageJsonPath)` doing the path arithmetic; the two ESM CLIs resolve it from `import.meta.url` themselves. No migration file touched; checksum checker re-run and PASS. |
| DEF-DB7-002 | Drizzle wraps a `pg` error in its own error and attaches the original as `cause`. Reading `error.code` therefore found nothing, so **every SQLSTATE would have classified as an unknown failure** — including in `isSqlState`, which DB6 shipped. Found by the CP1 health tests, which asserted a connection failure and got `query_failed`. | New framework-free `extractDriverError`/`driverErrorCode` unwrap the cause chain (depth-limited) and read only `code`, `constraint` and `table` — never `detail`, `where` or row values. `isSqlState` and the health classifier both use it. This is the foundation the CP2 error mapper is built on. |
| DEF-DB7-003 | The health check could not distinguish an unreachable server from a wrong password or a missing database. | Separated into `connection_failed` (libpq errno), `configuration_failed` (SQLSTATE `28xxx`/`3D000`) and `query_failed`, each covered by a test. |
| DEF-DB7-004 | `pnpm format:check` already failed at `d18589a` on 25 files committed without the formatter, so the CP7 static gate could never have passed. | Whitespace-only sweep in its own commit (`e25e94c`) to keep the DB7 implementation commits reviewable. Also added `packages/database/migrations/meta/` to `.prettierignore`: Prettier had reformatted drizzle-generated snapshots, rewriting bytes drizzle treats as migration identity (`CLAUDE.md` §5). |

### Tests

29 integration tests against a real disposable PostgreSQL (`embroidery_db7_cp1_runtime`,
`embroidery_db7_cp1_transaction`, `embroidery_db7_cp1_shutdown`), plus the API readiness
suite and the worker bootstrap suite.

| Area | Cases |
|---|---|
| Module wiring | exported providers; exactly one connection per instance |
| Connect and query | pooled query; the 78-table DB6 schema is present |
| Connection release | pool returns to fully-idle after 8 concurrent queries; survives 12 consecutive rollbacks without leaking a client |
| Health | `up` with pool stats; no URL/credential anywhere in the payload; `connection_failed`; `configuration_failed` |
| Startup validation | fails fast; redacts the credential; closes the partially-created pool |
| Shutdown | closes once, tolerates a second close, refuses to hand out a closed handle |
| Commit/rollback | commits all writes; rolls back all writes on a thrown error; rolls back on a constraint violation; returns the callback result |
| Executor resolution | transaction handle inside, pool outside; `requireTransaction` rejects an unwrapped multi-table command |
| Nested | joins by default; never opens a second independent transaction; savepoint isolates an inner failure; isolation-level and access-mode changes rejected |
| Options | read-only refuses the write; explicit isolation level observed |
| Async isolation | no leak into a concurrent task; two concurrent transactions commit/roll back independently |
| API/worker | readiness returns 200 and leaks no credential; worker boots its own pool and opens a transaction |

### Metrics

| Metric | Value |
|---|---|
| New integration tests | 29 (+3 API readiness, +3 worker bootstrap) |
| Whole-workspace suite | 169 tests, 15/15 turbo tasks green |
| Disposable databases left after the run | 0 (verified via `pg_database`) |
| Persistent dev database | untouched; not inspected during CP1 |

### Validation

`pnpm format:check` PASS · `pnpm lint` 15/15 PASS · `pnpm typecheck` 15/15 PASS ·
`pnpm test` 8/8 PASS · `pnpm check:file-size` PASS (only the pre-existing
`tools/db-metric-check.mjs` above the review threshold) ·
`node tools/db-migration-checksum-check.mjs` PASS.

### Result

CP1 **PASS**.

**Commits:** `e25e94c` `style(database): apply prettier to the DB6 checker scripts`;
`b521e87` `feat(database): add the NestJS persistence foundation`.

**Next checkpoint:** DB7-CP2 — Transaction, error mapping and test harness.

---

## DB7-CP2 — Transaction, error mapping and integration-test harness

**Starting HEAD:** `f90ad55`
**Scope:** central database-error mapping into a client-safe taxonomy, the named-constraint
catalogue, and the reusable disposable-PostgreSQL integration harness the repository
checkpoints build on. The `TransactionManager` API itself landed in CP1 (§9.1–9.2 of the
prompt); this checkpoint adds its error behaviour and the harness.

### Files changed

`packages/database/src/errors/`: `persistence-error.ts`, `constraint-catalog.ts`,
`map-database-error.ts`, `map-database-error.spec.ts`,
`error-mapping.integration.spec.ts`.
`packages/database/src/testing/`: `reset-database.ts`, `harness.integration.spec.ts`.
`packages/database/src/client/transaction.ts`: added `INTEGRITY_CONSTRAINT_VIOLATION`,
`READ_ONLY_SQL_TRANSACTION`, `QUERY_CANCELED`.
`packages/database/src/index.ts`, `src/testing/index.ts`: re-exports.
`packages/database/jest.config.mjs`: integration timeout.
`docs/database/DB7_ERROR_MAPPING_CATALOG.md` (new).

### Decisions

| ID | Decision | Rationale |
|---|---|---|
| DEC-DB7-012 | `55P03` (lock not available) is **not** marked retryable, although a retry could succeed. | The lock holder may hold it for a long time, so an immediate automatic retry spins. Retry-with-backoff is a caller policy; the concurrent behaviour is DB8's. |
| DEC-DB7-013 | `PersistenceError.diagnostics` is a **non-enumerable** property. | Making leak-safety structural rather than conventional: `JSON.stringify(error)` and `{...error}` physically cannot copy a SQLSTATE or constraint name into a response body. Asserted by test, not assumed. |
| DEC-DB7-014 | Four arbiters are classified `replayable` (idempotency claim, provider event, notification intent, job attempt). | A duplicate on these is the *expected* success signal of an idempotent retry. Classifying them as plain conflicts would turn a correct retry into a 500. |
| DEC-DB7-015 | The 189 CHECK constraints are covered by a family rule, not enumerated. | A CHECK rejection always means "this value is not allowed for this record"; 189 near-identical entries would produce no distinct client-visible outcome. Every *uniqueness* arbiter with a distinct business meaning **is** enumerated (50 of them). |
| DEC-DB7-016 | Test isolation uses `TRUNCATE`, not `DELETE`. | The 30 S24 triggers are row-level `BEFORE UPDATE OR DELETE` guards and would correctly reject a `DELETE` on every append-only table. `TRUNCATE` does not fire row-level triggers, so a suite resets state without disarming the guards it is testing. Migration history is preserved. |

### Defects found and corrected

| ID | Defect | Correction |
|---|---|---|
| DEF-DB7-005 | DB6's `SQLSTATE` constant documented `RESTRICT_VIOLATION: '23001'` as "raised by the immutability triggers". Migration `0030`'s function body and `DB6_S24_TRIGGER_REPORT.md` §"Error contract" both specify `ERRCODE = '23000'`. Every S24 trigger rejection would therefore have been misclassified. | Added `INTEGRITY_CONSTRAINT_VIOLATION: '23000'` with the discrepancy documented in place; `23001` retained with its correct `restrict_violation` meaning. An integration test provokes a real trigger rejection on both UPDATE and DELETE and asserts `23000` arrives. No migration touched. |
| DEF-DB7-006 | The CP2 read-only-transaction test initially passed a write through the *pool* handle inside a read-only transaction, where it silently succeeded rather than failing. | The probe now issues the statement on the transaction handle. Worth recording because it is precisely the mistake DEC-DB7-006's ambient executor removes for repository code, which never has two handles to choose between. |

### Tests

| Suite | Cases | Coverage |
|---|---|---|
| `map-database-error.spec.ts` | 31 | catalogue lookup incl. replayable arbiters and fallback; 16 SQLSTATE families; unrecognised SQLSTATE and non-driver error; Drizzle cause unwrapping; idempotent re-mapping; four leak-safety assertions (message, serialisation, log line, `cause` preservation); `withMappedErrors` |
| `error-mapping.integration.spec.ts` | 12 | real `23505`/`23503`/`23514`/`23502`; **real S24 trigger `23000` on UPDATE and DELETE**; real `25006`; real `57014`; live-schema catalogue integrity (every catalogued name exists in `pg_constraint`/`pg_indexes`); replay-arbiter coverage; leak safety on a real duplicate |
| `harness.integration.spec.ts` | 8 | deterministic injection-safe naming, identifier-length clamp, worker separation; **all six DB6 checkers + fingerprint gate reproduce `4ca56a59…`**; 31 migrations applied; reset leaves the 30 triggers armed and the migration history intact; idempotent drop verified from a second connection |

### Metrics

| Metric | Value |
|---|---|
| New tests | 51 (43 error mapping, 8 harness) |
| `@embroidery/database` suite | 151 tests |
| Whole-workspace suite | 220 tests, 15/15 turbo tasks green |
| Named arbiters catalogued | 50 of 63 uniqueness arbiters; the remainder use the family rule |
| Disposable databases left after the run | 0 (verified via `pg_database`) |
| Persistent dev database | untouched |

### Validation

`pnpm format:check` PASS · `pnpm lint` 15/15 PASS · `pnpm typecheck` 15/15 PASS ·
`pnpm test` 8/8 PASS · `pnpm check:file-size` PASS.

### Result

CP2 **PASS**.

**Commits:** `f12d5fb` `feat(database): add transaction error mapping and the integration harness`.

**Next checkpoint:** DB7-CP3 — Persistence coverage wave A.
