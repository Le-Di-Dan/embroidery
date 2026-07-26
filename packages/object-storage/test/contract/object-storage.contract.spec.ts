/**
 * APP2-I01 §14 — the 20 required contract cases against a real, disposable,
 * pinned MinIO. These prove behaviour the unit suite cannot: managed multipart,
 * abort semantics, anonymous denial and provider error classification.
 *
 * Docker-only, and deliberately excluded from `pnpm test` / `pnpm quality`.
 * Run with `pnpm test:object-storage:contract`.
 */
import { createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';

import { ListMultipartUploadsCommand } from '@aws-sdk/client-s3';

import {
  buildAssetPrefix,
  buildDerivativeObjectKey,
  buildOriginalObjectKey,
  createS3Client,
  createS3ObjectStorage,
  loadObjectStorageConfig,
  ObjectStorageError,
  type ObjectStorageConfig,
  type S3ObjectStorageAdapter,
} from '../../src/index';
import {
  containerExists,
  isPortFree,
  startDisposableMinio,
  TEST_ACCESS_KEY_ID,
  TEST_SECRET_ACCESS_KEY,
  uuidV7,
  type DisposableMinio,
} from './support/disposable-minio';

const MIB = 1024 * 1024;
const ENVIRONMENT = 'test';

let minio: DisposableMinio;
let config: ObjectStorageConfig;
let storage: S3ObjectStorageAdapter;

function envFor(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: ENVIRONMENT,
    OBJECT_STORAGE_PROVIDER: 's3',
    OBJECT_STORAGE_ENDPOINT: minio.endpoint,
    OBJECT_STORAGE_REGION: 'us-east-1',
    OBJECT_STORAGE_ACCESS_KEY_ID: TEST_ACCESS_KEY_ID,
    OBJECT_STORAGE_SECRET_ACCESS_KEY: TEST_SECRET_ACCESS_KEY,
    OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
    OBJECT_STORAGE_ORIGINALS_BUCKET: minio.originalsBucket,
    OBJECT_STORAGE_DERIVATIVES_BUCKET: minio.derivativesBucket,
    ...overrides,
  };
}

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

async function expectObjectStorageError(operation: Promise<unknown>): Promise<ObjectStorageError> {
  try {
    await operation;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ObjectStorageError);
    return error as ObjectStorageError;
  }
  throw new Error('Expected the operation to reject, but it resolved.');
}

beforeAll(async () => {
  minio = await startDisposableMinio();
  config = loadObjectStorageConfig(envFor());
  storage = createS3ObjectStorage(config);
}, 180_000);

afterAll(async () => {
  storage?.close();
  await minio?.stop();
});

