/**
 * The PostgreSQL job runtime (APP2-I02).
 *
 * The registry is provided **empty**. I02 delivers the runtime; W01 delivers
 * the Asset handlers. An empty production registry is a valid, safe state: the
 * worker boots, reports ready, claims nothing and touches no event — including
 * events a future deployment will own.
 *
 * `WORKER_STARTUP_GATE` is injected but deliberately **not** provided here
 * (APP2-I03): the gate is a composition decision, and binding a permissive
 * default in the generic runtime is exactly how an unguarded worker would reach
 * production unnoticed. A graph that forgets to bind one fails to resolve, out
 * loud, at construction.
 */
import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { WORKER_CLOCK, systemWorkerClock } from './clock/worker-clock';
import { JobExecutionService } from './execution/job-execution.service';
import { WorkerFatalService } from './lifecycle/worker-fatal.service';
import { WORKER_PROCESS, systemWorkerProcess } from './lifecycle/worker-process';
import { JobPollRuntimeService } from './poll/job-poll-runtime.service';
import { WorkerPolicyService } from './policy/worker-policy.service';
import { JobHandlerRegistry } from './registry/job-handler.registry';

@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: WORKER_CLOCK, useValue: systemWorkerClock },
    { provide: WORKER_PROCESS, useValue: systemWorkerProcess },
    JobHandlerRegistry,
    WorkerPolicyService,
    WorkerFatalService,
    JobExecutionService,
    JobPollRuntimeService,
  ],
  // `WORKER_CLOCK` is exported by `APP5-B02`, whose intake sweep is the first
  // capability with a schedule of its own. One clock per process rather than a
  // second binding in that module: the point of an injectable clock is that a
  // suite can replace *the* clock, and two would make that half-true.
  exports: [
    JobHandlerRegistry,
    JobPollRuntimeService,
    WorkerPolicyService,
    WorkerFatalService,
    WORKER_CLOCK,
  ],
})
export class WorkerRuntimeModule {}
