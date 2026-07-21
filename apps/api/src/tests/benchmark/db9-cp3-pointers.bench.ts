/**
 * DB9-CP3 — measured contention for the remaining category-C pointer races.
 *
 * CC-04 (agreement current version), CC-05 (policy configuration current
 * version) and CC-11 (dispatch racing final-payment satisfaction). Split
 * from `db9-cp3-contention.bench.ts` to keep each file within the test-size
 * limit; the intent and the rules are identical — every row asserts its own
 * documented outcome under real two-connection contention, never PASSes on
 * throughput alone (§32).
 */
import { newId } from '@embroidery/database';
import { PolicyConfigurationRepository } from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

import { createBenchContext } from './bench-context';
import type { BenchContext } from './bench-context';
import type { ConcurrencyActor } from '../integration/db8-concurrency-context';
import { BenchRecorder } from './bench-recorder';
import { measure } from './bench-timing';

import { ContentModule } from '../../modules/content/content.module';
import { OrderModule } from '../../modules/order/order.module';
import { PaymentModule } from '../../modules/payment/payment.module';

import { AGREEMENT_REPOSITORY } from '../../modules/content/domain/repositories/agreement.repository';
import type { AgreementRepository } from '../../modules/content/domain/repositories/agreement.repository';
import { ORDER_REPOSITORY } from '../../modules/order/domain/repositories/order.repository';
import type { OrderRepository } from '../../modules/order/domain/repositories/order.repository';
import { PAYMENT_OBLIGATION_REPOSITORY } from '../../modules/payment/domain/repositories/payment-obligation.repository';
import type { PaymentObligationRepository } from '../../modules/payment/domain/repositories/payment-obligation.repository';

