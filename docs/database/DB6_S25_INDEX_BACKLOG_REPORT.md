# DB6-S25 Group Report — Remaining Launch Performance Index Backlog

## A. Preflight

- Branch `production`. HEAD before this slice: `c0aa466`. Commit chain verified present and
  unaltered: `8774d29` (S24-P0), `3ffade2` (S24 triggers), `c0aa466` (S24 hash record). Tree
  clean, no amend/rewrite, not pushed.
- Migrations `0000`–`0030` byte-identical; disposable `embroidery_s25_upgrade` applied the
  0000–0030 prefix cleanly and reproduced the exact post-S24 baseline before any S25 object
  was added (see §D).
- `drizzle-kit check` clean both before and after this slice.
- Live baseline confirmed before S25 (on the 0000–0030 prefix): 78 tables, 833 columns, 160
  FKs, 78 PK, 50 UQ, 189 CHECK, **184 physical indexes, 35 partial (13 unique + 22
  performance)**, 9 JSONB, **1 trigger function, 30 triggers** — matches the S24 report
  exactly.
- No S25 migration existed before this slice; no backlog index was implemented early;
  trigger inventory unchanged throughout; relationship ceiling unchanged at 160/160;
  persistent dev DB confirmed still at migration id 29 before and after this slice
  (untouched — only disposable databases were used).

## B. Backlog derivation

Read `DB6_INDEX_IMPLEMENTATION_MANIFEST.md` §3 (performance register) and §7.1 (pending
table), cross-checked against the G19 report's own IDX-097/098 deferral and every `S25`
JSDoc annotation in `packages/database/src/schema/**`. All three sources reconcile to
exactly **27** remaining index objects (211 launch target − 184 live = 27) — no forcing was
needed; the total reconciles exactly.

The manifest's own §7.1 pending table was found to be **incomplete**: it omitted IDX-136
(G13, `approval_snapshots`), IDX-118/125/126 (G15, `orders`/`shipping_fee_acknowledgements`/
`inventory_reservations`), despite those four being present in §3's register and carrying
explicit `S25` deferral comments in their schema files. This is a documentation gap, not a
missing index in the codebase — all four were already correctly counted in the 211 launch
total via §3; only the §7.1 summary table under-listed them. Backfilled in §7.1 (see §D
manifest update), sourced from the schema JSDoc, not invented.

Classification of all 27 (per §2 taxonomy): **B — S25 pending, implement** for all 27. Zero
entries are class A (already implemented under this ID), C (out of launch scope), D
(retired), E (constraint-backed already), F (equivalent-object reconciliation), or G
(contradiction/blocker).

IDX-056 (conditional exclusion index, `btree_gist`-dependent) is explicitly **out of
scope** — it is not part of the 211-index launch total and was never counted toward the 27.

## C. Implementation

`packages/database/migrations/0031_add_remaining_launch_indexes.sql` — 27 `CREATE INDEX`
statements, one per backlog entry, exact column order/direction/predicate copied verbatim
from the manifest (no reordering, no `INCLUDE`, no uniqueness change, no predicate
broadening):

