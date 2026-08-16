# APP5-DB01 — Completion report

**Checkpoint.** `APP5-DB01` — Customer Intake Provenance Persistence. The one
APP5 database checkpoint, inserted because `APP5-B02` stopped as
`APP5_B02_PERSISTENT_INTAKE_PROVENANCE_REQUIRED` and the Product Owner accepted
that blocker.

**Verdict.**

```text
APP5-DB01 = COMPLETE
```

Human review owns acceptance. Nothing is pushed.

---

## 1. Baseline

| | |
|---|---|
| Branch | `production` |
| Entry `HEAD` | `279729442721906c577b78dc0400e5e496ffaae5` (`docs(app5): block B02 on missing per-challenge intake provenance`) |
| Working tree at entry | clean |
| Previous migration head | `0034_add_app3_placement_and_derivative_authority` (`APP3-DB01`) |
| Entry blocker | `APP5-B02` = `BLOCKED — APP5_B02_PERSISTENT_INTAKE_PROVENANCE_REQUIRED` |

The blocker, restated in one sentence: nothing in the schema recorded **which
verification challenge** authorized a pre-submission customer upload, so
`APP5-G01 D13`'s bound of 20 accepted uploads *per challenge* and `G01` §7's
challenge-window orphan expiry were both unenforceable. Two independent
requirements pointing at one missing column is what made it a blocker rather
than a judgement call.

Accepted authority, unchanged by this checkpoint: `APP5-R00`, `APP5-G01`,
`APP5-B01`, `APP5-B02-COMPLETION-REPORT.md`, and
`docs/implementation/08-DATABASE-CHANGE-CONTROL.md`.

## 2. Migration identity

| | |
|---|---|
| Tag | `0035_add_app5_intake_provenance` |
| Files | `packages/database/migrations/0035_add_app5_intake_provenance.sql`, `meta/0035_snapshot.json`, `meta/_journal.json` entry `idx 35` |
| Generation | `pnpm --filter @embroidery/database db:generate` (drizzle-kit, from the schema change), then extended by hand with the REL-106 foreign key |
| Sequence | read from the migrations folder and journal, not assumed; `0034` was the highest, so `0035` is next. No migration renumbered, none edited |
| Checksum | `ce344519f0c2024fe8227009aed430f1cf68e2bb4106c4a731ac0a8475eac136`, recorded in `migration-checksums.json` (35/35 match) |

### 2.1 Why the FK is hand-authored

Declaring `foreignKey(... contactVerificationChallenges.id)` inside `assets.ts`
would close a module-import cycle:

```text
assets -> contact_verification_challenges -> design_sessions
       -> product_sides -> assets
```

This is the same class of cycle `0010_add_deferred_session_fk.sql` hit for the
REL-033 session edge, and the sanctioned mechanism is the same: a reviewed
custom SQL statement inside the migration. drizzle-kit diffs against its own
snapshots, so a constraint it never saw is neither dropped nor duplicated on a
later generation. Columns, CHECKs and indexes are declared normally in the
schema file — only the FK is hand-written.

## 3. Schema delta

| Object | Before | After |
|---|---|---|
| `assets.uploaded_via_challenge_id` | absent | `uuid`, **nullable**, no default |
| `assets.intake_expires_at` | absent | `timestamp with time zone`, **nullable**, no default |
| FK | absent | `fk_assets__uploaded_via_challenge_id` → `contact_verification_challenges(id)`, **`ON DELETE SET NULL`**, `ON UPDATE NO ACTION` (REL-106) |
| provenance CHECK | absent | `ck_assets__single_intake_lane` — `not (uploaded_via_session_id is not null and uploaded_via_challenge_id is not null)` (CST-127) |
| expiry CHECK | absent | `ck_assets__challenge_intake_requires_expiry` — `uploaded_via_challenge_id is null or intake_expires_at is not null` (CST-128) |
| quota index | absent | `ix_assets__challenge_status__intake_live` on `(uploaded_via_challenge_id, status)` where `uploaded_via_challenge_id is not null and deleted_at is null` |
| orphan due index | absent | `ix_assets__intake_expires_id__live` on `(intake_expires_at, id)` where `intake_expires_at is not null and deleted_at is null` |

### 3.1 Why the expiry CHECK is one-directional

