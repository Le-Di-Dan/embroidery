# DB6-G19 — Audit Physical Schema Group Report

**Date:** 2026-07-19 · **Checkpoint:** DB6-G19 (final table-group of G1–G19)

## A. Preflight

- Branch `production`, HEAD at start `74eae23`, working tree clean.
- G18 commits confirmed and immutable: `8a6e5ad` (feat), `74eae23` (docs).
  Commit chain `bc1c096 → 9fd72e5 → 8a6e5ad → 74eae23` verified via
  `git log`. No amend, no rewrite.
- Migrations `0000`–`0028` confirmed byte-identical (only the new `0029`
  file and an appended `_journal.json` entry are new/changed — verified via
  `git diff`/`git status`).
- Live pre-G19 baseline confirmed on the persistent dev database and
  independently on a disposable G18-prefix upgrade database: **77 tables,
  818 physical columns, 157 FKs, 77 PK, 50 UQ, 188 CHECK, 181 physical
  indexes, 35 physical partial indexes, 8 physical JSONB columns.**
  Relationship baseline: 164 logical edges, 157/162 implemented (per the
  then-current, uncorrected ceiling).
- `audit_events` confirmed absent pre-G19 (no schema file, no migration,
  no live table). `IDX-095/096/097/098` confirmed absent from the index
  register's satisfied set. `audit_events.summary` confirmed absent.
  `REL-103` confirmed logical-only, no FK.
- **DEV-DB6-016 verification:** entry exists in
  `DB6_DEVIATION_REGISTER.md`, status `closed`, source IDs correct
  (REL-099/101, DB5 "unnecessary" verdicts, COL-TBL070-03, ADR-DB2-003 rule
  4/DEC-25). Live-verified: `notification_intents.recipient_contact_point_id`
  and `.source_outbox_event_id` carry no FK; `channel` carries no CHECK on
  either notification table. No physical drift from the deviation.
- **JSONB numbering reconciliation:** confirmed canonical map is
  `#7 = audit_events.summary (G19)`, `#8 = notification_intents.params
  (G18)`, `#9 = policy_configuration_versions.value (G2)`. Added a
  correction note directly to `DB6_G18_GROUP_REPORT.md` (its "boundary #9
  remains G19's scope" phrase meant chronological landing order, not the
  canonical boundary ID — no schema/migration change). Also found and
  corrected a second, unrelated stale-status bug while reconciling this
  table: `DB6_SCHEMA_IMPLEMENTATION_MANIFEST.md` §7 rows #1/#3
  (`design_sessions.design_document`, `design_template_versions.
  design_document`) were still marked `planned` despite being physically
  implemented since G7 (live-catalog-confirmed on the persistent dev
  database) — corrected to `implemented`.
- **G18 retention-wording reconciliation:** added a clarification note to
  `DB6_G18_GROUP_REPORT.md` — "attempts deleted with their parent intent"
  describes canonical retention-job/application deletion **ordering**, not
  a database `CASCADE`. `REL-100`'s live FK remains `ON DELETE RESTRICT`,
  unchanged, migration `0028` untouched.
- **Five-remaining-FK derivation — found to be three, not five (see §F).**
  Deriving strictly from canonical sources rather than assuming the
  prompt's figure: the deferred-FK edge ledger (manifest §2.2.1, 7 rows) is
  fully closed; DEV-DB6-010/012/013/014's corrective edges are all
  live-present; REL-105's full 10-edge enumeration
  (TBL-042:3/045:3/063:1/072:3) has 7/10 already physical. The only
  edges this group genuinely owns are TBL-072's own REL-105 subset:
  `admin_id`, `customer_id`, `grant_id` (3 edges, not 5). This is reported
  fully in §F/DEV-DB6-017 rather than silently forcing a 5-edge or 162/162
  outcome.
- Disposable-DB plan: fresh install (`embroidery_g19_fresh`) + G18-prefix
  upgrade (`embroidery_g19_upgrade`), both via `scratch-migrate.mjs`
  (removed after use). Persistent dev database untouched throughout.

## B. G19 scope

