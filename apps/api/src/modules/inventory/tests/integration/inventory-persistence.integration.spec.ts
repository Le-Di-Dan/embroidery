/**
 * AGG-07 SKU Stock persistence against a real PostgreSQL instance (DB7-CP4).
 *
 * TBL-018..TBL-021 and guards G-DB7-26 (sufficient stock under the anchor
 * lock), G-DB7-28 (hold → reservation), G-DB7-29 (every change appends a
 * ledger entry) and G-DB7-30 (an adjustment states its reason).
 *
 * **Single-run only.** Nothing here proves the absence of oversubscription
 * under concurrent load — that is DB8 CC-20/21/22.
 */
import { isPersistenceError, newId } from '@embroidery/database';
import type { PersistenceError } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { SkuId } from '../../../catalog/domain/repositories/placement-hierarchy.port';
import { InventoryModule } from '../../inventory.module';
import { SKU_STOCK_REPOSITORY } from '../../domain/repositories/sku-stock.repository';
import type {
  InventoryActor,
  ReservationId,
  SkuStockId,
  SkuStockRepository,
  SoftHoldId,
} from '../../domain/repositories/sku-stock.repository';

const HOUR_MS = 60 * 60 * 1000;

describe('inventory persistence (integration)', () => {
  let context: PersistenceTestContext;
  let stocks: SkuStockRepository;
  let skuId: SkuId;
  let customRequestId: string;
  let orderId: string;

  beforeAll(async () => {
    context = await createPersistenceTestContext('cp4-inventory', [InventoryModule]);
    stocks = context.get(SKU_STOCK_REPOSITORY);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await seedCatalogAndOrder();
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

  /**
   * Seeds the SKU a stock row hangs off, plus a request and an order that
   * holds and reservations reference. Raw SQL: this is setup for the inventory
   * guards, not a test of the other contexts.
   */
  async function seedCatalogAndOrder(): Promise<void> {
    const db = context.disposable.client.db;
    const categoryId = newId();
    const productId = newId();
    const variantId = newId();
    const customerId = newId();
    const quotationId = newId();
    const quotationVersionId = newId();
    const designCaseId = newId();
    const designVersionId = newId();
    const approvalId = newId();
    const grantId = newId();
    const challengeId = newId();
    const contactId = newId();
    const assetId = newId();
    const sideId = newId();
    const areaId = newId();

    skuId = newId() as SkuId;
    customRequestId = newId();
    orderId = newId();

    await db.execute(sql`
      insert into customers (id, display_name, verified_at)
      values (${customerId}, 'Stock Customer', now())
    `);
    await db.execute(sql`
      insert into customer_contact_points
        (id, customer_id, contact_kind, normalized_value, display_value, is_primary, verified_at, verified_source)
      values (${contactId}, ${customerId}, 'EMAIL', ${`inv-${customerId}@example.com`},
              ${`inv-${customerId}@example.com`}, true, now(), 'OTP')
    `);
    await db.execute(sql`
      insert into categories (id, name, slug, status, display_order, is_indexable)
      values (${categoryId}, 'Cat', ${`cat-${categoryId}`}, 'PUBLISHED', 1, true)
    `);
    await db.execute(sql`
      insert into products
        (id, category_id, name, slug, base_price_amount, currency_code, status,
         is_display_out_of_stock, display_order, is_indexable)
      values (${productId}, ${categoryId}, 'Tee', ${`tee-${productId}`}, 150000, 'VND',
              'PUBLISHED', false, 1, true)
    `);
    await db.execute(sql`
      insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
      values (${variantId}, ${productId}, 'Black', 'M', 1, true)
    `);
    await db.execute(sql`
      insert into skus (id, product_variant_id, code, currency_code, is_active)
      values (${skuId}, ${variantId}, ${`SKU-${skuId}`}, 'VND', true)
    `);
    await db.execute(sql`
      insert into custom_requests (id, code, customer_id, status)
      values (${customRequestId}, ${`REQ-${customRequestId}`}, ${customerId}, 'APPROVED')
    `);

    // An order the reservations attach to, with the chain it requires.
    await db.execute(sql`
      insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
      values (${assetId}, 'CATALOG_MEDIA', 'PUBLIC', ${`c/${assetId}.png`}, 'image/png', 512, 'ACCEPTED')
    `);
    await db.execute(sql`
      insert into product_sides
        (id, product_id, name, background_asset_id, image_width_px, image_height_px,
         physical_width_mm, physical_height_mm, px_per_mm, display_order)
      values (${sideId}, ${productId}, 'Front', ${assetId}, 1000, 1200, 400, 480, 2.5, 1)
    `);
    await db.execute(sql`
      insert into embroidery_areas
        (id, product_side_id, name, bound_x_px, bound_y_px, bound_width_px, bound_height_px, display_order)
      values (${areaId}, ${sideId}, 'Chest', 100, 150, 300, 200, 1)
    `);
    await db.execute(sql`
      insert into secure_access_grants
        (id, customer_id, custom_request_id, token_hash, scope_kind, status, expires_at)
      values (${grantId}, ${customerId}, ${customRequestId}, ${`h-${grantId}`},
              'REQUEST_ACCESS', 'ACTIVE', now() + interval '1 hour')
    `);
    await db.execute(sql`
      insert into contact_verification_challenges
        (id, contact_point_id, contact_kind, normalized_value, purpose, code_hash, status, expires_at, verified_at)
      values (${challengeId}, ${contactId}, 'EMAIL', ${`inv-${customerId}@example.com`},
              'STEP_UP', 'h', 'VERIFIED', now() + interval '1 hour', now())
    `);
    await db.execute(sql`
      insert into quotations (id, code, custom_request_id, status)
      values (${quotationId}, ${`QUO-${quotationId}`}, ${customRequestId}, 'ACCEPTED')
    `);
    await db.execute(sql`
      insert into quotation_versions
        (id, quotation_id, version, status, quantity_total, subtotal_amount,
         manual_adjustment_amount, shipping_fee_amount, total_amount,
         deposit_percent, deposit_amount, remaining_amount, currency_code, accepted_at)
      values (${quotationVersionId}, ${quotationId}, 1, 'ACCEPTED', 10, 1000000.00,
              0.00, 0.00, 1000000.00, 30.00, 300000.00, 700000.00, 'VND', now())
    `);
    await db.execute(sql`
      insert into design_cases (id, custom_request_id) values (${designCaseId}, ${customRequestId})
    `);
    await db.execute(sql`
      insert into design_versions
        (id, design_case_id, version, status, design_document, document_schema_version,
         document_hash, product_id, product_variant_id, product_side_id, embroidery_area_id,
         physical_width_mm, physical_height_mm, approved_at)
      values (${designVersionId}, ${designCaseId}, 1, 'APPROVED', '{}'::jsonb, 1,
              ${`sha256:${'2'.repeat(64)}`}, ${productId}, ${variantId}, ${sideId}, ${areaId},
              100.00, 100.00, now())
    `);
    await db.execute(sql`
      insert into approval_snapshots
        (id, design_version_id, design_case_id, custom_request_id, customer_id, document_hash,
         product_id, product_variant_id, product_side_id, embroidery_area_id,
         product_name, side_name, area_name, physical_width_mm, physical_height_mm,
         quantity_total, grant_id, step_up_challenge_id, approved_at)
      values (${approvalId}, ${designVersionId}, ${designCaseId}, ${customRequestId},
              ${customerId}, ${`sha256:${'2'.repeat(64)}`}, ${productId}, ${variantId},
              ${sideId}, ${areaId}, 'Tee', 'Front', 'Chest', 100.00, 100.00, 10,
              ${grantId}, ${challengeId}, now())
    `);
    await db.execute(sql`
      insert into orders
        (id, code, custom_request_id, customer_id, accepted_quotation_version_id,
         current_approval_snapshot_id, status, total_amount, currency_code)
      values (${orderId}, ${`ORD-${orderId}`}, ${customRequestId}, ${customerId},
              ${quotationVersionId}, ${approvalId}, 'DEPOSIT_PAID', 1000000.00, 'VND')
    `);
  }

  const seedStock = (quantityOnHand = 100) =>
    context.inTransaction(() =>
      stocks.ensureStockRow(newId() as SkuStockId, skuId, quantityOnHand),
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
        stocks.adjust(skuId, 20, 'stock count correction', actor),
      );

      expect(adjusted.quantityOnHand).toBe(120);
      const ledger = await stocks.listLedger(skuId);
      expect(ledger).toHaveLength(1);
      expect(ledger[0]).toMatchObject({ entryKind: 'ADJUSTMENT', onHandDelta: 20 });
    });

    it('rejects a blank adjustment reason (G-DB7-30)', async () => {
      await seedStock(100);

      // The CHECK tests NOT NULL; the blank case is the application's. Stock
      // that changed for no recorded reason cannot be reconciled.
      const error = await failureOf(() =>
        context.inTransaction(() => stocks.adjust(skuId, 10, '   ', actor)),
      );

      expect(error.code).toBe('ADJUSTMENT_REASON_REQUIRED');
    });

    it('rejects a no-op adjustment', async () => {
      await seedStock(100);

      const error = await failureOf(() =>
        context.inTransaction(() => stocks.adjust(skuId, 0, 'nothing', actor)),
      );

      expect(error.code).toBe('ADJUSTMENT_EMPTY');
    });

    it('leaves no ledger entry behind a rejected adjustment', async () => {
      await seedStock(100);

      await expect(
        context.inTransaction(() => stocks.adjust(skuId, 10, '', actor)),
      ).rejects.toBeDefined();

      await expect(stocks.listLedger(skuId)).resolves.toEqual([]);
      await expect(stocks.findBySku(skuId)).resolves.toMatchObject({ quantityOnHand: 100 });
    });

    it('refuses to adjust outside a transaction', async () => {
      await seedStock(100);

      await expect(stocks.adjust(skuId, 5, 'reason', actor)).rejects.toThrow(
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
          skuId,
          customRequestId,
          quantity: 30,
          expiresAt: new Date(Date.now() + HOUR_MS),
          actor,
        }),
      );
      await context.inTransaction(() =>
        stocks.createReservation({
          id: newId() as ReservationId,
          skuId,
          orderId,
          quantity: 20,
          actor,
        }),
      );

      const availability = await context.inTransaction(() => stocks.availability(skuId));

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
            skuId,
            customRequestId,
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
          skuId,
          customRequestId,
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
            skuId,
            orderId,
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
            skuId,
            orderId,
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
          skuId,
          customRequestId,
          quantity: 10,
          expiresAt: new Date(Date.now() + HOUR_MS),
          actor,
        }),
      );

      await context.inTransaction(() => stocks.releaseSoftHold(holdId, 'expired', actor));

      const availability = await context.inTransaction(() => stocks.availability(skuId));
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
            skuId,
            customRequestId,
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
          skuId,
          customRequestId,
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
          skuId,
          customRequestId,
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
          orderId,
          actor,
        }),
      );

      expect(reservation.quantity).toBe(10);
      const availability = await context.inTransaction(() => stocks.availability(skuId));
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
          orderId,
          actor,
        }),
      );

      // The ledger must never show a quantity held by nothing.
      const kinds = (await stocks.listLedger(skuId)).map((entry) => entry.entryKind);
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
            orderId,
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

  describe('reservations', () => {
    async function reserve(quantity = 10): Promise<ReservationId> {
      const id = newId() as ReservationId;
      await context.inTransaction(() =>
        stocks.createReservation({ id, skuId, orderId, quantity, actor }),
      );
      return id;
    }

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
      await expect(stocks.findBySku(skuId)).resolves.toMatchObject({ quantityOnHand: 90 });
      const ledger = await stocks.listLedger(skuId);
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

      const availability = await context.inTransaction(() => stocks.availability(skuId));
      expect(availability?.available).toBe(20);
    });

    it('never lets on-hand go negative', async () => {
      await seedStock(5);
      const id = await reserve(5);
      await context.inTransaction(() => stocks.consumeReservation(id, actor));

      // The CHECK is the last line of defence behind the availability guard.
      const error = await failureOf(() =>
        context.inTransaction(() => stocks.adjust(skuId, -1, 'over-consume', actor)),
      );

      expect(error.kind).toBe('INVARIANT_VIOLATION');
    });
  });
});
