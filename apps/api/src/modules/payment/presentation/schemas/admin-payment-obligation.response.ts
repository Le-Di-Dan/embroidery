/**
 * The obligation an Admin payment read reports as currently collected
 * (`APP12-A02-C1`).
 *
 * Its own file beside `admin-payment.response.ts`, on the split that file
 * already uses: one subject per module, and this is the subject
 * `APP12-A02-C1` introduced. The response that carries it, the attempt list
 * under it and the decision receipt beside it are all a different question —
 * *what one order owes* rather than *what an operator is shown about it*.
 *
 * The class exists for OpenAPI; the payload beside it is the serialized shape,
 * and the runtime view lives with the query that builds it.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { schema } from '@embroidery/database';

const AMOUNT = {
  type: String,
  example: '1500000.00',
  description: 'Exact `numeric(14,2)` VND, always a string. Never a JSON number.',
} as const;

/**
 * The one obligation this order is currently collected against
 * (`APP12-A02-C1`).
 *
 * "Current" is `uq_payment_obligations__order_kind__live`, never a sort over a
 * history. After an `APP12-B03` shipping-fee correction the predecessor `FULL`
 * is `SUPERSEDED` and therefore not live, so it cannot appear here — and
 * because `attempts` are listed from **this** `obligationId`, the predecessor's
 * attempts and its evidence cannot be presented as the successor's either.
 *
 * A client must not compare transfer references to work out which obligation is
 * current: a correction leaves the memo unchanged, since it is derived from the
 * order code, and both obligations therefore carry the same one.
 */
export class AdminPaymentObligationResponse {
  @ApiProperty({ format: 'uuid' })
  obligationId!: string;

  @ApiProperty({
    enum: schema.PAYMENT_OBLIGATION_KINDS,
    example: 'DEPOSIT',
    description:
      'Which obligation this is, read off the row. `DEPOSIT` on a `CUSTOM` order and `FULL` on ' +
      'a `READY_MADE` one; `REMAINING` is never presented here, because APP9 collects it ' +
      'through the order’s own lifecycle.',
  })
  kind!: string;

  @ApiProperty({ enum: schema.PAYMENT_OBLIGATION_STATES, example: 'PENDING' })
  status!: string;

  @ApiProperty({
    ...AMOUNT,
    description:
      'The obligation’s own frozen amount — the figure a received transfer must match exactly. ' +
      'Never a share recomputed from a quotation, never a live catalog price, and for a ' +
      'Ready-Made `FULL` never re-derived from the merchandise subtotal plus the shipping fee.',
  })
  expectedAmount!: string;

  @ApiProperty({ example: 'VND' })
  expectedCurrencyCode!: string;

  @ApiProperty({
    example: 'ORD7K3MPQ2XVDDC',
    description:
      'The exact memo the customer was told to put on the transfer: `ORD`, the order code body, ' +
      'then the kind’s suffix — `DC` for a deposit, `FL` for a Ready-Made full payment. ' +
      'Derived from the order, never stored and never accepted from a request.',
  })
  expectedTransferReference!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'The one attempt that satisfied this obligation, once one has.',
  })
  satisfiedByAttemptId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  satisfiedAt?: string;
}

export interface AdminPaymentObligationPayload {
  readonly obligationId: string;
  readonly kind: string;
  readonly status: string;
  readonly expectedAmount: string;
  readonly expectedCurrencyCode: string;
  readonly expectedTransferReference: string;
  readonly satisfiedByAttemptId?: string | undefined;
  readonly satisfiedAt?: string | undefined;
}
