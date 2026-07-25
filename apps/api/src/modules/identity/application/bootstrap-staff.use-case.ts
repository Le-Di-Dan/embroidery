/**
 * Staff bootstrap / credential-rotation use case (ADR-APP1-001 §8, §9).
 *
 * The out-of-band recovery path, never reached by normal API startup. It creates
 * the first admin account and password credential in one transaction, or — in
 * rotate mode — replaces the single admin's credential and revokes its live
 * sessions. It enforces the one-active-admin invariant (via the database partial
 * unique index), the password policy, and never prints or returns a secret.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError, newId } from '@embroidery/database';
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
import {
  MAX_PASSWORD_BYTES,
  PASSWORD_CREDENTIAL_KIND,
  ScryptPasswordHasher,
} from '../infrastructure/crypto/scrypt-password-hasher';
import { STAFF_AUTH_CONFIG, type StaffAuthConfig } from '../config/staff-auth.config';
import { StaffAuditWriter } from './staff-audit.writer';

export interface BootstrapStaffCommand {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
  /** Rotate the existing admin's credential instead of creating a new admin. */
  readonly rotate: boolean;
}

export type BootstrapOutcome = 'created' | 'rotated';

export interface BootstrapStaffResult {
  readonly outcome: BootstrapOutcome;
  readonly adminId: string;
}

export interface EnsureBootstrapCommand {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
}

/**
 * Idempotent bootstrap outcomes (A01-FU03). `created` writes a new admin;
 * `reused` finds the matching active admin and changes nothing; `mismatch`
 * means a different active admin already holds the single active slot; `inactive`
 * means the matching account exists but is LOCKED/DISABLED. Only `created` and
 * `reused` are success states — none of these ever rotates a credential.
 */
export type EnsureBootstrapOutcome = 'created' | 'reused' | 'mismatch' | 'inactive';

export interface EnsureBootstrapResult {
  readonly outcome: EnsureBootstrapOutcome;
  readonly adminId: string | undefined;
}

/** A safe, secret-free operational error the CLI reports and exits non-zero on. */
export class BootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootstrapError';
  }
}

const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

@Injectable()
export class BootstrapStaffUseCase {
  constructor(
    @Inject(ADMIN_ACCOUNT_REPOSITORY) private readonly accounts: AdminAccountRepository,
    @Inject(ADMIN_SESSION_REPOSITORY) private readonly sessions: AdminSessionRepository,
    private readonly hasher: ScryptPasswordHasher,
    private readonly transactions: TransactionManager,
    private readonly audit: StaffAuditWriter,
    @Inject(STAFF_AUTH_CONFIG) private readonly config: StaffAuthConfig,
  ) {}

  async bootstrap(command: BootstrapStaffCommand): Promise<BootstrapStaffResult> {
    const email = this.requireEmail(command.email);
    const displayName = command.displayName.trim();
    if (displayName === '') {
      throw new BootstrapError('A display name is required.');
    }
    this.requirePasswordPolicy(command.password);
    const reference = await this.hasher.hash(command.password);

    return command.rotate
      ? this.rotate(email, reference)
      : this.create(email, displayName, reference);
  }

  /**
   * Idempotent create-or-reuse for the automatic Compose bootstrap (A01-FU03).
   * Never rotates a credential and never mutates an existing admin's profile:
   * a matching active admin is reused as-is; a LOCKED/DISABLED match or a
   * different active admin fails safely. Safe to run on every stack startup.
   */
  async ensure(command: EnsureBootstrapCommand): Promise<EnsureBootstrapResult> {
    const email = this.requireEmail(command.email);
    const displayName = command.displayName.trim();
    if (displayName === '') {
      throw new BootstrapError('A display name is required.');
    }
    this.requirePasswordPolicy(command.password);

    const existing = await this.accounts.findByEmail(email);
    if (existing !== undefined) {
      return existing.status === 'ACTIVE'
        ? { outcome: 'reused', adminId: existing.id }
        : { outcome: 'inactive', adminId: existing.id };
    }

    // No account holds this email. Hash only now (avoid wasted scrypt on reuse)
    // and attempt the create; the one-active-admin index and the unique-email
    // constraint classify any conflicting existing admin.
    const reference = await this.hasher.hash(command.password);
    return this.insertOrClassify(email, displayName, reference);
  }

