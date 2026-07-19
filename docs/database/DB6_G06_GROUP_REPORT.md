# DB6-G06 — Inventory Core Group Report

**Date:** 2026-07-18 · **Verdict:** `DB6-G6 PASS` · `OVERALL DB6 IN PROGRESS`

Full-form report stored in-repo per the G5 review guardrail (terminal output
must not be the only review evidence).

## A. Preflight

| Check | Result |
|---|---|
| Branch / initial HEAD | `production` / `2ff63ce` |
| Working tree | clean (0 entries) |
| Baseline commits | all 10 present (`3855207` … `2ff63ce`) |
| Migrations `0000`–`0007` | byte-identical (git diff empty) |
| Journal | 8 entries, last `0007_create_catalog_tables` |
| Manifest checker | PASS |
| Drift | clean, 8/8 `up-to-date` |
| G1–G5 parity | intact — 21 tables, 48 indexes |
| G4 deferred FK (`uploaded_via_session_id`) | still absent — owner G7 respected |
| Partial G6 attempt | none (`schema/inventory/` did not exist) |
| G5 `skus` as FK target | present |

## B. G6 scope (derived from manifests; matched expected 2 tables)

| Item | Value |
|---|---|
| Group / context | G6 — Inventory core (CTX-INV, AGG-07) |
| TBL IDs / tables | TBL-018 `sku_stocks` · TBL-019 `inventory_ledger_entries` |
| Logical COL IDs | **12** (TBL018-01..03; TBL019-01..09, -09 ×3) |
| Convention columns | **5** (2 id, 2 created_at, 1 updated_at — none on the append-only ledger) |
| Total physical columns | **19** (6 / 13) |
| REL rows → edges | REL-026, REL-027, REL-028 ×3 → 5 logical edges |
| Physical FKs in G6 | **2** (`fk_sku_stocks__sku_id`, `fk_inventory_ledger_entries__sku_stock_id`) |
| Deferred FK edges | REL-028 ×3: `soft_hold_id`/`reservation_id` → **owner G10**, `order_id` → **owner G15** (nullable columns exist now) |
| CST IDs | CST-001 ×2, CST-014, CST-061, CST-062 (1 instance), CST-071, entry-kind `(CK)`, threshold CK; CST-098 → S24 target |
| TX/App-only | counter↔ledger atomicity (GRD-014), actor-kind value set, lazy-creation prohibition |
| IDX entries | IDX-016 (constraint-created, **lock anchor**) · IDX-115 (explicit performance) |
| Partial / deferred / rejected indexes | none / none / IDX-R01 (Q-20) stands |
| Quantity/balance columns | `quantity_on_hand` (authoritative counter), `quantity` + `on_hand_delta` (ledger) |
| Lock-anchor column | `sku_id` via `uq_sku_stocks__sku` |
| State/type columns | `entry_kind` (9-value closed set); **no** status column on `sku_stocks` (availability is derived, DB4 §3) |
| Dependencies | G5 (`skus`) |
| DB9 seed | skus → sku_stocks before any hold/reservation/order data |
| DB10 handoff | ledger retention (`retain`), counter rebuild by Σ`on_hand_delta` replay, REINDEX posture on the two hot indexes |

## C. Implementation

**`sku_stocks`** — mutable operational lock anchor. 6 columns; CST-014
one-row-per-SKU; CST-061 non-negative on INSERT **and** UPDATE; threshold ≥ 0;
no `available`/`reserved`/`is_low_stock`/`lock_version` column (all
deliberately absent per DB4 — concurrency is the row lock, availability is
computed). Index budget: **PK + IDX-016 only**.

**`inventory_ledger_entries`** — append-only history, bigint identity, no
`updated_at`. 13 columns; entry-kind closed set (9 values); quantity > 0
(magnitude; direction in kind); `on_hand_delta` signed (0 for pure hold
moves) so Σ replay rebuilds the counter; CST-071 ADJUSTMENT→reason; actor
evidence without CHECK or FK (DB4 marks neither — value set and consistency
stay app-owned); REL-028 columns nullable awaiting owner-group FKs. Index
budget: **PK + IDX-115 only**.

