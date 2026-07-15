# ADR-DB1-002 — ORM / Query Layer

- Status: Accepted (evidence refreshed by DB1-C1 correction, 2026-07-15 —
  exclusivity claim removed, comparison re-run on current official docs,
  package-pin policy added; see
  [`DB1_CORRECTION_REPORT.md`](../../database/DB1_CORRECTION_REPORT.md))
- Date: 2026-07-15
- Git HEAD: `563d9863c5d9591095038a28887e217058d816e4` (amended at `a0e29b4`+)
- Decision IDs: DEC-01
- Requirement IDs: REQ-OPS-001, REQ-INT-001, REQ-INT-002, REQ-INT-004,
  REQ-INT-005, REQ-INV-005, REQ-DVER-003, REQ-PAY-005, REQ-SESS-003,
  REQ-OUTBOX-001, REQ-IDEM-001
- Invariant IDs: INV-01, INV-07, INV-11, INV-16, INV-18, INV-19, INV-23,
  INV-24, INV-25
- Gap IDs: —

## Context

`BACKEND_CONVENTIONS §9` leaves the ORM open (O-001/DEC-01). The backend is a
NestJS modular monolith where domain code must not import an ORM, repositories
are module-owned adapters, and transactions are explicit. The database must
express PostgreSQL-specific structures that carry business invariants:
partial unique index for the single active review version (INV-16), row
locking for inventory (LC-17), check constraints for stock/status (INV-18,
DEC-05), JSONB design documents (REQ-SESS-003), exact-decimal money (INV-11),
and idempotency/outbox uniqueness (INV-19/23/24). Team: 1–3 developers,
Claude-assisted, multi-machine.

## Decision Drivers

- PostgreSQL capability without leaving the tool (constraints, locking,
  isolation, JSONB, numeric, partial unique indexes, multiple schemas).
- Migration story compatible with immutable shared SQL migrations
  (ADR-DB1-003): plain reviewable SQL, hand-authorable.
- Fit with the mandated repository/port architecture: no hidden unit-of-work
  magic, ORM types confinable to `infrastructure/persistence`.
- Debuggability of generated SQL; compile-time safety; small-team onboarding.
- Sanctioned raw-SQL escape hatch that stays inside module boundaries.

## Options Considered

1. **Prisma** — schema DSL + generated client + Prisma Migrate.
2. **Drizzle ORM + drizzle-kit** — TypeScript schema-as-code, SQL-oriented
   query builder, SQL migration generation.
3. **MikroORM** — data-mapper ORM with Unit of Work/identity map, Migrations
   package.
4. **TypeORM** — decorator-based ORM with migration CLI.
5. Kysely (type-safe query builder only) and raw SQL boundary — considered as
   supplements, not primaries.

### Evaluation highlights (re-run against current official docs, evidence date 2026-07-15)

All four candidates can express the load-bearing PostgreSQL structures in
some supported way — **no candidate is excluded on raw capability**. The
comparison is therefore about *how* each expresses them (stable vs preview,
declarative vs raw-expression escape), and about runtime/migration model fit.

