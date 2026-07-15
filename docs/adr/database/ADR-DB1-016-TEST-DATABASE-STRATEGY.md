# ADR-DB1-016 — Test Database Strategy Direction

- Status: Accepted
- Date: 2026-07-15
- Git HEAD: `563d9863c5d9591095038a28887e217058d816e4`
- Decision IDs: DEC-20
- Requirement IDs: REQ-OPS-012, REQ-INV-005 (test surface), REQ-PAY-005
  (test surface)
- Invariant IDs: INV-07, INV-16, INV-18, INV-19, INV-28, INV-29
- Gap IDs: —

## Context

DB7 (constraint/migration tests) and DB8 (transaction/concurrency tests)
need a locked database strategy. The testing *stack* (runner/framework)
remains open (O-001) — this ADR locks the database side only, which is
framework-agnostic.

## Decision Drivers

- The invariants under test are PostgreSQL behaviors: check constraints,
  partial unique indexes, row locking, isolation, idempotency races,
  reservation concurrency. **No substitute engine can prove them.**
- Parallel test workers must not corrupt each other.
- CI must run the identical engine as dev (ADR-DB1-001).

## Options Considered

- In-memory/SQLite/pg-mem substitutes — cannot express partial unique
  indexes/locking semantics faithfully; **prohibited** for anything
  DB-behavior-related.
- Single shared test DB with truncation — serializes workers or bleeds
  state; rejected as the default.
- **Real PostgreSQL in Docker, template-database-per-worker** — chosen.

## Decision

1. **Real PostgreSQL only** — the pinned image from ADR-DB1-001, run via
   Docker locally and in CI. Fake/in-memory databases are prohibited for
   repository, constraint, migration, transaction, and concurrency tests.
   (Pure domain unit tests need no database at all — unaffected.)
2. **Migrations run before tests:** the test database is built by running
   the full ordered migration set (this doubles as a continuous
   fresh-install test, INV-28). Schema shortcuts (`CREATE TABLE` in test
   setup) are prohibited for application tables.
3. **Isolation model — database-per-worker via template:**
   - One migration pass creates `embroidery_test_template`.
   - Each parallel worker gets its own database created from the template
     (`CREATE DATABASE embroidery_test_<n> TEMPLATE embroidery_test_template`)
     — cheap, fully isolated, engine-native.
4. **Reset model — two sanctioned modes:**
   - **Transaction-rollback per test** (default for repository/constraint
     tests): open a transaction, run, roll back.
   - **Truncate/reset between tests** for tests that must commit —
     concurrency/race tests use multiple real connections and committed
     state (INV-07/16/19, reservation races), where rollback isolation is
     impossible by definition.
   The mode is chosen per suite, explicitly.
5. **Concurrency test requirement (DB8):** genuine parallel connections
   against one worker database, exercising `FOR UPDATE`, unique-violation
   races, duplicate/out-of-order callbacks. Never simulated with mocks.
6. **Fixtures:** per-test factories/builders with deterministic IDs
   (ADR-DB1-015 tier 3); no global shared fixture dump.
7. **CI parity:** same pinned image, same migration path, same commands as
   local (PR-05 spirit); test runs never touch the dev volume — tests use a
   separate PostgreSQL instance/container or at minimum separate databases,
   decided at DB7 wiring.
8. **Destructive safety guard:** all test tooling refuses to run unless the
   target database name matches `embroidery_test*` — dropping/truncating
   anything else must be impossible from the test path.
9. **Naming:** `embroidery_test_template`, `embroidery_test_<worker>`
   (ADR-DB1-006).

## Consequences

## Positive Consequences

- DB7/DB8 prove real engine behavior — the exact class of invariants this
  platform's money/approval safety rests on.
- Fresh-install migration correctness is exercised on every test run.

## Negative Consequences

- Docker is required to run DB-touching tests (already true of the dev
  stack); template creation adds seconds to suite startup.

## Risks and Mitigations

- **Risk:** slow suites push devs to skip DB tests.
  **Mitigation:** template-per-worker keeps per-test cost near zero;
  domain-only tests stay DB-free.

## Rejected Alternatives

- pg-mem/SQLite substitutes (cannot prove PG semantics); one shared DB
  (parallel corruption); schema-per-worker in one DB (possible, but
  database-per-worker is simpler with template cloning and matches
  single-schema layout from ADR-DB1-005).

## Deferred Details

- Test runner/framework selection (O-001) → separate testing-stack ADR
  (outside DB scope); harness code → DB7/DB8.

## Implementation Checkpoint

DB7 (harness), DB8 (concurrency suites).

## Verification Checkpoint

DB7/DB8 themselves + DB10 (CI parity audit).

## Reversal / Migration Cost

Low — strategy maps directly onto any Node test framework.

## References

- PostgreSQL template databases — https://www.postgresql.org/docs/16/manage-ag-templatedbs.html
- `docs/development/BACKEND_CONVENTIONS.md` §19; ADR-DB1-001, ADR-DB1-005,
  ADR-DB1-006, ADR-DB1-015
