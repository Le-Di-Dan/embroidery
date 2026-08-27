/**
 * The customer accepting one exact shipping-fee increase (`APP9-B04-C1`).
 *
 * ### Why this operation exists
 *
 * The first `APP9-B04` attempt let the Admin write *mint* the acknowledgement:
 * it looked for a live grant and any recent verified step-up and, finding both,
 * appended the customer evidence itself. That proves the customer is reachable
 * and was recently re-verified for *something*. It does not prove they decided
 * anything, and a row saying they accepted a higher price when they were never
 * asked is worse than no row at all. `shipping_fee_acknowledgements` is customer
 * evidence (DEV-DB6-014), so the customer has to be the one who writes it — and
 * this call **is** that decision:
 *
 * ```text
 * REQUEST_ACCESS   authorization to reach this order
 * STEP_UP          recent re-verification that it is this customer
 * this command     the decision itself
 * the TBL-049 row  durable evidence tying the decision to the exact fee tuple
 * ```
 *
 * ### One transaction
 *
 * ```text
 * begin
 *   re-establish the grant under its row lock            ADR-DB3-004 r9
 *   walk grant -> request -> order, lock the shipping detail and read the
 *     baseline                    (the same locked read the Admin write uses)
 *   refuse a frozen detail
 *   derive previousFee on the server; require newFee > previousFee
 *   an identical acknowledgement already stands? -> replay, write nothing
 *   require a fresh STEP_UP for this grant's customer    GRD-003
 *   append exactly one acknowledgement row
 * commit
 * ```
 *
 * ### What it cannot do
 *
 * No shipping detail is created or updated, no obligation is superseded or
 * created, no payment attempt is opened, no order moves and no event is emitted.
 * That is structural rather than a promise: this use case holds
 * `SHIPPING_FEE_ACKNOWLEDGEMENT_PORT`, whose three methods are two reads and one
 * append, and its module imports neither `ORDER_REPOSITORY` nor any payment
 * contract. `WHO_EDITS_BEFORE_FREEZE = ADMIN` survives intact: the customer
 * records a decision, and the operator still applies the fee.
 *
 * ### Replay (§16)
 *
 * There is no `shipping.acknowledge` row in `DB3_IDEMPOTENCY_SPECIFICATION.md`,
 * so no namespace is invented and no second idempotency subsystem is added. The
 * append-only table is its own replay authority: the exact tuple — order,
 * previous fee, new fee, currency — is looked up first, and a match is returned
 * as a replay with nothing written. Two *concurrent* identical calls carry the
 * same token by construction, so they serialize on the grant row this
 * transaction already locks; the loser then re-reads the committed row and
 * replays it.
 *
 * ### Nothing secret is read, held or stored
 *
 * The token reaches `ReauthorizeSecureGrant`, which digests it against the
 * delivered pepper and never returns it. What is written are two evidence
 * references, exactly as `quotation_acceptances` writes them. No OTP, no code,
 * no digest and no pepper passes through this file.
 */
import { Inject, Injectable } from '@nestjs/common';
import { TransactionManager } from '@embroidery/persistence';

import { AuditClock } from '../../../../platform/audit-context/audit-clock';
import { ReauthorizeSecureGrant } from '../../../customer/application/reauthorize-secure-grant.service';
import { StepUpEvidenceResolver } from '../../../customer/application/step-up-evidence.resolver';
import { SecureGrantError } from '../../../customer/domain/grant/secure-grant-outcome';
import { secureLinkUnavailable } from '../../../customer/domain/grant/secure-link.errors';
import type { CustomRequestId } from '../../domain/repositories/custom-request.repository';
import {
  SHIPPING_FEE_ACKNOWLEDGEMENT_PORT,
  type ShippingFeeAcknowledgementPort,
  type ShippingFeeAcknowledgementRecord,
} from '../../domain/repositories/shipping-fee-acknowledgement.port';
import { shippingFeeAcknowledgementError } from '../../domain/shipping/shipping-fee-acknowledgement.errors';
import { baselineFeeOf } from '../../domain/shipping/shipping-fee-baseline';
import {
  formatFeeAmount,
  isWholeDong,
  parseFeeAmount,
} from '../../domain/shipping/shipping-fee-amount';

/** The whole input: one credential and the fee the customer is accepting. */
export interface AcknowledgeShippingFeeCommand {
  readonly token: string;
  readonly newFeeAmount: string;
}

export interface ShippingFeeAcknowledgementView {
  readonly orderCode: string;
  readonly previousFeeAmount: string;
  readonly newFeeAmount: string;
  readonly currencyCode: string;
  readonly acknowledgedAt: Date;
  readonly replayed: boolean;
}

