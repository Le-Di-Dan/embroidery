# APP3-DB01 — Completion report

**Checkpoint.** `APP3-DB01` — Placement lifecycle and derivative metadata
migration. The one APP3 database checkpoint.

**Branch.** `production`. Entry `HEAD` = `3bf5d5b0fd3c23fd5e1ddf34f94b80c3c4303109`
(`docs(app3): record APP3-G04 intervention evidence`).

**Status.** `APP3-DB01 = COMPLETE — REVIEW_DELIVERED`. Human review owns
`REVIEW_ACCEPTED`.

---

## 1. Accepted entry authority

```text
APP3-G01 = COMPLETE — REVIEW_ACCEPTED
APP3-G02 = COMPLETE — REVIEW_ACCEPTED
APP3-G03 = COMPLETE — REVIEW_ACCEPTED
APP3-G04 = COMPLETE — REVIEW_ACCEPTED
APP3-DB01 = REQUIRED — READY_FOR_EXECUTION  (entry)
```

`IMP-D041`, `IMP-D042`, `IMP-D043` and `IMP-D044` are preserved unchanged. The
approved narrow-scope deviation recorded at entry (five historical APP3 checker
entries added to `SCOPED_COMMAND_INDEX.md` alongside the two required G04 ones)
stands; no root alias or executable registry was reintroduced then or now.

Preflight, all passing before any edit: branch `production`, tree clean, G01–G03
`PASS`, G04 `PASS — REQUIRED_SCHEMA_CONTRIBUTION_PENDING`, Prettier `PASS`,
ESLint `PASS`. No unrelated work was reset, stashed or absorbed.

## 2. Migration identity

| | |
|---|---|
| Tag | `0034_add_app3_placement_and_derivative_authority` |
| Files | `packages/database/migrations/0034_add_app3_placement_and_derivative_authority.sql`, `meta/0034_snapshot.json`, `meta/_journal.json` entry `idx 34` |
| Generation | `pnpm --filter @embroidery/database db:generate` (drizzle-kit, from the schema change), then extended by hand with the ordered backfill, the proof block, the preflight and the trigger DDL — the 0032 precedent, and 0030's for triggers, which Drizzle's table DSL cannot express |
| Sequence | determined from the migrations folder and journal, not assumed; 0033 was the highest, so 0034 is next. No migration renumbered |
| Checksum | `ceaed118b5897b4dd2581309a97161d382632d5a91700e95876bebc8e76a16d2`, recorded in `migration-checksums.json` (34/34 match) |

The file was regenerated once mid-checkpoint after a constraint was strengthened
(see §6.2), so the committed snapshot and SQL come from the same generation run.

## 3. Pre-migration measurement

Read-only, against the migrated development database. Nothing mutated.
Development data is evidence, not production authority.

| Measure | SQL | Result |
|---|---|---|
| placement rows | `select count(*) from product_sides` / `embroidery_areas` | **0 / 0** |
| Sides referenced by Template headers | `... from design_templates where product_side_id is not null` | 0 |
| Areas referenced by Template headers | `... where embroidery_area_id is not null` | 0 |
| Sides on non-terminal Sessions | `... from design_sessions where status not in ('EXPIRED','DELETED')` | 0 |
| placement referenced by approval snapshots | `... from approval_snapshots where product_side_id / embroidery_area_id is not null` | 0 / 0 |
| Sides referenced by `design_versions` | `... from design_versions where product_side_id is not null` | 0 |
| duplicate side names per Product | `group by product_id, name having count(*) > 1` | 0 |
| duplicate area names per Side | `group by product_side_id, name having count(*) > 1` | 0 |
| derivatives by kind/status | `group by kind, status` | `CATALOG_PREVIEW/READY` ×1, `THUMBNAIL/READY` ×1 |
| **`NORMALIZED` derivatives** | `where kind = 'NORMALIZED'` | **0** |
| READY `NORMALIZED` | `where kind='NORMALIZED' and status='READY'` | **0** |
| **metadata quartet present?** | `information_schema.columns … in ('width_px','height_px','media_type','byte_size')` | **0 columns — absent, reconfirmed** |
| chain / tables | `drizzle.__drizzle_migrations`, `information_schema.tables` | 33 / 78 |

