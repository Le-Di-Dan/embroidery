/**
 * Drizzle implementation of the Admin deposit-payment read model
 * (`APP7-B04` §7, §9, §29).
 *
 * Every statement names its columns. That is what keeps `provider_key`,
 * `provider_ref`, `grant_id`, `step_up_challenge_id` and
 * `source_quotation_version_id` out of a response B04 has no authority to
 * define, and it is what makes "no order, customer or asset table is read here"
 * checkable by looking at the file: four tables appear, and all four are CTX-PAY.
 *
 * ### Deterministic ordering, with a real tie-breaker
 *
 * `created_at` is not unique — two attempts, or two reconciliation rows, can
 * share a millisecond — so every list orders on `(created_at, id)`. Without the
 * second column two identical calls could return the same rows in a different
 * sequence, and an operator comparing a screen to a colleague's would be reading
 * a difference that is not there.
 *
 * `payment_reconciliations.id` is a `bigserial`, so its ascending order is also
 * the append order; `payment_attempts.id` is a UUIDv7, whose ascending order is
 * generation order. Neither needs an index that does not exist: attempts are
 * answered from `ix_payment_attempts__payment_obligation_id` (IDX-077), and the
 * per-order row counts here are naturally bounded — one live deposit, its
 * attempts, at most five evidence images each — so there is no pagination and
 * no speculative index (`APP7-B04` §29, §31).
 *
 * No write, no transaction, no lock. A report that took a row lock would be a
 * lock a deposit verification then waits on.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import type {
  PaymentAttemptState,
  PaymentObligationState,
  PaymentReconciliationAction,
} from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, asc, eq, inArray, or, type SQL } from 'drizzle-orm';

import type {
  AdminDepositObligationRow,
  AdminPaymentAttemptRow,
  AdminPaymentReadRepository,
  AdminReconciliationRow,
  AdminTransferEvidenceRow,
} from '../../domain/repositories/admin-payment-read.repository';

const { paymentObligations, paymentAttempts, paymentReconciliations, paymentTransferEvidence } =
  schema;

/** `uq_payment_obligations__order_kind__live` — at most one row can qualify. */
const LIVE_OBLIGATION_STATES: PaymentObligationState[] = ['PENDING', 'SATISFIED'];

/** `APP7` makes only the DEPOSIT payable; `REMAINING` collection is APP9's. */
const DEPOSIT = 'DEPOSIT';

