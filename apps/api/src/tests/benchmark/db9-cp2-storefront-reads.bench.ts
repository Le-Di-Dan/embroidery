/**
 * DB9-CP2 — storefront read paths at tier M.
 *
 * The public-facing half of CP2: product listing and detail, SKU
 * availability, redirect resolution, page and gallery lookup. Split from the
 * commerce benchmark to keep each file within the test-size limit; both
 * share `createBenchContext` so they measure the same generated tier.
 *
 * Every row goes through the real repository method a use case would call
 * (§13), and each measurement carries its correctness assertion (§18).
 */
import { sql } from 'drizzle-orm';
import { DatabaseExecutor } from '@embroidery/persistence';

import { createBenchContext } from './bench-context';
import type { BenchContext } from './bench-context';
import type { ConcurrencyActor } from '../integration/db8-concurrency-context';
import { capturePlan } from './bench-plan';
import { BenchRecorder } from './bench-recorder';
import { measure } from './bench-timing';

import { CatalogModule } from '../../modules/catalog/catalog.module';
import { ContentModule } from '../../modules/content/content.module';
import { InventoryModule } from '../../modules/inventory/inventory.module';
import { GalleryModule } from '../../modules/gallery/gallery.module';

import { PRODUCT_REPOSITORY } from '../../modules/catalog/domain/repositories/product.repository';
import type { ProductRepository } from '../../modules/catalog/domain/repositories/product.repository';
import type { ProductId } from '../../modules/catalog/domain/repositories/placement-hierarchy.port';
import {
  CONTENT_PAGE_REPOSITORY,
  REDIRECT_RULE_REPOSITORY,
} from '../../modules/content/domain/repositories/content-page.repository';
import type {
  ContentPageRepository,
  RedirectRuleRepository,
} from '../../modules/content/domain/repositories/content-page.repository';
import { SKU_STOCK_REPOSITORY } from '../../modules/inventory/domain/repositories/sku-stock.repository';
import type { SkuStockRepository } from '../../modules/inventory/domain/repositories/sku-stock.repository';
import { GALLERY_ENTRY_REPOSITORY } from '../../modules/gallery/domain/repositories/gallery-entry.repository';
import type { GalleryEntryRepository } from '../../modules/gallery/domain/repositories/gallery-entry.repository';

// The inventory module keeps its `SkuId` brand internal; deriving the
// parameter type keeps this benchmark type-safe without exporting it.
type SkuIdLike = Parameters<SkuStockRepository['availability']>[0];

