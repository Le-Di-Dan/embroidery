/**
 * Fixture for the `APP12-B02` Ready-Made order suites.
 *
 * Everything a creation transaction needs and nothing it produces: a verified
 * customer with a primary contact, a live `SUBMISSION` challenge, a published
 * catalog chain down to an order-eligible SKU, and a `sku_stocks` anchor with a
 * stated on-hand quantity.
 *
 * Raw SQL, on the `custom-request-submission-fixture.ts` precedent: this is
 * **setup**, and routing it through four modules' APIs would make a failure in
 * any of them look like an order-creation failure. The rows under test — the
 * order, its line, its shipping detail, its reservation, its ledger entry, its
 * idempotency record and its outbox event — are created only by the endpoint.
 *
 * Every seeded row is created inside a **disposable** database and dropped with
 * it. Nothing here touches shared development data (`APP12-B01-C1`), and
 * nothing it creates is representative UAT data — `APP12-G03` owns that and has
 * not started.
 *
 * Test-only.
 */
import { newId } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { sql } from 'drizzle-orm';

export interface ReadyMadeFixture {
  readonly customerId: string;
  readonly contactPointId: string;
  readonly contact: string;
  readonly challengeId: string;
  readonly categoryId: string;
  readonly productId: string;
  readonly productSlug: string;
  readonly productVariantId: string;
  readonly skuId: string;
  readonly skuStockId: string;
  /** `products.base_price_amount`, as seeded. */
  readonly basePriceAmount: string;
  /** `sku_stocks.quantity_on_hand`, as seeded. */
  readonly quantityOnHand: number;
}

export interface SeedReadyMadeOptions {
  readonly label: string;
  /** Default `150000`. Whole đồng, as the VND scale CHECK requires. */
  readonly basePriceAmount?: number;
  /** Default `10`. Pass `undefined` via `withStockAnchor: false` to seed none. */
  readonly quantityOnHand?: number;
  /** Default `true`. `false` seeds a SKU with no `sku_stocks` row at all. */
  readonly withStockAnchor?: boolean;
  /** Default `'SUBMISSION'`. */
  readonly challengePurpose?: 'SUBMISSION' | 'STEP_UP';
  /** Default `'VERIFIED'`. */
  readonly challengeStatus?: 'ISSUED' | 'VERIFIED' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
  /** Default `1`. Negative values seed an already-expired challenge. */
  readonly challengeExpiresInHours?: number;
  /** Default `'PUBLISHED'`. */
  readonly productStatus?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  /** Default `'PUBLISHED'`. */
  readonly categoryStatus?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  /** Default `true`. */
  readonly variantActive?: boolean;
  /** Default `true`. */
  readonly skuActive?: boolean;
  /** Default absent — the base price applies. Whole đồng. */
  readonly priceOverrideAmount?: number;
  /** Default absent. `null` on both attribute columns proves the no-label case. */
  readonly withoutVariantLabels?: boolean;
}

