/**
 * TBL-021 `inventory_reservations` — one official reservation of quantity
 * for an order (CTX-INV, AGG-07, `entity`, mutable).
 *
 * Columns: COL-TBL021-01..07 · Constraints: CST-001, CST-016 (IDX-018,
 * one active reservation per order/stock line, INV-19-class), CST-062
 * instance (quantity > 0)
 * Relationships: REL-031 ×2 (→ sku_stocks, → orders, restrict — INV-05,
 * GRD-013 gate is TX)
 * Indexes: IDX-018 (constraint-created), IDX-110 (P0 required — expiry
 * sweep), IDX-114 (P0 required — active-per-stock lock lookup); IDX-126
 * (recommended) → S25
 * Owner: Inventory module.
 *
 * **Not a Soft Hold.** An Official Reservation is created only after
 * GRD-013's gate (approval exists + Deposit obligation SATISFIED, CST-111,
 * TX-owned) — this table carries no `deposit_paid`/payment-state column;
 * that gate lives entirely in the Payment module's own tables and the
 * reservation-creation transaction, never here. `expires_at` may be NULL
 * (official reservations can be no-expiry per policy, ADR-DB1-018 r3) —
 * unlike `inventory_soft_holds.expires_at`, which is mandatory.
 *
 * `sku_stocks` remains the sole authoritative counter and lock anchor
 * (`SELECT … FOR UPDATE`); no `available`/`reserved` column exists here or
 * on `sku_stocks` — availability is computed transactionally from active
 * holds and reservations, never stored.
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
import { orders } from '../ordering/orders';

/** LC-17 (reservation side). Canonical source — see DB5-A09. */
export const INVENTORY_RESERVATION_STATES = [
  'RESERVED',
  'CONSUMED',
  'RELEASED',
  'EXPIRED',
] as const;
export type InventoryReservationState = (typeof INVENTORY_RESERVATION_STATES)[number];

export const inventoryReservations = pgTable(
  'inventory_reservations',
  {
    id: idColumn().notNull(),
    skuStockId: idReference('sku_stock_id').notNull(),
    orderId: idReference('order_id').notNull(),
    quantity: integer('quantity').notNull(),
    status: stateColumn().notNull(),
    expiresAt: instant('expires_at'),
    releasedReason: text('released_reason'),
    terminalizedAt: instant('terminalized_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_inventory_reservations', columns: [t.id] }),
    // CST-016 / IDX-018 — one active reservation per (order, stock) line.
    uniqueIndex('uq_inventory_reservations__order_stock__reserved')
      .on(t.orderId, t.skuStockId)
      .where(sql`${t.status} = 'RESERVED'`),
    // REL-031 — the lock anchor a reservation is placed against.
    foreignKey({
      name: 'fk_inventory_reservations__sku_stock_id',
      columns: [t.skuStockId],
      foreignColumns: [skuStocks.id],
    }).onDelete('restrict'),
    // REL-031 — the order this reservation fulfills (INV-05, GRD-013 gate).
    foreignKey({
      name: 'fk_inventory_reservations__order_id',
      columns: [t.orderId],
      foreignColumns: [orders.id],
    }).onDelete('restrict'),
    check(
      'ck_inventory_reservations__status_allowed',
      stateCheck(t.status, INVENTORY_RESERVATION_STATES),
    ),
    // COL-TBL021-03 — magnitude is strictly positive.
    check('ck_inventory_reservations__quantity_positive', sql`${t.quantity} > 0`),
    // [R] on manual release — an automatic EXPIRED transition carries no reason.
    check(
      'ck_inventory_reservations__released_reason_required',
      sql`${t.status} <> 'RELEASED' or ${t.releasedReason} is not null`,
    ),
    // IDX-114 / CC-20..24 — active reservation lookup scoped to a stock row.
    index('ix_inventory_reservations__stock_id__reserved')
      .on(t.skuStockId, t.id)
      .where(sql`${t.status} = 'RESERVED'`),
    // IDX-110 / QX-10 — expiry sweep over active, expiring reservations only.
    index('ix_inventory_reservations__expires_id__reserved')
      .on(t.expiresAt, t.id)
      .where(sql`${t.status} = 'RESERVED' and ${t.expiresAt} is not null`),
  ],
);