| IDX | Table | Keys | Predicate | Tier |
|---|---|---|---|---|
| IDX-121 | admin_sessions | (expires_at, id) | status='ACTIVE' | required |
| IDX-120 | admin_sessions | (admin_account_id) | — | recommended |
| IDX-088 | outbox_events | (next_attempt_at NULLS FIRST, id) | status='PENDING' | required |
| IDX-090 | outbox_events | (dispatched_at, id) | status='DISPATCHED' | required |
| IDX-093 | idempotency_records | (expires_at, id) | — | required |
| IDX-094 | idempotency_records | (claimed_at, id) | status='IN_PROGRESS' | required |
| IDX-131 | background_job_attempts | (finished_at, id) | is_dead_letter | recommended |
| IDX-129 | customers | (merged_into_customer_id) | merged_into_customer_id IS NOT NULL | recommended |
| IDX-119 | assets | (uploaded_by_customer_id) | uploaded_by_customer_id IS NOT NULL | recommended |
| IDX-132 | asset_inspections | (asset_id, inspected_at) | — | recommended |
| IDX-130 | contact_verification_challenges | (contact_point_id) | contact_point_id IS NOT NULL | recommended |
| IDX-117 | custom_requests | (customer_id) | — | recommended |
| IDX-137 | request_moderation_notes | (custom_request_id, created_at) | — | recommended |
| IDX-127 | inventory_soft_holds | (custom_request_id) | — | recommended |
| IDX-135 | customer_merge_events | (merge_case_id, id) | — | recommended |
| IDX-116 | design_reviews | (design_version_id, decided_at) | — | recommended |
| IDX-136 | approval_snapshots | (custom_request_id) | — | recommended |
| IDX-118 | orders | (customer_id) | — | recommended |
| IDX-125 | shipping_fee_acknowledgements | (order_id) | — | recommended |
| IDX-126 | inventory_reservations | (order_id) | — | recommended |
| IDX-078 | payment_attempts | (provider_key, provider_ref) | provider_ref IS NOT NULL | recommended |
| IDX-122 | refunds | (order_id) | — | recommended |
| IDX-123 | refunds | (created_at, id) | status IN ('PENDING_REVIEW','APPROVED') | recommended |
| IDX-124 | payment_reconciliations | (payment_attempt_id) | — | recommended |
| IDX-138 | production_notes | (production_job_id, created_at) | — | recommended |
| IDX-097 | audit_events | (correlation_id) | — | recommended |
| IDX-098 | audit_events | (admin_id, occurred_at DESC, id DESC) | admin_id IS NOT NULL | recommended |

No table/column/FK/UQ/CHECK/trigger change. `0000`–`0030` untouched. No `CREATE INDEX
CONCURRENTLY` used (ordinary `CREATE INDEX`, consistent with every prior migration in this
project; each statement briefly holds a `SHARE` lock on its target table, blocking
concurrent writers for the duration of the index build — acceptable for a pre-launch
migration batch, no governance for concurrent-build migrations exists in this codebase to
extend).

`packages/database/migrations/meta/0031_snapshot.json` copied from `0030_snapshot.json`
with a new `id`/`prevId` link (indexes are outside Drizzle's schema-diff tracking the same
way triggers are — no table/column delta). `_journal.json` appended idx 31.

## D. Index reconciliation

Live-catalog counts on `embroidery_s25_fresh` (empty → all 31 migrations) and
`embroidery_s25_upgrade` (0000–0030 prefix → seed rows in `audit_events`/`outbox_events`/
`idempotency_records` → apply 0031 only) are **identical**:

```
tables 78, columns 833, FK 160, PK 78, UQ 50, CHECK 189
indexes total       211
indexes partial      46  (13 unique + 33 performance)
non-partial perf     37
JSONB 9, triggers 30, trigger functions 1
volatile predicates   0
duplicate index defs   0
```

**Correction to the pre-S25 estimate (documentation arithmetic only, no schema change —
same class of finding as DEV-DB6-017):** the prompt's pre-computed expectation was 45
partial (32 performance) / 38 non-partial performance. Re-deriving the predicate column
directly from `pg_index.indpred` on the 27 backlog entries found **11** carry a `WHERE`
predicate (IDX-119, 121, 129, 130, 078, 088, 090, 094, 123, 131, 098), not 10 — the original
estimate undercounted by exactly one. The **total physical index count (211) and total
performance-index count (70) are unaffected**; only the partial/non-partial split within
the performance tier is corrected to **33 partial / 37 non-partial**. `pg_get_indexdef`
dump for all 70 `ix_%`-named performance indexes confirms zero duplicate definitions and
exact match to every manifest row (see §C table) — full dump retained in this slice's tool
output, not reproduced here for length.

Every one of the 27 new indexes was independently confirmed via `pg_get_indexdef` to match
its manifest row exactly (key order, direction, predicate, non-unique). No duplicate/
redundant index was created; no PK/UQ backing was double-counted; no partial unique was
miscounted as a UNIQUE constraint.

## E. Validation

- Static: `pnpm --filter @embroidery/database exec tsc --noEmit` clean.
  `node tools/db-manifest-check.mjs` → `all checks passed`. `node tools/db-metric-check.mjs`
  and `node tools/db-deferred-owner-check.mjs` → exit 0. `node tools/check-file-size.mjs` →
  passes (one pre-existing, unrelated review-threshold note, untouched this slice).
  `npx drizzle-kit check` → `Everything's fine`.
