# ADR-DB4-001 — Money Representation (Logical)

- Status: Accepted
- Date: 2026-07-15
- Git HEAD: `a79f5235fd35f76076148cfc53a3eb18f538730b`
- Decision IDs: — (DB4-owned modeling decision; completes the money portion
  deferred by DEC-07/ADR-DB1-006)
- Requirement IDs: REQ-INT-001, REQ-QUOT-001..003, REQ-PAY-001..009,
  REQ-SHIP-002
- Invariant IDs: INV-04, INV-11, INV-12
- Gap IDs: —

## Context

DB1 locked "no floating point, exact `numeric` only, columns named
`<purpose>_amount`" (ADR-DB1-006, INV-11) and deferred precision/scale and
currency handling to DB4. DB7 test D7-06 already asserts **numeric-only
introspection** for money columns. The MVP is single-currency VND (zero
minor units); B2B/tax and multi-currency are future readiness concerns, not
current features (`02 §2`). Money appears in: catalog base price, quotation
versions/line items, order totals/items, payment obligations/attempts/
provider events, refunds, shipping fee, manual adjustments.

## Decision Drivers

- INV-11: exact decimal semantics end-to-end; DB7 D7-06 asserts numeric.
- 40/60 deposit split (config percentages) must produce two obligations that
  sum exactly to the accepted total (INV-04 arithmetic safety).
- Provider amount mapping (VND providers use integer amounts) must be
  lossless.
- Snapshots (quotation version, order item, shipping snapshot, refund) copy
  amounts **by value**, never by reference (INV-12).
- Future multi-currency must be additive, not a re-model.

## Options Considered

### Option A — Integer minor units (`bigint`) + currency code

Lossless and fast, but: (a) contradicts the already-locked ADR-DB1-006
baseline ("Money `numeric`") and the DB7 numeric introspection test; (b) VND
has zero minor units, so the unit convention must still be carried per
currency; (c) percentages/fees still need exact decimal arithmetic in the
application, reintroducing conversion boundaries.

### Option B — Exact `numeric(precision, scale)` amount + currency code

Native exact decimal; matches ADR-DB1-006; PostgreSQL `numeric` arithmetic
is exact; serialization to string is lossless; scale accommodates future
currencies with minor units.

### Option C — Mixed model per domain

Two representations to test, map, and reconcile — no benefit at this scale.

## Decision

**Option B.** All money is stored as `numeric(14,2)` + an explicit currency
code column.

### Rules (locked)

1. **Amount storage:** logical type `numeric(14,2)` for every
   `<purpose>_amount` column. VND amounts are whole numbers stored at scale
   2 (`.00`); the scale exists for future currency readiness and for exact
   percentage arithmetic. 14 digits of precision covers ~999 billion VND —
   far above any plausible order value.
2. **No floating point** anywhere: no `real`/`double precision` column may
   hold a monetary, percentage, fee, or refund value (INV-11; DB7 D7-06).
3. **Currency representation:** every table that stores amounts carries one
   `currency_code` column (`text`, ISO-4217 uppercase, NOT NULL, CHECK
   `'VND'` for MVP — widening the CHECK set is a plain migration per
   ADR-DB1-008 mechanics). Amounts within one row are always in that row's
   single currency; no mixed-currency rows.
4. **Percentage/rate representation:** `numeric(5,2)` bounded `0–100` by
   CHECK. The deposit percentage **value** comes from policy configuration
   (CON-144, D-013/014); the quotation version snapshots the percentage used
   (`deposit_percent`) so history is self-describing.
5. **Rounding owner: the application Money VO** (`packages/domain-types`),
   at exactly one point — derivation time. Locked derivation rule for the
   split: `deposit_amount = round_half_up(total_amount × deposit_percent /
   100, 2)`; `remaining_amount = total_amount − deposit_amount`. The DB
   stores results and CHECK-verifies `deposit_amount + remaining_amount =
   total_amount` on the quotation version; it never re-derives.
6. **Snapshot behavior:** quotation versions, order rows/items, shipping
   snapshots, obligations, refunds each store their own amount copies.
   Recalculation (ADR-DB3-003 r7) supersedes obligations and creates new
   rows; it never edits stored amounts.
7. **Non-negativity:** amounts are `>= 0` by CHECK wherever the domain
   forbids negatives (prices, totals, fees, obligations, refunds).
   Signed monetary deltas do not exist in the model (inventory ledger deltas
   are quantities, not money; reconciliations record explicit old/new
   values).
8. **Refund bound:** `refunds.amount` ≤ refundable amount of the target
   attempt is a **TX/App guard** (GRD-021) with DB7 coverage — it spans rows
   and cannot be a column CHECK.
9. **Provider mapping:** provider adapters convert `numeric` ↔ provider
   integer/string formats at the port boundary; provider events store the
   provider-reported amount + currency for verification (GRD-011 compares
   exactly).
10. **Serialization:** amounts cross the API as strings (exact), never as
    IEEE-754 numbers — direction for the backend contract checkpoint.

## Consequences

### Positive

- Matches every locked baseline (ADR-DB1-006, INV-11, D7-06) with zero
  re-work; multi-currency later = widen one CHECK + configuration.
- Sum invariants are DB-checkable per row (deposit + remaining = total).

### Negative

- `numeric` is marginally slower than `bigint` — irrelevant at <100
  orders/month.

## Rejected Alternatives

- Integer minor units (contradicts locked numeric baseline; conversion
  layers for zero benefit in VND); mixed model (two systems to verify);
  storing currency implicitly (hidden assumption prohibited by DB2 VO
  catalog note).

## Deferred Details

- Deposit percentage values, refund defaults = policy configuration
  (CON-144) — unchanged from DB3.
- API serialization contract → backend contract checkpoint.

## Implementation Checkpoint

DB4 (this logical model), DB6 (DDL).

## Verification Checkpoint

DB7 (D7-06 numeric introspection; sum/bound checks), DB8 (recalculation
races per CC-10).

## Reversal / Migration Cost

Low→medium: moving to minor units later is a mechanical column migration;
the VO boundary already isolates arithmetic.

## References

- ADR-DB1-006 (money baseline), ADR-DB3-001 r3 (accepted-total basis),
  ADR-DB3-003 r7 (recalculation)
- `docs/database/DB3_DB4_HANDOFF.md` §3 (money exactness)
- PostgreSQL numeric — https://www.postgresql.org/docs/16/datatype-numeric.html