`ck_assets__challenge_intake_requires_expiry` asserts *challenge ⇒ expiry* and
deliberately **not** *expiry ⇒ challenge*. The reverse implication looks
symmetric and would be a defect: the challenge family is hard-TTL-deleted and
the FK is `SET NULL`, so the database itself produces rows with an expiry and no
challenge id every time a parent is swept. Under the reverse rule, the parent's
own TTL deletion would violate this table's CHECK. §5 proves the surviving shape
is still writable, not merely readable.

### 3.2 Why `ON DELETE SET NULL`

`restrict` would block the challenge TTL sweep behind every asset uploaded under
it — retention would silently stop working. `cascade` would delete an asset row
whose binary still exists in object storage, which INV-10 and the two-phase
deletion contract (ADR-DB1-011) forbid. `SET NULL` matches the existing REL-033
session edge, whose parent is `temp` for exactly the same reason.

### 3.3 Why the quota index leads on the challenge

`G01-D13` counts ACCEPTED, non-deleted rows for **one** challenge. Leading on
`uploaded_via_challenge_id` makes those rows one contiguous range; `status`
follows so the count is answered from the index alone. The predicate keeps the
index to live intake rows — it does not index the whole asset table. Neither
predicate mentions `now()`; the due time stays in the query, per DB6-S26.

## 4. Retention proof

The load-bearing case, run against a real database rather than described:

```text
challenge hard delete
  -> assets.uploaded_via_challenge_id = NULL
  -> assets.intake_expires_at         UNCHANGED (compared byte-for-byte)
  -> the asset row itself             STILL PRESENT
```

Three cases in `app5-intake-provenance.integration.spec.ts` §"challenge deletion
preserves the due time" assert exactly that: the pointer clears, the expiry is
compared against the value read before the delete and is identical, the surviving
row still accepts an ordinary `UPDATE` (proving both CHECKs still hold on it),
and the asset row count is still 1 — the binary is not orphaned by a cascade.

This is the entire reason `intake_expires_at` exists as a stored column rather
than a join. A join-only expiry would vanish with the parent and leave the future
sweep no due time at all.

## 5. Migration evidence

### 5.1 Upgrade path `0034 → 0035`

`app5-intake-provenance-upgrade.integration.spec.ts` builds the real pre-`0035`
baseline — the committed migration files copied into a temporary folder with
`0035` removed and the journal trimmed, so the SQL under test is byte-identical
to what is committed — seeds three historical assets (`CUSTOMER_UPLOAD`,
`CATALOG_MEDIA`, `PRODUCTION_FILE`) while the columns do not yet exist, and only
then applies `0035` from the committed folder.

| Assertion | Result |
|---|---|
| pre-state is 34 migrations, neither column present | **PASS** |
| exactly one additional migration recorded (35) | **PASS** |
| every historical row NULL on both columns, untouched | **PASS** |
| zero rows with a non-null `intake_expires_at` | **PASS** |
| FK + both CHECKs + both indexes present after upgrade | **PASS** |
| historical row still accepts an ordinary `UPDATE` | **PASS** |

**5/5 cases.**

### 5.2 Fresh install

`app5-intake-provenance.integration.spec.ts`, against a disposable database the
harness creates and migrates itself — **20/20 cases**:

- baseline: 35 migrations onto 78 tables;
- both columns present, nullable, `uuid` / `timestamp with time zone`;
- REL-106 present with `confdeltype = 'n'` (SET NULL) onto
  `contact_verification_challenges`;
- CST-127 and CST-128 present by name;
- both indexes present, both predicates non-volatile;
- both new fields NULL accepted (no backfill exists);
- the pre-existing session lane still accepted, with no expiry;
- challenge provenance with expiry accepted;
- challenge provenance **without** expiry rejected (23514);
- clearing the expiry of an existing challenge-lane row rejected (23514);
- a non-existent challenge id rejected (23503);
- expiry with no challenge accepted — the post-deletion shape;
- session + challenge together rejected on `INSERT` (23514);
- adding the second lane by `UPDATE` rejected (23514);
- the three retention cases of §4;
- the two access-path cases of §6.

### 5.3 No backfill

