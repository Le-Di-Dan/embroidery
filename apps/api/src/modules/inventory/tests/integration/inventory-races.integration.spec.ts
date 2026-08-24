/**
 * DB8-CP2 — inventory concurrency races against real, independent
 * PostgreSQL connections (`DB8_RACE_COVERAGE_MATRIX.md` CC-15/16/17, all P0).
 *
 * Every test here is exactly the scenario DB7 named but explicitly did not
 * prove: `SkuStockRepository`/`StockAnchor` already implement the
 * `sku_stocks` row-lock anchor (G-DB7-26) single-run; this proves it holds
 * when two independent actors race the same SKU for real, coordinated with
 * `Barrier` rather than `Promise.all` timing alone.
 *
 * `APP8-B02` adds the DB3 **CC-21** release-vs-consume pair, which DB8 never
 * covered: its `CC-16` is the hold-conversion race, and no DB8 row put
 * `releaseReservation` against `consumeReservation`. Those two live at the
 * bottom of this file with their own commentary.
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
  // -------------------------------------------------------------------------
  // DB3 CC-21 — release vs consume (`APP8-B02`, audit §5.4 Gap B).
  //
  // `DB3_CONCURRENCY_SPECIFICATION.md` CC-21 names the arbiter as "reservation
  // row LOCK + idempotent transitions"; no DB8 row exercises it, because DB8's
  // `CC-16` is the *hold conversion* race one table over. Until `APP8-B02` both
  // terminal paths read the status through the unlocked `findReservation`, so a
  // cancellation saga and a production goods-issue could each see `RESERVED`
  // and both proceed — one `RESERVATION_RELEASED` ledger row *and* one
  // `CONSUMED` one, plus an on-hand decrement for stock that was also released.
  //
  // Both cases below are sequenced by the lock itself, not by timing: the
  // winner holds its transaction open, the loser is *observed blocked on a
  // PostgreSQL lock* from a third connection, and only then does the winner
  // commit. Under the delivered code the loser would not have blocked at all.
  // -------------------------------------------------------------------------

  /**
   * Resolves once some backend on this database is waiting on a lock.
   *
   * The condition, not a duration — `pg_stat_activity.wait_event_type` is
   * PostgreSQL's own answer to "is that transaction blocked?", read from the
   * harness's third connection, which holds no transaction of its own. Bounded,
   * so a repair that stopped taking the lock fails here rather than hanging.
   */
  async function waitForLockWaiter(timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const waiting = await countRows(
        sql`select count(*)::text as count from pg_stat_activity
            where datname = current_database() and wait_event_type = 'Lock'`,
      );
      if (waiting > 0) {
        return;
      }
      if (Date.now() > deadline) {
        throw new Error(
          `No backend blocked on a lock within ${timeoutMs}ms — the loser never waited, so the reservation row was not locked before the terminal decision (CC-21).`,
        );
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  async function seedReservation(quantity: number): Promise<string> {
    const seeder = await context.spawnActor('seeder');
    const reservation = await seeder.inTransaction(() =>
      seeder.get<SkuStockRepository>(SKU_STOCK_REPOSITORY).createReservation({
        id: newId() as never,
        skuId: fixture.skuId,
        orderId: fixture.orderId,
        quantity,
        actor,
      }),
    );
    return reservation.id;
  }

  async function ledgerCount(reservationId: string, entryKind: string): Promise<number> {
    return countRows(
      sql`select count(*)::text as count from inventory_ledger_entries
          where reservation_id = ${reservationId} and entry_kind = ${entryKind}`,
    );
  }

  async function reservationStatus(reservationId: string): Promise<string> {
    const [row] = (
      await context.disposable.client.db.execute<{ status: string }>(
        sql`select status from inventory_reservations where id = ${reservationId}`,
      )
    ).rows;
    return row?.status ?? 'MISSING';
  }

  async function onHand(): Promise<number> {
    return countRows(
      sql`select quantity_on_hand::text as count from sku_stocks where sku_id = ${fixture.skuId}`,
    );
  }

  /**
   * Runs the race with `winner` holding the reservation row lock while `loser`
   * blocks on it. Returns the loser's outcome.
   */
  async function raceTerminalTransitions(
    winner: (repository: SkuStockRepository) => Promise<void>,
    loser: (repository: SkuStockRepository) => Promise<void>,
  ): Promise<Outcome> {
    const a = await context.spawnActor('winner');
    const b = await context.spawnActor('loser');
    const barrier = new Barrier();

    const runWinner = a.inTransaction(async () => {
      await winner(a.get<SkuStockRepository>(SKU_STOCK_REPOSITORY));
      // The lock is held and the terminal write is done but uncommitted.
      barrier.signal('winner-holds-lock');
      await barrier.waitFor('loser-blocked');
    });

    await barrier.waitFor('winner-holds-lock');
    const runLoser = settle(
      b.inTransaction(() => loser(b.get<SkuStockRepository>(SKU_STOCK_REPOSITORY))),
    );
    // The loser is genuinely inside PostgreSQL waiting for the winner's row
    // lock — this is the assertion the repair exists to satisfy.
    await waitForLockWaiter();
    barrier.signal('loser-blocked');

    await runWinner;
    return runLoser;
  }

  it('CC-21a: release wins — the blocked consume appends no terminal entry and never decrements on hand', async () => {
    await seedStock(10);
    const reservationId = await seedReservation(4);

    const loserOutcome = await raceTerminalTransitions(
      (repository) =>
        repository.releaseReservation(reservationId as never, 'order cancelled', actor),
      (repository) => repository.consumeReservation(reservationId as never, actor),
    );

    expect(loserOutcome.outcome).toBe('rejected');
    expect(loserOutcome.error).toMatchObject({ code: 'RESERVATION_NOT_ACTIVE' });

    expect(await reservationStatus(reservationId)).toBe('RELEASED');
    expect(await ledgerCount(reservationId, 'RESERVATION_RELEASED')).toBe(1);
    expect(await ledgerCount(reservationId, 'CONSUMED')).toBe(0);
    // The goods never left: a lost consume may not touch on-hand.
    expect(await onHand()).toBe(10);
  });

  it('CC-21b: consume wins — on hand falls exactly once and the blocked release appends nothing', async () => {
    await seedStock(10);
    const reservationId = await seedReservation(4);

    const loserOutcome = await raceTerminalTransitions(
      (repository) => repository.consumeReservation(reservationId as never, actor),
      (repository) =>
        repository.releaseReservation(reservationId as never, 'order cancelled', actor),
    );

    expect(loserOutcome.outcome).toBe('rejected');
    expect(loserOutcome.error).toMatchObject({ code: 'RESERVATION_NOT_ACTIVE' });

    expect(await reservationStatus(reservationId)).toBe('CONSUMED');
    expect(await ledgerCount(reservationId, 'CONSUMED')).toBe(1);
    expect(await ledgerCount(reservationId, 'RESERVATION_RELEASED')).toBe(0);
    // Exactly once — 10 − 4, not 10 − 4 − 4 and not an untouched 10.
    expect(await onHand()).toBe(6);
  });
});
