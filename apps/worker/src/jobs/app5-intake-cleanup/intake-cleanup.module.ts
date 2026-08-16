/**
 * The APP5 intake cleanup capability's composition root (`APP5-B02` §7.3).
 *
 * Unlike the three capabilities beside it this module registers **no handler**:
 * expiry produces no outbox event, so there is nothing for
 * `JobHandlerRegistry` to route. What it contributes instead is its own small
 * schedule, and that is why it imports `WorkerRuntimeModule` — for
 * `WORKER_CLOCK`, so the sweep's sleep is the same injectable delay the poll
 * loop uses and is therefore testable without a real five-minute wait.
 *
 * `WorkerObjectStorageModule` is imported because phase 2 deletes the binary.
 * That import is also the reason this module is separate from
 * `AssetInspectionModule`, which needs storage for a different purpose and on a
 * different trigger: folding a periodic sweep into an event handler's module
 * would give the handler a lifecycle hook it has no use for.
 *
 * It exports the use case so a focused suite can drive one pass directly
 * instead of waiting for the schedule — the schedule itself is one line of
 * behaviour and is proved separately.
 */
import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { WorkerRuntimeModule } from '../../runtime/worker-runtime.module';
import { WorkerObjectStorageModule } from '../../storage/object-storage.module';
import { IntakeCleanupUseCase } from './application/intake-cleanup.usecase';
import { INTAKE_CLEANUP_REPOSITORY } from './domain/repositories/intake-cleanup.repository';
import { SqlIntakeCleanupRepository } from './infrastructure/persistence/sql-intake-cleanup.repository';
import { IntakeCleanupRuntimeService } from './intake-cleanup.runtime';

@Module({
  imports: [DatabaseModule, WorkerRuntimeModule, WorkerObjectStorageModule],
  providers: [
    { provide: INTAKE_CLEANUP_REPOSITORY, useClass: SqlIntakeCleanupRepository },
    IntakeCleanupUseCase,
    IntakeCleanupRuntimeService,
  ],
  exports: [IntakeCleanupUseCase],
})
export class IntakeCleanupModule {}
