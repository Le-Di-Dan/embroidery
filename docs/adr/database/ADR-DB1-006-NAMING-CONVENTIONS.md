# ADR-DB1-006 — Database Naming Conventions (plus Money/Timestamp Baseline)

- Status: Accepted
- Date: 2026-07-15
- Git HEAD: `563d9863c5d9591095038a28887e217058d816e4`
- Decision IDs: DEC-07
- Requirement IDs: REQ-INT-001, REQ-INT-003, REQ-OPS-001
- Invariant IDs: INV-11, INV-25
- Gap IDs: —

## Context

No database identifiers exist yet. `REPOSITORY_STRUCTURE §14` covers code
naming only. Conventions must be locked before DB4/DB6 so every object is
named consistently from the first migration. Examples below are
**illustrative only** — they do not lock any table or column into existence.

## Decision Drivers

- PostgreSQL folds unquoted identifiers to lowercase → snake_case avoids
  quoting forever.
- Predictability for review and for Claude-assisted generation: one rule per
  concept, no judgment calls.
- Constraint/index names must be self-describing in error messages and logs.

## Options Considered

- snake_case vs camelCase (quoted) — camelCase requires quoting everywhere in
  raw SQL; rejected.
- Singular vs plural table names — both defensible; plural chosen for
  read-naturalness (`orders`, `payments`) and to match common PG practice.
- Tool-generated constraint names vs explicit names — generated names are
  unstable across tools; explicit chosen.

## Decision

### General

| Object | Convention | Example (illustrative) |
| --- | --- | --- |
| Database name | snake_case, environment-suffixed for non-dev | `embroidery` (dev, existing), `embroidery_test_<n>` (tests) |
| PostgreSQL schema | `public` only (ADR-DB1-005) | — |
| Tables | snake_case, **plural**, domain-scoped, no module prefix | `orders`, `design_versions`, `inventory_ledger_entries` |
| Columns | snake_case, singular | `total_amount`, `approved_at` |
| Primary key column | `id` | `orders.id` |
| FK column | `<referenced_entity_singular>_id`; role-qualified when needed | `customer_id`, `approved_design_version_id` |
| Human-readable code | `code` (unique, separate from PK, ADR-DB1-007) | `orders.code` |
| Status column | `status` (text + CHECK, ADR-DB1-008); secondary statuses `<aspect>_status` | `status`, `inspection_status` |
| Business version number | `version` (integer, per-aggregate sequence) | `quotation_versions.version` |
| Optimistic-lock column | `lock_version` (only where DB3/DB4 requires optimistic concurrency) | `design_sessions.lock_version` |
| Booleans | `is_`/`has_`/`requires_` prefix | `is_published`, `requires_review` |
| Timestamps | `<event>_at`, type `timestamptz`, always UTC | `created_at`, `approved_at`, `expires_at` |
| Standard audit timestamps | `created_at` NOT NULL; `updated_at` NOT NULL on mutable tables; **no `updated_at` on append-only/immutable tables** | — |
| Soft-delete / archive | `deleted_at` / `archived_at` (`timestamptz` NULL); never boolean flags | `products.archived_at` |
| Money | `numeric` (never float, INV-11); columns `<purpose>_amount`; currency handling and precision/scale locked at DB4 | `deposit_amount` |
| JSONB documents | `<name>_document` or `<name>_payload` | `design_document`, `callback_payload` |
| Hashes | `<subject>_hash`, format per ADR-DB1-012 | `document_hash`, `preview_hash` |

### Constraints and indexes (explicit names, always)

| Object | Pattern | Example |
| --- | --- | --- |
| Primary key | `pk_<table>` | `pk_orders` |
| Foreign key | `fk_<table>__<column>` | `fk_orders__customer_id` |
| Unique constraint/index | `uq_<table>__<col>[__<col>...]` | `uq_skus__code` |
| Partial unique index | `uq_<table>__<cols>__<qualifier>` | `uq_design_versions__request_id__awaiting_review` |
| Check constraint | `ck_<table>__<rule_slug>` | `ck_inventory_balances__non_negative` |
| Plain index | `ix_<table>__<cols>[__<qualifier>]` | `ix_outbox_events__status__pending` |
| Sequence (only if ever explicit; identity preferred) | `sq_<table>__<column>` | — |
| Trigger | `tg_<table>__<purpose>` | `tg_approval_snapshots__reject_mutation` |
| Trigger function | `fn_<purpose>` | `fn_reject_mutation` |

### Migrations

- Filenames: `<timestamp>_<verb>_<object>` (drizzle-kit timestamp prefix +
  mandatory descriptive slug), e.g. `20260801120000_create_catalog_tables`.
- Migration IDs are the filenames; never renamed after sharing
  (ADR-DB1-003).

### Semantics rules

1. All timestamps are UTC instants (`timestamptz`); date-only business
   concepts use `date` with `_on` suffix if ever needed.
2. No abbreviations except industry-standard ones (`sku`, `seo`, `url`,
   `id`).
3. Reserved words are avoided rather than quoted.
4. Names in DDL must match the Drizzle schema property names' snake_case
   mapping — one name per concept across code and DB.

## Consequences

## Positive Consequences

- Every constraint violation names its table/rule in a parseable way.
- Zero quoting; raw SQL, psql sessions, and generated code agree.

## Negative Consequences

- Explicit constraint names are extra keystrokes in schema definitions
  (Drizzle supports naming all of them — see ADR-DB1-002 references).

## Risks and Mitigations

- **Risk:** convention drift over time.
  **Mitigation:** review checklist at DB4/DB6; naming check added to the DB7
  test pass (introspect and assert patterns).

## Rejected Alternatives

- camelCase/quoted identifiers; singular table names; tool-default constraint
  names; boolean soft-delete flags; module-prefixed table names (rejected in
  ADR-DB1-005).

## Deferred Details

- Money precision/scale and currency column design → DB4 (REQ-INT-001 remains
  the guard: exact `numeric` only).
- Concrete table list → DB4 (examples here lock nothing).

## Implementation Checkpoint

DB4 (logical schema uses the conventions), DB6 (DDL).

## Verification Checkpoint

DB7 (introspection naming assertions).

## Reversal / Migration Cost

High if changed after DB6 (mass renames) — hence locked now.

## References

- PostgreSQL identifier folding — https://www.postgresql.org/docs/16/sql-syntax-lexical.html
- `docs/development/BACKEND_CONVENTIONS.md` §5; ADR-DB1-005, ADR-DB1-007,
  ADR-DB1-008, ADR-DB1-012
