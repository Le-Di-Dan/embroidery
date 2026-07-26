import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { WorkerRuntimeModule } from '../runtime/worker-runtime.module';

/**
 * The worker uses the same persistence runtime as the API (DEC-DB7-003), with
 * its own pool: the two processes are deployed and scaled independently, so
 * sharing a pool object across them is not possible and sharing pool *sizing*
 * would be wrong.
 *
 * The no-op keep-alive service that used to live here is gone (APP2-I02): the
 * queue decision has landed (IMP-D029 / ADR-APP2-002), and the poll runtime
 * plus the connection pool now hold the event loop open for a real reason.
 */
@Module({
  imports: [DatabaseModule, WorkerRuntimeModule],
})
export class WorkerModule {}
