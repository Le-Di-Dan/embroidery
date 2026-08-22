/**
 * `design.approved` → exactly one order, against a real PostgreSQL
 * (`APP7-W01` §18, §20, §21).
 *
 * The whole runtime is live: the row is claimed through
 * `WorkerJobQueueRepository`, leased, executed by `JobExecutionService` and
 * completed through the guarded seam. So what these assertions observe is what a
 * deployed worker would write, not what a hand-called use case would.
 */
import { sql } from '@embroidery/database';

import { JobHandlerRegistry } from '../../../runtime/registry/job-handler.registry';
import {
  countRows,
  startOrderConversionWorker,
  type OrderConversionContext,
} from './order-conversion-context';
import {
  appendDesignApprovedEvent,
  FIXTURE_DEPOSIT_AMOUNT,
  FIXTURE_LINE_TOTAL_AMOUNT,
  FIXTURE_QUANTITY,
  FIXTURE_REMAINING_AMOUNT,
  FIXTURE_TOTAL_AMOUNT,
  FIXTURE_UNIT_PRICE_AMOUNT,
  seedApprovalChain,
  type ApprovalChain,
} from './order-conversion-fixture';

interface OrderRow extends Record<string, unknown> {
  readonly id: string;
  readonly code: string;
  readonly status: string;
  readonly total_amount: string;
  readonly currency_code: string;
  readonly customer_id: string;
  readonly accepted_quotation_version_id: string;
  readonly current_approval_snapshot_id: string;
}

interface ItemRow extends Record<string, unknown> {
  readonly position: number;
  readonly sku_id: string | null;
  readonly customer_owned_product_id: string | null;
  readonly product_name: string;
  readonly variant_label: string | null;
  readonly size_label: string | null;
  readonly quantity: number;
  readonly unit_price_amount: string;
  readonly line_total_amount: string;
  readonly currency_code: string;
  readonly approval_snapshot_id: string;
}

interface ObligationRow extends Record<string, unknown> {
  readonly kind: string;
  readonly amount: string;
  readonly currency_code: string;
  readonly status: string;
  readonly source_quotation_version_id: string;
}

