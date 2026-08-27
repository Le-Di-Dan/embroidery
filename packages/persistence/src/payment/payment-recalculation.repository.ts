/**
 * The obligation recalculation chain (`TR-LC15-04`, ADR-DB3-003 r7).
 *
 * Split from `DrizzlePaymentObligationRepository` by responsibility, exactly as
 * `PaymentAttemptRepository` and `PaymentEvidenceRepository` were: the
 * obligation's own creation and satisfaction are one concern, and *replacing* a
 * live obligation with a repriced successor is another. It is delegated to from
 * the aggregate so `PaymentObligationRepository` keeps one contract and no
 * caller has to know which class holds which method (DB7 §10.1).
 *
 * This is the **only** writer in the system that produces `SUPERSEDED`, and the
 * only one that sets `superseded_by_obligation_id`. `cancel` produces
 * `CANCELLED` and never writes the pointer — a cancelled obligation is withdrawn,
 * not replaced — so the two are not interchangeable.
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, notFoundError, schema } from '@embroidery/database';
import type { PaymentObligationKind } from '@embroidery/database';
import { eq } from 'drizzle-orm';

import { DatabaseExecutor } from '../runtime/database-executor';
import { DrizzleRepository } from '../repository/drizzle-repository';

import type {
  PaymentObligation,
  RecalculateObligationInput,
} from './payment-obligation.repository';
import { toObligation } from './payment-row.mapper';

const { paymentObligations } = schema;

const CURRENCY = 'VND';

@Injectable()
export class PaymentRecalculationRepository extends DrizzleRepository {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async recalculate(input: RecalculateObligationInput): Promise<PaymentObligation> {
    return this.run('recalculate', async () => {
      const tx = this.requireTransaction('recalculate');

      const [predecessor] = await tx
        .select()
        .from(paymentObligations)
        .where(eq(paymentObligations.id, input.id))
        .limit(1)
        .for('update');

      if (predecessor === undefined) {
        throw notFoundError(
          'PaymentObligationRepository.recalculate',
          'That obligation does not exist.',
        );
      }
      if (predecessor.status !== 'PENDING') {
        // TR-LC15-04 is `PENDING -> SUPERSEDED` and nothing else: SATISFIED is
        // terminal, so paid money is never turned back into a balance.
        throw guardViolationError(
          'PaymentObligationRepository.recalculate',
          'OBLIGATION_NOT_PENDING',
          'Only a pending obligation can be recalculated.',
        );
      }

      // Retire the predecessor **before** creating the successor:
      // `uq_payment_obligations__order_kind__live` is partial over PENDING and
      // SATISFIED, so two PENDING rows would violate it even for an instant —
      // one live obligation per (order, kind) is what INV-04 means. `amount` is
      // never touched: the chain, not an edited row, is the history. No CAS
      // predicate is needed because the row is held `FOR UPDATE`, and that lock
      // is the arbiter — a rival recalculation blocks on it, then re-reads
      // SUPERSEDED and refuses instead of reusing the same previous amount.
      const at = new Date();
      await tx
        .update(paymentObligations)
        .set({ status: 'SUPERSEDED', updatedAt: at })
        .where(eq(paymentObligations.id, input.id));

      // The successor is born from the predecessor's own row rather than from
      // caller-supplied facts: same order, same kind, same currency and the same
      // `source_quotation_version_id`. Only the amount moved, so re-deriving the
      // provenance from a live quotation would make a mutable row the origin of
      // a frozen one.
      const [successor] = await tx
        .insert(paymentObligations)
        .values({
          id: input.successorId,
          orderId: predecessor.orderId,
          kind: predecessor.kind as PaymentObligationKind,
          amount: input.amount,
          currencyCode: CURRENCY,
          status: 'PENDING',
          sourceQuotationVersionId: predecessor.sourceQuotationVersionId,
        })
        .returning();

      if (successor === undefined) {
        throw guardViolationError(
          'PaymentObligationRepository.recalculate',
          'OBLIGATION_NOT_CREATED',
          'Could not create the successor payment obligation.',
        );
      }

      // The pointer last, now that it names a row that exists (restrict FK).
      await tx
        .update(paymentObligations)
        .set({ supersededByObligationId: successor.id, updatedAt: at })
        .where(eq(paymentObligations.id, input.id));

      return toObligation(successor);
    });
  }
}
