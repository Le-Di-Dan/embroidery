/**
 * The documented response shapes of the two public catalog operations
 * (`APP2-B04`).
 *
 * These classes exist for OpenAPI, and the generated client's types come from
 * them — so every property here is a property an anonymous browser is allowed
 * to see. The runtime projection lives in `public-product.projection.ts`;
 * keeping the two apart means adding a field to one and forgetting the other
 * surfaces as a type error rather than as a silently undocumented field.
 *
 * Deliberately absent, and asserted absent by the leak scan: the product id,
 * the category id, any asset or derivative id, `product_media.id` as a
 * standalone property, storage key, bucket, checksum, provider ETag, the
 * lifecycle `status`, `archivedAt`, `createdAt`/`updatedAt` (the Admin
 * concurrency token), inspection data, and any absolute or storage URL.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CATEGORY_SLUG_PATTERN } from '../../domain/category-slug';
import { PRODUCT_CURRENCY } from '../../domain/product-draft.policy';

const SLUG_EXAMPLE = 'khan-theu-hoa-sen';
const MEDIA_PATH_EXAMPLE =
  '/api/public/products/khan-theu-hoa-sen/media/019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071/thumbnail';

/**
 * The category **embedded in a Product payload** — a name and a slug, which is
 * all a product card needs.
 *
 * `slug` stopped being a four-value enum at `APP12-C01`: the taxonomy is
 * dynamic, so the contract publishes the slug's shape and a consumer that needs
 * the current set reads `publicCategory_list`. The shape is otherwise
 * unchanged, and this schema deliberately does **not** carry `isIndexable` or
 * `displayOrder` — those belong to the inventory item, not to every product
 * summary and detail in the catalogue.
 */
export class PublicCategoryResponse {
  @ApiProperty({
    pattern: CATEGORY_SLUG_PATTERN.source,
    description:
      'The category this product is filed under. Dynamic: read `publicCategory_list` for ' +
      'the current set rather than compiling a taxonomy in.',
    example: 'khan',
  })
  slug!: string;

  @ApiProperty({ description: 'Canonical Vietnamese label.', example: 'Khăn' })
  name!: string;
}

export class PublicPriceResponse {
  @ApiProperty({
    description:
      'Whole đồng as a decimal string. A string, not a number: VND amounts are ' +
      'exact decimals and JSON numbers are IEEE-754 doubles.',
    example: '250000',
  })
  amount!: string;

  @ApiProperty({ example: PRODUCT_CURRENCY })
  currency!: string;
}

export class PublicMediaReferenceResponse {
  @ApiProperty({
    description:
      'Relative application path served by the publication-gated delivery route. ' +
      'Never a storage or CDN address, never signed, and it expires with nothing — ' +
      'the route re-checks publication on every request.',
    example: MEDIA_PATH_EXAMPLE,
  })
  url!: string;

  @ApiProperty({ enum: ['THUMBNAIL', 'GALLERY'], example: 'THUMBNAIL' })
  role!: string;

  @ApiPropertyOptional({
    description:
      'Intrinsic pixel width of the derivative `url` addresses, so a client can ' +
      'reserve the correct box before the bytes arrive. Present together with ' +
      '`height` or absent together with it. Absent means the stored derivative ' +
      'carries no dimensions, which is a legitimate historical state — it is never ' +
      'a guess and must not be replaced by one.',
    example: 800,
  })
  width?: number;

  @ApiPropertyOptional({
    description: 'Intrinsic pixel height of that same derivative. See `width`.',
    example: 800,
  })
  height?: number;

  @ApiPropertyOptional({
    description:
      'The same association at the small `thumbnail` rendition, served by the same ' +
      'publication-gated route. Present on Product **detail** media, where `url` ' +
      'addresses the large `catalog-preview` derivative and a thumbnail strip needs ' +
      'the small one. Absent when that derivative is not itself deliverable — fall ' +
      'back to `url` for that item rather than dropping the image.',
    example: MEDIA_PATH_EXAMPLE,
  })
  thumbnailUrl?: string;

  @ApiPropertyOptional({
    description:
      'Intrinsic pixel width of the derivative `thumbnailUrl` addresses. Present ' +
      'together with `thumbnailHeight` or absent together with it, and never a guess. ' +
      'Describes a different derivative from `width` and must not be substituted for it.',
    example: 400,
  })
  thumbnailWidth?: number;

  @ApiPropertyOptional({
    description: 'Intrinsic pixel height of that same derivative. See `thumbnailWidth`.',
    example: 400,
  })
  thumbnailHeight?: number;
}

export class PublicProductSummaryResponse {
  @ApiProperty({ example: SLUG_EXAMPLE, description: 'Immutable server-owned identity.' })
  slug!: string;

  @ApiProperty({ example: 'Khăn thêu hoa sen' })
  name!: string;

  @ApiProperty({ type: PublicCategoryResponse })
  category!: PublicCategoryResponse;

  @ApiProperty({ type: PublicPriceResponse })
  price!: PublicPriceResponse;

  @ApiProperty({
    description: 'Operator-controlled display flag. Not a computed stock level.',
    example: false,
  })
  isDisplayOutOfStock!: boolean;

  @ApiPropertyOptional({
    type: PublicMediaReferenceResponse,
    description: 'Absent when this product has no deliverable thumbnail.',
  })
  thumbnail?: PublicMediaReferenceResponse;
}

export class PublicProductListResponse {
  @ApiProperty({ type: [PublicProductSummaryResponse] })
  items!: PublicProductSummaryResponse[];

  @ApiProperty({ description: 'True when another page follows.', example: false })
  hasNext!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Opaque forward cursor, or null on the last page. It is bound to the filter it ' +
      'was issued under: replaying it with a different `categorySlug` is rejected.',
    example: null,
  })
  nextCursor!: string | null;
}

export class PublicProductSeoResponse {
  @ApiPropertyOptional({ example: 'Khăn thêu hoa sen thủ công' })
  title?: string;

  @ApiPropertyOptional({ example: 'Khăn bông thêu tay hoa sen, đặt riêng theo yêu cầu.' })
  description?: string;

  @ApiProperty({
    description: 'Whether the product may be indexed by search engines.',
    example: true,
  })
  isIndexable!: boolean;
}

export class PublicProductDetailResponse {
  @ApiProperty({ example: SLUG_EXAMPLE })
  slug!: string;

  @ApiProperty({ example: 'Khăn thêu hoa sen' })
  name!: string;

  @ApiPropertyOptional({ example: 'Khăn bông cao cấp, thêu tay hoa sen.' })
  description?: string;

  @ApiProperty({ type: PublicCategoryResponse })
  category!: PublicCategoryResponse;

  @ApiProperty({ type: PublicPriceResponse })
  price!: PublicPriceResponse;

  @ApiProperty({ example: false })
  isDisplayOutOfStock!: boolean;

  @ApiProperty({
    type: [PublicMediaReferenceResponse],
    description:
      'Deliverable images in persisted display order. An image whose rendition is not ' +
      'servable is omitted rather than advertised with an address that would 404.',
  })
  media!: PublicMediaReferenceResponse[];

  @ApiProperty({
    type: PublicProductSeoResponse,
    description:
      'Only SEO facts that physically exist on the product. No canonical browser URL: ' +
      'the Storefront route is not decided, and inventing one here would lock it.',
  })
  seo!: PublicProductSeoResponse;
}
