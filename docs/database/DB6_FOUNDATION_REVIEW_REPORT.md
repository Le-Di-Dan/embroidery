# DB6 — Foundation Review Report

**Date:** 2026-07-18 · **Slices:** DB6-C0 (correction), DB6-C1 (metric
reconciliation + G2 evidence, §8–§12)
**Scope:** retro-validation of the foundation (`3855207`) and G1 (`1da5669`)
against DB4/DB5 source of truth, completion of the S00 manifests, and the full
G2 evidence record.
**No existing commit was amended.** One defect found in G1 was corrected
by a **forward migration**, per ADR-DB1-003.

---

## 1. Verdict

```text
DB6-C0  PASS
```

| Area | Result |
|---|---|
| S00 manifests | complete — schema + index + deviation register |
| G1 parity | **1 defect found and fixed** (REL-003), 14 of 15 checks clean on first pass |
| Migration governance | documented and exercised |
| A01–A15 statuses | recorded, §6 |
| Blocking items | **0** |

---

## 2. G1 retro-validation (15 checks)

Target: `postgres:16.14-alpine`, disposable database `embroidery_freshtest`,
created and dropped for this review.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | No missing column | **PASS** | 26 physical columns = 9+8+9; DB4 lists 6+5+6 business columns plus the 3 convention columns per table |
| 2 | Nullability matches DB4 | **PASS** | every `N? = no` is `NOT NULL`, every `N? = yes` is nullable — verified column by column against the dictionary |
| 3 | Default semantics match DB4 | **PASS** | `created_at`/`updated_at` default `now()`; no business column carries a database default (DB4 assigns none) |
| 4 | UUID/bigint strategy matches DB1 | **PASS** | all three tables are ADR-DB1-007 category 1 → `uuid`, app-generated; no `bigint` identity expected in G1 |
| 5 | FK names deterministic | **PASS** | `fk_admin_credentials__admin_account_id`, `fk_admin_sessions__admin_account_id`, `fk_admin_accounts__replaced_by_admin_account_id` |
| 6 | Constraint names deterministic | **PASS** | 10 constraints, all `pk_`/`uq_`/`ck_`/`fk_`; zero `%_pkey`, `%_fkey`, `%_key`, `%_check` |
| 7 | No duplicate index | **PASS** | duplicate scan grouping by `(table, index shape)` returns 0 rows |
| 8 | No rejected/deferred index present | **PASS** | 6 indexes, all in the manifest; no `IDX-R*`, no IDX-056, no speculative index |
| 9 | No state literal outside DB3 | **PASS** | `ACTIVE, LOCKED, DISABLED` / `ACTIVE, EXPIRED, REVOKED` — byte-identical to `DB3_DB4_HANDOFF.md` line 13 |
| 10 | No plaintext credential/token/OTP | **PASS** | only `token_hash` and `credential_reference` (hashed/opaque) exist; scan for plaintext secret columns returns only doc comments |
| 11 | Identifier length within limit | **PASS** | longest constraint 47 bytes, longest index 33 bytes; limit 63 |
| 12 | Migration fresh-apply | **PASS** | both migrations applied to an empty database |
| 13 | Reapply is a no-op | **PASS** | second `db:migrate` reports up to date, applies nothing |
| 14 | Drift checker clean | **PASS** | `2 applied / 2 in repository`, state `up-to-date`, exit 0 |
| 15 | Generated migration human-reviewed | **PASS** | §4 — review caught two defects before the first commit and one after |

### 2.1. Defect found — REL-003 missing (DEV-DB6-008)

`admin_accounts.replaced_by_admin_account_id` existed as a `uuid` column with
correct nullability, but **carried no foreign key**. DB4 `REL-003` specifies
`admin_accounts → admin_accounts (replaced_by)`, `0..1`, `ref`, `restrict`,
`Hist: yes` — the LC-01 successor chain.

Why it was missed: the column was declared with the `idReference()` primitive,
which produces a correctly-typed `uuid` column but does **not** create a
constraint. The table read as complete because the column was present, and
`fk_` naming checks pass vacuously when no FK exists. Nothing failed — a
self-referencing pointer simply had no referential integrity, so a replaced
account could have been deleted out from under a successor pointer.

**Correction:** `0001_add_admin_accounts_successor_fk.sql`, a forward migration
adding the FK with `ON DELETE RESTRICT`. Migration `0000` was **not** edited.

