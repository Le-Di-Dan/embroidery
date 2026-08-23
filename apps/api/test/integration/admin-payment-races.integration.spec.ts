/**
 * `APP7-B04` — the two real races and the rollback proof
 * (`APP7-B04` §14, §22, §23, §24, §35; DB8 CC-10).
 *
 * Both races run as **two independent HTTP requests issued concurrently**
 * against the running application. That is the faithful shape: each request
 * takes its own connection from the pool and opens its own transaction, so the
 * arbiter under test is the database's row lock and the state predicates around
 * it — not a process-level mutex, a queue or an `await` that happened to
 * serialize the two calls.
 *
 * No production constraint is weakened to manufacture either race, and no
 * fault-injection code exists in the runtime: the rollback proof overrides one
 * provider **in the testing module only**, so the failure is injected at a seam
 * Nest already offers rather than by a flag the production build carries.
 *
 * ### One execution each, deliberately (`APP7-B04-C1` §11)
 *
 * `APP7-B04` shipped these with 5× and 3× repetition loops. That was a
 * validation-discipline defect and the loops are gone: repeating a race is
 * running a passing command again on unchanged input, which buys confidence
 * rather than evidence. Either the arbiter is the obligation row lock — in which
 * case one execution proves it — or it is timing, in which case eight
 * executions prove nothing either. The determinism lives in the assertions
 * (`[200, 409]`, one satisfying attempt, one transition row, one event), not in
 * the repeat count.
 */
import { sql } from 'drizzle-orm';
import type { TestingModuleBuilder } from '@nestjs/testing';

import { PaymentDecisionRecorder } from '../../src/modules/payment/application/admin/payment-decision.recorder';
import {
  ADMIN_ORIGIN,
  ADMIN_PAYMENT_ROUTES,
  SEEDED_DEPOSIT_AMOUNT,
  countAudit,
  countOutbox,
  countRows,
  createAdminPaymentContext,
  openAttempt,
  readAttempt,
  readObligation,
  readOrderStatus,
  readReconciliations,
  seedVerifiableAttempt,
  type AdminPaymentTestContext,
  type SeededAttempt,
} from '../support/admin-payment-fixture';

jest.setTimeout(300_000);

