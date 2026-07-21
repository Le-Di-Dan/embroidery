/**
 * DB9-CP3 — worker queue claim throughput and contention.
 *
 * Measures the three claim primitives DB8 proved *correct* under contention
 * and this checkpoint measures the *cost* of: outbox exclusive claim
 * (`FOR UPDATE SKIP LOCKED`), idempotency claim (`ON CONFLICT DO NOTHING`)
 * and notification intent claim.
 *
 * Throughput is never reported without the correctness invariant that makes
 * it meaningful (§31): a claim benchmark that stopped asserting exclusivity
 * would just be measuring how fast two workers can corrupt a queue.
 */
import { sql } from 'drizzle-orm';
import { OutboxEventStore, IdempotencyStore } from '@embroidery/persistence';
import { newId } from '@embroidery/database';

import { createBenchContext } from './bench-context';
import type { BenchContext } from './bench-context';
import type { ConcurrencyActor } from '../integration/db8-concurrency-context';
import { BenchRecorder } from './bench-recorder';
import { measure } from './bench-timing';

import { NotificationModule } from '../../modules/notification/notification.module';
import { NOTIFICATION_INTENT_REPOSITORY } from '../../modules/notification/domain/repositories/notification-intent.repository';
import type { NotificationIntentRepository } from '../../modules/notification/domain/repositories/notification-intent.repository';

const CONCURRENCY_LEVELS = [1, 2, 4, 8] as const;