| Criterion | Prisma | Drizzle | MikroORM | TypeORM |
| --- | --- | --- | --- | --- |
| Partial (unique) index in schema source | **Yes** — `where` on `@unique`/`@@unique`/`@@index`, raw or type-safe form, **behind the `partialIndexes` Preview feature** (official indexes docs) | **Yes, stable** — `uniqueIndex().where(sql...)` (official docs) | Yes — via custom index `expression` (raw `CREATE INDEX` SQL callback, official docs) | Yes — `@Index(..., { where: '...' })`, PostgreSQL-only (official indices docs) |
| Check constraints in schema source | Not in the DSL; official workflow = customize generated migration SQL for unsupported features | **Yes, stable** — `check(name, sql...)` (official docs) | **Yes** — `@Check({ expression })` (official docs; "currently supported only in postgres driver") | **Yes** — `@Check` entity decorator (official decorator reference) |
| Row locking | Raw SQL (no dedicated query API) | `.for('update')` in the pg query builder; historically under-documented (#2875); `noWait` bug #3554 **closed** via PR #3555 → still spike-verified at DB6, raw-SQL fallback sanctioned | Yes (LockMode API) | Pessimistic lock modes on QueryBuilder/find options |
| Explicit isolation level / savepoints | Interactive tx with isolation; no savepoint API | **Yes** — isolationLevel option; nested tx = savepoints (official docs) | Yes (UoW-managed) | Isolation on transaction; savepoints not first-class |
| Migration files | SQL, checksummed history, strong drift detection/`migrate diff` — best-in-class tooling | SQL, timestamped folders, `--custom` blank migrations, snapshot journal (weaker drift tooling → bespoke verify command, ADR-DB1-004) | SQL/TS via generator (snapshot-based) | Generated TS/SQL; docs themselves note index-sync limitations (`synchronize: false` escape for unsupported index options) |
| Reliance on Preview/unstable features for critical constraints | **Yes** — partial indexes are Preview; production risk until GA | **No** — needed features are stable API | No (but raw-SQL expressions for partial indexes bypass the schema model) | No (but PG-only `where`, sync caveats) |
| Runtime model / hidden magic | Generated client + engine layer | Thin SQL builder, no hidden state | Unit of Work + identity map (implicit flush semantics) | Data-mapper/Active-Record mix; weakest compile-time typing of the four |
| Fit with "repositories own persistence, domain never sees ORM" | OK | **Good** (plain functions/objects, easy to confine) | UoW encourages entity-centric flow across boundaries | OK but weak typing |
| SQL debugging / review of what runs | Generated by engine | SQL-shaped code, near-1:1 | UoW batching obscures write timing | QueryBuilder readable; metadata layer less so |
| 1–3 dev onboarding / Claude generation reliability | Good docs; two-language surface (DSL + TS) | Single-language TS; SQL-shaped output easy to review | Larger concept surface | Long-lived API with many legacy patterns in circulation |
| Maturity / upgrade risk | High maturity; Preview-feature churn | Pre-1.0 minor churn → strict exact pinning required | Mature, active | Mature, slower feature velocity |

## Decision

- **Primary persistence tool: Drizzle ORM (PostgreSQL dialect).**
- **Migration tool: drizzle-kit** (details and lifecycle in ADR-DB1-003).
- **Raw SQL is allowed** through Drizzle's `sql` template (or the underlying
  driver in exceptional cases), only inside a module's
  `infrastructure/persistence` adapters, for: locking clauses the builder
  cannot express reliably, advisory locks if ever needed, complex admin read
  composition, and data migrations. Raw SQL follows the same module-ownership
  rules (ADR-DB1-009).
- **Repository abstraction:** domain/application layers define
  domain-oriented repository interfaces; Drizzle usage (schema objects, query
  builder, `sql`) is confined to infrastructure adapters. No Drizzle type may
  appear in domain, application, controller, or DTO code.
- **Transaction API expectation:** an application-owned transaction port
  wraps `db.transaction()` (with isolation options and savepoint support);
  use cases own boundaries (ADR-DB1-009).

### Selection rationale (corrected — DB1-C1)

Drizzle is **not** the only candidate able to express partial unique indexes
and CHECK constraints — Prisma (Preview `where` argument), TypeORM
(`@Index({ where })` + `@Check`) and MikroORM (`@Check` + raw index
expressions) all can, per current official docs. Drizzle is selected because
it is the best *overall* fit for this codebase's constraints:

- **SQL-like explicit model** with no Unit-of-Work/Active-Record magic —
  matches the explicit-transaction, repository-adapter conventions.
- **Native, stable (non-Preview) declaration** of the required PostgreSQL
  structures (partial unique indexes, CHECK constraints) inside the schema
  source of truth — Prisma's equivalent is Preview-gated (production risk for
  load-bearing constraints), MikroORM's partial indexes drop to raw
  `CREATE INDEX` strings, TypeORM documents its own index-sync limitations.
- **Reviewable plain-SQL migrations** with first-class hand-authored
  (`--custom`) migrations (ADR-DB1-003).
- **Raw SQL escape hatch** in the same tool, keeping module boundaries.
- No dependence on Preview features for anything invariant-bearing.

