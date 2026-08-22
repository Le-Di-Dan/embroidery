/**
 * The approval-ready chain the `APP7-W01` suites convert.
 *
 * An order sits at the end of the longest chain in the system: customer →
 * request → quotation (accepted) → design case → version → approval. Seeding it
 * with raw SQL keeps the suites about the conversion rather than about replaying
 * five other contexts' APIs — the same argument the delivered
 * `order-fixture.ts` makes, restated here because the worker may not import
 * `apps/api`.
 *
 * ### The money is chosen to catch a recomputation
 *
 * ```text
 * quantity            3
 * unit price          1,111,111 VND      line total  3,333,333 VND
 * subtotal            3,333,333 VND      shipping 0, adjustment 0
 * total               3,333,333 VND
 * deposit_percent     35.00              deposit     1,166,667 VND
 * remaining           2,166,666 VND
 * ```
 *
 * Three properties, each deliberate:
 *
 * - the deposit is **35 %**, not `BR-005`'s 40 %. Anything that hard-codes the
 *   business default instead of copying the accepted column lands on
 *   `1,333,333` and the assertion fails;
 * - 35 % of the total is `1,166,666.55`, so the stored figure is the DB4
 *   round-half-up result and not a truncation;
 * - `deposit + remaining = total` holds by subtraction, so a converter that
 *   recomputed the remainder from the percentage would still be caught by the
 *   deposit assertion beside it.
 *
 * Test-only.
 */
import { executeRaw, newId, sql } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';

export const FIXTURE_TOTAL_AMOUNT = '3333333.00';
export const FIXTURE_DEPOSIT_AMOUNT = '1166667.00';
export const FIXTURE_REMAINING_AMOUNT = '2166666.00';
export const FIXTURE_UNIT_PRICE_AMOUNT = '1111111.00';
export const FIXTURE_LINE_TOTAL_AMOUNT = '3333333.00';
export const FIXTURE_QUANTITY = 3;

const DOC_HASH = `sha256:${'1'.repeat(64)}`;

export interface ApprovalChain {
  readonly customerId: string;
  readonly customRequestId: string;
  readonly quotationId: string;
  readonly quotationVersionId: string;
  readonly approvalSnapshotId: string;
  readonly designVersionId: string;
  readonly productId: string;
  readonly productVariantId: string;
  readonly skuId: string | undefined;
  readonly customerOwnedProductId: string | undefined;
}

export interface SeedOptions {
  /** `CATALOG` freezes a product variant; `CUSTOMER_OWNED` freezes a COP. */
  readonly branch?: 'CATALOG' | 'CUSTOMER_OWNED';
  /** How many `is_active` SKUs the frozen variant carries. Catalog branch only. */
  readonly activeSkus?: number;
  /** Extra inactive SKUs, to prove they are not counted. Catalog branch only. */
  readonly inactiveSkus?: number;
  /** Leave the accepted quotation version in another state, to refuse GRD-009. */
  readonly quotationVersionStatus?: string;
  /** Distinguishes parallel chains inside one database. */
  readonly suffix?: string;
}

