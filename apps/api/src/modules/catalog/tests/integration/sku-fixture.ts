/**
 * Shared seeding and actor plumbing for the `APP7-B01` SKU suites.
 *
 * The three suites ask different questions — the write itself, the rules it is
 * refused by, and what two concurrent connections do — but they all need the
 * same three rows and the same Admin actor binding. One fixture rather than
 * three copies: a seed that drifted between files would make two suites test
 * two different worlds while both looked green.
 *
 * Test-only.
 */
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';

import { AuditContextModule } from '../../../../platform/audit-context/audit-context.module';
import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import type {
  ConcurrencyActor,
  ConcurrencyTestContext,
} from '../../../../tests/integration/db8-concurrency-context';
import { CatalogSkuModule } from '../../catalog-sku.module';

/** The module graph every SKU suite compiles. */
export const SKU_TEST_MODULES = [RequestContextModule, AuditContextModule, CatalogSkuModule];

/** `thu-bong` — migration 0033 reference data, re-provisioned after a reset. */
const CATEGORY_ID = '019a0000-0000-7000-8000-000000000001';

type Db = ConcurrencyTestContext['disposable']['client']['db'];

export interface SeededVariant {
  readonly productId: string;
  readonly variantId: string;
}

/**
 * Mints the single ACTIVE operator a suite may hold.
 *
 * `uq_admin_accounts__status__active` admits exactly one, so this is called once
 * per reset and never alongside each seeded product.
 */
export async function seedAdmin(db: Db, label: string): Promise<string> {
  const adminId = newId();
  await db.execute(sql`
    insert into admin_accounts (id, email, display_name, status)
    values (${adminId}, ${`${label}-${adminId}@example.test`}, 'B01 Operator', 'ACTIVE')
  `);
  return adminId;
}

/** A product in the named lifecycle state, with one active variant. */
export async function seedVariant(db: Db, status = 'PUBLISHED'): Promise<SeededVariant> {
  // `reset()` truncates every table, migration 0033's reference rows included,
  // so the taxonomy row is re-provisioned with its own fixed id rather than a
  // fabricated one.
  await db.execute(sql`
    insert into categories (id, name, slug, display_order, status, is_indexable)
    values (${CATEGORY_ID}, 'Thú bông', 'thu-bong', 10, 'PUBLISHED', true)
    on conflict (id) do nothing
  `);
  const productId = newId();
  await db.execute(sql`
    insert into products (id, category_id, name, slug, base_price_amount, currency_code,
                          status, is_display_out_of_stock, display_order, is_indexable)
    values (${productId}, ${CATEGORY_ID}, 'Thú bông gấu nâu', ${`gau-nau-${productId}`},
            '250000', 'VND', ${status}, false, 0, true)
  `);
  const variantId = newId();
  await db.execute(sql`
    insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
    values (${variantId}, ${productId}, 'Nâu', 'M', 0, true)
  `);
  return { productId, variantId };
}

/** Adds a sibling variant to an existing product. */
export async function seedSiblingVariant(db: Db, productId: string): Promise<string> {
  const variantId = newId();
  await db.execute(sql`
    insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
    values (${variantId}, ${productId}, 'Nâu', 'L', 1, true)
  `);
  return variantId;
}

/** Runs `work` with an ADMIN actor bound, the way the HTTP pipeline would. */
export function asAdmin<T>(
  actor: ConcurrencyActor,
  adminId: string,
  work: () => Promise<T>,
): Promise<T> {
  const requestContext = actor.get<RequestContextService>(RequestContextService);
  return requestContext.run({ requestId: newId() }, () => {
    requestContext.bindActor({ kind: 'ADMIN', adminId });
    return work();
  });
}

/** The domain error code a call refused with, or why it did not refuse. */
export async function codeOf(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
  } catch (error: unknown) {
    return (error as { code?: string }).code ?? 'NO_CODE';
  }
  return 'NO_ERROR';
}

export function counter(db: Db) {
  return async (query: ReturnType<typeof sql>): Promise<number> => {
    const [row] = (await db.execute<{ count: string }>(query)).rows;
    return Number(row?.count ?? -1);
  };
}

export const activeSkuCount = (variantId: string) =>
  sql`select count(*)::text as count from skus
       where product_variant_id = ${variantId} and is_active = true`;

export const skuCount = (variantId: string) =>
  sql`select count(*)::text as count from skus where product_variant_id = ${variantId}`;