**Consequence:** no grandfathering. The backfill has no live row to convert in
development, so its correctness is proved on a seeded upgrade database instead
(§7.3) rather than by an empty run that would have proved nothing.

## 4. Schema change

### 4.1 Group A — `product_sides` and `embroidery_areas`

| Column | Type | Nullability |
|---|---|---|
| `code` | `text` | `NOT NULL` (after backfill) |
| `retired_at` | `timestamptz` | nullable — null means selectable |
| `superseded_by_id` | `uuid` | nullable, self-FK `ON DELETE restrict` |

Constraints, per table: `uq_*__product_code` / `uq_*__side_code`
(**per parent, never global** — two Products may both have a `front`),
`ck_*__code_format` (`^[a-z0-9][a-z0-9_-]{0,63}$`),
`ck_*__superseded_requires_retired`, `ck_*__superseded_not_self`,
`fk_*__superseded_by_id`.

`code` is deliberately not derived from `name`: names are display copy —
localized, edited, duplicated across Products — and an identity derived from one
would change meaning when the copy changed. That is the whole reason a stable
code exists.

### 4.2 Deterministic backfill, in the only safe order

1. `ADD COLUMN "code" text` — **nullable**;
2. `UPDATE … SET code = 'legacy-' || replace(id::text, '-', '')`;
3. a `DO` block that **proves** zero null, zero duplicate-per-parent and zero
   malformed values, raising a named exception if not;
4. `ALTER COLUMN "code" SET NOT NULL`;
5. uniqueness, format and replacement constraints.

Step 3 is not ceremony. Without it a stale row surfaces as a bare
`23502`/`23505`/`23514` naming no row, on a statement that is not the one that
caused it. The expression is a pure function of the row's immutable id, so it is
stable across reruns and rebuilds and cannot collide inside a parent — the
property that makes a legacy code safe to reference at all.

### 4.3 Replacement constraints, split by what each can see

| Rule | Where | Why |
|---|---|---|
| `superseded_by_id <> id` | CHECK | single-row fact |
| pointer requires `retired_at` | CHECK | single-row fact |
| replacement shares the parent | trigger | needs the *other* row |
| no direct two-row cycle | trigger | needs the *other* row |

Only the **direct** cycle is rejected, as ruled. `a → b → c` is exactly what two
successive replacements look like; a recursive graph walk here would reject a
legitimate history, and the gate refuses one if it appears.

### 4.4 Referenced-row protection

Protected when **any** of: a `design_templates` header scopes to it; a
`design_sessions` row whose status is not `EXPIRED`/`DELETED` sits on it; an
`approval_snapshots` row froze it.

| Table | Frozen once protected |
|---|---|
| `product_sides` | `product_id`, `code`, `background_asset_id`, `image_width_px`, `image_height_px`, `physical_width_mm`, `physical_height_mm`, `px_per_mm` |
| `embroidery_areas` | `product_side_id`, `code`, `bound_x_px`, `bound_y_px`, `bound_width_px`, `bound_height_px`, `max_width_mm`, `max_height_mm` |

Still allowed on a protected row: `name`, `display_order`, `retired_at`,
`superseded_by_id` and ordinary update metadata — none of them changes what was
referenced. Hard delete of a protected row is rejected with a message that names
the alternative (retire it); an unprotected row still deletes under the existing
FK rules. Nothing cascades.

Two functions back four triggers:
`fn_app3_placement_replacement_guard(parent_column)` and
`fn_app3_reject_protected_placement_change(entity, …protected columns)`, both
`SECURITY INVOKER` with a pinned `search_path`, matching the DB6-S24 conventions.
Enforcement is in the database for the same reason S24 is: an application-only
guard is bypassed by every path that is not that application.

### 4.5 Group B — `asset_derivatives`

`width_px` `integer`, `height_px` `integer`, `media_type` `text`, `byte_size`
`bigint` — all nullable, plus:

- `ck_asset_derivatives__metadata_all_or_none` —
  `num_nonnulls(...) in (0, 4)`;
- `ck_asset_derivatives__metadata_positive` — positive dimensions and byte size,
  non-blank media type;
- `ck_asset_derivatives__ready_normalized_metadata` — a `READY` `NORMALIZED`
  derivative **must** carry all four.

