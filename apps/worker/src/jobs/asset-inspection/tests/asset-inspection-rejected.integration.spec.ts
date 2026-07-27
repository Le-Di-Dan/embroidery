/**
 * The rejection path, against a real PostgreSQL and a real MinIO (APP2-W01 §21).
 *
 * An unpublishable image is a *business outcome*: the record is written, the
 * job returns normally, and no operator is paged for a file no operator can
 * fix. These cases prove that ending is durable and complete — and that the
 * original binary survives it, because a rejection is a verdict about
 * publication, not a deletion.
 */
import { sql } from '@embroidery/database';
import { ObjectStorageError, type ObjectStoragePort } from '@embroidery/object-storage';

import { decodeInspectionDetail } from '../domain/inspection-detail.codec';
import {
  INTEGRATION_POLICY,
  startAssetInspectionContext,
  type AssetInspectionContext,
  type SeededAsset,
} from './asset-inspection-context';
import {
  animatedWebp,
  garbage,
  jpeg,
  overDimensionLimitPng,
  overPixelLimitPng,
  pngWithAlpha,
  truncatedPng,
} from './image-fixtures';

interface DerivativeRow extends Record<string, unknown> {
  kind: string;
  status: string;
  storage_key: string | null;
}

/** A port that behaves normally except for the operations named. */
function failingPort(port: ObjectStoragePort, failures: Set<'list' | 'delete'>): ObjectStoragePort {
  return {
    ...port,
    putObjectStream: port.putObjectStream.bind(port),
    getObjectStream: port.getObjectStream.bind(port),
    headObject: port.headObject.bind(port),
    ensurePrivateBuckets: port.ensurePrivateBuckets.bind(port),
    listObjectsByPrefix: (input) =>
      failures.has('list')
        ? Promise.reject(
            new ObjectStorageError('PROVIDER_UNAVAILABLE', 'Object storage list failed.'),
          )
        : port.listObjectsByPrefix(input),
    deleteObject: (reference, signal) =>
      failures.has('delete')
        ? Promise.reject(
            new ObjectStorageError('PROVIDER_UNAVAILABLE', 'Object storage delete failed.'),
          )
        : port.deleteObject(reference, signal),
  };
}

