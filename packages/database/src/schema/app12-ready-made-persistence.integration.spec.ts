/**
 * APP12-DB01 — the Ready-Made persistence invariants, asserted against a real
 * PostgreSQL rather than against TypeScript.
 *
 * Every rule this migration adds is a rule about what the database *refuses*.
 * A TypeScript test proves only that the types agree with each other; it cannot
 * tell whether `ck_orders__custom_chain_by_origin` actually installed, whether
 * the origin guard trigger fires on INSERT, or whether the `NOT NULL` that
 * `order_items.approval_snapshot_id` lost was really replaced. So each case
 * here issues the statement and asserts the SQLSTATE PostgreSQL raises.
 *
 * The matrix is deliberately symmetric: for every rule, the CUSTOM violation
 * and the READY_MADE violation are both attempted. A one-sided test would pass
 * on a constraint that had quietly stopped constraining the older half — which
 * is the failure this checkpoint most needed to rule out.
 */
import { sql } from 'drizzle-orm';

import { driverErrorCode } from '../errors/driver-error';
import { newId } from '../primitives/identifiers';
import type { DisposableDatabase } from '../testing/index';
import { createDisposableDatabase } from '../testing/index';
import { seedPaymentAttemptChain } from './app7-transfer-evidence-fixture';
import type { PaymentAttemptChain } from './app7-transfer-evidence-fixture';
import {
  insertGrant,
  insertObligation,
  insertOrder,
  insertOrderItem,
  seedReadyMadeSubject,
} from './app12-ready-made-fixture';
import type { ReadyMadeSubject } from './app12-ready-made-fixture';

/** PostgreSQL's `check_violation`. Asserted by code, never by message. */
const CHECK_VIOLATION = '23514';
/** PostgreSQL's `not_null_violation`. */
const NOT_NULL_VIOLATION = '23502';
/** PostgreSQL's `unique_violation`. */
const UNIQUE_VIOLATION = '23505';
/**
 * The class the origin guard trigger raises (`RAISE … USING ERRCODE = '23000'`),
 * following migration 0030's integrity-violation convention.
 */
const INTEGRITY_VIOLATION = '23000';

