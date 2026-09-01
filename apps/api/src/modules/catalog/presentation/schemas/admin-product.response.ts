/**
 * The documented response shapes for the Admin product operations.
 *
 * These classes exist for OpenAPI only — the generated client's types come from
 * them, so every field here is a field a browser is allowed to see. The runtime
 * projection lives in `product-projection.ts`; keeping the two apart means
 * adding a property to one and forgetting the other shows up as a type error
 * rather than as a silently undocumented field.
 *
 * Deliberately absent: the physical category id, `is_indexable`, the SEO
 * columns, any storage key, bucket, checksum, derivative or inspection detail,
 * and any media URL — APP2 has no authenticated media-delivery contract, so an
 * address here would be fabricated (`FU-APP2-THUMBNAIL-01`).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CATEGORY_SLUG_PATTERN } from '../../domain/category-slug';
import { APP2_PRODUCT_MEDIA_ROLES, PRODUCT_CURRENCY } from '../../domain/product-draft.policy';

const PRODUCT_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const ASSET_ID_EXAMPLE = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07';

/**
 * The category embedded in an Admin product payload.
 *
 * `slug` stopped being a four-value enum at `APP12-C01`: the taxonomy is
 * dynamic, so the contract publishes the slug's shape. The physical category id
 * stays absent, exactly as before — the slug remains the only category identity
 * an Admin client ever handles.
 */
export class AdminProductCategoryResponse {
  @ApiProperty({
    pattern: CATEGORY_SLUG_PATTERN.source,
    description: 'The dynamic category slug this product is filed under.',
    example: 'thu-bong',
  })
  slug!: string;

  @ApiProperty({ description: 'Canonical Vietnamese label.', example: 'Thú bông' })
  name!: string;
}

export class AdminProductMediaResponse {
  @ApiProperty({ format: 'uuid', example: ASSET_ID_EXAMPLE })
  assetId!: string;

  @ApiProperty({
    enum: APP2_PRODUCT_MEDIA_ROLES,
    description: 'Derived from position: the first selected image is the THUMBNAIL.',
    example: 'THUMBNAIL',
  })
  role!: string;

  @ApiProperty({ description: 'Zero-based display position.', example: 0 })
  position!: number;

  @ApiProperty({ example: 'image/png' })
  mediaType!: string;

  @ApiProperty({ description: 'Server-measured size in bytes.', example: 51_200 })
  byteSize!: number;

  @ApiProperty({ description: 'The asset lifecycle state.', example: 'ACCEPTED' })
  status!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class AdminProductSummaryResponse {
  @ApiProperty({ format: 'uuid', example: PRODUCT_ID_EXAMPLE })
  productId!: string;

  @ApiProperty({ example: 'Thú bông gấu nâu' })
  name!: string;

  @ApiProperty({
    description: 'Server-owned public address. Immutable in APP2-B02.',
    example: 'thu-bong-gau-nau',
  })
  slug!: string;

  @ApiProperty({ enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], example: 'DRAFT' })
  status!: string;

  @ApiProperty({ type: AdminProductCategoryResponse })
  category!: AdminProductCategoryResponse;

  @ApiProperty({
    description:
      'Whole đồng as a decimal string; never a JSON number. `0` on a DRAFT means the price has not been set yet.',
    example: '0',
  })
  basePriceAmount!: string;

  @ApiProperty({ enum: [PRODUCT_CURRENCY], example: PRODUCT_CURRENCY })
  currencyCode!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({
    format: 'date-time',
    description: 'Optimistic-concurrency token; send it back as `expectedUpdatedAt`.',
  })
  updatedAt!: string;

  @ApiPropertyOptional({
    type: AdminProductMediaResponse,
    description: 'The first selected image, when one exists. Identity only — there is no URL.',
  })
  primaryMedia?: AdminProductMediaResponse;
}

export class AdminProductDetailResponse extends AdminProductSummaryResponse {
  @ApiPropertyOptional({
    description:
      'Absent when the draft has no description. On PATCH, sending null or a blank string clears it; omitting the field leaves it unchanged.',
  })
  description?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Set only for an archived product.' })
  archivedAt?: string;

  @ApiProperty({ type: [AdminProductMediaResponse], description: 'Ordered media selection.' })
  media!: AdminProductMediaResponse[];
}

export class AdminProductListResponse {
  @ApiProperty({ type: [AdminProductSummaryResponse] })
  items!: AdminProductSummaryResponse[];

  @ApiPropertyOptional({
    description: 'Opaque keyset cursor for the next page. Absent on the last page.',
  })
  nextCursor?: string;

  @ApiProperty({ description: 'True when a further page exists.' })
  hasNext!: boolean;
}
