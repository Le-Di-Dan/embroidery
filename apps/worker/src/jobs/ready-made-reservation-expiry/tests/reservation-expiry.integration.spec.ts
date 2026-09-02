/**
 * `APP12-B02` §20/§21 — the Ready-Made reservation-expiry sweep against real
 * PostgreSQL (`BR-025`, `BR-026`).
 *
 * The eligibility half is where a sweep that releases *stock* earns trust or
 * loses it, so every case that must **not** be touched is seeded next to one
 * that must: a custom no-expiry reservation, a reservation whose window has not
 * yet elapsed, one whose order has moved past the pre-payment window, and one
 * already terminalized. A predicate that quietly widened would fail here rather
 * than pass with fewer rows left over.
 *
 * The whole `WorkerModule` is composed, on the `order-conversion-context.ts`
 * precedent: the startup gate the poll runtime injects is bound by
 * **composition** in `WorkerModule` (APP2-I03) rather than by the runtime
 * module that declares the runtime, so a graph rooted at one capability module
 * cannot resolve it. The gate is then overridden **closed**, and `init()` is
 * deliberately never called — so no poll loop and no schedule ever runs, and
 * every case here drives one sweep pass explicitly. The assertion is therefore
 * about what a pass does rather than about when it happened.
 *
 * Object storage is pointed at an unroutable endpoint for the same reason the
 * APP5 cleanup suite does it: this sweep touches no object store, and the
 * config must merely be *valid*, never reachable.
 */
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
// The sanctioned raw-SQL boundary (ADR-DB1-002): the worker application must
// never depend on the ORM or the driver, not even in a test.
import { executeRaw, newId, sql } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { createDisposableDatabase } from '@embroidery/database/testing';

import { WorkerModule } from '../../../bootstrap/worker.module';
import { WORKER_PROCESS } from '../../../runtime/lifecycle/worker-process';
import { WORKER_STARTUP_GATE } from '../../../runtime/startup/startup-gate';
import { ExpireReadyMadeReservationsUseCase } from '../application/expire-reservations.usecase';

/** Valid but unroutable: this sweep never contacts an object store. */
const OFFLINE_STORAGE_ENV: Readonly<Record<string, string>> = {
  OBJECT_STORAGE_PROVIDER: 's3',
  OBJECT_STORAGE_ENDPOINT: 'http://app12-b02-expiry.invalid:9000',
  OBJECT_STORAGE_REGION: 'us-east-1',
  OBJECT_STORAGE_ACCESS_KEY_ID: 'app12-b02-expiry',
  OBJECT_STORAGE_SECRET_ACCESS_KEY: 'app12-b02-expiry',
  OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
  OBJECT_STORAGE_ORIGINALS_BUCKET: 'app12-b02-originals',
  OBJECT_STORAGE_DERIVATIVES_BUCKET: 'app12-b02-derivatives',
};

interface SeededOrder {
  readonly orderId: string;
  readonly reservationId: string;
  readonly skuStockId: string;
  readonly skuId: string;
}