Both columns are nullable, so `0035` contains no `UPDATE`, no `SET NOT NULL` and
no proof block — there is nothing to prove correct. No challenge id is guessed
and no expiry is derived from `created_at` plus a TTL: there is no challenge
behind a historical row, so any value would be fiction. §5.1 asserts the count of
non-null expiries after upgrade is exactly **0**, which is the executable form of
that claim.

## 6. Access-path evidence

PostgreSQL will not choose an index on a three-row table, so the planner is asked
with `enable_seqscan = off`: the question is whether the index *can* answer the
query, not what the planner prefers at that size.

| Query | Plan contains |
|---|---|
| `count(*) where uploaded_via_challenge_id = $1 and status = 'ACCEPTED' and deleted_at is null` | `ix_assets__challenge_status__intake_live` |
| `select id where intake_expires_at < now() and deleted_at is null order by intake_expires_at, id` | `ix_assets__intake_expires_id__live` |

## 7. Post-migration measurement

Taken on disposable databases the harness provisions and drops itself, so the
protected `DATABASE_URL` went file → process and was never read out, echoed or
typed into a shell. The persistent development database was **not** migrated —
that is an operator action.

| Measure | After `0034` | After `0035` |
|---|---|---|
| migrations | 34 | **35** |
| tables | 78 | **78** |
| columns | 843 | **845** |
| PK / FK / UNIQUE / CHECK | 78 / 162 / 52 / 199 | **78 / 163 / 52 / 201** |
| physical indexes | 213 | **215** |
| partial indexes | 46 (13 unique + 33 perf) | **48 (13 unique + 35 perf)** |
| triggers | 34 | **34** |
| fingerprint | `7abf3708…` | **`4c522946b9f0807e58f02c787d509b990c929f8260591b12613859cb89bb7e4c`** |

The fingerprint was generated on one disposable database and then re-verified by
`db-fingerprint-gate.mjs` on a **second, independently built** one — a value that
matches only itself proves nothing about reproducibility.

### 7.1 Rebaselined artifacts

