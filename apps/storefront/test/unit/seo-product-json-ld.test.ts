/**
 * @jest-environment node
 *
 * `Product` structured data and the offer projection behind it (`APP12-H06`).
 *
 * Two modules, tested together because the rule they implement is one rule split
 * across them: `toOfferableSkus` decides *which* SKUs may be described, and
 * `buildProductJsonLd` decides *how*. The interesting cases are the refusals —
 * what the document declines to say — so most of this file asserts absence.
 *
 * The live `APP12-H06` browser matrix proves the same rules end to end against a
 * seeded catalog; this file covers the branches a fixture cannot reach cheaply,
 * notably the mixed-currency guard.
 */
import type {
  PublicProductSkuResponse,
  PublicProductVariantResponse,
} from '@embroidery/api-client';

import { buildProductJsonLd, toOfferableSkus } from '../../src/features/storefront-seo';
import { toReadyMadePurchaseView } from '../../src/features/ready-made-purchase/model/purchase-projection';

const ORIGIN = 'https://shop.example.test';
const PATH = '/san-pham/ao-thun';

beforeEach(() => {
  process.env.STOREFRONT_PUBLIC_ORIGIN = ORIGIN;
});

function sku(
  amount: string,
  availableQuantity: number,
  currency = 'VND',
): PublicProductSkuResponse {
  return {
    skuId: `sku-${amount}-${String(availableQuantity)}`,
    availableQuantity,
    unitPrice: { amount, currency },
  };
}

function variant(
  colorName: string | null,
  sizeLabel: string | null,
  skus: PublicProductSkuResponse[],
): PublicProductVariantResponse {
  return {
    productVariantId: `variant-${colorName ?? 'x'}-${sizeLabel ?? 'x'}`,
    colorName,
    sizeLabel,
    skus,
  };
}

/** The delivered projection, so the offer rule is read through the real one. */
function ready(variants: PublicProductVariantResponse[]) {
  return {
    kind: 'ready' as const,
    view: toReadyMadePurchaseView({ productId: 'product-1', variants }),
  };
}

function build(
  variants: PublicProductVariantResponse[],
  overrides: { description?: string; imagePaths?: readonly string[] } = {},
) {
  return buildProductJsonLd({
    name: 'Áo thun',
    canonicalPath: PATH,
    imagePaths: overrides.imagePaths ?? [],
    ...(overrides.description === undefined ? {} : { description: overrides.description }),
    offerableSkus: toOfferableSkus(ready(variants)),
  });
}

describe('the document itself', () => {
  it('is a schema.org Product canonicalised through the one origin authority', () => {
    const doc = build([variant('Trắng', 'M', [sku('399000', 8)])]);

    expect(doc['@context']).toBe('https://schema.org');
    expect(doc['@type']).toBe('Product');
    expect(doc.name).toBe('Áo thun');
    // The same composition the canonical tag, `og:url` and the sitemap entry
    // use, so the four cannot name different addresses for one page.
    expect(doc.url).toBe(`${ORIGIN}${PATH}`);
  });

  it('omits a blank or absent description rather than publishing an empty one', () => {
    expect(build([]).description).toBeUndefined();
    expect(build([], { description: '   ' }).description).toBeUndefined();
    expect(build([], { description: '  Mô tả  ' }).description).toBe('Mô tả');
  });

  it('resolves media paths to absolute URLs in the order given', () => {
    const doc = build([], { imagePaths: ['/api/public/a', '/api/public/b'] });
    expect(doc.image).toEqual([`${ORIGIN}/api/public/a`, `${ORIGIN}/api/public/b`]);
  });

  it('omits image entirely when the product has no public media', () => {
    expect(build([]).image).toBeUndefined();
  });
});

