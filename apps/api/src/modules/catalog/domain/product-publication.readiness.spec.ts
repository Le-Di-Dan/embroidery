/**
 * The publication readiness matrix (`APP2-B03` §7/§8).
 *
 * Every requirement is proved to fail **independently**: each case starts from
 * a fully publishable product and breaks exactly one fact, so a rule that
 * accidentally depended on another would show up as two failures instead of
 * one. The exclusions are asserted too — a later checkpoint that quietly adds a
 * variant, SKU or SEO requirement has to delete a test that says it must not.
 */
import {
  PRODUCT_PUBLICATION_REQUIREMENT_CODES,
  type ProductPublicationRequirementCode,
} from './product-publication.policy';
import {
  evaluatePublicationReadiness,
  isPublishablePrice,
  unsatisfiedRequirements,
  type ProductPublicationFacts,
} from './product-publication.readiness';

const ASSET_A = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07';
const ASSET_B = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e08';
const VARIANT_A = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e09';
const SKU_A = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e0a';

function publishableFacts(): ProductPublicationFacts {
  return {
    product: {
      name: 'Gấu bông thỏ trắng',
      slug: 'gau-bong-tho-trang',
      description: 'Gấu bông thêu tay, chất liệu bông mềm.',
      basePriceAmount: '250000.00',
      currencyCode: 'VND',
    },
    category: { status: 'PUBLISHED', archivedAt: undefined },
    media: [
      { assetId: ASSET_A, role: 'THUMBNAIL', displayOrder: 0 },
      { assetId: ASSET_B, role: 'GALLERY', displayOrder: 1 },
    ],
    assets: [ASSET_A, ASSET_B].map((assetId) => ({
      assetId,
      kind: 'CATALOG_MEDIA',
      classification: 'PRODUCTION_SENSITIVE',
      status: 'ACCEPTED',
      deletedAt: undefined,
    })),
    derivatives: [ASSET_A, ASSET_B].flatMap((assetId) =>
      (['THUMBNAIL', 'CATALOG_PREVIEW'] as const).map((kind) => ({
        assetId,
        kind,
        status: 'READY',
        isWatermarked: false,
        storageKey: `development/derivatives/${assetId}/${kind}.webp`,
      })),
    ),
    // One active variant carrying one active SKU on the base price: the minimum
    // structure the three `APP12-N02.B01` sellability requirements need, so
    // every case below still breaks exactly one fact. The sellability matrix
    // itself lives in `product-publication.sellability.spec.ts`.
    variants: [{ variantId: VARIANT_A, isActive: true }],
    skus: [
      {
        skuId: SKU_A,
        variantId: VARIANT_A,
        isActive: true,
        priceOverrideAmount: undefined,
        currencyCode: 'VND',
      },
    ],
  };
}

/** Breaks exactly one fact and reports which requirements failed. */
function failuresAfter(
  mutate: (facts: ProductPublicationFacts) => ProductPublicationFacts,
): ProductPublicationRequirementCode[] {
  return unsatisfiedRequirements(evaluatePublicationReadiness(mutate(publishableFacts())));
}

