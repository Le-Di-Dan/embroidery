# DB6 — Foundation Review Report

**Date:** 2026-07-18 · **Slice:** DB6-C0 (correction)
**Scope:** retro-validation of the foundation (`3855207`) and G1 (`1da5669`)
against DB4/DB5 source of truth, plus completion of the S00 manifests.
**Neither existing commit was amended.** One defect found in G1 was corrected
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

## 7. Progress (absolute counts)

| Metric | Done | Total |
|---|---|---|
| Foundation slices completed | **S00, S01, S02, S03, S04, C0** | 6 |
| Groups completed | **1** | 19 |
| Tables implemented | **3** | 78 |
| FK edges implemented | **3** | 129 |
| Constraints implemented | **10** | see manifest §5 |
| Launch indexes implemented | **6** | 211 physical (83 explicit) |
| Required documents completed | **7** | 15 |

Documents complete: version matrix, capability spike report, deviation
register, schema manifest, index manifest, migration governance, foundation
review. Outstanding: constraint implementation report, fresh-install report,
upgrade-path report, schema-status/drift, multi-machine workflow, test handoff,
completeness matrix, completion report.
