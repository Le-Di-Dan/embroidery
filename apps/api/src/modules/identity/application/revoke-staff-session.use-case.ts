/**
 * Staff logout use case (ADR-APP1-001 §10).
 *
 * Revokes exactly the current session and records the logout, in one
 * transaction. The guard has already resolved a live session and bound the
 * ADMIN actor, so this never revokes all sessions and never runs anonymously.
 * A concurrent double-logout is harmless: the guard admits only a live session,
 * so a second attempt with the same cookie is rejected before reaching here.
 */
import { Inject, Injectable } from '@nestjs/common';
import { TransactionManager } from '@embroidery/persistence';

import {
  ADMIN_SESSION_REPOSITORY,
  type AdminSessionId,
  type AdminSessionRepository,
} from '../domain/repositories/admin-session.repository';
import { StaffAuditWriter } from './staff-audit.writer';

@Injectable()
export class RevokeStaffSessionUseCase {
  constructor(
    @Inject(ADMIN_SESSION_REPOSITORY) private readonly sessions: AdminSessionRepository,
    private readonly transactions: TransactionManager,
    private readonly audit: StaffAuditWriter,
  ) {}

  async logout(sessionId: AdminSessionId, adminId: string): Promise<void> {
    await this.transactions.runInTransaction(async () => {
      await this.sessions.revoke(sessionId);
      await this.audit.logout(adminId);
    });
  }
}
