/**
 * Order creation → outbox atomicity against a real PostgreSQL instance
 * (DB7-CP6).
 *
 * Proves the one representative end-to-end wiring CP6 requires: the
 * canonical `order.created` event (SE-006, `DB3_SIDE_EFFECT_OUTBOX_CATALOG.md`)
 * that `DrizzleOrderRepository.createFromAcceptedQuotation` appends in the
 * same transaction as the order and its items (G-DB7-54). This is the one
 * business flow DB7 wires end-to-end; every other module's outbox call site
 * is out of scope and tracked in `DB7_DB8_HANDOFF.md`, not silently claimed.
 */
import { isPersistenceError, newId } from '@embroidery/database';
import type { PersistenceError } from '@embroidery/database';
import { OutboxEventStore } from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { OrderModule } from '../../order.module';
import { ORDER_REPOSITORY } from '../../domain/repositories/order.repository';
import type {
  CreateOrderInput,
  OrderId,
  OrderRepository,
} from '../../domain/repositories/order.repository';
import { seedOrderChain } from './order-fixture';
import type { OrderFixture } from './order-fixture';

describe('order creation outbox atomicity (integration)', () => {
  let context: PersistenceTestContext;
  let orders: OrderRepository;
  let outbox: OutboxEventStore;
  let fixture: OrderFixture;

  beforeAll(async () => {
    context = await createPersistenceTestContext('cp6-order-outbox', [OrderModule]);
    orders = context.get(ORDER_REPOSITORY);
    outbox = context.get(OutboxEventStore);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    fixture = await seedOrderChain(context);
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

  function orderInput(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
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
      ...overrides,
    };
  }

  async function countOrders(id: string): Promise<number> {
    const [row] = (
      await context.disposable.client.db.execute<{ count: string }>(
        sql`select count(*)::text as count from orders where id = ${id}`,
      )
    ).rows;
    return Number(row?.count ?? 0);
  }

  it('commits the order.created outbox event in the same transaction as the order', async () => {
    const input = orderInput();

    await context.inTransaction(() => orders.createFromAcceptedQuotation(input));

    const events = await outbox.listForAggregate('ORDER', input.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: 'order.created', status: 'PENDING' });
  });

  it('carries only minimal canonical references in the payload, nothing else', async () => {
    const input = orderInput();

    await context.inTransaction(() => orders.createFromAcceptedQuotation(input));

    const [row] = (
      await context.disposable.client.db.execute<{ payload: unknown }>(
        sql`select payload from outbox_events where aggregate_kind = 'ORDER' and aggregate_id = ${input.id}`,
      )
    ).rows;

    // No amounts, no contact details, no copy of the frozen items — a
    // consumer resolves those from the ids, so the outbox row cannot leak
    // what it does not carry or go stale relative to the order it names.
    expect(row?.payload).toEqual({
      orderId: input.id,
      code: input.code,
      customRequestId: fixture.customRequestId,
    });
  });

  it('rolls back the order and its items when a later domain check fails, leaving no outbox row', async () => {
    // Two subjects on one line trips `ORDER_ITEM_SUBJECT_INVALID` *after* the
    // order row is inserted but *before* the outbox append — the domain-write
    // side of the "partial failure rolls back everything" proof.
    const input = orderInput({
      items: [
        {
          position: 1,
          skuId: fixture.skuId,
          customerOwnedProductId: newId(),
          productName: 'Tee',
          variantLabel: undefined,
          sizeLabel: undefined,
          quantity: 1,
          unitPriceAmount: '100000.00',
          lineTotalAmount: '100000.00',
        },
      ],
    });

    const error = await failureOf(() =>
      context.inTransaction(() => orders.createFromAcceptedQuotation(input)),
    );

    expect(error.code).toBe('ORDER_ITEM_SUBJECT_INVALID');
    await expect(countOrders(input.id)).resolves.toBe(0);
    await expect(outbox.listForAggregate('ORDER', input.id)).resolves.toEqual([]);
  });

  it('rolls back the order and the outbox row together when the enclosing transaction fails after both writes', async () => {
    const input = orderInput();

    // The repository call succeeds — order, items and the outbox row all
    // write without error — but the caller's own transaction then fails
    // *after* that, before commit. This is the "failure after outbox
    // insertion but before commit" case: nothing before this point can tell
    // the two writes apart from a genuine success.
    await expect(
      context.inTransaction(async () => {
        await orders.createFromAcceptedQuotation(input);
        throw new Error('later step in the caller failed');
      }),
    ).rejects.toThrow('later step in the caller failed');

    await expect(countOrders(input.id)).resolves.toBe(0);
    await expect(outbox.listForAggregate('ORDER', input.id)).resolves.toEqual([]);
  });

  it('never creates a second order or a second outbox event for the same request', async () => {
    const first = orderInput();
    await context.inTransaction(() => orders.createFromAcceptedQuotation(first));

    // `uq_orders__request` rejects the second order before the outbox append
    // for it ever runs — the order's own uniqueness is what makes this event
    // at-most-once, with no separate idempotency key needed on the row.
    const second = orderInput();
    await expect(
      context.inTransaction(() => orders.createFromAcceptedQuotation(second)),
    ).rejects.toBeDefined();

    const [row] = (
      await context.disposable.client.db.execute<{ count: string }>(
        sql`select count(*)::text as count from outbox_events where aggregate_kind = 'ORDER'`,
      )
    ).rows;
    expect(Number(row?.count)).toBe(1);
  });

  it('refuses to append the event outside a transaction, same as every other outbox write', async () => {
    await expect(
      outbox.append({
        eventType: 'order.created',
        aggregateKind: 'ORDER',
        aggregateId: newId(),
        payload: {},
        payloadSchemaVersion: 1,
      }),
    ).rejects.toThrow(/must run inside a transaction/);
  });
});
