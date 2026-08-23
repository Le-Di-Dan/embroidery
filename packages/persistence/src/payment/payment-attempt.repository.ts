/**
 * The `payment_attempts` row itself — settlement, locked verification reads and
 * plain lookups (TBL-055).
 *
 * Split from the obligation repository by responsibility, on the same terms and
 * for the same reason as `PaymentEvidenceRepository`: that class is the record
 * of what money *did*, the obligation owns what money *owes*, and this owns the
 * **attempt row's own lifecycle**. `DrizzlePaymentObligationRepository`
 * delegates to it so the aggregate still presents one `PaymentObligationRepository`
 * contract and no table gains a repository of its own (DB7 §10.1).
 *
 * `openAttempt` deliberately stays with the obligation. It is decided under the
 * *obligation's* row lock and its state predicate — an attempt may only be
 * opened against a `PENDING` obligation — so it belongs where that lock is
 * taken, not here.
 *
 * Carries the LC-16 out-of-order rule: {@link PaymentAttemptRepository.settle}
 * moves an attempt only from `PENDING`, `PROCESSING` or `REQUIRES_REVIEW`, so a
 * terminal state can never regress and a late decision can never overwrite one
 * already acted on.
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, schema } from '@embroidery/database';
import type { PaymentAttemptState } from '@embroidery/database';
import { and, asc, eq, inArray } from 'drizzle-orm';

import { DatabaseExecutor } from '../runtime/database-executor';
import { DrizzleRepository } from '../repository/drizzle-repository';
import type {
  AttemptId,
  ObligationId,
  PaymentAttempt,
  VerifiableAttempt,
} from './payment-obligation.repository';
import { toAttempt, toObligation } from './payment-row.mapper';

const { paymentAttempts, paymentObligations } = schema;

@Injectable()
export class PaymentAttemptRepository extends DrizzleRepository {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async settle(
    id: AttemptId,
    status: PaymentAttemptState,
    at: Date,
    reviewReason?: string,
  ): Promise<PaymentAttempt> {
    return this.run('settle', async () => {
      const [row] = await this.db
        .update(paymentAttempts)
        .set({
          status,
          succeededAt: status === 'SUCCEEDED' ? at : null,
          failedAt: status === 'FAILED' || status === 'EXPIRED' ? at : null,
          reviewReason: reviewReason ?? null,
          updatedAt: at,
        })
        .where(
          and(
            eq(paymentAttempts.id, id),
            // Only an unsettled attempt may settle. Re-settling would let a
            // late callback overwrite a decision already acted on.
            inArray(paymentAttempts.status, ['PENDING', 'PROCESSING', 'REQUIRES_REVIEW']),
          ),
        )
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'PaymentAttemptRepository.settle',
          'ATTEMPT_ALREADY_SETTLED',
          'That payment attempt has already been settled.',
        );
      }
      return toAttempt(row);
    });
  }

  async lockForVerification(id: AttemptId): Promise<VerifiableAttempt | undefined> {
    return this.run('lockForVerification', async () => {
      const tx = this.requireTransaction('lockForVerification');

      // Lock 1 of 3. `payment_attempts` → `payment_obligations` (`satisfy`) →
      // `orders` (`transition`) is the whole lock order of an Admin
      // verification, and it starts here so two operators verifying the *same*
      // attempt serialize before either has read a state it might act on.
      const [attempt] = await tx
        .select()
        .from(paymentAttempts)
        .where(eq(paymentAttempts.id, id))
        .limit(1)
        .for('update');

      if (attempt === undefined) {
        return undefined;
      }

      // No lock. `satisfy` takes this row `FOR UPDATE` and re-reads its state
      // inside the same transaction, so it — not this read — is the arbiter of
      // whether the deposit is still payable. Locking it here would serialize
      // two verifications of two *different* attempts on one deposit before
      // either had proved its own chain, which is work the loser must not do.
      const [obligation] = await tx
        .select()
        .from(paymentObligations)
        .where(eq(paymentObligations.id, attempt.paymentObligationId))
        .limit(1);

      if (obligation === undefined) {
        // Unreachable through `fk_payment_attempts__payment_obligation_id`, and
        // reported as absence rather than asserted away: a caller that cannot
        // see the obligation cannot prove the chain, so it must refuse.
        return undefined;
      }

      return { attempt: toAttempt(attempt), obligation: toObligation(obligation) };
    });
  }

  async load(id: AttemptId): Promise<PaymentAttempt | undefined> {
    return this.run('load', async () => {
      const [row] = await this.db
        .select()
        .from(paymentAttempts)
        .where(eq(paymentAttempts.id, id))
        .limit(1);
      return row === undefined ? undefined : toAttempt(row);
    });
  }

  async listForObligation(id: ObligationId): Promise<PaymentAttempt[]> {
    return this.run('listForObligation', async () => {
      const rows = await this.db
        .select()
        .from(paymentAttempts)
        .where(eq(paymentAttempts.paymentObligationId, id))
        .orderBy(asc(paymentAttempts.createdAt));
      return rows.map(toAttempt);
    });
  }
}
