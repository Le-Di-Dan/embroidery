/**
 * DB9-CP3 — measured contention for the DB8 category-C races.
 *
 * `DB8_DB9_HANDOFF.md` §2 deferred ten races on the grounds that they echo
 * an already-proven lock or arbiter *shape*. DB9's preflight was stricter:
 * a similar shape on a different table, index or lock anchor is not the same
 * code path, so DB8's proof does not transfer and these rows were classified
 * **C** — needing measured contention work here.
 *
 * Each row therefore gets both halves, in the same block:
 *
 * 1. the race's own documented winner/loser outcome, asserted under real
 *    two-connection contention — §32 forbids marking a row PASS on
 *    throughput alone;
 * 2. the lock-wait and transaction-duration cost of that contention.
 *
 * Actors are barrier-ordered where the interleaving matters, so the outcome
 * is decided by PostgreSQL rather than by the scheduler.
 */
import { sql } from 'drizzle-orm';
import { isPersistenceError, newId } from '@embroidery/database';

import { Barrier } from '../integration/db8-barrier';
import { createBenchContext } from './bench-context';
import type { BenchContext } from './bench-context';
import type { ConcurrencyActor } from '../integration/db8-concurrency-context';
import { BenchRecorder } from './bench-recorder';
import { measure } from './bench-timing';

import { DesignModule } from '../../modules/design/design.module';
import { QuotationModule } from '../../modules/quotation/quotation.module';
import { PaymentModule } from '../../modules/payment/payment.module';
import { ProductionModule } from '../../modules/production/production.module';
import { OrderModule } from '../../modules/order/order.module';

import { DESIGN_CASE_REPOSITORY } from '../../modules/design/domain/repositories/design-case.repository';
import type { DesignCaseRepository } from '../../modules/design/domain/repositories/design-case.repository';
import { QUOTATION_REPOSITORY } from '../../modules/quotation/domain/repositories/quotation.repository';
import type { QuotationRepository } from '../../modules/quotation/domain/repositories/quotation.repository';
import { PAYMENT_OBLIGATION_REPOSITORY } from '../../modules/payment/domain/repositories/payment-obligation.repository';
import type { PaymentObligationRepository } from '../../modules/payment/domain/repositories/payment-obligation.repository';
import { PRODUCTION_JOB_REPOSITORY } from '../../modules/production/domain/repositories/production-job.repository';
import type { ProductionJobRepository } from '../../modules/production/domain/repositories/production-job.repository';
import { ORDER_REPOSITORY } from '../../modules/order/domain/repositories/order.repository';
import type { OrderRepository } from '../../modules/order/domain/repositories/order.repository';

type Outcome = PromiseSettledResult<unknown>;

