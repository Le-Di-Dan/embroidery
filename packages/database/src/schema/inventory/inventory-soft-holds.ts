/**
 * TBL-020 `inventory_soft_holds` — one temporary, expiring pre-official
 * allocation of quantity for a request (CTX-INV, AGG-07).
 *
 * Columns: COL-TBL020-01..07 · Constraints: CST-001, CST-015 (IDX-017,
 * LC-17), quantity > 0
 * Relationships: REL-029 (→ sku_stocks, → custom_requests), REL-030 (→
 * inventory_reservations — **deferred, owner G15**: `inventory_reservations`
 * is a G15-created table per DEV-DB6-011; the nullable column exists now)
 * Indexes: IDX-017 (constraint-created, pUQ active hold); IDX-109/113 (P0/P1,
 * with group); IDX-127 (recommended) → S25
 * Owner: Inventory module.
 *
 * **Not an official reservation.** A Soft Hold is a temporary, TTL-bound
 * allocation ahead of Deposit; it never means inventory is officially
 * committed and never creates an Order. `inventory_reservations` (TBL-021)
 * is a separate table, created only in G15, with its own required Order
 * composition edge (REL-031) — this group creates no Reservation object of
 * any kind (no table, no lifecycle constant, no constraint, no index).
 *
 * `expires_at` is mandatory (ADR-DB1-018: no TTL config → holds disabled),
 * unlike `inventory_reservations.expires_at`, which DB4 allows to be NULL.
 * `sku_stocks.quantity_on_hand` remains the sole authoritative counter — no
 * `available`/`reserved` column is added here or on `sku_stocks`; a
 * request's available quantity is computed transactionally from active
 * holds (and, from G15, active reservations), never stored.
 */
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant, updatedAt } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';
import { skuStocks } from './sku-stocks';
import { customRequests } from '../ordering/custom-requests';

/** LC-17 (hold side). Canonical source — see DB5-A09. */
export const INVENTORY_SOFT_HOLD_STATES = ['HELD', 'CONVERTED', 'RELEASED', 'EXPIRED'] as const;
export type InventorySoftHoldState = (typeof INVENTORY_SOFT_HOLD_STATES)[number];

export const inventorySoftHolds = pgTable(
  'inventory_soft_holds',
  {
    id: idColumn().notNull(),
    skuStockId: idReference('sku_stock_id').notNull(),
    customRequestId: idReference('custom_request_id').notNull(),
    quantity: integer('quantity').notNull(),
    status: stateColumn().notNull(),
    expiresAt: instant('expires_at').notNull(),
    releasedReason: text('released_reason'),
    // REL-030 — converted_reservation_id: target table (inventory_reservations)
    // is created in G15 (DEV-DB6-011). Column exists now, nullable, no FK.
    convertedReservationId: idReference('converted_reservation_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_inventory_soft_holds', columns: [t.id] }),
    // CST-015 / IDX-017 — duplicate holds on the same (request, stock) pair
    // are rejected by the database, not by a check-then-write race.
    uniqueIndex('uq_inventory_soft_holds__request_stock__held')
      .on(t.customRequestId, t.skuStockId)
      .where(sql`${t.status} = 'HELD'`),
    // REL-029 — the stock row a hold is placed against; restrict keeps the
    // lock anchor from disappearing while a hold still references it.
    foreignKey({
      name: 'fk_inventory_soft_holds__sku_stock_id',
      columns: [t.skuStockId],
      foreignColumns: [skuStocks.id],
    }).onDelete('restrict'),
    // REL-029 — the request this hold is scoped to (terminal rows retained).
    foreignKey({
      name: 'fk_inventory_soft_holds__custom_request_id',
      columns: [t.customRequestId],
      foreignColumns: [customRequests.id],
    }).onDelete('restrict'),
    check(
      'ck_inventory_soft_holds__status_allowed',
      stateCheck(t.status, INVENTORY_SOFT_HOLD_STATES),
    ),
    // COL-TBL020-03 — magnitude is strictly positive.
    check('ck_inventory_soft_holds__quantity_positive', sql`${t.quantity} > 0`),
    // [R] on manual release — an automatic EXPIRED transition carries no
    // reason; a manual RELEASED one must be evidenced.
    check(
      'ck_inventory_soft_holds__released_reason_required',
      sql`${t.status} <> 'RELEASED' or ${t.releasedReason} is not null`,
    ),
    // IDX-113 / Q-03, Q-32 — active holds scoped to a stock row.
    index('ix_inventory_soft_holds__sku_stock_id')
      .on(t.skuStockId, t.id)
      .where(sql`${t.status} = 'HELD'`),
    // IDX-109 / QX-10 — expiry sweep over active holds only.
    index('ix_inventory_soft_holds__expires_at')
      .on(t.expiresAt, t.id)
      .where(sql`${t.status} = 'HELD'`),
  ],
);
