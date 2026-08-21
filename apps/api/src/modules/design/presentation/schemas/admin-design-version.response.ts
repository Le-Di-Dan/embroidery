/**
 * What the two Admin design-version operations return (`APP6-B08` §16).
 *
 * One bounded response class serves both: creating a version and listing them
 * describe the same persisted thing, and a second class differing only in which
 * fields it happened to need would drift the first time one gained a column.
 *
 * ### Every nullable field states its type
 *
 * `nullable: true` **without** an explicit `type` publishes `type: object` —
 * Nest has no runtime type for a `string | null` union — and Orval turns that
 * into an index signature. Each nullable property below therefore carries
 * `type: String` so the document says `string | null` and the generated client
 * says the same. `required: false` is deliberately **not** set: the fields are
 * always present, and their value is `null` when the fact does not exist, so a
 * client never has to distinguish "absent" from "not applicable".
 *
 * ### The branch is published as a discriminator, not as a stored column
 *
 * `branch` is derived from which placement the row actually carries. It is
 * published because a client otherwise has to infer it from which group of
 * nullable fields came back non-null — the inference this repository has already
 * had to make explicit in SQL (CST-129) and in the domain type. It is a read
 * projection: no request body accepts it, and no persisted column holds it.
 *
 * ### What is absent
 *
 * No Design Document — B07 is the source read, and a history list carrying every
 * document would ship the whole design thread on every render. No
 * `document_hash` (a DRAFT has none, and the hash is `GRD-007`'s approval
 * binding). No customer identity, contact, grant id or step-up challenge id on
 * the review entries. No storage key, preview derivative, provider reference or
 * secret anywhere.
 */
import { ApiProperty } from '@nestjs/swagger';

const VERSION_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const CASE_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';
const PLACEMENT_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6073';

/** A Catalog identity, present only on the catalog branch. */
const NULLABLE_ID = {
  type: String,
  format: 'uuid',
  nullable: true,
  example: PLACEMENT_ID_EXAMPLE,
} as const;

/** A timestamp that only exists once the version reached a given state. */
const NULLABLE_INSTANT = { type: String, format: 'date-time', nullable: true } as const;

export class DesignVersionReviewResponse {
  @ApiProperty({
    enum: ['APPROVE', 'REQUEST_REVISION'],
    description:
      'The decision the customer actually recorded. Never inferred from the version status.',
  })
  outcome!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  decidedAt!: string;
}

export class DesignVersionResponse {
  @ApiProperty({ format: 'uuid', example: VERSION_ID_EXAMPLE })
  versionId!: string;

  @ApiProperty({
    example: 1,
    description: 'Monotonic within the design case, arbitrated by a unique constraint.',
  })
  version!: number;

  @ApiProperty({
    enum: ['DRAFT', 'SENT_FOR_REVIEW', 'REVISION_REQUESTED', 'APPROVED', 'SUPERSEDED', 'VOID'],
    description: 'LC-08 state. A version created by this endpoint is always `DRAFT`.',
  })
  status!: string;

  @ApiProperty({
    ...NULLABLE_ID,
    description:
      'The version this one continues, or null at the root of the chain. Server-derived from ' +
      'the design case; no request body may name it.',
  })
  parentVersionId!: string | null;

  @ApiProperty({
    example: 1,
    description:
      'The design-document schema version governing this version. 1 on the catalog branch; ' +
      '2 on the customer-owned branch, which is the version able to express placement absence.',
  })
  documentSchemaVersion!: number;

  @ApiProperty({
    enum: ['CATALOG', 'CUSTOMER_OWNED'],
    description:
      'Derived from the persisted placement, never stored and never accepted from a client.',
  })
  branch!: string;

  @ApiProperty({ ...NULLABLE_ID, description: 'Catalog branch only.' })
  productId!: string | null;

  @ApiProperty({ ...NULLABLE_ID, description: 'Catalog branch only.' })
  productVariantId!: string | null;

  @ApiProperty({ ...NULLABLE_ID, description: 'Catalog branch only.' })
  productSideId!: string | null;

  @ApiProperty({ ...NULLABLE_ID, description: 'Catalog branch only.' })
  embroideryAreaId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Ngực trái',
    description:
      'Customer-owned branch only: the agreed placement side, as frozen human evidence. ' +
      'Null on the catalog branch, where the placement foreign keys carry the identity.',
  })
  placementSideLabel!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Vùng thêu ngực',
    description: 'Customer-owned branch only: the agreed placement area. See the side label.',
  })
  placementAreaLabel!: string | null;

  @ApiProperty({
    type: String,
    example: '120.00',
    description:
      'Exact `numeric` millimetres, always a string. On the catalog branch these are the ' +
      "Product Side's frozen dimensions; on the customer-owned branch they are this version's " +
      'embroidery placement envelope — never the customer item’s own dimensions.',
  })
  physicalWidthMm!: string;

  @ApiProperty({ type: String, example: '80.00', description: 'See `physicalWidthMm`.' })
  physicalHeightMm!: string;

  @ApiProperty({
    description: "True when the design case's own current-version pointer names this version.",
  })
  current!: boolean;

  @ApiProperty(NULLABLE_INSTANT)
  sentAt!: string | null;

  @ApiProperty(NULLABLE_INSTANT)
  approvedAt!: string | null;

  @ApiProperty({
    type: [DesignVersionReviewResponse],
    description:
      'Recorded customer decisions, oldest first. Empty for a draft and for any version nobody ' +
      'has decided on; never populated by inference.',
  })
  reviews!: DesignVersionReviewResponse[];
}

export class DesignVersionCreatedResponse {
  @ApiProperty({ type: DesignVersionResponse })
  version!: DesignVersionResponse;
}

export class DesignVersionListResponse {
  @ApiProperty({ format: 'uuid', example: CASE_ID_EXAMPLE })
  designCaseId!: string;

  @ApiProperty({
    type: [DesignVersionResponse],
    description: 'Every version of this design case, oldest first. Nothing is hidden.',
  })
  versions!: DesignVersionResponse[];
}

export interface DesignVersionCreatedPayload {
  readonly version: DesignVersionResponse;
}

export interface DesignVersionListPayload {
  readonly designCaseId: string;
  readonly versions: readonly DesignVersionResponse[];
}
