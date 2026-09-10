/**
 * The variant-authoring rules, proved without a database (`APP12-N02.B01`).
 *
 * Normalization and identity are pure functions on purpose: they decide whether
 * two rows are the same variant, and a rule that could only be exercised
 * through a transaction would be a rule nobody could read a counterexample for.
 */
import {
  hasVariantLabel,
  isVariantAuthorableProductState,
  nextVariantDisplayOrder,
  normalizeVariantLabel,
  VARIANT_AUTHORABLE_PRODUCT_STATES,
  variantIdentityKey,
} from './product-variant.policy';

const identity = (colorName?: string, sizeLabel?: string) =>
  variantIdentityKey({
    colorName: normalizeVariantLabel(colorName),
    sizeLabel: normalizeVariantLabel(sizeLabel),
  });

describe('variant label normalization', () => {
  it.each([
    ['  Xanh navy  ', 'Xanh navy'],
    ['Xanh   navy', 'Xanh navy'],
    ['\tXanh\n\nnavy ', 'Xanh navy'],
    ['M', 'M'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeVariantLabel(input)).toBe(expected);
  });

  it.each([[''], ['   '], ['\t\n'], [null], [undefined]])(
    'treats %j as no label at all',
    (input) => {
      expect(normalizeVariantLabel(input)).toBeUndefined();
    },
  );

  it('keeps accents, case and the characters an operator actually typed', () => {
    // Nothing here folds Unicode or strips diacritics: `Đen` is a word, not a
    // decorated `Den`, and rewriting it would store an identifier the operator
    // never entered.
    expect(normalizeVariantLabel('Đen')).toBe('Đen');
    expect(normalizeVariantLabel('Xanh Navy')).toBe('Xanh Navy');
  });
});

describe('the label requirement', () => {
  it('is satisfied by either label alone', () => {
    expect(hasVariantLabel({ colorName: 'Đen', sizeLabel: undefined })).toBe(true);
    expect(hasVariantLabel({ colorName: undefined, sizeLabel: 'M' })).toBe(true);
  });

  it('is not satisfied when neither survives normalization', () => {
    expect(hasVariantLabel({ colorName: undefined, sizeLabel: undefined })).toBe(false);
    expect(
      hasVariantLabel({
        colorName: normalizeVariantLabel('   '),
        sizeLabel: normalizeVariantLabel(''),
      }),
    ).toBe(false);
  });
});

describe('variant identity', () => {
  it('is case-insensitive and whitespace-insensitive', () => {
    expect(identity(' Xanh navy ', 'M')).toBe(identity('xanh   NAVY', 'm'));
  });

  it('does not accent-strip', () => {
    expect(identity('Đen', 'M')).not.toBe(identity('Den', 'M'));
  });

  it('keeps different sizes of one colour distinct', () => {
    expect(identity('Đen', 'M')).not.toBe(identity('Đen', 'L'));
  });

  it('keeps a missing label distinct from a label that happens to be empty-ish', () => {
    expect(identity('Đen', undefined)).not.toBe(identity('Đen', 'M'));
    // Both blank inputs collapse to the same absent value, so a colour-only
    // variant is the same variant however its size arrived.
    expect(identity('Đen', '   ')).toBe(identity('Đen', undefined));
  });

  it('cannot be confused by a label containing the separator’s neighbours', () => {
    // `("ab", undefined)` and `("a", "b")` must not collide.
    expect(identity('ab', undefined)).not.toBe(identity('a', 'b'));
  });
});

describe('display order assignment', () => {
  it('starts at zero for a product with no variant', () => {
    expect(nextVariantDisplayOrder([])).toBe(0);
  });

  it('is the stored maximum plus one, not the count', () => {
    // A gap left by earlier authoring must not produce a collision.
    expect(nextVariantDisplayOrder([{ displayOrder: 0 }, { displayOrder: 7 }])).toBe(8);
  });
});

describe('authorable product states', () => {
  it('admits DRAFT and PUBLISHED and refuses ARCHIVED', () => {
    expect(isVariantAuthorableProductState('DRAFT')).toBe(true);
    expect(isVariantAuthorableProductState('PUBLISHED')).toBe(true);
    expect(isVariantAuthorableProductState('ARCHIVED')).toBe(false);
  });

  it('is the same list SKU authoring reads', () => {
    // Stated as a test because the coupling is deliberate: a variant and its
    // SKUs are one authoring surface, and two lists that could drift would let
    // an operator create a variant on a product that then refuses the SKU which
    // makes it sellable.
    expect([...VARIANT_AUTHORABLE_PRODUCT_STATES]).toEqual(['DRAFT', 'PUBLISHED']);
  });
});