/** The one shipping state a fee may still move in (LC-19). */
const EDITABLE = 'EDITABLE';

@Injectable()
export class AcknowledgeShippingFeeUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly grants: ReauthorizeSecureGrant,
    private readonly stepUp: StepUpEvidenceResolver,
    @Inject(SHIPPING_FEE_ACKNOWLEDGEMENT_PORT)
    private readonly acknowledgements: ShippingFeeAcknowledgementPort,
    private readonly clock: AuditClock,
  ) {}

  async acknowledge(
    command: AcknowledgeShippingFeeCommand,
  ): Promise<ShippingFeeAcknowledgementView> {
    // Parsed before the transaction opens: a malformed amount must not hold a
    // connection, and it is refused as *not an increase* rather than as a
    // diagnostic, because a public caller learns nothing from the difference.
    const submitted = parseFeeAmount(command.newFeeAmount);
    if (submitted === undefined || !isWholeDong(submitted)) {
      throw shippingFeeAcknowledgementError('SHIPPING_FEE_NOT_INCREASED');
    }
    const newFeeAmount = formatFeeAmount(submitted);

    try {
      return await this.transactions.runInTransaction(async () => {
        const now = this.clock.now();
        const grant = await this.grants.reauthorize(command.token, now);

        // grant -> request -> order. The order is never named by the caller, so
        // one customer's link can only ever reach that customer's own order.
        const context = await this.acknowledgements.lockFeeContextForRequest(
          grant.customRequestId as CustomRequestId,
        );
        if (context === undefined) {
          throw secureLinkUnavailable();
        }
        if (context.shippingStatus !== undefined && context.shippingStatus !== EDITABLE) {
          throw shippingFeeAcknowledgementError('SHIPPING_FEE_NOT_ADJUSTABLE');
        }

        // Server authority, always. The client sends the fee it is accepting and
        // never the fee it is moving from; a caller-supplied previous fee would
        // let a stale screen bind an acknowledgement to a baseline that is no
        // longer real, which is exactly the evidence §17 must make unusable.
        const previous = baselineFeeOf(context);
        if (previous === undefined) {
          throw shippingFeeAcknowledgementError('SHIPPING_FEE_NOT_ADJUSTABLE');
        }
        if (submitted <= previous) {
          // Increases only (§6). A decrease needs no acknowledgement and an
          // equal fee is not a decision; both are the same answer here, because
          // the next step in either case is to re-read the order.
          throw shippingFeeAcknowledgementError('SHIPPING_FEE_NOT_INCREASED');
        }
        const previousFeeAmount = formatFeeAmount(previous);

        const standing = await this.acknowledgements.findAcknowledgement({
          orderId: context.orderId,
          previousFeeAmount,
          newFeeAmount,
        });
        if (standing !== undefined) {
          // Checked **before** GRD-003, on the delivered precedent of
          // `AcceptQuotationUseCase` and `InitiateFinalPaymentAttemptUseCase`
          // and for their reason: a replay performs no write, and gating it on a
          // still-open step-up window would tell a customer retrying after a
          // dropped response to re-verify in order to be shown a decision they
          // already made.
          return view(context.orderCode, standing, true);
        }

        // GRD-003, and the last thing between this caller and the write. The
        // evidence is derived from the grant's customer — no challenge id is
        // accepted from the body — so a caller cannot present someone else's
        // proof of presence.
        const evidence = await this.stepUp.resolve(grant.customerId, now);
        if (evidence === undefined) {
          throw shippingFeeAcknowledgementError('REVERIFICATION_REQUIRED');
        }

        const appended = await this.acknowledgements.appendAcknowledgement({
          orderId: context.orderId,
          previousFeeAmount,
          newFeeAmount,
          grantId: grant.id,
          stepUpChallengeId: evidence.challengeId,
          acknowledgedAt: now,
        });
        return view(context.orderCode, appended, false);
      });
    } catch (error: unknown) {
      if (error instanceof SecureGrantError) {
        // The `secure_grant` policy is unpublished or unusable. A 503, not a
        // refusal of the decision.
        throw shippingFeeAcknowledgementError('ACKNOWLEDGEMENT_POLICY_UNAVAILABLE');
      }
      throw error;
    }
  }
}

/** Amounts are copied off the committed row. There is no arithmetic here. */
function view(
  orderCode: string,
  record: ShippingFeeAcknowledgementRecord,
  replayed: boolean,
): ShippingFeeAcknowledgementView {
  return {
    orderCode,
    previousFeeAmount: record.previousFeeAmount,
    newFeeAmount: record.newFeeAmount,
    currencyCode: record.currencyCode,
    acknowledgedAt: record.acknowledgedAt,
    replayed,
  };
}
