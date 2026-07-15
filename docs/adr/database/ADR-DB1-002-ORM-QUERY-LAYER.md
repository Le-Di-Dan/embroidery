# ADR-DB1-002 — ORM / Query Layer

- Status: Accepted
- Date: 2026-07-15
- Git HEAD: `563d9863c5d9591095038a28887e217058d816e4`
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

### Evaluation highlights

| Criterion | Prisma | Drizzle | MikroORM | TypeORM |
| --- | --- | --- | --- | --- |
| Partial unique index in schema source | No (DSL cannot express; requires hand-edited SQL that diverges from the DSL — prisma/prisma#6974) | **Yes** (`uniqueIndex().where(sql...)`, official docs) | Partial (`@Index({ expression })` raw SQL string) | Partial (raw expression) |
| Check constraints in schema source | No (hand-edited migration only) | **Yes** (`check(name, sql...)`) | Yes (`@Check`) | Yes (`@Check`) |
| Row locking | Raw SQL only (no query API) | `.for('update')` exists in the pg query builder but is under-documented (drizzle-orm #2875; noWait bug #3554) → must be spike-verified at DB6; raw SQL fallback sanctioned | Yes (LockMode) | Partial |
| Explicit isolation level / savepoints | Interactive tx with isolation; no savepoint API | **Yes** (isolationLevel option; nested tx = savepoints, official docs) | Yes | Partial |
| Migration files | SQL, checksummed history, strong drift detection | **SQL**, timestamped folders, `--custom` blank migrations, snapshot journal | SQL/TS via generator | TS/SQL, weak diffing |
| Schema source of truth stays honest when using PG-specific features | Degrades (DSL ≠ DB once SQL is hand-edited) | **Holds** (features expressible in schema code) | Holds mostly | Weak |
| Runtime model | Generated client, own engine layer | Thin SQL builder, no hidden state | Unit of Work + identity map (implicit flush semantics) | Active-record-ish patterns, known soundness issues |
| Fit with "repositories own persistence, domain never sees ORM" | OK | **Good** (plain functions/objects, easy to confine) | UoW encourages entity-centric flow across boundaries | OK but weak typing |
| 1–3 dev onboarding / Claude generation reliability | Good docs; two-language surface (DSL + TS) | Single-language TS; SQL-shaped output easy to review | Larger concept surface | Aging docs, many pitfalls |

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

### Proof against the critical structures

- Single-active-review partial unique index (INV-16): native
  `uniqueIndex(...).where(...)`.
- Inventory row locking (LC-17): `.for('update')` — verified by mandatory DB6
  spike; sanctioned raw SQL if the builder output is defective.
- Immutable snapshot constraints (INV-01/02/12): check constraints + triggers
  authored in migrations (`--custom`), per ADR-DB1-010.
- Idempotency uniqueness (INV-19/24): unique/composite unique — native.
- JSONB design document: native `jsonb` column type.
- Exact money (INV-11): native `numeric` (returned as string — no float).
- Outbox claim/update (INV-23): `FOR UPDATE SKIP LOCKED` pattern — builder
  supports `skipLocked`; raw SQL fallback sanctioned.

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

## Rejected Alternatives

- **Prisma:** partial unique indexes and check constraints — load-bearing for
  INV-16/18 — are not expressible in the schema DSL; the required hand-edited
  SQL breaks the DSL-as-truth model, and locking needs raw SQL anyway. Strong
  migrate tooling acknowledged but not decisive.
- **MikroORM:** capable, but Unit of Work/identity-map implicit flush is
  hidden runtime magic the conventions explicitly avoid; larger surface for a
  1–3 dev team.
- **TypeORM:** long-standing correctness/maintenance concerns, weakest
  compile-time safety of the four; no advantage over the others here.
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

## References

- Drizzle indexes & constraints (partial unique index, check, named FK) —
  https://orm.drizzle.team/docs/indexes-constraints
- Drizzle transactions (isolation levels, savepoints/nested) —
  https://orm.drizzle.team/docs/transactions
- drizzle-kit generate (SQL output, `--custom`, timestamped ordering) —
  https://orm.drizzle.team/docs/drizzle-kit-generate
- Drizzle `SELECT FOR UPDATE` documentation gap — 
  https://github.com/drizzle-team/drizzle-orm/issues/2875 ; noWait bug —
  https://github.com/drizzle-team/drizzle-orm/issues/3554
- Prisma partial/expression index limitation —
  https://github.com/prisma/prisma/issues/6974
- `docs/development/BACKEND_CONVENTIONS.md` §2, §9, §10, §11
