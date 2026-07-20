/**
 * Shared fixture for the AGG-15 Order suites (DB7-CP4).
 *
 * An order sits at the end of the longest chain in the system: customer →
 * request → quotation (accepted) → design case → version → approval. Seeding
 * that with raw SQL keeps the suites about the order guards rather than about
 * replaying five other contexts' APIs.
 *
 * Test-only.
 */
import { newId } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { sql } from 'drizzle-orm';

import type { CustomRequestId } from '../../domain/repositories/custom-request.repository';

export interface OrderFixture {
  readonly customerId: string;
  readonly customRequestId: CustomRequestId;
  readonly quotationVersionId: string;
  readonly approvalSnapshotId: string;
  readonly grantId: string;
  readonly challengeId: string;
  readonly adminId: string;
  readonly skuId: string;
  readonly assetId: string;
  readonly productId: string;
}

const DOC_HASH = `sha256:${'1'.repeat(64)}`;

/**
 * Seeds one complete order-ready chain.
 *
 * Only reads `context.disposable`, so both the single-actor DB7
 * `PersistenceTestContext` and the multi-actor DB8 `ConcurrencyTestContext`
 * satisfy this structurally — one fixture, no duplicated raw-SQL setup.
 */
export async function seedOrderChain(
  context: { readonly disposable: DisposableDatabase },
  suffix = '1',
): Promise<OrderFixture> {
  const db = context.disposable.client.db;

  const customerId = newId();
  const contactId = newId();
  const adminId = newId();
  const customRequestId = newId();
  const grantId = newId();
  const challengeId = newId();
  const quotationId = newId();
  const quotationVersionId = newId();
  const designCaseId = newId();
  const designVersionId = newId();
  const approvalSnapshotId = newId();
  const categoryId = newId();
  const productId = newId();
  const variantId = newId();
  const sideId = newId();
  const areaId = newId();
  const assetId = newId();
  const skuId = newId();

  await db.execute(sql`
    insert into customers (id, display_name, verified_at)
    values (${customerId}, ${`Order Customer ${suffix}`}, now())
  `);
  await db.execute(sql`
    insert into customer_contact_points
      (id, customer_id, contact_kind, normalized_value, display_value, is_primary, verified_at, verified_source)
    values (${contactId}, ${customerId}, 'EMAIL', ${`order-${customerId}@example.com`},
            ${`order-${customerId}@example.com`}, true, now(), 'OTP')
  `);
  // Only one ACTIVE admin may exist (`uq_admin_accounts__status__active`,
  // REQ-IDN-001), so a suite that seeds several chains reuses the first one
  // rather than trying to create a second.
  const existingAdmin = (
    await db.execute<{ id: string }>(
      sql`select id from admin_accounts where status = 'ACTIVE' limit 1`,
    )
  ).rows[0];

  if (existingAdmin === undefined) {
    await db.execute(sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, ${`admin-${adminId}@example.com`}, 'Admin', 'ACTIVE')
    `);
  }
  const resolvedAdminId = existingAdmin?.id ?? adminId;
  await db.execute(sql`
    insert into custom_requests (id, code, customer_id, status)
    values (${customRequestId}, ${`REQ-${customRequestId}`}, ${customerId}, 'APPROVED')
  `);
  await db.execute(sql`
    insert into secure_access_grants
      (id, customer_id, custom_request_id, token_hash, scope_kind, status, expires_at)
    values (${grantId}, ${customerId}, ${customRequestId}, ${`hash-${grantId}`},
            'REQUEST_ACCESS', 'ACTIVE', now() + interval '1 hour')
  `);
  await db.execute(sql`
    insert into contact_verification_challenges
      (id, contact_point_id, contact_kind, normalized_value, purpose, code_hash, status, expires_at, verified_at)
    values (${challengeId}, ${contactId}, 'EMAIL', ${`order-${customerId}@example.com`},
            'STEP_UP', 'hash', 'VERIFIED', now() + interval '1 hour', now())
  `);

  // Catalog chain the design version and approval freeze.
  await db.execute(sql`
    insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
    values (${assetId}, 'CATALOG_MEDIA', 'PUBLIC', ${`catalog/${assetId}.png`}, 'image/png', 1024, 'ACCEPTED')
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

  // An order line must name exactly one subject
  // (`ck_order_items__exactly_one_subject`), so the fixture provides a SKU.
  await db.execute(sql`
    insert into skus (id, product_variant_id, code, currency_code, is_active)
    values (${skuId}, ${variantId}, ${`SKU-${skuId}`}, 'VND', true)
  `);

  // An accepted quotation — the price side of the order gate.
  await db.execute(sql`
    insert into quotations (id, code, custom_request_id, status)
    values (${quotationId}, ${`QUO-${quotationId}`}, ${customRequestId}, 'ACCEPTED')
  `);
  await db.execute(sql`
    insert into quotation_versions
      (id, quotation_id, version, status, quantity_total, subtotal_amount,
       manual_adjustment_amount, shipping_fee_amount, total_amount,
       deposit_percent, deposit_amount, remaining_amount, currency_code,
       valid_from, valid_until, sent_at, accepted_at)
    values (${quotationVersionId}, ${quotationId}, 1, 'ACCEPTED', 25, 2500000.00,
            0.00, 50000.00, 2550000.00, 30.00, 765000.00, 1785000.00, 'VND',
            now() - interval '2 hours', now() + interval '1 hour',
            now() - interval '2 hours', now() - interval '1 hour')
  `);
  await db.execute(sql`
    update quotations set current_version_id = ${quotationVersionId} where id = ${quotationId}
  `);
  await db.execute(sql`
    update custom_requests set current_quotation_id = ${quotationId} where id = ${customRequestId}
  `);

  // An approved design — the artwork side of the order gate.
  await db.execute(sql`
    insert into design_cases (id, custom_request_id) values (${designCaseId}, ${customRequestId})
  `);
  await db.execute(sql`
    insert into design_versions
      (id, design_case_id, version, status, design_document, document_schema_version,
       document_hash, product_id, product_variant_id, product_side_id, embroidery_area_id,
       physical_width_mm, physical_height_mm, sent_at, approved_at)
    values (${designVersionId}, ${designCaseId}, 1, 'APPROVED', '{}'::jsonb, 1,
            ${DOC_HASH}, ${productId}, ${variantId}, ${sideId}, ${areaId},
            120.00, 80.00, now() - interval '1 hour', now())
  `);
  await db.execute(sql`
    update design_cases set current_version_id = ${designVersionId} where id = ${designCaseId}
  `);
  await db.execute(sql`
    insert into approval_snapshots
      (id, design_version_id, design_case_id, custom_request_id, customer_id, document_hash,
       product_id, product_variant_id, product_side_id, embroidery_area_id,
       product_name, variant_label, side_name, area_name,
       physical_width_mm, physical_height_mm, quantity_total,
       grant_id, step_up_challenge_id, approved_at)
    values (${approvalSnapshotId}, ${designVersionId}, ${designCaseId}, ${customRequestId},
            ${customerId}, ${DOC_HASH}, ${productId}, ${variantId}, ${sideId}, ${areaId},
            'Tee', 'Black / M', 'Front', 'Chest', 120.00, 80.00, 25,
            ${grantId}, ${challengeId}, now())
  `);

  return {
    customerId,
    customRequestId: customRequestId as CustomRequestId,
    quotationVersionId,
    approvalSnapshotId,
    grantId,
    challengeId,
    adminId: resolvedAdminId,
    skuId,
    assetId,
    productId,
  };
}
