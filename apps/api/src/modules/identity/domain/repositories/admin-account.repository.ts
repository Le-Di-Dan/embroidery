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

export const ADMIN_ACCOUNT_REPOSITORY = Symbol('ADMIN_ACCOUNT_REPOSITORY');

export interface AdminAccountRepository {
  /** @requiresTransaction — writes the account and may be composed with credential setup. */
  create(input: CreateAdminAccountInput): Promise<AdminAccount>;

  /** @requiresTransaction */
  updateProfile(id: AdminAccountId, displayName: string): Promise<AdminAccount>;

  /** @requiresTransaction */
  attachCredential(input: AttachCredentialInput): Promise<void>;

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
