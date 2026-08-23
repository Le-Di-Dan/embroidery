/**
 * `TR-LC16-03` — an Admin confirming that a deposit transfer actually arrived
 * (`APP7-B04` §2, §12, §13, §14, §18, §20, §22).
 *
 * This is the **first** APP7 path with authority to move money state. Nothing
 * before it can: a QR render, a customer's claim, an evidence upload and an
 * `ACCEPTED` inspection all leave every payment state exactly where it was
 * (`APP7-G01` §7.6).
 *
 * ### One transaction, or nothing
 *
 * ```text
 * derive the Admin actor from the session          (never from the body)
 * begin
 *   lock the attempt; read its obligation and order; derive expected facts
 *   already committed and identical? -> return the committed truth, write nothing
 *   attempt terminal?                -> refuse
 *   deposit no longer PENDING?       -> refuse (another attempt won)
 *   judge observed against expected, exactly
 *     mismatch -> attempt REQUIRES_REVIEW + reconciliation + audit
 *     match    -> attempt SUCCEEDED
 *              -> obligation SATISFIED by this exact attempt
 *              -> order AWAITING_DEPOSIT -> DEPOSIT_PAID
 *              -> reconciliation + audit + payment.verified
 * commit
 * ```
 *
 * There is no `try`/`catch` inside the transaction and no compensation path, so
 * every partial state `APP7-B04` §14 enumerates is unreachable rather than
 * cleaned up: no `SUCCEEDED` attempt against a `PENDING` obligation, no
 * `SATISFIED` deposit under an `AWAITING_DEPOSIT` order, no `DEPOSIT_PAID` order
 * with an unsatisfied deposit, no reconciliation surviving a rolled-back move,
 * and no `payment.verified` announcing a verification that did not commit.
 *
 * ### One canonical writer for each fact
 *
 * `settleAttempt`, `satisfy` and `appendReconciliation` are the shared AGG-16
 * writer's; `transition` is the shared AGG-15 writer's. There is no SQL in this
 * file, no second satisfy implementation and no second lifecycle graph —
 * `APP7-W01-C1` consolidated both into `@embroidery/persistence` precisely so a
 * second money writer could not drift from the first.
 *
 * `satisfy()` re-reads inside the transaction that the attempt belongs to this
 * obligation, has `SUCCEEDED`, and matches its amount and currency (G-DB7-06,
 * G-DB7-33). That is the real arbiter, and it is why this file never touches the
 * satisfaction columns itself.
 *
 * ### Idempotency is the state, not a claim
 *
 * `APP7-G01` §10 records the deliberate non-invention: manual verification takes
 * **no** idempotency namespace, because DB3's `payment.callback` claim is scoped
 * per provider event id and this flow has no provider — a claim would have to be
 * keyed on something fabricated. The arbiter that already exists is stronger:
 * `satisfy()` re-reads the obligation under its row lock, so a second
 * application finds it `SATISFIED` and is refused. Retry safety is
 * {@link isSameVerificationApplication} reading that same committed truth.
 *
 * ### No provider event, ever
 *
 * `recordProviderEvent` is not called and `payment_provider_events` stays empty.
 * No `providerKey: 'MANUAL'`, no event ref synthesised from the attempt id, no
 * fake callback. IMP-O007 stays open, and its uniqueness arbiter stays intact
 * for whenever a provider is locked.
 *
 * ### It stops at `DEPOSIT_PAID`
 *
 * No reservation, no soft hold, no ledger entry, no production job and no
 * remaining-payment collection. APP8 consumes `DEPOSIT_PAID` later through the
 * delivered `DepositEligibilityPort`; this module injects none of those and
 * could not write one.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError } from '@embroidery/database';
import {
  PAYMENT_OBLIGATION_REPOSITORY,
  TransactionManager,
  type AttemptId,
  type ObligationId,
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
import {
  classifyAttemptForVerification,
  isSameVerificationApplication,
  judgeObservedTransfer,
  type ObservedTransferFacts,
} from '../../domain/verification/payment-verification.policy';
import { reconciliationActionFor } from '../../domain/verification/reconciliation-evidence';
import type { PaymentDecisionView } from './admin-payment.view';
import { PaymentDecisionChainResolver } from './payment-decision-chain.resolver';
import { PaymentDecisionRecorder } from './payment-decision.recorder';
import { requirePaymentAdminActorId } from './payment-admin-actor';

/**
 * Everything the operator owns, and nothing else.
 *
 * There is no `orderId`, `obligationId`, `customerId`, `grantId`,
 * `stepUpChallengeId`, `adminId`, `status`, `toStatus`, `resolvedStatus`,
 * `succeededAt`, `verifiedAt`, `providerKey`, `providerRef`, `providerEventId`,
 * `evidenceId`, `evidencePresent`, `expectedAmount`, `expectedCurrency` or
 * `expectedReference` — not because this use case declines to read them, but
 * because the command type has nowhere to put one.
 *
 * There is no observed **currency** either. `ck_payment_obligations__currency_vnd`
 * closes the column to `VND`, so the field would be one whose only legal value
 * the server already knows; it is derived and checked server-side instead
 * (`APP7-B04` §11).
 */
