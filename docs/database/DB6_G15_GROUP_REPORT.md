# DB6-G15 — Order, Official Inventory Reservation & Shipping Group Report

**Date:** 2026-07-19 · **Checkpoint:** DB6-G15 · **Baseline:** HEAD `ae0a889` (G14)

## A. Preflight

- Branch `production`, HEAD `ae0a889`, tree clean before this group started.
- Migrations `0000`–`0022` byte-identical; journal 23 entries confirmed
  (idx values skip `17` by design, matching the pre-existing gap).
- `drizzle-kit check` clean; manifest/metric/deferred-owner checkers all
  PASS at the pre-G15 baseline (57 tables, 573 physical columns, 107
  physical FKs, 164 logical edges / 162 physical FK targets, 114 launch
  indexes).
- G15 scope confirmed as exactly 8 tables against `DB4_TABLE_CATALOG.md`
  (TBL-021, TBL-043..049) and the C4 audit's own row — no BLOCKED condition.
- DEV-DB6-009..015 present in the register; DEV-DB6-014 confirmed open,
  planned owner G15, both target tables (`secure_access_grants`/G10,
  `contact_verification_challenges`/G8) pre-existing.
- Deferred ledger confirmed: `inventory_ledger_entries.reservation_id`/
  `.order_id` and `inventory_soft_holds.converted_reservation_id` all
  present as nullable columns with no FK, resolution owner G15.
- Disposable-DB validation plan set up front (no persistent dev DB use).

## B. G15 scope

| TBL | Table | Aggregate | PK | Mut |
|---|---|---|---|---|
| TBL-043 | `orders` | AGG-15 | uuid7 | mutable |
| TBL-044 | `order_items` | AGG-15 | uuid7 | immutable |
| TBL-045 | `order_transitions` | AGG-15 | bigint | append |
| TBL-046 | `order_cancellation_requests` | AGG-15 | uuid7 | mutable |
| TBL-047 | `shipping_details` | AGG-15 | uuid7 | mutable-until-frozen |
| TBL-048 | `shipping_snapshots` | AGG-15 | uuid7 | immutable |
| TBL-049 | `shipping_fee_acknowledgements` | AGG-15 | bigint | append |
| TBL-021 | `inventory_reservations` | AGG-07 | uuid7 | mutable |

Column metrics:

| Table | Logical | Expansions | Business | Convention | Physical |
|---|---|---|---|---|---|
| orders | 11 | 2 | 13 | 3 | 16 |
| order_items | 9 | 3 | 12 | 2 | 14 |
| order_transitions | 8 | 5 | 13 | 2 | 15 |
| order_cancellation_requests | 8 | 2 | 10 | 3 | 13 |
| shipping_details | 11 | 4 | 15 | 3 | 18 |
| shipping_snapshots | 12 | 2 | 14 | 2 | 16 |
| shipping_fee_acknowledgements | 5 | 2 | 7 | 2 | 9 |
| inventory_reservations | 7 | 0 | 7 | 3 | 10 |
| **G15 total** | **71** | **20** | **91** | **20** | **111** |

Relationship classes (all Class A/DEV, no new Class C/D):

- REL-071 `orders`→`custom_requests` (1–1, restrict)
- REL-072 `orders`→`customers` (restrict)
- REL-073 `orders`→`quotation_versions` (accepted, restrict)
- REL-074 `orders`→`approval_snapshots` (audited current pointer, restrict)
- REL-075 `order_items`→`orders` (restrict)
- REL-076 `order_items`→`skus`/`customer_owned_products` (×2, mutually
  exclusive, restrict)
- REL-077 `order_items`→`approval_snapshots` (NOT NULL, restrict)
- REL-078 `order_transitions`/`order_cancellation_requests`/
  `shipping_details`/`shipping_snapshots`/`shipping_fee_acknowledgements`→
  `orders` (×5, restrict)
- REL-079 `shipping_snapshots`→`shipping_details` (1–1, restrict)
- REL-080 `order_cancellation_requests`→`secure_access_grants`/
  `contact_verification_challenges` (×2, nullable, restrict)
- REL-031 `inventory_reservations`→`sku_stocks`/`orders` (×2, restrict)
- REL-105 `order_transitions` actor edges → `admin_accounts`/`customers`/
  `secure_access_grants` (×3, restrict)
- REL-028 (ledger, resolved) `inventory_ledger_entries`→
  `inventory_reservations`/`orders` (×2, restrict)
- REL-030 (ledger, resolved) `inventory_soft_holds`→`inventory_reservations`
  (restrict)