describe('publication readiness', () => {
  it('reports the complete closed set in the locked order', () => {
    const readiness = evaluatePublicationReadiness(publishableFacts());
    expect(readiness.requirements.map((r) => r.code)).toEqual([
      ...PRODUCT_PUBLICATION_REQUIREMENT_CODES,
    ]);
    // No duplicates, and nothing outside the closed set.
    expect(new Set(readiness.requirements.map((r) => r.code)).size).toBe(
      PRODUCT_PUBLICATION_REQUIREMENT_CODES.length,
    );
  });

  it('is eligible only when every requirement is satisfied', () => {
    const readiness = evaluatePublicationReadiness(publishableFacts());
    expect(readiness.eligible).toBe(true);
    expect(readiness.requirements.every((r) => r.satisfied)).toBe(true);
    expect(unsatisfiedRequirements(readiness)).toEqual([]);
  });

  it('reports the same order whichever requirements fail', () => {
    const readiness = evaluatePublicationReadiness({
      ...publishableFacts(),
      media: [],
      category: undefined,
    });
    expect(readiness.requirements.map((r) => r.code)).toEqual([
      ...PRODUCT_PUBLICATION_REQUIREMENT_CODES,
    ]);
    expect(readiness.eligible).toBe(false);
  });

  describe('each requirement fails independently', () => {
    it('a blank name fails only the name requirement', () => {
      expect(failuresAfter((f) => ({ ...f, product: { ...f.product, name: '   ' } }))).toEqual([
        'PRODUCT_NAME_READY',
      ]);
    });

    it('a blank slug fails the same requirement', () => {
      expect(failuresAfter((f) => ({ ...f, product: { ...f.product, slug: '' } }))).toEqual([
        'PRODUCT_NAME_READY',
      ]);
    });

    it('a missing description fails only the description requirement', () => {
      expect(
        failuresAfter((f) => ({ ...f, product: { ...f.product, description: undefined } })),
      ).toEqual(['PRODUCT_DESCRIPTION_READY']);
      expect(
        failuresAfter((f) => ({ ...f, product: { ...f.product, description: '  ' } })),
      ).toEqual(['PRODUCT_DESCRIPTION_READY']);
    });

    it('an unpublished category fails only the category requirement', () => {
      expect(
        failuresAfter((f) => ({ ...f, category: { status: 'DRAFT', archivedAt: undefined } })),
      ).toEqual(['PRODUCT_CATEGORY_READY']);
    });

    it('an archived category fails the category requirement even when published', () => {
      expect(
        failuresAfter((f) => ({
          ...f,
          category: { status: 'PUBLISHED', archivedAt: new Date('2026-07-01T00:00:00.000Z') },
        })),
      ).toEqual(['PRODUCT_CATEGORY_READY']);
    });

    it('a missing category row fails the category requirement rather than throwing', () => {
      expect(failuresAfter((f) => ({ ...f, category: undefined }))).toEqual([
        'PRODUCT_CATEGORY_READY',
      ]);
    });

    it('the zero price sentinel fails the price requirement and the SKU price with it', () => {
      // The one documented co-failure (`APP12-N02.D01` §J.3), and it is not an
      // independence leak: the SKU inherits the base price, so an unset base
      // price really is two broken facts about the same amount. The converse —
      // a SKU override that fails while the base price stands — is the case
      // that proves the two criteria are independent, and it lives in
      // `product-publication.sellability.spec.ts`.
      expect(
        failuresAfter((f) => ({ ...f, product: { ...f.product, basePriceAmount: '0.00' } })),
      ).toEqual(['PRODUCT_PRICE_READY', 'SKU_PRICE_RESOLVABLE']);
    });

    it('no media fails the media requirement only', () => {
      // The asset and derivative rules are vacuously satisfied with nothing
      // attached: one missing fact must report one problem, not three.
      expect(failuresAfter((f) => ({ ...f, media: [], assets: [], derivatives: [] }))).toEqual([
        'PRODUCT_MEDIA_READY',
      ]);
    });

    it('a first image that is not the THUMBNAIL fails the media requirement', () => {
      expect(
        failuresAfter((f) => ({
          ...f,
          media: [{ assetId: ASSET_A, role: 'GALLERY', displayOrder: 0 }],
        })),
      ).toEqual(['PRODUCT_MEDIA_READY']);
    });

    it('a gap in the display order fails the media requirement', () => {
      expect(
        failuresAfter((f) => ({
          ...f,
          media: [
            { assetId: ASSET_A, role: 'THUMBNAIL', displayOrder: 0 },
            { assetId: ASSET_B, role: 'GALLERY', displayOrder: 5 },
          ],
        })),
      ).toEqual(['PRODUCT_MEDIA_READY']);
    });

    it('an asset outside the catalog-media lane fails the asset requirement', () => {
      expect(
        failuresAfter((f) => ({
          ...f,
          assets: f.assets.map((asset) =>
            asset.assetId === ASSET_B ? { ...asset, kind: 'CUSTOMER_UPLOAD' } : asset,
          ),
        })),
      ).toEqual(['PRODUCT_MEDIA_ASSETS_READY']);
    });

    it('an asset that is no longer ACCEPTED fails the asset requirement', () => {
      expect(
        failuresAfter((f) => ({
          ...f,
          assets: f.assets.map((asset) =>
            asset.assetId === ASSET_A ? { ...asset, status: 'REJECTED' } : asset,
          ),
        })),
      ).toEqual(['PRODUCT_MEDIA_ASSETS_READY']);
    });

    it('a tombstoned asset fails the asset requirement', () => {
      expect(
        failuresAfter((f) => ({
          ...f,
          assets: f.assets.map((asset) =>
            asset.assetId === ASSET_A
              ? { ...asset, deletedAt: new Date('2026-07-02T00:00:00.000Z') }
              : asset,
          ),
        })),
      ).toEqual(['PRODUCT_MEDIA_ASSETS_READY']);
    });

    it('an asset the scoped read did not return fails the asset requirement', () => {
      expect(
        failuresAfter((f) => ({ ...f, assets: f.assets.filter((a) => a.assetId !== ASSET_B) })),
      ).toEqual(['PRODUCT_MEDIA_ASSETS_READY']);
    });

    it('a missing derivative fails only the derivative requirement', () => {
      expect(
        failuresAfter((f) => ({
          ...f,
          derivatives: f.derivatives.filter(
            (d) => !(d.assetId === ASSET_B && d.kind === 'CATALOG_PREVIEW'),
          ),
        })),
      ).toEqual(['PRODUCT_MEDIA_DERIVATIVES_READY']);
    });

    it('a derivative that is not READY fails the derivative requirement', () => {
      expect(
        failuresAfter((f) => ({
          ...f,
          derivatives: f.derivatives.map((d) =>
            d.assetId === ASSET_A && d.kind === 'THUMBNAIL' ? { ...d, status: 'FAILED' } : d,
          ),
        })),
      ).toEqual(['PRODUCT_MEDIA_DERIVATIVES_READY']);
    });

    it('a watermarked derivative fails the derivative requirement', () => {
      expect(
        failuresAfter((f) => ({
          ...f,
          derivatives: f.derivatives.map((d) =>
            d.kind === 'THUMBNAIL' ? { ...d, isWatermarked: true } : d,
          ),
        })),
      ).toEqual(['PRODUCT_MEDIA_DERIVATIVES_READY']);
    });

    it('a derivative with no durable storage reference fails the derivative requirement', () => {
      expect(
        failuresAfter((f) => ({
          ...f,
          derivatives: f.derivatives.map((d) =>
            d.kind === 'CATALOG_PREVIEW' ? { ...d, storageKey: undefined } : d,
          ),
        })),
      ).toEqual(['PRODUCT_MEDIA_DERIVATIVES_READY']);
    });
  });

  describe('excluded requirements', () => {
    it('imposes no media maximum', () => {
      const many = Array.from({ length: 40 }, (_, position) => ({
        assetId: `asset-${position}`,
        role: position === 0 ? 'THUMBNAIL' : 'GALLERY',
        displayOrder: position,
      }));
      const readiness = evaluatePublicationReadiness({
        ...publishableFacts(),
        media: many,
        assets: many.map((link) => ({
          assetId: link.assetId,
          kind: 'CATALOG_MEDIA',
          classification: 'PRODUCTION_SENSITIVE',
          status: 'ACCEPTED',
          deletedAt: undefined,
        })),
        derivatives: many.flatMap((link) =>
          (['THUMBNAIL', 'CATALOG_PREVIEW'] as const).map((kind) => ({
            assetId: link.assetId,
            kind,
            status: 'READY',
            isWatermarked: false,
            storageKey: `development/derivatives/${link.assetId}/${kind}.webp`,
          })),
        ),
      });
      expect(readiness.eligible).toBe(true);
    });

    it('names no inventory, SEO, display-order or thumbnail-URL requirement', () => {
      // `VARIANT` and `SKU` left this list at `APP12-N02.B01`, by Product Owner
      // authority and with the writer that makes them satisfiable: the three
      // codes below are asserted by name so they cannot be joined by a fourth
      // without a deliberate edit here. Inventory is still excluded, and
      // permanently — a sold-out product is a product that is selling.
      const codes = PRODUCT_PUBLICATION_REQUIREMENT_CODES.join(' ');
      for (const forbidden of ['INVENTORY', 'STOCK', 'SEO', 'URL', 'SHIPPING', 'QUANTITY']) {
        expect(codes).not.toContain(forbidden);
      }
      expect(PRODUCT_PUBLICATION_REQUIREMENT_CODES).toHaveLength(10);
      expect(PRODUCT_PUBLICATION_REQUIREMENT_CODES.slice(7)).toEqual([
        'HAS_ACTIVE_VARIANT',
        'HAS_ORDER_ELIGIBLE_SKU',
        'SKU_PRICE_RESOLVABLE',
      ]);
      // The first seven keep their codes *and* their positions: a client that
      // renders the list in order must see the checklist it already knew.
      expect(PRODUCT_PUBLICATION_REQUIREMENT_CODES.slice(0, 7)).toEqual([
        'PRODUCT_NAME_READY',
        'PRODUCT_DESCRIPTION_READY',
        'PRODUCT_CATEGORY_READY',
        'PRODUCT_PRICE_READY',
        'PRODUCT_MEDIA_READY',
        'PRODUCT_MEDIA_ASSETS_READY',
        'PRODUCT_MEDIA_DERIVATIVES_READY',
      ]);
    });

    it('publishes a product that has no SEO fields and a zero display order', () => {
      // Neither is represented in the facts at all — the proof is that a fully
      // publishable product never had to supply them.
      expect(evaluatePublicationReadiness(publishableFacts()).eligible).toBe(true);
    });
  });

  describe('decimal-safe price comparison', () => {
    it.each([
      ['250000.00', true],
      ['1', true],
      ['999999999999.00', true],
      ['0', false],
      ['0.00', false],
      ['0.50', false],
      ['-5.00', false],
      ['', false],
      ['abc', false],
    ])('treats %s as publishable=%s', (amount, expected) => {
      expect(isPublishablePrice(amount, 'VND')).toBe(expected);
    });

    it('rejects a currency other than VND', () => {
      expect(isPublishablePrice('250000.00', 'USD')).toBe(false);
    });

    it('compares an amount beyond the safe integer range exactly', () => {
      // 9_007_199_254_740_993 is 2^53 + 1: as a float it is indistinguishable
      // from 2^53, so any implementation that parsed it as a number would be
      // comparing the wrong value.
      const beyondFloat = '9007199254740993';
      expect(isPublishablePrice(beyondFloat, 'VND')).toBe(true);
      expect(BigInt(beyondFloat) > BigInt(Number(beyondFloat))).toBe(true);
    });
  });
});
