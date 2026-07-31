/**
 * `APP2-B02-C1` — the corrections that only a live database can prove.
 *
 * Three properties, each of which the delivered B02 could not actually promise:
 *
 * 1. **The public token strictly advances.** Truncating `updated_at` to
 *    milliseconds made it comparable but not safe — two writes inside one
 *    millisecond published the *same* token, so a stale value still matched.
 * 2. **Media validation is one batch query.** The per-item loop was the only
 *    reason a twelve-item product limit existed.
 * 3. **Selected assets stay eligible until commit.** A read at `READ COMMITTED`
 *    followed by a later write cannot promise that; a `FOR SHARE` lock can.
 *
 * The timing tests deliberately do **not** sleep between writes: sleeping is
 * exactly what would hide the same-millisecond defect.
 */
import { sql } from 'drizzle-orm';
import { DatabaseExecutor, TransactionManager } from '@embroidery/persistence';
import { driverErrorCode, newId, SQLSTATE } from '@embroidery/database';

import { ProductDraftQuery } from '../../src/modules/catalog/application/product-draft.query';
import { ProductDraftService } from '../../src/modules/catalog/application/product-draft.service';
import {
  ASSET_REPOSITORY,
  type AssetRepository,
} from '../../src/modules/asset/domain/repositories/asset.repository';
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';

