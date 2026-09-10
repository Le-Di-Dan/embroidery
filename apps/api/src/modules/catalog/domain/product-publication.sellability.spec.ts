/**
 * The three sellability requirements (`APP12-N02.B01` §14, `N02.D01` §J).
 *
 * A suite of its own beside `product-publication.readiness.spec.ts`, which
 * proves the original seven. The split is a responsibility boundary, not a size
 * one: everything here starts from a Product that is otherwise fully
 * publishable and varies **only** its selling structure, so a failure names a
 * sellability rule and never a media or category rule.
 *
 * The five states are the ones the approved design draws (`N02.D01` §J.2), and
 * the last two are drawn as separate frames on purpose: D (stock 0) and E
 * (stock > 0) carry an identical criterion list, because stock appears in none
 * of the ten. There is no stock fact in this file at all — the facts type has
 * nowhere to put one, which is what makes that structural rather than a promise.
 */
import { PRODUCT_PUBLICATION_REQUIREMENT_CODES } from './product-publication.policy';
import {
  evaluatePublicationReadiness,
  unsatisfiedRequirements,
  type ProductPublicationFacts,
  type PublicationSkuFacts,
  type PublicationVariantFacts,
} from './product-publication.readiness';

const ASSET = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07';
const VARIANT_A = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e09';
const VARIANT_B = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e0b';
const SKU_A = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e0a';
const SKU_B = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e0c';

const SELLABILITY_CODES = ['HAS_ACTIVE_VARIANT', 'HAS_ORDER_ELIGIBLE_SKU', 'SKU_PRICE_RESOLVABLE'];

/** Everything except the selling structure, already publishable. */
function factsWith(
  variants: readonly PublicationVariantFacts[],
  skus: readonly PublicationSkuFacts[],
  basePriceAmount = '250000.00',
): ProductPublicationFacts {
  return {
    product: {
      name: 'Áo thun cotton',
      slug: 'ao-thun-cotton',
      description: 'Áo thun cotton thêu logo.',
      basePriceAmount,
      currencyCode: 'VND',
    },
    category: { status: 'PUBLISHED', archivedAt: undefined },
    media: [{ assetId: ASSET, role: 'THUMBNAIL', displayOrder: 0 }],
    assets: [
      {
        assetId: ASSET,
        kind: 'CATALOG_MEDIA',
        classification: 'PRODUCTION_SENSITIVE',
        status: 'ACCEPTED',
        deletedAt: undefined,
      },
    ],
    derivatives: (['THUMBNAIL', 'CATALOG_PREVIEW'] as const).map((kind) => ({
      assetId: ASSET,
      kind,
      status: 'READY',
      isWatermarked: false,
      storageKey: `development/derivatives/${ASSET}/${kind}.webp`,
    })),
    variants,
    skus,
  };
}

function sku(overrides: Partial<PublicationSkuFacts> = {}): PublicationSkuFacts {
  return {
    skuId: SKU_A,
    variantId: VARIANT_A,
    isActive: true,
    priceOverrideAmount: undefined,
    currencyCode: 'VND',
    ...overrides,
  };
}

/** The unsatisfied requirement codes of one set of facts, in the locked order. */
function failures(facts: ProductPublicationFacts): string[] {
  return unsatisfiedRequirements(evaluatePublicationReadiness(facts));
}

/** The satisfied flag of one requirement code. */
function satisfied(facts: ProductPublicationFacts, code: string): boolean {
  const requirement = evaluatePublicationReadiness(facts).requirements.find((r) => r.code === code);
  if (requirement === undefined) {
    throw new Error(`No such requirement: ${code}`);
  }
  return requirement.satisfied;
}

