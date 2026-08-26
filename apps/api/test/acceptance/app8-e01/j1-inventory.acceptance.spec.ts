/**
 * `APP8-E01` journey **J1** — Admin inventory setup and audited adjustment.
 *
 * The question: can an operator establish stock truth through the delivered
 * `APP8-B01` Admin boundary, such that the later reservation and production path
 * genuinely consumes it?
 *
 * Two cases, `E01-01` and `E01-02`, on the SKU `J3`/`J4` later reserve against.
 * `E01-03` — the Admin screen's contract handoff — is the Admin-workspace half
 * of this journey and lives in `apps/admin/test/acceptance`.
 *
 * This is acceptance, not a rerun of `APP8-B01`. The read refusals, the
 * malformed-id 400s, the 401s, the negative-stock 409, the ledger truncation
 * notice and the availability arithmetic under contention are accepted B01/B02
 * evidence and are not re-proved here.
 */
import request from 'supertest';
import { sql } from 'drizzle-orm';

import {
  createApp8AcceptanceContext,
  dataOf,
  ROUTES,
  type App8AcceptanceContext,
  type SeededOrder,
} from './app8-e01-context';

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

interface LedgerPayload {
  readonly skuId: string;
  readonly skuStockId: string;
  readonly entries: readonly {
    readonly entryKind: string;
    readonly quantity: number;
    readonly onHandDelta: number;
    readonly reason?: string;
    readonly occurredAt: string;
  }[];
  readonly truncated: boolean;
}

/** The stock J3 and J4 later draw down. Comfortably above the 25-unit line. */
const OPENING_COUNT = 100;
const COUNT_REASON = 'Kiểm kho đầu kỳ tháng 8';