A preflight refuses to add the third CHECK if any unmeasured READY `NORMALIZED`
row exists, naming the count and stating that values are never fabricated.
Measured: zero such rows.

Not globally `NOT NULL`, for the five reasons IMP-D044 records — historical
rows, no editor-safe row yet, no object-storage call in a migration, historical
representability, and *ineligible rather than fabricated*. The all-or-none CHECK
is what keeps "nullable" from meaning "half-filled".

**Not added:** `inspection_detail_id`, `current_inspection_id`, a profile enum
column, an editor derivative kind, a public flag, a grant-purpose column. No
backfill, and `asset_inspections.detail` / `assets.mime_type` /
`assets.size_bytes` are used as derivative metadata nowhere.

## 5. Migration properties

- **Forward-only** — no down section, no rollback, no `DROP TABLE`;
- **transactional** — the runner applies each migration once inside a
  transaction;
- **no network, no object storage** — the gate refuses `dblink`, `COPY … FROM
  PROGRAM`, an http(s) literal or `CREATE EXTENSION`;
- **no application dependency** — pure SQL against PostgreSQL;
- **rerun-safe** — journal + checksum manifest; the upgrade suite applies the
  committed bytes, not a re-authored copy.

## 6. Post-migration measurement

Taken on a disposable database the harness creates and migrates itself, so the
protected `DATABASE_URL` went file → process and was never read out, echoed or
passed as an argument (`.env-ignore` lists it explicitly).

| Measure | Before | After |
|---|---|---|
| migrations | 33 | **34** |
| tables | 78 | **78** |
| columns | 833 | **843** |
| PK / FK / UNIQUE / CHECK | 78 / 160 / 50 / 190 | **78 / 162 / 52 / 199** |
| physical indexes | 211 | **213** |
| triggers | 30 | **34** (30 S24 + 4 APP3) |
| fingerprint | `82864268…` | **`7abf3708f8acc7da1124677add5a95ef1bdd421e78ea7f735213fbf8030a3569`** |

All six new placement columns, all four derivative columns, all thirteen new
constraints and all four triggers verified present with their canonical names
and types.

### 6.1 Manifest and baseline updates

