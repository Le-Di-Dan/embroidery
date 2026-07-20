# DB6-S24 Group Report — Immutability, Append-Only, Column-Scoped & Actor-Consistency Triggers

## A. Preflight

- Branch: `production`. HEAD at start: `d81d8a81088ecbce25ed3b6af4e85edea64b00c4` (G19).
  Tree clean, not pushed.
- Migration baseline: `0000`–`0029`, byte-identical to committed form; disposable
  `embroidery_s24_fresh` applied all 30 migrations cleanly end to end.
- Live baseline before S24 (on `embroidery_s24_fresh`, post-0029 layer, pre-trigger):
  matches the G19 report exactly — 78 tables, 833 columns, 160 FKs, 78 PK, 50 UQ, 189 CHECK,
  184 physical indexes, 9/9 JSONB.
- Isolated-table audit and DEV-DB6-017 final reconciliation: see
  `DB6_PHYSICAL_ISOLATION_AUDIT.md` — no class-F (defect) table found, 160/160 physical FK
  edges independently reconciled, no schema change required.
- `refunds.updated_at` vs. mutability class: documentation/checker-rule defect, not a schema
  defect — see `DB6_PHYSICAL_ISOLATION_AUDIT.md` §4. Fixed in `tools/db-manifest-check.mjs`.
- Trigger targets derived from `DB4_KEYS_AND_CONSTRAINTS.md` §6/§7, cross-checked against
  `DB6_SCHEMA_IMPLEMENTATION_MANIFEST.md`'s per-group "not yet a database mechanism" notes
  and the immutability-class summary table.
- No S24 migration existed before this slice; no S25 index work performed; persistent dev DB
  not used for any upgrade testing in this slice (confirmed still at migration id 29
  throughout).

## B. Isolation audit

See `DB6_PHYSICAL_ISOLATION_AUDIT.md` in full. Summary: `redirect_rules` (path/config, class
C), `content_pages` (aggregate root, class A), `idempotency_records` (platform primitive,
class B), `background_job_attempts` (generic append-only evidence, class D),
`outbox_events` (polymorphic REL-104, class E), `policy_configurations` (aggregate root
header, class A), `notification_intents` (linked internally via
`notification_delivery_attempts`; two intentional no-FK edges under DEV-DB6-016, class E
partial). Zero class-F findings. No FK added.

## C. S24 scope — trigger categories and targets

One shared function, `public.fn_reject_mutation_conditional()`, parameterized by `TG_ARGV`,
backs all 30 triggers. It supports four freeze modes (`always`, `frozen_when`,
`frozen_when_not`, `frozen_when_not_null`) and a per-trigger UPDATE column allowlist plus a
DELETE policy (`reject` | `retention_exempt`).

**IMMUTABLE — always frozen, no exceptions, DELETE always rejected** (CST-091/093/095, plus
the snapshot half of CST-094): `approval_snapshots`, `approval_snapshot_thread_colors`,
`approval_snapshot_agreement_acceptances`, `order_items`, `production_specifications`,
`shipping_snapshots`.

**APPEND_ONLY — always frozen, no exceptions, DELETE exempted only under
`app.bypass_retention_trigger = 'on'`** (CST-098, 16 tables): `inventory_ledger_entries`,
`audit_events`, `payment_provider_events`, `payment_reconciliations`, `order_transitions`,
`custom_request_transitions`, `production_job_transitions`, `design_reviews`,
`request_moderation_notes`, `production_notes`, `notification_delivery_attempts`,
`contact_verification_attempts`, `customer_merge_events`, `quotation_acceptances`,
`shipping_fee_acknowledgements`, `asset_inspections`, `background_job_attempts`.

**COLUMN_SCOPED_UPDATE** (CST-099, CST-100):
- `outbox_events` — allowed: `status`, `attempt_count`, `next_attempt_at`, `claimed_by`,
  `claimed_at`, `dispatched_at`, `last_error`; DELETE retention-exempt (S25 TTL cleanup).
- `refunds` — allowed: `status`, `method`, `transfer_reference`, `reason`,
  `customer_visible_reason`, `approved_by_admin_id`, `executed_by_admin_id`, `approved_at`,
  `executed_at`, `updated_at`; DELETE always rejected (financial evidence, no exemption).

**Conditional IMMUTABLE — frozen once status leaves `DRAFT`, except the legal advance +
its own timestamp(s)** (CST-090, CST-092, CST-096):
- `design_versions` — allowed: `status`, `sent_at`, `approved_at`, `superseded_at`,
  `voided_at`, `void_reason`.