Migration: `0008_create_inventory_core_tables.sql` — generated,
human-reviewed, G6 only: 2 tables, 2 PK, 1 UQ, 5 CK, 2 FK, 1 explicit index.
No custom SQL. No deviations.

**Ledger atomicity handoff (not implemented here):** application use case
(order/inventory module, post-DB6 checkpoint) owns: lock stock row via
IDX-016 → validate invariants → update counter → append ledger → outbox if
required → single commit. Read-committed + row lock per DB3 CC-20..24;
rollback discards both writes together; idempotency via CST-048 records;
DB8 owns the race suite (D8-05/24). No trigger orchestrates any of this.

## D. Manifest metrics after G6

```text
groups complete:                     6 / 19
tables implemented:                 23 / 78
logical DB4 COL IDs implemented:   142
convention columns implemented:     62
total physical columns:            200
physical FKs implemented:           22 / 128
expanded constraint instances:     265 mapped
physical constraints implemented:   95 (23 PK + 22 FK + 13 UQ + 37 CK)
launch indexes implemented:         52 / 211
partial indexes implemented:         9 / 45 (5 pUQ + 4 partial performance)
state/type columns implemented:     11 (10 prior + entry_kind)
required documents complete:         7 / 15
```

## E. A01–A15 (G6 effect)

- **A03** — no new partial index (neither G6 index carries a predicate);
  running total stays **9/45**, volatile = 0. Reason: the lock-anchor lookup
  is a full unique index and the ledger replay index must cover all rows.
- **A04** — foundation capability stays closed; G6 adds **physical**
  lock-anchor proof on the real table: exact one-row lookup, `FOR UPDATE`
  locks the intended row, `NOWAIT` → `55P03`, rollback releases (5/5).
  `SKIP LOCKED` deliberately not exercised — DB5 declares no batch-claim path
  on `sku_stocks`. Full concurrency remains DB8.
- **A08** — no money column in G6 (none defined by DB4); remains partially
  closed; owners G14/G15/G16.
- **A09** — +1 type column (`entry_kind`, 9 values byte-identical to
  COL-TBL019-02); total 11. No `LOW_STOCK`/`OUT_OF_STOCK` state added.
- **A10** — `sku_stocks`: operational mutable lock anchor (mutable:
  quantity, threshold, updated_at; immutable identity: id, sku_id — app rule,
  no trigger planned). `inventory_ledger_entries`: **append-only**, CST-098
  trigger target **deferred S24, honestly not claimed** — smoke case 16
  demonstrates an UPDATE currently succeeds; DB7 reject-mutation test stays
  open until S24.
- **A11** — launch-required only; both DB5 hot-table budgets confirmed
  (2 indexes each).
- **A12** — deferred DB9; the EXPLAIN evidence here is structural only.
- **A15** — Q-20 stays no-index; no low-stock index or persisted state added.

## F. Validation

| Gate | Result |
|---|---|
| Typecheck / lint / format / 18 tests / file-size | PASS |
| Manifest checker (23 tables conform; REL 129; formula 211; groups sum 78) | PASS |
| Float/double/JSONB scan on G6 tables | 0 rows |
| Fresh: empty → 9 migrations | PASS, `up-to-date` |
| No-op reapply | PASS |
| Upgrade from G5 prefix (+G5 smoke chain inserted) | 8 → 1 pending → 9; `SKU-G6` row survived |
| Drift probe | "No schema changes"; `0000`–`0007` unchanged; journal append-only |
| Physical parity | cols 6/13; 23 PK + 22 FK + 13 UQ + 37 CK; 52 indexes; 4 index objects on the two G6 tables exactly; 0 duplicates; 0 non-conforming names |
| Behavioral smoke | **17/17** — duplicate stock row, orphan FKs, negative stock on INSERT and UPDATE, negative threshold, SKU delete-restrict, ADJUSTMENT-without-reason, bogus kind, zero quantity, stock-delete-restrict-with-history, allowed counter update, hold entry with delta 0, rollback residue 0, S24 gap documented |
| Lock smoke | **5/5** — plan shows `Index Scan using uq_sku_stocks__sku` under `LockRows`; `55P03` on contention; release on rollback; parameterized throughout |
| Security | no PII/secret/provider payload columns; SQL parameterized; no unscoped path added |

