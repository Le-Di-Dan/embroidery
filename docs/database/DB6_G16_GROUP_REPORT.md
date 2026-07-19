# DB6-G16 Group Report — Payment (CTX-PAY)

## A. Preflight

- Branch `production`, HEAD before this group: `4dee744` (G15), tree clean.
- Migrations `0000`–`0023` byte-identical; journal 24 entries (idx 0–23,
  idx 17 permanently absent) confirmed unchanged.
- `drizzle-kit check` clean before starting.
- Jest: 92/92 passing before starting (87 G15 baseline + 5 new column-metric
  rows land with this group's edit, not before).
- Canonical pre-G16 metrics confirmed: 65 tables, 684 physical columns, 133
  physical FKs, 164 logical relationship edges / 162 physical FK targets,
  127 launch indexes implemented.
- DEV-DB6-009..015 confirmed in the register; DEV-DB6-014 status
  `closed — implemented in G15`; G15's three deferred-ledger resolutions
  confirmed `implemented (G15)`.
- Canonical G16 scope derived from `DB6_SCHEMA_IMPLEMENTATION_MANIFEST.md`
  §3 ("G16 — Payment (CTX-PAY)") and confirmed against `DB4_TABLE_CATALOG.md`
  (TBL-054..058) and `DB6_RELATIONSHIP_COVERAGE_AUDIT.md` §3 — Payment is
  the correct canonical direction, no BLOCKED condition.
- Persistent dev database was **not** used for any upgrade test; two
  disposable databases (`embroidery_g16_fresh`, `embroidery_g15_upgrade`)
  were created for validation and dropped afterward. The persistent dev
  database remained at its prior state (65 tables, 23 migrations) throughout
  this group's work.

## B. G16 scope

- **5 tables**: TBL-054 `payment_obligations` (uuid7, mutable), TBL-055
  `payment_attempts` (uuid7, mutable), TBL-056 `payment_provider_events`
  (bigint, append), TBL-057 `payment_reconciliations` (bigint, append),
  TBL-058 `refunds` (uuid7, state mutable + amounts immutable).
- Aggregate owner: AGG-16 (Payment), CTX-PAY.
- Column metrics: logical IDs 48, expansions 6, business columns 54,
  convention columns 13, physical columns 67 (12+16+12+10+17). Verified
  against `drizzle-kit generate`'s own per-table report (exact match on
  first attempt) and `column-metrics.spec.ts` (92/92 passing).
- Relationship classes: REL-081 (→orders), REL-082 (→quotation_versions),
  REL-083 ×2 (→payment_obligations self / →payment_attempts, one deferred
  by cycle), REL-084 (→payment_obligations), REL-085 ×2 (→grants/
  challenges), REL-086 (→payment_attempts), REL-087 ×2 (→attempts/
  obligations), REL-088 ×3 (→attempts/orders/cancellation_requests) — 13
  physical FKs total.
- Constraints: CST-039 (pUQ, IDX-042), CST-040 (UQ, IDX-043), CST-063
  (amount CHECKs), CST-068 (currency 'VND'), CST-073 (EXECUTED evidence).
  CST-100 (refund immutability) and CST-117 (refund ≤ refundable) are
  documented, not database-enforced (same honestly-documented gap as
  CST-090/092/096).
- Indexes: IDX-042/043 constraint-created; IDX-075/076/077/079/080/081
  (`R`, required) implemented with the group; IDX-078/122/123/124 (`r`,
  recommended) deferred to S25 per the standing per-group policy.
- State/type: LC-15 (`payment_obligations.status`), LC-16
  (`payment_attempts.status`), LC-20 (`refunds.status`), plus closed sets
  for `kind`, `method`, `event_kind`, `application_outcome`, `action`.
- Money: `numeric(14,2)` + `currency_code = 'VND'` throughout, matching the
  raw-column convention established by G14/G15 (not the newer
  `primitives/money.ts` helpers, which only `catalog/skus.ts` and
  `catalog/products.ts` currently use).