describe('APP12-B02 Ready-Made reservation expiry (integration)', () => {
  let disposable: DisposableDatabase;
  let moduleRef: TestingModule;
  let expiry: ExpireReadyMadeReservationsUseCase;
  let restoreEnv: () => void;

  beforeAll(async () => {
    const previous = new Map<string, string | undefined>();
    for (const [name, value] of Object.entries(OFFLINE_STORAGE_ENV)) {
      previous.set(name, process.env[name]);
      process.env[name] = value;
    }

    disposable = await createDisposableDatabase('app12-b02-expiry');
    const previousUrl = process.env['DATABASE_URL'];
    const previousNodeEnv = process.env['NODE_ENV'];
    process.env['DATABASE_URL'] = disposable.url;
    process.env['NODE_ENV'] = 'test';

    restoreEnv = (): void => {
      for (const [name, value] of previous) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      if (previousUrl === undefined) delete process.env['DATABASE_URL'];
      else process.env['DATABASE_URL'] = previousUrl;
      if (previousNodeEnv === undefined) delete process.env['NODE_ENV'];
      else process.env['NODE_ENV'] = previousNodeEnv;
    };

    moduleRef = await Test.createTestingModule({ imports: [WorkerModule] })
      .overrideProvider(WORKER_PROCESS)
      .useValue({ exit: () => undefined })
      // Closed on purpose: nothing here needs the poll loop, and a closed gate
      // guarantees it could not claim anything even if it were started.
      .overrideProvider(WORKER_STARTUP_GATE)
      .useValue({ ensureReady: () => Promise.resolve({ ok: false, errorClass: 'TEST_HELD' }) })
      .compile();
    expiry = moduleRef.get(ExpireReadyMadeReservationsUseCase);
  }, 240_000);

  afterAll(async () => {
    await moduleRef?.close();
    await disposable?.drop();
    restoreEnv?.();
  });

  beforeEach(async () => {
    await executeRaw(
      disposable.client.db,
      sql`truncate inventory_ledger_entries, inventory_reservations, sku_stocks,
                   order_transitions, order_items, orders, skus, product_variants,
                   products, categories, customers cascade`,
    );
  });

  const db = () => disposable.client.db;

  /** A published catalog chain, a stocked SKU and a customer. */
  async function seedCatalog(quantityOnHand = 10): Promise<{
    customerId: string;
    skuId: string;
    skuStockId: string;
  }> {
    const customerId = newId();
    const categoryId = newId();
    const productId = newId();
    const variantId = newId();
    const skuId = newId();
    const skuStockId = newId();

    await executeRaw(
      db(),
      sql`insert into customers (id, display_name, verified_at)
          values (${customerId}, 'Expiry Customer', now())`,
    );
    await executeRaw(
      db(),
      sql`insert into categories (id, name, slug, status, display_order, is_indexable)
          values (${categoryId}, 'Cat', ${`cat-${categoryId}`}, 'PUBLISHED', 1, true)`,
    );
    await executeRaw(
      db(),
      sql`insert into products
            (id, category_id, name, slug, base_price_amount, currency_code, status,
             is_display_out_of_stock, display_order, is_indexable)
          values (${productId}, ${categoryId}, 'Tee', ${`tee-${productId}`}, 150000, 'VND',
                  'PUBLISHED', false, 1, true)`,
    );
    await executeRaw(
      db(),
      sql`insert into product_variants
            (id, product_id, color_name, size_label, display_order, is_active)
          values (${variantId}, ${productId}, 'Black', 'M', 1, true)`,
    );
    await executeRaw(
      db(),
      sql`insert into skus (id, product_variant_id, code, currency_code, is_active)
          values (${skuId}, ${variantId}, ${`SKU-${skuId}`}, 'VND', true)`,
    );
    await executeRaw(
      db(),
      sql`insert into sku_stocks (id, sku_id, quantity_on_hand)
          values (${skuStockId}, ${skuId}, ${quantityOnHand})`,
    );

    return { customerId, skuId, skuStockId };
  }

  /**
   * A Ready-Made order holding one reservation, with a stated window and status.
   *
   * `expiresInHours` of `undefined` seeds a **no-expiry** reservation, which is
   * what every custom reservation is (`PO-APP8-002`).
   */
  async function seedReadyMadeOrder(options: {
    readonly customerId: string;
    readonly skuStockId: string;
    readonly skuId: string;
    readonly status?: string;
    readonly origin?: string;
    readonly expiresInHours?: number | undefined;
    readonly reservationStatus?: string;
  }): Promise<SeededOrder> {
    const orderId = newId();
    const reservationId = newId();
    const status = options.status ?? 'AWAITING_SHIPPING_FEE';

    await executeRaw(
      db(),
      sql`insert into orders
            (id, code, origin, customer_id, status, total_amount, currency_code)
          values (${orderId}, ${`ORD-${orderId}`}, ${options.origin ?? 'READY_MADE'},
                  ${options.customerId}, ${status}, 150000.00, 'VND')`,
    );
    await executeRaw(
      db(),
      sql`insert into inventory_reservations
            (id, sku_stock_id, order_id, quantity, status, expires_at)
          values (${reservationId}, ${options.skuStockId}, ${orderId}, 3,
                  ${options.reservationStatus ?? 'RESERVED'},
                  ${
                    options.expiresInHours === undefined
                      ? sql`null`
                      : sql`now() + make_interval(hours => ${options.expiresInHours})`
                  })`,
    );

    return { orderId, reservationId, skuStockId: options.skuStockId, skuId: options.skuId };
  }

  /**
   * One `FULL` obligation on a Ready-Made order (`APP12-B03` §24).
   *
   * `source_quotation_version_id` stays null, which
   * `ck_payment_obligations__source_by_kind` requires of a `FULL`. A
   * `SATISFIED` one additionally needs real evidence
   * (`ck_payment_obligations__satisfied_evidence_required`), so a genuine
   * `SUCCEEDED` attempt is written for the same amount rather than the
   * constraint being worked around.
   */
  async function seedFullObligation(orderId: string, status: string): Promise<string> {
    const obligationId = newId();
    await executeRaw(
      db(),
      sql`insert into payment_obligations
            (id, order_id, kind, amount, currency_code, status, source_quotation_version_id)
          values (${obligationId}, ${orderId}, 'FULL', 180000.00, 'VND', 'PENDING', null)`,
    );

    if (status === 'SATISFIED') {
      const attemptId = newId();
      await executeRaw(
        db(),
        sql`insert into payment_attempts
              (id, payment_obligation_id, amount, currency_code, method, status, succeeded_at)
            values (${attemptId}, ${obligationId}, 180000.00, 'VND',
                    'BANK_TRANSFER', 'SUCCEEDED', now())`,
      );
      await executeRaw(
        db(),
        sql`update payment_obligations
            set status = 'SATISFIED', satisfied_at = now(), satisfied_by_attempt_id = ${attemptId}
            where id = ${obligationId}`,
      );
    }
    return obligationId;
  }

  async function obligationStatusOf(obligationId: string): Promise<string> {
    const rows = await executeRaw<{ status: string }>(
      db(),
      sql`select status from payment_obligations where id = ${obligationId}`,
    );
    return String(rows[0]?.status);
  }

  async function obligationCountOf(orderId: string): Promise<number> {
    const rows = await executeRaw<{ n: string }>(
      db(),
      sql`select count(*)::text as n from payment_obligations where order_id = ${orderId}`,
    );
    return Number(rows[0]?.n ?? '0');
  }

  async function reservationStatusOf(reservationId: string): Promise<string> {
    const rows = await executeRaw<{ status: string }>(
      db(),
      sql`select status from inventory_reservations where id = ${reservationId}`,
    );
    return String(rows[0]?.status);
  }

  async function orderStatusOf(orderId: string): Promise<{
    status: string;
    cancelled_reason: string | null;
  }> {
    const rows = await executeRaw<{ status: string; cancelled_reason: string | null }>(
      db(),
      sql`select status, cancelled_reason from orders where id = ${orderId}`,
    );
    return { status: String(rows[0]?.status), cancelled_reason: rows[0]?.cancelled_reason ?? null };
  }

  describe('a lapsed Ready-Made reservation', () => {
    it('expires the reservation, cancels the order and returns the stock', async () => {
      const catalog = await seedCatalog(10);
      const seeded = await seedReadyMadeOrder({ ...catalog, expiresInHours: -1 });

      const outcome = await expiry.run();
      expect(outcome).toEqual({ examined: 1, expired: 1, skipped: 0 });

      expect(await reservationStatusOf(seeded.reservationId)).toBe('EXPIRED');

      const order = await orderStatusOf(seeded.orderId);
      expect(order.status).toBe('CANCELLED');
      // `ck_orders__cancelled_reason_required` — evidence, not a bare status.
      expect(order.cancelled_reason).toContain('expired');

      // Availability returns because the RESERVED row is gone from the sum;
      // on-hand never moved, because the goods never left.
      const stock = await executeRaw<{ quantity_on_hand: number }>(
        db(),
        sql`select quantity_on_hand from sku_stocks where id = ${seeded.skuStockId}`,
      );
      expect(stock[0]?.quantity_on_hand).toBe(10);
    });

    it('appends one RESERVATION_EXPIRED ledger entry attributed to the sweep', async () => {
      const catalog = await seedCatalog();
      const seeded = await seedReadyMadeOrder({ ...catalog, expiresInHours: -1 });
      await expiry.run();

      const entries = await executeRaw<{
        entry_kind: string;
        quantity: number;
        on_hand_delta: number;
        reason: string | null;
        actor_kind: string;
        system_job_key: string | null;
      }>(
        db(),
        sql`select entry_kind, quantity, on_hand_delta, reason, actor_kind, system_job_key
              from inventory_ledger_entries where reservation_id = ${seeded.reservationId}`,
      );

      expect(entries).toHaveLength(1);
      expect(entries[0]?.entry_kind).toBe('RESERVATION_EXPIRED');
      expect(entries[0]?.quantity).toBe(3);
      expect(entries[0]?.on_hand_delta).toBe(0);
      expect(entries[0]?.actor_kind).toBe('SYSTEM');
      expect(entries[0]?.system_job_key).toBe('inventory.readyMade.reservationExpiry');
    });

    it('records the cancellation as an order transition', async () => {
      const catalog = await seedCatalog();
      const seeded = await seedReadyMadeOrder({ ...catalog, expiresInHours: -1 });
      await expiry.run();

      const transitions = await executeRaw<{
        from_status: string;
        to_status: string;
        event_kind: string;
        actor_kind: string;
        reason: string | null;
        system_job_key: string | null;
      }>(
        db(),
        sql`select from_status, to_status, event_kind, actor_kind, reason, system_job_key
              from order_transitions where order_id = ${seeded.orderId}`,
      );

      expect(transitions).toHaveLength(1);
      expect(transitions[0]?.from_status).toBe('AWAITING_SHIPPING_FEE');
      expect(transitions[0]?.to_status).toBe('CANCELLED');
      // `ORDER_TRANSITION_EVENT_KINDS` has no expiry member, so the move is an
      // ordinary state change and the cause lives in the reason column.
      expect(transitions[0]?.event_kind).toBe('STATE_CHANGE');
      expect(transitions[0]?.actor_kind).toBe('SYSTEM');
      expect(transitions[0]?.system_job_key).toBe('inventory.readyMade.reservationExpiry');
      expect(transitions[0]?.reason).toContain('expired');
    });

    it('is idempotent — a second pass finds nothing and writes nothing', async () => {
      const catalog = await seedCatalog();
      const seeded = await seedReadyMadeOrder({ ...catalog, expiresInHours: -1 });

      await expiry.run();
      const second = await expiry.run();

      expect(second).toEqual({ examined: 0, expired: 0, skipped: 0 });
      // No double release: exactly one terminal ledger entry, ever.
      const entries = await executeRaw<{ n: string }>(
        db(),
        sql`select count(*) as n from inventory_ledger_entries
             where reservation_id = ${seeded.reservationId}`,
      );
      expect(Number(entries[0]?.n)).toBe(1);
    });

    it('also expires a lapsed reservation on an AWAITING_PAYMENT order', async () => {
      const catalog = await seedCatalog();
      const seeded = await seedReadyMadeOrder({
        ...catalog,
        status: 'AWAITING_PAYMENT',
        expiresInHours: -1,
      });

      expect((await expiry.run()).expired).toBe(1);
      expect(await reservationStatusOf(seeded.reservationId)).toBe('EXPIRED');
      expect((await orderStatusOf(seeded.orderId)).status).toBe('CANCELLED');
    });
  });

  /**
   * `APP12-B03` §24, §25, §40 — the payment window, and the obligation that
   * only the second expirable state has.
   */
  describe('the payment window of a priced order', () => {
    it('cancels the live PENDING FULL alongside the reservation and the order', async () => {
      const catalog = await seedCatalog();
      const seeded = await seedReadyMadeOrder({
        ...catalog,
        status: 'AWAITING_PAYMENT',
        expiresInHours: -1,
      });
      const obligationId = await seedFullObligation(seeded.orderId, 'PENDING');

      expect((await expiry.run()).expired).toBe(1);

      expect(await reservationStatusOf(seeded.reservationId)).toBe('EXPIRED');
      expect((await orderStatusOf(seeded.orderId)).status).toBe('CANCELLED');
      // `cancel` produces CANCELLED and never writes the supersession pointer:
      // a lapsed obligation is withdrawn, not replaced.
      expect(await obligationStatusOf(obligationId)).toBe('CANCELLED');
    });

    it('is idempotent — a second sweep finds nothing and cancels nothing twice', async () => {
      const catalog = await seedCatalog();
      const seeded = await seedReadyMadeOrder({
        ...catalog,
        status: 'AWAITING_PAYMENT',
        expiresInHours: -1,
      });
      const obligationId = await seedFullObligation(seeded.orderId, 'PENDING');

      expect((await expiry.run()).expired).toBe(1);
      const second = await expiry.run();

      expect(second.expired).toBe(0);
      expect(await obligationStatusOf(obligationId)).toBe('CANCELLED');
      expect((await orderStatusOf(seeded.orderId)).status).toBe('CANCELLED');
    });

    it('leaves a SATISFIED FULL alone, and the order with it', async () => {
      const catalog = await seedCatalog();
      const seeded = await seedReadyMadeOrder({
        ...catalog,
        status: 'AWAITING_PAYMENT',
        expiresInHours: -1,
      });
      const obligationId = await seedFullObligation(seeded.orderId, 'SATISFIED');

      // The sweep still expires the stock here, because `APP12-B05` is what
      // will make a paid order stop being expiry-eligible. What matters at B03
      // is that settled money is never withdrawn: `cancel` moves `PENDING`
      // alone, so the obligation is untouched either way.
      await expiry.run();
      expect(await obligationStatusOf(obligationId)).toBe('SATISFIED');
    });

    it('still expires a first-window order that has no obligation at all', async () => {
      // §25 — requiring a payment row here would break every checkout abandoned
      // before it was ever priced, which is the ordinary case.
      const catalog = await seedCatalog();
      const seeded = await seedReadyMadeOrder({ ...catalog, expiresInHours: -1 });

      expect((await expiry.run()).expired).toBe(1);
      expect(await reservationStatusOf(seeded.reservationId)).toBe('EXPIRED');
      expect((await orderStatusOf(seeded.orderId)).status).toBe('CANCELLED');
      expect(await obligationCountOf(seeded.orderId)).toBe(0);
    });
  });

  describe('what the sweep must never touch', () => {
    it('leaves a reservation whose window has not yet elapsed', async () => {
      const catalog = await seedCatalog();
      const seeded = await seedReadyMadeOrder({ ...catalog, expiresInHours: 1 });

      expect(await expiry.run()).toEqual({ examined: 0, expired: 0, skipped: 0 });
      expect(await reservationStatusOf(seeded.reservationId)).toBe('RESERVED');
      expect((await orderStatusOf(seeded.orderId)).status).toBe('AWAITING_SHIPPING_FEE');
    });

    it('leaves a no-expiry reservation, which is what every custom one is', async () => {
      const catalog = await seedCatalog();
      const seeded = await seedReadyMadeOrder({ ...catalog, expiresInHours: undefined });

      expect(await expiry.run()).toEqual({ examined: 0, expired: 0, skipped: 0 });
      expect(await reservationStatusOf(seeded.reservationId)).toBe('RESERVED');
    });

    it('leaves a lapsed reservation whose order has moved past the pre-payment window', async () => {
      const catalog = await seedCatalog();
      const seeded = await seedReadyMadeOrder({
        ...catalog,
        status: 'READY_FOR_DELIVERY',
        expiresInHours: -1,
      });

      // Stock that has been paid for is not released by a stale timestamp.
      expect(await expiry.run()).toEqual({ examined: 0, expired: 0, skipped: 0 });
      expect(await reservationStatusOf(seeded.reservationId)).toBe('RESERVED');
      expect((await orderStatusOf(seeded.orderId)).status).toBe('READY_FOR_DELIVERY');
    });

    it('leaves an already-terminalized reservation', async () => {
      const catalog = await seedCatalog();
      const seeded = await seedReadyMadeOrder({
        ...catalog,
        expiresInHours: -1,
        reservationStatus: 'CONSUMED',
      });

      expect(await expiry.run()).toEqual({ examined: 0, expired: 0, skipped: 0 });
      expect(await reservationStatusOf(seeded.reservationId)).toBe('CONSUMED');
      expect((await orderStatusOf(seeded.orderId)).status).toBe('AWAITING_SHIPPING_FEE');
    });
  });

  describe('a mixed backlog', () => {
    it('expires only the due Ready-Made rows and leaves the rest untouched', async () => {
      const catalog = await seedCatalog(50);
      const due = await seedReadyMadeOrder({ ...catalog, expiresInHours: -2 });
      const alsoDue = await seedReadyMadeOrder({
        ...catalog,
        status: 'AWAITING_PAYMENT',
        expiresInHours: -1,
      });
      const notYet = await seedReadyMadeOrder({ ...catalog, expiresInHours: 5 });
      const noExpiry = await seedReadyMadeOrder({ ...catalog, expiresInHours: undefined });

      expect(await expiry.run()).toEqual({ examined: 2, expired: 2, skipped: 0 });

      expect(await reservationStatusOf(due.reservationId)).toBe('EXPIRED');
      expect(await reservationStatusOf(alsoDue.reservationId)).toBe('EXPIRED');
      expect(await reservationStatusOf(notYet.reservationId)).toBe('RESERVED');
      expect(await reservationStatusOf(noExpiry.reservationId)).toBe('RESERVED');
    });
  });
});
