/**
 * Shared fixture for the CTX-DSN suites (DB7-CP4).
 *
 * The design chain reaches across five contexts — a customer, a request, a
 * grant, a verified challenge, a product with a full placement chain, and the
 * agreements an approval must capture. Building that once here keeps the
 * suites about the guards rather than about setup.
 *
 * Test-only.
 */
import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type {
  EmbroideryAreaId,
  ProductId,
  ProductSideId,
  ProductVariantId,
} from '../../../catalog/domain/repositories/placement-hierarchy.port';

export interface DesignFixture {
  readonly customerId: string;
  readonly customRequestId: string;
  readonly grantId: string;
  readonly challengeId: string;
  readonly assetId: string;
  readonly agreementVersionId: string;
  readonly placement: {
    productId: ProductId;
    productVariantId: ProductVariantId;
    productSideId: ProductSideId;
    embroideryAreaId: EmbroideryAreaId;
    physicalWidthMm: string;
    physicalHeightMm: string;
  };
}

export const FIXTURE_HASH = `sha256:${'c'.repeat(64)}`;
export const AGREEMENT_HASH = `sha256:${'d'.repeat(64)}`;

/**
 * Seeds one complete chain with raw SQL.
 *
 * Raw SQL rather than the owning repositories on purpose: this is *setup*, and
 * routing it through five modules' APIs would make a failure in any of them
 * look like a design-guard failure. The guards under test are exercised
 * through their real repositories.
 */
export async function seedDesignChain(
  context: PersistenceTestContext,
  suffix = '1',
): Promise<DesignFixture> {
  const db = context.disposable.client.db;

  const customerId = newId();
  const contactId = newId();
  const customRequestId = newId();
  const grantId = newId();
  const challengeId = newId();
  const assetId = newId();
  const categoryId = newId();
  const productId = newId();
  const variantId = newId();
  const sideId = newId();
  const areaId = newId();
  const agreementId = newId();
  const agreementVersionId = newId();

  await db.execute(sql`
    insert into customers (id, display_name, verified_at)
    values (${customerId}, 'Fixture Customer', now())
  `);
  await db.execute(sql`
    insert into customer_contact_points
      (id, customer_id, contact_kind, normalized_value, display_value, is_primary, verified_at, verified_source)
    values (${contactId}, ${customerId}, 'EMAIL', ${`design-${suffix}-${customerId}@example.com`},
            ${`design-${suffix}@example.com`}, true, now(), 'OTP')
  `);
  await db.execute(sql`
    insert into custom_requests (id, code, customer_id, status)
    values (${customRequestId}, ${`REQ-${customRequestId}`}, ${customerId}, 'DIGITIZING')
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
    values (${challengeId}, ${contactId}, 'EMAIL', ${`design-${suffix}-${customerId}@example.com`},
            'STEP_UP', 'code-hash', 'VERIFIED', now() + interval '1 hour', now())
  `);
  await db.execute(sql`
    insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
    values (${assetId}, 'CATALOG_MEDIA', 'PUBLIC', ${`catalog/${assetId}.png`}, 'image/png', 1024, 'ACCEPTED')
  `);
  await db.execute(sql`
    insert into categories (id, name, slug, status, display_order, is_indexable)
    values (${categoryId}, 'Fixture', ${`fixture-${categoryId}`}, 'PUBLISHED', 1, true)
  `);
  await db.execute(sql`
    insert into products
      (id, category_id, name, slug, base_price_amount, currency_code, status,
       is_display_out_of_stock, display_order, is_indexable)
    values (${productId}, ${categoryId}, 'Fixture Tee', ${`tee-${productId}`}, 150000, 'VND',
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
  await db.execute(sql`
    insert into agreements (id, agreement_type, name)
    values (${agreementId}, ${`TERMS_${suffix}`}, 'Terms')
  `);
  await db.execute(sql`
    insert into agreement_versions
      (id, agreement_id, version, status, content, content_hash, language, effective_from, published_at)
    values (${agreementVersionId}, ${agreementId}, 1, 'PUBLISHED', 'Terms text',
            ${AGREEMENT_HASH}, 'vi', now() - interval '1 hour', now() - interval '1 hour')
  `);
  await db.execute(sql`
    update agreements set current_version_id = ${agreementVersionId} where id = ${agreementId}
  `);

  return {
    customerId,
    customRequestId,
    grantId,
    challengeId,
    assetId,
    agreementVersionId,
    placement: {
      productId: productId as ProductId,
      productVariantId: variantId as ProductVariantId,
      productSideId: sideId as ProductSideId,
      embroideryAreaId: areaId as EmbroideryAreaId,
      physicalWidthMm: '120.00',
      physicalHeightMm: '80.00',
    },
  };
}
