/**
 * Opening one bank-transfer attempt against the live `REMAINING` obligation
 * (`APP9-B02` §2 C, §11).
 *
 * The `APP7-B03` initiation, given a different obligation. Every mechanism is
 * the delivered one and none is re-invented:
 *
 * ```text
 * one transaction               TransactionManager
 * grant re-established locked   ReauthorizeSecureGrant   (ADR-DB3-004 r9)
 * GRD-003 step-up               StepUpEvidenceResolver
 * idempotency                   IdempotencyStore, namespace payment.initiate
 * the write                     PaymentObligationRepository.openAttempt
 * ```
 *
 * ### One idempotency system, not two
 *
 * `payment.initiate`'s scope key is `sha256(obligationId : attemptKey)`, so the
 * two obligations of one order are already distinct scopes and the deposit's
 * keys can never collide with these. That is why the shared helper is imported
 * from `domain/deposit/` unchanged rather than copied or parameterised: it was
 * named `PAYMENT_INITIATE_*` and keyed by obligation id precisely because it was
 * never deposit-specific.
 *
 * ### Payable, then locked, then written
 *
 * Two guards, in this order and both necessary. `isFinalPaymentPayable` reads
 * the order's LC-14 state and the obligation's LC-15 state and refuses outside
 * the window; then `openAttempt` re-proves the obligation's own half under its
 * row lock and is the real arbiter. The earlier check exists so a customer whose
 * order is merely `ON_HOLD` is told *this is not awaiting payment* rather than
 * being handed a bare persistence guard code — and because the order's state is
 * not something the obligation's row lock can speak for.
 *
 * ### Not a payment
 *
 * No attempt is settled, no obligation is satisfied, no order moves and no
 * reconciliation is written. `TR-LC14-06` is `APP9-B03`'s, inside the Admin
 * verification transaction, and nothing on this surface can reach it.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError, newId } from '@embroidery/database';
import {
  IdempotencyStore,
  PAYMENT_OBLIGATION_REPOSITORY,
  TransactionManager,
  type AttemptId,
  type IdempotencyKey,
  type PaymentObligationRepository,
} from '@embroidery/persistence';

import { AuditClock } from '../../../../platform/audit-context/audit-clock';
import { ReauthorizeSecureGrant } from '../../../customer/application/reauthorize-secure-grant.service';
import { StepUpEvidenceResolver } from '../../../customer/application/step-up-evidence.resolver';
import { SecureGrantError } from '../../../customer/domain/grant/secure-grant-outcome';
import type { CustomRequestId } from '../../../order/domain/repositories/custom-request.repository';
import {
  PAYMENT_INITIATE_IDEMPOTENCY_TTL_MS,
  PAYMENT_INITIATE_NAMESPACE,
  initiateFingerprint,
  initiateScopeKey,
} from '../../domain/deposit/deposit-initiate-idempotency';
import { finalPaymentError } from '../../domain/final-payment/final-payment.errors';
import { isFinalPaymentPayable } from '../../domain/final-payment/final-payment.policy';
import { remainingTransferReference } from '../../domain/final-payment/final-payment-reference';
import { PaymentTargetResolver, type PaymentTarget } from './payment-target.resolver';
import type { FinalPaymentAttemptView } from './customer-final-payment.view';

export interface InitiateFinalPaymentAttemptCommand {
  readonly token: string;
  /** Already validated by `parseIdempotencyKey` at the transport boundary. */
  readonly attemptKey: string;
}

/** The one obligation kind this surface resolves. `DEPOSIT` is never a fallback. */
const REMAINING = 'REMAINING' as const;

/** `APP7-G01` §1 — the only method this flow creates. There is no provider. */
const BANK_TRANSFER = 'BANK_TRANSFER';

/** The persistence guard codes this use case translates. */
const OBLIGATION_NOT_PAYABLE = 'OBLIGATION_NOT_PAYABLE';
const IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT';
const IDEMPOTENCY_RECORD_VANISHED = 'IDEMPOTENCY_RECORD_VANISHED';

/** Exactly what a replay must reproduce, and nothing derived after the fact. */
interface InitiationResult {
  readonly attemptId: string;
  readonly method: string;
  readonly status: string;
  readonly amount: string;
  readonly currencyCode: string;
  readonly transferReference: string;
}

