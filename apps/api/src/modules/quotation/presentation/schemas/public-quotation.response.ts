/**
 * The customer projection of the current quotation (`APP6-B04` §8).
 *
 * These classes exist for OpenAPI: the generated client's types come from them,
 * so every property here is one an anonymous browser holding a valid secure link
 * is allowed to see. The runtime view lives beside the query that builds it —
 * keeping both in one file would make it easy to add a property to the response
 * and forget the schema, or the reverse.
 *
 * Bounded classes of their own, **not** `AdminQuotationVersionResponse` reused
 * because the field names overlap. The Admin read is an archive of what an
 * operator recorded; this is one offer shown to the person who has to decide on
 * it. Sharing a class would mean every fact the Admin surface later needs
 * arrives on the customer's screen by default.
 *
 * ### What is absent, and why each one is absent
 *
 * **Credentials and identity.** No token, digest, `grantId`, `scopeKind`,
 * `customerId` or `customRequestId`. The response echoes back nothing that was
 * presented to obtain it, and names no identifier the caller did not already
 * hold.
 *
 * **Operator evidence.** No `adjustmentReason` — TBL-051 describes it as the
 * evidence for why a total was moved off-list, and no repository or product
 * authority makes it customer-facing; the repository's pattern for
 * customer-readable text is a dedicated column (`cancelled_customer_reason`
 * beside `cancelled_reason`), and the quotation has only the internal one. No
 * `stitchCount`: an admin-entered pricing input (GAP-10), not a fact about what
 * the customer owes. No admin id, audit id, outbox id, correlation id or policy
 * version id.
 *
 * **Other versions.** No history, no version list, no superseded sibling, no
 * `supersededAt`, no `acceptedAt` and no `expiredAt` — the timestamps of states
 * this page does not render. One version: the one the pointers name.
 *
 * ### Every amount is a `string`, in OpenAPI too
 *
 * `type: String` on each amount is the contract, not a serialisation detail. A
 * `number` here would be published as a JSON number, the generated client would
 * type it `number`, and a VND total would round-trip through an IEEE-754 double
 * on its way to the customer's screen — the exact loss `APP6-G01` §6.2 forbids.
 * `depositPercent` is a string for the same reason: it is `numeric(5,2)`. The
 * screen performs no arithmetic on any of them.
 *
 * ### Every nullable field states its type
 *
 * `nullable: true` **without** an explicit `type` publishes `type: object` —
 * Nest has no runtime type for a `string | null` union — and Orval turns that
 * into an index signature. Each nullable property below therefore carries
 * `type: String`. `required: false` is deliberately not set: these fields are
 * always present and carry `null` when the fact does not exist.
 */
import { ApiProperty } from '@nestjs/swagger';
import { schema } from '@embroidery/database';

const VERSION_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';

const AMOUNT = {
  type: String,
  example: '1500000.00',
  description: 'Exact `numeric(14,2)` VND, always a string. Never a JSON number.',
} as const;

/** A timestamp that only exists once the version reached a given state. */
const NULLABLE_INSTANT = { type: String, format: 'date-time', nullable: true } as const;

export class CustomerQuotationLineItemResponse {
  @ApiProperty({
    example: 1,
    description: 'The line’s place in the version, unique within it (CST-037). Sorted ascending.',
  })
  position!: number;

  @ApiProperty({ enum: schema.QUOTATION_LINE_KINDS, example: 'PRODUCT' })
  lineKind!: string;

  @ApiProperty({ example: 'Áo polo thêu ngực trái' })
  description!: string;

  @ApiProperty({ example: 10, description: 'Units this line prices.' })
  quantity!: number;

  @ApiProperty({ ...AMOUNT, example: '150000.00', description: 'The frozen unit price.' })
  unitPriceAmount!: string;

  @ApiProperty({
    ...AMOUNT,
    description: 'The frozen line total, as recorded. Never recomputed from unit price × quantity.',
  })
  lineTotalAmount!: string;

  // No `skuId`: an internal catalogue key the customer neither presented nor
  // needs, and one this surface publishes no way to resolve.
}

