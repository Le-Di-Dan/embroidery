/**
 * Row writers for the `APP12-H06` SEO fixture.
 *
 * Split out of `h06-seo-fixture.mjs` on the same line the media lane was: this
 * module knows *how* a catalog row is written in the shapes the delivered schema
 * declares, and nothing about which rows the SEO matrix needs or what they are
 * meant to prove. That decision stays next door, where the matrix is documented.
 */
import { randomUUID } from 'node:crypto';

import { H06_FIXTURE_PREFIX, H06_MID_PRICE } from './h06-seo-slugs.mjs';

export async function insertCategory(client, { slug, name, isIndexable, displayOrder }) {
  const id = randomUUID();
  await client.query(
    `insert into categories (id, name, slug, description, display_order, status, is_indexable)
     values ($1, $2, $3, $4, $5, 'PUBLISHED', $6)`,
    [
      id,
      name,
      slug,
      'APP12-H06 disposable SEO fixture. Never operator-authored catalog.',
      displayOrder,
      isIndexable,
    ],
  );
  return id;
}

export async function insertProduct(
  client,
  {
    categoryId,
    slug,
    name,
    description = null,
    seoTitle = null,
    seoDescription = null,
    status = 'PUBLISHED',
    isIndexable = true,
    displayOrder,
  },
) {
  const id = randomUUID();
  await client.query(
    // `is_display_out_of_stock` is FALSE throughout: it is an operator display
    // flag and not stock truth (`BR-022`), and the availability every assertion
    // here rests on comes from the SKU projection, never from this column.
    `insert into products
       (id, category_id, slug, name, description, base_price_amount, currency_code,
        status, is_display_out_of_stock, is_indexable, display_order,
        seo_title, seo_description)
     values ($1, $2, $3, $4, $5, $6, 'VND', $7, false, $8, $9, $10, $11)`,
    [
      id,
      categoryId,
      slug,
      name,
      description,
      H06_MID_PRICE,
      status,
      isIndexable,
      displayOrder,
      seoTitle,
      seoDescription,
    ],
  );
  return id;
}

/**
 * One variant and its SKUs.
 *
 * `skus` is an array so the ambiguous case — two order-eligible SKUs under one
 * customer-visible variant — is expressible without a second code path. Every
 * SKU is `is_active = true`, because `APP12-B01` applies that as the whole
 * eligibility rule in the statement: an inactive SKU would be filtered at the
 * source and would test nothing about the consumer.
 */
export async function insertVariant(
  client,
  { productId, colorName, sizeLabel, displayOrder, skus },
) {
  const variantId = randomUUID();
  await client.query(
    `insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
     values ($1, $2, $3, $4, $5, true)`,
    [variantId, productId, colorName, sizeLabel, displayOrder],
  );

  for (const [index, sku] of skus.entries()) {
    const skuId = randomUUID();
    await client.query(
      `insert into skus (id, product_variant_id, code, price_override_amount, currency_code, is_active)
       values ($1, $2, $3, $4, 'VND', true)`,
      [
        skuId,
        variantId,
        `${H06_FIXTURE_PREFIX}-${String(colorName ?? 'x')}-${String(sizeLabel ?? 'x')}-${String(index)}`,
        sku.priceOverride ?? null,
      ],
    );
    await client.query(
      `insert into sku_stocks (id, sku_id, quantity_on_hand, low_stock_threshold)
       values ($1, $2, $3, 0)`,
      [randomUUID(), skuId, sku.onHand],
    );
  }
  return variantId;
}

export async function insertGalleryEntry(
  client,
  { slug, title, isIndexable, displayOrder, assetId, seoTitle = null, seoDescription = null },
) {
  const id = randomUUID();
  await client.query(
    `insert into gallery_entries
       (id, title, slug, description, status, display_order, seo_title, seo_description, is_indexable)
     values ($1, $2, $3, $4, 'PUBLISHED', $5, $6, $7, $8)`,
    [
      id,
      title,
      slug,
      'APP12-H06 disposable SEO fixture entry.',
      displayOrder,
      seoTitle,
      seoDescription,
      isIndexable,
    ],
  );
  await client.query(
    `insert into gallery_entry_assets (id, gallery_entry_id, asset_id, display_order)
     values ($1, $2, $3, 0)`,
    [randomUUID(), id, assetId],
  );
  return id;
}
