/**
 * Admin account status changes with the session cascade (ADR-APP1-001 §3, §12).
 *
 * Locking or disabling the admin revokes every live session in the same
 * transaction, so a lock takes effect immediately rather than waiting for idle
 * expiry. This is the smallest canonical wiring of the invariant; B01 exposes no
 * account-management endpoint, so it is driven by the bootstrap CLI recovery
 * path and by tests. Re-activation clears status without touching sessions.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { AdminAccountState } from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';

import {
  ADMIN_ACCOUNT_REPOSITORY,
  type AdminAccountId,
  type AdminAccountRepository,
} from '../domain/repositories/admin-account.repository';
import {
  ADMIN_SESSION_REPOSITORY,
  type AdminSessionRepository,
} from '../domain/repositories/admin-session.repository';
import { StaffAuditWriter } from './staff-audit.writer';

@Injectable()
export class StaffAccountStatusService {
  constructor(
    @Inject(ADMIN_ACCOUNT_REPOSITORY) private readonly accounts: AdminAccountRepository,
    @Inject(ADMIN_SESSION_REPOSITORY) private readonly sessions: AdminSessionRepository,
    private readonly transactions: TransactionManager,
    private readonly audit: StaffAuditWriter,
  ) {}

  /**
   * Applies a status change. When the account is locked or disabled, every live
   * session is revoked and the cascade is audited under `correlationId`.
   */
  async changeStatus(
    id: AdminAccountId,
    status: AdminAccountState,
    correlationId: string,
  ): Promise<void> {
    await this.transactions.runInTransaction(async () => {
      await this.accounts.changeStatus(id, status);
      if (status === 'LOCKED' || status === 'DISABLED') {
        const revoked = await this.sessions.revokeAllForAdmin(id);
        if (revoked > 0) {
          await this.audit.sessionsRevokedAll(id, revoked, correlationId);
        }
      }
    });
  }
}
