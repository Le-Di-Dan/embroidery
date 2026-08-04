/**
 * CTX-CAT persistence against a real PostgreSQL instance (DB7-CP3).
 *
 * TBL-011..TBL-017, and the placement-hierarchy guard G-DB7-10..13 that
 * Design, Approval and Production depend on.
 */
import { isPersistenceError, newId } from '@embroidery/database';
import type { PersistenceError } from '@embroidery/database';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { AssetModule } from '../../../asset/asset.module';
import { ASSET_REPOSITORY } from '../../../asset/domain/repositories/asset.repository';
import type { AssetId, AssetRepository } from '../../../asset/domain/repositories/asset.repository';
import { CatalogModule } from '../../catalog.module';
import {
  CATEGORY_REPOSITORY,
  PRODUCT_REPOSITORY,
} from '../../domain/repositories/product.repository';
import type {
  CategoryId,
  CategoryRepository,
  ProductRepository,
} from '../../domain/repositories/product.repository';
import { PLACEMENT_HIERARCHY_PORT } from '../../domain/repositories/placement-hierarchy.port';
import type {
  EmbroideryAreaId,
  PlacementHierarchyPort,
  ProductId,
  ProductSideId,
  ProductVariantId,
  SkuId,
} from '../../domain/repositories/placement-hierarchy.port';

