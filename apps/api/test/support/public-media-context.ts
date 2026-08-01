/**
 * The live public catalog-media harness (`APP2-T01` §17).
 *
 * Composes the two harnesses that already exist rather than adding a third: the
 * canonical API integration context (real `AppModule`, disposable PostgreSQL,
 * all migrations) and the B01 disposable MinIO. The only new part is the order
 * — MinIO must be running and its environment exported *before* the application
 * graph is built, because `applyOfflineObjectStorageEnv` fills in non-connecting
 * placeholders for any variable that is still unset, and a graph built with
 * those would talk to `openapi.invalid` instead of the container.
 *
 * Nothing here touches the development stack, its database or its buckets.
 *
 * Test-only.
 */
import { CleanupStack } from '@embroidery/test-utils';
import type { ObjectStoragePort } from '@embroidery/object-storage';
import { Readable } from 'node:stream';

import { OBJECT_STORAGE } from '../../src/modules/asset/infrastructure/storage/object-storage.provider';
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from './api-integration-context';
import { assertDockerAvailable, minioEnv, startDisposableMinio } from './disposable-minio';

export interface PublicMediaTestContext {
  readonly api: ApiIntegrationTestContext;
  readonly storage: ObjectStoragePort;
  /**
   * Writes bytes at the exact derivative key the fixtures record in
   * `asset_derivatives.storage_key`, so the row and the object agree.
   */
  putDerivative(assetId: string, kind: string, bytes: Buffer): Promise<void>;
  /** Deletes that object, leaving the READY row behind. */
  removeDerivative(assetId: string, kind: string): Promise<void>;
  /** The key layout the fixtures use, for assertions about leakage. */
  derivativeKey(assetId: string, kind: string): string;
  close(): Promise<void>;
}

/** Mirrors `product-publication-fixtures.ts`, which seeds the row this addresses. */
function fixtureDerivativeKey(assetId: string, kind: string): string {
  return `development/derivatives/${assetId}/${kind}.webp`;
}

export async function createPublicMediaContext(label: string): Promise<PublicMediaTestContext> {
  await assertDockerAvailable();

  const cleanup = new CleanupStack();
  const minio = await startDisposableMinio();
  cleanup.push('stop minio', () => minio.stop());

  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(minioEnv(minio))) {
    previous.set(name, process.env[name]);
    process.env[name] = value;
  }
  cleanup.push('restore storage env', () => {
    for (const [name, value] of previous) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    return Promise.resolve();
  });

  try {
    const api = await createApiIntegrationContext(label);
    cleanup.push('close api context', () => api.close());

    const storage = api.app.get<ObjectStoragePort>(OBJECT_STORAGE);
    // `ObjectStorageBootstrapService` runs from `main.ts`, which the harness
    // never calls, so the buckets are created here explicitly. A read path must
    // not be able to create them.
    await storage.ensurePrivateBuckets();

    return {
      api,
      storage,
      derivativeKey: fixtureDerivativeKey,
      putDerivative: async (assetId, kind, bytes) => {
        await storage.putObjectStream({
          bucket: 'DERIVATIVES',
          key: fixtureDerivativeKey(assetId, kind),
          body: Readable.from([bytes]),
          contentType: 'image/webp',
          contentLengthBytes: bytes.byteLength,
        });
      },
      removeDerivative: async (assetId, kind) => {
        await storage.deleteObject({
          bucket: 'DERIVATIVES',
          key: fixtureDerivativeKey(assetId, kind),
        });
      },
      close: () => cleanup.run(),
    };
  } catch (error: unknown) {
    await cleanup.run();
    throw error;
  }
}