export class CustomerQuotationResponse {
  @ApiProperty({
    example: 'QUO-7K3MPQ2XVD',
    description:
      'The human quotation code, for quoting in a conversation with the workshop. Display ' +
      'only — it never opens a quotation, and this endpoint does not accept it.',
  })
  quotationCode!: string;

  @ApiProperty({
    format: 'uuid',
    example: VERSION_ID_EXAMPLE,
    description:
      'The exact version this read resolved from the current pointers. Returned so a later ' +
      'decision can name the version the customer actually saw; a newer send makes a fresh ' +
      'read return a different id, and the older one is never served as current again.',
  })
  versionId!: string;

  @ApiProperty({
    example: 2,
    description: 'The version number, consecutive within this quotation (CST-036).',
  })
  version!: number;

  @ApiProperty({
    enum: schema.QUOTATION_VERSION_STATES,
    example: 'SENT',
    description: 'The stored LC-13 state of this version. Reading it never advances it.',
  })
  status!: string;

  @ApiProperty({
    enum: schema.QUOTATION_STATES,
    example: 'SENT',
    description: 'The stored state of the quotation this version belongs to.',
  })
  quotationStatus!: string;

  @ApiProperty({ example: 'VND', description: 'Fixed by the schema; no currency is selectable.' })
  currencyCode!: string;

  @ApiProperty({ example: 10, description: 'The garment quantity this version prices.' })
  quantityTotal!: number;

  @ApiProperty({ ...AMOUNT, description: 'The sum of this version’s line totals, as recorded.' })
  subtotalAmount!: string;

  @ApiProperty({
    type: String,
    example: '0.00',
    description:
      'The manual adjustment applied to the subtotal, as recorded. May be negative. The ' +
      'operator’s internal note explaining it is not part of this response.',
  })
  manualAdjustmentAmount!: string;

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
    type: [CustomerQuotationLineItemResponse],
    description: 'This version’s own frozen lines, ascending by position. Never another version’s.',
  })
  lineItems!: CustomerQuotationLineItemResponse[];

  @ApiProperty({
    ...NULLABLE_INSTANT,
    example: '2026-08-20T09:00:00.000Z',
    description: 'When this version was sent.',
  })
  sentAt!: string | null;

  @ApiProperty({
    ...NULLABLE_INSTANT,
    example: '2026-08-20T09:00:00.000Z',
    description: 'When the validity window opened.',
  })
  validFrom!: string | null;

  @ApiProperty({
    ...NULLABLE_INSTANT,
    example: '2026-08-27T09:00:00.000Z',
    description: 'When the offer lapses.',
  })
  validUntil!: string | null;

  @ApiProperty({
    example: false,
    description:
      'Whether the offer has lapsed at the moment of this read. Derived server-side and never ' +
      'stored by this operation: a quotation past `validUntil` is still returned in full, so ' +
      'the expired state is distinct from an unusable secure link. `true` as well when the ' +
      'stored status is already EXPIRED.',
  })
  expired!: boolean;

  @ApiProperty({
    format: 'date-time',
    example: '2026-09-03T09:00:00.000Z',
    description:
      'When the secure link itself stops working — the grant’s expiry, not the quotation’s.',
  })
  accessExpiresAt!: string;
}

/** The serialised shape the controller returns; mirrors the class above exactly. */
export interface CustomerQuotationHttpView {
  readonly quotationCode: string;
  readonly versionId: string;
  readonly version: number;
  readonly status: string;
  readonly quotationStatus: string;
  readonly currencyCode: string;
  readonly quantityTotal: number;
  readonly subtotalAmount: string;
  readonly manualAdjustmentAmount: string;
  readonly shippingFeeAmount: string;
  readonly totalAmount: string;
  readonly depositPercent: string;
  readonly depositAmount: string;
  readonly remainingAmount: string;
  readonly lineItems: readonly {
    readonly position: number;
    readonly lineKind: string;
    readonly description: string;
    readonly quantity: number;
    readonly unitPriceAmount: string;
    readonly lineTotalAmount: string;
  }[];
  readonly sentAt: string | null;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly expired: boolean;
  readonly accessExpiresAt: string;
}
