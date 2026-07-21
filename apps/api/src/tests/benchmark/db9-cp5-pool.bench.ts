/**
 * DB9-CP5 — pool sizing, timeout behaviour and mixed workload.
 *
 * Pool size is swept as a *range* rather than searched for one magic number
 * (§37): the useful output of this checkpoint is the shape of the curve and
 * where it stops improving, both of which are hardware-dependent and are
 * labelled as such. No production default is changed here — CP6 owns that
 * decision, and only with the evidence this checkpoint produces.
 */
import { sql } from 'drizzle-orm';
import { DATABASE_CONNECTION, DatabaseExecutor } from '@embroidery/persistence';
import type { DatabaseConnection } from '@embroidery/persistence';
import { isPersistenceError, withMappedErrors } from '@embroidery/database';

import { createBenchContext } from './bench-context';
import type { BenchContext } from './bench-context';
import type { ConcurrencyActor } from '../integration/db8-concurrency-context';
import { BenchRecorder } from './bench-recorder';
import { measure } from './bench-timing';

import { CatalogModule } from '../../modules/catalog/catalog.module';
import { OrderModule } from '../../modules/order/order.module';
import { AuditModule } from '../../modules/audit/audit.module';

const POOL_SIZES = [2, 5, 10, 20] as const;
/** Concurrent in-flight operations driven against each pool size. */
const OFFERED_LOAD = 24;

