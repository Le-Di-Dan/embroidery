/**
 * CTX-AST persistence against a real PostgreSQL instance (DB7-CP3).
 *
 * TBL-022..TBL-024: registration, the inspection pipeline, derivative
 * ownership (INV-22), and the tombstone semantics that keep a deleted
 * original's previews from staying serveable.
 */
import { isPersistenceError, newId } from '@embroidery/database';
import type { PersistenceError } from '@embroidery/database';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { AssetModule } from '../../asset.module';
import { ASSET_REPOSITORY } from '../../domain/repositories/asset.repository';
import type {
  AssetDerivativeId,
  AssetId,
  AssetRepository,
} from '../../domain/repositories/asset.repository';

const CHECKSUM = `sha256:${'a'.repeat(64)}`;

describe('asset persistence (integration)', () => {
  let context: PersistenceTestContext;
  let assets: AssetRepository;

  beforeAll(async () => {
    context = await createPersistenceTestContext('cp3-asset', [AssetModule]);
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

  function register(storageKey = 'uploads/one.png', checksum: string | undefined = CHECKSUM) {
    const id = newId() as AssetId;
    return context.inTransaction(() =>
      assets.register({
        id,
        kind: 'CUSTOMER_UPLOAD',
        classification: 'CUSTOMER_PRIVATE',
        storageKey,
        mimeType: 'image/png',
        sizeBytes: 2048n,
        ...(checksum === undefined ? {} : { checksum }),
      }),
    );
  }

  describe('registration', () => {
    it('registers an asset as UPLOADED, not yet usable', async () => {
      const asset = await register();

      // Not ACCEPTED: an asset is unusable until the validation pipeline has
      // passed it (REQ-ASSET-002).
      expect(asset.status).toBe('UPLOADED');
      expect(asset.sizeBytes).toBe(2048n);
    });

    it('stores a storage reference, never a binary', async () => {
      const asset = await register('uploads/reference-only.png');

      // The key is an internal object-storage reference, not a URL: no
      // permanent public URL is stored as authority.
      expect(asset.storageKey).toBe('uploads/reference-only.png');
      expect(asset.storageKey).not.toMatch(/^https?:/);
    });

    it('rejects a duplicate storage key', async () => {
      await register('uploads/taken.png');

      const error = await failureOf(() => register('uploads/taken.png'));

      expect(error.code).toBe('DUPLICATE_STORAGE_KEY');
    });

    it('rejects a zero-byte asset', async () => {
      const error = await failureOf(() =>
        context.inTransaction(() =>
          assets.register({
            id: newId() as AssetId,
            kind: 'CUSTOMER_UPLOAD',
            classification: 'CUSTOMER_PRIVATE',
            storageKey: 'uploads/empty.png',
            mimeType: 'image/png',
            sizeBytes: 0n,
          }),
        ),
      );

      expect(error.diagnostics.constraint).toBe('ck_assets__size_bytes_positive');
    });

    it('rejects a malformed checksum', async () => {
      const error = await failureOf(() => register('uploads/bad-sum.png', 'not-a-checksum'));

      expect(error.diagnostics.constraint).toBe('ck_assets__checksum_format');
    });

    it('rejects an unknown classification', async () => {
      const error = await failureOf(() =>
        context.inTransaction(() =>
          assets.register({
            id: newId() as AssetId,
            kind: 'CUSTOMER_UPLOAD',
            classification: 'TOP_SECRET' as never,
            storageKey: 'uploads/bad-class.png',
            mimeType: 'image/png',
            sizeBytes: 10n,
          }),
        ),
      );

      expect(error.diagnostics.constraint).toBe('ck_assets__classification_allowed');
    });
  });

  describe('inspection', () => {
    it('accepts an asset and records the evidence', async () => {
      const asset = await register('uploads/accept.png');

      const inspected = await context.inTransaction(() =>
        assets.recordInspection(asset.id, 'ACCEPTED', undefined, new Date()),
      );

      expect(inspected.status).toBe('ACCEPTED');
      await expect(assets.listInspections(asset.id)).resolves.toHaveLength(1);
    });

    it('rejects an asset and records why', async () => {
      const asset = await register('uploads/reject.png');

      const inspected = await context.inTransaction(() =>
        assets.recordInspection(asset.id, 'REJECTED', 'MIME_MISMATCH', new Date()),
      );

      expect(inspected.status).toBe('REJECTED');
      const inspections = await assets.listInspections(asset.id);
      expect(inspections[0]?.detail).toBe('MIME_MISMATCH');
    });

    it('refuses to inspect outside a transaction', async () => {
      const asset = await register('uploads/no-tx.png');

      await expect(
        assets.recordInspection(asset.id, 'ACCEPTED', undefined, new Date()),
      ).rejects.toThrow(/must run inside a transaction/);
    });

    it('rolls the evidence back with the status when the asset does not exist', async () => {
      const ghost = newId() as AssetId;

      await expect(
        context.inTransaction(() =>
          assets.recordInspection(ghost, 'ACCEPTED', undefined, new Date()),
        ),
      ).rejects.toBeDefined();

      // The inspection insert must not survive the failed status update: an
      // orphan inspection would claim an asset was checked that never existed.
      await expect(assets.listInspections(ghost)).resolves.toEqual([]);
    });

    it('keeps a full inspection history, newest first', async () => {
      const asset = await register('uploads/history.png');

      await context.inTransaction(() =>
        assets.recordInspection(asset.id, 'REJECTED', 'FIRST', new Date(Date.now() - 1000)),
      );
      await context.inTransaction(() =>
        assets.recordInspection(asset.id, 'ACCEPTED', 'SECOND', new Date()),
      );

      const inspections = await assets.listInspections(asset.id);
      expect(inspections.map((i) => i.detail)).toEqual(['SECOND', 'FIRST']);
    });
  });

  describe('derivatives', () => {
    it('registers and completes a derivative', async () => {
      const asset = await register('uploads/deriv.png');
      const derivativeId = newId() as AssetDerivativeId;

      await context.inTransaction(() =>
        assets.registerDerivative({
          id: derivativeId,
          assetId: asset.id,
          kind: 'PREVIEW_WATERMARKED',
          isWatermarked: true,
        }),
      );
      const ready = await context.inTransaction(() =>
        assets.completeDerivative(derivativeId, 'derived/preview.png', CHECKSUM),
      );

      expect(ready.status).toBe('READY');
      expect(ready.isWatermarked).toBe(true);
    });

    it('allows only one live derivative per kind', async () => {
      const asset = await register('uploads/one-kind.png');
      await context.inTransaction(() =>
        assets.registerDerivative({
          id: newId() as AssetDerivativeId,
          assetId: asset.id,
          kind: 'MOCKUP',
          isWatermarked: false,
        }),
      );

      const error = await failureOf(() =>
        context.inTransaction(() =>
          assets.registerDerivative({
            id: newId() as AssetDerivativeId,
            assetId: asset.id,
            kind: 'MOCKUP',
            isWatermarked: false,
          }),
        ),
      );

      expect(error.code).toBe('DERIVATIVE_ALREADY_EXISTS');
    });

    it('frees the kind for a retry once a derivative has failed', async () => {
      const asset = await register('uploads/retry.png');
      const first = newId() as AssetDerivativeId;
      await context.inTransaction(() =>
        assets.registerDerivative({
          id: first,
          assetId: asset.id,
          kind: 'THUMBNAIL',
          isWatermarked: false,
        }),
      );

      await context.inTransaction(() => assets.failDerivative(first));

      // The arbiter's predicate excludes failed rows, so the retry is allowed.
      await expect(
        context.inTransaction(() =>
          assets.registerDerivative({
            id: newId() as AssetDerivativeId,
            assetId: asset.id,
            kind: 'THUMBNAIL',
            isWatermarked: false,
          }),
        ),
      ).resolves.toBeDefined();
    });

    it('rejects a derivative of an asset that does not exist', async () => {
      const error = await failureOf(() =>
        context.inTransaction(() =>
          assets.registerDerivative({
            id: newId() as AssetDerivativeId,
            assetId: newId() as AssetId,
            kind: 'MOCKUP',
            isWatermarked: false,
          }),
        ),
      );

      expect(error.kind).toBe('INVALID_REFERENCE');
    });
  });

  describe('tombstone', () => {
    it('marks the asset deleted while keeping its metadata row', async () => {
      const asset = await register('uploads/tombstone.png');

      const tombstoned = await context.inTransaction(() =>
        assets.tombstone(asset.id, 'CUSTOMER_REQUEST', new Date()),
      );

      expect(tombstoned.status).toBe('DELETED');
      expect(tombstoned.deletedAt).toBeInstanceOf(Date);
      // The row survives: audit and retention still need to see what existed.
      await expect(assets.findById(asset.id)).resolves.toBeDefined();
    });

    it('stops the derivatives of a tombstoned asset from staying serveable (INV-22)', async () => {
      const asset = await register('uploads/with-previews.png');
      const previewId = newId() as AssetDerivativeId;
      await context.inTransaction(async () => {
        await assets.registerDerivative({
          id: previewId,
          assetId: asset.id,
          kind: 'PREVIEW_WATERMARKED',
          isWatermarked: true,
        });
        await assets.completeDerivative(previewId, 'derived/preview-live.png', CHECKSUM);
      });

      await context.inTransaction(() => assets.tombstone(asset.id, 'CUSTOMER_REQUEST', new Date()));

      // A READY preview behind a deleted original is exactly the leak the
      // tombstone exists to prevent.
      const derivatives = await assets.listDerivatives(asset.id);
      expect(derivatives.every((d) => d.status !== 'READY')).toBe(true);
    });

    it('refuses to tombstone outside a transaction', async () => {
      const asset = await register('uploads/tombstone-no-tx.png');

      await expect(assets.tombstone(asset.id, 'CUSTOMER_REQUEST', new Date())).rejects.toThrow(
        /must run inside a transaction/,
      );
    });

    it('reports an asset that does not exist', async () => {
      const error = await failureOf(() =>
        context.inTransaction(() =>
          assets.tombstone(newId() as AssetId, 'CUSTOMER_REQUEST', new Date()),
        ),
      );

      expect(error.code).toBe('RECORD_NOT_FOUND');
    });
  });
});
