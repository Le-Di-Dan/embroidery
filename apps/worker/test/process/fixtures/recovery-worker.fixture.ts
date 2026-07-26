/**
 * Worker B — the recovery process (FD1 §8).
 *
 * A second real container with its own worker instance id, started only after
 * worker A's container has actually terminated and the lease has expired. It
 * reclaims the abandoned row, succeeds, and exits 0 on its own.
 *
 * Test-only. Compiled solely by the `process-test` Docker target.
 */
import { Logger, Module } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { executeRaw, sql } from '@embroidery/database';
import { DATABASE_CONNECTION } from '@embroidery/persistence';
import type { DatabaseConnection } from '@embroidery/persistence';

import { WorkerModule } from '../../../src/bootstrap/worker.module';
import { JobPollRuntimeService } from '../../../src/runtime/poll/job-poll-runtime.service';
import type { JobHandler } from '../../../src/runtime/registry/job-handler';
import { JobHandlerRegistry } from '../../../src/runtime/registry/job-handler.registry';
import { WorkerRuntimeModule } from '../../../src/runtime/worker-runtime.module';
import { PROCESS_TEST_EVENT, recordProbe } from './process-probe';

const ROLE = 'WORKER_B';
const WATCH_INTERVAL_MS = 200;
const WATCH_TIMEOUT_MS = 120_000;

function cooperativeHandler(workerId: () => string): JobHandler {
  return {
    eventType: PROCESS_TEST_EVENT,
    jobKind: 'OUTBOX_DISPATCH',
    payloadSchemaVersion: 1,
    validatePayload: (payload) => ({ valid: true, payload }),
    deriveEffectKey: (_payload, id) => `fd1-effect:${id.toString()}`,
    execute: async (_payload, context) => {
      const jobKey = context.outboxEventId.toString();
      await recordProbe({
        jobKey,
        workerRole: ROLE,
        workerId: workerId(),
        event: 'HANDLER_STARTED',
      });
      await recordProbe({
        jobKey,
        workerRole: ROLE,
        workerId: workerId(),
        event: 'HANDLER_SUCCEEDED',
      });
    },
  };
}

let resolveWorkerId: () => string = () => 'unknown';

@Module({ imports: [WorkerModule, WorkerRuntimeModule] })
class RecoveryFixtureModule implements OnModuleInit {
  constructor(private readonly registry: JobHandlerRegistry) {}

  onModuleInit(): void {
    this.registry.register(cooperativeHandler(() => resolveWorkerId()));
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bootstrap(): Promise<void> {
  const logger = new Logger('WorkerBFixture');
  await recordProbe({ jobKey: '-', workerRole: ROLE, workerId: 'pending', event: 'PROCESS_START' });

  const app = await NestFactory.createApplicationContext(RecoveryFixtureModule);
  app.enableShutdownHooks(undefined, { useProcessExit: true });

  const runtime = app.get(JobPollRuntimeService);
  resolveWorkerId = () => runtime.workerInstanceId;

  const readiness = await runtime.readiness();
  logger.log(
    `Worker B readiness: ${readiness.ready ? 'ready' : 'not ready'} (${readiness.reason}).`,
  );
  await recordProbe({
    jobKey: '-',
    workerRole: ROLE,
    workerId: runtime.workerInstanceId,
    event: 'PROCESS_READY',
  });

  // Self-terminating: waits for the row it reclaimed to reach DISPATCHED, then
  // shuts down cleanly. The orchestrator never has to guess when B is done.
  const connection = app.get<DatabaseConnection>(DATABASE_CONNECTION);
  const deadline = Date.now() + WATCH_TIMEOUT_MS;
  let dispatched = false;
  while (!dispatched && Date.now() < deadline) {
    const rows = await executeRaw<{ total: number }>(
      connection.database,
      sql`SELECT count(*)::int AS total FROM outbox_events
          WHERE event_type = ${PROCESS_TEST_EVENT} AND status = 'DISPATCHED'`,
    );
    dispatched = Number(rows[0]?.total ?? 0) > 0;
    if (!dispatched) {
      await delay(WATCH_INTERVAL_MS);
    }
  }

  await recordProbe({
    jobKey: '-',
    workerRole: ROLE,
    workerId: runtime.workerInstanceId,
    event: 'PROCESS_STOPPING',
  });
  await app.close();
  process.exit(dispatched ? 0 : 1);
}

bootstrap().catch((error: unknown) => {
  new Logger('WorkerBFixture').error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
