# ADR-DB1-010 — Immutability Enforcement Direction

- Status: Accepted with Deferred Parameters
- Date: 2026-07-15
- Git HEAD: `563d9863c5d9591095038a28887e217058d816e4`
- Decision IDs: DEC-09
- Requirement IDs: REQ-APPR-001, REQ-APPR-002, REQ-QUOT-002, REQ-QUOT-004,
  REQ-DVER-005, REQ-AUDIT-001, REQ-AUDIT-003, REQ-ORD-002
- Invariant IDs: INV-01, INV-02, INV-03, INV-12, INV-14, INV-17
- Gap IDs: —

## Context

Approved design versions, sent quotation versions, approval snapshots,
historical order/commercial snapshots, and audit/ledger records must never be
mutated (BR-009, `06 §4/§5/§9`, `10 §5`). Application-only guards are
insufficient for the money/approval class of invariants (DB0 classified
INV-01/02/12/17 as DB+APP defense-in-depth).

## Decision Drivers

- Defense-in-depth: a bug or raw-SQL mistake must not silently rewrite
  approved/financial history.
- Single-role reality: dev and early production run one application DB user,
  so privilege separation alone cannot be the near-term mechanism.
- Corrections must remain possible **as new records**, never as overwrites.

## Options Considered

1. Application guards only — necessary, insufficient (single bug defeats).
2. Append-only row model (no UPDATE path in app) — right model for events,
   does not stop stray SQL.
3. **DB triggers rejecting UPDATE/DELETE** — engine-level, role-independent,
   cheap at this scale. (Chosen as the DB backstop.)
4. Restricted DB privileges (separate roles, REVOKE UPDATE/DELETE) — strong
   but operationally heavier; deferred as production hardening.
5. Separate immutable snapshot tables / versioned records + pointer —
   modeling patterns, complementary to enforcement. (Adopted as modeling
   direction.)
6. Combination/defense-in-depth. (Chosen overall.)

## Decision

**Defense-in-depth: application guards + versioned-record modeling + DB
triggers that reject UPDATE/DELETE on immutable data.**

### Data classes (locked direction; per-table mapping at DB3/DB4)

| Class | Semantics | Candidates |
| --- | --- | --- |
| **Immutable snapshot** | Row is frozen at creation; UPDATE/DELETE rejected by trigger | approval snapshots, quotation versions (once sent), design-version snapshots (once approved/sent), order item commercial snapshots |
| **Append-only** | INSERT only; UPDATE/DELETE rejected by trigger (except tightly scoped status columns where the lifecycle requires it, e.g. outbox dispatch state) | audit events, inventory ledger entries, payment callback events, state-transition logs |
| **Mutable header + immutable versions** | Header row (pointer/status) mutable; version rows immutable | quotation header → quotation_versions; design/request header → design_versions |
| **Mutable** | Normal rows | catalog, sessions, balances, etc. |

### Enforcement layers (locked)

1. **Application:** repositories for immutable/append-only tables expose no
   update/delete methods (ADR-DB1-009 rule 13); domain guards enforce state
   rules (e.g. INV-17 approved-never-draft).
2. **Database:** `BEFORE UPDATE OR DELETE` triggers raising an exception on
   immutable/append-only tables (hand-authored migrations, ADR-DB1-003;
   naming `tg_<table>__reject_mutation`, ADR-DB1-006). Column-scoped
   exceptions (e.g. an append-only table with a legitimate `status` column)
   are implemented as column-list checks inside the trigger and documented
   per table at DB4.
3. **Privilege separation** (REVOKE UPDATE/DELETE for the app role on
   immutable tables): **deferred production hardening** — direction approved,
   parameters (role model, timing) decided at DB6/DB10; not required for DB2
   progress because triggers already provide engine-level defense.

### Correcting bad historical data (locked)

- Never overwrite. The only paths are: **superseding version**, **void/
  cancel state** (header-level), or **correction record** referencing the
  original (pattern per lifecycle at DB3).
- **Bypass:** no routine bypass exists. Break-glass repair of genuinely
  corrupt data is an operator action: explicit migration (or logged manual
  operation per INV-31 exception process) that temporarily disables the
  specific trigger, with a mandatory audit note and DB10-style evidence.
  Application code never has a bypass flag.
- Every correction/void is itself auditable (INV-14).

### Test expectations (locked for DB7/DB8)

- DB7: direct UPDATE/DELETE against each immutable/append-only table fails
  at the DB level (bypassing the application), including for the app role.
- DB8: approval snapshot creation is transactional; concurrent
  approve/revise races cannot mutate an approved version (INV-16/17
  interplay).

## Consequences

## Positive Consequences

- A stray query or code bug cannot rewrite money/approval history — the
  engine says no, regardless of role.
- Modeling classes give DB2/DB4 a fixed vocabulary for every table.

## Negative Consequences

- Trigger DDL is hand-authored SQL (generator won't emit it) — accepted;
  `--custom` migrations are first-class (ADR-DB1-003).
- Legitimate schema evolution on immutable tables needs care (new nullable
  columns are fine; value rewrites are not).

## Risks and Mitigations

- **Risk:** trigger forgotten on a new immutable table.
  **Mitigation:** DB4 ownership map lists the class per table; DB7 has a
  generic test iterating all tables marked immutable/append-only.
- **Risk:** column-scoped exceptions creep ("just one more mutable
  column"). **Mitigation:** each exception documented + reviewed at DB4.

## Rejected Alternatives

- Application-only enforcement (insufficient per DB0 classification).
- Privilege separation as the primary mechanism now (single-role reality;
  kept as deferred hardening, not rejected outright).
- Event-sourcing the whole system (massively over-scale for this product).

## Deferred Details

- Per-table class mapping and column-scoped exceptions → DB3 (enforcement
  plan) / DB4 (logical schema).
- Privilege-separation role model → DB6 implementation option, DB10 audit.
- Deferral is safe for DB2: modeling classes above are the only thing DB2
  needs; acceptance = every DB4 table carries a class and every
  immutable/append-only table has its trigger + DB7 test.

## Implementation Checkpoint

DB6 (triggers in migrations), DB3/DB4 (mapping).

## Verification Checkpoint

DB7 (constraint/trigger tests), DB8 (transactional immutability races),
DB10 (break-glass procedure audit).

## Reversal / Migration Cost

Low: triggers are droppable per-table; the modeling classes are documentation
until DB4 binds them.

## References

- PostgreSQL trigger docs — https://www.postgresql.org/docs/16/sql-createtrigger.html
- `docs/04-BUSINESS-RULES.md` BR-009; `docs/06-ORDER-AND-DESIGN-LIFECYCLE.md`
  §4/§5/§9; `docs/10-NON-FUNCTIONAL-REQUIREMENTS.md` §5
- ADR-DB1-003, ADR-DB1-006, ADR-DB1-009
