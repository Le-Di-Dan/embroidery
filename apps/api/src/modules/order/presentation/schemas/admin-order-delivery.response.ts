/**
 * The published receipts of the two Admin delivery commands (`APP9-B05` §5,
 * §11).
 *
 * Receipts of what each transaction committed, not projections of the order:
 * the operator's next read is `GET /api/admin/orders/{orderId}` for the order
 * and `GET /api/admin/orders/{orderId}/shipping-detail` for the address and fee.
 * Repeating those facts here would publish the same truth from two places and
 * let them drift.
 *
 * ### What the dispatch receipt deliberately does not carry
 *
 * **The shipping PII.** No recipient name, phone, address, ward, district or
 * province, and no fee. The caller just froze them and can read them back from
 * the delivered Admin shipping route; echoing a customer's address into a second
 * response is a copy of `[PII]` (CON-079/080) that nothing needs.
 *
 * **The snapshot's identity.** `shipping_snapshots` has one row per order
 * (`uq_shipping_snapshots__order`) and no route addresses it, so publishing an
 * id would name a resource the API does not serve.
 *
 * **Anything a carrier would send.** No carrier status, no parcel event, no
 * delivery confirmation and no tracking lifecycle: `LIVE_CARRIER_TRACKING` is
 * out of scope, and a field for it would be a contract promise nothing keeps.
 *
 * What each does carry is exactly what a caller cannot see from its own request:
 * which state the order moved **from**, where it now is, and — for the dispatch
 * — the committed freeze the guard produced.
 */
import { ApiProperty } from '@nestjs/swagger';
import type { OrderState, ShippingDetailState } from '@embroidery/database';

import { PUBLISHED_ORDER_STATES } from './admin-order-queue.response';

const ORDER_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6081';
const INSTANT_EXAMPLE = '2026-03-04T09:15:00.000Z';

/**
 * The shipping-detail states a dispatch receipt can report.
 *
 * One member. A committed dispatch leaves the detail `FROZEN`, and `EDITABLE`
 * appearing on this receipt would mean the freeze and the lifecycle move had
 * come apart — which the single dispatch transaction makes impossible.
 */
export const PUBLISHED_DISPATCHED_SHIPPING_STATES = [
  'FROZEN',
] as const satisfies readonly ShippingDetailState[];

export class AdminOrderDispatchResponse {
  @ApiProperty({ format: 'uuid', example: ORDER_ID_EXAMPLE })
  orderId!: string;

  @ApiProperty({
    example: 'ORD-2K4M8P1QZT',
    description: 'The order code, as frozen at creation.',
  })
  code!: string;

  @ApiProperty({
    enum: PUBLISHED_ORDER_STATES,
    example: 'READY_FOR_DELIVERY',
    description: 'The LC-14 state the order held when the transaction began.',
  })
  fromStatus!: OrderState;

  @ApiProperty({
    enum: PUBLISHED_ORDER_STATES,
    example: 'DELIVERED',
    description: 'The LC-14 state the order now holds.',
  })
  status!: OrderState;

  @ApiProperty({
    format: 'date-time',
    example: INSTANT_EXAMPLE,
    description:
      'The canonical dispatch instant. The same value stamps the shipping snapshot and the ' +
      'order’s delivered timestamp, so the three cannot disagree.',
  })
  dispatchedAt!: string;

  @ApiProperty({
    enum: PUBLISHED_DISPATCHED_SHIPPING_STATES,
    example: 'FROZEN',
    description:
      'The shipping detail’s LC-19 state, read back from the committed row rather than assumed.',
  })
  shippingStatus!: ShippingDetailState;

  @ApiProperty({
    format: 'date-time',
    example: INSTANT_EXAMPLE,
    description: 'When the shipping detail became immutable (GRD-017).',
  })
  frozenAt!: string;
}

export class AdminOrderCompletionResponse {
  @ApiProperty({ format: 'uuid', example: ORDER_ID_EXAMPLE })
  orderId!: string;

  @ApiProperty({
    example: 'ORD-2K4M8P1QZT',
    description: 'The order code, as frozen at creation.',
  })
  code!: string;

  @ApiProperty({
    enum: PUBLISHED_ORDER_STATES,
    example: 'DELIVERED',
    description: 'The LC-14 state the order held when the transaction began.',
  })
  fromStatus!: OrderState;

  @ApiProperty({
    enum: PUBLISHED_ORDER_STATES,
    example: 'COMPLETED',
    description: 'The LC-14 state the order now holds — terminal.',
  })
  status!: OrderState;
}

export interface AdminOrderDispatchPayload {
  readonly orderId: string;
  readonly code: string;
  readonly fromStatus: OrderState;
  readonly status: OrderState;
  readonly dispatchedAt: string;
  readonly shippingStatus: ShippingDetailState;
  readonly frozenAt: string;
}

export interface AdminOrderCompletionPayload {
  readonly orderId: string;
  readonly code: string;
  readonly fromStatus: OrderState;
  readonly status: OrderState;
}
