/**
 * Money evidence: provider callbacks, reconciliations and refunds
 * (TBL-056..TBL-058).
 *
 * Split from the obligation repository by responsibility — this is the record
 * of what money did, while the obligation owns what money *owes*. All of it is
 * append-only or column-scoped-immutable, enforced by S24 triggers, so there is
 * no update path for an amount.
 *
 * Carries **G-DB7-32** (idempotent ingestion), **G-DB7-34** (immutability
 * mapping) and **G-DB7-35/36** (refund ceiling and execution evidence).
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, notFoundError, schema } from '@embroidery/database';
import type { PaymentProviderEventOutcome, RefundState } from '@embroidery/database';
import { DatabaseExecutor } from '../runtime/database-executor';
import { DrizzleRepository } from '../repository/drizzle-repository';
import { and, eq, inArray } from 'drizzle-orm';

import type {
  AttemptId,
  ObligationId,
  ProviderEventOutcome,
  RecordProviderEventInput,
  Refund,
  RefundId,
} from './payment-obligation.repository';
import { toRefund } from './payment-row.mapper';

const { paymentProviderEvents, paymentReconciliations, refunds, paymentAttempts } = schema;

const CURRENCY = 'VND';

/** Refund states that still consume the attempt's refundable balance. */
const LIVE_REFUND_STATES: RefundState[] = ['PENDING_REVIEW', 'APPROVED', 'EXECUTED'];

@Injectable()
export class PaymentEvidenceRepository extends DrizzleRepository {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async recordProviderEvent(input: RecordProviderEventInput): Promise<ProviderEventOutcome> {
    return this.run('recordProviderEvent', async () => {
      const tx = this.requireTransaction('recordProviderEvent');

      // G-DB7-32 / INV-07. `onConflictDoNothing` rather than catching 23505:
      // a caught unique violation aborts the enclosing transaction, taking the
      // domain work with it. Providers retry, so a duplicate is a replay —
      // treating it as an error would turn a correct redelivery into an
      // incident.
      const [row] = await tx
        .insert(paymentProviderEvents)
        .values({
          providerKey: input.providerKey,
          providerEventRef: input.providerEventRef,
          paymentAttemptId: input.paymentAttemptId ?? null,
          eventKind: input.eventKind,
          amount: input.amount ?? null,
          currencyCode: input.amount === undefined ? null : CURRENCY,
          redactedPayload: input.redactedPayload,
          signatureValid: input.signatureValid,
          applicationOutcome: input.applicationOutcome,
          receivedAt: input.receivedAt,
        })
        .onConflictDoNothing({
          target: [paymentProviderEvents.providerKey, paymentProviderEvents.providerEventRef],
        })
        .returning({ id: paymentProviderEvents.id });

      return row === undefined
        ? { outcome: 'replay' as const }
        : { outcome: 'recorded' as const, id: row.id };
    });
  }

  async appendReconciliation(input: {
    paymentAttemptId?: AttemptId | undefined;
    paymentObligationId?: ObligationId | undefined;
    action: string;
    reason: string;
    adminId: string;
    amount?: string | undefined;
  }): Promise<void> {
    return this.run('appendReconciliation', async () => {
      if (input.reason.trim() === '') {
        // A reconciliation with no stated reason is an unexplained change to
        // the money record.
        throw guardViolationError(
          'PaymentObligationRepository.appendReconciliation',
          'RECONCILIATION_REASON_REQUIRED',
          'A reason is required to record a reconciliation.',
        );
      }

      await this.db.insert(paymentReconciliations).values({
        paymentAttemptId: input.paymentAttemptId ?? null,
        paymentObligationId: input.paymentObligationId ?? null,
        action: input.action,
        reason: input.reason,
        adminId: input.adminId,
        amount: input.amount ?? null,
      });
    });
  }

