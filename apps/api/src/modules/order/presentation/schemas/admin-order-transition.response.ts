/**
 * The published receipt of one Admin order lifecycle command (`APP9-B01` §3).
 *
 * A receipt of what the transaction committed, not a projection of the order:
 * the operator's next read is `GET /api/admin/orders/{orderId}`, which owns the
 * frozen lines, the chain the order was built from and the order total.
 * Repeating those here would publish the same facts from two places and let them
 * drift.
 *
 * What it carries is exactly what a caller cannot see from its own request:
 * which state the order moved **from**, where it now is, and the identity and
 * state of the `REMAINING` obligation the command required — the proof that the
 * guard was evaluated against a real row rather than assumed.
 *
 * ### What is deliberately absent
 *
 * **The remaining amount.** No `remainingAmount`, no currency, no
 * `total - deposit`. B01 opens the window; it does not publish a payable figure
 * (`APP9-G01` §5.1). The customer's authoritative view of the amount is
 * `APP9-B02`'s, and inventing a second Admin authority for it here would be the
 * duplication the checkpoint boundary exists to prevent.
 *
 * **A payable flag.** There is no `payable` boolean and no derived readiness
 * field: the order's LC-14 state *is* the window, and a flag beside it would be
 * a second answer to the same question.
 *
 * **Every payment internal.** No attempt, transfer reference, evidence,
 * reconciliation, bank value, provider key, QR payload, storage key, grant,
 * customer contact or operator identity.
 */
import { ApiProperty } from '@nestjs/swagger';
import type { OrderState, PaymentObligationState } from '@embroidery/database';

import { PUBLISHED_ORDER_STATES } from './admin-order-queue.response';

const ORDER_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6081';
const OBLIGATION_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6082';

/**
 * The obligation states a live `REMAINING` row can hold.
 *
 * The two `uq_payment_obligations__order_kind__live` treats as live, because
 * those are the only two `findLiveForOrder` can return. `SUPERSEDED` and
 * `CANCELLED` are absent: a command that accepted one of those would have opened
 * final payment against an obligation the order has replaced or withdrawn.
 */
export const PUBLISHED_REMAINING_OBLIGATION_STATES = [
  'PENDING',
  'SATISFIED',
] as const satisfies readonly PaymentObligationState[];

export class AdminOrderTransitionResultResponse {
  @ApiProperty({ format: 'uuid', example: ORDER_ID_EXAMPLE })
  orderId!: string;

  @ApiProperty({
    example: 'ORD-2K4M8P1QZT',
    description: 'The order code, as frozen at creation.',
  })
  code!: string;

  @ApiProperty({
    enum: PUBLISHED_ORDER_STATES,
    example: 'PRODUCTION_COMPLETED',
    description: 'The LC-14 state the order held when the transaction began.',
  })
  fromStatus!: OrderState;

  @ApiProperty({
    enum: PUBLISHED_ORDER_STATES,
    example: 'AWAITING_FINAL_PAYMENT',
    description: 'The LC-14 state the order now holds.',
  })
  status!: OrderState;

  @ApiProperty({
    format: 'uuid',
    example: OBLIGATION_ID_EXAMPLE,
    description:
      'The live REMAINING obligation this command required. It was created with the order and ' +
      'is neither created, recalculated nor satisfied here — the order’s new state is what ' +
      'makes it payable.',
  })
  remainingObligationId!: string;

  @ApiProperty({
    enum: PUBLISHED_REMAINING_OBLIGATION_STATES,
    example: 'PENDING',
    description: 'The obligation’s own LC-15 state, unchanged by this command.',
  })
  remainingObligationStatus!: PaymentObligationState;
}

export interface AdminOrderTransitionResultPayload {
  readonly orderId: string;
  readonly code: string;
  readonly fromStatus: OrderState;
  readonly status: OrderState;
  readonly remainingObligationId: string;
  readonly remainingObligationStatus: PaymentObligationState;
}
