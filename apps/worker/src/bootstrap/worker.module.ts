import { Module } from '@nestjs/common';

import { WorkerLifecycleService } from './worker-lifecycle.service';

@Module({
  providers: [WorkerLifecycleService],
})
export class WorkerModule {}
