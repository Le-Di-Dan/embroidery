/**
 * What a successful Ready-Made order creation returns (`APP12-B02` §24).
 *
 * Four fields, and the list is the contract. It is deliberately identical to
 * the **stored idempotency result**, so a first creation and a replay of it are
 * indistinguishable to a client — which is what makes a safe retry actually
 * safe (`BR-023`).
 *
 * What is absent is the point: no order UUID, no reservation id, no stock
 * anchor id, no customer id, no SKU id, no contact value, no challenge id, no
 * secure-access token and no link. `BR-032` keeps raw internal identifiers off
 * the customer surface, and `APP12-B04` — which owns `ORDER_ACCESS` — adds its
 * bootstrap on top of this shape rather than needing a UUID leaked here first.
 *
 * There is also **no payable total and no shipping fee**, because neither
 * exists yet (`BR-027`). The subtotal published here is merchandise only, and
 * `status` says so: `AWAITING_SHIPPING_FEE` is the customer-facing fact that an
 * operator still has to price delivery.
 *
 * `orderCode` is the human order code. It is safe here and it is **never an
 * authorization input** (CST-026): grant-scoped access is the mechanism, and
 * `APP12-B04` will accept a grant, never a code.
 */
import { ApiProperty } from '@nestjs/swagger';

export class ReadyMadeOrderSubtotalResponse {
  @ApiProperty({
    example: '450000.00',
    description: 'Merchandise subtotal as numeric(14,2). A string, never a JSON number.',
  })
  amount!: string;

  @ApiProperty({ example: 'VND', description: 'The currency the amount is denominated in.' })
  currency!: string;
}

export class ReadyMadeOrderCreatedResponse {
  @ApiProperty({
    example: 'ORD-7KMPQ3XZ4A',
    description: 'Human order code. Quotable to support; never a credential.',
  })
  orderCode!: string;

  @ApiProperty({
    example: 'AWAITING_SHIPPING_FEE',
    description:
      'Ready-Made lifecycle state. A new order always lands here: the operator has not yet ' +
      'set the shipping fee, so no payable total exists.',
  })
  status!: string;

  @ApiProperty({
    type: ReadyMadeOrderSubtotalResponse,
    description: 'Frozen merchandise subtotal — unit price x quantity. Excludes shipping.',
  })
  merchandiseSubtotal!: ReadyMadeOrderSubtotalResponse;

  @ApiProperty({
    format: 'date-time',
    example: '2026-09-03T04:15:00.000Z',
    description:
      'When the reserved stock is released if the order has not been paid for. Measured from ' +
      "the order's own creation instant.",
  })
  reservationExpiresAt!: string;
}
