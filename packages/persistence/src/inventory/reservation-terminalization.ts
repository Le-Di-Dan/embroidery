/**
 * The reservation terminalization primitives — one implementation of the
 * `RESERVED → RELEASED` and `RESERVED → CONSUMED` writes (`APP8-B02` CC-21,
 * `APP8-B04` §9, §10, §13.2).
 *
 * Split out of {@link InventoryReservations} when `APP8-B04` gave every terminal
 * move a **second** way in. Until then a caller named the reservation by its own
 * id, because `APP8-W01` had just created it and held the id. A production
 * start does not: it derives *"this order needs 25 of that SKU"* from the frozen
 * order items and must find the reservation standing for that requirement. Two
 * entry points, one write — or the (order, SKU) path would be a second copy of
 * the on-hand decrement and the ledger append, free to disagree with the one
 * `APP8-B02` repaired.
 *
 * ### The lock is taken before the status is read — in both entry points
 *
 * That is the whole of DB3 `CC-21`. `DB3_CONCURRENCY_SPECIFICATION.md` names the
 * arbiter as *"reservation row LOCK + idempotent transitions"*: a release and a
 * goods issue that each read `RESERVED` through an unlocked select would both
 * proceed, leaving a `RESERVATION_RELEASED` ledger row **and** a `CONSUMED` one
 * plus an on-hand decrement for stock that was also released. Locking
 * `sku_stocks` inside the consume path does not save it — that lock comes after
 * the status read, and the release path never reaches the anchor at all.
 *
 * So every function here that decides a terminal state takes
 * `inventory_reservations … FOR UPDATE` **first** and reads the status under
 * that lock. The second caller blocks, and on waking reads the winner's
 * committed terminal status.
 *
 * ### Lock order: reservation row, then `sku_stocks` anchor
 *
 * Unchanged from `APP8-B02`. No delivered path locks the anchor and then an
 * *existing* reservation row — `createReservation` and `convertHold` lock the
 * anchor and then *insert*, and a row nobody can name yet cannot be waited on —
 * so there is no cycle, and the proven `orders` → `sku_stocks` direction
 * (`DB8_LOCK_ORDER_MATRIX.md`) is untouched. Isolation stays `READ COMMITTED`
 * with explicit locks (DEC-DB7-006).
 *
 * Every function here **requires the caller's transaction**: the lock, the
 * decision and the write are only one atomic act if they share it.
 */
import { guardViolationError, notFoundError, schema } from '@embroidery/database';
import type { Transaction } from '@embroidery/database';
import { and, asc, eq } from 'drizzle-orm';

import type { InventoryReservationState } from '@embroidery/database';

import type {
  InventoryActor,
  Reservation,
  ReservationId,
  SkuStockId,
} from './sku-stock.repository';
import { actorColumns } from './inventory-commitments';

const { skuStocks, inventoryLedgerEntries, inventoryReservations } = schema;

type ReservationRow = typeof inventoryReservations.$inferSelect;

export function toReservation(row: ReservationRow): Reservation {
  return {
    id: row.id as ReservationId,
    skuStockId: row.skuStockId as SkuStockId,
    orderId: row.orderId,
    quantity: row.quantity,
    status: row.status as InventoryReservationState,
  };
}

/** The delivered refusal for a reservation that is no longer `RESERVED`. */
export function reservationNotActive(operation: string): Error {
  return guardViolationError(
    `SkuStockRepository.${operation}`,
    'RESERVATION_NOT_ACTIVE',
    'That reservation is no longer active.',
  );
}

/**
 * Locks one reservation by id and returns it only if it is still `RESERVED`.
 *
 * @requiresTransaction
 */
export async function lockReservedReservationById(
  tx: Transaction,
  id: ReservationId,
  operation: string,
): Promise<Reservation> {
  const [row] = await tx
    .select()
    .from(inventoryReservations)
    .where(eq(inventoryReservations.id, id))
    .limit(1)
    .for('update');

  if (row === undefined) {
    throw notFoundError(`SkuStockRepository.${operation}`, 'That reservation does not exist.');
  }

  const reservation = toReservation(row);
  if (reservation.status !== 'RESERVED') {
    throw reservationNotActive(operation);
  }
  return reservation;
}

