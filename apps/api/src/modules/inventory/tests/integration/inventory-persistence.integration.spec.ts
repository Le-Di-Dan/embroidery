/**
 * AGG-07 SKU Stock persistence against a real PostgreSQL instance (DB7-CP4).
 *
 * TBL-018..TBL-020 and guards G-DB7-26 (sufficient stock under the anchor
 * lock), G-DB7-28 (hold → reservation), G-DB7-29 (every change appends a
 * ledger entry) and G-DB7-30 (an adjustment states its reason).
 *
 * Reservations (TBL-021) and G-DB7-27 are `inventory-reservations.integration.spec.ts`.
 *
 * **Single-run only.** Nothing here proves the absence of oversubscription
 * under concurrent load — that is DB8 CC-20/21/22.
 */
import { isPersistenceError, newId } from '@embroidery/database';
import type { PersistenceError } from '@embroidery/database';

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

describe('inventory persistence (integration)', () => {
  let context: PersistenceTestContext;
  let stocks: SkuStockRepository;
  let fixture: InventoryFixture;

  beforeAll(async () => {
    context = await createPersistenceTestContext('cp4-inventory', [InventoryModule]);
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

  describe('stock record and adjustment', () => {
    it('creates the stock row idempotently', async () => {
      const first = await seedStock(50);
      const again = await seedStock(999);

      // The second call returns the existing row, not a second one.
      expect(again.id).toBe(first.id);
      expect(again.quantityOnHand).toBe(50);
    });

    it('adjusts on hand and appends the ledger entry that explains it (G-DB7-29)', async () => {
      await seedStock(100);

      const adjusted = await context.inTransaction(() =>
        stocks.adjust(fixture.skuId, 20, 'stock count correction', actor),
      );

      expect(adjusted.quantityOnHand).toBe(120);
      const ledger = await stocks.listLedger(fixture.skuId);
      expect(ledger).toHaveLength(1);
      expect(ledger[0]).toMatchObject({ entryKind: 'ADJUSTMENT', onHandDelta: 20 });
    });

    it('rejects a blank adjustment reason (G-DB7-30)', async () => {
      await seedStock(100);

      // The CHECK tests NOT NULL; the blank case is the application's. Stock
      // that changed for no recorded reason cannot be reconciled.
      const error = await failureOf(() =>
        context.inTransaction(() => stocks.adjust(fixture.skuId, 10, '   ', actor)),
      );

      expect(error.code).toBe('ADJUSTMENT_REASON_REQUIRED');
    });

    it('rejects a no-op adjustment', async () => {
      await seedStock(100);

      const error = await failureOf(() =>
        context.inTransaction(() => stocks.adjust(fixture.skuId, 0, 'nothing', actor)),
      );

      expect(error.code).toBe('ADJUSTMENT_EMPTY');
    });

    it('leaves no ledger entry behind a rejected adjustment', async () => {
      await seedStock(100);

      await expect(
        context.inTransaction(() => stocks.adjust(fixture.skuId, 10, '', actor)),
      ).rejects.toBeDefined();

      await expect(stocks.listLedger(fixture.skuId)).resolves.toEqual([]);
      await expect(stocks.findBySku(fixture.skuId)).resolves.toMatchObject({ quantityOnHand: 100 });
    });

    it('refuses to adjust outside a transaction', async () => {
      await seedStock(100);

      await expect(stocks.adjust(fixture.skuId, 5, 'reason', actor)).rejects.toThrow(
        /must run inside a transaction/,
      );
    });
  });

  describe('availability (G-DB7-26)', () => {
    it('subtracts active holds and reservations from on-hand', async () => {
      await seedStock(100);
      await context.inTransaction(() =>
        stocks.createSoftHold({
          id: newId() as SoftHoldId,
          skuId: fixture.skuId,
          customRequestId: fixture.customRequestId,
          quantity: 30,
          expiresAt: new Date(Date.now() + HOUR_MS),
          actor,
        }),
      );
      await context.inTransaction(() =>
        stocks.createReservation({
          id: newId() as ReservationId,
          skuId: fixture.skuId,
          orderId: fixture.orderId,
          quantity: 20,
          actor,
        }),
      );

      const availability = await context.inTransaction(() => stocks.availability(fixture.skuId));

      expect(availability).toMatchObject({
        quantityOnHand: 100,
        heldQuantity: 30,
        reservedQuantity: 20,
        available: 50,
      });
    });

    it('rejects a hold larger than what is available', async () => {
      await seedStock(10);

      const error = await failureOf(() =>
        context.inTransaction(() =>
          stocks.createSoftHold({
            id: newId() as SoftHoldId,
            skuId: fixture.skuId,
            customRequestId: fixture.customRequestId,
            quantity: 11,
            expiresAt: new Date(Date.now() + HOUR_MS),
            actor,
          }),
        ),
      );

      expect(error.code).toBe('INSUFFICIENT_STOCK');
    });

    it('counts an existing hold against a later reservation', async () => {
      await seedStock(10);
      await context.inTransaction(() =>
        stocks.createSoftHold({
          id: newId() as SoftHoldId,
          skuId: fixture.skuId,
          customRequestId: fixture.customRequestId,
          quantity: 8,
          expiresAt: new Date(Date.now() + HOUR_MS),
          actor,
        }),
      );

      // 10 on hand, 8 held: only 2 remain available.
      const error = await failureOf(() =>
        context.inTransaction(() =>
          stocks.createReservation({
            id: newId() as ReservationId,
            skuId: fixture.skuId,
            orderId: fixture.orderId,
            quantity: 3,
            actor,
          }),
        ),
      );

      expect(error.code).toBe('INSUFFICIENT_STOCK');
    });

    it('rejects a non-positive quantity', async () => {
      await seedStock(10);

      const error = await failureOf(() =>
        context.inTransaction(() =>
          stocks.createReservation({
            id: newId() as ReservationId,
            skuId: fixture.skuId,
            orderId: fixture.orderId,
            quantity: 0,
            actor,
          }),
        ),
      );

      expect(error.code).toBe('QUANTITY_INVALID');
    });

    it('frees availability again once a hold is released', async () => {
      await seedStock(10);
      const holdId = newId() as SoftHoldId;
      await context.inTransaction(() =>
        stocks.createSoftHold({
          id: holdId,
          skuId: fixture.skuId,
          customRequestId: fixture.customRequestId,
          quantity: 10,
          expiresAt: new Date(Date.now() + HOUR_MS),
          actor,
        }),
      );

      await context.inTransaction(() => stocks.releaseSoftHold(holdId, 'expired', actor));

      const availability = await context.inTransaction(() => stocks.availability(fixture.skuId));
      expect(availability?.available).toBe(10);
    });
  });

  describe('soft holds', () => {
    it('allows one active hold per request and SKU', async () => {
      await seedStock(100);
      const place = () =>
        context.inTransaction(() =>
          stocks.createSoftHold({
            id: newId() as SoftHoldId,
            skuId: fixture.skuId,
            customRequestId: fixture.customRequestId,
            quantity: 5,
            expiresAt: new Date(Date.now() + HOUR_MS),
            actor,
          }),
        );
      await place();

      const error = await failureOf(place);

      expect(error.code).toBe('SOFT_HOLD_ALREADY_ACTIVE');
    });

    it('refuses to release a hold that is not active', async () => {
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
      await context.inTransaction(() => stocks.releaseSoftHold(holdId, 'first', actor));

      const error = await failureOf(() =>
        context.inTransaction(() => stocks.releaseSoftHold(holdId, 'again', actor)),
      );

      expect(error.code).toBe('HOLD_NOT_ACTIVE');
    });
  });

  describe('hold conversion (G-DB7-28)', () => {
    async function placeHold(quantity = 10): Promise<SoftHoldId> {
      const holdId = newId() as SoftHoldId;
      await context.inTransaction(() =>
        stocks.createSoftHold({
          id: holdId,
          skuId: fixture.skuId,
          customRequestId: fixture.customRequestId,
          quantity,
          expiresAt: new Date(Date.now() + HOUR_MS),
          actor,
        }),
      );
      return holdId;
    }

    it('converts a held quantity into a reservation, keeping availability stable', async () => {
      await seedStock(100);
      const holdId = await placeHold(10);

      const reservation = await context.inTransaction(() =>
        stocks.convertHold({
          holdId,
          reservationId: newId() as ReservationId,
          orderId: fixture.orderId,
          actor,
        }),
      );

      expect(reservation.quantity).toBe(10);
      const availability = await context.inTransaction(() => stocks.availability(fixture.skuId));
      // The claim moved from hold to reservation; the total claimed is unchanged.
      expect(availability).toMatchObject({ heldQuantity: 0, reservedQuantity: 10, available: 90 });
    });

    it('writes both ledger entries in one transaction', async () => {
      await seedStock(100);
      const holdId = await placeHold(10);

      await context.inTransaction(() =>
        stocks.convertHold({
          holdId,
          reservationId: newId() as ReservationId,
          orderId: fixture.orderId,
          actor,
        }),
      );

      // The ledger must never show a quantity held by nothing.
      const kinds = (await stocks.listLedger(fixture.skuId)).map((entry) => entry.entryKind);
      expect(kinds).toEqual(['HOLD_PLACED', 'HOLD_CONVERTED', 'RESERVED']);
    });

    it('refuses to convert a hold that is no longer held', async () => {
      await seedStock(100);
      const holdId = await placeHold(10);
      await context.inTransaction(() => stocks.releaseSoftHold(holdId, 'released', actor));

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

      expect(error.code).toBe('HOLD_NOT_ACTIVE');
    });

    it('leaves the hold untouched when the conversion fails', async () => {
      await seedStock(100);
      const holdId = await placeHold(10);

      // An order that does not exist: the FK rejects the reservation.
      await expect(
        context.inTransaction(() =>
          stocks.convertHold({
            holdId,
            reservationId: newId() as ReservationId,
            orderId: newId(),
            actor,
          }),
        ),
      ).rejects.toBeDefined();

      await expect(stocks.findHold(holdId)).resolves.toMatchObject({ status: 'HELD' });
    });
  });
});
