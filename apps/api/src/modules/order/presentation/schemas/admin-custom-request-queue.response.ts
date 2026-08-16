/**
 * The Admin request queue row (`APP5-B04` §5, §14).
 *
 * These classes exist for OpenAPI: the generated client's types come from them.
 * The runtime view lives beside the query that builds it, so a property cannot
 * be added to one and forgotten in the other.
 *
 * ### What a queue row does not carry, and why
 *
 * **No APP6+ business content.** No quotation, price, design version, payment,
 * order or production field. `APP5-G01` §10 excludes all of it and B04 may not
 * pre-empt a shape those phases have not defined.
 *
 * **No moderation evidence.** No transition history, no moderation note, no
 * internal reason. Those are the detail read's, opened deliberately for one
 * request, not a column in a list an operator scans.
 *
 * **No attachment array and no storage metadata.** A queue row says what a
 * request is for, not which files came with it; there is no key, bucket, path,
 * checksum or signed URL anywhere in this document.
 *
 * **No credential and no contact value.** No grant, token, digest, session
 * secret, challenge or idempotency key, and no email or phone number — masked or
 * otherwise. The row names the customer; the detail read shows their masked
 * contacts.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CustomRequestState } from '@embroidery/database';

import { REQUEST_SUBJECT_KINDS } from './admin-custom-request.request';

const REQUEST_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const CUSTOMER_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';

/**
 * The published lifecycle vocabulary.
 *
 * Declared as a local tuple for the reason `custom-request-status.response.ts`
 * records: the schema package re-exports its unions as **types only**, so a
 * presentation file cannot take the runtime tuple without pulling an ORM value
 * into the API's domain-facing layer. All ten LC-11 states are published because
 * the queue reports the **stored** status.
 */
export const PUBLISHED_REQUEST_STATES = [
  'NEW',
  'UNDER_REVIEW',
  'NEEDS_CLARIFICATION',
  'QUOTED',
  'QUOTE_ACCEPTED',
  'DIGITIZING',
  'DESIGN_REVIEW',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const satisfies readonly CustomRequestState[];

/** Compile-time proof the published list omits no canonical state. */
export type PublishedAdminStatesAreComplete =
  Exclude<CustomRequestState, (typeof PUBLISHED_REQUEST_STATES)[number]> extends never
    ? true
    : never;

export class AdminCustomRequestQueueItemResponse {
  @ApiProperty({ format: 'uuid', example: REQUEST_ID_EXAMPLE })
  requestId!: string;

  @ApiProperty({
    example: 'REQ-7K3MPQ2XVD',
    description: 'The human request code. Display and search only — it never authorizes anything.',
  })
  code!: string;

  @ApiProperty({
    enum: PUBLISHED_REQUEST_STATES,
    example: 'NEW',
    description: 'The current lifecycle state, reported as stored.',
  })
  status!: CustomRequestState;

  @ApiProperty({
    enum: REQUEST_SUBJECT_KINDS,
    example: 'CATALOG',
    description:
      'Which branch of the `APP5-G01` §3 XOR this request is: a store product, or an item the ' +
      'customer already owns. Never both, and never neither.',
  })
  subjectKind!: (typeof REQUEST_SUBJECT_KINDS)[number];

  @ApiPropertyOptional({
    example: 'Áo thun cotton',
    description:
      'The product name, or the customer-owned item’s name. Absent when the catalog product no ' +
      'longer resolves — reported as missing rather than filled in, so the queue never names a ' +
      'subject the request does not have.',
  })
  subjectSummary?: string;

  @ApiProperty({ format: 'uuid', example: CUSTOMER_ID_EXAMPLE })
  customerId!: string;

  @ApiPropertyOptional({
    example: 'Nguyễn Bảy',
    description: 'The name the customer gave, when they gave one. No contact value appears here.',
  })
  customerDisplayName?: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-08-16T09:00:00.000Z',
    description: 'When the request was submitted. Creation writes no transition row (`G01-D05`).',
  })
  submittedAt!: string;

  @ApiProperty({
    example: 24,
    description: 'Units across every quantity line. Zero when the request carries none.',
  })
  totalQuantity!: number;
}

export class AdminCustomRequestQueueResponse {
  @ApiProperty({ type: [AdminCustomRequestQueueItemResponse] })
  items!: AdminCustomRequestQueueItemResponse[];

  @ApiPropertyOptional({
    description: 'Opaque keyset cursor for the next page. Absent on the last page.',
  })
  nextCursor?: string;

  @ApiProperty({ description: 'True when a further page exists.' })
  hasNext!: boolean;

  @ApiProperty({
    enum: PUBLISHED_REQUEST_STATES,
    isArray: true,
    example: ['NEW', 'UNDER_REVIEW', 'NEEDS_CLARIFICATION'],
    description:
      'The statuses this page was actually filtered by — the requested ones, or the default ' +
      'triage set when none were named. Echoed so the screen can state what it is showing ' +
      'instead of implying the queue is the whole table.',
  })
  appliedStatuses!: CustomRequestState[];
}

/** The serialized projection. The only place these instants become strings. */
export interface AdminCustomRequestQueueViewPayload {
  readonly items: readonly {
    readonly requestId: string;
    readonly code: string;
    readonly status: CustomRequestState;
    readonly subjectKind: (typeof REQUEST_SUBJECT_KINDS)[number];
    readonly subjectSummary: string | undefined;
    readonly customerId: string;
    readonly customerDisplayName: string | undefined;
    readonly submittedAt: string;
    readonly totalQuantity: number;
  }[];
  readonly nextCursor: string | undefined;
  readonly hasNext: boolean;
  readonly appliedStatuses: readonly CustomRequestState[];
}
