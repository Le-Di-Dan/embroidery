import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { WorkerModule } from './bootstrap/worker.module';
import { WorkerFatalService } from './runtime/lifecycle/worker-fatal.service';
import { JobPollRuntimeService } from './runtime/poll/job-poll-runtime.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);

  // Nest owns SIGINT/SIGTERM. A second handler here would close the context
  // twice and race the pool shutdown against itself.
  //
  // `useProcessExit` makes a completed shutdown exit **0**. Without it Nest
  // re-raises the signal, so a clean `docker stop` would report 143 — a
  // non-zero code an orchestrator reads as a failed drain. The forced paths
  // exit non-zero themselves, before this ever runs.
  app.enableShutdownHooks(undefined, { useProcessExit: true });

  // The fatal path has to close the context itself: it fires from inside a job
  // attempt, not from a signal, and the runtime cannot reach the context that
  // owns it.
  app.get(WorkerFatalService).registerCloser(() => app.close());

  // Reported once at startup so an operator can tell "idle because it is
  // correctly configured and has no handlers registered yet" from "idle
  // because its policy is missing" without attaching a debugger.
  const readiness = await app.get(JobPollRuntimeService).readiness();
  new Logger('WorkerBootstrap').log(
    `Worker readiness: ${readiness.ready ? 'ready' : 'not ready'} (${readiness.reason}).`,
  );
}

bootstrap().catch((error: unknown) => {
  new Logger('WorkerBootstrap').error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
