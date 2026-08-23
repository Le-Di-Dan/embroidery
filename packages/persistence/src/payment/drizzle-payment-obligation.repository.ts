/**
 * Drizzle implementation of the AGG-16 Payment Obligation contract
 * (TBL-054, TBL-055).
 *
 * Provider events, reconciliations and refunds live in
 * `PaymentEvidenceRepository`, and the attempt row's own settlement, locked
 * verification read and lookups live in `PaymentAttemptRepository`. Both are
 * delegated to from here so the aggregate keeps one contract (DB7 §10.1) — no
 * table gains a repository of its own, and no caller has to know which class
 * holds which method.
 *
 * What stays here is what is decided under the **obligation's** row lock:
 * `createForOrder`, `openAttempt` (an attempt may only open against a `PENDING`
 * obligation), `satisfy` (G-DB7-06 / G-DB7-33) and `cancel`.
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, notFoundError, schema } from '@embroidery/database';
import type { PaymentAttemptState, PaymentObligationKind } from '@embroidery/database';
import { DatabaseExecutor } from '../runtime/database-executor';
import { DrizzleRepository } from '../repository/drizzle-repository';
import { and, eq, inArray } from 'drizzle-orm';

import type {
  AttemptId,
  CreateObligationInput,
  ObligationId,
  OpenAttemptInput,
  PaymentAttempt,
  PaymentObligation,
  PaymentObligationRepository,
  ProviderEventOutcome,
  RecordProviderEventInput,
  Refund,
  RefundId,
  VerifiableAttempt,
} from './payment-obligation.repository';
import { PaymentAttemptRepository } from './payment-attempt.repository';
import { PaymentEvidenceRepository } from './payment-evidence.repository';
import { toAttempt, toObligation } from './payment-row.mapper';

const { paymentObligations, paymentAttempts } = schema;

const CURRENCY = 'VND';

@Injectable()
export class DrizzlePaymentObligationRepository
  extends DrizzleRepository
  implements PaymentObligationRepository
{
  constructor(
    executor: DatabaseExecutor,
    private readonly evidence: PaymentEvidenceRepository,
    private readonly attempts: PaymentAttemptRepository,
  ) {
    super(executor);
  }

  // The attempt row's own lifecycle — settlement, the locked verification read
  // and the two lookups — is a separate responsibility, implemented in
  // `PaymentAttemptRepository` and delegated to here so the aggregate still
  // presents one `PaymentObligationRepository` contract.

  settleAttempt(
    id: AttemptId,
    status: PaymentAttemptState,
    at: Date,
    reviewReason?: string,
  ): Promise<PaymentAttempt> {
    return this.attempts.settle(id, status, at, reviewReason);
  }

  lockAttemptForVerification(id: AttemptId): Promise<VerifiableAttempt | undefined> {
    return this.attempts.lockForVerification(id);
  }

  loadAttempt(id: AttemptId): Promise<PaymentAttempt | undefined> {
    return this.attempts.load(id);
  }

  listAttempts(id: ObligationId): Promise<PaymentAttempt[]> {
    return this.attempts.listForObligation(id);
  }

  async createForOrder(input: CreateObligationInput): Promise<PaymentObligation> {
    return this.run('createForOrder', async () => {
      const [row] = await this.db
        .insert(paymentObligations)
        .values({
          id: input.id,
          orderId: input.orderId,
          kind: input.kind,
          amount: input.amount,
          currencyCode: CURRENCY,
          status: 'PENDING',
          sourceQuotationVersionId: input.sourceQuotationVersionId,
        })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'PaymentObligationRepository.createForOrder',
          'OBLIGATION_NOT_CREATED',
          'Could not create the payment obligation.',
        );
      }
      return toObligation(row);
    });
  }

  async openAttempt(input: OpenAttemptInput): Promise<PaymentAttempt> {
    return this.run('openAttempt', async () => {
      const tx = this.requireTransaction('openAttempt');

      const [obligation] = await tx
        .select()
        .from(paymentObligations)
        .where(eq(paymentObligations.id, input.paymentObligationId))
        .limit(1)
        .for('update');

      if (obligation === undefined) {
        throw notFoundError(
          'PaymentObligationRepository.openAttempt',
          'That payment obligation does not exist.',
        );
      }
      if (obligation.status !== 'PENDING') {
        // An attempt against a settled obligation would take money for
        // something already paid.
        throw guardViolationError(
          'PaymentObligationRepository.openAttempt',
          'OBLIGATION_NOT_PAYABLE',
          'That payment obligation is no longer payable.',
        );
      }

      const [row] = await tx
        .insert(paymentAttempts)
        .values({
          id: input.id,
          paymentObligationId: input.paymentObligationId,
          amount: input.amount,
          currencyCode: CURRENCY,
          method: input.method,
          providerKey: input.providerKey ?? null,
          status: 'PENDING',
          grantId: input.grantId ?? null,
          stepUpChallengeId: input.stepUpChallengeId ?? null,
          expiresAt: input.expiresAt ?? null,
        })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'PaymentObligationRepository.openAttempt',
          'ATTEMPT_NOT_CREATED',
          'Could not open the payment attempt.',
        );
      }
      return toAttempt(row);
    });
  }

  async satisfy(id: ObligationId, attemptId: AttemptId, at: Date): Promise<PaymentObligation> {
    return this.run('satisfy', async () => {
      const tx = this.requireTransaction('satisfy');

      const [obligation] = await tx
        .select()
        .from(paymentObligations)
        .where(eq(paymentObligations.id, id))
        .limit(1)
        .for('update');

      if (obligation === undefined) {
        throw notFoundError(
          'PaymentObligationRepository.satisfy',
          'That obligation does not exist.',
        );
      }
      if (obligation.status !== 'PENDING') {
        throw guardViolationError(
          'PaymentObligationRepository.satisfy',
          'OBLIGATION_NOT_PENDING',
          'That obligation is not awaiting payment.',
        );
      }

      const [attempt] = await tx
        .select()
        .from(paymentAttempts)
        .where(eq(paymentAttempts.id, attemptId))
        .limit(1);

      if (attempt === undefined) {
        throw notFoundError('PaymentObligationRepository.satisfy', 'That attempt does not exist.');
      }

      // G-DB7-06. The FK proves the attempt exists; only this read proves it
      // belongs to *this* obligation. Without it, one order's payment could
      // settle another's debt.
      if (attempt.paymentObligationId !== id) {
        throw guardViolationError(
          'PaymentObligationRepository.satisfy',
          'ATTEMPT_BELONGS_TO_ANOTHER_OBLIGATION',
          'That payment attempt does not belong to this obligation.',
        );
      }
      // G-DB7-33: an obligation is satisfied only by money that actually
      // arrived, in the right amount and currency.
      if (attempt.status !== 'SUCCEEDED') {
        throw guardViolationError(
          'PaymentObligationRepository.satisfy',
          'ATTEMPT_NOT_SUCCEEDED',
          'That payment attempt did not succeed.',
        );
      }
      if (
        attempt.amount !== obligation.amount ||
        attempt.currencyCode !== obligation.currencyCode
      ) {
        throw guardViolationError(
          'PaymentObligationRepository.satisfy',
          'PAYMENT_AMOUNT_MISMATCH',
          'The payment does not match the amount owed.',
        );
      }

      const [row] = await tx
        .update(paymentObligations)
        .set({
          status: 'SATISFIED',
          satisfiedByAttemptId: attemptId,
          satisfiedAt: at,
          updatedAt: at,
        })
        .where(eq(paymentObligations.id, id))
        .returning();

      if (row === undefined) {
        throw notFoundError(
          'PaymentObligationRepository.satisfy',
          'That obligation does not exist.',
        );
      }
      return toObligation(row);
    });
  }

  async cancel(id: ObligationId): Promise<void> {
    return this.run('cancel', async () => {
      const rows = await this.db
        .update(paymentObligations)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(and(eq(paymentObligations.id, id), eq(paymentObligations.status, 'PENDING')))
        .returning({ id: paymentObligations.id });

      if (rows.length === 0) {
        throw guardViolationError(
          'PaymentObligationRepository.cancel',
          'OBLIGATION_NOT_PENDING',
          'Only a pending obligation can be cancelled.',
        );
      }
    });
  }

  // Money evidence — provider callbacks, reconciliations and refunds — is a
  // separate responsibility, delegated so the aggregate keeps one contract.

  recordProviderEvent(input: RecordProviderEventInput): Promise<ProviderEventOutcome> {
    return this.evidence.recordProviderEvent(input);
  }

  appendReconciliation(
    input: Parameters<PaymentEvidenceRepository['appendReconciliation']>[0],
  ): Promise<void> {
    return this.evidence.appendReconciliation(input);
  }

  openRefund(input: Parameters<PaymentEvidenceRepository['openRefund']>[0]): Promise<Refund> {
    return this.evidence.openRefund(input);
  }

  approveRefund(id: RefundId, adminId: string, at: Date): Promise<Refund> {
    return this.evidence.approveRefund(id, adminId, at);
  }

  executeRefund(
    id: RefundId,
    adminId: string,
    method: string,
    transferReference: string,
    at: Date,
  ): Promise<Refund> {
    return this.evidence.executeRefund(id, adminId, method, transferReference, at);
  }

  findRefund(id: RefundId): Promise<Refund | undefined> {
    return this.evidence.findRefund(id);
  }

  refundableAmount(attemptId: AttemptId): Promise<string> {
    return this.evidence.refundableAmount(attemptId);
  }

  async findById(id: ObligationId): Promise<PaymentObligation | undefined> {
    return this.run('findById', async () => {
      const [row] = await this.db
        .select()
        .from(paymentObligations)
        .where(eq(paymentObligations.id, id))
        .limit(1);
      return row === undefined ? undefined : toObligation(row);
    });
  }

  async findLiveForOrder(
    orderId: string,
    kind: PaymentObligationKind,
  ): Promise<PaymentObligation | undefined> {
    return this.run('findLiveForOrder', async () => {
      const [row] = await this.db
        .select()
        .from(paymentObligations)
        .where(
          and(
            eq(paymentObligations.orderId, orderId),
            eq(paymentObligations.kind, kind),
            // Matches `uq_payment_obligations__order_kind__live`, so at most
            // one row can qualify.
            inArray(paymentObligations.status, ['PENDING', 'SATISFIED']),
          ),
        )
        .limit(1);
      return row === undefined ? undefined : toObligation(row);
    });
  }
}
