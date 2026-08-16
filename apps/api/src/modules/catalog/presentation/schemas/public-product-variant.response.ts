/**
 * The documented response shape of the public variant selection read
 * (`APP5-B07`).
 *
 * These classes exist for OpenAPI, and the generated client's types come from
 * them — so every property here is a property an anonymous browser is allowed to
 * see, and the list is deliberately three fields long.
 *
 * Deliberately absent, and asserted absent by the contract spec: SKU and SKU
 * code, price or any currency, stock, inventory or availability, `is_active`,
 * `display_order`, `created_at`/`updated_at`, the category, and every product
 * authoring field. `skus` is a separate table that the repository never joins,
 * so the price omission is structural rather than a redaction.
 *
 * The runtime projection lives in `public-product-variant.query.ts`; keeping the
 * two apart means adding a field to one and forgetting the other surfaces as a
 * type error rather than as a silently undocumented — or silently exposed —
 * field.
 */
import { ApiProperty } from '@nestjs/swagger';

const PRODUCT_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const VARIANT_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6081';

export class PublicProductVariantResponse {
  @ApiProperty({
    format: 'uuid',
    example: VARIANT_ID_EXAMPLE,
    description:
      'The exact Product Variant to submit as `catalog.productVariantId` in a custom request. ' +
      'Not a credential: it authorizes nothing on its own, and the submission re-checks that ' +
      'the variant belongs to the product.',
  })
  productVariantId!: string;

  /**
   * `type: String` is not decoration. Swagger reflects the *design-time* type,
   * and a `string | null` union reflects as `Object` — which publishes
   * `type: object` and generates `{ [key: string]: unknown } | null` in the
   * client, exactly as it already did for `CatalogRequestSubjectResponse`'s
   * nullable labels. A selector cannot render that, so the type is stated.
   */
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Xanh rêu',
    description:
      'The variant colour attribute exactly as stored, or null. Product Variants carry no name ' +
      'column — DB4 locked two relational attributes instead — so the two labels are published ' +
      'as they are and never joined into an invented variant name.',
  })
  colorName!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'M',
    description: 'The size attribute, or null.',
  })
  sizeLabel!: string | null;
}

export class PublicProductVariantListResponse {
  @ApiProperty({
    format: 'uuid',
    example: PRODUCT_ID_EXAMPLE,
    description:
      'The Product these variants belong to, to submit as `catalog.productId`. Returned here so ' +
      'a caller assembling a custom-request subject reads one endpoint rather than correlating ' +
      'two.',
  })
  productId!: string;

  @ApiProperty({
    type: [PublicProductVariantResponse],
    description:
      'Selectable variants in the product’s own display order, then id. Delisted variants ' +
      'are absent. An empty list is a truthful answer and means this published product cannot ' +
      'currently form a catalog custom request — it is not an error and not a missing product.',
  })
  variants!: PublicProductVariantResponse[];
}