export interface VerifyPaymentAttemptCommand {
  readonly attemptId: string;
  readonly observedAmount: string;
  readonly observedTransferReference: string;
  /**
   * The operator's account of what they checked.
   *
   * Required, and required by the database rather than by preference:
   * `payment_reconciliations.reason` is `NOT NULL` and the delivered
   * `appendReconciliation` refuses a blank one. Fabricating a default here would
   * put text nobody wrote into the money record.
   */
  readonly note: string;
}

/** The persistence guard codes this use case translates. */
const OBLIGATION_NOT_PENDING = 'OBLIGATION_NOT_PENDING';
const ATTEMPT_ALREADY_SETTLED = 'ATTEMPT_ALREADY_SETTLED';


@Injectable()
export class VerifyPaymentAttemptUseCase {
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

  async verify(command: VerifyPaymentAttemptCommand): Promise<PaymentDecisionView> {
    const adminId = requirePaymentAdminActorId(this.requestContext);
    const correlationId = this.requestContext.requireRequestId();
    const observed: ObservedTransferFacts = {
      amount: command.observedAmount,
      transferReference: command.observedTransferReference,
    };

    try {
      return await this.transactions.runInTransaction(async () => {
        const { locked, orderId, expected } = await this.chain.resolve(command.attemptId);
        const { attempt, obligation } = locked;
        const now = this.clock.now();

        const replay = isSameVerificationApplication({
          attemptStatus: attempt.status,
          obligationStatus: obligation.status,
          satisfiedByAttemptId: obligation.satisfiedByAttemptId,
          attemptId: attempt.id,
          observed,
          expected,
        });
        if (replay) {
          // `APP7-B04` §22. The first call committed and its response was lost;
          // this one writes nothing, appends no second reconciliation, emits no
          // second event, and answers with the committed truth rather than a
          // conflict that would read as "the payment failed".
          const order = await this.orders.findById(orderId as OrderId);
          return {
            attemptId: attempt.id,
            attemptStatus: attempt.status,
            depositObligationId: obligation.id,
            depositStatus: obligation.status,
            orderId,
            orderStatus: order?.status ?? 'DEPOSIT_PAID',
            reconciliationAction: reconciliationActionFor(attempt.status),
            replayed: true,
          };
        }

        const verifiability = classifyAttemptForVerification(attempt.status);
        if (verifiability !== 'open') {
          // Terminal, or succeeded against facts that are not this command's.
          // LC-16 never regresses and B04 creates no retry — a genuine retry is
          // a new attempt, which is `APP7-B03`'s.
          throw paymentVerificationError('PAYMENT_ATTEMPT_ALREADY_SETTLED');
        }
        if (obligation.status !== 'PENDING') {
          // Already satisfied by another attempt, or cancelled. The winner is
          // preserved: this transaction applies nothing. `satisfy()` re-proves
          // it under the row lock and is the real arbiter; this earlier read
          // exists so the operator reads a stated reason rather than a bare
          // guard code.
          throw paymentVerificationError('DEPOSIT_NOT_PAYABLE');
        }

        const verdict = judgeObservedTransfer(observed, expected);
        const statusBefore = attempt.status;
        const action = reconciliationActionFor(statusBefore);

        if (!verdict.matched) {
          return this.routeToReview({
            attemptId: attempt.id,
            obligationId: obligation.id,
            orderId,
            observed,
            note: command.note,
            action,
            statusBefore,
            adminId,
            now,
          });
        }

        await this.obligations.settleAttempt(attempt.id, 'SUCCEEDED', now);
        // G-DB7-06 / G-DB7-33 are re-proved inside this call, under the
        // obligation's own row lock. Nothing here writes a satisfaction column.
        const satisfied = await this.obligations.satisfy(obligation.id, attempt.id, now);
        // No `eventKind`, so the repository writes `STATE_CHANGE`.
        // `ck_order_transitions__event_kind_allowed` closes the column to six
        // values — `STATE_CHANGE`, `DELIVERY_EVENT`, `SAGA_STEP`,
        // `SHIPPING_FREEZE`, `POINTER_MOVE`, `POST_FREEZE_CORRECTION` — and a
        // deposit verification is an ordinary LC-14 move, not a delivery event
        // or a saga step. A `DEPOSIT_VERIFIED` kind would be an invented
        // vocabulary the CHECK rejects; *why* the order moved is carried by the
        // reconciliation row and the audit event, which are built for it.
        const order = await this.orders.transition({
          id: orderId as OrderId,
          to: 'DEPOSIT_PAID',
          actor: { kind: 'ADMIN', adminId },
          correlationId,
        });

        await this.obligations.appendReconciliation({
          paymentAttemptId: attempt.id,
          paymentObligationId: obligation.id,
          action,
          reason: command.note,
          adminId,
          // The amount the operator actually observed, which is what TBL-057's
          // nullable `amount` column records. Not the expected figure: the two
          // are equal on this branch, and storing the derived one would make the
          // row unable to evidence what was seen.
          amount: command.observedAmount,
          resolvedStatus: 'SUCCEEDED',
          bankReference: command.observedTransferReference,
        });

        await this.recorder.recordVerified(
          {
            attemptId: attempt.id,
            obligationId: obligation.id,
            orderId,
            observedAmount: command.observedAmount,
            observedTransferReference: command.observedTransferReference,
            fromStatus: statusBefore,
            toStatus: 'SUCCEEDED',
          },
          adminId,
        );

        return {
          attemptId: attempt.id,
          attemptStatus: 'SUCCEEDED',
          depositObligationId: obligation.id,
          depositStatus: satisfied.status,
          orderId,
          orderStatus: order.status,
          reconciliationAction: action,
          replayed: false,
        };
      });
    } catch (error: unknown) {
      throw this.classify(error);
    }
  }

