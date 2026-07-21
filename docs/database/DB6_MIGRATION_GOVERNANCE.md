# DB6 — Migration Governance

**Date:** 2026-07-18 · **Slice:** DB6-C0
**Normative:** ADR-DB1-003 (migration strategy), ADR-DB1-004 (schema versioning
and Git traceability), ADR-DB1-005 (schema organisation), ADR-DB1-013
(multi-machine and Docker volumes)

This document is binding for every schema change from DB6 onward.

---

## 1. Schema source of truth

| Artifact | Location | Role |
|---|---|---|
| Schema (TypeScript) | `packages/database/src/schema/**` | **the** source of truth |
| Schema entrypoint | `packages/database/src/schema/index.ts` | what drizzle-kit reads |
| Migrations (SQL) | `packages/database/migrations/*.sql` | committed, immutable once shared |
| Migration metadata | `packages/database/migrations/meta/` | drizzle-kit journal + snapshots |
| Applied history | `drizzle.__drizzle_migrations` (in the database) | id, hash, created_at |
| Tool config | `packages/database/drizzle.config.ts` | dialect, paths, `public` filter |

A table that is not exported from `schema/index.ts` is invisible to migration
generation. The parity gate cross-checks that export list against
`DB6_SCHEMA_IMPLEMENTATION_MANIFEST.md`.

All application tables live in `public` (ADR-DB1-005). The `drizzle` schema
holds only the tool's history table — an infrastructure exception, not an
application schema.

---

## 2. The only permitted change path

```text
edit schema TypeScript
  → pnpm db:generate --name=<verb>_<object>
  → READ the generated SQL          ← mandatory, not optional
  → pnpm db:migrate
  → pnpm db:status                  ← must report up-to-date
  → commit schema + migration together
```

### 2.1. Generation

```bash
pnpm db:generate --name=create_catalog_tables     # from the schema diff
pnpm db:generate:custom --name=add_immutability_triggers   # empty file, hand-authored
```

`--name` is **mandatory**. A migration called `0007_lucky_wolverine` is
unreviewable six months later. Filenames follow
`<sequence>_<verb>_<object>.sql`.

### 2.2. Human review — the gate that actually catches things

The generated SQL **must be read before it is applied**. During DB6-C0 this
step caught three defects, and **none of them produced an error from any
tool**:

- CHECK constraints emitted as `in ($1, $2, $3)` — parameter placeholders
  written literally into DDL, producing a constraint with the wrong meaning;
- primary keys named `<table>_pkey` by the tool instead of `pk_<table>`;
- a missing foreign key on a column that existed and typechecked.

Review checklist per migration:

1. Only the intended objects change; no unrelated diff.
2. Constraint/index names match ADR-DB1-006 and the DB5 name map.
3. No `$1`-style placeholder anywhere in DDL.
4. Partial predicates are literal, immutable, and match the intended query.
5. `DESC` / `NULLS FIRST` are present exactly where the index manifest says.
6. No index duplicates a constraint's backing index.
7. No destructive statement (`DROP`, `TRUNCATE`, type narrowing) unless that
   is the reviewed intent.
8. FK edges present for every `REL-*` the group owns.

### 2.3. Apply

```bash
pnpm db:migrate    # applies pending migrations, in order
pnpm db:status     # exit 0 only when database matches repository
```

`db:migrate` asserts the database baseline (version, encoding, collation,
timezone) **before** applying anything. Applying a schema to a wrongly
initialised database would otherwise succeed and leave a subtly wrong database.

---

## 3. Immutability of shared migrations

**A migration that has been pushed is immutable.** Never edit, rename, reorder
or delete it.

drizzle-kit records a per-file hash in `drizzle.__drizzle_migrations`. Editing
an applied migration changes its hash, and `pnpm db:status` reports
`checksum-mismatch` and exits non-zero. Verified: tampering with `0000` was
detected; restoring the file returned the status to `up-to-date`.

**Forward-fix only.** A mistake in an applied migration is corrected by a *new*
migration. This was exercised in DB6-C0: a missing FK (REL-003) in `0000` was
fixed by `0001_add_admin_accounts_successor_fk.sql`, not by editing `0000`.

A migration may be amended **only** while it is unpushed, unapplied by anyone
else, and in the same working session — and even then, regenerating is safer.

---

## 4. Failure and recovery

### 4.1. A migration fails partway

PostgreSQL DDL is transactional, so a failed migration rolls back as a unit and
is **not** recorded in the history table. The database is left at the last
successfully applied migration.

```bash
pnpm db:status     # shows how far the database actually got
```

Then: fix the schema, regenerate (or hand-fix the not-yet-shared file), and
re-apply. If the migration was already shared, write a new forward migration
instead.