describe('APP2-I01 object-storage contract', () => {
  // ---------------------------------------------------------------- 1 & 2
  it('case 1: the pinned MinIO reports ready on its official endpoint', async () => {
    const response = await fetch(`${minio.endpoint}/minio/health/ready`);

    expect(response.status).toBe(200);
  });

  it('case 2: configuration parses into the typed contract', () => {
    expect(config.provider).toBe('s3');
    expect(config.environment).toBe(ENVIRONMENT);
    expect(config.endpoint).toBe(minio.endpoint);
    expect(config.forcePathStyle).toBe(true);
    expect(config.originalsBucket).not.toBe(config.derivativesBucket);
    expect(config.credentials?.accessKeyId).toBe(TEST_ACCESS_KEY_ID);
  });

  // ---------------------------------------------------------------- 3 & 4
  it('case 3: bootstrap creates both private buckets', async () => {
    await storage.ensurePrivateBuckets();

    // Provable by use: a put into each bucket can only succeed if it exists.
    const probe = async (bucket: 'ORIGINALS' | 'DERIVATIVES'): Promise<void> => {
      const assetId = uuidV7();
      const key =
        bucket === 'ORIGINALS'
          ? buildOriginalObjectKey({ environment: ENVIRONMENT, assetId, contentType: 'image/png' })
          : buildDerivativeObjectKey({
              environment: ENVIRONMENT,
              assetId,
              contentType: 'image/webp',
              derivativeKind: 'thumb',
            });
      await storage.putObjectStream({
        bucket,
        key,
        body: Readable.from([Buffer.from('probe')]),
        contentType: bucket === 'ORIGINALS' ? 'image/png' : 'image/webp',
      });
      await expect(storage.headObject({ bucket, key })).resolves.toBeDefined();
    };

    await probe('ORIGINALS');
    await probe('DERIVATIVES');
  });

  it('case 4: repeated bootstrap is a no-op, not a conflict', async () => {
    // Two replicas starting together must both succeed.
    await expect(
      Promise.all([storage.ensurePrivateBuckets(), storage.ensurePrivateBuckets()]),
    ).resolves.toBeDefined();
    await expect(storage.ensurePrivateBuckets()).resolves.toBeUndefined();
  });

  // ------------------------------------------------------------ 5, 6, 10, 11
  describe('managed multipart upload of an unknown-length stream', () => {
    const assetId = uuidV7();
    const payload = randomBytes(6 * MIB); // > 5 MiB part size, so this is real multipart
    let key: string;
    let entityTag: string | undefined;

    it('case 5: uploads a stream with no declared content length', async () => {
      key = buildOriginalObjectKey({
        environment: ENVIRONMENT,
        assetId,
        contentType: 'image/jpeg',
      });

      const result = await storage.putObjectStream({
        bucket: 'ORIGINALS',
        key,
        // No contentLengthBytes: lib-storage must discover the size itself.
        body: Readable.from([payload]),
        contentType: 'image/jpeg',
      });

      entityTag = result.providerEntityTag;
      expect(result.key).toBe(key);
      expect(result.bucket).toBe('ORIGINALS');
    });

    it('case 6: head and get return the stored original', async () => {
      const head = await storage.headObject({ bucket: 'ORIGINALS', key });
      expect(head.sizeBytes).toBe(payload.byteLength);

      const stream = await storage.getObjectStream({ bucket: 'ORIGINALS', key });
      expect(stream.sizeBytes).toBe(payload.byteLength);
      await collect(stream.body);
    });

    it('case 10: an independent SHA-256 re-hash matches the source bytes', async () => {
      const stream = await storage.getObjectStream({ bucket: 'ORIGINALS', key });
      const downloaded = await collect(stream.body);

      // The authoritative checksum is computed by us, never taken from ETag.
      expect(sha256(downloaded)).toBe(sha256(payload));
      expect(downloaded.byteLength).toBe(payload.byteLength);
    });

    it('case 11: the provider ETag is opaque and is never a content hash', () => {
      expect(typeof entityTag).toBe('string');
      const normalised = (entityTag ?? '').replaceAll('"', '');

      expect(normalised).not.toBe(sha256(payload));
      // A multipart ETag carries a `-<partCount>` suffix and is not an MD5 of
      // the content, which is exactly why nothing may derive meaning from it.
      expect(normalised).toContain('-');
    });
  });

  // ---------------------------------------------------------------- 7, 8, 9
  it('case 7: a derivative round-trips through the derivatives bucket', async () => {
    const assetId = uuidV7();
    const key = buildDerivativeObjectKey({
      environment: ENVIRONMENT,
      assetId,
      contentType: 'image/webp',
      derivativeKind: 'thumb-320',
    });
    const payload = randomBytes(2048);

    await storage.putObjectStream({
      bucket: 'DERIVATIVES',
      key,
      body: Readable.from([payload]),
      contentType: 'image/webp',
    });
    const stream = await storage.getObjectStream({ bucket: 'DERIVATIVES', key });

    expect(sha256(await collect(stream.body))).toBe(sha256(payload));
    expect(key).toContain('/derivatives/');
  });

  it('case 8: the content type survives the round trip', async () => {
    const assetId = uuidV7();
    const key = buildOriginalObjectKey({
      environment: ENVIRONMENT,
      assetId,
      contentType: 'image/png',
    });

    await storage.putObjectStream({
      bucket: 'ORIGINALS',
      key,
      body: Readable.from([randomBytes(64)]),
      contentType: 'image/png',
    });

    await expect(storage.headObject({ bucket: 'ORIGINALS', key })).resolves.toMatchObject({
      contentType: 'image/png',
    });
  });

  it('case 9: bounded metadata survives the round trip', async () => {
    const assetId = uuidV7();
    const key = buildOriginalObjectKey({
      environment: ENVIRONMENT,
      assetId,
      contentType: 'image/png',
    });
    const metadata = { 'asset-id': assetId, kind: 'original' };

    await storage.putObjectStream({
      bucket: 'ORIGINALS',
      key,
      body: Readable.from([randomBytes(32)]),
      contentType: 'image/png',
      metadata,
    });
    const head = await storage.headObject({ bucket: 'ORIGINALS', key });

    // Keys come back lowercased by the provider; the port normalises them.
    expect(head.metadata).toMatchObject(metadata);
  });

  // -------------------------------------------------------------------- 12
  it('case 12: prefix listing paginates and never crosses into a neighbour', async () => {
    const assetId = uuidV7();
    const neighbourId = uuidV7();
    const prefix = buildAssetPrefix({ environment: ENVIRONMENT, scope: 'derivatives', assetId });

    const kinds = ['a1', 'a2', 'a3', 'a4', 'a5'];
    for (const kind of kinds) {
      await storage.putObjectStream({
        bucket: 'DERIVATIVES',
        key: buildDerivativeObjectKey({
          environment: ENVIRONMENT,
          assetId,
          contentType: 'image/webp',
          derivativeKind: kind,
        }),
        body: Readable.from([randomBytes(16)]),
        contentType: 'image/webp',
      });
    }
    await storage.putObjectStream({
      bucket: 'DERIVATIVES',
      key: buildDerivativeObjectKey({
        environment: ENVIRONMENT,
        assetId: neighbourId,
        contentType: 'image/webp',
        derivativeKind: 'a1',
      }),
      body: Readable.from([randomBytes(16)]),
      contentType: 'image/webp',
    });

    // Page size 2 across 5 objects forces real continuation-token paging.
    const listed = await storage.listObjectsByPrefix({
      bucket: 'DERIVATIVES',
      prefix,
      pageSizeHint: 2,
    });

    expect(listed).toHaveLength(kinds.length);
    for (const entry of listed) {
      expect(entry.key.startsWith(prefix)).toBe(true);
      expect(entry.key).not.toContain(neighbourId);
    }
  });

  // --------------------------------------------------------------- 13 & 14
  it('case 13: deleting an existing object removes it', async () => {
    const assetId = uuidV7();
    const key = buildOriginalObjectKey({
      environment: ENVIRONMENT,
      assetId,
      contentType: 'image/png',
    });
    await storage.putObjectStream({
      bucket: 'ORIGINALS',
      key,
      body: Readable.from([randomBytes(16)]),
      contentType: 'image/png',
    });

    await storage.deleteObject({ bucket: 'ORIGINALS', key });

    const error = await expectObjectStorageError(storage.headObject({ bucket: 'ORIGINALS', key }));
    expect(error.code).toBe('OBJECT_NOT_FOUND');
  });

  it('case 14: deleting a missing object is idempotent', async () => {
    const key = buildOriginalObjectKey({
      environment: ENVIRONMENT,
      assetId: uuidV7(),
      contentType: 'image/png',
    });

    // A retried cleanup must never fail on its own earlier progress.
    await expect(storage.deleteObject({ bucket: 'ORIGINALS', key })).resolves.toBeUndefined();
    await expect(storage.deleteObject({ bucket: 'ORIGINALS', key })).resolves.toBeUndefined();
  });

  // --------------------------------------------------------------- 15 & 16
  describe('mid-stream abort', () => {
    const assetId = uuidV7();
    let key: string;

    it('case 15: an aborted upload leaves no completed object', async () => {
      key = buildOriginalObjectKey({
        environment: ENVIRONMENT,
        assetId,
        contentType: 'image/jpeg',
      });
      const controller = new AbortController();
      const chunk = randomBytes(MIB);
      let emitted = 0;

      // A slow 20 MiB stream: multipart is well underway when we abort.
      const body = new Readable({
        read(): void {
          emitted += 1;
          if (emitted > 20) {
            this.push(null);
            return;
          }
          if (emitted === 8) {
            controller.abort();
          }
          setTimeout(() => this.push(chunk), 15);
        },
      });

      const error = await expectObjectStorageError(
        storage.putObjectStream({
          bucket: 'ORIGINALS',
          key,
          body,
          contentType: 'image/jpeg',
          signal: controller.signal,
          multipart: { partSizeBytes: 5 * MIB, queueSize: 2 },
        }),
      );
      expect(error.code).toBe('REQUEST_ABORTED');

      const headError = await expectObjectStorageError(
        storage.headObject({ bucket: 'ORIGINALS', key }),
      );
      expect(headError.code).toBe('OBJECT_NOT_FOUND');
    }, 120_000);

    it('case 16: the aborted upload leaves no dangling multipart upload', async () => {
      // The package's own factory, so this probe uses the same construction
      // path as the adapter rather than a second, divergent client config.
      const client = createS3Client(config);
      try {
        const response = await client.send(
          new ListMultipartUploadsCommand({ Bucket: config.originalsBucket }),
        );

        // leavePartsOnError: false must have issued AbortMultipartUpload, so
        // no billable orphaned parts remain.
        const dangling = (response.Uploads ?? []).filter((upload) => upload.Key === key);
        expect(dangling).toEqual([]);
      } finally {
        client.destroy();
      }
    });
  });

  // --------------------------------------------------------------- 17 & 18
  it('case 17: an unauthenticated object GET is denied', async () => {
    const assetId = uuidV7();
    const key = buildOriginalObjectKey({
      environment: ENVIRONMENT,
      assetId,
      contentType: 'image/png',
    });
    await storage.putObjectStream({
      bucket: 'ORIGINALS',
      key,
      body: Readable.from([randomBytes(16)]),
      contentType: 'image/png',
    });

    // No signature: exactly what a leaked object URL would carry.
    const response = await fetch(`${minio.endpoint}/${config.originalsBucket}/${key}`);

    expect(response.status).toBe(403);
    expect(await response.text()).toContain('AccessDenied');
  });

  it('case 18: unauthenticated bucket listing is denied', async () => {
    const response = await fetch(`${minio.endpoint}/${config.originalsBucket}?list-type=2`);

    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('<Key>');
  });

  // -------------------------------------------------------------------- 19
  it('case 19: wrong credentials classify safely and leak no secret', async () => {
    const wrongSecret = 'wrong-secret-value-for-this-assertion';
    const wrong = createS3ObjectStorage(
      loadObjectStorageConfig(envFor({ OBJECT_STORAGE_SECRET_ACCESS_KEY: wrongSecret })),
    );
    try {
      const error = await expectObjectStorageError(
        wrong.headObject({
          bucket: 'ORIGINALS',
          key: buildOriginalObjectKey({
            environment: ENVIRONMENT,
            assetId: uuidV7(),
            contentType: 'image/png',
          }),
        }),
      );

      expect(error.code).toBe('ACCESS_DENIED');
      expect(error.message).not.toContain(wrongSecret);
      expect(error.message).not.toContain(TEST_SECRET_ACCESS_KEY);
      expect(error.message).not.toContain(minio.endpoint);
    } finally {
      wrong.close();
    }
  });

  // -------------------------------------------------------------------- 20
  it('case 20: teardown removes the container, its volume and its port', async () => {
    storage.close();
    await minio.stop();

    expect(await containerExists(minio.containerName)).toBe(false);
    expect(await isPortFree(minio.port)).toBe(true);
    // The dev stack is a different project, name and volume; nothing here
    // could have touched it.
    expect(minio.containerName).not.toContain('embroidery-dev');
  }, 60_000);
});
