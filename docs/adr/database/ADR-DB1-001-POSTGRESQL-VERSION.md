# ADR-DB1-001 — PostgreSQL Version, Parity and Baseline Settings

- Status: Accepted (amended by DB1-C1 correction, 2026-07-15 — patch
  governance and collation scope; see
  [`DB1_CORRECTION_REPORT.md`](../../database/DB1_CORRECTION_REPORT.md))
- Date: 2026-07-15
- Git HEAD: `563d9863c5d9591095038a28887e217058d816e4` (amended at `a0e29b4`+)
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
- Deterministic comparison semantics for technical fields across image
  variants: locale-aware sort order depends on the locale library shipped
  with the image, so fields that only need bytewise semantics should not
  inherit that dependence. (This motivates a `C` default; it is not a claim
  of blanket immunity — locale-aware collations, once introduced, still need
  version-drift checks.)
- Small team: minimize upgrade ceremony while staying on a supported major.
- Required PostgreSQL features (JSONB, partial unique indexes, check
  constraints, `numeric`, `timestamptz`, transactional DDL) — all present in
  PostgreSQL 16; no feature requires 17+.

## Options Considered

1. Lock PostgreSQL major 16 with a governed, reviewed patch pin — supported
   until November 9, 2028 per PostgreSQL versioning policy.
2. Upgrade to PostgreSQL 17 — newer, but forces an image/volume change now
   with no required feature gain, contradicting the DB1 no-implementation rule.
3. Float on major tag (`postgres:16-alpine`) — machines drift onto different
   patch versions at different times; weaker reproducibility.
4. Freeze on the repository's existing `16.6-alpine` tag — rejected: that tag
   is stale repository state, not a security-patch policy; PostgreSQL
   recommends always running the current minor of a major version.

## Decision

### Major-version decision (locked)

- **PostgreSQL major version 16 is locked** for all environments
  (dev, test, CI, production). No baseline feature requires 17+.

### Patch-version implementation policy (locked)

- All environments run the **same major**; reproducible environments pin
  **one reviewed exact patch tag** — floating tags (`postgres:16`,
  `postgres:16-alpine`) are prohibited.
- **A stale patch is never kept merely to avoid change.** PostgreSQL's
  policy states minor releases contain only security/bug/corruption fixes,
  that minor upgrades do not require dump/restore, and that running the
  current minor is less risky than staying on an old one — the pin therefore
  tracks the current reviewed 16.x, not a historical tag.
- **Evidence at correction date (2026-07-15):** the current PostgreSQL 16
  patch baseline is **16.14** (postgresql.org versioning page). The Compose
  file's `postgres:16.6-alpine` is stale repository state, explicitly **not**
  the approved baseline; it is not changed in DB1/DB1-C1 (docs-only scope).
- **DB6 handoff requirement:** DB6 replaces the Compose tag with
  `postgres:16.14-alpine` **or a newer reviewed 16.x** if PostgreSQL has
  released one by then (re-confirmed against postgresql.org at DB6 time).
- **Patch upgrade procedure** (controlled dependency-maintenance change, one
  reviewed commit updating Compose + later Kubernetes manifests + docs):
  read the official release notes; run fresh-install migration and
  upgrade-from-prior migration; run constraint/concurrency smoke gates
  (DB7/DB8 suites once they exist); run a backup/restore smoke when the
  release notes touch dump/restore or storage behavior. Existing volumes
  remain valid across minors (no on-disk format change per policy).
- **Major upgrades (16 → N)** require a new ADR, a verified backup, and a
  documented dump/restore or `pg_upgrade` procedure (runbook owned by DB10
  policy family). Never performed implicitly by changing a tag.

### Baseline database settings (scope corrected by DB1-C1)

- Encoding: `UTF8`. Timezone: **UTC** for the server and all application
  sessions; all timestamps stored as `timestamptz` (REQ-INT-003; naming in
  ADR-DB1-006).
- **Database default collation: `C`** — chosen for what the PostgreSQL docs
  actually guarantee: strict byte-value comparison, available on all
  platforms. Its intended scope is **technical deterministic ordering and
  equality** — identifiers, codes, tokens, slugs, hashes — where bytewise
  semantics are the deliberate contract.
- **Scope limits of this choice (explicit):** bytewise semantics *reduce
  dependence on OS locale libraries for the comparisons deliberately assigned
  bytewise behavior*. This is **not** a general immunity claim against
  collation/index risks: any locale-aware (libc or ICU) collation introduced
  later carries collation-library version dependence, so collation-version
  drift checks and post-upgrade `REINDEX` discipline for such indexes remain
  required regardless of the default.
