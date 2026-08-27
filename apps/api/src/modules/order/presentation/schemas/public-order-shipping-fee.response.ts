/**
 * The receipt for one customer shipping-fee acknowledgement (`APP9-B04-C1` §4).
 *
 * It reports the decision that was recorded and nothing about how it was
 * authorised. No `grantId`, no `stepUpChallengeId`, no token, no customer
 * identifier, no order id and no contact: the two evidence references are the
 * server's audit content, and a field a response never carries is one nothing
 * downstream can log. The order is named by its human `code`, which the customer
 * is already looking at.
 *
 * Nothing here is a shipping detail or a payment. The acknowledgement does not
 * change the fee, does not recalculate the remaining balance and does not move
 * the order — that stays the operator's write, and this response deliberately
 * carries no obligation id or balance that might suggest otherwise.
 */
import { ApiProperty } from '@nestjs/swagger';

export class ShippingFeeAcknowledgedResponse {
  @ApiProperty({
    example: 'DH-2026-000128',
    description: 'The order this acknowledgement was recorded against.',
  })
  orderCode!: string;

  @ApiProperty({
    example: '50000.00',
    description:
      'The fee the order carried when the decision was made, derived by the server. An ' +
      'acknowledgement only authorises a change from this exact figure.',
  })
  previousFeeAmount!: string;

  @ApiProperty({ example: '80000.00', description: 'The fee the customer accepted.' })
  newFeeAmount!: string;

  @ApiProperty({ example: 'VND' })
  currencyCode!: string;

  @ApiProperty({ example: '2026-08-27T09:15:00.000Z', format: 'date-time' })
  acknowledgedAt!: string;

  @ApiProperty({
    example: false,
    description:
      'True when this exact decision had already been recorded and the call wrote nothing. ' +
      'Repeating the confirmation never creates a second piece of evidence.',
  })
  replayed!: boolean;
}

/** The controller's return shape. Dates leave as ISO strings. */
export interface ShippingFeeAcknowledgedHttpView {
  readonly orderCode: string;
  readonly previousFeeAmount: string;
  readonly newFeeAmount: string;
  readonly currencyCode: string;
  readonly acknowledgedAt: string;
  readonly replayed: boolean;
}
