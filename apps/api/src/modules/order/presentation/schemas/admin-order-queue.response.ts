/**
 * The Admin order queue row (`APP7-B02` §5, §13).
 *
 * These classes exist for OpenAPI: the generated client's types come from them.
 * The runtime view lives beside the query that builds it, so a property cannot
 * be added to one and forgotten in the other.
 *
 * ### What a queue row does not carry, and why
 *
 * **No line items.** A queue row says which order needs attention, not what is
 * in it. The lines are the detail read's, opened deliberately for one order.
 *
 * **No payment fact.** No attempt, obligation, transfer reference, expected
 * amount, evidence marker, reconciliation state or provider field. `APP7-B04`
 * owns Admin payment operations and B02 may not pre-empt a shape it has not
 * defined. The order's own `status` is here because it is order state.
 *
 * **No live Catalog or customer data.** No product name, variant, SKU, size or
 * current price, and no customer display name, email or phone — masked or
 * otherwise. The row names the customer by id, which is what an Admin screen
 * navigates with.
 *
 * **No inventory or production fact.** APP8 owns those.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { OrderOrigin, OrderState } from '@embroidery/database';

import { ORDER_ORIGIN_FILTERS, ORDER_STATUS_FILTERS } from './admin-order.request';

const ORDER_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6081';
const REQUEST_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const CUSTOMER_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';

/**
 * The published order-status vocabulary.
 *
 * The same states the filter accepts, published from one tuple so the two can
 * never disagree about what an order status is. `APP12-A02-C1` widened it from
 * the eleven custom states to all thirteen; the tuple and its exhaustiveness
 * proof live in `admin-order.request.ts`.
 */
export const PUBLISHED_ORDER_STATES = ORDER_STATUS_FILTERS;

/** The published origin vocabulary, from the same single tuple as the filter. */
export const PUBLISHED_ORDER_ORIGINS = ORDER_ORIGIN_FILTERS;

/**
 * Compile-time proof the published list omits no order state.
 *
 * Taken against `OrderState`, the whole `orders.status` column vocabulary,
 * since `APP12-B02` made Ready-Made orders real and `APP12-A02-C1` published
 * the queue that has to triage them.
 */
export type PublishedOrderStatesAreComplete =
  Exclude<OrderState, (typeof PUBLISHED_ORDER_STATES)[number]> extends never ? true : never;

export class AdminOrderQueueItemResponse {
  @ApiProperty({ format: 'uuid', example: ORDER_ID_EXAMPLE })
  orderId!: string;

  @ApiProperty({
    example: 'ORD-7K3MPQ2XVD',
    description: 'The human order code. Display and search only — it never authorizes anything.',
  })
  code!: string;

  @ApiProperty({
    enum: PUBLISHED_ORDER_STATES,
    example: 'AWAITING_DEPOSIT',
    description: 'The current LC-14 state, reported as stored.',
  })
  status!: OrderState;

  @ApiProperty({
    enum: PUBLISHED_ORDER_ORIGINS,
    example: 'CUSTOM',
    description:
      'How this order came into being (`COL-TBL043-12`), read from the immutable `origin` ' +
      'column. It is the **only** legitimate discriminator between the two order shapes: a ' +
      'consumer must not infer it from the status, from a missing `customRequestId` or from ' +
      'which payment obligation the order carries.',
  })
  origin!: OrderOrigin;

  @ApiPropertyOptional({
    format: 'uuid',
    example: REQUEST_ID_EXAMPLE,
    description:
      'The custom request this order was created from. One order per request ' +
      '(`uq_orders__request`), so this is also how the Admin screen navigates back. Present ' +
      'exactly when `origin` is `CUSTOM` — `ck_orders__custom_chain_by_origin` nulls it on a ' +
      '`READY_MADE` order, which was never designed and has no request behind it.',
  })
  customRequestId?: string;

  @ApiProperty({ format: 'uuid', example: CUSTOMER_ID_EXAMPLE })
  customerId!: string;

  @ApiProperty({
    example: '2550000.00',
    description:
      'The order total as frozen at creation, transported exactly as `numeric(14,2)` stores it. ' +
      'Never re-summed from the lines and never re-derived from a current price.',
  })
  totalAmount!: string;

  @ApiProperty({ example: 'VND', description: 'The frozen currency of `totalAmount`.' })
  currencyCode!: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-08-20T09:00:00.000Z',
    description: 'When the order was created from the approved design.',
  })
  createdAt!: string;
}

export class AdminOrderQueueResponse {
  @ApiProperty({ type: [AdminOrderQueueItemResponse] })
  items!: AdminOrderQueueItemResponse[];

  @ApiPropertyOptional({
    description: 'Opaque keyset cursor for the next page. Absent on the last page.',
  })
  nextCursor?: string;

  @ApiProperty({ description: 'True when a further page exists.' })
  hasNext!: boolean;
}

/** The serialized projection. The only place these instants become strings. */
export interface AdminOrderQueueViewPayload {
  readonly items: readonly {
    readonly orderId: string;
    readonly code: string;
    readonly status: OrderState;
    readonly origin: OrderOrigin;
    readonly customRequestId: string | undefined;
    readonly customerId: string;
    readonly totalAmount: string;
    readonly currencyCode: string;
    readonly createdAt: string;
  }[];
  readonly nextCursor: string | undefined;
  readonly hasNext: boolean;
}