describe('asset inspection — rejected (live PostgreSQL + MinIO)', () => {
  let context: AssetInspectionContext;
  let signal: AbortSignal;

  beforeAll(async () => {
    context = await startAssetInspectionContext('w01-rejected');
  }, 600_000);

  afterAll(async () => {
    await context?.close();
  }, 300_000);

  beforeEach(() => {
    signal = new AbortController().signal;
  });

  async function inspect(seeded: SeededAsset, attemptNo = 1): Promise<void> {
    await context.useCase.inspect({ assetId: seeded.assetId, attemptNo }, signal);
  }

  function derivatives(assetId: string): Promise<DerivativeRow[]> {
    return context.query<DerivativeRow>(sql`
      select kind, status, storage_key from asset_derivatives where asset_id = ${assetId} order by kind
    `);
  }

  function inspections(assetId: string): Promise<{ outcome: string; detail: string | null }[]> {
    return context.query<{ outcome: string; detail: string | null }>(sql`
      select outcome, detail from asset_inspections where asset_id = ${assetId} order by id
    `);
  }

  function status(assetId: string): Promise<{ status: string }[]> {
    return context.query<{ status: string }>(sql`select status from assets where id = ${assetId}`);
  }

  async function rejectionCode(seeded: SeededAsset, attemptNo = 1): Promise<string | undefined> {
    await inspect(seeded, attemptNo);
    const detail = decodeInspectionDetail((await inspections(seeded.assetId))[0]?.detail ?? null);
    return detail?.result === 'REJECTED' ? detail.rejectionCode : undefined;
  }

  it('rejects a source whose recorded size disagrees with the object', async () => {
    const image = await pngWithAlpha(400, 300);
    const seeded = await context.seedAsset(image, { sizeBytes: BigInt(image.byteSize + 17) });

    await expect(rejectionCode(seeded)).resolves.toBe('ORIGINAL_INTEGRITY_MISMATCH');
  });

  it('rejects a source whose recorded checksum disagrees with the bytes', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(400, 300), {
      checksum: `sha256:${'0'.repeat(64)}`,
    });

    await expect(rejectionCode(seeded)).resolves.toBe('ORIGINAL_INTEGRITY_MISMATCH');
  });

  it('rejects a source that decodes as a different format than recorded', async () => {
    const image = await jpeg(200, 200);
    // Registered as PNG; the bytes are a JPEG.
    const seeded = await context.seedAsset({ ...image, mediaType: 'image/png' });

    await expect(rejectionCode(seeded)).resolves.toBe('SOURCE_MEDIA_TYPE_MISMATCH');
  });

  it('rejects a truncated original at the decode stage', async () => {
    // The recorded size and checksum match the truncated bytes exactly, so
    // integrity passes and the failure is genuinely a decode failure.
    const seeded = await context.seedAsset(await truncatedPng());

    await expect(rejectionCode(seeded)).resolves.toBe('DECODE_FAILED');
  });

  it('rejects an object that is not an image at all', async () => {
    const seeded = await context.seedAsset(garbage());

    await expect(rejectionCode(seeded)).resolves.toBe('DECODE_FAILED');
  });

  it('rejects an animated WebP', async () => {
    const seeded = await context.seedAsset(await animatedWebp());

    await expect(rejectionCode(seeded)).resolves.toBe('ANIMATED_IMAGE_UNSUPPORTED');
  });

  it('rejects a source over the 40-megapixel ceiling', async () => {
    const seeded = await context.seedAsset(await overPixelLimitPng());

    await expect(rejectionCode(seeded)).resolves.toBe('PIXEL_LIMIT_EXCEEDED');
  });

  it('rejects a source wider than 12,000 pixels', async () => {
    const seeded = await context.seedAsset(await overDimensionLimitPng());

    await expect(rejectionCode(seeded)).resolves.toBe('DIMENSION_LIMIT_EXCEEDED');
  });

  it('leaves the asset REJECTED with exactly one inspection', async () => {
    const seeded = await context.seedAsset(garbage());

    await inspect(seeded);

    expect(await status(seeded.assetId)).toEqual([{ status: 'REJECTED' }]);
    expect(await inspections(seeded.assetId)).toHaveLength(1);
    expect((await inspections(seeded.assetId))[0]?.outcome).toBe('REJECTED');
  });

  it('fails both prepared derivative rows and exposes no READY reference', async () => {
    const seeded = await context.seedAsset(garbage());

    await inspect(seeded);
    const rows = await derivatives(seeded.assetId);

    expect(rows.map((row) => row.kind)).toEqual(['CATALOG_PREVIEW', 'THUMBNAIL']);
    expect(rows.every((row) => row.status === 'FAILED')).toBe(true);
    expect(rows.every((row) => row.storage_key === null)).toBe(true);
  });

  it('retains the private original', async () => {
    const seeded = await context.seedAsset(garbage());

    await inspect(seeded);

    // The verdict is about publication, not about deletion: retention and
    // tombstoning are a separate lifecycle nobody has asked this job to run.
    await expect(
      context.storage.headObject({ bucket: 'ORIGINALS', key: seeded.originalKey }),
    ).resolves.toMatchObject({ key: seeded.originalKey });
  });

  it('leaves no derivative object behind', async () => {
    const seeded = await context.seedAsset(garbage());

    await inspect(seeded);

    expect(
      await context.storage.listObjectsByPrefix({
        bucket: 'DERIVATIVES',
        prefix: `test/derivatives/${seeded.assetId}/`,
      }),
    ).toEqual([]);
  });

  it('writes nothing on a rejected replay', async () => {
    const seeded = await context.seedAsset(garbage());
    await inspect(seeded);
    const before = {
      derivatives: await derivatives(seeded.assetId),
      inspections: await inspections(seeded.assetId),
    };

    await inspect(seeded, 2);

    expect(await derivatives(seeded.assetId)).toEqual(before.derivatives);
    expect(await inspections(seeded.assetId)).toEqual(before.inspections);
  });

  it('rejects with PROCESSING_RETRY_EXHAUSTED on the final attempt', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(300, 300));
    // A store whose listing is down makes the *cleanup* verification fail, and
    // the recovered path runs it before anything else.
    const useCase = context.buildUseCase({
      storage: failingPort(context.storage, new Set(['list'])),
    });
    await context.transactions.runInTransaction(() =>
      context.repository.prepareOrRecover({
        assetId: seeded.assetId,
        at: new Date(),
        expectedKeys: {
          THUMBNAIL: `test/derivatives/${seeded.assetId}/THUMBNAIL.webp`,
          CATALOG_PREVIEW: `test/derivatives/${seeded.assetId}/CATALOG_PREVIEW.webp`,
        },
      }),
    );

    await useCase.inspect(
      { assetId: seeded.assetId, attemptNo: INTEGRATION_POLICY.maxAttempts },
      signal,
    );
    const detail = decodeInspectionDetail((await inspections(seeded.assetId))[0]?.detail ?? null);

    expect(detail?.result === 'REJECTED' && detail.rejectionCode).toBe(
      'PROCESSING_RETRY_EXHAUSTED',
    );
    expect(await status(seeded.assetId)).toEqual([{ status: 'REJECTED' }]);
  });

  it('records cleanupPending when the final cleanup cannot complete', async () => {
    const seeded = await context.seedAsset(garbage());
    const useCase = context.buildUseCase({
      storage: failingPort(context.storage, new Set(['list'])),
    });

    await useCase.inspect({ assetId: seeded.assetId, attemptNo: 1 }, signal);
    const row = (await inspections(seeded.assetId))[0];
    const detail = decodeInspectionDetail(row?.detail ?? null);

    expect(detail?.result === 'REJECTED' && detail.cleanupPending).toBe(true);
    // The record says bytes may remain; it does not say where they are.
    expect(row?.detail).not.toContain(seeded.assetId);
    expect(row?.detail).not.toContain('derivatives');
    expect(row?.detail).not.toContain('.webp');
  });

  it('keeps the rejection detail free of keys, filenames and native errors', async () => {
    const seeded = await context.seedAsset(garbage());

    await inspect(seeded);
    const detail = (await inspections(seeded.assetId))[0]?.detail ?? '';

    for (const forbidden of ['originals', 'derivatives', seeded.originalKey, 'vips', 'libpng']) {
      expect(detail.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('keeps asset_inspections append-only', async () => {
    const seeded = await context.seedAsset(garbage());
    await inspect(seeded);

    // Migration 0030's `trg_asset_inspections__reject_mutation` is mode
    // `always`, so evidence cannot be edited or erased even by this suite.
    await expect(
      context.query(
        sql`update asset_inspections set outcome = 'ACCEPTED' where asset_id = ${seeded.assetId}`,
      ),
    ).rejects.toThrow();
    await expect(
      context.query(sql`delete from asset_inspections where asset_id = ${seeded.assetId}`),
    ).rejects.toThrow();
  });
});
