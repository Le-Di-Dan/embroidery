/**
 * The Admin projection of one custom request (`APP5-B04` §9, §10, §14).
 *
 * Wider than `APP5-B03`'s customer projection on purpose — an operator decides
 * from this — and bounded in three directions that are not negotiable.
 *
 * **Credentials.** No token, no token digest, no grant, no session secret, no
 * `session_secret_hash`, no verification challenge, no idempotency key. The
 * design session appears as its **id** only: `design_sessions` records that the
 * raw session id is never an authorization input on its own, and the secret hash
 * is not selected by any statement behind this response.
 *
 * **Object storage.** No bucket, no object key, no internal path, no checksum
 * and no signed URL. B04 publishes no binary route (§9.4), so an attachment is
 * described — media type, size, state — and never located.
 *
 * **APP6+ business content.** No quotation, price, design version, payment,
 * order or production field, and no `availableActions`: `APP5-B05` owns
 * lifecycle enforcement, and a transition table computed in a read DTO would be
 * a second authority on what is allowed (§11).
 *
 * The one distinction this file exists to preserve is `internalReason` versus
 * `customerVisibleReason`. They are two properties with two names on every type
 * below, including each history entry, because `APP5-B05` has to write both
 * halves and a merged field would make the split unrecoverable.
 */
import { ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import type { CustomRequestState } from '@embroidery/database';

import { REQUEST_INTAKE_ROLES } from '../../domain/intake/request-intake.policy';
import type { AdminRequestSubject } from '../../application/admin/admin-request.projection';
import { PUBLISHED_REQUEST_STATES } from './admin-custom-request-queue.response';

const REQUEST_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const CUSTOMER_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';
const PRODUCT_ID_EXAMPLE = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07';
const VARIANT_ID_EXAMPLE = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e08';
const ASSET_ID_EXAMPLE = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e09';
const SESSION_ID_EXAMPLE = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e0a';
const ADMIN_ID_EXAMPLE = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e0b';

export class AdminRequestContactResponse {
  @ApiProperty({ enum: ['EMAIL', 'PHONE'], example: 'EMAIL' })
  kind!: string;

  @ApiProperty({
    example: 'b***@vidu.test',
    description: '`APP4-P01`’s deterministic mask. The raw and normalized values never appear.',
  })
  maskedValue!: string;

  @ApiProperty({ example: true })
  verified!: boolean;

  @ApiProperty({ example: true })
  primary!: boolean;
}

export class AdminRequestCustomerResponse {
  @ApiProperty({ format: 'uuid', example: CUSTOMER_ID_EXAMPLE })
  customerId!: string;

  @ApiPropertyOptional({ example: 'Nguyễn Bảy' })
  displayName?: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-08-14T09:00:00.000Z',
    description: 'When this identity came into existence. A customer exists only verified.',
  })
  verifiedAt!: string;

  @ApiProperty({
    type: [AdminRequestContactResponse],
    description: 'Current contacts only, masked. Deactivated history is not listed.',
  })
  contacts!: AdminRequestContactResponse[];
}

export class AdminCatalogSubjectResponse {
  @ApiProperty({ enum: ['CATALOG'], example: 'CATALOG' })
  kind!: 'CATALOG';

  @ApiProperty({ format: 'uuid', example: PRODUCT_ID_EXAMPLE })
  productId!: string;

  @ApiPropertyOptional({ format: 'uuid', example: VARIANT_ID_EXAMPLE })
  productVariantId?: string;

  @ApiPropertyOptional({
    example: 'Áo thun cotton',
    description: 'Absent when the product and variant no longer resolve as one coherent pair.',
  })
  productName?: string;

  @ApiPropertyOptional({ example: 'ao-thun-cotton' })
  productSlug?: string;

  @ApiPropertyOptional({ example: 'Trắng' })
  variantColorName?: string;

  @ApiPropertyOptional({ example: 'L' })
  variantSizeLabel?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    example: SESSION_ID_EXAMPLE,
    description:
      'The design session the submission came from — server-written provenance (`G01-D09`), ' +
      'shown so an operator can trace where the artwork originated. The session secret and its ' +
      'hash are never read by this surface, and the id alone authorizes nothing.',
  })
  designSessionId?: string;
}

export class AdminCustomerOwnedSubjectResponse {
  @ApiProperty({ enum: ['CUSTOMER_OWNED'], example: 'CUSTOMER_OWNED' })
  kind!: 'CUSTOMER_OWNED';

  @ApiProperty({ example: 'Áo khoác jean cá nhân' })
  name!: string;