Exception: `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block.
It ships as its own non-transactional step and, on failure, leaves an `INVALID`
index that must be dropped and rebuilt — a DB10 runbook item. It is not used at
launch, because a fresh install builds indexes on empty tables.

### 4.2. No down migrations

Down migrations are **not** a production recovery mechanism and are not
authored. Reasons: a down migration is rarely exercised, and running one
against real data usually destroys the data the rollback was meant to protect.
Production recovery is forward-fix plus, if data is affected, restore from
backup (ADR-DB1-014).

### 4.3. `push` is prohibited

`drizzle-kit push` diffs the schema straight into a database with no migration
file. It is never used against dev, CI, or production: it leaves no reviewable
artifact, no history row, and no checksum. Schema reaches a database only
through a committed migration.

---

## 5. Branch switching and drift

`pnpm db:status` classifies the database into exactly one state:

| State | Meaning | Action |
|---|---|---|
| `up-to-date` | database matches repository | none |
| `pending` | repository has migrations the database lacks | `pnpm db:migrate` |
| `uninitialised` | no history table | start the database, then migrate |
| `ahead-of-repository` | database has **more** migrations than the branch | switch back to that branch, or `pnpm db:reset` |
| `checksum-mismatch` | an applied migration file was edited | restore the file, or `pnpm db:reset` |

The tool **never auto-repairs**: it does not rewrite history, drop objects, or
recreate the database. Auto-repair is how a "working" database silently stops
matching the repository.

Switching to a branch with **fewer** migrations produces
`ahead-of-repository`. There is no down path, so the local remedy is a volume
reset — acceptable because a development database is never a source of truth.

---

## 6. Fresh install

```bash
cp .env.example .env          # adjust POSTGRES_PORT if 5432 is taken
pnpm db:up                    # postgres 16.14, locale C, UTF8, UTC
pnpm db:migrate
pnpm db:status                # expect: up-to-date
```

Every migration runs in order (INV-28). Indexes are plain in-migration builds
because the database is empty.

Seeds are **never** part of a migration (ADR-DB1-015). Reference/system data
loading is DB9's.

---

## 7. Upgrade path

From DB6 onward the history is linear and forward-only.

| From | To | Path |
|---|---|---|
| empty database | current | apply all migrations |
| any applied prefix | current | apply the remainder |
| database ahead of branch | — | **unsupported**; reset the local volume |

There is no pre-DB6 upgrade case: DB6 introduces the first physical schema, no
data existed before it, and no backfill is required. The only historical
consideration is disposing of a development volume initialised before the
locale baseline existed (DEV-DB6-001, ADR-DB1-013).

**Downgrade is not supported and is not claimed.**

---

## 8. Local disposable reset

```bash
pnpm db:reset      # destroys the volume, recreates it, then: pnpm db:migrate
```

Destructive and local-only. It refuses to run when `NODE_ENV` is `production`
or `staging`, and prompts unless `--yes` is passed. Required when:

- the volume predates the `--locale=C` baseline (`initdb` runs once per volume
  and cannot be re-run in place);
- the local database is `ahead-of-repository` after a branch switch;
- an applied migration file was edited and the file cannot be restored.

Back up first if local data matters. It normally does not: everything is
reproducible from migrations plus seeds.

---

## 9. Custom SQL migrations

Used only where the ORM cannot express the object — in practice triggers and
functions (DB6 spike §9). Locking, partial uniques, `NULLS FIRST`, `DESC` keys
and explicit naming are all expressible in the schema and must **not** be
hand-authored.

Rules for hand-authored SQL:

- generated with `pnpm db:generate:custom` so it joins the same history;
- functions are schema-qualified and set `SET search_path = pg_catalog, public`;
- names follow `tg_<table>__<purpose>` / `fn_<purpose>`;
- no dynamic SQL unless unavoidable; no business orchestration in a trigger; no
  external side effects; no hidden lifecycle transitions;
- values are literals or bound parameters — **never string concatenation**.

---

## 10. Traceability

Each migration is traceable to its checkpoint and design IDs (ADR-DB1-004):

- the schema file carries `TBL-*`, `COL-*`, `REL-*`, `CST-*`, `IDX-*` in its
  header comment;
- the manifests map every ID to its physical object, migration and status;
- the commit message names the group and the IDs it implements;
- deviations are recorded as `DEV-DB6-*` in the deviation register, never
  silently.

---

## 11. Commands

| Command | Purpose |
|---|---|
| `pnpm db:up` / `db:down` / `db:logs` | dev PostgreSQL lifecycle |
| `pnpm db:generate --name=<slug>` | generate a migration from the schema diff |
| `pnpm db:generate:custom --name=<slug>` | empty migration for hand-authored SQL |
| `pnpm db:migrate` | apply pending migrations (asserts baseline first) |
| `pnpm db:status` | schema/migration state and drift; exit 0 only when clean |
| `pnpm db:reset` | destroy and recreate the local volume (destructive, local-only) |

---

## 12. Standing commit-history rule (DB10-CP0 addendum)

The repository's standing rule across DB6–DB10 is **no amend, no squash, no
rewrite, no force-push** on `production`. One deviation is on the record and
is recorded here rather than left in a single phase report:

| Deviation | Commit | What happened | Reconciliation |
|---|---|---|---|
| `DEV-GOV-001` | `623eb78` — `docs(database): lock DB9 performance scope` | The commit was created through a shell whose quoting mangled the subject line down to a single `@`. It was amended seconds later with a message file. The tree was byte-identical before and after; no later commit had been created. | Disclosed by `DB9_COMPLETION_REPORT.md` §N at the time. Verified at DB10-CP0: the current hash and subject are correct, `git rev-list --parents` shows a single-parent chain from `f7ef9ec` to HEAD, and **no committed artifact anywhere in the repository references the superseded hash**. Reconciled additively; history is not rewritten. |

**The rule is now absolute, including for this failure mode.** A malformed
commit message is repaired by a follow-up commit that states the correction,
never by `--amend`. Compose commit messages with a message file
(`git commit -F <file>`) rather than an inline string when the message
contains anything a shell may interpret.
