# ADR-DB1-001 — PostgreSQL Version, Parity and Baseline Settings

- Status: Accepted
- Date: 2026-07-15
- Git HEAD: `563d9863c5d9591095038a28887e217058d816e4`
- Decision IDs: DEC-03
- Requirement IDs: REQ-OPS-004, REQ-OPS-013, REQ-INT-003
- Invariant IDs: INV-28, INV-29, INV-34
- Gap IDs: GAP-02

## Context

`docs/12-DECISION-LOG.md` D-025 locks "PostgreSQL is the system-of-record
database" but no version. `infrastructure/compose/docker-compose.dev.yml`
de-facto pins `postgres:16.6-alpine` with named volume
`embroidery_postgres_data`. Multi-machine development (DB0 PR-01..PR-10)
requires every machine and CI to run the same engine version, and backup
compatibility (DEC-12) depends on a known version. The separate
`sonarqube-db` (postgres 15.8) is tooling-only and out of scope.

## Decision Drivers

- Reproducibility across developer machines, CI, and self-hosted production.
- Backup/restore compatibility (`pg_dump` guarantees within/forward across
  versions).
- Deterministic collation across Alpine (musl) and Debian (glibc) images —
  glibc/ICU collation differences can silently corrupt indexes after image
  swaps.
- Small team: minimize upgrade ceremony while staying on a supported major.
- Required PostgreSQL features (JSONB, partial unique indexes, check
  constraints, `numeric`, `timestamptz`, transactional DDL) — all present in
  PostgreSQL 16; no feature requires 17+.

## Options Considered

1. Keep PostgreSQL 16, pin exact tag (`16.6-alpine`) — matches existing
   volume/image; supported until Nov 2028 per PostgreSQL versioning policy.
2. Upgrade to PostgreSQL 17 — newer, but forces an image/volume change now
   with no required feature gain, contradicting the DB1 no-implementation rule.
3. Float on major tag (`postgres:16-alpine`) — machines drift onto different
   patch versions at different times; weaker reproducibility.

## Decision

- **PostgreSQL major version 16 is locked** for all environments
  (dev, test, CI, production).
- Docker images are **pinned to an exact tag**, currently `16.6-alpine`
  (unchanged in DB1; DB6 implements any tag change). Floating major tags are
  prohibited.
- **Patch/minor upgrades within 16.x** are allowed and encouraged: a single
  reviewed commit updates the pinned tag in Compose (and later Kubernetes
  manifests) plus the local-development doc; all machines pick it up on next
  `docker compose pull`. Patch releases never change the on-disk format, so
  existing volumes remain valid.
- **Major upgrades (16 → N)** require a new ADR, a verified backup, and a
  documented dump/restore or `pg_upgrade` procedure (runbook owned by DB10
  policy family). Never performed implicitly by changing a tag.

### Baseline database settings

- Encoding: `UTF8`.
- Default collation/ctype: **`C`** (byte-order, deterministic, identical on
  musl and glibc). Linguistic (Vietnamese) ordering, where a UI needs it, is
  applied per-query/per-column (ICU collation or application-side sort) and is
  a DB4/DB5 design concern — never a change of the cluster default.
- Timezone: **UTC** for the server and all application sessions; all
  timestamps stored as `timestamptz` (REQ-INT-003; naming in ADR-DB1-006).
- DB6 must verify the actual `initdb` settings of the existing dev image and
  record them; if the current volume was initialized with a different locale,
  DB6 decides between documented reset (dev data is disposable, ADR-DB1-013)
  or documenting the actual baseline.

### Image variant and extensions

- `alpine` variant stays for development (small, already in use). The
  production image variant is chosen with the production topology ADR, but it
  must be the same major.minor and must preserve the `C`-collation baseline —
  which is exactly what makes the Alpine/Debian choice safe to defer.
- **Extension policy:** no extension is part of the baseline. IDs are
  application-generated (ADR-DB1-007), so neither `uuid-ossp` nor `pgcrypto`
  is required (`gen_random_uuid()` is core since PG13 if ever needed). Any
  future extension requires an ADR note plus proof it exists in all pinned
  images.

## Detailed Rules

1. The pinned tag lives only in version-controlled infrastructure files and
   documentation; machines never choose their own version.
2. Backups record the exact server version in the manifest (ADR-DB1-014) and
   restores target the same major (DEC-12).
3. CI and the test database (ADR-DB1-016) run the identical pinned image.
4. `sonarqube-db` is explicitly out of scope of this pin (tooling only).

## Consequences

## Positive Consequences

- Deterministic environments across machines; backup/restore compatibility is
  decidable from the manifest.
- `C` collation removes the musl-vs-glibc index-corruption class of bugs and
  keeps future image-variant changes low-risk.
- Long support runway (PostgreSQL 16 EOL November 2028).

## Negative Consequences

- Default `ORDER BY` on text is byte-order, not Vietnamese-linguistic; DB5
  must design explicit collation where the UI needs linguistic sorting.
- Exact-tag pinning requires an explicit commit for every patch bump.

## Risks and Mitigations

- **Risk:** patch bumps forgotten → drift from upstream fixes.
  **Mitigation:** DB10 acceptance audit includes a version-currency check.
- **Risk:** existing dev volumes were initialized with non-`C` locale.
  **Mitigation:** DB6 verification step; dev volumes are disposable.

## Rejected Alternatives

- PostgreSQL 17 now — no required feature, forces churn in DB1's docs-only
  scope.
- Floating `16-alpine` tag — breaks multi-machine reproducibility (PR-03).
- Per-machine version freedom — violates REQ-OPS-004/PR-01.

## Deferred Details

- Production image variant and stateful topology → production/deployment ADR
  (out of DB scope, D-026 note).
- Per-column linguistic collation needs → DB4/DB5.

## Implementation Checkpoint

DB6 (verify/init settings, keep pin, startup validation).

## Verification Checkpoint

DB7 (fresh install/upgrade tests on pinned image), DB10 (parity + version
audit).

## Reversal / Migration Cost

Moving major versions later = standard dump/restore or `pg_upgrade` with
backup; moving the collation baseline later = full reindex/rebuild —
expensive, which is why it is locked now.

## References

- PostgreSQL versioning policy — https://www.postgresql.org/support/versioning/
- PostgreSQL 16 release notes — https://www.postgresql.org/docs/16/release-16.html
- Docker official postgres image (locale notes) — https://hub.docker.com/_/postgres
- `infrastructure/compose/docker-compose.dev.yml` (postgres service)
- `docs/database/DB0_OPEN_DECISIONS.md` DEC-03; `DB0_CONFLICTS_AND_GAPS.md` GAP-02
