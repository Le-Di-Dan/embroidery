/**
 * @jest-environment node
 *
 * The pure sellability model: variant titles, structural arithmetic, effective
 * price, the two form mappers and the refusal classifier.
 *
 * These are the rules the screen states as fact — "0 phiên bản đang hoạt động",
 * "Giá riêng cho SKU: 385.000 ₫", "this is the last one" — so they are proved
 * without a browser, and the browser journeys prove the wiring rather than the
 * arithmetic.
 */
import {
  classifySellabilityWriteFailure,
  preservesStagedInput,
  requiresAuthoritativeReload,
  SellabilityApiError,
} from '../../src/features/product-sellability/model/sellability-failure';
import {
  formatDong,
  isResolvablePrice,
  overrideInputToAmount,
  resolveSkuPrice,
} from '../../src/features/product-sellability/model/sku-effective-price';
import {
  NEW_SKU_FORM,
  skuFormFrom,
  toCreateSkuBody,
  toSkuActivationBody,
  toUpdateSkuBody,
  validateSkuForm,
} from '../../src/features/product-sellability/model/sku-form';
import {
  NEW_VARIANT_FORM,
  toCreateVariantBody,
  toUpdateVariantBody,
  toVariantActivationBody,
  validateVariantForm,
  variantFormFrom,
} from '../../src/features/product-sellability/model/variant-form';
import {
  isLastActiveVariant,
  isLastOrderEligibleSku,
  isStructurallyUnsellable,
  orderEligibleSkuOf,
  summarizeStructure,
  variantTitle,
} from '../../src/features/product-sellability/model/variant-presentation';

interface SkuSeed {
  readonly skuId: string;
  readonly code: string;
  readonly isActive: boolean;
  readonly priceOverrideAmount?: string;
}

function sku(seed: SkuSeed) {
  return {
    skuId: seed.skuId,
    code: seed.code,
    isActive: seed.isActive,
    currencyCode: 'VND' as const,
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
    ...(seed.priceOverrideAmount === undefined
      ? {}
      : { priceOverrideAmount: seed.priceOverrideAmount }),
  };
}

function variant(options: {
  readonly variantId: string;
  readonly colorName?: string | null;
  readonly sizeLabel?: string | null;
  readonly isActive: boolean;
  readonly skus?: readonly SkuSeed[];
}) {
  return {
    variantId: options.variantId,
    productId: 'product-1',
    colorName: options.colorName ?? null,
    sizeLabel: options.sizeLabel ?? null,
    isActive: options.isActive,
    displayOrder: 1,
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
    skus: (options.skus ?? []).map(sku),
  };
}

describe('variant title', () => {
  it('joins both labels, and is either label alone when only one exists', () => {
    expect(variantTitle({ colorName: 'Xanh navy', sizeLabel: 'M' })).toBe('Xanh navy · M');
    expect(variantTitle({ colorName: 'Xanh navy', sizeLabel: null })).toBe('Xanh navy');
    expect(variantTitle({ colorName: null, sizeLabel: 'M' })).toBe('M');
  });

  it('treats a whitespace-only label as absent rather than rendering a bare separator', () => {
    expect(variantTitle({ colorName: '   ', sizeLabel: 'M' })).toBe('M');
  });
});

describe('structural arithmetic', () => {
  const eligible = { skuId: 'sku-1', code: 'AT-NAVY-M', isActive: true };

  it('counts order-eligible SKUs only under active variants', () => {
    // An active SKU under a deactivated variant is not orderable, and counting
    // it would make the warning's evidence disagree with the readiness report.
    const variants = [
      variant({ variantId: 'v-1', colorName: 'Navy', isActive: false, skus: [eligible] }),
      variant({ variantId: 'v-2', colorName: 'Đỏ', isActive: true, skus: [] }),
    ];
    expect(summarizeStructure(variants)).toEqual({
      variantCount: 2,
      activeVariantCount: 1,
      orderEligibleSkuCount: 0,
    });
  });

  it('finds the one SKU an order could resolve, or none', () => {
    const withEligible = variant({
      variantId: 'v-1',
      colorName: 'Navy',
      isActive: true,
      skus: [{ skuId: 'sku-0', code: 'OLD', isActive: false }, eligible],
    });
    expect(orderEligibleSkuOf(withEligible)?.code).toBe('AT-NAVY-M');
    expect(orderEligibleSkuOf(variant({ variantId: 'v-2', isActive: true }))).toBeNull();
  });
});

