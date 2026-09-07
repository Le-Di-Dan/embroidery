/**
 * `APP12-M01.DB1` — the minimal Catalog subject the Product-media invariant
 * suites insert against.
 *
 * A category, one product and as many `CATALOG_MEDIA` assets as the caller
 * asks for. Nothing else: these suites test what `product_media` refuses, not
 * how Catalog or Asset persistence behaves, so the surrounding chain is kept as
 * small as the foreign keys allow.
 *
 * Raw SQL on purpose, same as the APP7 and APP12-DB01 fixtures. Every value is
 * synthetic — no storage object is implied by a `storage_key` written here.
 *
 * Test-only. Not exported from the package entrypoint.
 */
import { sql } from 'drizzle-orm';

import type { DatabaseClient } from '../client/create-database-client';
import { newId } from '../primitives/identifiers';

type Db = DatabaseClient['db'];

/** A synthetic checksum in the format `ck_assets__checksum_format` requires. */
const CHECKSUM = `sha256:${'c'.repeat(64)}`;

export interface ProductMediaSubject {
  readonly categoryId: string;
  readonly productId: string;
  /** Distinct `ACCEPTED` catalog-media assets, in a stable order. */
  readonly assetIds: readonly string[];
}

/**
 * Seeds one DRAFT product and `assetCount` distinct eligible assets.
 *
 * No `product_media` row is written: every suite that uses this decides its own
 * media rows, which is the entire point of the fixture.
 */
export async function seedProductMediaSubject(
  db: Db,
  assetCount: number,
): Promise<ProductMediaSubject> {
  const categoryId = newId();
  const productId = newId();

  await db.execute(sql`
    insert into categories (id, name, slug, status, display_order, is_indexable)
    values (${categoryId}, 'Media', ${`media-${categoryId}`}, 'PUBLISHED', 1, true)
  `);
  await db.execute(sql`
    insert into products
      (id, category_id, name, slug, base_price_amount, currency_code, status,
       is_display_out_of_stock, display_order, is_indexable)
    values (${productId}, ${categoryId}, 'Tee', ${`tee-${productId}`}, 150000, 'VND',
            'DRAFT', false, 1, true)
  `);

  const assetIds: string[] = [];
  for (let index = 0; index < assetCount; index += 1) {
    const assetId = newId();
    await db.execute(sql`
      insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
      values (${assetId}, 'CATALOG_MEDIA', 'PUBLIC',
              ${`catalog/${assetId}.png`}, 'image/png', 512, ${CHECKSUM}, 'ACCEPTED')
    `);
    assetIds.push(assetId);
  }

  return { categoryId, productId, assetIds };
}

export interface ProductMediaRow {
  readonly id?: string;
  readonly productId: string;
  readonly assetId: string;
  readonly role: string;
  readonly displayOrder: number;
}

/** Inserts one media row exactly as given — the caller decides what is legal. */
export async function insertProductMedia(db: Db, row: ProductMediaRow): Promise<string> {
  const id = row.id ?? newId();
  await db.execute(sql`
    insert into product_media (id, product_id, asset_id, role, display_order)
    values (${id}, ${row.productId}, ${row.assetId}, ${row.role}, ${row.displayOrder})
  `);
  return id;
}
