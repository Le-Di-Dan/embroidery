# DB6-G13 — Approval Group Report

**Date:** 2026-07-19 · **Checkpoint:** DB6-G13 · **Baseline:** HEAD `6aac630`
(DB6-G12) · migrations `0000`–`0019` unchanged.

## A. Preflight

- Branch `production`, tree clean at start, `6aac630` confirmed HEAD.
- Migrations `0000`–`0019` unchanged; journal 19 entries (see G12 report's
  numbering note — `0017` was never used after a mid-G12 regeneration; this
  is pre-existing state, not introduced here); manifest, metric, and
  deferred-owner checkers all PASS pre-change.
- Canonical pre-G13 metrics confirmed: 50 tables / 479 columns / 83
  physical FKs / 164 logical edges / 162 physical FK target / 110 launch
  indexes.
- `DEV-DB6-009..015` all present in the register; `DEV-DB6-013` confirmed
  `open — planned owner G13`, target table `approval_snapshots` not yet
  implemented, its four placement FK targets absent — exact pre-state
  matching the prompt's expectation.
- **Scope match:** canonical G13 = **Approval (CTX-DSN)**, TBL-031/032/033
  (`approval_snapshots`, `approval_snapshot_thread_colors`,
  `approval_snapshot_agreement_acceptances`) — confirmed by
  `DB4_TABLE_CATALOG.md`, the manifest §3, and the DB6-C4 coverage audit
  §3 (which already tallied this group as 9 Class-A + 4 Class-C
  (DEV-DB6-013) + 0 Class-D). All three canonical sources agree — no
  BLOCKED condition. Matches the prompt's own expectation.

## B. G13 scope (canonical)

| TBL | Table | PK | Mut |
|---|---|---|---|
| TBL-031 | `approval_snapshots` | uuid7 | immutable |
| TBL-032 | `approval_snapshot_thread_colors` | bigint | immutable |
| TBL-033 | `approval_snapshot_agreement_acceptances` | bigint | immutable |

- **Column metrics:** 20 logical IDs + 12 expansions (COL-TBL031-02 ×3,
  -05 ×4, -06 ×4, -07 ×2, -09 ×3, -10 ×2 — six expansion markers totaling
  +12 physical columns beyond their logical IDs) = 32 business columns;
  +6 convention columns (2 per table: `id`+`created_at`, no `updated_at`
  on any of the three — all immutable/append) = **38 physical columns**.
