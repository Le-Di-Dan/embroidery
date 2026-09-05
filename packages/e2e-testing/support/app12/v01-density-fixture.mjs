/**
 * The `APP12-V01` content-density fixture.
 *
 * ## Why the audit needs this and the S02 catalog does not supply it
 *
 * `seedS02Catalog` builds exactly what a checkout journey needs: one Product,
 * three variants, one of them deliberately scarce. That is the right fixture for
 * proving a refusal, and the wrong one for judging a design — a Discover grid
 * with one card, a category filter with one option and an Admin table with one
 * row all look calm, and none of them is the screen an operator or a customer
 * will meet.
 *
 * §13 of the checkpoint makes representative content mandatory for exactly that
 * reason. So this fixture layers a plausible shop on top of the S02 catalog
 * rather than replacing it: the checkout journeys keep the SKUs they were
 * written against, and every browsing surface gains enough rows, images, names
 * and price spread to show how the composition behaves under real content.
 *
 * It also **renames** the two S02 rows. Their fixture names ("Đồ thử nghiệm
 * S02") would appear in the Product Detail screenshots that the whole commerce
 * audit is built from, and a critique of a page headed by a test string is a
 * critique of the fixture. The slugs are untouched — they are what the specs
 * address, and `APP12-C01` makes a published slug immutable anyway.
 *
 * ## Where this may run
 *
 * Only against the disposable database. `assertDisposable` is the same guard
 * `s02-checkout-fixture.mjs` carries and for the same reason: the audit browses
 * a **commercial** universe, and catalog rows written into the shared
 * development stack would be exactly the residue `VALIDATION_GOVERNANCE.md`
 * §3A.4 forbids.
 *
 * Test-only.
 */
import { randomUUID } from 'node:crypto';

import pg from 'pg';

import { generateRenditions, insertAsset } from './h06-seo-media.mjs';
import { AUTHORED_CATEGORIES, GALLERY_ENTRIES, PRODUCTS } from './v01-catalog-content.mjs';
import { S02_CATEGORY_SLUG, S02_PRODUCT_SLUG } from './s02-checkout-fixture.mjs';

const { Client } = pg;

/** The storage prefix every object this fixture writes lives under. */
const STORAGE_PREFIX = 'app12-v01-audit';

/** Distinct catalog images, reused across Products round-robin. */
const CATALOG_IMAGE_SEEDS = [3, 4, 5, 6, 7, 8];
/** Distinct gallery images, reused across entries round-robin. */
const GALLERY_IMAGE_SEEDS = [11, 12, 13, 14];

/** The name and description the S02 fixture Product wears for the audit. */
const S02_PRODUCT_NAME = 'Áo thun cotton thêu ngực trái';
const S02_PRODUCT_DESCRIPTION =
  'Áo thun cotton 100% cổ tròn, thêu hoạ tiết nhỏ ở ngực trái. Vải dày dặn, không bai dão sau nhiều lần giặt.';
const S02_CATEGORY_NAME = 'Áo thun';
const S02_CATEGORY_DESCRIPTION = 'Áo thun cotton thêu tay, in sẵn theo mẫu của xưởng.';

function assertDisposable(databaseUrl) {
  const name = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (!name.startsWith('embroidery_db7_')) {
    throw new Error(
      `Refusing to seed the APP12-V01 density fixture into "${name}": only a disposable ` +
        'database (embroidery_db7_*) may receive it. See VALIDATION_GOVERNANCE.md §3A.4.',
    );
  }
  return name;
}

async function categoryIdBySlug(client, slug) {
  const result = await client.query('select id from categories where slug = $1', [slug]);
  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error(`category "${slug}" is not provisioned`);
  return id;
}

async function insertProductRow(client, { categoryId, product, displayOrder }) {
  const id = randomUUID();
  await client.query(
    `insert into products
       (id, category_id, slug, name, description, base_price_amount, currency_code,
        status, is_display_out_of_stock, is_indexable, display_order)
     values ($1, $2, $3, $4, $5, $6, 'VND', 'PUBLISHED', false, true, $7)`,
    [
      id,
      categoryId,
      product.slug,
      product.name,
      product.description,
      product.basePrice,
      displayOrder,
    ],
  );
  return id;
}

async function insertVariantRow(client, { productId, slug, variant, displayOrder }) {
  const variantId = randomUUID();
  await client.query(
    `insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
     values ($1, $2, $3, $4, $5, true)`,
    [variantId, productId, variant.color, variant.size, displayOrder],
  );
  const skuId = randomUUID();
  await client.query(
    `insert into skus (id, product_variant_id, code, price_override_amount, currency_code, is_active)
     values ($1, $2, $3, $4, 'VND', true)`,
    [skuId, variantId, `v01-${slug}-${String(displayOrder)}`, variant.priceOverride ?? null],
  );
  await client.query(
    `insert into sku_stocks (id, sku_id, quantity_on_hand, low_stock_threshold)
     values ($1, $2, $3, 2)`,
    [randomUUID(), skuId, variant.stock],
  );
  return skuId;
}

async function attachMedia(client, { productId, assetIds }) {
  const [thumbnail, ...gallery] = assetIds;
  await client.query(
    `insert into product_media (id, product_id, asset_id, role, display_order)
     values ($1, $2, $3, 'THUMBNAIL', 0)`,
    [randomUUID(), productId, thumbnail],
  );
  for (const [index, assetId] of gallery.entries()) {
    await client.query(
      `insert into product_media (id, product_id, asset_id, role, display_order)
       values ($1, $2, $3, 'GALLERY', $4)`,
      [randomUUID(), productId, assetId, index + 1],
    );
  }
}