- **DEV-DB6-014 (closed)** `shipping_fee_acknowledgements`→
  `secure_access_grants`/`contact_verification_challenges` (×2, NOT NULL,
  restrict)

21 Class-A native FKs + DEV-DB6-014's 2 + the 3 resolved deferred edges =
**26 new physical FKs**, all shipped in one generated migration (no
circular-import cycle exists for any of the three deferred resolutions, so
no custom SQL was required this group).

Indexes: IDX-018/031/032/033/034/035/036 (constraint-created, 7 total);
IDX-074/101/103/104/110/114 (P0 required performance, 6 total, all
implemented); IDX-118/125/126 (recommended, deferred to S25 per the
established lowercase-`r` convention already applied in G9/G11/G13).

State/type sets: `ORDER_STATES` (LC-14, 11 values), `ORDER_TRANSITION_EVENT_KINDS`
(6 values), `CANCELLATION_STAGES`/`CANCELLATION_INITIATORS`/
`CANCELLATION_REQUEST_STATES`, `SHIPPING_DETAIL_STATES` (LC-19),
`INVENTORY_RESERVATION_STATES` (LC-17) — all exact DB3/DB4 values, `text` +
CHECK, no PostgreSQL enum.

Money: `numeric(14,2)`, closed `currency_code = 'VND'` CHECK, no float. No
arithmetic CHECK was added on `orders.total_amount`/`order_items` line
totals — DB4 cites no cross-column arithmetic constraint for this group
(unlike `quotation_versions`' CST-064), and none is invented.

JSONB: none in this group's tables (Order/Reservation/Shipping domain
carries no JSONB per `DB4_JSONB_PAYLOAD_MAP.md`).

Deferred edges resolved: REL-028 ×2, REL-030, DEV-DB6-014 ×2 — all five
now implemented. No new deferred edges created. No G16+ edge resolved
early.

## C. Implementation

- `orders` (mutable root): 11-state LC-14 machine, frozen commercial basis
  (`accepted_quotation_version_id`) and audited approval pointer
  (`current_approval_snapshot_id`, NOT NULL). `[R]` CHECKs on
  `hold_reason`/`cancelled_reason` for their respective states.
- `order_items` (immutable snapshot): CST-067 exactly-one-subject CHECK
  (`sku_id` XOR `customer_owned_product_id`), NOT NULL
  `approval_snapshot_id` (D7-07 production integrity chain).
- `order_transitions` (append, bigint): CON-081 absorbs delivery/saga
  events into `event_kind`; five-column actor evidence mirrors
  `custom_request_transitions`.
- `order_cancellation_requests` (mutable proc): stage/initiator/status
  closed sets; `decided_by_admin_id` correctly left as a bare no-FK
  reference per DEV-DB6-015; the ADR-DB3-004 stage/initiator combination
  rule was left TX/App (no CST ID cites it as a database-level guard — no
  invented cross-fact CHECK).
- `shipping_details`/`shipping_snapshots`: EDITABLE→FROZEN freeze pair,
  `[R]` frozen_at CHECK, one dispatch-freeze row per order (CST-034).
- `shipping_fee_acknowledgements`: DEV-DB6-014's two NOT NULL secure-flow
  FKs, no auto-accept, no Order mutation trigger.
- `inventory_reservations`: CST-016 partial-unique active-per-(order,stock)
  arbiter, no `available`/`reserved` counter, `sku_stocks` remains the
  sole lock anchor.
- Migration `0023_create_order_reservation_shipping_tables.sql` (generated)
  creates all eight tables, their 23 inline FKs, 6 P0 indexes, and — in the
  same file — the 3 resolved deferred FKs via direct edits to
  `inventory-ledger-entries.ts` and `inventory-soft-holds.ts` (no cycle,
  no custom SQL needed).
- No custom SQL, no trigger, no auto-conversion, no repository/service code.

## D. Relationship and pointer integrity

**Existence vs same-root ownership**, reported separately:

| Pointer | Existence | Same-root ownership |
|---|---|---|
| `orders.current_approval_snapshot_id` → `approval_snapshots` (REL-074) | **Physical FK** — no header↔child cycle (target predates this group) | **TX/App** — same-case chain consistency not re-verified at DB level; every repoint is recorded as an `order_transitions` `POINTER_MOVE` row (history), not a silent overwrite |

No new header↔child cycle existed in this group (unlike G12/G13/G14) —
`approval_snapshots`/`quotation_versions` both predate G15, so
`orders`' two forward references are plain inline FKs.

