import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { bootstrapMetricsListener } from '@embroidery/observability';

import { WorkerModule } from './bootstrap/worker.module';
import { WorkerJsonLogger } from './runtime/logging/worker-json-logger';
import { WORKER_METRIC_REGISTRY } from './runtime/metrics/worker-metrics.providers';
import { WorkerFatalService } from './runtime/lifecycle/worker-fatal.service';
import { JobPollRuntimeService } from './runtime/poll/job-poll-runtime.service';

/**
 * Budget for the failure-path close, mirroring `FATAL_EXIT_SAFETY_MS`'s reason
 * for existing: a pool that refuses to close must not be able to turn a failed
 * start into an indefinite one. The exit is the guarantee, not the close.
 */
const BOOTSTRAP_ABORT_BUDGET_MS = 5_000;

async function bootstrap(): Promise<void> {
  // `APP12-H03` §12/§13 — one-line JSON for every record, framework lines
  // included, so a Loki query can parse the worker's output the way it already
  // parses the API's. Passed to the factory rather than set afterwards, so the
  // module-initialisation lines are structured too.
  const logger = new WorkerJsonLogger();

  // `APP12-E01` §3.2 / `FU-APP12-H07-03` — every fallible step of the start is
  // inside one guarded region, and its failure path ends the process rather
  // than only marking it failed.
  //
  // The defect this replaces: `createApplicationContext` runs the
  // `onApplicationBootstrap` hooks, which start the job poll loop, the
  // intake-cleanup timer and the reservation-expiry timer. A throw *after* that
  // — from a later hook, from the metrics listener, or from the readiness probe
  // — used to log one line and set `process.exitCode = 1`. Those timers hold
  // the event loop open, so that code was never reached: the process stayed
  // alive, half-started, with no metrics listener bound and no failing probe,
  // and only an operator's rollout restart recovered it.
  //
  // `process.exit` is deliberate, not a convenience. When the throw comes out
  // of the factory itself there is no context handle to close, so the started
  // timers are unreachable from here; the process boundary is the only
  // mechanism that can stop them. When there *is* a handle the close is
  // attempted first, bounded, so a healthy pool still drains.
  let app: INestApplicationContext | undefined;
  let closeMetrics: () => Promise<void> = async () => {};
  try {
    app = await NestFactory.createApplicationContext(WorkerModule, { logger });

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
    const context = app;
    context.get(WorkerFatalService).registerCloser(() => context.close());

    // `APP12-H03` §10 — the worker's only HTTP surface, and deliberately not a
    // business one: a separate internal port serving exactly `/metrics`, absent
    // from the Gateway and from OpenAPI. It exists so the worker can be scraped
    // without inventing an API for a process that has none.
    //
    // It is **not** a probe target and changes no liveness semantics: the
    // worker's health contract is still process liveness, and a listener that
    // fails to bind is logged and stepped over (§19).
    const metrics = await bootstrapMetricsListener({
      registry: context.get(WORKER_METRIC_REGISTRY),
      env: process.env,
      onError: (error: unknown) => {
        new Logger('WorkerBootstrap').error(
          `Metrics listener: ${error instanceof Error ? error.message : 'unknown failure'}`,
        );
      },
    });
    // A listening socket holds the event loop open. On the signal path
    // `useProcessExit` ends the process regardless, but the startup-gate path
    // below closes the context and merely sets an exit code — so without an
    // explicit close the worker would refuse to start *and then never exit*,
    // which is worse than either outcome on its own.
    closeMetrics = async (): Promise<void> => {
      await metrics.listener?.close();
    };

    new Logger('WorkerBootstrap').log(
      metrics.status === 'listening'
        ? `Worker metrics listening on internal port ${String(metrics.port)}`
        : `Worker metrics listener ${metrics.status}`,
    );

    // Reported once at startup so an operator can tell "idle because it is
    // correctly configured and has no handlers registered yet" from "idle
    // because its policy is missing" without attaching a debugger.
    const readiness = await context.get(JobPollRuntimeService).readiness();
    new Logger('WorkerBootstrap').log(
      `Worker readiness: ${readiness.ready ? 'ready' : 'not ready'} (${readiness.reason}).`,
    );

    // A closed startup gate is a failed start, not a degraded one (APP2-I03 §7):
    // the object store is a hard precondition for the work this worker exists to
    // do. The context is closed exactly once here — nothing else holds it — so
    // the database pool cannot keep a failed process alive, and the non-zero exit
    // is what an orchestrator restarts on. A missing *policy* deliberately keeps
    // the old behaviour: the process stays up and idle, because an operator
    // publishes that policy into the same database the worker is already reading.
    if (readiness.reason === 'STARTUP_GATE_CLOSED') {
      await closeMetrics();
      await context.close();
      process.exitCode = 1;
    }
  } catch (error: unknown) {
    await abortStart(error, app, closeMetrics);
  }
}

/**
 * Ends a start that failed before the worker was ever ready.
 *
 * One line naming the failure — the same opaque projection the rest of the
 * runtime logs — then a bounded best-effort close, then a deterministic
 * non-zero exit.
 */
async function abortStart(
  error: unknown,
  app: INestApplicationContext | undefined,
  closeMetrics: () => Promise<void>,
): Promise<void> {
  new Logger('WorkerBootstrap').error(
    `Worker bootstrap failed before readiness; exiting. ` +
      (error instanceof Error ? error.message : String(error)),
  );
  await Promise.race([releaseStart(app, closeMetrics), delay(BOOTSTRAP_ABORT_BUDGET_MS)]);
  process.exit(1);
}

async function releaseStart(
  app: INestApplicationContext | undefined,
  closeMetrics: () => Promise<void>,
): Promise<void> {
  // Neither close may prevent the exit, so each failure is swallowed after
  // being named. The exit above is what actually stops the started timers.
  try {
    await closeMetrics();
  } catch {
    new Logger('WorkerBootstrap').error('Closing the metrics listener during abort failed.');
  }
  try {
    await app?.close();
  } catch {
    new Logger('WorkerBootstrap').error('Closing the worker context during abort failed.');
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const handle = setTimeout(resolve, ms);
    handle.unref?.();
  });
}

// Nothing above rejects any more — `bootstrap` owns its own failure path — but
// a rejection that somehow escapes it must still end the process rather than
// become an unhandled rejection warning.
bootstrap().catch((error: unknown) => {
  new Logger('WorkerBootstrap').error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
