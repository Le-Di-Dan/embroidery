# ADR-DB1-003 — Migration Framework, Lifecycle and Forward-Fix Policy

- Status: Accepted
- Date: 2026-07-15
- Git HEAD: `563d9863c5d9591095038a28887e217058d816e4`
- Decision IDs: DEC-02, DEC-18
- Requirement IDs: REQ-OPS-001, REQ-OPS-005, REQ-OPS-006, REQ-OPS-007,
  REQ-OPS-008
- Invariant IDs: INV-26, INV-27, INV-28, INV-29, INV-30, INV-31
- Gap IDs: —

## Context

No migration framework, migration file, or history table exists. DB0 locked
the requirements: versioned migrations in Git, immutable shared migrations,
fresh-install and upgrade workflows, failed-migration policy, and a
rollback-vs-forward-fix decision (SV-01..SV-09). ADR-DB1-002 selects Drizzle
ORM; drizzle-kit is its native migration generator producing plain SQL.

## Decision Drivers

- Multi-machine reproducibility: Git-ordered SQL files are the only schema
  source (PR-01, SV-01).
- Reviewability: migrations must be human-reviewable SQL, hand-editable
  before first share.
- Immutability of shared history (INV-26/27) with detectable drift.
- PostgreSQL transactional DDL enables safe single-migration atomicity.
- A 1–3 developer team needs one simple, single-command path.

## Options Considered

1. **drizzle-kit** (generate SQL from schema diff + `--custom` hand-authored
   SQL) — native pair to the chosen ORM.
2. Standalone migration runner (node-pg-migrate, graphile-migrate, Flyway) on
   top of Drizzle — second tool, second history model, drift between schema
   code and migration source.
3. Prisma Migrate standalone — rejected with Prisma in ADR-DB1-002.

## Decision

**drizzle-kit is the migration framework.** Migration creation is
**generated-then-reviewed**: drizzle-kit diffs the TypeScript schema and
emits SQL; a human reviews/edits before commit; hand-authored (`--custom`)
SQL migrations are first-class for data migrations, triggers, and anything
the generator cannot express.

### Migration source of truth and layout

- Module-owned Drizzle schema definitions live in each module's
  `infrastructure/persistence/` per `REPOSITORY_STRUCTURE`; the API
  application owns the aggregated drizzle-kit config and the single ordered
  migrations directory (target: `apps/api/database/migrations/`; exact path
  confirmed at DB6 within the API app boundary). The worker never owns
  migrations; it consumes persistence through approved services/packages.
- One global, linear migration history for the whole database (single
  PostgreSQL schema per ADR-DB1-005 keeps ordering trivial).
- Naming: drizzle-kit's timestamped prefix + mandatory descriptive slug
  (`<timestamp>_<verb>_<object>`); the timestamp defines order.
- Review process: every migration is reviewed as SQL in the PR; generated and
  custom migrations are held to the same review bar.
- The migration history table is owned by the migration tool (details and
  traceability rules in ADR-DB1-004).
- **No manual schema change outside migrations, ever** (INV-31). Emergency
  manual actions must be captured retroactively as a migration + audit note.

### Shared-migration immutability (locked)

