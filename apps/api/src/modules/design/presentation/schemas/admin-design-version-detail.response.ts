/**
 * What the exact-version Admin detail read returns (`APP6-A02` §7).
 *
 * A **separate** class from `DesignVersionResponse` rather than an extension of
 * it, and deliberately so. The list response is a history row: it publishes no
 * document, no hash and no feedback, and `APP6-B08`'s own contract note says
 * why. Making this one inherit from it would mean any field added for a *list*
 * silently joins a response that carries a customer's artwork, and any field
 * added here would have to be justified for a screen that only draws rows. The
 * overlap is copied on purpose; the two contracts are allowed to diverge.
 *
 * ### The document is the one P01 component, referenced
 *
 * `document` carries the `APP3-B08-C1` publication marker, exactly as
 * `AdminSubmittedDesignResponse` and `DesignSessionSnapshotResponse` do. There
 * is one structural definition of a Design Document in this repository, derived
 * from `APP3-P01`'s TypeScript types, and nothing here restates a field of it —
 * a second Admin-flavoured document schema would drift from the customer-facing
 * one the first time an element kind is added. Both governed schema versions
 * reach this response unchanged: v1 on the Catalog branch, v2 on the
 * customer-owned one.
 *
 * ### Every nullable field states its type
 *
 * `nullable: true` without an explicit `type` publishes `type: object` — Nest
 * has no runtime type for a `string | null` union — and Orval turns that into an
 * index signature. Each nullable property therefore carries its type
 * explicitly, so the document says `string | null` and the generated client says
 * the same. This is `FU-APP6-B02-NULLABLE-OBJECT-TYPE-DEBT-01` avoided rather
 * than inherited.
 *
 * ### What is absent, on every branch of it
 *
 * No session secret, cookie or digest. No secure-link token, grant id or
 * step-up challenge id — `reverified` is the boolean the presence of that
 * evidence reduces to, and the id it was derived from never leaves the
 * repository adapter. No customer id. No storage key, bucket, provider URL,
 * presign, preview hash or derivative id. No audit or outbox internals. No
 * order, payment, inventory or production data: `APP7` has not run.
 */
import { ApiProperty } from '@nestjs/swagger';

import {
  DESIGN_DOCUMENT_SCHEMA_NAME,
  PUBLISHED_SCHEMA_MARKER,
} from '../../../../openapi/design-document-schema.augmentation';

const VERSION_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const CASE_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';
const PLACEMENT_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6073';
const HASH_EXAMPLE = 'sha256:8f14e45fceea167a5a36dedd4bea2543b6b4a3a1a7f7d2b0f4c8e9d1a2b3c4d5';

const NULLABLE_ID = {
  type: String,
  format: 'uuid',
  nullable: true,
  example: PLACEMENT_ID_EXAMPLE,
} as const;

const NULLABLE_INSTANT = { type: String, format: 'date-time', nullable: true } as const;

/**
 * The `document` property, carrying the `APP3-B08-C1` publication marker.
 *
 * Declared as a variable rather than inline for the reason
 * `admin-submitted-design.response.ts` records: the marker is a vendor
 * extension, `ApiPropertyOptions` describes only the keys Swagger defines, and a
 * fresh object literal would be rejected by excess-property checking even though
 * the decorator passes unknown keys through. The `type`/`additionalProperties`
 * pair is a placeholder — document assembly replaces this whole node with a
 * reference to the generated `DesignDocument` component, and the gate fails if
 * it does not.
 */
const DOCUMENT_PROPERTY = {
  type: 'object' as const,
  additionalProperties: true,
  description:
    'The Design Document of this exact version, returned exactly as persisted. Nothing is ' +
    'migrated, rewritten or re-canonicalized on read.',
  [PUBLISHED_SCHEMA_MARKER]: DESIGN_DOCUMENT_SCHEMA_NAME,
};

