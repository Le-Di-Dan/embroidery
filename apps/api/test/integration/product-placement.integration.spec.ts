/**
 * `APP3-B01` placement authoring against a real, fully migrated PostgreSQL
 * database.
 *
 * What only a live database can prove: that a replace is one transaction and
 * leaves no residue when it fails, that the `APP3-DB01` guard triggers actually
 * fire on a referenced row, that retirement and same-parent supersession behave
 * as ruled, and that two concurrent replaces cannot silently lose one another's
 * work.
 *
 * Every "nothing else changed" assertion is made against raw rows rather than
 * the API's own projection — an API that lied about what it wrote would also lie
 * about what it read back.
 */
import { sql } from 'drizzle-orm';

import { ProductPlacementQuery } from '../../src/modules/catalog/application/product-placement.query';
import { ProductPlacementService } from '../../src/modules/catalog/application/product-placement.service';
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import {
  asAdmin,
  rows,
  seedAdminId,
  seedPublishableProduct,
} from '../support/product-publication-fixtures';
import {
  areaCommand,
  seedBackgroundAsset,
  seedTemplateReferencing,
  sideCommand,
} from '../support/product-placement-fixtures';

interface SideRow extends Record<string, unknown> {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly display_order: number;
  readonly px_per_mm: string;
  readonly image_width_px: number;
  readonly retired_at: Date | null;
  readonly superseded_by_id: string | null;
}

interface AreaRow extends Record<string, unknown> {
  readonly id: string;
  readonly product_side_id: string;
  readonly code: string;
  readonly retired_at: Date | null;
  readonly superseded_by_id: string | null;
}

