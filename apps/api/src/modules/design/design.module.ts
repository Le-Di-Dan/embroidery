import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { CatalogModule } from '../catalog/catalog.module';
import { APPROVAL_SNAPSHOT_REPOSITORY } from './domain/repositories/approval-snapshot.repository';
import { DESIGN_CASE_REPOSITORY } from './domain/repositories/design-case.repository';
import { DrizzleApprovalSnapshotRepository } from './infrastructure/persistence/drizzle-approval-snapshot.repository';
import { DrizzleDesignCaseRepository } from './infrastructure/persistence/drizzle-design-case.repository';

/**
 * CTX-DSN — design cases, versions and approval snapshots (DB7-CP4).
 *
 * Imports `CatalogModule` for `PLACEMENT_HIERARCHY_PORT` only: the placement
 * chain must be validated before a version or an approval freezes it
 * (G-DB7-13). That is a port, not catalog's repositories, so the module
 * boundary holds.
 */
@Module({
  imports: [DatabaseModule, CatalogModule],
  providers: [
    { provide: DESIGN_CASE_REPOSITORY, useClass: DrizzleDesignCaseRepository },
    { provide: APPROVAL_SNAPSHOT_REPOSITORY, useClass: DrizzleApprovalSnapshotRepository },
  ],
  exports: [DESIGN_CASE_REPOSITORY, APPROVAL_SNAPSHOT_REPOSITORY],
})
export class DesignModule {}
