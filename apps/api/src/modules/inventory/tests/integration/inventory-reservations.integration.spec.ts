/**
 * AGG-07 Reservation persistence against a real PostgreSQL instance
 * (DB7-CP5).
 *
 * TBL-021 and guard G-DB7-27 (official reservation eligibility — the order's
 * deposit obligation must be SATISFIED before stock converts from a hold or
 * a fresh reservation into an official commitment against that order).
 */
import { isPersistenceError, newId } from '@embroidery/database';
import type { PersistenceError } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { InventoryModule } from '../../inventory.module';
import { SKU_STOCK_REPOSITORY } from '../../domain/repositories/sku-stock.repository';
import type {
  InventoryActor,
  ReservationId,
  SkuStockId,
  SkuStockRepository,
  SoftHoldId,
} from '../../domain/repositories/sku-stock.repository';
import { seedInventoryChain } from './inventory-fixture';
import type { InventoryFixture } from './inventory-fixture';

const HOUR_MS = 60 * 60 * 1000;

describe('inventory reservation persistence (integration)', () => {
  let context: PersistenceTestContext;
  let stocks: SkuStockRepository;
  let fixture: InventoryFixture;

  beforeAll(async () => {
    context = await createPersistenceTestContext('cp5-inventory-reservations', [InventoryModule]);
    stocks = context.get(SKU_STOCK_REPOSITORY);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    fixture = await seedInventoryChain(context);
  });

  const actor: InventoryActor = { kind: 'SYSTEM', systemJobKey: 'test' };

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

  const seedStock = (quantityOnHand = 100) =>
    context.inTransaction(() =>
      stocks.ensureStockRow(newId() as SkuStockId, fixture.skuId, quantityOnHand),
    );

  async function reserve(quantity = 10): Promise<ReservationId> {
    const id = newId() as ReservationId;
    await context.inTransaction(() =>
      stocks.createReservation({
        id,
        skuId: fixture.skuId,
        orderId: fixture.orderId,
        quantity,
        actor,
      }),
    );
    return id;
  }

  describe('reservations', () => {
    it('allows one active reservation per order and SKU', async () => {
      await seedStock(100);
      await reserve(5);

      const error = await failureOf(() => reserve(5));

      expect(error.code).toBe('RESERVATION_ALREADY_ACTIVE');
    });

    it('consumes a reservation, reducing on-hand', async () => {
      await seedStock(100);
      const id = await reserve(10);

      await context.inTransaction(() => stocks.consumeReservation(id, actor));

      // Consumption is the only path that reduces on-hand: the goods have left.
      await expect(stocks.findBySku(fixture.skuId)).resolves.toMatchObject({ quantityOnHand: 90 });
      const ledger = await stocks.listLedger(fixture.skuId);
      expect(ledger.at(-1)).toMatchObject({ entryKind: 'CONSUMED', onHandDelta: -10 });
    });

    it('refuses to consume a released reservation', async () => {
      await seedStock(100);
      const id = await reserve(10);
      await context.inTransaction(() => stocks.releaseReservation(id, 'cancelled', actor));

      const error = await failureOf(() =>
        context.inTransaction(() => stocks.consumeReservation(id, actor)),
      );

      expect(error.code).toBe('RESERVATION_NOT_ACTIVE');
    });

    it('frees availability when a reservation is released', async () => {
      await seedStock(20);
      const id = await reserve(20);

      await context.inTransaction(() => stocks.releaseReservation(id, 'order cancelled', actor));

      const availability = await context.inTransaction(() => stocks.availability(fixture.skuId));
      expect(availability?.available).toBe(20);
    });

    it('never lets on-hand go negative', async () => {
      await seedStock(5);
      const id = await reserve(5);
      await context.inTransaction(() => stocks.consumeReservation(id, actor));

      // The CHECK is the last line of defence behind the availability guard.
      const error = await failureOf(() =>
        context.inTransaction(() => stocks.adjust(fixture.skuId, -1, 'over-consume', actor)),
      );

      expect(error.kind).toBe('INVARIANT_VIOLATION');
    });
  });

  describe('official reservation eligibility (G-DB7-27)', () => {
    it('refuses to create a reservation when the deposit is not satisfied', async () => {
      await seedStock(100);
      await context.disposable.client.db.execute(
        sql`update payment_obligations set status = 'PENDING', satisfied_at = null, satisfied_by_attempt_id = null where order_id = ${fixture.orderId}`,
      );

      const error = await failureOf(() =>
        context.inTransaction(() =>
          stocks.createReservation({
            id: newId() as ReservationId,
            skuId: fixture.skuId,
            orderId: fixture.orderId,
            quantity: 5,
            actor,
          }),
        ),
      );

      expect(error.code).toBe('RESERVATION_NOT_ELIGIBLE');
    });

    it('refuses to convert a hold when the deposit is not satisfied', async () => {
      await seedStock(100);
      const holdId = newId() as SoftHoldId;
      await context.inTransaction(() =>
        stocks.createSoftHold({
          id: holdId,
          skuId: fixture.skuId,
          customRequestId: fixture.customRequestId,
          quantity: 5,
          expiresAt: new Date(Date.now() + HOUR_MS),
          actor,
        }),
      );
      await context.disposable.client.db.execute(
        sql`update payment_obligations set status = 'PENDING', satisfied_at = null, satisfied_by_attempt_id = null where order_id = ${fixture.orderId}`,
      );

      const error = await failureOf(() =>
        context.inTransaction(() =>
          stocks.convertHold({
            holdId,
            reservationId: newId() as ReservationId,
            orderId: fixture.orderId,
            actor,
          }),
        ),
      );

      expect(error.code).toBe('RESERVATION_NOT_ELIGIBLE');
    });
  });
});