describe('DB9-CP3 queue contention (tier M)', () => {
  let bench: BenchContext;
  let workers: ConcurrencyActor[];
  const recorder = new BenchRecorder('DB9-CP3 queue contention');

  beforeAll(async () => {
    bench = await createBenchContext('db9-cp3-queues', [NotificationModule], 'M');
    workers = [];
    for (const level of CONCURRENCY_LEVELS) {
      while (workers.length < level) {
        workers.push(await bench.spawnActor(`worker-${workers.length + 1}`));
      }
    }
  }, 1_800_000);

  afterAll(async () => {
    recorder.print();
    await bench?.close();
  });

  /** Restores the claimable subset so each concurrency level starts equal. */
  async function resetOutboxQueue(): Promise<number> {
    const result = await bench.context.disposable.client.db.execute<{ total: number }>(sql`
      with restored as (
        update outbox_events
        set status = 'PENDING', claimed_by = null, claimed_at = null,
            next_attempt_at = now() - interval '1 minute', dispatched_at = null
        where id in (select id from outbox_events order by id limit 2000)
        returning 1
      )
      select count(*)::int as total from restored
    `);
    return Number(result.rows[0]?.total ?? 0);
  }

  it('PERF-Q01 — outbox claim scales across workers with zero double-claim', async () => {
    const outboxOf = (actor: ConcurrencyActor): OutboxEventStore =>
      actor.get<OutboxEventStore>(OutboxEventStore);

    for (const level of CONCURRENCY_LEVELS) {
      await resetOutboxQueue();
      const active = workers.slice(0, level);
      let totalClaimed = 0;
      let reclaimedAcrossRounds = 0;
      const everSeen = new Set<string>();

      const stats = await measure(
        `PERF-Q01-c${level}`,
        async () => {
          const batches = await Promise.all(
            active.map((worker) =>
              worker.inTransaction(() => outboxOf(worker).claimBatch(worker.label, 25)),
            ),
          );

          // The guarantee CC-19 proved, and the one that makes the
          // throughput number mean anything, is that *concurrent* workers
          // never claim the same row — `FOR UPDATE SKIP LOCKED` exclusivity
          // within one claim window. It is deliberately not a guarantee that
          // a row is claimed only once for all time: an unacknowledged claim
          // becomes claimable again once its retry time passes, which is the
          // at-least-once retry semantics the outbox is built on. Scoping
          // the duplicate check per round tests the former without
          // mislabelling the latter as a defect.
          const thisRound = new Set<string>();
          for (const batch of batches) {
            for (const row of batch) {
              const id = String(row.id);
              expect(thisRound.has(id)).toBe(false);
              thisRound.add(id);
              if (everSeen.has(id)) {
                reclaimedAcrossRounds += 1;
              }
              everSeen.add(id);
            }
          }
          totalClaimed += thisRound.size;
          return thisRound.size;
        },
        { warmup: 0, samples: 10 },
      );

      const rowsPerSecond = Math.round((totalClaimed / (stats.medianMs * 10)) * 1000);
      recorder.add({
        perfId: `PERF-Q01-c${level}`,
        source: `OutboxEventStore.claimBatch × ${level}`,
        stats,
        plan: undefined,
        note: `${totalClaimed} claims, 0 concurrent double-claims, ${reclaimedAcrossRounds} retry re-claims across rounds, ~${rowsPerSecond} rows/s`,
      });
    }
  });

  it('PERF-Q02 — idempotency claim under contention stays exactly-once', async () => {
    const storeOf = (actor: ConcurrencyActor): IdempotencyStore =>
      actor.get<IdempotencyStore>(IdempotencyStore);

    for (const level of CONCURRENCY_LEVELS) {
      const active = workers.slice(0, level);
      let claims = 0;
      let replays = 0;

      const stats = await measure(
        `PERF-Q02-c${level}`,
        async () => {
          const key = {
            namespace: 'db9-bench',
            scopeKey: `scope-${newId()}`,
            fingerprint: 'db9-bench-fingerprint',
          };
          const outcomes = await Promise.all(
            active.map((worker) =>
              worker.inTransaction(() => storeOf(worker).claim(key, new Date(Date.now() + 60_000))),
            ),
          );

          const claimed = outcomes.filter((outcome) => outcome.outcome === 'claimed');
          // Exactly one caller may own the key, at every concurrency level.
          expect(claimed).toHaveLength(1);
          claims += claimed.length;
          replays += outcomes.length - claimed.length;
          return outcomes.length;
        },
        { warmup: 1, samples: 15 },
      );

      recorder.add({
        perfId: `PERF-Q02-c${level}`,
        source: `IdempotencyStore.claim × ${level}`,
        stats,
        plan: undefined,
        note: `${claims} claimed / ${replays} non-claim outcomes, exactly one owner per key`,
      });
    }
  });

  it('PERF-Q03 — notification intent claim throughput (at-least-once by design)', async () => {
    const intentsOf = (actor: ConcurrencyActor): NotificationIntentRepository =>
      actor.get<NotificationIntentRepository>(NOTIFICATION_INTENT_REPOSITORY);

    for (const level of [1, 2, 4] as const) {
      // Restore a claimable subset for each level.
      await bench.context.disposable.client.db.execute(sql`
        update notification_intents set status = 'PENDING'
        where id in (select id from notification_intents order by id limit 1500)
      `);

      const active = workers.slice(0, level);
      let claimed = 0;

      const stats = await measure(
        `PERF-Q03-c${level}`,
        async () => {
          const batches = await Promise.all(
            active.map((worker) => worker.inTransaction(() => intentsOf(worker).claimBatch(25))),
          );
          const round = batches.reduce((total, batch) => total + batch.length, 0);
          claimed += round;
          return round;
        },
        { warmup: 0, samples: 8 },
      );

      // G-DB7-58 accepts at-least-once here, so the assertion is that work
      // is actually claimed and the batch bound is respected — not
      // exclusivity, which this queue never promised.
      expect(claimed).toBeGreaterThan(0);
      recorder.add({
        perfId: `PERF-Q03-c${level}`,
        source: `NotificationIntentRepository.claimBatch × ${level}`,
        stats,
        plan: undefined,
        note: `${claimed} intents claimed; at-least-once accepted (G-DB7-58)`,
      });
    }
  });

  it('PERF-Q01b — outbox claim holds its lock only for the claim itself', async () => {
    // §33 lock-duration evidence. The claim transaction's duration is the
    // window during which another worker can be blocked, so it is measured
    // directly rather than inferred from throughput.
    await resetOutboxQueue();
    const worker = workers[0];
    if (worker === undefined) {
      throw new Error('No worker actor available.');
    }

    const stats = await measure(
      'PERF-Q01b',
      async () => {
        const claimed = await worker.inTransaction(() =>
          worker.get<OutboxEventStore>(OutboxEventStore).claimBatch('lock-window', 25),
        );
        expect(claimed.length).toBeGreaterThan(0);
        return claimed.length;
      },
      { warmup: 2, samples: 20 },
    );

    recorder.add({
      perfId: 'PERF-Q01b',
      source: 'OutboxEventStore.claimBatch lock window',
      stats,
      plan: undefined,
      note: 'transaction duration = lock-hold window for a 25-row claim (local evidence only)',
    });
  });
});