- `quotation_versions` — allowed: `status`, `sent_at`, `accepted_at`, `superseded_at`,
  `expired_at`, `void_reason`. (`quotation_line_items` has no own trigger — its freeze is
  structural, inherited from the parent version per its own JSDoc; adding one would be a
  redundant no-op since the version freeze already makes its lines unreachable for
  correction.)
- `agreement_versions` — allowed: `status`, `published_at`, `superseded_at`,
  `withdrawn_at`, `withdraw_reason`.

**Conditional IMMUTABLE — frozen once status = `FROZEN`, no exceptions** (CST-094,
`shipping_details` half): `shipping_details`.

**Conditional IMMUTABLE — frozen once `published_at IS NOT NULL`, no exceptions**
(CST-097): `design_template_versions`.

**ACTOR_CONSISTENCY** — zero trigger targets. The only canonical actor-consistency
candidate (CST-072, `audit_events.actor_kind` ↔ matching actor ref) is already implemented
as the same-row CHECK `ck_audit_events__actor_kind_ref_match` (G19); no additional trigger
mechanism is needed or added for it in this slice.

Total: **30 tables, 30 triggers, 1 function.**

## D. Implementation

- Migration: `packages/database/migrations/0030_add_integrity_triggers.sql` — hand-authored
  custom SQL (Drizzle's table DSL has no trigger primitive; same class as
  `0026_enforce_vnd_currency_scale.sql`). Contains only the function and the 30 triggers; no
  tables, columns, FK repairs, or S25 index objects.
- `packages/database/migrations/meta/0030_snapshot.json` — copied from `0029_snapshot.json`
  with a new `id`/`prevId` chain link; no table/column diff (triggers are outside Drizzle's
  schema DSL, so the snapshot content is unchanged).
- `packages/database/migrations/meta/_journal.json` — appended idx 30 entry.
- No workflow/state-machine orchestration behavior anywhere in the function: it only
  inspects `OLD`/`NEW` and raises or allows: `TG_OP='INSERT'` always passes; frozen-row
  UPDATE checks are a pure column-diff against an explicit allowlist; frozen-row DELETE is a
  reject unless the session has explicitly opted into the retention-exempt GUC.
- Error contract: every rejection raises with `ERRCODE = '23000'`
  (`integrity_constraint_violation`) and a message containing only `TG_OP` and
  `TG_TABLE_NAME` — no row content, no JSONB, no PII, deterministic text.
- `SECURITY INVOKER`, `SET search_path = pg_catalog, public` on the function; no dynamic SQL
  (`EXECUTE`) anywhere — all column comparisons go through `jsonb_each`/`to_jsonb`, which are
  built-in and side-effect-free.
- Trigger inventory: this report's §C is the authoritative table→trigger→mode→allowed-column
  register for S24; `tools/db-manifest-check.mjs`'s existing convention-column rule already
  cross-checks `updated_at` presence against the manifest's mutability-class column, which
  transitively guards against a trigger target losing its declared class.

## E. Validation

- Static: `pnpm --filter @embroidery/database exec tsc --noEmit` — clean.
  `node tools/db-manifest-check.mjs` — `all checks passed` (0 problems, refunds finding
  fixed). `node tools/db-metric-check.mjs` — exit 0. `node tools/db-deferred-owner-check.mjs`
  — exit 0. `node tools/check-file-size.mjs` — passes (one pre-existing, unrelated
  review-threshold notice on `tools/db-metric-check.mjs`, untouched this slice).
  `npx drizzle-kit check` — `Everything's fine`.
- Fresh disposable install (`embroidery_s24_fresh`, empty → all 30 migrations): 78 tables,
  833 columns, 160 FKs, 78 PK, 50 UQ, 189 CHECK, 184 indexes unchanged; **30 triggers, 1
  function** confirmed present via `pg_trigger`/`pg_proc`; `pg_get_triggerdef` dump confirms
  every trigger's `TG_ARGV` matches §C exactly (mode, guard column/value, delete policy,
  allowed-column list) for all 30 rows.
- Disposable G19-prefix upgrade (`embroidery_s24_upgrade`, 0000–0029 → seed one real
  `audit_events` row → apply 0030 only): pre-existing row survived (`count = 1` after
  migration); physical metrics unchanged (78/833/160/78/50/189/184); the newly-added trigger
  immediately protected the pre-existing row (`UPDATE ... WHERE action='SEED_ACTION'`
  rejected with `23000`) — proves the trigger applies retroactively to rows written before
  its own migration, not just to rows inserted after.
