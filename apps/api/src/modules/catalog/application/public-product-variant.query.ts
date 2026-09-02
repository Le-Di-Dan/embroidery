/**
 * The public variant selection read (`APP5-B07`), extended with the Ready-Made
 * purchase projection (`APP12-B01`).
 *
 * Orchestration only: ask the repository, ask Inventory, project, or refuse. No
 * transaction, no lock and no cache — the invariant that unpublishing a Product
 * removes its variants from the selector on the next read is satisfied by there
 * being nothing between the caller and the row.
 *
 * Like `public-product.query.ts` and `product-placement.query.ts`, this query
 * never learns *why* a lookup failed. Unknown slug, draft, archived and a
 * product whose category is not public all collapse to the same absence here,
 * and therefore to the same 404 at the boundary.
 *
 * ## Two authorities, composed rather than merged
 *
 * Price is Catalog's (`BR-021`, resolved by `public-sku-price.policy.ts` from
 * columns the Catalog repository loaded). Availability is Inventory's
 * (`BR-022`, one number from `SKU_AVAILABILITY_SNAPSHOT_PORT`). They meet here
 * and nowhere else: Catalog joins no inventory table and the availability port
 * knows nothing about publication, so neither can start deciding the other's
 * question.
 *
 * ## Nothing here writes, holds or reserves
 *
 * `BR-024` puts the reservation at durable order creation. This read creates no
 * soft hold, no reservation and no `sku_stocks` row, and a SKU with no stock
 * anchor is projected as unavailable rather than provisioned — see
 * `sku-availability-snapshot.port.ts`. Both figures are **advisory**: they are
 * true at read time and are re-resolved under the anchor lock by `APP12-B02`,
 * which is what actually freezes a price and commits stock.
 */
import { Inject, Injectable } from '@nestjs/common';

import { publicProductNotFound } from '../domain/public-product-catalog.errors';
import { resolvePublicSkuUnitPrice } from '../domain/public-sku-price.policy';
import {
  PUBLIC_PRODUCT_VARIANT_REPOSITORY,
  type PublicProductVariantRepository,
  type PublicProductVariants,
} from '../domain/repositories/public-product-variant.repository';
import {
  SKU_AVAILABILITY_SNAPSHOT_PORT,
  type SkuAvailabilitySnapshotPort,
} from '../../inventory/domain/repositories/sku-availability-snapshot.port';
import { toPublicPrice, type PublicPrice } from './public-product.projection';

/**
 * One purchasable Ready-Made subject (`APP12-B01`, `BR-021` / `BR-022`).
 *
 * Presence means a SKU exists that Ready-Made could sell — the product is
 * published, the variant is active and the SKU is order-eligible. It does
 * **not** mean it can be bought this second: that is `availableQuantity > 0`,
 * which the approved `APP12-D01` purchase panel renders as its `OUT_OF_STOCK`
 * state rather than by hiding the option. Publishing the SKU with a zero is what
 * lets that state be told apart from a variant that was never sellable at all.
 */
export interface PublicProductSkuView {
  /**
   * The SKU `APP12-B02` will create the order line against.
   *
   * The buyable subject is the SKU, not the Variant (`BR-021`). A variant with
   * no entry here has nothing to sell.
   */
  readonly skuId: string;
  /** `COALESCE(price_override_amount, base_price_amount)` with its currency. */
  readonly unitPrice: PublicPrice;
  /**
   * How many units a customer could take at read time (`BR-022`).
   *
   * The quantity stepper's truthful maximum, which is why it is a number rather
   * than an in-stock boolean: the `APP12-D01` panel offers a quantity, and a UI
   * that cannot see the ceiling either guesses it or invents scarcity copy.
   * Zero is a normal state, not an error, and it is never negative.
   */
  readonly availableQuantity: number;
}

/** One selectable variant as the Storefront receives it. */
export interface PublicProductVariantView {
  /**
   * The id `SubmitCustomRequestBody.catalog.productVariantId` expects.
   *
   * Named `productVariantId` rather than `id` because that is what the caller
   * has to send back: the one place this value is used is the APP5 submission
   * body, and a field a client must rename on the way through is a field a
   * client eventually renames wrongly.
   */
  readonly productVariantId: string;
  /** As stored; `null` when the variant carries no colour attribute. */
  readonly colorName: string | null;
  /** As stored; `null` when the variant carries no size attribute. */
  readonly sizeLabel: string | null;
  /**
   * The Ready-Made purchase subjects of this variant (`APP12-B01`).
   *
   * Additive, and empty for every variant that APP5 already reads: an existing
   * consumer that only knows the three fields above is unaffected, and a variant
   * is never removed from the list because this is empty. A variant may be
   * perfectly valid for a custom-embroidery request while having no sellable
   * SKU, and both facts are published rather than one overruling the other.
   */
  readonly skus: readonly PublicProductSkuView[];
}

