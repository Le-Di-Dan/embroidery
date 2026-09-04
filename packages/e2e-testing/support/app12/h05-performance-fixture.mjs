/**
 * The `APP12-H05` representative Wave-1 measurement fixture.
 *
 * ## Where this may run, and where it may never run
 *
 * Only against a **disposable** `embroidery_db7_*` database, enforced below
 * rather than remembered (`VALIDATION_GOVERNANCE.md` §3A.4). `APP12-H05` §5 says
 * synthetic data only, disposable staging DB/object storage, and explicitly no
 * `APP12-G03` representative UAT dataset — G03 owns the persistent authored
 * catalog under its own authority and nothing here may anticipate it. Every
 * business key carries the `app12-h05-perf` prefix so a row that somehow
 * outlived its database is recognisable as measurement debris.
 *
 * ## What "representative" has to mean for a performance measurement
 *
 * §5 requires multiple published categories, multiple published products,
 * representative product imagery, representative gallery/media content and a
 * real Ready-Made SKU projection. Two extra properties matter here that do not
 * matter to a functional fixture:
 *
 * 1. **The list surfaces must exceed one page.** Discover paginates at 20 and
 *    the gallery feed at 12 (`discover-query-keys`, `gallery-query-keys`), so a
 *    fixture of five products would measure an unpaginated list and §17 could
 *    not be answered at all. The counts below put every measured list over its
 *    own page boundary with a continuation to exercise.
 * 2. **The images must be real bytes.** See `h05-media-generator.mjs`.
 *
 * The catalog is written as SQL in the shapes the delivered schema declares,
 * for the reason the `APP12-S01` fixture gives: this is a *read-path*
 * measurement, and composing the catalog through the Admin write surfaces would
 * put APP2/APP7/APP8 write machinery inside the measurement. Orders are the
 * deliberate exception — those are created through the real public API by the
 * measurement harness, because an Admin queue seeded behind the application
 * would not be an Admin queue the application produced.
 */
import { randomUUID } from 'node:crypto';

/** The prefix every business key in this fixture carries. */
export const H05_FIXTURE_PREFIX = 'app12-h05-perf';

/** Published categories, sized so Discover pages and the facet row is populated. */
export const H05_CATEGORIES = Object.freeze([
  Object.freeze({ slug: `${H05_FIXTURE_PREFIX}-ao-thun`, name: 'Áo thun H05', products: 22 }),
  Object.freeze({ slug: `${H05_FIXTURE_PREFIX}-tui-vai`, name: 'Túi vải H05', products: 12 }),
  Object.freeze({ slug: `${H05_FIXTURE_PREFIX}-khan`, name: 'Khăn H05', products: 8 }),
  Object.freeze({ slug: `${H05_FIXTURE_PREFIX}-mu-non`, name: 'Mũ nón H05', products: 6 }),
]);

/** Published gallery entries — over the feed page size of 12, with continuation. */
export const H05_GALLERY_ENTRY_COUNT = 31;

/** Media associations per product: one THUMBNAIL card image plus a detail gallery. */
export const H05_MEDIA_PER_PRODUCT = 4;
/** Media associations per gallery entry. */
export const H05_MEDIA_PER_GALLERY_ENTRY = 3;

const BASE_PRICE = '450000';
const COLORS = ['Trắng', 'Đen', 'Xanh rêu', 'Be'];
const SIZES = ['M', 'L'];

/** Refuses to touch anything but a disposable database. */
function assertDisposable(databaseUrl) {
  const name = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (!name.startsWith('embroidery_db7_')) {
    throw new Error(
      `Refusing to seed the APP12-H05 measurement fixture into "${name}": only a disposable ` +
        'database (embroidery_db7_*) may receive it. See VALIDATION_GOVERNANCE.md §3A.4.',
    );
  }
  return name;
}

/**
 * The classification each media lane's parent Asset carries.
 *
 * The two lanes genuinely differ and a fixture that used one value for both
 * would silently produce a catalog with no images. Catalog media is
 * `PRODUCTION_SENSITIVE` (`PRODUCT_MEDIA_ASSET_CLASSIFICATION`) — the *original*
 * is not public and is never served; only the WebP derivative is. Gallery media
 * is `PUBLIC` (`GALLERY_ENTRY_ASSET_CLASSIFICATION`), the boundary `APP11-B02`
 * enforces on the write and the public read re-proves. Both delivery repositories
 * compare this column exactly, so getting it wrong yields a 200 product page
 * whose `media` array is empty.
 */
