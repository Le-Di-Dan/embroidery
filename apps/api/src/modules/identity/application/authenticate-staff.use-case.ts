/**
 * Staff login use case (ADR-APP1-001 §3, §7, §10–§12).
 *
 * Rate-limits before any expensive work, resolves the account and its live
 * password credential, verifies in constant time (a dummy scrypt runs on the
 * unknown-account branch), and — only on success against an ACTIVE account —
 * binds the ADMIN actor and issues a session in one transaction. Every failure
 * cause (unknown account, wrong password, locked, disabled) surfaces the same
 * uniform error, so the endpoint never leaks whether an account exists.
 */
import { Inject, Injectable } from '@nestjs/common';
import { newId } from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';

import { createAdminActor } from '../../../platform/actor-context/request-actor';
import { RequestContextService } from '../../../platform/request-context/request-context.service';
import {
  ADMIN_ACCOUNT_REPOSITORY,
  type AdminAccountRepository,
} from '../domain/repositories/admin-account.repository';
import {
  ADMIN_SESSION_REPOSITORY,
  type AdminSessionId,
  type AdminSessionRepository,
} from '../domain/repositories/admin-session.repository';
import {
  PASSWORD_CREDENTIAL_KIND,
  ScryptPasswordHasher,
} from '../infrastructure/crypto/scrypt-password-hasher';
import { SessionTokenService } from '../infrastructure/crypto/session-token.service';
import { LoginRateLimiter } from '../infrastructure/rate-limit/login-rate-limiter';
import { STAFF_AUTH_CONFIG, type StaffAuthConfig } from '../config/staff-auth.config';
import { StaffLoginFailedError, StaffRateLimitedError } from '../domain/staff-auth.errors';
import { StaffAuditWriter, type LoginFailureReason } from './staff-audit.writer';
import { StaffClock } from './ports/staff-clock';

export interface AuthenticateStaffCommand {
  /** Already validated: syntactically valid, ≤254 bytes. */
  readonly email: string;
  readonly password: string;
  /** Trusted client IP resolved from the proxy hop, or undefined. */
  readonly ipAddress: string | undefined;
}

export interface AuthenticateStaffResult {
  /** The raw session token — handed straight to the cookie adapter, never logged. */
  readonly rawToken: string;
}

const IDENTIFIER_DIMENSION = 'identifier';
const IP_DIMENSION = 'ip';
const GLOBAL_DIMENSION = 'global';
const GLOBAL_KEY = 'staff-login';

@Injectable()
export class AuthenticateStaffUseCase {
  constructor(
    @Inject(ADMIN_ACCOUNT_REPOSITORY) private readonly accounts: AdminAccountRepository,
    @Inject(ADMIN_SESSION_REPOSITORY) private readonly sessions: AdminSessionRepository,
    private readonly hasher: ScryptPasswordHasher,
    private readonly tokens: SessionTokenService,
    private readonly rateLimiter: LoginRateLimiter,
    private readonly transactions: TransactionManager,
    private readonly requestContext: RequestContextService,
    private readonly audit: StaffAuditWriter,
    private readonly clock: StaffClock,
    @Inject(STAFF_AUTH_CONFIG) private readonly config: StaffAuthConfig,
  ) {}

  async authenticate(command: AuthenticateStaffCommand): Promise<AuthenticateStaffResult> {
    const email = command.email.trim().toLowerCase().normalize('NFKC');
    this.enforceRateLimits(email, command.ipAddress);

    const account = await this.accounts.findByEmail(email);
    const credential =
      account === undefined
        ? undefined
        : await this.accounts.findActiveCredential(account.id, PASSWORD_CREDENTIAL_KIND);

    // Always spend exactly one scrypt so an unknown account is indistinguishable
    // from a known one by timing (ADR §12).
    if (account === undefined || credential === undefined) {
      await this.hasher.verifyDummy(command.password);
      return this.fail('INVALID_CREDENTIALS');
    }

    const verification = await this.hasher.verify(command.password, credential.credentialReference);
    if (!verification.ok) {
      return this.fail('INVALID_CREDENTIALS');
    }
    if (account.status !== 'ACTIVE') {
      return this.fail('ACCOUNT_NOT_ACTIVE');
    }

    // Authenticated: bind the actor before the success audit so the row and
    // everything downstream attribute to this admin (ADR §10).
    this.requestContext.bindActor(createAdminActor(account.id));

    const issued = this.tokens.issue();
    const expiresAt = new Date(this.clock.now().getTime() + this.config.idleTimeoutMs);

    await this.transactions.runInTransaction(async () => {
      await this.sessions.issue({
        id: newId() as AdminSessionId,
        adminAccountId: account.id,
        tokenHash: issued.tokenHash,
        expiresAt,
      });
      if (verification.needsRehash) {
        // Obsolete parameters: re-hash with the current policy in the same
        // transaction, so the upgrade commits with the login it rode in on.
        const rehashed = await this.hasher.hash(command.password);
        await this.accounts.rotateCredential({
          adminAccountId: account.id,
          credentialKind: PASSWORD_CREDENTIAL_KIND,
          credentialReference: rehashed,
        });
      }
      await this.audit.loginSucceeded(account.id);
    });

    // Forgive this identifier's counter on success — but never the IP/global
    // ceilings that guard against distributed abuse (ADR §12).
    this.rateLimiter.clear(IDENTIFIER_DIMENSION, email);

    return { rawToken: issued.rawToken };
  }

  private enforceRateLimits(email: string, ipAddress: string | undefined): void {
    const ip = ipAddress ?? 'unknown';
    const identifier = this.rateLimiter.check(
      IDENTIFIER_DIMENSION,
      email,
      this.config.identifierRateLimit,
    );
    const source = this.rateLimiter.check(IP_DIMENSION, ip, this.config.ipRateLimit);
    const global = this.rateLimiter.check(
      GLOBAL_DIMENSION,
      GLOBAL_KEY,
      this.config.globalRateLimit,
    );
    const blocked = [identifier, source, global].filter((d) => !d.allowed);
    if (blocked.length === 0) {
      return;
    }
    const retryAfterMs = Math.max(...blocked.map((d) => d.retryAfterMs));
    void this.auditRateLimited();
    throw new StaffRateLimitedError(retryAfterMs);
  }

  private async auditRateLimited(): Promise<void> {
    try {
      await this.audit.loginFailed('RATE_LIMITED');
    } catch {
      // A rate-limited attempt must be rejected even if its audit write fails;
      // the rejection is the security-critical outcome.
    }
  }

  private async fail(reason: LoginFailureReason): Promise<never> {
    await this.audit.loginFailed(reason);
    throw new StaffLoginFailedError();
  }
}
