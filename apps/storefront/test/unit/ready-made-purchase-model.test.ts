/**
 * The `APP12-S01` purchase decision layer, called directly.
 *
 * Every rule this checkpoint turns on is a pure function over the `APP12-B01`
 * projection, and this is where each one is proved without a DOM: which SKU a
 * selection resolves to, when it resolves to none, what a quantity may be, and
 * what the continue URL is allowed to carry.
 */
import { buildPurchaseContinueHref } from '../../src/features/ready-made-purchase/model/purchase-continue-url';
import {
  formatExactAmount,
  formatExactMoney,
} from '../../src/features/ready-made-purchase/model/purchase-money';
import {
  resolveVariantSubject,
  toReadyMadePurchaseView,
} from '../../src/features/ready-made-purchase/model/purchase-projection';
import {
  clampQuantity,
  resolvePurchase,
} from '../../src/features/ready-made-purchase/model/purchase-selection';
import {
  makeSku,
  makeVariant,
  makeVariantList,
  makeVariantMatrix,
} from '../support/ready-made-purchase-fixture';

const view = () => toReadyMadePurchaseView(makeVariantList(makeVariantMatrix()));

describe('resolveVariantSubject', () => {
  it('resolves the single order-eligible SKU with stock', () => {
    const subject = resolveVariantSubject(
      makeVariant({ skus: [makeSku({ availableQuantity: 2 })] }),
    );
    expect(subject.kind).toBe('buyable');
  });

  it('keeps zero availability apart from having no SKU at all', () => {
    // `APP12-B01` publishes a zero rather than dropping the SKU precisely so
    // these two can be told apart, and the panel says different things about
    // them: one is `· hết`, the other was never sellable.
    expect(
      resolveVariantSubject(makeVariant({ skus: [makeSku({ availableQuantity: 0 })] })).kind,
    ).toBe('sold-out');
    expect(resolveVariantSubject(makeVariant({ skus: [] })).kind).toBe('none');
  });

  it('refuses to pick a winner when a variant carries more than one eligible SKU', () => {
    // The delivered write-side policy caps the order-eligible set at one per
    // variant and the locked rule for a larger set is that conversion refuses
    // safely. The read refuses too: no first, no cheapest, no highest stock, no
    // lowest id.
    const subject = resolveVariantSubject(
      makeVariant({
        skus: [
          makeSku({
            skuId: 'sku-a',
            unitPrice: { amount: '100000', currency: 'VND' },
            availableQuantity: 9,
          }),
          makeSku({
            skuId: 'sku-b',
            unitPrice: { amount: '200000', currency: 'VND' },
            availableQuantity: 1,
          }),
        ],
      }),
    );
    expect(subject.kind).toBe('ambiguous');
    // The subject carries no SKU at all, so there is nothing for a later reader
    // to accidentally treat as "the" one.
    expect(JSON.stringify(subject)).not.toContain('sku-a');
    expect(JSON.stringify(subject)).not.toContain('sku-b');
  });
});

describe('toReadyMadePurchaseView', () => {
  it('keeps every variant, including the ones nothing can be bought from', () => {
    // `APP12-S01` §7: a variant with no sellable SKU may still be chosen for a
    // custom-embroidery request, so purchasability never removes one.
    expect(view().variants).toHaveLength(4);
    expect(view().variants.map((variant) => variant.subject.kind)).toEqual([
      'buyable',
      'sold-out',
      'buyable',
      'none',
    ]);
  });

  it('derives both axes from the server, in the order it published them', () => {
    expect(view().colorValues).toEqual(['Trắng', 'Đen']);
    expect(view().sizeValues).toEqual(['M', 'L']);
  });

  it('never re-sorts an axis alphabetically', () => {
    const reversed = toReadyMadePurchaseView(
      makeVariantList([
        makeVariant({ productVariantId: 'v-1', colorName: 'Xanh rêu', sizeLabel: 'XL' }),
        makeVariant({ productVariantId: 'v-2', colorName: 'Đen', sizeLabel: 'S' }),
      ]),
    );
    // Alphabetically this would be ['Xanh rêu', 'Đen'] reversed; the product's
    // own display order is the studio's decision and is preserved.
    expect(reversed.colorValues).toEqual(['Xanh rêu', 'Đen']);
    expect(reversed.sizeValues).toEqual(['XL', 'S']);
  });

  it('treats a blank label as absent rather than as an option named ""', () => {
    const blank = toReadyMadePurchaseView(
      makeVariantList([makeVariant({ colorName: '   ', sizeLabel: null })]),
    );
    expect(blank.colorValues).toEqual([]);
    expect(blank.sizeValues).toEqual([]);
  });
});