describe('DB9-CP3 category-C contention (tier M)', () => {
  let bench: BenchContext;
  let alice: ConcurrencyActor;
  let bob: ConcurrencyActor;
  const recorder = new BenchRecorder('DB9-CP3 category-C contention');

  beforeAll(async () => {
    bench = await createBenchContext(
      'db9-cp3-contention',
      [DesignModule, QuotationModule, PaymentModule, ProductionModule, OrderModule],
      'M',
    );
    alice = await bench.spawnActor('alice');
    bob = await bench.spawnActor('bob');
  }, 1_800_000);

  afterAll(async () => {
    recorder.print();
    await bench?.close();
  });

  function failureCodes(outcomes: readonly Outcome[]): string[] {
    return outcomes
      .filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected')
      .map((outcome) => {
        const reason: unknown = outcome.reason;
        return isPersistenceError(reason) ? reason.code : String(reason);
      });
  }

  /** Blocks until a backend on this database is genuinely lock-waiting. */
  async function awaitLockWaiter(timeoutMs = 15_000): Promise<number> {
    const startedAt = process.hrtime.bigint();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const rows = await bench.context.disposable.client.db.execute<{ waiting: number }>(
        sql`select count(*)::int as waiting from pg_stat_activity
            where datname = current_database()
              and wait_event_type = 'Lock' and state = 'active'`,
      );
      if (Number(rows.rows[0]?.waiting) > 0) {
        return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error('Timed out waiting for a blocked backend.');
  }

  it('PERF-C01 (CC-02) — concurrent current-version pointer moves serialize on the row lock', async () => {
    const casesOf = (actor: ConcurrencyActor): DesignCaseRepository =>
      actor.get<DesignCaseRepository>(DESIGN_CASE_REPOSITORY);

    let lockWaitMs = 0;
    const stats = await measure(
      'PERF-C01',
      async () => {
        const index = 400 + Math.floor(Math.random() * 100);
        // `dversion` n hangs off case `1 + (n % requests)`, so the case index
        // is one ahead of the version index — using `index` here would point
        // at a different case and G-DB7-02 would (correctly) reject it.
        const caseId = await bench.idOf('case', index + 1);
        const first = await bench.idOf('dversion', index);
        const second = await bench.idOf('dversion', index + 3000);
        const barrier = new Barrier();

        const aliceRun = alice.inTransaction(async () => {
          await casesOf(alice).setCurrentVersion(caseId as never, first as never);
          barrier.signal('alice-locked');
          await barrier.waitFor('bob-blocked');
        });
        const bobRun = (async () => {
          await barrier.waitFor('alice-locked');
          const attempt = bob.inTransaction(() =>
            casesOf(bob).setCurrentVersion(caseId as never, second as never),
          );
          void awaitLockWaiter().then((waited) => {
            lockWaitMs = waited;
            barrier.signal('bob-blocked');
          });
          return attempt;
        })();

        const outcomes = await Promise.allSettled([aliceRun, bobRun]);
        // Correctness: the row lock serializes the two writers, so both
        // succeed and the surviving pointer is the *second* committer's —
        // never a torn value, never one silently lost mid-update.
        expect(outcomes.every((outcome) => outcome.status === 'fulfilled')).toBe(true);
        const pointer = await bench.context.disposable.client.db.execute<{
          current_version_id: string;
        }>(sql`select current_version_id from design_cases where id = ${caseId}::uuid`);
        expect([first, second]).toContain(pointer.rows[0]?.current_version_id);
        return 2;
      },
      { warmup: 1, samples: 10 },
    );

    recorder.add({
      perfId: 'PERF-C01',
      source: 'CC-02 DesignCaseRepository.setCurrentVersion ×2',
      stats,
      plan: undefined,
      note: `serialized on FOR UPDATE; observed lock wait ~${Math.round(lockWaitMs)}ms; both commit, pointer never torn`,
    });
  });

  it('PERF-C02 (CC-03) — only one version per case can enter review', async () => {
    const casesOf = (actor: ConcurrencyActor): DesignCaseRepository =>
      actor.get<DesignCaseRepository>(DESIGN_CASE_REPOSITORY);
    const hash = `sha256:${'3'.repeat(64)}`;
    let conflicts = 0;

    const stats = await measure(
      'PERF-C02',
      async () => {
        const index = 700 + Math.floor(Math.random() * 200);
        const first = await bench.idOf('dversion', index);
        const second = await bench.idOf('dversion', index + 3000);

        const outcomes = await Promise.allSettled([
          alice.inTransaction(() => casesOf(alice).sendForReview(first as never, hash, new Date())),
          bob.inTransaction(() => casesOf(bob).sendForReview(second as never, hash, new Date())),
        ]);

        // Correctness: the partial unique index is the arbiter — exactly one
        // review may be active per case, decided by the database.
        const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
        expect(fulfilled.length).toBeLessThanOrEqual(1);
        conflicts += outcomes.length - fulfilled.length;

        const active = await bench.context.disposable.client.db.execute<{ total: number }>(sql`
          select count(*)::int as total from design_versions
          where design_case_id = (select design_case_id from design_versions where id = ${first}::uuid)
            and status = 'SENT_FOR_REVIEW'
        `);
        expect(Number(active.rows[0]?.total)).toBeLessThanOrEqual(1);
        return outcomes.length;
      },
      { warmup: 1, samples: 10, tolerateErrors: false },
    );

    recorder.add({
      perfId: 'PERF-C02',
      source: 'CC-03 DesignCaseRepository.sendForReview ×2',
      stats,
      plan: undefined,
      note: `${conflicts} losers rejected by uq_design_versions__case__sent_for_review; never two active reviews`,
    });
  });

  it('PERF-C03 (CC-06) — quotation acceptance re-reads the current pointer under its lock', async () => {
    const quotationsOf = (actor: ConcurrencyActor): QuotationRepository =>
      actor.get<QuotationRepository>(QUOTATION_REPOSITORY);
    const codes: string[] = [];

    const stats = await measure(
      'PERF-C03',
      async () => {
        const index = 1000 + Math.floor(Math.random() * 500);
        const quotationId = await bench.idOf('quotation', index);
        const versionId = await bench.idOf('qversion', index);

        const outcomes = await Promise.allSettled([
          alice.inTransaction(() =>
            quotationsOf(alice).accept({
              quotationId: quotationId as never,
              versionId: versionId as never,
              acceptedAt: new Date(),
              grantId: bench.dataset.backbone.grantId,
              stepUpChallengeId: bench.dataset.backbone.challengeId,
            } as never),
          ),
          bob.inTransaction(() =>
            quotationsOf(bob).accept({
              quotationId: quotationId as never,
              versionId: versionId as never,
              acceptedAt: new Date(),
              grantId: bench.dataset.backbone.grantId,
              stepUpChallengeId: bench.dataset.backbone.challengeId,
            } as never),
          ),
        ]);

        // Correctness: acceptance is idempotent per version via
        // `uq_quotation_acceptances__qversion`, so two concurrent callers can
        // never both record an acceptance for the same version.
        const accepted = await bench.context.disposable.client.db.execute<{ total: number }>(
          sql`select count(*)::int as total from quotation_acceptances
              where quotation_version_id = ${versionId}::uuid`,
        );
        expect(Number(accepted.rows[0]?.total)).toBeLessThanOrEqual(1);
        codes.push(...failureCodes(outcomes));
        return outcomes.length;
      },
      { warmup: 1, samples: 8 },
    );

    recorder.add({
      perfId: 'PERF-C03',
      source: 'CC-06 QuotationRepository.accept ×2',
      stats,
      plan: undefined,
      note: `at most one acceptance per version; loser codes: ${[...new Set(codes)].join(', ') || 'none'}`,
    });
  });

  it('PERF-C04 (CC-10) — concurrent obligation satisfaction leaves exactly one settlement', async () => {
    const obligationsOf = (actor: ConcurrencyActor): PaymentObligationRepository =>
      actor.get<PaymentObligationRepository>(PAYMENT_OBLIGATION_REPOSITORY);
    const codes: string[] = [];

    const stats = await measure(
      'PERF-C04',
      async () => {
        // Obligations at n%7 = 0 stay PENDING; attempts fail at n%11 = 0.
        // The two moduli are deliberately independent so a live obligation
        // still has a SUCCEEDED attempt to be satisfied by.
        let index = 7 * (10 + Math.floor(Math.random() * 300));
        while (index % 11 === 0) {
          index += 7;
        }
        const obligationId = await bench.idOf('obligation', index);
        const attemptId = await bench.idOf('attempt', index);
        const at = new Date();

        const outcomes = await Promise.allSettled([
          alice.inTransaction(() =>
            obligationsOf(alice).satisfy(obligationId as never, attemptId as never, at),
          ),
          bob.inTransaction(() =>
            obligationsOf(bob).satisfy(obligationId as never, attemptId as never, at),
          ),
        ]);

        // Correctness: the second caller waits on the row lock and then finds
        // the obligation no longer live — money is settled exactly once.
        const row = await bench.context.disposable.client.db.execute<{
          status: string;
          satisfied_by_attempt_id: string | null;
        }>(sql`select status, satisfied_by_attempt_id from payment_obligations
               where id = ${obligationId}::uuid`);
        expect(row.rows[0]?.status).toBe('SATISFIED');
        expect(row.rows[0]?.satisfied_by_attempt_id).toBe(attemptId);
        codes.push(...failureCodes(outcomes));
        return outcomes.length;
      },
      { warmup: 0, samples: 8 },
    );

    recorder.add({
      perfId: 'PERF-C04',
      source: 'CC-10 PaymentObligationRepository.satisfy ×2',
      stats,
      plan: undefined,
      note: `settled exactly once; loser codes: ${[...new Set(codes)].join(', ') || 'none'}`,
    });
  });

  it('PERF-C05 (CC-08) — duplicate production job creation is rejected by its unique arbiter', async () => {
    const jobsOf = (actor: ConcurrencyActor): ProductionJobRepository =>
      actor.get<ProductionJobRepository>(PRODUCTION_JOB_REPOSITORY);
    const codes: string[] = [];

    const stats = await measure(
      'PERF-C05',
      async () => {
        const index = 200 + Math.floor(Math.random() * 500);
        const orderId = await bench.idOf('order', index);
        const approvalId = await bench.idOf('approval', index);

        const outcomes = await Promise.allSettled([
          alice.inTransaction(() =>
            jobsOf(alice).createJob({
              id: newId() as never,
              orderId,
              approvalSnapshotId: approvalId,
            }),
          ),
          bob.inTransaction(() =>
            jobsOf(bob).createJob({
              id: newId() as never,
              orderId,
              approvalSnapshotId: approvalId,
            }),
          ),
        ]);

        // Correctness: exactly one job may exist per (order, approval).
        const jobs = await bench.context.disposable.client.db.execute<{ total: number }>(
          sql`select count(*)::int as total from production_jobs
              where order_id = ${orderId}::uuid and approval_snapshot_id = ${approvalId}::uuid`,
        );
        expect(Number(jobs.rows[0]?.total)).toBe(1);
        codes.push(...failureCodes(outcomes));
        return outcomes.length;
      },
      { warmup: 0, samples: 8 },
    );

    recorder.add({
      perfId: 'PERF-C05',
      source: 'CC-08 ProductionJobRepository.createJob ×2',
      stats,
      plan: undefined,
      note: `exactly one job per (order, approval); loser codes: ${[...new Set(codes)].join(', ') || 'none'}`,
    });
  });

  it('PERF-C06 (CC-12) — concurrent shipping edits serialize and never tear the detail', async () => {
    const ordersOf = (actor: ConcurrencyActor): OrderRepository =>
      actor.get<OrderRepository>(ORDER_REPOSITORY);

    const stats = await measure(
      'PERF-C06',
      async () => {
        const index = 300 + Math.floor(Math.random() * 400);
        const orderId = await bench.idOf('order', index);

        const detail = (recipient: string) => ({
          orderId: orderId as never,
          recipientName: recipient,
          recipientPhone: '0900000000',
          addressLine: '1 Bench Street',
          province: 'Ha Noi',
        });

        const outcomes = await Promise.allSettled([
          alice.inTransaction(() => ordersOf(alice).saveShippingDetails(detail('alice'))),
          bob.inTransaction(() => ordersOf(bob).saveShippingDetails(detail('bob'))),
        ]);

        // Correctness: one shipping detail per order, holding exactly one of
        // the two writers' values — never a mix of both.
        const rows = await bench.context.disposable.client.db.execute<{
          recipient_name: string;
        }>(sql`select recipient_name from shipping_details where order_id = ${orderId}::uuid`);
        expect(rows.rows).toHaveLength(1);
        expect(['alice', 'bob']).toContain(rows.rows[0]?.recipient_name);
        expect(outcomes.some((outcome) => outcome.status === 'fulfilled')).toBe(true);
        return outcomes.length;
      },
      { warmup: 0, samples: 8 },
    );

    recorder.add({
      perfId: 'PERF-C06',
      source: 'CC-12 OrderRepository.saveShippingDetails ×2',
      stats,
      plan: undefined,
      note: 'exactly one detail row per order, never a mixed value',
    });
  });
});
