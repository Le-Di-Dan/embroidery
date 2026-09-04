/**
 * `order.created` no longer stays `PENDING` forever, and an unknown event still
 * does (`APP12-H03-C1` §10, §11, §12).
 *
 * The real registry, the real claim filter, the real guarded completion seam,
 * and assertions on `outbox_events` rows. That matters more than usual here,
 * because the defect was never in a handler — it was in what the worker
 * *claims*, and no unit test can see that at all.
 *
 * The two halves are deliberately in one file. "The known event settles" and
 * "the unknown event is not even claimed" are the same property stated twice,
 * and reading them apart is how an acknowledgement quietly becomes a catch-all.
 */
import { executeRaw, newId, sql } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';

import { JobHandlerRegistry } from '../../../runtime/registry/job-handler.registry';
import {
  startAcknowledgementWorker,
  type AcknowledgementContext,
} from './order-created-acknowledgement-context';
import { ORDER_CREATED_EVENT_TYPE } from '../domain/order-created.payload';

/** An event type no handler is registered for. */
const UNKNOWN_EVENT_TYPE = 'app12.h03.c1.unregistered.event';

interface SeededEvent {
  readonly orderId: string;
  readonly eventId: bigint;
}

/** A Ready-Made order and the `order.created` row its creation appended. */
async function seedOrderCreated(
  disposable: DisposableDatabase,
  options: { readonly eventType?: string; readonly aggregateId?: string } = {},
): Promise<SeededEvent> {
  const db = disposable.client.db;
  const customerId = newId();
  const orderId = newId();
  const code = `ORD-${orderId}`;

  await executeRaw(
    db,
    sql`insert into customers (id, display_name, verified_at)
        values (${customerId}, 'Acknowledgement Customer', now())`,
  );
  await executeRaw(
    db,
    sql`insert into orders (id, code, origin, customer_id, status, total_amount, currency_code)
        values (${orderId}, ${code}, 'READY_MADE', ${customerId}, 'AWAITING_SHIPPING_FEE',
                150000.00, 'VND')`,
  );

  // Byte-for-byte what `DrizzleReadyMadeOrderRepository.create` appends.
  const rows = await executeRaw<{ id: string }>(
    db,
    sql`insert into outbox_events
          (event_type, aggregate_kind, aggregate_id, payload, payload_schema_version,
           status, attempt_count, next_attempt_at)
        values (${options.eventType ?? ORDER_CREATED_EVENT_TYPE}, 'ORDER',
                ${options.aggregateId ?? orderId},
                ${JSON.stringify({ orderId, code, origin: 'READY_MADE' })}::jsonb,
                1, 'PENDING', 0, now())
        returning id`,
  );
  return { orderId, eventId: BigInt(String(rows[0]?.id)) };
}

