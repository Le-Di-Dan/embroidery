/**
 * APP2-B01 §26 — the HTTP contract of the three Admin asset operations.
 *
 * This suite asserts what a client actually receives: status codes, the
 * canonical envelope, the guards, and — most importantly — that no internal
 * field ever crosses the boundary. It runs the real `AppModule` through
 * Supertest against disposable PostgreSQL and disposable MinIO.
 *
 * Docker-only. Run with `pnpm test:asset-intake:api`.
 */
import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CleanupStack } from '@embroidery/test-utils';
import { createDisposableDatabase, type DisposableDatabase } from '@embroidery/database/testing';
import { newId } from '@embroidery/database';

import { GLOBAL_ROUTE_PREFIX } from '../../src/bootstrap/api-application';
import { AppModule } from '../../src/bootstrap/app.module';
import { LOG_SINK } from '../../src/platform/logging/log-sink';
import { AuthenticatedAdminGuard } from '../../src/modules/identity/presentation/guards/authenticated-admin.guard';
import { RecordingLogSink } from '../support/recording-log-sink';
import { minioEnv, startDisposableMinio, type DisposableMinio } from '../support/disposable-minio';
import { jpegBytes, pngBytes, svgBytes } from '../support/synthetic-images';

const ADMIN_ID = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07';
const BOUNDARY = 'api-boundary-0123456789';
const ALLOWED_ORIGIN = 'http://admin.embroidery.local';

let app: INestApplication;
let http: ReturnType<typeof request>;
let database: DisposableDatabase;
let minio: DisposableMinio;
let logs: RecordingLogSink;
const cleanup = new CleanupStack();

/**
 * A guard double that admits one fixed admin.
 *
 * Authentication itself is APP1's contract with its own suite; overriding it
 * keeps these cases about the asset routes. The **origin** guard is left real,
 * because that is part of this checkpoint's security boundary.
 */
const authenticatedAdmin = {
  canActivate: (context: { switchToHttp: () => { getRequest: () => Record<string, unknown> } }) => {
    context.switchToHttp().getRequest()['staffSession'] = {
      adminId: ADMIN_ID,
      email: 'admin@example.test',
      displayName: 'Admin',
    };
    return true;
  },
};

beforeAll(async () => {
  minio = await startDisposableMinio();
  cleanup.push('stop minio', () => minio.stop());
  database = await createDisposableDatabase('app2-b01-intake-api');
  cleanup.push('drop database', () => database.drop());

  const previous = new Map<string, string | undefined>();
  const setEnv = (name: string, value: string): void => {
    previous.set(name, process.env[name]);
    process.env[name] = value;
  };
  setEnv('DATABASE_URL', database.url);
  setEnv('NODE_ENV', 'test');
  setEnv('STAFF_ALLOWED_ORIGINS', ALLOWED_ORIGIN);
  for (const [name, value] of Object.entries(minioEnv(minio))) {
    setEnv(name, value);
  }
  cleanup.push('restore env', () => {
    for (const [name, value] of previous) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    return Promise.resolve();
  });

  logs = new RecordingLogSink();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(LOG_SINK)
    .useValue(logs)
    .overrideGuard(AuthenticatedAdminGuard)
    .useValue(authenticatedAdmin)
    .compile();

  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix(GLOBAL_ROUTE_PREFIX);
  await app.init();
  cleanup.push('close app', () => app.close());

  http = request(app.getHttpServer() as Server);

  const storage = app.get<{ ensurePrivateBuckets: () => Promise<void> }>(
    (await import('../../src/modules/asset/infrastructure/storage/object-storage.provider'))
      .OBJECT_STORAGE,
  );
  await storage.ensurePrivateBuckets();
}, 300_000);

afterAll(async () => {
  await cleanup.run();
}, 120_000);

/**
 * The canonical envelope, typed once.
 *
 * Supertest types `response.body` as `any`; reading it through this shape
 * keeps every assertion below type-checked instead of silently unsafe.
 */
interface Envelope<T> {
  readonly success: boolean;
  readonly code: string;
  readonly message?: string;
  readonly data?: T;
  readonly meta?: { readonly timestamp?: string; readonly requestId?: string };
}

function envelope<T>(response: { body: unknown }): Envelope<T> {
  return response.body as Envelope<T>;
}

interface ReceiptData {
  readonly assetId: string;
  readonly kind: string;
  readonly classification: string;
  readonly status: string;
  readonly mediaType: string;
  readonly byteSize: number;
  readonly checksum: string;
}

interface ListData {
  readonly items: readonly (ReceiptData & { readonly createdAt: string })[];
  readonly nextCursor?: string;
  readonly hasNext: boolean;
}

let keyCounter = 0;
function nextKey(label: string): string {
  keyCounter += 1;
  return `api-${label}-${String(keyCounter).padStart(3, '0')}`;
}

interface UploadOptions {
  readonly key?: string | undefined;
  readonly bytes?: Buffer;
  readonly mediaType?: string;
  readonly filename?: string;
  readonly assetKind?: string;
  readonly classification?: string;
  readonly origin?: string | undefined;
}

