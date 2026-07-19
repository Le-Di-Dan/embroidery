# DB6 — Money Scale Audit (DB6-C5 §B2)

**Date:** 2026-07-19 · **Slice:** DB6-C5 (correction, forward-only)
**Trigger:** DB6-G16 review found `payment_reconciliations.amount` fractional-VND
acceptance documented as a "gap" instead of fixed. Audit scope was widened to
every money column implemented G1–G16, not just Payment.

## 1. Canonical money policy

`DB4_MONEY_QUANTITY_MEASUREMENT_MODEL.md` §1 / ADR-DB4-001 / DEV-DB6-005:

- every money amount is `numeric(14,2)`, paired with a row-level currency
  column (never a float — INV-11);
- VND has no minor unit — a stored amount like `1000.25 VND` cannot exist;
- the rule is **conditional on currency**, not global, so a future non-VND
  currency needs no column-type or data change.

The authoritative helper implementing the conditional rule already existed
before this audit: `primitives/money.ts`'s `currencyScaleCheck(amountColumn,
currencyColumn)`, emitting `currency_code not in ('VND') or amount =
trunc(amount)`. It was applied to `products.base_price_amount` and
`skus.price_override_amount` from G5 onward. **It had never been applied to
any other money column implemented since**, across nine tables and three
modules (Quotation, Ordering, Payment). This audit closes that gap.

## 2. All implemented money tables/columns (G1–G16)

| TBL | Table | Amount column(s) | Currency col | Pre-C5 scale CHECK | Post-C5 |
|---|---|---|---|---|---|
| — | products | `base_price_amount` | `currency_code` | ✅ (money.ts, G5) | unchanged |
| — | skus | `price_override_amount` (nullable) | `currency_code` | ✅ (money.ts, G5) | unchanged |
| TBL-051 | quotation_versions | `subtotal_amount`, `manual_adjustment_amount` (nullable-by-default-0), `shipping_fee_amount`, `total_amount`, `deposit_amount`, `remaining_amount` | `currency_code` | ❌ | ✅ 6 new CHECKs |
| TBL-052 | quotation_line_items | `unit_price_amount`, `line_total_amount` | `currency_code` | ❌ | ✅ 2 new CHECKs |
| TBL-053 | quotation_acceptances | `accepted_total_amount` | `currency_code` | ❌ | ✅ 1 new CHECK |
| TBL-043 | orders | `total_amount` | `currency_code` | ❌ | ✅ 1 new CHECK |
| TBL-044 | order_items | `unit_price_amount`, `line_total_amount` | `currency_code` | ❌ | ✅ 2 new CHECKs |
| TBL-047 | shipping_details | `fee_amount` (nullable) | `currency_code` | ❌ | ✅ 1 new CHECK |
| TBL-048 | shipping_snapshots | `fee_amount` | `currency_code` | ❌ | ✅ 1 new CHECK |
| TBL-049 | shipping_fee_acknowledgements | `previous_fee_amount`, `new_fee_amount` | `currency_code` | ❌ | ✅ 2 new CHECKs |
| TBL-054 | payment_obligations | `amount` | `currency_code` | ❌ | ✅ 1 new CHECK |
| TBL-055 | payment_attempts | `amount` | `currency_code` | ❌ | ✅ 1 new CHECK |
| TBL-056 | payment_provider_events | `amount` (nullable) | `currency_code` (nullable) | ❌ | ✅ 1 new CHECK |
| TBL-057 | payment_reconciliations | `amount` (nullable) | **none** — see §3 | ❌ | ✅ 1 new CHECK (unconditional form) |
| TBL-058 | refunds | `amount` | `currency_code` | ❌ | ✅ 1 new CHECK |

All fifteen rows use `numeric(14,2)`; nullability, negative/positive rule and
existing pre-C5 CHECKs (non-negative / positive / `= 'VND'`) are unchanged by
this audit — C5 adds exactly one new CHECK per amount column, nothing else.
Source requirement for each: CST-064/066/068 families (DB4 constraint
catalog) plus DEV-DB6-005 for the scale rule itself. A08 (money-model
conformance) was **not previously closed** for the raw-`numeric` convention —
it is closed as of this audit.

## 3. `payment_reconciliations` — no per-row currency column

`payment_reconciliations.amount` has no sibling `currency_code`; the row
borrows whichever currency the resolved `payment_attempt`/`payment_obligation`
carries (both of which are themselves closed to `'VND'`). `currencyScaleCheck`
cannot be applied verbatim (it requires a currency column on the same row), so
the equivalent rule is unconditional here:

```sql
amount is null or amount = trunc(amount)
```

This is not a new business rule — every currency column in this schema is
already closed to `'VND'` (no second currency is implemented anywhere), so
the conditional and unconditional forms are currently equivalent in effect.
Documented in the migration and in `payment-reconciliations.ts`.

## 4. Existing-data scan (before adding the CHECKs)

Scanned the persistent dev database (`embroidery`, 65 tables, pre-G16 state —
the only database with real/seeded data) for every money column that exists
at that state, comparing `amount <> trunc(amount)` for `currency_code='VND'`
rows:

```
quotation_versions.{subtotal,manual_adjustment,shipping_fee,total,deposit,remaining}_amount → 0
quotation_line_items.{unit_price,line_total}_amount → 0
quotation_acceptances.accepted_total_amount → 0
orders.total_amount → 0
order_items.{unit_price,line_total}_amount → 0
shipping_details.fee_amount → 0
shipping_snapshots.fee_amount → 0
shipping_fee_acknowledgements.{previous_fee,new_fee}_amount → 0
```

Zero fractional-VND rows found. `payment_*` tables do not exist yet in the
persistent dev database (G16 was never applied there, per standing DB6
policy of validating each group on disposable databases only) — they carry
no data to scan. **No blocker.** No round/truncate/delete was performed or
would have been needed.

## 5. Negative migration test (disposable database, not persistent dev)

A disposable G16-prefix database (`embroidery_c5_negative`) was seeded with a
pre-existing fractional-VND row in `quotation_versions`
(`subtotal_amount=1000.50`, satisfying every *other* existing CHECK) before
`0026_enforce_vnd_currency_scale.sql` was applied:

```
ERROR: check constraint "ck_quotation_versions__subtotal_currency_scale"
of relation "quotation_versions" is violated by some row (SQLSTATE 23514)
```

The migration run aborted; `drizzle.__drizzle_migrations` stayed at 25 rows
(migration 0026 was never recorded); the seeded row's values were verified
unchanged afterward (`1000.50` / `400.20` / `600.30` — no rounding, no
truncation, no deletion). Postgres validates 100% of existing rows for every
`ALTER TABLE ... ADD CONSTRAINT CHECK` before committing — the same guarantee
holds identically for all 13 tables' new CHECKs in `0026`, not only the one
exercised here. Database dropped after the test.

## 6. Positive upgrade test (disposable database)

A second disposable G16-prefix database (`embroidery_c5_g16`) was seeded with
a full valid order→payment chain carrying **integer**-VND amounts across all
13 affected tables, then `0026` was applied through the real
`drizzle.config.ts`:

- migration succeeded (26 migrations recorded, 70 tables, drift clean);
- every seeded row's amount was verified byte-identical afterward;
- a subsequent `UPDATE ... SET amount = <fractional>` against both an
  early-file table (`payment_obligations`) and the `orders` table was then
  rejected with SQLSTATE `23514` — proving the new CHECKs are live, not just
  present in the migration file.

Database dropped after the test.

## 7. DB7 test target

`DB7` (data-layer/repository tests, not yet started) should carry an
integration test asserting that inserting/updating any of the fifteen money
columns above with a fractional VND amount raises the corresponding
`ck_*_currency_scale` violation, and that a non-VND currency is currently
unreachable (no second currency is implemented) rather than silently
accepted at the scale layer.

## 8. A08 status

**A08 (money-model conformance) — closed** for all money columns implemented
G1–G16 as of this audit. Any future group introducing a new money column must
add its own `ck_<table>__<column>_currency_scale` check using
`currencyScaleCheck()` (or, if the table genuinely has no per-row currency
column, the documented unconditional equivalent per §3) in the same migration
that creates the column — the manifest checker should be extended to fail a
group whose money column lacks this classification (see
`DB6_INDEX_METRIC_RECONCILIATION.md` for the parallel index-side checker
requirement; an equivalent money-side checker is future tooling work, not
implemented in this slice).
