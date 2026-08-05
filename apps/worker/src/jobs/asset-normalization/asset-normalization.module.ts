/**
 * The editor-safe normalization capability's composition root (`APP3-W01A`).
 *
 * Registration happens in `onModuleInit`, exactly as `AssetInspectionModule`
 * does, so the handler is in the registry before the poll loop issues its first
 * claim without this module knowing anything about the loop's ordering.
 *
 * `WorkerRuntimeModule` is imported, never the other way round — and this module
 * is the proof that the split works: adding a second capability required no
 * change to a single runtime file. The registry refuses two handlers for one
 * event type, so the two capabilities cannot silently overlap.
 */
import { Module, type OnModuleInit } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { WorkerRuntimeModule } from '../../runtime/worker-runtime.module';
import { JobHandlerRegistry } from '../../runtime/registry/job-handler.registry';
import { AssociationResolutionService } from './application/association-resolution.service';
import { AssetNormalizationUseCase } from './application/asset-normalization.usecase';
import { NormalizedDerivativeService } from './application/normalized-derivative.service';
import { TemplateSvgNormalizationService } from './application/template-svg-normalization.service';
import { AssetNormalizationHandler } from './asset-normalization.handler';
import { ASSET_NORMALIZATION_REPOSITORY } from './domain/repositories/asset-normalization.repository';
import { SqlAssetNormalizationRepository } from './infrastructure/persistence/sql-asset-normalization.repository';

@Module({
  imports: [DatabaseModule, WorkerRuntimeModule],
  providers: [
    { provide: ASSET_NORMALIZATION_REPOSITORY, useClass: SqlAssetNormalizationRepository },
    AssociationResolutionService,
    NormalizedDerivativeService,
    TemplateSvgNormalizationService,
    AssetNormalizationUseCase,
    AssetNormalizationHandler,
  ],
  exports: [AssetNormalizationHandler],
})
export class AssetNormalizationModule implements OnModuleInit {
  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly handler: AssetNormalizationHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.handler);
  }
}
