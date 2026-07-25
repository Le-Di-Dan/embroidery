/**
 * Authenticated session resolution and sliding renewal (ADR-APP1-001 §4, §10).
 *
 * Given a raw cookie token, resolves the live session behind it, confirms the
 * account is still ACTIVE, enforces the absolute timeout, and slides the idle
 * expiry forward once past the half-idle threshold. It performs no HTTP work and
 * binds no actor — the guard owns those — so it stays a pure application service
 * over the repositories and the clock.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  ADMIN_ACCOUNT_REPOSITORY,
  type AdminAccountRepository,
} from '../domain/repositories/admin-account.repository';
import {
  ADMIN_SESSION_REPOSITORY,
  type AdminSessionId,
  type AdminSessionRepository,
} from '../domain/repositories/admin-session.repository';
import { SessionTokenService } from '../infrastructure/crypto/session-token.service';
import { STAFF_AUTH_CONFIG, type StaffAuthConfig } from '../config/staff-auth.config';
import { StaffClock } from './ports/staff-clock';

/** The safe, transport-free view of the authenticated session. */
export interface ResolvedStaffSession {
  readonly sessionId: string;
  readonly adminId: string;
  readonly email: string;
  readonly displayName: string;
}

export type ResolveResult =
  | { readonly kind: 'ok'; readonly session: ResolvedStaffSession }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'account_not_active'; readonly adminId: string; readonly sessionId: string };

const INVALID: ResolveResult = { kind: 'invalid' };

@Injectable()
export class ResolveStaffSessionService {
  constructor(
    @Inject(ADMIN_SESSION_REPOSITORY) private readonly sessions: AdminSessionRepository,
    @Inject(ADMIN_ACCOUNT_REPOSITORY) private readonly accounts: AdminAccountRepository,
    private readonly tokens: SessionTokenService,
    private readonly clock: StaffClock,
    @Inject(STAFF_AUTH_CONFIG) private readonly config: StaffAuthConfig,
  ) {}

  /**
   * Resolves a raw token to an authenticated session, or reports why it could
   * not. Idle expiry and revocation are enforced by the repository lookup;
   * absolute expiry and account status are enforced here.
   */
  async resolve(rawToken: string): Promise<ResolveResult> {
    const now = this.clock.now();
    const tokenHash = this.tokens.hash(rawToken);
    const session = await this.sessions.findActiveByTokenHash(tokenHash, now);
    if (session === undefined) {
      return INVALID;
    }

    const absoluteExpiry = session.createdAt.getTime() + this.config.absoluteTimeoutMs;
    if (now.getTime() >= absoluteExpiry) {
      return INVALID;
    }

    const account = await this.accounts.findById(session.adminAccountId);
    if (account === undefined) {
      return INVALID;
    }
    if (account.status !== 'ACTIVE') {
      return { kind: 'account_not_active', adminId: account.id, sessionId: session.id };
    }

    await this.slideExpiry(session.id, session.expiresAt, now, absoluteExpiry);

    return {
      kind: 'ok',
      session: {
        sessionId: session.id,
        adminId: account.id,
        email: account.email,
        displayName: account.displayName,
      },
    };
  }

  /**
   * Extends idle expiry only once less than half the idle window remains, and
   * never past the absolute expiry — so a busy session is not written on every
   * request, and no renewal can outlive the 12-hour ceiling (ADR §4).
   */
  private async slideExpiry(
    sessionId: AdminSessionId,
    currentExpiry: Date,
    now: Date,
    absoluteExpiry: number,
  ): Promise<void> {
    const remaining = currentExpiry.getTime() - now.getTime();
    if (remaining >= this.config.idleTimeoutMs / 2) {
      return;
    }
    const nextExpiry = Math.min(now.getTime() + this.config.idleTimeoutMs, absoluteExpiry);
    if (nextExpiry > currentExpiry.getTime()) {
      await this.sessions.extendExpiry(sessionId, new Date(nextExpiry));
    }
  }
}
