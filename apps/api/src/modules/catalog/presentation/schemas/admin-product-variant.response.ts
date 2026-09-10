/**
 * The documented response shapes for the three Admin variant operations
 * (`APP12-N02.B01`).
 *
 * These classes exist for OpenAPI only — the generated client's types come from
 * them, so every field here is a field an Admin browser is allowed to see. The
 * runtime projection lives in `product-variant.projection.ts`; keeping the two
 * apart means adding a property to one and forgetting the other shows up as a
 * type error rather than as a silently undocumented field.
 *
 * Deliberately absent: anything from the Inventory context. `skus` is the
 * **definition** side (REL-026, "inventory truth split") — no quantity on hand,
 * no reservation, no low-stock threshold. The stock screen is reached with the
 * `skuId` published here, and a stock-shaped field on this response would
 * invent a second stock authority beside `adminSkuStock_get`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { SKU_CURRENCY } from '../../domain/product-sku.policy';

const PRODUCT_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6073';
const VARIANT_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';
const SKU_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';

export class AdminVariantSkuResponse {
  @ApiProperty({ format: 'uuid', example: SKU_ID_EXAMPLE })
  skuId!: string;

  @ApiProperty({
    description: 'The business SKU code. Globally unique and compared bytewise.',
    example: 'AT-NAVY-M',
  })
  code!: string;

  @ApiPropertyOptional({
    description:
      'Whole đồng as a decimal string; never a JSON number. Absent when the product base price applies.',
    example: '385000',
  })
  priceOverrideAmount?: string;

  @ApiProperty({ enum: [SKU_CURRENCY], example: SKU_CURRENCY })
  currencyCode!: string;

  @ApiProperty({
    description:
      'The sellable flag. `true` makes this SKU order-eligible for its variant. Inactive SKUs are returned as history and are never deleted.',
    example: true,
  })
  isActive!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class AdminProductVariantResponse {
  @ApiProperty({ format: 'uuid', example: VARIANT_ID_EXAMPLE })
  variantId!: string;

  @ApiProperty({ format: 'uuid', example: PRODUCT_ID_EXAMPLE })
  productId!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Null when the variant is not distinguished by colour.',
    example: 'Xanh navy',
  })
  colorName!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Null when the variant is not distinguished by size.',
    example: 'M',
  })
  sizeLabel!: string | null;

  @ApiProperty({
    description:
      'Server-assigned creation order. Never accepted from a request: there is no reorder operation.',
    example: 0,
  })
  displayOrder!: number;

  @ApiProperty({
    description:
      'Whether the variant is offered. Inactive variants are returned as history and are never deleted.',
    example: true,
  })
  isActive!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({
    type: [AdminVariantSkuResponse],
    description:
      'Every SKU of this variant, active and inactive, oldest first. Empty on a create or update response, which reports the variant row alone.',
  })
  skus!: AdminVariantSkuResponse[];
}

export class AdminProductVariantListResponse {
  @ApiProperty({ format: 'uuid', example: PRODUCT_ID_EXAMPLE })
  productId!: string;

  @ApiProperty({
    type: [AdminProductVariantResponse],
    description:
      'Every variant of the product, active and inactive, in the stable authoring order. This is the authoring and history source; the public variant projection is not usable for it.',
  })
  variants!: AdminProductVariantResponse[];
}