export async function seedApprovalChain(
  disposable: DisposableDatabase,
  options: SeedOptions = {},
): Promise<ApprovalChain> {
  const db = disposable.client.db;
  const branch = options.branch ?? 'CATALOG';
  const suffix = options.suffix ?? '1';

  const customerId = newId();
  const contactId = newId();
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
  const copId = newId();

  await executeRaw(
    db,
    sql`INSERT INTO customers (id, display_name, verified_at)
        VALUES (${customerId}, ${`Conversion Customer ${suffix}`}, now())`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO customer_contact_points
          (id, customer_id, contact_kind, normalized_value, display_value, is_primary,
           verified_at, verified_source)
        VALUES (${contactId}, ${customerId}, 'EMAIL', ${`w01-${customerId}@example.com`},
                ${`w01-${customerId}@example.com`}, true, now(), 'OTP')`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO custom_requests (id, code, customer_id, status)
        VALUES (${customRequestId}, ${`REQ-${customRequestId}`}, ${customerId}, 'APPROVED')`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO secure_access_grants
          (id, customer_id, custom_request_id, token_hash, scope_kind, status, expires_at)
        VALUES (${grantId}, ${customerId}, ${customRequestId}, ${`hash-${grantId}`},
                'REQUEST_ACCESS', 'ACTIVE', now() + interval '1 hour')`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO contact_verification_challenges
          (id, contact_point_id, contact_kind, normalized_value, purpose, code_hash,
           status, expires_at, verified_at)
        VALUES (${challengeId}, ${contactId}, 'EMAIL', ${`w01-${customerId}@example.com`},
                'STEP_UP', 'hash', 'VERIFIED', now() + interval '1 hour', now())`,
  );

  // The Catalog chain the design version freezes. Seeded on both branches
  // because `design_versions` needs a placement to be storable; only the
  // Approval Snapshot's own branch decides what the order converts.
  await executeRaw(
    db,
    sql`INSERT INTO assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
        VALUES (${assetId}, 'CATALOG_MEDIA', 'PUBLIC', ${`catalog/${assetId}.png`},
                'image/png', 1024, 'ACCEPTED')`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO categories (id, name, slug, status, display_order, is_indexable)
        VALUES (${categoryId}, 'Cat', ${`cat-${categoryId}`}, 'PUBLISHED', 1, true)`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO products
          (id, category_id, name, slug, base_price_amount, currency_code, status,
           is_display_out_of_stock, display_order, is_indexable)
        VALUES (${productId}, ${categoryId}, 'Tee', ${`tee-${productId}`}, 150000, 'VND',
                'PUBLISHED', false, 1, true)`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO product_variants
          (id, product_id, color_name, size_label, display_order, is_active)
        VALUES (${variantId}, ${productId}, 'Black', 'M', 1, true)`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO product_sides
          (id, product_id, code, name, background_asset_id, image_width_px, image_height_px,
           physical_width_mm, physical_height_mm, px_per_mm, display_order)
        VALUES (${sideId}, ${productId}, 'front', 'Front', ${assetId}, 1000, 1200,
                400, 480, 2.5, 1)`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO embroidery_areas
          (id, product_side_id, code, name, bound_x_px, bound_y_px, bound_width_px,
           bound_height_px, display_order)
        VALUES (${areaId}, ${sideId}, 'chest', 'Chest', 100, 150, 300, 200, 1)`,
  );

  const activeSkuCount = options.activeSkus ?? (branch === 'CATALOG' ? 1 : 0);
  const activeSkuIds: string[] = [];
  for (let index = 0; index < activeSkuCount; index += 1) {
    const skuId = newId();
    activeSkuIds.push(skuId);
    await executeRaw(
      db,
      sql`INSERT INTO skus (id, product_variant_id, code, currency_code, is_active)
          VALUES (${skuId}, ${variantId}, ${`SKU-A-${skuId}`}, 'VND', true)`,
    );
  }
  for (let index = 0; index < (options.inactiveSkus ?? 0); index += 1) {
    const skuId = newId();
    await executeRaw(
      db,
      sql`INSERT INTO skus (id, product_variant_id, code, currency_code, is_active)
          VALUES (${skuId}, ${variantId}, ${`SKU-I-${skuId}`}, 'VND', false)`,
    );
  }

  if (branch === 'CUSTOMER_OWNED') {
    await executeRaw(
      db,
      sql`INSERT INTO customer_owned_products (id, custom_request_id, name, description)
          VALUES (${copId}, ${customRequestId}, ${`Áo khoác của khách ${suffix}`},
                  'Customer supplied jacket')`,
    );
  }

  // The accepted price. `status` is a parameter so a suite can prove GRD-009
  // refuses a version that was sent but never accepted.
  await executeRaw(
    db,
    sql`INSERT INTO quotations (id, code, custom_request_id, status)
        VALUES (${quotationId}, ${`QUO-${quotationId}`}, ${customRequestId}, 'ACCEPTED')`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO quotation_versions
          (id, quotation_id, version, status, quantity_total, subtotal_amount,
           manual_adjustment_amount, shipping_fee_amount, total_amount,
           deposit_percent, deposit_amount, remaining_amount, currency_code,
           valid_from, valid_until, sent_at, accepted_at)
        VALUES (${quotationVersionId}, ${quotationId}, 1,
                ${options.quotationVersionStatus ?? 'ACCEPTED'}, ${FIXTURE_QUANTITY},
                ${FIXTURE_TOTAL_AMOUNT}, 0.00, 0.00, ${FIXTURE_TOTAL_AMOUNT},
                35.00, ${FIXTURE_DEPOSIT_AMOUNT}, ${FIXTURE_REMAINING_AMOUNT}, 'VND',
                now() - interval '2 hours', now() + interval '1 hour',
                now() - interval '2 hours', now() - interval '1 hour')`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO quotation_line_items
          (id, quotation_version_id, position, line_kind, description, quantity,
           unit_price_amount, line_total_amount, currency_code)
        VALUES (${newId()}, ${quotationVersionId}, 1, 'PRODUCT', 'Áo thun thêu logo',
                ${FIXTURE_QUANTITY}, ${FIXTURE_UNIT_PRICE_AMOUNT},
                ${FIXTURE_LINE_TOTAL_AMOUNT}, 'VND')`,
  );
  await executeRaw(
    db,
    sql`UPDATE quotations SET current_version_id = ${quotationVersionId} WHERE id = ${quotationId}`,
  );
  await executeRaw(
    db,
    sql`UPDATE custom_requests SET current_quotation_id = ${quotationId}
        WHERE id = ${customRequestId}`,
  );

  // The approved design.
  await executeRaw(
    db,
    sql`INSERT INTO design_cases (id, custom_request_id)
        VALUES (${designCaseId}, ${customRequestId})`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO design_versions
          (id, design_case_id, version, status, design_document, document_schema_version,
           document_hash, product_id, product_variant_id, product_side_id, embroidery_area_id,
           physical_width_mm, physical_height_mm, sent_at, approved_at)
        VALUES (${designVersionId}, ${designCaseId}, 1, 'APPROVED', '{}'::jsonb, 1,
                ${DOC_HASH}, ${productId}, ${variantId}, ${sideId}, ${areaId},
                120.00, 80.00, now() - interval '1 hour', now())`,
  );
  await executeRaw(
    db,
    sql`UPDATE design_cases SET current_version_id = ${designVersionId}
        WHERE id = ${designCaseId}`,
  );

  if (branch === 'CATALOG') {
    await executeRaw(
      db,
      sql`INSERT INTO approval_snapshots
            (id, design_version_id, design_case_id, custom_request_id, customer_id,
             document_hash, product_id, product_variant_id, product_side_id, embroidery_area_id,
             product_name, variant_label, side_name, area_name,
             physical_width_mm, physical_height_mm, quantity_total,
             grant_id, step_up_challenge_id, approved_at)
          VALUES (${approvalSnapshotId}, ${designVersionId}, ${designCaseId}, ${customRequestId},
                  ${customerId}, ${DOC_HASH}, ${productId}, ${variantId}, ${sideId}, ${areaId},
                  'Tee frozen at approval', 'Black / M', 'Front', 'Chest', 120.00, 80.00,
                  ${FIXTURE_QUANTITY}, ${grantId}, ${challengeId}, now())`,
    );
  } else {
    await executeRaw(
      db,
      sql`INSERT INTO approval_snapshots
            (id, design_version_id, design_case_id, custom_request_id, customer_id,
             document_hash, customer_owned_product_id,
             product_name, variant_label, side_name, area_name,
             physical_width_mm, physical_height_mm, quantity_total,
             grant_id, step_up_challenge_id, approved_at)
          VALUES (${approvalSnapshotId}, ${designVersionId}, ${designCaseId}, ${customRequestId},
                  ${customerId}, ${DOC_HASH}, ${copId},
                  ${`Áo khoác của khách ${suffix}`}, NULL, 'Front', 'Chest', 120.00, 80.00,
                  ${FIXTURE_QUANTITY}, ${grantId}, ${challengeId}, now())`,
    );
  }

  return {
    customerId,
    customRequestId,
    quotationId,
    quotationVersionId,
    approvalSnapshotId,
    designVersionId,
    productId,
    productVariantId: variantId,
    skuId: activeSkuIds[0],
    customerOwnedProductId: branch === 'CUSTOMER_OWNED' ? copId : undefined,
  };
}

/** Appends the `design.approved` row `APP6-B11` would have written. */
export async function appendDesignApprovedEvent(
  disposable: DisposableDatabase,
  chain: Pick<ApprovalChain, 'approvalSnapshotId' | 'customRequestId' | 'customerId'>,
  overrides: Record<string, unknown> = {},
): Promise<bigint> {
  const rows = await executeRaw<{ id: string }>(
    disposable.client.db,
    sql`
      INSERT INTO outbox_events
        (event_type, aggregate_kind, aggregate_id, payload, payload_schema_version,
         status, attempt_count, next_attempt_at)
      VALUES
        ('design.approved', 'APPROVAL_SNAPSHOT', ${chain.approvalSnapshotId},
         ${JSON.stringify({
           schemaVersion: 1,
           approvalSnapshotId: chain.approvalSnapshotId,
           customRequestId: chain.customRequestId,
           customerId: chain.customerId,
           ...overrides,
         })}::jsonb,
         1, 'PENDING', 0, now())
      RETURNING id
    `,
  );
  return BigInt((rows[0] as { id: string }).id);
}
