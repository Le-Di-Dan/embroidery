# DB10 — Retention & Anonymization Runbook

Mechanism proven in `db10-cp4-retention.integration.spec.ts` and
`db10-cp4-anonymization.integration.spec.ts`. Policy classes:
`DB10_DATA_DURABILITY_MATRIX.md`. Durations: `DB10_DURABILITY_PARAMETER_REGISTRY.md`
(§4 — every one **deferred**).

## Before running anything

Every retention period is a business-owned value that does not exist yet
(O-008 / O-012). **Do not invent a cutoff.** The cutoff is always an explicit
argument; the tool has no default duration.

Always dry-run first:

```sh
pnpm db:retention --database <db> --family <id> --cutoff <iso> --dry-run
```

## Retention sweep

```sh
pnpm db:retention --database <db> --family <id> --cutoff <iso> [--batch 500]
```

- Reachable families: `outbox, idempotency, background_jobs, notification,
  verification, audit, admin_sessions, asset_inspections, inventory_holds`.
- Any other family is **refused** (exit 2). Commercial records — orders,
  payments, ledger, snapshots — are never deletable, regardless of the S24
  `retention_exempt` exemption their triggers may carry.
- Deletion is batched (keyset-progressing), child-before-parent, and runs
  under the S24 exemption GUC set `local` to the batch transaction only.
- Metrics (rows, batches, ms) print as a JSON line for an operator log.

## Anonymization

```sh
pnpm db:anonymize --database <db> (--customer <uuid> | --cutoff <iso>) [--dry-run]
```

- Scrubs `display_name`, `notes`, and each contact point's value; sets
  `anonymized_at`. Keeps the row, its id, merge linkage and every commercial
  FK, so financial and audit evidence stay whole.
- **Never touches a frozen approval snapshot** — that contact snapshot is
  evidence, redacted only by a separate break-glass privacy procedure.
- Idempotent: a row already carrying `anonymized_at` is skipped.

## Legal / business holds

`DB4` defines holds as an App-level block (`policy_configurations` key
`retention.hold`) with **no schema column added speculatively**, and no hold
mechanism is implemented yet (DP-RET-09). **Until holds exist, a retention run
cannot consult them** — do not run retention against a class that may be under
hold without confirming out of band. This is a tracked gap, owner: application
feature work.

## Ownership

No scheduler exists (`apps/worker` is a bootstrap shell). These tools are run
by an operator. Wiring them to a schedule, with a maintenance window
(DP-OPS-01), is deferred infrastructure work.

## Security posture (DP-SEC-01 / DP-SEC-02)

The retention DELETE exemption (`app.bypass_retention_trigger`) is **not** a
security boundary by itself — any session that can `SET` it and holds DELETE on
the table can bypass append-only protection. The boundary is **role
separation** (proven in `db10-cp8-retention-role-security.integration.spec.ts`):

- the **application role** must be a **non-superuser** that has **no DELETE** on
  append-only tables and is **not a member** of the retention role — it then
  cannot bypass even by setting the GUC (fails `42501`);
- the **retention job** connects as a **dedicated retention role** with DELETE,
  and sets the GUC per batch.

A **superuser** connection bypasses everything; production must never run the
application as a superuser.
