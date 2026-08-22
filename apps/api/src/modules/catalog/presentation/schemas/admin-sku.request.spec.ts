/**
 * Strict request validation for the two Admin SKU operations (`APP7-B01`).
 *
 * Two properties are asserted here and nowhere else: that a body cannot name a
 * server-owned field, and — the one that matters for this checkpoint — that no
 * body shape exists which could move a SKU to another variant.
 */
import {
  createSkuBodySchema,
  createSkuParamsSchema,
  skuIdParamSchema,
  updateSkuBodySchema,
} from './admin-sku.request';

const PRODUCT_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6073';
const VARIANT_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';
const SKU_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';

describe('SKU path parameters', () => {
  it('accepts the uuid7 identifiers the schema actually issues', () => {
    expect(createSkuParamsSchema.parse({ productId: PRODUCT_ID, variantId: VARIANT_ID })).toEqual({
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
    });
    expect(skuIdParamSchema.parse({ skuId: SKU_ID })).toEqual({ skuId: SKU_ID });
  });

  it('rejects a non-uuid before any repository call or lock is taken', () => {
    expect(
      createSkuParamsSchema.safeParse({ productId: 'nope', variantId: VARIANT_ID }).success,
    ).toBe(false);
    expect(skuIdParamSchema.safeParse({ skuId: '1' }).success).toBe(false);
  });
});

/**
 * Codes that accepted authority makes legal and that `APP7-B01`'s invented
 * ASCII regex refused. Derived from the authority, not chosen first:
 *
 * - `skus.code` is `text NOT NULL` (COL-TBL014-02) — `text` restricts no
 *   character, and no CHECK constrains this column.
 * - ADR-DB5-002 R1 files it under Population A, compared **bytewise** under the
 *   `C` collation (R2). That ADR's own decision drivers name `Đ` and `à` as
 *   characters whose *ordering* is arbitrary under `C` while equality stays
 *   exact — so a Vietnamese code is precisely the case the collation choice was
 *   made to handle, not one it excludes.
 * - ADR-DB5-002 R3 lists the columns stored pre-normalized: lowercase email,
 *   E.164 phone, slugified paths. A SKU code is not among them, so no
 *   normalization may narrow it either.
 *
 * - The physical DDL agrees: `0007_create_catalog_tables.sql:59,66` declares
 *   `"code" text NOT NULL` with `uq_skus__code` and no CHECK, and no later
 *   migration alters it.
 *
 * `APP7-B01-C1` used the first two to remove the invented alphabet.
 * `APP7-B01-FD1` uses the same audit to remove the length and nonblank bounds
 * C1 had argued were payload limits.
 */
const AUTHORITY_LEGAL_CODES = [
  ['Vietnamese with diacritics and Đ', 'ÁO-THUN-ĐEN-M'],
  ['ASCII punctuation and a space outside the invented set', 'TEE/BLK M#1'],
  // `APP7-B01-FD1`: authority defines no nonblank rule and no maximum, so
  // neither of these may be refused here. Whether they are *desirable* SKU
  // codes is a business-policy question no accepted source answers, and
  // `APP7-B01` may not answer it by validation.
  ['the empty string, which no rule forbids', ''],
  ['a whitespace-only value', '   '],
  ['a value far longer than the 64 C1 allowed', 'X'.repeat(300)],
] as const;

describe('SKU code carries only its wire type (APP7-B01-C1, APP7-B01-FD1)', () => {
  it.each(AUTHORITY_LEGAL_CODES)('create accepts %s', (_label, code) => {
    expect(createSkuBodySchema.parse({ code, isActive: true })).toEqual({ code, isActive: true });
  });

  it.each(AUTHORITY_LEGAL_CODES)('update accepts %s', (_label, code) => {
    expect(updateSkuBodySchema.parse({ code })).toEqual({ code });
  });

  it('returns the code unchanged — no trimming, folding or replacement', () => {
    // `uq_skus__code` compares the stored bytes, so a value this layer "fixed"
    // would be a different identifier from the one the Admin typed.
    for (const code of ['  tee blk  ', 'tb-case', 'TB-CASE', 'ÁO-THUN-ĐEN-M']) {
      expect(createSkuBodySchema.parse({ code, isActive: false }).code).toBe(code);
      expect(updateSkuBodySchema.parse({ code }).code).toBe(code);
    }
  });

  it('still refuses a non-string, which is the wire type and not a SKU rule', () => {
    expect(createSkuBodySchema.safeParse({ code: 123, isActive: true }).success).toBe(false);
    expect(createSkuBodySchema.safeParse({ code: null, isActive: true }).success).toBe(false);
  });
});

describe('create SKU body', () => {
  it('accepts a code and an explicit sellable flag', () => {
    expect(createSkuBodySchema.parse({ code: 'TB-GAU-NAU-M', isActive: true })).toEqual({
      code: 'TB-GAU-NAU-M',
      isActive: true,
    });
  });

  it('requires `isActive` rather than defaulting it', () => {
    // A server default of `true` would make a second SKU on a variant
    // impossible to author, because the first would always hold the single
    // order-eligible slot.
    expect(createSkuBodySchema.safeParse({ code: 'TB-1' }).success).toBe(false);
  });

  it('accepts an optional whole-đồng price override as a string', () => {
    expect(
      createSkuBodySchema.parse({ code: 'TB-1', priceOverrideAmount: '250000', isActive: false }),
    ).toEqual({ code: 'TB-1', priceOverrideAmount: '250000', isActive: false });
  });

  it.each([
    ['a JSON number', 250_000],
    ['a fractional amount', '250000.50'],
    ['a negative amount', '-1'],
    ['a thousands separator', '250,000'],
    ['more than twelve digits', '1000000000000'],
  ])('rejects %s as a price override', (_label, priceOverrideAmount) => {
    const result = createSkuBodySchema.safeParse({
      code: 'TB-1',
      priceOverrideAmount,
      isActive: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects every server-owned field', () => {
    for (const extra of [
      { id: SKU_ID },
      { currencyCode: 'USD' },
      { productVariantId: VARIANT_ID },
      { createdAt: '2026-08-22T00:00:00.000Z' },
      { quantityOnHand: 5 },
    ]) {
      const result = createSkuBodySchema.safeParse({ code: 'TB-1', isActive: true, ...extra });
      expect(result.success).toBe(false);
    }
  });
});

describe('update SKU body', () => {
  it('accepts a single field', () => {
    expect(updateSkuBodySchema.parse({ isActive: false })).toEqual({ isActive: false });
  });

  it('accepts null to clear the price override back to the product base price', () => {
    expect(updateSkuBodySchema.parse({ priceOverrideAmount: null })).toEqual({
      priceOverrideAmount: null,
    });
  });

  it('rejects an empty patch, which would write nothing and audit a change', () => {
    expect(updateSkuBodySchema.safeParse({}).success).toBe(false);
  });

  it('has no shape that rebinds a SKU to another variant', () => {
    // The invariant this checkpoint enforces is per variant, so a body that
    // could move a SKU would move it out of a set that had already been
    // evaluated and into one that had not.
    for (const extra of [
      { productVariantId: VARIANT_ID },
      { variantId: VARIANT_ID },
      { productId: PRODUCT_ID },
    ]) {
      expect(updateSkuBodySchema.safeParse({ isActive: true, ...extra }).success).toBe(false);
    }
  });

  it('rejects a blank string as a price override', () => {
    expect(updateSkuBodySchema.safeParse({ priceOverrideAmount: '' }).success).toBe(false);
  });
});
