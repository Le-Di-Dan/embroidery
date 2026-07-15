# DB1-C1 — Correction Report: Persistence ADR Evidence and PostgreSQL Baseline

**Checkpoint:** DB1-C1 (correction of DB1; DB2 not started)
**Date:** 2026-07-15 · **Branch:** `production` · **Base commit:** `a0e29b4` (not amended/rewritten)
**Nature:** Docs-only. No package installed, no lockfile/Compose change, no schema/SQL/migration/backend code.

---

## A. Preflight

- Branch `production`; HEAD `a0e29b4c754700a83664011a08e1817626a1cd17`
  ("docs(database): lock DB1 persistence architecture decisions") — exists,
  untouched. Working tree clean at start.
- 18 DB1 ADRs present under `docs/adr/database/`; DB1 documents
  (matrix/handoff/completion report) present under `docs/database/`.
- Affected sources located: ADR-DB1-001 (PG version + collation),
  ADR-DB1-002 (ORM comparison), ADR-DB1-003/004 (migration/traceability),
  ADR-DB1-014 (backup), `DB1_DECISION_MATRIX.md`,
  `DB1_IMPLEMENTATION_HANDOFF.md`, `DB1_COMPLETION_REPORT.md`,
  `docs/12-DECISION-LOG.md` D-037.

## B. Findings confirmed

1. **Stale PostgreSQL pin:** DB1 treated the repository's
   `postgres:16.6-alpine` as the approved exact baseline. Official evidence
   (postgresql.org versioning page, checked 2026-07-15): **current
   PostgreSQL 16 patch is 16.14**; PostgreSQL recommends always running the
   current minor; PostgreSQL 16 EOL 2028-11-09. 16.6 was repository state,
   not a security-patch policy. → Confirmed defect.
2. **Incorrect ORM exclusivity claim:** DB1 argued Drizzle is "the only
   candidate expressing partial unique index + CHECK in the schema source of
   truth", using prisma/prisma#6974 as current evidence. Current official
   docs refute exclusivity:
   - Prisma: partial indexes via `where` on `@unique`/`@@unique`/`@@index`
     (raw and type-safe forms), behind the **`partialIndexes` Preview
     feature**; PostgreSQL supported; plus the documented
     customize-generated-migration workflow for unsupported features.
   - TypeORM: `@Index(..., { where })` partial indexes (PostgreSQL-only) and
     the `@Check` entity decorator; docs also state some index options
     cannot be synchronized (`synchronize: false` escape).
   - MikroORM: `@Check({ expression })` (postgres driver) and custom index
     `expression` callbacks capable of arbitrary `CREATE INDEX` DDL
     (partial indexes included).
   → Confirmed defect; exclusivity claim removed everywhere.
3. **Collation overclaim:** "`C` collation removes the musl-vs-glibc
   index-corruption class of bugs" is broader than the official docs
   support. PostgreSQL docs establish: C/POSIX = strict byte-value
   comparison available on all platforms; libc vs ICU providers;
   nondeterministic (case/accent-insensitive) collations exist with
   documented costs. → Confirmed overclaim; wording narrowed and Vietnamese
   user-facing text policy added.

## C. PostgreSQL correction (ADR-DB1-001, ADR-DB1-014)

- **Major policy:** PostgreSQL major 16 remains locked (re-audited; no
  baseline feature needs 17).
- **Patch policy (new):** same major everywhere; one reviewed exact patch
  tag (never floating, never fossilized); patch upgrades are controlled
  dependency-maintenance changes requiring release-notes review,
  fresh-install + upgrade migration runs, constraint/concurrency smoke
  gates, and a backup/restore smoke when release notes touch dump/restore
  or storage.
- **Current reviewed patch:** **16.14** at correction date (2026-07-15).
- **DB6 handoff:** replace `postgres:16.6-alpine` with `postgres:16.14-alpine`
  **or newer reviewed 16.x** current at DB6; Compose not touched in DB1-C1.
- **Backup compatibility (ADR-DB1-014):** manifest now records the **exact
  source PostgreSQL version** and **locale/collation configuration**;
  restore targets are compatibility-checked **before** restore within the
  supported same-major PostgreSQL 16 baseline; restore-then-forward-migrate
  retained; major-version restore/upgrade split into a separate runbook.
- DEC-03 remains **Accepted**; GAP-02 remains resolved (now with governance
  rather than a frozen tag).

