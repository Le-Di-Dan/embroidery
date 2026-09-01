/**
 * AGG-16 Payment persistence against a real PostgreSQL instance (DB7-CP4).
 *
 * TBL-054..TBL-058 and guards G-DB7-06 (the satisfying attempt belongs to the
 * obligation), G-DB7-32 (idempotent provider ingestion), G-DB7-33 (amount and
 * currency match), G-DB7-34 (money evidence immutable) and G-DB7-35/36 (refund
 * ceiling and execution evidence).
 *
 * Concurrent-callback races are DB8 CC-07/08 and are not claimed here.
 */
import { isPersistenceError, newId, withMappedErrors } from '@embroidery/database';
import type { PersistenceError } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { seedOrderChain } from '../../../order/tests/integration/order-fixture';
import type { OrderFixture } from '../../../order/tests/integration/order-fixture';
import { PaymentModule } from '../../payment.module';
import { PAYMENT_OBLIGATION_REPOSITORY } from '../../domain/repositories/payment-obligation.repository';
import type {
  AttemptId,
  ObligationId,
  PaymentObligationRepository,
  RefundId,
} from '../../domain/repositories/payment-obligation.repository';

describe('payment persistence (integration)', () => {
  let context: PersistenceTestContext;
  let payments: PaymentObligationRepository;
  let fixture: OrderFixture;
  let orderId: string;

  beforeAll(async () => {
    context = await createPersistenceTestContext('cp4-payment', [PaymentModule]);
    payments = context.get(PAYMENT_OBLIGATION_REPOSITORY);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    fixture = await seedOrderChain(context);
    orderId = newId();
    await context.disposable.client.db.execute(sql`
      insert into orders
        (id, code, origin, custom_request_id, customer_id, accepted_quotation_version_id,
         current_approval_snapshot_id, status, total_amount, currency_code)
      values (${orderId}, ${`ORD-${orderId}`}, 'CUSTOM', ${fixture.customRequestId}, ${fixture.customerId},
              ${fixture.quotationVersionId}, ${fixture.approvalSnapshotId},
              'AWAITING_DEPOSIT', 2550000.00, 'VND')
    `);
  });

  async function failureOf(work: () => Promise<unknown>): Promise<PersistenceError> {
    try {
      await work();
    } catch (error: unknown) {
      if (isPersistenceError(error)) {
        return error;
      }
      throw error;
    }
    throw new Error('Expected the operation to fail, but it succeeded.');
  }

  const createObligation = (kind: 'DEPOSIT' | 'REMAINING' = 'DEPOSIT', amount = '765000.00') => {
    const id = newId() as ObligationId;
    return context.inTransaction(() =>
      payments.createForOrder({
        id,
        orderId,
        kind,
        amount,
        sourceQuotationVersionId: fixture.quotationVersionId,
      }),
    );
  };

  const openAttempt = (obligationId: ObligationId, amount = '765000.00') => {
    const id = newId() as AttemptId;
    return context.inTransaction(() =>
      payments.openAttempt({
        id,
        paymentObligationId: obligationId,
        amount,
        method: 'PROVIDER_REDIRECT',
        providerKey: 'test-provider',
      }),
    );
  };

  /** An obligation with a succeeded attempt against it. */
  async function succeededAttempt(amount = '765000.00') {
    const obligation = await createObligation('DEPOSIT', amount);
    const attempt = await openAttempt(obligation.id, amount);
    await context.inTransaction(() => payments.settleAttempt(attempt.id, 'SUCCEEDED', new Date()));
    return { obligation, attempt };
  }

  describe('obligations', () => {
    it('creates deposit and remaining as independent obligations (INV-04)', async () => {
      const deposit = await createObligation('DEPOSIT', '765000.00');
      const remaining = await createObligation('REMAINING', '1785000.00');

      expect(deposit.id).not.toBe(remaining.id);
      expect(deposit.amount).toBe('765000.00');
      expect(remaining.amount).toBe('1785000.00');
    });

    it('allows only one live obligation per order and kind', async () => {
      await createObligation('DEPOSIT');

      const error = await failureOf(() => createObligation('DEPOSIT'));

      expect(error.code).toBe('OBLIGATION_ALREADY_ACTIVE');
    });

    it('rejects an obligation for an order that does not exist', async () => {
      const error = await failureOf(() =>
        context.inTransaction(() =>
          payments.createForOrder({
            id: newId() as ObligationId,
            orderId: newId(),
            kind: 'DEPOSIT',
            amount: '1000.00',
            sourceQuotationVersionId: fixture.quotationVersionId,
          }),
        ),
      );

      expect(error.kind).toBe('INVALID_REFERENCE');
    });
  });

  describe('attempts', () => {
    it('opens an attempt against a pending obligation', async () => {
      const obligation = await createObligation();

      const attempt = await openAttempt(obligation.id);

      expect(attempt.status).toBe('PENDING');
      await expect(payments.listAttempts(obligation.id)).resolves.toHaveLength(1);
    });

    it('refuses an attempt against a settled obligation', async () => {
      const { obligation, attempt } = await succeededAttempt();
      await context.inTransaction(() => payments.satisfy(obligation.id, attempt.id, new Date()));

      // Taking money for something already paid.
      const error = await failureOf(() => openAttempt(obligation.id));

      expect(error.code).toBe('OBLIGATION_NOT_PAYABLE');
    });

    it('settles an attempt exactly once', async () => {
      const obligation = await createObligation();
      const attempt = await openAttempt(obligation.id);
      await context.inTransaction(() =>
        payments.settleAttempt(attempt.id, 'SUCCEEDED', new Date()),
      );

      // A late callback must not overwrite a decision already acted on.
      const error = await failureOf(() =>
        context.inTransaction(() => payments.settleAttempt(attempt.id, 'FAILED', new Date())),
      );

      expect(error.code).toBe('ATTEMPT_ALREADY_SETTLED');
    });
  });

  describe('satisfaction (G-DB7-06 / G-DB7-33)', () => {
    it('satisfies an obligation from its own succeeded attempt', async () => {
      const { obligation, attempt } = await succeededAttempt();

      const satisfied = await context.inTransaction(() =>
        payments.satisfy(obligation.id, attempt.id, new Date()),
      );

      expect(satisfied.status).toBe('SATISFIED');
      expect(satisfied.satisfiedByAttemptId).toBe(attempt.id);
    });

    it('refuses an attempt belonging to another obligation (G-DB7-06)', async () => {
      const mine = await createObligation('DEPOSIT', '765000.00');
      const theirs = await createObligation('REMAINING', '1785000.00');
      const theirAttempt = await openAttempt(theirs.id, '1785000.00');
      await context.inTransaction(() =>
        payments.settleAttempt(theirAttempt.id, 'SUCCEEDED', new Date()),
      );

      // The FK proves the attempt exists; only the read proves whose it is.
      // Without it, one order's payment could settle another's debt.
      const error = await failureOf(() =>
        context.inTransaction(() => payments.satisfy(mine.id, theirAttempt.id, new Date())),
      );

      expect(error.code).toBe('ATTEMPT_BELONGS_TO_ANOTHER_OBLIGATION');
      expect(error.kind).toBe('INVARIANT_VIOLATION');
    });

    it('refuses an attempt that did not succeed (G-DB7-33)', async () => {
      const obligation = await createObligation();
      const attempt = await openAttempt(obligation.id);
      await context.inTransaction(() => payments.settleAttempt(attempt.id, 'FAILED', new Date()));

      const error = await failureOf(() =>
        context.inTransaction(() => payments.satisfy(obligation.id, attempt.id, new Date())),
      );

      expect(error.code).toBe('ATTEMPT_NOT_SUCCEEDED');
    });

    it('refuses an attempt whose amount does not match what is owed (G-DB7-33)', async () => {
      const obligation = await createObligation('DEPOSIT', '765000.00');
      const attempt = await openAttempt(obligation.id, '100000.00');
      await context.inTransaction(() =>
        payments.settleAttempt(attempt.id, 'SUCCEEDED', new Date()),
      );

      const error = await failureOf(() =>
        context.inTransaction(() => payments.satisfy(obligation.id, attempt.id, new Date())),
      );

      expect(error.code).toBe('PAYMENT_AMOUNT_MISMATCH');
    });

    it('refuses to satisfy twice', async () => {
      const { obligation, attempt } = await succeededAttempt();
      await context.inTransaction(() => payments.satisfy(obligation.id, attempt.id, new Date()));

      const error = await failureOf(() =>
        context.inTransaction(() => payments.satisfy(obligation.id, attempt.id, new Date())),
      );

      expect(error.code).toBe('OBLIGATION_NOT_PENDING');
    });

    it('leaves the obligation pending when satisfaction is refused', async () => {
      const obligation = await createObligation();
      const attempt = await openAttempt(obligation.id);

      await expect(
        context.inTransaction(() => payments.satisfy(obligation.id, attempt.id, new Date())),
      ).rejects.toBeDefined();

      await expect(payments.findById(obligation.id)).resolves.toMatchObject({
        status: 'PENDING',
        satisfiedByAttemptId: undefined,
      });
    });
  });

  describe('provider events (G-DB7-32 / INV-07)', () => {
    const event = (ref: string) => ({
      providerKey: 'test-provider',
      providerEventRef: ref,
      eventKind: 'SUCCESS',
      redactedPayload: { status: 'ok' },
      signatureValid: true,
      applicationOutcome: 'APPLIED' as const,
      receivedAt: new Date(),
    });

    it('records a first callback', async () => {
      const outcome = await context.inTransaction(() =>
        payments.recordProviderEvent(event('evt-1')),
      );

      expect(outcome.outcome).toBe('recorded');
    });

    it('reports a duplicate callback as a replay, not a failure', async () => {
      await context.inTransaction(() => payments.recordProviderEvent(event('evt-dup')));

      // Providers retry. Treating that as an error would turn a correct
      // redelivery into an incident.
      const outcome = await context.inTransaction(() =>
        payments.recordProviderEvent(event('evt-dup')),
      );

      expect(outcome).toEqual({ outcome: 'replay' });
    });

    it('does not abort the enclosing transaction on a duplicate', async () => {
      await context.inTransaction(() => payments.recordProviderEvent(event('evt-coexist')));

      // A caught 23505 would have poisoned the transaction, taking the domain
      // work with it — which is why the insert uses onConflictDoNothing.
      const result = await context.inTransaction(async () => {
        const first = await payments.recordProviderEvent(event('evt-coexist'));
        const second = await payments.recordProviderEvent(event('evt-second'));
        return { first, second };
      });

      expect(result.first.outcome).toBe('replay');
      expect(result.second.outcome).toBe('recorded');
    });

    it('treats the same ref from a different provider as a distinct event', async () => {
      await context.inTransaction(() => payments.recordProviderEvent(event('shared-ref')));

      const outcome = await context.inTransaction(() =>
        payments.recordProviderEvent({ ...event('shared-ref'), providerKey: 'other-provider' }),
      );

      expect(outcome.outcome).toBe('recorded');
    });

    it('rejects a mutation of a recorded callback via the S24 trigger (G-DB7-34)', async () => {
      await context.inTransaction(() => payments.recordProviderEvent(event('evt-frozen')));

      const error = await failureOf(() =>
        withMappedErrors('probe.tamperProviderEvent', () =>
          context.disposable.client.db.execute(
            sql`update payment_provider_events set signature_valid = false where provider_event_ref = 'evt-frozen'`,
          ),
        ),
      );

      expect(error.kind).toBe('IMMUTABLE_EVIDENCE');
    });
  });

  describe('reconciliation', () => {
    it('appends a reconciliation with its reason', async () => {
      const { obligation } = await succeededAttempt();

      await context.inTransaction(() =>
        payments.appendReconciliation({
          paymentObligationId: obligation.id,
          action: 'MANUAL_MATCH',
          reason: 'Bank transfer matched by reference',
          adminId: fixture.adminId,
        }),
      );

      const [row] = (
        await context.disposable.client.db.execute<{ count: string }>(
          sql`select count(*)::text as count from payment_reconciliations where payment_obligation_id = ${obligation.id}`,
        )
      ).rows;
      expect(Number(row?.count)).toBe(1);
    });

    it('rejects a blank reconciliation reason', async () => {
      const error = await failureOf(() =>
        context.inTransaction(() =>
          payments.appendReconciliation({
            action: 'MANUAL_MATCH',
            reason: '  ',
            adminId: fixture.adminId,
          }),
        ),
      );

      expect(error.code).toBe('RECONCILIATION_REASON_REQUIRED');
    });
  });

  describe('refunds (G-DB7-35 / G-DB7-36)', () => {
    const openRefund = (attemptId: AttemptId, amount: string) =>
      context.inTransaction(() =>
        payments.openRefund({
          id: newId() as RefundId,
          paymentAttemptId: attemptId,
          orderId,
          amount,
          reason: 'Customer cancelled',
        }),
      );

    it('reports the full settled amount as refundable initially', async () => {
      const { attempt } = await succeededAttempt('765000.00');

      await expect(payments.refundableAmount(attempt.id)).resolves.toBe('765000.00');
    });

    it('opens a partial refund and reduces what remains refundable', async () => {
      const { attempt } = await succeededAttempt('765000.00');

      await openRefund(attempt.id, '65000.00');

      await expect(payments.refundableAmount(attempt.id)).resolves.toBe('700000.00');
    });

    it('rejects a refund larger than what remains (G-DB7-35)', async () => {
      const { attempt } = await succeededAttempt('765000.00');
      await openRefund(attempt.id, '700000.00');

      const error = await failureOf(() => openRefund(attempt.id, '100000.00'));

      expect(error.code).toBe('REFUND_EXCEEDS_REFUNDABLE');
    });

    it('rejects a non-positive refund', async () => {
      const { attempt } = await succeededAttempt();

      const error = await failureOf(() => openRefund(attempt.id, '0.00'));

      expect(error.code).toBe('REFUND_AMOUNT_INVALID');
    });

    it('rejects a blank refund reason', async () => {
      const { attempt } = await succeededAttempt();

      const error = await failureOf(() =>
        context.inTransaction(() =>
          payments.openRefund({
            id: newId() as RefundId,
            paymentAttemptId: attempt.id,
            orderId,
            amount: '1000.00',
            reason: '',
          }),
        ),
      );

      expect(error.code).toBe('REFUND_REASON_REQUIRED');
    });

    it('refuses to refund an attempt whose money never arrived', async () => {
      const obligation = await createObligation();
      const attempt = await openAttempt(obligation.id);
      await context.inTransaction(() => payments.settleAttempt(attempt.id, 'FAILED', new Date()));

      // A payout with no matching receipt.
      const error = await failureOf(() => openRefund(attempt.id, '1000.00'));

      expect(error.code).toBe('ATTEMPT_NOT_REFUNDABLE');
    });

    it('requires approval before execution (G-DB7-36)', async () => {
      const { attempt } = await succeededAttempt();
      const refund = await openRefund(attempt.id, '100000.00');

      // Execution moves real money, so it must follow a recorded decision.
      const error = await failureOf(() =>
        context.inTransaction(() =>
          payments.executeRefund(refund.id, fixture.adminId, 'BANK_TRANSFER', 'TR-1', new Date()),
        ),
      );

      expect(error.code).toBe('REFUND_NOT_APPROVED');
    });

    it('approves then executes, recording who did each', async () => {
      const { attempt } = await succeededAttempt();
      const refund = await openRefund(attempt.id, '100000.00');

      await context.inTransaction(() =>
        payments.approveRefund(refund.id, fixture.adminId, new Date()),
      );
      const executed = await context.inTransaction(() =>
        payments.executeRefund(refund.id, fixture.adminId, 'BANK_TRANSFER', 'TR-1', new Date()),
      );

      expect(executed.status).toBe('EXECUTED');
    });

    it('refuses to approve twice', async () => {
      const { attempt } = await succeededAttempt();
      const refund = await openRefund(attempt.id, '100000.00');
      await context.inTransaction(() =>
        payments.approveRefund(refund.id, fixture.adminId, new Date()),
      );

      const error = await failureOf(() =>
        context.inTransaction(() => payments.approveRefund(refund.id, fixture.adminId, new Date())),
      );

      expect(error.code).toBe('REFUND_NOT_PENDING_REVIEW');
    });

    it('rejects a mutation of a refund amount via the S24 trigger (G-DB7-34)', async () => {
      const { attempt } = await succeededAttempt();
      const refund = await openRefund(attempt.id, '100000.00');

      const error = await failureOf(() =>
        withMappedErrors('probe.tamperRefundAmount', () =>
          context.disposable.client.db.execute(
            sql`update refunds set amount = 999999.00 where id = ${refund.id}`,
          ),
        ),
      );

      expect(error.kind).toBe('IMMUTABLE_EVIDENCE');
    });
  });
});