  async openRefund(input: {
    id: RefundId;
    paymentAttemptId: AttemptId;
    orderId: string;
    amount: string;
    reason: string;
  }): Promise<Refund> {
    return this.run('openRefund', async () => {
      const tx = this.requireTransaction('openRefund');

      if (input.reason.trim() === '') {
        throw guardViolationError(
          'PaymentObligationRepository.openRefund',
          'REFUND_REASON_REQUIRED',
          'A reason is required to open a refund.',
        );
      }

      const [attempt] = await tx
        .select()
        .from(paymentAttempts)
        .where(eq(paymentAttempts.id, input.paymentAttemptId))
        .limit(1)
        .for('update');

      if (attempt === undefined) {
        throw notFoundError(
          'PaymentObligationRepository.openRefund',
          'That payment attempt does not exist.',
        );
      }
      if (attempt.status !== 'SUCCEEDED' && attempt.status !== 'PARTIALLY_REFUNDED') {
        // Refunding money that never arrived would create a payout with no
        // matching receipt.
        throw guardViolationError(
          'PaymentObligationRepository.openRefund',
          'ATTEMPT_NOT_REFUNDABLE',
          'That payment attempt cannot be refunded.',
        );
      }

      // G-DB7-35: the ceiling is settled minus already-refunded, computed under
      // the attempt's lock so two refunds cannot each see the full balance.
      const remaining = await this.computeRefundable(attempt.amount, input.paymentAttemptId);
      if (Number(input.amount) <= 0) {
        throw guardViolationError(
          'PaymentObligationRepository.openRefund',
          'REFUND_AMOUNT_INVALID',
          'The refund amount must be positive.',
        );
      }
      if (Number(input.amount) > Number(remaining)) {
        throw guardViolationError(
          'PaymentObligationRepository.openRefund',
          'REFUND_EXCEEDS_REFUNDABLE',
          'That refund is larger than the amount still refundable.',
        );
      }

      const [row] = await tx
        .insert(refunds)
        .values({
          id: input.id,
          paymentAttemptId: input.paymentAttemptId,
          orderId: input.orderId,
          amount: input.amount,
          currencyCode: CURRENCY,
          status: 'PENDING_REVIEW',
          reason: input.reason,
        })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'PaymentObligationRepository.openRefund',
          'REFUND_NOT_CREATED',
          'Could not open the refund.',
        );
      }
      return toRefund(row);
    });
  }

  async approveRefund(id: RefundId, adminId: string, at: Date): Promise<Refund> {
    return this.run('approveRefund', async () => {
      const [row] = await this.db
        .update(refunds)
        .set({ status: 'APPROVED', approvedByAdminId: adminId, approvedAt: at, updatedAt: at })
        .where(and(eq(refunds.id, id), eq(refunds.status, 'PENDING_REVIEW')))
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'PaymentObligationRepository.approveRefund',
          'REFUND_NOT_PENDING_REVIEW',
          'That refund is not awaiting review.',
        );
      }
      return toRefund(row);
    });
  }

  async executeRefund(
    id: RefundId,
    adminId: string,
    method: string,
    transferReference: string,
    at: Date,
  ): Promise<Refund> {
    return this.run('executeRefund', async () => {
      // G-DB7-36: only an APPROVED refund may execute. Execution moves real
      // money, so it must be preceded by a recorded decision.
      const [row] = await this.db
        .update(refunds)
        .set({
          status: 'EXECUTED',
          executedByAdminId: adminId,
          executedAt: at,
          method,
          transferReference,
          updatedAt: at,
        })
        .where(and(eq(refunds.id, id), eq(refunds.status, 'APPROVED')))
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'PaymentObligationRepository.executeRefund',
          'REFUND_NOT_APPROVED',
          'That refund has not been approved.',
        );
      }
      return toRefund(row);
    });
  }

  async findRefund(id: RefundId): Promise<Refund | undefined> {
    return this.run('findRefund', async () => {
      const [row] = await this.db.select().from(refunds).where(eq(refunds.id, id)).limit(1);
      return row === undefined ? undefined : toRefund(row);
    });
  }

  async refundableAmount(attemptId: AttemptId): Promise<string> {
    return this.run('refundableAmount', async () => {
      const [attempt] = await this.db
        .select({ amount: paymentAttempts.amount })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.id, attemptId))
        .limit(1);

      if (attempt === undefined) {
        throw notFoundError(
          'PaymentObligationRepository.refundableAmount',
          'That payment attempt does not exist.',
        );
      }
      return this.computeRefundable(attempt.amount, attemptId);
    });
  }

  /**
   * Settled amount minus every refund still consuming it.
   *
   * A REJECTED refund releases its share; the other three states do not.
   */
  private async computeRefundable(settledAmount: string, attemptId: AttemptId): Promise<string> {
    const rows = await this.db
      .select({ amount: refunds.amount })
      .from(refunds)
      .where(
        and(eq(refunds.paymentAttemptId, attemptId), inArray(refunds.status, LIVE_REFUND_STATES)),
      );

    const consumed = rows.reduce((total, row) => total + Number(row.amount), 0);
    return (Number(settledAmount) - consumed).toFixed(2);
  }
}

export type { PaymentProviderEventOutcome };
