/**
 * Live harness for the APP2-W01 asset-processing integration suites (§21).
 *
 * Boots the real production `WorkerModule` — real object-storage client, real
 * startup gate, real handler registration — against a disposable PostgreSQL
 * with all 32 migrations and a disposable MinIO. Nothing is stubbed: the
 * derivative that lands in the store is the one a production worker would write,
 * and the rows it leaves behind are constrained by the real CHECKs, the real
 * partial unique index and the real append-only trigger.
 *
 * The use case is driven directly rather than through the poll loop. The loop
 * is I02's subject and is already proven; what these suites need is control over
 * the attempt number and the ability to interleave two attempts deliberately.
 *
 * Test-only. Build-excluded via `src/**\/tests/**`.
 */
import { Readable } from 'node:stream';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
// The sanctioned raw-SQL boundary (ADR-DB1-002): the worker application must
// never depend on the ORM or the driver, not even in a test.
import { executeRaw, newId, sql } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { createDisposableDatabase } from '@embroidery/database/testing';
import { PolicyConfigurationRepository, TransactionManager } from '@embroidery/persistence';
import type { ObjectStoragePort } from '@embroidery/object-storage';

import { WorkerModule } from '../../../bootstrap/worker.module';
import {
  WORKER_RUNTIME_POLICY_KEY,
  WORKER_RUNTIME_POLICY_SCHEMA_VERSION,
  type WorkerRuntimePolicy,
} from '../../../runtime/policy/worker-runtime-policy';
import { WorkerPolicyService } from '../../../runtime/policy/worker-policy.service';
import { OBJECT_STORAGE } from '../../../storage/object-storage.provider';
import { DerivativeCleanupService } from '../application/derivative-cleanup.service';
import { DerivativeGenerationService } from '../application/derivative-generation.service';
import { SourceVerificationService } from '../application/source-verification.service';
import {
  ASSET_INSPECTION_REPOSITORY,
  type AssetInspectionRepository,
} from '../domain/repositories/asset-inspection.repository';
import {
  minioEnv,
  startDisposableMinio,
  type DisposableMinio,
} from '../../../../test/support/disposable-minio';
import { AssetInspectionUseCase } from '../application/asset-inspection.usecase';
import type { SyntheticImage } from './image-fixtures';

/** Matches the I02 fixture policy; `maxAttempts` is what §17 turns on. */
export const INTEGRATION_POLICY: WorkerRuntimePolicy = {
  concurrency: 2,
  batchSize: 5,
  pollIntervalMs: 250,
  leaseDurationMs: 30_000,
  handlerTimeoutMs: 5_000,
  leaseSafetyMarginMs: 1_000,
  shutdownGraceMs: 1_000,
  maxAttempts: 2,
  backoffBaseMs: 10,
  backoffMaxMs: 200,
};

export interface SeededAsset {
  readonly assetId: string;
  readonly originalKey: string;
  readonly image: SyntheticImage;
}

export interface AssetInspectionContext {
  readonly moduleRef: TestingModule;
  readonly disposable: DisposableDatabase;
  readonly minio: DisposableMinio;
  readonly storage: ObjectStoragePort;
  readonly useCase: AssetInspectionUseCase;
  readonly repository: AssetInspectionRepository;
  readonly transactions: TransactionManager;
  seedAsset(image: SyntheticImage, overrides?: SeedOverrides): Promise<SeededAsset>;
  query<TRow extends Record<string, unknown>>(statement: ReturnType<typeof sql>): Promise<TRow[]>;
  /**
   * A second use case wired to a substituted port or repository.
   *
   * The substitution is the *failure seam*: a storage outage and a terminal
   * transaction that dies are both real conditions, and the alternative — hand-
   * writing the half-finished rows they leave behind — would test a state the
   * system might never actually produce.
   */
  buildUseCase(overrides: {
    readonly storage?: ObjectStoragePort;
    readonly repository?: AssetInspectionRepository;
  }): AssetInspectionUseCase;
  close(): Promise<void>;
}

export interface SeedOverrides {
  readonly status?: string;
  readonly kind?: string;
  readonly classification?: string;
  readonly sizeBytes?: bigint;
  readonly checksum?: string | null;
}

