/**
 * TBL-019 `inventory_ledger_entries` — one stock movement with reason and
 * actor: the source of truth for inventory history (CTX-INV, AGG-07).
 *
 * Columns: COL-TBL019-01..09 (-09 ×3 → 11 business columns)
 * Constraints: CST-001, CST-062 (quantity > 0), CST-071 (ADJUSTMENT → reason),
 * entry-kind closed set, CST-098 (**append-only trigger target, S24**)
 * Relationships: REL-027 (→ sku_stocks) · REL-028 ×3 (→ soft_holds,
 * → reservations, → orders — **all three implemented now**: `soft_holds`
 * landed in G10, `inventory_reservations`/`orders` land in this group,
 * DEV-DB6-011)
 * Indexes: IDX-115 — the table's **only** non-PK index; the ledger is
 * append-heavy and DB5 caps it deliberately
 * Owner: Inventory module.
 *
 * **Append-only** (CST-098): no `updated_at`, rows are never edited or
 * deleted. Until the S24 trigger lands, that is an application/privilege
 * expectation, not yet a database mechanism — DB7's reject-mutation test
 * stays open until then. A correction is a new ADJUSTMENT entry, never an
 * edit.
 *
 * `quantity` (CST-062, > 0) is the magnitude; direction is implied by
 * `entry_kind`. `on_hand_delta` is the signed effect on
 * `sku_stocks.quantity_on_hand` — 0 for pure hold moves — so replaying
 * Σ(on_hand_delta) rebuilds the counter (the invariant DB8 checks under
 * GRD-014's row lock).
 *
 * Actor evidence (`actor_kind`/`admin_id`/`system_job_key`) is exactly that —
 * evidence. DB4 models no REL row for it, so no FK exists; consistency
 * between kind and the populated reference is app-owned (the CST-072-style
 * trigger belongs to audit_events only). No PII, no provider payload, no
 * JSONB is carried here — every core fact is a relational column.
 */
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

import { sequenceColumn, idReference } from '../../primitives/identifiers';
import { createdAt } from '../../primitives/temporal';
import { stateCheck } from '../../primitives/lifecycle-state';
import { skuStocks } from './sku-stocks';
import { inventorySoftHolds } from './inventory-soft-holds';
import { inventoryReservations } from './inventory-reservations';
import { orders } from '../ordering/orders';

/** COL-TBL019-02 closed movement-kind set (DB4). A type, not a lifecycle. */
export const INVENTORY_ENTRY_KINDS = [
  'ADJUSTMENT',
  'HOLD_PLACED',
  'HOLD_RELEASED',
  'HOLD_EXPIRED',
  'HOLD_CONVERTED',
  'RESERVED',
  'RESERVATION_RELEASED',
  'RESERVATION_EXPIRED',
  'CONSUMED',
] as const;
export type InventoryEntryKind = (typeof INVENTORY_ENTRY_KINDS)[number];

export const inventoryLedgerEntries = pgTable(
  'inventory_ledger_entries',
  {
    id: sequenceColumn(),
    skuStockId: idReference('sku_stock_id').notNull(),
    entryKind: text('entry_kind').notNull(),
    quantity: integer('quantity').notNull(),
    onHandDelta: integer('on_hand_delta').notNull(),
    softHoldId: idReference('soft_hold_id'),
    reservationId: idReference('reservation_id'),
    orderId: idReference('order_id'),
    reason: text('reason'),
    actorKind: text('actor_kind').notNull(),
    adminId: idReference('admin_id'),
    systemJobKey: text('system_job_key'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_inventory_ledger_entries', columns: [t.id] }),
    // REL-027 — history is composed under its stock row; restrict keeps the
    // rebuild source intact for as long as the stock row exists.
    foreignKey({
      name: 'fk_inventory_ledger_entries__sku_stock_id',
      columns: [t.skuStockId],
      foreignColumns: [skuStocks.id],
    }).onDelete('restrict'),
    // REL-028 — resolved (G10): soft_hold_id target table now exists.
    foreignKey({
      name: 'fk_inventory_ledger_entries__soft_hold_id',
      columns: [t.softHoldId],
      foreignColumns: [inventorySoftHolds.id],
    }).onDelete('restrict'),
    // REL-028 — resolved (G15, DEV-DB6-011): both target tables now exist.
    foreignKey({
      name: 'fk_inventory_ledger_entries__reservation_id',
      columns: [t.reservationId],
      foreignColumns: [inventoryReservations.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_inventory_ledger_entries__order_id',
      columns: [t.orderId],
      foreignColumns: [orders.id],
    }).onDelete('restrict'),
    check(
      'ck_inventory_ledger_entries__entry_kind_allowed',
      stateCheck(t.entryKind, INVENTORY_ENTRY_KINDS),
    ),
    // `actor_kind` carries no dictionary `(CK)` marker — DB4 leaves the actor
    // value set app-owned, so no CHECK is invented for it here.
    // CST-062 — magnitude is strictly positive; direction lives in the kind.
    check('ck_inventory_ledger_entries__quantity_positive', sql`${t.quantity} > 0`),
    // CST-071 / GRD-023 — a manual override without a reason is not evidence.
    check(
      'ck_inventory_ledger_entries__adjustment_has_reason',
      sql`${t.entryKind} <> 'ADJUSTMENT' or ${t.reason} is not null`,
    ),
    // IDX-115 — ledger replay per stock row; the only non-PK index by design.
    index('ix_inventory_ledger_entries__stock_id').on(t.skuStockId, t.id),
  ],
);