**Generalisation applied to G2–G19:** every FK edge is checked against the
`REL-*` row before a group's gate passes, using the FK-edge count (129), not
the `REL-*` row count (92). A column of type `uuid` named `*_id` with no
matching `fk_` constraint is now an explicit gate failure.

### 2.2. Post-fix object counts

| Object | Count | Expected |
|---|---|---|
| Tables | 3 | 3 |
| PK constraints | 3 | 3 (CST-001) |
| **FK constraints** | **3** | **3 (REL-001, REL-002, REL-003)** |
| UNIQUE constraints | 2 | 2 (CST-002 → IDX-001, CST-004 → IDX-003) |
| CHECK constraints | 2 | 2 (CST-060 on two status columns) |
| Indexes | 6 | 6 (3 PK + 2 UNIQUE backing + 1 explicit partial unique) |
| Triggers | 0 | 0 — G1 has no immutability/append-only constraint |

### 2.3. G1 index accounting

| IDX | Physical name | Owner | Status |
|---|---|---|---|
| IDX-001 | `uq_admin_accounts__email` | UNIQUE constraint (CST-002) | implemented |
| IDX-002 | `uq_admin_accounts__status__active` | explicit partial unique (CST-003) | implemented |
| IDX-003 | `uq_admin_sessions__token_hash` | UNIQUE constraint (CST-004) | implemented |
| IDX-120 | `ix_admin_sessions__admin_account_id` | explicit performance, recommended | **planned — slice S25** |
| IDX-121 | `ix_admin_sessions__expires_at_id__active` | explicit performance, required | **planned — slice S25** |

IDX-120/121 are absent by design, not by omission: performance indexes ship
after the tables (`DB4_DB6_HANDOFF.md` §2 step 5). Tracked in the index
manifest §7.

### 2.4. G1 behavioural evidence

Re-confirmed on the pinned image:

| Case | Expected | Observed |
|---|---|---|
| duplicate email | reject | `uq_admin_accounts__email` violation |
| second `ACTIVE` admin | reject | `uq_admin_accounts__status__active` violation |
| second **non-**`ACTIVE` admin | **accept** | `INSERT 0 1` — predicate correctly scoped |
| invalid status `SUSPENDED` | reject | `ck_admin_accounts__status` violation |
| orphan credential FK | reject | `fk_admin_credentials__admin_account_id` violation |
| duplicate session `token_hash` | reject | `uq_admin_sessions__token_hash` violation |

Behavioural *coverage* remains **DB7's** obligation; these are DB6 smoke
confirmations that the objects are wired correctly.

---

## 3. DB7 / DB8 handoff for G1

### DB7 (constraint behaviour)

| Target | Object | Expected SQLSTATE | Scenario |
|---|---|---|---|
| CST-002 | `uq_admin_accounts__email` | `23505` | insert duplicate email |
| CST-003 | `uq_admin_accounts__status__active` | `23505` | insert/promote a second ACTIVE admin |
| CST-003 (negative) | same | success | a second LOCKED/DISABLED admin must be allowed |
| CST-004 | `uq_admin_sessions__token_hash` | `23505` | duplicate session token hash |
| CST-060 | `ck_admin_accounts__status` | `23514` | status outside DB3 set |
| CST-060 | `ck_admin_sessions__status` | `23514` | status outside DB3 set |
| REL-001 | `fk_admin_credentials__admin_account_id` | `23503` | orphan credential; delete of referenced account |
| REL-002 | `fk_admin_sessions__admin_account_id` | `23503` | orphan session |
| **REL-003** | `fk_admin_accounts__replaced_by_admin_account_id` | `23503` | successor pointer to a non-existent account; delete of a predecessor still pointed at |

### DB8 (concurrency)

| Anchor | Path | Expectation |
|---|---|---|
| CST-003 | admin replacement procedure | two concurrent promotions → exactly one wins, loser gets `23505` |
| LC-01 session | session revoke vs use | row lock on the session; no lost update |

---

## 4. Human review of generated migrations

Every generated migration was read before being applied. This is the step that
caught the defects; none of them produced an error.