describe('catalog draft concurrency and media batching (integration)', () => {
  let ctx: ApiIntegrationTestContext;
  let drafts: ProductDraftService;
  let query: ProductDraftQuery;
  let assets: AssetRepository;
  let transactions: TransactionManager;
  let executor: DatabaseExecutor;

  beforeAll(async () => {
    ctx = await createApiIntegrationContext('app2b02c1-concurrency');
    drafts = ctx.app.get(ProductDraftService);
    query = ctx.app.get(ProductDraftQuery);
    assets = ctx.app.get<AssetRepository>(ASSET_REPOSITORY);
    transactions = ctx.app.get(TransactionManager);
    executor = ctx.app.get(DatabaseExecutor);
  }, 240_000);

  afterAll(async () => {
    await ctx?.close();
  }, 240_000);

  async function seedAcceptedAsset(): Promise<string> {
    const id = newId();
    await ctx.database.client.db.execute(sql`
      insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
      values (${id}, 'CATALOG_MEDIA', 'PRODUCTION_SENSITIVE',
              ${`development/originals/${id}/original.png`}, 'image/png', 51200,
              ${`sha256:${'e'.repeat(64)}`}, 'ACCEPTED')
    `);
    return id;
  }

  async function codeOf(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
    } catch (error: unknown) {
      return (error as { code?: string }).code ?? 'NO_CODE';
    }
    return 'NO_ERROR';
  }

  // C1-02 -----------------------------------------------------------------
  describe('monotonic concurrency token', () => {
    it('advances the public token on an immediate PATCH', async () => {
      const created = await drafts.create({ categorySlug: 'thu-bong', name: 'Token tiến lên' });
      const updated = await drafts.update({
        productId: created.productId,
        expectedUpdatedAt: new Date(created.updatedAt),
        name: 'Token tiến lên 2',
      });

      expect(updated.updatedAt).not.toBe(created.updatedAt);
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
        new Date(created.updatedAt).getTime(),
      );
    });

    it('rejects the old token and accepts the new one', async () => {
      const created = await drafts.create({ categorySlug: 'khan', name: 'Token cũ mới' });
      const first = await drafts.update({
        productId: created.productId,
        expectedUpdatedAt: new Date(created.updatedAt),
        name: 'Lần một',
      });

      expect(
        await codeOf(() =>
          drafts.update({
            productId: created.productId,
            expectedUpdatedAt: new Date(created.updatedAt),
            name: 'Lần hai với token cũ',
          }),
        ),
      ).toBe('PRODUCT_VERSION_CONFLICT');

      const second = await drafts.update({
        productId: created.productId,
        expectedUpdatedAt: new Date(first.updatedAt),
        name: 'Lần hai với token mới',
      });
      expect(second.name).toBe('Lần hai với token mới');
    });

    /**
     * The regression, exercised **deterministically**.
     *
     * Waiting for two writes to collide inside one millisecond is a race the
     * test would usually lose, and a test that usually passes is exactly how
     * this defect survived. Instead the row's own token is placed clearly
     * ahead of the clock — which is what a same-millisecond predecessor,
     * or any host clock skew, looks like to the next writer. The offset is two
     * seconds only so the round trip cannot overtake it; the invariant under
     * test is size-independent. The delivered
     * `date_trunc(clock_timestamp())` then yields a token **not greater** than
     * the one already published; the corrected `GREATEST(clock, token + 1ms)`
     * always advances. No sleeping, no machine-speed dependency.
     */
    it('advances the token even when the stored one is not behind the clock', async () => {
      const created = await drafts.create({ categorySlug: 'thu-bong', name: 'Đồng hồ lệch' });
      await ctx.database.client.db.execute(sql`
        update products
           set updated_at = date_trunc('milliseconds', clock_timestamp()) + interval '2 seconds'
         where id = ${created.productId}
      `);

      const ahead = await query.detail(created.productId);
      const updated = await drafts.update({
        productId: created.productId,
        expectedUpdatedAt: new Date(ahead.updatedAt),
        name: 'Sau khi lệch',
      });

      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
        new Date(ahead.updatedAt).getTime(),
      );
      // And the superseded token is dead, which is the property that failed.
      expect(
        await codeOf(() =>
          drafts.update({
            productId: created.productId,
            expectedUpdatedAt: new Date(ahead.updatedAt),
            name: 'Không được',
          }),
        ),
      ).toBe('PRODUCT_VERSION_CONFLICT');
    });

    it('never repeats a token across rapid successive writes', async () => {
      const created = await drafts.create({ categorySlug: 'quan-ao', name: 'Nhiều lần ghi' });
      const tokens = [created.updatedAt];
      let token = created.updatedAt;

      for (let index = 0; index < 8; index += 1) {
        const next = await drafts.update({
          productId: created.productId,
          expectedUpdatedAt: new Date(token),
          name: `Nhiều lần ghi ${String(index)}`,
        });
        token = next.updatedAt;
        tokens.push(token);
      }

      expect(new Set(tokens).size).toBe(tokens.length);
      const times = tokens.map((value) => new Date(value).getTime());
      for (let index = 1; index < times.length; index += 1) {
        expect(times[index]).toBeGreaterThan(times[index - 1] as number);
      }

      // Every superseded token is genuinely dead.
      for (const stale of tokens.slice(0, -1)) {
        expect(
          await codeOf(() =>
            drafts.update({
              productId: created.productId,
              expectedUpdatedAt: new Date(stale),
              name: 'Không được',
            }),
          ),
        ).toBe('PRODUCT_VERSION_CONFLICT');
      }
    });

    it('yields exactly one winner when two writes race on one token', async () => {
      const created = await drafts.create({ categorySlug: 'khac', name: 'Đua ghi' });
      const token = new Date(created.updatedAt);

      const results = await Promise.allSettled([
        drafts.update({ productId: created.productId, expectedUpdatedAt: token, name: 'A' }),
        drafts.update({ productId: created.productId, expectedUpdatedAt: token, name: 'B' }),
      ]);

      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter((result) => result.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        code: 'PRODUCT_VERSION_CONFLICT',
      });

      const after = await query.detail(created.productId);
      expect(['A', 'B']).toContain(after.name);
    });

    it('advances the token on archive too', async () => {
      const created = await drafts.create({ categorySlug: 'thu-bong', name: 'Lưu trữ token' });
      const archived = await drafts.archive({
        productId: created.productId,
        expectedUpdatedAt: new Date(created.updatedAt),
      });

      expect(new Date(archived.updatedAt).getTime()).toBeGreaterThan(
        new Date(created.updatedAt).getTime(),
      );
      expect(archived.archivedAt).toBeDefined();
    });

    it('changes nothing at all when a mutation is rejected as stale', async () => {
      const created = await drafts.create({ categorySlug: 'khan', name: 'Không đổi gì' });
      const asset = await seedAcceptedAsset();
      const withMedia = await drafts.update({
        productId: created.productId,
        expectedUpdatedAt: new Date(created.updatedAt),
        mediaAssetIds: [asset],
      });

      const before = await query.detail(created.productId);
      expect(
        await codeOf(() =>
          drafts.update({
            productId: created.productId,
            expectedUpdatedAt: new Date(created.updatedAt),
            name: 'Ghi đè',
            description: 'Ghi đè',
            mediaAssetIds: [],
          }),
        ),
      ).toBe('PRODUCT_VERSION_CONFLICT');

      const after = await query.detail(created.productId);
      expect(after).toEqual(before);
      expect(after.updatedAt).toBe(withMedia.updatedAt);
    });
  });

  // C1-03 -----------------------------------------------------------------
  describe('media selection without an invented limit', () => {
    it('accepts thirteen distinct assets — the hidden twelve-item cap is gone', async () => {
      const created = await drafts.create({ categorySlug: 'thu-bong', name: 'Mười ba ảnh' });
      const ids: string[] = [];
      for (let index = 0; index < 13; index += 1) {
        ids.push(await seedAcceptedAsset());
      }

      const updated = await drafts.update({
        productId: created.productId,
        expectedUpdatedAt: new Date(created.updatedAt),
        mediaAssetIds: ids,
      });

      expect(updated.media).toHaveLength(13);
      expect(updated.media.map((item) => item.assetId)).toEqual(ids);
      expect(updated.media[0]?.role).toBe('THUMBNAIL');
      expect(updated.media.slice(1).every((item) => item.role === 'GALLERY')).toBe(true);
      expect(updated.media.map((item) => item.position)).toEqual(
        Array.from({ length: 13 }, (_unused, index) => index),
      );
    });

    it('resolves the whole selection in one batch read, never one per asset', async () => {
      const created = await drafts.create({ categorySlug: 'khan', name: 'Một truy vấn' });
      const ids: string[] = [];
      for (let index = 0; index < 5; index += 1) {
        ids.push(await seedAcceptedAsset());
      }

      const batch = jest.spyOn(assets, 'lockScopedByIds');
      const perItem = jest.spyOn(assets, 'findScoped');
      try {
        await drafts.update({
          productId: created.productId,
          expectedUpdatedAt: new Date(created.updatedAt),
          mediaAssetIds: ids,
        });

        expect(batch).toHaveBeenCalledTimes(1);
        expect(batch.mock.calls[0]?.[0]).toEqual(ids);
        // The per-item read is what the correction removed.
        expect(perItem).not.toHaveBeenCalled();
      } finally {
        batch.mockRestore();
        perItem.mockRestore();
      }
    });

    it('still rejects a duplicate, a missing and an unavailable asset', async () => {
      const created = await drafts.create({ categorySlug: 'khac', name: 'Vẫn kiểm tra' });
      const good = await seedAcceptedAsset();
      const pending = newId();
      await ctx.database.client.db.execute(sql`
        insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
        values (${pending}, 'CATALOG_MEDIA', 'PRODUCTION_SENSITIVE',
                ${`development/originals/${pending}/original.png`}, 'image/png', 4096,
                ${`sha256:${'f'.repeat(64)}`}, 'INSPECTING')
      `);
      const at = new Date(created.updatedAt);

      const cases: ReadonlyArray<[readonly string[], string]> = [
        [[good, good], 'PRODUCT_MEDIA_DUPLICATE'],
        [[good, newId()], 'PRODUCT_MEDIA_ASSET_NOT_FOUND'],
        [[good, pending], 'PRODUCT_MEDIA_ASSET_UNAVAILABLE'],
      ];
      for (const [mediaAssetIds, expected] of cases) {
        expect(
          await codeOf(() =>
            drafts.update({ productId: created.productId, expectedUpdatedAt: at, mediaAssetIds }),
          ),
        ).toBe(expected);
      }

      // All-or-nothing: not one link was written by any of the three attempts.
      const after = await query.detail(created.productId);
      expect(after.media).toEqual([]);
      expect(after.updatedAt).toBe(created.updatedAt);
    });
  });

  // C1-04 -----------------------------------------------------------------
  describe('asset eligibility race', () => {
    /**
     * Two real transactions. The product transaction validates and locks the
     * asset with `FOR SHARE`; a separate session then tries the transition out
     * of `ACCEPTED` that would invalidate the association.
     *
     * The transition must not be able to commit while the product transaction
     * holds the lock — that is the whole guarantee. `lock_timeout` turns the
     * block into a fast, deterministic failure instead of a hang.
     */
    it('blocks an asset leaving ACCEPTED while a product PATCH holds the lock', async () => {
      const assetId = await seedAcceptedAsset();

      let releaseProduct: (() => void) | undefined;
      const productHeld = new Promise<void>((resolve) => {
        releaseProduct = resolve;
      });
      let lockAcquired: (() => void) | undefined;
      const locked = new Promise<void>((resolve) => {
        lockAcquired = resolve;
      });

      // Two independent `runInTransaction` calls are two pooled connections and
      // therefore two real PostgreSQL transactions — no second driver needed.
      const productTx = transactions.runInTransaction(async () => {
        await assets.lockScopedByIds([assetId] as never, {
          kind: 'CATALOG_MEDIA',
          classification: 'PRODUCTION_SENSITIVE',
        });
        lockAcquired?.();
        await productHeld;
      });

      try {
        await locked;

        const rival = transactions.runInTransaction(async () => {
          const tx = executor.requireTransaction('rival-asset-transition');
          // Turns the block into a fast deterministic failure instead of a hang.
          await tx.execute(sql`set local lock_timeout = '750ms'`);
          await tx.execute(sql`update assets set status = 'REJECTED' where id = ${assetId}`);
        });
        // Drizzle wraps the driver error, so the message is generic — the
        // SQLSTATE is the fact that matters: 55P03 is lock_not_available, i.e.
        // the transition really was blocked by the product transaction's lock.
        const blocked: unknown = await rival.then(
          () => undefined,
          (error: unknown) => error,
        );
        expect(blocked).toBeDefined();
        expect(driverErrorCode(blocked)).toBe(SQLSTATE.LOCK_NOT_AVAILABLE);

        // The asset is still exactly what the product transaction validated.
        const { rows } = await ctx.database.client.db.execute(
          sql`select status from assets where id = ${assetId}`,
        );
        expect(rows[0]).toMatchObject({ status: 'ACCEPTED' });
      } finally {
        releaseProduct?.();
        await productTx;
      }
    }, 120_000);

    it('lets the transition proceed once the product transaction has committed', async () => {
      const created = await drafts.create({ categorySlug: 'khan', name: 'Sau khi commit' });
      const assetId = await seedAcceptedAsset();

      await drafts.update({
        productId: created.productId,
        expectedUpdatedAt: new Date(created.updatedAt),
        mediaAssetIds: [assetId],
      });

      // The lock ended with the transaction, so the store may now reject the
      // asset — the ordering is serialized, not prevented.
      await ctx.database.client.db.execute(
        sql`update assets set status = 'REJECTED' where id = ${assetId}`,
      );
      const { rows } = await ctx.database.client.db.execute(
        sql`select status from assets where id = ${assetId}`,
      );
      expect(rows[0]).toMatchObject({ status: 'REJECTED' });

      // The already-committed association survives; B03 publication readiness
      // is where a rejected image becomes a publish-time concern.
      const detail = await query.detail(created.productId);
      expect(detail.media.map((item) => item.assetId)).toEqual([assetId]);
    });
  });
});
