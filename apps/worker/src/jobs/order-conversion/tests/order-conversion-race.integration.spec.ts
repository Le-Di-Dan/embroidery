/**
 * CC-11 — two conversions of one approval, on real independent connections
 * (`APP7-W01` §14).
 *
 * `APP7-W01` is explicit that a single-connection `Promise.all` is insufficient,
 * and it is right: one pool serialises the two transactions itself, so the test
 * would pass without any arbiter existing. Each actor here is a **separately
 * compiled `WorkerModule` with its own pool**, so the two conversions run on
 * different PostgreSQL backends and genuinely block on each other's
 * `INSERT … ON CONFLICT DO NOTHING` over `uq_idempotency_records__namespace_scope_key`
 * and, behind it, on `uq_orders__request`.
 *
 * Two shapes, because they exercise different arbiters:
 *
 * - through the **queue**, which is what a two-replica deployment looks like;
 * - through the **use case** directly, which removes the claim's `SKIP LOCKED`
 *   from the picture so both executions really are inside the conversion at the
 *   same moment.
 *
 * Both must end with exactly one order, one item set, two obligations and one
 * `order.created`.
 */
import { sql } from '@embroidery/database';

import { ConvertApprovedDesignUseCase } from '../application/convert-approved-design.usecase';
import {
  countRows,
  startOrderConversionWorker,
  type OrderConversionContext,
} from './order-conversion-context';
import {
  appendDesignApprovedEvent,
  seedApprovalChain,
  type ApprovalChain,
} from './order-conversion-fixture';

describe('APP7-W01 CC-11 order conversion race (integration)', () => {
  let context: OrderConversionContext;

  beforeAll(async () => {
    context = await startOrderConversionWorker('app7-w01-race');
  }, 300_000);

  afterAll(async () => {
    await context?.close();
  });

  async function assertExactlyOneConversion(chain: ApprovalChain): Promise<void> {
    const orders = await context.rows<{ id: string }>(
      sql`SELECT id FROM orders WHERE custom_request_id = ${chain.customRequestId}`,
    );
    expect(orders).toHaveLength(1);
    const orderId = orders[0]?.id as string;

    expect(
      await countRows(
        context,
        sql`SELECT count(*)::text AS count FROM order_items WHERE order_id = ${orderId}`,
      ),
    ).toBe(1);
    expect(
      await countRows(
        context,
        sql`SELECT count(*)::text AS count FROM payment_obligations WHERE order_id = ${orderId}`,
      ),
    ).toBe(2);
    // One order, one canonical event — never the loser's id orphaned into the
    // outbox, and never two events for one order.
    const events = await context.rows<{ aggregate_id: string }>(
      sql`SELECT aggregate_id FROM outbox_events
          WHERE event_type = 'order.created' AND aggregate_id = ${orderId}`,
    );
    expect(events).toHaveLength(1);
    expect(
      await countRows(
        context,
        sql`SELECT count(*)::text AS count FROM idempotency_records
            WHERE operation_namespace = 'order.create'
              AND scope_key = ${`${chain.customRequestId}:${chain.approvalSnapshotId}`}`,
      ),
    ).toBe(1);
  }

  it('two independently pooled workers claiming two deliveries convert once', async () => {
    const chain = await seedApprovalChain(context.disposable, { suffix: 'race-queue' });
    // Two `PENDING` rows for one approval — the backlog shape `APP7-R00` §11
    // warned about, with a second replica running.
    await appendDesignApprovedEvent(context.disposable, chain);
    await appendDesignApprovedEvent(context.disposable, chain);

    const second = await context.spawnActor('secondary');
    const [left, right] = await Promise.all([context.runOnce(), second.runOnce()]);

    // Neither is allowed to dead-letter: a duplicate is a replay, not a failure.
    for (const summary of [left, right]) {
      expect(summary?.outcome === 'SUCCEEDED' || summary === undefined).toBe(true);
    }
    await assertExactlyOneConversion(chain);
  }, 300_000);

  it('two conversions entered at the same moment on separate pools converge on one order', async () => {
    const chain = await seedApprovalChain(context.disposable, { suffix: 'race-direct' });
    const second = await context.spawnActor('tertiary');

    const lookup = {
      approvalSnapshotId: chain.approvalSnapshotId,
      customRequestId: chain.customRequestId,
    };
    const convert = (actor: { get<T>(token: unknown): T }): Promise<{ id: string } | undefined> =>
      actor
        .get<ConvertApprovedDesignUseCase>(ConvertApprovedDesignUseCase)
        .convert(lookup)
        .catch(() => undefined);

    const [left, right] = await Promise.all([convert(context), convert(second)]);

    // At least one committed, and both — if both returned — name the same order:
    // the loser replayed the winner's result rather than creating its own.
    const created = [left, right].filter((result) => result !== undefined);
    expect(created.length).toBeGreaterThanOrEqual(1);
    const distinct = new Set(created.map((result) => result?.id));
    expect(distinct.size).toBe(1);

    await assertExactlyOneConversion(chain);
  }, 300_000);

  it('repeats the concurrent conversion 4 more times with fresh chains', async () => {
    const second = await context.spawnActor('quaternary');
    const lookupFor = (chain: ApprovalChain) => ({
      approvalSnapshotId: chain.approvalSnapshotId,
      customRequestId: chain.customRequestId,
    });

    for (let round = 0; round < 4; round += 1) {
      const chain = await seedApprovalChain(context.disposable, {
        suffix: `race-repeat-${String(round)}`,
      });
      const lookup = lookupFor(chain);
      await Promise.all([
        context
          .get<ConvertApprovedDesignUseCase>(ConvertApprovedDesignUseCase)
          .convert(lookup)
          .catch(() => undefined),
        second
          .get<ConvertApprovedDesignUseCase>(ConvertApprovedDesignUseCase)
          .convert(lookup)
          .catch(() => undefined),
      ]);
      await assertExactlyOneConversion(chain);
    }
  }, 300_000);
});
