/**
 * `APP3-B01-C1` — the placement concurrency contract against a real database.
 *
 * The token is `products.updated_at` and there is no placement revision column,
 * so what has to be proved here is that one column genuinely serialises writes
 * to two other tables: the compare-and-set is the **opening** statement of the
 * replacement transaction, and a caller that loses it must leave no side, no
 * area and no advanced token behind.
 *
 * Every token in this suite is passed explicitly. A helper that quietly re-read
 * the current value before each PUT would make every case pass while proving
 * nothing — which is exactly the failure mode a concurrency test exists to rule
 * out.
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
  sideCommand,
} from '../support/product-placement-fixtures';

describe('placement concurrency (live PostgreSQL)', () => {
  let ctx: ApiIntegrationTestContext;
  let placement: ProductPlacementService;
  let query: ProductPlacementQuery;
  let adminId: string;

  beforeAll(async () => {
    ctx = await createApiIntegrationContext('app3b01c1-concurrency');
    placement = ctx.app.get(ProductPlacementService);
    query = ctx.app.get(ProductPlacementQuery);
    adminId = await seedAdminId(ctx);
  }, 240_000);

  afterAll(async () => {
    await ctx?.close();
  }, 240_000);

  async function codeOf(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
    } catch (error: unknown) {
      return (error as { code?: string }).code ?? 'NO_CODE';
    }
    return 'NO_ERROR';
  }

  /**
   * The stored token, read straight from the column the CAS compares.
   *
   * `new Date(...)` because a raw `execute` bypasses Drizzle's column mapping
   * and hands back whatever the driver produced; normalising here means the
   * comparison is against the same wire format the API returns rather than
   * against a driver representation.
   */
  const storedToken = async (productId: string): Promise<string> => {
    const [row] = await rows<{ updated_at: string | Date }>(
      ctx,
      sql`select updated_at from products where id = ${productId}`,
    );
    return row === undefined ? '' : new Date(row.updated_at).toISOString();
  };

  const sideCount = async (productId: string): Promise<number> => {
    const [row] = await rows<{ count: string }>(
      ctx,
      sql`select count(*)::text as count from product_sides where product_id = ${productId}`,
    );
    return Number(row?.count ?? '0');
  };

  const areaCount = async (productId: string): Promise<number> => {
    const [row] = await rows<{ count: string }>(
      ctx,
      sql`select count(*)::text as count from embroidery_areas a
          join product_sides s on s.id = a.product_side_id
          where s.product_id = ${productId}`,
    );
    return Number(row?.count ?? '0');
  };

  /** The token is always an argument here, never re-read inside the helper. */
  const replaceWith = (
    productId: string,
    token: string,
    sides: readonly ReturnType<typeof sideCommand>[],
  ) =>
    asAdmin(ctx, adminId, () =>
      placement.replace({ productId, expectedUpdatedAt: new Date(token), sides }),
    );

  async function seedProduct() {
    const product = await asAdmin(ctx, adminId, () => seedPublishableProduct(ctx));
    const backgroundAssetId = await seedBackgroundAsset(ctx);
    return { ...product, backgroundAssetId };
  }

  describe('the token a client is given', () => {
    it('is the exact products.updated_at value, in canonical wire format', async () => {
      const { productId } = await seedProduct();
      const view = await query.adminRead(productId);
      expect(view.updatedAt).toBe(await storedToken(productId));
      expect(view.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('is advanced and returned by a successful replace', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const view = await replaceWith(productId, updatedAt, [sideCommand({ backgroundAssetId })]);

      expect(view.updatedAt).not.toBe(updatedAt);
      expect(view.updatedAt).toBe(await storedToken(productId));
      expect(new Date(view.updatedAt).getTime()).toBeGreaterThan(new Date(updatedAt).getTime());
    });

    it('is advanced by a display-only change too', async () => {
      // Nothing about the geometry moved, but the placement model did, so a
      // concurrent writer holding the old token must still be refused.
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const first = await replaceWith(productId, updatedAt, [
        sideCommand({ backgroundAssetId, areas: [areaCommand()] }),
      ]);
      const second = await replaceWith(productId, first.updatedAt, [
        sideCommand({
          id: first.sides[0]?.id,
          backgroundAssetId,
          name: 'Mặt trước (mới)',
          areas: [areaCommand({ id: first.sides[0]?.areas[0]?.id })],
        }),
      ]);
      expect(second.updatedAt).not.toBe(first.updatedAt);
    });

    it('is advanced by retiring the whole placement', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const first = await replaceWith(productId, updatedAt, [sideCommand({ backgroundAssetId })]);
      const cleared = await replaceWith(productId, first.updatedAt, []);
      expect(cleared.updatedAt).not.toBe(first.updatedAt);
      expect(cleared.sides[0]?.retiredAt).not.toBeNull();
    });
  });

  describe('a stale or unusable token', () => {
    it('is refused with the canonical stale-write code', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      await replaceWith(productId, updatedAt, [sideCommand({ backgroundAssetId })]);
      expect(
        await codeOf(() =>
          replaceWith(productId, updatedAt, [sideCommand({ code: 'back', backgroundAssetId })]),
        ),
      ).toBe('PLACEMENT_VERSION_CONFLICT');
    });

    it('writes no side or area when the compare-and-set fails', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const first = await replaceWith(productId, updatedAt, [
        sideCommand({ backgroundAssetId, areas: [areaCommand()] }),
      ]);
      const tokenAfterFirst = await storedToken(productId);

      await codeOf(() =>
        replaceWith(productId, updatedAt, [
          sideCommand({ code: 'back', backgroundAssetId, areas: [areaCommand()] }),
          sideCommand({ code: 'sleeve', backgroundAssetId }),
        ]),
      );

      expect(await sideCount(productId)).toBe(1);
      expect(await areaCount(productId)).toBe(1);
      expect(await storedToken(productId)).toBe(tokenAfterFirst);
      expect((await query.adminRead(productId)).sides[0]?.id).toBe(first.sides[0]?.id);
    });

    it('mutates nothing for an unusable token value', async () => {
      // The HTTP schema rejects a malformed token before this point; a caller
      // reaching the service directly must still change nothing.
      const { productId, backgroundAssetId } = await seedProduct();
      const before = await storedToken(productId);
      await codeOf(() =>
        asAdmin(ctx, adminId, () =>
          placement.replace({
            productId,
            expectedUpdatedAt: new Date('not-a-timestamp'),
            sides: [sideCommand({ backgroundAssetId })],
          }),
        ),
      );
      expect(await sideCount(productId)).toBe(0);
      expect(await storedToken(productId)).toBe(before);
    });

    it('leaves the token untouched when a later validation fails', async () => {
      // The CAS advances `updated_at` first, so a refusal after it has to roll
      // that back with everything else — otherwise a rejected request would
      // invalidate the caller's token and force a pointless reload.
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      expect(
        await codeOf(() =>
          replaceWith(productId, updatedAt, [
            sideCommand({ backgroundAssetId, imageWidthPx: 1200 }),
          ]),
        ),
      ).toBe('PLACEMENT_SCALE_INCONSISTENT');
      expect(await storedToken(productId)).toBe(updatedAt);
      expect(await sideCount(productId)).toBe(0);
    });
  });

  describe('two writers, one token', () => {
    it('lets exactly one commit, and the winner holds the stored token', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const settled = await Promise.allSettled([
        replaceWith(productId, updatedAt, [
          sideCommand({ code: 'front', backgroundAssetId, areas: [areaCommand()] }),
        ]),
        replaceWith(productId, updatedAt, [
          sideCommand({ code: 'back', backgroundAssetId, areas: [areaCommand()] }),
        ]),
      ]);

      const winners = settled.filter((result) => result.status === 'fulfilled');
      const losers = settled.filter((result) => result.status === 'rejected');
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);

      const winner = winners[0] as PromiseFulfilledResult<{ updatedAt: string }>;
      expect(winner.value.updatedAt).toBe(await storedToken(productId));

      const loser = losers[0] as PromiseRejectedResult;
      expect((loser.reason as { code?: string }).code).toBe('PLACEMENT_VERSION_CONFLICT');

      // Exactly the winner's work exists: no partial row from the loser.
      expect(await sideCount(productId)).toBe(1);
      expect(await areaCount(productId)).toBe(1);
    });

    it('lets the loser succeed on a retry with the returned fresh token', async () => {
      const { productId, updatedAt, backgroundAssetId } = await seedProduct();
      const winner = await replaceWith(productId, updatedAt, [
        sideCommand({ code: 'front', backgroundAssetId }),
      ]);
      expect(await codeOf(() => replaceWith(productId, updatedAt, []))).toBe(
        'PLACEMENT_VERSION_CONFLICT',
      );

      const retried = await replaceWith(productId, winner.updatedAt, [
        sideCommand({ id: winner.sides[0]?.id, code: 'front', backgroundAssetId }),
        sideCommand({ code: 'back', displayOrder: 1, backgroundAssetId }),
      ]);
      expect(retried.sides).toHaveLength(2);

      // And the token it just consumed is now stale in its turn.
      expect(await codeOf(() => replaceWith(productId, winner.updatedAt, []))).toBe(
        'PLACEMENT_VERSION_CONFLICT',
      );
    });
  });
});
