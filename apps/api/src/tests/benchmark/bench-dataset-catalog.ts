/**
 * Catalog, content and customer volume for the DB9 dataset (DB9-CP1).
 *
 * Covers the storefront read families — Q-01 product listing, Q-02 detail,
 * Q-03 availability, Q-04 gallery, Q-05 page lookup, Q-06 sitemap, Q-07
 * redirect resolution, Q-20 low-stock dashboard.
 *
 * Test-only.
 */
import { sql } from 'drizzle-orm';

import type { OrderFixture } from '../../modules/order/tests/integration/order-fixture';
import type { PlanRunner } from './bench-plan';
import type { DatasetTier } from './bench-dataset-tiers';

/**
 * Catalog breadth plus the stock rows behind it.
 *
 * Status is skewed rather than uniform: roughly 80% PUBLISHED, the rest
 * DRAFT/ARCHIVED. Q-01's security predicate (`status = 'PUBLISHED'`) is only
 * an interesting index condition when it actually excludes rows.
 */
export async function seedCatalogVolume(
  runner: PlanRunner,
  spec: DatasetTier,
  seed: string,
  backbone: OrderFixture,
): Promise<void> {
  await runner.execute(sql`
    insert into categories (id, name, slug, status, display_order, is_indexable)
    select bench_uuid(${`${seed}:category`}, n),
           'Category ' || n,
           'category-' || n,
           case when n % 10 = 0 then 'DRAFT' else 'PUBLISHED' end,
           n,
           n % 10 <> 0
    from generate_series(1, ${spec.categories}) as n
  `);

  await runner.execute(sql`
    insert into products (id, category_id, name, slug, base_price_amount, currency_code,
                          status, is_display_out_of_stock, display_order, is_indexable)
    select bench_uuid(${`${seed}:product`}, n),
           bench_uuid(${`${seed}:category`}, 1 + (n % ${spec.categories})),
           'Product ' || n,
           'product-' || n,
           100000 + (n % 50) * 1000,
           'VND',
           case when n % 5 = 0 then 'DRAFT' else 'PUBLISHED' end,
           n % 17 = 0,
           n,
           n % 5 <> 0
    from generate_series(1, ${spec.products}) as n
  `);

  await runner.execute(sql`
    insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
    select bench_uuid(${`${seed}:variant`}, n),
           bench_uuid(${`${seed}:product`}, 1 + ((n - 1) / ${spec.variantsPerProduct})),
           (array['Black', 'White', 'Navy', 'Olive', 'Sand', 'Red'])[1 + (n % 6)],
           (array['S', 'M', 'L', 'XL'])[1 + (n % 4)],
           n,
           n % 23 <> 0
    from generate_series(1, ${spec.products * spec.variantsPerProduct}) as n
  `);

  await runner.execute(sql`
    insert into skus (id, product_variant_id, code, currency_code, is_active)
    select bench_uuid(${`${seed}:sku`}, n),
           bench_uuid(${`${seed}:variant`}, n),
           'SKU-' || lpad(n::text, 8, '0'),
           'VND',
           n % 23 <> 0
    from generate_series(1, ${spec.products * spec.variantsPerProduct}) as n
  `);

  // Hot-SKU skew: the first 5% of SKUs carry low stock (the interesting side
  // of Q-20's threshold predicate); the rest are comfortably stocked.
  await runner.execute(sql`
    insert into sku_stocks (id, sku_id, quantity_on_hand, low_stock_threshold)
    select bench_uuid(${`${seed}:stock`}, n),
           bench_uuid(${`${seed}:sku`}, n),
           case when n % 20 = 1 then 2 + (n % 3) else 100 + (n % 400) end,
           case when n % 7 = 0 then null else 10 end
    from generate_series(1, ${spec.products * spec.variantsPerProduct}) as n
  `);

  // Customer fanout. Every customer gets one verified primary contact point,
  // matching the shape QX-08 and Q-09 read.
  await runner.execute(sql`
    insert into customers (id, display_name, verified_at)
    select bench_uuid(${`${seed}:customer`}, n),
           'Customer ' || n,
           now() - (n || ' minutes')::interval
    from generate_series(1, ${spec.customers}) as n
  `);

  await runner.execute(sql`
    insert into customer_contact_points
      (id, customer_id, contact_kind, normalized_value, display_value,
       is_primary, verified_at, verified_source)
    select bench_uuid(${`${seed}:contact`}, n),
           bench_uuid(${`${seed}:customer`}, n),
           'EMAIL',
           'bench-' || n || '@example.com',
           'bench-' || n || '@example.com',
           true,
           now() - (n || ' minutes')::interval,
           'OTP'
    from generate_series(1, ${spec.customers}) as n
  `);

  // Gallery entries link back to the backbone product so the join path Q-04
  // walks is real rather than always-null.
  await runner.execute(sql`
    insert into gallery_entries
      (id, title, slug, description, status, display_order, linked_product_id,
       is_indexable)
    select bench_uuid(${`${seed}:gallery`}, n),
           'Gallery ' || n,
           'gallery-' || n,
           'Bench gallery entry ' || n,
           case when n % 6 = 0 then 'DRAFT' else 'PUBLISHED' end,
           n,
           case when n % 3 = 0 then ${backbone.productId}::uuid else null end,
           n % 6 <> 0
    from generate_series(1, ${spec.galleryEntries}) as n
  `);
}

/**
 * Content pages and redirect rules.
 *
 * Redirects get the largest count relative to their usefulness on purpose:
 * Q-07 is the highest-frequency lookup in the catalog and the one most
 * likely to degrade into a scan if its index is ever lost.
 */
export async function seedContentVolume(
  runner: PlanRunner,
  spec: DatasetTier,
  seed: string,
): Promise<void> {
  await runner.execute(sql`
    insert into content_pages (id, page_type, slug, title, body, status, is_indexable)
    select bench_uuid(${`${seed}:page`}, n),
           (array['SERVICE', 'FAQ', 'LOCAL', 'LANDING', 'POLICY'])[1 + (n % 5)],
           'page-' || n,
           'Page ' || n,
           repeat('content ', 40),
           case when n % 8 = 0 then 'DRAFT' else 'PUBLISHED' end,
           n % 8 <> 0
    from generate_series(1, ${spec.contentPages}) as n
  `);

  await runner.execute(sql`
    insert into redirect_rules (id, source_path, target_path, redirect_kind, is_active)
    select bench_uuid(${`${seed}:redirect`}, n),
           '/legacy/' || n,
           '/product-' || (1 + (n % ${spec.products})),
           case when n % 4 = 0 then 'TEMPORARY' else 'PERMANENT' end,
           n % 11 <> 0
    from generate_series(1, ${spec.redirectRules}) as n
  `);
}
