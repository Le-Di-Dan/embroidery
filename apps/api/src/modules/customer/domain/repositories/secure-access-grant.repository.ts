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

/**
 * A live grant, in either of the two scopes (`APP12-B04`).
 *
 * `customRequestId` and `orderId` are a **typed XOR**, not two optional
 * conveniences: `ck_secure_access_grants__scope_subject` refuses a row carrying
 * both, neither, or the other scope's subject, so exactly one of them is a
 * string on every row that exists. They are widened to `string | undefined`
 * rather than split into a discriminated union because every resolver in this
 * contract reads a grant *before* its scope is known — a union would make the
 * repository decide the scope, which is precisely the decision that has to come
 * from the row.
 *
 * A consumer serving one scope narrows with `requestSubjectOf` /
 * `orderSubjectOf` (`domain/grant/grant-subject.ts`), which refuse the other
 * scope with the one indistinguishable `SECURE_LINK_UNAVAILABLE`. Reading
 * either field directly and trusting it is the mistake those helpers exist to
 * prevent.
 */
export interface SecureAccessGrant {
  readonly id: GrantId;
  readonly customerId: CustomerId;
  /** The `REQUEST_ACCESS` subject. `undefined` on an `ORDER_ACCESS` grant. */
  readonly customRequestId: string | undefined;
  /** The `ORDER_ACCESS` subject. `undefined` on a `REQUEST_ACCESS` grant. */
  readonly orderId: string | undefined;
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
  /** The `REQUEST_ACCESS` subject; `undefined` for an `ORDER_ACCESS` grant. */
  readonly customRequestId: string | undefined;
  /** The `ORDER_ACCESS` subject; `undefined` for a `REQUEST_ACCESS` grant. */
  readonly orderId: string | undefined;
  readonly scopeKind: GrantScopeKind;
  readonly status: SecureAccessGrantState;
  readonly expiresAt: Date;
}

/**
 * The grant subject, as a closed union (`APP12-B04`).
 *
 * The scope and its subject travel together and cannot be stated apart, so no
 * caller can ask for an `ORDER_ACCESS` grant carrying a request id — the shape
 * has nowhere to put one. That is the application-side form of
 * `ck_secure_access_grants__scope_subject`, enforced by the compiler before the
 * CHECK ever sees the row.
 */
export type GrantSubject =
  | { readonly scopeKind: 'REQUEST_ACCESS'; readonly customRequestId: string }
  | { readonly scopeKind: 'ORDER_ACCESS'; readonly orderId: string };

export type IssueGrantInput = {
  readonly id: GrantId;
  readonly customerId: CustomerId;
  /** A hash of the link token — never the token itself. */
  readonly tokenHash: string;
  readonly expiresAt: Date;
} & GrantSubject;

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
   * `scopes` stays an argument rather than a constant here, exactly as
   * `scopeKind` is on {@link resolveActive}: which scopes a surface admits is
   * business authority (ADR-DB3-004 r1, `APP12-RELEASE-WAVE-AUTHORITY.md` §3.2)
   * and belongs to the application layer, not to persistence. It became a
   * **set** at `APP12-B04` because the public resolver must admit a grant of
   * either scope and then decide from the resolved row — a caller forced to name
   * one scope up front could only cover both by asking twice, and two queries
   * are two timings a probe can tell apart.
   *
   * Read-only, and returns nothing rather than throwing for every failing
   * reason — unknown digest, expired, revoked, superseded, wrong scope — for the
   * same non-disclosure reason {@link resolveActive} does.
   */
  resolveActiveByTokenDigest(
    tokenHash: string,
    scopes: readonly GrantScopeKind[],
    now: Date,
  ): Promise<SecureAccessGrant | undefined>;

  /**
   * The same live-grant resolution as {@link resolveActiveByTokenDigest}, taken
   * **under the grant row's `FOR UPDATE` lock** (`APP6-B05`, ADR-DB3-004 r9).
   *
   * Added because a sensitive write may not act on a pre-transaction
   * authorization snapshot. `APP6-B05`'s quotation acceptance authorizes through
   * the public admission first — policy, abuse budget, digest — and then has to
   * re-establish the *same* facts inside the transaction that writes the
   * acceptance evidence, because the window between the two is exactly where
   * CC-16 lives: a revoke that commits in it must win.
   *
   * A plain re-read inside the transaction already sees a revoke that committed
   * **before** it. The lock closes the other half: a revoke arriving *after*
   * this read blocks on the row until the acceptance transaction ends, rather
   * than committing beside it. Those two orderings are then the only two
   * outcomes, and which one happens is decided by which transaction reached the
   * row first — not by how much work the acceptance had left to do.
   *
   * `FOR UPDATE` rather than `FOR SHARE`: the competing writer is
   * {@link revoke}, an `UPDATE` on this row, and a share lock would let it
   * proceed concurrently.
   *
   * Returns nothing rather than throwing for every failing reason — unknown
   * digest, expired, revoked, superseded, wrong scope — for the same
   * non-disclosure reason the two resolvers above do.
   *
   * @requiresTransaction — a lock taken outside one is released immediately and
   * proves nothing.
   */
  lockActiveByTokenDigest(
    tokenHash: string,
    scopes: readonly GrantScopeKind[],
    now: Date,
  ): Promise<SecureAccessGrant | undefined>;

  findById(id: GrantId): Promise<SecureAccessGrant | undefined>;
  listActiveForRequest(customRequestId: string): Promise<SecureAccessGrant[]>;

  /**
   * The `ORDER_ACCESS` counterpart of {@link listActiveForRequest}
   * (`APP12-B04`).
   *
   * A second method rather than a widened first one: the request read leads with
   * a column that is `NULL` on every order grant, so it can never return one,
   * and a NULL-tolerant predicate would silently list *every* order grant for a
   * caller that passed nothing. `uq_secure_access_grants__customer_order__active`
   * — the `ORDER_ACCESS` half of CST-009 that `APP12-DB01` added for exactly
   * this — admits at most one ACTIVE row per (customer, order), so this list is
   * the friendly pre-read and the index stays the arbiter.
   */
  listActiveForOrder(orderId: string): Promise<SecureAccessGrant[]>;

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
