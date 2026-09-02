/**
 * Opening one bank-transfer attempt against the live `FULL` obligation
 * (`APP12-B04` §18, §19, §20, §21, §37, §38).
 *
 * The `APP7-B03` initiation, given a different obligation and a different
 * grant scope. Every mechanism is the delivered one and none is re-invented:
 *
 * ```text
 * one transaction               TransactionManager
 * grant re-established locked   ReauthorizeSecureGrant   (ADR-DB3-004 r9)
 * GRD-003 step-up               StepUpEvidenceResolver
 * idempotency                   IdempotencyStore, namespace payment.initiate
 * the write                     PaymentObligationRepository.openAttempt
 * ```
 *
 * ### Step-up is required, on the delivered rule (§24)
 *
 * `APP12-B04` §24 forbids importing APP5's custom-request challenge merely
 * because `REQUEST_ACCESS` needed one, and directs this surface to the existing
 * *payment* security rules. Those rules are GRD-003, and both delivered payment
 * initiations enforce them: a fresh `STEP_UP` on one of the customer's own
 * verified contacts, resolved server-side from the grant's customer, recorded
 * on the attempt. No `challengeId` is accepted from the body — the resolver
 * derives it — so a caller cannot present someone else's proof of presence, and
 * the recorded challenge is what the delivered evidence lane re-verifies later.
 *
 * The `ORDER_ACCESS` grant does not replace it. The grant proves possession of
 * a link that may have been sitting in an inbox for days; the step-up proves
 * the person is here now, which is the distinction GRD-003 exists to draw and
 * the reason a leaked order link cannot open a payment attempt.
 *
 * ### One idempotency system, not two
 *
 * `payment.initiate`'s scope key is `sha256(obligationId : attemptKey)`, so the
 * helper is imported from `domain/deposit/` unchanged rather than copied or
 * parameterised: it was named `PAYMENT_INITIATE_*` and keyed by obligation id
 * precisely because it was never deposit-specific.
 *
 * That key is also what makes §20 and §21 fall out rather than needing a rule.
 * A shipping-fee correction supersedes obligation A and creates obligation B
 * with a new id, so B is a **different idempotency scope**: the customer's next
 * initiate opens a fresh attempt against B at B's amount, and attempt A stays
 * where it was — history under a superseded obligation, never the current
 * payable attempt for its successor. Nothing migrates an attempt across
 * obligations, and nothing here could: `openAttempt` takes the obligation id
 * this transaction resolved.
 *
 * ### Payable, then locked, then written (§37)
 *
 * Two guards, in this order and both necessary. `isFullPaymentPayable` reads
 * the order's state and the obligation's LC-15 state and refuses outside the
 * window; then `openAttempt` re-proves the obligation's own half under its row
 * lock and is the real arbiter. The earlier check exists so a customer whose
 * reservation lapsed is told *this order is not awaiting payment* rather than
 * being handed a bare persistence guard code — and because the order's state is
 * not something the obligation's row lock can speak for.
 *
 * That pair is what §37 tests. A reservation that expires between the
 * customer's read and their initiate has the sweep cancel the `FULL` and the
 * order in one transaction; this one then either re-reads a `CANCELLED` order
 * and refuses at the first guard, or — if it got there first — finds the
 * obligation no longer `PENDING` under the lock and refuses at the second. An
 * earlier read, an earlier QR download and an earlier payable answer are never
 * trusted, because none of them is consulted.
 *
 * ### Not a payment
 *
 * No attempt is settled, no obligation is satisfied, no order moves and no
 * reconciliation is written. Verification and `AWAITING_PAYMENT ->
 * READY_FOR_DELIVERY` are `APP12-B05`'s, inside the Admin transaction, and
 * nothing on this surface can reach them.
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
import { orderSubjectOf } from '../../../customer/domain/grant/grant-subject';
import {
  PAYMENT_INITIATE_IDEMPOTENCY_TTL_MS,
  PAYMENT_INITIATE_NAMESPACE,
  initiateFingerprint,
  initiateScopeKey,
} from '../../domain/deposit/deposit-initiate-idempotency';
import { fullPaymentError } from '../../domain/full-payment/full-payment.errors';
import { isFullPaymentPayable } from '../../domain/full-payment/full-payment.policy';
import { fullTransferReference } from '../../domain/full-payment/full-payment-reference';
import { PaymentTargetResolver, type PaymentTarget } from './payment-target.resolver';
import type { FullPaymentAttemptView } from './customer-full-payment.view';

export interface InitiateFullPaymentAttemptCommand {
  readonly token: string;
  /** Already validated by `parseIdempotencyKey` at the transport boundary. */
  readonly attemptKey: string;
}

/** The one obligation kind this surface resolves. `DEPOSIT` is never a fallback. */
const FULL = 'FULL' as const;

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
export class InitiateFullPaymentAttemptUseCase {
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

  async initiate(command: InitiateFullPaymentAttemptCommand): Promise<FullPaymentAttemptView> {
    try {
      return await this.transactions.runInTransaction(async () => {
        const now = this.clock.now();
        // Scope-pinned: the `ORDER_ACCESS` lock, so a live `REQUEST_ACCESS`
        // token cannot open an attempt here even when Wave 2 is released.
        const grant = await this.grants.reauthorizeOrderAccess(command.token, now);
        const target = await this.targets.resolveForOrder(orderSubjectOf(grant), FULL);

        if (
          !isFullPaymentPayable({
            orderStatus: target.order.status,
            obligationStatus: target.obligation.status,
          })
        ) {
          throw fullPaymentError('FULL_PAYMENT_NOT_PAYABLE');
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
          throw fullPaymentError('DUPLICATE_OPERATION');
        }

        // GRD-003, and the last thing between this caller and a write. The
        // evidence is derived from the grant's customer — no challenge id is
        // accepted from the body — so a caller cannot present someone else's
        // proof of presence.
        const stepUp = await this.stepUp.resolve(grant.customerId, now);
        if (stepUp === undefined) {
          throw fullPaymentError('REVERIFICATION_REQUIRED');
        }

        const attempt = await this.obligations.openAttempt({
          id: newId() as AttemptId,
          paymentObligationId: target.obligation.id,
          // Copied off the row this transaction read, never from the caller and
          // never recomposed from a subtotal and a fee.
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
          transferReference: fullTransferReference(target.order.code),
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
      // The obligation id is what separates this scope from every other
      // obligation's on the same caller-chosen key — including a `FULL`
      // predecessor that a shipping-fee correction superseded, whose attempts
      // therefore cannot be replayed as the successor's.
      scopeKey: initiateScopeKey(target.obligation.id, attemptKey),
      fingerprint: initiateFingerprint({
        amount: target.obligation.amount,
        method: BANK_TRANSFER,
      }),
    };
  }

  private replayView(stored: unknown): FullPaymentAttemptView {
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
        // concurrent verification satisfied the obligation, or a concurrent
        // fee correction superseded it, between the two.
        return fullPaymentError('FULL_PAYMENT_NOT_PAYABLE');
      }
      if (error.code === IDEMPOTENCY_CONFLICT) {
        return fullPaymentError('IDEMPOTENCY_CONFLICT');
      }
      if (error.code === IDEMPOTENCY_RECORD_VANISHED) {
        return fullPaymentError('DUPLICATE_OPERATION');
      }
    }
    if (error instanceof SecureGrantError) {
      // The `secure_grant` policy is unpublished or unusable, so GRD-003's
      // window has no length. A 503, not a refusal of the customer's payment.
      return fullPaymentError('FULL_PAYMENT_INSTRUCTIONS_UNAVAILABLE');
    }
    return error;
  }
}
