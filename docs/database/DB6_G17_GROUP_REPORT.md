# DB6-G17 Group Report — Production (CTX-PRD)

## A. Preflight

- Branch `production`, HEAD before this group: `04f352f`, tree clean.
- Commit chain confirmed: `701ebb0` (G16) → `0736e9c` (fix VND scale) →
  `bf17e41` (chore reconcile) → `04f352f` (docs hash fill-in) — all four
  present via `git log`, none amended.
- Migrations `0000`–`0026` byte-identical; a disposable database built from
  the trimmed `0000`–`0026` set (skipping `0027`) confirmed 70 tables, 26
  migrations before this group's migration ran.
- `drizzle-kit check` clean before starting.
- Jest: 92/92 passing before starting.
- Corrected baseline confirmed live (not hand-added): 70 tables, 797→751
  physical columns *before* this group (751 confirmed pre-G17), 146 FKs, 70
  PK, 46 UQ, 177 CHECK, 166 physical indexes, 33 physical partial indexes
  (13 unique + 20 performance) — matches `DB6_INDEX_METRIC_RECONCILIATION.md`
  exactly.
- Canonical G17 scope derived from `DB6_SCHEMA_IMPLEMENTATION_MANIFEST.md`
  §3 ("G17 — Production (CTX-PRD)") and confirmed against
  `DB4_TABLE_CATALOG.md` (TBL-059..063), `DB4_COLUMN_DICTIONARY.md`,
  `DB4_RELATIONSHIP_AND_FK_MODEL.md` (REL-090..094), `DB4_KEYS_AND_
  CONSTRAINTS.md` (CST-041/042/043), `DB3_LIFECYCLE_SPECIFICATIONS.md`
  (LC-18) and `DB6_RELATIONSHIP_COVERAGE_AUDIT.md` §3 (which had already
  pre-registered this group's exact Class-A/C counts: 10 / 1). No BLOCKED
  condition; no manifest/C4 contradiction found.
- `production_notes.admin_id` confirmed covered by DEV-DB6-015 (fourth and
  last of its four forward columns); `production_job_transitions.admin_id`
  confirmed covered by REL-105's enumeration instead (TBL-063 is one of its
  four listed tables) — the two are not interchangeable.
- JSONB closed set confirmed 9/9 before starting; DB4 confirms no JSONB
  field on any G17 table. No money field on any G17 table — A08 unaffected.
- Persistent dev database was **not** used for any upgrade test; three
  disposable databases (`embroidery_g17_fresh`, a trimmed-migration
  intermediate, `embroidery_g17_upgrade`) were created for validation and
  dropped afterward. The persistent dev database remained at 65 tables
  throughout this group's work.

## B. G17 scope

- **5 tables**: TBL-059 `production_jobs` (uuid7, mutable), TBL-060
  `production_specifications` (uuid7, immutable), TBL-061
  `production_artifacts` (uuid7, mutable), TBL-062 `production_notes`
  (bigint, append), TBL-063 `production_job_transitions` (bigint, append).
- Aggregate owner: AGG-17 (Production), CTX-PRD.
- Column metrics: logical IDs 25, expansions 9, business columns 34,
  convention columns 12, physical columns 46 (11+13+7+5+10). Verified
  against `drizzle-kit generate`'s own per-table report (exact match on
  first attempt) and `column-metrics.spec.ts` (97/97 passing).
- Relationship classes: REL-090 (→orders), REL-091 (→approval_snapshots),
  REL-092 (→production_jobs self, rework lineage), REL-093 ×2
  (→production_jobs, →approval_snapshots), REL-094 ×4 (→production_jobs
  from artifacts/notes/transitions, →assets) plus the REL-105 actor edge
  (transitions→admin_accounts) — 10 physical FKs total, matching the
  relationship-coverage audit's own pre-registered count exactly.