- **Relationship classes (all Class A after this group; DEV-DB6-013's 4
  edges close the group's only Class-C finding):** REL-051
  (`approval_snapshots` → `design_versions`), REL-052 ×3 (→
  `design_cases`/`custom_requests`/`customers`), REL-053 ×2 (→
  `secure_access_grants`/`contact_verification_challenges`), REL-054
  (`approval_snapshot_thread_colors` → `approval_snapshots`), REL-055 ×2
  (`approval_snapshot_agreement_acceptances` → `approval_snapshots`/
  `agreement_versions`), **DEV-DB6-013** ×4 (`approval_snapshots.product_id`
  /`product_variant_id`/`product_side_id`/`embroidery_area_id` →
  `products`/`product_variants`/`product_sides`/`embroidery_areas`).
  **13 native physical FKs added; 0 owner-G13 deferred edges left
  outstanding; 0 future-owner edges touched.**
- **Constraints:** CST-001 ×3 (PK), CST-023 (`approval_snapshots`, one
  approval per design version), CST-024 (`approval_snapshot_agreement_
  acceptances`, one acceptance per agreement version), CST-051 instance
  (`approval_snapshot_thread_colors`, one color per position), CST-066
  instance (dims > 0), CST-070 ×3 (document/preview/content hash format),
  CST-091 (full reject-mutation, S24 trigger candidate, not yet a database
  mechanism).
- **Indexes:** IDX-025/026/063 (constraint-created, 3). IDX-136
  (recommended, on `custom_request_id`) deferred to S25, same pattern as
  IDX-116/IDX-067 — **not built** this group.
- **State/type:** none — LC-10 "exists-or-not": no status column on any
  of the three tables.
- **JSONB/hash:** no JSONB; three hash-format CHECKs (document_hash,
  preview_hash on `approval_snapshots`; content_hash on
  `approval_snapshot_agreement_acceptances`), all CST-070 instances,
  identical `sha256:<64 hex>` pattern already used by
  `design_versions`/`agreement_versions`.
- **Version references:** `design_version_id` → exact `design_versions.id`
  (never `design_cases.current_version_id`); `agreement_version_id` →
  exact `agreement_versions.id` (never `agreements.current_version_id`).
- **Placement references:** the DEV-DB6-013 quartet, discussed in §D.
- **Dependencies:** G3 (`customers`), G5 (`products`/`product_variants`/
  `product_sides`/`embroidery_areas`), G8 (`contact_verification_
  challenges`), G9 (`custom_requests`, `design_cases`), G10
  (`secure_access_grants`), G11 (`design_versions`), G12
  (`agreement_versions`) — all implemented. No dependency on G14+.

## C. Implementation

- **`approval_snapshots`** freezes: exact version ref, document/preview
  hashes, snapshot anchors (case/request/customer), the four placement
  refs plus their frozen display-copy siblings (Class F, no FK —
  `product_name`/`variant_label`/`side_name`/`area_name`), physical
  dimensions and quantity (both `> 0` CHECKs), a frozen contact snapshot
  ([PII], Class F, no FK), and secure-flow evidence (`grant_id`/
  `step_up_challenge_id`, both NOT NULL per the column dictionary).
- **`approval_snapshot_thread_colors`** and
  **`approval_snapshot_agreement_acceptances`** are plain immutable
  children, `bigint` identity PK, one unique arbiter each (position;
  agreement version), mirroring the existing `design_reviews`/
  `custom_request_transitions` append-child pattern exactly.
- **DEV-DB6-013** closed: all four placement FKs added as plain native
  `foreignKey()` constraints, `restrict`, no deferred-owner ledger row
  needed (all four target tables — `products`/`product_variants`/
  `product_sides`/`embroidery_areas` — already exist since G5).
- **No custom SQL.** Every FK in this group targets an already-existing
  table; there is no header↔child cycle here (unlike G11/G12's current-
  pointer FKs) — the whole group is expressed in one drizzle-generated
  migration. No repository/service/controller code. No Quotation/Order/
  Payment/Reservation field, no 3D field, no plaintext token/OTP.

## D. Relationship integrity

- **Existence enforcement (physical):** all 13 FKs verified live — a
  dangling `product_variant_id` is rejected by
  `fk_approval_snapshots__product_variant_id` (see behavioral smoke).
- **Placement hierarchy integrity — live-verified gap.** The four
  existence FKs prove each referenced row *exists*; they do **not** prove
  the rows are mutually consistent. Reproduced on a disposable database
  (`embroidery_g13_fresh`, dropped after use), holding `design_version_id`
  fixed to an otherwise-valid version and varying one placement column at
  a time:
  1. `product_variant_id` set to a variant belonging to **Product B**
     while `product_id` = Product A → **INSERT succeeded.**
  2. `product_side_id` set to a side belonging to **Product B** while
     `product_id` = Product A → **INSERT succeeded.**
  3. `embroidery_area_id` set to an area belonging to a **different
     side** while `product_side_id` points elsewhere → **INSERT
     succeeded.**
  - **Verdict: existence = physical FK (all four); cross-column
    hierarchy consistency = TX/App**, per `CON-058..060` — the same
    tier the DB6-C4 audit already applied to `design_versions`' identical
    placement quartet (DEV-DB6-012, G11), which has never had a composite
    FK either. No composite FK or trigger invented here. The approval
    transaction is expected to validate placement consistency against the
    referenced Design Version's own placement, not against a fresh
    independent selection.
- **Exact-version authority — live-verified.** `approval_snapshots.
  design_version_id` and `approval_snapshot_agreement_acceptances.
  agreement_version_id` reference the exact immutable version row; a
  later move of `design_cases.current_version_id` or `agreements.
  current_version_id` (both mutable pointers, per the G11/G12
  current-pointer findings) has no path to reach or mutate this
  evidence — there is no FK, trigger, or column anywhere in this group
  that reads either current-pointer column.
- Denominator unchanged in absolute terms (DEV-DB6-013 was already
  counted by DB6-C4 before G13 started): **164 logical / 162 physical FK
  target**, now **96 / 162** physical FKs implemented (83 carried in + 13
  native this group, of which 4 are DEV-DB6-013's closing edges).

## E. Metrics after G13

```text
groups complete:                    13 / 19
tables implemented:                 53 / 78
logical COL IDs:                    332
logical expansions:                 43
business columns:                   375
convention columns:                 142
physical columns:                   517
logical edges / canonical denominator: 164 / 164
physical FKs implemented / target:  96 / 162
launch indexes implemented:         113 / 211  (110 + 3)
JSONB boundaries:                   unchanged (0 new)
DEV-DB6-013 status:                 closed — implemented in G13
```

## F. A-status

- **A03:** 0 new partial-predicate indexes this group (IDX-025/026/063
  are plain unique, not partial); IDX-136 stays recommended/deferred to
  S25, not built. Volatile predicates = 0.
- **A08:** no money columns in this group; global A08 status unchanged.
- **A09:** 0 new state/type sets — LC-10 means none of these three tables
  carries a status column at all.
- **A10:** all three tables immutable (CST-091, full reject-mutation, no
  status-advance exception because there is no status to advance —
  strictly stronger than CST-090/096). S24 trigger target recorded; DB7-03
  mutation-rejection test target stays open. Behavioral smoke honestly
  shows an `UPDATE` on `approval_snapshots` currently succeeds.
- **A11:** 3 launch-required indexes only (all constraint-created); no
  speculative dashboard index added.
- **A12:** unchanged, still deferred to DB9.
- **A15:** IDX-136 (custom_request_id lookup) preserved as recommended/
  deferred, same treatment as IDX-116/IDX-067 — no speculative index
  added.
- **DEV-DB6-013:** closed. Placement existence enforcement: physical (4/4
  FKs live). Placement hierarchy enforcement: TX/App (live-verified gap,
  §D). Exact Design Version authority: physical FK to `design_versions.id`
  directly, never the mutable current pointer. Exact Agreement Version
  authority: physical FK to `agreement_versions.id` directly, same rule.

## G. Validation

- **Static:** typecheck clean; lint clean (14/14 turbo tasks); Prettier
  clean; file-size check passed (one pre-existing review-threshold
  notice, unrelated to this group); manifest checker, metric checker,
  deferred-owner checker all **PASS** (`53 tables, 517 physical columns,
  register/manifest/formulas agree`) on the first run after the schema
  changes — no arithmetic correction needed this time; 25/25 tool tests;
  75/75 jest tests (up from 72 — `column-metrics.spec.ts` now also covers
  the 3 new tables).
- **Fresh migration:** disposable database `embroidery_g13_fresh`, `0000`
  through `0020` applied cleanly; `drizzle-kit check` → `Everything's
  fine`; live counts: 53 tables, 517 columns, 96 FKs — exact match.
- **Upgrade from G12:** applied migration `0020` directly to the
  persistent dev database (already at G12/`0019` from the prior session),
  which doubles as the upgrade-compatibility proof: 50 pre-existing
  tables/479 columns/83 FKs survived untouched (no `ALTER` on any
  pre-existing column — every new FK in this group targets a table
  created in an earlier group, none of them via a column added to an
  existing table), 3 new tables/13 new FKs added; dev DB now reports 53
  tables/517 columns/96 FKs/20 journal rows; `drizzle-kit check` →
  `Everything's fine`.
- **Reapply/drift:** clean, no pending migration, no duplicate object.
- **Physical parity:** exact — 53 tables / 517 columns / 96 FKs on both
  the disposable and the persistent dev database.
- **Behavioral smoke:** valid insert succeeds; duplicate approval per
  design version rejected (CST-023); dangling placement FK rejected;
  cross-product variant/side and cross-side area all **succeed** (the
  documented TX/App gap, §D); non-positive quantity rejected; malformed
  document hash rejected; duplicate agreement-version acceptance rejected
  (CST-024); `UPDATE` on an existing snapshot succeeds (S24 deferred,
  reported honestly, not claimed as reject). All test data rolled back;
  disposable database dropped.
- **Security/privacy:** no raw token/OTP/hash copied from
  `secure_access_grants`/`contact_verification_challenges` — only their
  IDs are referenced; the frozen contact snapshot ([PII]) is a documented,
  DB4-mandated value copy, not an incidental leak; no PostgreSQL `DETAIL`
  forwarding in application code (none written this group).

## H. Commits

```text
feat(database): implement DB6 schema group G13
```

Tree clean before commit; not pushed; no amend/squash of any prior commit.

## I. Verdict

```text
DB6-G13      PASS
OVERALL DB6  IN PROGRESS
```