describe('APP12 Ready-Made persistence invariants (integration)', () => {
  let disposable: DisposableDatabase;
  let chain: PaymentAttemptChain;
  let subject: ReadyMadeSubject;
  let customerOwnedProductId: string;

  beforeAll(async () => {
    disposable = await createDisposableDatabase('app12db01-ready-made');
    chain = await seedPaymentAttemptChain(disposable.client.db);
    subject = await seedReadyMadeSubject(disposable.client.db, chain.productVariantId);
    customerOwnedProductId = newId();
    await disposable.client.db.execute(sql`
      insert into customer_owned_products (id, custom_request_id, name)
      values (${customerOwnedProductId}, ${chain.customRequestId}, 'Customer jacket')
    `);
  }, 300_000);

  afterAll(async () => {
    await disposable?.drop();
  });

  const db = (): DisposableDatabase['client']['db'] => disposable.client.db;

  /**
   * Runs `work` and returns the SQLSTATE it raised.
   *
   * Through `driverErrorCode`, never `error.code`: drizzle wraps the `pg` error
   * and attaches the original as `cause`, so a direct read finds nothing.
   */
  async function errorCode(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
    } catch (error: unknown) {
      return driverErrorCode(error) ?? 'no-driver-code';
    }
    throw new Error('Expected the statement to fail, but it succeeded.');
  }

  /** A valid CUSTOM order on the seeded chain — the positive control. */
  const customOrder = () => ({
    origin: 'CUSTOM',
    status: 'AWAITING_DEPOSIT',
    customerId: chain.customerId,
    customRequestId: chain.customRequestId,
    quotationVersionId: chain.quotationVersionId,
    approvalSnapshotId: chain.approvalSnapshotId,
  });

  /** A valid READY_MADE order — no request, no quotation, no approval. */
  const readyMadeOrder = (status = 'AWAITING_SHIPPING_FEE') => ({
    origin: 'READY_MADE',
    status,
    customerId: chain.customerId,
  });

  describe('orders — the origin discriminator', () => {
    it('backfilled every pre-existing order to CUSTOM', async () => {
      const { rows } = await db().execute<{ origin: string; n: string }>(sql`
        select origin, count(*)::text as n from orders group by origin
      `);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.origin).toBe('CUSTOM');
      expect(Number(rows[0]?.n ?? '0')).toBeGreaterThan(0);
    });

    it('rejects an order with no origin', async () => {
      const id = newId();
      const code = await errorCode(() =>
        db().execute(sql`
          insert into orders
            (id, code, custom_request_id, customer_id, accepted_quotation_version_id,
             current_approval_snapshot_id, status, total_amount, currency_code)
          values (${id}, ${`ORD-${id}`}, ${chain.customRequestId}, ${chain.customerId},
                  ${chain.quotationVersionId}, ${chain.approvalSnapshotId},
                  'AWAITING_DEPOSIT', 1000000.00, 'VND')
        `),
      );
      expect(code).toBe(NOT_NULL_VIOLATION);
    });

    it('has no column default, so an origin is always stated', async () => {
      const { rows } = await db().execute<{ column_default: string | null }>(sql`
        select column_default from information_schema.columns
        where table_schema = 'public' and table_name = 'orders' and column_name = 'origin'
      `);
      expect(rows[0]?.column_default).toBeNull();
    });

    it('rejects an origin outside the closed set', async () => {
      const code = await errorCode(() =>
        insertOrder(db(), { ...readyMadeOrder(), origin: 'WHOLESALE' }),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('refuses to change the origin of a committed order', async () => {
      const code = await errorCode(() =>
        db().execute(sql`update orders set origin = 'READY_MADE' where id = ${chain.orderId}`),
      );
      expect(code).toBe(INTEGRITY_VIOLATION);
    });
  });

  describe('orders — the custom chain', () => {
    it.each([
      ['request', { customRequestId: null }],
      ['quotation', { quotationVersionId: null }],
      ['approval', { approvalSnapshotId: null }],
    ])('rejects a CUSTOM order missing its %s', async (_label, missing) => {
      const code = await errorCode(() => insertOrder(db(), { ...customOrder(), ...missing }));
      expect(code).toBe(CHECK_VIOLATION);
    });

    it.each([
      ['request', () => ({ customRequestId: chain.customRequestId })],
      ['quotation', () => ({ quotationVersionId: chain.quotationVersionId })],
      ['approval', () => ({ approvalSnapshotId: chain.approvalSnapshotId })],
    ])('rejects a READY_MADE order carrying a %s', async (_label, extra) => {
      const code = await errorCode(() => insertOrder(db(), { ...readyMadeOrder(), ...extra() }));
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('accepts a READY_MADE order with none of the three', async () => {
      await expect(insertOrder(db(), readyMadeOrder())).resolves.toEqual(expect.any(String));
    });

    it('still allows only one order per custom request', async () => {
      const code = await errorCode(() => insertOrder(db(), customOrder()));
      expect(code).toBe(UNIQUE_VIOLATION);
    });

    it('does not constrain Ready-Made orders through that unique index', async () => {
      await expect(insertOrder(db(), readyMadeOrder())).resolves.toEqual(expect.any(String));
    });
  });

  describe('orders — origin-aware status', () => {
    it.each(['AWAITING_SHIPPING_FEE', 'AWAITING_PAYMENT'])(
      'rejects a CUSTOM order in the Ready-Made-only state %s',
      async (status) => {
        const code = await errorCode(() => insertOrder(db(), { ...customOrder(), status }));
        expect(code).toBe(CHECK_VIOLATION);
      },
    );

    it.each([
      'AWAITING_DEPOSIT',
      'DEPOSIT_PAID',
      'IN_PRODUCTION',
      'PRODUCTION_COMPLETED',
      'AWAITING_FINAL_PAYMENT',
    ])('rejects a READY_MADE order in the custom-only state %s', async (status) => {
      const code = await errorCode(() => insertOrder(db(), readyMadeOrder(status)));
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('rejects PAID, which is not a state in either lifecycle', async () => {
      const code = await errorCode(() => insertOrder(db(), readyMadeOrder('PAID')));
      expect(code).toBe(CHECK_VIOLATION);
    });

    it.each(['READY_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'ON_HOLD', 'CANCELLING'])(
      'accepts the shared state %s on a READY_MADE order',
      async (status) => {
        if (status === 'ON_HOLD') {
          const id = newId();
          await db().execute(sql`
            insert into orders
              (id, code, origin, customer_id, status, hold_reason, total_amount, currency_code)
            values (${id}, ${`ORD-${id}`}, 'READY_MADE', ${chain.customerId}, 'ON_HOLD',
                    'awaiting stock recount', 1000000.00, 'VND')
          `);
          return;
        }
        await expect(insertOrder(db(), readyMadeOrder(status))).resolves.toEqual(
          expect.any(String),
        );
      },
    );
  });

  describe('order items — the approval snapshot is origin-conditional', () => {
    it('rejects a CUSTOM item with no approval snapshot', async () => {
      // The chain's own order is the only CUSTOM one: `uq_orders__request`
      // still allows exactly one order per request, which this suite also
      // asserts above.
      const code = await errorCode(() =>
        insertOrderItem(db(), {
          orderId: chain.orderId,
          skuId: subject.skuId,
          approvalSnapshotId: null,
        }),
      );
      expect(code).toBe(INTEGRITY_VIOLATION);
    });

    it('rejects a READY_MADE item that carries an approval snapshot', async () => {
      const orderId = await insertOrder(db(), readyMadeOrder());
      const code = await errorCode(() =>
        insertOrderItem(db(), {
          orderId,
          skuId: subject.skuId,
          approvalSnapshotId: chain.approvalSnapshotId,
        }),
      );
      expect(code).toBe(INTEGRITY_VIOLATION);
    });

    it('rejects a READY_MADE item whose subject is a customer-owned product', async () => {
      const orderId = await insertOrder(db(), readyMadeOrder());
      const copId = customerOwnedProductId;
      const code = await errorCode(() =>
        insertOrderItem(db(), { orderId, skuId: null, customerOwnedProductId: copId }),
      );
      expect(code).toBe(INTEGRITY_VIOLATION);
    });

    it('still rejects an item naming both subjects', async () => {
      const orderId = await insertOrder(db(), readyMadeOrder());
      const copId = customerOwnedProductId;
      const code = await errorCode(() =>
        insertOrderItem(db(), { orderId, skuId: subject.skuId, customerOwnedProductId: copId }),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('accepts a READY_MADE SKU item with no approval snapshot', async () => {
      const orderId = await insertOrder(db(), readyMadeOrder());
      await expect(
        insertOrderItem(db(), { orderId, skuId: subject.skuId, approvalSnapshotId: null }),
      ).resolves.toEqual(expect.any(String));
    });
  });

  describe('payment obligations', () => {
    it.each(['DEPOSIT', 'REMAINING'])(
      'rejects a %s obligation with no quotation source',
      async (kind) => {
        const code = await errorCode(() =>
          insertObligation(db(), {
            orderId: chain.orderId,
            kind,
            sourceQuotationVersionId: null,
          }),
        );
        expect(code).toBe(CHECK_VIOLATION);
      },
    );

    it('rejects a FULL obligation that names a quotation version', async () => {
      const orderId = await insertOrder(db(), readyMadeOrder());
      const code = await errorCode(() =>
        insertObligation(db(), {
          orderId,
          kind: 'FULL',
          sourceQuotationVersionId: chain.quotationVersionId,
        }),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('rejects a FULL obligation on a CUSTOM order', async () => {
      const code = await errorCode(() =>
        insertObligation(db(), { orderId: chain.orderId, kind: 'FULL' }),
      );
      expect(code).toBe(INTEGRITY_VIOLATION);
    });

    it.each(['DEPOSIT', 'REMAINING'])(
      'rejects a %s obligation on a READY_MADE order',
      async (kind) => {
        const orderId = await insertOrder(db(), readyMadeOrder());
        const code = await errorCode(() =>
          insertObligation(db(), {
            orderId,
            kind,
            sourceQuotationVersionId: chain.quotationVersionId,
          }),
        );
        expect(code).toBe(INTEGRITY_VIOLATION);
      },
    );

    it('supports the FULL supersession chain a shipping-fee correction needs', async () => {
      const orderId = await insertOrder(db(), readyMadeOrder());
      const first = await insertObligation(db(), { orderId, kind: 'FULL' });
      await db().execute(sql`
        update payment_obligations set status = 'SUPERSEDED' where id = ${first}
      `);
      const second = await insertObligation(db(), { orderId, kind: 'FULL' });
      await db().execute(sql`
        update payment_obligations set superseded_by_obligation_id = ${second} where id = ${first}
      `);

      const { rows } = await db().execute<{ n: string }>(sql`
        select count(*)::text as n from payment_obligations
        where order_id = ${orderId} and status = 'PENDING'
      `);
      expect(rows[0]?.n).toBe('1');
    });

    it('still allows only one live FULL obligation per order', async () => {
      const orderId = await insertOrder(db(), readyMadeOrder());
      await insertObligation(db(), { orderId, kind: 'FULL' });
      const code = await errorCode(() => insertObligation(db(), { orderId, kind: 'FULL' }));
      expect(code).toBe(UNIQUE_VIOLATION);
    });
  });

  describe('secure access grants — the scope/subject XOR', () => {
    it('rejects REQUEST_ACCESS carrying an order', async () => {
      const orderId = await insertOrder(db(), readyMadeOrder());
      const code = await errorCode(() =>
        insertGrant(db(), {
          customerId: chain.customerId,
          scopeKind: 'REQUEST_ACCESS',
          customRequestId: chain.customRequestId,
          orderId,
        }),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('rejects REQUEST_ACCESS with no request', async () => {
      const code = await errorCode(() =>
        insertGrant(db(), { customerId: chain.customerId, scopeKind: 'REQUEST_ACCESS' }),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('rejects ORDER_ACCESS carrying a request', async () => {
      const orderId = await insertOrder(db(), readyMadeOrder());
      const code = await errorCode(() =>
        insertGrant(db(), {
          customerId: chain.customerId,
          scopeKind: 'ORDER_ACCESS',
          customRequestId: chain.customRequestId,
          orderId,
        }),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('rejects ORDER_ACCESS with no order', async () => {
      const code = await errorCode(() =>
        insertGrant(db(), { customerId: chain.customerId, scopeKind: 'ORDER_ACCESS' }),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('rejects a grant with no subject at all', async () => {
      const code = await errorCode(() =>
        insertGrant(db(), { customerId: chain.customerId, scopeKind: 'ORDER_ACCESS' }),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('rejects a scope outside the closed two-value set', async () => {
      const orderId = await insertOrder(db(), readyMadeOrder());
      const code = await errorCode(() =>
        insertGrant(db(), { customerId: chain.customerId, scopeKind: 'ADMIN_ACCESS', orderId }),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('allows only one ACTIVE ORDER_ACCESS grant per customer and order', async () => {
      const orderId = await insertOrder(db(), readyMadeOrder());
      await insertGrant(db(), {
        customerId: chain.customerId,
        scopeKind: 'ORDER_ACCESS',
        orderId,
      });
      const code = await errorCode(() =>
        insertGrant(db(), { customerId: chain.customerId, scopeKind: 'ORDER_ACCESS', orderId }),
      );
      expect(code).toBe(UNIQUE_VIOLATION);
    });

    it('leaves the REQUEST_ACCESS grant seeded before this checkpoint valid', async () => {
      const { rows } = await db().execute<{ n: string }>(sql`
        select count(*)::text as n from secure_access_grants
        where scope_kind = 'REQUEST_ACCESS' and custom_request_id is not null and order_id is null
      `);
      expect(Number(rows[0]?.n ?? '0')).toBeGreaterThan(0);
    });
  });

  describe('the complete Ready-Made row set', () => {
    it('persists an order, item, shipping detail, reservation, obligation and grant', async () => {
      const orderId = await insertOrder(db(), readyMadeOrder());
      const itemId = await insertOrderItem(db(), { orderId, skuId: subject.skuId });

      const shippingId = newId();
      await db().execute(sql`
        insert into shipping_details
          (id, order_id, recipient_name, recipient_phone, address_line, province,
           currency_code, status)
        values (${shippingId}, ${orderId}, 'Nguyen Van A', '0900000000',
                '1 Test Street', 'Ha Noi', 'VND', 'EDITABLE')
      `);

      const reservationId = newId();
      await db().execute(sql`
        insert into inventory_reservations
          (id, sku_stock_id, order_id, quantity, status, expires_at)
        values (${reservationId}, ${subject.skuStockId}, ${orderId}, 2, 'RESERVED',
                now() + interval '24 hours')
      `);

      const obligationId = await insertObligation(db(), { orderId, kind: 'FULL' });
      const grantId = await insertGrant(db(), {
        customerId: chain.customerId,
        scopeKind: 'ORDER_ACCESS',
        orderId,
      });

      const { rows } = await db().execute<{
        origin: string;
        status: string;
        item_approval: string | null;
        obligation_kind: string;
        obligation_source: string | null;
        scope_kind: string;
        expires_at: string | null;
      }>(sql`
        select o.origin, o.status,
               i.approval_snapshot_id as item_approval,
               p.kind as obligation_kind,
               p.source_quotation_version_id as obligation_source,
               g.scope_kind,
               r.expires_at
          from orders o
          join order_items i on i.id = ${itemId}
          join payment_obligations p on p.id = ${obligationId}
          join secure_access_grants g on g.id = ${grantId}
          join inventory_reservations r on r.id = ${reservationId}
         where o.id = ${orderId}
      `);

      const { expires_at: expiresAt, ...persisted } = rows[0] ?? {};
      expect(persisted).toEqual({
        origin: 'READY_MADE',
        status: 'AWAITING_SHIPPING_FEE',
        item_approval: null,
        obligation_kind: 'FULL',
        obligation_source: null,
        scope_kind: 'ORDER_ACCESS',
      });
      // The reservation window itself: representable, and set — the 24h value
      // is APP12-B02's to compute, not this migration's.
      expect(expiresAt).not.toBeNull();
      expect(expiresAt).toBeDefined();
    });

    it('leaves the custom reservation model untouched — expires_at stays optional', async () => {
      const { rows } = await db().execute<{ is_nullable: string }>(sql`
        select is_nullable from information_schema.columns
        where table_schema = 'public'
          and table_name = 'inventory_reservations'
          and column_name = 'expires_at'
      `);
      expect(rows[0]?.is_nullable).toBe('YES');
    });
  });
});
