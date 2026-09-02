/**
 * The `ORDER_ACCESS` grant lifecycle (`APP12-B04`, `APP12-DB01`).
 *
 * The one internal capability the Ready-Made order-creation command calls
 * instead of composing a token minter, a repository and a notifier itself — the
 * `SecureGrantIssuer` arrangement, applied to the second scope.
 *
 * Like `APP4-B05`, this publishes **no HTTP endpoint**, and for the same
 * reason: an "issue a grant" route would be an unauthenticated way to mint
 * someone else's only credential for their order. Issuance happens as a side
 * effect of an authorized in-process business action — the order creation that
 * has just resolved a verified `SUBMISSION` challenge — and this class is the
 * seam that action calls. `APP12-B04` §6 forbids a separate
 * `POST /orders/{id}/access` for exactly this.
 *
 * ## A sibling of `SecureGrantIssuer`, not a parameter on it
 *
 * `SecureGrantIssuer` writes `REQUEST_ACCESS` as a module constant and takes a
 * `customRequestId` it can neither create nor substitute. Adding a scope
 * parameter there would give the custom submission path a way to mint an order
 * grant and this path a way to mint a request grant — the failure `APP7-G01` §4
 * describes for the two transfer-reference builders, where the cost of a
 * duplicated derivation was accepted precisely so neither surface could address
 * the other's subject.
 *
 * What is *not* duplicated is anything that decides security: the token minter,
 * the peppered digest, the expiry policy, the repository, the audit recorder
 * and the delivery notifier are the delivered APP4 collaborators, injected
 * here. `APP12-B04` introduces no second token format, no second grant table,
 * no JWT, no customer account and no session.
 *
 * ## The raw token is returned exactly once, and never persisted
 *
 * Mint, digest, persist the **digest**, hand the plaintext to the notifier,
 * return it to the in-process caller. Nothing writes it to a column, a log, an
 * audit summary, an idempotency result or an error, and nothing can read it
 * back: `token_hash` is a peppered HMAC and no operation anywhere inverts one
 * (`ADR-APP4-001` §10).
 *
 * That is what decides the shape of the create response (`APP12-B04` §7). A
 * replayed creation runs none of this and therefore has no plaintext to
 * reproduce, so the HTTP contract publishes the **fact and deadline** of access
 * rather than the credential — which is the delivered bootstrap pattern
 * `APP5-B01` established, where the customer's link arrives through the APP4
 * notification path and never in a response body. Storing the token to make a
 * replay reproduce it would be storing a bearer credential in `jsonb`, which is
 * the one thing the digest exists to prevent.
 *
 * ## Exactly one current grant, arbitrated by the database
 *
 * `uq_secure_access_grants__customer_order__active` — the `ORDER_ACCESS` half of
 * CST-009, added by `APP12-DB01` — admits one ACTIVE grant per
 * (customer, order). {@link ensure} pre-reads and returns the live grant
 * unchanged rather than rotating, so a retry that reaches this class cannot
 * invalidate a link the customer is already holding; the index remains the
 * arbiter that two concurrent creations cannot race past.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError, newId } from '@embroidery/database';

import { App4SecretPepperProvider } from '../config/app4-secret-pepper.provider';
import { digestSecret } from '../domain/secret/app4-secret-digest';
import { SecureGrantError } from '../domain/grant/secure-grant-outcome';
import { ORDER_ACCESS_SCOPE } from '../domain/grant/grant-subject';
import { grantExpiryOf } from '../domain/grant/secure-grant-policy';
import {
  CUSTOMER_REPOSITORY,
  type CustomerId,
  type CustomerRepository,
} from '../domain/repositories/customer.repository';
import {
  SECURE_ACCESS_GRANT_REPOSITORY,
  type GrantId,
  type SecureAccessGrantRepository,
} from '../domain/repositories/secure-access-grant.repository';
import { SecureGrantPolicyReader } from '../infrastructure/policy/secure-grant-policy.reader';
import { SecureLinkTokenMinter } from '../infrastructure/crypto/secure-link-token.minter';
import { SecureGrantAuditRecorder } from './secure-grant-audit.recorder';
import { SecureGrantNotifier } from './secure-grant.notifier';

/** CST-009 — one ACTIVE grant per (customer, order). */
const GRANT_ALREADY_ACTIVE = 'GRANT_ALREADY_ACTIVE';
/** CST-008 — the token digest is globally unique. */
const GRANT_TOKEN_COLLISION = 'GRANT_TOKEN_COLLISION';

export interface EnsureOrderAccessCommand {
  readonly customerId: CustomerId;
  /**
   * The order this grant opens.
   *
   * Supplied by the authorized caller and never created here: `orders` is
   * Ordering's aggregate, `order_id` carries a real foreign key, and this class
   * creating an order to have something to point at would be Ordering business
   * logic in the Customer context.
   */
  readonly orderId: string;
  /**
   * Whether to deliver the link.
   *
   * A boolean, not a destination: the recipient is resolved from the customer's
   * own primary verified contact by {@link SecureGrantNotifier}, which has no
   * parameter an address could be put into. A caller holding an order id
   * therefore cannot redirect the credential that opens it.
   */
  readonly notify?: boolean | undefined;
}