## G. Commits

`feat(database): implement DB6 schema group G06` — one commit, working tree
clean, not pushed, no old commit amended.

## H. Verdict

```text
DB6-G6       PASS
OVERALL DB6  IN PROGRESS
```

Task board: `DB6-G01..G19` = 6/19 (open) · `DB6-S24..S28` open.

---

## Addendum — DB6-C2 column-metric correction

| Field | Value |
|---|---|
| Original metric (this report §D) | `142 logical / 62 convention / 200 physical` |
| Corrected metric | **155 logical COL IDs + 7 ×N expansions = 162 business; + 64 convention = 226 physical** |
| Live anchor | `pg_attribute` reports 226 columns across 23 tables |
| Root cause | Global running totals in chat reports were **hand-accumulated** across groups with the wrong implicit formula (`ids + convention = physical`, which ignores ×N COL expansions) and with arithmetic slips (G1 reported as 16 IDs — actually 17; G2 as 24 — actually 34). The per-group manifest notes were correct throughout; only the accumulated totals were wrong. |
| G6 local difference (12+5=17 vs 19) | COL-TBL019-09 is a ×3 expansion (`actor_kind`, `admin_id`, `system_job_key`) → +2 physical columns. Enumerated in manifest §4.1. |
| Global difference (204 vs 200 vs 226) | Both prior numbers were wrong: 204 was a sum of already-wrong operands, 200 was a stale hand-carried total. The re-derived, live-verified total is 226. |
| Physical schema impact | **none** — every migration/parity gate had already verified the real objects |
| Migration impact | **none** |
| Behavior impact | **none** — counting semantics only |
| Checker change | canonical register `packages/database/src/schema/column-metrics.ts` verified against the live schema by `column-metrics.spec.ts` (bijection, exact counts, formula, tampered-row fixture) and cross-checked against manifest §4.1 by the manifest checker; a deliberate tamper produces 3 failures |

---

## Addendum — DB6-C3 deferred FK owner correction (DEV-DB6-011)

| Field | Value |
|---|---|
| Original statement (§B, above) | *"Deferred FK edges | REL-028 ×3: `soft_hold_id`/`reservation_id` → **owner G10**, `order_id` → **owner G15**"* |
| Corrected owner mapping | `soft_hold_id` → **G10** · `reservation_id` → **G15** · `order_id` → **G15** |
| Additional carried-forward edge (not previously listed here) | `inventory_soft_holds.converted_reservation_id → inventory_reservations` (REL-030) — source table created **G10**, FK resolved **G15** |
| Reason | `inventory_reservations` (TBL-021) is a G15-created table (manifest §3): its business identity is *"one official reservation of quantity for an order"* (`DB4_TABLE_CATALOG.md:71`) and REL-031 requires a **required** edge to `orders`, which does not exist until G15. A FK naming G10 as resolution owner would have required creating `inventory_reservations` one group early, without its mandatory Order composition target. |
| Impact | physical schema: **none** · migrations: **none** · G6 verdict: **unchanged PASS** · G10 scope: corrected to 4 canonical tables (excludes `inventory_reservations`) · G15 handoff: expanded to explicitly carry `reservation_id`, `order_id`, and `converted_reservation_id` |
| Canonical ledger | `DB6_SCHEMA_IMPLEMENTATION_MANIFEST.md` §2.2.1 (structured deferred-edge table, checker-enforced) |
| Deviation | `DEV-DB6-011` |

This addendum does not alter the original §A–H text above; it corrects the
owner-group claim in §B for a review that occurred after G9, ahead of G10.