describe('APP12-H03-C1 order.created acknowledgement (integration)', () => {
  let context: AcknowledgementContext;

  beforeAll(async () => {
    context = await startAcknowledgementWorker('app12-h03-c1-order-created');
  }, 300_000);

  afterAll(async () => {
    await context?.close();
  });

  async function outboxRow(
    eventId: bigint,
  ): Promise<{ status: string; attempt_count: number; last_error: string | null }> {
    const [row] = await context.rows<{
      status: string;
      attempt_count: number;
      last_error: string | null;
    }>(sql`select status, attempt_count, last_error from outbox_events where id = ${eventId}`);
    if (row === undefined) {
      throw new Error('The seeded outbox row disappeared.');
    }
    return row;
  }

  it('registers exactly one production handler for order.created', () => {
    const registered = context.get<JobHandlerRegistry>(JobHandlerRegistry).registeredTypes();

    // The claim filter *is* the registered types, so this is also the proof
    // that a live worker asks the queue for `order.created` at all — which
    // nothing did before this correction.
    expect(registered).toContainEqual({
      eventType: ORDER_CREATED_EVENT_TYPE,
      jobKind: 'OUTBOX_DISPATCH',
    });
    expect(
      registered.filter((type) => type.eventType === ORDER_CREATED_EVENT_TYPE),
    ).toHaveLength(1);
  });

  it('claims and completes the row a Ready-Made creation leaves', async () => {
    const { eventId } = await seedOrderCreated(context.disposable);

    const summary = await context.runOnce();

    expect(summary?.outcome).toBe('SUCCEEDED');
    const row = await outboxRow(eventId);
    expect(row.status).toBe('DISPATCHED');
    expect(row.last_error).toBeNull();
    // One attempt. Not a retry loop dressed up as eventual success.
    expect(row.attempt_count).toBe(1);
  });

  it('does not claim the settled row again', async () => {
    await seedOrderCreated(context.disposable);
    await context.runOnce();

    // No claim loop: a completed row leaves the claimable set for good.
    expect(await context.runOnce()).toBeUndefined();
  });

  it('files exactly one SUCCEEDED attempt under the transport kind', async () => {
    const { eventId } = await seedOrderCreated(context.disposable);
    await context.runOnce();

    const attempts = await context.rows<{
      job_kind: string;
      outcome: string;
      error_class: string | null;
    }>(
      sql`select job_kind, outcome, error_class from background_job_attempts
          where job_key = ${eventId.toString()}`,
    );

    expect(attempts).toEqual([
      { job_kind: 'OUTBOX_DISPATCH', outcome: 'SUCCEEDED', error_class: null },
    ]);
  });

  it('mutates no business row while acknowledging', async () => {
    const { orderId } = await seedOrderCreated(context.disposable);
    const before = await businessRowCounts(context);

    await context.runOnce();

    expect(await businessRowCounts(context)).toEqual(before);
    const status = await context.rows<{ status: string }>(
      sql`select status from orders where id = ${orderId}`,
    );
    expect(status[0]?.status).toBe('AWAITING_SHIPPING_FEE');
  });

  it('dead-letters rather than settling a row whose linkage contradicts its payload', async () => {
    // The one thing worse than a permanently pending row: a settled one that
    // hid a producer defect.
    const { eventId } = await seedOrderCreated(context.disposable, { aggregateId: newId() });

    const summary = await context.runOnce();

    expect(summary?.outcome).toBe('FAILED_TERMINAL');
    const row = await outboxRow(eventId);
    expect(row.status).toBe('DEAD_LETTER');
    expect(row.last_error).toBe('JOB_INVARIANT_VIOLATION');
  });

  it('leaves a genuinely unknown event type unclaimed and PENDING', async () => {
    // The safety property the acknowledgement must not weaken. The claim filter
    // is exactly the registered event types, so an unregistered one is never
    // claimed — not acknowledged, not dead-lettered, and visible in the backlog
    // until somebody registers a consumer for it.
    const { eventId } = await seedOrderCreated(context.disposable, {
      eventType: UNKNOWN_EVENT_TYPE,
    });

    // Drained: nothing claimable remains, and the unknown row is what is left.
    while ((await context.runOnce()) !== undefined) {
      /* drain */
    }

    const row = await outboxRow(eventId);
    expect(row.status).toBe('PENDING');
    expect(row.attempt_count).toBe(0);
    expect(
      await context.rows(
        sql`select 1 from background_job_attempts where job_key = ${eventId.toString()}`,
      ),
    ).toEqual([]);
  });
});

interface BusinessRowCounts extends Record<string, unknown> {
  readonly orders: string;
  readonly reservations: string;
  readonly ledger: string;
  readonly obligations: string;
  readonly idempotency: string;
}

async function businessRowCounts(context: AcknowledgementContext): Promise<BusinessRowCounts> {
  const [row] = await context.rows<BusinessRowCounts>(
    sql`select (select count(*) from orders)::text                    as orders,
               (select count(*) from inventory_reservations)::text    as reservations,
               (select count(*) from inventory_ledger_entries)::text  as ledger,
               (select count(*) from payment_obligations)::text       as obligations,
               (select count(*) from idempotency_records)::text       as idempotency`,
  );
  if (row === undefined) {
    throw new Error('The row-count probe returned nothing.');
  }
  return row;
}
