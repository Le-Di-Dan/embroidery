/**
 * TBL-018 `sku_stocks` — the stock record of one SKU: on-hand quantity plus
 * low-stock threshold. **The inventory lock anchor** (CTX-INV, AGG-07).
 *
 * Columns: COL-TBL018-01..03 · Constraints: CST-001, CST-014 (IDX-016),
 * CST-061 (INV-18), threshold CK (COL-TBL018-03)
 * Relationships: REL-026 (→ skus, 1–1, "inventory truth split")
 * Indexes: **PK + IDX-016 only** — the deliberate DB5 minimum on the hottest
 * contended row (`DB5_DB6_HANDOFF.md` §9); no other index may be added here.
 * Owner: Inventory module.
 *
 * **Balance semantics (DB4):** `quantity_on_hand` is the authoritative
 * operational counter, mutated ONLY inside a row-locked transaction that also
 * appends a ledger entry (GRD-014). The ledger (TBL-019) is the rebuild
 * source of truth; `available = quantity_on_hand − Σ active holds/
 * reservations` is computed in-transaction, never stored (DB4 §3 projection
 * register). There is no `available`, no `reserved`, no `is_low_stock`
 * column, and no optimistic `lock_version` — DB4 assigns concurrency to the
 * row lock (CC-20..24), not to versioning.
 *
 * Lock protocol (DB8 handoff): `SELECT … FROM sku_stocks WHERE sku_id = $1
 * FOR UPDATE` resolves through IDX-016 to exactly one row. Rows are created
 * by admin stock initialisation, not lazily on the order path.
 *
 * `low_stock_threshold` is the Q-20 input; Q-20 stays a **no-index decision**
 * (DB5 rejection entry R01 stands — column-vs-column predicate on ≤ dozens of rows).
 */
import { sql } from 'drizzle-orm';
import { check, foreignKey, integer, pgTable, primaryKey, unique } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, updatedAt } from '../../primitives/temporal';
import { skus } from '../catalog/skus';

export const skuStocks = pgTable(
  'sku_stocks',
  {
    id: idColumn().notNull(),
    skuId: idReference('sku_id').notNull(),
    quantityOnHand: integer('quantity_on_hand').notNull(),
    lowStockThreshold: integer('low_stock_threshold'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_sku_stocks', columns: [t.id] }),
    // CST-014 / IDX-016 — one stock row per SKU; the Q-32 lock-anchor lookup.
    unique('uq_sku_stocks__sku').on(t.skuId),
    // REL-026 — definition lives in Catalog, stock here; a SKU with a stock
    // row is never deletable (archive delists it instead).
    foreignKey({
      name: 'fk_sku_stocks__sku_id',
      columns: [t.skuId],
      foreignColumns: [skus.id],
    }).onDelete('restrict'),
    // CST-061 / INV-18 — negative stock is unrepresentable. The DB8 race
    // (concurrent decrements) resolves here when the app guard loses.
    check('ck_sku_stocks__quantity_non_negative', sql`${t.quantityOnHand} >= 0`),
    // COL-TBL018-03 — a threshold, when set, is never negative.
    check('ck_sku_stocks__threshold_non_negative', sql`${t.lowStockThreshold} >= 0`),
  ],
);
