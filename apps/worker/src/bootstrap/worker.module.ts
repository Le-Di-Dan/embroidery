import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { WorkerLifecycleService } from './worker-lifecycle.service';

/**
 * The worker uses the same persistence runtime as the API (DEC-DB7-003), with
 * its own pool: the two processes are deployed and scaled independently, so
 * sharing a pool object across them is not possible and sharing pool *sizing*
 * would be wrong.
 */
@Module({
  imports: [DatabaseModule],
  providers: [WorkerLifecycleService],
})
export class WorkerModule {}
