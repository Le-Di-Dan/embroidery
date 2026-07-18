# DB6 — Version & Capability Matrix

**Date:** 2026-07-18 · **Git HEAD at start:** `96aabc9`
**Checkpoint:** DB6 — Physical Schema, Migration & Persistence Foundation
**Closes:** DB5-A05 (package compatibility), DB5-A06 (stale patch pin),
DB5-A07 (ICU/collation), DB5-A13 (identifier length), DB5-A14 (extensions)
**Normative sources:** ADR-DB1-001 (PostgreSQL version), ADR-DB1-002 (ORM),
ADR-DB1-003 (migrations), ADR-DB1-007 (ID strategy)

All versions below are **exact pins**. No caret/tilde range is used for any
persistence-foundation package (DB5-A05). Evidence for every row was produced
by executing against the pinned artifacts, not by reading documentation alone.

---

## 1. PostgreSQL

| Item | Value |
|---|---|
| Major | 16 (supported to 2028-11-09, ADR-DB1-001) |
| Patch | **16.14** |
| Image | `postgres:16.14-alpine` |
| Digest | `sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777` |
| Released | 2026-05-14 |
| Previous repository state | `postgres:16.6-alpine` (stale, DB5-A06) |
| Build | `PostgreSQL 16.14 on x86_64-pc-linux-musl, gcc (Alpine 15.2.0)` |
| Server encoding | `UTF8` |
| TimeZone | `UTC` |
| Locale provider | `c` (libc) |
| `datcollate` / `datctype` | `C` / `C` — **requires explicit initdb args**, see §1.2 |
| `max_identifier_length` | 63 |

### 1.1. Patch-bump justification (DB5-A06)

**Precise statement of the evidence:** the PostgreSQL 16.14 release family
announcement (2026-05-14, covering 18.4 / 17.10 / 16.14 / 15.18 / 14.23) lists
**11 security issues**. **Nine of the listed issues affect PostgreSQL 16**; of
those nine, **four carry CVSS 8.8**. The other two listed issues do not apply
to the 16 branch.

Source: <https://www.postgresql.org/about/news/postgresql-184-1710-1614-1518-and-1423-released-3297/>
· evidence date 2026-07-18.

The nine issues affecting PostgreSQL 16:

| CVE | Summary | CVSS |
|---|---|---|
| CVE-2026-6473 | Integer wraparound causing allocation undersizing | 8.8 |
| CVE-2026-6475 | `pg_basebackup`/`pg_rewind` symlink following | 8.8 |
| CVE-2026-6477 | libpq `lo_*` stack buffer overwrite | 8.8 |
| CVE-2026-6637 | `refint` module stack buffer overflow | 8.8 |
| CVE-2026-6479 | SSL/GSS uncontrolled recursion DoS | 7.5 |
| CVE-2026-6478 | MD5 password timing channel | 6.5 |
| CVE-2026-6472 | Missing authorization in `CREATE TYPE` multirange | 5.4 |
| CVE-2026-6474 | `timeofday()` memory disclosure | 4.3 |
| CVE-2026-6638 | `REFRESH PUBLICATION` SQL injection via table name | 3.7 |

Also relevant to this project's correctness: 16.x fixed **queries returning
incorrect results with nondeterministic collations over unique indexes**, and
restored **deferrability for foreign-key triggers**. Both touch mechanisms DB4
relies on. tzdata updated to 2026b.

Floating tags (`postgres:16`, `postgres:16-alpine`) remain **prohibited**
(ADR-DB1-001 option 3 rejected).

### 1.2. Locale baseline — DEV-DB6-001

The stock image initialises `datcollate = en_US.utf8`. ADR-DB1-001 and
`DB5_DB6_HANDOFF.md` §3 both assume a **`C` default throughout** (DB5 declares
"Collation clauses: none — `C` default throughout"). Accepting the image
default would have silently built every text index under `en_US.utf8`.

Resolved by initialising with `POSTGRES_INITDB_ARGS=--locale=C --encoding=UTF8`.
Verified on the pinned image:

```text
datname | enc  | datcollate | datctype | datlocprovider
spike   | UTF8 | C          | C        | c
SELECT 'Z' < 'a'  →  t          (bytewise, C semantics)
```

This is a **dev-volume-affecting change**: an existing volume initialised
before this setting keeps `en_US.utf8`, because `initdb` runs only once.
No production data exists (DB6 is the first physical schema), so the remedy is
volume disposal per ADR-DB1-013. Detection and reset are covered in
`DB6_SCHEMA_STATUS_AND_DRIFT.md` and `DB6_MULTI_MACHINE_WORKFLOW.md`.

