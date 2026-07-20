/**
 * DB8-CP3 — payment provider-event idempotent-ingestion race against real,
 * independent PostgreSQL connections
 * (`DB8_RACE_COVERAGE_MATRIX.md` CC-09, P0).
 *
 * DB7 proved a *sequential* duplicate `(provider, provider_event_ref)`
 * replays rather than double-satisfying (`payment-persistence.integration.spec.ts`,
 * G-DB7-32). This proves two actors racing the *same* callback concurrently
 * still ingest it exactly once — a real double-delivery, which is the
 * scenario `uq_payment_provider_events__provider_key__provider_event_ref`
 * exists for.
 */
import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { PaymentModule } from '../../payment.module';
import { PAYMENT_OBLIGATION_REPOSITORY } from '../../domain/repositories/payment-obligation.repository';
import type {
  ObligationId,
  PaymentObligationRepository,
  RecordProviderEventInput,
} from '../../domain/repositories/payment-obligation.repository';
import { createConcurrencyTestContext } from '../../../../tests/integration/db8-concurrency-context';
import type { ConcurrencyTestContext } from '../../../../tests/integration/db8-concurrency-context';
import { seedOrderChain } from '../../../order/tests/integration/order-fixture';
import type { OrderFixture } from '../../../order/tests/integration/order-fixture';

describe('payment provider-event idempotent ingestion race (DB8-CP3, integration)', () => {
  let context: ConcurrencyTestContext;
  let fixture: OrderFixture;
  let orderId: string;
  let obligationId: ObligationId;

  beforeAll(async () => {
    context = await createConcurrencyTestContext('db8-cp3-payment', [PaymentModule]);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  async function countRows(query: ReturnType<typeof sql>): Promise<number> {
    const [row] = (await context.disposable.client.db.execute<{ count: string }>(query)).rows;
    return Number(row?.count ?? 0);
  }

  beforeEach(async () => {
    await context.reset();
    fixture = await seedOrderChain(context);
    orderId = newId();
    await context.disposable.client.db.execute(sql`
      insert into orders
        (id, code, custom_request_id, customer_id, accepted_quotation_version_id,
         current_approval_snapshot_id, status, total_amount, currency_code)
      values (${orderId}, ${`ORD-${orderId}`}, ${fixture.customRequestId}, ${fixture.customerId},
              ${fixture.quotationVersionId}, ${fixture.approvalSnapshotId},
              'AWAITING_DEPOSIT', 2550000.00, 'VND')
    `);

    const seeder = await context.spawnActor('seeder');
    obligationId = await seeder.inTransaction(async () => {
      const obligation = await seeder
        .get<PaymentObligationRepository>(PAYMENT_OBLIGATION_REPOSITORY)
        .createForOrder({
          id: newId() as ObligationId,
          orderId,
          kind: 'DEPOSIT',
          amount: '765000.00',
          sourceQuotationVersionId: fixture.quotationVersionId,
        });
      return obligation.id;
    });
  });

  it('CC-09: two concurrent deliveries of the same provider event ingest exactly once', async () => {
    const a = await context.spawnActor('A');
    const b = await context.spawnActor('B');
    const providerEventRef = `evt-${newId()}`;

    function eventFor(paymentObligationId: ObligationId): RecordProviderEventInput {
      return {
        providerKey: 'MOCK_PROVIDER',
        providerEventRef,
        eventKind: 'SUCCESS',
        amount: '765000.00',
        redactedPayload: { obligationId: paymentObligationId },
        signatureValid: true,
        applicationOutcome: 'APPLIED',
        receivedAt: new Date(),
      };
    }

    const runA = a.inTransaction(() =>
      a
        .get<PaymentObligationRepository>(PAYMENT_OBLIGATION_REPOSITORY)
        .recordProviderEvent(eventFor(obligationId)),
    );
    const runB = b.inTransaction(() =>
      b
        .get<PaymentObligationRepository>(PAYMENT_OBLIGATION_REPOSITORY)
        .recordProviderEvent(eventFor(obligationId)),
    );

    const [resultA, resultB] = await Promise.all([runA, runB]);
    const outcomes = [resultA.outcome, resultB.outcome];

    // Exactly one of the two calls actually inserted the row; the other
    // replayed. Neither call is allowed to error — a duplicate callback is
    // success, not failure (GRD-012).
    expect(outcomes.filter((o) => o === 'recorded')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'replay')).toHaveLength(1);

    const rowCount = await countRows(
      sql`select count(*)::text as count from payment_provider_events where provider_event_ref = ${providerEventRef}`,
    );
    expect(rowCount).toBe(1);
  });

  it('flakiness gate: repeats the concurrent-callback race 5 more times, always exactly one insert', async () => {
    for (let i = 0; i < 5; i += 1) {
      const a = await context.spawnActor(`A${i}`);
      const b = await context.spawnActor(`B${i}`);
      const providerEventRef = `evt-repeat-${i}-${newId()}`;

      const event: RecordProviderEventInput = {
        providerKey: 'MOCK_PROVIDER',
        providerEventRef,
        eventKind: 'SUCCESS',
        amount: '765000.00',
        redactedPayload: {},
        signatureValid: true,
        applicationOutcome: 'APPLIED',
        receivedAt: new Date(),
      };

      const [resultA, resultB] = await Promise.all([
        a.inTransaction(() =>
          a
            .get<PaymentObligationRepository>(PAYMENT_OBLIGATION_REPOSITORY)
            .recordProviderEvent(event),
        ),
        b.inTransaction(() =>
          b
            .get<PaymentObligationRepository>(PAYMENT_OBLIGATION_REPOSITORY)
            .recordProviderEvent(event),
        ),
      ]);

      expect([resultA.outcome, resultB.outcome].filter((o) => o === 'recorded')).toHaveLength(1);

      const rowCount = await countRows(
        sql`select count(*)::text as count from payment_provider_events where provider_event_ref = ${providerEventRef}`,
      );
      expect(rowCount).toBe(1);
    }
  });
});