/** Builds and sends one multipart upload with the given deviations. */
function postUpload(options: UploadOptions = {}) {
  const bytes = options.bytes ?? pngBytes(2048);
  const pending = http
    .post('/api/admin/assets/upload')
    .set('Content-Type', `multipart/form-data; boundary=${BOUNDARY}`);

  if (options.key !== undefined) {
    void pending.set('Idempotency-Key', options.key);
  }
  const origin = options.origin === undefined ? ALLOWED_ORIGIN : options.origin;
  if (origin !== '') {
    void pending.set('Origin', origin);
  }

  const part = (name: string, value: string): string =>
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
  const body = Buffer.concat([
    Buffer.from(part('assetKind', options.assetKind ?? 'CATALOG_MEDIA'), 'utf8'),
    Buffer.from(part('classification', options.classification ?? 'PRODUCTION_SENSITIVE'), 'utf8'),
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${options.filename ?? 'logo.png'}"\r\n` +
        `Content-Type: ${options.mediaType ?? 'image/png'}\r\n\r\n`,
      'utf8',
    ),
    bytes,
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`, 'utf8'),
  ]);
  return pending.send(body);
}

describe('POST /api/admin/assets/upload', () => {
  it('accepts a valid upload with 202 and the canonical success envelope', async () => {
    const response = await postUpload({ key: nextKey('ok') });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      success: true,
      code: 'ASSET_UPLOAD_ACCEPTED',
      data: {
        kind: 'CATALOG_MEDIA',
        classification: 'PRODUCTION_SENSITIVE',
        status: 'INSPECTING',
        mediaType: 'image/png',
      },
    });
    expect(envelope(response).meta?.timestamp).toEqual(expect.any(String));
    // Correlation reaches the client through the envelope. The `X-Request-ID`
    // *response header* is the gateway's to set (APP0-B02), so the API not
    // emitting one here is the documented contract, not a gap.
    expect(envelope(response).meta?.requestId).toEqual(expect.any(String));
  }, 120_000);

  it('publishes no internal field in the receipt', async () => {
    const response = await postUpload({ key: nextKey('leak') });
    const serialised = JSON.stringify(response.body);
    for (const field of [
      'storageKey',
      'objectKey',
      'bucketAlias',
      'claimToken',
      'contentFingerprint',
      'inspectionEventId',
      'scopeKey',
      'fingerprint',
      'logo.png',
    ]) {
      expect(serialised).not.toContain(field);
    }
    expect(Object.keys(envelope<ReceiptData>(response).data ?? {}).sort()).toEqual([
      'assetId',
      'byteSize',
      'checksum',
      'classification',
      'kind',
      'mediaType',
      'status',
    ]);
  }, 120_000);

  it('requires an exact allowed Origin', async () => {
    const response = await postUpload({ key: nextKey('origin'), origin: 'http://evil.test' });
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ success: false, code: 'FORBIDDEN' });
  }, 120_000);

  it.each([
    ['missing', undefined],
    ['too short', 'abc'],
    ['illegal characters', 'has spaces here'],
  ])(
    'rejects an idempotency key that is %s',
    async (_label, key) => {
      const response = await postUpload({ key });
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_INVALID' });
    },
    120_000,
  );

  it('rejects a JSON body: the login-only JSON guard is absent but multipart is still required', async () => {
    const response = await http
      .post('/api/admin/assets/upload')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Idempotency-Key', nextKey('json'))
      .set('Content-Type', 'application/json')
      .send({ assetKind: 'CATALOG_MEDIA' });

    // 400 from the multipart parser, never 415 from the JSON-body guard —
    // that guard must not be applied to this route.
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'ASSET_UPLOAD_INVALID_MULTIPART' });
  }, 120_000);

  it('rejects metadata that is not the fixed contract', async () => {
    const response = await postUpload({ key: nextKey('meta'), classification: 'PUBLIC' });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'ASSET_UPLOAD_METADATA_INVALID' });
  }, 120_000);

  it('rejects an unsupported media type with 415', async () => {
    const response = await postUpload({
      key: nextKey('svg'),
      bytes: svgBytes(),
      mediaType: 'image/svg+xml',
      filename: 'logo.svg',
    });
    expect(response.status).toBe(415);
    expect(response.body).toMatchObject({ code: 'ASSET_UPLOAD_MEDIA_UNSUPPORTED' });
  }, 120_000);

  it('rejects a signature mismatch with 415', async () => {
    const response = await postUpload({ key: nextKey('sig'), bytes: jpegBytes(1024) });
    expect(response.status).toBe(415);
    expect(response.body).toMatchObject({ code: 'ASSET_UPLOAD_SIGNATURE_MISMATCH' });
  }, 120_000);

  it('rejects an oversize file with 413', async () => {
    const response = await postUpload({
      key: nextKey('big'),
      bytes: pngBytes(26_214_401),
    });
    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ code: 'ASSET_UPLOAD_TOO_LARGE' });
  }, 300_000);

  it('conflicts with 409 when the same key carries a different request', async () => {
    const key = nextKey('conflict');
    await postUpload({ key, filename: 'first.png' });
    const response = await postUpload({ key, filename: 'second.png' });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  }, 180_000);

  it('conflicts with 409 when a completed replay carries different bytes', async () => {
    const key = nextKey('replay');
    await postUpload({ key, bytes: pngBytes(2048, 7) });
    const response = await postUpload({ key, bytes: pngBytes(2048, 8) });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  }, 180_000);

  it('replays a completed upload with the identical 202 receipt', async () => {
    const key = nextKey('idem');
    const bytes = pngBytes(2048, 9);
    const first = await postUpload({ key, bytes });
    const second = await postUpload({ key, bytes });
    expect(second.status).toBe(202);
    expect(envelope<ReceiptData>(second).data).toEqual(envelope<ReceiptData>(first).data);
  }, 180_000);
});

describe('GET /api/admin/assets/:assetId', () => {
  it('returns the safe detail view', async () => {
    const created = await postUpload({ key: nextKey('detail') });
    const assetId = envelope<ReceiptData>(created).data?.assetId ?? '';

    const response = await http.get(`/api/admin/assets/${assetId}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, code: 'ASSET_DETAIL_READ' });
    expect(Object.keys(envelope<ReceiptData>(response).data ?? {}).sort()).toEqual([
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
    expect(JSON.stringify(response.body)).not.toContain('originals/');
  }, 120_000);

  it('reports an unknown id as 404', async () => {
    const response = await http.get(`/api/admin/assets/${newId()}`);
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'ASSET_NOT_FOUND' });
  }, 120_000);

  it('reports an out-of-scope asset as 404 rather than confirming it exists', async () => {
    const foreignId = newId();
    await database.client.pool.query(
      `insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
       values ($1, 'CUSTOMER_UPLOAD', 'CUSTOMER_PRIVATE', $2, 'image/png', 1024, $3, 'ACCEPTED')`,
      [foreignId, `test/originals/${foreignId}/original.png`, `sha256:${'a'.repeat(64)}`],
    );

    const response = await http.get(`/api/admin/assets/${foreignId}`);
    expect(response.status).toBe(404);
  }, 120_000);

  it('rejects a malformed id before touching the repository', async () => {
    const response = await http.get('/api/admin/assets/not-a-uuid');
    expect(response.status).toBe(400);
  }, 120_000);
});

