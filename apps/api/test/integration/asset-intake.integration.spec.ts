/**
 * APP2-B01 §25 cases 1-16 — the accepted paths, the rejections, and idempotency,
 * against real PostgreSQL and real MinIO.
 *
 * These prove what unit tests cannot: that the durable state after each path is
 * the state the contract promises. Every assertion reads the database or the
 * object store, never an in-memory double.
 *
 * Cases 17-30 (resumption, reclaim, cleanup ordering, abort and residue) live in
 * `asset-intake-lifecycle.integration.spec.ts`.
 *
 * Docker-only, and excluded from `pnpm test` / `pnpm quality`.
 * Run with `pnpm test:asset-intake:integration`.
 */
import { MAX_UPLOAD_BYTES } from '../../src/modules/asset/domain/asset-intake.policy';
import type { AssetId } from '../../src/modules/asset/domain/repositories/asset.repository';
import {
  createAssetIntakeContext,
  type AssetIntakeTestContext,
} from '../support/asset-intake-context';
import { codeOf, intakeReaders, keyFactory } from '../support/asset-intake-fixtures';
import { jpegBytes, pngBytes, svgBytes, webpBytes } from '../support/synthetic-images';

let context: AssetIntakeTestContext;

const { upload, idempotencyRows, rowForAsset, outboxFor, objectExists, listOriginals } =
  intakeReaders(() => context);
const nextKey = keyFactory('b01');

beforeAll(async () => {
  context = await createAssetIntakeContext('app2-b01-intake');
}, 240_000);

afterAll(async () => {
  await context?.close();
}, 120_000);

// ---------------------------------------------------------------------------
// Cases 1-8 — the accepted paths
// ---------------------------------------------------------------------------

describe('accepted uploads', () => {
  it('case 1-4-5-7: a PNG upload lands, becomes INSPECTING, emits one intent, stores one private object', async () => {
    const bytes = pngBytes(4096);
    const receipt = await upload({ key: nextKey('png'), bytes });

    expect(receipt.mediaType).toBe('image/png');
    expect(receipt.byteSize).toBe(bytes.length);
    expect(receipt.kind).toBe('CATALOG_MEDIA');
    expect(receipt.classification).toBe('PRODUCTION_SENSITIVE');
    // Case 4 — the asset is truthfully handed to inspection.
    expect(receipt.status).toBe('INSPECTING');

    const asset = await context.assets.findById(receipt.assetId as AssetId);
    expect(asset?.status).toBe('INSPECTING');
    expect(asset?.checksum).toBe(receipt.checksum);

    // Case 5 — exactly one inspection intent.
    const events = await outboxFor(receipt.assetId);
    expect(events).toHaveLength(1);
    expect(events[0]?.event_type).toBe('asset.inspection.requested');
    expect(events[0]?.payload).toEqual({ schemaVersion: 1, assetId: receipt.assetId });

    // Case 7 — deterministic key, private bucket.
    const expectedKey = `test/originals/${receipt.assetId}/original.png`;
    expect(asset?.storageKey).toBe(expectedKey);
    expect(await objectExists('ORIGINALS', expectedKey)).toBe(true);
  }, 120_000);

  it('case 2: a JPEG upload succeeds and keys on .jpg', async () => {
    const receipt = await upload({
      key: nextKey('jpeg'),
      bytes: jpegBytes(2048),
      mediaType: 'image/jpeg',
      filename: 'photo.jpg',
    });
    expect(receipt.mediaType).toBe('image/jpeg');
    const asset = await context.assets.findById(receipt.assetId as AssetId);
    expect(asset?.storageKey).toBe(`test/originals/${receipt.assetId}/original.jpg`);
    expect(await objectExists('ORIGINALS', asset?.storageKey ?? '')).toBe(true);
  }, 120_000);

  it('case 3: a WebP upload succeeds', async () => {
    const receipt = await upload({
      key: nextKey('webp'),
      bytes: webpBytes(2048),
      mediaType: 'image/webp',
      filename: 'banner.webp',
    });
    expect(receipt.mediaType).toBe('image/webp');
    expect(await objectExists('ORIGINALS', `test/originals/${receipt.assetId}/original.webp`)).toBe(
      true,
    );
  }, 120_000);

  it('case 6: the stored completed result is strict, internal and never returned verbatim', async () => {
    const receipt = await upload({ key: nextKey('result'), bytes: pngBytes(1024) });
    const row = await rowForAsset(receipt.assetId);

    expect(row.status).toBe('COMPLETED');
    expect(row.result).toMatchObject({
      schemaVersion: 1,
      kind: 'ASSET_UPLOAD_COMPLETED',
      assetId: receipt.assetId,
      bucketAlias: 'ORIGINALS',
      assetStatus: 'INSPECTING',
    });
    expect(row.result?.['contentFingerprint']).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(row.result?.['inspectionEventId']).toMatch(/^[1-9][0-9]*$/);

    // The internal fields must not have reached the client.
    const published = JSON.stringify(receipt);
    for (const field of ['objectKey', 'claimToken', 'contentFingerprint', 'inspectionEventId']) {
      expect(published).not.toContain(field);
    }
    // The raw idempotency key is never stored.
    expect(JSON.stringify(row)).not.toContain('b01-result-');
  }, 120_000);

  it('case 8: a file of exactly 25 MiB is accepted', async () => {
    const bytes = pngBytes(MAX_UPLOAD_BYTES);
    expect(bytes.length).toBe(MAX_UPLOAD_BYTES);
    const receipt = await upload({ key: nextKey('max'), bytes });
    expect(receipt.byteSize).toBe(MAX_UPLOAD_BYTES);
  }, 240_000);
});

