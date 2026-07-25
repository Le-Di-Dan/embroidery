/**
 * Staff audit event writer (ADR-APP1-001 §11).
 *
 * One place that knows the staff audit taxonomy, actor kinds and target mapping,
 * so no use case hand-assembles an audit row. HTTP flows correlate by the active
 * request id; the out-of-band bootstrap CLI has no request, so those methods take
 * an explicit correlation id. The raw identifier, password and token are never
 * written — only a redacted reason class, an admin id and the correlation id.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  AUDIT_EVENT_REPOSITORY,
  type AuditEventRepository,
} from '../../audit/domain/repositories/audit-event.repository';
import { RequestContextService } from '../../../platform/request-context/request-context.service';
import { StaffClock } from './ports/staff-clock';

/** Redacted failure classes for `staff.login.failed` (never client-visible). */
export type LoginFailureReason = 'INVALID_CREDENTIALS' | 'ACCOUNT_NOT_ACTIVE' | 'RATE_LIMITED';

const ADMIN_TARGET = 'ADMIN_ACCOUNT' as const;
/** Sentinel target id for a failed login where no account is safely known. */
const LOGIN_TARGET = 'admin_login';
const AUTH_JOB_KEY = 'staff.auth';
const BOOTSTRAP_JOB_KEY = 'staff.bootstrap';

@Injectable()
export class StaffAuditWriter {
  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly events: AuditEventRepository,
    private readonly requestContext: RequestContextService,
    private readonly clock: StaffClock,
  ) {}

  async loginSucceeded(adminId: string): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: { kind: 'ADMIN', adminId },
      action: 'staff.login.succeeded',
      targetKind: ADMIN_TARGET,
      targetId: adminId,
      correlationId: this.requestContext.requireRequestId(),
    });
  }

  async loginFailed(reason: LoginFailureReason): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      // The auth subsystem records the security signal; a failed login has no
      // authenticated actor and ANONYMOUS is never persisted (ADR §11).
      actor: { kind: 'SYSTEM', systemJobKey: AUTH_JOB_KEY },
      action: 'staff.login.failed',
      targetKind: ADMIN_TARGET,
      targetId: LOGIN_TARGET,
      failureCode: reason,
      correlationId: this.requestContext.requireRequestId(),
    });
  }

  async logout(adminId: string): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: { kind: 'ADMIN', adminId },
      action: 'staff.logout',
      targetKind: ADMIN_TARGET,
      targetId: adminId,
      correlationId: this.requestContext.requireRequestId(),
    });
  }

  async accessRejected(adminId: string): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: { kind: 'ADMIN', adminId },
      action: 'staff.access.rejected',
      targetKind: ADMIN_TARGET,
      targetId: adminId,
      reason: 'ACCOUNT_NOT_ACTIVE',
      correlationId: this.requestContext.requireRequestId(),
    });
  }

  /**
   * The correlation id is explicit: this cascade can run from an HTTP request
   * (future account-management) or from the out-of-band CLI, which has none.
   */
  async sessionsRevokedAll(adminId: string, count: number, correlationId: string): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: { kind: 'SYSTEM', systemJobKey: AUTH_JOB_KEY },
      action: 'staff.sessions.revoked_all',
      targetKind: ADMIN_TARGET,
      targetId: adminId,
      summary: { revoked: count },
      correlationId,
    });
  }

  /** Out-of-band CLI: no request context, so the correlation id is explicit. */
  async credentialBootstrapped(adminId: string, correlationId: string): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: { kind: 'SYSTEM', systemJobKey: BOOTSTRAP_JOB_KEY },
      action: 'staff.credential.bootstrapped',
      targetKind: ADMIN_TARGET,
      targetId: adminId,
      correlationId,
    });
  }

  async credentialRotated(adminId: string, correlationId: string): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: { kind: 'SYSTEM', systemJobKey: BOOTSTRAP_JOB_KEY },
      action: 'staff.credential.rotated',
      targetKind: ADMIN_TARGET,
      targetId: adminId,
      correlationId,
    });
  }
}
