/**
 * `APP5-B07` — the public variant selection read, against real PostgreSQL.
 *
 * A double would prove the query calls what it calls. Only a database proves the
 * properties that actually matter here: that the ids handed to the Storefront
 * are the ones `custom_requests.product_variant_id` will accept, that a draft
 * product's variants are unreachable rather than merely unrendered, that one
 * product's variants never appear under another's slug, and that `is_active`
 * really is applied in the statement instead of above it.
 *
 * The suite compiles `CatalogPublicModule` — the real graph, real repository,
 * real SQL — rather than the whole `CatalogModule`, so nothing an Admin provider
 * does can be mistaken for behaviour of this read.
 */
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { CatalogModule } from '../../catalog.module';
import { CatalogPublicModule } from '../../catalog-public.module';
import {
  CATEGORY_REPOSITORY,
  PRODUCT_REPOSITORY,
} from '../../domain/repositories/product.repository';
import type {
  CategoryId,
  CategoryRepository,
  ProductRepository,
} from '../../domain/repositories/product.repository';
import type {
  ProductId,
  ProductVariantId,
} from '../../domain/repositories/placement-hierarchy.port';
import { PublicProductVariantQuery } from '../../application/public-product-variant.query';
import { isPublicProductCatalogError } from '../../domain/public-product-catalog.errors';