export async function seedReadyMadeContext(
  database: DisposableDatabase,
  options: SeedReadyMadeOptions,
): Promise<ReadyMadeFixture> {
  const db = database.client.db;
  const customerId = newId();
  const contactPointId = newId();
  const challengeId = newId();
  const categoryId = newId();
  const productId = newId();
  const productVariantId = newId();
  const skuId = newId();
  const skuStockId = newId();

  const contact = `b02-${options.label}-${customerId}@example.com`;
  const productSlug = `b02-${options.label}-${productId}`;
  const basePrice = options.basePriceAmount ?? 150_000;
  const quantityOnHand = options.quantityOnHand ?? 10;
  const challengeStatus = options.challengeStatus ?? 'VERIFIED';

  await db.execute(sql`
    insert into customers (id, display_name, verified_at)
    values (${customerId}, ${`B02 ${options.label}`}, now())
  `);
  await db.execute(sql`
    insert into customer_contact_points
      (id, customer_id, contact_kind, normalized_value, display_value, is_primary,
       verified_at, verified_source)
    values (${contactPointId}, ${customerId}, 'EMAIL', ${contact}, ${contact}, true,
            now(), 'VERIFICATION_SUBMISSION')
  `);
  await db.execute(sql`
    insert into contact_verification_challenges
      (id, contact_point_id, contact_kind, normalized_value, purpose, code_hash, status,
       expires_at, verified_at)
    values (${challengeId}, ${contactPointId}, 'EMAIL', ${contact},
            ${options.challengePurpose ?? 'SUBMISSION'}, 'code-hash', ${challengeStatus},
            now() + make_interval(hours => ${options.challengeExpiresInHours ?? 1}),
            ${challengeStatus === 'VERIFIED' ? sql`now()` : sql`null`})
  `);

  await db.execute(sql`
    insert into categories (id, name, slug, status, display_order, is_indexable)
    values (${categoryId}, 'B02 Fixture', ${`b02-${categoryId}`},
            ${options.categoryStatus ?? 'PUBLISHED'}, 1, true)
  `);
  await db.execute(sql`
    insert into products
      (id, category_id, name, slug, base_price_amount, currency_code, status,
       is_display_out_of_stock, display_order, is_indexable)
    values (${productId}, ${categoryId}, 'B02 Tee', ${productSlug}, ${basePrice}, 'VND',
            ${options.productStatus ?? 'PUBLISHED'}, false, 1, true)
  `);
  await db.execute(sql`
    insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
    values (${productVariantId}, ${productId},
            ${options.withoutVariantLabels === true ? null : 'Black'},
            ${options.withoutVariantLabels === true ? null : 'M'},
            1, ${options.variantActive ?? true})
  `);
  await db.execute(sql`
    insert into skus
      (id, product_variant_id, code, price_override_amount, currency_code, is_active)
    values (${skuId}, ${productVariantId}, ${`SKU-${skuId}`},
            ${options.priceOverrideAmount ?? null}, 'VND', ${options.skuActive ?? true})
  `);

  if (options.withStockAnchor !== false) {
    await db.execute(sql`
      insert into sku_stocks (id, sku_id, quantity_on_hand)
      values (${skuStockId}, ${skuId}, ${quantityOnHand})
    `);
  }

  return {
    customerId,
    contactPointId,
    contact,
    challengeId,
    categoryId,
    productId,
    productSlug,
    productVariantId,
    skuId,
    skuStockId,
    basePriceAmount: `${String(basePrice)}.00`,
    quantityOnHand,
  };
}

/** The delivery block every suite sends unless it is testing delivery itself. */
export function deliveryBody(): Record<string, string> {
  return {
    recipientName: 'Nguyen Van A',
    recipientPhone: '0900000000',
    addressLine: '12 Le Loi',
    ward: 'Ben Nghe',
    district: 'Quan 1',
    province: 'Ho Chi Minh',
  };
}

/** A complete, valid creation body for one fixture. */
export function createBody(
  fixture: ReadyMadeFixture,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    challengeId: fixture.challengeId,
    skuId: fixture.skuId,
    quantity: 1,
    delivery: deliveryBody(),
    ...overrides,
  };
}

/** Seeds a second verified `SUBMISSION` challenge on the same customer. */
export async function seedAnotherChallenge(
  database: DisposableDatabase,
  fixture: ReadyMadeFixture,
): Promise<string> {
  const challengeId = newId();
  await database.client.db.execute(sql`
    insert into contact_verification_challenges
      (id, contact_point_id, contact_kind, normalized_value, purpose, code_hash, status,
       expires_at, verified_at)
    values (${challengeId}, ${fixture.contactPointId}, 'EMAIL', ${fixture.contact},
            'SUBMISSION', 'code-hash', 'VERIFIED', now() + interval '1 hour', now())
  `);
  return challengeId;
}
