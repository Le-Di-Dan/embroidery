/**
 * What the two Admin quotation reads return (`APP6-B02`).
 *
 * Bounded response classes of their own, not the drafting bodies re-used
 * because the field names overlap: a request body states what an operator may
 * *set*, and every field here is something the server recorded. Sharing one
 * class would make the write contract widen every time a read needed another
 * persisted fact.
 *
 * ### Every amount is a `string`, in OpenAPI too
 *
 * `type: String` on each amount is the contract, not a serialisation detail. A
 * `number` here would be published as a JSON number, the generated client would
 * type it `number`, and a VND total would round-trip through an IEEE-754 double
 * on its way to the operator's screen — the exact loss `APP6-G01` §6.2 forbids.
 * `depositPercent` is a string for the same reason: it is `numeric(5,2)`.
 *
 * ### Every nullable field states its type
 *
 * `nullable: true` **without** an explicit `type` publishes `type: object` —
 * Nest has no runtime type for a `string | null` union — and Orval turns that
 * into an index signature. Each nullable property below therefore carries
 * `type: String` (or `Number`) so the document says `string | null` and the
 * generated client says the same. `required: false` is deliberately **not** set:
 * these fields are always present, and their value is `null` when the fact does
 * not exist yet, so a client never has to distinguish "absent" from "not yet".
 *
 * ### These are historical facts, not current ones
 *
 * `depositPercent` is the share the version was priced at — read from its own
 * row, never from the policy in force today. Nothing on this path recomputes a
 * total, a deposit or a remaining amount.
 */
import { ApiProperty } from '@nestjs/swagger';
import { schema } from '@embroidery/database';

const QUOTATION_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const VERSION_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';
const REQUEST_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6073';

const AMOUNT = {
  type: String,
  example: '1500000.00',
  description: 'Exact `numeric(14,2)` VND, always a string. Never a JSON number.',
} as const;

/** A timestamp that only exists once the version reached a given state. */
const NULLABLE_INSTANT = { type: String, format: 'date-time', nullable: true } as const;

export class AdminQuotationHeaderResponse {
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
    description: 'The quotation header state. Reading it never advances it.',
  })
  quotationStatus!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    example: null,
    description:
      'The version the customer is currently looking at, or `null` while the quotation has ' +
      'never been sent. Advanced only by the send transaction (`APP6-B03`).',
  })
  currentVersionId!: string | null;
}

export class AdminQuotationVersionResponse {
  @ApiProperty({ format: 'uuid', example: VERSION_ID_EXAMPLE })
  versionId!: string;

  @ApiProperty({
    example: 1,
    description:
      'The version number the database assigned, consecutive within this quotation. Never ' +
      'reused, and earlier versions are never rewritten (CST-036).',
  })
  version!: number;

  @ApiProperty({
    enum: schema.QUOTATION_VERSION_STATES,
    example: 'DRAFT',
    description: 'The LC-13 state of this version at the moment it was read.',
  })
  status!: string;

  @ApiProperty({ example: 24, description: 'The garment quantity this version prices.' })
  quantityTotal!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 8500,
    description:
      'The admin-entered stitch count this version was priced with (GAP-10), or `null` when ' +
      'the draft was written without one. Never derived — there is no stitch-count engine.',
  })
  stitchCount!: number | null;

  @ApiProperty({ example: 'VND', description: 'Fixed by the schema; no currency is selectable.' })
  currencyCode!: string;

  @ApiProperty({ ...AMOUNT, description: 'The sum of this version’s line totals, as recorded.' })
  subtotalAmount!: string;

  @ApiProperty({
    type: String,
    example: '0.00',
    description: 'The manual adjustment applied to the subtotal. May be negative.',
  })
  manualAdjustmentAmount!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description:
      'Why the total was moved off-list, as written at the time. Required by the schema ' +
      'whenever the adjustment is non-zero, and `null` otherwise.',
  })
  adjustmentReason!: string | null;

  @ApiProperty({ ...AMOUNT, example: '50000.00' })
  shippingFeeAmount!: string;

  @ApiProperty({
    ...AMOUNT,
    description: 'The recorded total. Returned as stored, never recomputed from the parts.',
  })
  totalAmount!: string;

  @ApiProperty({
    type: String,
    example: '40.00',
    description:
      'The deposit share **this version was priced at**, from its own row — not the share ' +
      'published policy carries today. A string: it is `numeric(5,2)`.',
  })
  depositPercent!: string;

  @ApiProperty({ ...AMOUNT, example: '620000.00', description: 'The recorded deposit share.' })
  depositAmount!: string;

  @ApiProperty({ ...AMOUNT, example: '930000.00', description: 'The recorded remainder.' })
  remainingAmount!: string;

  @ApiProperty({
    ...NULLABLE_INSTANT,
    example: null,
    description: 'When the validity window opened. Set by the send transaction, `null` before it.',
  })
  validFrom!: string | null;

  @ApiProperty({
    ...NULLABLE_INSTANT,
    example: null,
    description: 'When the offer lapses. `null` on a version that was never sent.',
  })
  validUntil!: string | null;

  @ApiProperty({ ...NULLABLE_INSTANT, example: null, description: 'When it was sent, if it was.' })
  sentAt!: string | null;

  @ApiProperty({ ...NULLABLE_INSTANT, example: null, description: 'When the customer accepted.' })
  acceptedAt!: string | null;

  @ApiProperty({
    ...NULLABLE_INSTANT,
    example: null,
    description: 'When a newer sent version replaced this one.',
  })
  supersededAt!: string | null;

  @ApiProperty({ ...NULLABLE_INSTANT, example: null, description: 'When it lapsed unaccepted.' })
  expiredAt!: string | null;

  @ApiProperty({
    format: 'date-time',
    example: '2026-08-20T09:00:00.000Z',
    description: 'When this version was drafted. Always present; a version is never backdated.',
  })
  createdAt!: string;

  @ApiProperty({
    example: false,
    description:
      'Whether the quotation header points at this version. Compared against ' +
      '`currentVersionId` — not inferred from the status — so it is `false` on every version ' +
      'of a quotation that has never been sent.',
  })
  current!: boolean;
}

