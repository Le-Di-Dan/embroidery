/**
 * `APP12-B02` — `POST /api/public/ready-made-orders` over real HTTP.
 *
 * The whole application, the real controller, the real global pipe and
 * exception filter, the real repositories, the real Inventory writer and the
 * real outbox, against a disposable PostgreSQL with every migration applied.
 * Nothing is mocked.
 *
 * This suite proves what a **successful** creation commits, and what it
 * deliberately does not. Every way the endpoint refuses is the sibling
 * `-authority` suite, and the races are the `-concurrency` suite: three review
 * objects, and the split that keeps each inside the 600-line test limit.
 */
import { sql } from 'drizzle-orm';

import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import {
  createBody,
  seedReadyMadeContext,
  type ReadyMadeFixture,
} from '../support/ready-made-order-fixture';

const ORDER_CODE_PATTERN = /^ORD-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}$/;

interface Envelope {
  readonly code?: string;
  readonly data?: Record<string, unknown>;
}

describe('APP12-B02 Ready-Made order creation (API)', () => {
  let context: ApiIntegrationTestContext;

  beforeAll(async () => {
    context = await createApiIntegrationContext('app12_b02_create');
  }, 240_000);

  afterAll(async () => {
    await context?.close();
  });

  const db = () => context.database.client.db;
  const post = (body: unknown) =>
    context.http.post('/api/public/ready-made-orders').send(body as object);

  describe('a successful order', () => {
    let fixture: ReadyMadeFixture;
    let body: Envelope;

    beforeAll(async () => {
      fixture = await seedReadyMadeContext(context.database, {
        label: 'happy',
        basePriceAmount: 150_000,
        quantityOnHand: 10,
      });
      const response = await post(createBody(fixture, { quantity: 3 })).expect(201);
      body = response.body as Envelope;
    });

    it('returns the order code, status, subtotal and expiry — and nothing else', () => {
      expect(body.code).toBe('READY_MADE_ORDER_CREATED');
      expect(Object.keys(body.data as object).sort()).toEqual([
        'merchandiseSubtotal',
        'orderCode',
        'reservationExpiresAt',
        'status',
      ]);
      expect(body.data?.['orderCode']).toMatch(ORDER_CODE_PATTERN);
      expect(body.data?.['status']).toBe('AWAITING_SHIPPING_FEE');
    });

    it('publishes no raw internal identifier', () => {
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain(fixture.customerId);
      expect(serialized).not.toContain(fixture.skuId);
      expect(serialized).not.toContain(fixture.skuStockId);
      expect(serialized).not.toContain(fixture.challengeId);
      expect(serialized).not.toContain(fixture.productId);
      expect(serialized).not.toContain('@example.com');
    });

    it('publishes the merchandise subtotal, and no shipping fee or payable total', () => {
      // 150 000 x 3, exactly, as `numeric(14,2)` stores it — a string, so no
      // amount passed through an IEEE-754 double on the way out.
      expect(body.data?.['merchandiseSubtotal']).toEqual({
        amount: '450000.00',
        currency: 'VND',
      });
      // The published field list is the guarantee: there is no shipping fee and
      // no payable total in the shape at all (asserted exhaustively above), so
      // the only "total" a client can read is the merchandise one, named as such.
      expect(Object.keys(body.data as object)).not.toContain('shippingFee');
      expect(Object.keys(body.data as object)).not.toContain('finalTotal');
      expect(Object.keys(body.data as object)).not.toContain('totalAmount');
    });

    it('writes one READY_MADE order at AWAITING_SHIPPING_FEE with a null custom chain', async () => {
      const rows = await db().execute<{
        origin: string;
        status: string;
        custom_request_id: string | null;
        accepted_quotation_version_id: string | null;
        current_approval_snapshot_id: string | null;
        customer_id: string;
        total_amount: string;
        currency_code: string;
      }>(sql`
        select origin, status, custom_request_id, accepted_quotation_version_id,
               current_approval_snapshot_id, customer_id, total_amount, currency_code
          from orders where code = ${String(body.data?.['orderCode'])}
      `);

      expect(rows.rows).toHaveLength(1);
      const order = rows.rows[0];
      expect(order?.origin).toBe('READY_MADE');
      expect(order?.status).toBe('AWAITING_SHIPPING_FEE');
      expect(order?.custom_request_id).toBeNull();
      expect(order?.accepted_quotation_version_id).toBeNull();
      expect(order?.current_approval_snapshot_id).toBeNull();
      // Resolved from the challenge, never sent by the client.
      expect(order?.customer_id).toBe(fixture.customerId);
      expect(order?.total_amount).toBe('450000.00');
      expect(order?.currency_code).toBe('VND');
    });

    it('freezes exactly one SKU line with the display facts and the resolved price', async () => {
      const rows = await db().execute<{
        position: number;
        sku_id: string | null;
        customer_owned_product_id: string | null;
        approval_snapshot_id: string | null;
        product_name: string;
        variant_label: string | null;
        size_label: string | null;
        quantity: number;
        unit_price_amount: string;
        line_total_amount: string;
        currency_code: string;
      }>(sql`
        select i.position, i.sku_id, i.customer_owned_product_id, i.approval_snapshot_id,
               i.product_name, i.variant_label, i.size_label, i.quantity,
               i.unit_price_amount, i.line_total_amount, i.currency_code
          from order_items i
          join orders o on o.id = i.order_id
         where o.code = ${String(body.data?.['orderCode'])}
      `);

      expect(rows.rows).toHaveLength(1);
      const line = rows.rows[0];
      expect(line?.position).toBe(1);
      expect(line?.sku_id).toBe(fixture.skuId);
      // `BR-031` — no fabricated custom placeholder on either column.
      expect(line?.customer_owned_product_id).toBeNull();
      expect(line?.approval_snapshot_id).toBeNull();
      expect(line?.product_name).toBe('B02 Tee');
      expect(line?.variant_label).toBe('Black');
      expect(line?.size_label).toBe('M');
      expect(line?.quantity).toBe(3);
      expect(line?.unit_price_amount).toBe('150000.00');
      expect(line?.line_total_amount).toBe('450000.00');
      expect(line?.currency_code).toBe('VND');
    });

    it('captures the delivery facts with no fabricated shipping fee', async () => {
      const rows = await db().execute<{
        recipient_name: string;
        recipient_phone: string;
        address_line: string;
        ward: string | null;
        district: string | null;
        province: string;
        country_code: string;
        fee_amount: string | null;
        status: string;
      }>(sql`
        select s.recipient_name, s.recipient_phone, s.address_line, s.ward, s.district,
               s.province, s.country_code, s.fee_amount, s.status
          from shipping_details s
          join orders o on o.id = s.order_id
         where o.code = ${String(body.data?.['orderCode'])}
      `);

      expect(rows.rows).toHaveLength(1);
      const detail = rows.rows[0];
      expect(detail?.recipient_name).toBe('Nguyen Van A');
      expect(detail?.recipient_phone).toBe('0900000000');
      expect(detail?.address_line).toBe('12 Le Loi');
      expect(detail?.ward).toBe('Ben Nghe');
      expect(detail?.district).toBe('Quan 1');
      expect(detail?.province).toBe('Ho Chi Minh');
      expect(detail?.country_code).toBe('VN');
      // `BR-027` — pending, not zero. A `0` would read as "shipping is free".
      expect(detail?.fee_amount).toBeNull();
      expect(detail?.status).toBe('EDITABLE');
    });

    it('reserves the exact quantity, RESERVED, expiring 24h after the order was created', async () => {
      const rows = await db().execute<{
        status: string;
        quantity: number;
        expires_at: string;
        released_reason: string | null;
        window_ms: string;
        sku_stock_id: string;
      }>(sql`
        select r.status, r.quantity, r.expires_at, r.released_reason, r.sku_stock_id,
               extract(epoch from (r.expires_at - o.created_at)) * 1000 as window_ms
          from inventory_reservations r
          join orders o on o.id = r.order_id
         where o.code = ${String(body.data?.['orderCode'])}
      `);

      expect(rows.rows).toHaveLength(1);
      const reservation = rows.rows[0];
      expect(reservation?.status).toBe('RESERVED');
      expect(reservation?.quantity).toBe(3);
      expect(reservation?.sku_stock_id).toBe(fixture.skuStockId);
      expect(reservation?.released_reason).toBeNull();
      // `BR-025` — 24 hours after the order's own committed `created_at`.
      // Bounded rather than exact by one millisecond: `now()` carries
      // microseconds and a JS `Date` does not, so the window is measured from
      // the millisecond-truncated instant the driver handed back. The truncation
      // is toward the past, so the deadline is never later than 24h.
      const windowMs = Number(reservation?.window_ms);
      expect(windowMs).toBeLessThanOrEqual(86_400_000);
      expect(windowMs).toBeGreaterThan(86_399_999);
      // The published deadline is the persisted instant, not a second value.
      expect(new Date(String(body.data?.['reservationExpiresAt'])).toISOString()).toBe(
        new Date(String(reservation?.expires_at)).toISOString(),
      );
    });

    it('appends one RESERVED ledger entry that moves no on-hand stock', async () => {
      const rows = await db().execute<{
        entry_kind: string;
        quantity: number;
        on_hand_delta: number;
        actor_kind: string;
        system_job_key: string | null;
      }>(sql`
        select l.entry_kind, l.quantity, l.on_hand_delta, l.actor_kind, l.system_job_key
          from inventory_ledger_entries l
          join orders o on o.id = l.order_id
         where o.code = ${String(body.data?.['orderCode'])}
      `);

      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]?.entry_kind).toBe('RESERVED');
      expect(rows.rows[0]?.quantity).toBe(3);
      // A reservation commits stock; it does not issue it (`TR-LC17-06`).
      expect(rows.rows[0]?.on_hand_delta).toBe(0);
      expect(rows.rows[0]?.actor_kind).toBe('SYSTEM');
      expect(rows.rows[0]?.system_job_key).toBe('order.readyMade.create');
    });

    it('leaves on-hand untouched and reduces only availability', async () => {
      const rows = await db().execute<{ quantity_on_hand: number }>(sql`
        select quantity_on_hand from sku_stocks where sku_id = ${fixture.skuId}
      `);
      expect(rows.rows[0]?.quantity_on_hand).toBe(10);
    });

    it('appends one order.created event stating the READY_MADE origin truthfully', async () => {
      const rows = await db().execute<{
        event_type: string;
        aggregate_kind: string;
        payload: Record<string, unknown>;
      }>(sql`
        select e.event_type, e.aggregate_kind, e.payload
          from outbox_events e
          join orders o on o.id::text = e.aggregate_id
         where o.code = ${String(body.data?.['orderCode'])}
      `);

      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]?.event_type).toBe('order.created');
      expect(rows.rows[0]?.aggregate_kind).toBe('ORDER');
      expect(rows.rows[0]?.payload['origin']).toBe('READY_MADE');
      // Nothing implying a custom conversion, and nothing invented to fill one.
      expect(rows.rows[0]?.payload['customRequestId']).toBeUndefined();
    });

    it('creates no payment obligation and no payment attempt', async () => {
      const obligations = await db().execute<{ n: string }>(sql`
        select count(*) as n from payment_obligations p
          join orders o on o.id = p.order_id
         where o.code = ${String(body.data?.['orderCode'])}
      `);
      const attempts = await db().execute<{ n: string }>(sql`
        select count(*) as n from payment_attempts a
          join payment_obligations p on p.id = a.payment_obligation_id
          join orders o on o.id = p.order_id
         where o.code = ${String(body.data?.['orderCode'])}
      `);
      expect(Number(obligations.rows[0]?.n)).toBe(0);
      expect(Number(attempts.rows[0]?.n)).toBe(0);
    });

    it('creates no production job, no custom artifact and no ORDER_ACCESS grant', async () => {
      const counts = await db().execute<{
        jobs: string;
        requests: string;
        quotations: string;
        snapshots: string;
        grants: string;
      }>(sql`
        select (select count(*) from production_jobs j
                  join orders o on o.id = j.order_id
                 where o.code = ${String(body.data?.['orderCode'])}) as jobs,
               (select count(*) from custom_requests
                 where customer_id = ${fixture.customerId}) as requests,
               (select count(*) from quotations) as quotations,
               (select count(*) from approval_snapshots) as snapshots,
               (select count(*) from secure_access_grants
                 where customer_id = ${fixture.customerId}) as grants
      `);
      const row = counts.rows[0];
      expect(Number(row?.jobs)).toBe(0);
      expect(Number(row?.requests)).toBe(0);
      expect(Number(row?.quotations)).toBe(0);
      expect(Number(row?.snapshots)).toBe(0);
      // `ORDER_ACCESS` is `APP12-B04`. Nothing here issues a grant of any scope.
      expect(Number(row?.grants)).toBe(0);
    });
  });

  describe('snapshot durability', () => {
    it('keeps the frozen line unchanged when the Catalog is edited afterwards', async () => {
      const fixture = await seedReadyMadeContext(context.database, {
        label: 'frozen',
        basePriceAmount: 200_000,
      });
      const created = await post(createBody(fixture, { quantity: 2 })).expect(201);
      const orderCode = String((created.body as Envelope).data?.['orderCode']);

      await db().execute(sql`
        update products set name = 'Renamed Product', base_price_amount = 999000
         where id = ${fixture.productId}
      `);
      await db().execute(sql`
        update product_variants set color_name = 'Renamed Colour', size_label = 'XXL'
         where id = ${fixture.productVariantId}
      `);
      await db().execute(sql`
        update skus set price_override_amount = 1 where id = ${fixture.skuId}
      `);

      const rows = await db().execute<{
        product_name: string;
        variant_label: string | null;
        size_label: string | null;
        unit_price_amount: string;
        line_total_amount: string;
        total_amount: string;
      }>(sql`
        select i.product_name, i.variant_label, i.size_label, i.unit_price_amount,
               i.line_total_amount, o.total_amount
          from order_items i join orders o on o.id = i.order_id
         where o.code = ${orderCode}
      `);

      // History, not a join to current Catalog display.
      expect(rows.rows[0]?.product_name).toBe('B02 Tee');
      expect(rows.rows[0]?.variant_label).toBe('Black');
      expect(rows.rows[0]?.size_label).toBe('M');
      expect(rows.rows[0]?.unit_price_amount).toBe('200000.00');
      expect(rows.rows[0]?.line_total_amount).toBe('400000.00');
      expect(rows.rows[0]?.total_amount).toBe('400000.00');
    });

    it('snapshots an absent variant label as absent, never as a fabricated value', async () => {
      const fixture = await seedReadyMadeContext(context.database, {
        label: 'nolabels',
        withoutVariantLabels: true,
      });
      const created = await post(createBody(fixture)).expect(201);
      const orderCode = String((created.body as Envelope).data?.['orderCode']);

      const rows = await db().execute<{
        variant_label: string | null;
        size_label: string | null;
      }>(sql`
        select i.variant_label, i.size_label from order_items i
          join orders o on o.id = i.order_id where o.code = ${orderCode}
      `);
      expect(rows.rows[0]?.variant_label).toBeNull();
      expect(rows.rows[0]?.size_label).toBeNull();
    });

    it('freezes the SKU price override in preference to the product base price', async () => {
      const fixture = await seedReadyMadeContext(context.database, {
        label: 'override',
        basePriceAmount: 150_000,
        priceOverrideAmount: 99_000,
      });
      const created = await post(createBody(fixture, { quantity: 2 })).expect(201);
      expect((created.body as Envelope).data?.['merchandiseSubtotal']).toEqual({
        amount: '198000.00',
        currency: 'VND',
      });
    });

    it('treats a zero override as a real price rather than as no override', async () => {
      const fixture = await seedReadyMadeContext(context.database, {
        label: 'zero',
        basePriceAmount: 150_000,
        priceOverrideAmount: 0,
      });
      const created = await post(createBody(fixture, { quantity: 4 })).expect(201);
      expect((created.body as Envelope).data?.['merchandiseSubtotal']).toEqual({
        amount: '0.00',
        currency: 'VND',
      });
    });
  });
});