describe('what the offer may never invent', () => {
  it('publishes no offers at all when nothing is sellable', () => {
    // A variant with no SKU is a real, common state: the Product is published
    // and readable and simply has nothing to sell. That is not zero stock.
    expect(build([variant('Trắng', 'M', [])]).offers).toBeUndefined();
  });

  it('publishes no offers when the purchase projection could not be read', () => {
    // `unavailable` is NOT zero stock (`APP12-S01` §24). A momentary API failure
    // must not be able to tell a crawler that a Product has sold out.
    const doc = buildProductJsonLd({
      name: 'Áo thun',
      canonicalPath: PATH,
      imagePaths: [],
      offerableSkus: toOfferableSkus({ kind: 'unavailable' }),
    });
    expect(doc.offers).toBeUndefined();
  });

  it('excludes an ambiguous variant rather than picking a winning SKU', () => {
    // Two order-eligible SKUs under one customer-visible variant. The purchase
    // panel refuses it outright because the public contract carries no
    // customer-visible differentiator, and this document refuses for the same
    // reason: a price here would advertise something the store will not sell.
    const doc = build([variant('Xanh', 'M', [sku('111000', 4), sku('900000', 4)])]);
    expect(doc.offers).toBeUndefined();
  });

  it('does not let an ambiguous variant widen a real price range', () => {
    const doc = build([
      variant('Trắng', 'M', [sku('399000', 8)]),
      variant('Đen', 'M', [sku('520000', 3)]),
      variant('Xanh', 'M', [sku('111000', 4), sku('900000', 4)]),
    ]);
    const offers = doc.offers as Record<string, unknown>;
    expect(offers['lowPrice']).toBe('399000');
    expect(offers['highPrice']).toBe('520000');
    expect(offers['offerCount']).toBe(2);
  });

  it('carries no SKU identity, brand, shipping, deposit or order total', () => {
    const doc = build([variant('Trắng', 'M', [sku('399000', 8)])]);
    const serialized = JSON.stringify(doc);

    for (const field of [
      'sku',
      'productID',
      'brand',
      'shippingDetails',
      'priceValidUntil',
      'hasMerchantReturnPolicy',
      'aggregateRating',
      'review',
    ]) {
      expect(serialized).not.toContain(`"${field}"`);
    }
    // The SKU id specifically: it reached the builder and must not leave it.
    expect(serialized).not.toContain('sku-399000-8');
  });
});

describe('offer shape and truth', () => {
  it('publishes one Offer for exactly one offerable SKU', () => {
    const doc = build([variant('Trắng', null, [sku('250000', 5)])]);
    expect(doc.offers).toEqual({
      '@type': 'Offer',
      price: '250000',
      priceCurrency: 'VND',
      availability: 'https://schema.org/InStock',
      // The Product page, not a per-SKU address: none exists, and the checkout
      // query form carries a `skuId` this document may not publish.
      url: `${ORIGIN}${PATH}`,
    });
  });

  it('publishes OutOfStock for a real SKU with nothing available', () => {
    // Included deliberately rather than omitted: a sellable SKU at zero is a
    // truthful `OutOfStock`, while dropping it would delist a Product that
    // still exists and is expected back.
    const doc = build([variant('Trắng', 'L', [sku('450000', 0)])]);
    expect((doc.offers as Record<string, unknown>)['availability']).toBe(
      'https://schema.org/OutOfStock',
    );
  });

  it('reads the price range off the real extremes, not off array order', () => {
    const doc = build([
      variant('A', 'M', [sku('520000', 1)]),
      variant('B', 'M', [sku('399000', 1)]),
      variant('C', 'M', [sku('450000', 0)]),
    ]);
    const offers = doc.offers as Record<string, unknown>;
    expect(offers['@type']).toBe('AggregateOffer');
    expect(offers['lowPrice']).toBe('399000');
    expect(offers['highPrice']).toBe('520000');
    expect(offers['offerCount']).toBe(3);
  });

  it('orders numerically, so a longer amount is not treated as smaller', () => {
    // `"1000000" < "900000"` lexically. Sorting as strings would publish a
    // range whose low is higher than its high.
    const doc = build([
      variant('A', 'M', [sku('1000000', 1)]),
      variant('B', 'M', [sku('900000', 1)]),
    ]);
    const offers = doc.offers as Record<string, unknown>;
    expect(offers['lowPrice']).toBe('900000');
    expect(offers['highPrice']).toBe('1000000');
  });

  it('passes the amount through as the exact decimal string the contract sent', () => {
    // VND amounts are exact decimals and a JSON number is an IEEE-754 double.
    // Parsing to re-print would be the rounding the string contract prevents.
    const doc = build([variant('A', 'M', [sku('12345678901234567890', 1)])]);
    expect((doc.offers as Record<string, unknown>)['price']).toBe('12345678901234567890');
  });

  it('keeps every constituent Offer inside the aggregate', () => {
    // `AggregateOffer` has no place for availability, so the per-SKU truth would
    // be lost to the summary if the nested offers were dropped.
    const doc = build([
      variant('A', 'M', [sku('399000', 8)]),
      variant('B', 'M', [sku('450000', 0)]),
    ]);
    const nested = (doc.offers as Record<string, unknown>)['offers'] as Record<string, unknown>[];
    expect(nested).toHaveLength(2);
    expect(nested.map((offer) => offer['availability'])).toEqual([
      'https://schema.org/InStock',
      'https://schema.org/OutOfStock',
    ]);
  });

  it('publishes no offer at all when the SKUs disagree about currency', () => {
    // A price range across two currencies is meaningless, and printing one
    // currency over amounts denominated in another would be the most quietly
    // wrong number this document could carry. The expected value is VND
    // throughout, but it is read from the contract rather than asserted, so the
    // day that stops being true this emits nothing instead of a lie.
    const doc = build([
      variant('A', 'M', [sku('399000', 1, 'VND')]),
      variant('B', 'M', [sku('20', 1, 'USD')]),
    ]);
    expect(doc.offers).toBeUndefined();
  });
});
