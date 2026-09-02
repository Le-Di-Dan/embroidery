/**
 * The `APP12-S02` checkout model, as pure functions.
 *
 * Four subjects, and each is a rule the checkpoint promises rather than a
 * restatement of an implementation: the query hints are never an authority, the
 * ambiguous SKU stays fail-closed, no amount passes through a float, and the
 * delivery body carries exactly the contracted fields.
 */
import {
  MIN_CHECKOUT_QUANTITY,
  resolveCheckoutQuantity,
  resolveCheckoutSelection,
  readQueryHint,
} from '../../src/features/ready-made-checkout/model/checkout-selection';
import { multiplyExactAmount } from '../../src/features/ready-made-checkout/model/checkout-money';
import {
  materialCheckoutFingerprint,
  toDeliveryBody,
  validateDelivery,
  hasDeliveryErrors,
  EMPTY_DELIVERY_DRAFT,
  type DeliveryDraft,
} from '../../src/features/ready-made-checkout/model/delivery-draft';
import { checkoutFailureOf } from '../../src/features/ready-made-checkout/model/checkout-failure';
import { toReadyMadePurchaseView } from '../../src/features/ready-made-purchase/model/purchase-projection';
import { makeCheckoutVariantList } from '../support/ready-made-checkout-fixture';

const view = toReadyMadePurchaseView(makeCheckoutVariantList());

/** The SKU the fixture publishes for the one plainly buyable variant. */
function buyableSkuId(): string {
  const variant = view.variants.find((candidate) => candidate.subject.kind === 'buyable');
  if (variant === undefined || variant.subject.kind !== 'buyable') {
    throw new Error('The purchase fixture must publish at least one buyable SKU.');
  }
  return variant.subject.sku.skuId;
}

describe('query hints are hints', () => {
  it('resolves a SKU the current projection publishes as buyable', () => {
    const result = resolveCheckoutSelection({
      view,
      skuHint: buyableSkuId(),
      quantityHint: '2',
    });

    expect(result.kind).toBe('resolved');
    if (result.kind !== 'resolved') return;
    expect(result.selection.sku.skuId).toBe(buyableSkuId());
    expect(result.selection.quantity).toBe(2);
  });

  it('refuses an address with no SKU hint and chooses nothing', () => {
    expect(resolveCheckoutSelection({ view, skuHint: undefined, quantityHint: '1' })).toEqual({
      kind: 'refused',
      refusal: 'missing-sku',
    });
    expect(resolveCheckoutSelection({ view, skuHint: '   ', quantityHint: '1' })).toEqual({
      kind: 'refused',
      refusal: 'missing-sku',
    });
  });

  it('refuses a SKU this Product does not publish', () => {
    // The shape of a real id, and belonging to something else entirely.
    const result = resolveCheckoutSelection({
      view,
      skuHint: '11111111-2222-4333-8444-555555555555',
      quantityHint: '1',
    });
    expect(result).toEqual({ kind: 'refused', refusal: 'unknown-sku' });
  });

  it('refuses a SKU that is published here but not purchasable', () => {
    const soldOut = view.variants.find((candidate) => candidate.subject.kind === 'sold-out');
    expect(soldOut).toBeDefined();
    if (soldOut === undefined || soldOut.subject.kind !== 'sold-out') return;

    expect(
      resolveCheckoutSelection({ view, skuHint: soldOut.subject.sku.skuId, quantityHint: '1' }),
    ).toEqual({ kind: 'refused', refusal: 'not-purchasable' });
  });

  it('refuses every SKU under an ambiguous variant, whichever one is named', () => {
    const raw = makeCheckoutVariantList();
    const ambiguous = raw.variants.find((variant) => variant.skus.length > 1);
    expect(ambiguous).toBeDefined();
    if (ambiguous === undefined) return;

    for (const sku of ambiguous.skus) {
      // Not `unknown-sku`, and not a selection: the projection publishes no
      // buyable subject for an ambiguous variant, so no hint can reach through
      // it and no heuristic picks a winner.
      expect(resolveCheckoutSelection({ view, skuHint: sku.skuId, quantityHint: '1' })).toEqual({
        kind: 'refused',
        refusal: 'unknown-sku',
      });
    }
  });

  it('refuses everything when the projection could not be read', () => {
    expect(
      resolveCheckoutSelection({ view: undefined, skuHint: buyableSkuId(), quantityHint: '1' }),
    ).toEqual({ kind: 'refused', refusal: 'unavailable' });
  });

  it('takes no position on a repeated parameter', () => {
    expect(readQueryHint(['a', 'b'])).toBeUndefined();
    expect(readQueryHint('a')).toBe('a');
    expect(readQueryHint(undefined)).toBeUndefined();
  });
});