/**
 * Locks every reservation an order holds against one stock anchor and returns
 * the active one, if there is one.
 *
 * `CST-016` / `uq_inventory_reservations__order_stock__reserved` permits **one**
 * `RESERVED` row per `(order_id, sku_stock_id)`; terminal rows for the same pair
 * may accumulate beside it. All of them are locked, in `id` order, so two
 * transactions reaching the same pair queue in the same direction rather than
 * each taking one row the other wants. The status is then read under those
 * locks, never before them.
 *
 * Returning `undefined` rather than throwing is deliberate: the caller decides
 * what an absent active reservation means. For a production **start** it is a
 * refusal (`APP8-B04` §10); for a production-job **cancellation** it is the
 * ordinary case of an already-consumed or never-reserved portion, and
 * fabricating a release for it is exactly what §13.2 forbids.
 *
 * @requiresTransaction
 */
export async function lockOrderReservation(
  tx: Transaction,
  orderId: string,
  skuStockId: SkuStockId,
): Promise<Reservation | undefined> {
  const rows = await tx
    .select()
    .from(inventoryReservations)
    .where(
      and(
        eq(inventoryReservations.orderId, orderId),
        eq(inventoryReservations.skuStockId, skuStockId),
      ),
    )
    .orderBy(asc(inventoryReservations.id))
    .for('update');

  return rows.map(toReservation).find((row) => row.status === 'RESERVED');
}

/**
 * Writes `RESERVED → RELEASED` and its ledger entry, under the caller's lock.
 *
 * No on-hand movement: a release gives the committed quantity back to
 * availability, and the goods never left (`TR-LC17-06`).
 *
 * @requiresTransaction — the caller must already hold this reservation's row lock.
 */
export async function applyRelease(
  tx: Transaction,
  reservation: Reservation,
  reason: string,
  actor: InventoryActor,
): Promise<void> {
  const now = new Date();
  await tx
    .update(inventoryReservations)
    .set({
      status: 'RELEASED',
      releasedReason: reason,
      terminalizedAt: now,
      updatedAt: now,
    })
    .where(eq(inventoryReservations.id, reservation.id));

  await tx.insert(inventoryLedgerEntries).values({
    skuStockId: reservation.skuStockId,
    entryKind: 'RESERVATION_RELEASED',
    quantity: reservation.quantity,
    onHandDelta: 0,
    reservationId: reservation.id,
    reason,
    ...actorColumns(actor),
  });
}

/**
 * Writes `RESERVED → CONSUMED`, decrements on-hand and appends the ledger entry.
 *
 * Consumption is the only path that reduces on-hand: the goods have physically
 * left. The anchor is locked here, **after** the reservation row the caller
 * already holds.
 *
 * @requiresTransaction — the caller must already hold this reservation's row lock.
 */
export async function applyConsume(
  tx: Transaction,
  reservation: Reservation,
  actor: InventoryActor,
  operation: string,
): Promise<void> {
  const [stock] = await tx
    .select()
    .from(skuStocks)
    .where(eq(skuStocks.id, reservation.skuStockId))
    .limit(1)
    .for('update');

  if (stock === undefined) {
    throw notFoundError(`SkuStockRepository.${operation}`, 'That stock record does not exist.');
  }

  const now = new Date();
  await tx
    .update(inventoryReservations)
    .set({ status: 'CONSUMED', terminalizedAt: now, updatedAt: now })
    .where(eq(inventoryReservations.id, reservation.id));

  await tx
    .update(skuStocks)
    .set({ quantityOnHand: stock.quantityOnHand - reservation.quantity, updatedAt: now })
    .where(eq(skuStocks.id, stock.id));

  await tx.insert(inventoryLedgerEntries).values({
    skuStockId: stock.id,
    entryKind: 'CONSUMED',
    quantity: reservation.quantity,
    onHandDelta: -reservation.quantity,
    reservationId: reservation.id,
    orderId: reservation.orderId,
    ...actorColumns(actor),
  });
}
