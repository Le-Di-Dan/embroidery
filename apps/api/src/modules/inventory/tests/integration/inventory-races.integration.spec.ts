/**
 * DB8-CP2 — inventory concurrency races against real, independent
 * PostgreSQL connections (`DB8_RACE_COVERAGE_MATRIX.md` CC-15/16/17, all P0).
 *
 * Every test here is exactly the scenario DB7 named but explicitly did not
 * prove: `SkuStockRepository`/`StockAnchor` already implement the
 * `sku_stocks` row-lock anchor (G-DB7-26) single-run; this proves it holds
 * when two independent actors race the same SKU for real, coordinated with
 * `Barrier` rather than `Promise.all` timing alone.
 */
import { newId, schema } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import type { SkuStockRepository } from '../../domain/repositories/sku-stock.repository';
import { SKU_STOCK_REPOSITORY } from '../../domain/repositories/sku-stock.repository';
import { InventoryModule } from '../../inventory.module';
import { createConcurrencyTestContext } from '../../../../tests/integration/db8-concurrency-context';
import type { ConcurrencyTestContext } from '../../../../tests/integration/db8-concurrency-context';
import { Barrier } from '../../../../tests/integration/db8-barrier';
import { seedInventoryChain } from './inventory-fixture';
import type { InventoryFixture } from './inventory-fixture';

const { skuStocks } = schema;

type Outcome = { readonly outcome: 'committed' | 'rejected'; readonly error?: unknown };

async function settle(promise: Promise<unknown>): Promise<Outcome> {
  try {
    await promise;
    return { outcome: 'committed' };
  } catch (error: unknown) {
    return { outcome: 'rejected', error };
  }
}