  @ApiPropertyOptional({ example: 'Áo khoác cũ, thêu ở lưng.' })
  description?: string;

  @ApiPropertyOptional({
    example: '250.00',
    description: 'Millimetres, as a decimal string — a `numeric` column is never sent as a float.',
  })
  physicalWidthMm?: string;

  @ApiPropertyOptional({ example: '300.00' })
  physicalHeightMm?: string;
}

export class AdminRequestQuantityLineResponse {
  @ApiPropertyOptional({
    format: 'uuid',
    example: VARIANT_ID_EXAMPLE,
    description: 'Always absent on a customer-owned line, which has no catalog variant.',
  })
  productVariantId?: string;

  @ApiPropertyOptional({ example: 'L' })
  sizeLabel?: string;

  @ApiProperty({ example: 12 })
  quantity!: number;
}

export class AdminRequestAssetResponse {
  @ApiProperty({ format: 'uuid', example: ASSET_ID_EXAMPLE })
  assetId!: string;

  @ApiProperty({
    // `ATTACHMENT` exists in the schema and stays there: `G01-D14` keeps it out
    // of the APP5 contract boundary, so no APP5 request can carry one.
    enum: REQUEST_INTAKE_ROLES,
    example: 'COP_IMAGE',
    description: 'What the customer attached this file as.',
  })
  role!: string;

  @ApiProperty({ format: 'date-time', example: '2026-08-16T09:00:00.000Z' })
  linkedAt!: string;

  @ApiPropertyOptional({
    example: 'image/png',
    description: 'Absent when the file has been tombstoned; the association is still listed.',
  })
  mimeType?: string;

  @ApiPropertyOptional({
    example: '204800',
    description: 'Bytes, as a decimal string — a `bigint` is never sent as a JSON number.',
  })
  sizeBytes?: string;

  @ApiPropertyOptional({
    example: 'ACCEPTED',
    description: 'The asset’s own lifecycle state, as Asset holds it.',
  })
  status?: string;

  // No key, bucket, path, checksum, URL or inspection detail: this endpoint
  // publishes no way to fetch the binary, so a locator would point at something
  // the caller has no authorized route to.
}

export class AdminRequestTransitionResponse {
  @ApiProperty({ example: 4, description: 'The append sequence — the order moves were recorded.' })
  sequence!: number;

  @ApiProperty({ enum: PUBLISHED_REQUEST_STATES, example: 'NEW' })
  fromStatus!: CustomRequestState;

  @ApiProperty({ enum: PUBLISHED_REQUEST_STATES, example: 'UNDER_REVIEW' })
  toStatus!: CustomRequestState;

  @ApiProperty({ example: 'ADMIN', description: 'Who moved it: ADMIN, CUSTOMER or SYSTEM.' })
  actorKind!: string;

  @ApiPropertyOptional({ format: 'uuid', example: ADMIN_ID_EXAMPLE })
  actorAdminId?: string;

  @ApiPropertyOptional({ format: 'uuid', example: CUSTOMER_ID_EXAMPLE })
  actorCustomerId?: string;

  @ApiPropertyOptional({
    example: 'Ảnh mờ, không đủ chi tiết để báo giá.',
    description:
      'The internal reason recorded with the move. Staff-only, and never the same field as ' +
      '`customerVisibleReason` — the customer surface reads that one and never this.',
  })
  internalReason?: string;

  @ApiPropertyOptional({
    example: 'Xưởng cần thêm ảnh rõ hơn của sản phẩm.',
    description: 'The text written for the customer, exactly as their status page shows it.',
  })
  customerVisibleReason?: string;

  @ApiProperty({ format: 'date-time', example: '2026-08-16T10:00:00.000Z' })
  occurredAt!: string;
}

export class AdminRequestModerationNoteResponse {
  @ApiProperty({ example: 2 })
  sequence!: number;

  @ApiProperty({ enum: ['SPAM', 'REJECT', 'PAUSE', 'CLARIFY', 'NOTE'], example: 'NOTE' })
  kind!: string;

  @ApiProperty({ example: 'Khách đã gửi thêm ảnh qua Zalo.' })
  note!: string;

  @ApiProperty({ format: 'uuid', example: ADMIN_ID_EXAMPLE })
  adminId!: string;

  @ApiProperty({ format: 'date-time', example: '2026-08-16T10:05:00.000Z' })
  createdAt!: string;
}

export class AdminCustomRequestDetailResponse {
  @ApiProperty({ format: 'uuid', example: REQUEST_ID_EXAMPLE })
  requestId!: string;

  @ApiProperty({ example: 'REQ-7K3MPQ2XVD' })
  code!: string;

