/**
 * Shared fixture for the CTX-INV suites (DB7-CP4/CP5).
 *
 * Seeds the SKU a stock row hangs off, plus a request and an order (with a
 * SATISFIED deposit obligation, G-DB7-27) that holds and reservations
 * reference. Raw SQL: this is setup for the inventory guards, not a test of
 * the other contexts.
 *
 * Test-only.
 */
import { newId } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { sql } from 'drizzle-orm';

import type { SkuId } from '../../../catalog/domain/repositories/placement-hierarchy.port';

export interface InventoryFixture {
  readonly skuId: SkuId;
  readonly customRequestId: string;
  readonly orderId: string;
}

/**
 * Only reads `context.disposable`, so both the single-actor DB7
 * `PersistenceTestContext` and the multi-actor DB8 `ConcurrencyTestContext`
 * satisfy this structurally — one seed helper, no duplicated raw-SQL setup
 * between the two harnesses.
 */
export async function seedInventoryChain(context: {
  readonly disposable: DisposableDatabase;
}): Promise<InventoryFixture> {
  const db = context.disposable.client.db;
  const categoryId = newId();
  const productId = newId();
  const variantId = newId();
  const customerId = newId();
  const quotationId = newId();
  const quotationVersionId = newId();
  const designCaseId = newId();
  const designVersionId = newId();
  const approvalId = newId();
  const grantId = newId();
  const challengeId = newId();
  const contactId = newId();
  const assetId = newId();
  const sideId = newId();
  const areaId = newId();

  const skuId = newId() as SkuId;
  const customRequestId = newId();
  const orderId = newId();

  await db.execute(sql`
    insert into customers (id, display_name, verified_at)
    values (${customerId}, 'Stock Customer', now())
  `);
  await db.execute(sql`
    insert into customer_contact_points
      (id, customer_id, contact_kind, normalized_value, display_value, is_primary, verified_at, verified_source)
    values (${contactId}, ${customerId}, 'EMAIL', ${`inv-${customerId}@example.com`},
            ${`inv-${customerId}@example.com`}, true, now(), 'OTP')
  `);
  await db.execute(sql`
    insert into categories (id, name, slug, status, display_order, is_indexable)
    values (${categoryId}, 'Cat', ${`cat-${categoryId}`}, 'PUBLISHED', 1, true)
  `);
  await db.execute(sql`
    insert into products
      (id, category_id, name, slug, base_price_amount, currency_code, status,
       is_display_out_of_stock, display_order, is_indexable)
    values (${productId}, ${categoryId}, 'Tee', ${`tee-${productId}`}, 150000, 'VND',
            'PUBLISHED', false, 1, true)
  `);
  await db.execute(sql`
    insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
    values (${variantId}, ${productId}, 'Black', 'M', 1, true)
  `);
  await db.execute(sql`
    insert into skus (id, product_variant_id, code, currency_code, is_active)
    values (${skuId}, ${variantId}, ${`SKU-${skuId}`}, 'VND', true)
  `);
  await db.execute(sql`
    insert into custom_requests (id, code, customer_id, status)
    values (${customRequestId}, ${`REQ-${customRequestId}`}, ${customerId}, 'APPROVED')
  `);

  // An order the reservations attach to, with the chain it requires.
  await db.execute(sql`
    insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
    values (${assetId}, 'CATALOG_MEDIA', 'PUBLIC', ${`c/${assetId}.png`}, 'image/png', 512, 'ACCEPTED')
  `);
  await db.execute(sql`
    insert into product_sides
      (id, product_id, name, background_asset_id, image_width_px, image_height_px,
       physical_width_mm, physical_height_mm, px_per_mm, display_order)
    values (${sideId}, ${productId}, 'Front', ${assetId}, 1000, 1200, 400, 480, 2.5, 1)
  `);
  await db.execute(sql`
    insert into embroidery_areas
      (id, product_side_id, name, bound_x_px, bound_y_px, bound_width_px, bound_height_px, display_order)
    values (${areaId}, ${sideId}, 'Chest', 100, 150, 300, 200, 1)
  `);
  await db.execute(sql`
    insert into secure_access_grants
      (id, customer_id, custom_request_id, token_hash, scope_kind, status, expires_at)
    values (${grantId}, ${customerId}, ${customRequestId}, ${`h-${grantId}`},
            'REQUEST_ACCESS', 'ACTIVE', now() + interval '1 hour')
  `);
  await db.execute(sql`
    insert into contact_verification_challenges
      (id, contact_point_id, contact_kind, normalized_value, purpose, code_hash, status, expires_at, verified_at)
    values (${challengeId}, ${contactId}, 'EMAIL', ${`inv-${customerId}@example.com`},
            'STEP_UP', 'h', 'VERIFIED', now() + interval '1 hour', now())
  `);
  await db.execute(sql`
    insert into quotations (id, code, custom_request_id, status)
    values (${quotationId}, ${`QUO-${quotationId}`}, ${customRequestId}, 'ACCEPTED')
  `);
  await db.execute(sql`
    insert into quotation_versions
      (id, quotation_id, version, status, quantity_total, subtotal_amount,
       manual_adjustment_amount, shipping_fee_amount, total_amount,
       deposit_percent, deposit_amount, remaining_amount, currency_code, accepted_at)
    values (${quotationVersionId}, ${quotationId}, 1, 'ACCEPTED', 10, 1000000.00,
            0.00, 0.00, 1000000.00, 30.00, 300000.00, 700000.00, 'VND', now())
  `);
  await db.execute(sql`
    insert into design_cases (id, custom_request_id) values (${designCaseId}, ${customRequestId})
  `);
  await db.execute(sql`
    insert into design_versions
      (id, design_case_id, version, status, design_document, document_schema_version,
       document_hash, product_id, product_variant_id, product_side_id, embroidery_area_id,
       physical_width_mm, physical_height_mm, approved_at)
    values (${designVersionId}, ${designCaseId}, 1, 'APPROVED', '{}'::jsonb, 1,
            ${`sha256:${'2'.repeat(64)}`}, ${productId}, ${variantId}, ${sideId}, ${areaId},
            100.00, 100.00, now())
  `);
  await db.execute(sql`
    insert into approval_snapshots
      (id, design_version_id, design_case_id, custom_request_id, customer_id, document_hash,
       product_id, product_variant_id, product_side_id, embroidery_area_id,
       product_name, side_name, area_name, physical_width_mm, physical_height_mm,
       quantity_total, grant_id, step_up_challenge_id, approved_at)
    values (${approvalId}, ${designVersionId}, ${designCaseId}, ${customRequestId},
            ${customerId}, ${`sha256:${'2'.repeat(64)}`}, ${productId}, ${variantId},
            ${sideId}, ${areaId}, 'Tee', 'Front', 'Chest', 100.00, 100.00, 10,
            ${grantId}, ${challengeId}, now())
  `);
  await db.execute(sql`
    insert into orders
      (id, code, custom_request_id, customer_id, accepted_quotation_version_id,
       current_approval_snapshot_id, status, total_amount, currency_code)
    values (${orderId}, ${`ORD-${orderId}`}, ${customRequestId}, ${customerId},
            ${quotationVersionId}, ${approvalId}, 'DEPOSIT_PAID', 1000000.00, 'VND')
  `);

  // G-DB7-27: an official reservation is gated on the deposit obligation
  // being SATISFIED, so every order this fixture seeds is reservation-
  // eligible by default.
  const depositObligationId = newId();
  const depositAttemptId = newId();
  await db.execute(sql`
    insert into payment_obligations
      (id, order_id, kind, amount, currency_code, status, source_quotation_version_id)
    values (${depositObligationId}, ${orderId}, 'DEPOSIT', 300000.00, 'VND', 'PENDING',
            ${quotationVersionId})
  `);
  await db.execute(sql`
    insert into payment_attempts
      (id, payment_obligation_id, amount, currency_code, method, status, succeeded_at)
    values (${depositAttemptId}, ${depositObligationId}, 300000.00, 'VND',
            'BANK_TRANSFER', 'SUCCEEDED', now())
  `);
  await db.execute(sql`
    update payment_obligations
    set status = 'SATISFIED', satisfied_at = now(), satisfied_by_attempt_id = ${depositAttemptId}
    where id = ${depositObligationId}
  `);

  return { skuId, customRequestId, orderId };
}
