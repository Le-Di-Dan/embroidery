/**
 * DB9-CP6 — do the flagged sequential scans earn an index at scale?
 *
 * CP2 flagged four sequential scans. §28 is explicit that a sequential scan
 * is not automatically a defect, and at tier M three of the four tables are
 * a few hundred rows — a scan is simply the cheaper plan there. The question
 * a tuning decision actually needs answering is different: **when the table
 * grows, does the planner switch to the index that already exists?**
 *
 * If it does, the existing index is correct and no migration is warranted.
 * If it does not, there is a real candidate for CP6 to evaluate against the
 * §42 index-change protocol.
 *
 * Tier L, so the tables are large enough for the question to mean something.
 */
import { sql } from 'drizzle-orm';

import { createBenchContext } from './bench-context';
import type { BenchContext } from './bench-context';
import { capturePlan, estimateError } from './bench-plan';
import { BenchRecorder } from './bench-recorder';
import { measure } from './bench-timing';

import { CatalogModule } from '../../modules/catalog/catalog.module';

describe('DB9-CP6 flagged plans at scale (tier L)', () => {
  let bench: BenchContext;
  const recorder = new BenchRecorder('DB9-CP6 flagged plans at tier L');

  beforeAll(async () => {
    bench = await createBenchContext('db9-cp6-scale', [CatalogModule], 'L');
  }, 1_800_000);

  afterAll(async () => {
    recorder.print();
    await bench?.close();
  });

  it('PERF-R02 — the product slug lookup switches to its unique index once products grow', async () => {
    const stats = await measure(
      'PERF-R02-L',
      async () => {
        const rows = await bench.context.disposable.client.db.execute<{ id: string }>(
          sql`select id from products where slug = 'product-777'`,
        );
        expect(rows.rows).toHaveLength(1);
        return 1;
      },
      { samples: 40 },
    );

    const plan = await capturePlan(
      bench.context.disposable.client.db,
      'PERF-R02-L',
      sql`select id from products where slug = 'product-777'`,
    );
    recorder.add({
      perfId: 'PERF-R02-L',
      source: 'Q-02 at 1001 products',
      stats,
      plan,
      note: plan.hasSeqScan
        ? 'STILL a sequential scan at tier L — a genuine tuning candidate'
        : 'index scan at tier L: uq_products__slug already earns its keep, no migration warranted',
    });

    // The decision this test exists to make: the existing unique index must
    // become the chosen plan once the table is big enough to care.
    expect(plan.hasSeqScan).toBe(false);
  });

  it('PERF-R20 — the low-stock predicate at scale, and its estimate quality', async () => {
    const stats = await measure(
      'PERF-R20-L',
      async () => {
        const rows = await bench.context.disposable.client.db.execute<{ id: string }>(
          sql`select id from sku_stocks
              where low_stock_threshold is not null
                and quantity_on_hand <= low_stock_threshold`,
        );
        expect(rows.rows.length).toBeGreaterThan(0);
        return rows.rows.length;
      },
      { samples: 25 },
    );

    const plan = await capturePlan(
      bench.context.disposable.client.db,
      'PERF-R20-L',
      sql`select id from sku_stocks
          where low_stock_threshold is not null
            and quantity_on_hand <= low_stock_threshold`,
    );
    const ratio = estimateError(plan);

    recorder.add({
      perfId: 'PERF-R20-L',
      source: 'Q-20 at 6000 stock rows',
      stats,
      plan,
      note:
        `estimate ratio ${ratio} — the planner cannot correlate two columns of the same row ` +
        `without extended statistics; the scan itself returns a small result from a small table`,
    });

    // Deliberately no assertion that the plan is an index scan: this
    // predicate compares two columns of the same row, which no ordinary
    // B-tree index can satisfy. The measurement records the estimate error
    // so CP6 can reject the tuning candidate with evidence rather than
    // assert a plan shape the schema cannot produce.
    expect(Number.isFinite(ratio)).toBe(true);
  });

  it('PERF-R17 — the live-obligation scan at scale', async () => {
    const stats = await measure(
      'PERF-R17-L',
      async () => {
        const rows = await bench.context.disposable.client.db.execute<{ id: string }>(
          sql`select id from payment_obligations
              where status = 'PENDING' and kind = 'DEPOSIT' limit 50`,
        );
        expect(rows.rows.length).toBeGreaterThan(0);
        return rows.rows.length;
      },
      { samples: 25 },
    );

    const plan = await capturePlan(
      bench.context.disposable.client.db,
      'PERF-R17-L',
      sql`select id from payment_obligations
          where status = 'PENDING' and kind = 'DEPOSIT' limit 50`,
    );

    recorder.add({
      perfId: 'PERF-R17-L',
      source: 'Q-17 at 20000 obligations',
      stats,
      plan,
      note: plan.hasSeqScan
        ? `sequential scan retained at tier L; ${plan.rowsRemovedByFilter} rows filtered to fill a 50-row page`
        : 'partial index chosen at tier L',
    });

    // Whatever the plan, a bounded page must stay cheap. The failure mode
    // worth catching is a scan that has to walk most of the table to fill
    // one page, which is what the filtered-row count would show.
    expect(stats.p95Ms).toBeLessThan(50);
  });

  it('PERF-R21 — deep keyset pagination stays correct and bounded at tier L', async () => {
    const pageSize = 50;
    const seen = new Set<string>();
    let cursor: string | undefined;

    const stats = await measure(
      'PERF-R21-L',
      async () => {
        const rows = await bench.context.disposable.client.db.execute<{
          id: string;
          code: string;
        }>(
          cursor === undefined
            ? sql`select id, code from custom_requests
                  where status = 'APPROVED' order by code limit ${pageSize}`
            : sql`select id, code from custom_requests
                  where status = 'APPROVED' and code > ${cursor}
                  order by code limit ${pageSize}`,
        );
        for (const row of rows.rows) {
          expect(seen.has(row.id)).toBe(false);
          seen.add(row.id);
        }
        cursor = rows.rows[rows.rows.length - 1]?.code;
        return rows.rows.length;
      },
      { warmup: 0, samples: 60 },
    );

    // 3000 distinct rows across 60 pages with no duplicate and no skip, and
    // — the point of measuring at depth — page 60 costs what page 1 costs.
    expect(seen.size).toBe(60 * pageSize);
    expect(stats.maxMs).toBeLessThan(stats.medianMs * 20);

    recorder.add({
      perfId: 'PERF-R21-L',
      source: 'Q-21 keyset walk, 60 deep pages at tier L',
      stats,
      plan: await capturePlan(
        bench.context.disposable.client.db,
        'PERF-R21-L',
        sql`select id, code from custom_requests
            where status = 'APPROVED' and code > 'REQ-00010000'
            order by code limit 50`,
      ),
      note: `${seen.size} distinct rows, zero duplicates, latency flat with depth`,
    });
  });
});