  @ApiProperty({ enum: PUBLISHED_REQUEST_STATES, example: 'UNDER_REVIEW' })
  status!: CustomRequestState;

  @ApiProperty({ format: 'date-time', example: '2026-08-16T09:00:00.000Z' })
  submittedAt!: string;

  @ApiProperty({ format: 'date-time', example: '2026-08-16T10:00:00.000Z' })
  updatedAt!: string;

  @ApiPropertyOptional({
    example: 'Mình muốn thêu tên ở ngực trái.',
    description: 'What the customer wrote at submission, as stored.',
  })
  customerNote?: string;

  @ApiPropertyOptional({
    example: 'Ảnh mờ, không đủ chi tiết để báo giá.',
    description:
      'The internal explanation of the **current** status, from the latest move into it — or ' +
      'from `cancelled_reason` when the request is CANCELLED. Staff-only.',
  })
  internalReason?: string;

  @ApiPropertyOptional({
    example: 'Xưởng cần thêm ảnh rõ hơn của sản phẩm.',
    description:
      'The customer-facing explanation of the current status: the exact text the customer’s own ' +
      'status page shows. Kept as a separate field from `internalReason`, never merged with it.',
  })
  customerVisibleReason?: string;

  @ApiPropertyOptional({
    type: AdminRequestCustomerResponse,
    description: 'Who sent it, with masked contacts. Absent only if the identity row is gone.',
  })
  customer?: AdminRequestCustomerResponse;

  @ApiPropertyOptional({
    description: 'A store product with its variant, or the customer-owned item. Never both.',
    oneOf: [
      { $ref: getSchemaPath(AdminCatalogSubjectResponse) },
      { $ref: getSchemaPath(AdminCustomerOwnedSubjectResponse) },
    ],
    discriminator: { propertyName: 'kind' },
  })
  subject?: AdminCatalogSubjectResponse | AdminCustomerOwnedSubjectResponse;

  @ApiProperty({ type: [AdminRequestQuantityLineResponse] })
  quantities!: AdminRequestQuantityLineResponse[];

  @ApiProperty({ example: 24, description: 'Units across every line.' })
  totalQuantity!: number;

  @ApiProperty({ type: [AdminRequestAssetResponse] })
  assets!: AdminRequestAssetResponse[];

  @ApiProperty({
    type: [AdminRequestTransitionResponse],
    description:
      'The whole recorded history, oldest first by append sequence. Submission writes no ' +
      'transition row (`G01-D05`), so a request nobody has moderated has an empty history and ' +
      'no synthetic creation entry.',
  })
  transitions!: AdminRequestTransitionResponse[];

  @ApiProperty({
    type: [AdminRequestModerationNoteResponse],
    description: 'Internal notes, oldest first. Read-only here; `APP5-B05` appends them.',
  })
  moderationNotes!: AdminRequestModerationNoteResponse[];
}

/** The serialized projection. The only place these instants become strings. */
export interface AdminCustomRequestDetailPayload {
  readonly requestId: string;
  readonly code: string;
  readonly status: string;
  readonly submittedAt: string;
  readonly updatedAt: string;
  readonly customerNote: string | undefined;
  readonly internalReason: string | undefined;
  readonly customerVisibleReason: string | undefined;
  readonly customer:
    | {
        readonly customerId: string;
        readonly displayName: string | undefined;
        readonly verifiedAt: string;
        readonly contacts: readonly {
          readonly kind: string;
          readonly maskedValue: string;
          readonly verified: boolean;
          readonly primary: boolean;
        }[];
      }
    | undefined;
  readonly subject: AdminRequestSubject | undefined;
  readonly quantities: readonly {
    readonly productVariantId: string | undefined;
    readonly sizeLabel: string | undefined;
    readonly quantity: number;
  }[];
  readonly totalQuantity: number;
  readonly assets: readonly {
    readonly assetId: string;
    readonly role: string;
    readonly linkedAt: string;
    readonly mimeType: string | undefined;
    readonly sizeBytes: string | undefined;
    readonly status: string | undefined;
  }[];
  readonly transitions: readonly {
    readonly sequence: number;
    readonly fromStatus: string;
    readonly toStatus: string;
    readonly actorKind: string;
    readonly actorAdminId: string | undefined;
    readonly actorCustomerId: string | undefined;
    readonly internalReason: string | undefined;
    readonly customerVisibleReason: string | undefined;
    readonly occurredAt: string;
  }[];
  readonly moderationNotes: readonly {
    readonly sequence: number;
    readonly kind: string;
    readonly note: string;
    readonly adminId: string;
    readonly createdAt: string;
  }[];
}
