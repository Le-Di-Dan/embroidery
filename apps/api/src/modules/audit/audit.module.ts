import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AUDIT_EVENT_REPOSITORY } from './domain/repositories/audit-event.repository';
import { DrizzleAuditEventRepository } from './infrastructure/persistence/drizzle-audit-event.repository';

/** CTX-AUD — append-only business-action evidence (DB7-CP4). */
@Module({
  imports: [DatabaseModule],
  providers: [{ provide: AUDIT_EVENT_REPOSITORY, useClass: DrizzleAuditEventRepository }],
  exports: [AUDIT_EVENT_REPOSITORY],
})
export class AuditModule {}
