/**
 * Idempotency, concurrency and cleanup (`APP3-W01A`; `IMP-D046` PO-08).
 *
 * The runtime is at-least-once, so the questions here are the ones a single
 * happy-path run cannot answer: what two deliveries of the same event do, what
 * two associations for one Asset do, what two workers racing do, and what is
 * left behind when the database refuses after the object already exists.
 *
 * The case worth reading twice is the last one in "an existing result". A
 * `READY` derivative is not an answer on its own: the request that arrived has
 * to be authorized *now*, so a stale association is refused even though perfectly
 * good bytes are sitting there. Getting that backwards would let a withdrawn
 * placement keep re-authorizing work forever.
 */
import { sql } from '@embroidery/database';
import { ObjectStorageError, type ObjectStoragePort } from '@embroidery/object-storage';

import { jpeg, pngWithAlpha } from '../../asset-inspection/tests/image-fixtures';
import type { AssetNormalizationRepository } from '../domain/repositories/asset-normalization.repository';
import {
  startAssetNormalizationContext,
  type AssetNormalizationContext,
} from './asset-normalization-context';

interface DerivativeRow extends Record<string, unknown> {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly storage_key: string | null;
}

describe('normalization idempotency (live PostgreSQL + MinIO)', () => {
  let ctx: AssetNormalizationContext;

  beforeAll(async () => {
    ctx = await startAssetNormalizationContext('app3w01a-idempotency');
  }, 300_000);

  afterAll(async () => {
    await ctx?.close();
  }, 300_000);

  const rows = (assetId: string) =>
    ctx.query<DerivativeRow>(
      sql`select id, kind, status, storage_key from asset_derivatives
           where asset_id = ${assetId} order by kind, id`,
    );

  const objects = (assetId: string) =>
    ctx.storage.listObjectsByPrefix({
      bucket: 'DERIVATIVES',
      prefix: `test/derivatives/${assetId}/`,
    });

  const run = (
    assetId: string,
    reference: Parameters<typeof ctx.appendEvent>[1],
    useCase = ctx.useCase,
  ) =>
    useCase.normalize(
      { schemaVersion: 1, assetId, normalizationPolicyVersion: 1, associationRef: reference },
      new AbortController().signal,
    );

  async function seedSide() {
    const image = await pngWithAlpha(240, 180);
    const { assetId } = await ctx.seedAsset(image);
    const sideId = await ctx.seedProductSide(assetId);
    return {
      assetId,
      reference: { kind: 'PRODUCT_SIDE_BACKGROUND', productSideId: sideId } as const,
    };
  }

  describe('duplicate delivery', () => {
    it('converges on one authoritative derivative', async () => {
      const { assetId, reference } = await seedSide();
      await ctx.appendEvent(assetId, reference);
      await ctx.appendEvent(assetId, reference);

      const first = await run(assetId, reference);
      const second = await run(assetId, reference);

      expect(first.outcome).toBe('NORMALIZED');
      expect(second.outcome).toBe('ALREADY_NORMALIZED');

      const stored = await rows(assetId);
      expect(stored.filter((row) => row.status !== 'FAILED')).toHaveLength(1);
      expect(await objects(assetId)).toHaveLength(1);
    });

    it('converges when two different associations name one Asset', async () => {
      // One Asset can legitimately back a Product Side and a Template. The
      // association authorizes the request; it does not multiply the result.
      const image = await jpeg(200, 150);
      const { assetId } = await ctx.seedAsset(image, { kind: 'CATALOG_MEDIA' });
      const sideId = await ctx.seedProductSide(assetId);

      const first = await run(assetId, { kind: 'PRODUCT_SIDE_BACKGROUND', productSideId: sideId });
      const secondSide = await ctx.seedProductSide(assetId);
      const second = await run(assetId, {
        kind: 'PRODUCT_SIDE_BACKGROUND',
        productSideId: secondSide,
      });

      expect(first.outcome).toBe('NORMALIZED');
      expect(second.outcome).toBe('ALREADY_NORMALIZED');
      expect((await rows(assetId)).filter((row) => row.status !== 'FAILED')).toHaveLength(1);
    });
  });

  describe('two workers, one asset', () => {
    it('lets exactly one produce the authoritative result', async () => {
      const { assetId, reference } = await seedSide();

      const settled = await Promise.allSettled([
        run(assetId, reference),
        run(assetId, reference, ctx.buildUseCase({})),
      ]);

      const fulfilled = settled.filter(
        (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof run>>> =>
          result.status === 'fulfilled',
      );
      // Whatever the interleaving, the durable state is one live row and one
      // object: the partial unique index and the guarded finalize decide, not
      // the ordering.
      const live = (await rows(assetId)).filter((row) => row.status !== 'FAILED');
      expect(live).toHaveLength(1);
      expect(live[0]?.status).toBe('READY');
      expect(await objects(assetId)).toHaveLength(1);
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('an existing result', () => {
    it('does not satisfy a request whose association has since gone', async () => {
      const { assetId, reference } = await seedSide();
      expect((await run(assetId, reference)).outcome).toBe('NORMALIZED');

      await ctx.query(
        sql`update product_sides set retired_at = now()
             where id = ${reference.productSideId}`,
      );

      const result = await run(assetId, reference);
      expect(result.outcome).toBe('REJECTED');
      if (result.outcome === 'REJECTED') {
        expect(result.code).toBe('NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE');
      }
      // The earlier result is untouched: it was authorized when it was made.
      expect((await rows(assetId)).filter((row) => row.status === 'READY')).toHaveLength(1);
    });
  });

  describe('failure leaves no residue', () => {
    it('writes no object when the context is refused', async () => {
      const image = await pngWithAlpha(120, 120);
      const { assetId } = await ctx.seedAsset(image);
      const sideId = await ctx.seedProductSide(assetId, { retired: true });

      const result = await run(assetId, { kind: 'PRODUCT_SIDE_BACKGROUND', productSideId: sideId });
      expect(result.outcome).toBe('REJECTED');
      expect(await objects(assetId)).toEqual([]);
      expect((await rows(assetId)).filter((row) => row.status !== 'FAILED')).toEqual([]);
    });

    it('retries after a transient storage failure without a duplicate object', async () => {
      const { assetId, reference } = await seedSide();
      const failing = failingStorage(ctx.storage, 'putObjectStream');
      const flaky = ctx.buildUseCase({ storage: failing });

      await expect(run(assetId, reference, flaky)).rejects.toBeDefined();
      // The claim was released, so the next attempt starts clean rather than
      // taking over a row it did not create.
      expect((await rows(assetId)).filter((row) => row.status !== 'FAILED')).toEqual([]);

      expect((await run(assetId, reference)).outcome).toBe('NORMALIZED');
      expect(await objects(assetId)).toHaveLength(1);
    });

    it('removes the object when database finalization fails after the write', async () => {
      const { assetId, reference } = await seedSide();
      const broken: AssetNormalizationRepository = {
        ...ctx.repository,
        findSource: (id) => ctx.repository.findSource(id),
        findAssociation: (kind, id) => ctx.repository.findAssociation(kind, id),
        prepareOrRecover: (input) => ctx.repository.prepareOrRecover(input),
        findNormalized: (id) => ctx.repository.findNormalized(id),
        failClaim: (id, at) => ctx.repository.failClaim(id, at),
        finalizeReady: () => Promise.reject(new Error('finalization failed')),
      };

      await expect(
        run(assetId, reference, ctx.buildUseCase({ repository: broken })),
      ).rejects.toBeDefined();

      // The existing reconciliation behaviour: no orphan table, no cleanup
      // scheduler — the attempt that wrote the object removes it.
      expect(await objects(assetId)).toEqual([]);
      expect((await rows(assetId)).filter((row) => row.status !== 'FAILED')).toEqual([]);
    });
  });

  describe('the schema is unchanged', () => {
    it('has no profile or association column on asset_derivatives', async () => {
      const columns = await ctx.query<{ column_name: string }>(
        sql`select column_name from information_schema.columns
             where table_name = 'asset_derivatives'`,
      );
      const names = columns.map((row) => row.column_name);
      for (const forbidden of [
        'profile',
        'processing_profile',
        'editor_profile',
        'association_id',
        'product_side_id',
      ]) {
        expect(names).not.toContain(forbidden);
      }
      // The quartet DB01 added is present and is the only metadata this
      // checkpoint writes.
      for (const required of ['width_px', 'height_px', 'media_type', 'byte_size']) {
        expect(names).toContain(required);
      }
    });

    it('applied migration 0034 and nothing after it', async () => {
      const files = await ctx.query<{ count: string }>(
        sql`select count(*)::text as count from drizzle.__drizzle_migrations`,
      );
      expect(Number(files[0]?.count ?? '0')).toBe(34);
    });
  });
});

/** A port whose one named operation always fails as an infrastructure fault. */
function failingStorage(real: ObjectStoragePort, operation: 'putObjectStream'): ObjectStoragePort {
  return {
    ...real,
    getObjectStream: (reference, signal) => real.getObjectStream(reference, signal),
    headObject: (reference, signal) => real.headObject(reference, signal),
    deleteObject: (reference, signal) => real.deleteObject(reference, signal),
    listObjectsByPrefix: (input) => real.listObjectsByPrefix(input),
    ensurePrivateBuckets: (signal) => real.ensurePrivateBuckets(signal),
    [operation]: () =>
      Promise.reject(new ObjectStorageError('PROVIDER_UNAVAILABLE', 'injected outage')),
  };
}
