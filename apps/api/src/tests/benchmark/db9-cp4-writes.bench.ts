/**
 * DB9-CP4 — write cost, S24 trigger overhead and index write amplification.
 *
 * WAL and buffer accounting come from `EXPLAIN (ANALYZE, BUFFERS, WAL)`,
 * which genuinely executes the statement — so every write plan is captured
 * inside a transaction the harness rolls back, leaving the dataset intact
 * for the next measurement.
 *
 * Triggers are never disabled to make a number look better (§35). The S24
 * cost is therefore reported as a *comparison* between a protected table and
 * a structurally similar unprotected one, not as an isolated overhead
 * figure the harness cannot honestly produce.
 */
import { sql } from 'drizzle-orm';
import { DatabaseExecutor, OutboxEventStore } from '@embroidery/persistence';
import { isPersistenceError, withMappedErrors } from '@embroidery/database';

import { createBenchContext } from './bench-context';
import type { BenchContext } from './bench-context';
import type { ConcurrencyActor } from '../integration/db8-concurrency-context';
import { capturePlan } from './bench-plan';
import type { PlanSummary } from './bench-plan';
import { BenchRecorder } from './bench-recorder';
import { measure } from './bench-timing';

import { AuditModule } from '../../modules/audit/audit.module';
import { OrderModule } from '../../modules/order/order.module';

import { AUDIT_EVENT_REPOSITORY } from '../../modules/audit/domain/repositories/audit-event.repository';
import type { AuditEventRepository } from '../../modules/audit/domain/repositories/audit-event.repository';

/** High-write tables whose index count is the write-amplification budget. */
const HIGH_WRITE_TABLES = [
  'outbox_events',
  'audit_events',
  'payment_provider_events',
  'notification_delivery_attempts',
  'inventory_ledger_entries',
  'order_transitions',
] as const;