const EXTENSION_BY_MEDIA_TYPE: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export async function startAssetInspectionContext(label: string): Promise<AssetInspectionContext> {
  const minio = await startDisposableMinio();
  let disposable: DisposableDatabase | undefined;
  const previous = captureEnv();

  try {
    disposable = await createDisposableDatabase(label);
    process.env['DATABASE_URL'] = disposable.url;
    process.env['NODE_ENV'] = 'test';
    for (const [name, value] of Object.entries(minioEnv(minio))) {
      process.env[name] = value;
    }

    const moduleRef = await Test.createTestingModule({ imports: [WorkerModule] }).compile();
    await publishPolicy(moduleRef, disposable);
    // `init()` runs the real startup gate, which creates both private buckets,
    // and the real handler registration.
    await moduleRef.init();

    const owned = disposable;
    const storage = moduleRef.get<ObjectStoragePort>(OBJECT_STORAGE);
    const repository = moduleRef.get<AssetInspectionRepository>(ASSET_INSPECTION_REPOSITORY);
    const transactions = moduleRef.get(TransactionManager);
    const policies = moduleRef.get(WorkerPolicyService);

    return {
      moduleRef,
      disposable: owned,
      minio,
      storage,
      repository,
      transactions,
      useCase: moduleRef.get(AssetInspectionUseCase),
      buildUseCase: (overrides): AssetInspectionUseCase => {
        const port = overrides.storage ?? storage;
        const generation = new DerivativeGenerationService(port, 'test');
        return new AssetInspectionUseCase(
          transactions,
          overrides.repository ?? repository,
          new SourceVerificationService(port),
          generation,
          new DerivativeCleanupService(port, generation),
          policies,
          port,
        );
      },
      seedAsset: (image, overrides = {}) => seedAsset(owned, storage, image, overrides),
      query: async <TRow extends Record<string, unknown>>(statement: ReturnType<typeof sql>) =>
        (await executeRaw<TRow>(owned.client.db, statement)) as TRow[],
      close: async (): Promise<void> => {
        await moduleRef.close();
        await owned.drop();
        await minio.stop();
        restoreEnv(previous);
      },
    };
  } catch (error: unknown) {
    await disposable?.drop();
    await minio.stop();
    restoreEnv(previous);
    throw error;
  }
}

/**
 * Writes the row APP2-B01 would have written and puts the private original
 * where its `storage_key` says it is.
 *
 * The asset arrives `INSPECTING` because that is the state B01's Tx B leaves it
 * in when it appends the inspection intent.
 */
async function seedAsset(
  disposable: DisposableDatabase,
  storage: ObjectStoragePort,
  image: SyntheticImage,
  overrides: SeedOverrides,
): Promise<SeededAsset> {
  const assetId = newId();
  const extension = EXTENSION_BY_MEDIA_TYPE[image.mediaType] ?? 'png';
  const originalKey = `test/originals/${assetId}/original.${extension}`;

  await storage.putObjectStream({
    bucket: 'ORIGINALS',
    key: originalKey,
    // The whole fixture in memory is fine here: the no-buffering rule is about
    // the production pipeline, not about seeding a 40 KiB test image.
    body: Readable.from([image.bytes]),
    contentType: image.mediaType,
  });

  await executeRaw(
    disposable.client.db,
    sql`
      insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
      values (
        ${assetId},
        ${overrides.kind ?? 'CATALOG_MEDIA'},
        ${overrides.classification ?? 'PRODUCTION_SENSITIVE'},
        ${originalKey},
        ${image.mediaType},
        ${(overrides.sizeBytes ?? BigInt(image.byteSize)).toString()}::bigint,
        ${overrides.checksum === undefined ? image.checksum : overrides.checksum},
        ${overrides.status ?? 'INSPECTING'}
      )
    `,
  );

  return { assetId, originalKey, image };
}

async function publishPolicy(
  moduleRef: TestingModule,
  disposable: DisposableDatabase,
): Promise<void> {
  const adminId = newId();
  await executeRaw(
    disposable.client.db,
    sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, ${`w01-${adminId}@example.com`}, 'W01 Fixture', 'ACTIVE')
    `,
  );

  const policies = moduleRef.get(PolicyConfigurationRepository);
  await moduleRef.get(TransactionManager).runInTransaction(async () => {
    await policies.ensureKey(WORKER_RUNTIME_POLICY_KEY, 'Worker runtime policy (APP2-I02).');
    await policies.publishVersion({
      configKey: WORKER_RUNTIME_POLICY_KEY,
      value: { ...INTEGRATION_POLICY },
      valueSchemaVersion: WORKER_RUNTIME_POLICY_SCHEMA_VERSION,
      effectiveFrom: new Date(),
      createdByAdminId: adminId,
      reason: 'APP2-W01 integration fixture.',
    });
  });
}

const MANAGED_ENV = [
  'DATABASE_URL',
  'NODE_ENV',
  'OBJECT_STORAGE_PROVIDER',
  'OBJECT_STORAGE_ENDPOINT',
  'OBJECT_STORAGE_REGION',
  'OBJECT_STORAGE_ACCESS_KEY_ID',
  'OBJECT_STORAGE_SECRET_ACCESS_KEY',
  'OBJECT_STORAGE_FORCE_PATH_STYLE',
  'OBJECT_STORAGE_ORIGINALS_BUCKET',
  'OBJECT_STORAGE_DERIVATIVES_BUCKET',
];

function captureEnv(): Map<string, string | undefined> {
  return new Map(MANAGED_ENV.map((name) => [name, process.env[name]]));
}

function restoreEnv(previous: Map<string, string | undefined>): void {
  for (const [name, value] of previous) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}
