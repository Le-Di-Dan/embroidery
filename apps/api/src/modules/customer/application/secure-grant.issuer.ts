/**
 * The secure-grant lifecycle (`APP4-B05`) — the one internal capability APP5,
 * and later `APP4-B07`, call instead of composing a token issuer, a repository
 * and a notification use case themselves (§18).
 *
 * `APP4-B05` publishes **no HTTP endpoint**. That is not an omission: an
 * "issue a grant" route would be an unauthenticated way to mint someone's only
 * credential for a request (`APP4_PHASE_ENTRY_AUDIT` §C.2). Issuance happens as
 * a side effect of an authorized in-process business action — an APP5 request
 * submission — and this class is the seam that action calls.
 *
 * ### The raw token is returned exactly once
 *
 * Every path here mints, digests, persists the **digest**, and returns the
 * plaintext to its in-process caller. Nothing writes it to a column, a log, an
 * audit summary or an error, and nothing can read it back: `token_hash` is a
 * peppered HMAC and there is no operation anywhere in APP4 that inverts one
 * (`ADR-APP4-001` §10). A caller that loses the returned value calls `reissue`,
 * which is precisely why `reissue` exists (ADR-DB3-004 r6).
 *
 * ### Scope is fixed, not chosen
 *
 * `REQUEST_ACCESS` is written by this file, never accepted from a caller. It is
 * the only value `GRANT_SCOPE_KINDS` allows (ADR-DB3-004 r1), and a parameter
 * offering one legal value is an invitation to add a second without an ADR. A
 * multi-scope model arrives as a child table, additively.
 *
 * ### The database is the concurrency arbiter
 *
 * There is no mutex, no advisory lock and no application-side "is one already
 * active" that decides anything. CST-009 — the partial unique index over ACTIVE
 * rows — is the arbiter for duplicate issuance, and the `status = 'ACTIVE'`
 * predicate on the revoke UPDATE is the compare-and-set that makes concurrent
 * reissue safe. The pre-read below is an early, friendly refusal; the arbiter is
 * the one that cannot be raced.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError, newId } from '@embroidery/database';
import type { GrantScopeKind } from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';

import type { AuditActor } from '../../audit/domain/repositories/audit-event.repository';
import { App4SecretPepperProvider } from '../config/app4-secret-pepper.provider';
import { digestSecret } from '../domain/secret/app4-secret-digest';
import { GRANT_SUPERSEDED_REASON, SecureGrantError } from '../domain/grant/secure-grant-outcome';
import { REQUEST_ACCESS_SCOPE, requestSubjectOf } from '../domain/grant/grant-subject';
import { grantExpiryOf } from '../domain/grant/secure-grant-policy';
import {
  CUSTOMER_REPOSITORY,
  type CustomerId,
  type CustomerRepository,
} from '../domain/repositories/customer.repository';
import {
  SECURE_ACCESS_GRANT_REPOSITORY,
  type GrantId,
  type SecureAccessGrant,
  type SecureAccessGrantRepository,
} from '../domain/repositories/secure-access-grant.repository';
import { SecureGrantPolicyReader } from '../infrastructure/policy/secure-grant-policy.reader';
import { SecureLinkTokenMinter } from '../infrastructure/crypto/secure-link-token.minter';
import { VerificationClock } from '../infrastructure/clock/verification-clock';
import { SecureGrantAuditRecorder } from './secure-grant-audit.recorder';
import { SecureGrantNotifier } from './secure-grant.notifier';

/** The single scope this phase issues (ADR-DB3-004 r1, `GRANT_SCOPE_KINDS`). */
const REQUEST_ACCESS = REQUEST_ACCESS_SCOPE satisfies GrantScopeKind;

/** CST-009 — one ACTIVE grant per (customer, request). */
const GRANT_ALREADY_ACTIVE = 'GRANT_ALREADY_ACTIVE';
/** CST-008 — the token digest is globally unique. */
const GRANT_TOKEN_COLLISION = 'GRANT_TOKEN_COLLISION';
/** A guarded UPDATE matched no row: the state moved under this transaction. */
const RECORD_NOT_FOUND = 'RECORD_NOT_FOUND';

