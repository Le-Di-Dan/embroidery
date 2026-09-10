/**
 * The published shape of one order's shipping detail, and of the write receipt
 * (`APP9-B04` §5).
 *
 * ### The projection is the repository's, not the table's
 *
 * Every field below is a column the canonical `ShippingDetail` projection
 * returns. `fulfillmentNote` exists on TBL-047 and is deliberately **absent**:
 * no delivered writer sets it and the dispatch snapshot does not copy it, so
 * publishing it would promise a fact no path in this system produces.
 *
 * `currencyCode` is absent for a different reason — it is CHECK-pinned to `VND`
 * on the row, so a field carrying it would be a constant dressed as data.
 *
 * ### No customer, and no secure-flow evidence
 *
 * No `customerId`, no contact point, no grant id, no step-up challenge id, no
 * acknowledgement row. The recipient's name and phone here are the **order's
 * own** frozen delivery facts (ADR-DB2-002), not the customer profile, and the
 * evidence that authorised a fee increase is audit content rather than something
 * an order screen renders.
 */
import { ApiProperty } from '@nestjs/swagger';
import type { ShippingDetailState } from '@embroidery/database';

const ORDER_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6081';
const OBLIGATION_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6082';

/** LC-19. Both states, because the read serves a frozen detail too. */
export const PUBLISHED_SHIPPING_DETAIL_STATES = [
  'EDITABLE',
  'FROZEN',
] as const satisfies readonly ShippingDetailState[];

export class AdminShippingDetailResponse {
  @ApiProperty({ example: 'Nguyễn Thị Mai' })
  recipientName!: string;

  @ApiProperty({
    example: '0901234567',
    description: 'The delivery contact for this order, as stored. Not the customer profile.',
  })
  recipientPhone!: string;

  @ApiProperty({ example: '12 Nguyễn Huệ' })
  addressLine!: string;

  @ApiProperty({ required: false, nullable: true, type: 'string', example: 'Phường Bến Nghé' })
  ward?: string | null;

  @ApiProperty({ required: false, nullable: true, type: 'string', example: 'Quận 1' })
  district?: string | null;

  @ApiProperty({ example: 'TP. Hồ Chí Minh' })
  province!: string;

  @ApiProperty({
    example: 'VN',
    description: 'Defaulted on the row; there is no cross-border fulfillment in the MVP.',
  })
  countryCode!: string;

  @ApiProperty({
    required: false,
    nullable: true,
    type: 'string',
    example: '50000.00',
    description:
      'The effective shipping fee, exactly as `numeric(14,2)` stores it. A string, never a ' +
      'JSON number. Absent only on a detail saved before a fee was set.',
  })
  feeAmount?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    type: 'string',
    example: 'Giao Hàng Nhanh',
    description:
      'An internal note of who is carrying the parcel. Not a carrier integration: nothing is ' +
      'called, polled or subscribed to, and no delivery state is derived from it.',
  })
  carrierName?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    type: 'string',
    example: 'GHN123456789',
    description: 'An internal reference an operator typed. There is no live tracking lookup.',
  })
  trackingCode?: string | null;

  @ApiProperty({
    enum: PUBLISHED_SHIPPING_DETAIL_STATES,
    example: 'EDITABLE',
    description:
      'LC-19. `FROZEN` means dispatch has already snapshotted this detail (GRD-017) and no ' +
      'further edit is accepted.',
  })
  status!: ShippingDetailState;

  @ApiProperty({
    required: false,
    nullable: true,
    type: 'string',
    format: 'date-time',
    description: 'When dispatch froze the detail. Absent while it is still editable.',
  })
  frozenAt?: string | null;
}

/**
 * What a fee change did, reported beside the saved detail.
 *
 * It exists so the operator can see the money consequence of the edit they just
 * made without a second read, and so a reviewer can tell an unchanged fee from a
 * recalculated one. It publishes **ids and the new balance** — not a deposit,
 * not a total, and not the acknowledgement evidence.
 */
export class AdminShippingFeeOutcomeResponse {
  @ApiProperty({
    example: false,
    description: 'Whether the effective fee moved. When false, no payment record was touched.',
  })
  changed!: boolean;

  @ApiProperty({
    required: false,
    nullable: true,
    // Stated rather than reflected. This property became `string | null` in
    // `APP12-B03`, and a union gives the metadata reader no scalar to infer —
    // it would publish as `object` and the generated client would lose the
    // string.
    //
    // `APP12-E01` §3.8 / `FU-APP12-B03-01`: every nullable scalar in this file
    // now states its `type` for the same reason. Nine of them did not, so the
    // Admin's frozen shipping fee, its frozen-at stamp, the two successor
    // obligation ids and the successor amount all reached the generated client
    // as `{ [key: string]: unknown } | null` — an object where a money string
    // lives. Nothing consumed them wrongly, because nothing could consume them
    // at all; the contract simply lied about the shape it returns.
    type: 'string',
    example: '50000.00',
    description:
      'The fee this write was measured against: the stored one, or — before any fee had been ' +
      'stored — for a custom order the accepted quotation version’s frozen shipping fee. ' +
      '`null` on a ready-made order’s **first** fee confirmation, where no fee had been priced ' +
      'yet: a pending fee is an absence, not a zero.',
  })
  previousFeeAmount?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    type: 'boolean',
    example: false,
    description:
      'Whether this change required and recorded the customer’s acknowledgement. True only for ' +
      'a custom order’s fee increase; a decrease needs none (DB3 §1.2). `null` on a ready-made ' +
      'order, which requires no acknowledgement at any point — reporting `false` would suggest ' +
      'one had been looked for.',
  })
  acknowledged?: boolean | null;

  @ApiProperty({
    required: false,
    nullable: true,
    type: 'string',
    format: 'uuid',
    example: OBLIGATION_ID_EXAMPLE,
    description:
      'The REMAINING obligation this change marked SUPERSEDED. Its amount was **not** edited; ' +
      'it keeps the figure it was payable at.',
  })
  supersededObligationId?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    type: 'string',
    format: 'uuid',
    example: OBLIGATION_ID_EXAMPLE,
    description: 'The successor REMAINING obligation, now the one live payable authority.',
  })
  remainingObligationId?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    type: 'string',
    example: '1815000.00',
    description: 'The successor’s amount: the previous live amount moved by the fee difference.',
  })
  remainingAmount?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    type: 'string',
    format: 'uuid',
    example: OBLIGATION_ID_EXAMPLE,
    description:
      'Ready-made orders only: the live FULL obligation after this write — the one created by ' +
      'the first fee confirmation, or the successor a correction produced. `null` on a custom ' +
      'order, which is paid as a deposit and a remaining balance and never carries a FULL.',
  })
  fullObligationId?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    type: 'string',
    example: '280000.00',
    description:
      'Ready-made orders only: the exact payable total — the order’s frozen merchandise subtotal ' +
      'plus this shipping fee — which is also the live FULL obligation’s amount and the order ' +
      'total. It is recomposed from the frozen order lines on every accepted fee, never derived ' +
      'from the previous total, so successive corrections do not compound.',
  })
  payableTotalAmount?: string | null;
}

export class AdminShippingDetailSavedResponse {
  @ApiProperty({ format: 'uuid', example: ORDER_ID_EXAMPLE })
  orderId!: string;

  @ApiProperty({ type: AdminShippingDetailResponse })
  detail!: AdminShippingDetailResponse;

  @ApiProperty({ type: AdminShippingFeeOutcomeResponse })
  fee!: AdminShippingFeeOutcomeResponse;
}
