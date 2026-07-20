import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { PRODUCTION_JOB_REPOSITORY } from './domain/repositories/production-job.repository';
import { DrizzleProductionJobRepository } from './infrastructure/persistence/drizzle-production-job.repository';

/** CTX-PRD — production jobs and their frozen specifications (DB7-CP4). */
@Module({
  imports: [DatabaseModule],
  providers: [{ provide: PRODUCTION_JOB_REPOSITORY, useClass: DrizzleProductionJobRepository }],
  exports: [PRODUCTION_JOB_REPOSITORY],
})
export class ProductionModule {}
