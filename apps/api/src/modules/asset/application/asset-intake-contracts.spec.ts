/**
 * The client-facing surface: what the projection publishes, how the list
 * paginates and filters, and how a failure becomes an HTTP status.
 *
 * The projection cases are deliberately written as leak tests rather than
 * shape tests — the risk is not a missing field, it is an extra one.
 */
import { HttpException } from '@nestjs/common';

import type {
  Asset,
  AssetId,
  AssetListQuery,
  AssetRepository,
} from '../domain/repositories/asset.repository';
import {
  ASSET_INTAKE_ERROR_CODES,
  assetIntakeError,
  toHttpException,
} from '../domain/asset-intake.errors';
import { toDetailView, toUploadReceipt } from './asset-projection';
import { AssetCatalogQuery } from './asset-catalog.query';

const ASSET_ID = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07' as AssetId;
const CHECKSUM = `sha256:${'a'.repeat(64)}`;

function assetAt(index: number, overrides: Partial<Asset> = {}): Asset {
  return {
    id: `019826f0-1c3d-7a41-9b6e-2f5a8c4d1e${index.toString(16).padStart(2, '0')}` as AssetId,
    kind: 'CATALOG_MEDIA',
    classification: 'PRODUCTION_SENSITIVE',
    storageKey: `test/originals/${ASSET_ID}/original.png`,
    mimeType: 'image/png',
    sizeBytes: 51_200n,
    checksum: CHECKSUM,
    status: 'INSPECTING',
    deletedAt: undefined,
    createdAt: new Date(Date.UTC(2026, 6, 27, 12, 0, index)),
    updatedAt: new Date(Date.UTC(2026, 6, 27, 12, 5, index)),
    ...overrides,
  };
}

/** Records what the query asked for, so scoping can be asserted directly. */
function repositoryOf(rows: readonly Asset[]) {
  const calls: AssetListQuery[] = [];
  const repository = {
    listScoped: (query: AssetListQuery) => {
      calls.push(query);
      return Promise.resolve([...rows].slice(0, query.limit + 1));
    },
    findScoped: (id: AssetId) => Promise.resolve(rows.find((asset) => asset.id === id)),
  } as unknown as AssetRepository;
  return { repository, calls };
}

describe('public projection', () => {
  it('publishes exactly the seven receipt fields', () => {
    expect(Object.keys(toUploadReceipt(assetAt(1))).sort()).toEqual([
      'assetId',
      'byteSize',
      'checksum',
      'classification',
      'kind',
      'mediaType',
      'status',
    ]);
  });

  it('publishes exactly the nine detail fields', () => {
    expect(Object.keys(toDetailView(assetAt(1))).sort()).toEqual([
      'assetId',
      'byteSize',
      'checksum',
      'classification',
      'createdAt',
      'kind',
      'mediaType',
      'status',
      'updatedAt',
    ]);
  });

  it.each(['storageKey', 'bucketAlias', 'claimToken', 'contentFingerprint', 'inspectionEventId'])(
    'never exposes %s',
    (field) => {
      const serialised = JSON.stringify(toDetailView(assetAt(1)));
      expect(serialised).not.toContain(field);
    },
  );

  it('never exposes the storage key value, even indirectly', () => {
    expect(JSON.stringify(toDetailView(assetAt(1)))).not.toContain('test/originals');
  });

  it('converts the bigint size to a JSON-safe number', () => {
    const view = toUploadReceipt(assetAt(1, { sizeBytes: 26_214_400n }));
    expect(view.byteSize).toBe(26_214_400);
    expect(() => JSON.stringify(view)).not.toThrow();
  });

  it('renders timestamps as ISO-8601 strings', () => {
    expect(toDetailView(assetAt(1)).createdAt).toBe('2026-07-27T12:00:01.000Z');
  });
});

describe('AssetCatalogQuery.detail', () => {
  it('returns the safe view for a scoped asset', async () => {
    const { repository } = repositoryOf([assetAt(1)]);
    const view = await new AssetCatalogQuery(repository).detail(assetAt(1).id);
    expect(view.assetId).toBe(assetAt(1).id);
  });

  it('reports a scoped miss as not found rather than confirming existence', async () => {
    const { repository } = repositoryOf([]);
    await expect(new AssetCatalogQuery(repository).detail(ASSET_ID)).rejects.toMatchObject({
      code: 'ASSET_NOT_FOUND',
    });
  });
});