describe('APP5-B07 public product variant selection (integration)', () => {
  let context: PersistenceTestContext;
  let categories: CategoryRepository;
  let products: ProductRepository;
  let query: PublicProductVariantQuery;

  beforeAll(async () => {
    // `CatalogModule` supplies the authoring repositories the fixtures need;
    // `CatalogPublicModule` supplies the read under test. The read never touches
    // the former — it is compiled here only so a test can create a product.
    context = await createPersistenceTestContext('app5-b07-variants', [
      CatalogModule,
      CatalogPublicModule,
    ]);
    categories = context.get(CATEGORY_REPOSITORY);
    products = context.get(PRODUCT_REPOSITORY);
    query = context.get(PublicProductVariantQuery);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  afterEach(async () => {
    await context.reset();
  });

  interface SeedOptions {
    readonly slug?: string;
    readonly productStatus?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    readonly categoryStatus?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    readonly variants?: readonly {
      readonly colorName?: string;
      readonly sizeLabel?: string;
      readonly displayOrder: number;
      readonly isActive?: boolean;
    }[];
  }

  interface Seeded {
    readonly productId: ProductId;
    readonly slug: string;
    readonly variantIds: readonly ProductVariantId[];
  }

  /**
   * A per-suite counter for slugs.
   *
   * Not `newId().slice(0, 8)`: ids are UUIDv7, so two rows created in the same
   * millisecond share their leading characters and the truncation collides with
   * `uq_categories__slug`. A counter is unique by construction and makes a
   * failing fixture name readable.
   */
  let seedCounter = 0;

  /**
   * One product with its variants.
   *
   * Variants are created through the repository so their rows are exactly what
   * the application writes; `is_active` is then flipped with a direct statement,
   * because `addVariant` always inserts `true` and delisting is an Admin
   * capability no checkpoint has yet published.
   */
  async function seed(options: SeedOptions = {}): Promise<Seeded> {
    const ordinal = (seedCounter += 1);
    const slug = options.slug ?? `khan-theu-${ordinal}`;
    const categoryId = newId() as CategoryId;
    const productId = newId() as ProductId;
    const variantIds: ProductVariantId[] = [];

    await context.inTransaction(async () => {
      await categories.create({
        id: categoryId,
        name: 'Khăn',
        slug: `khan-${ordinal}`,
        displayOrder: 0,
      });
      if (options.categoryStatus !== undefined) {
        await categories.changeStatus(categoryId, options.categoryStatus);
      } else {
        await categories.changeStatus(categoryId, 'PUBLISHED');
      }

      await products.create({
        id: productId,
        categoryId,
        name: 'Khăn thêu hoa sen',
        slug,
        basePriceAmount: '250000',
        displayOrder: 0,
      });
      await products.changeStatus(productId, options.productStatus ?? 'PUBLISHED');

      for (const variant of options.variants ?? []) {
        const id = newId() as ProductVariantId;
        await products.addVariant({
          id,
          productId,
          colorName: variant.colorName,
          sizeLabel: variant.sizeLabel,
          displayOrder: variant.displayOrder,
        });
        variantIds.push(id);
      }
    });

    for (const [index, variant] of (options.variants ?? []).entries()) {
      if (variant.isActive === false) {
        await context.disposable.client.db.execute(
          sql`update product_variants set is_active = false where id = ${variantIds[index]}`,
        );
      }
    }

    return { productId, slug, variantIds };
  }

  /** Reads, returning the refusal code rather than letting a throw escape. */
  async function refusalOf(slug: string): Promise<string> {
    try {
      await query.publicRead(slug);
    } catch (error: unknown) {
      return isPublicProductCatalogError(error) ? error.code : 'OTHER_ERROR';
    }
    return 'NO_REFUSAL';
  }

  /** `select count(*)::text as count …` → a number. */
  async function countOf(statement: ReturnType<typeof sql>): Promise<number> {
    const result = await context.disposable.client.db.execute(statement);
    const rows = (result as unknown as { rows?: { count: string }[] }).rows ?? [];
    return Number(rows[0]?.count ?? '0');
  }

  describe('it returns real, submittable ids', () => {
    it('returns the exact variant ids the submission foreign key will accept', async () => {
      const seeded = await seed({
        variants: [
          { colorName: 'Xanh rêu', sizeLabel: 'M', displayOrder: 0 },
          { colorName: 'Đỏ', sizeLabel: 'L', displayOrder: 1 },
        ],
      });

      const view = await query.publicRead(seeded.slug);

      expect(view.productId).toBe(seeded.productId);
      expect(view.variants.map((variant) => variant.productVariantId)).toEqual([
        ...seeded.variantIds,
      ]);

      // The point of the whole checkpoint: these ids exist in `product_variants`,
      // so `fk_custom_requests__product_variant_id` accepts them. A fabricated
      // id — the alternative APP5-S01 was blocked from taking — would not.
      for (const variant of view.variants) {
        expect(
          await countOf(
            sql`select count(*)::text as count from product_variants
                where id = ${variant.productVariantId} and product_id = ${seeded.productId}`,
          ),
        ).toBe(1);
      }
    });

    it('publishes the two canonical attribute columns, exactly as stored', async () => {
      const seeded = await seed({
        variants: [
          { colorName: 'Xanh rêu', sizeLabel: 'M', displayOrder: 0 },
          { colorName: 'Chỉ có màu', displayOrder: 1 },
          { sizeLabel: 'XL', displayOrder: 2 },
          { displayOrder: 3 },
        ],
      });

      const view = await query.publicRead(seeded.slug);

      // `product_variants` has no name column; a variant carrying only one
      // attribute keeps the other as an explicit null rather than an invented
      // label or a dropped field.
      expect(view.variants).toEqual([
        { productVariantId: seeded.variantIds[0], colorName: 'Xanh rêu', sizeLabel: 'M' },
        { productVariantId: seeded.variantIds[1], colorName: 'Chỉ có màu', sizeLabel: null },
        { productVariantId: seeded.variantIds[2], colorName: null, sizeLabel: 'XL' },
        { productVariantId: seeded.variantIds[3], colorName: null, sizeLabel: null },
      ]);
    });

    it('publishes no commerce field even when the variant has a priced SKU', async () => {
      const seeded = await seed({ variants: [{ sizeLabel: 'M', displayOrder: 0 }] });
      await context.inTransaction(async () => {
        await products.addSku({
          id: newId() as never,
          productVariantId: seeded.variantIds[0]!,
          code: `SKU-${newId()}`,
          priceOverrideAmount: '999000',
        });
      });

      const view = await query.publicRead(seeded.slug);

      const serialized = JSON.stringify(view);
      expect(serialized).not.toContain('999000');
      expect(serialized).not.toContain('SKU-');
      expect(Object.keys(view.variants[0]!).sort()).toEqual([
        'colorName',
        'productVariantId',
        'sizeLabel',
      ]);
    });
  });

  describe('ordering is deterministic', () => {
    it('orders by display order, then id, and repeats itself', async () => {
      const seeded = await seed({
        variants: [
          { sizeLabel: 'C', displayOrder: 2 },
          { sizeLabel: 'A', displayOrder: 0 },
          { sizeLabel: 'B', displayOrder: 1 },
        ],
      });

      const first = await query.publicRead(seeded.slug);
      const second = await query.publicRead(seeded.slug);

      expect(first.variants.map((variant) => variant.sizeLabel)).toEqual(['A', 'B', 'C']);
      expect(second.variants).toEqual(first.variants);
    });

    it('breaks a display-order tie by id rather than by insertion accident', async () => {
      const seeded = await seed({
        variants: [
          { sizeLabel: 'first-inserted', displayOrder: 0 },
          { sizeLabel: 'second-inserted', displayOrder: 0 },
          { sizeLabel: 'third-inserted', displayOrder: 0 },
        ],
      });

      const view = await query.publicRead(seeded.slug);
      const returned = view.variants.map((variant) => variant.productVariantId);

      // Three rows sharing a position: the order is the ids ascending, which is
      // total, and not whatever sequence the heap happened to hand back.
      expect(returned).toEqual([...seeded.variantIds].sort());
    });
  });

  describe('variants are scoped to the product in the path', () => {
    it('never returns another product’s variants', async () => {
      const mine = await seed({ variants: [{ sizeLabel: 'MINE', displayOrder: 0 }] });
      const other = await seed({ variants: [{ sizeLabel: 'OTHER', displayOrder: 0 }] });

      const view = await query.publicRead(mine.slug);

      expect(view.variants.map((variant) => variant.sizeLabel)).toEqual(['MINE']);
      expect(view.variants.map((variant) => variant.productVariantId)).not.toContain(
        other.variantIds[0],
      );
    });
  });

  describe('eligibility', () => {
    it('excludes a delisted variant and keeps the active ones', async () => {
      const seeded = await seed({
        variants: [
          { sizeLabel: 'S', displayOrder: 0 },
          { sizeLabel: 'M-delisted', displayOrder: 1, isActive: false },
          { sizeLabel: 'L', displayOrder: 2 },
        ],
      });

      const view = await query.publicRead(seeded.slug);

      expect(view.variants.map((variant) => variant.sizeLabel)).toEqual(['S', 'L']);
      // The row still exists — `is_active` delists, it does not archive or
      // delete — so the exclusion is the read's doing, not the fixture's.
      expect(
        await countOf(
          sql`select count(*)::text as count from product_variants
              where product_id = ${seeded.productId}`,
        ),
      ).toBe(3);
    });

    it('returns an empty list, not a 404, for a published product with no selectable variant', async () => {
      const noRows = await seed({ variants: [] });
      const allDelisted = await seed({
        variants: [{ sizeLabel: 'M', displayOrder: 0, isActive: false }],
      });

      // Truthful and distinguishable: the product exists and is published, it
      // simply cannot form an APP5 catalog request. Reporting a 404 would tell
      // the customer it does not exist, and would make APP5-S01 unable to render
      // the approved unavailable state apart from a wrong address.
      await expect(query.publicRead(noRows.slug)).resolves.toEqual({
        productId: noRows.productId,
        variants: [],
      });
      await expect(query.publicRead(allDelisted.slug)).resolves.toEqual({
        productId: allDelisted.productId,
        variants: [],
      });
    });
  });

  describe('public visibility is the catalogue’s, and refusal is indistinguishable', () => {
    it('answers one identical not-found for every reason a product is not public', async () => {
      const draft = await seed({
        productStatus: 'DRAFT',
        variants: [{ sizeLabel: 'M', displayOrder: 0 }],
      });
      const archived = await seed({
        productStatus: 'ARCHIVED',
        variants: [{ sizeLabel: 'M', displayOrder: 0 }],
      });
      const privateCategory = await seed({
        categoryStatus: 'DRAFT',
        variants: [{ sizeLabel: 'M', displayOrder: 0 }],
      });

      for (const slug of [
        'khan-theu-khong-ton-tai',
        draft.slug,
        archived.slug,
        privateCategory.slug,
      ]) {
        await expect(refusalOf(slug)).resolves.toBe('PUBLIC_PRODUCT_NOT_FOUND');
      }
    });

    it('does not leak an unpublished product’s variants through any path', async () => {
      const draft = await seed({
        productStatus: 'DRAFT',
        variants: [{ colorName: 'Bí mật', sizeLabel: 'M', displayOrder: 0 }],
      });

      // The variants exist in the database…
      expect(
        await countOf(
          sql`select count(*)::text as count from product_variants
              where product_id = ${draft.productId}`,
        ),
      ).toBe(1);
      // …and the read still refuses, because the predicate is in the statement
      // rather than in a filter applied to rows that already arrived.
      await expect(refusalOf(draft.slug)).resolves.toBe('PUBLIC_PRODUCT_NOT_FOUND');
    });

    it('becomes unreachable the moment the product is unpublished', async () => {
      const seeded = await seed({ variants: [{ sizeLabel: 'M', displayOrder: 0 }] });
      await expect(query.publicRead(seeded.slug)).resolves.toMatchObject({
        productId: seeded.productId,
      });

      await context.inTransaction(async () => {
        await products.changeStatus(seeded.productId, 'ARCHIVED');
      });

      // Nothing caches, so the next read is the new truth.
      await expect(refusalOf(seeded.slug)).resolves.toBe('PUBLIC_PRODUCT_NOT_FOUND');
    });
  });

  describe('it is a read', () => {
    it('writes no audit event, no outbox event and no domain row', async () => {
      const seeded = await seed({
        variants: [
          { sizeLabel: 'S', displayOrder: 0 },
          { sizeLabel: 'M', displayOrder: 1 },
        ],
      });

      const before = {
        audit: await countOf(sql`select count(*)::text as count from audit_events`),
        outbox: await countOf(sql`select count(*)::text as count from outbox_events`),
        variants: await countOf(sql`select count(*)::text as count from product_variants`),
        products: await countOf(sql`select count(*)::text as count from products`),
      };

      await query.publicRead(seeded.slug);
      await refusalOf('khan-theu-khong-ton-tai');

      expect({
        audit: await countOf(sql`select count(*)::text as count from audit_events`),
        outbox: await countOf(sql`select count(*)::text as count from outbox_events`),
        variants: await countOf(sql`select count(*)::text as count from product_variants`),
        products: await countOf(sql`select count(*)::text as count from products`),
      }).toEqual(before);
      // A refusal is not an auditable event here either: this route has no
      // actor, and recording anonymous 404s would be a log of what a stranger
      // guessed at.
      expect(before.audit).toBe(0);
    });
  });
});