## D. ORM evidence refresh (ADR-DB1-002)

Comparison re-run on current official docs (evidence date 2026-07-15):

| Capability | Drizzle | Prisma | TypeORM | MikroORM |
| --- | --- | --- | --- | --- |
| Partial (unique) index | Yes, stable (`uniqueIndex().where()`) | Yes — **Preview** (`partialIndexes`, `where` arg) | Yes — `@Index({where})`, PG-only | Yes — raw `CREATE INDEX` expression callback |
| CHECK constraint | Yes, stable (`check()`) | Not in DSL — customize-migration workflow | Yes — `@Check` decorator | Yes — `@Check` (postgres driver) |
| Transactions/isolation/savepoints | Yes (isolationLevel; nested tx = savepoints) | Interactive tx + isolation; no savepoint API | Isolation on tx; savepoints not first-class | Yes (UoW-managed) |
| Row locking | `.for('update')` — API present, historically under-documented; `noWait` bug #3554 **closed** (PR #3555) → DB6 spike-gated | Raw SQL | Pessimistic lock modes | LockMode API |
| Raw SQL escape hatch | Yes (`sql` tag) | Yes (`$queryRaw`) | Yes | Yes |
| Migration reviewability/history/drift | Plain SQL + snapshots; weaker drift tooling → bespoke verify command (ADR-DB1-004) | SQL, checksummed, best drift tooling | Generated, documented sync limits for some indexes | Generator, snapshot-based |
| Maturity/upgrade risk | Pre-1.0 churn → strict exact pins | Mature; Preview churn on needed feature | Mature; weakest compile-time typing of the four | Mature; UoW concept surface |

**Conclusion:** no capability exclusivity exists. **Drizzle remains
`Accepted`** on overall fit: stable non-Preview declaration of the
invariant-bearing structures inside the schema source of truth, SQL-like
explicit model without UoW/Active-Record magic, reviewable plain-SQL
migrations, sanctioned raw-SQL escape hatch. Prisma rejected on
Preview-dependence for a load-bearing index + DSL-external CHECKs; TypeORM
on documented index-sync limitations + weakest typing; MikroORM on UoW
implicit-flush fit + partial indexes dropping to raw DDL strings.
prisma/prisma#6974 downgraded to **historical** evidence with an explicit
status-changed note. Added: package-pin policy (exact `drizzle-orm`/
`drizzle-kit`/driver pins, compatibility never assumed, spike before schema
foundation, lockfile = reproducibility, upgrades reviewed) and expanded
mandatory DB6 row-lock spike (plain `FOR UPDATE`, `NOWAIT`, `SKIP LOCKED`,
in-transaction behavior, concurrent reservation, generated-SQL assertions;
documented raw-SQL adapter on failure). DEC-01/DEC-02 remain **Accepted**.

## E. Collation correction (ADR-DB1-001)

- **Default direction:** UTF-8 + UTC baseline; database default collation
  `C`, scoped to **technical deterministic ordering/equality** (codes,
  tokens, slugs, hashes).
- **Removed claim:** "`C` removes the musl-vs-glibc index-corruption class
  of bugs" → replaced with bounded wording: bytewise semantics reduce
  locale-library dependence *for comparisons deliberately assigned bytewise
  behavior*; not a general immunity; locale-aware collations still require
  collation-version drift checks and REINDEX discipline.
- **Vietnamese user-facing ordering/search:** explicit locale-aware policy
  designed at **DB4/DB5** — per-column/per-index/per-query ICU collations
  (e.g. `vi-x-icu`), nondeterministic collations for case/accent-insensitive
  comparison where required (documented costs accepted), or application-side
  sorting; cluster default never changed for this.
- **Hashing:** canonical design-document hashing (RFC 8785 + SHA-256,
  ADR-DB1-012) is independent of database collation — reaffirmed.
- **DB6 verification:** initdb encoding/collation/ctype/provider recorded
  and asserted (also in ADR-DB1-004 parity checks); **backup manifest**
  records locale/collation config (ADR-DB1-014).

## F. Documents changed

- `docs/adr/database/ADR-DB1-001-POSTGRESQL-VERSION.md` — patch governance,
  16.14 evidence, DB6 tag handoff, collation scoping, refs + evidence dates.
