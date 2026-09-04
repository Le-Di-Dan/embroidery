/**
 * Live-worker harness for the `APP7-W01` conversion suites.
 *
 * Boots the real `WorkerModule` — real registry, real `WorkerJobQueueRepository`,
 * real `JobExecutionService`, real transactions, real `IdempotencyStore` —
 * against a disposable database with every migration applied. The conversion is
 * therefore exercised through the same claim, lease and completion path
 * production uses, not through a hand-called use case.
 *
 * The startup gate is held **closed**, exactly as the delivered `APP4-W01`
 * harness holds it: the poll loop must not claim, because these suites drive one
 * attempt at a time through {@link OrderConversionContext.runOnce} and a loop
 * racing them would make "did a second attempt run?" unanswerable.
 *
 * ### Two pools, for the CC-11 race
 *
 * {@link OrderConversionContext.spawnActor} compiles **another** independently
 * pooled `WorkerModule` against the **same** disposable database. That is what
 * `APP7-W01` §14 requires and what a single-connection `Promise.all` cannot
 * give: two conversions on separate PostgreSQL backends, genuinely able to block
 * on each other's `INSERT … ON CONFLICT` and on `uq_orders__request`. The
 * delivered `db8-concurrency-context.ts` makes the same argument for the API.
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
import { DESIGN_APPROVED_EVENT_TYPE } from '../domain/design-approved.payload';
import { STOREFRONT_PUBLIC_ORIGIN_ENV } from '../../notification-delivery/config/storefront-origin.config';
import { NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV } from '@embroidery/notification-delivery';

/**
 * A budget of two attempts.
 *
 * Enough for a suite to observe that a transient failure retries and a terminal
 * one does not, without any suite waiting on a real backoff: the delays are
 * milliseconds, and the conversion never sleeps.
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

export interface OrderConversionActor {
  readonly label: string;
  get<T>(token: unknown): T;
  runOnce(): Promise<AttemptSummary | undefined>;
  close(): Promise<void>;
}

export interface OrderConversionContext extends OrderConversionActor {
  readonly moduleRef: TestingModule;
  readonly disposable: DisposableDatabase;
  /** Another independently pooled worker against the same database. */
  spawnActor(label: string): Promise<OrderConversionActor>;
  /** Raw row snapshot, outside every actor's transaction. */
  rows<T extends Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T[]>;
}

export async function startOrderConversionWorker(label: string): Promise<OrderConversionContext> {
  const disposable = await createDisposableDatabase(label);
  const restoreEnv = applyEnvironment(disposable.url);

  const spawned: OrderConversionActor[] = [];
  let primary: { moduleRef: TestingModule; actor: OrderConversionActor };
  try {
    primary = await compileWorker('primary');
    await publishRuntimePolicy(primary.moduleRef, disposable);
    await primary.moduleRef.init();
  } catch (error: unknown) {
    restoreEnv();
    await disposable.drop();
    throw error;
  }

  async function compileWorker(
    actorLabel: string,
  ): Promise<{ moduleRef: TestingModule; actor: OrderConversionActor }> {
    const moduleRef = await Test.createTestingModule({ imports: [WorkerModule] })
      .overrideProvider(WORKER_PROCESS)
      .useValue({ exit: () => undefined })
      // Closed on purpose: these suites drive attempts themselves.
      .overrideProvider(WORKER_STARTUP_GATE)
      .useValue({ ensureReady: () => Promise.resolve({ ok: false, errorClass: 'TEST_HELD' }) })
      .compile();

    const workerInstanceId = `app7-w01-${actorLabel}-${newId()}`;
    const actor: OrderConversionActor = {
      label: actorLabel,
      get: <T>(token: unknown): T => moduleRef.get<T>(token as never),
      runOnce: async (): Promise<AttemptSummary | undefined> => {
        const registry = moduleRef.get(JobHandlerRegistry);
        const queue = moduleRef.get(WorkerJobQueueRepository);
        const transactions = moduleRef.get(TransactionManager);
        const claimed = await transactions.runInTransaction(() =>
          queue.claimRegisteredBatch({
            workerInstanceId,
            // The real registry, narrowed to the event this suite drives.
            //
            // Narrowed by `APP12-H03-C1`, which registered a consumer for
            // `order.created` — a row **this capability itself appends** on every
            // successful conversion. An unfiltered claim then returned that row
            // to the next `runOnce()`, and each assertion silently read the
            // previous case's acknowledgement instead of its own conversion.
            //
            // The narrowing costs nothing this suite was proving: the claim
            // filter still comes from the production registry, and "a live
            // worker asks for `design.approved`" is asserted directly against
            // `registeredTypes()` in the spec.
            registeredTypes: registry
              .registeredTypes()
              .filter((type) => type.eventType === DESIGN_APPROVED_EVENT_TYPE),
            // One row per call, so "no second conversion" is measured against a
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
      close: () => moduleRef.close(),
    };
    return { moduleRef, actor };
  }

  primary.moduleRef.get(WorkerFatalService).registerCloser(() => primary.moduleRef.close());

  let closed = false;
  return {
    ...primary.actor,
    moduleRef: primary.moduleRef,
    disposable,
    spawnActor: async (actorLabel: string): Promise<OrderConversionActor> => {
      const compiled = await compileWorker(actorLabel);
      await compiled.moduleRef.init();
      compiled.moduleRef.get(WorkerFatalService).registerCloser(() => compiled.moduleRef.close());
      spawned.push(compiled.actor);
      return compiled.actor;
    },
    rows: async <T extends Record<string, unknown>>(
      query: ReturnType<typeof sql>,
    ): Promise<T[]> => [...(await executeRaw<T>(disposable.client.db, query))],
    close: async (): Promise<void> => {
      if (closed) return;
      closed = true;
      await Promise.all(spawned.splice(0).map((actor) => actor.close()));
      await primary.moduleRef.close();
      restoreEnv();
      await disposable.drop();
    },
  };
}

/** Counts rows, as every suite here asserts on counts. */
export async function countRows(
  context: OrderConversionContext,
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
  process.env[NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV] = syntheticEnvelopeKey();
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

function syntheticEnvelopeKey(): string {
  return randomBytes(32).toString('base64');
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
        VALUES (${adminId}, ${`w01-${adminId}@example.com`}, 'W01 Fixture', 'ACTIVE')`,
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
      reason: 'APP7-W01 integration fixture.',
    });
  });
}