describe('publication readiness — sellability', () => {
  it('carries exactly ten requirements, the three new ones last', () => {
    const readiness = evaluatePublicationReadiness(
      factsWith([{ variantId: VARIANT_A, isActive: true }], [sku()]),
    );
    expect(readiness.requirements).toHaveLength(10);
    expect(readiness.requirements.slice(7).map((r) => r.code)).toEqual(SELLABILITY_CODES);
    expect(readiness.requirements.map((r) => r.code)).toEqual([
      ...PRODUCT_PUBLICATION_REQUIREMENT_CODES,
    ]);
  });

  describe('state A — no active variant', () => {
    const noActive = factsWith([{ variantId: VARIANT_A, isActive: false }], []);

    it('fails only HAS_ACTIVE_VARIANT, and names one thing to fix', () => {
      // The vacuity rule, and the reason it matters: reporting three failures
      // for one missing prerequisite would tell the operator to fix three
      // things. Rendering that literally is `N02.A01`'s problem, not the
      // contract's — the contract stays `satisfied: true | false`.
      expect(failures(noActive)).toEqual(['HAS_ACTIVE_VARIANT']);
      expect(satisfied(noActive, 'HAS_ORDER_ELIGIBLE_SKU')).toBe(true);
      expect(satisfied(noActive, 'SKU_PRICE_RESOLVABLE')).toBe(true);
    });

    it('refuses publication', () => {
      expect(evaluatePublicationReadiness(noActive).eligible).toBe(false);
    });

    it('fails the same way when the product has no variant row at all', () => {
      const none = factsWith([], []);
      expect(failures(none)).toEqual(['HAS_ACTIVE_VARIANT']);
      expect(evaluatePublicationReadiness(none).eligible).toBe(false);
    });
  });

  describe('state B — an active variant with no order-eligible SKU', () => {
    it('fails only HAS_ORDER_ELIGIBLE_SKU when every SKU is inactive', () => {
      const facts = factsWith(
        [{ variantId: VARIANT_A, isActive: true }],
        [sku({ isActive: false })],
      );
      expect(failures(facts)).toEqual(['HAS_ORDER_ELIGIBLE_SKU']);
      expect(satisfied(facts, 'HAS_ACTIVE_VARIANT')).toBe(true);
      expect(satisfied(facts, 'SKU_PRICE_RESOLVABLE')).toBe(true);
      expect(evaluatePublicationReadiness(facts).eligible).toBe(false);
    });

    it('fails the same way when the variant has no SKU at all', () => {
      // The shape `N02.G01` actually found live on `ao-thun-cotton`: one active
      // variant and zero SKUs. "Has a variant" would have passed this product.
      const facts = factsWith([{ variantId: VARIANT_A, isActive: true }], []);
      expect(failures(facts)).toEqual(['HAS_ORDER_ELIGIBLE_SKU']);
    });

    it('does not count an active SKU whose variant is inactive', () => {
      // Reachability, not just flags: a customer chooses the variant, so a SKU
      // under a delisted one is not for sale however active it is.
      const facts = factsWith([{ variantId: VARIANT_A, isActive: false }], [sku()]);
      expect(failures(facts)).toEqual(['HAS_ACTIVE_VARIANT']);
      expect(satisfied(facts, 'HAS_ORDER_ELIGIBLE_SKU')).toBe(true);
    });

    it('counts an active SKU under the active one of two variants', () => {
      const facts = factsWith(
        [
          { variantId: VARIANT_A, isActive: false },
          { variantId: VARIANT_B, isActive: true },
        ],
        [sku({ skuId: SKU_B, variantId: VARIANT_B })],
      );
      expect(failures(facts)).toEqual([]);
    });
  });

  describe('state C — price resolvability', () => {
    const active = [{ variantId: VARIANT_A, isActive: true }];

    it('passes on an inherited base price', () => {
      expect(satisfied(factsWith(active, [sku()]), 'SKU_PRICE_RESOLVABLE')).toBe(true);
    });

    it('passes on a valid positive override', () => {
      expect(
        satisfied(
          factsWith(active, [sku({ priceOverrideAmount: '385000' })]),
          'SKU_PRICE_RESOLVABLE',
        ),
      ).toBe(true);
    });

    it('fails on a "0" override while the base price requirement stays satisfied', () => {
      // The standalone case, and the reason this criterion is not a shadow of
      // `PRODUCT_PRICE_READY`: `priceOverrideAmount` is validated only as
      // `^\d{1,12}$`, so a deliberate zero is an accepted override, and under
      // the old seven this product published 7/7 and sold for nothing.
      const facts = factsWith(active, [sku({ priceOverrideAmount: '0' })]);
      expect(satisfied(facts, 'PRODUCT_PRICE_READY')).toBe(true);
      expect(failures(facts)).toEqual(['SKU_PRICE_RESOLVABLE']);
      expect(evaluatePublicationReadiness(facts).eligible).toBe(false);
    });

    it('fails when any one of several eligible SKUs is unpriced', () => {
      // Every, not one. An order does not get to pick the priced SKU.
      const facts = factsWith(
        [
          { variantId: VARIANT_A, isActive: true },
          { variantId: VARIANT_B, isActive: true },
        ],
        [
          sku({ priceOverrideAmount: '385000' }),
          sku({ skuId: SKU_B, variantId: VARIANT_B, priceOverrideAmount: '0' }),
        ],
      );
      expect(failures(facts)).toEqual(['SKU_PRICE_RESOLVABLE']);
    });

    it('passes when every one of several eligible SKUs is priced', () => {
      const facts = factsWith(
        [
          { variantId: VARIANT_A, isActive: true },
          { variantId: VARIANT_B, isActive: true },
        ],
        [
          sku({ priceOverrideAmount: '385000' }),
          sku({ skuId: SKU_B, variantId: VARIANT_B, priceOverrideAmount: '250000' }),
        ],
      );
      expect(failures(facts)).toEqual([]);
    });

    it('ignores an unpriced SKU that is not order-eligible', () => {
      // An inactive SKU is history. Refusing publication on the price of a row
      // that cannot be bought would make deactivation an unusable repair.
      const facts = factsWith(active, [
        sku(),
        sku({ skuId: SKU_B, isActive: false, priceOverrideAmount: '0' }),
      ]);
      expect(failures(facts)).toEqual([]);
    });

    it('refuses a non-VND override even when the base price is valid VND', () => {
      // The currency travels with the amount that won the COALESCE.
      const facts = factsWith(active, [
        sku({ priceOverrideAmount: '385000', currencyCode: 'USD' }),
      ]);
      expect(satisfied(facts, 'PRODUCT_PRICE_READY')).toBe(true);
      expect(satisfied(facts, 'SKU_PRICE_RESOLVABLE')).toBe(false);
    });
  });

  describe('states D and E — a valid structure publishes, whatever the stock', () => {
    it('is eligible on all ten with one active variant and one priced SKU', () => {
      const readiness = evaluatePublicationReadiness(
        factsWith([{ variantId: VARIANT_A, isActive: true }], [sku()]),
      );
      expect(readiness.eligible).toBe(true);
      expect(readiness.requirements.filter((r) => !r.satisfied)).toEqual([]);
    });

    it('has no fact that could carry a quantity, a threshold or a stock anchor', () => {
      // States D and E of the design differ only in stock, and this is why they
      // draw an identical criterion list: the evaluator is given facts about
      // the product, its category, its media, its variants and its SKUs, and
      // none of those shapes has a stock field to read. A future checkpoint
      // that wanted to block publication on stock would have to widen the facts
      // type first, which is a visible decision rather than a quiet one.
      const facts = factsWith([{ variantId: VARIANT_A, isActive: true }], [sku()]);
      const serialized = JSON.stringify(facts);
      for (const forbidden of ['quantity', 'stock', 'threshold', 'onHand', 'reserved']) {
        expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
      }
      expect(Object.keys(facts.skus[0] ?? {}).sort()).toEqual([
        'currencyCode',
        'isActive',
        'priceOverrideAmount',
        'skuId',
        'variantId',
      ]);
      expect(Object.keys(facts.variants[0] ?? {}).sort()).toEqual(['isActive', 'variantId']);
    });
  });
});