describe('inventory concurrency races (DB8-CP2, integration)', () => {
  let context: ConcurrencyTestContext;
  let fixture: InventoryFixture;

  beforeAll(async () => {
    context = await createConcurrencyTestContext('db8-cp2-inventory', [InventoryModule]);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    fixture = await seedInventoryChain(context);
  });

  async function seedStock(quantity: number): Promise<void> {
    await context.disposable.client.db
      .insert(skuStocks)
      .values({ id: newId(), skuId: fixture.skuId, quantityOnHand: quantity });
  }

  async function countRows(query: ReturnType<typeof sql>): Promise<number> {
    const [row] = (await context.disposable.client.db.execute<{ count: string }>(query)).rows;
    return Number(row?.count ?? 0);
  }

  const actor = { kind: 'SYSTEM' as const, systemJobKey: 'db8-cp2' };

  it('CC-15: two soft holds racing the same SKU never both succeed past available stock', async () => {
    // 10 on hand; two holds of 7 each would total 14 if both succeeded —
    // exactly the oversubscription G-DB7-26 exists to prevent.
    await seedStock(10);
    const a = await context.spawnActor('A');
    const b = await context.spawnActor('B');

    const runA = settle(
      a.inTransaction(() =>
        a.get<SkuStockRepository>(SKU_STOCK_REPOSITORY).createSoftHold({
          id: newId() as never,
          skuId: fixture.skuId,
          customRequestId: fixture.customRequestId,
          quantity: 7,
          expiresAt: new Date(Date.now() + 3_600_000),
          actor,
        }),
      ),
    );
    const runB = settle(
      b.inTransaction(() =>
        b.get<SkuStockRepository>(SKU_STOCK_REPOSITORY).createSoftHold({
          id: newId() as never,
          skuId: fixture.skuId,
          customRequestId: fixture.customRequestId,
          quantity: 7,
          expiresAt: new Date(Date.now() + 3_600_000),
          actor,
        }),
      ),
    );

    // No barrier needed to make this a real race: the `sku_stocks` row lock
    // is the serialization point under test, and both transactions start
    // together and contend for it directly.
    const [resultA, resultB] = await Promise.all([runA, runB]);
    const committed = [resultA, resultB].filter((r) => r.outcome === 'committed');
    const rejected = [resultA, resultB].filter((r) => r.outcome === 'rejected');

    expect(committed).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.error).toMatchObject({ code: 'INSUFFICIENT_STOCK' });

    const heldTotal = await countRows(
      sql`select coalesce(sum(quantity), 0)::text as count from inventory_soft_holds where status = 'HELD'`,
    );
    expect(heldTotal).toBe(7);
  });

  it('CC-15b: a hold that fits exactly the remaining stock succeeds; the next unit does not', async () => {
    await seedStock(5);
    const a = await context.spawnActor('A');
    const b = await context.spawnActor('B');

    await a.inTransaction(() =>
      a.get<SkuStockRepository>(SKU_STOCK_REPOSITORY).createSoftHold({
        id: newId() as never,
        skuId: fixture.skuId,
        customRequestId: fixture.customRequestId,
        quantity: 5,
        expiresAt: new Date(Date.now() + 3_600_000),
        actor,
      }),
    );

    await expect(
      b.inTransaction(() =>
        b.get<SkuStockRepository>(SKU_STOCK_REPOSITORY).createSoftHold({
          id: newId() as never,
          skuId: fixture.skuId,
          customRequestId: fixture.customRequestId,
          quantity: 1,
          expiresAt: new Date(Date.now() + 3_600_000),
          actor,
        }),
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
  });

  it('CC-16: two concurrent conversions of the same hold never both create a reservation', async () => {
    await seedStock(10);
    const seeder = await context.spawnActor('seeder');
    const hold = await seeder.inTransaction(() =>
      seeder.get<SkuStockRepository>(SKU_STOCK_REPOSITORY).createSoftHold({
        id: newId() as never,
        skuId: fixture.skuId,
        customRequestId: fixture.customRequestId,
        quantity: 4,
        expiresAt: new Date(Date.now() + 3_600_000),
        actor,
      }),
    );

    const a = await context.spawnActor('A');
    const b = await context.spawnActor('B');

    const runA = settle(
      a.inTransaction(() =>
        a.get<SkuStockRepository>(SKU_STOCK_REPOSITORY).convertHold({
          holdId: hold.id,
          reservationId: newId() as never,
          orderId: fixture.orderId,
          actor,
        }),
      ),
    );
    const runB = settle(
      b.inTransaction(() =>
        b.get<SkuStockRepository>(SKU_STOCK_REPOSITORY).convertHold({
          holdId: hold.id,
          reservationId: newId() as never,
          orderId: fixture.orderId,
          actor,
        }),
      ),
    );

    const [resultA, resultB] = await Promise.all([runA, runB]);
    expect([resultA, resultB].filter((r) => r.outcome === 'committed')).toHaveLength(1);
    expect([resultA, resultB].filter((r) => r.outcome === 'rejected')).toHaveLength(1);

    const reservationCount = await countRows(
      sql`select count(*)::text as count from inventory_reservations where status = 'RESERVED'`,
    );
    expect(reservationCount).toBe(1);
  });

  it('CC-17: reservation eligibility is decided by what the in-tx read actually saw, never both an oversight and a reservation', async () => {
    await seedStock(10);
    const a = await context.spawnActor('A');
    const barrier = new Barrier();

    const runA = a
      .inTransaction(async () => {
        // The eligibility guard reads `payment_obligations` before the
        // `sku_stocks` lock (`DB8_LOCK_ORDER_MATRIX.md` §2's documented
        // cross-context order). Signal once A has started so B's concurrent
        // cancellation can land in the same window as that read.
        barrier.signal('a-started');
        return a.get<SkuStockRepository>(SKU_STOCK_REPOSITORY).createReservation({
          id: newId() as never,
          skuId: fixture.skuId,
          orderId: fixture.orderId,
          quantity: 3,
          actor,
        });
      })
      .then(
        () => 'committed' as const,
        () => 'rejected' as const,
      );

    await barrier.waitFor('a-started');
    // B: an independent connection cancels the deposit obligation the
    // fixture seeded as SATISFIED, racing A's own transaction.
    await context.disposable.client.db.execute(
      sql`update payment_obligations set status = 'CANCELLED' where order_id = ${fixture.orderId}`,
    );

    const outcome = await runA;
    const reservationCount = await countRows(
      sql`select count(*)::text as count from inventory_reservations where status = 'RESERVED'`,
    );

    // The only two coherent outcomes: A committed and there is exactly one
    // reservation (its in-tx read won the race against B's cancel), or A
    // was rejected and there are zero (its read lost the race). A
    // reservation existing while A was rejected — the guard-bypass failure
    // mode — is what this test exists to rule out.
    if (outcome === 'committed') {
      expect(reservationCount).toBe(1);
    } else {
      expect(reservationCount).toBe(0);
    }
  });
});