**Deferred/DEV resolutions — existence live-verified:**
- `inventory_ledger_entries.reservation_id`/`.order_id` → dangling values
  rejected; a pre-existing row with both columns `NULL` survived the
  upgrade unchanged.
- `inventory_soft_holds.converted_reservation_id` → dangling rejected;
  valid link (HELD→CONVERTED with a real reservation id) succeeded.
- `shipping_fee_acknowledgements.grant_id`/`.step_up_challenge_id`
  (DEV-DB6-014) → both dangling values rejected; existence physical,
  purpose/scope validation stays TX/App (GRD-002/003), same tier as every
  sibling secure-flow evidence table.

C4 matrix updated (`DB6_RELATIONSHIP_COVERAGE_AUDIT.md` §5): G15's 21
Class-A edges plus DEV-DB6-014's two FKs and the three deferred-ledger
resolutions are now physical; zero remaining Class-C/D findings for this
group.

**Denominator: unchanged.** DEV-DB6-014 and REL-028/030 were already
counted in the 164/162 denominator before G15 started (§2.2.1 ledger and
the DB6-C4 addition list). Implementing them increases the *implemented*
FK count only — checker-verified, not hand-counted.

## E. Metrics after G15

```text
groups complete:              15 / 19
tables implemented:           65 / 78
logical COL IDs:              440
logical expansions:           73
business columns:             513
convention columns:           171
physical columns:             684
logical edges:                164 / 164
physical FKs implemented:     133 / 162
launch indexes implemented:   127 / 211  (114 + 13: 7 constraint-created + 6 P0 performance)
```

Denominator unchanged (164 logical / 162 physical FK targets) — verified
by `tools/db-manifest-check.mjs`'s live re-derivation.

## F. A-status