describe('product placement authoring (live PostgreSQL)', () => {
  let ctx: ApiIntegrationTestContext;
  let placement: ProductPlacementService;
  let query: ProductPlacementQuery;
  let adminId: string;

  beforeAll(async () => {
    ctx = await createApiIntegrationContext('app3b01-placement');
    placement = ctx.app.get(ProductPlacementService);
    query = ctx.app.get(ProductPlacementQuery);
    adminId = await seedAdminId(ctx);
  }, 240_000);

  afterAll(async () => {
    await ctx?.close();
  }, 240_000);

  const sideRows = (productId: string) =>
    rows<SideRow>(
      ctx,
      sql`select * from product_sides where product_id = ${productId}
          order by display_order, code, id`,
    );

  const areaRows = (productId: string) =>
    rows<AreaRow>(
      ctx,
      sql`select a.* from embroidery_areas a
          join product_sides s on s.id = a.product_side_id
          where s.product_id = ${productId}
          order by a.display_order, a.code, a.id`,
    );

  async function codeOf(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
    } catch (error: unknown) {
      return (error as { code?: string }).code ?? 'NO_CODE';
    }
    return 'NO_ERROR';
  }

  /** A product, a usable background, and the token a replace must echo. */
  async function seedProduct(): Promise<{
    productId: string;
    updatedAt: string;
    backgroundAssetId: string;
  }> {
    const product = await asAdmin(ctx, adminId, () => seedPublishableProduct(ctx));
    const backgroundAssetId = await seedBackgroundAsset(ctx);
    return { ...product, backgroundAssetId };
  }

  const replace = async (
    productId: string,
    updatedAt: string,
    sides: readonly ReturnType<typeof sideCommand>[],
  ) =>
    asAdmin(ctx, adminId, () =>
      placement.replace({ productId, expectedUpdatedAt: new Date(updatedAt), sides }),
    );

  describe('reading', () => {
    it('returns an empty authoring model for a product with no placement', async () => {
      const { productId } = await seedProduct();
      const view = await query.adminRead(productId);
      expect(view.productId).toBe(productId);
      expect(view.sides).toEqual([]);
      expect(view.updatedAt).toEqual(expect.any(String));
    });

    it('reports an unknown product rather than an empty model', async () => {
      expect(await codeOf(() => query.adminRead('019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6099'))).toBe(
        'PLACEMENT_PRODUCT_NOT_FOUND',
      );
    });
  });

  describe('creating', () => {
    it('writes a side and its area in one transaction', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const view = await replace(productId, updatedAt, [
        sideCommand({ backgroundAssetId, areas: [areaCommand()] }),
      ]);

      expect(view.sides).toHaveLength(1);
      expect(view.sides[0]?.areas).toHaveLength(1);

      const stored = await sideRows(productId);
      expect(stored).toHaveLength(1);
      expect(stored[0]?.code).toBe('front');
      expect(Number(stored[0]?.px_per_mm)).toBe(5);
      expect(stored[0]?.retired_at).toBeNull();
      expect((await areaRows(productId))[0]?.product_side_id).toBe(stored[0]?.id);
    });

    it('reads back exactly what it wrote', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const written = await replace(productId, updatedAt, [
        sideCommand({ backgroundAssetId, areas: [areaCommand()] }),
      ]);
      const read = await query.adminRead(productId);
      expect(read.sides).toEqual(written.sides);
    });

    it('orders sides and areas by displayOrder, code, id', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const view = await replace(productId, updatedAt, [
        sideCommand({ code: 'sleeve', displayOrder: 1, backgroundAssetId }),
        sideCommand({ code: 'back', displayOrder: 0, backgroundAssetId }),
        sideCommand({ code: 'apron', displayOrder: 0, backgroundAssetId }),
      ]);
      expect(view.sides.map((side) => side.code)).toEqual(['apron', 'back', 'sleeve']);
    });
  });

  describe('replacing', () => {
    it('preserves retained ids and adds the new side', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const first = await replace(productId, updatedAt, [
        sideCommand({ backgroundAssetId, areas: [areaCommand()] }),
      ]);
      const sideId = first.sides[0]?.id ?? '';
      const areaId = first.sides[0]?.areas[0]?.id ?? '';

      const second = await replace(productId, first.updatedAt, [
        sideCommand({
          id: sideId,
          backgroundAssetId,
          name: 'Trước',
          areas: [
            areaCommand({ id: areaId }),
            areaCommand({ code: 'back-chest', displayOrder: 1 }),
          ],
        }),
        sideCommand({ code: 'back', displayOrder: 1, backgroundAssetId }),
      ]);

      expect(second.sides[0]?.id).toBe(sideId);
      expect(second.sides[0]?.name).toBe('Trước');
      expect(second.sides[0]?.areas[0]?.id).toBe(areaId);
      expect(second.sides).toHaveLength(2);
      expect(await areaRows(productId)).toHaveLength(2);
    });

    it('retires an omitted side and its area instead of deleting them', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const first = await replace(productId, updatedAt, [
        sideCommand({ backgroundAssetId, areas: [areaCommand()] }),
      ]);
      await replace(productId, first.updatedAt, []);

      const stored = await sideRows(productId);
      expect(stored).toHaveLength(1);
      expect(stored[0]?.retired_at).not.toBeNull();
      expect((await areaRows(productId))[0]?.retired_at).not.toBeNull();
    });

    it('retires with a same-parent replacement pointer', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const first = await replace(productId, updatedAt, [
        sideCommand({ backgroundAssetId, areas: [areaCommand()] }),
      ]);
      const oldId = first.sides[0]?.id ?? '';

      await replace(productId, first.updatedAt, [
        sideCommand({
          code: 'front-v2',
          backgroundAssetId,
          supersedesId: oldId,
          areas: [areaCommand()],
        }),
      ]);

      const stored = await sideRows(productId);
      const retired = stored.find((row) => row.id === oldId);
      const replacement = stored.find((row) => row.id !== oldId);
      expect(retired?.retired_at).not.toBeNull();
      expect(retired?.superseded_by_id).toBe(replacement?.id);
    });

    it('refuses a replacement naming a side of another product', async () => {
      const first = await seedProduct();
      const other = await seedProduct();
      const seeded = await replace(other.productId, other.updatedAt, [
        sideCommand({ backgroundAssetId: other.backgroundAssetId }),
      ]);
      const foreignSideId = seeded.sides[0]?.id ?? '';

      expect(
        await codeOf(() =>
          replace(first.productId, first.updatedAt, [
            sideCommand({
              code: 'front-v2',
              backgroundAssetId: first.backgroundAssetId,
              supersedesId: foreignSideId,
            }),
          ]),
        ),
      ).toBe('PLACEMENT_REPLACEMENT_INVALID');
      expect(await sideRows(first.productId)).toEqual([]);
    });
  });

  describe('refusals leave nothing behind', () => {
    it('rolls back the whole request when one side is invalid', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      expect(
        await codeOf(() =>
          replace(productId, updatedAt, [
            sideCommand({ code: 'front', backgroundAssetId, areas: [areaCommand()] }),
            sideCommand({ code: 'back', backgroundAssetId, imageWidthPx: 1200 }),
          ]),
        ),
      ).toBe('PLACEMENT_SCALE_INCONSISTENT');
      expect(await sideRows(productId)).toEqual([]);
      expect(await areaRows(productId)).toEqual([]);
    });

    it('rolls back when the background does not exist', async () => {
      const { productId, updatedAt } = await seedProduct();
      expect(
        await codeOf(() =>
          replace(productId, updatedAt, [
            sideCommand({ backgroundAssetId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6098' }),
          ]),
        ),
      ).toBe('PLACEMENT_BACKGROUND_NOT_FOUND');
      expect(await sideRows(productId)).toEqual([]);
    });

    it('refuses an SVG background', async () => {
      const { productId, updatedAt } = await seedProduct();
      const svg = await seedBackgroundAsset(ctx, { mimeType: 'image/svg+xml' });
      expect(
        await codeOf(() =>
          replace(productId, updatedAt, [sideCommand({ backgroundAssetId: svg })]),
        ),
      ).toBe('PLACEMENT_BACKGROUND_NOT_ELIGIBLE');
      expect(await sideRows(productId)).toEqual([]);
    });

    it('refuses a background that inspection has not accepted', async () => {
      const { productId, updatedAt } = await seedProduct();
      const pending = await seedBackgroundAsset(ctx, {
        assetStatus: 'UPLOADED',
        derivativeKind: null,
      });
      expect(
        await codeOf(() =>
          replace(productId, updatedAt, [sideCommand({ backgroundAssetId: pending })]),
        ),
      ).toBe('PLACEMENT_BACKGROUND_NOT_ELIGIBLE');
    });

    it('refuses two sides sharing a code and writes neither', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      expect(
        await codeOf(() =>
          replace(productId, updatedAt, [
            sideCommand({ backgroundAssetId }),
            sideCommand({ backgroundAssetId }),
          ]),
        ),
      ).toBe('PLACEMENT_CODE_DUPLICATE');
      expect(await sideRows(productId)).toEqual([]);
    });
  });

  describe('a referenced placement (APP3-DB01 guards)', () => {
    async function seedReferenced() {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const view = await replace(productId, updatedAt, [
        sideCommand({ backgroundAssetId, areas: [areaCommand()] }),
      ]);
      const sideId = view.sides[0]?.id ?? '';
      const areaId = view.sides[0]?.areas[0]?.id ?? '';
      await seedTemplateReferencing(ctx, productId, sideId, areaId);
      return { productId, updatedAt: view.updatedAt, backgroundAssetId, sideId, areaId };
    }

    it('refuses a geometry change', async () => {
      const seeded = await seedReferenced();
      expect(
        await codeOf(() =>
          replace(seeded.productId, seeded.updatedAt, [
            sideCommand({
              id: seeded.sideId,
              backgroundAssetId: seeded.backgroundAssetId,
              imageWidthPx: 2000,
              imageHeightPx: 2000,
              physicalWidthMm: 400,
              physicalHeightMm: 400,
              areas: [areaCommand({ id: seeded.areaId })],
            }),
          ]),
        ),
      ).toBe('PLACEMENT_REFERENCED_IMMUTABLE');

      const stored = await sideRows(seeded.productId);
      expect(stored[0]?.image_width_px).toBe(1000);
    });

    it('allows a display-only change', async () => {
      const seeded = await seedReferenced();
      const view = await replace(seeded.productId, seeded.updatedAt, [
        sideCommand({
          id: seeded.sideId,
          backgroundAssetId: seeded.backgroundAssetId,
          name: 'Mặt trước (mới)',
          displayOrder: 4,
          areas: [areaCommand({ id: seeded.areaId, name: 'Ngực trái' })],
        }),
      ]);
      expect(view.sides[0]?.name).toBe('Mặt trước (mới)');
      expect(view.sides[0]?.displayOrder).toBe(4);
      expect(view.sides[0]?.areas[0]?.name).toBe('Ngực trái');
    });

    it('retires rather than deleting, and never attempts a delete', async () => {
      const seeded = await seedReferenced();
      await replace(seeded.productId, seeded.updatedAt, []);
      const stored = await sideRows(seeded.productId);
      expect(stored).toHaveLength(1);
      expect(stored[0]?.retired_at).not.toBeNull();
    });

    it('rejects a hard delete at the database, whatever asked for it', async () => {
      const seeded = await seedReferenced();
      await expect(
        ctx.database.client.db.execute(sql`delete from product_sides where id = ${seeded.sideId}`),
      ).rejects.toThrow();
    });
  });

  describe('concurrency', () => {
    it('refuses a stale token rather than overwriting', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      await replace(productId, updatedAt, [sideCommand({ backgroundAssetId })]);
      expect(
        await codeOf(() =>
          replace(productId, updatedAt, [sideCommand({ code: 'back', backgroundAssetId })]),
        ),
      ).toBe('PLACEMENT_VERSION_CONFLICT');
    });

    it('cannot silently lose an update when two replaces race', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const [first, second] = await Promise.allSettled([
        replace(productId, updatedAt, [sideCommand({ code: 'front', backgroundAssetId })]),
        replace(productId, updatedAt, [sideCommand({ code: 'back', backgroundAssetId })]),
      ]);

      // Exactly one commits. The loser is refused by the token guard, never
      // applied on top of a state it never read.
      const outcomes = [first?.status, second?.status].sort();
      expect(outcomes).toEqual(['fulfilled', 'rejected']);
      const stored = await sideRows(productId);
      expect(stored).toHaveLength(1);
    });

    it('advances the token on every successful replace', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const first = await replace(productId, updatedAt, [sideCommand({ backgroundAssetId })]);
      expect(new Date(first.updatedAt).getTime()).toBeGreaterThan(new Date(updatedAt).getTime());
    });
  });

  describe('audit', () => {
    it('records one bounded, attributed row per replace', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      await replace(productId, updatedAt, [
        sideCommand({ backgroundAssetId, areas: [areaCommand()] }),
      ]);

      const events = await rows<{
        action: string;
        actor_kind: string;
        admin_id: string;
        summary: Record<string, number>;
      }>(
        ctx,
        sql`select action, actor_kind, admin_id, summary from audit_events
            where target_kind = 'PRODUCT' and target_id = ${productId}
              and action = 'product.placement_replaced'`,
      );

      expect(events).toHaveLength(1);
      expect(events[0]?.actor_kind).toBe('ADMIN');
      expect(events[0]?.admin_id).toBe(adminId);
      expect(events[0]?.summary).toEqual({
        sidesCreated: 1,
        sidesUpdated: 0,
        sidesRetired: 0,
        areasCreated: 1,
        areasUpdated: 0,
        areasRetired: 0,
      });
      // Counts only: no code, name, id, background or geometry.
      expect(JSON.stringify(events[0]?.summary)).not.toContain('front');
    });
  });
});
