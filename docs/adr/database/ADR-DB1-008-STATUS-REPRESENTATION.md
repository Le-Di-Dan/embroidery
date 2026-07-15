# ADR-DB1-008 — Status / Enum Representation

- Status: Accepted
- Date: 2026-07-15
- Git HEAD: `563d9863c5d9591095038a28887e217058d816e4`
- Decision IDs: DEC-05
- Requirement IDs: REQ-INT-005, REQ-REQ-002, REQ-QUOT-005, REQ-ORD-001,
  REQ-PAY-004
- Invariant IDs: INV-14 (status text in audit rows), INV-17
- Gap IDs: GAP-01 (state names provisional until DB3 — constraint on this
  decision, not resolved here)

## Context

Status columns are pervasive (23 lifecycles). All state-name sets from doc
`06` are **provisional until DB3** (GAP-01), so the representation must make
adding/renaming states cheap and reviewable, while still giving DB-level
enforcement (REQ-INT-005: no bare strings when a defined type exists).

## Decision Drivers

- Provisional states → representation must tolerate change with a plain,
  reviewable migration.
- DB-level enforcement of the allowed set (defense-in-depth with app-level
  typing).
- Readable rows in psql/logs/audit (`'APPROVED'`, not `3`).
- Native PG enums have well-known migration friction (`ALTER TYPE ... ADD
  VALUE` is non-transactional pre-PG17 nuance; value removal/rename requires
  type rebuild).

## Options Considered

| Option | DB enforcement | Change cost | Readability | Notes |
| --- | --- | --- | --- | --- |
| Native PG enum | strong | high (rename/remove = rebuild; historical rows constrain) | good | ordering semantics rarely wanted |
| **text + CHECK constraint** | strong | low (drop/re-add constraint in one transactional migration) | good | chosen |
| Lookup/reference table + FK | strong | medium (insert row) | needs join | adds join + seed data for no metadata need at this scale |
| Integer code | strong-ish | low | poor | opaque in every log/query |
| Application-only enum | none | none | good | violates REQ-INT-005 defense-in-depth |

## Decision

**Default representation: `text` column + named CHECK constraint** listing
the allowed values (constraint naming per ADR-DB1-006:
`ck_<table>__<column>_allowed`).

### Rules (locked)

1. **Values are SCREAMING_SNAKE_CASE stable strings** (matching doc `06`
   style, e.g. `SENT_FOR_REVIEW`); they are contract values, not display
   text.
2. **TypeScript is the source of truth for the value set:** each status set
   is defined once as a `const` tuple / union type in the owning module's
   domain layer (or `packages/domain-types` where shared); the Drizzle
   schema's CHECK constraint references that same constant array, so DB and
   TS cannot silently diverge (single definition, two projections).
3. **Changing a state set** (add/rename/remove — expected at DB3 and later):
   one migration that (a) migrates existing rows if a value is
   renamed/removed, then (b) replaces the CHECK constraint. Renames must
   update historical rows or explicitly justify keeping legacy values in the
   allowed set (audit/history rows keep whatever value was true at the time
   — states that become obsolete stay in the constraint for historical
   tables, per ADR-DB1-010 no-rewrite rule).
4. **No bare string literals** for statuses anywhere in application code —
   only the exported constants (REQ-INT-005, D-033).
5. **Exceptions to text+CHECK:**
   - A **lookup table** is used only when a status/type carries its own
     business data or admin-managed metadata (none identified yet; DB2/DB4
     may introduce one with justification in the ownership map).
   - **Native PG enums are prohibited** without a superseding ADR.
   - Free-form classification fields that are genuinely open-ended (e.g.
     adjustment reasons) are plain text and are *not* statuses.
6. State-machine transition legality is **not** encoded in CHECK constraints
   (that is DB3's enforcement plan — application/transactional guards +
   optional triggers per ADR-DB1-010); the CHECK only bounds the value set.

## Consequences

## Positive Consequences

- DB3's provisional-to-final renames stay cheap, transactional, reviewable.
- DB rejects invalid values even from raw-SQL escape hatches.
- Rows self-describing in every tool.

## Negative Consequences

- Slightly larger storage than enum/int (irrelevant at <100 orders/month).
- Allowed-set duplication between TS constant and CHECK — held together by
  the single-definition rule (2) and DB7 tests asserting the sets match via
  introspection.

## Risks and Mitigations

- **Risk:** TS constants and CHECK drift after a hand-edited migration.
  **Mitigation:** DB7 introspection test compares `pg_constraint` definition
  against the exported constants for every status column.

## Rejected Alternatives

- Native PG enum (migration friction against provisional names), lookup
  tables as default (join + seed overhead, no metadata need), integer codes
  (opaque), application-only (no DB enforcement).

## Deferred Details

- Final state names and per-lifecycle sets → **DB3** (GAP-01 owner). This
  ADR locks representation only.

## Implementation Checkpoint

DB4 (logical schema), DB6 (DDL).

## Verification Checkpoint

DB7 (constraint tests + TS/DB set-equality introspection tests).

## Reversal / Migration Cost

Low to lookup-table (add table + FK), medium to native enum — both possible
per-column later without data loss.

## References

- PostgreSQL CHECK constraints — https://www.postgresql.org/docs/16/ddl-constraints.html
- PostgreSQL enum alteration limits — https://www.postgresql.org/docs/16/sql-altertype.html
- `docs/06-ORDER-AND-DESIGN-LIFECYCLE.md` (provisional state sets);
  `docs/development/BACKEND_CONVENTIONS.md` §5, §20; ADR-DB1-006, ADR-DB1-010