export class DesignVersionDetailReviewResponse {
  @ApiProperty({
    enum: ['APPROVE', 'REQUEST_REVISION'],
    description:
      'The decision the customer actually recorded. Never inferred from the version status.',
  })
  outcome!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  decidedAt!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Chữ hơi nhỏ, nhờ anh chị phóng to giúp em.',
    description:
      'The customer’s own words, exactly as recorded on the decision. Never an audit summary, ' +
      'an outbox payload or a rephrasing. `null` for an approval and for a revision request ' +
      'that carried no message.',
  })
  feedback!: string | null;
}

export class ApprovalAgreementResponse {
  @ApiProperty({
    example: 'PAYMENT_POLICY',
    description: 'The agreement type this acceptance was captured for.',
  })
  agreementType!: string;

  @ApiProperty({
    example: HASH_EXAMPLE,
    description:
      'The exact content hash `GRD-008` bound the acceptance to. This identifies the accepted ' +
      'agreement version; the publication-side version integer is deliberately not published ' +
      'here, because reading it would mean reaching into the agreements aggregate’s mutable ' +
      'publication state from a card whose premise is frozen evidence.',
  })
  contentHash!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  acceptedAt!: string;
}

export class ApprovalEvidenceResponse {
  @ApiProperty({
    example: HASH_EXAMPLE,
    description:
      'The document hash frozen into the approval. Equal to the version’s stored hash by ' +
      'construction (`G-DB7-14`/`GRD-007`); nothing recomputes it on read.',
  })
  documentHash!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  approvedAt!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Nguyễn Thị Mai',
    description:
      'The customer’s display name **as frozen at approval**, not as it stands now. `null` when ' +
      'the customer never gave one.',
  })
  customerDisplayName!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'm***@vidu.com',
    description:
      'The frozen contact, masked. The full normalized value is never published and never ' +
      'reaches this response type.',
  })
  maskedEmail!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '+84 ***** 5678',
    description: 'See `maskedEmail`.',
  })
  maskedPhone!: string | null;

  @ApiProperty({
    description:
      'Whether the approval committed step-up re-verification evidence. A boolean, because the ' +
      'challenge identifier it is derived from is a credential reference and is never published.',
  })
  reverified!: boolean;

  @ApiProperty({
    example: 'Áo thun cotton',
    description:
      'The product name frozen at approval — the catalog name on the catalog branch, the ' +
      'customer’s own words for their garment on the customer-owned one. A later rename does ' +
      'not rewrite it.',
  })
  productName!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Trắng / L',
    description:
      'Always `null` on the customer-owned branch — not because a variant could not be found, ' +
      'but because a customer-owned product has none.',
  })
  variantLabel!: string | null;

  @ApiProperty({ example: 'Ngực trái', description: 'The placement side, frozen at approval.' })
  sideName!: string;

  @ApiProperty({ example: 'Vùng thêu ngực', description: 'The placement area, frozen.' })
  areaName!: string;

  @ApiProperty({
    type: String,
    example: '120.00',
    description:
      'The frozen embroidery dimensions. On the customer-owned branch these are the version’s ' +
      'placement envelope copied at approval — never the customer item’s own size.',
  })
  physicalWidthMm!: string;

  @ApiProperty({ type: String, example: '80.00', description: 'See `physicalWidthMm`.' })
  physicalHeightMm!: string;

  @ApiProperty({ example: 50, description: 'The request’s quantity total, frozen at approval.' })
  quantityTotal!: number;

  @ApiProperty({
    enum: ['CATALOG', 'CUSTOMER_OWNED'],
    description:
      'The snapshot’s own placement branch. No catalog identity is fabricated for a ' +
      'customer-owned approval.',
  })
  branch!: string;

  @ApiProperty({
    type: [ApprovalAgreementResponse],
    description: 'The agreement versions the customer accepted, as `GRD-008` captured them.',
  })
  agreements!: ApprovalAgreementResponse[];
}

