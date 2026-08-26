/**
 * The chain an evidence operation is authorized along, proved server-side
 * (`APP7-G01` §7.3/§7.5, `APP7-B05` §5).
 *
 * ```text
 * secure token          → the grant row, re-established under its lock
 *   → grant.customRequestId
 *     → orders.custom_request_id            uq_orders__request, exactly one
 *       → payment_obligations(order_id), of either kind
 *         → the exact payment_attempts row the caller named
 * ```
 *
 * ### The attempt id is a locator, and every link is re-proved
 *
 * `APP7-B03` deliberately defined no current-attempt selector, so evidence has
 * to name the attempt it belongs to. Naming is all the caller does: the attempt
 * is read under its own row lock and then checked to belong to an obligation of
 * the order this request produced, and to have been opened by the one method
 * this surface has an evidence flow for. Changing the id therefore cannot reach
 * another customer's order — it reaches a row that fails the order comparison.
 *
 * ### Attempt-scoped, not kind-scoped (`APP9-B02`)
 *
 * `APP7-B05` additionally required the attempt's obligation to be the live
 * `DEPOSIT` one, because `DEPOSIT` was the only obligation APP7 made payable.
 * `payment_transfer_evidence` is attempt-scoped (`IMP-D055`) and `APP9-B02` makes
 * `REMAINING` payable through a sibling surface, so that clause is now the
 * obligation-kind assertion below: **either** `CST-039` kind, provided the
 * obligation belongs to this request's order. Nothing else about the chain
 * moved. In particular the order comparison — the clause isolation actually
 * rests on — is unchanged, and is now load-bearing on its own rather than
 * shadowed by an obligation-identity comparison that could only ever hold for
 * one kind.
 *
 * No selection rule is invented anywhere: nothing here reads "latest", "newest
 * `PENDING`" or "highest `created_at`".
 *
 * ### One answer for every miss
 *
 * An unknown attempt, another order's attempt, another customer's attempt, an
 * attempt whose obligation is of neither `CST-039` kind, an attempt whose method
 * is not `BANK_TRANSFER`, an unknown token, an expired grant, a request with no order —
 * all leave as the delivered `404 / SECURE_LINK_UNAVAILABLE`, identical in
 * status, code, message and shape. A caller cannot tell a foreign attempt id
 * from a fictional one.
 *
 * The two refusals that are *not* folded in are reachable only after the caller
 * has proved possession of a live grant for this request, so neither discloses
 * anything a probe did not already hold: the attempt is closed, or the step-up
 * this attempt was opened with no longer stands.
 */
import { Injectable } from '@nestjs/common';
import {
  PaymentTransferEvidenceRepository,
  type AttemptId,
  type LockedEvidenceAttempt,
  type ObligationId,
} from '@embroidery/persistence';

import { ReauthorizeSecureGrant } from '../../../customer/application/reauthorize-secure-grant.service';
import { secureLinkUnavailable } from '../../../customer/domain/grant/secure-link.errors';
import type { CustomerId } from '../../../customer/domain/repositories/customer.repository';
import type { CustomRequestId } from '../../../order/domain/repositories/custom-request.repository';
import {
  TRANSFER_EVIDENCE_ATTEMPT_METHOD,
  acceptsTransferEvidence,
} from '../../domain/evidence/transfer-evidence.policy';
import { transferEvidenceError } from '../../domain/evidence/transfer-evidence.errors';
import { PaymentTargetResolver } from '../customer/payment-target.resolver';
import { AttemptStepUpVerifier } from './attempt-step-up.verifier';

/**
 * The obligation kinds a customer may attach transfer evidence to.
 *
 * Both of the two `CST-039` kinds, and stated as a closed set rather than
 * omitted: a third kind added later must fail here until someone decides that
 * this surface should carry its evidence.
 */
const EVIDENCE_OBLIGATION_KINDS: readonly string[] = ['DEPOSIT', 'REMAINING'];

/** Everything a proved evidence operation may act on. No token, no digest. */
export interface AuthorizedEvidenceAttempt {
  readonly customerId: CustomerId;
  readonly customRequestId: string;
  readonly orderId: string;
  readonly obligationId: ObligationId;
  readonly attempt: LockedEvidenceAttempt;
}

@Injectable()
export class EvidenceAttemptAuthorizer {
  constructor(
    private readonly grants: ReauthorizeSecureGrant,
    private readonly targets: PaymentTargetResolver,
    private readonly evidence: PaymentTransferEvidenceRepository,
    private readonly stepUp: AttemptStepUpVerifier,
  ) {}

  /**
   * Proves the whole chain and returns the locked attempt, or refuses.
   *
   * @requiresTransaction — the grant lock, the attempt lock and the reads that
   * compare them are only coherent inside one transaction. Both callers open
   * their own: the upload's pre-stream check so a hopeless request is refused
   * before ten megabytes are sent, and Tx B so the row the association binds to
   * is the row that was still authorized at commit.
   */
  async authorize(input: {
    readonly token: string;
    readonly attemptId: string;
    readonly now: Date;
    /** Whether the attempt must still accept evidence. False for a zero-write read. */
    readonly requireOpenAttempt: boolean;
  }): Promise<AuthorizedEvidenceAttempt> {
    const grant = await this.grants.reauthorize(input.token, input.now);
    const order = await this.targets.resolveOrder(grant.customRequestId as CustomRequestId);

    const attempt = await this.evidence.lockAttemptForEvidence(input.attemptId as AttemptId);
    if (attempt === undefined) {
      throw secureLinkUnavailable();
    }
    // Three comparisons, none redundant: the first is what stops a foreign
    // attempt id — the attempt's own obligation must hang off *this* request's
    // order — and the third stops a reachable row opened by a method this
    // surface has no evidence flow for. The kind is asserted against the closed
    // set above rather than against one literal, so a third kind is refused.
    if (
      attempt.obligationOrderId !== order.id ||
      !EVIDENCE_OBLIGATION_KINDS.includes(attempt.obligationKind) ||
      attempt.method !== TRANSFER_EVIDENCE_ATTEMPT_METHOD
    ) {
      throw secureLinkUnavailable();
    }

    // GRD-003's evidence, re-verified and never re-issued: the challenge is the
    // one recorded on this attempt, not one the caller presented.
    await this.stepUp.verify(grant.customerId, attempt.stepUpChallengeId);

    if (input.requireOpenAttempt && !acceptsTransferEvidence(attempt.status)) {
      throw transferEvidenceError('EVIDENCE_ATTEMPT_CLOSED');
    }

    return {
      customerId: grant.customerId,
      customRequestId: grant.customRequestId,
      orderId: order.id,
      // The attempt's *own* obligation, read off the locked row. Never the one a
      // kind-scoped lookup returned: those were the same value only while
      // DEPOSIT was the only payable kind.
      obligationId: attempt.paymentObligationId,
      attempt,
    };
  }
}