export interface PublicProductVariantListView {
  /**
   * The other id the APP5 catalog subject requires.
   *
   * The public catalogue publishes no product id, deliberately — but the public
   * placement manifest already does (`PublicProductPlacementResponse.productId`,
   * IMP-D041 PO-02), for the same reason it appears here: a Storefront that must
   * submit `productId` and `productVariantId` together should not have to read
   * two endpoints and hope they agree about which product it is looking at.
   */
  readonly productId: string;
  readonly variants: readonly PublicProductVariantView[];
}

@Injectable()
export class PublicProductVariantQuery {
  constructor(
    @Inject(PUBLIC_PRODUCT_VARIANT_REPOSITORY)
    private readonly variants: PublicProductVariantRepository,
    @Inject(SKU_AVAILABILITY_SNAPSHOT_PORT)
    private readonly availability: SkuAvailabilitySnapshotPort,
  ) {}

  /**
   * The selectable variants at one public Product address.
   *
   * A Product with no active variant returns an **empty list**, not a 404: it is
   * published and it exists, it simply cannot form an APP5 catalog request
   * today. `APP5-S01` renders the approved unavailable state for that, which it
   * could not do if the answer were indistinguishable from a product that was
   * never published.
   */
  async publicRead(slug: string): Promise<PublicProductVariantListView> {
    const found = await this.variants.findPublicVariants(slug);
    if (found === undefined) {
      throw publicProductNotFound();
    }

    // One bulk call for every SKU on the page. An inventory failure propagates
    // untouched rather than being flattened into zeros: "out of stock" and "we
    // could not read stock" are different answers, and reporting the first for
    // the second would tell a customer a product is sold out because a query
    // failed (`APP12-B01` §31).
    const skuIds = found.variants.flatMap((variant) => variant.skus.map((sku) => sku.id));
    const rows = await this.availability.listAvailability(skuIds);
    const availableBySku = new Map(rows.map((row) => [row.skuId, row.availableQuantity]));

    return toPublicVariantListView(found, availableBySku);
  }
}

/**
 * What a SKU inventory has never heard of is worth.
 *
 * `listAvailability` omits a SKU with no `sku_stocks` anchor rather than
 * inventing a row for it, so the absence lands here. Zero is the safe reading:
 * an un-anchored SKU has no stock to sell, and the alternative — provisioning
 * the anchor so the number exists — would make an anonymous GET write to the
 * inventory tables (`APP12-B01` §9).
 */
const UNANCHORED_SKU_AVAILABLE_QUANTITY = 0;

/**
 * Domain → view.
 *
 * A separate function rather than an inline map so the exhaustive field list
 * lives in one place: adding a column to `PublicProductVariantRow` does not
 * silently publish it, because it has to be named here as well.
 */
export function toPublicVariantListView(
  source: PublicProductVariants,
  availableBySku: ReadonlyMap<string, number> = new Map(),
): PublicProductVariantListView {
  return {
    productId: source.productId,
    variants: source.variants.map((variant) => ({
      productVariantId: variant.id,
      colorName: variant.colorName ?? null,
      sizeLabel: variant.sizeLabel ?? null,
      skus: variant.skus.map((sku) => ({
        skuId: sku.id,
        unitPrice: toResolvedPrice(sku, source),
        availableQuantity: availableBySku.get(sku.id) ?? UNANCHORED_SKU_AVAILABLE_QUANTITY,
      })),
    })),
  };
}

/**
 * `BR-021` resolution, then the one public money projection.
 *
 * `toPublicPrice` is the `APP2-B04` helper the product list and detail already
 * publish through — `{ amount, currency }`, whole đồng as a decimal string,
 * never a JSON number. Reusing it means a price means the same thing and is
 * shaped the same way wherever the public catalog states one.
 */
function toResolvedPrice(
  sku: { readonly priceOverrideAmount: string | undefined; readonly currencyCode: string },
  product: { readonly basePriceAmount: string; readonly currencyCode: string },
): PublicPrice {
  const resolved = resolvePublicSkuUnitPrice(sku, product);
  return toPublicPrice(resolved.amount, resolved.currencyCode);
}