- Persistent dev DB: confirmed at migration id 29 before and after this slice — untouched.
- Behavioral trigger matrix — 20 cases, 0 FAIL:

| # | Case | Expected | Result |
|---|---|---|---|
| 1 | `always`: allowed-column update | ok | PASS |
| 2 | `always`: protected-column update | 23000 reject | PASS |
| 3 | `always`: DELETE | 23000 reject | PASS |
| 4 | `always`: no-op UPDATE (all values unchanged) | ok | PASS |
| 5 | `frozen_when`: pre-freeze UPDATE | ok | PASS |
| 6 | `frozen_when`: post-freeze UPDATE | 23000 reject | PASS |
| 7 | `frozen_when`: post-freeze DELETE | 23000 reject | PASS |
| 8 | `frozen_when`: pre-freeze DELETE | ok | PASS |
| 9 | `frozen_when_not`: DRAFT-state UPDATE | ok | PASS |
| 10 | `frozen_when_not`: allowed status-advance UPDATE | ok | PASS |
| 11 | `frozen_when_not`: protected-column UPDATE post-freeze | 23000 reject | PASS |
| 12 | `frozen_when_not_null`: guard still NULL, UPDATE | ok | PASS |
| 13 | `frozen_when_not_null`: guard set, UPDATE | 23000 reject | PASS |
| 14 | `frozen_when_not_null`: guard set, DELETE | 23000 reject | PASS |
| 15 | `audit_events`: UPDATE | 23000 reject | PASS |
| 16 | `audit_events`: DELETE, no bypass | 23000 reject | PASS |
| 17 | `audit_events`: DELETE with `app.bypass_retention_trigger='on'` | ok | PASS |
| 18 | `outbox_events`: mutable-column UPDATE (`status`, `attempt_count`) | ok | PASS |
| 19 | `outbox_events`: `payload` UPDATE | 23000 reject | PASS |
| 20 | `outbox_events`: DELETE, no bypass | 23000 reject | PASS |

Cases 1–14 ran against synthetic temp tables sharing the exact same function and argument
shapes as the real triggers (proving the four freeze modes and the allowlist/DELETE-policy
logic in isolation); cases 15–20 ran against the real `audit_events`/`outbox_events` tables
(both FK-free, so seedable without a dependency chain) to prove the mechanism end to end on
production schema objects. `pg_get_triggerdef` inspection (§D/E fresh-install step) covers
configuration correctness for the remaining 24 tables whose FK chains were not seeded.

No overclaim: this validation does not assert production performance, lock/concurrency
behavior under contention, or exactly-once semantics — those remain DB8/DB9 scope.

## F. Metrics after S24

```
tables            78 / 78   (unchanged)
columns           833       (unchanged)
FK                160        (unchanged; DEV-DB6-017 ceiling re-confirmed)
PK / UQ / CHECK   78 / 50 / 189  (unchanged)
indexes           184 / 211 (unchanged; S25 backlog untouched)
partial indexes   35 / 45   (unchanged)
JSONB             9 / 9     (unchanged)

S24 planned targets     30 tables (IMM: 6, APPEND_ONLY: 16, COLUMN_SCOPED: 2, conditional IMM: 6)
S24 implemented targets 30 tables — 0 missing, 0 extra
trigger functions        1 (fn_reject_mutation_conditional)
triggers                30
actor-consistency triggers  0 (already covered by CST-072 CHECK, G19)
```

## G. Task board

```
DB6-G01..G19 = COMPLETE
DB6-S24      = COMPLETE
DB6-S25..S28 = OPEN
OVERALL DB6  = IN PROGRESS
```
S25 (global index backlog: IDX-097/098, outbox partial indexes, etc.) is not started.

## H. Commits

Two commits, both on `production`, neither pushed nor amended:

1. `8774d29` — `chore(database): verify DB6 final relationship and isolation baseline` —
   adds `DB6_PHYSICAL_ISOLATION_AUDIT.md`, the `db-manifest-check.mjs` mixed-mutability-class
   fix, and the G19 report addendum; no schema/migration changes.
2. `3ffade2` — `feat(database): implement DB6 integrity triggers` — adds migration 0030, its
   journal entry and snapshot, and this report.

Both on `production`, tree clean, not pushed, not amended.

## I. Verdict

```
DB6-S24      PASS
OVERALL DB6  IN PROGRESS
```

Per standing instruction: stop after S24. Do not start S25 without a new explicit prompt.
