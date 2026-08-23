/**
 * `TR-LC16-01` — the customer opening one BANK_TRANSFER attempt against their
 * deposit (`APP7-B03` §4, §7, §9, §11, §26).
 *
 * ### One transaction, or nothing
 *
 * ```text
 * authorize the secure link      (before the transaction: policy, abuse budget, digest)
 * begin
 *   re-establish the grant under its row lock                      (ADR-DB3-004 r9)
 *   walk grant -> request -> order -> live DEPOSIT obligation
 *   refuse an obligation that is not PENDING                       (APP7-B03 §12)
 *   claim payment.initiate on (obligation, caller attempt key)
 *     replay? -> return the committed attempt, write nothing
 *   require a fresh STEP_UP for this customer                      (GRD-003)
 *   openAttempt: obligation re-read FOR UPDATE, PENDING re-checked, one
 *     BANK_TRANSFER PENDING row at the obligation's own amount and currency
 *   complete the idempotency claim with the replayable result
 * commit
 * ```
 *
 * There is no `try`/`catch` inside the transaction that could let a subset
 * commit, and no compensation path: a failure anywhere leaves no attempt, no
 * idempotency record and every payment state exactly as it was.
 *
 * ### Creating an attempt is not being paid
 *
 * The maximum state this use case can produce is one `payment_attempts` row at
 * `PENDING`. It cannot write `SUCCEEDED`, `FAILED`, `EXPIRED` or
 * `REQUIRES_REVIEW`; it cannot satisfy an obligation; it cannot move an order to
 * `DEPOSIT_PAID`; and it appends no reconciliation and no outbox event. That is
 * structural as well as intentional — this module injects no `ORDER_REPOSITORY`,
 * no outbox store and no audit repository, so none of those is reachable from
 * here. `APP7-B04` owns verification, and only accepted Admin verification moves
 * any of it.
 *
 * ### Everything about the attempt is server-owned
 *
 * {@link InitiateDepositAttemptCommand} carries a credential and an idempotency
 * key. There is no `customerId`, `requestId`, `orderId`, `paymentObligationId`,
 * `stepUpChallengeId`, `grantId`, `amount`, `currency`, `method`, `providerKey`,
 * `providerRef`, payment reference or bank field — so there is no field through
 * which a caller could name another customer's obligation, another customer's
 * step-up, a different sum or a provider. The amount and currency are copied off
 * the obligation row this transaction just read.
 *
 * ### The step-up is derived, never named
 *
 * `StepUpEvidenceResolver` derives the challenge from the grant's customer.
 * GRD-003 lists "pay" in its sensitive set, so initiation requires it; the
 * evidence is recorded on `payment_attempts.step_up_challenge_id` (REL-085) so
 * the attempt names the proof of presence it was authorized by. No challenge is
 * issued here — APP4 owns the verification flow and this module rebuilds none of
 * it.
 *
 * ### Retry is a new attempt, and a terminal attempt is never reset
 *
 * LC-16's rule is preserved by having no mutation path at all: there is no
 * "retry" route, and nothing here updates an existing attempt. A genuinely new
 * retry presents a **new** idempotency key, claims a new scope and inserts a new
 * row — permitted for as long as the obligation is still `PENDING`, refused the
 * moment it is not. No active-attempt uniqueness is invented, because accepted
 * payment authority has none.
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
import { depositTransferReference } from '../../domain/deposit/deposit-reference';
import { depositError } from '../../domain/deposit/deposit.errors';
import { DepositTargetResolver, type DepositTarget } from './deposit-target.resolver';
import type { DepositAttemptView } from './customer-deposit.view';

/** The whole input: one credential and the caller's own attempt key. */
export interface InitiateDepositAttemptCommand {
  readonly token: string;
  /** Already validated by `parseIdempotencyKey` at the transport boundary. */
  readonly attemptKey: string;
}

/** `APP7-G01` §1 — the only method this flow creates. There is no provider. */
const BANK_TRANSFER = 'BANK_TRANSFER';

/** The obligation state an attempt may be opened against. */
const PENDING = 'PENDING';

/** The persistence guard codes this use case translates. */
const OBLIGATION_NOT_PAYABLE = 'OBLIGATION_NOT_PAYABLE';
const IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT';
const IDEMPOTENCY_RECORD_VANISHED = 'IDEMPOTENCY_RECORD_VANISHED';

/** The replayable result. Refs and committed facts only; nothing secret-bearing. */
interface InitiationResult {
  readonly attemptId: string;
  readonly method: string;
  readonly status: string;
  readonly amount: string;
  readonly currencyCode: string;
  readonly transferReference: string;
}

