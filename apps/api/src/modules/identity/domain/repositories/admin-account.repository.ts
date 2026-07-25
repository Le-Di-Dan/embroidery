/**
 * AGG-01 Admin Account persistence contract (TBL-001, TBL-002).
 *
 * Domain-layer interface: no NestJS, no ORM, no driver types
 * (`BACKEND_CONVENTIONS.md` §3). The Drizzle implementation lives in
 * `infrastructure/persistence`.
 */
import type { AdminAccountState } from '@embroidery/database';

/** Opaque identity. Branded so an arbitrary string cannot stand in for one. */
export type AdminAccountId = string & { readonly __brand: 'AdminAccountId' };

export interface AdminAccount {
  readonly id: AdminAccountId;
  readonly email: string;
  readonly displayName: string;
  readonly status: AdminAccountState;
  readonly lockedAt: Date | undefined;
  readonly disabledAt: Date | undefined;
  readonly replacedByAdminAccountId: AdminAccountId | undefined;
  readonly createdAt: Date;
}

export interface CreateAdminAccountInput {
  readonly id: AdminAccountId;
  readonly email: string;
  readonly displayName: string;
}

export interface AttachCredentialInput {
  readonly adminAccountId: AdminAccountId;
  readonly credentialKind: string;
  /**
   * A reference to the credential held by the (undecided) auth provider —
   * never the secret itself. The provider is an open decision (O-DEC-29), so
   * this stays provider-abstract.
   */
  readonly credentialReference: string;
}

/**
 * The one live credential of a given kind for an account.
 *
 * `credentialReference` is the opaque provider reference (for `password_scrypt`,
 * the self-describing hash string — never a plaintext secret). Superseded or
 * revoked credentials are never returned.
 */
export interface AdminCredential {
  readonly id: string;
  readonly adminAccountId: AdminAccountId;
  readonly credentialKind: string;
  readonly credentialReference: string;
  readonly createdAt: Date;
}

export interface RotateCredentialInput {
  readonly adminAccountId: AdminAccountId;
  readonly credentialKind: string;
  readonly credentialReference: string;
}

export const ADMIN_ACCOUNT_REPOSITORY = Symbol('ADMIN_ACCOUNT_REPOSITORY');

export interface AdminAccountRepository {
  /** @requiresTransaction — writes the account and may be composed with credential setup. */
  create(input: CreateAdminAccountInput): Promise<AdminAccount>;

  /** @requiresTransaction */
  updateProfile(id: AdminAccountId, displayName: string): Promise<AdminAccount>;

  /** @requiresTransaction */
  attachCredential(input: AttachCredentialInput): Promise<void>;

  /**
   * The live credential of `credentialKind` for the account, or nothing.
   *
   * "Live" excludes superseded (rotated) and revoked credentials, so the auth
   * layer never verifies against an old secret. Read-only; safe outside a
   * transaction.
   */
  findActiveCredential(
    adminAccountId: AdminAccountId,
    credentialKind: string,
  ): Promise<AdminCredential | undefined>;

  /**
   * Replaces the live credential of a kind with a new reference in one step:
   * the current live credential is marked superseded and a fresh one is written.
   * Used by rehash-on-verify and the bootstrap CLI recovery mode; it never
   * creates a second active admin (ADR-APP1-001 §8).
   *
   * @requiresTransaction
   */
  rotateCredential(input: RotateCredentialInput): Promise<void>;

  /** @requiresTransaction — a lock/disable also stamps the corresponding instant. */
  changeStatus(id: AdminAccountId, status: AdminAccountState): Promise<AdminAccount>;

  findById(id: AdminAccountId): Promise<AdminAccount | undefined>;
  findByEmail(email: string): Promise<AdminAccount | undefined>;

  /**
   * Whether the id names an existing admin.
   *
   * Exists for the no-FK actor-evidence guard (G-DB7-50): evidence rows carry a
   * bare `admin_id` with no foreign key, so the writer validates it here at
   * write time. A later-deleted admin is permitted by design.
   */
  exists(id: AdminAccountId): Promise<boolean>;
}