/**
 * The grant target.
 *
 * `customRequestId` is supplied by the authorized caller and never created here
 * — `custom_requests` is APP5's aggregate, `custom_request_id` is NOT NULL with
 * an FK RESTRICT, and B05 creating a request to have something to point at would
 * be APP5 business logic in the wrong phase.
 */
export interface GrantTarget {
  readonly customerId: CustomerId;
  readonly customRequestId: string;
}

export interface IssueGrantCommand extends GrantTarget {
  /**
   * Whether to deliver the link.
   *
   * A boolean, not a destination: the recipient is resolved from the customer's
   * own verified contacts by {@link SecureGrantNotifier} (§12).
   */
  readonly notify?: boolean | undefined;
}

/**
 * What an authorized in-process caller learns. There is no HTTP DTO, and this
 * type must never become one — `rawToken` is the field that makes it
 * unserializable by policy.
 */
export interface IssuedGrant {
  readonly grantId: GrantId;
  readonly expiresAt: Date;
  /** The plaintext, this once. Not recoverable from persistence afterwards. */
  readonly rawToken: string;
}

@Injectable()
export class SecureGrantIssuer {
  constructor(
    @Inject(SECURE_ACCESS_GRANT_REPOSITORY)
    private readonly grants: SecureAccessGrantRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    private readonly transactions: TransactionManager,
    private readonly policies: SecureGrantPolicyReader,
    private readonly minter: SecureLinkTokenMinter,
    private readonly peppers: App4SecretPepperProvider,
    private readonly audit: SecureGrantAuditRecorder,
    private readonly notifier: SecureGrantNotifier,
    private readonly clock: VerificationClock,
  ) {}

  /**
   * Issues the customer's grant for one request.
   *
   * Refuses with `GRANT_ALREADY_ACTIVE` when one already exists rather than
   * rotating: a caller asking to make sure a grant exists must not invalidate a
   * link the customer is currently holding. Rotation is {@link reissue}.
   */
  async issue(command: IssueGrantCommand): Promise<IssuedGrant> {
    const policy = await this.policies.require();
    const issuedAt = this.clock.now();

    return this.transactions.runInTransaction(async () => {
      await this.assertTargetCustomer(command.customerId);

      const live = await this.findActive(command);
      if (live !== undefined) {
        throw new SecureGrantError(GRANT_ALREADY_ACTIVE);
      }

      return await this.mint({
        target: command,
        issuedAt,
        expiresAt: grantExpiryOf(policy, issuedAt),
        notify: command.notify === true,
      });
    });
  }

  /**
   * Rotates the customer's grant for one request (ADR-DB3-004 r6).
   *
   * The three steps below are one transaction and one order, and the order is
   * forced by the schema rather than chosen: the old row must be `REVOKED`
   * before the new one may be `ACTIVE` (CST-009 admits one), and the new row
   * must exist before `superseded_by_grant_id` may point at it (the
   * self-referencing FK rejects a dangling pointer).
   *
   * A new token, a new digest, a new expiry and — when requested — a new intent,
   * a new outbox event and a **new envelope**. Nothing is copied from the old
   * grant: reusing its ciphertext would redeliver the old token, which
   * `resolveActive` would then refuse, and reusing the old row would collide
   * with the delivery contract `ADR-APP4-001` PO-10 draws between business
   * reissue, transport retry and Admin replay.
   */
  async reissue(command: IssueGrantCommand): Promise<IssuedGrant> {
    const policy = await this.policies.require();
    const issuedAt = this.clock.now();

    return this.transactions.runInTransaction(async () => {
      const source = await this.findActive(command);
      if (source === undefined) {
        throw new SecureGrantError('GRANT_NOT_ACTIVE');
      }

      // The compare-and-set. Its `status = 'ACTIVE'` predicate is what makes two
      // concurrent reissues resolve deterministically: the second waits on the
      // first's row lock, then matches nothing and unwinds, leaving exactly one
      // ACTIVE replacement and no orphan.
      await this.revokeActive(source.id, GRANT_SUPERSEDED_REASON, 'GRANT_CONCURRENT_REISSUE_LOSS');

      const replacement = await this.mint({
        target: command,
        issuedAt,
        expiresAt: grantExpiryOf(policy, issuedAt),
        notify: command.notify === true,
        reissuedFrom: source.id,
      });

      await this.grants.supersede(source.id, replacement.grantId, GRANT_SUPERSEDED_REASON);
      return replacement;
    });
  }