Trade-off accepted: Prisma's migrate tooling (drift detection) is stronger;
we compensate with the bespoke verification command (ADR-DB1-004).

### Mapping to the critical structures

- Single-active-review partial unique index (INV-16): native
  `uniqueIndex(...).where(...)`.
- Inventory row locking (LC-17): `.for('update')` — DB6 spike-gated (below);
  sanctioned raw SQL if the builder output is defective.
- Immutable snapshot constraints (INV-01/02/12): check constraints + triggers
  authored in migrations (`--custom`), per ADR-DB1-010.
- Idempotency uniqueness (INV-19/24): unique/composite unique — native.
- JSONB design document: native `jsonb` column type.
- Exact money (INV-11): native `numeric` (returned as string — no float).
- Outbox claim/update (INV-23): `FOR UPDATE SKIP LOCKED` pattern — builder
  exposes `skipLocked`; raw SQL fallback sanctioned.

### Row-locking risk posture (honest status)

- Drizzle has an API for `SELECT ... FOR UPDATE`; its documentation has
  historically lagged the implementation (#2875). The `noWait` SQL bug
  (#3554) is **closed** (fix PR #3555); the release containing the fix is
  not stated in the issue.
- **Advanced lock options are not treated as verified by type signature.**
  The mandatory DB6 spike, on the exact pinned versions, must assert
  generated SQL and observed behavior for: plain `FOR UPDATE`; `NOWAIT`;
  `SKIP LOCKED` (if used by the outbox relay); lock behavior inside a
  transaction; a concurrent inventory-reservation scenario.
- If any part of the spike fails, that lock pattern is implemented via a
  **documented raw-SQL adapter** in the owning module — sanctioned, not a
  workaround.

### Package pin policy (added by DB1-C1)

- DB1 selects the **technology family only**; nothing is installed at DB1.
- DB6 pins **exact, verified-compatible versions** of `drizzle-orm`,
  `drizzle-kit`, and the PostgreSQL driver. Compatibility across their
  versions is **never assumed** — the DB6 compatibility spike (schema
  aggregation, migration generation, history-table behavior, locking SQL)
  runs on the exact pinned set **before** the production schema foundation
  is built on it.
- The pnpm lockfile is part of multi-machine reproducibility; every upgrade
  of these packages is a reviewed change re-running the spike-level checks
  (CI migration + DB7/DB8 suites once they exist).

## Detailed Rules

1. No other ORM/query layer may be introduced without a superseding ADR.
2. Kysely-style ad hoc builders are not added; Drizzle's `sql` covers the
   escape-hatch need.
3. Drizzle schema definitions are module-owned source files (layout locked in
   ADR-DB1-003/DB6); generated SQL migrations are the deploy artifact.
4. Nothing is installed at DB1; first dependency lands at DB6 with a spike
   report covering: `.for('update')`/`skipLocked` SQL output, migration
   history table behavior, and multi-file schema aggregation.

## Consequences

## Positive Consequences

- PG-specific invariant machinery lives in the schema source of truth, not in
  divergent hand-edits.
- Thin, inspectable SQL keeps review and Claude-assisted generation reliable.
- Forward-only, plain-SQL migrations align with ADR-DB1-003.

## Negative Consequences

- Fewer batteries than Prisma (no built-in drift `diagnose`, weaker studio
  tooling); DB6 must implement a verification command (ADR-DB1-004).
- Some capabilities (row locking options) are under-documented upstream and
  need spike evidence before reliance.

## Risks and Mitigations

- **Risk:** drizzle-kit generation bugs for exotic DDL.
  **Mitigation:** `--custom` hand-authored SQL migrations are first-class in
  our policy; generated SQL is always human-reviewed (ADR-DB1-003).
- **Risk:** ecosystem churn (pre-1.0 minor releases).
  **Mitigation:** exact-version pinning in lockfile; upgrades are deliberate
  commits with migration-tool regression check in CI (DB7).

## Rejected Alternatives (evidence refreshed 2026-07-15)

- **Prisma:** current official docs *do* support partial (unique) indexes via
  the `where` argument on `@unique`/`@@unique`/`@@index` — but behind the
  `partialIndexes` **Preview feature**, and CHECK constraints still go
  through the documented customize-generated-migration workflow rather than
  the DSL. Relying on a Preview feature for the invariant-bearing
  single-active-review index, plus hand-edited SQL for CHECKs, is a
  production risk and dilutes DSL-as-truth. Strong migrate tooling
  acknowledged but not decisive. (The earlier citation of prisma/prisma#6974
  as proof the feature "does not exist" is retained only as **historical**
  evidence — the feature/status has since changed.)
- **MikroORM:** check constraints are native (`@Check`, postgres driver) and
  partial indexes are expressible via raw `CREATE INDEX` expression
  callbacks — capability confirmed. Rejected on fit: Unit of Work/identity-
  map implicit flush is hidden runtime state the conventions explicitly
  avoid, partial-index DDL drops out of the declarative schema model into
  raw strings, and the concept surface is large for a 1–3 dev team.
- **TypeORM:** partial indexes (`@Index` with `where`, PostgreSQL-only) and
  `@Check` are documented — capability confirmed. Rejected on concrete
  grounds, not a label: TypeORM's own docs state some index options cannot
  be represented/synchronized (mitigated only by `synchronize: false`
  opt-outs), its compile-time typing is the weakest of the four evaluated,
  and its migration diffing is less reviewable than plain-SQL-first flows —
  all friction exactly where this project needs precision (constraint-heavy,
  migration-reviewed schema).
- **Kysely/raw-SQL-only:** maximum control but no schema→migration
  generation and more hand-written mapping; rejected as primary, its role is
  covered by the sanctioned `sql` escape hatch.

## Deferred Details

- Exact package versions, driver (`pg` vs `postgres.js`), and NestJS wiring →
  DB6 (implementation), with spike evidence.
- Testing-stack selection remains open (O-001) — not part of this ADR.

## Implementation Checkpoint

DB6 (install, spike report, first migrations).

## Verification Checkpoint

DB7 (constraints/migrations), DB8 (locking, isolation, idempotency races).

## Reversal / Migration Cost

Medium: schema truth is plain SQL migrations, so replacing Drizzle later
means rewriting repository adapters, not the database. Confinement to
`infrastructure/persistence` caps the blast radius.

## References (evidence dates noted; all official pages re-checked 2026-07-15)

- Drizzle indexes & constraints (partial unique index `.where()`, check,
  named FK) — https://orm.drizzle.team/docs/indexes-constraints
- Drizzle transactions (isolation levels, savepoints/nested) —
  https://orm.drizzle.team/docs/transactions
- drizzle-kit generate (SQL output, `--custom`, timestamped ordering) —
  https://orm.drizzle.team/docs/drizzle-kit-generate
- Drizzle `SELECT FOR UPDATE` documentation-gap issue (documented risk, not
  capability evidence) — https://github.com/drizzle-team/drizzle-orm/issues/2875 ;
  `noWait` SQL bug, **closed** via PR #3555 —
  https://github.com/drizzle-team/drizzle-orm/issues/3554
- Prisma indexes (partial indexes via `where` on `@unique`/`@@unique`/`@@index`,
  `partialIndexes` **Preview** feature; PostgreSQL supported) —
  https://www.prisma.io/docs/orm/prisma-schema/data-model/indexes
- Prisma customizing migrations for unsupported database features —
  https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations
- Historical only (feature/status has since changed — do not cite as current):
  https://github.com/prisma/prisma/issues/6974
- TypeORM indices (partial `where` — PostgreSQL-only; `synchronize: false`;
  unsupported index options note) — https://typeorm.io/docs/advanced-topics/indices/
  (see also https://typeorm.io/docs/indexes/ )
- TypeORM `@Check` decorator — https://typeorm.io/docs/help/decorator-reference/
- MikroORM `@Check` constraints and custom index expressions —
  https://mikro-orm.io/docs/defining-entities
- `docs/development/BACKEND_CONVENTIONS.md` §2, §9, §10, §11
- `docs/database/DB1_CORRECTION_REPORT.md` (DB1-C1 amendment record)