describe('AssetCatalogQuery.list', () => {
  it('scopes every query to product media', async () => {
    const { repository, calls } = repositoryOf([assetAt(1)]);
    await new AssetCatalogQuery(repository).list({});
    expect(calls[0]?.filter).toMatchObject({
      kind: 'CATALOG_MEDIA',
      classification: 'PRODUCTION_SENSITIVE',
    });
  });

  it('defaults to 20 and clamps above 100', async () => {
    const { repository, calls } = repositoryOf([]);
    const query = new AssetCatalogQuery(repository);
    await query.list({});
    await query.list({ limit: 1000 });
    expect(calls[0]?.limit).toBe(20);
    expect(calls[1]?.limit).toBe(100);
  });

  it('reports no next page when the repository returns at most the limit', async () => {
    const { repository } = repositoryOf([assetAt(1), assetAt(2)]);
    const page = await new AssetCatalogQuery(repository).list({ limit: 5 });
    expect(page.hasNext).toBe(false);
    expect(page.nextCursor).toBeUndefined();
    expect(page.items).toHaveLength(2);
  });

  it('emits a cursor and drops the over-fetched row when a page is full', async () => {
    const rows = [assetAt(1), assetAt(2), assetAt(3)];
    const page = await new AssetCatalogQuery(repositoryOf(rows).repository).list({ limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.hasNext).toBe(true);
    expect(page.nextCursor).toBeDefined();
  });

  it('round-trips its own cursor into an ordering position', async () => {
    const rows = [assetAt(1), assetAt(2), assetAt(3)];
    const query = new AssetCatalogQuery(repositoryOf(rows).repository);
    const first = await query.list({ limit: 2 });

    const { repository, calls } = repositoryOf(rows);
    await new AssetCatalogQuery(repository).list({ limit: 2, cursor: first.nextCursor });
    expect(calls[0]?.after).toEqual({
      createdAt: rows[1]?.createdAt,
      id: rows[1]?.id,
    });
  });

  it('passes optional filters straight through', async () => {
    const { repository, calls } = repositoryOf([]);
    await new AssetCatalogQuery(repository).list({ status: 'ACCEPTED', mediaType: 'image/webp' });
    expect(calls[0]?.filter.status).toBe('ACCEPTED');
    expect(calls[0]?.filter.mimeType).toBe('image/webp');
  });

  it.each([
    ['garbage', 'not-a-cursor'],
    ['valid base64 of the wrong shape', Buffer.from('{"a":1}').toString('base64url')],
    ['a cursor whose sort value is not a date', Buffer.from('["nope","id"]').toString('base64url')],
  ])('rejects %s rather than silently restarting the page', async (_label, cursor) => {
    const { repository } = repositoryOf([]);
    await expect(new AssetCatalogQuery(repository).list({ cursor })).rejects.toMatchObject({
      code: 'ASSET_UPLOAD_METADATA_INVALID',
    });
  });
});

describe('error mapping', () => {
  const EXPECTED_STATUS: Record<string, number> = {
    ASSET_UPLOAD_INVALID_MULTIPART: 400,
    ASSET_UPLOAD_METADATA_INVALID: 400,
    IDEMPOTENCY_KEY_INVALID: 400,
    ASSET_UPLOAD_TOO_LARGE: 413,
    ASSET_UPLOAD_MEDIA_UNSUPPORTED: 415,
    ASSET_UPLOAD_SIGNATURE_MISMATCH: 415,
    IDEMPOTENCY_CONFLICT: 409,
    ASSET_UPLOAD_IN_PROGRESS: 409,
    STALE_UPLOAD_CLAIM: 409,
    ASSET_UPLOAD_STATE_CONFLICT: 409,
    ASSET_NOT_FOUND: 404,
    ASSET_UPLOAD_TIMEOUT: 408,
    ASSET_STORAGE_UNAVAILABLE: 503,
    IDEMPOTENCY_RESULT_INVALID: 500,
  };

  it.each(ASSET_INTAKE_ERROR_CODES)('maps %s to its exact status', (code) => {
    const exception = toHttpException(assetIntakeError(code));
    expect(exception).toBeInstanceOf(HttpException);
    expect(exception.getStatus()).toBe(EXPECTED_STATUS[code]);
  });

  it('carries the business code in the payload for the client to branch on', () => {
    const payload = toHttpException(assetIntakeError('IDEMPOTENCY_CONFLICT')).getResponse();
    expect(payload).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it.each(ASSET_INTAKE_ERROR_CODES)('gives %s a safe single-line message', (code) => {
    const message = assetIntakeError(code).message;
    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toMatch(/[\r\n]/);
    // No message may name infrastructure a client has no business knowing about.
    expect(message.toLowerCase()).not.toMatch(/bucket|s3|minio|postgres|sql|token=|select /);
  });

  it('covers every declared code, so a new one cannot ship unmapped', () => {
    expect(Object.keys(EXPECTED_STATUS).sort()).toEqual([...ASSET_INTAKE_ERROR_CODES].sort());
  });
});