```text
Group:       G19 — Audit — CTX-AUD — no aggregate ID assigned (single table)
Table:       TBL-072 audit_events — bigint identity PK — append-only

Column metrics:
  9 logical COL IDs (COL-TBL072-01..09)
  4 expansion columns (COL-03 ×4: admin_id/customer_id/grant_id/
    system_job_key, +3; COL-05 ×2: target_kind/target_id, +1)
  13 business columns
  2 convention columns (id, created_at — no updated_at, append-only)
  15 physical columns

Relationships:
  REL-105 (TBL-072 subset ×3) — admin_id → admin_accounts (restrict),
    customer_id → customers (restrict), grant_id → secure_access_grants
    (restrict) — all three real physical FKs, all required per DB5-FK-
    index-review "required"/enumeration precedent
  REL-103 — (target_kind, target_id) → polymorphic target — logical only,
    no physical FK by design (justified cross-cutting exception)
  system_job_key — bare no-FK evidence, no REL row at all (no target
    table exists for a job key)
  All four columns nullable; grant_id is independent of actor_kind
    (may accompany any actor, same as sibling REL-105 tables)
  Delete behavior: RESTRICT on all three physical FKs
  Final physical FK reconciliation: 157 → 160 (see §F — not 162)

Constraints:
  CST-001 (PK) · CST-072 (CK, actor_kind ↔ ref match, same-row, physical)
  CST-080 (blanket NN — correlation_id, occurred_at, actor_kind, action,
    target_kind, target_id all NOT NULL)
  CST-098 (append-only reject UPDATE/DELETE — S24 trigger target, not
    implemented in G19)
  No UNIQUE constraint on this table (none in DB4)
  target_kind/action left open (no DB4 closed set, no CHECK invented)

Indexes:
  PK backing (implicit unique index on id)
  IDX-095 (required) — (target_kind, target_id, occurred_at DESC, id DESC)
  IDX-096 (required) — (occurred_at DESC, id DESC)
  IDX-097 (recommended, deferred S25) — (correlation_id)
  IDX-098 (recommended, deferred S25) — (admin_id, occurred_at DESC,
    id DESC) WHERE admin_id IS NOT NULL
  This group's physical index delta: +3 (PK-backing, IDX-095, IDX-096);
    0 physical partial indexes added
  Final G1–G19 index state: 184/211 physical, 35/45 partial

Audit fields:
  occurred_at (business time) · actor_kind (open text) · admin_id/
  customer_id/grant_id/system_job_key (actor evidence) · action (open
  text) · target_kind/target_id (polymorphic, no FK) · reason (nullable)
  · summary (jsonb, fixed shape, boundary #7) · failure_code (nullable)
  · correlation_id (NOT NULL) · id/created_at (convention)
```

## C. Implementation

- `packages/database/src/schema/audit/audit-events.ts` — new file, per the
  path already declared (as `planned`) in the schema manifest.
- Three real `foreignKey()` declarations (`admin_id`, `customer_id`,
  `grant_id`), all `onDelete('restrict')`, table-level form matching the
  sibling REL-105 tables' convention.
- `target_kind`/`target_id`: plain `text` columns, no `foreignKey()`,
  matching REL-103's justified exception; no target-kind registry table,
  no EAV.
- `ck_audit_events__actor_kind_ref_match`: a same-row CHECK enforcing
  `actor_kind` matches exactly one of `admin_id`/`customer_id`/
  `system_job_key`, both directions (kind implies ref set, ref set implies
  kind). `grant_id` is excluded from this CHECK — independent evidence,
  same treatment as the sibling REL-105 tables. `actor_kind`'s own domain
  is left open (no dictionary closed set in DB4) — an unrecognized kind
  value simply requires all three refs NULL; no closed enum is invented.
  This CHECK is implemented physically despite DB4's "dir (trigger
  candidate)" annotation on CST-072, following the precedent already set
  by CST-070/074 (same annotation, implemented as plain CHECKs elsewhere)
  and the sibling files' own comments, which explicitly reserve CST-072
  for `audit_events` alone.
