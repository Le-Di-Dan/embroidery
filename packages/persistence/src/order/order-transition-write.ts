/**
 * The one `orders` lifecycle write (LC-14, GRD-019), shared by both origins.
 *
 * Split out of `DrizzleOrderRepository` by `APP12-B02` for the same reason
 * `reservation-terminalization.ts` was split out of `InventoryReservations`:
 * the move gained a **second caller that maps the result differently**.
 *
 * `OrderRepository.transition` returns an {@link Order} — the custom aggregate,
 * whose request, quotation and approval fields are required because a `CUSTOM`
 * row genuinely has all three. A `READY_MADE` row has none of them, so
 * `toOrder` refuses it (`order-row.mapper.ts`), and a Ready-Made cancellation
 * routed through that method would perform the write correctly and then throw
 * while shaping the answer — a committed transition reported as a failure.
 *
 * The fix is not a second transition implementation. Legality, the mandatory
 * reason, the reason/timestamp columns and the `order_transitions` evidence row
 * are one rule for both lifecycles: `isLegalOrderTransition` never was
 * origin-aware, and it does not need to be, because
 * `ck_orders__origin_status_allowed` is the physical arbiter of which states
 * each origin may hold. So the write lives here once and returns the **row**,
 * and each repository maps that row onto its own aggregate.
 *
 * Every function here requires the caller's transaction: the `FOR UPDATE` read,
 * the legality decision and the write are one atomic act only if they share it.
 */
import { guardViolationError, notFoundError, schema } from '@embroidery/database';
import type { OrderState, Transaction } from '@embroidery/database';
import { eq } from 'drizzle-orm';

import { actorColumns } from './order-transition-actor';
import { isLegalOrderTransition } from './order-transitions';
import type { TransitionOrderInput } from './order.repository';
import type { OrderRow } from './order-row.mapper';

const { orders, orderTransitions } = schema;

/**
 * Moves one order and appends the evidence row that explains the move.
 *
 * @requiresTransaction
 */
export async function applyOrderTransition(
  tx: Transaction,
  input: TransitionOrderInput,
): Promise<OrderRow> {
  const [current] = await tx
    .select()
    .from(orders)
    .where(eq(orders.id, input.id))
    .limit(1)
    .for('update');

  if (current === undefined) {
    throw notFoundError('OrderRepository.transition', 'That order does not exist.');
  }

  const from = current.status as OrderState;
  if (!isLegalOrderTransition(from, input.to)) {
    throw guardViolationError(
      'OrderRepository.transition',
      'INVALID_TRANSITION',
      'That status change is not allowed for this order.',
    );
  }

  // `ck_orders__cancelled_reason_required` and `ck_orders__hold_reason_required`
  // make a reason mandatory for these two moves. Checked here so the caller is
  // told what is missing rather than getting a generic constraint failure — an
  // order cancelled or held with no recorded reason is a customer conversation
  // with no evidence behind it. The blank case is the application's: the CHECKs
  // test NOT NULL.
  const reasonRequired = input.to === 'CANCELLED' || input.to === 'ON_HOLD';
  if (reasonRequired && (input.reason ?? '').trim() === '') {
    throw guardViolationError(
      'OrderRepository.transition',
      'TRANSITION_REASON_REQUIRED',
      'A reason is required for that status change.',
    );
  }

  const now = new Date();
  const [row] = await tx
    .update(orders)
    .set({
      status: input.to,
      cancelledReason: input.to === 'CANCELLED' ? (input.reason ?? null) : current.cancelledReason,
      // Cleared when the order resumes, so the column cannot describe a hold
      // that has already been lifted.
      holdReason: input.to === 'ON_HOLD' ? (input.reason ?? null) : null,
      // Stamped with the move that causes them, so the columns cannot claim a
      // delivery or completion that no transition explains.
      deliveredAt: input.to === 'DELIVERED' ? now : current.deliveredAt,
      completedAt: input.to === 'COMPLETED' ? now : current.completedAt,
      updatedAt: now,
    })
    .where(eq(orders.id, input.id))
    .returning();

  await tx.insert(orderTransitions).values({
    orderId: input.id,
    fromStatus: from,
    toStatus: input.to,
    eventKind: input.eventKind ?? 'STATE_CHANGE',
    ...actorColumns(input.actor),
    reason: input.reason ?? null,
    correlationId: input.correlationId,
  });

  if (row === undefined) {
    throw notFoundError('OrderRepository.transition', 'That order does not exist.');
  }
  return row;
}
