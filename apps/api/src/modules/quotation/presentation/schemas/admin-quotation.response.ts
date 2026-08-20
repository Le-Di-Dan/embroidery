/**
 * What the two Admin drafting mutations return (`APP6-B01`).
 *
 * A receipt, not a projection. It does not re-serve the quotation: version
 * history and one version's line-item detail are `APP6-B02`'s surface, and
 * answering a mutation with a whole detail would make this file a second
 * authority on what a quotation looks like — one B02 would have to be kept in
 * step with forever. What is here is exactly enough to identify the draft that
 * was created and to explain the price it carries.
 *
 * ### Every amount is a `string`, in OpenAPI too
 *
 * `type: String` on each amount is the contract, not a serialisation detail. A
 * `number` here would be published as a JSON number, the generated client would
 * type it `number`, and a VND total would round-trip through an IEEE-754 double
 * on its way to the operator's screen — the exact loss `APP6-G01` §6.2 forbids.
 * `depositPercent` is a string for the same reason: it is `numeric(5,2)`.
 *
 * ### What is absent is the point
 *
 * No customer, no contact value, no grant, no token, no secure link, no
 * validity window, no `sentAt` and no line-item detail. A DRAFT has been sent to
 * nobody, and a field that does not exist cannot be populated by a later edit.
 */
import { ApiProperty } from '@nestjs/swagger';

const QUOTATION_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const VERSION_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';
const REQUEST_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6073';

const AMOUNT = {
  type: String,
  example: '1500000.00',
  description: 'Exact `numeric(14,2)` VND, always a string. Never a JSON number.',
} as const;

export class QuotationDraftedResponse {
  @ApiProperty({ format: 'uuid', example: QUOTATION_ID_EXAMPLE })
  quotationId!: string;

  @ApiProperty({
    example: 'QUO-7K3MPQ2XVD',
    description:
      'The stable human-facing code. Read aloud and retyped — never an authorization input.',
  })
  quotationCode!: string;

  @ApiProperty({ format: 'uuid', example: REQUEST_ID_EXAMPLE })
  customRequestId!: string;

  @ApiProperty({
    example: 'DRAFT',
    description: 'The quotation header state. Drafting never advances it.',
  })
  quotationStatus!: string;

  @ApiProperty({ format: 'uuid', example: VERSION_ID_EXAMPLE })
  versionId!: string;

  @ApiProperty({
    example: 1,
    description:
      'The version number the database assigned, one higher than the previous version of this ' +
      'quotation. Version numbers are never reused and earlier versions are never rewritten.',
  })
  version!: number;

  @ApiProperty({
    example: 'DRAFT',
    description: 'Always `DRAFT` here. Sending is a separate, later action.',
  })
  versionStatus!: string;

  @ApiProperty({ example: 'VND', description: 'Fixed by the schema; no currency is selectable.' })
  currencyCode!: string;

  @ApiProperty({ ...AMOUNT, description: 'The sum of the line totals.' })
  subtotalAmount!: string;

  @ApiProperty({
    type: String,
    example: '0.00',
    description: 'The manual adjustment applied to the subtotal. May be negative.',
  })
  manualAdjustmentAmount!: string;

  @ApiProperty({ ...AMOUNT, example: '50000.00' })
  shippingFeeAmount!: string;

  @ApiProperty({
    ...AMOUNT,
    description: 'Subtotal + adjustment + shipping fee, as the schema requires (CST-064).',
  })
  totalAmount!: string;

  @ApiProperty({
    type: String,
    example: '40.00',
    description:
      'The deposit share this version was priced at, read from published policy rather than ' +
      'chosen here. A string: it is `numeric(5,2)`.',
  })
  depositPercent!: string;

  @ApiProperty({
    ...AMOUNT,
    example: '620000.00',
    description: 'The deposit share of the total, rounded half up to a whole đồng.',
  })
  depositAmount!: string;

  @ApiProperty({
    ...AMOUNT,
    example: '930000.00',
    description:
      'Total minus deposit — computed by subtraction so the two always sum to the total exactly.',
  })
  remainingAmount!: string;

  @ApiProperty({ example: 24, description: 'The garment quantity this version prices.' })
  quantityTotal!: number;

  @ApiProperty({ example: 3, description: 'How many priced lines explain the subtotal.' })
  lineItemCount!: number;
}

export interface QuotationDraftedPayload {
  readonly quotationId: string;
  readonly quotationCode: string;
  readonly customRequestId: string;
  readonly quotationStatus: string;
  readonly versionId: string;
  readonly version: number;
  readonly versionStatus: string;
  readonly currencyCode: string;
  readonly subtotalAmount: string;
  readonly manualAdjustmentAmount: string;
  readonly shippingFeeAmount: string;
  readonly totalAmount: string;
  readonly depositPercent: string;
  readonly depositAmount: string;
  readonly remainingAmount: string;
  readonly quantityTotal: number;
  readonly lineItemCount: number;
}
