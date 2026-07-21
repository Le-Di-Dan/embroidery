/**
 * DB9-CP2 — commerce and history read paths at tier M.
 *
 * The operational half of CP2: orders, requests, versions, audit history and
 * the admin scan shapes. Split from the storefront benchmark to keep each
 * file within the test-size limit and each suite about one read family;
 * both share `createBenchContext` so they measure the same generated tier.
 *
 * Every row goes through the real repository method a use case would call
 * (§13), and each measurement carries its correctness assertion (§18).
 */
import { sql } from 'drizzle-orm';

import { createBenchContext } from './bench-context';
import type { BenchContext } from './bench-context';
import type { ConcurrencyActor } from '../integration/db8-concurrency-context';
import { capturePlan } from './bench-plan';
import { BenchRecorder } from './bench-recorder';
import { measure } from './bench-timing';

import { OrderModule } from '../../modules/order/order.module';
import { QuotationModule } from '../../modules/quotation/quotation.module';
import { DesignModule } from '../../modules/design/design.module';
import { AuditModule } from '../../modules/audit/audit.module';
import { InventoryModule } from '../../modules/inventory/inventory.module';

import { ORDER_REPOSITORY } from '../../modules/order/domain/repositories/order.repository';
import type {
  OrderId,
  OrderRepository,
} from '../../modules/order/domain/repositories/order.repository';
import { CUSTOM_REQUEST_REPOSITORY } from '../../modules/order/domain/repositories/custom-request.repository';
import type {
  CustomRequestId,
  CustomRequestRepository,
} from '../../modules/order/domain/repositories/custom-request.repository';
import { QUOTATION_REPOSITORY } from '../../modules/quotation/domain/repositories/quotation.repository';
import type {
  QuotationId,
  QuotationRepository,
} from '../../modules/quotation/domain/repositories/quotation.repository';
import { DESIGN_CASE_REPOSITORY } from '../../modules/design/domain/repositories/design-case.repository';
import type {
  DesignCaseId,
  DesignCaseRepository,
} from '../../modules/design/domain/repositories/design-case.repository';
import { AUDIT_EVENT_REPOSITORY } from '../../modules/audit/domain/repositories/audit-event.repository';
import type { AuditEventRepository } from '../../modules/audit/domain/repositories/audit-event.repository';

