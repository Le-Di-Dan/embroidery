/**
 * Crash recovery, retry and concurrency (APP2-W01 §21).
 *
 * Every recovered state here is produced through a **real failure seam** — a
 * store that refuses a write, a terminal transaction that dies, a deadline that
 * fires — rather than by hand-writing the rows a crash is imagined to leave.
 * Hand-written state proves the recovery code handles a situation; a real seam
 * proves it handles the situation the system actually produces.
 */
import { Readable } from 'node:stream';
import { sql } from '@embroidery/database';
import { ObjectStorageError, type ObjectStoragePort } from '@embroidery/object-storage';

import type {
  AssetInspectionRepository,
  FinalizeAcceptedInput,
} from '../domain/repositories/asset-inspection.repository';
import { WorkerJobError } from '../../../runtime/errors/worker-job-error';
import {
  startAssetInspectionContext,
  type AssetInspectionContext,
  type SeededAsset,
} from './asset-inspection-context';
import { checksumOf, pngWithAlpha } from './image-fixtures';

interface DerivativeRow extends Record<string, unknown> {
  kind: string;
  status: string;
  storage_key: string | null;
  checksum: string | null;
}

/** A port whose derivative uploads always fail. Reads still work. */
function uploadRefusingPort(port: ObjectStoragePort): ObjectStoragePort {
  return {
    ...port,
    getObjectStream: port.getObjectStream.bind(port),
    headObject: port.headObject.bind(port),
    deleteObject: port.deleteObject.bind(port),
    listObjectsByPrefix: port.listObjectsByPrefix.bind(port),
    ensurePrivateBuckets: port.ensurePrivateBuckets.bind(port),
    putObjectStream: () =>
      Promise.reject(new ObjectStorageError('PROVIDER_UNAVAILABLE', 'Object storage put failed.')),
  };
}

/** A repository that does the real work and then loses the terminal write. */
function crashingAfterUploadRepository(
  repository: AssetInspectionRepository,
): AssetInspectionRepository {
  return {
    prepareOrRecover: repository.prepareOrRecover.bind(repository),
    loadProcessingSnapshot: repository.loadProcessingSnapshot.bind(repository),
    finalizeRejected: repository.finalizeRejected.bind(repository),
    loadTerminalEffect: repository.loadTerminalEffect.bind(repository),
    finalizeAccepted: (_input: FinalizeAcceptedInput): Promise<void> =>
      Promise.reject(
        new WorkerJobError('JOB_TRANSIENT_FAILURE', 'Terminal transaction lost the connection.'),
      ),
  };
}