| Migration | Reviewed | Finding |
|---|---|---|
| `0000` (first generation) | yes | **rejected** — CHECK constraints emitted `in ($1, $2, $3)`. The state/currency helpers interpolated values with the `sql` tag, which binds parameters; DDL cannot bind, so drizzle-kit wrote the placeholder *text* into the file. A CHECK would have existed with the wrong meaning. Helpers changed to emit escaped literals, migration regenerated. |
| `0000` (regenerated) | yes | accepted — literals correct, names correct, partial predicate correct |
| `0001` | yes | accepted — single `ALTER TABLE ... ADD CONSTRAINT`, no unrelated change |

A third defect was caught earlier by inspecting the applied objects rather than
the file: drizzle's inline `.primaryKey()` shorthand emits `<table>_pkey`
(DEV-DB6-006).

**All three defects were silent** — no tool reported an error in any case. This
is the argument for the parity gate being object-level, not exit-code-level.

---

## 5. Migration governance

Documented in [`DB6_MIGRATION_GOVERNANCE.md`](./DB6_MIGRATION_GOVERNANCE.md)
and exercised during this slice:

| Procedure | Exercised | Result |
|---|---|---|
| generate → review → apply | yes | §4 |
| forward-fix instead of editing an applied migration | **yes** | REL-003 fixed by `0001` |
| checksum/drift detection | **yes** | tampering with `0000` produced `checksum-mismatch`; restoring recovered `up-to-date` |
| fresh install on an empty database | yes | 2/2 applied |
| no-op reapply | yes | nothing applied |
| local disposable reset | tooling in place (`pnpm db:reset`) | not destructively exercised on the dev volume during this slice |

---

## 6. DB5 adjustment status (A01–A15)

| ID | Status | Owner / note |
|---|---|---|
| **A01** count semantics | **closed** | index manifest §1: 134 entries, 4 retired IDs, **83 explicit** `CREATE INDEX`, 128 constraint-created, 211 physical at launch |
| **A02** no duplicate constraint indexes | **closed** | index manifest §2; duplicate scan returns 0 rows; 50 constraint-owned entries listed as never-explicit |
| **A03** partial predicates valid | **partially closed** | engine rejects volatile predicates (proven); per-predicate validation **closes per group** |
| **A04** lock/claim syntax | **closed** | 14/14 spikes; no raw-SQL fallback needed for locking |
| **A05** package compatibility | **closed** | exact pins + capability matrix |
| **A06** stale patch pin | **closed** | 16.14 pinned and running |
| **A07** ICU/collation | **closed** | ICU present; `C` baseline enforced and asserted at startup |
| **A08** VND scale | **partially closed** | mechanism proven + primitive implemented; **applies per money-bearing group**; DB7 owns the negative test |
| **A09** state predicates vs CHECK | **open — closes per group** | manifest owner: schema manifest §6; G1 verified byte-identical to DB3 |
| **A10** immutable vs operational metadata | **open — closes per group** | manifest owner: schema manifest §5.3; mechanism proven (`WHEN`-scoped trigger); G1 has no immutability constraint |
| **A11** launch vs measured tuning | **closed (policy)** / open per group | index manifest §5–6 fixes what ships and what does not |
| **A12** no EXPLAIN claims on empty data | **deferred to DB9** | DB6 makes no performance claim; structural confirmation only |
| **A13** identifier length | **closed** | max 47 bytes observed; DB5 name map already ≤63 |
| **A14** exclusion/extension | **closed** | `btree_gist` available but **not installed**; IDX-056 conditional |
| **A15** no-index decisions | **closed** | index manifest §5.2 records Q-20, Q-33, QX-08 as standing decisions with activation thresholds — not "not implemented yet" |

A01 and A02 are closed **because** the index manifest is complete, as required.

---

## 7. Progress (absolute counts, current through G2/C1)

| Metric | Done | Total |
|---|---|---|
| Foundation slices completed | **S00, S01, S02, S03, S04, C0, C1** | 7 |
| Groups completed | **2** | 19 |
| Tables implemented | **8** | 78 |
| FK edges implemented | **6** | 129 logical (128 physical + REL-104 no-FK) |
| Constraint objects implemented | **26** (8 PK + 6 FK + 6 UQ + 6 CK) | see manifest §2.3 |
| Launch physical indexes implemented | **15** | 211 (83 explicit + 128 constraint-created) |
| Required documents completed | **7** | 15 |

---