@Injectable()
export class InitiateFinalPaymentAttemptUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly idempotency: IdempotencyStore,
    private readonly grants: ReauthorizeSecureGrant,
    private readonly targets: PaymentTargetResolver,
    private readonly stepUp: StepUpEvidenceResolver,
    @Inject(PAYMENT_OBLIGATION_REPOSITORY)
    private readonly obligations: PaymentObligationRepository,
    private readonly clock: AuditClock,
  ) {}

  async initiate(command: InitiateFinalPaymentAttemptCommand): Promise<FinalPaymentAttemptView> {
    try {
      return await this.transactions.runInTransaction(async () => {
        const now = this.clock.now();
        const grant = await this.grants.reauthorize(command.token, now);
        const target = await this.targets.resolve(
          grant.customRequestId as CustomRequestId,
          REMAINING,
        );

        if (
          !isFinalPaymentPayable({
            orderStatus: target.order.status,
            obligationStatus: target.obligation.status,
          })
        ) {
          throw finalPaymentError('FINAL_PAYMENT_NOT_PAYABLE');
        }

        const key = this.keyFor(target, command.attemptKey);
        const claim = await this.idempotency.claim(
          key,
          new Date(now.getTime() + PAYMENT_INITIATE_IDEMPOTENCY_TTL_MS),
        );
        if (claim.outcome === 'replay') {
          // Written in the same transaction as the attempt row, so it cannot
          // exist unless that row does. Nothing below runs: no second attempt.
          //
          // Checked **before** GRD-003, on the delivered deposit precedent and
          // for its reason: a replay performs no write, and gating it on a
          // still-open step-up window would tell a customer retrying after a
          // dropped response to re-verify in order to be shown an attempt they
          // already opened.
          return this.replayView(claim.result);
        }
        if (claim.outcome === 'in_progress') {
          throw finalPaymentError('DUPLICATE_OPERATION');
        }

        // GRD-003, and the last thing between this caller and a write. The
        // evidence is derived from the grant's customer — no challenge id is
        // accepted from the body — so a caller cannot present someone else's
        // proof of presence.
        const stepUp = await this.stepUp.resolve(grant.customerId, now);
        if (stepUp === undefined) {
          throw finalPaymentError('REVERIFICATION_REQUIRED');
        }

        const attempt = await this.obligations.openAttempt({
          id: newId() as AttemptId,
          paymentObligationId: target.obligation.id,
          // Copied off the row this transaction read, never from the caller and
          // never recomputed as a total minus the deposit.
          amount: target.obligation.amount,
          method: BANK_TRANSFER,
          // No provider exists in this flow (IMP-O007 stays open), so neither
          // field is fabricated. `openAttempt` stores NULL for both.
          grantId: grant.id,
          stepUpChallengeId: stepUp.challengeId,
        });

        const result: InitiationResult = {
          attemptId: attempt.id,
          method: attempt.method,
          status: attempt.status,
          amount: attempt.amount,
          currencyCode: attempt.currencyCode,
          transferReference: remainingTransferReference(target.order.code),
        };
        await this.idempotency.complete(key, result);
        return { ...result, replayed: false };
      });
    } catch (error: unknown) {
      throw this.classify(error);
    }
  }

  private keyFor(target: PaymentTarget, attemptKey: string): IdempotencyKey {
    return {
      namespace: PAYMENT_INITIATE_NAMESPACE,
      // The obligation id is what separates this scope from the deposit's on the
      // same order and the same caller-chosen key.
      scopeKey: initiateScopeKey(target.obligation.id, attemptKey),
      fingerprint: initiateFingerprint({
        amount: target.obligation.amount,
        method: BANK_TRANSFER,
      }),
    };
  }

  private replayView(stored: unknown): FinalPaymentAttemptView {
    if (stored === null || typeof stored !== 'object') {
      // Only reachable if a COMPLETED record carries no result, which this use
      // case never writes. Reported rather than coerced: fabricating an attempt
      // reference for one that cannot be described would be worse than a 500.
      throw new Error('A completed payment.initiate record carried no replayable result.');
    }
    return { ...(stored as InitiationResult), replayed: true };
  }

  private classify(error: unknown): unknown {
    if (isPersistenceError(error)) {
      if (error.code === OBLIGATION_NOT_PAYABLE) {
        // The row-locked half of the same refusal the pre-check publishes: a
        // concurrent verification satisfied the obligation between the two.
        return finalPaymentError('FINAL_PAYMENT_NOT_PAYABLE');
      }
      if (error.code === IDEMPOTENCY_CONFLICT) {
        return finalPaymentError('IDEMPOTENCY_CONFLICT');
      }
      if (error.code === IDEMPOTENCY_RECORD_VANISHED) {
        return finalPaymentError('DUPLICATE_OPERATION');
      }
    }
    if (error instanceof SecureGrantError) {
      // The `secure_grant` policy is unpublished or unusable, so GRD-003's
      // window has no length. A 503, not a refusal of the customer's payment.
      return finalPaymentError('FINAL_PAYMENT_INSTRUCTIONS_UNAVAILABLE');
    }
    return error;
  }
}