- JSONB: one boundary, `payment_provider_events.redacted_payload`
  (ADR-DB4-004 #6) — the 9th and last entry in the closed set.
- Security: no PAN/CVV/API secret/provider signing secret anywhere;
  `redacted_payload` carries only bounded, redacted evidence.
- DEV-DB6-015: `payment_reconciliations.admin_id`,
  `refunds.approved_by_admin_id`/`executed_by_admin_id` — bare no-FK
  evidence columns, implemented exactly as the deviation register
  prescribed.

## C. Implementation

- `payment_obligations` — DEPOSIT/REMAINING root, CST-039 partial-unique
  live-obligation arbiter, `satisfied_at`/`satisfied_by_attempt_id`
  required together on `SATISFIED` entry (same-row conditional, mirrors
  `orders.hold_reason_required`).
- `payment_attempts` — provider-abstract attempt entity (LC-16), CON-106
  allocation FK, `review_reason` required on `REQUIRES_REVIEW` entry.
- `payment_provider_events` — append-only redacted callback evidence,
  CST-040 idempotency arbiter, nullable `payment_attempt_id` for unmatched
  events.
- `payment_reconciliations` — append-only manual resolution record,
  "at least one target set" CHECK sourced directly from DB4's column
  dictionary (COL-TBL057-02), not invented.
- `refunds` — reviewed refund record, CST-073 execution-evidence CHECK,
  no trigger auto-reverses Order/Reservation state.
- Migration: `0024_create_payment_tables.sql` (generated, 5 `CREATE TABLE`,
  12 inline FKs, 8 indexes) + `0025_add_payment_obligation_satisfied_by_fk.sql`
  (hand-authored, 1 FK) — the one header↔child cycle this group needed,
  same mechanism as `0016`/`0019`/`0022`.
- No deviations beyond the pre-registered DEV-DB6-015 application; no new
  Class-C/D findings surfaced during implementation.

## D. Relationship/lifecycle integrity

- All 13 owner-G16 edges are physical FKs; existence is DB-enforced for
  all of them.
- `payment_obligations.satisfied_by_attempt_id` — existence physical
  (added by custom SQL); **which** attempt wins the satisfaction race
  (CC-10, exactly-once application) is TX/App, not a database guarantee —
  same tier as every other current-pointer finding in this engagement
  (`orders.current_approval_snapshot_id`, `quotations.current_version_id`).
- `payment_obligations.superseded_by_obligation_id` — self-referencing
  recalculation chain (ADR-DB3-003 r7); same-chain consistency of a
  repoint is TX/App.
- Intentional no-FK: `payment_reconciliations.admin_id`,
  `refunds.approved_by_admin_id`/`executed_by_admin_id` (DEV-DB6-015).
- Payment authority vs Order/Quotation/Reservation: `payment_obligations`
  derives its amount from `quotation_versions` (REL-082, snapshot
  evidence) and belongs to exactly one `orders` row (REL-081); no trigger
  rewrites either snapshot, and no trigger creates an Order, an official
  Reservation, or starts Production from any Payment-domain row.
- Provider idempotency arbiter: CST-040 (`provider_key`,
  `provider_event_ref`) — the single database-enforced idempotency claim
  for provider callbacks; duplicate-callback rejection verified live.
- Denominator: unchanged headline denominators (164 logical / 162 physical
  FK targets); 13 previously-planned G16 edges moved from planned to
  implemented within that existing count.

## E. Metrics after G16

```text
groups complete:              16 / 19
tables implemented:           70 / 78
logical COL IDs:              488
logical expansions:           79
business columns:             567
convention columns:           184
physical columns:             751
logical edges:                164 (unchanged)
physical FKs implemented:     146 / 162
physical constraints:         +16 CHECK, +2 UQ/pUQ, +13 FK (this group)
launch indexes implemented:   133 / 211
partial indexes:              47 (+2: IDX-042, uq_payment_obligations__order_kind__live is the
                               only new partial index this group — IDX-076/080/081 are also
                               partial, bringing the group total to 4 new partial predicates)
JSONB boundaries:              9 / 9 (closed set complete as of this group)
state/type columns:           +8 closed sets (kind, 2×status via LC-15/16/20,
                               method, event_kind, application_outcome, action)
documents updated:             5 (manifest, index manifest, deviation
                               register, relationship audit, this report)
```

Live-verified on both the disposable fresh-install database and the
disposable G15-prefix upgrade database: **70 tables, 751 physical columns,
146 foreign keys, 25 applied migrations**, `drizzle-kit check` reporting
"Everything's fine 🐶🔥" on both, with zero generated diff on reapply.

## F. A-status

- **A03** (partial indexes): 4 new partial predicates this group
  (`uq_payment_obligations__order_kind__live`, the FAILED/REQUIRES_REVIEW
  attempt queue, the matched/unmatched provider-event pair) — zero
  volatile (`now()`) predicates.
- **A08** (money): all five tables use `numeric(14,2)` + `currency_code`
  fixed to `'VND'`; no float/double anywhere. Remaining owner groups with
  money fields: G17 (none), none outstanding beyond what's already
  implemented across G1–G16.
- **A09** (state/type parity): 8 new closed sets, each a single `const`
  tuple driving both the TS union and the CHECK. Running total of
  lifecycle/type sets: unchanged formula, all newly-added sets parity-
  verified against DB3/DB4.
- **A10** (mutability class): `payment_obligations`/`payment_attempts`
  mutable; `payment_provider_events`/`payment_reconciliations` append-only
  (no `updated_at`); `refunds` mixed (state mutable, amounts documented
  immutable, S24-owned trigger not yet built — same gap as CST-090/092/096).
  DB7 targets: attempt out-of-order rule (CC-07/08/09/10), refund
  reconciliation consistency (CST-117).
- **A11** (index budget): `payment_provider_events` carries PK + 4 indexes
  (IDX-043/079/080/081) — a recorded, DB5-justified exception to the ≤3
  append-table budget, same class as `inventory_ledger_entries`.
- **A12**: no performance pass run on this group's (empty/smoke-only) data
  — deferred to DB9 per standing policy.
- **A15**: no speculative provider-payload/PII/JSONB index added; the four
  `r`-tier indexes (IDX-078/122/123/124) are deferred to S25, not silently
  dropped — recorded in `DB6_INDEX_IMPLEMENTATION_MANIFEST.md`'s pending
  table.
- **DEV-DB6-015**: closed for this group's two forward columns, exactly as
  prescribed — no FK added, no broadening of the deviation.

## G. Validation

- **Static**: `tsc --noEmit` clean; `eslint .` clean; `prettier --write`
  applied to the 5 new schema files (line-wrap only, no semantic change);
  Jest 92/92 passing (was 87 before this group; the 5 new column-metric
  rows and the live-schema bijection check account for the difference);
  all 5 new files well under the 400-line source limit (87–121 lines each).
- **Fresh disposable install** (`embroidery_g16_fresh`, empty → migrations
  `0000`–`0025`): 70 tables, 751 columns, 146 FKs, 25 journal rows,
  `drizzle-kit check` clean. Dropped after verification.
- **Disposable G15-prefix upgrade** (`embroidery_g15_upgrade`): trimmed
  migration set `0000`–`0023` applied via a temporary `out:` config,
  seeded a representative G1–G15 chain (Customer → Category → Product →
  Product Variant → Custom Request → Design Case → Design Version →
  Secure Access Grant → Contact Verification Challenge → Approval Snapshot
  → Quotation → Quotation Version (ACCEPTED, current-version pointer set)
  → Order (AWAITING_DEPOSIT)), confirmed at 65 tables / 23 migrations
  before the group migrations ran, then applied `0024`/`0025` via the real
  config. Old data survived intact; new tables/FKs added cleanly; final
  state (70 tables, 751 columns, 146 FKs, 25 migrations, drift clean)
  matched the fresh-install figures exactly. Dropped after verification.
- **Reapply/drift**: `drizzle-kit generate` after the schema was already
  fully migrated reported "No schema changes, nothing to migrate"; a
  second `drizzle-kit check` reported clean on both disposable databases.
- **Physical parity**: exact 5-table, 67-column, 13-FK, 8-CHECK-plus-2-
  UQ/pUQ, 8-index (2 constraint-created + 6 required-tier) match between
  the schema, the generated migration, and the live disposable databases.
- **Behavioral smoke** (26 cases against the disposable upgrade database):
  18 expected successes (valid deposit/remaining obligations, valid
  attempt, `REQUIRES_REVIEW` with evidence, `SATISFIED` with evidence,
  matched/unmatched provider events, reconciliation with a target,
  `EXECUTED` refund with transfer reference, fractional-VND acceptance —
  documented gap, matching the sibling `orders`/`quotation_versions`
  tables), 8 expected rejections (duplicate live obligation — CST-039,
  invalid kind, negative amount, unsupported currency, missing satisfied
  evidence, dangling order/obligation/attempt FK ×3, invalid method,
  missing review reason, duplicate provider event — CST-040, invalid
  event kind, reconciliation with no target, missing transfer reference on
  `EXECUTED` — CST-073, negative refund amount). All 26 outcomes matched
  expectation exactly; zero unexpected results.
- **Security/privacy**: no PAN/CVV/API secret/provider signing secret/OTP
  in any column or the smoke-test payloads; `redacted_payload` in the
  smoke test carried only `{}` (no real provider payload was fabricated).
- **Persistent dev DB untouched**: confirmed at 65 tables / 23 migrations
  both before and after this group's disposable-database work.

## H. Commits

```text
<pending — see chat delivery for hash>  feat(database): implement DB6 schema group G16
```

Tree clean immediately after commit. Not pushed.

## I. Verdict

```text
DB6-G16      PASS
OVERALL DB6  IN PROGRESS
```
