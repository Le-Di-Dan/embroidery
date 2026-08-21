/**
 * The static test data the `APP6-B11` decision harness seeds and asserts against.
 *
 * Split from `customer-design-decision-context.ts` because it is a different kind
 * of thing with a different reason to change: that file wires a Nest module,
 * publishes policies and mints credentials, while this one is *the fixture
 * material* — the Catalog rows a placement needs, the two COP placement labels
 * CST-130 requires, and the Design Document whose declared colours the approval
 * freezes. Keeping them together pushed the harness past the 600-line test limit,
 * and the seam a split would use anyway is exactly this one.
 *
 * Test-only.
 */
import { randomBytes } from 'node:crypto';

import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';

/** The frozen Catalog quartet CST-129 requires whole or not at all, with its labels. */
export interface SeededPlacement {
  readonly productId: string;
  readonly productVariantId: string;
  readonly productSideId: string;
  readonly embroideryAreaId: string;
  readonly productName: string;
  readonly sideName: string;
  readonly areaName: string;
  readonly colorName: string;
  readonly sizeLabel: string;
}

/** The two COP placement labels CST-130 requires, named so assertions can reuse them. */
export const COP_SIDE_LABEL = 'Mặt trước';
export const COP_AREA_LABEL = 'Ngực trái';

/** Anything that can run a Drizzle statement — the harness passes its own db in. */
export interface StatementRunner {
  execute(query: ReturnType<typeof sql>): Promise<unknown>;
}

/**
 * One complete, publicly designable Catalog chain.
 *
 * Slugs and codes are randomised rather than derived from the id: `newId()` is
 * UUIDv7, so two rows created in the same millisecond share their leading
 * characters and a derived slug collides on the uniqueness arbiter.
 */
export async function seedCatalogPlacement(db: StatementRunner): Promise<SeededPlacement> {
  const categoryId = newId();
  const productId = newId();
  const productVariantId = newId();
  const assetId = newId();
  const productSideId = newId();
  const embroideryAreaId = newId();
  const productName = 'Áo thun cotton';
  const sideName = 'Front';
  const areaName = 'Chest';
  const colorName = 'Trắng';
  const sizeLabel = 'L';

  await db.execute(sql`
    insert into categories (id, name, slug, display_order, status, is_indexable)
    values (${categoryId}, 'Áo', ${`ao-${randomBytes(6).toString('hex')}`}, 1, 'PUBLISHED', true)
  `);
  await db.execute(sql`
    insert into products (id, category_id, name, slug, base_price_amount, currency_code,
                          status, is_display_out_of_stock, display_order, is_indexable)
    values (${productId}, ${categoryId}, ${productName},
            ${`ao-thun-${randomBytes(6).toString('hex')}`}, '150000', 'VND',
            'PUBLISHED', false, 1, true)
  `);
  await db.execute(sql`
    insert into product_variants (id, product_id, color_name, size_label, display_order,
                                  is_active)
    values (${productVariantId}, ${productId}, ${colorName}, ${sizeLabel}, 1, true)
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
    values (${productSideId}, ${productId}, 'front', ${sideName}, ${assetId},
            1000, 1200, 400, 480, 2.5, 1)
  `);
  await db.execute(sql`
    insert into embroidery_areas
      (id, product_side_id, code, name, bound_x_px, bound_y_px, bound_width_px,
       bound_height_px, display_order)
    values (${embroideryAreaId}, ${productSideId}, 'chest', ${areaName}, 100, 150, 300, 200, 1)
  `);

  return {
    productId,
    productVariantId,
    productSideId,
    embroideryAreaId,
    productName,
    sideName,
    areaName,
    colorName,
    sizeLabel,
  };
}

/**
 * A v1 Catalog document carrying four colour declarations across three kinds.
 *
 * `#1d4ed8` appears twice on purpose — once as a shape fill and once as a text
 * fill — so the thread-colour derivation is proved to deduplicate rather than
 * merely to enumerate.
 */
export function catalogDocument(): unknown {
  return {
    schemaVersion: 1,
    placement: {
      productSideId: 'side',
      embroideryAreaId: 'area',
      canvasWidthPx: 1000,
      canvasHeightPx: 1200,
      physicalWidthMm: 120,
      physicalHeightMm: 80,
      pxPerMm: 2.5,
    },
    elements: [
      {
        id: 'e1',
        type: 'shape',
        visible: true,
        locked: false,
        opacity: 1,
        transform: { x: 0, y: 0, width: 10, height: 10, rotationDeg: 0, scaleX: 1, scaleY: 1 },
        shape: 'rectangle',
        fill: '#1d4ed8',
        stroke: '#f59e0b',
        strokeWidthPx: 2,
      },
      {
        id: 'e2',
        type: 'text',
        visible: true,
        locked: false,
        opacity: 1,
        transform: { x: 0, y: 0, width: 10, height: 10, rotationDeg: 0, scaleX: 1, scaleY: 1 },
        text: 'Nét Thêu',
        fontId: 'font-1',
        fontSizePx: 24,
        fontWeight: 400,
        fontStyle: 'normal',
        textAlign: 'left',
        fill: '#1d4ed8',
      },
      {
        id: 'e3',
        type: 'freehand',
        visible: true,
        locked: false,
        opacity: 1,
        transform: { x: 0, y: 0, width: 10, height: 10, rotationDeg: 0, scaleX: 1, scaleY: 1 },
        points: [{ x: 0, y: 0 }],
        stroke: '#065f46',
        strokeWidthPx: 3,
      },
    ],
  };
}

/** The distinct colours {@link catalogDocument} declares, in z-order. */
export const EXPECTED_THREAD_COLORS = ['#1d4ed8', '#f59e0b', '#065f46'] as const;
