/**
 * The Admin order detail (`APP7-B02` §7, §13, §16).
 *
 * The order root the queue already publishes, plus the two frozen linkages an
 * operator navigates by and the ordered list of frozen lines.
 *
 * ### The subject is a discriminated read of the stored XOR
 *
 * `order_items` names exactly one subject — a catalog SKU or a customer-owned
 * product — under `ck_order_items__exactly_one_subject`. `subjectKind` is the
 * response-only discriminator the delivered Admin convention already uses
 * (`AdminCustomRequestQueueItemResponse.subjectKind`), derived from the row so a
 * generated client can branch without inspecting two nullable ids and guessing.
 * No enum is added to the database, no column changes, and neither id is ever
 * filled in from the other: a `CUSTOMER_OWNED` line carries no `skuId`, and no
 * Product, Variant, Side or Area identity is fabricated for it.
 *
 * ### Every display and money field is frozen
 *
 * `productName`, `variantLabel` and `sizeLabel` are `order_items` columns — what
 * the approval and the accepted quotation said at conversion, not what Catalog
 * says now. `unitPriceAmount` and `lineTotalAmount` are transported exactly as
 * `numeric(14,2)` stores them. `variantLabel` and `sizeLabel` are optional
 * because the column is nullable and `APP7-W01` writes `size_label` null on both
 * branches: no frozen source exists for it, and the only place a size lives is
 * live `product_variants`, which B02 may not read.
 *
 * ### What is absent, and why
 *
 * No payment attempt, obligation, transfer reference, expected amount, evidence
 * or provider field — `APP7-B04` owns Admin payment operations. No hold,
 * cancellation, delivery or completion evidence — those are LC-14 transitions
 * APP7 does not own, and publishing a shape for them now would fix a contract
 * before the checkpoint that fills it exists. No storage key, bucket, signed URL,
 * token, digest or session secret anywhere in this document.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { OrderState } from '@embroidery/database';

import { ORDER_ITEM_SUBJECT_KINDS } from '../../application/admin/admin-order.projection';
import type { OrderItemSubjectKind } from '../../application/admin/admin-order.projection';
import { PUBLISHED_ORDER_STATES } from './admin-order-queue.response';

const ORDER_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6081';
const REQUEST_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const CUSTOMER_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';
const QUOTATION_VERSION_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6073';
const APPROVAL_SNAPSHOT_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6074';
const SKU_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6075';
const CUSTOMER_OWNED_PRODUCT_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6076';

export class AdminOrderItemResponse {
  @ApiProperty({
    example: 1,
    description:
      'The frozen line position, dense and 1-based. Unique within the order ' +
      '(`uq_order_items__order_position`), and the order lines are always returned in.',
  })
  position!: number;

  @ApiProperty({
    enum: ORDER_ITEM_SUBJECT_KINDS,
    example: 'CATALOG',
    description:
      'Which branch of the frozen subject this line is: a catalog SKU, or a product the ' +
      'customer already owned. Never both, and never neither. Derived from the stored ids; ' +
      'no column holds it.',
  })
  subjectKind!: OrderItemSubjectKind;

  @ApiPropertyOptional({
    format: 'uuid',
    example: SKU_ID_EXAMPLE,
    description: 'The frozen SKU. Present on `CATALOG` lines only.',
  })
  skuId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    example: CUSTOMER_OWNED_PRODUCT_ID_EXAMPLE,
    description: 'The frozen customer-owned product. Present on `CUSTOMER_OWNED` lines only.',
  })
  customerOwnedProductId?: string;

  @ApiProperty({
    example: 'Áo thun cotton',
    description:
      'The product name as frozen at order creation — never a live `products` row. It keeps ' +
      'saying what the customer approved after Catalog is renamed.',
  })
  productName!: string;

  @ApiPropertyOptional({
    example: 'Trắng / L',
    description:
      'The variant label as frozen from the Approval Snapshot. Absent on customer-owned lines, ' +
      'which have no Catalog variant and are never given a fabricated one.',
  })
  variantLabel?: string;

  @ApiPropertyOptional({
    example: 'L',
    description:
      'The size label as frozen. Absent whenever the order froze none — the Approval Snapshot ' +
      'has no size column, and a value is never reconstructed from live `product_variants`.',
  })
  sizeLabel?: string;

  @ApiProperty({ example: 25, description: 'The frozen quantity of this line.' })
  quantity!: number;

  @ApiProperty({
    example: '100000.00',
    description:
      'The accepted unit price, transported exactly as stored. Never a current SKU price and ' +
      'never derived from the line total.',
  })
  unitPriceAmount!: string;

  @ApiProperty({
    example: '2500000.00',
    description:
      'The accepted line total, transported exactly as stored. Never recomputed as ' +
      '`unitPriceAmount × quantity`.',
  })
  lineTotalAmount!: string;

  @ApiProperty({ example: 'VND', description: 'The frozen currency of this line.' })
  currencyCode!: string;

  @ApiProperty({
    format: 'uuid',
    example: APPROVAL_SNAPSHOT_ID_EXAMPLE,
    description:
      'The exact approval evidence that authorized this line (D7-07). Immutable, unlike the ' +
      'order’s own `currentApprovalSnapshotId`, which is an audited pointer that a ' +
      'post-approval revision may move.',
  })
  approvalSnapshotId!: string;
}

export class AdminOrderDetailResponse {
  @ApiProperty({ format: 'uuid', example: ORDER_ID_EXAMPLE })
  orderId!: string;

  @ApiProperty({ example: 'ORD-7K3MPQ2XVD' })
  code!: string;

  @ApiProperty({ enum: PUBLISHED_ORDER_STATES, example: 'AWAITING_DEPOSIT' })
  status!: OrderState;

  @ApiProperty({ format: 'uuid', example: REQUEST_ID_EXAMPLE })
  customRequestId!: string;

  @ApiProperty({ format: 'uuid', example: CUSTOMER_ID_EXAMPLE })
  customerId!: string;

  @ApiProperty({
    format: 'uuid',
    example: QUOTATION_VERSION_ID_EXAMPLE,
    description:
      'The exact accepted quotation version this order froze its commercial basis from ' +
      '(REL-073). Never `quotations.current_version_id`, which is a mutable pointer.',
  })
  acceptedQuotationVersionId!: string;

  @ApiProperty({
    format: 'uuid',
    example: APPROVAL_SNAPSHOT_ID_EXAMPLE,
    description:
      'The order’s current approval snapshot (REL-074) — an audited pointer, reported as ' +
      'stored. Each line carries its own immutable `approvalSnapshotId` beside it.',
  })
  currentApprovalSnapshotId!: string;

  @ApiProperty({
    example: '2550000.00',
    description: 'The frozen order total, transported exactly as stored.',
  })
  totalAmount!: string;

  @ApiProperty({ example: 'VND' })
  currencyCode!: string;

  @ApiProperty({ format: 'date-time', example: '2026-08-20T09:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', example: '2026-08-20T09:00:00.000Z' })
  updatedAt!: string;

  @ApiProperty({
    type: [AdminOrderItemResponse],
    description: 'The frozen lines, in `position` order.',
  })
  items!: AdminOrderItemResponse[];
}

/** The serialized projection. The only place these instants become strings. */
export interface AdminOrderDetailPayload {
  readonly orderId: string;
  readonly code: string;
  readonly status: OrderState;
  readonly customRequestId: string;
  readonly customerId: string;
  readonly acceptedQuotationVersionId: string;
  readonly currentApprovalSnapshotId: string;
  readonly totalAmount: string;
  readonly currencyCode: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly items: readonly {
    readonly position: number;
    readonly subjectKind: OrderItemSubjectKind;
    readonly skuId: string | undefined;
    readonly customerOwnedProductId: string | undefined;
    readonly productName: string;
    readonly variantLabel: string | undefined;
    readonly sizeLabel: string | undefined;
    readonly quantity: number;
    readonly unitPriceAmount: string;
    readonly lineTotalAmount: string;
    readonly currencyCode: string;
    readonly approvalSnapshotId: string;
  }[];
}
