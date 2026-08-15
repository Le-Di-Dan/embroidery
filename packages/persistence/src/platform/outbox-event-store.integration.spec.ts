/**
 * TBL-073 outbox persistence against a real PostgreSQL instance (DB7-CP3).
 *
 * Single-run claim behaviour only. Multi-worker exclusivity of
 * `FOR UPDATE SKIP LOCKED` is **not** proven here — that is DB8 CC-25.
 */
import { isPersistenceError, newId, withMappedErrors } from '@embroidery/database';
import type { PersistenceError } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { createPlatformTestContext } from '../testing/platform-test-context';
import type { PlatformTestContext } from '../testing/platform-test-context';
import { OutboxEventStore } from './outbox-event-store';

const HOUR_MS = 60 * 60 * 1000;

describe('outbox event store (integration)', () => {
  let context: PlatformTestContext;
  let outbox: OutboxEventStore;

  beforeAll(async () => {
    context = await createPlatformTestContext('cp3-outbox');
    outbox = context.get(OutboxEventStore);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  afterEach(async () => {
    await context.reset();
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

  const event = (aggregateId: string) =>
    ({
      eventType: 'order.created',
      aggregateKind: 'ORDER',
      aggregateId,
      payload: { orderId: aggregateId },
      payloadSchemaVersion: 1,
    }) as const;

  it('appends an event inside the caller transaction', async () => {
    const id = newId();
    await context.inTransaction(() => outbox.append(event(id)));

    const events = await outbox.listForAggregate('ORDER', id);
    expect(events).toHaveLength(1);
    expect(events[0]?.status).toBe('PENDING');
  });

  it('rolls the event back when the domain work fails', async () => {
    const id = newId();

    await expect(
      context.inTransaction(async () => {
        await outbox.append(event(id));
        throw new Error('domain write failed after the outbox insert');
      }),
    ).rejects.toThrow();

    // The whole point of the pattern: no event may survive work that rolled back.
    await expect(outbox.listForAggregate('ORDER', id)).resolves.toEqual([]);
  });

  it('refuses to append outside a transaction', async () => {
    await expect(outbox.append(event(newId()))).rejects.toThrow(/must run inside a transaction/);
  });

  it('rejects an unrecognised aggregate kind (G-DB7-47)', async () => {
    const error = await failureOf(() =>
      context.inTransaction(() =>
        outbox.append({ ...event(newId()), aggregateKind: 'MYSTERY' as never }),
      ),
    );

    expect(error.code).toBe('UNKNOWN_AGGREGATE_KIND');
  });

  it('claims due events in id order and increments the attempt count', async () => {
    const first = newId();
    const second = newId();
    await context.inTransaction(async () => {
      await outbox.append(event(first));
      await outbox.append(event(second));
    });

    const claimed = await context.inTransaction(() => outbox.claimBatch('worker-1', 10));

    expect(claimed).toHaveLength(2);
    expect(claimed[0]?.attemptCount).toBe(1);
    expect(claimed.map((e) => e.aggregateId)).toEqual([first, second]);
  });

  it('bounds a claim batch so one worker cannot take the whole queue', async () => {
    await context.inTransaction(async () => {
      for (let index = 0; index < 5; index += 1) {
        await outbox.append(event(newId()));
      }
    });

    const claimed = await context.inTransaction(() => outbox.claimBatch('worker-1', 2));

    expect(claimed).toHaveLength(2);
  });

  it('marks a dispatched event and stops claiming it', async () => {
    const id = newId();
    await context.inTransaction(() => outbox.append(event(id)));
    const [claimed] = await context.inTransaction(() => outbox.claimBatch('worker-1', 10));

    await context.inTransaction(() => outbox.markDispatched(claimed?.id as bigint));

    const remaining = await context.inTransaction(() => outbox.claimBatch('worker-1', 10));
    expect(remaining).toEqual([]);
    await expect(outbox.listForAggregate('ORDER', id)).resolves.toMatchObject([
      { status: 'DISPATCHED' },
    ]);
  });

  it('does not re-claim a retry before its next attempt is due', async () => {
    const id = newId();
    await context.inTransaction(() => outbox.append(event(id)));
    const [claimed] = await context.inTransaction(() => outbox.claimBatch('worker-1', 10));

    await context.inTransaction(() =>
      outbox.scheduleRetry(claimed?.id as bigint, new Date(Date.now() + HOUR_MS), 'TIMEOUT'),
    );

    const tooSoon = await context.inTransaction(() => outbox.claimBatch('worker-1', 10));
    expect(tooSoon).toEqual([]);
  });

  it('re-claims a retry once it becomes due', async () => {
    const id = newId();
    await context.inTransaction(() => outbox.append(event(id)));
    const [claimed] = await context.inTransaction(() => outbox.claimBatch('worker-1', 10));
    await context.inTransaction(() =>
      outbox.scheduleRetry(claimed?.id as bigint, new Date(Date.now() - 1000), 'TIMEOUT'),
    );

    const again = await context.inTransaction(() => outbox.claimBatch('worker-1', 10));

    expect(again).toHaveLength(1);
    expect(again[0]?.attemptCount).toBe(2);
  });

  it('stops claiming a dead-lettered event', async () => {
    const id = newId();
    await context.inTransaction(() => outbox.append(event(id)));
    const [claimed] = await context.inTransaction(() => outbox.claimBatch('worker-1', 10));

    await context.inTransaction(() =>
      outbox.markDeadLetter(claimed?.id as bigint, 'PERMANENT_REJECT'),
    );

    await expect(context.inTransaction(() => outbox.claimBatch('worker-1', 10))).resolves.toEqual(
      [],
    );
    await expect(outbox.listForAggregate('ORDER', id)).resolves.toMatchObject([
      { status: 'DEAD_LETTER' },
    ]);
  });

  /**
   * `listTerminalEventsForAggregate` — the `APP4-B08` manual-replay source read.
   *
   * What it has to prove is persistence behaviour: the lookup is by the
   * polymorphic linkage and the event type, it returns the payload the diagnostic
   * read deliberately withholds, and it sees **only** `DEAD_LETTER` rows — a
   * still-retrying delivery is not a terminal source and must not be replayed.
   */
  it('returns only dead-lettered events for the aggregate, with their payload', async () => {
    const terminalId = newId();
    const pendingId = newId();
    const otherTypeId = newId();

    await context.inTransaction(async () => {
      await outbox.append(event(terminalId));
      await outbox.append(event(pendingId));
      await outbox.append({ ...event(otherTypeId), eventType: 'order.cancelled' });
    });
    const [terminal] = await outbox.listForAggregate('ORDER', terminalId);
    await context.inTransaction(() =>
      outbox.markDeadLetter(terminal?.id as bigint, 'PERMANENT_REJECT'),
    );
    // The other two are dead-lettered too, so the filter under test is the
    // aggregate and the event type rather than the status alone.
    const [otherType] = await outbox.listForAggregate('ORDER', otherTypeId);
    await context.inTransaction(() =>
      outbox.markDeadLetter(otherType?.id as bigint, 'PERMANENT_REJECT'),
    );

    const found = await outbox.listTerminalEventsForAggregate('ORDER', terminalId, 'order.created');

    expect(found).toHaveLength(1);
    expect(found[0]?.status).toBe('DEAD_LETTER');
    // The payload the diagnostic `listForAggregate` does not return.
    expect(found[0]?.payload).toEqual({ orderId: terminalId });
    expect(found[0]?.payloadSchemaVersion).toBe(1);

    // A still-pending delivery is not a terminal source.
    await expect(
      outbox.listTerminalEventsForAggregate('ORDER', pendingId, 'order.created'),
    ).resolves.toEqual([]);
    // Nor is a dead-lettered event of a different type.
    await expect(
      outbox.listTerminalEventsForAggregate('ORDER', otherTypeId, 'order.created'),
    ).resolves.toEqual([]);
  });

  it('rejects a payload mutation via the S24 column-scoped trigger', async () => {
    const id = newId();
    await context.inTransaction(() => outbox.append(event(id)));

    // Direct SQL, deliberately: the store has no method for this, so the
    // assertion is that the *database* refuses even when the code is bypassed.
    // Mapped explicitly because this path skips the repository funnel.
    const error = await failureOf(() =>
      withMappedErrors('probe.tamperOutboxPayload', () =>
        context.disposable.client.db.execute(
          sql`update outbox_events set payload = '{"tampered":true}'::jsonb where aggregate_id = ${id}`,
        ),
      ),
    );

    expect(error.kind).toBe('IMMUTABLE_EVIDENCE');
    expect(error.diagnostics.sqlState).toBe('23000');
  });
});
