/**
 * The two committed customer decisions, as the browser sees them
 * (`APP6-B05` §21).
 *
 * These classes exist for OpenAPI: the generated client's types come from them,
 * so every property here is one an anonymous browser holding a valid secure link
 * is allowed to see. The runtime views live beside the use cases that build them
 * — keeping both in one file would make it easy to add a property to the
 * response and forget the schema, or the reverse.
 *
 * Two classes rather than one with optional halves, for the reason
 * `quotation-decision.view.ts` gives: an acceptance and a rejection commit
 * different facts, and a shared class would publish `acceptedTotalAmount` as
 * nullable to a screen that must never render it after a rejection.
 *
 * ### What is absent, and why each one is absent
 *
 * **Credentials and identity.** No token, digest, `grantId`, `scopeKind`,
 * `customerId`, `customRequestId` or `quotationId`. The response echoes back
 * nothing that was presented to obtain it. The sharpest of these is
 * `stepUpChallengeId`: it is the proof the acceptance was authorised by, it is
 * written to TBL-053 under a foreign key, and publishing it would hand a caller
 * the id of a verification row belonging to a contact they never named.
 *
 * **Audit and idempotency internals.** No audit event id, no acceptance row id,
 * no `idempotency_records` id, no correlation id. `replayed` is the one thing
 * the idempotency layer is allowed to say, and it says a fact about *this call*
 * rather than about a record.
 *
 * **Downstream promises.** No order, order id, payment obligation, payment
 * instruction, deposit due date or inventory reservation. APP6 stops before
 * every one of them (`APP6-B05` §16), and a field here implying otherwise would
 * be a commitment the transaction did not make.
 *
 * **The Custom Request's state, on the rejection response.** Deliberately
 * absent; see {@link QuotationRejectedResponse}.
 *
 * ### Amounts are `string`, in OpenAPI too
 *
 * `type: String` on `acceptedTotalAmount` is the contract, not a serialisation
 * detail. A `number` would be published as a JSON number, the generated client
 * would type it `number`, and the exact VND figure the customer agreed to would
 * round-trip through an IEEE-754 double on the way to their confirmation screen
 * — the loss `APP6-G01` §6.2 forbids.
 */
import { ApiProperty } from '@nestjs/swagger';
import { schema } from '@embroidery/database';

const VERSION_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';

export class QuotationAcceptedResponse {
  @ApiProperty({
    format: 'uuid',
    example: VERSION_ID_EXAMPLE,
    description:
      'The exact version that was accepted — the one this request named, re-proved current ' +
      'inside the accepting transaction. Never a version the server substituted.',
  })
  versionId!: string;

  @ApiProperty({ example: 2, description: 'The version number within this quotation.' })
  version!: number;

  @ApiProperty({
    enum: schema.QUOTATION_VERSION_STATES,
    example: 'ACCEPTED',
    description: 'The stored LC-13 state after the move.',
  })
  versionStatus!: string;

  @ApiProperty({
    enum: schema.QUOTATION_STATES,
    example: 'ACCEPTED',
    description: 'The stored LC-12 header state after the move, read back off the row.',
  })
  quotationStatus!: string;

  @ApiProperty({
    enum: schema.CUSTOM_REQUEST_STATES,
    example: 'QUOTE_ACCEPTED',
    description:
      'The custom request’s state after the **same** transaction. It moves as a system ' +
      'projection of the committed acceptance, never as something the caller asked for, and ' +
      'it is read back off the transitioned row rather than assumed.',
  })
  requestStatus!: string;

  @ApiProperty({
    type: String,
    example: '1550000.00',
    description:
      'Exactly the figure recorded as accepted, in exact `numeric(14,2)` VND and always a ' +
      'string. It is the frozen version’s own total, copied off the row inside the ' +
      'transaction — never recomputed, re-rounded or re-priced.',
  })
  acceptedTotalAmount!: string;

  @ApiProperty({ example: 'VND', description: 'Fixed by the schema; no currency is selectable.' })
  currencyCode!: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-08-21T09:00:00.000Z',
    description: 'When the acceptance committed. The same instant the evidence row records.',
  })
  acceptedAt!: string;

  @ApiProperty({
    example: false,
    description:
      'Whether this call re-served an earlier acceptance of the same version instead of ' +
      'performing one. A double submission and a retry after a dropped response both answer ' +
      '`true`, with the identical figures: acceptance is claimed once per version, and no ' +
      'second evidence row, request transition or audit row is ever appended.',
  })
  replayed!: boolean;
}

export class QuotationRejectedResponse {
  @ApiProperty({
    format: 'uuid',
    example: VERSION_ID_EXAMPLE,
    description: 'The exact version that was declined — the one this request named.',
  })
  versionId!: string;

  @ApiProperty({ example: 2, description: 'The version number within this quotation.' })
  version!: number;

  @ApiProperty({
    enum: schema.QUOTATION_VERSION_STATES,
    example: 'REJECTED',
    description:
      'The stored LC-13 state after the move. This terminal state **is** the record of the ' +
      'decision: there is no rejection evidence table and no rejection idempotency key, so a ' +
      'repeat decision on this version is refused rather than duplicated.',
  })
  versionStatus!: string;

  @ApiProperty({
    enum: schema.QUOTATION_STATES,
    example: 'REJECTED',
    description: 'The stored LC-12 header state after the move, read back off the row.',
  })
  quotationStatus!: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-08-21T09:00:00.000Z',
    description:
      'When the rejection committed. Reported from this transaction’s own clock and kept in ' +
      'the audit trail: the version row has `accepted_at`, `superseded_at` and `expired_at` ' +
      'and no rejected timestamp.',
  })
  rejectedAt!: string;

  // No `requestStatus`. Declining a price is not the Admin moderation outcome
  // `REJECTED` means on a custom request (`APP6-B05` §13): this transaction does
  // not move the request at all, and it stays in the quotation stage where a
  // revised version can be drafted and sent. Publishing a state this operation
  // did not touch would invite a screen to render "your request was rejected",
  // which is exactly the confusion the rule exists to prevent.
}

/** The serialised shapes the controller returns; mirror the classes above exactly. */
export interface QuotationAcceptedHttpView {
  readonly versionId: string;
  readonly version: number;
  readonly versionStatus: string;
  readonly quotationStatus: string;
  readonly requestStatus: string;
  readonly acceptedTotalAmount: string;
  readonly currencyCode: string;
  readonly acceptedAt: string;
  readonly replayed: boolean;
}

export interface QuotationRejectedHttpView {
  readonly versionId: string;
  readonly version: number;
  readonly versionStatus: string;
  readonly quotationStatus: string;
  readonly rejectedAt: string;
}