describe('quantity hints', () => {
  it.each([
    ['', MIN_CHECKOUT_QUANTITY],
    ['0', MIN_CHECKOUT_QUANTITY],
    ['-3', MIN_CHECKOUT_QUANTITY],
    ['2.5', MIN_CHECKOUT_QUANTITY],
    ['2e3', MIN_CHECKOUT_QUANTITY],
    ['12abc', MIN_CHECKOUT_QUANTITY],
    ['abc', MIN_CHECKOUT_QUANTITY],
    ['١٢', MIN_CHECKOUT_QUANTITY],
  ])('resets the malformed value %p rather than coercing digits out of it', (raw, expected) => {
    expect(resolveCheckoutQuantity(raw, 8)).toBe(expected);
  });

  it('never exceeds the availability this read published', () => {
    expect(resolveCheckoutQuantity('99', 3)).toBe(3);
    expect(resolveCheckoutQuantity('3', 3)).toBe(3);
    expect(resolveCheckoutQuantity(undefined, 3)).toBe(MIN_CHECKOUT_QUANTITY);
  });
});

describe('exact money', () => {
  it('multiplies without ever entering a float', () => {
    expect(multiplyExactAmount('399000', 3)).toBe('1197000');
    expect(multiplyExactAmount('1250000.10', 3)).toBe('3750000.30');
    expect(multiplyExactAmount('0', 5)).toBe('0');
  });

  it('agrees with a big-integer computation over the whole contract range', () => {
    // The largest amount `numeric(14,2)` admits, times the largest quantity the
    // contract admits — well past `Number.MAX_SAFE_INTEGER` in minor units.
    const product = multiplyExactAmount('999999999999.99', 100000);
    expect(product).toBe('99999999999999000.00');
  });

  it('states nothing rather than guessing at an amount it does not recognise', () => {
    expect(multiplyExactAmount('1,250,000', 2)).toBeUndefined();
    expect(multiplyExactAmount('abc', 2)).toBeUndefined();
    expect(multiplyExactAmount('399000', 0)).toBeUndefined();
    expect(multiplyExactAmount('399000', 1.5)).toBeUndefined();
  });
});