describe('APP7-B04 — concurrent verification and rollback', () => {
  describe('two independent Admin requests racing', () => {
    let context: AdminPaymentTestContext;

    beforeAll(async () => {
      context = await createAdminPaymentContext('app7_b04_races');
    });

    afterAll(async () => {
      await context?.close();
    });

    function verify(attemptId: string, reference: string, note: string) {
      return context.ctx.http
        .post(ADMIN_PAYMENT_ROUTES.verify(attemptId))
        .set('Cookie', context.cookie())
        .set('Origin', ADMIN_ORIGIN)
        .send({
          observedAmount: SEEDED_DEPOSIT_AMOUNT,
          observedTransferReference: reference,
          note,
        });
    }

    async function seed(suffix: string): Promise<SeededAttempt> {
      return seedVerifiableAttempt(context.ctx.app, context.ctx.database, { suffix });
    }

    /** Everything that must be true exactly once after either race. */
    async function expectExactlyOneApplication(
      seeded: SeededAttempt,
      winnerAttemptId: string,
    ): Promise<void> {
      const obligation = await readObligation(context.ctx.database, seeded.depositObligationId);
      expect(obligation.status).toBe('SATISFIED');
      expect(obligation.satisfied_by_attempt_id).toBe(winnerAttemptId);

      expect(await readOrderStatus(context.ctx.database, seeded.orderId)).toBe('DEPOSIT_PAID');
      // One transition row, so the order moved once and not twice.
      expect(
        await countRows(
          context.ctx.database,
          sql`select count(*)::text as count from order_transitions
               where order_id = ${seeded.orderId} and to_status = 'DEPOSIT_PAID'`,
        ),
      ).toBe(1);

      expect(await readReconciliations(context.ctx.database, winnerAttemptId)).toHaveLength(1);
      expect(await countOutbox(context.ctx.database, 'payment.verified', winnerAttemptId)).toBe(1);
      expect(
        await countAudit(context.ctx.database, 'payment_attempt.verified', winnerAttemptId),
      ).toBe(1);
      // Whatever else happened, no `payment.verified` exists for anything else
      // on this order.
      expect(
        await countRows(
          context.ctx.database,
          // `outbox_events.aggregate_id` is deliberately polymorphic **text**
          // with no foreign key (REL-104), so the attempt id is cast to join it.
          sql`select count(*)::text as count from outbox_events o
                join payment_attempts a on a.id::text = o.aggregate_id
               where o.event_type = 'payment.verified'
                 and a.payment_obligation_id = ${seeded.depositObligationId}`,
        ),
      ).toBe(1);
      // Manual verification never writes a provider event, race or no race.
      expect(
        await countRows(
          context.ctx.database,
          sql`select count(*)::text as count from payment_provider_events`,
        ),
      ).toBe(0);
    }

    it('applies the same attempt exactly once when two Admins verify it at once', async () => {
      const seeded = await seed('same1');

      const [a, b] = await Promise.all([
        verify(seeded.attemptId, seeded.expectedReference, 'Người thứ nhất.'),
        verify(seeded.attemptId, seeded.expectedReference, 'Người thứ hai.'),
      ]);

      // Both requests carry the *same* exact observed facts, so neither is
      // allowed to be told the payment failed. Each is either the application
      // itself or a convergent read of it.
      const statuses = [a.status, b.status];
      expect(statuses.filter((status) => status === 200)).toHaveLength(2);

      const bodies = [a, b].map(
        (response) =>
          (response.body as { data: { replayed: boolean; attemptStatus: string } }).data,
      );
      for (const body of bodies) {
        expect(body.attemptStatus).toBe('SUCCEEDED');
      }
      // Exactly one of the two actually applied it; the other converged.
      expect(bodies.filter((body) => body.replayed === false)).toHaveLength(1);

      expect((await readAttempt(context.ctx.database, seeded.attemptId)).status).toBe('SUCCEEDED');
      await expectExactlyOneApplication(seeded, seeded.attemptId);
    });

    it('CC-10: two eligible attempts racing yield exactly one satisfying attempt', async () => {
      const seeded = await seed('cc10');
      // A second attempt on the *same* deposit, opened by the canonical writer,
      // so it carries the obligation's own amount and currency. Both
      // competitors are exact by construction — the race is about the arbiter,
      // not about which one happened to be right.
      const rival = await openAttempt(context.ctx.app, seeded.depositObligationId);

      const [a, b] = await Promise.all([
        verify(seeded.attemptId, seeded.expectedReference, 'Giao dịch A.'),
        verify(rival, seeded.expectedReference, 'Giao dịch B.'),
      ]);

      const statuses = [a.status, b.status].sort();
      // Exactly one wins; the loser is refused, and told it lost rather than
      // silently applying a second satisfaction.
      expect(statuses).toEqual([200, 409]);

      const winnerId = a.status === 200 ? seeded.attemptId : rival;
      const loserId = a.status === 200 ? rival : seeded.attemptId;

      expect((await readAttempt(context.ctx.database, winnerId)).status).toBe('SUCCEEDED');
      // The loser never became a second satisfying success. Its whole
      // transaction rolled back, so it is still exactly where it started.
      const loser = await readAttempt(context.ctx.database, loserId);
      expect(loser.status).toBe('PENDING');
      expect(loser.succeeded_at).toBeNull();
      expect(await readReconciliations(context.ctx.database, loserId)).toHaveLength(0);
      expect(await countOutbox(context.ctx.database, 'payment.verified', loserId)).toBe(0);

      await expectExactlyOneApplication(seeded, winnerId);
    });
  });

  describe('a failure inside the transaction leaves no partial state', () => {
    let context: AdminPaymentTestContext;

    beforeAll(async () => {
      // The seam is Nest's own provider override, applied to the testing module
      // only. `recordVerified` runs **after** the attempt has been settled, the
      // obligation satisfied, the order transitioned and the reconciliation
      // appended — and still inside the one transaction — so a throw here is
      // precisely the "committed everything but the last step" shape §35 asks
      // for. No fault-injection flag exists in the runtime.
      context = await createAdminPaymentContext('app7_b04_rollback', (builder) =>
        failAfterVerification(builder),
      );
    });

    afterAll(async () => {
      await context?.close();
    });

    it('rolls back the attempt, the deposit, the order, the reconciliation and the event', async () => {
      const seeded = await seedVerifiableAttempt(context.ctx.app, context.ctx.database, {
        suffix: 'rollback',
      });

      await context.ctx.http
        .post(ADMIN_PAYMENT_ROUTES.verify(seeded.attemptId))
        .set('Cookie', context.cookie())
        .set('Origin', ADMIN_ORIGIN)
        .send({
          observedAmount: SEEDED_DEPOSIT_AMOUNT,
          observedTransferReference: seeded.expectedReference,
          note: 'Sẽ hỏng ở bước cuối.',
        })
        .expect(500);

      // Every one of the impossible partial states §14 enumerates, checked.
      const attempt = await readAttempt(context.ctx.database, seeded.attemptId);
      expect(attempt.status).toBe('PENDING');
      expect(attempt.succeeded_at).toBeNull();

      const obligation = await readObligation(context.ctx.database, seeded.depositObligationId);
      expect(obligation.status).toBe('PENDING');
      expect(obligation.satisfied_by_attempt_id).toBeNull();

      expect(await readOrderStatus(context.ctx.database, seeded.orderId)).toBe('AWAITING_DEPOSIT');
      expect(
        await countRows(
          context.ctx.database,
          sql`select count(*)::text as count from order_transitions
               where order_id = ${seeded.orderId} and to_status = 'DEPOSIT_PAID'`,
        ),
      ).toBe(0);

      expect(await readReconciliations(context.ctx.database, seeded.attemptId)).toHaveLength(0);
      expect(await countOutbox(context.ctx.database, 'payment.verified', seeded.attemptId)).toBe(0);
      expect(
        await countAudit(context.ctx.database, 'payment_attempt.verified', seeded.attemptId),
      ).toBe(0);
    });
  });
});

/** The one overridden provider: everything up to the recorder, then a throw. */
function failAfterVerification(builder: TestingModuleBuilder): TestingModuleBuilder {
  return builder.overrideProvider(PaymentDecisionRecorder).useValue({
    recordVerified: () => {
      throw new Error('APP7-B04 rollback fixture: injected failure inside the transaction.');
    },
    recordReviewRequired: () => Promise.resolve(),
  });
}
