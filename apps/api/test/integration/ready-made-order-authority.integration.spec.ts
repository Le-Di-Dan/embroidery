/**
 * `APP12-B02` — every way `POST /api/public/ready-made-orders` refuses, and
 * every fact it re-derives rather than trusting.
 *
 * The sibling of the `-creation` suite: that one proves what a success commits,
 * this one proves that a refusal commits **nothing** and that no client-observed
 * value survives into the order. Real HTTP, real application, disposable
 * PostgreSQL, nothing mocked.
 */
import { sql } from 'drizzle-orm';

import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import {
  createBody,
  deliveryBody,
  seedAnotherChallenge,
  seedReadyMadeContext,
  type ReadyMadeFixture,
} from '../support/ready-made-order-fixture';

/**
 * The standard envelope. A refusal carries its business code at the top level,
 * exactly where a success carries `READY_MADE_ORDER_CREATED` — the platform
 * mapper promotes the exception payload's `code` there.
 */
interface Envelope {
  readonly code?: string;
  readonly data?: Record<string, unknown>;
  readonly message?: string;
}

describe('APP12-B02 Ready-Made order authority (API)', () => {
  let context: ApiIntegrationTestContext;

  beforeAll(async () => {
    context = await createApiIntegrationContext('app12_b02_authority');
  }, 240_000);

  afterAll(async () => {
    await context?.close();
  });

  const db = () => context.database.client.db;
  const post = (body: unknown) =>
    context.http.post('/api/public/ready-made-orders').send(body as object);

  /** Nothing may have been written for this fixture's customer or SKU. */
  async function expectNoSideEffects(fixture: ReadyMadeFixture): Promise<void> {
    const counts = await db().execute<{
      orders: string;
      reservations: string;
      shipping: string;
      ledger: string;
      idempotency: string;
    }>(sql`
      select (select count(*) from orders where customer_id = ${fixture.customerId}) as orders,
             (select count(*) from inventory_reservations r
                join sku_stocks s on s.id = r.sku_stock_id
               where s.sku_id = ${fixture.skuId}) as reservations,
             (select count(*) from shipping_details d
                join orders o on o.id = d.order_id
               where o.customer_id = ${fixture.customerId}) as shipping,
             (select count(*) from inventory_ledger_entries l
                join sku_stocks s on s.id = l.sku_stock_id
               where s.sku_id = ${fixture.skuId}) as ledger,
             (select count(*) from idempotency_records
               where operation_namespace = 'readyMadeOrder.create'
                 and scope_key = ${fixture.challengeId}) as idempotency
    `);
    const row = counts.rows[0];
    expect(Number(row?.orders)).toBe(0);
    expect(Number(row?.reservations)).toBe(0);
    expect(Number(row?.shipping)).toBe(0);
    expect(Number(row?.ledger)).toBe(0);
    // The claim is rolled back with the work it guarded, so a genuine retry is
    // never blocked by a refusal (`APP12-B02` §23).
    expect(Number(row?.idempotency)).toBe(0);
  }

  describe('verified contact', () => {
    it('refuses an unverified challenge, writing nothing', async () => {
      const fixture = await seedReadyMadeContext(context.database, {
        label: 'unverified',
        challengeStatus: 'ISSUED',
      });
      const response = await post(createBody(fixture)).expect(422);
      expect((response.body as Envelope).code).toBe('VERIFIED_CONTACT_REQUIRED');
      await expectNoSideEffects(fixture);
    });

    it('refuses an expired challenge', async () => {
      const fixture = await seedReadyMadeContext(context.database, {
        label: 'expired',
        challengeExpiresInHours: -1,
      });
      await post(createBody(fixture)).expect(422);
      await expectNoSideEffects(fixture);
    });

    it('refuses a challenge of the wrong purpose', async () => {
      const fixture = await seedReadyMadeContext(context.database, {
        label: 'stepup',
        challengePurpose: 'STEP_UP',
      });
      await post(createBody(fixture)).expect(422);
      await expectNoSideEffects(fixture);
    });

    it('refuses an unknown challenge id with the same answer', async () => {
      const fixture = await seedReadyMadeContext(context.database, { label: 'unknown' });
      const response = await post(
        createBody(fixture, { challengeId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071' }),
      ).expect(422);
      // Indistinguishable from every other identity refusal, so a guessed id
      // cannot be confirmed to exist.
      expect((response.body as Envelope).code).toBe('VERIFIED_CONTACT_REQUIRED');
      await expectNoSideEffects(fixture);
    });

    it('names no contact, customer or challenge in the refusal', async () => {
      const fixture = await seedReadyMadeContext(context.database, {
        label: 'quiet',
        challengeStatus: 'ISSUED',
      });
      const response = await post(createBody(fixture)).expect(422);
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain(fixture.contact);
      expect(serialized).not.toContain(fixture.customerId);
      expect(serialized).not.toContain(fixture.challengeId);
    });
  });

  describe('SKU eligibility, re-read at commit time', () => {
    const cases: readonly [string, Parameters<typeof seedReadyMadeContext>[1]][] = [
      ['an inactive SKU', { label: 'skuoff', skuActive: false }],
      ['an inactive variant', { label: 'varoff', variantActive: false }],
      ['a draft product', { label: 'draft', productStatus: 'DRAFT' }],
      ['an archived product', { label: 'archived', productStatus: 'ARCHIVED' }],
      ['a draft category', { label: 'catdraft', categoryStatus: 'DRAFT' }],
    ];

    it.each(cases)('refuses %s as SKU_NOT_AVAILABLE', async (_label, options) => {
      const fixture = await seedReadyMadeContext(context.database, options);
      const response = await post(createBody(fixture)).expect(422);
      expect((response.body as Envelope).code).toBe('SKU_NOT_AVAILABLE');
      await expectNoSideEffects(fixture);
    });

    it('refuses an unknown SKU with the same answer', async () => {
      const fixture = await seedReadyMadeContext(context.database, { label: 'nosku' });
      const response = await post(
        createBody(fixture, { skuId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072' }),
      ).expect(422);
      expect((response.body as Envelope).code).toBe('SKU_NOT_AVAILABLE');
    });

    it('refuses a SKU whose product was unpublished after the client read it', async () => {
      const fixture = await seedReadyMadeContext(context.database, { label: 'unpublished' });
      // The client's earlier read said the SKU was buyable. The transaction says
      // otherwise, and the transaction wins.
      await db().execute(sql`
        update products set status = 'DRAFT' where id = ${fixture.productId}
      `);
      await post(createBody(fixture)).expect(422);
      await expectNoSideEffects(fixture);
    });
  });

  describe('server price authority', () => {
    it('freezes the price current at commit time, not the one the client saw', async () => {
      const fixture = await seedReadyMadeContext(context.database, {
        label: 'repriced',
        basePriceAmount: 100_000,
      });

      // What `publicProductVariant_list` would have told the client: 100 000.
      const observed = await context.http
        .get(`/api/public/products/${fixture.productSlug}/variants`)
        .expect(200);
      const variants = (observed.body as { data?: { variants?: unknown[] } }).data?.variants ?? [];
      expect(JSON.stringify(variants)).toContain('100000');

      // The operator reprices before the order arrives.
      await db().execute(sql`
        update products set base_price_amount = 250000 where id = ${fixture.productId}
      `);

      const created = await post(createBody(fixture, { quantity: 2 })).expect(201);
      expect((created.body as Envelope).data?.['merchandiseSubtotal']).toEqual({
        amount: '500000.00',
        currency: 'VND',
      });

      const rows = await db().execute<{ unit_price_amount: string }>(sql`
        select i.unit_price_amount from order_items i join orders o on o.id = i.order_id
         where o.code = ${String((created.body as Envelope).data?.['orderCode'])}
      `);
      expect(rows.rows[0]?.unit_price_amount).toBe('250000.00');
    });

    it('rejects a body that tries to state a price at all', async () => {
      const fixture = await seedReadyMadeContext(context.database, { label: 'priceinjection' });
      // `.strict()` — an unknown field is a client bug, never silently dropped.
      await post(createBody(fixture, { unitPrice: '1.00' })).expect(400);
      await post(createBody(fixture, { merchandiseSubtotal: '1.00' })).expect(400);
      await post(createBody(fixture, { customerId: fixture.customerId })).expect(400);
      await expectNoSideEffects(fixture);
    });
  });

  describe('server stock authority', () => {
    it('refuses a quantity the client thought was available but no longer is', async () => {
      const fixture = await seedReadyMadeContext(context.database, {
        label: 'stockgone',
        quantityOnHand: 5,
      });

      // Another order takes 4 of the 5 first.
      const otherChallenge = await seedAnotherChallenge(context.database, fixture);
      await post(createBody(fixture, { challengeId: otherChallenge, quantity: 4 })).expect(201);

      // The client still believes 5 are available. The lock says one is.
      const response = await post(createBody(fixture, { quantity: 5 })).expect(422);
      expect((response.body as Envelope).code).toBe('INSUFFICIENT_STOCK');

      const reservations = await db().execute<{ n: string; total: string }>(sql`
        select count(*) as n, coalesce(sum(r.quantity), 0) as total
          from inventory_reservations r join sku_stocks s on s.id = r.sku_stock_id
         where s.sku_id = ${fixture.skuId} and r.status = 'RESERVED'
      `);
      expect(Number(reservations.rows[0]?.n)).toBe(1);
      expect(Number(reservations.rows[0]?.total)).toBe(4);
    });

    it('refuses a SKU with no stock anchor, and provisions none', async () => {
      const fixture = await seedReadyMadeContext(context.database, {
        label: 'noanchor',
        withStockAnchor: false,
      });
      const response = await post(createBody(fixture)).expect(422);
      // `APP12-B02` §17 — a commerce writer never creates operator-owned
      // inventory data, so this is the ordinary out-of-stock refusal.
      expect((response.body as Envelope).code).toBe('INSUFFICIENT_STOCK');

      const anchors = await db().execute<{ n: string }>(sql`
        select count(*) as n from sku_stocks where sku_id = ${fixture.skuId}
      `);
      expect(Number(anchors.rows[0]?.n)).toBe(0);
      await expectNoSideEffects(fixture);
    });

    it('publishes no stock figure in the refusal', async () => {
      const fixture = await seedReadyMadeContext(context.database, {
        label: 'quietstock',
        quantityOnHand: 2,
      });
      const response = await post(createBody(fixture, { quantity: 9 })).expect(422);
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain(fixture.skuStockId);
      expect(serialized).not.toMatch(/\b2\b/);
    });
  });

  describe('request validation', () => {
    it.each([
      ['zero', 0],
      ['negative', -1],
      ['fractional', 1.5],
    ])('refuses a %s quantity', async (_label, quantity) => {
      const fixture = await seedReadyMadeContext(context.database, {
        label: `qty-${String(quantity)}`,
      });
      await post(createBody(fixture, { quantity })).expect(400);
      await expectNoSideEffects(fixture);
    });

    it('refuses a string quantity rather than coercing it', async () => {
      const fixture = await seedReadyMadeContext(context.database, { label: 'qtystring' });
      await post(createBody(fixture, { quantity: '3' })).expect(400);
      await expectNoSideEffects(fixture);
    });

    it.each(['recipientName', 'recipientPhone', 'addressLine', 'province'])(
      'refuses a body missing the mandatory delivery field %s',
      async (field) => {
        const fixture = await seedReadyMadeContext(context.database, { label: `miss-${field}` });
        const delivery: Record<string, unknown> = deliveryBody();
        delete delivery[field];
        await post(createBody(fixture, { delivery })).expect(400);
        await expectNoSideEffects(fixture);
      },
    );

    it('refuses an oversized delivery string', async () => {
      const fixture = await seedReadyMadeContext(context.database, { label: 'oversized' });
      await post(
        createBody(fixture, { delivery: { ...deliveryBody(), addressLine: 'x'.repeat(501) } }),
      ).expect(400);
      await expectNoSideEffects(fixture);
    });

    it('refuses an unknown delivery field', async () => {
      const fixture = await seedReadyMadeContext(context.database, { label: 'unknownfield' });
      await post(createBody(fixture, { delivery: { ...deliveryBody(), feeAmount: '0' } })).expect(
        400,
      );
      await expectNoSideEffects(fixture);
    });
  });

  describe('idempotency', () => {
    it('replays the identical request instead of creating a second order', async () => {
      const fixture = await seedReadyMadeContext(context.database, { label: 'replay' });
      const first = await post(createBody(fixture, { quantity: 2 })).expect(201);
      const second = await post(createBody(fixture, { quantity: 2 })).expect(201);

      expect((second.body as Envelope).data).toEqual((first.body as Envelope).data);

      const counts = await db().execute<{ orders: string; reservations: string }>(sql`
        select (select count(*) from orders where customer_id = ${fixture.customerId}) as orders,
               (select count(*) from inventory_reservations r
                  join sku_stocks s on s.id = r.sku_stock_id
                 where s.sku_id = ${fixture.skuId}) as reservations
      `);
      expect(Number(counts.rows[0]?.orders)).toBe(1);
      expect(Number(counts.rows[0]?.reservations)).toBe(1);
    });

    it('conflicts when the same key is reused for a different request', async () => {
      const fixture = await seedReadyMadeContext(context.database, { label: 'conflict' });
      await post(createBody(fixture, { quantity: 1 })).expect(201);

      const response = await post(createBody(fixture, { quantity: 2 })).expect(409);
      expect((response.body as Envelope).code).toBe('IDEMPOTENCY_CONFLICT');

      const counts = await db().execute<{ orders: string; reservations: string }>(sql`
        select (select count(*) from orders where customer_id = ${fixture.customerId}) as orders,
               (select count(*) from inventory_reservations r
                  join sku_stocks s on s.id = r.sku_stock_id
                 where s.sku_id = ${fixture.skuId}) as reservations
      `);
      expect(Number(counts.rows[0]?.orders)).toBe(1);
      expect(Number(counts.rows[0]?.reservations)).toBe(1);
    });

    it('conflicts when only the delivery address changed', async () => {
      const fixture = await seedReadyMadeContext(context.database, { label: 'addrchange' });
      await post(createBody(fixture)).expect(201);
      const response = await post(
        createBody(fixture, { delivery: { ...deliveryBody(), addressLine: '99 Somewhere Else' } }),
      ).expect(409);
      expect((response.body as Envelope).code).toBe('IDEMPOTENCY_CONFLICT');
    });

    it('lets the same customer buy the same SKU again under a different key', async () => {
      const fixture = await seedReadyMadeContext(context.database, {
        label: 'secondpurchase',
        quantityOnHand: 10,
      });
      await post(createBody(fixture, { quantity: 2 })).expect(201);

      const secondChallenge = await seedAnotherChallenge(context.database, fixture);
      await post(createBody(fixture, { challengeId: secondChallenge, quantity: 3 })).expect(201);

      const counts = await db().execute<{ orders: string; total: string }>(sql`
        select (select count(*) from orders where customer_id = ${fixture.customerId}) as orders,
               (select coalesce(sum(r.quantity), 0) from inventory_reservations r
                  join sku_stocks s on s.id = r.sku_stock_id
                 where s.sku_id = ${fixture.skuId} and r.status = 'RESERVED') as total
      `);
      expect(Number(counts.rows[0]?.orders)).toBe(2);
      expect(Number(counts.rows[0]?.total)).toBe(5);
    });
  });
});