@Injectable()
export class DrizzleAdminPaymentReadRepository
  extends DrizzleRepository
  implements AdminPaymentReadRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findDepositObligation(orderId: string): Promise<AdminDepositObligationRow | undefined> {
    return this.run('findDepositObligation', async () => {
      const [row] = await this.db
        .select({
          id: paymentObligations.id,
          status: paymentObligations.status,
          amount: paymentObligations.amount,
          currencyCode: paymentObligations.currencyCode,
          satisfiedByAttemptId: paymentObligations.satisfiedByAttemptId,
          satisfiedAt: paymentObligations.satisfiedAt,
        })
        .from(paymentObligations)
        .where(
          and(
            eq(paymentObligations.orderId, orderId),
            eq(paymentObligations.kind, DEPOSIT),
            inArray(paymentObligations.status, LIVE_OBLIGATION_STATES),
          ),
        )
        .limit(1);

      if (row === undefined) {
        return undefined;
      }
      return {
        id: row.id,
        status: row.status as PaymentObligationState,
        amount: row.amount,
        currencyCode: row.currencyCode,
        satisfiedByAttemptId: row.satisfiedByAttemptId ?? undefined,
        satisfiedAt: row.satisfiedAt ?? undefined,
      };
    });
  }

  async listAttempts(obligationId: string): Promise<AdminPaymentAttemptRow[]> {
    return this.run('listAttempts', async () => {
      const rows = await this.db
        .select({
          id: paymentAttempts.id,
          method: paymentAttempts.method,
          status: paymentAttempts.status,
          amount: paymentAttempts.amount,
          currencyCode: paymentAttempts.currencyCode,
          reviewReason: paymentAttempts.reviewReason,
          succeededAt: paymentAttempts.succeededAt,
          failedAt: paymentAttempts.failedAt,
          expiresAt: paymentAttempts.expiresAt,
          createdAt: paymentAttempts.createdAt,
          updatedAt: paymentAttempts.updatedAt,
        })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.paymentObligationId, obligationId))
        .orderBy(asc(paymentAttempts.createdAt), asc(paymentAttempts.id));

      return rows.map((row) => ({
        id: row.id,
        method: row.method,
        status: row.status as PaymentAttemptState,
        amount: row.amount,
        currencyCode: row.currencyCode,
        reviewReason: row.reviewReason ?? undefined,
        succeededAt: row.succeededAt ?? undefined,
        failedAt: row.failedAt ?? undefined,
        expiresAt: row.expiresAt ?? undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
    });
  }

  async listEvidence(attemptIds: readonly string[]): Promise<AdminTransferEvidenceRow[]> {
    return this.run('listEvidence', async () => {
      if (attemptIds.length === 0) {
        // `inArray` over an empty list is a query that can only return nothing.
        // Skipped rather than issued, so an order with no attempts costs no
        // round trip.
        return [];
      }
      const rows = await this.db
        .select({
          id: paymentTransferEvidence.id,
          paymentAttemptId: paymentTransferEvidence.paymentAttemptId,
          assetId: paymentTransferEvidence.assetId,
          createdAt: paymentTransferEvidence.createdAt,
        })
        .from(paymentTransferEvidence)
        .where(inArray(paymentTransferEvidence.paymentAttemptId, [...attemptIds]))
        .orderBy(asc(paymentTransferEvidence.createdAt), asc(paymentTransferEvidence.id));

      return rows.map((row) => ({
        id: row.id,
        paymentAttemptId: row.paymentAttemptId,
        assetId: row.assetId,
        createdAt: row.createdAt,
      }));
    });
  }

  async findEvidenceForDelivery(evidenceId: string): Promise<AdminTransferEvidenceRow | undefined> {
    return this.run('findEvidenceForDelivery', async () => {
      // The join is the point. Selecting the association alone would answer
      // "a row with this id exists"; joining `payment_attempts` answers "a row
      // with this id names a payment attempt", which is the term `APP7-B06` §2
      // actually requires. `fk_payment_transfer_evidence__payment_attempt_id`
      // makes an orphan unreachable, so this costs a PK lookup and buys a
      // predicate that cannot be dropped by a later edit without failing.
      //
      // No asset table appears here, and that is the boundary: AGG-08 owns the
      // asset row and the storage key, and a statement that produced one from a
      // CTX-PAY repository would make Payment a second authority on where a
      // customer's private file lives (`BACKEND_CONVENTIONS.md` §10).
      const [row] = await this.db
        .select({
          id: paymentTransferEvidence.id,
          paymentAttemptId: paymentTransferEvidence.paymentAttemptId,
          assetId: paymentTransferEvidence.assetId,
          createdAt: paymentTransferEvidence.createdAt,
        })
        .from(paymentTransferEvidence)
        .innerJoin(
          paymentAttempts,
          eq(paymentAttempts.id, paymentTransferEvidence.paymentAttemptId),
        )
        .where(eq(paymentTransferEvidence.id, evidenceId))
        .limit(1);

      if (row === undefined) {
        return undefined;
      }
      return {
        id: row.id,
        paymentAttemptId: row.paymentAttemptId,
        assetId: row.assetId,
        createdAt: row.createdAt,
      };
    });
  }

  async listReconciliations(
    obligationId: string,
    attemptIds: readonly string[],
  ): Promise<AdminReconciliationRow[]> {
    return this.run('listReconciliations', async () => {
      const targets: SQL[] = [eq(paymentReconciliations.paymentObligationId, obligationId)];
      if (attemptIds.length > 0) {
        targets.push(inArray(paymentReconciliations.paymentAttemptId, [...attemptIds]));
      }
      const where = or(...targets);

      const rows = await this.db
        .select({
          id: paymentReconciliations.id,
          paymentAttemptId: paymentReconciliations.paymentAttemptId,
          action: paymentReconciliations.action,
          resolvedStatus: paymentReconciliations.resolvedStatus,
          amount: paymentReconciliations.amount,
          reason: paymentReconciliations.reason,
          adminId: paymentReconciliations.adminId,
          bankReference: paymentReconciliations.bankReference,
          createdAt: paymentReconciliations.createdAt,
        })
        .from(paymentReconciliations)
        .where(where)
        .orderBy(asc(paymentReconciliations.createdAt), asc(paymentReconciliations.id));

      return rows.map((row) => ({
        // `bigserial`, so the append order and the id order are the same one.
        id: String(row.id),
        paymentAttemptId: row.paymentAttemptId ?? undefined,
        action: row.action as PaymentReconciliationAction,
        resolvedStatus: row.resolvedStatus ?? undefined,
        amount: row.amount ?? undefined,
        reason: row.reason,
        adminId: row.adminId,
        bankReference: row.bankReference ?? undefined,
        createdAt: row.createdAt,
      }));
    });
  }
}
