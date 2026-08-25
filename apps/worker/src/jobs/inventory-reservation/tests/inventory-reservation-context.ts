/**
 * Live-worker harness for the `APP8-W01` reservation suite.
 *
 * Boots the real `WorkerModule` — real registry, real `WorkerJobQueueRepository`,
 * real `JobExecutionService`, real transactions, real `IdempotencyStore`, real
 * `InventoryPersistenceModule` — against a disposable database with every
 * migration applied. So what the assertions observe is what a deployed worker
 * would write, not what a hand-called use case would, and the redelivery case
 * exercises the delivered execution idempotency rather than a stand-in.
 *
 * The startup gate is held **closed**, exactly as the delivered `APP4-W01` and
 * `APP7-W01` harnesses hold it: the poll loop must not claim, because this suite
 * drives one attempt at a time through {@link InventoryReservationContext.runOnce}
 * and a loop racing it would make "did a second attempt run?" unanswerable.
 *
 * A per-capability context is the established convention here — `asset-inspection`,
 * `asset-normalization`, `notification-delivery` and `order-conversion` each own
 * one — so this is the fifth instance of the pattern rather than a new one.
 *
 * Single-actor: `APP8-W01` §19.2 permits a new concurrency test only where the
 * multi-SKU orchestration introduces lock behaviour existing tests plus code
 * inspection cannot establish, and it does not — the ordering is a pure function
 * asserted in `reservation-requirements.spec.ts`, and the anchor lock itself is
 * `APP8-B01`/`B02` proven. So no second pool is compiled.
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
import { NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV } from '@embroidery/notification-delivery';

/**
 * A budget of two attempts.
 *
 * Enough to observe that an operational refusal retries and a deterministic one
 * does not, without any case waiting on a real backoff: the delays are
 * milliseconds, and the reservation never sleeps.
 */
export const RUNTIME_POLICY: WorkerRuntimePolicy = {
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

export interface InventoryReservationContext {
  readonly moduleRef: TestingModule;
  readonly disposable: DisposableDatabase;
  get<T>(token: unknown): T;
  runOnce(): Promise<AttemptSummary | undefined>;
  /** Raw row snapshot, outside the worker's transaction. */
  rows<T extends Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T[]>;
  close(): Promise<void>;
}

export async function startInventoryReservationWorker(
  label: string,
): Promise<InventoryReservationContext> {
  const disposable = await createDisposableDatabase(label);
  const restoreEnv = applyEnvironment(disposable.url);

  let moduleRef: TestingModule;
  try {
    moduleRef = await Test.createTestingModule({ imports: [WorkerModule] })
      .overrideProvider(WORKER_PROCESS)
      .useValue({ exit: () => undefined })
      // Closed on purpose: this suite drives attempts itself.
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
  const workerInstanceId = `app8-w01-${newId()}`;
  let closed = false;

  return {
    moduleRef,
    disposable,
    get: <T>(token: unknown): T => moduleRef.get<T>(token as never),
    runOnce: async (): Promise<AttemptSummary | undefined> => {
      const registry = moduleRef.get(JobHandlerRegistry);
      const queue = moduleRef.get(WorkerJobQueueRepository);
      const transactions = moduleRef.get(TransactionManager);
      const claimed = await transactions.runInTransaction(() =>
        queue.claimRegisteredBatch({
          workerInstanceId,
          registeredTypes: registry.registeredTypes(),
          // One row per call, so "no second reservation" is measured against a
          // guard rather than against an abandoned lease.
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

/**
 * Runs the next attempt, waiting for a retryable job's backoff to elapse.
 *
 * `runOnce` claims nothing while `next_attempt_at` is still in the future, so a
 * case that asserts on the attempt *after* a retryable failure would otherwise
 * depend on how long the preceding assertions happened to take. The wait is
 * bounded and throws with a diagnostic rather than hanging, so a job that stops
 * becoming claimable fails here instead of silently returning `undefined`.
 */
export async function runNextAttempt(
  context: InventoryReservationContext,
): Promise<AttemptSummary> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const summary = await context.runOnce();
    if (summary !== undefined) {
      return summary;
    }
    if (Date.now() > deadline) {
      throw new Error('No claimable job appeared within the retry backoff window.');
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Counts rows, as most assertions here are counts of a specific effect. */
export async function countRows(
  context: InventoryReservationContext,
  query: ReturnType<typeof sql>,
): Promise<number> {
  const [row] = await context.rows<{ count: string }>(query);
  return Number(row?.count ?? 0);
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
  // The whole `WorkerModule` is compiled, so the delivered notification
  // capability's fail-fast configuration must be satisfiable. Both values are
  // synthetic and neither is read by anything this checkpoint exercises: a
  // 32-byte key generated per run, never a literal in the repository, and an
  // RFC 2606 host nobody can register.
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
        VALUES (${adminId}, ${`app8-w01-${adminId}@example.com`}, 'W01 Fixture', 'ACTIVE')`,
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
      reason: 'APP8-W01 integration fixture.',
    });
  });
}
