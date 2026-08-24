/**
 * `APP8-B01` over HTTP — the three Admin stock operations end to end.
 *
 * The whole stack runs: the Admin session guard, the Origin allowlist, the
 * JSON-only guard, the Zod validation pipe, the response envelope, the exception
 * filter, one real PostgreSQL transaction per operation and the delivered
 * `sku_stocks` lock anchor. Three things are asserted here and nowhere else:
 *
 * 1. **Gap A is closed.** A SKU authored through `APP7-B01` — which writes no
 *    stock row at all — acquires its `sku_stocks` anchor through this surface,
 *    and repeating the operation creates no second row.
 * 2. **The adjustment is audited and atomic.** One `ADJUSTMENT` ledger entry
 *    with its mandatory reason, one `sku_stock.adjusted` audit row, and — when
 *    the adjustment is refused — neither.
 * 3. **The composition root reaches inventory.** These routes answer at all
 *    only because `AdminSkuStockModule`, and through it `InventoryModule`, is
 *    registered in the real `AppModule` this context boots.
 *
 * Rows are counted as deltas against the tables directly, because the only way
 * to prove "a failed adjustment leaves no committed ledger row" is to look.
 */
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';

import { BootstrapStaffUseCase } from '../../src/modules/identity/application/bootstrap-staff.use-case';
import { seedInventoryChain } from '../../src/modules/inventory/tests/integration/inventory-fixture';
import { LoginRateLimiter } from '../../src/modules/identity/infrastructure/rate-limit/login-rate-limiter';
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';

const ADMIN_ORIGIN = 'http://admin.embroidery.local';
const EMAIL = 'stock@example.test';
const PASSWORD = 'operator-secret-123';
const CATEGORY_ID = '019a0000-0000-7000-8000-000000000001';

interface Envelope<T> {
  readonly success: boolean;
  readonly code: string;
  readonly message: string;
  readonly data: T;
}

interface StockPayload {
  readonly skuId: string;
  readonly skuStockId: string;
  readonly quantityOnHand: number;
  readonly heldQuantity: number;
  readonly reservedQuantity: number;
  readonly available: number;
  readonly lowStockThreshold?: number;
  readonly lowStock: boolean;
}

interface LedgerEntryPayload {
  readonly entryKind: string;
  readonly quantity: number;
  readonly onHandDelta: number;
  readonly reason?: string;
  readonly occurredAt: string;
}

interface LedgerPayload {
  readonly skuId: string;
  readonly skuStockId: string;
  readonly entries: readonly LedgerEntryPayload[];
  readonly truncated: boolean;
}

