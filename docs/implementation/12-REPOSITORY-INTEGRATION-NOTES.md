# Repository Integration Notes

**Status:** Integration performed. This set lives at `docs/implementation/` and is
routed from `CLAUDE.md` and root `README.md`. See
`audits/DOCUMENTATION_RECONCILIATION_REPORT.md` for the reconciliation evidence.

## 1. Location

This set lives at:

```text
docs/implementation/
```

It is not placed under `docs/database/`; the database phase is a separate,
completed source set.

## 2. Existing-document integration (applied)

The following links—not duplicated rules—have been added:

### Root `README.md`

An "Application implementation stage" section links to:

```text
docs/implementation/README.md
docs/implementation/10-MASTER-APPLICATION-ROADMAP.md
```

### Root `CLAUDE.md`

`docs/implementation/README.md`, the master application roadmap, and the current
phase plan are in required reading for application tasks. Implementation
documents sit below product/business/architecture/database/design/conventions in
source precedence, and are canonical for how delivery and implementation happen.

### `docs/development/FRONTEND_CONVENTIONS.md`

Its styling section is updated: styling is locked to global SCSS and the section
points to the canonical standard, with no competing detailed rules:

```text
docs/implementation/05-FRONTEND-AND-SCSS-STANDARD.md
```

There is a single canonical styling source.

### `docs/development/BACKEND_CONVENTIONS.md`

A short pointer references the mandatory Swagger/OpenAPI and generated-client
contract rather than copying the full rules:

```text
docs/implementation/04-BACKEND-API-DELIVERY-STANDARD.md
docs/implementation/06-OPENAPI-AND-CLIENT-CONTRACT.md
```

### Canonical roadmaps (no root roadmap)

There is intentionally **no root `ROADMAP.md`**. The two canonical roadmaps are:

```text
docs/database/DB_ROADMAP.md                          (database phase)
docs/implementation/10-MASTER-APPLICATION-ROADMAP.md (application implementation)
```

If an index is ever introduced, it must only link to these canonical files and
must not copy phase status.

## 3. Change discipline for this set

- Verify current repository paths before editing.
- Database status is resolved: DB0–DB10 are complete (see `docs/database/DB_ROADMAP.md`).
- Reconcile any newer ADRs.
- Update cross-links if paths differ.
- Commit documentation changes separately from implementation code.