| Artifact | Change |
|---|---|
| `column-metrics.ts` | `asset_derivatives` 6/0/3/9 → 6/**4**/3/**13**; `product_sides` 9/0/3/12 → 9/**3**/3/**15**; `embroidery_areas` 7/2/3/12 → 7/**5**/3/**15** |
| `DB6_SCHEMA_IMPLEMENTATION_MANIFEST.md` §4.1 | G4 and G5 rows and the total, 833 → **843**; the `Expansions` column's meaning documented to cover application-era additions as well as `×N` |
| `DB6_INDEX_IMPLEMENTATION_MANIFEST.md` | a **post-launch note**: the launch figures stay frozen, a live database now carries 213 indexes, and no `IDX-*` slot is allocated |
| `DB6_FINAL_PHYSICAL_INVENTORY.md` | a third supersession note, in the same form as APP2-DB01's and APP2-B02-G01's |
| `db-live-tables-check.mjs` | 833 → 843 |
| `db-live-constraints-check.mjs` | `{p:78, f:162, u:52, c:199}`; the FK ceiling kept as an explicit `160 (DEV-DB6-017) + 2 (APP3-DB01)` sum rather than a new round number |
| `db-live-indexes-check.mjs` | total 211 → 213, UNIQUE backing 50 → 52 |
| `db-live-triggers-check.mjs` | S24 stays exactly 30 with unchanged args; a **separate** APP3 inventory asserts the 4 new triggers by name, table and function, and both functions are `SECURITY INVOKER` |
| `canonical-fingerprint.txt`, `migration-checksums.json` | recomputed / extended |

The column register is checker-enforced **against the live schema**, so it had to
move. The index manifest's figures are labelled *at launch* and are the baseline
every later parity report is stated against, so they are preserved with a note
instead — rewriting a dated baseline to match today's schema is how a baseline
stops being one.

### 6.2 One constraint strengthened mid-checkpoint

The first `metadata_positive` CHECK used bare `btrim`, which trims spaces only —
so a tab-only media type satisfied a rule that exists to reject it. A test caught
it. The constraint now trims `' \t\r\n'`, and migration 0034 was regenerated so
the snapshot, the SQL and the schema agree. That is strictly stronger than the
ruled `trim(media_type) <> ''`, never weaker.

## 7. Focused tests

### 7.1 `app3-placement-authority.integration.spec.ts` — 21 cases

Baseline (34 migrations / 78 tables, four guard triggers); duplicate code per
parent rejected and allowed across parents, for both tables; malformed code
(`Front`, `-front`, `front side`, `front!`, empty, 65 chars) rejected; null code
rejected; retirement with a same-parent replacement accepted; pointer without
retirement, self-replacement, cross-parent replacement and a direct cycle each
rejected by their own SQLSTATE; the same set for Embroidery Areas; unreferenced
geometry and identity still editable; **Template-header**, **ACTIVE/SUBMITTED
Session** and **approval-snapshot** protection each proved, with `EXPIRED` and
`DELETED` Sessions proved *not* to lock; re-parenting and background swap
rejected; name/order/retirement still allowed on a protected row; protected
delete rejected and unprotected delete allowed.

The approval-snapshot case seeds its real chain — customer → custom request →
design case → design version → grant → verification challenge — because
asserting the predicate against nothing would prove nothing.

### 7.2 `app3-derivative-metadata.integration.spec.ts` — 17 cases

Column types and nullability; the three CHECKs by name; all-null quartet accepted
on historical kinds; fully measured quartet accepted; **five** partial
combinations rejected; clearing one field rejected; six non-positive values
rejected; blank, spaces-only and tab-only media type rejected; READY
`NORMALIZED` without the quartet rejected and with it accepted; a non-READY
`NORMALIZED` still accepted; promoting an unmeasured row to READY rejected;
promotion with the quartet in the same statement accepted; historical READY
`THUMBNAIL`/`CATALOG_PREVIEW` still accepted unmeasured; source-asset MIME/size
proved *not* to satisfy the derivative check; no forbidden column, no new kind,
table count unchanged.

### 7.3 `app3-placement-upgrade.integration.spec.ts` — 7 cases

The real upgrade, not a description of one: a baseline built from the committed
migrations minus 0034, seeded with two Sides sharing the display name `Front`
(where a name-derived code would collide) plus their Areas, then 0034 applied
from the committed folder. Asserts the pre-state has no new column, that every
row receives exactly `legacy-<uuid without hyphens>` matching the ruled format,
that codes stay distinct despite the shared name, that recomputing the expression
changes nothing (determinism, not "ran once"), that `code` ended `NOT NULL` with
both constraints, and that historical derivatives remain unmeasured.

### 7.4 `check-app3-db01.test.mjs` — 38 cases

Baseline; fact and dependency rows; §6.8.5 keys disjoint from §6.6.4 and §6.7.4;
missing migration; journal tag drift; lost journal entry; rollback section,
`DROP TABLE`, network call, extension install, created table; a second APP3
migration; `SET NOT NULL` before backfill; single-step `NOT NULL`;
non-deterministic backfill; deleted proof block; global code uniqueness; each
per-table constraint and each trigger removed; cross-parent and cycle rejection
removed; a recursive walk added; schema column removed or nullability flipped;
each protection source removed (**both** branches, so a half-gone guard cannot
pass); each protected column unfrozen; an editable column frozen; protected
delete allowed; cascade introduced; protection moved out of the database; each
quartet column missing; `NOT NULL` applied; each metadata CHECK removed;
all-or-none weakened to "any subset"; media-type check weakened to spaces-only;
READY requirement dropped; fabricated backfill; forbidden column; new derivative
kind; contribution state still pending; a downstream status contradicting the
ruled map; the dimensions follow-up falsely closed; the G03 follow-up reopened;
an APP3 operation in OpenAPI; a G04 regression including its schema mode.

### 7.5 Regression

`packages/database` full suite **277/277**, 15/15 suites — including the DB6
baseline, fingerprint and S24 trigger suites, which this change legitimately
moved and which now assert the new values. Table ownership count unchanged at 78;
no unauthorized table; no derivative enum expansion.

## 8. G03 dependency-table bound repair

`FU-APP3-G03-DEPENDENCY-TABLE-BOUND-01` = **`COMPLETE — CLOSED_BY_APP3-DB01`**.

`check-app3-g03.mjs` bounded §6.6.4 with the literal `## 7.`; it now uses the
`sectionBody()` helper introduced by the G02 repair, ending a section at the next
Markdown heading of equal or higher level. Four focused cases added (70/70 pass):
§6.6.4 reads only its own table (no `### 6.7`, no `UNBLOCKED_BY_G04`); two later
dependency tables with duplicate `id :: portion` keys cannot overwrite it; the
bound does not move when the quoted `## 7. ` prose moves; the live baseline stays
valid. No generic Markdown framework was introduced — the same three-line change.

## 9. Downstream reconciliation

```text
APP3-P01 = READY — NOT STARTED
APP3-P02 = READY — NOT STARTED
APP3-B01 = READY — NOT STARTED
APP3-B02 = BLOCKED_BY_APP3_B01_AND_APP3_B06
APP3-B03 = BLOCKED_BY_APP3_P01
APP3-B04 = BLOCKED_BY_APP3_P01_APP3_P02_AND_APP3_B06
APP3-B06 = BLOCKED_BY_APP3_P01
APP3-B07 = BLOCKED_BY_APP3_P01_AND_APP3_P02
APP3-B08 = BLOCKED_BY_APP3_P01_AND_APP3_P02
APP3-W01 = READY_BY_DB_DISPOSITION — NOT STARTED

G01 DB contribution = IMPLEMENTED_BY_APP3_DB01
G04 DB contribution = IMPLEMENTED_BY_APP3_DB01
```

The original G01/G04 decision facts are **not** rewritten; the implementation
state is recorded forward, in §6.8 and §10 of the phase plan.

`FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01` stays **`OPEN —
AUTHORITY_LOCKED_BY_APP3-G04`**, final owner `APP3-B02`, and loses `APP3-DB01`
from its blocker list: `BLOCKED_BY = APP3-B06`. The schema exists; nothing writes
canonical metadata yet and nothing publishes it yet.

## 10. Command index entries

`docs/implementation/SCOPED_COMMAND_INDEX.md` §3.1 gains `CMD-CHECK-APP3-DB01`,
`CMD-TEST-APP3-DB01` and `CMD-TEST-APP3-DB01-INTEGRATION`. No root
`package.json` script was added; root stays at 30.

## 11. Scoped validation

| Command | Result | Impact reason |
|---|---|---|
| `node tools/check-app3-db01.mjs` | **PASS** | created here |
| `node --test tools/check-app3-db01.test.mjs` | **38/38** | created here |
| `pnpm --filter @embroidery/database test` | **277/277, 15/15 suites** | the owning workspace; the schema, migration, DB6 baseline and fingerprint all changed |
| `node tools/db-manifest-check.mjs` | **PASS** | the column-metric register and schema manifest changed |
| `node packages/database/tools/db-migration-checksum-check.mjs` | **34/34 match** | a migration was added |
| `node tools/check-app3-g04.mjs` | **PASS — DERIVATIVE_METADATA_IMPLEMENTED** | its schema mode flips here |
| `node --test tools/check-app3-g04.test.mjs` | **39/39** | its mode fixtures invert (§12) |
| `node tools/check-app3-g03.mjs` | **PASS** | repaired here |
| `node --test tools/check-app3-g03.test.mjs` | **70/70** | repaired here |
| `node tools/check-app3-g02.mjs` · `node tools/check-app3-g01.mjs` | **PASS** | the shared phase file changed |
| `node --test tools/check-app3-g02.test.mjs` | **31/31** | same |
| `pnpm --filter @embroidery/database typecheck` | **PASS** | schema changed |
| `pnpm --filter @embroidery/persistence typecheck` | **PASS** | it compiles the schema package |
| `pnpm format:check` | **PASS** | global control |
| `pnpm lint` | **PASS** 21/21 | global control |
| `git diff --check` | **clean** | whitespace |

No `pnpm quality`. No root test, E2E, smoke, OpenAPI, Figma or full-regression
run. API and worker typecheck were **not** run: neither compiles the schema
package's source — the API resolves `@embroidery/database` to `dist` (IMP-D018)
and no API or worker file changed. Nothing was backgrounded; nothing polled.

## 12. Disclosures

- **`design_versions` is not a protection source.** It also references both
  placement tables, but the ruled set is exactly three. It sits behind
  `approval_snapshots` in the APP5 flow, and the approved snapshot — which *is* a
  source — is the record the customer agreed to. Widening the set would be a
  contribution this checkpoint is not authorized to make. Recorded in §6.8.3 so
  the owner of the formal design flow decides it rather than inherits it.
- **Two files outside the allowed list were changed**, both because the
  authorized schema change makes their current content false:
  `tools/check-app3-g04.test.mjs` (its schema-mode fixtures were written for the
  pre-migration world; the block is inverted, not weakened, and the pending mode
  is now the simulated one) and the four existing `packages/database` specs plus
  the DB6 live-baseline checkers under `packages/database/tools` (migration
  counts, constraint counts, trigger count, fingerprint). `packages/database/**`
  *is* allowed; only the G04 test file is a genuine deviation, and §14 of the
  directive requires that suite to be run — leaving it red was not an option.
- **The persistent development database was not migrated.** Applying 0034 to it
  is an operator action, and doing it here would have required the protected
  `DATABASE_URL` in hand. Every proof in this report comes from disposable
  databases the harness provisions itself.
- The `Expansions` slot in the column register now carries application-era
  additions as well as DB4 `×N` expansions. Splitting them into a fourth slot
  would change the register shape, the manifest table and the checker for a
  distinction the arithmetic never uses; the manifest §4.1 text names which is
  which.

## 13. Changed files

Commit A — `257bb5531e6a0ee3e8d075de59295068614e72f3`
(`feat(database): add APP3 placement and derivative authority`), 34 files.

**New:** migration `0034…sql` + `meta/0034_snapshot.json`; three integration
specs (`app3-placement-authority`, `app3-derivative-metadata`,
`app3-placement-upgrade`); `tools/check-app3-db01.mjs`,
`tools/check-app3-db01-placement.mjs`, `tools/check-app3-db01.test.mjs`.

**Modified:** `meta/_journal.json`; `product-sides.ts`, `embroidery-areas.ts`,
`asset-derivatives.ts`, `column-metrics.ts`; four existing database specs and the
harness spec; five `packages/database/tools` baseline artifacts; four
`docs/database` manifests/inventories; `08-DATABASE-CHANGE-CONTROL.md`,
`10-MASTER-APPLICATION-ROADMAP.md`, `13-PHASE-SOURCE-MAP.md`,
`SCOPED_COMMAND_INDEX.md`, the APP3 phase plan; `check-app3-g03.mjs`,
`check-app3-g03.test.mjs`, `check-app3-g04.test.mjs`.

No historical completion report was rewritten. Dated records carry forward
supersession notes.

## 14. Confirmations

- **No API, worker or frontend implementation.** `apps/**` untouched; no OpenAPI
  artifact, generated client, Figma node, `docs/design/**` file, spike,
  infrastructure file, dependency or lockfile changed. No API or persistence
  repository modified.
- **No root `package.json` change.**
- **No third contribution group**, no new table, no derivative enum value, no
  forbidden column.
- **Clean tree** after Commit B.
- **Nothing pushed.** `origin/production` remains `8b5f3b0`.

## 15. Final statuses

```text
APP3-G01 = COMPLETE — REVIEW_ACCEPTED
APP3-G02 = COMPLETE — REVIEW_ACCEPTED
APP3-G03 = COMPLETE — REVIEW_ACCEPTED
APP3-G04 = COMPLETE — REVIEW_ACCEPTED
APP3-DB01 = COMPLETE — REVIEW_DELIVERED

APP3 = IN PROGRESS — DATABASE DISPOSITION DELIVERED_FOR_REVIEW

APP3-P01 = READY — NOT STARTED
APP3-P02 = READY — NOT STARTED

FU-APP3-G03-DEPENDENCY-TABLE-BOUND-01 = COMPLETE — CLOSED_BY_APP3-DB01
FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 = OPEN — AUTHORITY_LOCKED_BY_APP3-G04
FINAL_OWNER = APP3-B02
BLOCKED_BY = APP3-B06
```

Human review owns `APP3-DB01 = COMPLETE — REVIEW_ACCEPTED`.