export class DesignVersionDetailResponse {
  @ApiProperty({ format: 'uuid', example: VERSION_ID_EXAMPLE })
  versionId!: string;

  @ApiProperty({ format: 'uuid', example: CASE_ID_EXAMPLE })
  designCaseId!: string;

  @ApiProperty({ example: 1, description: 'Monotonic within the design case.' })
  version!: number;

  @ApiProperty({
    enum: ['DRAFT', 'SENT_FOR_REVIEW', 'REVISION_REQUESTED', 'APPROVED', 'SUPERSEDED', 'VOID'],
    description: 'LC-08 state.',
  })
  status!: string;

  @ApiProperty({
    ...NULLABLE_ID,
    description: 'The version this one continues, or `null` at the root of the chain.',
  })
  parentVersionId!: string | null;

  @ApiProperty({
    example: 1,
    description:
      'The design-document schema version governing this version. 1 on the catalog branch; 2 ' +
      'on the customer-owned branch.',
  })
  documentSchemaVersion!: number;

  @ApiProperty({
    enum: ['CATALOG', 'CUSTOMER_OWNED'],
    description: 'Derived from the persisted placement; never stored, never accepted.',
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
    description: 'Customer-owned branch only: the agreed placement side, as frozen evidence.',
  })
  placementSideLabel!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Vùng thêu ngực',
    description: 'Customer-owned branch only: the agreed placement area.',
  })
  placementAreaLabel!: string | null;

  @ApiProperty({
    type: String,
    example: '120.00',
    description:
      'Exact `numeric` millimetres, always a string. On the customer-owned branch this is the ' +
      'version’s embroidery placement envelope, never the customer item’s own dimensions.',
  })
  physicalWidthMm!: string;

  @ApiProperty({ type: String, example: '80.00', description: 'See `physicalWidthMm`.' })
  physicalHeightMm!: string;

  @ApiProperty({
    description:
      'True when the design case’s own current-version pointer names this version. This is the ' +
      '*current authored* version, which is not the same thing as the version a customer is ' +
      'currently reviewing.',
  })
  current!: boolean;

  @ApiProperty(NULLABLE_INSTANT)
  sentAt!: string | null;

  @ApiProperty(NULLABLE_INSTANT)
  approvedAt!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: HASH_EXAMPLE,
    description:
      'The hash stored when the version was sent for review. `null` on a draft that has never ' +
      'been sent — an absence, never a freshly computed digest.',
  })
  documentHash!: string | null;

  @ApiProperty(DOCUMENT_PROPERTY)
  document!: unknown;

  @ApiProperty({
    type: [DesignVersionDetailReviewResponse],
    description:
      'Customer decisions on this exact version, oldest first. Empty before any decision; never ' +
      'populated by inference from the version status.',
  })
  reviews!: DesignVersionDetailReviewResponse[];

  @ApiProperty({
    type: ApprovalEvidenceResponse,
    nullable: true,
    description:
      'The immutable Approval Snapshot for this exact version, or `null` when it has never been ' +
      'approved. Every field is read from the snapshot itself, never re-resolved from the ' +
      'current customer, catalog or request rows.',
  })
  approval!: ApprovalEvidenceResponse | null;
}

/**
 * The serialized payload, as the controller returns it.
 *
 * The version **is** the payload: `data` carries its fields directly rather than
 * a `{ version: … }` wrapper. That matches what `envelopeSchemaOf` publishes for
 * this operation, and the two must agree — a wrapper here with an unwrapped
 * schema is a contract the generated client cannot read, which is precisely the
 * divergence the browser pass found after every green suite had missed it.
 *
 * `APP6-B08`'s create is the other convention and stays correct on its own
 * terms: it declares `DesignVersionCreatedResponse`, a *named* schema whose one
 * field is `version`, so its wrapper is in the contract rather than beside it.
 */
export type DesignVersionDetailPayload = DesignVersionDetailResponse;