# Part II — DB6-C1: metric reconciliation and G2 evidence

## 8. Canonical metric reconciliation

Four metric families, each with separate ID-range / documented / expanded /
physical figures. The manifest checker re-derives the REL expansion from the
DB4 source document and verifies the index formula on every run.

### 8.1. Relationships

| Metric | Value |
|---|---|
| REL ID range | REL-001..105 (13 IDs unassigned) |
| Documented REL rows | **92** |
| Expanded logical FK edges | **129** (×1:66, ×2:20, ×3:3, ×4:1, ×5:2 — checker-verified) |
| Physical FK target | 128 (REL-104 is polymorphic, no FK by design) |
| Implemented physical FKs | 6 |

The 26 multi-target rows and their per-edge expansion are enumerated in the
schema manifest §2.2. No edge is invented for an unassigned ID.

### 8.2. Constraints

| Metric | Value |
|---|---|
| CST ID range | CST-001..125 (31 IDs unassigned) |
| Documented CST IDs | **94** (92 table rows + CST-001/CST-080 blanket prose) |
| Expanded logical constraint instances | **265** (77 single + 110 multi + 78 PK; CST-080 column-level, sized per dictionary) |
| TX/App-only (no physical object) | **15** |
| Conditional (not built) | 1 (CST-046 exclusion) |
| Implemented physical constraint objects | **26** |

`125` is never a physical constraint count. Per-CST expansion basis: schema
manifest §2.3.

### 8.3. Indexes

| Metric | Value |
|---|---|
| IDX ID range | IDX-001..138 |
| Catalog entries | 134 (4 IDs retired, never reused) |
| Expanded logical index specifications | **134 — 1:1 with entries**; DB5 expanded at ID-assignment time, so no child-ID namespace is needed |
| Constraint-created physical | **128** = 78 PK backing + 50 UNIQUE backing |
| Explicit physical | **83** = 13 partial unique + 70 performance |
| **Total physical at launch** | **211** |
| Conditional | 1 (IDX-056) · Rejected: 15 `IDX-R*` · No-index decisions: 3 (Q-20/Q-33/QX-08) |

**Formula (checker-enforced):** `(78 + 50) + (13 + 70) = 211`. The 13 partial
uniques are *inside* the 83; PK backing is *not* inside the 50; FK-support
indexes are never auto-created by PostgreSQL and live inside the 70.

### 8.4. Tables

78 TBL rows, each assigned to exactly one implementation group G1–G19;
checker verifies uniqueness, no orphan, and group totals summing to 78.

## 9. G2 scope record

| Item | Value |
|---|---|
| Group / context | G2 — Platform base (CTX-PLT) |
| TBL IDs | TBL-073, 074, 075, 076, 077 |
| Physical tables | `outbox_events`, `idempotency_records`, `background_job_attempts`, `policy_configurations`, `policy_configuration_versions` |
| COL ranges | COL-TBL073-01..10 (×2 on -02/-08), COL-TBL074-01..07 (×2 on -07), COL-TBL075-01..07, COL-TBL076-01..03, COL-TBL077-01..07 |
| Physical columns | **49** (14 + 11 + 9 + 6 + 9, incl. convention columns) |
| REL rows | REL-101 (target side; FK lands in G18), REL-102, REL-104 (no FK) |
| Expanded FK edges in G2 | **3** (REL-102: versions→configurations, versions→admin_accounts, configurations→versions) |
| CST IDs | CST-001, CST-048, CST-049, CST-050, CST-060 (×3), CST-062, plus CST-098/099 trigger targets (S24) |
| Physical constraint objects in G2 | **16** = 5 PK + 4 UNIQUE + 4 CHECK + 3 FK (per-table breakdown in §10) |
| IDX logical entries | IDX-058..061 (constraint-created now); IDX-088/090/093/094/131 (explicit, S25) |
| Physical indexes selected for G2 | 9 constraint-created now + 5 explicit at S25 |
| Dependencies on G1 | `policy_configuration_versions.created_by_admin_id` → `admin_accounts` |
| Migrations | `0002` (generated), `0003` (generated, CST-060 rename), `0004` (custom SQL, REL-102 pointer) |
| Custom SQL objects | 1 (FK `fk_policy_configurations__current_version_id`) |
| DB7 targets | §11.3 |
| DB8 targets | §11.3 |