### 1.3. ICU availability (DB5-A07 — closed)

The Alpine/musl variant **does** ship ICU, and keeps it under a `C` database
locale:

| Probe | Result |
|---|---|
| ICU collations present | **908** |
| `vi-x-icu` | present, `collisdeterministic = t` |
| `vi-VN-x-icu` | present, `collisdeterministic = t` |
| Explicit ICU sort under `C` database locale | works (`'Đà Nẵng' COLLATE "vi-x-icu" < 'Hà Nội'` → `t`) |
| `C`, `POSIX`, `ucs_basic` | present, no `collversion` (no drift surface) |

Consequences:

- Technical identifiers keep **deterministic bytewise** comparison — no
  nondeterministic collation is used for unique/technical columns, as DB5-A07
  requires.
- Vietnamese user-facing sort is **available without an extension** whenever a
  future checkpoint needs it, via an explicit `COLLATE "vi-x-icu"` clause.
  Both Vietnamese collations are deterministic, so they remain B-tree- and
  equality-compatible.
- **No collated index is built at launch** (`DB5_DB6_HANDOFF.md` §2 phase 5).
- ICU collations carry a `collversion`; if one is ever adopted, collation-drift
  checking on restore becomes a DB10 runbook obligation.

### 1.4. Extensions (DB5-A14)

| Extension | Available | Installed | Note |
|---|---|---|---|
| `btree_gist` | 1.7 | **no** | would be needed only by IDX-056; conditional |
| `pg_trgm` | 1.6 | **no** | fuzzy search, phase 5, not at launch |

**No extension is installed.** The whole launch index set runs on core
PostgreSQL 16 B-tree, keeping image/backup/restore free of extension coupling
(ADR-DB5-002 R7). IDX-056 stays conditional; the publish-transaction guard
remains the primary defense for CST-046.

---

## 2. Runtime and toolchain

| Package | Exact pin | Role | Evidence |
|---|---|---|---|
| `drizzle-orm` | **0.45.2** | schema source of truth, query builder | §3 spikes 1–14 |
| `drizzle-kit` | **0.31.10** | migration generate/apply/status | §3 spikes 15–20 |
| `pg` (node-postgres) | **8.22.0** | PostgreSQL driver — **DB1 deferred choice, selected here (DEV-DB6-003)** | §3 spikes 5–14 |
| `@types/pg` | **8.20.0** | driver types | typecheck |
| `uuidv7` | **1.2.1** | RFC 9562 UUIDv7 — **ADR-DB1-007 deferred choice, selected here (DEV-DB6-004)** | §4 |
| Node.js | `>=22` (verified 22.14.0) | runtime | existing `engines` |
| pnpm | 11.5.2 | package manager | existing `packageManager` |
| TypeScript | `^5.9.3` | strict mode | existing workspace pin |
| NestJS | 11.x | API/worker host | existing |

### 2.1. Driver selection — `pg` over `postgres.js` (DEV-DB6-003)

ADR-DB1-002 §223 explicitly deferred `pg` vs `postgres.js` to DB6.

`pg` selected because:

- It is the driver drizzle-kit itself uses to apply migrations (`Using 'pg'
  driver for database querying`), so migration and runtime paths share one
  driver rather than two connection stacks.
- Pool semantics map cleanly onto the NestJS lifecycle and onto explicit
  transaction boundaries (ADR-DB1-009): a transaction holds one checked-out
  client, which is exactly what row locking requires.
- SQLSTATE surfacing is direct (`error.code`), which the lock/claim paths
  depend on — verified `55P03` for both `NOWAIT` and `lock_timeout` (§3).
- `postgres.js` offers no capability this schema needs that `pg` lacks; it
  would add a second connection model for no gain.

### 2.2. TypeScript peer constraint

TypeScript is pinned `^5` in every workspace package. A TypeScript 7 hoist
breaks type-aware ESLint across the monorepo, so the persistence packages added
by DB6 must carry the same `^5` pin rather than inheriting a floating range.

---

## 3. Capability results (summary)

Full transcripts in [`DB6_CAPABILITY_SPIKE_REPORT.md`](./DB6_CAPABILITY_SPIKE_REPORT.md).

