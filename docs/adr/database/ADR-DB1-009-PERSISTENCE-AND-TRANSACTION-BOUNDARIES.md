# ADR-DB1-009 — Persistence Ownership and Transaction Boundaries

- Status: Accepted
- Date: 2026-07-15
- Git HEAD: `563d9863c5d9591095038a28887e217058d816e4`
- Decision IDs: — (cross-cutting policy required by the DB1 task, Task R;
  operationalizes existing locked conventions)
- Requirement IDs: REQ-ORD-004, REQ-PAY-005, REQ-OUTBOX-001, REQ-INT-002
- Invariant IDs: INV-05, INV-06, INV-07, INV-16, INV-19, INV-23
- Gap IDs: —

## Context

`BACKEND_CONVENTIONS §2/§9/§10/§11` and `SYSTEM_ARCHITECTURE §8/§11` already
lock module ownership and explicit transactions at the convention level.
This ADR turns them into concrete persistence-architecture rules that DB2–DB8
inherit, bound to the chosen stack (Drizzle, single schema).

## Decision Drivers

- Modular monolith with 13 modules over one database, one API + one worker.
- Critical transactions enumerated by the architecture: approval snapshot,
  payment application, inventory reservation/release, quotation versioning,
  production transition, order completion.
- Outbox pattern mandated for post-commit side effects (INV-23).

## Options Considered

1. Module-owned repositories + use-case-owned transactions via an
   application transaction port (chosen — matches conventions).
2. Global generic repository / shared DAO layer — explicitly prohibited by
   BACKEND_CONVENTIONS §22.
3. Controller- or interceptor-managed transactions — hides boundaries,
   rejected.

## Decision

### Ownership (locked)

1. **One PostgreSQL database**; every table has exactly one owning module
   (ADR-DB1-005 ownership map).
2. **Each module owns** its Drizzle schema definitions, repository
   interfaces (domain/application layer) and repository adapters
   (infrastructure layer).
3. **No cross-module ORM/entity/schema import.** Module A never imports
   module B's Drizzle table objects, row types, or repositories.
4. **No module reads/writes another module's tables directly** — via ORM or
   raw SQL — unless a future ADR explicitly allows a named exception.
5. **Cross-module use cases** coordinate through public application
   services, ports, query contracts, or domain/application events
   (BACKEND_CONVENTIONS §10) — never through the database.
6. **Raw SQL** (sanctioned by ADR-DB1-002) obeys the same ownership: a
   module's raw SQL touches only its own tables.
7. **Cross-module FKs** are integrity references only (ADR-DB1-005 rule 4).
8. The **worker** reaches PostgreSQL only through approved application
   services/repositories shared from the owning modules
   (`SYSTEM_ARCHITECTURE §4`) — never through its own parallel table access.

### Transactions (locked)

9. **The transaction boundary is owned by the application use case**
   (command handler), never by controllers, decorators, or repositories.
10. An **application-owned transaction port** (thin wrapper over Drizzle's
    `db.transaction()`, with isolation-level options and savepoints) is the
    only way to open a transaction; it is passed/scoped so repositories
    enlist in the ambient use-case transaction. It must remain a narrow port
    — **not a global service-locator** carrying arbitrary dependencies.
11. **Explicit transactions are mandatory** for: approval snapshot creation,
    payment application/callback processing, inventory reservation/release/
    consume, quotation version creation, production transitions, order
    creation/completion (SYSTEM_ARCHITECTURE §11). Default isolation is
    PostgreSQL `READ COMMITTED`; any use case needing stronger isolation or
    row locking states it explicitly (DB3 enforcement plan; DB8 tests).
12. **External side effects happen after commit** via the outbox pattern:
    the outbox row is written inside the business transaction; the relay
    dispatches after commit (INV-23). No external provider call inside a DB
    transaction.
13. **Repository APIs are domain-oriented** (`findAwaitingReviewVersion`,
    `appendLedgerEntry`) — no generic `save(anything)` repositories, no ORM
    row types leaking past infrastructure.
14. **Admin dashboard / read composition** (Q-22 and similar): composed
    read-only queries may be implemented as dedicated read services/query
    contracts; they never grant write access to other modules' tables and
    are flagged in the ownership map. Cross-module read composition beyond
    contracts (i.e. a read model joining several modules' tables in SQL) is
    permitted **only** for admin reporting surfaces, read-only, and
    documented per query — the write path always stays module-owned.

## Consequences

## Positive Consequences

- DB2 can model aggregates knowing exactly where persistence and transaction
  seams sit; DB8 tests have explicit boundaries to attack.
- Future extraction of a module remains possible (code-level isolation).

## Negative Consequences

- More ceremony than "just query it": cross-module reads need contracts.
- The transaction port is bespoke wiring (small, DB6).

## Risks and Mitigations

- **Risk:** boundary erosion under delivery pressure.
  **Mitigation:** lint/dependency-cruise rules on import paths (DB6), review
  checklist, DB7 tests exercising only public module APIs.
- **Risk:** ambient-transaction plumbing becomes a service locator.
  **Mitigation:** rule 10's narrow-port constraint; reviewed at DB6.

## Rejected Alternatives

- Shared DAO/generic repository layer; controller-level transactions;
  per-module database users as the enforcement mechanism (deferred as
  optional production hardening — see ADR-DB1-010 deferred items).

## Deferred Details

- Concrete port interfaces, DI wiring, lint rule config → DB6.
- Which use cases get elevated isolation/locking → DB3 (enforcement plan).

## Implementation Checkpoint

DB6 (ports, wiring, lint), DB3 (per-invariant enforcement mapping).

## Verification Checkpoint

DB7 (repository integration), DB8 (transaction/concurrency proofs).

## Reversal / Migration Cost

Low — these are code-organization rules; relaxing them later is always
possible (tightening later is what would be expensive).

## References

- `docs/development/BACKEND_CONVENTIONS.md` §2, §9, §10, §11, §22
- `docs/architecture/SYSTEM_ARCHITECTURE.md` §4, §8, §11
- ADR-DB1-002, ADR-DB1-005
