/**
 * The customer projection of one custom request (`APP5-B03` §6, §8, §9).
 *
 * These classes exist for OpenAPI: the generated client's types come from them,
 * so every property here is one an anonymous browser holding a valid secure link
 * is allowed to see. The runtime view lives beside the query that builds it —
 * keeping both in one file would make it easy to add a property to the response
 * and forget the schema, or the reverse.
 *
 * ### What is absent, and why each one is absent
 *
 * **Moderation internals.** No `reason` and no `cancelled_reason` — the internal
 * halves of COL-TBL037-08/09 — and no moderation note of any kind. TBL-041 is
 * labelled *internal · append only* on the approved design and is not read by
 * this surface at all. Only `customerVisibleReason` crosses, and only for the
 * three statuses `APP5-G01` §8 maps to a customer-facing message.
 *
 * **Staff and audit identity.** No `admin_id`, no staff name, no `actor_kind`,
 * no transition actor reference, no `audit_events` row and no `correlation_id`.
 * The transition history itself is Admin evidence (`APP5-B04`), not a customer
 * timeline; this response carries the current status and nothing about who moved
 * it there.
 *
 * **Storage.** No bucket, no object key, no internal path, no checksum, no MIME
 * type, no byte size, no inspection or scanner output, and no signed URL.
 * `APP5-B03` adds no binary-delivery route, so an asset is an id and a role: what
 * the customer attached, not how to fetch it.
 *
 * **Credentials and sessions.** No token, no digest, no `grantId`, no
 * `customerId`, no contact value, no `challengeId`, no idempotency key and no
 * `submitted_session_id` (`G01-D09` server-owned provenance). The response
 * echoes back nothing that was presented to obtain it.
 *
 * **APP6+ business content.** No quotation, no price, no design version, no
 * payment, no order and no available actions — this is a read surface and
 * `APP5-G01` §10 excludes all of it.
 */
import { ApiProperty, getSchemaPath } from '@nestjs/swagger';
import type { CustomRequestState } from '@embroidery/database';

import { REQUEST_INTAKE_ROLES } from '../../domain/intake/request-intake.policy';
import type { RequestStatusSubject } from '../../application/status/request-status.projection';

/**
 * The published lifecycle vocabulary.
 *
 * Declared here rather than imported as a value, on the rule
 * `secure-link-resolution.response.ts` records: the schema package re-exports
 * its unions as **types only**, so a presentation file cannot take the runtime
 * tuple without pulling an ORM value into the API's domain-facing layer.
 * `satisfies` and {@link PublishedStatesAreComplete} tie both directions to the
 * canonical union, so neither an invented state nor a forgotten one compiles.
 *
 * All ten LC-11 states are published even though APP5 owns six transitions
 * (`APP5-G01` §2): `APP5-B03` §7 requires the **stored** status, and a document
 * that enumerated only the APP5 subset would make a truthful `QUOTED` an
 * out-of-contract value for every generated client.
 */
const PUBLISHED_STATES = [
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
export type PublishedStatesAreComplete =
  Exclude<CustomRequestState, (typeof PUBLISHED_STATES)[number]> extends never ? true : never;

const REQUEST_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const PRODUCT_ID_EXAMPLE = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07';
const VARIANT_ID_EXAMPLE = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e08';
const ASSET_ID_EXAMPLE = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e09';

/**
 * The catalog branch of the subject union.
 *
 * Two members, because `APP5-G01` §3's invariant admits exactly two and the
 * request row physically cannot express a third: the catalog columns and the
 * TBL-038 child are mutually exclusive. The `kind` literal on each class is the
 * discriminator; there is no shared base class, so a consumer cannot read a
 * catalog field off a customer-owned subject.
 */
export class CatalogRequestSubjectResponse {
  @ApiProperty({ enum: ['CATALOG'], example: 'CATALOG' })
  kind!: 'CATALOG';

  @ApiProperty({
    example: PRODUCT_ID_EXAMPLE,
    description: 'The store product this request is for.',
  })
  productId!: string;

  @ApiProperty({
    required: false,
    nullable: true,
    example: VARIANT_ID_EXAMPLE,
    description: 'The variant the quantities are keyed to (`G01-D08`).',
  })
  productVariantId?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'Áo thun cotton',
    description:
      'Absent only when the catalog rows can no longer be resolved as one coherent pair. ' +
      'Reported as missing rather than filled in, so the page never names the wrong product.',
  })
  productName?: string | null;

  @ApiProperty({ required: false, nullable: true, example: 'ao-thun-cotton' })
  productSlug?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'Trắng',
    description: 'The variant colour attribute as stored; variants carry no single name column.',
  })
  variantColorName?: string | null;

  @ApiProperty({ required: false, nullable: true, example: 'L' })
  variantSizeLabel?: string | null;
}

export class CustomerOwnedRequestSubjectResponse {
  @ApiProperty({ enum: ['CUSTOMER_OWNED'], example: 'CUSTOMER_OWNED' })
  kind!: 'CUSTOMER_OWNED';