- **A03** — this group adds 2 partial indexes to the 45-partial launch set
  (`uq_order_cancellation_requests__order__pending`,
  `uq_inventory_reservations__order_stock__reserved`) plus 2 more partial
  performance indexes (`ix_orders__id__cancelling`,
  `ix_order_transitions__order_id__saga_step`,
  `ix_inventory_reservations__stock_id__reserved`,
  `ix_inventory_reservations__expires_id__reserved` — 4 partial performance
  + 2 partial unique = 6 of this group's 13 new indexes are partial); 0
  volatile predicates (`now()` never appears in an index predicate).
- **A04** — Reservation lock path live-verified: `SELECT … FOR UPDATE`
  resolves through `uq_sku_stocks__sku` to exactly one row; a second
  session's `FOR UPDATE NOWAIT` against the same row correctly raised
  `55P03` while the first session held the lock.
- **A08** — new money columns: `total_amount` (`orders`); `unit_price_amount`/
  `line_total_amount` (`order_items`); `previous_fee_amount`/
  `new_fee_amount` (`shipping_fee_acknowledgements`); `fee_amount`
  (`shipping_details`/`shipping_snapshots`). All `numeric(14,2)`, closed
  `'VND'` CHECK. Money groups implemented to date: G14 (Quotation), G15
  (Order/Shipping). Remaining owner group: G16 (Payment). Not closed
  globally.
- **A09** — new lifecycle/type sets: `ORDER_STATES` (LC-14),
  `ORDER_TRANSITION_EVENT_KINDS`, `CANCELLATION_STAGES`/
  `CANCELLATION_INITIATORS`/`CANCELLATION_REQUEST_STATES`,
  `SHIPPING_DETAIL_STATES` (LC-19), `INVENTORY_RESERVATION_STATES` (LC-17).
  Byte-identical TS/DB parity confirmed via `\d+` on the disposable
  fresh-install database.
- **A10** — categories: `orders` = mutable root; `order_items` = immutable
  snapshot (S24 target); `order_transitions`/`shipping_fee_acknowledgements`
  = append-only; `order_cancellation_requests` = mutable proc;
  `shipping_details` = mutable-until-frozen (S24 target, CST-094);
  `shipping_snapshots` = immutable snapshot (S24 target, CST-094);
  `inventory_reservations` = operational mutable. S24 targets: CST-094
  (shipping freeze pair). No trigger claimed before S24.
- **A11** — launch-required-only: 6 P0 performance indexes implemented;
  reservation hot-path indexes kept narrow (2-column partial only).
- **A12** — remains deferred to DB9; no performance pass on
  disposable/near-empty data.
- **A15** — no speculative dashboard/low-stock index added; existing
  no-index decisions on `sku_stocks` preserved untouched.
- **TBL-021** — implemented.
- **ledger.reservation_id / ledger.order_id** — resolved, implemented.
- **soft_hold.converted_reservation_id** — resolved, implemented.
- **DEV-DB6-014** — closed, implemented.
- **Deposit-before-Reservation guard** — TX/App only (CST-111/GRD-013);
  no `deposit_paid`/payment-state column added to `inventory_reservations`.
- **Quotation-to-Order guard** — TX/App only (CST-113/GRD-009); CST-030's
  unique backstop is the only DB-level defense against duplicate
  conversion; live-verified (T4 in §G).

## G. Validation

- **Static:** typecheck clean; ESLint clean (0 warnings); Prettier clean
  (after one auto-fix pass); 87/87 Jest tests pass; 25/25 tool tests pass;
  file-size check passes (only the pre-existing `tools/db-metric-check.mjs`
  review-threshold notice, unrelated to G15); manifest/metric/
  deferred-owner checkers all PASS (65 tables, 684 columns, 164 edges,
  133/162 FKs); identifier-length scan clean (longest name 59 bytes);
  float/double scan clean; JSONB scan clean; `deposit_paid`/
  `payment_status`/`reservation_created`/`order_created` scan clean (two
  matches were a legitimate `DEPOSIT_PAID` lifecycle-state literal and a
  doc comment denying the field exists); plaintext token/OTP/secret scan
  clean (one match was a doc comment denying the pattern).
- **Fresh disposable install:** `embroidery_g15_fresh` — migrations
  `0000`–`0023` applied cleanly; live counts: 65 tables, 684 columns, 133
  FKs; `drizzle-kit check` clean. Database dropped after verification.
- **G14-prefix disposable upgrade (not the persistent dev DB):**
  `embroidery_g15_upgrade` — migrations `0000`–`0022` applied from a
  trimmed migration set (G14 baseline), representative G1–G14 data seeded
  including a soft hold with `converted_reservation_id = NULL` and a
  ledger entry with `reservation_id`/`order_id` both `NULL` (the
  pre-existing deferred-column state), plus a full Request→Design Case→
  Approval Snapshot→Quotation→Acceptance chain for the Order smoke tests,
  then the real `0023` applied on top. Pre-existing rows survived
  unchanged; all three deferred FKs and DEV-DB6-014's two FKs added
  without error; no drop/recreate; journal append-only (24 entries).
  Database dropped after verification.
- **Reapply/drift:** `drizzle-kit check` clean on both disposable
  databases; no pending migration; no generated diff.
- **Physical parity:** exact table/column/FK counts confirmed live on both
  disposable databases (65/684/133); no Payment/Production table, no
  `deposit_paid`/payment-state column, no float money, no stored
  availability/low-stock column, no plaintext secret, no generic
  polymorphism.
- **Behavioral smoke (31 cases + 1 lock test, all matched expectation):**
  valid order/item/reservation/shipping/acknowledgement/cancellation-
  request/transition inserts; dangling FK rejected at every level (request,
  stock, grant, challenge, reservation, order); duplicate 1–1 request
  (CST-030, T4 — the Quotation-to-Order duplicate-conversion guard),
  duplicate business code, duplicate active reservation (CST-016),
  duplicate dispatch freeze (CST-034), duplicate PENDING cancellation
  review (CST-032) all rejected; CST-067 rejected both the
  neither-subject and both-subjects cases; invalid lifecycle states
  rejected; non-positive quantities rejected at order-item and reservation
  level; frozen `order_items.product_name` survived a live Catalog rename
  (snapshot stability); `shipping_details` FROZEN-without-`frozen_at`
  rejected; valid Hold→Reservation link succeeded, dangling link rejected;
  **`FOR UPDATE NOWAIT` lock smoke correctly raised `55P03`** when a second
  session contended the same `sku_stocks` row; **`order_items` UPDATE
  succeeded** (honest S24-deferred immutability gap, not claimed as
  rejected); all rollback-wrapped test rows confirmed absent afterward.
- **Security/privacy:** no PII beyond what DB4 already classifies
  ([PII] `shipping_details`/`shipping_snapshots` recipient/address
  columns); PostgreSQL error DETAIL not forwarded to any application
  surface (DB layer only, no service code written).
- **Persistent dev DB confirmed untouched:** table count re-checked at 53
  (G13 state) after all disposable-DB work completed.

## H. Commits

```text
<pending — see chat delivery for hash>
```

Tree clean before commit; not pushed.

## I. Verdict

```text
DB6-G15      PASS
OVERALL DB6  IN PROGRESS
```