| # | Capability | Required by | Result | Mechanism |
|---|---|---|---|---|
| 1 | `CHECK` constraint, named | CST-060..074 | PASS | drizzle `check()` |
| 2 | Composite `UNIQUE` | CST-002..051 | PASS | drizzle `unique()` |
| 3 | Partial unique index | CST-003/005/…/046 | PASS | drizzle `uniqueIndex().where()` |
| 4 | Partial predicate rejects volatile fn | DB5-A03 | PASS (PG rejects) | engine-enforced |
| 5 | `NULLS FIRST` on ASC key | **IDX-088** | PASS | `.asc().nullsFirst()` |
| 6 | Explicit `DESC` keys | IDX-073/076/079/081/095/096/098/108 | PASS | `.desc()` |
| 7 | `numeric(14,2)` | ADR-DB4-001 | PASS | drizzle `numeric()` |
| 8 | `timestamptz` | ADR-DB1-006 | PASS | drizzle `timestamp({withTimezone})` |
| 9 | `jsonb` | ADR-DB4-004 | PASS | drizzle `jsonb()` |
| 10 | `bigint GENERATED ALWAYS AS IDENTITY` | ADR-DB1-007 cat. 2 | PASS | `.generatedAlwaysAsIdentity()` |
| 11 | Explicit `pk_`/`fk_`/`uq_` names | ADR-DB1-006 | PASS | **table-level builders only** |
| 12 | `FOR UPDATE` | CC-10/12/20..24 | PASS | `.for('update')` |
| 13 | `FOR UPDATE NOWAIT` | CC-27 | PASS | `.for('update',{noWait})` |
| 14 | `FOR UPDATE SKIP LOCKED` | **CC-25 outbox** | PASS | `.for('update',{skipLocked})` |
| 15 | Transaction commit/rollback | ADR-DB1-009 | PASS | `db.transaction()` |
| 16 | Savepoint / nested tx | ADR-DB1-009 | PASS | nested `tx.transaction()` |
| 17 | Isolation level config | CC-* | PASS | `{isolationLevel}` |
| 18 | Parameterised raw SQL | §23 security | PASS | `sql` template → `$1` |
| 19 | Custom SQL migration (trigger/function) | CST-090..100 | PASS | `generate --custom` |
| 20 | Migration generate/apply/checksum | ADR-DB1-003 | PASS | `drizzle.__drizzle_migrations` |
| 21 | Single `public` schema | ADR-DB1-005 | PASS | no other schema created |
| 22 | Partial index **actually used** | DB5 spike 4 | PASS | `Index Only Scan`, 50k rows |

**Raw-SQL fallback required for:** triggers/functions only (expected — no ORM
declares these). **Not** required for locking, partial uniques, `NULLS FIRST`,
`DESC`, or explicit naming, all of which DB5 listed as fallback candidates.

---

## 4. UUIDv7 library (ADR-DB1-007, DEV-DB6-004)

ADR-DB1-007 requires a "single vetted RFC 9562 UUIDv7 library" honouring RFC
9562 monotonicity guidance. Two candidates were measured over 20,000 rapid
generations each:

| Library | Version | Strictly monotonic | Unique | Lexicographic == generation order | Version nibble |
|---|---|---|---|---|---|
| `uuid` | 14.0.1 | yes | yes | yes | 7 |
| **`uuidv7`** | **1.2.1** | **yes** | **yes** | **yes** | **7** |

`uuidv7@1.2.1` selected: purpose-built RFC 9562 implementation with documented
same-millisecond counter monotonicity and no unused API surface, matching the
repository's narrowest-valid-scope rule. `uuid@14` would also satisfy the ADR;
it carries parse/validate/v1/v4 surface this project does not need.

Monotonicity matters physically, not cosmetically: it keeps UUID primary-key
inserts appending to the right-hand edge of the B-tree instead of scattering
random page writes.

---

## 5. What remains deferred

| Item | Owner | Reason |
|---|---|---|
| Measured `EXPLAIN` validation on representative data | DB9 | DB5-A12 — no performance claim on empty/tiny data |
| `INCLUDE` columns | DB9/DB10 | needs `EXPLAIN (ANALYZE, BUFFERS)` evidence |
| `vi-x-icu` collated indexes | post-launch | ICU proven available; none needed at launch |
| `pg_trgm` / BRIN / IDX-056 | conditional | require extension request + threshold |
| Privilege separation (migration vs runtime role) | DB6 direction only → DB10 | ADR-DB1-010 layer 3 |
| Collation-drift check on restore | DB10 | only if an ICU collation is ever adopted |
