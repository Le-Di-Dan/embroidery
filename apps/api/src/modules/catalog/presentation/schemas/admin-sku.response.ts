/**
 * The documented response shape for the two Admin SKU operations (`APP7-B01`).
 *
 * Exists for OpenAPI only — the generated client's types come from it, so every
 * field here is a field an Admin browser is allowed to see. The runtime
 * projection lives in `product-sku.projection.ts`; keeping the two apart means
 * adding a property to one and forgetting the other is a type error rather than
 * a silently undocumented field.
 *
 * Deliberately absent: anything from the Inventory context. `skus` is the
 * **definition** side (REL-026, "inventory truth split") — it carries no
 * quantity on hand, no reservation and no low-stock threshold, and publishing a
 * stock-shaped field here would invent one.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { SKU_CURRENCY } from '../../domain/product-sku.policy';

const SKU_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const VARIANT_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';
const PRODUCT_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6073';

export class AdminSkuResponse {
  @ApiProperty({ format: 'uuid', example: SKU_ID_EXAMPLE })
  skuId!: string;

  @ApiProperty({ format: 'uuid', example: PRODUCT_ID_EXAMPLE })
  productId!: string;

  @ApiProperty({
    format: 'uuid',
    example: VARIANT_ID_EXAMPLE,
    description: 'The owning variant. Immutable: a SKU is never moved between variants.',
  })
  productVariantId!: string;

  @ApiProperty({
    description: 'The business SKU code. Globally unique and compared bytewise.',
    example: 'TB-GAU-NAU-M',
  })
  code!: string;

  @ApiPropertyOptional({
    description:
      'Whole đồng as a decimal string; never a JSON number. Absent when the product base price applies.',
    example: '250000',
  })
  priceOverrideAmount?: string;

  @ApiProperty({ enum: [SKU_CURRENCY], example: SKU_CURRENCY })
  currencyCode!: string;

  @ApiProperty({
    description: 'The sellable flag. `true` makes this SKU order-eligible for its variant.',
    example: true,
  })
  isActive!: boolean;

  @ApiProperty({
    description:
      'How many SKUs of the owning variant are order-eligible after this write. Never more than 1: a variant with an ambiguous set is refused, so an order can resolve one SKU without guessing.',
    example: 1,
  })
  variantOrderEligibleSkuCount!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
