/**
 * APP7-DB01 — the seed chain a `payment_transfer_evidence` row needs.
 *
 * A payment attempt is nine tables deep: customer → request → quotation →
 * version → design case → design version → approval snapshot → order →
 * obligation → attempt. Both APP7-DB01 suites need one, and the fresh-install
 * suite and the 0036 → 0037 upgrade suite would otherwise carry the same sixty
 * lines of raw SQL twice — which is how the two copies drift.
 *
 * Raw SQL on purpose: this is setup for the association's physical rules, not a
 * test of Catalog, Design, Quotation or Ordering persistence. Every value is
 * synthetic.
 *
 * Test-only. Not exported from the package entrypoint.
 */
import { sql } from 'drizzle-orm';

import type { DatabaseClient } from '../client/create-database-client';
import { newId } from '../primitives/identifiers';

const CHECKSUM = `sha256:${'a'.repeat(64)}`;

export interface PaymentAttemptChain {
  readonly customerId: string;
  readonly orderId: string;
  readonly paymentObligationId: string;
  readonly paymentAttemptId: string;
}

type Db = DatabaseClient['db'];

/** One `CUSTOMER_UPLOAD` / `CUSTOMER_PRIVATE` asset — the evidence lane's shape. */
export async function insertEvidenceAsset(db: Db): Promise<string> {
  const assetId = newId();
  await db.execute(sql`
    insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
    values (${assetId}, 'CUSTOMER_UPLOAD', 'CUSTOMER_PRIVATE',
            ${`evidence/${assetId}/original.png`}, 'image/png', 2048, ${CHECKSUM}, 'UPLOADED')
  `);
  return assetId;
}

/** Seeds one order with a `DEPOSIT` obligation and one `PENDING` attempt on it. */
export async function seedPaymentAttemptChain(db: Db): Promise<PaymentAttemptChain> {
  const customerId = newId();
  const contactId = newId();
  const categoryId = newId();
  const productId = newId();
  const variantId = newId();
  const backgroundAssetId = newId();
  const sideId = newId();
  const areaId = newId();
  const customRequestId = newId();
  const quotationId = newId();
  const quotationVersionId = newId();
  const designCaseId = newId();
  const designVersionId = newId();
  const approvalId = newId();
  const grantId = newId();
  const challengeId = newId();
  const orderId = newId();
  const paymentObligationId = newId();
  const paymentAttemptId = newId();
  const email = `app7db01-${customerId}@example.com`;

  await db.execute(sql`
    insert into customers (id, display_name, verified_at)
    values (${customerId}, 'Evidence Customer', now())
  `);
  await db.execute(sql`
    insert into customer_contact_points
      (id, customer_id, contact_kind, normalized_value, display_value, is_primary,
       verified_at, verified_source)
    values (${contactId}, ${customerId}, 'EMAIL', ${email}, ${email}, true, now(), 'OTP')
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
    insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
    values (${backgroundAssetId}, 'CATALOG_MEDIA', 'PUBLIC',
            ${`c/${backgroundAssetId}.png`}, 'image/png', 512, ${CHECKSUM}, 'ACCEPTED')
  `);
  await db.execute(sql`
    insert into product_sides
      (id, product_id, code, name, background_asset_id, image_width_px, image_height_px,
       physical_width_mm, physical_height_mm, px_per_mm, display_order)
    values (${sideId}, ${productId}, ${`s-${sideId.slice(0, 8)}`}, 'Front',
            ${backgroundAssetId}, 1000, 1200, 400, 480, 2.5, 1)
  `);
  await db.execute(sql`
    insert into embroidery_areas
      (id, product_side_id, code, name, bound_x_px, bound_y_px, bound_width_px,
       bound_height_px, display_order)
    values (${areaId}, ${sideId}, ${`a-${areaId.slice(0, 8)}`}, 'Chest', 100, 150, 300, 200, 1)
  `);
  await db.execute(sql`
    insert into custom_requests (id, code, customer_id, status)
    values (${customRequestId}, ${`REQ-${customRequestId}`}, ${customerId}, 'APPROVED')
  `);
  await db.execute(sql`
    insert into secure_access_grants
      (id, customer_id, custom_request_id, token_hash, scope_kind, status, expires_at)
    values (${grantId}, ${customerId}, ${customRequestId}, ${`h-${grantId}`},
            'REQUEST_ACCESS', 'ACTIVE', now() + interval '1 hour')
  `);
  await db.execute(sql`
    insert into contact_verification_challenges
      (id, contact_point_id, contact_kind, normalized_value, purpose, code_hash,
       status, expires_at, verified_at)
    values (${challengeId}, ${contactId}, 'EMAIL', ${email}, 'STEP_UP', 'h',
            'VERIFIED', now() + interval '1 hour', now())
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
    insert into design_cases (id, custom_request_id)
    values (${designCaseId}, ${customRequestId})
  `);
  await db.execute(sql`
    insert into design_versions
      (id, design_case_id, version, status, design_document, document_schema_version,
       document_hash, product_id, product_variant_id, product_side_id, embroidery_area_id,
       physical_width_mm, physical_height_mm, approved_at)
    values (${designVersionId}, ${designCaseId}, 1, 'APPROVED', '{}'::jsonb, 1,
            ${CHECKSUM}, ${productId}, ${variantId}, ${sideId}, ${areaId},
            100.00, 100.00, now())
  `);
  await db.execute(sql`
    insert into approval_snapshots
      (id, design_version_id, design_case_id, custom_request_id, customer_id, document_hash,
       product_id, product_variant_id, product_side_id, embroidery_area_id,
       product_name, side_name, area_name, physical_width_mm, physical_height_mm,
       quantity_total, grant_id, step_up_challenge_id, approved_at)
    values (${approvalId}, ${designVersionId}, ${designCaseId}, ${customRequestId},
            ${customerId}, ${CHECKSUM}, ${productId}, ${variantId}, ${sideId}, ${areaId},
            'Tee', 'Front', 'Chest', 100.00, 100.00, 10, ${grantId}, ${challengeId}, now())
  `);
  await db.execute(sql`
    insert into orders
      (id, code, custom_request_id, customer_id, accepted_quotation_version_id,
       current_approval_snapshot_id, status, total_amount, currency_code)
    values (${orderId}, ${`ORD-${orderId}`}, ${customRequestId}, ${customerId},
            ${quotationVersionId}, ${approvalId}, 'AWAITING_DEPOSIT', 1000000.00, 'VND')
  `);
  await db.execute(sql`
    insert into payment_obligations
      (id, order_id, kind, amount, currency_code, status, source_quotation_version_id)
    values (${paymentObligationId}, ${orderId}, 'DEPOSIT', 300000.00, 'VND', 'PENDING',
            ${quotationVersionId})
  `);
  await db.execute(sql`
    insert into payment_attempts
      (id, payment_obligation_id, amount, currency_code, method, status,
       grant_id, step_up_challenge_id)
    values (${paymentAttemptId}, ${paymentObligationId}, 300000.00, 'VND',
            'BANK_TRANSFER', 'PENDING', ${grantId}, ${challengeId})
  `);

  return { customerId, orderId, paymentObligationId, paymentAttemptId };
}
