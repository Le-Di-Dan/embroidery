/**
 * The documented response shape of the public variant selection read
 * (`APP5-B07`), carrying the Ready-Made purchase projection (`APP12-B01`).
 *
 * These classes exist for OpenAPI, and the generated client's types come from
 * them — so every property here is a property an anonymous browser is allowed to
 * see.
 *
 * ## `APP12-B01` widened this deliberately, and only this far
 *
 * `APP5-B07` published three selection fields and asserted that price, SKU and
 * stock were structurally absent. The locked `APP12` roadmap makes the SKU the
 * buyable subject (`BR-021`) and states purchasability in terms of a resolved
 * price and available stock (`BR-022`), so those three facts are now published —
 * per SKU, beside the variant, never in place of it.
 *
 * Everything else stays out, and the contract spec still asserts it: no SKU code,
 * no `is_active`, no `display_order`, no `created_at`/`updated_at`, no category,
 * no product authoring field, and **nothing from the warehouse** — no stock
 * anchor id, no `quantity_on_hand`, no held or reserved breakdown, no low-stock
 * threshold, no reservation id, no order or customer id, no ledger.
 * `products.is_display_out_of_stock` is absent too: `BR-022` makes it
 * presentation authority, and publishing it beside a real availability figure
 * would offer two answers to one question.
 *
 * The runtime projection lives in `public-product-variant.query.ts`; keeping the
 * two apart means adding a field to one and forgetting the other surfaces as a
 * type error rather than as a silently undocumented — or silently exposed —
 * field.
 */
import { ApiProperty } from '@nestjs/swagger';

import { PublicPriceResponse } from './public-product.response';

const PRODUCT_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const VARIANT_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6081';
const SKU_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6091';

export class PublicProductSkuResponse {
  @ApiProperty({
    format: 'uuid',
    example: SKU_ID_EXAMPLE,
    description:
      'The purchasable subject. Ready-Made sells a SKU, not a Product Variant (`BR-021`), and ' +
      'this is the id a later order line is created against. Not a credential: it authorizes ' +
      'nothing, and order creation re-resolves everything about it server-side.',
  })
  skuId!: string;

  @ApiProperty({
    type: PublicPriceResponse,
    description:
      'The server-resolved unit price: `COALESCE(price_override_amount, base_price_amount)` in ' +
      'the currency of whichever row supplied it (`BR-021`). **Advisory** — it is the catalog ' +
      'price at read time, for display only. Order creation resolves the price again on the ' +
      'server and freezes it on the line; a client-supplied amount is never trusted.',
  })
  unitPrice!: PublicPriceResponse;

  @ApiProperty({
    type: Number,
    minimum: 0,
    example: 5,
    description:
      'How many units could be taken at read time: on-hand less active holds less active ' +
      'reservations (`BR-022`), never negative. An exact count rather than a boolean because ' +
      'the purchase panel offers a quantity and needs a truthful maximum. Zero is a normal ' +
      'state, not an error, and means nothing may be bought right now — it is not the same as ' +
      'the SKU being absent, which means there is nothing sellable here at all. **Advisory**: ' +
      'nothing is held or reserved by reading this, and order creation re-checks availability ' +
      'under the stock lock before it commits any of it.',
  })
  availableQuantity!: number;
}

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

  @ApiProperty({
    type: [PublicProductSkuResponse],
    description:
      'The Ready-Made purchase subjects of this variant, ordered by id (`APP12-B01`). An empty ' +
      'list is truthful and common: the variant has no SKU, or its SKUs are not order-eligible. ' +
      'It never removes the variant — a variant with nothing to sell may still be chosen for a ' +
      'custom-embroidery request, so selection and purchase are answered side by side rather ' +
      'than one overruling the other. No SKU is marked as a default or preferred: the set is ' +
      'published as it stands and the customer chooses.',
  })
  skus!: PublicProductSkuResponse[];
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