/**
 * What an authorized in-process caller learns.
 *
 * There is no HTTP DTO here and this type must never become one — `rawToken` is
 * the field that makes it unserializable by policy, and `grantId` is an id
 * `APP4-B06` records must not reach a client.
 */
export interface IssuedOrderAccess {
  readonly grantId: GrantId;
  readonly expiresAt: Date;
  /** The plaintext, this once. Not recoverable from persistence afterwards. */
  readonly rawToken: string | undefined;
  /** Whether this call minted the grant, or found one already standing. */
  readonly minted: boolean;
}

@Injectable()
export class OrderAccessGrantIssuer {
  constructor(
    @Inject(SECURE_ACCESS_GRANT_REPOSITORY)
    private readonly grants: SecureAccessGrantRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    private readonly policies: SecureGrantPolicyReader,
    private readonly minter: SecureLinkTokenMinter,
    private readonly peppers: App4SecretPepperProvider,
    private readonly audit: SecureGrantAuditRecorder,
    private readonly notifier: SecureGrantNotifier,
  ) {}

  /**
   * Ensures the customer holds a live grant for this order.
   *
   * Returns the standing grant with `rawToken: undefined` when one already
   * exists, rather than rotating. Rotation would invalidate a link the customer
   * may be reading right now, and "make sure access exists" is not a request to
   * take it away — the same rule `SecureGrantIssuer.issue` states when it
   * refuses with `GRANT_ALREADY_ACTIVE`. This method reports the situation
   * instead of refusing, because its caller is a creation command whose
   * idempotent replay must not become a 409.
   *
   * Opens **no transaction**. It joins the caller's, which is the point: the
   * grant, the order, its line, its shipping detail and its reservation commit
   * together or not at all, so no `AWAITING_SHIPPING_FEE` order can exist that
   * its customer has no way to reach.
   *
   * @requiresTransaction
   */
  async ensure(command: EnsureOrderAccessCommand): Promise<IssuedOrderAccess> {
    const policy = await this.policies.require();
    const issuedAt = new Date();

    await this.assertTargetCustomer(command.customerId);

    const live = (await this.grants.listActiveForOrder(command.orderId)).find(
      (grant) => grant.customerId === command.customerId,
    );
    if (live !== undefined) {
      return {
        grantId: live.id,
        expiresAt: live.expiresAt,
        // Structurally absent, not withheld: the plaintext existed only in the
        // transaction that minted it and no column holds it.
        rawToken: undefined,
        minted: false,
      };
    }

    const grantId = newId() as GrantId;
    const rawToken = this.minter.mint();
    const tokenHash = digestSecret(this.peppers.require().secureLinkTokenPepper, rawToken);
    const expiresAt = grantExpiryOf(policy, issuedAt);

    try {
      await this.grants.issue({
        id: grantId,
        customerId: command.customerId,
        // The `ORDER_ACCESS` arm of the subject union. The literal scope selects
        // it, so this call cannot compile with a custom-request subject.
        scopeKind: ORDER_ACCESS_SCOPE,
        orderId: command.orderId,
        tokenHash,
        expiresAt,
      });
    } catch (error: unknown) {
      throw this.classifyInsert(error);
    }

    await this.audit.recordIssued({
      grantId,
      customerId: command.customerId,
      orderId: command.orderId,
      scopeKind: ORDER_ACCESS_SCOPE,
      expiresAt,
      notified: command.notify === true,
    });

    if (command.notify === true) {
      // Inside the caller's transaction: the intent, its sealed envelope and the
      // outbox event commit with the grant or not at all. A failure here unwinds
      // the order too, and the raw token dies in memory — there is no
      // compensation job, because there is nothing to compensate.
      await this.notifier.notify({
        grantId,
        customerId: command.customerId,
        rawToken,
        issuedAt,
        expiresAt,
      });
    }

    return { grantId, expiresAt, rawToken, minted: true };
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
   * both halves of CST-009 *and* the primary key. The driver's `DETAIL` — which
   * would quote the token digest — stays behind this boundary.
   */
  private classifyInsert(error: unknown): unknown {
    if (!isPersistenceError(error)) {
      return error;
    }
    if (error.kind === 'CONFLICT' && error.code === GRANT_ALREADY_ACTIVE) {
      // The pre-read above lost a race with a concurrent creation. Reported
      // rather than swallowed: the loser's whole transaction unwinds, which is
      // what keeps one order to one creation.
      return new SecureGrantError(GRANT_ALREADY_ACTIVE);
    }
    if (error.kind === 'CONFLICT' && error.code === GRANT_TOKEN_COLLISION) {
      // 256 bits of CSPRNG: a "cannot happen" that is nevertheless catalogued,
      // because CST-008 exists to make a collision loud rather than a silent
      // second grant on one token.
      return new SecureGrantError(GRANT_TOKEN_COLLISION);
    }
    if (error.kind === 'INVALID_REFERENCE') {
      // The customer was checked above, so in practice this is the order.
      return new SecureGrantError('GRANT_TARGET_INVALID');
    }
    return error;
  }
}
