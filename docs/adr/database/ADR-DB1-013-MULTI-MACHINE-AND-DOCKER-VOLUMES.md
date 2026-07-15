# ADR-DB1-013 — Multi-Machine Workflow, Docker Volumes and Branch Divergence

- Status: Accepted
- Date: 2026-07-15
- Git HEAD: `563d9863c5d9591095038a28887e217058d816e4`
- Decision IDs: DEC-17
- Requirement IDs: REQ-OPS-004, REQ-OPS-005, REQ-OPS-008, REQ-OPS-009
- Invariant IDs: INV-28, INV-29, INV-30, INV-35
- Gap IDs: —

## Context

Development happens on several machines. The dev stack uses Compose project
`embroidery-dev` with named volume `embroidery_postgres_data`;
`LOCAL_DEVELOPMENT §11` documents `pnpm docker:clean:volumes` as the
destructive reset. DB0 requires that incompatible volumes are never silently
reused after branch switches (INV-35) and that no machine-local state is a
source of truth.

## Decision Drivers

- Git is the only source of truth (REQ-OPS-005); local DB data must be
  reproducible from migrations + seed on any machine.
- Branch switches can change the expected migration set in both directions.
- Small team: the procedure must be a checklist, not tooling heroics.

## Options Considered

| Volume strategy | Verdict |
| --- | --- |
| **One named volume per repository/Compose project, shared across branches** | **Chosen** — matches current setup; combined with a mandatory mismatch check |
| Volume per branch | State explosion, stale volumes accumulate, no real safety gain once a mismatch check exists |
| Fresh volume per switch | Wasteful; seeds make resets cheap enough without forcing them always |

## Decision

### Git as source of truth (locked)

Schema definitions, migration history files, seed definitions, ADRs and
runbooks live in Git. **No local volume is ever a source of truth**; any
data a developer cares about beyond migrations + seed is by definition
disposable or must be extracted via backup (below).

### Environment (locked)

- `.env` stays git-ignored; `.env.example` is the documented source
  (REQ-OPS-009). Machine-specific overrides (e.g. `POSTGRES_PORT=5433` when
  5432 is taken) are normal and never committed.
- Docker service names stay stable (`postgres`, `api`, …); credentials may
  differ per machine — nothing may assume identical secrets across machines.

### Volume strategy (locked)

1. **One named volume per repository per machine** (current
   `embroidery_postgres_data` under Compose project `embroidery-dev`),
   shared across branches. Project-name isolation already prevents
   collisions with other stacks.
2. **Schema-version check instead of volume juggling:** the verification
   command (ADR-DB1-004, implemented DB6) is the gate. Run it after every
   pull/branch switch and before starting work.
3. **Local dev data is disposable by default** (DP-01). The reset path
   (`pnpm docker:clean:volumes` → start → migrate → seed) must always work
   and is the universal fix.

### Branch switching procedure (locked; DB6 wires commands, RB-08 runbook)

- Switch branch → run verification:
  - **DB behind (pending migrations only):** migrate forward. Done.
  - **DB ahead / divergent (applied IDs or hashes not in this commit):**
    the volume is incompatible → **reset volume, migrate, seed**. Never
    "fix" the history table by hand.
  - **Hash mismatch on an applied ID:** treat as tampering/edited shared
    migration — stop and investigate (ADR-DB1-004 rule 4).
- Switching back to a newer branch after a reset: forward-migrate again —
  the linear history makes this deterministic.

### Machine switching workflow (locked)

```text
Machine A: work → commit/push (migrations + docs; never volume contents)
Machine B: pull → verification command → docker up postgres →
           migrate (or reset+migrate+seed on divergence) → verify → work
```

### Local data transfer and backup guidance (locked)

- Developers **normally recreate** local data from migrations + seed;
  cross-machine transfer of dev volumes is **not** a supported workflow.
- **Backup recommended before:** destructive migrations on a DB holding data
  you want to keep, and volume resets when a local dataset took manual
  effort (use the standard `pg_dump` path from ADR-DB1-014 — dev backups are
  ad hoc, unmanaged, and never a source of truth).
- **Backup required:** production/staging contexts only (ADR-DB1-014).

### Corrupted volume recovery (locked direction; RB-07)

Destroy the volume, recreate, migrate from empty, seed, verify — plus
optional data restore from a backup if one exists. No in-place volume
surgery.

### DB6 implementation duties

Single-command targets for: verify, migrate, reset (destructive,
confirmation-guarded), seed; verification runs automatically before dev API
start. Destructive commands must name the database and require explicit
confirmation (guard details at DB6).

## Consequences

## Positive Consequences

- Branch/machine switching becomes a deterministic checklist; INV-35 is
  enforced by a check, not by developer memory.
- No volume-per-branch sprawl; the current Compose setup stays untouched.

## Negative Consequences

- Divergent-branch switches cost a reset + reseed (acceptable: seeds are
  deterministic per ADR-DB1-015, data is disposable).

## Risks and Mitigations

- **Risk:** developer skips verification and runs against a mismatched
  schema. **Mitigation:** dev API startup runs the check (fail-fast,
  REQ-OPS-010 spirit); CI fresh-install covers the honest path.

## Rejected Alternatives

- Volume-per-branch (state sprawl); mandatory fresh volume per switch
  (wasteful); committing dev database dumps to Git (source-of-truth
  violation).

## Deferred Details

- Command names/flags, startup-check wiring → DB6.
- Runbooks RB-01, RB-07, RB-08, RB-09 → DB10.

## Implementation Checkpoint

DB6.

## Verification Checkpoint

DB7 (fresh/upgrade), DB10 (bootstrap + recovery runbook audit).

## Reversal / Migration Cost

Trivial — policy + small scripts.

## References

- `docs/development/LOCAL_DEVELOPMENT.md` §3, §11
- `infrastructure/compose/docker-compose.dev.yml`; `.env.example`
- ADR-DB1-003, ADR-DB1-004, ADR-DB1-014, ADR-DB1-015