- A migration that has been merged to a shared branch (or applied on any
  machine other than its author's) is **immutable**: never edited, renamed,
  reordered, or deleted — including "cosmetic" edits.
- Any change ships as a **new migration**.
- Checksum/drift mismatch (tool hash vs file) must **fail loudly**; no
  automatic history "repair". Reconciliation is an explicit operator action
  recorded per the failed-migration procedure below.
- Unshared, unmerged feature-branch migrations may be deleted/regenerated
  freely before merge (see rollback matrix).

### Creation rules by change type

- **Data migrations:** hand-authored `--custom` SQL; idempotent where
  feasible; never mixed into the same migration as unrelated DDL.
- **Destructive migrations** (drop table/column, narrowing types, deleting
  rows): require a verified backup immediately before applying in any shared
  or production environment (ADR-DB1-014), and an explicit PR callout.
- **Constraint tightening** (adding NOT NULL/CHECK/UNIQUE to existing data):
  two-step — first a data-cleanup/backfill migration, then the constraint;
  the constraint migration must fail (not skip) on violating rows.
- **Large-table migrations** (future concern at current scale): note in PR;
  prefer `CONCURRENTLY`/batched patterns when tables grow — policy hook only,
  no premature machinery.
- **Reversible vs irreversible:** every migration is treated as
  irreversible for policy purposes (see below), so destructive ones must
  state their recovery path (backup) in the PR description.

### Forward-fix vs rollback policy (DEC-18 — locked)

**The system is forward-only. `down` migrations are not authored and are
never a production recovery path.**

| Situation | Policy |
| --- | --- |
| Local development, own machine | No rollback: reset the database/volume and re-migrate (+ seed). Dev data is disposable (ADR-DB1-013). |
| Unshared feature-branch migration | Delete/regenerate the migration file freely before merge; reset local DB. |
| Shared/merged migration | Immutable. Mistake → new forward migration that corrects it. |
| Production migration (applied) | Forward-fix only. Data loss caused by a bad migration → restore from pre-migration backup, then forward-fix (ADR-DB1-014). |
| Failed but unapplied migration | Nothing ran; fix the file if unshared, or ship a corrected new migration if shared. |
| Partially applied migration | See failed-migration procedure below. |

Rationale: at this scale a tested backup + forward-fix is strictly safer than
maintaining a second, rarely-tested `down` codepath; drizzle-kit's model is
also forward-oriented. Backup-before-destructive-migration is the mandatory
compensating control.

### Failed-migration policy (framework for the DB10 runbook)

1. **Detect:** migration command exits non-zero / drift check fails; CI and
   startup verification surface it (ADR-DB1-004).
2. **Halt:** no further migrations, no retry loops, no writes by new app
   versions expecting the new schema.
3. **Preserve evidence:** capture the full error output, the migration ID,
   the history-table state, and server logs before touching anything.
4. **Determine transactional state:** PostgreSQL DDL is transactional — a
   migration executed as a single transaction rolled back entirely; verify
   via the history table + inspecting affected objects. Migrations containing
   non-transactional statements (e.g. `CREATE INDEX CONCURRENTLY`, if ever
   used) must be flagged in review as partial-failure hazards.
5. **Restore/repair path:** if partially applied (non-transactional case) in
   production → restore from the pre-migration backup; in dev → reset volume.
6. **Forward-fix path:** author a new corrected migration; never edit the
   failed shared one (if the failed migration never applied anywhere and was
   never shared, fixing the file is allowed).
7. **History-table reconciliation:** only as an explicit, logged operator
   action; never automated.
8. **Verification:** run the schema-verification command (ADR-DB1-004),
   fresh-install test in CI, and application health checks.
9. **Audit/operator note:** record incident, cause, and actions in the ops
   log; DB10 runbook RB-06 formalizes the template.

## Consequences

## Positive Consequences

- One tool, one linear SQL history, one command path (PR-05).
- Forward-only + backup keeps recovery honest and rehearsed instead of
  relying on untested `down` scripts.

## Negative Consequences

- No quick `down` during local experimentation — devs reset instead
  (cheap at this scale, and consistent with disposable dev data).
- Timestamp naming across parallel branches can interleave; mitigated below.

## Risks and Mitigations

- **Risk:** two branches generate migrations with out-of-order timestamps.
  **Mitigation:** rule — before merge, a branch rebases and regenerates its
  unshared migrations so they sort after the shared tip (SV-09); CI
  fresh-install run catches ordering breakage (DB7).
- **Risk:** drizzle-kit snapshot/journal corruption.
  **Mitigation:** snapshots are committed; fresh-install CI run is the
  arbiter; discrepancies fail the build.

## Rejected Alternatives

- Second, ORM-independent migration runner — two sources of truth, more drift
  surface, no capability gain for this team size.
- Rollback-capable (`down`) policy — doubles authoring/testing cost for a
  path that would rarely be exercised and is unsafe on data-bearing changes.

## Deferred Details

- Exact migrations directory path and pnpm command names → DB6.
- Exact `drizzle-kit` version: pinned at DB6 together with `drizzle-orm` and
  the driver under the package-pin policy of ADR-DB1-002 (DB1-C1) —
  compatibility spike (incl. migration generation and history-table
  behavior) runs on the exact pinned set before the first real migration.
- Runbook texts (RB-03, RB-06, RB-09) → DB10.

## Implementation Checkpoint

DB6 (foundation, commands, first migration, CI fresh-install job).

## Verification Checkpoint

DB7 (fresh + upgrade migration tests), DB10 (failed-migration runbook audit).

## Reversal / Migration Cost

Low-medium: history is plain SQL, replayable by any future runner; switching
tools means adopting a new history table, not rewriting migrations.

## References

- drizzle-kit generate/migrate — https://orm.drizzle.team/docs/drizzle-kit-generate ,
  https://orm.drizzle.team/docs/migrations
- PostgreSQL transactional DDL — https://www.postgresql.org/docs/16/sql-createtable.html
  (DDL in transactions; see also https://wiki.postgresql.org/wiki/Transactional_DDL_in_PostgreSQL:_A_Competitive_Analysis )
- `docs/database/DB0_PORTABILITY_RECOVERY_REQUIREMENTS.md` §3 (SV-01..SV-09)
- ADR-DB1-002, ADR-DB1-004, ADR-DB1-013, ADR-DB1-014