- Constraints: CST-041 (plain UQ, `(order_id, approval_snapshot_id)` —
  `production.start` idempotency), CST-042 (plain UQ, `production_job_id`
  1–1), CST-043 (plain UQ, `(production_job_id, asset_id)`) — none of the
  three is partial; LC-18 status CHECK on `production_jobs` and both
  from/to CHECKs on `production_job_transitions`; artifact `kind` CHECK;
  same-row conditional CHECKs for `cancelled_reason` (status=CANCELLED)
  and transition `reason` (to_status=CANCELLED); document-hash format
  CHECK (CST-070 instance); physical-dimension and quantity positivity
  CHECKs.
- Indexes: CST-041/042/043 backing indexes (constraint-created, no `IDX-*`
  ID); IDX-082 (`R`, required, partial on `status IN ('PLANNED','STARTED')`)
  and IDX-102 (`R`, required, job timeline) implemented with the group;
  IDX-138 (`r`, recommended) deferred to S25 per the standing per-group
  policy.
- State/type: LC-18 (`production_jobs.status`, 4 states: PLANNED→STARTED→
  COMPLETED terminal; PLANNED/STARTED→CANCELLED terminal), plus the closed
  set for `production_artifacts.kind`. `actor_kind` on transitions carries
  no dictionary set, same precedent as `order_transitions`/
  `custom_request_transitions`.
- Dependencies: Order (REL-090, restrict), Approval Snapshot (REL-091/093,
  restrict — exact evidence, never a mutable pointer), Asset (REL-094,
  restrict — internal-only artifacts, INV-21/22), Admin Account (REL-105
  on transitions only). No dependency on Payment/Reservation/Shipping
  tables at the physical level — production eligibility (deposit paid,
  reservation active) is a cross-table TX/App fact per TR-LC18-01/02/03
  (DB3), never a stored boolean or a physical CHECK spanning those tables.

## C. Implementation

