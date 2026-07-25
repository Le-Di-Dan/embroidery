/**
 * AGG-01 Admin Session persistence contract (TBL-003).
 *
 * A session has its own lifecycle (LC-01 session), its own TTL and its own
 * lookup path, so it is a repository rather than a child of the account
 * (DB7 §10.1).
 */
import type { AdminSessionState } from '@embroidery/database';

import type { AdminAccountId } from './admin-account.repository';

export type AdminSessionId = string & { readonly __brand: 'AdminSessionId' };

export interface AdminSession {
  readonly id: AdminSessionId;
  readonly adminAccountId: AdminAccountId;
  readonly status: AdminSessionState;
  readonly expiresAt: Date;
  readonly revokedAt: Date | undefined;
  readonly createdAt: Date;
}

export interface IssueAdminSessionInput {
  readonly id: AdminSessionId;
  readonly adminAccountId: AdminAccountId;
  /**
   * A hash of the session token — never the token itself.
   *
   * The table stores only the hash so a database disclosure cannot be replayed
   * as a live session; hashing happens in the auth layer, which owns the
   * algorithm choice.
   */
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly clientMetadata?: string | undefined;
}

export const ADMIN_SESSION_REPOSITORY = Symbol('ADMIN_SESSION_REPOSITORY');

export interface AdminSessionRepository {
  /** @requiresTransaction */
  issue(input: IssueAdminSessionInput): Promise<AdminSession>;

  /** @requiresTransaction */
  revoke(id: AdminSessionId): Promise<AdminSession>;

  /**
   * Slides a live session's idle expiry forward (ADR-APP1-001 §4).
   *
   * Only an `ACTIVE` session is extended, so a revoked or expired one can never
   * be revived by a late renewal. Single-statement — safe on the pool without a
   * transaction. Returns the session when it was extended, or nothing when no
   * live row matched.
   */
  extendExpiry(id: AdminSessionId, expiresAt: Date): Promise<AdminSession | undefined>;

  /** @requiresTransaction — used when an account is locked or disabled. */
  revokeAllForAdmin(adminAccountId: AdminAccountId): Promise<number>;

  /**
   * Resolves a live session by token hash.
   *
   * Returns nothing for a revoked *or expired* session: expiry is enforced on
   * read rather than by a sweep, so a session cannot outlive its window just
   * because no cleanup job has run yet.
   */
  findActiveByTokenHash(tokenHash: string, now: Date): Promise<AdminSession | undefined>;
}
