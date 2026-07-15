# ADR-DB1-004 — Schema Versioning and Git ↔ Database Traceability

- Status: Accepted
- Date: 2026-07-15
- Git HEAD: `563d9863c5d9591095038a28887e217058d816e4`
- Decision IDs: — (traceability policy supporting DEC-02, DEC-03, DEC-17,
  DEC-18)
- Requirement IDs: REQ-OPS-005, REQ-OPS-006, REQ-OPS-007, REQ-OPS-008
- Invariant IDs: INV-26, INV-27, INV-28, INV-29, INV-30, INV-31
- Gap IDs: —

## Context

Development spans multiple machines; deployments and backups must be
attributable to an exact schema state. DB0 requires that Git state maps to
schema state (SV-03) without inventing guarantees the tooling does not give.

## Decision Drivers

- A developer or operator must be able to answer: "what schema should this
  commit produce, and does this database match it?"
- Backups must be restorable against a known schema version (DEC-12).
- No false precision: drizzle-kit does not maintain a single integer schema
  version, and one Git commit does not map 1:1 to one integer.

## Options Considered

1. Migration-set model: expected state = ordered set of migration files at a
   commit; applied state = migration history table. (Chosen.)
2. Single integer schema version maintained by hand — redundant bookkeeping,
   drifts from reality, adds merge conflicts.
3. Storing Git commit hashes in the database as authority — inverts source
   of truth (DB would "know better" than Git).

## Decision

### Authority model (locked)

- The **migration history table** (created/owned by drizzle's migrator;
  table/schema name explicitly configured at DB6 and never manually edited)
  is authoritative for **which migrations have been applied** to a given
  database, including per-migration hash and applied-at timestamp.
- The **Git repository** is authoritative for **which migrations are
  expected**: the expected schema version at a commit **is defined as the
  ordered set of migration files contained in that commit**. There is no
  separate integer version; "schema version" in all documents, manifests and
  runbooks means "the ID of the latest migration in the ordered set" plus,
  where completeness matters, the full ID list.

### Metadata and tagging

- **Backups** record the applied-migration set, latest migration ID, Git
  commit of the running application, and PostgreSQL version in their manifest
  (ADR-DB1-014) — this, not the database, is where Git-commit linkage lives.
- **Build/deployment metadata:** the API exposes (internal/ops surface, DB6)
  its build Git commit and the database's latest applied migration ID, so
  parity is checkable at runtime.
- The Git commit hash is **not** stored in database rows as authority; the
  migration tool's history rows (ID + hash + timestamp) are sufficient
  in-database metadata. Tool version is recorded in the lockfile (Git), not
  per-row.

### Drift detection and verification (locked behavior, DB6 implements)

A single verification command (also run at API startup in dev/CI and before
migration in production) must check:

1. Every applied migration ID in the history table exists as a file in the
   checked-out commit, with matching hash → else **fail: local DB ahead /
   divergent** (branch-divergence case, see ADR-DB1-013).
2. Every file older than the newest applied migration is applied → else
   **fail: out-of-order/hole**.
3. Pending files newer than the applied tip → **report: migration needed**.
4. Hash mismatch on an applied ID → **hard fail: shared-migration edit or
   local tampering** (INV-26/31); never auto-repair.

### Rules

- Manual database changes outside migrations are prohibited (INV-31);
  discovery of unexplained drift is treated as an incident, not noise.
- Branch divergence resolution follows ADR-DB1-013 (forward-migrate if
  fast-forward; otherwise reset dev volume). Merged history is linear because
  unshared migrations are regenerated on rebase (ADR-DB1-003).
- Migration conflict naming/ordering: timestamp prefixes + the rebase rule in
  ADR-DB1-003 keep ordering deterministic.
- **Fresh install:** empty DB + full ordered set → expected state (INV-28).
- **Upgrade:** existing DB + pending suffix of the ordered set → expected
  state (INV-29). Supported "prior versions" are exactly the prefixes of the
  linear history.

## Consequences

## Positive Consequences

- Traceability is real and checkable: commit ⇒ expected file set; database ⇒
  applied set; the verification command compares them.
- Backups and deployments carry enough metadata to reason about restore
  compatibility without guessing.

## Negative Consequences

- The verification command is bespoke (drizzle-kit does not ship one);
  DB6 must build and test it.

## Risks and Mitigations

- **Risk:** the tool's history-table semantics differ from assumptions
  (hash algorithm, journal interplay).
  **Mitigation:** mandatory DB6 spike documenting actual behavior before the
  first real migration; the verification command is built against observed
  behavior.

## Rejected Alternatives

- Hand-maintained integer schema version (drift-prone bookkeeping).
- Git hash stored in DB as authority (source-of-truth inversion).
- Trusting tool defaults without a verification command (drift would surface
  as runtime corruption instead of a failed check).

## Deferred Details

- Command name, wiring, ops-endpoint shape → DB6.
- Runbook integration (RB-08, RB-10) → DB10.

## Implementation Checkpoint

DB6.

## Verification Checkpoint

DB7 (fresh/upgrade paths), DB10 (drift/divergence runbook audit).

## Reversal / Migration Cost

Low: the model is tool-agnostic (ordered files + applied-set table); any
future migration runner preserves it.

## References

- drizzle-kit migrations model — https://orm.drizzle.team/docs/migrations
- `docs/database/DB0_PORTABILITY_RECOVERY_REQUIREMENTS.md` §3
- ADR-DB1-003, ADR-DB1-013, ADR-DB1-014
