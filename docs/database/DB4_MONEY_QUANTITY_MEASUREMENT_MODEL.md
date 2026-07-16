# DB4 — Money, Quantity & Measurement Model

**Date:** 2026-07-15 · **Git HEAD:** `a79f523`
**Normative:** [ADR-DB4-001](../adr/database/ADR-DB4-001-MONEY-REPRESENTATION.md)
(money) · GAP-10 closed in §3.

## 1. Money & rates

| Concept | Logical type | Validation (CK) | Null | Derived vs entered | Rounding | Snapshot behavior |
|---|---|---|---|---|---|---|
| Money amounts (`*_amount`) | numeric(14,2) + row `currency_code` text ('VND' CK) | ≥ 0 (obligations/refunds/attempts > 0) | per column dictionary | mixed | app Money VO, single derivation point (ADR-DB4-001 r5) | copied by value at every commercial boundary (INV-12) |
| Deposit/remaining split | two obligation rows (kind) + `deposit_percent`, `deposit_amount`, `remaining_amount` on quotation version | deposit + remaining = total; percent 0–100 (CST-064) | no | derived once from config percent (D-013/014 [cfg]) at send; entered never | round-half-up on deposit; remaining = total − deposit | frozen in version; recalculation = SUPERSEDED chain |
| Manual adjustment | `manual_adjustment_amount` (signed) + reason [R] | reason required when ≠ 0 | no (default 0) | admin-entered | n/a | frozen in version |
| Shipping fee | `quotation_versions.shipping_fee_amount` (quoted) + `shipping_details/ snapshots.fee_amount` (final) | ≥ 0 | quoted no / final yes-until-set | admin-entered | n/a | dual snapshot by design; increases need acknowledgement (TBL-049) + obligation recalc |
| Refund | `refunds.amount` | > 0; ≤ refundable = TX (GRD-021/CST-117) | no | admin-decided (defaults [cfg]) | n/a | immutable after creation |
| Percentages/rates | numeric(5,2) | 0–100 | no | config-sourced, snapshotted where used | app | frozen copies |

## 2. Quantities & counts

| Concept | Type | Validation | Null | Source | Notes |
|---|---|---|---|---|---|
| Quantity (breakdown/lines/items) | integer | > 0 (CST-062) | no | customer/admin entered | breakdown mutable until QUOTED (CST-122) |
| Inventory on-hand | integer | ≥ 0 (CST-061, INV-18) | no | ledger-reconciled counter | mutated only under row lock + ledger append |
| Ledger quantity / on_hand_delta | integer / signed integer | quantity > 0 | no | system/admin with reason | append-only |
| Hold/reservation quantity | integer | > 0 | no | system | idempotent transitions |
| Color count | integer | ≥ 0 | yes (until entered) | admin-entered pricing input | frozen at send |
| Low-stock threshold | integer | ≥ 0 | yes | admin config per stock row | Q-20 input |

## 3. Stitch count — GAP-10 closed

| Aspect | Locked decision |
|---|---|
| Nature | **Admin-entered quotation pricing input** — never derived/computed (no stitch engine in scope, `00 §8`/`02 §2`) |
| Storage | `quotation_versions.stitch_count` (COL-TBL051-05), integer | 
| Validation | CK ≥ 0 (CST-065); unit = stitch count (dimensionless integer) |
| Nullability | NULL while DRAFT (admin may not know yet); **required before send** — send guard (TX/App) with conditional-CK candidate at DB6 |
| Correction | new quotation version (INV-02); sent values immutable |
| Audit | version create/send audited with actor=admin (audit spec quotation group) |
| Boundary | lives **only** in the quotation version pricing-input set; the Design Document is never an authoritative pricing source |

Gap register updated append-only in
[`DB0_CONFLICTS_AND_GAPS.md`](./DB0_CONFLICTS_AND_GAPS.md) §6.

## 4. Physical dimensions & geometry

| Concept | Type | Validation | Notes |
|---|---|---|---|
| Physical width/height (mm) | numeric | > 0 (CST-066) | sides, areas (max), design versions, approvals, COP, quotation inputs, production specs — frozen in snapshots |
| Canvas coordinates / bounds (px) | numeric | > 0 for extents | `product_sides` image dims, `embroidery_areas` bounds (CON-029) |
| px_per_mm mapping | numeric | > 0 | canvas↔physical mapping per side |
| Thread color | text code + optional name | non-empty | authoritative inside hashed design document; display copies in `approval_snapshot_thread_colors` |
| Measurement unit | fixed: mm for physical, px for canvas | — | no unit column needed (single-unit rule; documented for DB6) |

## 5. Durations & windows

| Concept | Type | Notes |
|---|---|---|
| Quotation validity | `valid_from`/`valid_until` timestamptz, CK from < until | window values [cfg] |
| Expiries (session/challenge/grant/hold/reservation/idempotency/attempt) | explicit `expires_at` timestamptz (ADR-DB1-018 pattern) | TTL values [cfg]; sweeps read timestamps, never compute implicit expiry |
| Lead time | not a stored column in MVP (quotation text/line description carries it); becomes a column only if business locks a structured requirement | explicit non-goal note |

All timestamps timestamptz UTC (ADR-DB1-006); date-only concepts absent.
