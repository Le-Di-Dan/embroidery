/**
 * What a successful Ready-Made order creation returns (`APP12-B02` §24,
 * extended by `APP12-B04` §32).
 *
 * Five fields, and the list is the contract. It is deliberately identical to
 * the **stored idempotency result**, so a first creation and a replay of it are
 * indistinguishable to a client — which is what makes a safe retry actually
 * safe (`BR-023`).
 *
 * What is absent is the point: no order UUID, no reservation id, no stock
 * anchor id, no customer id, no SKU id, no contact value, no challenge id, no
 * grant id, no secure-access token and no link. `BR-032` keeps raw internal
 * identifiers off the customer surface.
 *
 * `APP12-B04` added `access` **additively**: the four B02 fields keep their
 * names, meanings and positions, so a client written against the accepted
 * contract is unaffected. It publishes that the order is reachable and until
 * when — never the credential. The raw `ORDER_ACCESS` token exists once, in the
 * creating transaction, and only its peppered digest is stored; the customer's
 * link arrives through the APP4 notification path, exactly as `APP5-B01`'s
 * submission response records for its own grant. Because the published fields
 * are facts of the grant rather than secrets, a first creation and an idempotent
 * replay of it remain indistinguishable.
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
import { schema } from '@embroidery/database';

export class ReadyMadeOrderSubtotalResponse {
  @ApiProperty({
    example: '450000.00',
    description: 'Merchandise subtotal as numeric(14,2). A string, never a JSON number.',
  })
  amount!: string;

  @ApiProperty({ example: 'VND', description: 'The currency the amount is denominated in.' })
  currency!: string;
}

/**
 * That the order is reachable, and until when (`APP12-B04` §7).
 *
 * Three plain facts, no credential and no destination: the link goes to the
 * customer's own primary verified contact, chosen server-side, and this object
 * names neither the contact nor the channel.
 */
export class ReadyMadeOrderAccessBootstrapResponse {
  @ApiProperty({
    enum: schema.GRANT_SCOPE_KINDS,
    example: 'ORDER_ACCESS',
    description:
      'What the issued secure link covers. Always ORDER_ACCESS here: it opens this one ' +
      'order and nothing else — not the customer’s other orders, and not any custom ' +
      'request.',
  })
  scopeKind!: string;

  @ApiProperty({
    example: true,
    description:
      'That the secure link was handed to the notification path for the customer’s own ' +
      'primary verified contact. The link itself is never in this response and cannot be ' +
      'recovered from the server afterwards — only its hash is stored. A customer who ' +
      'loses the message asks for a new link; retrying this request replays the order and ' +
      'issues nothing.',
  })
  delivered!: boolean;

  @ApiProperty({
    format: 'date-time',
    example: '2026-09-09T04:15:00.000Z',
    description: 'When that link stops opening the order. Absolute and never extended by using it.',
  })
  expiresAt!: string;
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

  @ApiProperty({
    type: ReadyMadeOrderAccessBootstrapResponse,
    description:
      'How the customer reaches this order afterwards. Issued in the same transaction as ' +
      'the order, so an order that exists is always reachable by its own customer.',
  })
  access!: ReadyMadeOrderAccessBootstrapResponse;
}
