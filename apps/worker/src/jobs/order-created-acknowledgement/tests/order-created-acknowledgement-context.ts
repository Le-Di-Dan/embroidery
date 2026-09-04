/**
 * Live-worker harness for the `order.created` acknowledgement suite
 * (`APP12-H03-C1` §11).
 *
 * The sixth instance of the per-capability harness pattern — `asset-inspection`,
 * `asset-normalization`, `notification-delivery`, `order-conversion` and
 * `inventory-reservation` each own one — and it exists for the same reason they
 * do: the generic `startWorkerRuntime` helper **clears the registry** and
 * registers only the synthetic handlers a runtime suite asks for, which is
 * exactly wrong here. The defect under test is what a deployed worker *claims*,
 * so the production registry has to be the real one.
 *
 * The startup gate is held closed and attempts are driven one at a time through
 * {@link runOnce}, as the inventory harness does: a poll loop racing the
 * assertions would make "was this row claimed at all?" — the question this whole
 * suite asks — unanswerable.
 *
 * Test-only. Build-excluded via `src/**` + `tests/**`.
 */
import { randomBytes } from 'node:crypto';

import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { executeRaw, newId, sql } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { createDisposableDatabase } from '@embroidery/database/testing';
import {
  PolicyConfigurationRepository,
  TransactionManager,
  WorkerJobQueueRepository,
} from '@embroidery/persistence';
import { NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV } from '@embroidery/notification-delivery';

import { WorkerModule } from '../../../bootstrap/worker.module';
import { JobExecutionService } from '../../../runtime/execution/job-execution.service';
import type { AttemptSummary } from '../../../runtime/execution/job-execution.service';
import { WorkerFatalService } from '../../../runtime/lifecycle/worker-fatal.service';
import { WORKER_PROCESS } from '../../../runtime/lifecycle/worker-process';
import { JobHandlerRegistry } from '../../../runtime/registry/job-handler.registry';
import { WORKER_STARTUP_GATE } from '../../../runtime/startup/startup-gate';
import type { WorkerRuntimePolicy } from '../../../runtime/policy/worker-runtime-policy';
import {
  WORKER_RUNTIME_POLICY_KEY,
  WORKER_RUNTIME_POLICY_SCHEMA_VERSION,
} from '../../../runtime/policy/worker-runtime-policy';
import { applyOfflineObjectStorageEnv } from '../../../runtime/tests/offline-object-storage-env';
import { STOREFRONT_PUBLIC_ORIGIN_ENV } from '../../notification-delivery/config/storefront-origin.config';

/** A budget of two attempts, with millisecond delays. Nothing here sleeps. */
const RUNTIME_POLICY: WorkerRuntimePolicy = {
  concurrency: 2,
  batchSize: 5,
  pollIntervalMs: 25,
  leaseDurationMs: 30_000,
  handlerTimeoutMs: 20_000,
  leaseSafetyMarginMs: 1_000,
  shutdownGraceMs: 300,
  maxAttempts: 2,
  backoffBaseMs: 10,
  backoffMaxMs: 200,
};

/** A `.invalid` host, reserved by RFC 2606: the worker composition needs one. */
const TEST_STOREFRONT_ORIGIN = 'https://storefront.test.invalid';

export interface AcknowledgementContext {
  readonly moduleRef: TestingModule;
  readonly disposable: DisposableDatabase;
  get<T>(token: unknown): T;
  /** Claims and runs at most one job. `undefined` when nothing was claimable. */
  runOnce(): Promise<AttemptSummary | undefined>;
  rows<T extends Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T[]>;
  close(): Promise<void>;
}