| Artifact | Change |
|---|---|
| `column-metrics.ts` | `assets` 12/0/3/15 → 12/**2**/3/**17** |
| `DB6_SCHEMA_IMPLEMENTATION_MANIFEST.md` §4.1 | G4 row 22/4/26/8/34 → 22/**6**/28/8/**36**; total 843 → **845**; the `Expansions` narrative names APP5-DB01 as the second application-era source |
| `DB6_INDEX_IMPLEMENTATION_MANIFEST.md` | post-launch note extended: 213 → **215**, 46 → **48** partial, and the observation that these are the first application-era *performance* indexes. Launch figures left frozen |
| `DB6_FINAL_PHYSICAL_INVENTORY.md` | a fourth supersession note, in the same form as APP2-DB01's and APP3-DB01's |
| `db-live-tables-check.mjs` | 843 → 845 |
| `db-live-constraints-check.mjs` | `{p:78, f:163, u:52, c:201}`; the FK ceiling kept as the explicit sum `160 (DEV-DB6-017) + 2 (APP3-DB01) + 1 (APP5-DB01)` rather than a new round number, so no undocumented edge can hide inside a literal |
| `db-live-indexes-check.mjs` | total 213 → 215, partial performance 33 → 35, physical partial 46 → 48 |
| `canonical-fingerprint.txt` | recomputed |
| `migration-checksums.json` | `0035` appended |

The DB6 launch baselines in the index manifest are **not** rewritten to today's
numbers — they are the figures every later parity report is stated against, and
rewriting a dated baseline to match the present is how a baseline stops being
one. They gain a note instead. The column register is checker-enforced against
the live schema, so it had to move.

## 8. Canonical DB authority updated

| Document | Change |
|---|---|
| `DB4_COLUMN_DICTIONARY.md` | two TBL-022 rows with the delivered names, types, nullability and the customer-scope-≠-challenge-scope reasoning |
| `DB4_KEYS_AND_CONSTRAINTS.md` | CST-127 and CST-128, in numeric order after CST-126, each with its physical constraint name and the failure it prevents |
| `DB4_RELATIONSHIP_AND_FK_MODEL.md` | REL-106, with why `restrict` and `cascade` are both wrong here |
| `DB6_SCHEMA_IMPLEMENTATION_MANIFEST.md`, `DB6_INDEX_IMPLEMENTATION_MANIFEST.md`, `DB6_FINAL_PHYSICAL_INVENTORY.md` | §7.1 |
| `08-DATABASE-CHANGE-CONTROL.md` §4 | application-era migration log row for `0035` |
| `APP5-CUSTOM-REQUESTS.md` §10 | roadmap, plus a closing note on the `NO_APP5_MIGRATION expected` correction `APP5-B02` opened |

No historical DB report was rewritten. CST-127, CST-128 and REL-106 were checked
free before allocation.

## 9. Command ledger

| Command / check | Impact reason | Result | Reruns |
|---|---|---|---:|
| `pnpm --filter @embroidery/database db:generate` | the schema changed | migration `0035` emitted | 1 |
| `pnpm --filter @embroidery/database test -- app5-intake` | the two suites created here | **25/25**, 2 suites | 3 |
| `pnpm --filter @embroidery/database lint` | the owning workspace's source changed | **PASS** | 2 |
| `pnpm --filter @embroidery/database typecheck` | the schema changed | **PASS** | 1 |
| `pnpm format:check` | global control | **PASS** | 1 |
| `node tools/db-migration-checksum-check.mjs` | a migration was added | **35/35 match** | 1 |
| `node tools/db-live-tables-check.mjs <disposable>` | column count moved | **78 tables / 845 columns — PASS** | 1 |
| `node tools/db-live-constraints-check.mjs <disposable>` | one FK + two CHECKs added | **78 / 163 / 52 / 201 — PASS** | 1 |
| `node tools/db-live-indexes-check.mjs <disposable>` | two partial indexes added | **215 total, 48 partial, 0 volatile — PASS** | 1 |
| `node tools/db-live-triggers-check.mjs <disposable>` | proves this change added none | **34/34 unchanged — PASS** | 1 |
| `node tools/db-schema-fingerprint.mjs <disposable>` | canonical hash must be recomputed | `4c522946…` | 1 |
| `node tools/db-fingerprint-gate.mjs <second disposable>` | reproducibility, not self-agreement | **match — PASS** | 1 |
| `node tools/db-manifest-check.mjs` | the column register and manifest changed | **PASS** (all checks) | 2 |
| `node tools/db-metric-check.mjs` | column metrics changed | **PASS** | 1 |
| `npx prettier --write` on the changed source files | formatting control | applied | 2 |

Why each rerun happened, since a rerun with no stated cause is indistinguishable
from one that was needed:

1. `app5-intake` ran a second time after a first-attempt assertion used
   `toBeInstanceOf(Date)` on a raw `execute` result, which returns `timestamptz`
   as unparsed text — a test defect, not a schema one. The corrected assertion
   compares the preserved expiry byte-for-byte instead, which is strictly
   stronger. It ran a third time after the ESLint fix below, because the file
   changed; the migration and schema semantics did not.
2. `lint` ran a second time after two `@typescript-eslint/no-unsafe-return`
   errors on the `EXPLAIN` plan extraction (`Object.values(row as object)[0]` is
   `any`). Extracted to a typed `planText()` helper. Test-only.
3. `db-manifest-check` ran a second time after the §4.1 arithmetic was updated;
   its first run is what named the three stale figures.

**No broad application regression was run.** Not run, deliberately: the full
`packages/database` suite, full Jest, API integration, B01/B02 runtime tests,
Playwright/E2E, Storefront/Admin tests, APP3/APP4 gates, `tools/check-app3-p03.mjs`,
OpenAPI/client generation, Figma checks, SonarQube, `pnpm quality`. No API,
worker or frontend file changed, and the API resolves `@embroidery/database` to
`dist` (IMP-D018), so nothing downstream compiles this package's source. No
worktree, junction, symlinked `node_modules` or clone was created.

## 10. Files changed

**Migration and schema**

- `packages/database/migrations/0035_add_app5_intake_provenance.sql` *(new)*
- `packages/database/migrations/meta/0035_snapshot.json` *(new, generated)*
- `packages/database/migrations/meta/_journal.json`
- `packages/database/src/schema/asset/assets.ts`

**Tests**

- `packages/database/src/schema/app5-intake-provenance.integration.spec.ts` *(new, 20 cases)*
- `packages/database/src/schema/app5-intake-provenance-upgrade.integration.spec.ts` *(new, 5 cases)*

**Registers and gates**

- `packages/database/src/schema/column-metrics.ts`
- `packages/database/tools/canonical-fingerprint.txt`
- `packages/database/tools/migration-checksums.json`
- `packages/database/tools/db-live-tables-check.mjs`
- `packages/database/tools/db-live-constraints-check.mjs`
- `packages/database/tools/db-live-indexes-check.mjs`

**Canonical DB documentation**

- `docs/database/DB4_COLUMN_DICTIONARY.md`
- `docs/database/DB4_KEYS_AND_CONSTRAINTS.md`
- `docs/database/DB4_RELATIONSHIP_AND_FK_MODEL.md`
- `docs/database/DB6_SCHEMA_IMPLEMENTATION_MANIFEST.md`
- `docs/database/DB6_INDEX_IMPLEMENTATION_MANIFEST.md`
- `docs/database/DB6_FINAL_PHYSICAL_INVENTORY.md`

**APP5 documentation**

- `docs/implementation/08-DATABASE-CHANGE-CONTROL.md`
- `docs/implementation/phases/APP5-CUSTOM-REQUESTS.md`
- `docs/implementation/reports/APP5-DB01-COMPLETION-REPORT.md` *(this file)*

No API, worker, frontend, OpenAPI, generated-client or Figma artifact was
touched. No root `package.json` script was added.

## 11. Roadmap

```text
APP5-R00  = COMPLETE   phase-entry audit
APP5-G01  = COMPLETE   submission / moderation / intake authority
APP5-D01  = COMPLETE   design package, Product Owner approved
APP5-B01  = COMPLETE   request submission backend
APP5-DB01 = COMPLETE   intake provenance persistence
APP5-B02  = INCOMPLETE **next — resume customer attachment intake**
APP5-B03  = INCOMPLETE grant-scoped request status read
APP5-B04  = INCOMPLETE Admin request queue & detail
APP5-B05  = INCOMPLETE Admin notes & transitions
APP5-S01  = INCOMPLETE request creation & submission
APP5-S02  = INCOMPLETE confirmation & status
APP5-A01  = INCOMPLETE Admin queue
APP5-A02  = INCOMPLETE Admin detail / moderation
APP5-E01  = INCOMPLETE cross-layer acceptance
APP5-X01  = INCOMPLETE phase closure
```

## 12. Handoff to APP5-B02

`APP5-B02` can now persist, in one row:

```text
uploaded_by_customer_id     -- who (already existed; B01's binder reads it)
uploaded_via_challenge_id   -- under which authority   (new)
intake_expires_at           -- until when              (new)
```

and can take the `G01-D13` count under the challenge row's lock, which closes a
check-then-act race a derived count could not. B02 still owns the endpoint(s),
the runtime quota enforcement and the runtime provenance writes. **DB01
implements neither the quota use case nor the orphan sweep**, and adds no runtime
code — the two new columns have exactly zero application readers today.

## 13. Residual risk

- **SE-014 / SE-015 remain unimplemented.** The worker still ships three jobs
  (`asset-inspection`, `asset-normalization`, `notification-delivery`) and no
  orphan sweep exists. `0035` gives that sweep the due-time anchor and the index
  it will need; building it is a later checkpoint. Carried as a follow-up,
  **not** a DB01 blocker, per the directive.
- **Nothing writes either column yet**, so the constraints are proven by tests
  rather than by production traffic. That is the correct order — the schema
  precedes its writer — but it means B02 is the first real exercise of CST-127.
- **The persistent development database has not been migrated.** Applying `0035`
  to it is an operator action and would have required the protected
  `DATABASE_URL` in hand.
- **The manifest's REL-derived FK ceiling (164) still exceeds the live count
  (163)**, unchanged by this checkpoint and not flagged by `db-manifest-check`.
  It predates APP5 and is recorded here only so the next database checkpoint
  does not rediscover it as new.

## 14. Commit

`f661da8b5f4326e0867274b9b16251f468b5a853` —
`feat(database): add APP5 customer intake provenance`, 21 files. **Not pushed.**

---

```text
NEXT CHECKPOINT: APP5-B02 — Resume customer attachment intake
```