describe('delivery', () => {
  const filled: DeliveryDraft = {
    recipientName: ' Nguyễn Minh Anh ',
    recipientPhone: ' 0901234567 ',
    addressLine: ' 12 Nguyễn Huệ, Phường Bến Nghé, Quận 1 ',
    province: ' TP. Hồ Chí Minh ',
  };

  it('requires exactly the four contracted fields', () => {
    expect(hasDeliveryErrors(validateDelivery(EMPTY_DELIVERY_DRAFT))).toBe(true);
    expect(Object.keys(validateDelivery(EMPTY_DELIVERY_DRAFT)).sort()).toEqual([
      'addressLine',
      'province',
      'recipientName',
      'recipientPhone',
    ]);
    expect(hasDeliveryErrors(validateDelivery(filled))).toBe(false);
  });

  it('refuses a field holding only whitespace', () => {
    expect(validateDelivery({ ...filled, province: '   ' }).province).toBeDefined();
  });

  it('trims, and sends no key for a field the contract makes optional', () => {
    const body = toDeliveryBody(filled);
    expect(body).toEqual({
      recipientName: 'Nguyễn Minh Anh',
      recipientPhone: '0901234567',
      addressLine: '12 Nguyễn Huệ, Phường Bến Nghé, Quận 1',
      province: 'TP. Hồ Chí Minh',
    });
    // `ward` and `district` are absent rather than empty: the contract gives
    // them `minLength: 1`, so an empty string would be a refusal.
    expect(Object.keys(body).sort()).toEqual([
      'addressLine',
      'province',
      'recipientName',
      'recipientPhone',
    ]);
  });

  it('takes no position on the shape of a phone number', () => {
    // The contract asks for 1–32 characters and nothing more; a client-side
    // format rule would reject a number the server would have accepted.
    expect(hasDeliveryErrors(validateDelivery({ ...filled, recipientPhone: '+84 (90) 123' }))).toBe(
      false,
    );
  });
});

describe('material fingerprint', () => {
  const base = {
    skuId: 'sku-1',
    quantity: 2,
    delivery: {
      recipientName: 'A',
      recipientPhone: '1',
      addressLine: 'X',
      province: 'P',
    },
    challengeId: 'challenge-1',
  } as const;

  it('is stable for the same order', () => {
    expect(materialCheckoutFingerprint(base)).toBe(materialCheckoutFingerprint({ ...base }));
  });

  it.each([
    ['skuId', { ...base, skuId: 'sku-2' }],
    ['quantity', { ...base, quantity: 3 }],
    ['challenge', { ...base, challengeId: 'challenge-2' }],
    ['address', { ...base, delivery: { ...base.delivery, addressLine: 'Y' } }],
  ])('changes when the %s changes', (_label, changed) => {
    expect(materialCheckoutFingerprint(changed)).not.toBe(materialCheckoutFingerprint(base));
  });

  it('cannot be collided by moving a character between adjacent fields', () => {
    const left = materialCheckoutFingerprint({
      ...base,
      delivery: { ...base.delivery, recipientName: 'ab', recipientPhone: 'c' },
    });
    const right = materialCheckoutFingerprint({
      ...base,
      delivery: { ...base.delivery, recipientName: 'a', recipientPhone: 'bc' },
    });
    expect(left).not.toBe(right);
  });
});

describe('refusal mapping', () => {
  it.each([
    ['SKU_NOT_AVAILABLE', 'SKU_UNAVAILABLE'],
    ['INSUFFICIENT_STOCK', 'INSUFFICIENT_STOCK'],
    ['VERIFIED_CONTACT_REQUIRED', 'VERIFICATION_REQUIRED'],
    ['IDEMPOTENCY_CONFLICT', 'ALREADY_ORDERED'],
    ['DUPLICATE_OPERATION', 'IN_FLIGHT'],
  ])('maps the business code %s', (code, expected) => {
    expect(checkoutFailureOf({ code, message: 'ignored' })).toBe(expected);
  });

  it('maps a refused body to the delivery refusal', () => {
    expect(checkoutFailureOf({ code: 'BAD_REQUEST', message: 'x', httpStatus: 400 })).toBe(
      'INVALID_DELIVERY',
    );
  });

  it('never borrows the stock sentence for an outcome it does not recognise', () => {
    expect(checkoutFailureOf({ code: 'NETWORK_ERROR', message: 'x' })).toBe('UNEXPECTED');
    expect(
      checkoutFailureOf({ code: 'INTERNAL_SERVER_ERROR', message: 'x', httpStatus: 500 }),
    ).toBe('UNEXPECTED');
    expect(checkoutFailureOf({ code: 'TOO_MANY_REQUESTS', message: 'x', httpStatus: 429 })).toBe(
      'UNEXPECTED',
    );
  });
});