describe('DB9-CP4 write amplification (tier M)', () => {
  let bench: BenchContext;
  let actor: ConcurrencyActor;
  const recorder = new BenchRecorder('DB9-CP4 writes and triggers');

  beforeAll(async () => {
    bench = await createBenchContext('db9-cp4-writes', [AuditModule, OrderModule], 'M');
    actor = await bench.spawnActor('writer');
  }, 1_800_000);

  afterAll(async () => {
    recorder.print();
    await bench?.close();
  });

  /**
   * Captures a write plan and rolls it back.
   *
   * `EXPLAIN ANALYZE` on a write statement really performs it, so a
   * benchmark that captured write plans without rolling back would silently
   * mutate the dataset every later measurement depends on.
   */
  async function captureWritePlan(
    queryId: string,
    statement: ReturnType<typeof sql>,
  ): Promise<PlanSummary> {
    const executor = actor.get<DatabaseExecutor>(DatabaseExecutor);
    let plan: PlanSummary | undefined;
    try {
      await actor.inTransaction(async () => {
        plan = await capturePlan(executor.current(), queryId, statement);
        throw new Error('bench-rollback');
      });
    } catch (error: unknown) {
      if (!(error instanceof Error) || error.message !== 'bench-rollback') {
        throw error;
      }
    }
    if (plan === undefined) {
      throw new Error(`No plan captured for ${queryId}.`);
    }
    return plan;
  }

  it('PERF-W05 — audit append cost and WAL, through the real repository', async () => {
    const audit = actor.get<AuditEventRepository>(AUDIT_EVENT_REPOSITORY);
    const orderId = await bench.idOf('order', 11);
    let appended = 0;

    const stats = await measure(
      'PERF-W05',
      async () =>
        actor.inTransaction(async () => {
          const correlationId = `bench-append-${appended}`;
          await audit.append({
            occurredAt: new Date(),
            actor: { kind: 'ADMIN', adminId: bench.dataset.backbone.adminId },
            action: 'bench.append',
            targetKind: 'ORDER',
            targetId: orderId,
            correlationId,
          } as never);
          // Correctness: `append` returns void, so the evidence that it
          // landed is the row being readable inside the same transaction.
          const written = await audit.listByCorrelation(correlationId);
          expect(written).toHaveLength(1);
          appended += 1;
          return 1;
        }),
      { warmup: 3, samples: 30 },
    );

    const plan = await captureWritePlan(
      'PERF-W05',
      sql`insert into audit_events
            (occurred_at, actor_kind, admin_id, action, target_kind, target_id, correlation_id)
          values (now(), 'ADMIN', ${bench.dataset.backbone.adminId}::uuid, 'bench.plan',
                  'ORDER', ${orderId}, 'bench-plan')`,
    );

    recorder.add({
      perfId: 'PERF-W05',
      source: 'AuditEventRepository.append',
      stats,
      plan,
      note: `${plan.walBytes} WAL bytes per append into a 60k-row table`,
    });
    expect(plan.walBytes).toBeGreaterThan(0);
  });

  it('PERF-W06 — outbox append and claim update cost', async () => {
    const outbox = actor.get<OutboxEventStore>(OutboxEventStore);
    const orderId = await bench.idOf('order', 12);

    const stats = await measure(
      'PERF-W06',
      async () =>
        actor.inTransaction(async () => {
          await outbox.append({
            eventType: 'order.created',
            aggregateKind: 'ORDER',
            aggregateId: orderId,
            payload: { orderId },
            payloadSchemaVersion: 1,
          } as never);
          return 1;
        }),
      { warmup: 3, samples: 30 },
    );

    const plan = await captureWritePlan(
      'PERF-W06',
      sql`insert into outbox_events
            (event_type, aggregate_kind, aggregate_id, payload, payload_schema_version,
             status, attempt_count)
          values ('order.created', 'ORDER', ${orderId}, '{}'::jsonb, 1, 'PENDING', 0)`,
    );

    recorder.add({
      perfId: 'PERF-W06',
      source: 'OutboxEventStore.append',
      stats,
      plan,
      note: `${plan.walBytes} WAL bytes per outbox append`,
    });
  });

  it('PERF-T01/T02 — S24 allows the mutable update and rejects the immutable one', async () => {
    const executor = actor.get<DatabaseExecutor>(DatabaseExecutor);
    const orderId = await bench.idOf('order', 13);

    // CST-099 lists `status` among the outbox's column-scoped mutable set.
    const allowed = await measure(
      'PERF-T01',
      async () =>
        actor.inTransaction(async () => {
          await executor.current().execute(sql`
            update outbox_events set attempt_count = attempt_count
            where id = (select id from outbox_events order by id limit 1)
          `);
          return 1;
        }),
      { warmup: 3, samples: 25 },
    );
    recorder.add({
      perfId: 'PERF-T01',
      source: 'S24 allowed mutable update (outbox_events)',
      stats: allowed,
      plan: undefined,
      note: 'trigger fires and permits the write',
    });

    let rejections = 0;
    const rejected = await measure(
      'PERF-T02',
      async () => {
        try {
          await actor.inTransaction(async () => {
            // Wrapped exactly as a repository would (DEC-DB8-005): the
            // executor does not map driver errors, so an unwrapped statement
            // would prove the trigger fired but not that the taxonomy is
            // applied to it.
            await withMappedErrors('db9-cp4.immutableUpdate', async () => {
              await executor.current().execute(sql`
                update outbox_events set event_type = 'tampered'
                where id = (select id from outbox_events order by id limit 1)
              `);
            });
          });
        } catch (error: unknown) {
          // Correctness: the immutable column is refused by the trigger with
          // the SQLSTATE the error catalog maps to IMMUTABLE_EVIDENCE.
          expect(isPersistenceError(error)).toBe(true);
          if (isPersistenceError(error)) {
            expect(error.diagnostics.sqlState).toBe('23000');
          }
          rejections += 1;
          return 1;
        }
        throw new Error('S24 permitted a write to an immutable column.');
      },
      { warmup: 2, samples: 25 },
    );
    recorder.add({
      perfId: 'PERF-T02',
      source: 'S24 rejected immutable update (outbox_events)',
      stats: rejected,
      plan: undefined,
      note: `${rejections} rejections, all 23000 -> IMMUTABLE_EVIDENCE`,
    });

    // The comparison a reader actually wants: the same shape of update on a
    // table with no S24 trigger. Reported as a comparison, not as an
    // isolated trigger cost — the trigger is never disabled to produce one.
    const unprotected = await measure(
      'PERF-T01b',
      async () =>
        actor.inTransaction(async () => {
          await executor.current().execute(sql`
            update redirect_rules set is_active = is_active
            where id = (select id from redirect_rules order by id limit 1)
          `);
          return 1;
        }),
      { warmup: 3, samples: 25 },
    );
    recorder.add({
      perfId: 'PERF-T01b',
      source: 'control: single-row update, no S24 trigger (redirect_rules)',
      stats: unprotected,
      plan: undefined,
      note: `S24 comparison: ${allowed.medianMs}ms protected vs ${unprotected.medianMs}ms unprotected (orderId ${orderId.slice(0, 8)} unused, control shape only)`,
    });
  });

  it('PERF-A01 — index write-amplification budget per high-write table', async () => {
    const rows = await bench.context.disposable.client.db.execute<{
      relname: string;
      indexes: number;
      live_rows: number;
      total_bytes: number;
      index_bytes: number;
    }>(sql`
      select c.relname,
             (select count(*)::int from pg_index i where i.indrelid = c.oid) as indexes,
             c.reltuples::bigint as live_rows,
             pg_total_relation_size(c.oid) as total_bytes,
             pg_indexes_size(c.oid) as index_bytes
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (${sql.join(
          HIGH_WRITE_TABLES.map((table) => sql`${table}`),
          sql`, `,
        )})
      order by c.relname
    `);

    for (const row of rows.rows) {
      const indexShare =
        Number(row.total_bytes) === 0
          ? 0
          : Math.round((Number(row.index_bytes) / Number(row.total_bytes)) * 100);
      console.log(
        `PERF-A01 ${row.relname}: ${row.indexes} indexes, ` +
          `${Math.round(Number(row.total_bytes) / 1024)}kB total, ${indexShare}% index`,
      );
      // Every index on a high-write table is paid for on every insert. The
      // bound is the DB5 budget's shape, not an arbitrary number: none of
      // these tables was designed to carry a double-digit index count.
      expect(row.indexes).toBeLessThanOrEqual(9);
    }

    expect(rows.rows).toHaveLength(HIGH_WRITE_TABLES.length);
  });
});