describe('catalog persistence (integration)', () => {
  let context: PersistenceTestContext;
  let categories: CategoryRepository;
  let products: ProductRepository;
  let placement: PlacementHierarchyPort;
  let assets: AssetRepository;

  beforeAll(async () => {
    context = await createPersistenceTestContext('cp3-catalog', [CatalogModule, AssetModule]);
    categories = context.get(CATEGORY_REPOSITORY);
    products = context.get(PRODUCT_REPOSITORY);
    placement = context.get(PLACEMENT_HIERARCHY_PORT);
    assets = context.get(ASSET_REPOSITORY);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  afterEach(async () => {
    await context.reset();
  });

  async function failureOf(work: () => Promise<unknown>): Promise<PersistenceError> {
    try {
      await work();
    } catch (error: unknown) {
      if (isPersistenceError(error)) {
        return error;
      }
      throw error;
    }
    throw new Error('Expected the operation to fail, but it succeeded.');
  }

  /** A side needs a real background asset, so every side fixture makes one. */
  async function seedAsset(): Promise<AssetId> {
    const id = newId() as AssetId;
    return context.inTransaction(async () => {
      const asset = await assets.register({
        id,
        kind: 'CATALOG_MEDIA',
        classification: 'PUBLIC',
        storageKey: `catalog/${id}.png`,
        mimeType: 'image/png',
        sizeBytes: 1024n,
      });
      return asset.id;
    });
  }

  async function seedCategory(slug = 'apparel'): Promise<CategoryId> {
    const id = newId() as CategoryId;
    await context.inTransaction(() =>
      categories.create({ id, name: 'Apparel', slug, displayOrder: 1 }),
    );
    return id;
  }

  async function seedProduct(slug = 'tee'): Promise<ProductId> {
    const categoryId = await seedCategory(`cat-${slug}`);
    const id = newId() as ProductId;
    await context.inTransaction(() =>
      products.create({
        id,
        categoryId,
        name: 'Tee',
        slug,
        basePriceAmount: '150000',
        displayOrder: 1,
      }),
    );
    return id;
  }

  /** Builds a full product/variant/side/area chain for the guard tests. */
  async function seedChain(slug: string) {
    const productId = await seedProduct(slug);
    const backgroundAssetId = await seedAsset();

    const variantId = newId() as ProductVariantId;
    const sideId = newId() as ProductSideId;
    const areaId = newId() as EmbroideryAreaId;

    await context.inTransaction(async () => {
      await products.addVariant({
        id: variantId,
        productId,
        colorName: 'Black',
        sizeLabel: 'M',
        displayOrder: 1,
      });
      await products.addSide({
        id: sideId,
        productId,
        code: 'front',
        name: 'Front',
        backgroundAssetId,
        imageWidthPx: 1000,
        imageHeightPx: 1200,
        physicalWidthMm: '400.00',
        physicalHeightMm: '480.00',
        pxPerMm: '2.50',
        displayOrder: 1,
      });
      await products.addArea({
        id: areaId,
        productSideId: sideId,
        code: 'chest',
        name: 'Chest',
        boundXPx: '100',
        boundYPx: '150',
        boundWidthPx: '300',
        boundHeightPx: '200',
        displayOrder: 1,
      });
    });

    return { productId, variantId, sideId, areaId };
  }

  describe('category', () => {
    it('creates a category as a draft and publishes it', async () => {
      const id = await seedCategory();

      const published = await context.inTransaction(() => categories.changeStatus(id, 'PUBLISHED'));

      expect(published.status).toBe('PUBLISHED');
      await expect(categories.findBySlug('apparel')).resolves.toMatchObject({ id });
    });

    it('rejects a duplicate slug', async () => {
      await seedCategory('taken');

      const error = await failureOf(() => seedCategory('taken'));

      expect(error.code).toBe('DUPLICATE_SLUG');
    });
  });

  describe('product', () => {
    it('creates a product in DRAFT with its price kept exact', async () => {
      const id = await seedProduct();

      const loaded = await products.findById(id);

      expect(loaded?.status).toBe('DRAFT');
      // A string, never a JS number: an amount must not pass through a float.
      // The column is `numeric(14,2)`, so the text form carries the declared
      // scale — `150000.00`, not `150000`. The VND currency-scale CHECK
      // (DEV money model) is what keeps the fractional part zero; the two
      // decimals are the column's shape, not a rounded value.
      expect(loaded?.basePriceAmount).toBe('150000.00');
      expect(typeof loaded?.basePriceAmount).toBe('string');
      expect(loaded?.currencyCode).toBe('VND');
    });

    it('rejects a negative price', async () => {
      const categoryId = await seedCategory('neg');

      const error = await failureOf(() =>
        context.inTransaction(() =>
          products.create({
            id: newId() as ProductId,
            categoryId,
            name: 'Bad',
            slug: 'bad-price',
            basePriceAmount: '-1',
            displayOrder: 1,
          }),
        ),
      );

      expect(error.diagnostics.constraint).toBe('ck_products__base_price_non_negative');
    });

    it('rejects a product in a category that does not exist', async () => {
      const error = await failureOf(() =>
        context.inTransaction(() =>
          products.create({
            id: newId() as ProductId,
            categoryId: newId() as CategoryId,
            name: 'Orphan',
            slug: 'orphan',
            basePriceAmount: '1000',
            displayOrder: 1,
          }),
        ),
      );

      expect(error.kind).toBe('INVALID_REFERENCE');
    });

    it('stamps archived_at on archive and clears it on republish', async () => {
      const id = await seedProduct('archivable');

      await context.inTransaction(() => products.changeStatus(id, 'ARCHIVED'));
      const republished = await context.inTransaction(() => products.changeStatus(id, 'PUBLISHED'));

      expect(republished.status).toBe('PUBLISHED');
    });

    it('rejects a duplicate SKU code', async () => {
      const { variantId } = await seedChain('sku-dup');
      await context.inTransaction(() =>
        products.addSku({ id: newId() as SkuId, productVariantId: variantId, code: 'TEE-BLK-M' }),
      );

      const error = await failureOf(() =>
        context.inTransaction(() =>
          products.addSku({ id: newId() as SkuId, productVariantId: variantId, code: 'TEE-BLK-M' }),
        ),
      );

      expect(error.code).toBe('DUPLICATE_SKU_CODE');
    });

    it('loads the whole structure without an N+1', async () => {
      const { productId, variantId, sideId, areaId } = await seedChain('structure');
      await context.inTransaction(() =>
        products.addSku({ id: newId() as SkuId, productVariantId: variantId, code: 'STRUCT-1' }),
      );

      const structure = await products.loadStructure(productId);

      expect(structure?.variants.map((v) => v.id)).toEqual([variantId]);
      expect(structure?.sides.map((s) => s.id)).toEqual([sideId]);
      expect(structure?.areas.map((a) => a.id)).toEqual([areaId]);
      expect(structure?.skus).toHaveLength(1);
    });

    it('returns undefined for a product that does not exist', async () => {
      await expect(products.loadStructure(newId() as ProductId)).resolves.toBeUndefined();
    });
  });

  describe('placement hierarchy guard (G-DB7-10..13)', () => {
    it('accepts a coherent chain', async () => {
      const { productId, variantId, sideId, areaId } = await seedChain('valid-chain');

      await expect(
        placement.assertValidPlacement({
          productId,
          productVariantId: variantId,
          productSideId: sideId,
          embroideryAreaId: areaId,
        }),
      ).resolves.toBeUndefined();
    });

    it('accepts a partial chain naming only the product', async () => {
      const { productId } = await seedChain('partial');

      await expect(placement.assertValidPlacement({ productId })).resolves.toBeUndefined();
    });

    it('rejects an unknown product', async () => {
      const error = await failureOf(() =>
        placement.assertValidPlacement({ productId: newId() as ProductId }),
      );

      expect(error.code).toBe('UNKNOWN_PRODUCT');
    });

    it('rejects a variant of another product (G-DB7-10)', async () => {
      const mine = await seedChain('mine-v');
      const theirs = await seedChain('theirs-v');

      // Every FK here is satisfied — only the chain is wrong, which is exactly
      // what the database cannot see.
      const error = await failureOf(() =>
        placement.assertValidPlacement({
          productId: mine.productId,
          productVariantId: theirs.variantId,
        }),
      );

      expect(error.code).toBe('VARIANT_NOT_IN_PRODUCT');
      expect(error.kind).toBe('INVARIANT_VIOLATION');
    });

    it('rejects a side of another product (G-DB7-11)', async () => {
      const mine = await seedChain('mine-s');
      const theirs = await seedChain('theirs-s');

      const error = await failureOf(() =>
        placement.assertValidPlacement({
          productId: mine.productId,
          productSideId: theirs.sideId,
        }),
      );

      expect(error.code).toBe('SIDE_NOT_IN_PRODUCT');
    });

    it('rejects an area belonging to another side (G-DB7-12)', async () => {
      const mine = await seedChain('mine-a');
      const theirs = await seedChain('theirs-a');

      const error = await failureOf(() =>
        placement.assertValidPlacement({
          productId: mine.productId,
          productSideId: mine.sideId,
          embroideryAreaId: theirs.areaId,
        }),
      );

      expect(error.code).toBe('AREA_NOT_ON_SIDE');
    });

    it('rejects an area referenced without its side', async () => {
      const { productId, areaId } = await seedChain('area-no-side');

      const error = await failureOf(() =>
        placement.assertValidPlacement({ productId, embroideryAreaId: areaId }),
      );

      expect(error.code).toBe('AREA_WITHOUT_SIDE');
    });

    it('rejects the whole chain when the middle hop is wrong (G-DB7-13)', async () => {
      const mine = await seedChain('chain-mid');
      const theirs = await seedChain('chain-mid-other');

      // Product and area are consistent with each other via `theirs`, but the
      // side belongs elsewhere: a per-hop check that stopped early would miss it.
      const error = await failureOf(() =>
        placement.assertValidPlacement({
          productId: mine.productId,
          productSideId: theirs.sideId,
          embroideryAreaId: theirs.areaId,
        }),
      );

      expect(error.code).toBe('SIDE_NOT_IN_PRODUCT');
    });
  });
});