  /**
   * Withdraws a live grant (`TR-LC03-02`), exposed by `APP4-B07`.
   *
   * Mints nothing, delivers nothing and creates no replacement. A revoked grant
   * is terminal — LC-03 has no `REVOKED → ACTIVE` edge and this class offers no
   * method that could imply one; restoring access is a fresh {@link issue}.
   *
   * The reason is mandatory here *and* in the schema
   * (`ck_secure_access_grants__revoke_reason_required`). Checking it in the
   * application first is not redundancy for its own sake: the CHECK would reject
   * a blank reason as an opaque constraint violation after the audit row had
   * been composed, and "a revoked grant without a reason is not evidence" is a
   * rule worth stating where a caller can read it.
   *
   * ### `actor` — added by `APP4-B07`
   *
   * An operator-initiated revocation and a customer-flow one are the same
   * transition over the same row, so they share this method; what differs is who
   * did it, and the audit trail may not guess. `SecureGrantAuditRecorder` has
   * carried an optional actor since B05 for exactly this caller, defaulting to
   * `CUSTOMER` when none is supplied.
   *
   * It is a **parameter**, not something this class reads from the request
   * context. B05's other callers are in-process APP5 business actions with no
   * Admin bound at all, and a context read would either fabricate an actor for
   * them or make this method fail outside HTTP. The caller that knows it is an
   * operator says so; every other path keeps the behaviour it was accepted with.
   */
  async revoke(grantId: GrantId, reason: string, actor?: AuditActor): Promise<void> {
    if (reason.trim() === '') {
      throw new SecureGrantError('GRANT_REVOKE_REASON_REQUIRED');
    }

    await this.transactions.runInTransaction(async () => {
      const grant = await this.grants.findById(grantId);
      if (grant === undefined) {
        throw new SecureGrantError('GRANT_NOT_ACTIVE');
      }

      await this.revokeActive(grantId, reason, 'GRANT_NOT_ACTIVE');

      await this.audit.recordRevoked({
        grantId,
        customerId: grant.customerId,
        // `APP12-B04` widened the grant's subject to a scope-dependent XOR. This
        // class issues, reissues and revokes `REQUEST_ACCESS` grants only, so a
        // grant reaching here without a request subject is one of another scope
        // — refused rather than revoked, because the audit row would otherwise
        // record a withdrawal against no subject. `APP12-B04`'s
        // `OrderAccessGrantIssuer` owns the other scope end to end.
        customRequestId: requestSubjectOf(grant),
        reason,
        ...(actor === undefined ? {} : { actor }),
      });
    });
  }