export async function startAcknowledgementWorker(label: string): Promise<AcknowledgementContext> {
  const disposable = await createDisposableDatabase(label);
  const restoreEnv = applyEnvironment(disposable.url);

  let moduleRef: TestingModule;
  try {
    moduleRef = await Test.createTestingModule({ imports: [WorkerModule] })
      .overrideProvider(WORKER_PROCESS)
      .useValue({ exit: () => undefined })
      .overrideProvider(WORKER_STARTUP_GATE)
      .useValue({ ensureReady: () => Promise.resolve({ ok: false, errorClass: 'TEST_HELD' }) })
      .compile();
    await publishRuntimePolicy(moduleRef, disposable);
    await moduleRef.init();
  } catch (error: unknown) {
    restoreEnv();
    await disposable.drop();
    throw error;
  }

  moduleRef.get(WorkerFatalService).registerCloser(() => moduleRef.close());
  const workerInstanceId = `app12-h03-c1-${newId()}`;
  let closed = false;

  return {
    moduleRef,
    disposable,
    get: <T>(token: unknown): T => moduleRef.get<T>(token as never),
    runOnce: async (): Promise<AttemptSummary | undefined> => {
      const registry = moduleRef.get(JobHandlerRegistry);
      const queue = moduleRef.get(WorkerJobQueueRepository);
      const claimed = await moduleRef.get(TransactionManager).runInTransaction(() =>
        queue.claimRegisteredBatch({
          workerInstanceId,
          // The **production** claim filter. An unregistered event type is
          // absent from it, which is the property this suite is built to check.
          registeredTypes: registry.registeredTypes(),
          batchSize: 1,
          leaseDurationMs: RUNTIME_POLICY.leaseDurationMs,
        }),
      );
      const job = claimed[0];
      return job === undefined
        ? undefined
        : moduleRef.get(JobExecutionService).run(job, RUNTIME_POLICY, workerInstanceId);
    },
    rows: async <T extends Record<string, unknown>>(
      query: ReturnType<typeof sql>,
    ): Promise<T[]> => [...(await executeRaw<T>(disposable.client.db, query))],
    close: async (): Promise<void> => {
      if (closed) return;
      closed = true;
      await moduleRef.close();
      restoreEnv();
      await disposable.drop();
    },
  };
}

function applyEnvironment(databaseUrl: string): () => void {
  const previous: Record<string, string | undefined> = {
    DATABASE_URL: process.env['DATABASE_URL'],
    NODE_ENV: process.env['NODE_ENV'],
    [NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV]: process.env[NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV],
    [STOREFRONT_PUBLIC_ORIGIN_ENV]: process.env[STOREFRONT_PUBLIC_ORIGIN_ENV],
  };
  process.env['DATABASE_URL'] = databaseUrl;
  process.env['NODE_ENV'] = 'test';
  // The whole `WorkerModule` is compiled, so the notification capability's
  // fail-fast configuration must be satisfiable. Both values are synthetic and
  // neither is read by anything this suite exercises: a 32-byte key generated
  // per run, never a literal in the repository, and an RFC 2606 host.
  process.env[NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV] = randomBytes(32).toString('base64');
  process.env[STOREFRONT_PUBLIC_ORIGIN_ENV] = TEST_STOREFRONT_ORIGIN;
  const restoreStorage = applyOfflineObjectStorageEnv();

  return (): void => {
    restoreStorage();
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  };
}

/** Publishes the runtime policy through its canonical versioned path. */
async function publishRuntimePolicy(
  moduleRef: TestingModule,
  disposable: DisposableDatabase,
): Promise<void> {
  const adminId = newId();
  await executeRaw(
    disposable.client.db,
    sql`INSERT INTO admin_accounts (id, email, display_name, status)
        VALUES (${adminId}, ${`h03c1-${adminId}@example.com`}, 'C1 Fixture', 'ACTIVE')`,
  );

  const policies = moduleRef.get(PolicyConfigurationRepository);
  await moduleRef.get(TransactionManager).runInTransaction(async () => {
    await policies.ensureKey(WORKER_RUNTIME_POLICY_KEY, 'Worker runtime policy (APP2-I02).');
    await policies.publishVersion({
      configKey: WORKER_RUNTIME_POLICY_KEY,
      value: { ...RUNTIME_POLICY },
      valueSchemaVersion: WORKER_RUNTIME_POLICY_SCHEMA_VERSION,
      effectiveFrom: new Date(),
      createdByAdminId: adminId,
      reason: 'APP12-H03-C1 integration fixture.',
    });
  });
}