const ASSET_CLASSIFICATION_BY_KIND = Object.freeze({
  CATALOG_MEDIA: 'PRODUCTION_SENSITIVE',
  GALLERY_MEDIA: 'PUBLIC',
});

/**
 * One asset with both display derivatives READY, plus the object bodies the
 * caller must put in storage.
 */
function buildAsset({ kind, storagePrefix, index, poolEntry }) {
  const assetId = randomUUID();
  const objects = [];
  const derivatives = poolEntry.map((rendition) => {
    const storageKey = `${storagePrefix}/${assetId}/${rendition.rendition}.webp`;
    objects.push({ storageKey, body: rendition.body, contentType: 'image/webp' });
    return {
      id: randomUUID(),
      kind: rendition.kind,
      storageKey,
      checksum: rendition.checksum,
      widthPx: rendition.widthPx,
      heightPx: rendition.heightPx,
      byteSize: rendition.body.byteLength,
    };
  });
  // The parent Asset describes the uploaded ORIGINAL, which the public route
  // never serves; its size is the larger derivative's, the closest honest
  // stand-in for a source this fixture does not create.
  const largest = derivatives.reduce((a, b) => (a.byteSize >= b.byteSize ? a : b));
  return {
    asset: {
      id: assetId,
      kind,
      classification: ASSET_CLASSIFICATION_BY_KIND[kind],
      storageKey: `${storagePrefix}/${assetId}/source-${String(index)}.webp`,
      mimeType: 'image/webp',
      sizeBytes: largest.byteSize,
      checksum: largest.checksum,
      status: 'ACCEPTED',
    },
    derivatives,
    objects,
  };
}

