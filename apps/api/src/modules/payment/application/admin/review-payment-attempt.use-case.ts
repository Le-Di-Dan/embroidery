/**
 * `TR-LC16-05` — an Admin deliberately routing one attempt into review
 * (`APP7-B04` §19).
 *
 * The verification path reaches `REQUIRES_REVIEW` only as the consequence of a
 * contradiction it detected. This operation exists for the case the operator
 * knows something the comparison cannot see: the memo is unreadable, two
 * transfers arrived, the customer says they paid and the statement disagrees,
 * the screenshot does not match the account. LC-16 `TR-LC16-05` is *"any →
 * REQUIRES_REVIEW, admin, contradiction detected"* — an operator-initiated move
 * the lifecycle already carries, so nothing is added to the machine.
 *
 * ### It cannot take money
 *
 * ```text
 * attempt   -> REQUIRES_REVIEW (with its mandatory reason)
 * deposit   -> unchanged
 * order     -> unchanged
 * outbox    -> nothing
 * provider  -> nothing
 * ```
 *
 * `satisfy()` is never called and `ORDER_REPOSITORY` is used for one `findById`
 * — a read — so the response can report the order's unchanged state truthfully.
 * There is no branch in this file that can settle an attempt `SUCCEEDED`, and
 * that is the point: an escalation must not be a second, quieter door to
 * `DEPOSIT_PAID`.
 *
 * ### The reason is required by the database, not by preference
 *
 * `ck_payment_attempts__review_reason_required` makes `review_reason` `NOT NULL`
 * on `REQUIRES_REVIEW` entry, and `payment_reconciliations.reason` is `NOT NULL`
 * unconditionally. One operator sentence satisfies both. Nothing is composed
 * here to fill either column.
 *
 * ### Observed facts are optional, and absent means absent
 *
 * `APP7-B04` §16 forbids fabricating an amount for a reason-only review, so an
 * omitted `observedAmount` writes `NULL` rather than `0` — the difference
 * between "the operator recorded no figure" and "the operator recorded nothing
 * arrived", which are not the same claim about money.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError } from '@embroidery/database';
import {
  PAYMENT_OBLIGATION_REPOSITORY,
  TransactionManager,
  type PaymentObligationRepository,
} from '@embroidery/persistence';

import { AuditClock } from '../../../../platform/audit-context/audit-clock';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import {
  ORDER_REPOSITORY,
  type OrderId,
  type OrderRepository,
} from '../../../order/domain/repositories/order.repository';
import { paymentVerificationError } from '../../domain/verification/payment-verification.errors';
import { classifyAttemptForVerification } from '../../domain/verification/payment-verification.policy';
import { reconciliationActionFor } from '../../domain/verification/reconciliation-evidence';
import type { PaymentDecisionView } from './admin-payment.view';
import { PaymentDecisionChainResolver } from './payment-decision-chain.resolver';
import { PaymentDecisionRecorder } from './payment-decision.recorder';
import { requirePaymentAdminActorId } from './payment-admin-actor';

/**
 * Everything the operator owns.
 *
 * No `status`, no `toStatus`, no `resolvedStatus`, no `adminId`, no timestamp:
 * the destination is fixed by the operation, and the identity and the instant
 * are server-derived.
 */
export interface ReviewPaymentAttemptCommand {
  readonly attemptId: string;
  readonly reviewReason: string;
  /** Recorded when stated. Never invented, never defaulted to zero. */
  readonly observedAmount?: string | undefined;
  readonly observedTransferReference?: string | undefined;
}

const ATTEMPT_ALREADY_SETTLED = 'ATTEMPT_ALREADY_SETTLED';

@Injectable()
export class ReviewPaymentAttemptUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly chain: PaymentDecisionChainResolver,
    @Inject(PAYMENT_OBLIGATION_REPOSITORY)
    private readonly obligations: PaymentObligationRepository,
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    private readonly recorder: PaymentDecisionRecorder,
    private readonly requestContext: RequestContextService,
    private readonly clock: AuditClock,
  ) {}

  async review(command: ReviewPaymentAttemptCommand): Promise<PaymentDecisionView> {
    const adminId = requirePaymentAdminActorId(this.requestContext);

    try {
      return await this.transactions.runInTransaction(async () => {
        const { locked, orderId } = await this.chain.resolve(command.attemptId);
        const { attempt, obligation } = locked;
        const now = this.clock.now();

        if (classifyAttemptForVerification(attempt.status) !== 'open') {
          // `SUCCEEDED`, `FAILED`, `EXPIRED` and both refunded states are
          // terminal in LC-16. An escalation must not reopen one — a settled
          // payment that needs revisiting is a refund or a new attempt, both
          // outside this checkpoint.
          throw paymentVerificationError('PAYMENT_ATTEMPT_ALREADY_SETTLED');
        }

        const statusBefore = attempt.status;
        const action = reconciliationActionFor(statusBefore);

        await this.obligations.settleAttempt(
          attempt.id,
          'REQUIRES_REVIEW',
          now,
          command.reviewReason,
        );
        await this.obligations.appendReconciliation({
          paymentAttemptId: attempt.id,
          paymentObligationId: obligation.id,
          action,
          reason: command.reviewReason,
          adminId,
          amount: command.observedAmount,
          resolvedStatus: 'REQUIRES_REVIEW',
          bankReference: command.observedTransferReference,
        });
        await this.recorder.recordReviewRequired(
          {
            attemptId: attempt.id,
            obligationId: obligation.id,
            orderId,
            observedAmount: command.observedAmount,
            observedTransferReference: command.observedTransferReference,
            fromStatus: statusBefore,
            toStatus: 'REQUIRES_REVIEW',
          },
          adminId,
          command.reviewReason,
        );

        // Read back rather than assumed. The response's whole job is to state
        // that the deposit and the order did not move, and reporting a remembered
        // value would be this file asserting that instead of observing it.
        const order = await this.orders.findById(orderId as OrderId);
        return {
          attemptId: attempt.id,
          attemptStatus: 'REQUIRES_REVIEW',
          depositObligationId: obligation.id,
          depositStatus: obligation.status,
          orderId,
          orderStatus: order?.status ?? 'AWAITING_DEPOSIT',
          reconciliationAction: action,
          replayed: false,
        };
      });
    } catch (error: unknown) {
      if (isPersistenceError(error) && error.code === ATTEMPT_ALREADY_SETTLED) {
        // A concurrent verification settled the attempt between this
        // transaction's read and its conditional update. The committed decision
        // wins; this one is told it lost.
        return Promise.reject(paymentVerificationError('PAYMENT_ATTEMPT_ALREADY_SETTLED'));
      }
      throw error;
    }
  }
}
