/**
 * The live asset-intake harness: real `AssetIntakeModule`, real disposable
 * PostgreSQL with all migrations, real disposable MinIO (`APP2-B01` §25).
 *
 * It drives the service directly rather than through HTTP, because the cases it
 * exists for are about durable state — claim rows, object keys, outbox intents,
 * lifecycle transitions — and an HTTP layer between the assertion and the fact
 * only makes a failure harder to read. The HTTP contract has its own suite.
 *
 * Nothing here touches the development stack or its database.
 */
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { CleanupStack } from '@embroidery/test-utils';
import {
  createDisposableDatabase,
  resolveDatabaseUrl,
  type DisposableDatabase,
} from '@embroidery/database/testing';
import { TransactionManager, type IdempotencyKey } from '@embroidery/persistence';
import type { ObjectStoragePort } from '@embroidery/object-storage';

import { AssetIntakeModule } from '../../src/modules/asset/asset-intake.module';
import { AuditContextModule } from '../../src/platform/audit-context/audit-context.module';
import { LoggingModule } from '../../src/platform/logging/logging.module';
import { RequestContextModule } from '../../src/platform/request-context/request-context.module';
import { AssetIntakeService } from '../../src/modules/asset/application/asset-intake.service';
import { UploadTimer } from '../../src/modules/asset/application/ports/upload-timer';
import { OBJECT_STORAGE } from '../../src/modules/asset/infrastructure/storage/object-storage.provider';
import {
  ASSET_REPOSITORY,
  type AssetRepository,
} from '../../src/modules/asset/domain/repositories/asset.repository';
import { minioEnv, startDisposableMinio, type DisposableMinio } from './disposable-minio';

export interface AssetIntakeTestContext {
  readonly moduleRef: TestingModule;
  readonly database: DisposableDatabase;
  readonly minio: DisposableMinio;
  readonly intake: AssetIntakeService;
  readonly storage: ObjectStoragePort;
  readonly assets: AssetRepository;
  readonly transactions: TransactionManager;
  /** The injected deadline timer, so §25.28 needs no wall-clock wait. */
  readonly timer: ControllableUploadTimer;
  /** The environment the object keys are namespaced by. */
  readonly environment: string;
  get<T>(token: unknown): T;
  /** Raw SQL against the disposable database, for asserting durable state. */
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

/**
 * A timer that never fires unless a test asks it to, so the 300-second hard
 * duration is exercised deterministically instead of by waiting.
 */
export class ControllableUploadTimer extends UploadTimer {
  private pending: (() => void)[] = [];

  override schedule(_delayMs: number, onDeadline: () => void): () => void {
    this.pending.push(onDeadline);
    return () => {
      this.pending = this.pending.filter((entry) => entry !== onDeadline);
    };
  }

  /** Fires every scheduled deadline, as the real clock eventually would. */
  fireAll(): void {
    const pending = this.pending;
    this.pending = [];
    for (const onDeadline of pending) {
      onDeadline();
    }
  }

  get pendingCount(): number {
    return this.pending.length;
  }
}

function persistentDatabaseName(): string {
  return new URL(resolveDatabaseUrl()).pathname.replace(/^\//, '');
}

export async function createAssetIntakeContext(label: string): Promise<AssetIntakeTestContext> {
  const cleanup = new CleanupStack();

  const minio = await startDisposableMinio();
  cleanup.push('stop minio', () => minio.stop());

  const database = await createDisposableDatabase(label);
  cleanup.push('drop database', () => database.drop());
  if (database.name === persistentDatabaseName()) {
    await cleanup.run();
    throw new Error('Refusing to run the intake suite against the persistent database.');
  }

  const previous = new Map<string, string | undefined>();
  const setEnv = (name: string, value: string): void => {
    previous.set(name, process.env[name]);
    process.env[name] = value;
  };
  setEnv('DATABASE_URL', database.url);
  setEnv('NODE_ENV', 'test');
  for (const [name, value] of Object.entries(minioEnv(minio))) {
    setEnv(name, value);
  }

  const timer = new ControllableUploadTimer();

  try {
    // The platform modules are `@Global()`, but a global module still has to be
    // *loaded* by the graph. `AppModule` loads them at the root; this harness
    // builds a narrower graph, so it loads the same three explicitly rather
    // than pulling in every unrelated feature module.
    const moduleRef = await Test.createTestingModule({
      imports: [RequestContextModule, LoggingModule, AuditContextModule, AssetIntakeModule],
    })
      .overrideProvider(UploadTimer)
      .useValue(timer)
      .compile();
    await moduleRef.init();
    cleanup.push('close module', () => moduleRef.close());

    const storage = moduleRef.get<ObjectStoragePort>(OBJECT_STORAGE);
    // The adapter creates them idempotently and private-only; without this the
    // very first upload would fail on a missing bucket rather than on the
    // behaviour under test.
    await storage.ensurePrivateBuckets();

    return {
      moduleRef,
      database,
      minio,
      intake: moduleRef.get(AssetIntakeService),
      storage,
      assets: moduleRef.get<AssetRepository>(ASSET_REPOSITORY),
      transactions: moduleRef.get(TransactionManager),
      timer,
      environment: 'test',
      get: <T>(token: unknown): T => moduleRef.get<T>(token as never),
      query: async <T>(sql: string, params: readonly unknown[] = []): Promise<T[]> => {
        const result = await database.client.pool.query(sql, [...params]);
        return result.rows as T[];
      },
      close: async () => {
        for (const [name, value] of previous) {
          if (value === undefined) {
            delete process.env[name];
          } else {
            process.env[name] = value;
          }
        }
        await cleanup.run();
      },
    };
  } catch (error: unknown) {
    await cleanup.run();
    throw error;
  }
}

export { ControllableUploadTimer as UploadTimerDouble };
export type { IdempotencyKey };