- `docs/adr/database/ADR-DB1-002-ORM-QUERY-LAYER.md` — comparison re-run,
  exclusivity claim removed, refreshed rationale, row-lock risk posture,
  package-pin policy, refs + evidence dates.
- `docs/adr/database/ADR-DB1-003-MIGRATION-STRATEGY.md` — drizzle-kit exact
  pin deferred-detail cross-ref.
- `docs/adr/database/ADR-DB1-004-SCHEMA-VERSIONING-AND-GIT-TRACEABILITY.md`
  — environment-parity assertion (PG major + collation baseline).
- `docs/adr/database/ADR-DB1-014-BACKUP-AND-RESTORE.md` — manifest fields
  (exact version, locale/collation), pre-restore target check, separate
  major-upgrade runbook.
- `docs/database/DB1_DECISION_MATRIX.md` — DEC-01/02/03/11/12 entries +
  correction banner.
- `docs/database/DB1_IMPLEMENTATION_HANDOFF.md` — DB6 duties (patch update,
  exact pins, row-lock spike, collation verification); register rows 13–14.
- `docs/database/DB1_COMPLETION_REPORT.md` — §4 evidence flag + §9 addendum.
- `docs/database/README.md`, `docs/database/DB_ROADMAP.md` — correction
  notes.
- `docs/database/DB0_OPEN_DECISIONS.md` — §5 rows DEC-01/DEC-03 amended
  (original DB0 register untouched).
- `docs/12-DECISION-LOG.md` — **D-038 appended** (D-037 untouched).
- `docs/database/DB1_CORRECTION_REPORT.md` — this file (new).

## G. Scope compliance

No changes to: `package.json`, lockfile, any `.ts`/`.js` product code, any
`.sql`, migrations, Docker Compose, schema/entity, backend code. Commit
`a0e29b4` not amended/squashed. DB2 not started. Docker image not changed
(handoff instructs DB6).

## H. Validation

- **Factual:** exclusivity claim removed (grep over ADRs/matrix/report);
  #6974 cited only as historical with status-changed note; Prisma Preview
  status recorded; TypeORM/MikroORM capabilities per official docs; 16.6 no
  longer described as approved baseline; 16.14 recorded as current at
  correction date; collation claims bounded.
- **Decision:** DEC-01 selected + refreshed rationale; DEC-02 relation to
  ADR-DB1-003 intact; DEC-03 major + patch governance explicit; DEC-11/12
  updated; GAP-02 still resolved; DB6 handoff contains patch update, exact
  pins, row-lock spike, collation verification.
- **Scope:** `git status`/`git diff --stat` show docs-only (see §I).
- **Links:** relative links in all touched files checked and resolving;
  official URLs listed with evidence dates in ADR references.

## I. Commit

Docs-only correction commit (subject:
`docs(database): correct DB1 evidence and PostgreSQL baseline`), separate
from `a0e29b4`; hash recorded in the final response. Not pushed.

## J. Verdict

```text
DB1 CORRECTION PASS
```

Consolidated: **DB1 PASS WITH DEFERRED PARAMETERS** (unchanged).

## Official evidence (all checked 2026-07-15)

- PostgreSQL versioning policy (16.14 current; EOL 2028-11-09; "always run
  the current minor") — https://www.postgresql.org/support/versioning/
- PostgreSQL collation support — https://www.postgresql.org/docs/16/collation.html
- Drizzle indexes & constraints — https://orm.drizzle.team/docs/indexes-constraints
- Drizzle transactions — https://orm.drizzle.team/docs/transactions
- drizzle-kit generate — https://orm.drizzle.team/docs/drizzle-kit-generate
- Drizzle documented risks — https://github.com/drizzle-team/drizzle-orm/issues/2875 ,
  https://github.com/drizzle-team/drizzle-orm/issues/3554 (closed, PR #3555)
- Prisma indexes (partial indexes, `partialIndexes` Preview) —
  https://www.prisma.io/docs/orm/prisma-schema/data-model/indexes
- Prisma customizing migrations —
  https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations
- Prisma historical issue (status changed) — https://github.com/prisma/prisma/issues/6974
- TypeORM indices (partial `where`, PG-only; sync limitations) —
  https://typeorm.io/docs/advanced-topics/indices/ ; https://typeorm.io/docs/indexes/
- TypeORM `@Check` — https://typeorm.io/docs/help/decorator-reference/
- MikroORM `@Check` + index expressions — https://mikro-orm.io/docs/defining-entities
