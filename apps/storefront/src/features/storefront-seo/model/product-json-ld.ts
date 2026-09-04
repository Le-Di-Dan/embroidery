import type { PublicProductSkuResponse } from '@embroidery/api-client';

import { toAbsolutePublicUrl } from '../../../config/public-origin';
import type { JsonLdDocument, JsonLdObject } from './json-ld-serialization';

/**
 * `Product` structured data for a published Ready-Made Product (`APP12-H06`).
 *
 * ## Every field is a fact the page already publishes
 *
 * `APP11-S04` declined to emit this document, and its reason was exactly right
 * at the time: "no price or availability structured data … every one of those
 * would be a claim invented at render time." What changed is not the standard of
 * proof but the contract. `APP12-B01` published `publicProductVariant_list` with
 * a server-resolved unit price and an exact `availableQuantity` per SKU, and
 * `APP12-S01` made that projection the **only** purchase-data authority the
 * Product page reads. So the offer facts now exist, they are already rendered to
 * the visitor by the purchase panel, and this document restates them for a
 * crawler rather than deriving anything new.
 *
 * ## The offer subject is the one the panel would sell
 *
 * `resolveVariantSubject` (`ready-made-purchase`) decides what a variant offers:
 * exactly one order-eligible SKU is `buyable` or `sold-out`; zero is `none`; more
 * than one is `ambiguous`, and the delivered policy for `ambiguous` is that the
 * panel **refuses** — it selects nothing, offers nothing and says nothing about
 * stock, because the public SKU contract carries no customer-visible
 * differentiator and picking a member would be inventing a winner
 * (`APP12-S01` §9).
 *
 * This document applies the same rule for the same reason. An `ambiguous`
 * variant contributes no offer, so a crawler is never told a price for something
 * the store will not let anyone buy, and no hidden winning SKU is implied by a
 * price range that quietly included one. `none` contributes nothing because
 * there is nothing there.
 *
 * ## What is deliberately absent
 *
 * No `sku` and no `productID`. `skuId` and `productVariantId` are internal
 * identity — the public contract says so in as many words, and `APP12-S01` §9
 * forbids rendering `skuId` as customer copy. A crawlable copy of it is that
 * same exposure with a longer half-life.
 *
 * No `brand`. Nothing in the Product contract carries one, and asserting that
 * every listed Product is manufactured under the store's mark is a claim about
 * provenance that no row in this system makes. `Nét Thêu` is the metadata brand
 * for titles (`APP12-H06` §7); it is not a fact about a Product's maker.
 *
 * No `shippingDetails`, no `priceValidUntil`, no `hasMerchantReturnPolicy`, no
 * deposit and no order total. The shipping fee is unknown until an operator
 * confirms it (`APP12-B03`), a deposit is a Wave-2 custom-order concept, and an
 * order total does not exist before an order does. `APP12-H06` §8 names all four
 * as inventions and they are structurally unreachable: this builder has no field
 * for any of them.
 *
 * No `aggregateRating` and no `review`: the system stores neither.
 */

/** `https://schema.org/InStock` — at least one unit could be taken at read time. */
const IN_STOCK = 'https://schema.org/InStock';
/** `https://schema.org/OutOfStock` — a real, sellable SKU with zero available. */
const OUT_OF_STOCK = 'https://schema.org/OutOfStock';

interface OfferJsonLd extends JsonLdObject {
  readonly '@type': 'Offer';
  readonly price: string;
  readonly priceCurrency: string;
  readonly availability: string;
  readonly url: string;
}

interface AggregateOfferJsonLd extends JsonLdObject {
  readonly '@type': 'AggregateOffer';
  readonly lowPrice: string;
  readonly highPrice: string;
  readonly priceCurrency: string;
  readonly offerCount: number;
  readonly offers: readonly OfferJsonLd[];
}

export interface ProductJsonLd extends JsonLdDocument {
  readonly '@context': 'https://schema.org';
  readonly '@type': 'Product';
  readonly name: string;
  readonly url: string;
  readonly description?: string;
  readonly image?: readonly string[];
  readonly offers?: OfferJsonLd | AggregateOfferJsonLd;
}

/**
 * One offerable SKU, already reduced to the two facts an `Offer` carries.
 *
 * The caller resolves this from `ReadyMadePurchaseView`, so the "exactly one
 * eligible SKU" rule stays in `resolveVariantSubject` where it is already
 * tested, and this module never re-derives purchasability from a raw contract
 * response.
 */