describe('DB9-CP5 pool and mixed workload (tier M)', () => {
  let bench: BenchContext;
  const recorder = new BenchRecorder('DB9-CP5 pool and mixed workload');

  beforeAll(async () => {
    bench = await createBenchContext(
      'db9-cp5-pool',
      [CatalogModule, OrderModule, AuditModule],
      'M',
    );
  }, 1_800_000);

  afterAll(async () => {
    recorder.print();
    await bench?.close();
  });

  async function readOnce(actor: ConcurrencyActor): Promise<number> {
    const executor = actor.get<DatabaseExecutor>(DatabaseExecutor);
    return actor.inTransaction(async () => {
      const rows = await executor
        .current()
        .execute<{ total: number }>(
          sql`select count(*)::int as total from products where status = 'PUBLISHED'`,
        );
      // Correctness holds at every pool size — a starved pool must return
      // late, never wrong.
      expect(Number(rows.rows[0]?.total)).toBeGreaterThan(0);
      return 1;
    });
  }

  it('PERF-P01 — pool size sweep: throughput improves then flattens', async () => {
    for (const poolMax of POOL_SIZES) {
      const actor = await bench.spawnActor(`pool-${poolMax}`, {
        DATABASE_POOL_MAX: String(poolMax),
      });
      const connection = actor.get<DatabaseConnection>(DATABASE_CONNECTION);

      let peakWaiting = 0;
      const stats = await measure(
        `PERF-P01-p${poolMax}`,
        async () => {
          const inFlight = Array.from({ length: OFFERED_LOAD }, () => readOnce(actor));
          // Sampled while the load is genuinely in flight; sampling after
          // `await` would always read an idle pool and report zero.
          peakWaiting = Math.max(peakWaiting, connection.poolStats.waiting);
          await Promise.all(inFlight);
          return OFFERED_LOAD;
        },
        { warmup: 2, samples: 12 },
      );

      const opsPerSecond = Math.round((OFFERED_LOAD / stats.medianMs) * 1000);
      recorder.add({
        perfId: `PERF-P01-p${poolMax}`,
        source: `pool max ${poolMax}, ${OFFERED_LOAD} concurrent reads`,
        stats,
        plan: undefined,
        note: `~${opsPerSecond} ops/s, peak waiting ${peakWaiting}, pool max reported ${connection.poolStats.max}`,
      });

      expect(connection.poolStats.max).toBe(poolMax);
      await actor.close();
    }
  });

  it('PERF-P04 — statement timeout cancels cleanly and maps to a typed error', async () => {
    const actor = await bench.spawnActor('timeout', {
      DATABASE_POOL_MAX: '4',
      DATABASE_STATEMENT_TIMEOUT_MS: '150',
    });
    const executor = actor.get<DatabaseExecutor>(DatabaseExecutor);
    const connection = actor.get<DatabaseConnection>(DATABASE_CONNECTION);

    let timeouts = 0;
    let leakedSecret = false;

    const stats = await measure(
      'PERF-P04',
      async () => {
        try {
          await actor.inTransaction(async () => {
            await withMappedErrors('db9-cp5.slowStatement', async () => {
              await executor.current().execute(sql`select pg_sleep(2)`);
            });
          });
        } catch (error: unknown) {
          expect(isPersistenceError(error)).toBe(true);
          if (isPersistenceError(error)) {
            // §38: mapped, and carrying nothing a log must not see. The
            // connection string and password must never appear in the
            // message a caller can serialise.
            leakedSecret ||= /password|postgres:\/\//i.test(JSON.stringify(error));
          }
          timeouts += 1;
          return 1;
        }
        throw new Error('The statement timeout did not fire.');
      },
      { warmup: 1, samples: 6 },
    );

    expect(timeouts).toBeGreaterThan(0);
    expect(leakedSecret).toBe(false);

    // The decisive part: a cancelled statement must return its connection.
    // A pool that leaked one connection per timeout would be exhausted after
    // a handful of slow queries, which is how a timeout turns into an outage.
    const after = connection.poolStats;
    expect(after.waiting).toBe(0);
    await readOnce(actor);

    recorder.add({
      perfId: 'PERF-P04',
      source: 'statement_timeout = 150ms vs a 2s statement',
      stats,
      plan: undefined,
      note: `${timeouts} timeouts, all mapped, no secret in the error, pool usable afterwards (total ${after.total}, idle ${after.idle})`,
    });
    await actor.close();
  });

  it('PERF-P05 — mixed workload degrades gracefully rather than starving', async () => {
    // Three profiles sharing one database, as API and worker processes would.
    const reader = await bench.spawnActor('mixed-reader', { DATABASE_POOL_MAX: '10' });
    const writer = await bench.spawnActor('mixed-writer', { DATABASE_POOL_MAX: '5' });
    const worker = await bench.spawnActor('mixed-worker', { DATABASE_POOL_MAX: '5' });

    const writerExecutor = writer.get<DatabaseExecutor>(DatabaseExecutor);
    const workerExecutor = worker.get<DatabaseExecutor>(DatabaseExecutor);
    const orderId = await bench.idOf('order', 21);

    // Isolated baseline first, so the mixed number has something to mean.
    const isolated = await measure('PERF-P05-isolated', () => readOnce(reader), {
      warmup: 3,
      samples: 25,
    });

    let writes = 0;
    let claims = 0;
    let running = true;

    const writeLoop = (async () => {
      while (running) {
        await writer.inTransaction(async () => {
          await writerExecutor.current().execute(sql`
            insert into audit_events
              (occurred_at, actor_kind, admin_id, action, target_kind, target_id, correlation_id)
            values (now(), 'ADMIN', ${bench.dataset.backbone.adminId}::uuid, 'bench.mixed',
                    'ORDER', ${orderId}, 'bench-mixed')
          `);
        });
        writes += 1;
      }
    })();

    const workerLoop = (async () => {
      while (running) {
        await worker.inTransaction(async () => {
          await workerExecutor.current().execute(sql`
            select id from outbox_events where status = 'PENDING'
            order by id for update skip locked limit 25
          `);
        });
        claims += 1;
      }
    })();

    const underLoad = await measure('PERF-P05-mixed', () => readOnce(reader), {
      warmup: 3,
      samples: 25,
    });

    running = false;
    await Promise.all([writeLoop, workerLoop]);

    const degradation =
      Math.round((underLoad.medianMs / Math.max(isolated.medianMs, 0.001)) * 100) / 100;

    recorder.add({
      perfId: 'PERF-P05-isolated',
      source: 'storefront read, no competing load',
      stats: isolated,
      plan: undefined,
      note: 'baseline for the mixed comparison',
    });
    recorder.add({
      perfId: 'PERF-P05-mixed',
      source: 'storefront read + audit writes + worker claims',
      stats: underLoad,
      plan: undefined,
      note: `${degradation}x the isolated median; ${writes} writes and ${claims} claim rounds completed alongside`,
    });

    // Both competing profiles must make real progress — a reader that stays
    // fast because nothing else got scheduled is not a mixed-workload result.
    expect(writes).toBeGreaterThan(10);
    expect(claims).toBeGreaterThan(10);
    // Degradation is expected; starvation is not.
    expect(degradation).toBeLessThan(10);

    await Promise.all([reader.close(), writer.close(), worker.close()]);
  });
});