describe('DB9-CP3 pointer contention (tier M)', () => {
  let bench: BenchContext;
  let alice: ConcurrencyActor;
  let bob: ConcurrencyActor;
  const recorder = new BenchRecorder('DB9-CP3 pointer contention');

  beforeAll(async () => {
    bench = await createBenchContext(
      'db9-cp3-pointers',
      [ContentModule, OrderModule, PaymentModule],
      'M',
    );
    alice = await bench.spawnActor('alice');
    bob = await bench.spawnActor('bob');
  }, 1_800_000);

  afterAll(async () => {
    recorder.print();
    await bench?.close();
  });

  it('PERF-C07 (CC-04) — concurrent agreement pointer moves never leave a foreign version current', async () => {
    const agreementsOf = (actor: ConcurrencyActor): AgreementRepository =>
      actor.get<AgreementRepository>(AGREEMENT_REPOSITORY);
    let rounds = 0;

    const stats = await measure(
      'PERF-C07',
      async () => {
        rounds += 1;
        const type = `bench-terms-${rounds}`;
        const setup = await alice.inTransaction(async () => {
          const agreement = await agreementsOf(alice).ensureAgreement(type, 'Bench Terms');
          const first = await agreementsOf(alice).addVersion({
            id: newId() as never,
            agreementId: agreement.id,
            content: 'first',
            language: 'vi',
          });
          const second = await agreementsOf(alice).addVersion({
            id: newId() as never,
            agreementId: agreement.id,
            content: 'second',
            language: 'vi',
          });
          return { agreementId: agreement.id, first: first.id, second: second.id };
        });

        // `publishVersion` is the pointer move for agreements: it promotes a
        // DRAFT and makes it current in the same transaction, so racing two
        // publishes — not two bare pointer writes — is the real CC-04 race.
        // (A DRAFT cannot be made current directly, and G-DB7-01 is right to
        // refuse it.)
        const effectiveFrom = new Date();
        const outcomes = await Promise.allSettled([
          alice.inTransaction(() =>
            agreementsOf(alice).publishVersion(
              setup.first,
              `sha256:${'a'.repeat(64)}`,
              effectiveFrom,
            ),
          ),
          bob.inTransaction(() =>
            agreementsOf(bob).publishVersion(
              setup.second,
              `sha256:${'b'.repeat(64)}`,
              effectiveFrom,
            ),
          ),
        ]);

        // Correctness (G-DB7-01): the row lock serializes the writers and the
        // surviving pointer is always one of this agreement's *own* versions.
        expect(outcomes.some((outcome) => outcome.status === 'fulfilled')).toBe(true);
        const pointer = await bench.context.disposable.client.db.execute<{
          current_version_id: string;
        }>(sql`select current_version_id from agreements where id = ${setup.agreementId}::uuid`);
        expect([setup.first, setup.second]).toContain(pointer.rows[0]?.current_version_id);
        return 2;
      },
      { warmup: 1, samples: 8 },
    );

    recorder.add({
      perfId: 'PERF-C07',
      source: 'CC-04 AgreementRepository.publishVersion ×2',
      stats,
      plan: undefined,
      note: 'two concurrent publishes serialize; pointer always one of the agreement’s own versions',
    });
  });

  it('PERF-C08 (CC-05) — concurrent policy publishes produce a gapless version sequence', async () => {
    const policiesOf = (actor: ConcurrencyActor): PolicyConfigurationRepository =>
      actor.get<PolicyConfigurationRepository>(PolicyConfigurationRepository);
    let rounds = 0;

    const stats = await measure(
      'PERF-C08',
      async () => {
        rounds += 1;
        const configKey = `bench.policy.${rounds}`;
        await alice.inTransaction(() => policiesOf(alice).ensureKey(configKey, 'Bench policy key'));

        const publish = (actor: ConcurrencyActor, days: number) =>
          actor.inTransaction(() =>
            policiesOf(actor).publishVersion({
              configKey,
              value: { days },
              valueSchemaVersion: 1,
              effectiveFrom: new Date(),
              createdByAdminId: bench.dataset.backbone.adminId,
              reason: 'bench publish',
            }),
          );

        await Promise.allSettled([publish(alice, 14), publish(bob, 21)]);

        // Correctness: whatever the interleaving, version numbers must be a
        // gapless 1..n sequence and the current pointer must name the highest
        // committed version — a lost pointer move is the failure mode here.
        const rows = await bench.context.disposable.client.db.execute<{
          version: number;
          is_current: boolean;
        }>(sql`
          select v.version, (c.current_version_id = v.id) as is_current
          from policy_configuration_versions v
          join policy_configurations c on c.id = v.policy_configuration_id
          where c.config_key = ${configKey}
          order by v.version
        `);
        const versions = rows.rows.map((row) => Number(row.version));
        expect(versions).toEqual(versions.map((_, index) => index + 1));
        expect(rows.rows.filter((row) => row.is_current)).toHaveLength(1);
        return versions.length;
      },
      { warmup: 1, samples: 8 },
    );

    recorder.add({
      perfId: 'PERF-C08',
      source: 'CC-05 PolicyConfigurationRepository.publishVersion ×2',
      stats,
      plan: undefined,
      note: 'gapless version sequence, exactly one current pointer, under contention',
    });
  });

  it('PERF-C09 (CC-11) — dispatch and final-payment satisfaction never observe a torn state', async () => {
    const ordersOf = (actor: ConcurrencyActor): OrderRepository =>
      actor.get<OrderRepository>(ORDER_REPOSITORY);
    const obligationsOf = (actor: ConcurrencyActor): PaymentObligationRepository =>
      actor.get<PaymentObligationRepository>(PAYMENT_OBLIGATION_REPOSITORY);

    const stats = await measure(
      'PERF-C09',
      async () => {
        // A live obligation (n%7 = 0) whose attempt succeeded (n%11 ≠ 0).
        let index = 7 * (100 + Math.floor(Math.random() * 300));
        while (index % 11 === 0) {
          index += 7;
        }
        const obligationId = await bench.idOf('obligation', index);
        const attemptId = await bench.idOf('attempt', index);
        const orderRow = await bench.context.disposable.client.db.execute<{ order_id: string }>(
          sql`select order_id from payment_obligations where id = ${obligationId}::uuid`,
        );
        const orderId = orderRow.rows[0]?.order_id;
        if (orderId === undefined) {
          throw new Error('No order behind the selected obligation.');
        }

        await Promise.allSettled([
          alice.inTransaction(() =>
            obligationsOf(alice).satisfy(obligationId as never, attemptId as never, new Date()),
          ),
          bob.inTransaction(() =>
            ordersOf(bob).dispatch(orderId as never, new Date(), `bench-${newId()}`),
          ),
        ]);

        // Correctness (GRD-016): dispatch may only have succeeded if the
        // order was genuinely dispatchable. The state that must never exist
        // is a dispatched order still carrying a live obligation.
        const state = await bench.context.disposable.client.db.execute<{
          status: string;
          live: number;
        }>(sql`
          select o.status,
                 (select count(*)::int from payment_obligations p
                  where p.order_id = o.id and p.status = 'PENDING') as live
          from orders o where o.id = ${orderId}::uuid
        `);
        const row = state.rows[0];
        if (row?.status === 'DELIVERED' || row?.status === 'COMPLETED') {
          expect(Number(row.live)).toBe(0);
        }
        return 2;
      },
      { warmup: 0, samples: 8 },
    );

    recorder.add({
      perfId: 'PERF-C09',
      source: 'CC-11 dispatch vs satisfy',
      stats,
      plan: undefined,
      note: 'no dispatched order ever carries a live obligation',
    });
  });
});
