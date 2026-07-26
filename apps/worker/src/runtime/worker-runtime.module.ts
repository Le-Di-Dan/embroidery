/**
 * The PostgreSQL job runtime (APP2-I02).
 *
 * The registry is provided **empty**. I02 delivers the runtime; W01 delivers
 * the Asset handlers. An empty production registry is a valid, safe state: the
 * worker boots, reports ready, claims nothing and touches no event — including
 * events a future deployment will own.
 */
import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { WORKER_CLOCK, systemWorkerClock } from './clock/worker-clock';
import { JobExecutionService } from './execution/job-execution.service';
import { JobPollRuntimeService } from './poll/job-poll-runtime.service';
import { WorkerPolicyService } from './policy/worker-policy.service';
import { JobHandlerRegistry } from './registry/job-handler.registry';

@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: WORKER_CLOCK, useValue: systemWorkerClock },
    JobHandlerRegistry,
    WorkerPolicyService,
    JobExecutionService,
    JobPollRuntimeService,
  ],
  exports: [JobHandlerRegistry, JobPollRuntimeService, WorkerPolicyService],
})
export class WorkerRuntimeModule {}
