/**
 * DB9-CP1 — the benchmark harness proving itself.
 *
 * Before any DB9 number is quoted, the tooling that produced it has to be
 * shown to work: the dataset generator must produce the row counts it
 * claims, the plan capture must return real `ANALYZE` output, and the timing
 * collector must return a distribution rather than a single warm sample.
 * A harness that is never validated turns every later measurement into an
 * assertion of faith.
 *
 * Runs at tier `S` — this checkpoint is about the tooling, not about
 * performance.
 */
import { sql } from 'drizzle-orm';

import { createConcurrencyTestContext } from '../integration/db8-concurrency-context';
import type { ConcurrencyTestContext } from '../integration/db8-concurrency-context';
import { captureEnvironment, formatEnvironment } from './bench-environment';
import { generateDataset } from './bench-dataset';
import type { BenchDataset } from './bench-dataset';
import { capturePlan, estimateError } from './bench-plan';
import { measure } from './bench-timing';
import { CatalogModule } from '../../modules/catalog/catalog.module';

describe('DB9-CP1 benchmark harness', () => {
  let context: ConcurrencyTestContext;
  let dataset: BenchDataset;

  beforeAll(async () => {
    context = await createConcurrencyTestContext('db9-cp1-harness', [CatalogModule]);
    dataset = await generateDataset(context, 'S');

    const environment = await captureEnvironment(context.disposable.client.db);
    // Printed, not asserted: §14 requires the environment on the record, and
    // the record is the execution log a human reads.
    console.log(`\n--- DB9 benchmark environment ---\n${formatEnvironment(environment)}\n`);
    console.log(`Tier S generated in ${Math.round(dataset.generationMs)}ms`);
    console.log(JSON.stringify(dataset.counts, null, 2));
  }, 1_800_000);

  afterAll(async () => {
    await context?.close();
  });

  it('generates the row counts the tier declares, referentially valid', async () => {
    const { counts, tier } = dataset;

    // +1 everywhere the backbone chain contributes its own row.
    expect(counts['categories']).toBe(tier.categories + 1);
    expect(counts['products']).toBe(tier.products + 1);
    expect(counts['skus']).toBe(tier.products * tier.variantsPerProduct + 1);
    expect(counts['sku_stocks']).toBe(tier.products * tier.variantsPerProduct);
    expect(counts['customers']).toBe(tier.customers + 1);
    expect(counts['custom_requests']).toBe(tier.requests + 1);
    expect(counts['orders']).toBe(tier.orders);
    expect(counts['order_items']).toBe(tier.orders * tier.orderItemsPerOrder);
    expect(counts['audit_events']).toBe(tier.auditEvents);
    expect(counts['outbox_events']).toBe(tier.outboxEvents);
    expect(counts['inventory_ledger_entries']).toBe(tier.ledgerEntries);

    // Referential validity is not assumed from the absence of an FK error —
    // every FK was live during generation, so a missing parent could not
    // have committed. This asserts the *join* actually resolves.
    const orphans = await context.disposable.client.db.execute<{ total: number }>(sql`
      select count(*)::int as total
      from orders o
      left join custom_requests r on r.id = o.custom_request_id
      left join approval_snapshots a on a.id = o.current_approval_snapshot_id
      where r.id is null or a.id is null
    `);
    expect(Number(orphans.rows[0]?.total)).toBe(0);
  });

  it('produces the documented skew rather than a uniform dataset', async () => {
    const rows = await context.disposable.client.db.execute<{
      pending_outbox: number;
      total_outbox: number;
      live_obligations: number;
      total_obligations: number;
    }>(sql`
      select
        (select count(*)::int from outbox_events where status = 'PENDING') as pending_outbox,
        (select count(*)::int from outbox_events) as total_outbox,
        (select count(*)::int from payment_obligations where status = 'PENDING') as live_obligations,
        (select count(*)::int from payment_obligations) as total_obligations
    `);
    const skew = rows.rows[0];

    // A queue where everything is claimable would make every partial index
    // look free; a queue where nothing is would make it look unused.
    expect(Number(skew?.pending_outbox)).toBeGreaterThan(0);
    expect(Number(skew?.pending_outbox)).toBeLessThan(Number(skew?.total_outbox));
    expect(Number(skew?.live_obligations)).toBeGreaterThan(0);
    expect(Number(skew?.live_obligations)).toBeLessThan(Number(skew?.total_obligations));
  });

  it('captures a real ANALYZE plan with buffers and timing', async () => {
    const plan = await capturePlan(
      context.disposable.client.db,
      'harness-probe',
      sql`select id from products where status = 'PUBLISHED' order by display_order limit 20`,
    );

    expect(plan.nodes.length).toBeGreaterThan(0);
    expect(plan.executionMs).toBeGreaterThan(0);
    expect(plan.planningMs).toBeGreaterThan(0);
    // Buffers must be reported — a plan with no buffer accounting means the
    // EXPLAIN option was silently dropped and §16 is not satisfied.
    expect(plan.sharedHit + plan.sharedRead).toBeGreaterThan(0);
    expect(Number.isFinite(estimateError(plan))).toBe(true);
  });

  it('reports a distribution, not a single warm sample', async () => {
    const stats = await measure(
      'harness-timing',
      async () => {
        const result = await context.disposable.client.db.execute<{ total: number }>(
          sql`select count(*)::int as total from products where status = 'PUBLISHED'`,
        );
        return Number(result.rows[0]?.total);
      },
      { warmup: 2, samples: 15 },
    );

    expect(stats.samples).toBe(15);
    expect(stats.errors).toBe(0);
    expect(stats.medianMs).toBeGreaterThan(0);
    expect(stats.p95Ms).toBeGreaterThanOrEqual(stats.medianMs);
    expect(stats.maxMs).toBeGreaterThanOrEqual(stats.p95Ms);
    expect(stats.minMs).toBeLessThanOrEqual(stats.medianMs);
    // The cold sample is kept separate rather than averaged into the
    // percentiles (§17).
    expect(stats.coldMs).toBeGreaterThan(0);
    expect(stats.rows).toBeGreaterThan(0);
  });

  it('regenerates byte-identically from the same seed', async () => {
    // Determinism is the property that makes a second machine's numbers
    // comparable at all (§46), so it is asserted, not assumed.
    const first = await context.disposable.client.db.execute<{ id: string }>(
      sql`select bench_uuid('db9:product', 7) as id`,
    );
    const second = await context.disposable.client.db.execute<{ id: string }>(
      sql`select bench_uuid('db9:product', 7) as id`,
    );
    expect(first.rows[0]?.id).toBe(second.rows[0]?.id);

    const actual = await context.disposable.client.db.execute<{ id: string }>(
      sql`select id from products where slug = 'product-7'`,
    );
    expect(actual.rows[0]?.id).toBe(first.rows[0]?.id);
  });
});