// ---------------------------------------------------------------------------
// Cases 9-11 — rejections that must leave nothing behind
// ---------------------------------------------------------------------------

describe('rejected uploads leave no durable trace', () => {
  it('case 9: the first byte over the limit is rejected and no object is completed', async () => {
    const before = (await idempotencyRows()).length;
    const key = nextKey('oversize');
    expect(await codeOf(() => upload({ key, bytes: pngBytes(MAX_UPLOAD_BYTES + 1) }))).toBe(
      'ASSET_UPLOAD_TOO_LARGE',
    );

    // The claim was written before streaming, so it exists — but it is still
    // IN_PROGRESS with no asset and no object.
    const rows = await idempotencyRows();
    expect(rows).toHaveLength(before + 1);
    const claim = rows[rows.length - 1];
    expect(claim?.status).toBe('IN_PROGRESS');

    const assetId = String(claim?.result?.['assetId']);
    expect(await context.assets.findById(assetId as AssetId)).toBeUndefined();
    const remaining = await listOriginals(assetId);
    expect(remaining).toEqual([]);
  }, 240_000);

  it('case 10: SVG is rejected before any claim or object exists', async () => {
    const before = (await idempotencyRows()).length;
    expect(
      await codeOf(() =>
        upload({
          key: nextKey('svg'),
          bytes: svgBytes(),
          mediaType: 'image/svg+xml',
          filename: 'logo.svg',
        }),
      ),
    ).toBe('ASSET_UPLOAD_MEDIA_UNSUPPORTED');
    // The declared type is rejected before the claim transaction runs.
    expect(await idempotencyRows()).toHaveLength(before);
  }, 120_000);

  it('case 11: a declared/signature mismatch is rejected before any object write', async () => {
    const key = nextKey('mismatch');
    expect(await codeOf(() => upload({ key, bytes: svgBytes(), mediaType: 'image/png' }))).toBe(
      'ASSET_UPLOAD_SIGNATURE_MISMATCH',
    );

    const rows = await idempotencyRows();
    const claim = rows[rows.length - 1];
    const assetId = String(claim?.result?.['assetId']);
    expect(await listOriginals(assetId)).toEqual([]);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// Cases 12-15 — duplicate, conflict and replay
// ---------------------------------------------------------------------------

describe('idempotency', () => {
  it('case 12: an active duplicate is refused and writes no second object', async () => {
    const key = nextKey('active');
    const bytes = pngBytes(2048);
    const receipt = await upload({ key, bytes });

    // Re-open the claim so the record looks mid-flight again.
    await context.query(
      "update idempotency_records set status = 'IN_PROGRESS', completed_at = null, result = jsonb_build_object('schemaVersion',1,'kind','ASSET_UPLOAD_ALLOCATION','assetId',result->>'assetId','bucketAlias','ORIGINALS','objectKey',result->>'objectKey','claimToken','5a5b0a03-9b5a-480b-9a37-000000000009','requestFingerprintVersion',1) where result->>'assetId' = $1",
      [receipt.assetId],
    );

    const objectsBefore = await listOriginals(receipt.assetId);
    expect(await codeOf(() => upload({ key, bytes }))).toBe('ASSET_UPLOAD_IN_PROGRESS');
    const objectsAfter = await listOriginals(receipt.assetId);
    expect(objectsAfter).toEqual(objectsBefore);
  }, 180_000);

  it('case 13: the same key with a different request conflicts and writes nothing', async () => {
    const key = nextKey('reqconflict');
    await upload({ key, bytes: pngBytes(1024), filename: 'first.png' });
    const before = (await idempotencyRows()).length;

    // A different filename is a different request fingerprint.
    expect(await codeOf(() => upload({ key, bytes: pngBytes(1024), filename: 'second.png' }))).toBe(
      'IDEMPOTENCY_CONFLICT',
    );
    expect(await idempotencyRows()).toHaveLength(before);
  }, 180_000);

  it('case 14: a completed replay with the same body writes no object and returns the same receipt', async () => {
    const key = nextKey('replay');
    const bytes = pngBytes(4096, 11);
    const first = await upload({ key, bytes });

    const objectsBefore = await listOriginals(first.assetId);
    const rowBefore = await rowForAsset(first.assetId);

    const replay = await upload({ key, bytes });
    expect(replay).toEqual(first);

    const objectsAfter = await listOriginals(first.assetId);
    // Same key, same size, same last-modified: nothing was rewritten.
    expect(objectsAfter).toEqual(objectsBefore);
    expect((await rowForAsset(first.assetId)).result).toEqual(rowBefore.result);
    expect(await outboxFor(first.assetId)).toHaveLength(1);
  }, 180_000);

  it('case 15: a completed replay with different bytes conflicts', async () => {
    const key = nextKey('replaydiff');
    const first = await upload({ key, bytes: pngBytes(4096, 21) });
    // Same declared type and filename — only the content differs, which is
    // exactly what the content fingerprint exists to catch.
    expect(await codeOf(() => upload({ key, bytes: pngBytes(4096, 22) }))).toBe(
      'IDEMPOTENCY_CONFLICT',
    );
    expect(await outboxFor(first.assetId)).toHaveLength(1);
  }, 180_000);

  it('case 16: a malformed stored result fails safely with no object and no transition', async () => {
    const key = nextKey('malformed');
    const receipt = await upload({ key, bytes: pngBytes(1024, 31) });
    await context.query(
      `update idempotency_records set result = '{"schemaVersion":99,"kind":"NOPE"}'::jsonb where result->>'assetId' = $1`,
      [receipt.assetId],
    );

    expect(await codeOf(() => upload({ key, bytes: pngBytes(1024, 31) }))).toBe(
      'IDEMPOTENCY_RESULT_INVALID',
    );
    const asset = await context.assets.findById(receipt.assetId as AssetId);
    expect(asset?.status).toBe('INSPECTING');
    expect(await outboxFor(receipt.assetId)).toHaveLength(1);
  }, 180_000);
});

// ---------------------------------------------------------------------------