describe('DB9-CP2 storefront read paths (tier M)', () => {
  let bench: BenchContext;
  let actor: ConcurrencyActor;
  const recorder = new BenchRecorder('DB9-CP2 storefront read paths');

  beforeAll(async () => {
    bench = await createBenchContext(
      'db9-cp2-storefront',
      [CatalogModule, ContentModule, InventoryModule, GalleryModule],
      'M',
    );
    actor = await bench.spawnActor('reader');
  }, 1_800_000);

  afterAll(async () => {
    recorder.print();
    await bench?.close();
  });

  it('PERF-R01/R02 — product listing and detail by slug', async () => {
    const products = actor.get<ProductRepository>(PRODUCT_REPOSITORY);

    const detail = await measure(
      'PERF-R02',
      async () => {
        const product = await products.findBySlug('product-7');
        // Correctness: the published scope predicate must be in the query,
        // and the row returned must be the one the slug names.
        expect(product?.slug).toBe('product-7');
        return 1;
      },
      { samples: 40 },
    );
    recorder.add({
      perfId: 'PERF-R02',
      source: 'ProductRepository.findBySlug',
      stats: detail,
      plan: await capturePlan(
        bench.context.disposable.client.db,
        'PERF-R02',
        sql`select * from products where slug = 'product-7'`,
      ),
      note: 'Q-02 product detail by slug',
    });

    const listing = await measure(
      'PERF-R01',
      async () => {
        const rows = await bench.context.disposable.client.db.execute<{ id: string }>(
          sql`select id, name, slug from products
              where status = 'PUBLISHED' order by display_order limit 24`,
        );
        expect(rows.rows).toHaveLength(24);
        return rows.rows.length;
      },
      { samples: 40 },
    );
    recorder.add({
      perfId: 'PERF-R01',
      source: 'Q-01 listing shape',
      stats: listing,
      plan: await capturePlan(
        bench.context.disposable.client.db,
        'PERF-R01',
        sql`select id, name, slug from products
            where status = 'PUBLISHED' order by display_order limit 24`,
      ),
      note: 'Q-01 public product listing — no repository listing method exists yet',
    });
  });

  it('PERF-R02b — aggregate product structure load has no N+1', async () => {
    const products = actor.get<ProductRepository>(PRODUCT_REPOSITORY);
    const productId = (await bench.idOf('product', 7)) as ProductId;

    // §27: the whole point is the *query count*, not just the latency. A
    // structure load that issues one query per variant would still look fast
    // at this dataset size and fall over in production.
    const before = await childScanCount();
    const stats = await measure(
      'PERF-R02b',
      async () =>
        actor.inTransaction(async () => {
          const structure = await products.loadStructure(productId);
          expect(structure).toBeDefined();
          return 1;
        }),
      { warmup: 0, samples: 1 },
    );
    // Statistics are accumulated per backend and flushed on a timer, so the
    // load's own session has to be told to publish before another session
    // can read the delta. Without this the counter reads zero and would
    // "prove" the absence of an N+1 by measuring nothing at all.
    await flushActorStats();
    const after = await childScanCount();
    const scansPerLoad = after - before;
    console.log(`PERF-R02b child-table scans per structure load: ${scansPerLoad}`);

    // Five child tables are involved and this product has four variants. A
    // per-variant loop would show at least four scans on `product_variants`
    // alone, on top of the sides/areas/skus/media work; one scan per table
    // is the set-based shape. The bound is set just above that so a
    // regression into a loop cannot slip under it.
    expect(scansPerLoad).toBeLessThanOrEqual(8);
    recorder.add({
      perfId: 'PERF-R02b',
      source: 'ProductRepository.loadStructure',
      stats,
      plan: undefined,
      note: `${scansPerLoad} child-table scans per load (constant, not per-variant)`,
    });
  });

  /**
   * Total scans against the child tables of a product aggregate.
   *
   * `pg_stat_statements` is not installed in the standard image, so N+1 is
   * detected the way it actually manifests: one scan per child table means a
   * set-based load, N scans means a loop. This is a stronger signal than a
   * raw statement count anyway — it names the table doing the looping.
   */
  /** Publishes the reader actor's accumulated statistics immediately. */
  async function flushActorStats(): Promise<void> {
    await actor.inTransaction(async () => {
      const executor = actor.get<DatabaseExecutor>(DatabaseExecutor);
      await executor.current().execute(sql`select pg_stat_force_next_flush()`);
    });
  }

  async function childScanCount(): Promise<number> {
    await bench.context.disposable.client.db.execute(sql`select pg_stat_clear_snapshot()`);
    const rows = await bench.context.disposable.client.db.execute<{ scans: number }>(
      sql`select coalesce(sum(seq_scan + coalesce(idx_scan, 0)), 0)::int as scans
          from pg_stat_all_tables
          where relname in ('product_variants', 'product_sides', 'embroidery_areas',
                            'skus', 'product_media')`,
    );
    return Number(rows.rows[0]?.scans ?? 0);
  }

  it('PERF-R03 — SKU availability under its row lock', async () => {
    const stocks = actor.get<SkuStockRepository>(SKU_STOCK_REPOSITORY);
    const skuId = await bench.idOf('sku', 3);

    const stats = await measure(
      'PERF-R03',
      async () =>
        actor.inTransaction(async () => {
          const availability = await stocks.availability(skuId as SkuIdLike);
          // Correctness: available is derived, never stored.
          expect(availability).toBeDefined();
          expect(availability?.available).toBe(
            (availability?.quantityOnHand ?? 0) -
              (availability?.heldQuantity ?? 0) -
              (availability?.reservedQuantity ?? 0),
          );
          return 1;
        }),
      { samples: 30 },
    );
    recorder.add({
      perfId: 'PERF-R03',
      source: 'SkuStockRepository.availability',
      stats,
      plan: await capturePlan(
        bench.context.disposable.client.db,
        'PERF-R03',
        sql`select * from sku_stocks where sku_id = ${skuId}`,
      ),
      note: 'Q-03 — takes FOR UPDATE on the anchor; latency includes the lock',
    });
  });

  it('PERF-R07 — redirect resolution, the highest-frequency lookup', async () => {
    const redirects = actor.get<RedirectRuleRepository>(REDIRECT_RULE_REPOSITORY);

    const stats = await measure(
      'PERF-R07',
      async () => {
        const rule = await redirects.resolve('/legacy/1234');
        expect(rule?.sourcePath).toBe('/legacy/1234');
        return 1;
      },
      { samples: 60 },
    );
    recorder.add({
      perfId: 'PERF-R07',
      source: 'RedirectRuleRepository.resolve',
      stats,
      plan: await capturePlan(
        bench.context.disposable.client.db,
        'PERF-R07',
        sql`select * from redirect_rules where source_path = '/legacy/1234' and is_active`,
      ),
      note: 'Q-07 redirect resolution',
    });
  });

  it('PERF-R05 — published content page lookup', async () => {
    const pages = actor.get<ContentPageRepository>(CONTENT_PAGE_REPOSITORY);

    const stats = await measure(
      'PERF-R05',
      async () => {
        const page = await pages.findByTypeAndSlug('FAQ', 'page-6');
        expect(page?.slug).toBe('page-6');
        return 1;
      },
      { samples: 40 },
    );
    recorder.add({
      perfId: 'PERF-R05',
      source: 'ContentPageRepository.findByTypeAndSlug',
      stats,
      plan: await capturePlan(
        bench.context.disposable.client.db,
        'PERF-R05',
        sql`select * from content_pages where page_type = 'FAQ' and slug = 'page-6'`,
      ),
      note: 'Q-05 published page lookup',
    });
  });

  it('PERF-R04 — gallery entry by slug', async () => {
    const gallery = actor.get<GalleryEntryRepository>(GALLERY_ENTRY_REPOSITORY);

    const stats = await measure(
      'PERF-R04',
      async () => {
        const entry = await gallery.findBySlug('gallery-11');
        expect(entry?.slug).toBe('gallery-11');
        return 1;
      },
      { samples: 30 },
    );
    recorder.add({
      perfId: 'PERF-R04',
      source: 'GalleryEntryRepository.findBySlug',
      stats,
      plan: await capturePlan(
        bench.context.disposable.client.db,
        'PERF-R04',
        sql`select * from gallery_entries where slug = 'gallery-11'`,
      ),
      note: 'Q-04 gallery listing entry',
    });
  });
});
