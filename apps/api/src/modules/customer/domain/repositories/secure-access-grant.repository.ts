/**
 * AGG-04 Secure Access Grant persistence contract (TBL-008).
 *
 * This is the customer's only credential for a request (there is no customer
 * login, D-018), so its guards are the ones standing between a leaked link and
 * someone else's order.
 *
 * Carries **G-DB7-38** (the grant belongs to the customer), **G-DB7-39** (it
 * belongs to the request being acted on) and **G-DB7-40** (its scope covers the
 * operation, and it is neither expired nor revoked).
 *
 * `resolveActive` is a *persistence* guard, not an authorization decision: it
 * proves the grant is live and in scope. Whether the operation itself is
 * permitted belongs to the authorization layer, which does not exist yet
 * (G-DB7-44).
 */
import type { GrantScopeKind } from '@embroidery/database';

import type { CustomerId } from './customer.repository';

export type GrantId = string & { readonly __brand: 'GrantId' };

export interface SecureAccessGrant {
  readonly id: GrantId;
  readonly customerId: CustomerId;
  readonly customRequestId: string;
  readonly scopeKind: GrantScopeKind;
  readonly expiresAt: Date;
}

export interface IssueGrantInput {
  readonly id: GrantId;
  readonly customerId: CustomerId;
  readonly customRequestId: string;
  /** A hash of the link token — never the token itself. */
  readonly tokenHash: string;
  readonly scopeKind: GrantScopeKind;
  readonly expiresAt: Date;
}

/** What the caller is about to do, checked against the grant's scope. */
export interface GrantUseContext {
  readonly customerId: CustomerId;
  readonly customRequestId: string;
  readonly scopeKind: GrantScopeKind;
}

export const SECURE_ACCESS_GRANT_REPOSITORY = Symbol('SECURE_ACCESS_GRANT_REPOSITORY');

export interface SecureAccessGrantRepository {
  /** @requiresTransaction */
  issue(input: IssueGrantInput): Promise<SecureAccessGrant>;

  /**
   * Revokes a grant. A reason is mandatory — the schema's
   * `ck_secure_access_grants__revoke_reason_required` CHECK enforces it too.
   *
   * @requiresTransaction
   */
  revoke(id: GrantId, reason: string): Promise<void>;

  /** @requiresTransaction — used when a new grant supersedes an old one. */
  supersede(id: GrantId, replacementId: GrantId, reason: string): Promise<void>;

  /**
   * Resolves a live grant from its token hash **and** checks it against the
   * operation (G-DB7-38/39/40).
   *
   * Returns nothing rather than throwing when the grant does not match: a
   * caller presenting a wrong or stale token must not be able to tell *which*
   * check failed. The distinction between "no such token", "expired" and
   * "wrong request" is exactly what an attacker probing a leaked link wants.
   */
  resolveActive(
    tokenHash: string,
    context: GrantUseContext,
    now: Date,
  ): Promise<SecureAccessGrant | undefined>;

  findById(id: GrantId): Promise<SecureAccessGrant | undefined>;
  listActiveForRequest(customRequestId: string): Promise<SecureAccessGrant[]>;
}
