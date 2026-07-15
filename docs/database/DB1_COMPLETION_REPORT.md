# DB1 — Completion Report

**Checkpoint:** DB1 — Persistence Architecture & ADR Lockdown
**Date:** 2026-07-15 · **Audited Git HEAD (start):** `563d9863c5d9591095038a28887e217058d816e4` · **Branch:** `production`
**Nature:** Decision + ADR documentation only. No schema, migration, ORM install, entity, seed, test harness, Docker change, or backend code was created.

---

## 1. Preflight

- **Branch:** `production`; **initial HEAD:** `563d986`
  ("docs(database): complete DB0 discovery and requirement matrix").
- **Initial working tree:** clean.
- **DB0 commit:** exists at HEAD (`563d986`); all 12 DB0 files present and
  tracked. No governance blocker.
- **Persistence artifacts after DB0:** none new — no ORM/migration
  dependency in any `package.json`, no `.sql` files, `postgres:16.6-alpine`
  in Compose unchanged, package stubs still empty.

## 2. DB0 input validation

All 12 DB0 files were read in full, plus the authoritative sources
(`00/01/04/05/06/09/10/12/13`, `SYSTEM_ARCHITECTURE`,
`REPOSITORY_STRUCTURE`, `BACKEND_CONVENTIONS`, `LOCAL_DEVELOPMENT`,
`docker-compose.dev.yml`, `.env.example`). Counts confirmed against
roll-ups: **129 requirements, 58/58 domains, 23 lifecycles, 35 invariants,
33 queries, 30 open decisions (19 × B1), 12 conflicts/gaps.** GAP-02 and
GAP-07 (DB1-owned) are addressed by ADR-DB1-001 and ADR-DB1-014
respectively; GAP-01/03/05/06/08/09/11/12 remain with their DB2/DB3/DB4
owners, untouched.

## 3. Decisions and deliverables

- 18 ADRs created under `docs/adr/database/` (no prior ADR convention
  existed in the repository; this path follows the DB1 task and the
  `DB_ROADMAP` "ADRs under `docs/adr/`" note).
- Decision coverage: all 19 B1 decisions mapped — see
  [`DB1_DECISION_MATRIX.md`](./DB1_DECISION_MATRIX.md) (per-decision status,
  rationale, deferred parameters, checkpoints, reversal cost, risks,
  multi-machine compatibility).
- **Tier A (14): all `Accepted`.** DEC-01, 02, 03, 04, 05, 07, 08, 10, 11,
  12, 17, 18, 19, 20.
- **Tier B (5): all `Accepted with Deferred Parameters`** with named owners
  and acceptance conditions — DEC-06, 09, 13, 14, 15
  ([`DB1_IMPLEMENTATION_HANDOFF.md`](./DB1_IMPLEMENTATION_HANDOFF.md) §9).
- B2/B3/NB decisions (DEC-16, 21–30): confirmed still open and not
  precluded by any DB1 decision (handoff §10).
- Updates: `DB0_OPEN_DECISIONS.md` §5 (append-only resolution table),
  `DB_ROADMAP.md` (DB0/DB1 status note; locked order unchanged),
  `README.md` (current checkpoint, ADR index, no-schema rule, DB2 gate),
  `docs/12-DECISION-LOG.md` (append-only D-037; O-001's ORM/migration
  portion resolved, remainder explicitly still open).

## 4. Evidence and research

Official sources cited inside each ADR. Key capability evidence:

- Drizzle: partial unique index (`uniqueIndex().where()`), CHECK
  constraints, named FKs — orm.drizzle.team/docs/indexes-constraints;
  isolation levels + savepoints — /docs/transactions; SQL migration files,
  `--custom`, timestamped ordering — /docs/drizzle-kit-generate.
