/**
 * The prerequisite world `APP6-E01` runs against, and the documents it authors.
 *
 * Split from `app6-e01-context.ts` on responsibility, following the precedent
 * `customer-design-seed-data.ts` set for `APP6-B11`: that file composes and boots
 * the application, this one describes the world APP6 *consumes* and the Design
 * Documents it is handed. Neither knows how the other works.
 *
 * Nothing here writes a `custom_requests.status` beyond the entry state, creates
 * a quotation, a design version, a review or an approval snapshot. Every one of
 * those is produced by an owning APP6 operation in the cases themselves.
 *
 * Test-only.
 */
import { randomBytes } from 'node:crypto';

import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';

/**
 * The seeded Product Side geometry, mirrored so a fixture document can declare a
 * placement snapshot that actually reconciles with the Catalog rows.
 */
export const SIDE_GEOMETRY = {
  canvasWidthPx: 1000,
  canvasHeightPx: 1200,
  physicalWidthMm: 400,
  physicalHeightMm: 480,
  pxPerMm: 2.5,
  areaXPx: 100,
  areaYPx: 150,
  areaWidthPx: 300,
  areaHeightPx: 200,
} as const;

/** The COP placement labels an operator and customer agreed, in the operator's words. */
export const COP_SIDE_LABEL = 'Ngực trái áo khoác của khách';
export const COP_AREA_LABEL = 'Vùng thêu 12 x 8 cm';

export interface SeededPlacement {
  readonly productId: string;
  readonly productVariantId: string;
  readonly productSideId: string;
  readonly embroideryAreaId: string;
}

/** One prerequisite commission, at `UNDER_REVIEW`, with a live secure link. */
export interface SeededCommission {
  readonly requestId: string;
  readonly requestCode: string;
  readonly customerId: string;
  readonly contactPointId: string;
  readonly contactValue: string;
  readonly designCaseId: string;
  readonly token: string;
  readonly grantId: string;
  readonly quantityTotal: number;
  readonly placement: SeededPlacement | undefined;
  readonly submittedSessionId: string | undefined;
  readonly customerOwnedProductId: string | undefined;
  readonly customerOwnedProductName: string | undefined;
}

export interface SeedCommissionOptions {
  /** The customer-owned branch: a COP row, and no Catalog subject at all. */
  readonly customerOwned?: boolean;
  readonly grantStatus?: string;
  readonly grantExpiresInMinutes?: number;
  /** Omit the variant to reproduce an incomplete Catalog subject. */
  readonly omitVariant?: boolean;
  readonly quantities?: readonly number[];
}

/** The narrow database seam these seeders need; avoids importing a Drizzle type. */
export interface WorldDatabase {
  execute(query: ReturnType<typeof sql>): Promise<unknown>;
}

/**
 * The Catalog chain one Catalog commission is designed against (APP2/APP3).
 *
 * The five rows are inserted as a chain rather than independently, because what
 * `APP6-B08` derives is the *quartet*, and a fixture with a Side that does not
 * hang from the Product would make a branch refusal look like a branch bug.
 */
export async function seedCatalogPlacement(db: WorldDatabase): Promise<SeededPlacement> {
  const categoryId = newId();
  const productId = newId();
  const productVariantId = newId();
  const assetId = newId();
  const productSideId = newId();
  const embroideryAreaId = newId();
  // Random rather than derived from an id: `newId()` is UUIDv7, so two rows
  // minted in the same millisecond share their leading characters and a derived
  // slug collides on `uq_categories__slug` / `uq_products__slug`.
  const slugSuffix = randomBytes(6).toString('hex');

  await db.execute(sql`
    insert into categories (id, name, slug, display_order, status, is_indexable)
    values (${categoryId}, ${'Áo'}, ${`ao-${slugSuffix}`}, 1, 'PUBLISHED', true)
  `);
  await db.execute(sql`
    insert into products (id, category_id, name, slug, base_price_amount, currency_code,
                          status, is_display_out_of_stock, display_order, is_indexable)
    values (${productId}, ${categoryId}, ${'Áo thun cotton'},
            ${`ao-thun-${slugSuffix}`}, '150000', 'VND',
            'PUBLISHED', false, 1, true)
  `);
  await db.execute(sql`
    insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
    values (${productVariantId}, ${productId}, ${'Trắng'}, 'L', 1, true)
  `);
  await db.execute(sql`
    insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
    values (${assetId}, 'CATALOG_MEDIA', 'PUBLIC',
            ${`catalog/${assetId}.png`}, 'image/png', 1024, 'ACCEPTED')
  `);
  await db.execute(sql`
    insert into product_sides
      (id, product_id, code, name, background_asset_id, image_width_px, image_height_px,
       physical_width_mm, physical_height_mm, px_per_mm, display_order)
    values (${productSideId}, ${productId}, 'front', ${'Mặt trước'}, ${assetId},
            ${SIDE_GEOMETRY.canvasWidthPx}, ${SIDE_GEOMETRY.canvasHeightPx},
            ${SIDE_GEOMETRY.physicalWidthMm}, ${SIDE_GEOMETRY.physicalHeightMm},
            ${SIDE_GEOMETRY.pxPerMm}, 1)
  `);
  await db.execute(sql`
    insert into embroidery_areas
      (id, product_side_id, code, name, bound_x_px, bound_y_px, bound_width_px,
       bound_height_px, display_order)
    values (${embroideryAreaId}, ${productSideId}, 'chest', ${'Ngực trái'},
            ${SIDE_GEOMETRY.areaXPx}, ${SIDE_GEOMETRY.areaYPx},
            ${SIDE_GEOMETRY.areaWidthPx}, ${SIDE_GEOMETRY.areaHeightPx}, 1)
  `);

  return { productId, productVariantId, productSideId, embroideryAreaId };
}