- **User-facing Vietnamese text** (product/category/customer names, content,
  SEO, gallery, addresses) gets an **explicit locale-aware policy designed at
  DB4/DB5**: per-column/per-index/per-query **ICU collations** (e.g.
  `vi-x-icu`), including **nondeterministic collations** where case/accent-
  insensitive comparison is required — accepting the documented costs
  (slower comparisons, no B-tree deduplication, no pattern matching on
  nondeterministic collations), or application-side sorting where simpler.
  The cluster/database default is never changed for this.
- **Comparison semantics assignment:** technical identifiers/codes → `C`
  (default); Vietnamese-linguistic sort/search → explicit ICU collation or
  query-level `COLLATE`; case/accent-insensitivity decided per field at
  DB4/DB5, not globally.
- **Canonical hashing is independent of database collation** — design-
  document hashes are computed over RFC 8785 canonical bytes in the
  application (ADR-DB1-012); no hash may ever depend on DB sort order.
- **Verification and drift detection:** DB6 verifies and records the actual
  `initdb` locale/collation/ctype and provider settings of the dev image
  (if the current volume was initialized differently, reset — dev data is
  disposable per ADR-DB1-013). Cross-machine reproducibility = identical
  pinned image + recorded settings compared by the DB6 verification step.
  Once any ICU/locale-aware collation exists (DB4/DB5), PostgreSQL's
  collation-version tracking is used to detect drift and trigger `REINDEX`
  (documented in the DB10 upgrade runbook).
- **Backup manifests record the locale/collation configuration** alongside
  the server version (ADR-DB1-014), so restore targets can be
  compatibility-checked.

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
- A `C` default keeps comparisons on technical fields bytewise and
  platform-independent, which lowers (does not eliminate) the locale-library
  exposure of a future image-variant change; locale-aware fields get their
  own explicitly designed policy instead of inheriting an accidental one.
- Patch governance keeps every machine on a current, security-patched 16.x
  instead of a fossilized tag.
- Long support runway (PostgreSQL 16 EOL November 9, 2028).

## Negative Consequences

- Default `ORDER BY` on text is byte-order, not Vietnamese-linguistic; DB4/DB5
  must design explicit ICU collation (or app-side sorting) wherever the UI
  needs linguistic ordering or case/accent-insensitive search.
- Exact-tag pinning requires an explicit commit for every patch bump.

## Risks and Mitigations

- **Risk:** patch bumps forgotten → drift from upstream security fixes (the
  16.6 pin going stale is exactly this failure, caught by DB1-C1).
  **Mitigation:** patch policy above + DB10 acceptance audit includes a
  version-currency check against postgresql.org.
- **Risk:** future locale-aware collations drift with ICU/libc upgrades.
  **Mitigation:** collation-version tracking + REINDEX step in the upgrade
  runbook (DB10) once such collations exist.
- **Risk:** existing dev volumes were initialized with non-`C` locale.
  **Mitigation:** DB6 verification step; dev volumes are disposable.

## Rejected Alternatives

- PostgreSQL 17 now — no required feature, forces churn in DB1's docs-only
  scope.
- Floating `16-alpine` tag — breaks multi-machine reproducibility (PR-03).
- Freezing on `16.6-alpine` — keeps machines on a superseded patch level
  against PostgreSQL's own recommendation.
- Per-machine version freedom — violates REQ-OPS-004/PR-01.
- Locale-aware database default (libc `vi_VN`/global ICU default) — imposes
  locale-library version dependence on every text index including technical
  fields; linguistic behavior is better applied explicitly per field.

## Deferred Details

- Production image variant and stateful topology → production/deployment ADR
  (out of DB scope, D-026 note).
- Per-column/per-index Vietnamese collation design (incl. any
  nondeterministic case/accent-insensitive collations) → DB4/DB5.
- Exact 16.x tag re-confirmation and Compose update → DB6 (16.14-alpine or
  newer reviewed).

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

- PostgreSQL versioning policy (current 16.x = **16.14**; EOL 2028-11-09;
  "always run the current minor" — evidence checked 2026-07-15) —
  https://www.postgresql.org/support/versioning/
- PostgreSQL collation support (C/POSIX behavior, libc vs ICU providers,
  nondeterministic collations and their limits — evidence checked
  2026-07-15) — https://www.postgresql.org/docs/16/collation.html
- PostgreSQL 16 release notes — https://www.postgresql.org/docs/16/release-16.html
- Docker official postgres image (locale notes) — https://hub.docker.com/_/postgres
- `infrastructure/compose/docker-compose.dev.yml` (postgres service — stale
  `16.6-alpine`, to be updated at DB6)
- `docs/database/DB0_OPEN_DECISIONS.md` DEC-03; `DB0_CONFLICTS_AND_GAPS.md` GAP-02
- `docs/database/DB1_CORRECTION_REPORT.md` (DB1-C1 amendment record)