describe('Admin SKU stock HTTP flow (integration)', () => {
  let ctx: ApiIntegrationTestContext;
  let previousOrigins: string | undefined;
  let cookie: string;

  beforeAll(async () => {
    previousOrigins = process.env['STAFF_ALLOWED_ORIGINS'];
    process.env['STAFF_ALLOWED_ORIGINS'] = ADMIN_ORIGIN;
    ctx = await createApiIntegrationContext('app8b01-stock-http');
    await ctx.app.get(BootstrapStaffUseCase).bootstrap({
      email: EMAIL,
      password: PASSWORD,
      displayName: 'Quản trị viên',
      rotate: false,
    });
    ctx.app.get(LoginRateLimiter).reset();
    cookie = await login();
  }, 240_000);

  afterAll(async () => {
    await ctx?.close();
    if (previousOrigins === undefined) {
      delete process.env['STAFF_ALLOWED_ORIGINS'];
    } else {
      process.env['STAFF_ALLOWED_ORIGINS'] = previousOrigins;
    }
  }, 240_000);

  async function login(): Promise<string> {
    const res = await ctx.http
      .post('/api/staff/session')
      .set('Origin', ADMIN_ORIGIN)
      .send({ email: EMAIL, password: PASSWORD });
    const raw = res.headers['set-cookie'];
    const cookies = Array.isArray(raw) ? (raw as string[]) : [];
    const session = cookies.find((value) => value.startsWith('adm_session='));
    if (session === undefined) {
      throw new Error('login set no adm_session cookie');
    }
    return session.split(';')[0] as string;
  }

  const authed = {
    get: (path: string) => ctx.http.get(path).set('Cookie', cookie).set('Origin', ADMIN_ORIGIN),
    post: (path: string) => ctx.http.post(path).set('Cookie', cookie).set('Origin', ADMIN_ORIGIN),
  };

  const stockPath = (skuId: string) => `/api/admin/skus/${skuId}/stock`;
  const adjustPath = (skuId: string) => `${stockPath(skuId)}/adjustments`;
  const ledgerPath = (skuId: string) => `${stockPath(skuId)}/ledger`;

  /**
   * A SKU exactly as `APP7-B01` authors one: product, variant, SKU — and **no**
   * `sku_stocks` row, which is the whole of Gap A.
   */
  async function seedSku(): Promise<string> {
    const db = ctx.database.client.db;
    const productId = newId();
    await db.execute(sql`
      insert into products (id, category_id, name, slug, base_price_amount, currency_code,
                            status, is_display_out_of_stock, display_order, is_indexable)
      values (${productId}, ${CATEGORY_ID}, 'Thú bông gấu nâu', ${`stock-${productId}`},
              '250000', 'VND', 'PUBLISHED', false, 0, true)
    `);
    const variantId = newId();
    await db.execute(sql`
      insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
      values (${variantId}, ${productId}, 'Nâu', 'M', 0, true)
    `);
    const skuId = newId();
    await db.execute(sql`
      insert into skus (id, product_variant_id, code, currency_code, is_active)
      values (${skuId}, ${variantId}, ${`STOCK-${skuId}`}, 'VND', true)
    `);
    return skuId;
  }

  async function countStockRows(skuId: string): Promise<number> {
    const result = await ctx.database.client.db.execute<{ total: string }>(
      sql`select count(*)::text as total from sku_stocks where sku_id = ${skuId}`,
    );
    return Number(result.rows[0]?.total ?? '0');
  }

  async function countLedgerRows(skuId: string): Promise<number> {
    const result = await ctx.database.client.db.execute<{ total: string }>(
      sql`select count(*)::text as total
            from inventory_ledger_entries entry
            join sku_stocks stock on stock.id = entry.sku_stock_id
           where stock.sku_id = ${skuId}`,
    );
    return Number(result.rows[0]?.total ?? '0');
  }

  async function countAuditRows(skuStockId: string): Promise<number> {
    const result = await ctx.database.client.db.execute<{ total: string }>(
      sql`select count(*)::text as total
            from audit_events
           where target_kind = 'SKU_STOCK' and target_id = ${skuStockId}`,
    );
    return Number(result.rows[0]?.total ?? '0');
  }

  describe('Gap A — a Catalog SKU acquires its stock anchor', () => {
    it('creates the anchor on first read and reports an honest zero', async () => {
      const skuId = await seedSku();
      expect(await countStockRows(skuId)).toBe(0);

      const res = await authed.get(stockPath(skuId));

      expect(res.status).toBe(200);
      const envelope = res.body as Envelope<StockPayload>;
      expect(envelope.success).toBe(true);
      expect(envelope.code).toBe('SKU_STOCK_READ');
      expect(envelope.data).toMatchObject({
        skuId,
        quantityOnHand: 0,
        heldQuantity: 0,
        reservedQuantity: 0,
        available: 0,
        lowStock: false,
      });
      // No threshold is configured, so the field is absent rather than a zero
      // that would read as "alert at zero".
      expect(envelope.data.lowStockThreshold).toBeUndefined();
      expect(await countStockRows(skuId)).toBe(1);
    });

    it('creates no second anchor however often the SKU is read or adjusted', async () => {
      const skuId = await seedSku();

      const first = await authed.get(stockPath(skuId));
      const second = await authed.get(stockPath(skuId));
      await authed.get(ledgerPath(skuId));
      await authed.post(adjustPath(skuId)).send({ delta: 4, reason: 'Nhập kho' });
      const third = await authed.get(stockPath(skuId));

      expect(await countStockRows(skuId)).toBe(1);
      const anchorIds = new Set(
        [first, second, third].map((res) => (res.body as Envelope<StockPayload>).data.skuStockId),
      );
      expect(anchorIds.size).toBe(1);
    });

    it('fabricates nothing for a SKU that does not exist', async () => {
      const absent = newId();
      const res = await authed.get(stockPath(absent));

      expect(res.status).toBe(404);
      expect((res.body as { code: string }).code).toBe('INVENTORY_SKU_NOT_FOUND');
      expect(await countStockRows(absent)).toBe(0);
    });

    it('rejects a malformed SKU id before any repository call', async () => {
      const res = await authed.get(stockPath('not-a-uuid'));
      expect(res.status).toBe(400);
    });
  });

  describe('the audited adjustment', () => {
    it('moves on-hand, appends one ledger entry and one audit row', async () => {
      const skuId = await seedSku();
      const created = await authed.get(stockPath(skuId));
      const skuStockId = (created.body as Envelope<StockPayload>).data.skuStockId;

      const res = await authed
        .post(adjustPath(skuId))
        .send({ delta: 20, reason: 'Kiểm kho tháng 8' });

      expect(res.status).toBe(200);
      const envelope = res.body as Envelope<StockPayload>;
      expect(envelope.code).toBe('SKU_STOCK_ADJUSTED');
      expect(envelope.data).toMatchObject({ quantityOnHand: 20, available: 20 });

      expect(await countLedgerRows(skuId)).toBe(1);
      expect(await countAuditRows(skuStockId)).toBe(1);

      const ledger = await authed.get(ledgerPath(skuId));
      const entries = (ledger.body as Envelope<LedgerPayload>).data.entries;
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        entryKind: 'ADJUSTMENT',
        quantity: 20,
        onHandDelta: 20,
        reason: 'Kiểm kho tháng 8',
      });
      expect(Date.parse(entries[0]?.occurredAt ?? '')).not.toBeNaN();
    });

    it('records the operator and the quantity before and after on the audit row', async () => {
      const skuId = await seedSku();
      const created = await authed.get(stockPath(skuId));
      const skuStockId = (created.body as Envelope<StockPayload>).data.skuStockId;
      await authed.post(adjustPath(skuId)).send({ delta: 7, reason: 'Nhập kho' });
      await authed.post(adjustPath(skuId)).send({ delta: -2, reason: 'Hàng lỗi' });

      const rows = (
        await ctx.database.client.db.execute<{
          action: string;
          actor_kind: string;
          admin_id: string | null;
          reason: string | null;
          summary: Record<string, unknown>;
        }>(
          sql`select action, actor_kind, admin_id, reason, summary
                from audit_events
               where target_kind = 'SKU_STOCK' and target_id = ${skuStockId}
               order by id asc`,
        )
      ).rows;

      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ action: 'sku_stock.adjusted', actor_kind: 'ADMIN' });
      expect(rows[0]?.admin_id).not.toBeNull();
      expect(rows[0]?.reason).toBe('Nhập kho');
      expect(rows[0]?.summary).toMatchObject({
        skuId,
        delta: 7,
        quantityOnHandBefore: 0,
        quantityOnHandAfter: 7,
      });
      expect(rows[1]?.summary).toMatchObject({
        delta: -2,
        quantityOnHandBefore: 7,
        quantityOnHandAfter: 5,
      });
    });

    it('refuses an adjustment with no reason, and writes nothing (GRD-023)', async () => {
      const skuId = await seedSku();
      await authed.post(adjustPath(skuId)).send({ delta: 10, reason: 'Nhập kho' });

      const res = await authed.post(adjustPath(skuId)).send({ delta: 5, reason: '   ' });

      expect(res.status).toBe(400);
      expect(await countLedgerRows(skuId)).toBe(1);
    });

    it('refuses an adjustment that would take stock below zero, and writes nothing', async () => {
      const skuId = await seedSku();
      const created = await authed.get(stockPath(skuId));
      const skuStockId = (created.body as Envelope<StockPayload>).data.skuStockId;
      await authed.post(adjustPath(skuId)).send({ delta: 3, reason: 'Nhập kho' });

      const res = await authed.post(adjustPath(skuId)).send({ delta: -4, reason: 'Xuất kho' });

      expect(res.status).toBe(409);
      expect((res.body as { code: string }).code).toBe('INVENTORY_STOCK_WOULD_GO_NEGATIVE');

      // The refused transaction left no ledger entry and no audit row, and the
      // counter is untouched.
      expect(await countLedgerRows(skuId)).toBe(1);
      expect(await countAuditRows(skuStockId)).toBe(1);
      const after = await authed.get(stockPath(skuId));
      expect((after.body as Envelope<StockPayload>).data.quantityOnHand).toBe(3);
    });

    it('refuses an adjustment that would change nothing', async () => {
      const skuId = await seedSku();
      const res = await authed.post(adjustPath(skuId)).send({ delta: 0, reason: 'Kiểm kho' });

      expect(res.status).toBe(400);
      expect(await countLedgerRows(skuId)).toBe(0);
    });

    it('refuses a body naming a server-owned field', async () => {
      const skuId = await seedSku();
      const res = await authed
        .post(adjustPath(skuId))
        .send({ delta: 5, reason: 'Kiểm kho', quantityOnHand: 999 });

      expect(res.status).toBe(400);
      expect(await countLedgerRows(skuId)).toBe(0);
    });
  });

  describe('availability is the computed figure, not the counter', () => {
    it('subtracts an active reservation from availability and leaves on-hand alone', async () => {
      // The accepted CTX-INV fixture, reused rather than re-seeded: an order a
      // reservation can legally reference needs the whole request → quotation →
      // approval chain, and duplicating it here would be a second, drifting
      // copy of setup the inventory suites already own.
      const chain = await seedInventoryChain({ disposable: ctx.database });
      const skuId = chain.skuId as string;
      await authed.post(adjustPath(skuId)).send({ delta: 10, reason: 'Nhập kho' });
      const created = await authed.get(stockPath(skuId));
      const skuStockId = (created.body as Envelope<StockPayload>).data.skuStockId;

      // Written directly rather than through a reservation use case: creating
      // one is `APP8-W01`'s work, and this suite only needs a row the delivered
      // availability computation must see.
      await ctx.database.client.db.execute(sql`
        insert into inventory_reservations (id, sku_stock_id, order_id, quantity, status)
        values (${newId()}, ${skuStockId}, ${chain.orderId}, 4, 'RESERVED')
      `);

      const res = await authed.get(stockPath(skuId));
      expect((res.body as Envelope<StockPayload>).data).toMatchObject({
        quantityOnHand: 10,
        reservedQuantity: 4,
        available: 6,
      });
    });
  });

  describe('the Admin guard chain', () => {
    it('refuses all three operations without a live Admin session', async () => {
      const skuId = await seedSku();
      const calls = [
        () => ctx.http.get(stockPath(skuId)).set('Origin', ADMIN_ORIGIN),
        () => ctx.http.get(ledgerPath(skuId)).set('Origin', ADMIN_ORIGIN),
        () =>
          ctx.http
            .post(adjustPath(skuId))
            .set('Origin', ADMIN_ORIGIN)
            .send({ delta: 5, reason: 'Kiểm kho' }),
      ];
      for (const call of calls) {
        expect((await call()).status).toBe(401);
      }
      expect(await countStockRows(skuId)).toBe(0);
    });

    it('refuses the mutation from an origin outside the Admin allowlist', async () => {
      const skuId = await seedSku();
      const res = await ctx.http
        .post(adjustPath(skuId))
        .set('Cookie', cookie)
        .set('Origin', 'http://evil.example')
        .send({ delta: 5, reason: 'Kiểm kho' });

      expect(res.status).toBe(403);
      expect(await countLedgerRows(skuId)).toBe(0);
    });

    it('refuses a mutation that is not application/json', async () => {
      const skuId = await seedSku();
      const res = await ctx.http
        .post(adjustPath(skuId))
        .set('Cookie', cookie)
        .set('Origin', ADMIN_ORIGIN)
        .set('Content-Type', 'text/plain')
        .send('delta=5');

      expect(res.status).toBe(415);
      expect(await countLedgerRows(skuId)).toBe(0);
    });
  });
});