describe('APP7-W01 design.approved order conversion (integration)', () => {
  let context: OrderConversionContext;

  beforeAll(async () => {
    context = await startOrderConversionWorker('app7-w01-conversion');
  }, 300_000);

  afterAll(async () => {
    await context?.close();
  });

  function orders(chain: ApprovalChain): Promise<OrderRow[]> {
    return context.rows<OrderRow>(
      sql`SELECT * FROM orders WHERE custom_request_id = ${chain.customRequestId}`,
    );
  }

  function items(orderId: string): Promise<ItemRow[]> {
    return context.rows<ItemRow>(
      sql`SELECT * FROM order_items WHERE order_id = ${orderId} ORDER BY position`,
    );
  }

  function obligations(orderId: string): Promise<ObligationRow[]> {
    return context.rows<ObligationRow>(
      sql`SELECT * FROM payment_obligations WHERE order_id = ${orderId} ORDER BY kind`,
    );
  }

  it('registers exactly one production handler for design.approved', () => {
    const registry = context.get<JobHandlerRegistry>(JobHandlerRegistry);
    const registered = registry.registeredTypes();

    // The claim filter is exactly the registered types, so this is also the
    // proof that a live worker asks the queue for `design.approved` at all —
    // which nothing did before this checkpoint (`APP7-R00` §3.2).
    expect(registered).toContainEqual({
      eventType: 'design.approved',
      jobKind: 'ORDER_CREATION',
    });
    expect(registered.filter((type) => type.eventType === 'design.approved')).toHaveLength(1);
  });

  describe('the Catalog branch', () => {
    let chain: ApprovalChain;

    beforeAll(async () => {
      chain = await seedApprovalChain(context.disposable, { suffix: 'catalog' });
      await appendDesignApprovedEvent(context.disposable, chain);
      const summary = await context.runOnce();
      expect(summary?.outcome).toBe('SUCCEEDED');
    }, 300_000);

    it('creates exactly one order, at AWAITING_DEPOSIT', async () => {
      const rows = await orders(chain);

      expect(rows).toHaveLength(1);
      // `TR-LC14-01`'s only outcome. The deposit is `TR-LC14-02` and nothing in
      // this checkpoint can reach it.
      expect(rows[0]?.status).toBe('AWAITING_DEPOSIT');
      expect(rows[0]?.customer_id).toBe(chain.customerId);
    });

    it('freezes the exact accepted version and the approval snapshot', async () => {
      const [order] = await orders(chain);

      expect(order?.accepted_quotation_version_id).toBe(chain.quotationVersionId);
      expect(order?.current_approval_snapshot_id).toBe(chain.approvalSnapshotId);
    });

    it('draws an ORD- code from the promoted generator', async () => {
      const [order] = await orders(chain);

      expect(order?.code).toMatch(/^ORD-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}$/);
    });

    it('copies the accepted total exactly, in VND', async () => {
      const [order] = await orders(chain);

      // 3,333,333 VND — copied from `quotation_versions.total_amount`, never
      // re-summed from lines and never converted through a JavaScript number.
      expect(order?.total_amount).toBe(FIXTURE_TOTAL_AMOUNT);
      expect(order?.currency_code).toBe('VND');
    });

    it('freezes one line naming the resolved SKU and the snapshot copy', async () => {
      const [order] = await orders(chain);
      const lines = await items(order?.id as string);

      expect(lines).toHaveLength(1);
      expect(lines[0]?.sku_id).toBe(chain.skuId);
      expect(lines[0]?.customer_owned_product_id).toBeNull();
      // The snapshot's own copy, not the live `products.name` ("Tee").
      expect(lines[0]?.product_name).toBe('Tee frozen at approval');
      expect(lines[0]?.variant_label).toBe('Black / M');
      expect(lines[0]?.size_label).toBeNull();
      expect(lines[0]?.approval_snapshot_id).toBe(chain.approvalSnapshotId);
      expect(Number(lines[0]?.quantity)).toBe(FIXTURE_QUANTITY);
    });

    it('copies the accepted line pricing, never a live SKU or product price', async () => {
      const [order] = await orders(chain);
      const lines = await items(order?.id as string);

      expect(lines[0]?.unit_price_amount).toBe(FIXTURE_UNIT_PRICE_AMOUNT);
      expect(lines[0]?.line_total_amount).toBe(FIXTURE_LINE_TOTAL_AMOUNT);
      // `products.base_price_amount` is 150,000 and would be visible here if
      // anything read live Catalog pricing.
      expect(lines[0]?.unit_price_amount).not.toBe('150000.00');
      expect(lines[0]?.currency_code).toBe('VND');
    });

    it('creates both obligations, bound to the exact accepted version', async () => {
      const [order] = await orders(chain);
      const rows = await obligations(order?.id as string);

      expect(rows.map((row) => row.kind)).toEqual(['DEPOSIT', 'REMAINING']);
      expect(rows.every((row) => row.status === 'PENDING')).toBe(true);
      expect(rows.every((row) => row.currency_code === 'VND')).toBe(true);
      expect(
        rows.every((row) => row.source_quotation_version_id === chain.quotationVersionId),
      ).toBe(true);
    });

    it('copies both amounts and recomputes neither', async () => {
      const [order] = await orders(chain);
      const [deposit, remaining] = await obligations(order?.id as string);

      // The fixture's accepted deposit is 35 % — 1,166,667 VND, the DB4
      // round-half-up of 1,166,666.55. A converter that hard-coded BR-005's
      // 40 % would write 1,333,333 here, and one that re-rounded would write
      // 1,166,666.
      expect(deposit?.amount).toBe(FIXTURE_DEPOSIT_AMOUNT);
      expect(deposit?.amount).not.toBe('1333333.00');
      expect(remaining?.amount).toBe(FIXTURE_REMAINING_AMOUNT);
      // `deposit + remaining = total`, because both were copied from a row
      // where CST-064 already held — not because either was subtracted here.
      expect(Number(deposit?.amount) + Number(remaining?.amount)).toBe(
        Number(FIXTURE_TOTAL_AMOUNT),
      );
    });

    it('creates no payment attempt', async () => {
      const [order] = await orders(chain);
      const attempts = await countRows(
        context,
        sql`SELECT count(*)::text AS count FROM payment_attempts pa
            JOIN payment_obligations po ON po.id = pa.payment_obligation_id
            WHERE po.order_id = ${order?.id as string}`,
      );

      // `APP7-B03` opens the first attempt, behind a step-up. Not here.
      expect(attempts).toBe(0);
    });

    it('touches no inventory or production row', async () => {
      const reservations = await countRows(
        context,
        sql`SELECT count(*)::text AS count FROM inventory_reservations`,
      );
      const holds = await countRows(
        context,
        sql`SELECT count(*)::text AS count FROM inventory_soft_holds`,
      );
      const jobs = await countRows(
        context,
        sql`SELECT count(*)::text AS count FROM production_jobs`,
      );

      expect([reservations, holds, jobs]).toEqual([0, 0, 0]);
    });

    it('emits exactly one canonical order.created', async () => {
      const [order] = await orders(chain);
      const events = await context.rows<{ aggregate_id: string; payload: Record<string, unknown> }>(
        sql`SELECT aggregate_id, payload FROM outbox_events
            WHERE event_type = 'order.created' AND aggregate_id = ${order?.id as string}`,
      );

      expect(events).toHaveLength(1);
      expect(events[0]?.payload).toEqual({
        orderId: order?.id,
        code: order?.code,
        customRequestId: chain.customRequestId,
      });
    });

    it('claims order.create on (request, approval snapshot) and stores a replayable result', async () => {
      const [order] = await orders(chain);
      const [record] = await context.rows<{
        scope_key: string;
        status: string;
        result: { orderId?: string } | null;
      }>(
        sql`SELECT scope_key, status, result FROM idempotency_records
            WHERE operation_namespace = 'order.create'`,
      );

      expect(record?.scope_key).toBe(`${chain.customRequestId}:${chain.approvalSnapshotId}`);
      expect(record?.status).toBe('COMPLETED');
      expect(record?.result?.orderId).toBe(order?.id);
    });

    it('leaves the approval exactly as APP6 committed it', async () => {
      const [snapshot] = await context.rows<{ id: string }>(
        sql`SELECT id FROM approval_snapshots WHERE id = ${chain.approvalSnapshotId}`,
      );
      const [version] = await context.rows<{ status: string }>(
        sql`SELECT status FROM design_versions WHERE id = ${chain.designVersionId}`,
      );

      expect(snapshot?.id).toBe(chain.approvalSnapshotId);
      expect(version?.status).toBe('APPROVED');
    });
  });

  describe('the customer-owned-product branch', () => {
    let chain: ApprovalChain;

    beforeAll(async () => {
      chain = await seedApprovalChain(context.disposable, {
        branch: 'CUSTOMER_OWNED',
        suffix: 'cop',
      });
      await appendDesignApprovedEvent(context.disposable, chain);
      const summary = await context.runOnce();
      expect(summary?.outcome).toBe('SUCCEEDED');
    }, 300_000);

    it('names the exact frozen COP and fabricates no Catalog identity', async () => {
      const [order] = await orders(chain);
      const lines = await items(order?.id as string);

      expect(lines).toHaveLength(1);
      expect(lines[0]?.customer_owned_product_id).toBe(chain.customerOwnedProductId);
      expect(lines[0]?.sku_id).toBeNull();
      expect(lines[0]?.product_name).toBe('Áo khoác của khách cop');
      // Never invented for a garment the customer supplied.
      expect(lines[0]?.variant_label).toBeNull();
      expect(lines[0]?.size_label).toBeNull();
    });

    it('creates no placeholder Catalog row', async () => {
      // The fixture seeds one product and one variant per chain to make the
      // design version storable. A branch that fabricated Catalog identity
      // would show up as extra rows for this request's product.
      const skus = await countRows(
        context,
        sql`SELECT count(*)::text AS count FROM skus
            WHERE product_variant_id = ${chain.productVariantId}`,
      );

      expect(skus).toBe(0);
    });

    it('still creates both obligations at the accepted amounts', async () => {
      const [order] = await orders(chain);
      const [deposit, remaining] = await obligations(order?.id as string);

      expect(deposit?.amount).toBe(FIXTURE_DEPOSIT_AMOUNT);
      expect(remaining?.amount).toBe(FIXTURE_REMAINING_AMOUNT);
    });
  });

  describe('duplicate delivery', () => {
    it('converts once for two events naming the same approval', async () => {
      const chain = await seedApprovalChain(context.disposable, { suffix: 'duplicate' });
      await appendDesignApprovedEvent(context.disposable, chain);
      await appendDesignApprovedEvent(context.disposable, chain);

      const first = await context.runOnce();
      const second = await context.runOnce();

      expect(first?.outcome).toBe('SUCCEEDED');
      // The second delivery is not an error: it replays the committed order.
      expect(second?.outcome).toBe('SUCCEEDED');

      const rows = await orders(chain);
      expect(rows).toHaveLength(1);
      const orderId = rows[0]?.id as string;
      expect(await items(orderId)).toHaveLength(1);
      expect(await obligations(orderId)).toHaveLength(2);
      expect(
        await countRows(
          context,
          sql`SELECT count(*)::text AS count FROM outbox_events
              WHERE event_type = 'order.created' AND aggregate_id = ${orderId}`,
        ),
      ).toBe(1);
    }, 300_000);
  });

  describe('bounded domain refusals', () => {
    it('refuses a Catalog variant with no active SKU, terminally and with no order', async () => {
      const chain = await seedApprovalChain(context.disposable, {
        suffix: 'no-sku',
        activeSkus: 0,
        // Inactive SKUs exist and must not be counted as order-eligible.
        inactiveSkus: 2,
      });
      await appendDesignApprovedEvent(context.disposable, chain);

      const summary = await context.runOnce();

      expect(summary?.outcome).toBe('FAILED_TERMINAL');
      expect(summary?.errorClass).toBe('JOB_INVARIANT_VIOLATION');
      expect(await orders(chain)).toHaveLength(0);
    }, 300_000);

    it('refuses a Catalog variant with several active SKUs, never picking one', async () => {
      const chain = await seedApprovalChain(context.disposable, {
        suffix: 'many-sku',
        activeSkus: 2,
      });
      await appendDesignApprovedEvent(context.disposable, chain);

      const summary = await context.runOnce();

      expect(summary?.outcome).toBe('FAILED_TERMINAL');
      expect(summary?.errorClass).toBe('JOB_INVARIANT_VIOLATION');
      expect(await orders(chain)).toHaveLength(0);
    }, 300_000);

    it('refuses a request whose quotation version was never accepted', async () => {
      const chain = await seedApprovalChain(context.disposable, {
        suffix: 'unaccepted',
        quotationVersionStatus: 'SENT',
      });
      await appendDesignApprovedEvent(context.disposable, chain);

      const summary = await context.runOnce();

      expect(summary?.outcome).toBe('FAILED_TERMINAL');
      expect(await orders(chain)).toHaveLength(0);
    }, 300_000);

    it('refuses a foreign approval snapshot and leaves both requests without an order', async () => {
      const mine = await seedApprovalChain(context.disposable, { suffix: 'mine' });
      const theirs = await seedApprovalChain(context.disposable, { suffix: 'theirs' });

      // Every foreign key is satisfied by this pairing: a real approval, a real
      // request, different customers. Only the chain guard notices (INV-19).
      await appendDesignApprovedEvent(context.disposable, {
        approvalSnapshotId: theirs.approvalSnapshotId,
        customRequestId: mine.customRequestId,
        customerId: mine.customerId,
      });

      const summary = await context.runOnce();

      expect(summary?.outcome).toBe('FAILED_TERMINAL');
      expect(summary?.errorClass).toBe('JOB_INVARIANT_VIOLATION');
      expect(await orders(mine)).toHaveLength(0);
      expect(await orders(theirs)).toHaveLength(0);
    }, 300_000);

    it('leaves no partial conversion behind a refusal', async () => {
      const chain = await seedApprovalChain(context.disposable, {
        suffix: 'rollback',
        activeSkus: 2,
      });
      await appendDesignApprovedEvent(context.disposable, chain);

      await context.runOnce();

      // The refusal lands after the claim and the reads, inside the one
      // transaction. Nothing survives it — including the idempotency record,
      // which would otherwise make the retry replay an order that never existed.
      expect(await orders(chain)).toHaveLength(0);
      expect(
        await countRows(
          context,
          sql`SELECT count(*)::text AS count FROM order_items oi
              JOIN orders o ON o.id = oi.order_id
              WHERE o.custom_request_id = ${chain.customRequestId}`,
        ),
      ).toBe(0);
      expect(
        await countRows(
          context,
          sql`SELECT count(*)::text AS count FROM payment_obligations
              WHERE source_quotation_version_id = ${chain.quotationVersionId}`,
        ),
      ).toBe(0);
      expect(
        await countRows(
          context,
          sql`SELECT count(*)::text AS count FROM idempotency_records
              WHERE operation_namespace = 'order.create'
                AND scope_key = ${`${chain.customRequestId}:${chain.approvalSnapshotId}`}`,
        ),
      ).toBe(0);
    }, 300_000);
  });

  describe('frozen evidence', () => {
    it('uses the snapshot copy after live Catalog has been renamed', async () => {
      const chain = await seedApprovalChain(context.disposable, { suffix: 'frozen' });

      // A published product may be renamed at any time; nothing about an
      // approval freezes `products.name`, which is exactly why the snapshot
      // carries its own copy (INV-12).
      await context.rows(
        sql`UPDATE products SET name = 'Renamed after approval' WHERE id = ${chain.productId}`,
      );

      await appendDesignApprovedEvent(context.disposable, chain);
      const summary = await context.runOnce();
      expect(summary?.outcome).toBe('SUCCEEDED');

      const [order] = await orders(chain);
      const lines = await items(order?.id as string);

      expect(lines[0]?.product_name).toBe('Tee frozen at approval');
      expect(lines[0]?.product_name).not.toBe('Renamed after approval');
    }, 300_000);
  });
});