  /**
   * Mint, digest, persist, audit, optionally deliver.
   *
   * The plaintext exists in this method's local scope and in the single
   * `notifier.notify` argument, and nowhere else in the process. It is not
   * assigned to a field, not put in the audit summary, and not included in any
   * error raised below it.
   *
   * @requiresTransaction
   */
  private async mint(input: {
    readonly target: GrantTarget;
    readonly issuedAt: Date;
    readonly expiresAt: Date;
    readonly notify: boolean;
    readonly reissuedFrom?: GrantId | undefined;
  }): Promise<IssuedGrant> {
    const grantId = newId() as GrantId;
    const rawToken = this.minter.mint();
    const tokenHash = digestSecret(this.peppers.require().secureLinkTokenPepper, rawToken);

    try {
      await this.grants.issue({
        id: grantId,
        customerId: input.target.customerId,
        // The `REQUEST_ACCESS` arm of the subject union. The literal scope is
        // what selects it, so this call cannot compile with an order subject.
        scopeKind: REQUEST_ACCESS,
        customRequestId: input.target.customRequestId,
        tokenHash,
        expiresAt: input.expiresAt,
      });
    } catch (error: unknown) {
      throw this.classifyInsert(error);
    }

    await this.audit.recordIssued({
      grantId,
      customerId: input.target.customerId,
      customRequestId: input.target.customRequestId,
      scopeKind: REQUEST_ACCESS,
      expiresAt: input.expiresAt,
      notified: input.notify,
      ...(input.reissuedFrom === undefined ? {} : { reissuedFromGrantId: input.reissuedFrom }),
    });

    if (input.notify) {
      // Inside the same transaction: the intent, its sealed envelope and the
      // outbox event commit with the grant or not at all. A failure here unwinds
      // the grant too, and the raw token dies in memory — there is no
      // compensation job, because there is nothing to compensate.
      await this.notifier.notify({
        grantId,
        customerId: input.target.customerId,
        rawToken,
        issuedAt: input.issuedAt,
        expiresAt: input.expiresAt,
      });
    }

    return { grantId, expiresAt: input.expiresAt, rawToken };
  }

  /** The ACTIVE grant for this target, if any. CST-009 admits at most one. */
  private async findActive(target: GrantTarget): Promise<SecureAccessGrant | undefined> {
    const active = await this.grants.listActiveForRequest(target.customRequestId);
    return active.find((grant) => grant.customerId === target.customerId);
  }

  /**
   * The guarded `ACTIVE → REVOKED` transition, with the caller's own meaning for
   * "it was not active".
   *
   * A revoke that matches no row means different things to different callers —
   * a lost reissue race, or a grant that was already withdrawn — and the
   * repository cannot tell them apart, so the caller names the failure.
   */
  private async revokeActive(
    grantId: GrantId,
    reason: string,
    onMissing: 'GRANT_NOT_ACTIVE' | 'GRANT_CONCURRENT_REISSUE_LOSS',
  ): Promise<void> {
    try {
      await this.grants.revoke(grantId, reason);
    } catch (error: unknown) {
      if (isPersistenceError(error) && error.code === RECORD_NOT_FOUND) {
        throw new SecureGrantError(onMissing);
      }
      throw error;
    }
  }

  /** The customer must exist and still be usable as a grant subject. */
  private async assertTargetCustomer(customerId: CustomerId): Promise<void> {
    const customer = await this.customers.findById(customerId);
    if (
      customer === undefined ||
      customer.mergedIntoCustomerId !== undefined ||
      customer.anonymizedAt !== undefined
    ) {
      // A merged customer's grants belong to the survivor (ADR-DB3-004 r5), and
      // an anonymized one has no contact left to reach. Neither is a target.
      throw new SecureGrantError('GRANT_TARGET_INVALID');
    }
  }

  /**
   * Maps the three insert failures that mean something.
   *
   * Matched on the catalogued **code**, never on a SQLSTATE: `23505` is CST-008,
   * CST-009 *and* the primary key, and `23503` is any of three foreign keys. The
   * driver's `DETAIL` — which would quote the token digest — stays behind this
   * boundary, and the returned error carries no cause to unwrap.
   */
  private classifyInsert(error: unknown): unknown {
    if (!isPersistenceError(error)) {
      return error;
    }
    if (error.kind === 'CONFLICT' && error.code === GRANT_ALREADY_ACTIVE) {
      return new SecureGrantError(GRANT_ALREADY_ACTIVE);
    }
    if (error.kind === 'CONFLICT' && error.code === GRANT_TOKEN_COLLISION) {
      // 256 bits of CSPRNG: this is a "cannot happen" that is nevertheless
      // catalogued, because CST-008 exists to make a collision loud rather than
      // a silent second grant on one token.
      return new SecureGrantError(GRANT_TOKEN_COLLISION);
    }
    if (error.kind === 'INVALID_REFERENCE') {
      // The customer was checked above, so in practice this is the request:
      // `custom_requests` is APP5's and B05 never creates one.
      return new SecureGrantError('GRANT_TARGET_INVALID');
    }
    return error;
  }
}