describe('resolvePurchase', () => {
  it('offers nothing selected and no SKU before the customer chooses', () => {
    const resolution = resolvePurchase(view(), {});
    expect(resolution.state).toBe('INCOMPLETE');
    expect(resolution.sku).toBeUndefined();
    expect(resolution.selection).toEqual({});
    expect(resolution.missingAxis).toBe('color');
  });

  it('resolves exactly one SKU once both axes are chosen', () => {
    const resolution = resolvePurchase(view(), { color: 'Đen', size: 'M' });
    expect(resolution.state).toBe('RESOLVED');
    // The SECOND colour and the first size, so "the chosen one" cannot be
    // confused with "the first one".
    expect(resolution.sku?.skuId).toBe('sku-den-m');
    expect(resolution.sku?.availableQuantity).toBe(3);
  });

  it('marks a size sold out only when its refusal really is stock', () => {
    const sizes = resolvePurchase(view(), { color: 'Trắng' }).sizeOptions;
    const large = sizes.find((option) => option.value === 'L');
    expect(large).toEqual({ value: 'L', selectable: false, soldOut: true });

    // Under Đen the same size has no SKU at all, so it is equally unselectable
    // and deliberately NOT captioned `· hết`: the panel has been told nothing
    // about that variant's stock.
    const underBlack = resolvePurchase(view(), { color: 'Đen' }).sizeOptions;
    expect(underBlack.find((option) => option.value === 'L')).toEqual({
      value: 'L',
      selectable: false,
      soldOut: false,
    });
  });

  it('drops a selection the server no longer offers instead of substituting one', () => {
    // `APP12-S01` §16: the customer had chosen Trắng · M; a refetch has since
    // withdrawn every SKU of Trắng.
    const withdrawn = toReadyMadePurchaseView(
      makeVariantList([
        makeVariant({
          productVariantId: 'v-trang-m',
          colorName: 'Trắng',
          sizeLabel: 'M',
          skus: [],
        }),
        makeVariant({
          productVariantId: 'v-den-m',
          colorName: 'Đen',
          sizeLabel: 'M',
          skus: [makeSku({ skuId: 'sku-den-m' })],
        }),
      ]),
    );
    const resolution = resolvePurchase(withdrawn, { color: 'Trắng', size: 'M' });
    expect(resolution.selection.color).toBeUndefined();
    expect(resolution.sku).toBeUndefined();
    expect(resolution.state).toBe('INCOMPLETE');
    // And emphatically not the other colour that happens to still work.
    expect(JSON.stringify(resolution.selection)).not.toContain('Đen');
  });

  it('reports out of stock when nothing on the product can be bought', () => {
    const none = toReadyMadePurchaseView(
      makeVariantList([
        makeVariant({
          colorName: 'Trắng',
          sizeLabel: 'M',
          skus: [makeSku({ availableQuantity: 0 })],
        }),
      ]),
    );
    expect(resolvePurchase(none, {}).state).toBe('OUT_OF_STOCK');
    // A product that never had a SKU reaches the same approved panel — the
    // frame's own title is "no SKU can be bought".
    const never = toReadyMadePurchaseView(makeVariantList([makeVariant({ skus: [] })]));
    expect(resolvePurchase(never, {}).state).toBe('OUT_OF_STOCK');
  });

  it('requires no axis the server published no value for', () => {
    const sizeOnly = toReadyMadePurchaseView(
      makeVariantList([
        makeVariant({ productVariantId: 'v-s', colorName: null, sizeLabel: 'S' }),
        makeVariant({ productVariantId: 'v-m', colorName: null, sizeLabel: 'M' }),
      ]),
    );
    const resolution = resolvePurchase(sizeOnly, { size: 'M' });
    expect(resolution.colorOptions).toEqual([]);
    expect(resolution.state).toBe('RESOLVED');
  });

  it('resolves a single unlabelled variant with no fieldset at all', () => {
    const single = toReadyMadePurchaseView(
      makeVariantList([makeVariant({ colorName: null, sizeLabel: null })]),
    );
    const resolution = resolvePurchase(single, {});
    expect(resolution.colorOptions).toEqual([]);
    expect(resolution.sizeOptions).toEqual([]);
    expect(resolution.state).toBe('RESOLVED');
  });

  it('stays unresolved when the published labels cannot name one variant', () => {
    // Two variants the customer cannot tell apart. There is no tie-break here
    // either — the panel simply never resolves a SKU.
    const twins = toReadyMadePurchaseView(
      makeVariantList([
        makeVariant({
          productVariantId: 'v-1',
          colorName: null,
          sizeLabel: null,
          skus: [makeSku({ skuId: 'a' })],
        }),
        makeVariant({
          productVariantId: 'v-2',
          colorName: null,
          sizeLabel: null,
          skus: [makeSku({ skuId: 'b' })],
        }),
      ]),
    );
    const resolution = resolvePurchase(twins, {});
    expect(resolution.state).toBe('INCOMPLETE');
    expect(resolution.sku).toBeUndefined();
  });
});