  @ApiProperty({ example: 'Áo khoác jean cá nhân' })
  name!: string;

  @ApiProperty({ required: false, nullable: true, example: 'Áo khoác cũ, thêu ở lưng.' })
  description?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: '250.00',
    description: 'Millimetres, as a decimal string — a `numeric` column is never sent as a float.',
  })
  physicalWidthMm?: string | null;

  @ApiProperty({ required: false, nullable: true, example: '300.00' })
  physicalHeightMm?: string | null;
}

export class RequestQuantityLineResponse {
  @ApiProperty({
    required: false,
    nullable: true,
    example: VARIANT_ID_EXAMPLE,
    description: 'Always null on a customer-owned-product line, which has no catalog variant.',
  })
  productVariantId?: string | null;

  @ApiProperty({ required: false, nullable: true, example: 'L' })
  sizeLabel?: string | null;

  @ApiProperty({ example: 12, description: 'Units for this line, as submitted.' })
  quantity!: number;
}

export class RequestAssetResponse {
  @ApiProperty({ format: 'uuid', example: ASSET_ID_EXAMPLE })
  assetId!: string;

  @ApiProperty({
    // The two roles APP5 exposes. `ATTACHMENT` exists in the schema and stays
    // there: `G01-D14` keeps it out of the APP5 contract boundary, so no APP5
    // request can carry one and publishing it would document a value this
    // surface can never return.
    enum: REQUEST_INTAKE_ROLES,
    example: 'COP_IMAGE',
    description: 'What the customer attached this file as.',
  })
  role!: string;

  // No URL, key, media type, size, checksum or inspection result: this endpoint
  // publishes no way to fetch the binary, so metadata describing one would
  // describe something unreachable.
}

export class CustomRequestStatusResponse {
  @ApiProperty({ example: REQUEST_ID_EXAMPLE })
  requestId!: string;

  @ApiProperty({
    example: 'REQ-7K3MPQ2XVD',
    description:
      'The human request code, for quoting in a conversation with the workshop. Display only — ' +
      'it never opens the request, and this endpoint does not accept it.',
  })
  code!: string;

  @ApiProperty({
    enum: PUBLISHED_STATES,
    example: 'UNDER_REVIEW',
    description:
      'The current lifecycle state, reported as stored. A request that has moved beyond the ' +
      'intake states is shown in the state it is actually in; this surface offers no action ' +
      'in any of them.',
  })
  status!: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-08-16T09:00:00.000Z',
    description: 'When the request was submitted. Creation writes no transition row (`G01-D05`).',
  })
  submittedAt!: string;

  @ApiProperty({
    required: false,
    nullable: true,
    description:
      'A store product with its variant, or the customer-owned item described at submission. ' +
      'Exactly one, and never both.',
    oneOf: [
      { $ref: getSchemaPath(CatalogRequestSubjectResponse) },
      { $ref: getSchemaPath(CustomerOwnedRequestSubjectResponse) },
    ],
    discriminator: { propertyName: 'kind' },
  })
  subject?: CatalogRequestSubjectResponse | CustomerOwnedRequestSubjectResponse | null;

  @ApiProperty({ type: [RequestQuantityLineResponse] })
  quantities!: RequestQuantityLineResponse[];

  @ApiProperty({ example: 24, description: 'Units across every line. Zero when none were given.' })
  totalQuantity!: number;

  @ApiProperty({ type: [RequestAssetResponse] })
  assets!: RequestAssetResponse[];

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'Ảnh sản phẩm chưa rõ, xưởng sẽ liên hệ để xin thêm ảnh.',
    description:
      'The workshop message written for the customer, present only when the request needs ' +
      'clarification, was rejected or was cancelled. Internal moderation reasons and notes ' +
      'are never returned here.',
  })
  customerVisibleReason?: string | null;

  @ApiProperty({
    format: 'date-time',
    example: '2026-08-21T09:00:00.000Z',
    description: 'When this secure link stops working. Absolute, and never extended by reading.',
  })
  accessExpiresAt!: string;
}

/**
 * The serialized projection. The only place these instants become strings.
 *
 * `subject` is the application layer's own union rather than a restatement:
 * the two members carry only strings already, so there is nothing to convert
 * and no second definition that could drift from the one the projection
 * enforces.
 */
export interface CustomRequestStatusView {
  readonly requestId: string;
  readonly code: string;
  readonly status: string;
  readonly submittedAt: string;
  readonly subject: RequestStatusSubject | undefined;
  readonly quantities: readonly {
    readonly productVariantId: string | undefined;
    readonly sizeLabel: string | undefined;
    readonly quantity: number;
  }[];
  readonly totalQuantity: number;
  readonly assets: readonly { readonly assetId: string; readonly role: string }[];
  readonly customerVisibleReason: string | undefined;
  readonly accessExpiresAt: string;
}
