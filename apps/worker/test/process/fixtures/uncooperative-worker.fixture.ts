/**
 * Worker A — the uncooperative handler, in a real Linux process (FD1 §7).
 *
 * Runs the genuine Nest worker runtime as PID 1 with the **production**
 * process-exit seam. Nothing here is injected, mocked or emitted: when the
 * handler refuses to settle, the real `process.exit(1)` ends the real container.
 * That is the whole point — the C1 evidence recorded an exit instead of
 * performing one, so worker A's runaway promise stayed alive and the "no
 * overlap" claim rested on ordering rather than on the process being gone.
 *
 * Test-only. Compiled solely by the `process-test` Docker target.
 */
import { Logger, Module } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { WorkerModule } from '../../../src/bootstrap/worker.module';
import { WorkerFatalService } from '../../../src/runtime/lifecycle/worker-fatal.service';
import { JobPollRuntimeService } from '../../../src/runtime/poll/job-poll-runtime.service';
import type { JobHandler } from '../../../src/runtime/registry/job-handler';
import { JobHandlerRegistry } from '../../../src/runtime/registry/job-handler.registry';
import { WorkerRuntimeModule } from '../../../src/runtime/worker-runtime.module';
import { PROCESS_TEST_EVENT, recordProbe } from './process-probe';

const ROLE = 'WORKER_A';

/**
 * Ignores its `AbortSignal` and never settles — the exact shape the runtime
 * cannot cancel. No external side effect: the only trace is one probe row.
 */
function uncooperativeHandler(workerId: () => string): JobHandler {
  return {
    eventType: PROCESS_TEST_EVENT,
    jobKind: 'OUTBOX_DISPATCH',
    payloadSchemaVersion: 1,
    validatePayload: (payload) => ({ valid: true, payload }),
    deriveEffectKey: (_payload, id) => `fd1-effect:${id.toString()}`,
    execute: async (_payload, context) => {
      await recordProbe({
        jobKey: context.outboxEventId.toString(),
        workerRole: ROLE,
        workerId: workerId(),
        event: 'HANDLER_STARTED',
      });
      // Never settles, and never checks the signal.
      return new Promise<void>(() => undefined);
    },
  };
}

let resolveWorkerId: () => string = () => 'unknown';

@Module({ imports: [WorkerModule, WorkerRuntimeModule] })
class UncooperativeFixtureModule implements OnModuleInit {
  constructor(private readonly registry: JobHandlerRegistry) {}

  /**
   * `onModuleInit` runs before `onApplicationBootstrap`, so the handler is
   * registered before the poll loop reads the registry — the same ordering a
   * production module would have.
   */
  onModuleInit(): void {
    this.registry.register(uncooperativeHandler(() => resolveWorkerId()));
  }
}

async function bootstrap(): Promise<void> {
  const logger = new Logger('WorkerAFixture');
  await recordProbe({ jobKey: '-', workerRole: ROLE, workerId: 'pending', event: 'PROCESS_START' });

  const app = await NestFactory.createApplicationContext(UncooperativeFixtureModule);
  app.enableShutdownHooks(undefined, { useProcessExit: true });

  const runtime = app.get(JobPollRuntimeService);
  resolveWorkerId = () => runtime.workerInstanceId;

  // The fatal path awaits this closer before exiting, inside the
  // `fatalExitSafetyMs` budget — so recording the transition here is
  // deterministic rather than a race against a polling observer.
  app.get(WorkerFatalService).registerCloser(async () => {
    await recordProbe({
      jobKey: '-',
      workerRole: ROLE,
      workerId: runtime.workerInstanceId,
      event: 'FATAL_STATE_ENTERED',
    });
    await app.close();
  });

  const readiness = await runtime.readiness();
  logger.log(
    `Worker A readiness: ${readiness.ready ? 'ready' : 'not ready'} (${readiness.reason}).`,
  );
  if (readiness.ready) {
    await recordProbe({
      jobKey: '-',
      workerRole: ROLE,
      workerId: runtime.workerInstanceId,
      event: 'PROCESS_READY',
    });
  }
}

bootstrap().catch((error: unknown) => {
  new Logger('WorkerAFixture').error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