@Injectable()
export class InitiateDepositAttemptUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly idempotency: IdempotencyStore,
    private readonly grants: ReauthorizeSecureGrant,
    private readonly targets: DepositTargetResolver,
    private readonly stepUp: StepUpEvidenceResolver,
    @Inject(PAYMENT_OBLIGATION_REPOSITORY)
    private readonly obligations: PaymentObligationRepository,
    private readonly clock: AuditClock,
  ) {}

  async initiate(command: InitiateDepositAttemptCommand): Promise<DepositAttemptView> {
    try {
      return await this.transactions.runInTransaction(async () => {
        const now = this.clock.now();
        const grant = await this.grants.reauthorize(command.token, now);
        const target = await this.targets.resolve(grant.customRequestId as CustomRequestId);

        if (target.obligation.status !== PENDING) {
          // Already satisfied, or cancelled. `openAttempt` re-proves this under
          // the obligation's row lock and is the real arbiter; this earlier
          // read exists so the customer is told *this deposit is settled*
          // rather than being handed a bare persistence guard code.
          throw depositError('DEPOSIT_NOT_PAYABLE');
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
          // Checked **before** GRD-003, on `quotation.accept`'s precedent and
          // for its reason: a replay performs no write, and gating it on a
          // still-open step-up window would tell a customer retrying after a
          // dropped response to re-verify in order to be shown an attempt they
          // already opened.
          return this.replayView(claim.result);
        }
        if (claim.outcome === 'in_progress') {
          throw depositError('DUPLICATE_OPERATION');
        }

        // GRD-003, and the first thing between this caller and a write. The
        // evidence is derived from the grant's customer — no challenge id is
        // accepted from the body — so a caller cannot present someone else's
        // proof of presence.
        const stepUp = await this.stepUp.resolve(grant.customerId, now);
        if (stepUp === undefined) {
          throw depositError('REVERIFICATION_REQUIRED');
        }

        const attempt = await this.obligations.openAttempt({
          id: newId() as AttemptId,
          paymentObligationId: target.obligation.id,
          // Copied off the row this transaction read, never from the caller and
          // never recomputed from a quotation share.
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
          transferReference: depositTransferReference(target.order.code),
        };
        await this.idempotency.complete(key, result);
        return { ...result, replayed: false };
      });
    } catch (error: unknown) {
      throw this.classify(error);
    }
  }

  /** `APP7-G01` §10's binding, built from the row this transaction read. */
  private keyFor(target: DepositTarget, attemptKey: string): IdempotencyKey {
    return {
      namespace: PAYMENT_INITIATE_NAMESPACE,
      scopeKey: initiateScopeKey(target.obligation.id, attemptKey),
      fingerprint: initiateFingerprint({
        amount: target.obligation.amount,
        method: BANK_TRANSFER,
      }),
    };
  }

  private replayView(stored: unknown): DepositAttemptView {
    if (stored === null || typeof stored !== 'object') {
      // Only reachable if a COMPLETED record carries no result, which this use
      // case never writes. Reported rather than coerced: fabricating an attempt
      // reference for one that cannot be described would be worse than a 500.
      throw new Error('A completed payment.initiate record carried no replayable result.');
    }
    return { ...(stored as InitiationResult), replayed: true };
  }

  /**
   * Translates the verdicts this use case owns, and only those.
   *
   * Everything else travels as itself to the platform filter, which sanitises
   * it. Shaping an unknown error into a bounded refusal here is how a defect
   * would reach a client as an ordinary "please fix your request", and how a
   * `PersistenceError` naming a constraint would reach a public surface.
   */
  private classify(error: unknown): unknown {
    if (isPersistenceError(error)) {
      if (error.code === OBLIGATION_NOT_PAYABLE) {
        // The row-locked half of the same refusal the pre-check publishes: a
        // concurrent verification satisfied the obligation between the two.
        return depositError('DEPOSIT_NOT_PAYABLE');
      }
      if (error.code === IDEMPOTENCY_CONFLICT) {
        return depositError('IDEMPOTENCY_CONFLICT');
      }
      if (error.code === IDEMPOTENCY_RECORD_VANISHED) {
        return depositError('DUPLICATE_OPERATION');
      }
    }
    if (error instanceof SecureGrantError) {
      // The `secure_grant` policy is unpublished or unusable, so GRD-003's
      // window has no length. A 503, not a refusal of the customer's payment.
      return depositError('DEPOSIT_INSTRUCTIONS_UNAVAILABLE');
    }
    return error;
  }
}
