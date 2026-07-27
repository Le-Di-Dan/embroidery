/**
 * The Asset capability's composition root (APP2-W01 §19).
 *
 * Registration happens in `onModuleInit`, which Nest runs for every module
 * before the first `onApplicationBootstrap` — and `onApplicationBootstrap` is
 * where the poll loop starts. So the handler is guaranteed to be in the
 * registry before a single claim query is issued, without this module having to
 * know anything about the poll loop's ordering.
 *
 * `WorkerRuntimeModule` is imported, never the other way round: the generic job
 * runtime must not depend on any capability, or adding a second one would mean
 * editing it.
 */
import { Module, type OnModuleInit } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { WorkerRuntimeModule } from '../../runtime/worker-runtime.module';
import { JobHandlerRegistry } from '../../runtime/registry/job-handler.registry';
import { AssetInspectionUseCase } from './application/asset-inspection.usecase';
import { DerivativeCleanupService } from './application/derivative-cleanup.service';
import { DerivativeGenerationService } from './application/derivative-generation.service';
import { SourceVerificationService } from './application/source-verification.service';
import { AssetInspectionHandler } from './asset-inspection.handler';
import { ASSET_INSPECTION_REPOSITORY } from './domain/repositories/asset-inspection.repository';
import { SqlAssetInspectionRepository } from './infrastructure/persistence/sql-asset-inspection.repository';

@Module({
  imports: [DatabaseModule, WorkerRuntimeModule],
  providers: [
    { provide: ASSET_INSPECTION_REPOSITORY, useClass: SqlAssetInspectionRepository },
    SourceVerificationService,
    DerivativeGenerationService,
    DerivativeCleanupService,
    AssetInspectionUseCase,
    AssetInspectionHandler,
  ],
  exports: [AssetInspectionHandler],
})
export class AssetInspectionModule implements OnModuleInit {
  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly handler: AssetInspectionHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.handler);
  }
}