- `production_jobs` — order-scoped root (no `order_item_id` column exists
  in DB4's dictionary for this table); CST-041's plain unique pair is the
  physical `production.start` idempotency arbiter (INV-19); rework
  represented via `reworked_from_job_id` self-reference plus a fresh job
  row after a new approval, never a spec mutation.
- `production_specifications` — immutable snapshot (no `updated_at`),
  frozen from the exact `approval_snapshots` row at job creation;
  `document_hash` reuses the same format CHECK as
  `approval_snapshots`/`design_versions`/`assets`; no JSONB, no binary/
  base64, no generic metadata — `production_parameters` is plain text
  (admin machine/thread instructions), matching DB4's dictionary exactly.
- `production_artifacts` — job↔asset association using the established
  Asset-context ownership pattern (same shape as `design_version_assets`/
  `gallery_entry_assets`); no storage metadata duplicated; `kind` closed
  set (DIGITIZED_FILE/MACHINE_FILE/PHOTO/OTHER).
- `production_notes` — append-only (no `updated_at`); `admin_id` no-FK
  per DEV-DB6-015, the fourth and last forward column that entry named.
- `production_job_transitions` — append-only; from/to CHECKs against the
  same LC-18 tuple as the root; `admin_id` **does** get a real FK here
  (REL-105's enumeration includes TBL-063) — the one case in this group
  where the no-FK precedent does *not* apply, documented explicitly to
  avoid confusion with `production_notes`.
- Migration: `0027_create_production_tables.sql` (generated, 5
  `CREATE TABLE`, 10 inline FKs, 2 indexes). **Zero header↔child import
  cycles** in this group — every file imports only "earlier" modules; no
  custom SQL was needed, unlike G12/G13/G14/G16.
- No deviations beyond the pre-registered DEV-DB6-015 application (one
  column) and the REL-105 real-FK application (one column, the opposite
  treatment); no new Class-C/D findings surfaced during implementation —
  matches the relationship-coverage audit's own pre-registered Class-C
  count of 1 exactly.

## D. Integrity handoff

- **Order/Payment/Reservation eligibility.** No fake boolean
  (`deposit_paid`/`reservation_ready`/`approval_valid`) exists anywhere in
  this group. TR-LC18-01 (DB3, GRD-013) is the TX/App gate that creates a
  job only after deposit-paid + reservation-active + approval facts are
  independently true in their own tables — this group stores only the
  resulting job/spec/artifact/note/transition facts, never a duplicated
  or cached copy of those cross-table facts.
- **Exact Approval/Design authority.** `production_jobs.approval_
  snapshot_id` and `production_specifications.approval_snapshot_id` both
  reference the exact, immutable `approval_snapshots` row — never a
  mutable current-pointer. Both FKs prove existence; that the
  specification's snapshot reference is the *same* one the parent job
  references is TX/App, not database-enforced (no composite FK invented).
- **Same-chain guards.** No composite FK or trigger was invented anywhere
  in this group to enforce cross-table chain consistency beyond plain
  existence FKs — consistent with the standing engagement-wide policy.
- **Actor handling.** `production_notes.admin_id` — no-FK evidence
  (DEV-DB6-015). `production_job_transitions.admin_id` — real FK
  (REL-105). `system_job_key` on transitions is a plain evidence string,
  never a row reference.
- **Immutability/append-only targets.** `production_specifications`
  (immutable, no mechanism yet — S24), `production_notes`/`production_
  job_transitions` (append-only, no mechanism yet — S24); `production_
  jobs`/`production_artifacts` remain genuinely mutable per DB4.
- **DB7/DB8 handoffs.** DB7: specification immutability rejection test,
  transition matrix validity test (from/to CHECK proves membership, not
  legality of the pair). DB8: CC-12 (order-row contention on start vs
  hold/cancel), rework-vs-new-approval race, duplicate `production.start`
  call (CST-041 backstop already physical).

## E. Metrics after G17 (live catalog only)

```text
groups complete:              17 / 19
tables implemented:           75 / 78
logical COL IDs:              513
logical expansions:            88
business columns:             601
convention columns:           196
physical columns:             797
logical relationship edges:   164 (unchanged)
physical FK targets:          162 (unchanged)
physical FKs implemented:     156 / 162
PK constraints:                75
FK constraints:               156
UNIQUE constraints:             49
CHECK constraints:             186
physical indexes:             176 / 211
physical partial indexes:      34 / 45
  partial unique:               13 / 13
  partial performance:          21 / 32
JSONB boundaries:                9 / 9 (unchanged — no G17 JSONB)
money scale coverage:          unchanged (no G17 money column)
state/type columns:            +2 closed sets (LC-18, artifact kind)
documents updated:              4 (schema manifest, index manifest,
                                deviation register, relationship audit)
```

Live-verified on a disposable fresh-install database
(`embroidery_g17_fresh`, empty → `0000`–`0027`): 75 tables, 797 columns,
156 FKs, 75 PK, 49 UQ, 186 CHECK, 176 physical indexes, 34 physical partial
indexes, 27 applied migrations, `drizzle-kit check` reporting "Everything's
fine 🐶🔥". Every number above is read directly from `pg_class`/`pg_index`/
`pg_constraint`, none hand-added.

## F. A-status

- **A03** (partial indexes): 1 new partial predicate this group
  (`ix_production_jobs__created_id__active`, IDX-082) — zero volatile
  (`now()`) predicates. `IDX-102` is non-partial.
- **A08** (money): no money field exists on any G17 table (DB4-confirmed).
  A08 remains closed, unaffected by this group.
- **A09** (state/type parity): LC-18 (4 states) and `production_artifacts.
  kind` (4 values), each a single `const` tuple driving both the TS union
  and the CHECK, TS/DB byte-identical.
- **A10** (mutability class): `production_jobs` mutable; `production_
  specifications` immutable (no `updated_at`); `production_artifacts`
  mutable (per DB4); `production_notes`/`production_job_transitions`
  append-only (no `updated_at`). S24 owns all four non-root reject-
  mutation/immutability triggers; DB7 targets: specification immutability,
  transition-matrix legality, CST-041 idempotency replay.
- **A11** (index budget): `production_job_transitions` carries PK + 1
  index (IDX-102), `production_jobs` carries PK + 1 UQ-backing + 1 index
  (IDX-082) — both well under any recorded budget exception; no new
  exception needed this group.
- **A12**: no performance pass run on this group's (empty/smoke-only)
  data — deferred to DB9 per standing policy.
- **A15**: no speculative index added; IDX-138 (recommended) deferred to
  S25, recorded in `DB6_INDEX_IMPLEMENTATION_MANIFEST.md`'s pending table,
  not silently dropped.
- **DEV-DB6-015**: closed for its fourth and final forward column
  (`production_notes.admin_id`) exactly as prescribed — no FK added, no
  broadening of the deviation. `production_job_transitions.admin_id`
  correctly did **not** reuse this deviation (REL-105 covers it instead).

## G. Validation

- **Static**: `tsc --noEmit` clean; `eslint .` clean; `prettier --write`
  applied to the 5 new schema files (import-wrap only, no semantic
  change); Jest 97/97 passing (was 92 before this group — 5 new column-
  metric rows, one per table, account for the difference); all 5 new files
  well under the 400-line source limit (60–100 lines each).
- **Fresh disposable install** (`embroidery_g17_fresh`, empty →
  migrations `0000`–`0027`): 75 tables, 797 columns, 156 FKs, 75 PK, 49 UQ,
  186 CHECK, 176 physical indexes, 34 physical partial indexes, 27
  journal rows, `drizzle-kit check` clean. Dropped after verification.
- **Disposable G16+C5-prefix upgrade** (`embroidery_g17_upgrade`): trimmed
  migration set `0000`–`0026` applied via a temporary `out:`-repointed
  migrator, confirmed 70 tables / 26 migrations before this group's
  migration ran, seeded a representative chain (Customer → Category →
  Product → Product Variant → Custom Request → Design Case → Design
  Version → Secure Access Grant → Contact Verification Challenge →
  Approval Snapshot → Quotation → Quotation Version (ACCEPTED) → Order
  (DEPOSIT_PAID) → Payment Obligation (SATISFIED) → Payment Attempt
  (SUCCEEDED)), then applied `0027` via the real config. Old data
  survived intact (order `total_amount` byte-identical); new tables/FKs
  added cleanly; a full Production Job family (job/spec/artifact/note/
  transition) inserted validly against the upgraded database; final
  state (75 tables, drift clean) matched the fresh-install figures
  exactly. Dropped after verification.
- **Reapply/drift**: a second `drizzle-kit check` on both disposable
  databases reported "Everything's fine 🐶🔥"; no generated diff on
  reapply.
- **Physical parity**: exact 5-table, 46-column, 10-FK, 9-CHECK-plus-3-UQ,
  2-index (2 constraint-created backing + 2 explicit) match between the
  schema, the generated migration, and both live disposable databases.
- **Behavioral smoke** (19 cases against the disposable upgrade
  database, generated case table, not hand-counted): 3 expected successes
  (mutable-root re-transition, CANCELLED transition with reason,
  `production_notes.admin_id` no-FK acceptance of a dangling admin), 16
  expected rejections (dangling order/approval-snapshot/asset/job/admin
  FKs, CST-041/042/043 duplicate arbiters, invalid LC-18 state, invalid
  artifact kind, missing cancelled_reason on CANCELLED, missing transition
  reason on CANCELLED, invalid document-hash format, non-positive physical
  dimension). All 19 outcomes matched expectation exactly; zero
  unexpected results.
- **Security/privacy**: no PAN/CVV/secret/PII beyond what DB4 already
  authorizes (recipient/admin evidence references only); no PostgreSQL
  `DETAIL` text forwarded outside this report/smoke evidence.
- **Persistent dev DB untouched**: confirmed at 65 tables both before and
  after this group's disposable-database work.

## H. Commits

```text
bc1c096  feat(database): implement DB6 schema group G17
```

Tree clean immediately after commit. Not pushed.

## I. Verdict

```text
DB6-G17      PASS
OVERALL DB6  IN PROGRESS
```