/**
 * One commission at `UNDER_REVIEW`, and nothing further.
 *
 * `tokenDigest` is supplied by the caller rather than computed here, because the
 * pepper belongs to the booted application's environment and this module must
 * not reach into it.
 */
export async function seedCommissionWorld(
  db: WorldDatabase,
  tokenDigest: (token: string) => string,
  mintToken: () => string,
  options: SeedCommissionOptions,
): Promise<SeededCommission> {
  const customerId = newId();
  const contactPointId = newId();
  // Random rather than derived from the id, for the UUIDv7 reason above.
  const contactValue = `app6e01-${randomBytes(6).toString('hex')}@example.test`;
  await db.execute(sql`
    insert into customers (id, display_name, verified_at)
    values (${customerId}, ${'Trần Khách E01'}, now())
  `);
  await db.execute(sql`
    insert into customer_contact_points
      (id, customer_id, contact_kind, normalized_value, display_value, is_primary,
       verified_at, verified_source)
    values (${contactPointId}, ${customerId}, 'EMAIL', ${contactValue},
            ${contactValue}, true, now(), 'APP6-E01 prerequisite fixture.')
  `);

  const customerOwned = options.customerOwned === true;
  const placement = customerOwned ? undefined : await seedCatalogPlacement(db);

  const requestId = newId();
  const requestCode = `REQ-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`;
  const submittedSessionId = placement === undefined ? undefined : newId();
  const variantId = options.omitVariant === true ? null : (placement?.productVariantId ?? null);

  await db.execute(sql`
    insert into custom_requests (id, code, customer_id, status, product_id, product_variant_id,
                                 submitted_session_id)
    values (${requestId}, ${requestCode}, ${customerId}, 'UNDER_REVIEW',
            ${placement?.productId ?? null}, ${variantId}, ${submittedSessionId ?? null})
  `);

  if (placement !== undefined && submittedSessionId !== undefined) {
    await db.execute(sql`
      insert into design_sessions
        (id, session_secret_hash, product_id, product_variant_id, product_side_id,
         embroidery_area_id, design_document, document_schema_version, autosave_revision,
         status, expires_at, last_activity_at, submitted_request_id)
      values (${submittedSessionId}, ${`hash-${submittedSessionId}`}, ${placement.productId},
              ${placement.productVariantId}, ${placement.productSideId},
              ${placement.embroideryAreaId},
              ${JSON.stringify(catalogDocument(placement))}::jsonb,
              1, 3, 'SUBMITTED', now() + interval '30 days', now(), ${requestId})
    `);
  }

  // Several lines on purpose: the Approval Snapshot's total is summed in SQL,
  // and a single line would let a bug that returns "the first line" pass.
  const quantities = options.quantities ?? [12, 8, 4];
  let quantityTotal = 0;
  for (const [index, quantity] of quantities.entries()) {
    quantityTotal += quantity;
    await db.execute(sql`
      insert into custom_request_quantity_breakdowns
        (id, custom_request_id, product_variant_id, size_label, quantity)
      values (${newId()}, ${requestId}, ${variantId}, ${`SIZE-${index}`}, ${quantity})
    `);
  }

  let customerOwnedProductId: string | undefined;
  let customerOwnedProductName: string | undefined;
  if (customerOwned) {
    customerOwnedProductId = newId();
    customerOwnedProductName = 'Áo khoác denim của khách';
    await db.execute(sql`
      insert into customer_owned_products
        (id, custom_request_id, name, description, physical_width_mm, physical_height_mm)
      values (${customerOwnedProductId}, ${requestId}, ${customerOwnedProductName},
              ${'Áo khoác denim khách gửi tới xưởng.'}, '600.00', '800.00')
    `);
  }

  // The design case is created by the delivered APP5 `request.submit`
  // (TR-LC11-01 — `SubmitCustomRequestUseCase` calls
  // `DesignCaseRepository.createForRequest` inside the submission transaction).
  // E01 starts at the APP6 prerequisite boundary with the request already
  // `UNDER_REVIEW`, so that prior-phase consequence is seeded here rather than
  // re-executed.
  const designCaseId = newId();
  await db.execute(sql`
    insert into design_cases (id, custom_request_id) values (${designCaseId}, ${requestId})
  `);
  await db.execute(sql`
    update custom_requests set current_design_case_id = ${designCaseId} where id = ${requestId}
  `);

  const token = mintToken();
  const grantId = newId();
  const grantStatus = options.grantStatus ?? 'ACTIVE';
  const grantExpiresAt = new Date(
    Date.now() + (options.grantExpiresInMinutes ?? 60 * 24 * 7) * 60_000,
  );
  await db.execute(sql`
    insert into secure_access_grants (id, customer_id, custom_request_id, token_hash,
                                      scope_kind, status, expires_at, revoked_at, revoke_reason)
    values (${grantId}, ${customerId}, ${requestId}, ${tokenDigest(token)},
            'REQUEST_ACCESS', ${grantStatus}, ${grantExpiresAt},
            -- ck_secure_access_grants__revoke_reason_required: a revoked grant
            -- must say why, so the fixture cannot seed one that merely looks
            -- revoked.
            ${grantStatus === 'REVOKED' ? sql`now()` : sql`null`},
            ${grantStatus === 'REVOKED' ? 'APP6-E01 prerequisite fixture.' : null})
  `);

  return {
    requestId,
    requestCode,
    customerId,
    contactPointId,
    contactValue,
    designCaseId,
    token,
    grantId,
    quantityTotal,
    placement,
    submittedSessionId,
    customerOwnedProductId,
    customerOwnedProductName,
  };
}

