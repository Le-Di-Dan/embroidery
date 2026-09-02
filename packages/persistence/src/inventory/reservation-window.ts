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
 * The same active reservation, **read without a lock** (`APP12-B04` §36).
 *
 * A separate function rather than a flag on
 * {@link lockActiveReservationForOrder}, because the two answer different
 * questions. That one is the opening move of a transaction that is about to
 * decide something about the stock, and its `FOR UPDATE` is what makes the fee
 * write and the expiry sweep contend rather than interleave. This one serves a
 * zero-write customer projection that needs the payment deadline to display,
 * and taking row locks on a public read would let an anonymous caller queue a
 * fee confirmation behind it.
 *
 * The predicate is otherwise identical, including `RESERVED`: a reservation
 * that has expired, been released or been consumed is not a live deadline, and
 * returning its stale `expires_at` would put a countdown on a screen for stock
 * the shop no longer holds.
 *
 * Snapshot semantics, deliberately: the answer is true as of the read and
 * nothing acts on it. A caller that must *decide* uses the locking sibling.
 */
export async function readActiveReservationForOrder(
  db: Pick<Transaction, 'select'>,
  orderId: string,
): Promise<Reservation | undefined> {
  const rows = await db
    .select()
    .from(inventoryReservations)
    .where(
      and(eq(inventoryReservations.orderId, orderId), eq(inventoryReservations.status, 'RESERVED')),
    )
    .orderBy(asc(inventoryReservations.id))
    .limit(1);

  return rows.length === 0 ? undefined : toReservation(rows[0]!);
}

/**
 * Whether this order's stock hold ended because its window lapsed
 * (`APP12-B04-C1`).
 *
 * ```text
 * true  ⇔  the order holds at least one reservation
 *          ∧ every reservation it holds is EXPIRED
 * ```
 *
 * ### Why "every", and not "the latest one"
 *
 * `uq_inventory_reservations__order_stock__reserved` is **partial** — it
 * constrains `RESERVED` rows only — so although `APP12-B02` writes exactly one
 * reservation per Ready-Made order and nothing re-reserves, a second terminal
 * row is not forbidden by the schema. A "most recent row wins" rule would
 * therefore be a guess, and a guess about why a customer's order ended is the
 * one thing this function exists to avoid.
 *
 * The universal form needs no cardinality assumption and fails **closed** in
 * every ambiguous case:
 *
 * ```text
 * one EXPIRED                     -> true   the sweep ran
 * one RELEASED, one EXPIRED       -> false  the hold also ended another way
 * one CONSUMED                    -> false  the stock was shipped, not lapsed
 * one RESERVED                    -> false  the hold is still live
 * none at all                     -> false  there is nothing to have expired
 * ```
 *
 * ### It answers about the stock, not about the order
 *
 * Deliberately: `inventory_reservations` is Inventory's aggregate and what
 * `EXPIRED` means is Inventory's to say. Whether that fact makes a *customer*
 * order "expired" rather than "cancelled" is Ordering's decision, taken by the
 * caller against the order's own status.
 *
 * Counted in the database rather than materialised and filtered in JavaScript:
 * the answer is two integers, and a row array would put reservation ids in the
 * memory of a public read that must never publish one.
 *
 * Read-only and lock-free, on the same terms as
 * {@link readActiveReservationForOrder}.
 */
export async function readOrderStockEndedByExpiry(
  db: Pick<Transaction, 'select'>,
  orderId: string,
): Promise<boolean> {
  const rows = await db
    .select({
      total: sql<string>`count(*)`,
      expired: sql<string>`count(*) filter (where ${inventoryReservations.status} = 'EXPIRED')`,
    })
    .from(inventoryReservations)
    .where(eq(inventoryReservations.orderId, orderId));

  const row = rows[0];
  if (row === undefined) {
    return false;
  }
  // `count(*)` arrives as a string from `bigint`; compared as strings after an
  // explicit equality on the total, so no parse and no precision question.
  return row.total !== '0' && row.total === row.expired;
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