  private async insertOrClassify(
    email: string,
    displayName: string,
    reference: string,
  ): Promise<EnsureBootstrapResult> {
    try {
      const id = await this.insertNewAdmin(email, displayName, reference);
      return { outcome: 'created', adminId: id };
    } catch (error: unknown) {
      if (isPersistenceError(error)) {
        if (error.code === 'ADMIN_ACCOUNT_ALREADY_ACTIVE') {
          return { outcome: 'mismatch', adminId: undefined };
        }
        if (error.code === 'DUPLICATE_ADMIN_EMAIL') {
          const raced = await this.accounts.findByEmail(email);
          if (raced !== undefined) {
            return raced.status === 'ACTIVE'
              ? { outcome: 'reused', adminId: raced.id }
              : { outcome: 'inactive', adminId: raced.id };
          }
        }
      }
      throw error;
    }
  }

  private async create(
    email: string,
    displayName: string,
    reference: string,
  ): Promise<BootstrapStaffResult> {
    try {
      const id = await this.insertNewAdmin(email, displayName, reference);
      return { outcome: 'created', adminId: id };
    } catch (error: unknown) {
      throw this.translateConflict(error);
    }
  }

  /** Writes the account, its active credential and the audit event in one transaction. */
  private async insertNewAdmin(
    email: string,
    displayName: string,
    reference: string,
  ): Promise<AdminAccountId> {
    const id = newId() as AdminAccountId;
    const correlationId = newId();
    await this.transactions.runInTransaction(async () => {
      await this.accounts.create({ id, email, displayName });
      await this.accounts.attachCredential({
        adminAccountId: id,
        credentialKind: PASSWORD_CREDENTIAL_KIND,
        credentialReference: reference,
      });
      await this.audit.credentialBootstrapped(id, correlationId);
    });
    return id;
  }

  private async rotate(email: string, reference: string): Promise<BootstrapStaffResult> {
    const account = await this.accounts.findByEmail(email);
    if (account === undefined || account.status !== 'ACTIVE') {
      throw new BootstrapError('No active admin with that email exists to rotate.');
    }
    const correlationId = newId();
    await this.transactions.runInTransaction(async () => {
      await this.accounts.rotateCredential({
        adminAccountId: account.id,
        credentialKind: PASSWORD_CREDENTIAL_KIND,
        credentialReference: reference,
      });
      // A rotated password invalidates every live session for that admin.
      const revoked = await this.sessions.revokeAllForAdmin(account.id);
      await this.audit.credentialRotated(account.id, correlationId);
      if (revoked > 0) {
        await this.audit.sessionsRevokedAll(account.id, revoked, correlationId);
      }
    });
    return { outcome: 'rotated', adminId: account.id };
  }

  private requireEmail(raw: string): string {
    const email = raw.trim().toLowerCase().normalize('NFKC');
    if (!EMAIL_PATTERN.test(email)) {
      throw new BootstrapError('The bootstrap email is not a valid address.');
    }
    return email;
  }

  private requirePasswordPolicy(password: string): void {
    if ([...password.normalize('NFKC')].length < this.config.passwordMinLength) {
      throw new BootstrapError(
        `The password must be at least ${this.config.passwordMinLength} characters.`,
      );
    }
    if (Buffer.byteLength(password.normalize('NFKC'), 'utf8') > MAX_PASSWORD_BYTES) {
      throw new BootstrapError('The password exceeds the maximum accepted length.');
    }
  }

  /** Turns the one-active-admin / duplicate-email conflicts into a safe message. */
  private translateConflict(error: unknown): Error {
    if (isPersistenceError(error)) {
      if (error.code === 'ADMIN_ACCOUNT_ALREADY_ACTIVE') {
        return new BootstrapError('An active admin already exists. Use rotate mode to recover.');
      }
      if (error.code === 'DUPLICATE_ADMIN_EMAIL') {
        return new BootstrapError('An admin with that email already exists.');
      }
    }
    return error instanceof Error ? error : new BootstrapError('Bootstrap failed.');
  }
}
