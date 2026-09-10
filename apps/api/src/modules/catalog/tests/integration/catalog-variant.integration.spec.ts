/**
 * `APP12-N02.B01` — the Admin variant read and the two writes, against a real
 * PostgreSQL.
 *
 * What is proved here is that the operations land, that the hierarchy and
 * lifecycle checks read database rows rather than the request, that the
 * authoring read returns the inactive history a filtered public projection
 * cannot, and that each mutation leaves exactly one piece of audit evidence.
 *
 * The concurrent case has its own file: it needs two independently pooled
 * connections, which is a different harness rather than a different test.
 */
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';

import {
  createConcurrencyTestContext,
  type ConcurrencyActor,
  type ConcurrencyTestContext,
} from '../../../../tests/integration/db8-concurrency-context';
import { ProductVariantService } from '../../application/product-variant.service';
import {
  activeVariantCount,
  asAdmin,
  codeOf,
  counter,
  seedAdmin,
  seedProduct,
  seedSkuRow,
  seedVariantRow,
  variantCount,
  VARIANT_TEST_MODULES,
} from './variant-fixture';

describe('APP12-N02.B01 Admin variant authoring (integration)', () => {
  let context: ConcurrencyTestContext;
  let actor: ConcurrencyActor;
  let adminId: string;
  let countOf: ReturnType<typeof counter>;

  beforeAll(async () => {
    context = await createConcurrencyTestContext('app12-n02-b01-variant', VARIANT_TEST_MODULES);
    actor = await context.spawnActor('admin');
    countOf = counter(context.disposable.client.db);
  }, 240_000);

  afterAll(async () => {
    await context?.close();
  }, 240_000);

  beforeEach(async () => {
    await context.reset();
    adminId = await seedAdmin(context.disposable.client.db, 'n02-b01');
  });

  const db = () => context.disposable.client.db;
  const seed = (status?: string) => seedProduct(db(), status);
  const as = <T>(work: () => Promise<T>) => asAdmin(actor, adminId, work);
  const service = () => actor.get<ProductVariantService>(ProductVariantService);

  describe('the authoring read', () => {
    it('returns inactive variants and inactive SKUs, which the public read filters away', async () => {
      const productId = await seed('PUBLISHED');
      const live = await seedVariantRow(db(), productId, {
        colorName: 'Xanh navy',
        sizeLabel: 'M',
        displayOrder: 0,
      });
      const delisted = await seedVariantRow(db(), productId, {
        colorName: 'Đen',
        sizeLabel: 'L',
        displayOrder: 1,
        isActive: false,
      });
      await seedSkuRow(db(), live, { code: 'AT-NAVY-M' });
      await seedSkuRow(db(), live, { code: 'AT-NAVY-M-OLD', isActive: false });

      const view = await service().list(productId);

      expect(view.productId).toBe(productId);
      expect(view.variants.map((variant) => variant.variantId)).toEqual([live, delisted]);
      expect(view.variants[1]?.isActive).toBe(false);
      // The SKU history the operator needs to see: both rows, with the code and
      // the sellable flag the public projection publishes neither of.
      expect(view.variants[0]?.skus.map((s) => [s.code, s.isActive])).toEqual([
        ['AT-NAVY-M', true],
        ['AT-NAVY-M-OLD', false],
      ]);
      expect(view.variants[1]?.skus).toEqual([]);
    });

    it('reads a DRAFT product too', async () => {
      const productId = await seed('DRAFT');
      await seedVariantRow(db(), productId, { colorName: 'Trắng' });
      const view = await service().list(productId);
      expect(view.variants).toHaveLength(1);
      expect(view.variants[0]?.colorName).toBe('Trắng');
      expect(view.variants[0]?.sizeLabel).toBeNull();
    });

    it('orders deterministically by display order, and reports the same order twice', async () => {
      const productId = await seed();
      const ids = [] as string[];
      for (const order of [2, 0, 1]) {
        ids.push(
          await seedVariantRow(db(), productId, { sizeLabel: `S${order}`, displayOrder: order }),
        );
      }
      const first = await service().list(productId);
      const second = await service().list(productId);
      expect(first.variants.map((v) => v.displayOrder)).toEqual([0, 1, 2]);
      expect(first.variants.map((v) => v.variantId)).toEqual([ids[1], ids[2], ids[0]]);
      expect(second.variants.map((v) => v.variantId)).toEqual(
        first.variants.map((v) => v.variantId),
      );
    });

    it('never lists another product’s variants', async () => {
      const mine = await seed();
      const theirs = await seed();
      await seedVariantRow(db(), theirs, { colorName: 'Đỏ' });
      expect((await service().list(mine)).variants).toEqual([]);
    });

    it('refuses an unknown product and writes nothing', async () => {
      expect(await codeOf(() => service().list(newId()))).toBe('VARIANT_PRODUCT_NOT_FOUND');
      expect(await countOf(sql`select count(*)::text as count from audit_events`)).toBe(0);
    });
  });

  describe('create', () => {
    it('creates on a DRAFT product and assigns the first display order', async () => {
      const productId = await seed('DRAFT');

      const created = await as(() =>
        service().create({
          productId,
          colorName: 'Xanh navy',
          sizeLabel: 'M',
          isActive: true,
        }),
      );

      expect(created.displayOrder).toBe(0);
      expect(created.isActive).toBe(true);
      expect(created.colorName).toBe('Xanh navy');
      expect(await countOf(variantCount(productId))).toBe(1);
    });

    it('creates on a PUBLISHED product — a live product is repaired in place', async () => {
      const productId = await seed('PUBLISHED');
      const created = await as(() =>
        service().create({ productId, colorName: 'Đen', sizeLabel: undefined, isActive: true }),
      );
      expect(created.variantId).toBeDefined();
      // And the product is still published: nothing here unpublishes anything.
      const [row] = await actor.snapshot<{ status: string }>(
        sql`select status from products where id = ${productId}`,
      );
      expect(row?.status).toBe('PUBLISHED');
    });

    it('refuses an ARCHIVED product', async () => {
      const productId = await seed('ARCHIVED');
      expect(
        await codeOf(() =>
          as(() =>
            service().create({ productId, colorName: 'Đen', sizeLabel: 'M', isActive: true }),
          ),
        ),
      ).toBe('VARIANT_PRODUCT_NOT_AUTHORABLE');
      expect(await countOf(variantCount(productId))).toBe(0);
    });

    it('assigns the next display order from the stored maximum, not from the count', async () => {
      const productId = await seed();
      // A gap the server did not create — proving the assignment is `max + 1`
      // and not `length`, which would collide with the row already at 7.
      await seedVariantRow(db(), productId, { sizeLabel: 'S', displayOrder: 7 });

      const created = await as(() =>
        service().create({ productId, colorName: undefined, sizeLabel: 'M', isActive: true }),
      );
      expect(created.displayOrder).toBe(8);
    });

    it('normalizes both labels before storing them', async () => {
      const productId = await seed();
      const created = await as(() =>
        service().create({
          productId,
          colorName: '  Xanh   navy  ',
          sizeLabel: '   ',
          isActive: true,
        }),
      );
      // Trimmed and collapsed; the blank size is stored as NULL rather than as
      // an empty string, so absence has one representation.
      expect(created.colorName).toBe('Xanh navy');
      expect(created.sizeLabel).toBeNull();
    });

    it('refuses a variant with neither label', async () => {
      const productId = await seed();
      expect(
        await codeOf(() =>
          as(() =>
            service().create({ productId, colorName: '  ', sizeLabel: null, isActive: true }),
          ),
        ),
      ).toBe('VARIANT_LABEL_REQUIRED');
      expect(await countOf(variantCount(productId))).toBe(0);
    });

    it('refuses a normalized duplicate, case-insensitively, against an inactive row', async () => {
      const productId = await seed();
      await seedVariantRow(db(), productId, {
        colorName: 'Xanh navy',
        sizeLabel: 'M',
        isActive: false,
      });

      expect(
        await codeOf(() =>
          as(() =>
            service().create({
              productId,
              colorName: ' xanh   NAVY ',
              sizeLabel: 'm',
              isActive: true,
            }),
          ),
        ),
      ).toBe('PRODUCT_VARIANT_DUPLICATE');
      // The refusal is atomic: the rollback took the insert with it.
      expect(await countOf(variantCount(productId))).toBe(1);
    });

    it('does not accent-strip: Đen and Den are different colours', async () => {
      const productId = await seed();
      await as(() =>
        service().create({ productId, colorName: 'Đen', sizeLabel: 'M', isActive: true }),
      );
      const second = await as(() =>
        service().create({ productId, colorName: 'Den', sizeLabel: 'M', isActive: true }),
      );
      expect(second.variantId).toBeDefined();
      expect(await countOf(variantCount(productId))).toBe(2);
    });

    it('keeps different sizes of one colour distinct', async () => {
      const productId = await seed();
      await as(() =>
        service().create({ productId, colorName: 'Đen', sizeLabel: 'M', isActive: true }),
      );
      await as(() =>
        service().create({ productId, colorName: 'Đen', sizeLabel: 'L', isActive: true }),
      );
      expect(await countOf(variantCount(productId))).toBe(2);
    });

    it('allows the same identity on a different product', async () => {
      const mine = await seed();
      const theirs = await seed();
      await as(() =>
        service().create({ productId: mine, colorName: 'Đen', sizeLabel: 'M', isActive: true }),
      );
      const other = await as(() =>
        service().create({ productId: theirs, colorName: 'Đen', sizeLabel: 'M', isActive: true }),
      );
      expect(other.productId).toBe(theirs);
    });

    it('leaves exactly one audit row, naming fields and never a label', async () => {
      const productId = await seed();
      await as(() =>
        service().create({ productId, colorName: 'Xanh navy', sizeLabel: 'M', isActive: true }),
      );

      expect(
        await countOf(
          sql`select count(*)::text as count from audit_events where action = 'product.variant_created'`,
        ),
      ).toBe(1);
      const [row] = await actor.snapshot<{ summary: unknown; target_id: string }>(
        sql`select summary, target_id from audit_events where action = 'product.variant_created'`,
      );
      expect(row?.target_id).toBe(productId);
      // Field names and a count. An operator's colour is not copied into a
      // durable log by an unrelated mechanism.
      expect(JSON.stringify(row?.summary)).not.toContain('Xanh navy');
      expect(row?.summary).toEqual({
        changed: ['colorName', 'sizeLabel', 'displayOrder', 'isActive'],
        activeVariants: 1,
      });
    });
  });

  describe('update', () => {
    async function seeded(status = 'DRAFT'): Promise<{ productId: string; variantId: string }> {
      const productId = await seed(status);
      const variantId = await seedVariantRow(db(), productId, {
        colorName: 'Xanh navy',
        sizeLabel: 'M',
      });
      return { productId, variantId };
    }

    it('edits a label and stores it normalized', async () => {
      const { productId, variantId } = await seeded();
      const updated = await as(() =>
        service().update({ productId, variantId, fields: { colorName: ' Xanh  lá ' } }),
      );
      expect(updated.colorName).toBe('Xanh lá');
      expect(updated.sizeLabel).toBe('M');
    });

    it('clears one label while the other survives', async () => {
      const { productId, variantId } = await seeded();
      const updated = await as(() =>
        service().update({ productId, variantId, fields: { colorName: null } }),
      );
      expect(updated.colorName).toBeNull();
      expect(updated.sizeLabel).toBe('M');
    });

    it('refuses a patch that would leave the variant with neither label', async () => {
      const productId = await seed();
      const variantId = await seedVariantRow(db(), productId, { colorName: 'Đen' });
      expect(
        await codeOf(() =>
          as(() => service().update({ productId, variantId, fields: { colorName: '' } })),
        ),
      ).toBe('VARIANT_LABEL_REQUIRED');
    });

    it('deactivates and reactivates on a PUBLISHED product without unpublishing it', async () => {
      const { productId, variantId } = await seeded('PUBLISHED');

      const off = await as(() =>
        service().update({ productId, variantId, fields: { isActive: false } }),
      );
      expect(off.isActive).toBe(false);
      expect(await countOf(activeVariantCount(productId))).toBe(0);

      // The whole point of the rule: the last active variant is gone and the
      // product is still published. Recovery is in place, never by withdrawal.
      const [row] = await actor.snapshot<{ status: string }>(
        sql`select status from products where id = ${productId}`,
      );
      expect(row?.status).toBe('PUBLISHED');

      const on = await as(() =>
        service().update({ productId, variantId, fields: { isActive: true } }),
      );
      expect(on.isActive).toBe(true);
    });

    it('refuses an ARCHIVED product', async () => {
      const { productId, variantId } = await seeded('ARCHIVED');
      expect(
        await codeOf(() =>
          as(() => service().update({ productId, variantId, fields: { isActive: false } })),
        ),
      ).toBe('VARIANT_PRODUCT_NOT_AUTHORABLE');
    });

    it('refuses a rename that collides with a sibling', async () => {
      const { productId, variantId } = await seeded();
      await seedVariantRow(db(), productId, {
        colorName: 'Đen',
        sizeLabel: 'L',
        displayOrder: 1,
      });
      expect(
        await codeOf(() =>
          as(() =>
            service().update({
              productId,
              variantId,
              fields: { colorName: 'đen', sizeLabel: 'l' },
            }),
          ),
        ),
      ).toBe('PRODUCT_VARIANT_DUPLICATE');
    });

    it('does not treat a variant as a duplicate of itself', async () => {
      const { productId, variantId } = await seeded();
      const updated = await as(() =>
        service().update({ productId, variantId, fields: { isActive: false } }),
      );
      expect(updated.colorName).toBe('Xanh navy');
    });

    it('refuses a variant that belongs to another product', async () => {
      const { variantId } = await seeded();
      const other = await seed();
      expect(
        await codeOf(() =>
          as(() => service().update({ productId: other, variantId, fields: { isActive: false } })),
        ),
      ).toBe('VARIANT_PRODUCT_MISMATCH');
    });

    it('refuses a variant that does not exist', async () => {
      const productId = await seed();
      expect(
        await codeOf(() =>
          as(() =>
            service().update({ productId, variantId: newId(), fields: { isActive: false } }),
          ),
        ),
      ).toBe('VARIANT_NOT_FOUND');
    });

    it('refuses an unknown product before it looks at the variant', async () => {
      expect(
        await codeOf(() =>
          as(() =>
            service().update({
              productId: newId(),
              variantId: newId(),
              fields: { isActive: false },
            }),
          ),
        ),
      ).toBe('VARIANT_PRODUCT_NOT_FOUND');
    });

    it('advances updated_at and leaves one audit row naming only the changed field', async () => {
      const { productId, variantId } = await seeded();
      // The raw snapshot bypasses the ORM mapper, so `updated_at` arrives as
      // the driver's own representation rather than as a Date.
      const stamp = async (): Promise<number> => {
        const [row] = await actor.snapshot<{ updated_at: string }>(
          sql`select updated_at from product_variants where id = ${variantId}`,
        );
        return new Date(String(row?.updated_at)).getTime();
      };
      const before = await stamp();

      await as(() => service().update({ productId, variantId, fields: { isActive: false } }));

      // Advanced by the database clock, not the API host's.
      expect(await stamp()).toBeGreaterThan(before);

      const [row] = await actor.snapshot<{ summary: unknown }>(
        sql`select summary from audit_events where action = 'product.variant_updated'`,
      );
      expect(row?.summary).toEqual({ changed: ['isActive'], activeVariants: 0 });
    });
  });

  it('exposes no delete: the service has create, update and list and nothing else', () => {
    // The absence is the contract (`N02.D01` §E). A variant leaves the catalog
    // by `isActive`, which is what keeps the commercial history readable.
    const surface = Object.getOwnPropertyNames(ProductVariantService.prototype).filter(
      (name) => name !== 'constructor' && !name.startsWith('_'),
    );
    expect(surface.filter((name) => /delete|remove|destroy|archive/i.test(name))).toEqual([]);
    expect(surface).toEqual(expect.arrayContaining(['list', 'create', 'update']));
  });
});
