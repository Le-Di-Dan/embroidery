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

**Commits:** recorded below once made.

**Next checkpoint:** DB7-CP1 — Database runtime foundation.