describe('asset inspection — recovery and concurrency (live PostgreSQL + MinIO)', () => {
  let context: AssetInspectionContext;

  beforeAll(async () => {
    context = await startAssetInspectionContext('w01-recovery');
  }, 600_000);

  afterAll(async () => {
    await context?.close();
  }, 300_000);

  function derivatives(assetId: string): Promise<DerivativeRow[]> {
    return context.query<DerivativeRow>(sql`
      select kind, status, storage_key, checksum
        from asset_derivatives where asset_id = ${assetId} order by kind
    `);
  }

  function status(assetId: string): Promise<{ status: string }[]> {
    return context.query<{ status: string }>(sql`select status from assets where id = ${assetId}`);
  }

  function inspections(assetId: string): Promise<{ outcome: string }[]> {
    return context.query<{ outcome: string }>(
      sql`select outcome from asset_inspections where asset_id = ${assetId}`,
    );
  }

  function prefixOf(assetId: string): string {
    return `test/derivatives/${assetId}/`;
  }

  function objects(assetId: string): Promise<readonly { key: string }[]> {
    return context.storage.listObjectsByPrefix({
      bucket: 'DERIVATIVES',
      prefix: prefixOf(assetId),
    });
  }

  async function inspect(seeded: SeededAsset, attemptNo = 1): Promise<void> {
    await context.useCase.inspect(
      { assetId: seeded.assetId, attemptNo },
      new AbortController().signal,
    );
  }

  it('leaves the asset INSPECTING and both rows PROCESSING when the first write fails', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(600, 400));
    const useCase = context.buildUseCase({ storage: uploadRefusingPort(context.storage) });

    await expect(
      useCase.inspect({ assetId: seeded.assetId, attemptNo: 1 }, new AbortController().signal),
    ).rejects.toBeInstanceOf(WorkerJobError);

    expect(await status(seeded.assetId)).toEqual([{ status: 'INSPECTING' }]);
    expect((await derivatives(seeded.assetId)).map((row) => row.status)).toEqual([
      'PROCESSING',
      'PROCESSING',
    ]);
    expect(await inspections(seeded.assetId)).toEqual([]);
  });

  it('succeeds on retry without creating duplicate rows', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(600, 400));
    const failing = context.buildUseCase({ storage: uploadRefusingPort(context.storage) });
    await expect(
      failing.inspect({ assetId: seeded.assetId, attemptNo: 1 }, new AbortController().signal),
    ).rejects.toBeInstanceOf(WorkerJobError);

    await inspect(seeded, 2);

    const rows = await derivatives(seeded.assetId);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === 'READY')).toBe(true);
    expect(await status(seeded.assetId)).toEqual([{ status: 'ACCEPTED' }]);
    expect(await inspections(seeded.assetId)).toHaveLength(1);
  });

  it('cleans a partial output before writing its replacement', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(500, 500));
    // A complete THUMBNAIL and no preview: exactly what a crash between the two
    // uploads leaves behind.
    await context.transactions.runInTransaction(() =>
      context.repository.prepareOrRecover({
        assetId: seeded.assetId,
        at: new Date(),
        expectedKeys: {
          THUMBNAIL: `${prefixOf(seeded.assetId)}THUMBNAIL.webp`,
          CATALOG_PREVIEW: `${prefixOf(seeded.assetId)}CATALOG_PREVIEW.webp`,
        },
      }),
    );
    const stale = Buffer.from('bytes from an attempt that never finished');
    await context.storage.putObjectStream({
      bucket: 'DERIVATIVES',
      key: `${prefixOf(seeded.assetId)}THUMBNAIL.webp`,
      body: Readable.from([stale]),
      contentType: 'image/webp',
    });

    await inspect(seeded, 2);

    const rows = await derivatives(seeded.assetId);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === 'READY')).toBe(true);
    expect(rows.map((row) => row.checksum)).not.toContain(checksumOf(stale));
    expect(await objects(seeded.assetId)).toHaveLength(2);
  });

  it('converges after a crash that committed only the preparation transaction', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(700, 300));
    await context.transactions.runInTransaction(() =>
      context.repository.prepareOrRecover({
        assetId: seeded.assetId,
        at: new Date(),
        expectedKeys: {
          THUMBNAIL: `${prefixOf(seeded.assetId)}THUMBNAIL.webp`,
          CATALOG_PREVIEW: `${prefixOf(seeded.assetId)}CATALOG_PREVIEW.webp`,
        },
      }),
    );

    await inspect(seeded, 2);

    expect(await status(seeded.assetId)).toEqual([{ status: 'ACCEPTED' }]);
    expect(await derivatives(seeded.assetId)).toHaveLength(2);
    expect(await inspections(seeded.assetId)).toHaveLength(1);
  });

  it('converges after a crash between the last upload and the terminal transaction', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(900, 600));
    const crashing = context.buildUseCase({
      repository: crashingAfterUploadRepository(context.repository),
    });
    await expect(
      crashing.inspect({ assetId: seeded.assetId, attemptNo: 1 }, new AbortController().signal),
    ).rejects.toBeInstanceOf(WorkerJobError);
    // Both objects exist, no row points at them, no inspection was written.
    expect(await objects(seeded.assetId)).toHaveLength(2);
    expect(await inspections(seeded.assetId)).toEqual([]);

    await inspect(seeded, 2);

    expect(await status(seeded.assetId)).toEqual([{ status: 'ACCEPTED' }]);
    expect(await inspections(seeded.assetId)).toHaveLength(1);
    for (const row of await derivatives(seeded.assetId)) {
      const result = await context.storage.getObjectStream({
        bucket: 'DERIVATIVES',
        key: row.storage_key ?? '',
      });
      const chunks: Buffer[] = [];
      for await (const chunk of result.body) {
        chunks.push(Buffer.from(chunk as Uint8Array));
      }
      // The row and the object agree, which is the property the replacement
      // write exists to restore.
      expect(row.checksum).toBe(checksumOf(Buffer.concat(chunks)));
    }
  });

  it('produces exactly one terminal effect under concurrent execution', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(800, 800));

    const results = await Promise.allSettled([
      inspect(seeded, 1),
      inspect(seeded, 1),
      inspect(seeded, 1),
    ]);

    // Some attempts may lose the race and throw; none may produce a second
    // effect. At least one must have succeeded.
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    expect(await status(seeded.assetId)).toEqual([{ status: 'ACCEPTED' }]);
    expect(await inspections(seeded.assetId)).toHaveLength(1);
    const rows = await derivatives(seeded.assetId);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === 'READY')).toBe(true);
    expect(await objects(seeded.assetId)).toHaveLength(2);
  });

  // `APP3-S06` added a second lane, so the fact this asserts is now narrower and
  // stronger: the kind/classification **pair** is what selects a lane, and this
  // asset carries `CUSTOMER_UPLOAD` with the catalogue classification — a pair no
  // delivered checkpoint writes and no lane owns.
  it('mutates nothing for an asset whose kind and classification match no lane', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(200, 200), {
      kind: 'CUSTOMER_UPLOAD',
    });

    await expect(inspect(seeded)).rejects.toMatchObject({
      errorClass: 'JOB_INVARIANT_VIOLATION',
    });

    expect(await status(seeded.assetId)).toEqual([{ status: 'INSPECTING' }]);
    expect(await derivatives(seeded.assetId)).toEqual([]);
    expect(await inspections(seeded.assetId)).toEqual([]);
    expect(await objects(seeded.assetId)).toEqual([]);
  });

  it('mutates nothing for an asset in a non-inspectable state', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(200, 200), { status: 'UPLOADED' });

    await expect(inspect(seeded)).rejects.toMatchObject({
      errorClass: 'JOB_INVARIANT_VIOLATION',
    });

    expect(await status(seeded.assetId)).toEqual([{ status: 'UPLOADED' }]);
    expect(await derivatives(seeded.assetId)).toEqual([]);
  });

  it('closes its pipelines and writes nothing when the attempt deadline fires', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(3000, 3000));
    const controller = new AbortController();

    const attempt = context.useCase.inspect(
      { assetId: seeded.assetId, attemptNo: 1 },
      controller.signal,
    );
    controller.abort();

    await expect(attempt).rejects.toBeInstanceOf(WorkerJobError);
    expect(await status(seeded.assetId)).toEqual([{ status: 'INSPECTING' }]);
    expect((await derivatives(seeded.assetId)).every((row) => row.status !== 'READY')).toBe(true);
    expect(await inspections(seeded.assetId)).toEqual([]);
  });

  it('converges after an aborted attempt', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(1500, 1000));
    const controller = new AbortController();
    const attempt = context.useCase.inspect(
      { assetId: seeded.assetId, attemptNo: 1 },
      controller.signal,
    );
    controller.abort();
    await expect(attempt).rejects.toBeInstanceOf(WorkerJobError);

    await inspect(seeded, 2);

    expect(await status(seeded.assetId)).toEqual([{ status: 'ACCEPTED' }]);
    expect(await objects(seeded.assetId)).toHaveLength(2);
  });
});