async function insertAsset(client, { asset, derivatives }) {
  await client.query(
    `insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      asset.id,
      asset.kind,
      asset.classification,
      asset.storageKey,
      asset.mimeType,
      asset.sizeBytes,
      asset.checksum,
      asset.status,
    ],
  );
  for (const derivative of derivatives) {
    await client.query(
      `insert into asset_derivatives
         (id, asset_id, kind, status, storage_key, checksum, is_watermarked,
          width_px, height_px, media_type, byte_size)
       values ($1, $2, $3, 'READY', $4, $5, false, $6, $7, 'image/webp', $8)`,
      [
        derivative.id,
        asset.id,
        derivative.kind,
        derivative.storageKey,
        derivative.checksum,
        derivative.widthPx,
        derivative.heightPx,
        derivative.byteSize,
      ],
    );
  }
}

async function insertProductVariants(client, { productId, slug }) {
  let order = 0;
  for (const color of COLORS) {
    for (const size of SIZES) {
      order += 1;
      const variantId = randomUUID();
      await client.query(
        `insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
         values ($1, $2, $3, $4, $5, true)`,
        [variantId, productId, color, size, order],
      );
      const skuId = randomUUID();
      await client.query(
        `insert into skus (id, product_variant_id, code, price_override_amount, currency_code, is_active)
         values ($1, $2, $3, $4, 'VND', true)`,
        [skuId, variantId, `${slug}-${String(order)}`, order % 3 === 0 ? '399000' : null],
      );
      // Every variant carries a stock anchor with real availability, so the
      // Ready-Made SKU projection Product Detail measures is the real one
      // rather than a page of sold-out states.
      await client.query(
        `insert into sku_stocks (id, sku_id, quantity_on_hand, low_stock_threshold)
         values ($1, $2, $3, 0)`,
        [randomUUID(), skuId, order % 7 === 0 ? 0 : 4 + (order % 9)],
      );
    }
  }
}

async function seedCatalog({ client, pool, take, objects, productSlugs }) {
  let categoryOrder = 0;
  for (const category of H05_CATEGORIES) {
    categoryOrder += 1;
    const categoryId = randomUUID();
    await client.query(
      `insert into categories (id, name, slug, description, display_order, status, is_indexable)
       values ($1, $2, $3, $4, $5, 'PUBLISHED', true)`,
      [
        categoryId,
        category.name,
        category.slug,
        'APP12-H05 disposable measurement fixture. Never operator-authored catalog.',
        categoryOrder * 10,
      ],
    );

    for (let index = 0; index < category.products; index += 1) {
      const slug = `${category.slug}-${String(index + 1).padStart(2, '0')}`;
      const productId = randomUUID();
      await client.query(
        `insert into products
           (id, category_id, slug, name, description, base_price_amount, currency_code,
            status, is_display_out_of_stock, is_indexable, display_order)
         values ($1, $2, $3, $4, $5, $6, 'VND', 'PUBLISHED', false, true, $7)`,
        [
          productId,
          categoryId,
          slug,
          `${category.name} mẫu ${String(index + 1)}`,
          'Sản phẩm đo hiệu năng APP12-H05. Dữ liệu tổng hợp, không phải catalog thật.',
          BASE_PRICE,
          index + 1,
        ],
      );
      await insertProductVariants(client, { productId, slug });

      for (let position = 0; position < H05_MEDIA_PER_PRODUCT; position += 1) {
        const built = buildAsset({
          kind: 'CATALOG_MEDIA',
          storagePrefix: `${H05_FIXTURE_PREFIX}/catalog`,
          index: position,
          poolEntry: take(),
        });
        await insertAsset(client, built);
        objects.push(...built.objects);
        await client.query(
          `insert into product_media (id, product_id, asset_id, role, display_order)
           values ($1, $2, $3, $4, $5)`,
          [
            randomUUID(),
            productId,
            built.asset.id,
            position === 0 ? 'THUMBNAIL' : 'GALLERY',
            position,
          ],
        );
      }
      productSlugs.push(slug);
    }
  }
  return pool;
}

async function seedGallery({ client, take, objects, gallerySlugs }) {
  for (let index = 0; index < H05_GALLERY_ENTRY_COUNT; index += 1) {
    const slug = `${H05_FIXTURE_PREFIX}-bo-suu-tap-${String(index + 1).padStart(2, '0')}`;
    const entryId = randomUUID();
    await client.query(
      `insert into gallery_entries
         (id, title, slug, description, status, display_order, seo_title, seo_description, is_indexable)
       values ($1, $2, $3, $4, 'PUBLISHED', $5, $6, $7, true)`,
      [
        entryId,
        `Bộ sưu tập đo hiệu năng ${String(index + 1)}`,
        slug,
        'Nội dung tổng hợp phục vụ đo hiệu năng APP12-H05.',
        index + 1,
        `Bộ sưu tập ${String(index + 1)} — H05`,
        'Mô tả SEO tổng hợp cho phép đo hiệu năng APP12-H05.',
      ],
    );
    for (let position = 0; position < H05_MEDIA_PER_GALLERY_ENTRY; position += 1) {
      const built = buildAsset({
        kind: 'GALLERY_MEDIA',
        storagePrefix: `${H05_FIXTURE_PREFIX}/gallery`,
        index: position,
        poolEntry: take(),
      });
      await insertAsset(client, built);
      objects.push(...built.objects);
      await client.query(
        `insert into gallery_entry_assets (id, gallery_entry_id, asset_id, display_order)
         values ($1, $2, $3, $4)`,
        [randomUUID(), entryId, built.asset.id, position],
      );
    }
    gallerySlugs.push(slug);
  }
}

/**
 * Writes the fixture and returns the identifiers the measurement addresses.
 *
 * @param {{ client: unknown, databaseUrl: string, pool: unknown, putObject: Function, log?: Function }} params
 */
export async function seedH05PerformanceFixture({
  client,
  databaseUrl,
  pool,
  putObject,
  log = () => {},
}) {
  const databaseName = assertDisposable(databaseUrl);
  const objects = [];
  const productSlugs = [];
  const gallerySlugs = [];
  let assetIndex = 0;
  const take = () => pool[assetIndex++ % pool.length];

  await client.query('begin');
  try {
    await seedCatalog({ client, pool, take, objects, productSlugs });
    await seedGallery({ client, take, objects, gallerySlugs });
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }

  // Objects go to storage only after the rows commit. An orphan object in a
  // disposable bucket is harmless; a row pointing at an object that never
  // arrived would make every media request a 404 and silently zero the image
  // budget this fixture exists to measure.
  let uploaded = 0;
  for (const object of objects) {
    await putObject(object);
    uploaded += 1;
  }

  log(
    `seeded APP12-H05 measurement fixture into ${databaseName}: ` +
      `${String(H05_CATEGORIES.length)} categories, ${String(productSlugs.length)} products, ` +
      `${String(gallerySlugs.length)} gallery entries, ${String(uploaded)} storage objects`,
  );

  return Object.freeze({
    categorySlugs: H05_CATEGORIES.map((category) => category.slug),
    productSlugs: Object.freeze(productSlugs),
    gallerySlugs: Object.freeze(gallerySlugs),
    storageObjectCount: uploaded,
  });
}
