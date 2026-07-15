# ADR-DB1-015 — Seed Strategy Direction

- Status: Accepted
- Date: 2026-07-15
- Git HEAD: `563d9863c5d9591095038a28887e217058d816e4`
- Decision IDs: DEC-19
- Requirement IDs: REQ-OPS-011, REQ-OPS-009
- Invariant IDs: — (supports PR-06 reproducibility)
- Gap IDs: —

## Context

DB0 requires deterministic, reproducible seeds across machines with dev/test
separation (REQ-OPS-011, PR-06). DB1 locks direction; DB9 implements.

## Decision Drivers

- Any machine: migrate + seed ⇒ identical baseline (PR-06).
- Seeds must never contaminate migrations (schema history stays data-free)
  or production (no demo data in prod).
- No secrets in seed files (SC-01).

## Options Considered

- Seeds inside migrations — couples data to schema history, breaks
  fresh-install semantics and prod/dev separation; rejected.
- Ad hoc SQL snippets — non-idempotent, undocumented drift; rejected.
- **Typed, idempotent seed programs per tier** (chosen).

## Decision

### Seed tiers (locked)

| Tier | Content | Environments | Idempotency | IDs |
| --- | --- | --- | --- | --- |
| **System/reference seed** | data the application requires to function (reference values, initial admin account bootstrap, default configuration rows) | all, incl. production bootstrap | **upsert by natural/fixed key** — always safe to re-run | deterministic fixed IDs |
| **Development demo seed** | realistic demo catalog/requests for local work | dev only — refuses to run when `NODE_ENV=production` | idempotent upsert, or run after explicit reset | deterministic fixed IDs |
| **Test fixtures** | per-test data | test only | created per test via factories/builders in code (not a global dump) | deterministic per fixture definition (ADR-DB1-007 rule 3) |

### Rules (locked)

1. **Seeds are separate from migrations** — never inside schema migration
   files (a data *migration* fixing existing rows is a migration, not a
   seed; ADR-DB1-003 governs it).
2. **Idempotent by design:** system and dev seeds are upsert-style
   (insert-or-update by stable key); insert-only seeds are prohibited
   because re-running must be safe on any machine state.
3. **Deterministic IDs and ordering:** fixed IDs (per ADR-DB1-007) and an
   explicit, dependency-ordered execution sequence; no randomness, no
   faker-without-seed. Same commit ⇒ byte-identical baseline data.
4. **Destructive reset is a separate, explicit command** (reset → migrate →
   seed, ADR-DB1-013); seeding itself never truncates.
5. **Secrets:** never in seed files. The production bootstrap admin
   credential comes from environment/provisioning (SC-01/SC-05); dev demo
   credentials are documented dummies.
6. **Separation is enforced**, not conventions-only: seed runners check the
   tier-vs-environment matrix above and refuse mismatches.
7. **Production bootstrap** = migrations + system/reference seed only —
   defined as part of the deployment procedure, audited at DB10.
8. Seed definitions live in Git (REQ-OPS-005) in the API app's database
   area (exact layout at DB6/DB9), written in TypeScript against the
   repository/persistence layer or plain SQL where trivial — decided at DB9
   per dataset.

## Consequences

## Positive Consequences

- "Reset to a known world" becomes one deterministic command on any machine.
- Prod bootstrap is a defined, minimal, auditable dataset.

## Negative Consequences

- Upsert-style seeds are slightly more work to author than dump files —
  accepted for idempotency.

## Risks and Mitigations

- **Risk:** demo seed drifts from schema changes.
  **Mitigation:** CI runs migrate+seed on every change (DB9 gate).

## Rejected Alternatives

- Seeds in migrations; SQL dump files as dev baseline (non-idempotent,
  merge-hostile); random/faker data without fixed seeds (non-reproducible).

## Deferred Details

- Concrete datasets, factories, commands, layout → **DB9** (with DB6
  providing the runner plumbing).

## Implementation Checkpoint

DB9 (DB6 plumbing).

## Verification Checkpoint

DB9 (cross-machine identical baseline evidence), DB10 (bootstrap audit).

## Reversal / Migration Cost

Trivial — direction-level policy.

## References

- `docs/13-ACCEPTANCE-PRINCIPLES.md` §4; `docs/development/BACKEND_CONVENTIONS.md` §16, §19
- `DB0_PORTABILITY_RECOVERY_REQUIREMENTS.md` PR-06; ADR-DB1-007, ADR-DB1-013
