/**
 * Shared seeding for the `APP12-N02.B01` variant suites.
 *
 * The two suites ask different questions — the write and the rules it is
 * refused by, and what two concurrent connections do — but both need the same
 * Product row and the same Admin actor binding. One fixture rather than two
 * copies: a seed that drifted between files would make two suites test two
 * different worlds while both looked green.
 *
 * The actor plumbing (`seedAdmin`, `asAdmin`, `codeOf`, `counter`) is imported
 * from the SKU fixture rather than re-implemented. None of it is SKU-specific —
 * it mints the single ACTIVE operator `uq_admin_accounts__status__active`
 * admits and binds it the way the HTTP pipeline would — and a second copy would
 * be two ways to seed the one operator a suite may hold.
 *
 * Test-only.
 */
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';

import { AuditContextModule } from '../../../../platform/audit-context/audit-context.module';
import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import type { ConcurrencyTestContext } from '../../../../tests/integration/db8-concurrency-context';
import { CatalogVariantModule } from '../../catalog-variant.module';

export { asAdmin, codeOf, counter, seedAdmin } from './sku-fixture';

/** The module graph every variant suite compiles. */
export const VARIANT_TEST_MODULES = [
  RequestContextModule,
  AuditContextModule,
  CatalogVariantModule,
];

/** `thu-bong` — migration 0033 reference data, re-provisioned after a reset. */
const CATEGORY_ID = '019a0000-0000-7000-8000-000000000001';

type Db = ConcurrencyTestContext['disposable']['client']['db'];

/**
 * A Product in the named lifecycle state, with **no** variant.
 *
 * Deliberately different from the SKU fixture's seeder, which creates a variant
 * as well: these suites are about the operation that creates the first one, and
 * a seeded variant would hide the empty case the whole checkpoint exists for.
 */
export async function seedProduct(db: Db, status = 'DRAFT'): Promise<string> {
  // `reset()` truncates every table, migration 0033's reference rows included,
  // so the taxonomy row is re-provisioned with its own fixed id.
  await db.execute(sql`
    insert into categories (id, name, slug, display_order, status, is_indexable)
    values (${CATEGORY_ID}, 'Thú bông', 'thu-bong', 10, 'PUBLISHED', true)
    on conflict (id) do nothing
  `);
  const productId = newId();
  await db.execute(sql`
    insert into products (id, category_id, name, slug, base_price_amount, currency_code,
                          status, is_display_out_of_stock, display_order, is_indexable)
    values (${productId}, ${CATEGORY_ID}, 'Áo thun cotton', ${`ao-thun-${productId}`},
            '250000', 'VND', ${status}, false, 0, true)
  `);
  return productId;
}

/** A variant written directly, for cases about rows the service did not create. */
export async function seedVariantRow(
  db: Db,
  productId: string,
  variant: {
    readonly colorName?: string | null;
    readonly sizeLabel?: string | null;
    readonly displayOrder?: number;
    readonly isActive?: boolean;
  } = {},
): Promise<string> {
  const variantId = newId();
  await db.execute(sql`
    insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
    values (${variantId}, ${productId}, ${variant.colorName ?? null}, ${variant.sizeLabel ?? null},
            ${variant.displayOrder ?? 0}, ${variant.isActive ?? true})
  `);
  return variantId;
}

/** A SKU written directly — variant authoring never creates one. */
export async function seedSkuRow(
  db: Db,
  variantId: string,
  sku: {
    readonly code: string;
    readonly isActive?: boolean;
    readonly priceOverride?: string | null;
  },
): Promise<string> {
  const skuId = newId();
  await db.execute(sql`
    insert into skus (id, product_variant_id, code, price_override_amount, currency_code, is_active)
    values (${skuId}, ${variantId}, ${sku.code}, ${sku.priceOverride ?? null}, 'VND',
            ${sku.isActive ?? true})
  `);
  return skuId;
}

export const variantCount = (productId: string) =>
  sql`select count(*)::text as count from product_variants where product_id = ${productId}`;

export const activeVariantCount = (productId: string) =>
  sql`select count(*)::text as count from product_variants
       where product_id = ${productId} and is_active = true`;
