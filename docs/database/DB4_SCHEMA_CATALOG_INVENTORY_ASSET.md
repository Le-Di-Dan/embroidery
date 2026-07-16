# DB4 — Context Schema: Catalog, Inventory & Asset (CTX-CAT / CTX-INV / CTX-AST)

**Date:** 2026-07-15 · **Git HEAD:** `a79f523` · Logical only.
Tables: TBL-011..024.

## 1. Structures

**Catalog:** `categories`, `products`, `product_variants`, `skus`,
`product_sides`, `embroidery_areas`, `product_media` (TBL-011..017).
**Inventory:** `sku_stocks`, `inventory_ledger_entries`,
`inventory_soft_holds`, `inventory_reservations` (TBL-018..021).
**Asset:** `assets`, `asset_inspections`, `asset_derivatives`
(TBL-022..024) + context-specific association tables per ADR-DB4-003.

## 2. Modeling assertions (task §15.2)

1. **Publication vs availability:** `products.status` (LC-04
   DRAFT/PUBLISHED/ARCHIVED) is publication; SKU availability (LC-05) is
   **derived** from computed balance + `products.is_display_out_of_stock`
   manual override (override OUT wins; can never force AVAILABLE when
   computed ≤ 0 — App rule per DB3). No availability status column exists.
2. **SKU definition vs stock:** `skus` (Catalog) hold definition/price;
   `sku_stocks` (Inventory) is the 1–1 stock row and **lock anchor** for
   GRD-014 (REL-026, CST-014). Catalog never mutates stock; Inventory never
   defines SKUs.
3. **Customer-owned product ≠ SKU:** COP lives in Ordering (TBL-038) with
   no SKU/stock columns; nothing in this context references COP.
4. **Balance projection vs ledger source:** `quantity_on_hand` on
   `sku_stocks` is the authoritative operational counter (CK ≥ 0, CST-061),
   mutated only in row-locked transactions that append a ledger entry
   (TBL-019) in the same tx; available/held/sold are computed
   (`DB4_TABLE_CATALOG.md` §3). Ledger is append-only (CST-098) with
   mandatory reason for adjustments (CST-071, GRD-023) and rebuilds the
   counter.
5. **Soft hold vs official reservation:** distinct tables (TBL-020/021)
   with distinct lifecycles (LC-17); holds require configured TTL
   (`expires_at` NOT NULL; no config → holds disabled, ADR-DB1-018);
   reservations allow explicit no-expiry (`expires_at` NULL per policy);
   reservation creation gate (approval + verified deposit, INV-05/GRD-013)
   is TX-enforced (CST-111) — the schema supports it with NOT NULL
   `order_id` and idempotent uniqueness (CST-016). Hold conversion links
   via `converted_reservation_id` (REL-030).
6. **Insufficient stock at reserve time** (LC-17 TR-04): reservation row is
   simply not created; order remains DEPOSIT_PAID with production blocked
   (GRD-015 fails) — no schema state needed beyond the absent row + admin
   alert (SE-008).
7. **Asset binary outside PostgreSQL** (INV-10): `assets` hold metadata +
   unique internal `storage_key` (CON-043); no BLOB column exists anywhere
   (D7 schema scan). Public URLs are never stored as authority.
8. **Private by default:** `classification` on the asset row drives signed
   access (INV-09/CON-044); derivative `is_watermarked` implements INV-22
   (customer previews true, production artifacts false).
9. **Derivative lineage:** `asset_derivatives.asset_id` parent ref +
   per-kind active uniqueness (CST-018); regeneration = new row after
   FAILED; two-phase deletion tombstone on the parent coordinates binary
   removal (ADR-DB1-011).

## 3. State & history

Product/category publication = Tier C (state + `archived_at` + audit).
Inventory = Tier B: every hold/reservation state change appends a ledger
entry with reason/actor — no separate reservation transition table
(ADR-DB4-002). Asset pipeline = Tier B via `asset_inspections` + state
timestamps.

## 4. Retention

Catalog archive (hard delete only never-published, TR-LC04-03); ledger and
reservations retained (commercial); holds operational; inspections
operational; assets per-kind with two-phase tombstone.