describe('GET /api/admin/assets', () => {
  it('returns a bounded default page with cursor metadata', async () => {
    const response = await http.get('/api/admin/assets');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, code: 'ASSET_LIST_READ' });
    const data = envelope<ListData>(response).data as ListData;
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.hasNext).toBe('boolean');
    expect(JSON.stringify(response.body)).not.toContain('originals/');
  }, 120_000);

  it('continues through an opaque cursor without repeating a row', async () => {
    const first = await http.get('/api/admin/assets').query({ limit: 2 });
    expect(first.status).toBe(200);
    const firstPage = envelope<ListData>(first).data as ListData;
    expect(firstPage.items.length).toBeLessThanOrEqual(2);

    if (!firstPage.hasNext) {
      return;
    }
    const second = await http
      .get('/api/admin/assets')
      .query({ limit: 2, cursor: firstPage.nextCursor });
    expect(second.status).toBe(200);
    const secondPage = envelope<ListData>(second).data as ListData;
    const firstIds = new Set(firstPage.items.map((item) => item.assetId));
    for (const item of secondPage.items) {
      expect(firstIds.has(item.assetId)).toBe(false);
    }
  }, 180_000);

  it('applies the status and mediaType filters', async () => {
    const response = await http
      .get('/api/admin/assets')
      .query({ status: 'INSPECTING', mediaType: 'image/png' });
    expect(response.status).toBe(200);
    for (const item of (envelope<ListData>(response).data as ListData).items) {
      expect(item.status).toBe('INSPECTING');
      expect(item.mediaType).toBe('image/png');
    }
  }, 120_000);

  it.each([
    ['an unknown filter', { unexpected: 'x' }],
    ['a limit above the maximum', { limit: '101' }],
    ['a zero limit', { limit: '0' }],
    ['an unsupported mediaType', { mediaType: 'image/gif' }],
  ])(
    'rejects %s with 400',
    async (_label, query) => {
      const response = await http.get('/api/admin/assets').query(query);
      expect(response.status).toBe(400);
    },
    120_000,
  );

  it('rejects a malformed cursor rather than silently restarting', async () => {
    const response = await http.get('/api/admin/assets').query({ cursor: 'not-a-cursor' });
    expect(response.status).toBe(400);
  }, 120_000);
});

describe('logging', () => {
  it('records no idempotency key, storage key or claim token', async () => {
    const key = nextKey('logsafe');
    await postUpload({ key });
    const serialised = JSON.stringify(logs.records);
    expect(serialised).not.toContain(key);
    expect(serialised).not.toContain('claimToken');
    expect(serialised).not.toContain('originals/');
  }, 120_000);
});
