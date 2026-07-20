/**
 * DB8-CP3 — order creation gate race against real, independent PostgreSQL
 * connections (`DB8_RACE_COVERAGE_MATRIX.md` CC-07, P0).
 *
 * DB7 proved `uq_orders__request` rejects a *second sequential* order for
 * the same request (`order-outbox.integration.spec.ts`). This proves the
 * concurrent case: two actors racing `createFromAcceptedQuotation` for the
 * same request at the same time still produce exactly one order and exactly
 * one `order.created` outbox row — the arbiter and G-DB7-54's atomicity
 * hold under contention, not just in sequence.
 */
import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { OrderModule } from '../../order.module';
import { ORDER_REPOSITORY } from '../../domain/repositories/order.repository';
import type {
  CreateOrderInput,
  OrderId,
  OrderRepository,
} from '../../domain/repositories/order.repository';
import { createConcurrencyTestContext } from '../../../../tests/integration/db8-concurrency-context';
import type { ConcurrencyTestContext } from '../../../../tests/integration/db8-concurrency-context';
import { seedOrderChain } from './order-fixture';
import type { OrderFixture } from './order-fixture';

describe('order creation gate race (DB8-CP3, integration)', () => {
  let context: ConcurrencyTestContext;
  let fixture: OrderFixture;

  beforeAll(async () => {
    context = await createConcurrencyTestContext('db8-cp3-order', [OrderModule]);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    fixture = await seedOrderChain(context);
  });

  function orderInput(): CreateOrderInput {
    const id = newId() as OrderId;
    return {
      id,
      code: `ORD-${id}`,
      customRequestId: fixture.customRequestId,
      acceptedQuotationVersionId: fixture.quotationVersionId,
      approvalSnapshotId: fixture.approvalSnapshotId,
      items: [
        {
          position: 1,
          skuId: fixture.skuId,
          customerOwnedProductId: undefined,
          productName: 'Tee',
          variantLabel: 'Black / M',
          sizeLabel: 'M',
          quantity: 25,
          unitPriceAmount: '100000.00',
          lineTotalAmount: '2500000.00',
        },
      ],
    };
  }

  async function countRows(query: ReturnType<typeof sql>): Promise<number> {
    const [row] = (await context.disposable.client.db.execute<{ count: string }>(query)).rows;
    return Number(row?.count ?? 0);
  }

  it('CC-07: two concurrent createFromAcceptedQuotation calls for the same request produce exactly one order and one outbox event', async () => {
    const a = await context.spawnActor('A');
    const b = await context.spawnActor('B');
    const inputA = orderInput();
    const inputB = orderInput();

    async function attempt(
      actor: typeof a,
      input: CreateOrderInput,
    ): Promise<{ outcome: 'committed' | 'rejected'; error?: unknown }> {
      try {
        await actor.inTransaction(() =>
          actor.get<OrderRepository>(ORDER_REPOSITORY).createFromAcceptedQuotation(input),
        );
        return { outcome: 'committed' };
      } catch (error: unknown) {
        return { outcome: 'rejected', error };
      }
    }

    const [resultA, resultB] = await Promise.all([attempt(a, inputA), attempt(b, inputB)]);
    const committed = [resultA, resultB].filter((r) => r.outcome === 'committed');
    const rejected = [resultA, resultB].filter((r) => r.outcome === 'rejected');

    expect(committed).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const orderCount = await countRows(
      sql`select count(*)::text as count from orders where custom_request_id = ${fixture.customRequestId}`,
    );
    expect(orderCount).toBe(1);

    const outboxCount = await countRows(
      sql`select count(*)::text as count from outbox_events where aggregate_kind = 'ORDER'`,
    );
    expect(outboxCount).toBe(1);

    // The order and its outbox row must name the *same* winning id — never
    // the loser's id orphaned into the outbox, or vice versa.
    const winningId =
      committed.length === 1 ? (resultA === committed[0] ? inputA.id : inputB.id) : undefined;
    const outboxRows = await context.disposable.client.db.execute<{ aggregate_id: string }>(
      sql`select aggregate_id from outbox_events where aggregate_kind = 'ORDER'`,
    );
    expect(outboxRows.rows[0]?.aggregate_id).toBe(winningId);
  });

  it('flakiness gate: repeats the concurrent-order race 5 more times with fresh ids, always exactly one winner', async () => {
    for (let i = 0; i < 5; i += 1) {
      await context.reset();
      fixture = await seedOrderChain(context, `repeat-${i}`);
      const a = await context.spawnActor(`A${i}`);
      const b = await context.spawnActor(`B${i}`);
      const inputA = orderInput();
      const inputB = orderInput();

      const [resultA, resultB] = await Promise.allSettled([
        a.inTransaction(() =>
          a.get<OrderRepository>(ORDER_REPOSITORY).createFromAcceptedQuotation(inputA),
        ),
        b.inTransaction(() =>
          b.get<OrderRepository>(ORDER_REPOSITORY).createFromAcceptedQuotation(inputB),
        ),
      ]);

      const fulfilled = [resultA, resultB].filter((r) => r.status === 'fulfilled');
      expect(fulfilled).toHaveLength(1);

      const orderCount = await countRows(
        sql`select count(*)::text as count from orders where custom_request_id = ${fixture.customRequestId}`,
      );
      expect(orderCount).toBe(1);
    }
  });
});
