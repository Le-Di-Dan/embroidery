/**
 * The accepted path, against a real PostgreSQL and a real MinIO (APP2-W01 §21).
 *
 * Every assertion reads the durable state — rows constrained by the real
 * CHECKs, the real partial unique index and the real append-only trigger, and
 * objects fetched back out of the store and decoded. Nothing is inferred from a
 * return value.
 */
import sharp from 'sharp';
import { sql } from '@embroidery/database';

import { decodeInspectionDetail } from '../domain/inspection-detail.codec';
import {
  startAssetInspectionContext,
  type AssetInspectionContext,
  type SeededAsset,
} from './asset-inspection-context';
import {
  checksumOf,
  exifRotatedJpeg,
  jpeg,
  pngWithAlpha,
  staticWebp,
  tinyPng,
} from './image-fixtures';

interface DerivativeRow extends Record<string, unknown> {
  kind: string;
  status: string;
  storage_key: string | null;
  checksum: string | null;
  is_watermarked: boolean;
}

describe('asset inspection — accepted (live PostgreSQL + MinIO)', () => {
  let context: AssetInspectionContext;
  let signal: AbortSignal;

  beforeAll(async () => {
    context = await startAssetInspectionContext('w01-accepted');
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
      select kind, status, storage_key, checksum, is_watermarked
        from asset_derivatives where asset_id = ${assetId} order by kind
    `);
  }

  function assetStatus(assetId: string): Promise<{ status: string }[]> {
    return context.query<{ status: string }>(sql`select status from assets where id = ${assetId}`);
  }

  function inspections(assetId: string): Promise<{ outcome: string; detail: string | null }[]> {
    return context.query<{ outcome: string; detail: string | null }>(sql`
      select outcome, detail from asset_inspections where asset_id = ${assetId} order by id
    `);
  }

  async function fetchDerivative(key: string): Promise<Buffer> {
    const result = await context.storage.getObjectStream({ bucket: 'DERIVATIVES', key });
    const chunks: Buffer[] = [];
    for await (const chunk of result.body) {
      chunks.push(Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks);
  }

  it('accepts a PNG', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(1200, 800));

    await inspect(seeded);

    expect(await assetStatus(seeded.assetId)).toEqual([{ status: 'ACCEPTED' }]);
  });

  it('accepts a JPEG', async () => {
    const seeded = await context.seedAsset(await jpeg(900, 600));

    await inspect(seeded);

    expect(await assetStatus(seeded.assetId)).toEqual([{ status: 'ACCEPTED' }]);
  });

  it('accepts a static WebP', async () => {
    const seeded = await context.seedAsset(await staticWebp(640, 480));

    await inspect(seeded);

    expect(await assetStatus(seeded.assetId)).toEqual([{ status: 'ACCEPTED' }]);
  });

  it('creates exactly two derivative rows, both READY and unwatermarked', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(1000, 750));

    await inspect(seeded);
    const rows = await derivatives(seeded.assetId);

    expect(rows.map((row) => row.kind)).toEqual(['CATALOG_PREVIEW', 'THUMBNAIL']);
    expect(rows.every((row) => row.status === 'READY')).toBe(true);
    expect(rows.every((row) => row.is_watermarked === false)).toBe(true);
  });

  it('points both rows at their deterministic private keys', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(800, 800));

    await inspect(seeded);
    const rows = await derivatives(seeded.assetId);

    expect(rows.map((row) => row.storage_key)).toEqual([
      `test/derivatives/${seeded.assetId}/CATALOG_PREVIEW.webp`,
      `test/derivatives/${seeded.assetId}/THUMBNAIL.webp`,
    ]);
  });

  it('stores both objects, and both decode as WebP', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(1600, 900));

    await inspect(seeded);
    const rows = await derivatives(seeded.assetId);

    for (const row of rows) {
      const bytes = await fetchDerivative(row.storage_key ?? '');
      expect((await sharp(bytes).metadata()).format).toBe('webp');
    }
  });

  it('records checksums that match the stored bytes', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(700, 500));

    await inspect(seeded);

    for (const row of await derivatives(seeded.assetId)) {
      const bytes = await fetchDerivative(row.storage_key ?? '');
      expect(row.checksum).toBe(checksumOf(bytes));
    }
  });

  it('keeps both outputs inside their bounding boxes', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(4000, 3000));

    await inspect(seeded);
    const detail = decodeInspectionDetail((await inspections(seeded.assetId))[0]?.detail ?? null);
    const recorded = detail?.result === 'ACCEPTED' ? detail.derivatives : [];

    expect(recorded.find((entry) => entry.kind === 'THUMBNAIL')).toMatchObject({
      width: 480,
      height: 360,
    });
    expect(recorded.find((entry) => entry.kind === 'CATALOG_PREVIEW')).toMatchObject({
      width: 1920,
      height: 1440,
    });
  });

  it('does not enlarge a source smaller than either box', async () => {
    const seeded = await context.seedAsset(await tinyPng());

    await inspect(seeded);

    for (const row of await derivatives(seeded.assetId)) {
      const output = await sharp(await fetchDerivative(row.storage_key ?? '')).metadata();
      expect({ width: output.width, height: output.height }).toEqual({ width: 40, height: 30 });
    }
  });

  it('applies EXIF orientation to both outputs', async () => {
    const seeded = await context.seedAsset(await exifRotatedJpeg(200, 100));

    await inspect(seeded);

    for (const row of await derivatives(seeded.assetId)) {
      const output = await sharp(await fetchDerivative(row.storage_key ?? '')).metadata();
      // Stored 200×100 with orientation 6, so a viewer sees 100×200.
      expect({ width: output.width, height: output.height }).toEqual({ width: 100, height: 200 });
    }
  });

  it('strips every metadata block from the stored objects', async () => {
    const seeded = await context.seedAsset(await exifRotatedJpeg(400, 300));

    await inspect(seeded);

    for (const row of await derivatives(seeded.assetId)) {
      const output = await sharp(await fetchDerivative(row.storage_key ?? '')).metadata();
      expect(output.exif).toBeUndefined();
      expect(output.icc).toBeUndefined();
      expect(output.xmp).toBeUndefined();
      expect(output.iptc).toBeUndefined();
    }
  });

  it('preserves alpha', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(500, 500));

    await inspect(seeded);

    for (const row of await derivatives(seeded.assetId)) {
      const output = await sharp(await fetchDerivative(row.storage_key ?? '')).metadata();
      expect(output.hasAlpha).toBe(true);
    }
  });

  it('appends exactly one ACCEPTED inspection carrying the V1 detail', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(600, 400));

    await inspect(seeded);
    const rows = await inspections(seeded.assetId);
    const detail = decodeInspectionDetail(rows[0]?.detail ?? null);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.outcome).toBe('ACCEPTED');
    expect(detail).toMatchObject({
      schemaVersion: 1,
      policyVersion: 1,
      result: 'ACCEPTED',
      processor: { name: 'sharp', version: sharp.versions.sharp },
    });
  });

  it('records the re-verified source facts in the detail', async () => {
    const image = await pngWithAlpha(1200, 800);
    const seeded = await context.seedAsset(image);

    await inspect(seeded);
    const detail = decodeInspectionDetail((await inspections(seeded.assetId))[0]?.detail ?? null);

    expect(detail?.result === 'ACCEPTED' && detail.source).toEqual({
      mediaType: 'image/png',
      format: 'png',
      byteSize: image.byteSize,
      checksum: image.checksum,
      width: 1200,
      height: 800,
      orientedWidth: 1200,
      orientedHeight: 800,
      channels: 4,
      pages: 1,
    });
  });

  it('writes nothing on an accepted replay', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(400, 400));
    await inspect(seeded);
    const before = {
      derivatives: await derivatives(seeded.assetId),
      inspections: await inspections(seeded.assetId),
      objects: await Promise.all(
        (await derivatives(seeded.assetId)).map((row) => fetchDerivative(row.storage_key ?? '')),
      ),
    };

    await inspect(seeded, 2);

    expect(await derivatives(seeded.assetId)).toEqual(before.derivatives);
    expect(await inspections(seeded.assetId)).toEqual(before.inspections);
    const after = await Promise.all(
      before.derivatives.map((row) => fetchDerivative(row.storage_key ?? '')),
    );
    expect(after.map((bytes) => checksumOf(bytes))).toEqual(
      before.objects.map((bytes) => checksumOf(bytes)),
    );
  });

  it('leaves the private original in place', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(300, 300));

    await inspect(seeded);

    await expect(
      context.storage.headObject({ bucket: 'ORIGINALS', key: seeded.originalKey }),
    ).resolves.toMatchObject({ key: seeded.originalKey });
  });

  it('appends no second outbox event', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(300, 300));

    await inspect(seeded);

    // The handler's own success is recorded by the I02 runtime; the handler
    // must not enqueue anything of its own.
    expect(
      await context.query(sql`select id from outbox_events where aggregate_id = ${seeded.assetId}`),
    ).toEqual([]);
  });
});