export class AdminQuotationLineItemResponse {
  @ApiProperty({
    example: 1,
    description: 'The line’s place in the version, unique within it (CST-037). Sorted ascending.',
  })
  position!: number;

  @ApiProperty({ enum: schema.QUOTATION_LINE_KINDS, example: 'PRODUCT' })
  lineKind!: string;

  @ApiProperty({ example: 'Áo polo thêu ngực trái' })
  description!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    example: null,
    description:
      'A display reference to the catalogue row this line was priced from (REL-069). The ' +
      'frozen description and amounts are the priced facts; this is never re-derived from.',
  })
  skuId!: string | null;

  @ApiProperty({ example: 10 })
  quantity!: number;

  @ApiProperty({ ...AMOUNT, example: '150000.00' })
  unitPriceAmount!: string;

  @ApiProperty({ ...AMOUNT, description: 'The line total as frozen, not quantity × unit price.' })
  lineTotalAmount!: string;
}

export class AdminQuotationVersionHistoryResponse {
  @ApiProperty({ type: AdminQuotationHeaderResponse })
  quotation!: AdminQuotationHeaderResponse;

  @ApiProperty({
    type: [AdminQuotationVersionResponse],
    description:
      'Every version of this quotation, oldest first by version number. Not paginated, and ' +
      'never filtered: a superseded or expired version stays in the history exactly as it was.',
  })
  versions!: AdminQuotationVersionResponse[];
}

export class AdminQuotationVersionDetailResponse {
  @ApiProperty({ type: AdminQuotationHeaderResponse })
  quotation!: AdminQuotationHeaderResponse;

  @ApiProperty({
    type: AdminQuotationVersionResponse,
    description: 'The exact version addressed by the path. Never substituted with the current one.',
  })
  version!: AdminQuotationVersionResponse;

  @ApiProperty({
    type: [AdminQuotationLineItemResponse],
    description: 'This version’s own frozen lines, ordered by position.',
  })
  lineItems!: AdminQuotationLineItemResponse[];
}

export interface AdminQuotationHeaderPayload {
  readonly quotationId: string;
  readonly quotationCode: string;
  readonly customRequestId: string;
  readonly quotationStatus: string;
  readonly currentVersionId: string | null;
}

export interface AdminQuotationVersionPayload {
  readonly versionId: string;
  readonly version: number;
  readonly status: string;
  readonly quantityTotal: number;
  readonly stitchCount: number | null;
  readonly currencyCode: string;
  readonly subtotalAmount: string;
  readonly manualAdjustmentAmount: string;
  readonly adjustmentReason: string | null;
  readonly shippingFeeAmount: string;
  readonly totalAmount: string;
  readonly depositPercent: string;
  readonly depositAmount: string;
  readonly remainingAmount: string;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly sentAt: string | null;
  readonly acceptedAt: string | null;
  readonly supersededAt: string | null;
  readonly expiredAt: string | null;
  readonly createdAt: string;
  readonly current: boolean;
}

export interface AdminQuotationLineItemPayload {
  readonly position: number;
  readonly lineKind: string;
  readonly description: string;
  readonly skuId: string | null;
  readonly quantity: number;
  readonly unitPriceAmount: string;
  readonly lineTotalAmount: string;
}

export interface AdminQuotationVersionHistoryPayload {
  readonly quotation: AdminQuotationHeaderPayload;
  readonly versions: readonly AdminQuotationVersionPayload[];
}

export interface AdminQuotationVersionDetailPayload {
  readonly quotation: AdminQuotationHeaderPayload;
  readonly version: AdminQuotationVersionPayload;
  readonly lineItems: readonly AdminQuotationLineItemPayload[];
}