/** A v1 Catalog document whose placement snapshot reconciles with the seed. */
export function catalogDocument(placement: SeededPlacement, elements: unknown[] = []): unknown {
  return {
    schemaVersion: 1,
    placement: {
      productSideId: placement.productSideId,
      embroideryAreaId: placement.embroideryAreaId,
      canvasWidthPx: SIDE_GEOMETRY.canvasWidthPx,
      canvasHeightPx: SIDE_GEOMETRY.canvasHeightPx,
      physicalWidthMm: SIDE_GEOMETRY.physicalWidthMm,
      physicalHeightMm: SIDE_GEOMETRY.physicalHeightMm,
      pxPerMm: SIDE_GEOMETRY.pxPerMm,
    },
    elements,
  };
}

/**
 * A v2 customer-owned document whose canvas *is* the agreed envelope.
 *
 * `pxPerMm` is 1 so the millimetre envelope and the pixel canvas are the same
 * numbers: the arithmetic is not what this run is about, and a scale factor
 * would only make a failure harder to read.
 */
export function customerOwnedDocument(
  widthMm: number,
  heightMm: number,
  elements: unknown[] = [],
): unknown {
  return {
    schemaVersion: 2,
    placement: {
      productSideId: null,
      embroideryAreaId: null,
      canvasWidthPx: widthMm,
      canvasHeightPx: heightMm,
      physicalWidthMm: widthMm,
      physicalHeightMm: heightMm,
      pxPerMm: 1,
    },
    elements,
  };
}

/**
 * A minimal shape element at an explicit position.
 *
 * The field names are `APP3-P01`'s own, not a paraphrase: the root validator
 * rejects unknown keys, so a fixture that guessed them would fail as "malformed
 * document" and prove nothing about the branch under test.
 */
export function shapeAt(id: string, x: number, y: number, width: number, height: number): unknown {
  return {
    id,
    type: 'shape',
    visible: true,
    locked: false,
    opacity: 1,
    transform: { x, y, width, height, rotationDeg: 0, scaleX: 1, scaleY: 1 },
    shape: 'rectangle',
    fill: '#ffffff',
    stroke: '#0b3d2c',
    strokeWidthPx: 2,
  };
}
