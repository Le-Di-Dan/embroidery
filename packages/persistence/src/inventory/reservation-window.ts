/**
 * The reservation **window** — finding an order's live hold, and moving when it
 * lapses (`BR-025`, `APP12-B03` §17).
 *
 * A sibling of `reservation-terminalization.ts`, split from it for the reason
 * that file was split from `InventoryReservations` in the first place: those
 * functions all *end* a reservation — `RELEASED`, `EXPIRED`, `CONSUMED`, each
 * with its ledger entry and its on-hand rule. Nothing here ends anything. A
 * window move keeps the reservation exactly as it is and changes only when it
 * will lapse, and an order-scoped lookup answers a question rather than writing
 * at all. Putting a non-terminal write among the terminal ones would be the
 * one place a future edit could add an `EXPIRED` by copying its neighbour.
 *
 * Neither function writes an inventory ledger entry, and that is deliberate.
 * `G-DB7-29` requires an entry for every change to committed quantity; neither
 * of these changes one. The reserved quantity, the stock anchor and
 * availability are identical before and after. A ledger kind invented for a
 * deadline move would put a non-movement in the movement log.
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import { schema } from '@embroidery/database';
import type { Transaction } from '@embroidery/database';

import type { Reservation, ReservationId } from './sku-stock.repository';
import { reservationNotActive, toReservation } from './reservation-terminalization';

const { inventoryReservations } = schema;

/**
 * Locks every reservation an **order** holds and returns the active one.
 *
 * The order-wide sibling of `lockOrderReservation`, for the caller that has no
 * SKU in hand. Same locking rule and same reason: all of the order's rows are
 * locked in `id` order so two transactions reaching the same order queue in one
 * direction, and the status is read under those locks rather than before them.
 *
 * A Ready-Made order holds exactly one reservation (`APP12-P01` — one SKU per
 * checkout), so "the active one" is unambiguous for this caller. Scanning by
 * order rather than by (order, SKU) is deliberately the wider net: it locks the
 * terminal rows for that order too, which is what makes a rival expiry sweep
 * and a fee confirmation contend on the same rows instead of passing each other.
 *
 * `undefined` when nothing active stands — expired, released or consumed. The
 * caller decides what that means; it is never licence to create a replacement.
 *
 * @requiresTransaction
 */
export async function lockActiveReservationForOrder(
  tx: Transaction,
  orderId: string,
): Promise<Reservation | undefined> {
  const rows = await tx
    .select()
    .from(inventoryReservations)
    .where(eq(inventoryReservations.orderId, orderId))
    .orderBy(asc(inventoryReservations.id))
    .for('update');

  return rows.map(toReservation).find((row) => row.status === 'RESERVED');
}

/**
 * Moves a `RESERVED` reservation's `expires_at` to `now() + windowMs`.
 *
 * The instant is computed **in the statement**, so it is the database's own
 * clock — the same rule `IdempotencyAllocationStore` follows for a lease, and
 * for the same reason: the expiry sweep compares `expires_at` against `now()`,
 * so a deadline written from a drifted application clock would be enforced
 * against a clock that never agreed with it. The caller supplies the window
 * length, which is business policy, and never the resulting timestamp.
 *
 * The status predicate is in the `UPDATE` rather than in a prior read: the
 * caller already holds the row lock, and putting the condition in the statement
 * means a reservation that went terminal cannot be revived even if a future
 * caller reached here without one — which would hand back stock the sweep has
 * already returned to availability.
 *
 * @requiresTransaction — the caller must already hold this reservation's row
 * lock, taken by {@link lockActiveReservationForOrder}.
 */
export async function applyWindowReschedule(
  tx: Transaction,
  id: ReservationId,
  windowMs: number,
): Promise<Reservation> {
  const [row] = await tx
    .update(inventoryReservations)
    .set({
      expiresAt: sql`now() + make_interval(secs => ${windowMs / 1000}::double precision)`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(inventoryReservations.id, id), eq(inventoryReservations.status, 'RESERVED')))
    .returning();

  if (row === undefined) {
    throw reservationNotActive('rescheduleReservationExpiry');
  }
  return toReservation(row);
}
