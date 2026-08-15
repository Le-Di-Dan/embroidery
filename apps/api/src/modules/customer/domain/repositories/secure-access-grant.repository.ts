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
import type { GrantScopeKind, SecureAccessGrantState } from '@embroidery/database';

import type { CustomerId } from './customer.repository';

export type GrantId = string & { readonly __brand: 'GrantId' };

export interface SecureAccessGrant {
  readonly id: GrantId;
  readonly customerId: CustomerId;
  readonly customRequestId: string;
  readonly scopeKind: GrantScopeKind;
  readonly expiresAt: Date;
}

/**
 * What an operator may see of a grant (`APP4-B07`).
 *
 * A separate type from {@link SecureAccessGrant}, and the difference is the
 * point in both directions.
 *
 * It **adds** `status`, because every other read in this file is a live-grant
 * resolver — status is a predicate there, never a value — while the Admin
 * support read must show a grant that is no longer live and say so.
 *
 * It **omits** `token_hash`, and omits it structurally rather than by
 * convention: the adapter projects a fixed column list, so the digest is not in
 * the row that reaches this layer at all. A `SELECT *` plus a mapper would leave
 * the digest one careless spread away from a response body, and CST-008 makes
 * that digest the exact lookup key for the credential.
 *
 * It also omits `revoked_at`, `revoke_reason` and `superseded_by_grant_id`. An
 * operator answering "is this link still live?" needs the state and the deadline
 * (`APP4_PHASE_ENTRY_AUDIT` B07); the reason a *previous* operator typed is
 * audit-trail content, and the supersession pointer is a second grant's id.
 */
export interface SecureAccessGrantSummary {
  readonly id: GrantId;
  readonly customRequestId: string;
  readonly scopeKind: GrantScopeKind;
  readonly status: SecureAccessGrantState;
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

  /**
   * Resolves a live grant from its token digest **alone** (`APP4-B06`).
   *
   * Added because the public resolver has nothing else. A secure link carries an
   * opaque token and no identifiers, so {@link resolveActive} — which requires
   * the customer, the request and the scope up front — cannot serve it. The two
   * ways to make it fit would both be worse than a second read: accepting the
   * target from the caller would let anyone holding a token assert *whose* grant
   * it is, and dropping the predicates would discard the binding entirely.
   *
   * So the binding is **read from the row instead of supplied to the query**.
   * That is not a weakening of G-DB7-38/39: `token_hash` is globally unique
   * (CST-008), so a digest identifies at most one grant, and the customer and
   * request this returns are the persisted ones the grant was issued against. A
   * caller cannot influence them, which is a stronger guarantee than checking a
   * pair it was handed.
   *
   * `scopeKind` stays an argument rather than a constant here, exactly as it is
   * on {@link resolveActive}: the one legal value is business authority
   * (ADR-DB3-004 r1) and belongs to the application layer, not to persistence.
   *
   * Read-only, and returns nothing rather than throwing for every failing
   * reason — unknown digest, expired, revoked, superseded, wrong scope — for the
   * same non-disclosure reason {@link resolveActive} does.
   */
  resolveActiveByTokenDigest(
    tokenHash: string,
    scopeKind: GrantScopeKind,
    now: Date,
  ): Promise<SecureAccessGrant | undefined>;

  findById(id: GrantId): Promise<SecureAccessGrant | undefined>;
  listActiveForRequest(customRequestId: string): Promise<SecureAccessGrant[]>;

  /**
   * Every grant belonging to one customer, whatever its state (`APP4-B07`).
   *
   * The one read in this contract that is not a live-grant resolver, and the
   * only one an operator's screen is behind. It exists because the delivered
   * reads cannot answer the support question: `listActiveForRequest` is keyed by
   * the *request*, which an operator looking at a customer does not have and
   * which APP5 owns, and it hides exactly the revoked and expired rows that make
   * "this link stopped working" explicable.
   *
   * Read-only, customer-scoped and unfiltered by state. There is deliberately no
   * status argument, no date range, no free-text term and no cursor: this is one
   * customer's grants, not a search. `ix_secure_access_grants__customer_id`
   * (IDX-107) exists for precisely this access path — DB5 records that it is
   * required *despite* IDX-008, because IDX-008 is partial over ACTIVE rows and
   * a customer-wide read must see every status.
   *
   * Ordered newest-issued first, deterministically: `created_at` can tie for two
   * grants minted in one transaction, so `id` breaks it. An unordered list would
   * let two identical requests render an operator's table in two different
   * sequences.
   */
  listForCustomer(customerId: CustomerId): Promise<SecureAccessGrantSummary[]>;

  /**
   * One grant's state and deadline, by id (`APP4-B08`).
   *
   * {@link findById} exists and is not enough: `SecureAccessGrant` carries no
   * `status`, because every consumer of it so far was a live-grant resolver for
   * which status was a predicate rather than a value. The manual-replay
   * eligibility check is the first caller that must distinguish `ACTIVE` from
   * `REVOKED` for a grant it already has the id of — re-delivering a dead link
   * helps nobody and teaches an attacker that the id was real.
   *
   * Returns the same digest-free summary {@link listForCustomer} does, for the
   * same structural reason: the adapter projects an explicit column list, so no
   * object this returns has a `token_hash` to leak into a decision log.
   *
   * A superseded grant needs no separate field — B05 revokes the source row
   * before pointing it at its replacement, so supersession is already `REVOKED`.
   */
  findSummaryById(id: GrantId): Promise<SecureAccessGrantSummary | undefined>;
}