describe('clampQuantity', () => {
  it('never leaves the positive integers', () => {
    for (const raw of ['', ' ', '0', '-1', '1.5', 'abc', 'NaN', '1e3', '٣']) {
      expect(clampQuantity(raw, 8)).toBe(1);
    }
  });

  it('never exceeds the availability the server published', () => {
    expect(clampQuantity('8', 8)).toBe(8);
    expect(clampQuantity('9', 8)).toBe(8);
    expect(clampQuantity('999999999', 8)).toBe(8);
  });

  it('re-derives the ceiling from the SKU it is given', () => {
    // The same typed value against two SKUs: a quantity valid for one cannot
    // survive onto another with less stock.
    expect(clampQuantity('8', 8)).toBe(8);
    expect(clampQuantity('8', 3)).toBe(3);
  });
});

describe('buildPurchaseContinueHref', () => {
  it('targets the checkout route for the same slug', () => {
    expect(buildPurchaseContinueHref('ao-thun-cotton', 'sku-den-m', 2)).toBe(
      '/mua-hang/ao-thun-cotton?sku=sku-den-m&quantity=2',
    );
  });

  it('carries the two selection hints and nothing else', () => {
    const href = buildPurchaseContinueHref('ao-thun-cotton', 'sku-den-m', 2);
    const query = new URL(href, 'https://shop.example.test').searchParams;
    expect([...query.keys()]).toEqual(['sku', 'quantity']);
    // Named absent, so a future field cannot be added without this failing.
    for (const forbidden of [
      'price',
      'unitPrice',
      'amount',
      'currency',
      'availableQuantity',
      'productId',
      'variantId',
      'customerId',
    ]) {
      expect(query.has(forbidden)).toBe(false);
    }
  });

  it('serializes the quantity as canonical decimal integer text', () => {
    expect(buildPurchaseContinueHref('s', 'k', 12)).toContain('quantity=12');
  });

  it('encodes a value rather than letting it write the URL', () => {
    const href = buildPurchaseContinueHref('ao-thun', 'sku&quantity=999', 1);
    const query = new URL(href, 'https://shop.example.test').searchParams;
    expect(query.get('sku')).toBe('sku&quantity=999');
    expect(query.get('quantity')).toBe('1');
  });
});

describe('purchase money', () => {
  it('groups an amount without ever converting it to a number', () => {
    expect(formatExactAmount('1250000')).toBe('1.250.000');
    expect(formatExactAmount('450000.00')).toBe('450.000');
    expect(formatExactMoney('399000', 'VND')).toBe('399.000 VND');
  });

  it('survives an amount larger than the safe integer range', () => {
    // `numeric(14,2)` crosses the driver as a string exactly so no VND amount
    // passes through an IEEE-754 double.
    expect(formatExactAmount('999999999999')).toBe('999.999.999.999');
  });

  it('returns an unrecognised or fractional amount verbatim rather than guessing', () => {
    expect(formatExactAmount('12.34')).toBe('12.34');
    expect(formatExactAmount('not-a-number')).toBe('not-a-number');
  });
});