describe('APP8-E01 J1 — Admin inventory setup and audited adjustment', () => {
  let context: App8AcceptanceContext;
  let order: SeededOrder;
  let skuId: string;

  beforeAll(async () => {
    context = await createApp8AcceptanceContext('app8-e01-j1');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    order = await context.seedCatalogOrder('e01-j1');
    skuId = order.fixture.skuId;
    await context.seedAdminSession();
  });

  const readStock = () =>
    request(context.server()).get(ROUTES.stock(skuId)).set('Cookie', context.adminCookie());

  const readLedger = () =>
    request(context.server()).get(ROUTES.ledger(skuId)).set('Cookie', context.adminCookie());

  const adjust = (body: Record<string, unknown>) =>
    request(context.server())
      .post(ROUTES.adjust(skuId))
      .set('Cookie', context.adminCookie())
      .send(body);

  // ---------------------------------------------------------------------------
  // E01-01 — the anchor is stock truth, and it is the Catalog SKU's own.
  // ---------------------------------------------------------------------------
  describe('E01-01 — inventory read anchors stock truth for a real Catalog SKU', () => {
    it('resolves the SKU, creates its one anchor, and reports coherent zeroes', async () => {
      const first = dataOf<StockPayload>(await readStock().expect(200));

      expect(first.skuId).toBe(skuId);
      expect(first.skuStockId).toEqual(expect.any(String));

      // A never-counted SKU is reported truthfully, not refused.
      expect(first.quantityOnHand).toBe(0);
      expect(first.heldQuantity).toBe(0);
      expect(first.reservedQuantity).toBe(0);
      // The published invariant: available = on hand - holds - reservations.
      expect(first.available).toBe(
        first.quantityOnHand - first.heldQuantity - first.reservedQuantity,
      );
      expect(first.lowStockThreshold).toBeUndefined();
      expect(first.lowStock).toBe(false);

      // Repeating the read anchors nothing a second time.
      const second = dataOf<StockPayload>(await readStock().expect(200));
      expect(second.skuStockId).toBe(first.skuStockId);

      // And the anchor belongs to this Catalog SKU. The order carries one
      // Catalog line and no customer-owned product, so exactly one stock row
      // may exist in the whole database and it must be this SKU's: a COP stock
      // identity is never fabricated (INV-13).
      const anchors = await context.disposable.client.db.execute<{ sku_id: string }>(
        sql`select sku_id from sku_stocks`,
      );
      expect(anchors.rows).toEqual([{ sku_id: skuId }]);

      // Reading stock is not a movement: the ledger is still empty.
      const ledger = dataOf<LedgerPayload>(await readLedger().expect(200));
      expect(ledger.skuStockId).toBe(first.skuStockId);
      expect(ledger.entries).toEqual([]);
      expect(ledger.truncated).toBe(false);
      await expect(context.countRows('inventory_ledger_entries')).resolves.toBe(0);
      await expect(context.countRows('audit_events')).resolves.toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // E01-02 — one audited adjustment, committed, and it is the stock J3 consumes.
  // ---------------------------------------------------------------------------
  describe('E01-02 — an audited adjustment commits stock, ledger and audit together', () => {
    it('moves on-hand by exactly the delta and records why, once', async () => {
      const anchor = dataOf<StockPayload>(await readStock().expect(200));

      const adjusted = dataOf<StockPayload>(
        await adjust({ delta: OPENING_COUNT, reason: COUNT_REASON }).expect(200),
      );

      // The response is the recomputed committed state, on the same anchor.
      expect(adjusted.skuStockId).toBe(anchor.skuStockId);
      expect(adjusted.quantityOnHand).toBe(OPENING_COUNT);
      expect(adjusted.available).toBe(OPENING_COUNT);

      // Committed truth, read outside the request that wrote it.
      await expect(context.onHand(skuId)).resolves.toBe(OPENING_COUNT);

      // Exactly one ADJUSTMENT ledger entry, carrying the operator's reason and
      // the signed on-hand effect that rebuilds the counter (GRD-023).
      const ledgerRows = await context.ledgerOf(skuId);
      expect(ledgerRows).toEqual([
        {
          entryKind: 'ADJUSTMENT',
          quantity: OPENING_COUNT,
          onHandDelta: OPENING_COUNT,
          reason: COUNT_REASON,
        },
      ]);
      expect(ledgerRows.reduce((sum, row) => sum + row.onHandDelta, 0)).toBe(OPENING_COUNT);

      // Exactly one audit event, attributed to the acting Admin, carrying the
      // reason and the before/after the adjustment is reconciled against.
      await expect(context.countRows('audit_events')).resolves.toBe(1);
      await expect(context.auditActions()).resolves.toEqual(['sku_stock.adjusted']);

      const audit = await context.disposable.client.db.execute<{
        actor_kind: string;
        admin_id: string | null;
        target_kind: string;
        target_id: string;
        reason: string | null;
        summary: { delta: number; quantityOnHandBefore: number; quantityOnHandAfter: number };
      }>(sql`
        select actor_kind, admin_id, target_kind, target_id, reason, summary
          from audit_events
      `);
      const [event] = audit.rows;
      expect(event?.actor_kind).toBe('ADMIN');
      expect(event?.admin_id).toEqual(expect.any(String));
      expect(event?.target_kind).toBe('SKU_STOCK');
      expect(event?.target_id).toBe(anchor.skuStockId);
      expect(event?.reason).toBe(COUNT_REASON);
      expect(event?.summary.delta).toBe(OPENING_COUNT);
      expect(event?.summary.quantityOnHandBefore).toBe(0);
      expect(event?.summary.quantityOnHandAfter).toBe(OPENING_COUNT);

      // The ledger read surfaces the same one movement to the operator.
      const ledger = dataOf<LedgerPayload>(await readLedger().expect(200));
      expect(ledger.entries).toHaveLength(1);
      expect(ledger.entries[0]?.entryKind).toBe('ADJUSTMENT');
      expect(ledger.entries[0]?.reason).toBe(COUNT_REASON);
      expect(ledger.truncated).toBe(false);

      // Nothing else moved: an adjustment is not a hold, a reservation or a
      // consumption, and it touches no order and no production job.
      await expect(context.countRows('inventory_reservations')).resolves.toBe(0);
      await expect(context.countRows('production_jobs')).resolves.toBe(0);
      await expect(context.orderStatusOf(order.orderId)).resolves.toBe('DEPOSIT_PAID');
    });
  });
});
