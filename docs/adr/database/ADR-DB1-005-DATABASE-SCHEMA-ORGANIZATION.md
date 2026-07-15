# ADR-DB1-005 — PostgreSQL Schema Organization

- Status: Accepted
- Date: 2026-07-15
- Git HEAD: `563d9863c5d9591095038a28887e217058d816e4`
- Decision IDs: DEC-08
- Requirement IDs: REQ-INT-002, REQ-OPS-004
- Invariant IDs: INV-25
- Gap IDs: —

## Context

`SYSTEM_ARCHITECTURE §8` defines ~13 business modules inside one API with
strict code-level isolation, one PostgreSQL database (D-025), and heavy
cross-module referencing (orders → designs → quotations → payments →
inventory). The DB-level organization is open (DEC-08).

## Decision Drivers

- Module isolation is already enforced at the code layer (repositories,
  ADR-DB1-009); the question is whether to duplicate it at the DB layer.
- Cross-module FKs are pervasive and required (INV-25).
- One linear migration history (ADR-DB1-003) — multi-schema ordering
  complicates it.
- 1–3 developers; debugging, backup/restore, and test-reset simplicity
  dominate over theoretical extraction readiness.

## Options Considered

### Option A — Single schema (`public`)

`public.products`, `public.orders`, `public.payment_attempts`.

### Option B — PostgreSQL schema per module

`catalog.products`, `ordering.orders`, `payment.payment_attempts`.

### Option C — Single schema + module table prefixes

`catalog_products`, `ordering_orders`, `payment_attempts`.

| Criterion | A single | B per-module | C prefixes |
| --- | --- | --- | --- |
| Cross-module FK | trivial | works but noisy (qualified names everywhere) | trivial |
| Migration ordering | one linear history | cross-schema ordering constraints | one linear history |
| ORM/migration support | simplest | Drizzle `pgSchema` supported, but every table/query/migration carries schema plumbing | simple |
| search_path / debug ergonomics | none needed | permanent overhead | none needed |
| Backup/restore & test reset | whole-DB, trivial | per-schema possible but we always operate whole-DB anyway | trivial |
| Naming collisions | avoided by good names | avoided structurally | avoided structurally, ugly names |
| Enforcement of module boundaries | code-level only | adds DB-level fence (only real advantage) | cosmetic only |
| Future extraction | rename/move later | marginally easier | marginally easier |

## Decision

**Option A: one PostgreSQL schema — `public` — for all application tables.**

- Table names are domain-scoped, unprefixed (`products`, `orders`,
  `design_versions`, `payment_attempts`, `inventory_ledger_entries`) per
  ADR-DB1-006; the module ownership map is documentation + code, not DDL.
- The migration tool's history table may live in the tool's own schema
  (e.g. `drizzle`) — explicitly configured at DB6 (ADR-DB1-004); that is an
  infrastructure exception, not an application schema.

### Ownership rules (locked)

1. **Every table has exactly one owning module**, assigned at DB2/DB4 in a
   versioned ownership map document.
2. A module's tables are created/altered only by migrations introduced for
   that module; the linear history stays global.
3. **No module touches another module's tables through ORM/entity/query** —
   enforcement is ADR-DB1-009 (code review + lint boundaries), not PG ACLs.
4. **Cross-module references:** FK columns referencing another module's PK
   are allowed and encouraged for integrity (INV-25); they are *reference
   only* — reading/writing the referenced table still goes through the
   owning module's contracts.
5. **Shared/cross-cutting objects** (outbox, idempotency, audit) live in
   `public` like everything else; each gets a single owning module decided at
   DB2 (audit → Audit module; outbox/idempotency → a platform-owned module),
   recorded in the ownership map.
6. Module-per-schema may be revisited by a superseding ADR only with a
   concrete extraction need; nothing in this ADR precludes `ALTER TABLE ...
   SET SCHEMA` later.

## Consequences

## Positive Consequences

- Zero search_path/permission plumbing; simplest possible migrations,
  backups, test resets, and psql debugging.
- FKs and multi-module transactions stay ordinary SQL.

## Negative Consequences

- No DB-level fence backing the module boundary — discipline lives in code
  review and ADR-DB1-009 rules.
- A future extraction to services would need table moves (cheap mechanically,
  but a migration event).

## Risks and Mitigations

- **Risk:** boundary erosion (module A querying module B's table directly).
  **Mitigation:** ADR-DB1-009 prohibitions + review checklist; DB7 tests
  exercise repositories only through module APIs.
- **Risk:** name collisions as modules grow.
  **Mitigation:** ADR-DB1-006 naming rules + ownership map review at DB4.

## Rejected Alternatives

- **Option B (schema-per-module):** its only real benefit (DB-level fence,
  per-schema ACLs) is not needed while a single API role owns all access;
  costs (qualified names, migration ordering, tooling plumbing) are paid on
  every single day of development.
- **Option C (prefixes):** all of A's properties with uglier names and a
  false sense of structure; prefixes also fossilize module names into DDL.

## Deferred Details

- Concrete table ownership map → DB2 (aggregates) / DB4 (tables).
- Any per-role permission hardening for production → DB6/DB10 hardening
  notes (see ADR-DB1-010 deferred items).

## Implementation Checkpoint

DB6 (first migrations create objects in `public`).

## Verification Checkpoint

DB7 (constraints/FKs), DB10 (ownership-map audit).

## Reversal / Migration Cost

Low-medium: moving tables into per-module schemas later is a mechanical
`SET SCHEMA` migration plus code reference updates.

## References

- PostgreSQL schemas — https://www.postgresql.org/docs/16/ddl-schemas.html
- Drizzle `pgSchema` (capability exists if ever needed) —
  https://orm.drizzle.team/docs/schemas
- `docs/architecture/SYSTEM_ARCHITECTURE.md` §8; ADR-DB1-006, ADR-DB1-009