export interface OfferableSku {
  readonly sku: PublicProductSkuResponse;
  /** `true` only for a `buyable` subject: stock existed at read time. */
  readonly inStock: boolean;
}

export interface ProductJsonLdInput {
  readonly name: string;
  /** Root-relative canonical path from the route builder — never a literal. */
  readonly canonicalPath: string;
  /** Blank and absent are both treated as "no description". */
  readonly description?: string;
  /**
   * Already-public media paths in persisted display order, exactly the ones the
   * page's own gallery renders. Publication-gated delivery routes only: no
   * storage key, no bucket, no private original ever reaches this builder,
   * because the caller has none to give it.
   */
  readonly imagePaths: readonly string[];
  /** Empty is a truthful, common answer — the Product simply has no offer. */
  readonly offerableSkus: readonly OfferableSku[];
}

function toOffer(entry: OfferableSku, productUrl: string): OfferJsonLd {
  return {
    '@type': 'Offer',
    // The contract publishes whole đồng as a decimal **string** precisely
    // because VND amounts are exact decimals and a JSON number is an IEEE-754
    // double. It is passed through as the string it is: parsing it to re-print
    // it would be the rounding this contract exists to prevent.
    price: entry.sku.unitPrice.amount,
    priceCurrency: entry.sku.unitPrice.currency,
    availability: entry.inStock ? IN_STOCK : OUT_OF_STOCK,
    // The Product page, not a per-SKU address: no such URL exists, and the
    // checkout query form carries a `skuId` this document may not publish.
    url: productUrl,
  };
}

/**
 * Orders offers by price so `lowPrice`/`highPrice` are read off the ends.
 *
 * Compared as numbers rather than as strings — `"1000000" < "900000"`
 * lexically — but the **original strings** are what is emitted, so the exact
 * decimal the contract published survives the ordering.
 */
function byAmount(a: OfferableSku, b: OfferableSku): number {
  return Number(a.sku.unitPrice.amount) - Number(b.sku.unitPrice.amount);
}

/**
 * Builds the `offers` value, or nothing.
 *
 * Three outcomes, and the third is the one worth stating. A single offerable
 * SKU is one `Offer`. Several are an `AggregateOffer` whose range is the real
 * minimum and maximum — with every constituent `Offer` nested inside it, so the
 * per-SKU availability is not lost to the summary, which is the field an
 * aggregate has no place to put.
 *
 * **Mixed currencies produce no offer at all.** A price range is meaningless
 * across two currencies, and printing one currency over amounts denominated in
 * another would be the most quietly wrong number this document could carry. The
 * expected value is `VND` throughout — but it is read from the contract on every
 * SKU rather than asserted here, so the day that stops being true this emits
 * nothing instead of a lie.
 */
function buildOffers(
  offerableSkus: readonly OfferableSku[],
  productUrl: string,
): OfferJsonLd | AggregateOfferJsonLd | undefined {
  if (offerableSkus.length === 0) return undefined;

  const currency = offerableSkus[0]?.sku.unitPrice.currency;
  if (currency === undefined) return undefined;
  if (offerableSkus.some((entry) => entry.sku.unitPrice.currency !== currency)) return undefined;

  const ordered = [...offerableSkus].sort(byAmount);
  const offers = ordered.map((entry) => toOffer(entry, productUrl));

  const single = offers[0];
  if (single === undefined) return undefined;
  if (offers.length === 1) return single;

  const lowest = ordered[0];
  const highest = ordered[ordered.length - 1];
  if (lowest === undefined || highest === undefined) return single;

  return {
    '@type': 'AggregateOffer',
    lowPrice: lowest.sku.unitPrice.amount,
    highPrice: highest.sku.unitPrice.amount,
    priceCurrency: currency,
    offerCount: offers.length,
    offers,
  };
}

/**
 * Builds the `Product` document for one published Product.
 *
 * `url` is the canonical Product URL, composed through the one origin authority
 * that also builds `<link rel="canonical">`, `og:url` and the sitemap entry — so
 * the four cannot name different hosts or different addresses for one page.
 */
export function buildProductJsonLd(input: ProductJsonLdInput): ProductJsonLd {
  const url = toAbsolutePublicUrl(input.canonicalPath);
  const description = input.description?.trim();
  const offers = buildOffers(input.offerableSkus, url);

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    url,
    ...(description === undefined || description === '' ? {} : { description }),
    ...(input.imagePaths.length === 0
      ? {}
      : { image: input.imagePaths.map((path) => toAbsolutePublicUrl(path)) }),
    ...(offers === undefined ? {} : { offers }),
  };
}