## 10. G2 implementation evidence (per table)

| | TBL-076 | TBL-077 | TBL-074 | TBL-073 | TBL-075 |
|---|---|---|---|---|---|
| File (`schema/platform/`) | `policy-configurations.ts` | `policy-configuration-versions.ts` | `idempotency-records.ts` | `outbox-events.ts` | `background-job-attempts.ts` |
| Migration | 0002 (+0004 FK) | 0002 | 0002 | 0002 | 0002 |
| PK strategy | uuid7 | uuid7 | bigint identity | bigint identity | bigint identity |
| Columns | 6 | 9 | 11 | 14 | 9 |
| State field / check | — | — | `status` LC-23, `ck_..__status_allowed` | `status` LC-22, `ck_..__status_allowed` | `outcome`, `ck_..__outcome_allowed` |
| FK edges | → versions (0004) | → configurations, → admin_accounts | — | — (REL-104 no-FK) | — |
| Unique | `uq_..__config_key` (IDX-060) | `uq_..__config_version` (IDX-061) | `uq_..__namespace_scope_key` (**IDX-058, arbiter**) | — | `uq_..__kind_key_attempt` (IDX-059) |
| Other checks | — | — | — | — | `ck_..__attempt_no_positive` (CST-062) |
| Mutability | header | immutable (S24 trigger) | mutable operational (no trigger — DB5-A10) | column-scoped (S24 trigger, CST-099) | append-only (S24 trigger, CST-098) |
| Delete/archive | retain | retain | hard-ttl | hard-ttl (processed) | hard-ttl (oper) |
| JSONB | — | `value` (#9) | `result` (#5) | `payload` (#4) | — |
| `updated_at` | yes (mutable) | **no** (immutable) | yes | **no** (not in CST-099 set) | **no** (append-only) |
| Deviations | — | — | — | — | — |

Parity confirmations: column counts match the DB4 dictionary expansion exactly
(×2 rows expand); nullability verified column-by-column; no database default on
any business column; state literals byte-identical to DB3 (`PENDING/DISPATCHED/
FAILED/DEAD_LETTER`, `IN_PROGRESS/COMPLETED`, `SUCCEEDED/FAILED_RETRYABLE/
FAILED_TERMINAL`); no extra column/table/index; **no missing FK** (REL-102's
three edges present; REL-104 has none by design — checked against the
129-edge expansion, the REL-003-class gap cannot recur silently); no plaintext
token/OTP/credential column; no rejected/deferred DB5 index present.

## 11. G2 migration and validation evidence

### 11.1. Migrations

| File | Source | Contents |
|---|---|---|
| `0002_create_platform_base_tables.sql` | generated, human-reviewed | 5 tables, 5 PK, 4 UNIQUE, 4 CHECK, 2 FK — G2 only |
| `0003_align_status_check_names.sql` | generated, human-reviewed | 2 constraint renames (CST-060 pattern) — G1 correction, no G2 objects |
| `0004_add_policy_configuration_current_version_fk.sql` | **custom, hand-authored, reviewed** | 1 FK (REL-102 cycle) |

0 functions/triggers (S24). Longest identifier 57 bytes (constraint), 48
(index) — limit 63. `0000`/`0001` byte-identical to their commits (git diff
empty).

### 11.2. Validation battery (all executed, this slice)

| Check | Result |
|---|---|
| Typecheck / lint / format / tests / file-size | PASS (18 tests) |
| Manifest checker (8 checks incl. formula, REL expansion, group sums, retired-IDX scan) | PASS |
| Fresh empty DB → 5 migrations | PASS, `up-to-date` |
| No-op reapply | PASS, nothing applied |
| Upgrade from G1-only prefix | PASS: 2 applied → 3 pending detected → 5 applied |
| Drift / checksums | clean; migration files restored byte-identical after prefix test |
| Physical parity | 8 tables; columns 9/8/9/6/9/11/14/9 per table; 8 PK + 6 FK + 6 UQ + 6 CK; 15 indexes |
| Duplicate-index scan | 0 |
| Naming conformance (prefix-based) | 0 non-conforming constraints or indexes |
| Valid insert path | config → version → point header: OK |
| Invalid FK | dangling `current_version_id` rejected |
| Invalid CHECK | bad status ×2, `attempt_no=0` rejected |
| Unique violation | duplicate idempotency scope, duplicate attempt rejected; cross-namespace allowed |
| Delete-restrict | version-under-pointer and admin-under-version both rejected |
| Update per category | header fields OK; outbox CST-099 mutable set OK |
| Rollback | smoke row count after rollback: 0 |
| Security scans | no plaintext secrets, no unparameterised SQL, `.env` ignored |

This battery does not replace DB7's full suite.

### 11.3. G2 → DB7/DB8 handoff

DB7 (SQLSTATE targets): CST-048 `23505` (+cross-namespace negative), CST-049
`23505`, CST-050 `23505` ×2, CST-060 `23514` ×3, CST-062 `23514`, REL-102
`23503` ×3 (orphan version, orphan admin, dangling pointer; delete-restrict
both directions). After S24: CST-098 append-only reject, CST-099 column-scope
reject (`23001`), TBL-077 immutability reject.

DB8: CST-048 claim race (two concurrent claims → one `23505` loser, D8-25);
outbox `SKIP LOCKED` disjoint claim on IDX-088 (CC-25); stuck-IN_PROGRESS
timeout sweep.

## 12. DB5 adjustment status — A03/A08/A09/A10 (per-group ledger)

### A03 — partial predicates (open, closes per group)

| Metric | Value |
|---|---|
| Launch partial indexes total | **45** (13 partial unique + 32 partial performance) |
| Implemented through G2 | **1** (IDX-002) |
| Volatile predicates found | 0 (engine rejects them outright — proven) |
| Remaining owners | partial uniques with their groups; partial performance in S25 |

### A08 — VND scale (partially closed)

G1/G2 contain **no money column** (first `_amount` arrives in G5
`products.base_price_amount`). Mechanism proven by spike + primitive
implemented; **no global closure is claimed from the spike alone**. Closes
when all 14 `_amount` columns carry the conditional CHECK; DB7 owns negative
tests.

### A09 — state parity (open, closes per group)

| Table | DB3 source | TS constant | CHECK values | Partial-index values | Parity |
|---|---|---|---|---|---|
| admin_accounts | `DB3_DB4_HANDOFF` §1 | `ADMIN_ACCOUNT_STATES` | ACTIVE/LOCKED/DISABLED | `'ACTIVE'` (IDX-002) | **byte-identical** |
| admin_sessions | same | `ADMIN_SESSION_STATES` | ACTIVE/EXPIRED/REVOKED | — | **byte-identical** |
| outbox_events | LC-22 | `OUTBOX_EVENT_STATES` | PENDING/DISPATCHED/FAILED/DEAD_LETTER | S25 (IDX-088/090) | **byte-identical** |
| idempotency_records | LC-23 | `IDEMPOTENCY_RECORD_STATES` | IN_PROGRESS/COMPLETED | S25 (IDX-094) | **byte-identical** |
| background_job_attempts | COL-TBL075-04 | `JOB_ATTEMPT_OUTCOMES` | SUCCEEDED/FAILED_RETRYABLE/FAILED_TERMINAL | — | **byte-identical** |

Each CHECK and each future partial predicate derives from the one exported
tuple; a literal cannot drift between code and database.

### A10 — immutability vs operational metadata (open, closes per group)

| Table | Category | Immutable | Mutable | Mechanism | DB7 |
|---|---|---|---|---|---|
| admin_accounts/credentials/sessions | mutable | — | all | none needed | — |
| policy_configurations | header | identity | description, pointer | app + FK restrict | pointer tests |
| policy_configuration_versions | immutable | whole row | — | **S24 trigger** | reject-update |
| idempotency_records | operational | identity, fingerprint | status/result/expiry/claim | **no trigger — DB5-A10 exception** | claim races |
| outbox_events | column-scoped | payload, identity, event time | CST-099 seven-column set (exported as `OUTBOX_MUTABLE_COLUMNS`) | **S24 column-scoped trigger** | scope reject |
| background_job_attempts | append-only | whole row | — | **S24 trigger** (CST-098) | reject-update/delete |

Documents complete: version matrix, capability spike report, deviation
register, schema manifest, index manifest, migration governance, foundation
review. Outstanding: constraint implementation report, fresh-install report,
upgrade-path report, schema-status/drift, multi-machine workflow, test handoff,
completeness matrix, completion report.