describe('structural unsellability', () => {
  const healthy = { variantCount: 1, activeVariantCount: 1, orderEligibleSkuCount: 1 };

  it('is a published-only judgement', () => {
    const broken = { variantCount: 1, activeVariantCount: 1, orderEligibleSkuCount: 0 };
    expect(isStructurallyUnsellable('PUBLISHED', broken)).toBe(true);
    // A draft with no SKU is unfinished, not broken. The readiness checklist is
    // where that is reported.
    expect(isStructurallyUnsellable('DRAFT', broken)).toBe(false);
  });

  it('is not a sold-out test: a valid structure is never flagged', () => {
    expect(isStructurallyUnsellable('PUBLISHED', healthy)).toBe(false);
  });

  it('flags a published product with no active variant', () => {
    expect(
      isStructurallyUnsellable('PUBLISHED', {
        variantCount: 2,
        activeVariantCount: 0,
        orderEligibleSkuCount: 0,
      }),
    ).toBe(true);
  });
});

describe('last-of-its-kind detection', () => {
  const variants = [
    variant({
      variantId: 'v-1',
      colorName: 'Navy',
      isActive: true,
      skus: [{ skuId: 'sku-1', code: 'A', isActive: true }],
    }),
    variant({ variantId: 'v-2', colorName: 'Đỏ', isActive: false }),
  ];

  it('names the last active variant and no inactive one', () => {
    expect(isLastActiveVariant(variants, 'v-1')).toBe(true);
    expect(isLastActiveVariant(variants, 'v-2')).toBe(false);
  });

  it('asks the last-SKU question of the product, not of one variant', () => {
    expect(isLastOrderEligibleSku(variants, 'sku-1')).toBe(true);
    const twoSelling = [
      ...variants,
      variant({
        variantId: 'v-3',
        colorName: 'Trắng',
        isActive: true,
        skus: [{ skuId: 'sku-2', code: 'B', isActive: true }],
      }),
    ];
    // A variant losing its last selling SKU while another still sells is an
    // ordinary edit; the confirmation is reserved for the unbuyable change.
    expect(isLastOrderEligibleSku(twoSelling, 'sku-1')).toBe(false);
  });
});

describe('effective price', () => {
  it('inherits the base price when there is no override', () => {
    expect(resolveSkuPrice(sku({ skuId: 's', code: 'C', isActive: true }), '250000')).toEqual({
      source: 'inherited',
      amount: '250000',
      resolvable: true,
    });
  });

  it('treats "0" as an explicit override, never as inheritance', () => {
    const price = resolveSkuPrice(
      sku({ skuId: 's', code: 'C', isActive: true, priceOverrideAmount: '0' }),
      '250000',
    );
    expect(price.source).toBe('override');
    expect(price.amount).toBe('0');
    expect(price.resolvable).toBe(false);
  });

  it('reports an unset base price as unresolvable without inventing an amount', () => {
    expect(isResolvablePrice('0')).toBe(false);
    expect(isResolvablePrice(undefined)).toBe(false);
    expect(isResolvablePrice('250000')).toBe(true);
  });

  it('groups đồng without arithmetic', () => {
    expect(formatDong('385000')).toBe('385.000 ₫');
  });

  it('normalizes override input and refuses what the contract would', () => {
    expect(overrideInputToAmount(' 00250 ')).toBe('250');
    expect(overrideInputToAmount('0')).toBe('0');
    expect(overrideInputToAmount('')).toBeNull();
    expect(overrideInputToAmount('12,000')).toBeNull();
    expect(overrideInputToAmount('1234567890123')).toBeNull();
  });
});

describe('variant form', () => {
  it('requires at least one label and accepts either alone', () => {
    expect(validateVariantForm(NEW_VARIANT_FORM)).toBe('labelRequired');
    expect(validateVariantForm({ colorName: ' ', sizeLabel: 'M', isActive: true })).toBeNull();
  });

  it('maps a blank label to null and trims the other', () => {
    expect(toCreateVariantBody({ colorName: '  Navy ', sizeLabel: '', isActive: true })).toEqual({
      colorName: 'Navy',
      sizeLabel: null,
      isActive: true,
    });
  });

  it('never sends displayOrder, and never sends isActive on a label edit', () => {
    const body = toUpdateVariantBody({ colorName: 'Navy', sizeLabel: 'M', isActive: true });
    expect(body).toEqual({ colorName: 'Navy', sizeLabel: 'M' });
    expect(Object.keys(toCreateVariantBody(NEW_VARIANT_FORM))).not.toContain('displayOrder');
  });

  it('expresses activation as its own body', () => {
    expect(toVariantActivationBody(false)).toEqual({ isActive: false });
  });

  it('seeds the edit form from the record, mapping null back to blank', () => {
    expect(variantFormFrom({ colorName: null, sizeLabel: 'M', isActive: false })).toEqual({
      colorName: '',
      sizeLabel: 'M',
      isActive: false,
    });
  });
});