- `summary`: plain `jsonb`, nullable, no discriminator column (DB4 gives
  this boundary a fixed internal shape with no version key, unlike
  boundaries #4/#6/#8/#9), no GIN index.
- IDX-095/IDX-096: implemented with explicit per-column `.desc()` on
  `occurred_at`/`id`, matching the codebase's existing DESC-index
  convention (`payment_attempts`, `payment_provider_events`,
  `custom_requests`, `orders`, `agreement_versions`).
- Migration: `packages/database/migrations/0029_create_audit_events_table.sql`
  — generated by `drizzle-kit generate`, renamed to the deterministic
  convention (drizzle's random `0029_bored_norman_osborn.sql` slug
  discarded). One `CREATE TABLE`, three `ALTER TABLE ADD CONSTRAINT` (the
  three FKs — Drizzle emits FKs as separate statements even declared
  table-level), two `CREATE INDEX`. No custom SQL needed — no header↔child
  cycle exists for this table. Migrations `0000`–`0028` untouched.
- IDX-097/IDX-098 **not implemented** — deferred to S25 exactly as
  instructed; verified absent on both disposable databases.
- CST-098's trigger **not implemented** — deferred to S24; `audit_events`
  is on the existing S24 target list (`DB6_SCHEMA_IMPLEMENTATION_
  MANIFEST.md` §6 CST-098 row already lists it).
- Deviations: DEV-DB6-017 (new — physical-FK-target ceiling correction,
  162 → 160, see §F). No deviation was needed for the table's own design —
  every column, relationship and constraint choice matched a documented
  precedent exactly (REL-105 sibling tables, CST-070/074 CHECK precedent,
  DB5's index tiering).

## D. Integrity handoff

- **Actor consistency** (kind ↔ which ref column is set): DB-enforced now
  via `ck_audit_events__actor_kind_ref_match`. Cross-table facts (does the
  named admin/customer/grant actually have the claimed authority, is the
  grant still valid) remain TX/App — no cross-table CHECK is faked.
- **Target kind/ID application validation**: `target_kind`/`target_id`
  compatibility (does this `target_id` actually belong to a row of
  `target_kind`) is TX/App — REL-103's justified no-FK exception means the
  DB cannot verify this, by design; DB7 should add representative
  negative-shape tests, not integrity enforcement.
- **Append-only S24 target**: `audit_events` UPDATE/DELETE currently
  succeed (verified in §H smoke cases 13/14) — an honest, reported
  pre-S24 gap, not a regression. S24 must add the trigger; DB7 should add
  a mutation-rejection test once S24 lands.
- **Security/redaction**: `summary` contains only redacted before/after
  facts in this group's smoke fixtures; no secret-bearing column exists on
  this table. DB10 owns the actual redaction/anonymization policy
  execution; this group only confirms the physical shape permits it
  (opaque JSONB, no queryable PII inside it).
- **DB7/DB8/DB10 handoffs**: DB7 — actor-FK dangling-reject tests (already
  smoke-verified structurally here), REL-103 no-FK-by-design assertion,
  CST-072 CHECK matrix, append-only pre/post-S24 behavior. DB8 — none
  (no concurrency-sensitive path on this table; it is insert-mostly).
  DB10 — retention-expiry job scope for the `audit` class, summary
  redaction strategy on customer anonymization.

## E. Metrics (live catalog only)

Fresh install (`embroidery_g19_fresh`, empty → all 29 migrations) and the
disposable G18-prefix upgrade (`embroidery_g19_upgrade`, 0028 baseline →
seed → 0029) independently produced identical figures:

```text
tables:                          78 / 78
physical columns:                833
FK constraints:                  160
PK constraints:                  78
UNIQUE constraints:               50
CHECK constraints:               189
physical indexes:                184 / 211
physical partial indexes:         35 / 45
partial unique indexes:           13 / 13
physical JSONB columns:            9 / 9
applied migrations:               29
latest migration:               0029
```

`audit_events` itself: 15 columns, 3 FKs, 2 explicit indexes (+1 PK-backing
implicit unique index) — exact match to §B's derived metrics.

## F. Final G1–G19 relationship reconciliation

```text
documented REL rows:            92
expanded logical edges:        164   (checker-enforced, unchanged)
physical FK targets:           160   (corrected — was 162, see DEV-DB6-017)
physical FKs implemented:      160 / 160
intentional logical no-FK:
- REL-103  Audit polymorphic target
- REL-104  Outbox polymorphic aggregate
```

**DEV-DB6-017 (new this group).** The "162" physical-FK-target ceiling was
declared at DB6-C4 (pre-G12) as `164 − 2` and repeated unchanged through
every subsequent group report (`83/162` → `96/162` → `107/162` →
`133/162` → `146/162` → `156/162` → `157/162`). This group is the first
point where the full G1–G19 delta chain closes and must reconcile to a
concrete final sum — and it does not reach 162. Reconstructing the chain
from each group's own already-committed, live-verified delta (G11 ends
78/156; +5 G12; +13 G13; +11 G14; +26 G15; +13 G16; +10 G17; +1 G18;
+3 G19) gives **160**, matching the live catalog on both disposable
databases exactly. Every intermediate step was independently re-checked
this round: the deferred-FK ledger (manifest §2.2.1) is fully closed, all
7 rows `implemented`; DEV-DB6-010/012/013/014's corrective edges are all
live-present; REL-105's full 10-edge enumeration is now 10/10 physical. No
missing or extra edge exists in any canonical document read for this
group — the shortfall is a documentation/arithmetic artifact from DB6-C4,
not a missing table or column. Full evidence trail in
`DB6_DEVIATION_REGISTER.md` DEV-DB6-017. The ceiling is corrected to
**160** in the schema manifest, index manifest, and relationship coverage
audit; `164` logical edges is unaffected and remains checker-enforced.

Other standing items, reconfirmed:

- DEV-DB6-010/012/013/014 additions: all live-present (custom_request_
  assets→assets; design_versions ×4 placement; approval_snapshots ×4
  placement; shipping_fee_acknowledgements ×2).
- DEV-DB6-015 no-FK evidence columns (order_cancellation_requests,
  payment_reconciliations, refunds ×2, production_notes): confirmed still
  outside any FK count, live-verified absent from `pg_constraint`.
- DEV-DB6-016 no-FK Notification references: confirmed still outside any
  FK count, no denominator change (as already stated in that entry).
- Zero unresolved deferred-FK ledger rows (7/7 implemented).
- Zero orphan physical FKs, zero physical FKs without manifest ownership
  (every one of the 160 live FKs traces to a named REL/DEV entry).

## G. A-status

- **A03**: partial indexes 35/45 (13 unique + 22 performance); volatile
  predicates = 0; G19's required-index partial delta = 0, exactly as
  expected (IDX-098 is recommended, deferred).
- **A08**: no G19 money column; A08 remains closed, unaffected.
- **A09**: `actor_kind`, `action`, `target_kind` are all open text per
  DB4 — no closed set exists for any of them, so none is invented; no CHECK
  added beyond CST-072's ref-matching rule. Audit has no lifecycle status.
- **A10**: `audit_events` is append-only; S24 target recorded, not yet
  implemented (honest gap, smoke-verified in §H).
- **A11**: IDX-095/IDX-096 implemented; IDX-097/IDX-098 deferred; post-G19
  physical indexes 184/211; S25 backlog is now the full remaining set
  (211−184=27 explicit-performance/partial-unique entries plus this
  group's own IDX-097/098).
- **A12**: no measured performance claim made anywhere in this report;
  `EXPLAIN` output cited only to confirm structural index usage.
- **A15**: no JSONB GIN, no BRIN, no PII/search index, no speculative
  index added on this table.
- **JSONB**: boundary definitions 9/9; physical JSONB columns 9/9;
  `audit_events.summary` = canonical boundary #7 (not #9 — see §A
  numbering-correction note).
- **Relationships**: physical FKs 160/160 (corrected ceiling, DEV-DB6-017).

## H. Validation

- **Static**: `tsc --noEmit` clean; `eslint src` clean; `jest` 100/100
  passing (2 suites, including `column-metrics.spec.ts`'s live-schema
  bijection check); `check-file-size.mjs` passing (only a pre-existing,
  unrelated review-threshold flag on `tools/db-metric-check.mjs`, 314
  lines, no hard failure); `db-manifest-check.mjs` passing with **one**
  pre-existing, unrelated problem carried over from G16
  (`payment/refunds.ts` has an `updated_at` column its stated mutability
  class forbids — flagged here for visibility, not fixed, since fixing it
  would mean editing an already-committed G16 file/migration outside this
  group's scope; recommend a follow-up S25/S26-adjacent cleanup);
  `db-deferred-owner-check.mjs` clean (exit 0).
- **Fresh disposable** (`embroidery_g19_fresh`): 78 tables, 833 columns,
  160 FKs, 78 PK, 50 UQ, 189 CHECK, 184 physical indexes, 35 partial, 9
  JSONB, 29 migrations. `audit_events` confirmed present, `summary` is
  `jsonb`, no tenth JSONB column, REL-103 (target_kind/target_id) has no
  FK, all three G19 physical FKs present, IDX-095/096 exact key/DESC
  shape, IDX-097/098 confirmed absent, no append-only trigger yet, no
  unexpected object, `drizzle-kit check` clean.
- **Disposable G18-prefix upgrade** (`embroidery_g19_upgrade`): applied
  through `0028`, confirmed pre-G19 baseline exactly (77/818/157/77/50/
  188/181/35/8), seeded one Admin Account, one Customer, one Custom
  Request, one Secure Access Grant, applied `0029`, all four seed rows
  confirmed to survive, post-upgrade catalog identical to the fresh
  install in every metric, `drizzle-kit check` clean.
- **No-op/drift**: `drizzle-kit check` reports "Everything's fine" on both
  disposable databases; migration re-application is a no-op; no duplicate
  object; journal/checksum chain intact (`0000`–`0028` byte-identical,
  confirmed via `git diff`).
- **Physical parity**: see §E — both disposable databases agree exactly.
- **Behavioral smoke** — 14 generated cases, all PASS:

| # | Case | Operation | Expected | Actual | SQLSTATE |
|---|---|---|---|---|---|
| 1 | valid-admin | INSERT, actor_kind=ADMIN, admin_id set | OK | OK | — |
| 2 | valid-customer-with-grant | INSERT, actor_kind=CUSTOMER, customer_id+grant_id set | OK | OK | — |
| 3 | valid-system | INSERT, actor_kind=SYSTEM, system_job_key set | OK | OK | — |
| 4 | valid-summary-reason | INSERT with reason + summary JSONB | OK | OK | — |
| 5 | dangling-admin | INSERT, admin_id = nonexistent UUID | reject | reject | 23503 |
| 6 | dangling-customer | INSERT, customer_id = nonexistent UUID | reject | reject | 23503 |
| 7 | dangling-grant | INSERT, grant_id = nonexistent UUID | reject | reject | 23503 |
| 8 | actor-kind-mismatch-null-ref | actor_kind=ADMIN, admin_id NULL | reject | reject | 23514 |
| 9 | actor-kind-mismatch-wrong-ref | actor_kind=ADMIN, customer_id set instead | reject | reject | 23514 |
| 10 | nonexistent-target-accepted | target_id = nonexistent UUID (REL-103) | accept (by design) | accept | — |
| 11 | correlation-required | correlation_id omitted | reject | reject | 23502 |
| 12 | occurred-at-required | occurred_at omitted | reject | reject | 23502 |
| 13 | update-succeeds-pre-s24 | UPDATE reason on an existing row | succeeds (honest gap) | succeeded | — |
| 14 | delete-succeeds-pre-s24 | DELETE an existing row | succeeds (honest gap) | succeeded | — |

  IDX-095/IDX-096 structural compatibility confirmed via `EXPLAIN`: the
  target-history query plan used `Index Scan using
  ix_audit_events__target__occurred__id` with the exact `(target_kind,
  target_id)` index condition; the global-timeline query planned a
  sequential scan only because the smoke table has a handful of rows
  (cost-based, expected, not a defect) — the index exists with the
  correct `(occurred_at DESC, id DESC)` shape and would be chosen at
  representative volume; no measured-performance claim is made (DB9's
  scope).
- **Final table/FK reconciliation**: see §F. 78/78 tables, 19/19 groups,
  160/160 corrected physical FK target, zero orphan/unowned physical FKs.
- **Security/privacy**: no secret-bearing column exists on `audit_events`;
  `summary` fixture used only redacted before/after status facts; no GIN/
  BRIN/trigram index added; static sensitive-key scan of the schema file
  and fixtures found no password/token/OTP/API-key/PAN/CVV/raw-payload
  pattern.
- **Persistent dev DB untouched**: confirmed — all validation ran against
  `embroidery_g19_fresh`/`embroidery_g19_upgrade` only; both dropped after
  use; no `DATABASE_URL` pointing at the persistent `embroidery` database
  was used for any mutating step in this group. (A read-only query against
  it was used once during preflight, purely to confirm the stale-JSONB-
  status finding in §A — no write.)

## I. Commits

1. `feat(database): implement DB6 schema group G19` — schema file, index/
   column-metrics registers, migration `0029`, manifest/coverage-audit/
   deviation-register updates, G18 report corrections.

No amend, no squash. Not pushed (33+ commits ahead of `origin/production`
already, unpushed by standing policy — this group adds one more, pending
the user's own push decision).

## J. Verdict

```text
DB6-G19      PASS
DB6-G01..G19 COMPLETE
DB6-S24..S28 OPEN
OVERALL DB6  IN PROGRESS
```

G1–G19 physical schema implementation is complete (78/78 tables, 19/19
groups). This does **not** close DB6 overall: S24 (triggers — immutability,
append-only, outbox column-scope, actor consistency), S25 (explicit
performance-index backlog, including IDX-097/098), S26–S28 remain open.