async function insertGalleryRow(client, { entry, assetId, displayOrder }) {
  const id = randomUUID();
  await client.query(
    `insert into gallery_entries
       (id, title, slug, description, status, display_order, is_indexable)
     values ($1, $2, $3, $4, 'PUBLISHED', $5, true)`,
    [id, entry.title, entry.slug, entry.description, displayOrder],
  );
  await client.query(
    `insert into gallery_entry_assets (id, gallery_entry_id, asset_id, display_order)
     values ($1, $2, $3, 0)`,
    [randomUUID(), id, assetId],
  );
  return id;
}

/**
 * Writes the density fixture and returns the slugs the audit navigates to.
 *
 * Media objects are put into storage **after** the transaction commits, in the
 * order `h06-seo-fixture.mjs` established and for the reason it records: a row
 * that points at an object which never arrived turns every image into a 404, and
 * an audit of a page whose images are all broken is an audit of the fixture.
 *
 * @param {{databaseUrl: string, sharp: unknown, putObject: Function,
 *          log?: (message: string) => void}} params
 */
export async function seedV01Density({ databaseUrl, sharp, putObject, log = () => {} }) {
  const databaseName = assertDisposable(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const objects = [];

  try {
    const catalogRenditions = [];
    for (const seed of CATALOG_IMAGE_SEEDS) {
      catalogRenditions.push(await generateRenditions({ sharp, seed }));
    }
    const galleryRenditions = [];
    for (const seed of GALLERY_IMAGE_SEEDS) {
      galleryRenditions.push(await generateRenditions({ sharp, seed }));
    }

    await client.query('begin');

    const catalogAssetIds = [];
    for (const renditions of catalogRenditions) {
      catalogAssetIds.push(
        await insertAsset(client, {
          kind: 'CATALOG_MEDIA',
          storagePrefix: `${STORAGE_PREFIX}/catalog`,
          renditions,
          objects,
        }),
      );
    }
    const galleryAssetIds = [];
    for (const renditions of galleryRenditions) {
      galleryAssetIds.push(
        await insertAsset(client, {
          kind: 'GALLERY_MEDIA',
          storagePrefix: `${STORAGE_PREFIX}/gallery`,
          renditions,
          objects,
        }),
      );
    }

    /* The two operator-grown categories, on top of migration `0033`'s four. */
    for (const category of AUTHORED_CATEGORIES) {
      await client.query(
        `insert into categories (id, name, slug, description, display_order, status, is_indexable)
         values ($1, $2, $3, $4, $5, 'PUBLISHED', $6)`,
        [
          randomUUID(),
          category.name,
          category.slug,
          category.description,
          category.displayOrder,
          category.isIndexable,
        ],
      );
    }

    /* The S02 fixture rows, dressed as the shop content they stand in for. */
    await client.query('update categories set name = $2, description = $3 where slug = $1', [
      S02_CATEGORY_SLUG,
      S02_CATEGORY_NAME,
      S02_CATEGORY_DESCRIPTION,
    ]);
    const s02Product = await client.query(
      'update products set name = $2, description = $3 where slug = $1 returning id',
      [S02_PRODUCT_SLUG, S02_PRODUCT_NAME, S02_PRODUCT_DESCRIPTION],
    );
    const s02ProductId = s02Product.rows[0]?.id;
    if (s02ProductId === undefined) {
      throw new Error('the APP12-S02 catalog must be seeded before the V01 density fixture');
    }
    await attachMedia(client, {
      productId: s02ProductId,
      assetIds: [catalogAssetIds[0], catalogAssetIds[1], catalogAssetIds[2]],
    });

    /* The browsing catalog. */
    const outOfStockSlugs = [];
    for (const [index, product] of PRODUCTS.entries()) {
      const categoryId = await categoryIdBySlug(client, product.category);
      const productId = await insertProductRow(client, {
        categoryId,
        product,
        displayOrder: index + 2,
      });
      for (const [order, variant] of product.variants.entries()) {
        await insertVariantRow(client, {
          productId,
          slug: product.slug,
          variant,
          displayOrder: order + 1,
        });
      }
      if (product.variants.every((variant) => variant.stock === 0)) {
        outOfStockSlugs.push(product.slug);
      }
      const offset = index % catalogAssetIds.length;
      await attachMedia(client, {
        productId,
        assetIds: [
          catalogAssetIds[offset],
          catalogAssetIds[(offset + 1) % catalogAssetIds.length],
          catalogAssetIds[(offset + 2) % catalogAssetIds.length],
        ],
      });
    }

    /* The gallery feed. */
    for (const [index, entry] of GALLERY_ENTRIES.entries()) {
      await insertGalleryRow(client, {
        entry,
        assetId: galleryAssetIds[index % galleryAssetIds.length],
        displayOrder: index + 1,
      });
    }

    await client.query('commit');

    for (const object of objects) {
      await putObject(object);
    }

    log(
      `seeded APP12-V01 density fixture into ${databaseName}: ` +
        `${String(PRODUCTS.length + 1)} products, ${String(GALLERY_ENTRIES.length)} gallery entries, ` +
        `${String(objects.length)} objects`,
    );

    return {
      categorySlugs: [
        ...AUTHORED_CATEGORIES.map((category) => category.slug),
        'thu-bong',
        'khan',
        'quan-ao',
        'khac',
      ],
      productSlugs: PRODUCTS.map((product) => product.slug),
      outOfStockSlug: outOfStockSlugs[0],
      inStockSlug: PRODUCTS[0].slug,
      multiVariantSlug: 'ao-so-mi-linen-theu-co',
      gallerySlugs: GALLERY_ENTRIES.map((entry) => entry.slug),
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}