describe('SKU form', () => {
  it('requires a code, and requires an amount only in override mode', () => {
    expect(validateSkuForm(NEW_SKU_FORM)).toBe('codeRequired');
    expect(validateSkuForm({ ...NEW_SKU_FORM, code: 'A' })).toBeNull();
    expect(
      validateSkuForm({ ...NEW_SKU_FORM, code: 'A', priceMode: 'override', priceOverride: '' }),
    ).toBe('priceRequired');
    expect(
      validateSkuForm({ ...NEW_SKU_FORM, code: 'A', priceMode: 'override', priceOverride: 'x' }),
    ).toBe('priceInvalid');
  });

  it('accepts "0" as a valid override rather than rejecting or reinterpreting it', () => {
    const values = {
      ...NEW_SKU_FORM,
      code: 'A',
      priceMode: 'override' as const,
      priceOverride: '0',
    };
    expect(validateSkuForm(values)).toBeNull();
    expect(toCreateSkuBody(values).priceOverrideAmount).toBe('0');
  });

  it('omits the override on create and clears it with null on update', () => {
    const inherit = { ...NEW_SKU_FORM, code: 'A' };
    expect(toCreateSkuBody(inherit)).toEqual({ code: 'A', isActive: true });
    expect(toUpdateSkuBody(inherit)).toEqual({ code: 'A', priceOverrideAmount: null });
  });

  it('never sends isActive on a definition edit', () => {
    const body = toUpdateSkuBody({
      code: 'A',
      priceMode: 'override',
      priceOverride: '385000',
      isActive: true,
    });
    expect(body).toEqual({ code: 'A', priceOverrideAmount: '385000' });
    expect(toSkuActivationBody(false)).toEqual({ isActive: false });
  });

  it('seeds override mode from the presence of the amount', () => {
    expect(skuFormFrom({ code: 'A', isActive: true }).priceMode).toBe('inherit');
    expect(skuFormFrom({ code: 'A', isActive: true, priceOverrideAmount: '0' }).priceMode).toBe(
      'override',
    );
  });
});

describe('refusal classification', () => {
  function refusal(code: string | undefined, httpStatus: number | undefined) {
    return new SellabilityApiError({
      code,
      httpStatus,
      message: 'server prose that must never be branched on',
    } as never);
  }

  it('separates the three 409s the two contracts publish', () => {
    expect(
      classifySellabilityWriteFailure(refusal('PRODUCT_VARIANT_DUPLICATE', 409), 'variant'),
    ).toBe('duplicate');
    expect(
      classifySellabilityWriteFailure(refusal('SKU_ORDER_ELIGIBLE_AMBIGUOUS', 409), 'sku'),
    ).toBe('skuAmbiguous');
    expect(classifySellabilityWriteFailure(refusal('SKU_CODE_CONFLICT', 409), 'sku')).toBe(
      'skuCodeConflict',
    );
  });

  it('maps the label refusal and both not-authorable codes', () => {
    expect(classifySellabilityWriteFailure(refusal('VARIANT_LABEL_REQUIRED', 400), 'variant')).toBe(
      'labelRequired',
    );
    expect(
      classifySellabilityWriteFailure(refusal('VARIANT_PRODUCT_NOT_AUTHORABLE', 409), 'variant'),
    ).toBe('notAuthorable');
    expect(classifySellabilityWriteFailure(refusal('SKU_PRODUCT_NOT_AUTHORABLE', 409), 'sku')).toBe(
      'notAuthorable',
    );
  });

  it('collapses the 404 family to one reload-shaped outcome per subject', () => {
    expect(
      classifySellabilityWriteFailure(refusal('VARIANT_PRODUCT_MISMATCH', 404), 'variant'),
    ).toBe('variantMissing');
    expect(classifySellabilityWriteFailure(refusal('SKU_NOT_FOUND', 404), 'sku')).toBe(
      'skuMissing',
    );
  });

  it('treats a lost response and an unrecognised 409 as reload-and-look, never as a resend', () => {
    expect(classifySellabilityWriteFailure(refusal(undefined, undefined), 'sku')).toBe('retryable');
    expect(classifySellabilityWriteFailure(refusal('SOMETHING_NEW', 409), 'sku')).toBe('retryable');
    expect(classifySellabilityWriteFailure(refusal(undefined, 503), 'variant')).toBe('retryable');
  });

  it('keeps staged input for every refusal except a lost session', () => {
    expect(preservesStagedInput('skuAmbiguous')).toBe(true);
    expect(preservesStagedInput('duplicate')).toBe(true);
    expect(preservesStagedInput('unauthenticated')).toBe(false);
  });

  it('re-reads only when the refusal was decided by state the dialog cannot see', () => {
    expect(requiresAuthoritativeReload('duplicate')).toBe(true);
    expect(requiresAuthoritativeReload('skuAmbiguous')).toBe(true);
    expect(requiresAuthoritativeReload('labelRequired')).toBe(false);
  });
});