- Honest limitation recorded: `SELECT ... FOR UPDATE` exists in Drizzle's pg
  query builder but is under-documented upstream (drizzle-orm issues #2875,
  #3554) → ADR-DB1-002 mandates a DB6 spike and sanctions raw SQL fallback;
  DB8 tests close the loop.
- ~~Prisma partial-index limitation: prisma/prisma#6974.~~ **Superseded by
  DB1-C1 (see §9):** current official Prisma docs support partial indexes
  via `where` behind the `partialIndexes` Preview feature; #6974 is
  historical evidence only.
- RFC 8785 (JCS), RFC 9562 (UUIDv7), FIPS 180-4 (SHA-256), PostgreSQL 16
  docs (pg_dump/pg_restore, identity columns, template databases,
  versioning policy).
- **No spike was executed in DB1** — no question required code to answer at
  this checkpoint; the one genuinely open behavior (Drizzle locking SQL
  output, exact history-table semantics) is explicitly assigned to the DB6
  spike rather than answered by unverifiable assertion. No spike artifacts
  exist.

## 5. Scope compliance

Confirmed **not** done: no ORM/migration dependency installed; no
entity/schema file; no SQL/migration/table/column/index/database enum; no
Docker Compose change; no backend/seed/test code; no DB2 conceptual model;
no DB3 final lifecycle states; no B2/B3/NB decision resolved; no DB0 file
rewritten beyond append-only status/link updates; product docs untouched
except the append-only Decision Log entry.

## 6. Validation performed

1. **Decision coverage:** grep for all 19 B1 IDs in the matrix → all
   present; each has ADR, status, selected direction, REQ/INV sources,
   consequences, implementation + verification checkpoints.
2. **ADR count/template:** 18 files, each with the mandatory section set and
   Status/Date/HEAD/ID headers; no B1 decision maps to a `Deferred`-only
   ADR.
3. **Link check:** all relative `.md` links in new/updated docs resolve
   (script over `docs/adr/database/*`, `docs/database/DB1_*`, README,
   roadmap, open-decision register). The only pre-report misses were links
   to this file before it was written.
4. **Cross-decision consistency:** checked and recorded in
   `DB1_DECISION_MATRIX.md` (final section) — ORM↔migration tool,
   forward-only↔volume policy, version pin↔backup compat, enum↔provisional
   states, test strategy↔locking/constraint proofs, hashing
   reproducibility, seeds-outside-migrations. No conflicts.
5. **Scope scan:** `git status`/`git diff --stat` show only
   `docs/adr/` (new), `docs/database/` (3 new + 3 updated) and
   `docs/12-DECISION-LOG.md` (append). No changes to `package.json`,
   lockfile, `infrastructure/`, `.env.example`, or any source file.
6. **No line-number identities** used; sources cited by file + heading/ID;
   audited HEAD/date present in every deliverable.

## 7. Git diff summary

- Modified: `docs/12-DECISION-LOG.md` (+D-037, append-only),
  `docs/database/DB0_OPEN_DECISIONS.md` (+§5, append-only),
  `docs/database/DB_ROADMAP.md` (status note), `docs/database/README.md`
  (status + ADR index).
- Added: `docs/adr/database/ADR-DB1-001…018` (18 files),
  `docs/database/DB1_DECISION_MATRIX.md`,
  `docs/database/DB1_IMPLEMENTATION_HANDOFF.md`,
  `docs/database/DB1_COMPLETION_REPORT.md` (this file).
- Zero code/schema/config changes.

## 8. Final verdict

**DB1 PASS WITH DEFERRED PARAMETERS.**

Every architecture decision required by the DB1 exit gate is locked
(`Accepted`); the five Tier B decisions are `Accepted with Deferred
Parameters` where the remaining items are business parameters/details owned
by DB3/DB4/DB6/DB10 with explicit acceptance conditions (handoff §9). No
architecture question blocks DB2. DB2 does not start in this checkpoint.

## 9. Addendum — DB1-C1 correction (2026-07-15, applied after `a0e29b4`)

A correction checkpoint audited this report's evidence and amended the DB1
documents (full record: [`DB1_CORRECTION_REPORT.md`](./DB1_CORRECTION_REPORT.md)):

1. **PostgreSQL baseline:** the `16.6-alpine` exact-tag pin was stale
   repository state, not a patch policy. ADR-DB1-001 now locks **major 16 +
   governed reviewed patch pin**; official current 16.x at correction date
   is **16.14**; DB6 must move Compose to `16.14-alpine` or a newer reviewed
   16.x. Backup manifests record exact version + locale/collation
   (ADR-DB1-014).
2. **ORM evidence:** the claim that Drizzle is "the only candidate"
   expressing partial unique indexes + CHECK constraints was wrong per
   current official docs (Prisma: Preview `where`; TypeORM: `@Index({where})`
   + `@Check`; MikroORM: `@Check` + raw index expressions). ADR-DB1-002's
   comparison was re-run; **Drizzle remains `Accepted`** on overall-fit
   grounds (stable non-Preview declarations, SQL-explicit model, reviewable
   SQL migrations); a package-pin/compatibility-spike policy and an expanded
   DB6 row-lock spike were added.
3. **Collation:** the absolute "removes the musl-vs-glibc index-corruption
   class of bugs" claim was narrowed to what PostgreSQL docs support; `C`
   default is scoped to technical ordering; Vietnamese user-facing
   sort/search gets explicit ICU/locale-aware design at DB4/DB5;
   collation-version drift checks remain required; hashing is
   collation-independent.

The consolidated verdict **remains DB1 PASS WITH DEFERRED PARAMETERS**
(correction verdict: DB1 CORRECTION PASS).