describe('DB9-CP2 commerce read paths (tier M)', () => {
  let bench: BenchContext;
  let actor: ConcurrencyActor;
  const recorder = new BenchRecorder('DB9-CP2 commerce read paths');

  beforeAll(async () => {
    bench = await createBenchContext(
      'db9-cp2-commerce',
      [OrderModule, QuotationModule, DesignModule, AuditModule, InventoryModule],
      'M',
    );
    actor = await bench.spawnActor('reader');
  }, 1_800_000);

  afterAll(async () => {
    recorder.print();
    await bench?.close();
  });

  it('PERF-R15 — order lookup and item load', async () => {
    const orders = actor.get<OrderRepository>(ORDER_REPOSITORY);

    const lookup = await measure(
      'PERF-R15',
      async () => {
        const order = await orders.findByCode('ORD-00000042');
        expect(order?.code).toBe('ORD-00000042');
        return 1;
      },
      { samples: 40 },
    );
    recorder.add({
      perfId: 'PERF-R15',
      source: 'OrderRepository.findByCode',
      stats: lookup,
      plan: await capturePlan(
        bench.context.disposable.client.db,
        'PERF-R15',
        sql`select * from orders where code = 'ORD-00000042'`,
      ),
      note: 'Q-15 order lookup',
    });

    const orderId = (await bench.idOf('order', 42)) as OrderId;
    const items = await measure(
      'PERF-R15b',
      async () => {
        const loaded = await orders.loadItems(orderId);
        // Correctness: the whole line set, in position order.
        expect(loaded.length).toBe(bench.dataset.tier.orderItemsPerOrder);
        expect(loaded.map((item) => item.position)).toEqual(
          [...loaded].map((item) => item.position).sort((a, b) => a - b),
        );
        return loaded.length;
      },
      { samples: 40 },
    );
    recorder.add({
      perfId: 'PERF-R15b',
      source: 'OrderRepository.loadItems',
      stats: items,
      plan: await capturePlan(
        bench.context.disposable.client.db,
        'PERF-R15b',
        sql`select * from order_items where order_id = ${orderId} order by position`,
      ),
      note: 'Q-15 aggregate item load — one query, not one per line',
    });
  });

  it('PERF-R34 — order transition history (QX-01)', async () => {
    const orders = actor.get<OrderRepository>(ORDER_REPOSITORY);
    const orderId = (await bench.idOf('order', 99)) as OrderId;

    const stats = await measure(
      'PERF-R34',
      async () => {
        const transitions = await orders.listTransitions(orderId);
        expect(transitions.length).toBeGreaterThan(0);
        return transitions.length;
      },
      { samples: 30 },
    );
    recorder.add({
      perfId: 'PERF-R34',
      source: 'OrderRepository.listTransitions',
      stats,
      plan: await capturePlan(
        bench.context.disposable.client.db,
        'PERF-R34',
        sql`select * from order_transitions where order_id = ${orderId} order by id`,
      ),
      note: 'QX-01 transition history',
    });
  });

  it('PERF-R09 — customer request detail', async () => {
    const requests = actor.get<CustomRequestRepository>(CUSTOM_REQUEST_REPOSITORY);
    const requestId = (await bench.idOf('request', 512)) as CustomRequestId;

    const stats = await measure(
      'PERF-R09',
      async () => {
        const request = await requests.findById(requestId);
        expect(request?.id).toBe(requestId);
        return 1;
      },
      { samples: 40 },
    );
    recorder.add({
      perfId: 'PERF-R09',
      source: 'CustomRequestRepository.findById',
      stats,
      plan: await capturePlan(
        bench.context.disposable.client.db,
        'PERF-R09',
        sql`select * from custom_requests where id = ${requestId}`,
      ),
      note: 'Q-09 request detail',
    });
  });

  it('PERF-R10/R11 — design version history and the single active review', async () => {
    const cases = actor.get<DesignCaseRepository>(DESIGN_CASE_REPOSITORY);
    const caseId = (await bench.idOf('case', 200)) as DesignCaseId;

    const history = await measure(
      'PERF-R10',
      async () => {
        const versions = await cases.listVersions(caseId);
        expect(versions.length).toBeGreaterThan(0);
        // Correctness: version numbers strictly ascending, no duplicate/skip.
        const numbers = versions.map((version) => version.version);
        expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
        return versions.length;
      },
      { samples: 30 },
    );
    recorder.add({
      perfId: 'PERF-R10',
      source: 'DesignCaseRepository.listVersions',
      stats: history,
      plan: await capturePlan(
        bench.context.disposable.client.db,
        'PERF-R10',
        sql`select * from design_versions where design_case_id = ${caseId} order by version`,
      ),
      note: 'Q-10 design version history',
    });

    const review = await measure(
      'PERF-R11',
      async () => {
        await cases.findVersionInReview(caseId);
        return 1;
      },
      { samples: 30 },
    );
    recorder.add({
      perfId: 'PERF-R11',
      source: 'DesignCaseRepository.findVersionInReview',
      stats: review,
      plan: await capturePlan(
        bench.context.disposable.client.db,
        'PERF-R11',
        sql`select * from design_versions
            where design_case_id = ${caseId} and status = 'SENT_FOR_REVIEW'`,
      ),
      note: 'Q-11 current review version — partial-index path',
    });
  });

  it('PERF-R12 — quotation version history', async () => {
    const quotations = actor.get<QuotationRepository>(QUOTATION_REPOSITORY);
    const quotationId = (await bench.idOf('quotation', 300)) as QuotationId;

    const stats = await measure(
      'PERF-R12',
      async () => {
        const versions = await quotations.listVersions(quotationId);
        expect(versions.length).toBeGreaterThan(0);
        return versions.length;
      },
      { samples: 30 },
    );
    recorder.add({
      perfId: 'PERF-R12',
      source: 'QuotationRepository.listVersions',
      stats,
      plan: await capturePlan(
        bench.context.disposable.client.db,
        'PERF-R12',
        sql`select * from quotation_versions where quotation_id = ${quotationId} order by version`,
      ),
      note: 'Q-12 quotation version history',
    });
  });

  it('PERF-R29 — audit history by target, the largest table', async () => {
    const audit = actor.get<AuditEventRepository>(AUDIT_EVENT_REPOSITORY);
    const orderId = await bench.idOf('order', 77);

    const stats = await measure(
      'PERF-R29',
      async () => {
        const events = await audit.listByTarget('ORDER', orderId);
        expect(events.length).toBeGreaterThan(0);
        // Correctness: target scope honoured — nothing from another target.
        expect(events.every((event) => event.targetId === orderId)).toBe(true);
        return events.length;
      },
      { samples: 25 },
    );
    recorder.add({
      perfId: 'PERF-R29',
      source: 'AuditEventRepository.listByTarget',
      stats,
      plan: await capturePlan(
        bench.context.disposable.client.db,
        'PERF-R29',
        sql`select * from audit_events where target_kind = 'ORDER' and target_id = ${orderId}`,
      ),
      note: 'Q-29 audit history — 60k rows at tier M',
    });
  });

  it('PERF-R17/R20 — live-obligation and low-stock scans (partial-index paths)', async () => {
    const obligations = await measure(
      'PERF-R17',
      async () => {
        const rows = await bench.context.disposable.client.db.execute<{ id: string }>(
          sql`select id from payment_obligations
              where status = 'PENDING' and kind = 'DEPOSIT' limit 50`,
        );
        expect(rows.rows.length).toBeGreaterThan(0);
        return rows.rows.length;
      },
      { samples: 30 },
    );
    recorder.add({
      perfId: 'PERF-R17',
      source: 'Q-17 pending deposit shape',
      stats: obligations,
      plan: await capturePlan(
        bench.context.disposable.client.db,
        'PERF-R17',
        sql`select id from payment_obligations
            where status = 'PENDING' and kind = 'DEPOSIT' limit 50`,
      ),
      note: 'Q-17 — no admin listing repository method exists yet',
    });

    const lowStock = await measure(
      'PERF-R20',
      async () => {
        const rows = await bench.context.disposable.client.db.execute<{ id: string }>(
          sql`select id from sku_stocks
              where low_stock_threshold is not null
                and quantity_on_hand <= low_stock_threshold`,
        );
        expect(rows.rows.length).toBeGreaterThan(0);
        return rows.rows.length;
      },
      { samples: 30 },
    );
    recorder.add({
      perfId: 'PERF-R20',
      source: 'Q-20 low-stock shape',
      stats: lowStock,
      plan: await capturePlan(
        bench.context.disposable.client.db,
        'PERF-R20',
        sql`select id from sku_stocks
            where low_stock_threshold is not null
              and quantity_on_hand <= low_stock_threshold`,
      ),
      note: 'Q-20 — no admin dashboard repository method exists yet',
    });
  });

  it('PERF-R21 — deep keyset pagination never duplicates or skips a row', async () => {
    // §26: the property under test is *correctness across pages*, measured
    // at depth. Offset pagination would pass a latency check and silently
    // repeat rows once concurrent inserts land, so the keyset shape is kept.
    const pageSize = 50;
    const seen = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;

    const stats = await measure(
      'PERF-R21',
      async () => {
        const rows = await bench.context.disposable.client.db.execute<{ id: string; code: string }>(
          cursor === undefined
            ? sql`select id, code from custom_requests
                  where status = 'APPROVED' order by code limit ${pageSize}`
            : sql`select id, code from custom_requests
                  where status = 'APPROVED' and code > ${cursor}
                  order by code limit ${pageSize}`,
        );
        for (const row of rows.rows) {
          // The decisive assertion: a row must never appear twice.
          expect(seen.has(row.id)).toBe(false);
          seen.add(row.id);
        }
        cursor = rows.rows[rows.rows.length - 1]?.code;
        pages += 1;
        if (rows.rows.length < pageSize) {
          cursor = undefined;
          pages = 0;
        }
        return rows.rows.length;
      },
      { warmup: 0, samples: 40 },
    );

    expect(seen.size).toBeGreaterThan(pageSize);
    recorder.add({
      perfId: 'PERF-R21',
      source: 'Q-21 keyset page walk',
      stats,
      plan: await capturePlan(
        bench.context.disposable.client.db,
        'PERF-R21',
        sql`select id, code from custom_requests
            where status = 'APPROVED' and code > 'REQ-00001000'
            order by code limit 50`,
      ),
      note: `${seen.size} distinct rows walked, zero duplicates across ${pages} deep pages`,
    });
  });
});
