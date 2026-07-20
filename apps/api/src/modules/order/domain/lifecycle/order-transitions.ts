/**
 * The legal Order state transitions (LC-14, GRD-019).
 *
 * Same reasoning as the request lifecycle: `ck_orders__status_allowed`
 * constrains the *value*, nothing constrains the *move*. Declared once so the
 * guard has a single source.
 */
import type { OrderState } from '@embroidery/database';

/**
 * Allowed destinations per state, from `DB3_LIFECYCLE_SPECIFICATIONS.md` LC-14.
 *
 * `ON_HOLD` is reachable from every live state and returns to the one it came
 * from, so it lists the resumable states rather than a single successor
 * (ADR-DB3-003 r5). COMPLETED and CANCELLED are terminal.
 */
const ALLOWED: Readonly<Record<OrderState, readonly OrderState[]>> = {
  AWAITING_DEPOSIT: ['DEPOSIT_PAID', 'ON_HOLD', 'CANCELLING', 'CANCELLED'],
  DEPOSIT_PAID: ['IN_PRODUCTION', 'ON_HOLD', 'CANCELLING'],
  IN_PRODUCTION: ['PRODUCTION_COMPLETED', 'ON_HOLD', 'CANCELLING'],
  PRODUCTION_COMPLETED: ['AWAITING_FINAL_PAYMENT', 'ON_HOLD', 'CANCELLING'],
  AWAITING_FINAL_PAYMENT: ['READY_FOR_DELIVERY', 'ON_HOLD', 'CANCELLING'],
  READY_FOR_DELIVERY: ['DELIVERED', 'ON_HOLD', 'CANCELLING'],
  DELIVERED: ['COMPLETED'],
  COMPLETED: [],
  ON_HOLD: [
    'AWAITING_DEPOSIT',
    'DEPOSIT_PAID',
    'IN_PRODUCTION',
    'PRODUCTION_COMPLETED',
    'AWAITING_FINAL_PAYMENT',
    'READY_FOR_DELIVERY',
    'CANCELLING',
  ],
  CANCELLING: ['CANCELLED'],
  CANCELLED: [],
};

export function isLegalOrderTransition(from: OrderState, to: OrderState): boolean {
  return ALLOWED[from].includes(to);
}

/**
 * States from which an order may be dispatched.
 *
 * Dispatch is not a plain transition: GRD-016 requires the remaining payment
 * to be satisfied and GRD-017 requires shipping to be frozen, both checked in
 * the dispatching transaction.
 */
export const DISPATCHABLE_FROM: OrderState = 'READY_FOR_DELIVERY';
