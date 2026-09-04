import type {
  PurchaseVariant,
  ReadyMadePurchaseResult,
} from '../../ready-made-purchase/model/purchase-projection';
import type { OfferableSku } from './product-json-ld';

/**
 * Reducing the delivered purchase projection to the SKUs an `Offer` may
 * describe (`APP12-H06`).
 *
 * ## Why this is a separate step
 *
 * `product-json-ld.ts` builds a document out of contract primitives and knows
 * nothing about variants; this module knows about variants and builds no
 * document. Keeping them apart is what lets the offer *rule* be stated once,
 * here, next to the projection it reads — and lets the builder be tested against
 * plain SKUs without constructing a variant list.
 *
 * The import reaches across into `ready-made-purchase` rather than duplicating
 * its types. That is the established direction in this feature —
 * `sitemap-composition.ts` reads `product-discovery` and `storefront-shell` the
 * same way — because `storefront-seo` is the composing consumer: it restates
 * what other features already publish, and a second copy of `VariantSubject`
 * here would be a second authority on what "purchasable" means.
 *
 * ## The rule, and the two refusals it inherits
 *
 * Exactly the subjects `resolveVariantSubject` resolves to a single SKU:
 *
 * ```text
 * buyable    -> offer, availability InStock
 * sold-out   -> offer, availability OutOfStock
 * ambiguous  -> no offer
 * none       -> no offer
 * ```
 *
 * `sold-out` is included on purpose. It is a real, sellable SKU with a real
 * price and a truthful `OutOfStock` — omitting it would delist a Product that
 * still exists and is expected back, which is a worse claim than the accurate
 * one. `ambiguous` is excluded on purpose, and it is the interesting half: the
 * purchase panel refuses that variant outright rather than choosing a member
 * (`APP12-S01` §9), so publishing a price for it would advertise something the
 * store will not sell and would imply a winning SKU that no authority picked.
 *
 * ## An unreadable projection contributes nothing
 *
 * `ReadyMadePurchaseResult` distinguishes `ready` from `unavailable`, and
 * `unavailable` is **not** zero stock (`APP12-S01` §24). A failed read therefore
 * produces no offers at all rather than an `OutOfStock` claim — a momentary API
 * failure must not be able to tell a crawler that a Product has sold out.
 */
function offerableFromVariant(variant: PurchaseVariant): OfferableSku | undefined {
  const { subject } = variant;
  switch (subject.kind) {
    case 'buyable':
      return { sku: subject.sku, inStock: true };
    case 'sold-out':
      return { sku: subject.sku, inStock: false };
    case 'ambiguous':
    case 'none':
      return undefined;
  }
}

/**
 * The offerable SKUs of one Product, in the server's own variant order.
 *
 * Order is preserved rather than re-sorted here; `buildProductJsonLd` orders by
 * amount only where it needs to read a price range off the ends.
 */
export function toOfferableSkus(purchase: ReadyMadePurchaseResult): readonly OfferableSku[] {
  if (purchase.kind !== 'ready') return [];

  const offerable: OfferableSku[] = [];
  for (const variant of purchase.view.variants) {
    const entry = offerableFromVariant(variant);
    if (entry !== undefined) offerable.push(entry);
  }
  return offerable;
}