- Fresh disposable install (`embroidery_s25_fresh`): confirms the full metric block in §D;
  every one of the 27 new indexes present with the exact expected definition; zero
  unexpected index; zero volatile predicate (`now()`/`current_*` scan against
  `pg_get_expr(indpred, indrelid)` on every partial index returned 0 rows).
- Disposable S24-prefix upgrade (`embroidery_s25_upgrade`): 0000–0030 prefix reproduced
  184/35/30-triggers exactly; seeded 2 `audit_events` rows, 2 `outbox_events` rows, 1
  `idempotency_records` row (two seed-script runs — the first partially committed before an
  unrelated NOT-NULL fix, both rows are legitimate pre-existing data for this test, not a
  defect); applied 0031 alone; **all seeded rows survived byte-identical**; no table rebuild
  (index-only migration); trigger behavior unaffected — `audit_events` UPDATE still rejected
  (`23000`), `outbox_events` mutable-column UPDATE still succeeds, `payload` UPDATE still
  rejected; final metrics match the fresh-install block in §D exactly.
- Query-shape structural check (no measured-performance claim, DB9 scope): `EXPLAIN` on
  `audit_events WHERE correlation_id = ...` and `audit_events WHERE admin_id IS NOT NULL
  ORDER BY occurred_at DESC, id DESC LIMIT 1` — both ran as sequential scans on the 2-row
  disposable table, which is expected and correct (planner will not choose an index over a
  2-row seq scan); this is a definition-correctness check, not a performance assertion.
- Trigger non-regression: 1 function, 30 triggers confirmed unchanged before and after
  0031; immutable-update-reject, append-only-reject, outbox-allowed-update,
  outbox-forbidden-update cases re-run post-migration, all still PASS (§ above).
- Security: no index created over `token_hash`, OTP/secret columns, raw contact/PII free
  text, JSONB summaries, or provider payload — every one of the 27 is a plain FK-shaped or
  status/timestamp-shaped btree column list, matching its DB5-approved definition exactly.

## F. Metrics after S25

```
tables:                         78 / 78
columns:                        833
relationships:                 164
physical FKs:                  160 / 160
PK:                              78
UQ:                              50
CHECK:                         189
physical indexes:              211 / 211
partial indexes:                46 / 46   (corrected from the pre-S25 45/45 estimate — see §D)
partial unique:                  13 / 13
partial performance:            33 / 33   (corrected from 32/32)
non-partial performance:        37 / 37   (corrected from 38/38)
JSONB:                            9 / 9
trigger functions:                1
triggers:                        30

backlog expected:      27
backlog implemented:   27  (0 missing, 0 extra, 0 duplicates, 0 volatile predicates)
satisfied-by-existing:  0
equivalent reconciliations: 0
```

## G. A-status

```
A03: 46/46 partial indexes live, volatile predicates = 0 (count corrected from 45/45, see §D)
A11: 211/211 launch indexes implemented
A12: measured performance deferred to DB9 (no EXPLAIN ANALYZE/BUFFERS claim made)
A15: no speculative/unapproved index (no GIN/BRIN/trigram/PII/JSONB-summary index added)
S24: 30/30 triggers, 1 function — unchanged, non-regressed
```

## H. Task board

```
DB6-G01..G19 = COMPLETE
DB6-S24      = COMPLETE
DB6-S25      = COMPLETE
DB6-S26..S28 = OPEN
OVERALL DB6  = IN PROGRESS
```

## I. Commits

One commit (no preflight correction blocked progress; the two documentation-arithmetic
findings in §B/§D were resolved inline, per the minor-reconciliation policy):

`feat(database): implement remaining DB6 launch indexes` — adds migration `0031`, its
journal entry and snapshot, this report, and the `DB6_INDEX_IMPLEMENTATION_MANIFEST.md`
§7/§7.1 update (211/211 current-state row, corrected 46/33/37 partial split, backfilled
IDX-136/118/125/126 into the pending-table history, all 27 backlog rows marked
implemented).

Branch `production`, tree clean before commit, not pushed, not amended.

## J. Verdict

```text
DB6-S25      PASS
OVERALL DB6  IN PROGRESS
```

Per standing instruction: stop after S25. Do not start S26 without a new explicit prompt.