  /**
   * The durable contradiction path (`APP7-B04` §18, LC-16 `TR-LC16-05`).
   *
   * An under-payment, an over-payment or a wrong reference must never silently
   * become `SUCCEEDED`, and must not be downgraded to a bare refusal either: the
   * accepted lifecycle owns a durable review, so the attempt moves to
   * `REQUIRES_REVIEW` with its mandatory reason and the reconciliation records
   * what was observed. The deposit is **not** satisfied, the order does **not**
   * move, and no `payment.verified` is emitted.
   *
   * `review_reason` is the operator's own note verbatim. No sentence is composed
   * from the mismatch — `APP7-B04` §18 forbids fabricating a review vocabulary,
   * and the reconciliation row already carries the observed amount, the observed
   * reference and `resolved_status` as evidence of exactly what contradicted.
   */
  private async routeToReview(input: {
    readonly attemptId: AttemptId;
    readonly obligationId: ObligationId;
    readonly orderId: string;
    readonly observed: ObservedTransferFacts;
    readonly note: string;
    readonly action: ReturnType<typeof reconciliationActionFor>;
    readonly statusBefore: string;
    readonly adminId: string;
    readonly now: Date;
  }): Promise<PaymentDecisionView> {
    await this.obligations.settleAttempt(
      input.attemptId,
      'REQUIRES_REVIEW',
      input.now,
      input.note,
    );
    await this.obligations.appendReconciliation({
      paymentAttemptId: input.attemptId,
      paymentObligationId: input.obligationId,
      action: input.action,
      reason: input.note,
      adminId: input.adminId,
      amount: input.observed.amount,
      resolvedStatus: 'REQUIRES_REVIEW',
      bankReference: input.observed.transferReference,
    });
    await this.recorder.recordReviewRequired(
      {
        attemptId: input.attemptId,
        obligationId: input.obligationId,
        orderId: input.orderId,
        observedAmount: input.observed.amount,
        observedTransferReference: input.observed.transferReference,
        fromStatus: input.statusBefore,
        toStatus: 'REQUIRES_REVIEW',
      },
      input.adminId,
      input.note,
    );

    const order = await this.orders.findById(input.orderId as OrderId);
    return {
      attemptId: input.attemptId,
      attemptStatus: 'REQUIRES_REVIEW',
      depositObligationId: input.obligationId,
      // Unchanged, and read back rather than assumed: the response must report
      // the deposit as still awaiting payment, which is the whole point.
      depositStatus: 'PENDING',
      orderId: input.orderId,
      orderStatus: order?.status ?? 'AWAITING_DEPOSIT',
      reconciliationAction: input.action,
      replayed: false,
    };
  }

  /**
   * Translates the persistence verdicts this use case owns, and only those.
   *
   * Both are reachable through a real race rather than through bad input:
   * `OBLIGATION_NOT_PENDING` is CC-10's loser meeting the obligation row lock,
   * and `ATTEMPT_ALREADY_SETTLED` is a concurrent verification of the same
   * attempt winning the conditional update. Mapped so the operator reads a
   * refusal instead of a sanitised 500. Everything else travels as itself to the
   * platform filter — shaping an unknown error into a bounded refusal here is
   * how a defect would be reported as an ordinary "please fix your request".
   */
  private classify(error: unknown): unknown {
    if (isPersistenceError(error) && error.code === OBLIGATION_NOT_PENDING) {
      return paymentVerificationError('DEPOSIT_NOT_PAYABLE');
    }
    if (isPersistenceError(error) && error.code === ATTEMPT_ALREADY_SETTLED) {
      return paymentVerificationError('PAYMENT_ATTEMPT_ALREADY_SETTLED');
    }
    return error;
  }
}
