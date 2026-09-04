/**
 * The `APP12-H06` SEO and public-readiness fixture.
 *
 * ## Where this may run, and where it may never run
 *
 * Only against the **disposable** database `startEnvironment` provisions and
 * drops. `assertDisposable` refuses anything else, so `VALIDATION_GOVERNANCE.md`
 * §3A.4 is enforced rather than remembered, and no row here can reach the shared
 * development database or be mistaken for the `APP12-G03` authored dataset.
 * Every business key carries the `app12-h06-e2e` prefix.
 *
 * ## What it has to express that no existing fixture does
 *
 * H06 asserts facts about *indexability* and *offer truth*, and neither can be
 * observed against a catalog where everything is published, indexable and
 * singly-priced. The shared development database has exactly that shape: five
 * categories, all `is_indexable = true`, and one Product with no SKU at all. So
 * the matrix below exists to make each rule fail loudly if it regresses:
 *
 * ```text
 * category  danh-muc-mo        PUBLISHED  indexable      -> canonical, in sitemap
 * category  danh-muc-kin       PUBLISHED  NOT indexable  -> noindex, NOT in sitemap
 *
 * product   ao-thun            PUBLISHED  indexable      -> AggregateOffer
 * product   khan-don           PUBLISHED  indexable      -> single Offer
 * product   khong-ban          PUBLISHED  indexable      -> Product, NO offers
 * product   khong-index        PUBLISHED  NOT indexable  -> noindex, NOT in sitemap
 * product   trong-danh-muc-kin PUBLISHED  indexable      -> lives under the noindex category
 * product   nhap               DRAFT                     -> 404
 * product   luu-tru            ARCHIVED                  -> 404
 *
 * gallery   tac-pham           PUBLISHED  indexable      -> og:image, in sitemap
 * gallery   tac-pham-an        PUBLISHED  NOT indexable  -> noindex, NOT in sitemap
 * ```
 *
 * ## The offer matrix, and the one variant that must not appear
 *
 * `ao-thun` carries five variants chosen so that a wrong answer is visible in a
 * single number rather than needing a second assertion:
 *
 * ```text
 * Trắng · M    one SKU, 8 on hand, override 399000   -> InStock     lowPrice
 * Trắng · L    one SKU, 0 on hand, base     450000   -> OutOfStock
 * Đen   · M    one SKU, 3 on hand, override 520000   -> InStock     highPrice
 * Đen   · L    no SKU                                -> contributes nothing
 * Xanh rêu · M TWO eligible SKUs, 111000 and 900000  -> AMBIGUOUS, excluded
 * ```
 *
 * The ambiguous pair is priced deliberately **outside** the legitimate range on
 * both sides. If `toOfferableSkus` ever stopped excluding an `ambiguous` variant
 * — the exclusion that mirrors the purchase panel's refusal to pick a winning
 * SKU (`APP12-S01` §9) — `lowPrice` would become `111000` and `highPrice`
 * `900000`, and `offerCount` would be `5`. The test therefore cannot pass by
 * accident, and no separate "is the ambiguous variant absent" assertion is
 * needed.
 *
 * ## Why it writes SQL rather than driving the Admin API
 *
 * H06 is a Storefront read checkpoint, exactly as `APP12-S01` was. Composing
 * this catalog through the Admin surfaces would exercise APP2, APP7 and APP8
 * write paths whose failure would look like an H06 defect and would not be one.
 * The rows are written in the shapes the delivered schema declares; what H06
 * proves is that the **public read and the rendered head** project them
 * correctly.
 */
import { randomUUID } from 'node:crypto';

import pg from 'pg';

import { generateRenditions, insertAsset } from './h06-seo-media.mjs';
import {
  insertCategory,
  insertGalleryEntry,
  insertProduct,
  insertVariant,
} from './h06-seo-rows.mjs';
import {
  H06_AGGREGATE_PRODUCT_SLUG,
  H06_AMBIGUOUS_HIGH_PRICE,
  H06_AMBIGUOUS_LOW_PRICE,
  H06_ARCHIVED_PRODUCT_SLUG,
  H06_DRAFT_PRODUCT_SLUG,
  H06_FIXTURE_PREFIX,
  H06_GALLERY_SLUG,
  H06_HIGH_PRICE,
  H06_INDEXABLE_CATEGORY_SLUG,
  H06_IN_NOINDEX_CATEGORY_PRODUCT_SLUG,
  H06_LOW_PRICE,
  H06_NOINDEX_GALLERY_SLUG,
  H06_NOINDEX_PRODUCT_SLUG,
  H06_NONINDEXABLE_CATEGORY_SLUG,
  H06_NO_OFFER_PRODUCT_SLUG,
  H06_PRODUCT_DESCRIPTION,
  H06_SEO_DESCRIPTION,
  H06_SEO_TITLE,
  H06_SINGLE_OFFER_PRODUCT_SLUG,
  H06_SINGLE_PRICE,
  H06_UNKNOWN_SLUG,
} from './h06-seo-slugs.mjs';

const { Client } = pg;

/** Refuses to touch anything but a disposable database. */
function assertDisposable(databaseUrl) {
  const name = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (!name.startsWith('embroidery_db7_')) {
    throw new Error(
      `Refusing to seed the APP12-H06 SEO fixture into "${name}": only a disposable ` +
        'database (embroidery_db7_*) may receive it. See VALIDATION_GOVERNANCE.md §3A.4.',
    );
  }
  return name;
}

/**
 * Writes the fixture and returns the identifiers the spec asserts against.
 *
 * Rows commit before any object is stored, for the reason `APP12-H05` recorded:
 * an orphan object in a disposable bucket is harmless, while a row pointing at
 * an object that never arrived turns every media request into a 404 and would
 * quietly void the one thing §10 asks this fixture to make provable.
 *
 * @param {{ databaseUrl: string, sharp: unknown, putObject: Function, log?: Function }} params
 */
export async function seedH06SeoFixture({ databaseUrl, sharp, putObject, log = () => {} }) {
  const databaseName = assertDisposable(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const objects = [];

  try {
    const catalogRenditions = await generateRenditions({ sharp, seed: 1 });
    const galleryRenditions = await generateRenditions({ sharp, seed: 2 });

    await client.query('begin');

    const openCategoryId = await insertCategory(client, {
      slug: H06_INDEXABLE_CATEGORY_SLUG,
      name: 'Danh mục mở H06',
      isIndexable: true,
      displayOrder: 910,
    });
    const closedCategoryId = await insertCategory(client, {
      slug: H06_NONINDEXABLE_CATEGORY_SLUG,
      name: 'Danh mục kín H06',
      isIndexable: false,
      displayOrder: 920,
    });

    // --- the AggregateOffer subject -----------------------------------------
    const catalogAssetId = await insertAsset(client, {
      kind: 'CATALOG_MEDIA',
      storagePrefix: `${H06_FIXTURE_PREFIX}/catalog`,
      renditions: catalogRenditions,
      objects,
    });
    const aggregateId = await insertProduct(client, {
      categoryId: openCategoryId,
      slug: H06_AGGREGATE_PRODUCT_SLUG,
      name: 'Áo thun H06',
      description: H06_PRODUCT_DESCRIPTION,
      seoTitle: H06_SEO_TITLE,
      seoDescription: H06_SEO_DESCRIPTION,
      displayOrder: 1,
    });
    await client.query(
      `insert into product_media (id, product_id, asset_id, role, display_order)
       values ($1, $2, $3, 'THUMBNAIL', 0)`,
      [randomUUID(), aggregateId, catalogAssetId],
    );

    await insertVariant(client, {
      productId: aggregateId,
      colorName: 'Trắng',
      sizeLabel: 'M',
      displayOrder: 1,
      skus: [{ onHand: 8, priceOverride: H06_LOW_PRICE }],
    });
    await insertVariant(client, {
      productId: aggregateId,
      colorName: 'Trắng',
      sizeLabel: 'L',
      displayOrder: 2,
      // No override: the resolved price is the product's base amount.
      skus: [{ onHand: 0 }],
    });
    await insertVariant(client, {
      productId: aggregateId,
      colorName: 'Đen',
      sizeLabel: 'M',
      displayOrder: 3,
      skus: [{ onHand: 3, priceOverride: H06_HIGH_PRICE }],
    });
    await insertVariant(client, {
      productId: aggregateId,
      colorName: 'Đen',
      sizeLabel: 'L',
      displayOrder: 4,
      skus: [],
    });
    await insertVariant(client, {
      productId: aggregateId,
      colorName: 'Xanh rêu',
      sizeLabel: 'M',
      displayOrder: 5,
      skus: [
        { onHand: 4, priceOverride: H06_AMBIGUOUS_LOW_PRICE },
        { onHand: 4, priceOverride: H06_AMBIGUOUS_HIGH_PRICE },
      ],
    });

    // --- the single-Offer subject -------------------------------------------
    const singleId = await insertProduct(client, {
      categoryId: openCategoryId,
      slug: H06_SINGLE_OFFER_PRODUCT_SLUG,
      name: 'Khăn H06',
      // Deliberately no description and no SEO override. This is the Product
      // that proves an absent description is published as absent rather than
      // silently inherited from the root layout's app-wide fallback.
      displayOrder: 2,
    });
    await insertVariant(client, {
      productId: singleId,
      colorName: 'Trắng',
      sizeLabel: null,
      displayOrder: 1,
      skus: [{ onHand: 5, priceOverride: H06_SINGLE_PRICE }],
    });

    // --- published, indexable, nothing sellable -----------------------------
    const noOfferId = await insertProduct(client, {
      categoryId: openCategoryId,
      slug: H06_NO_OFFER_PRODUCT_SLUG,
      name: 'Sản phẩm chưa bán H06',
      description: 'Sản phẩm đã xuất bản nhưng chưa có SKU nào.',
      displayOrder: 3,
    });
    await insertVariant(client, {
      productId: noOfferId,
      colorName: 'Trắng',
      sizeLabel: 'M',
      displayOrder: 1,
      skus: [],
    });

    // --- indexability and publication edges ---------------------------------
    await insertProduct(client, {
      categoryId: openCategoryId,
      slug: H06_NOINDEX_PRODUCT_SLUG,
      name: 'Sản phẩm không lập chỉ mục H06',
      description: 'Đã xuất bản, đọc được, nhưng người vận hành chọn noindex.',
      isIndexable: false,
      displayOrder: 4,
    });
    await insertProduct(client, {
      categoryId: closedCategoryId,
      slug: H06_IN_NOINDEX_CATEGORY_PRODUCT_SLUG,
      name: 'Sản phẩm trong danh mục kín H06',
      description: 'Sản phẩm tự nó lập chỉ mục được, nằm trong danh mục noindex.',
      displayOrder: 5,
    });
    await insertProduct(client, {
      categoryId: openCategoryId,
      slug: H06_DRAFT_PRODUCT_SLUG,
      name: 'Bản nháp H06',
      status: 'DRAFT',
      displayOrder: 6,
    });
    await insertProduct(client, {
      categoryId: openCategoryId,
      slug: H06_ARCHIVED_PRODUCT_SLUG,
      name: 'Bản lưu trữ H06',
      status: 'ARCHIVED',
      displayOrder: 7,
    });

    // --- gallery ------------------------------------------------------------
    const galleryAssetId = await insertAsset(client, {
      kind: 'GALLERY_MEDIA',
      storagePrefix: `${H06_FIXTURE_PREFIX}/gallery`,
      renditions: galleryRenditions,
      objects,
    });
    await insertGalleryEntry(client, {
      slug: H06_GALLERY_SLUG,
      title: 'Tác phẩm H06',
      isIndexable: true,
      displayOrder: 1,
      assetId: galleryAssetId,
    });
    const hiddenGalleryAssetId = await insertAsset(client, {
      kind: 'GALLERY_MEDIA',
      storagePrefix: `${H06_FIXTURE_PREFIX}/gallery`,
      renditions: galleryRenditions,
      objects,
    });
    await insertGalleryEntry(client, {
      slug: H06_NOINDEX_GALLERY_SLUG,
      title: 'Tác phẩm ẩn H06',
      isIndexable: false,
      displayOrder: 2,
      assetId: hiddenGalleryAssetId,
    });

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }

  let uploaded = 0;
  for (const object of objects) {
    await putObject(object);
    uploaded += 1;
  }

  log(
    `seeded APP12-H06 SEO fixture into ${databaseName}: 2 categories, 7 products, ` +
      `2 gallery entries, ${String(uploaded)} storage objects`,
  );

  return Object.freeze({
    indexableCategorySlug: H06_INDEXABLE_CATEGORY_SLUG,
    nonIndexableCategorySlug: H06_NONINDEXABLE_CATEGORY_SLUG,
    aggregateProductSlug: H06_AGGREGATE_PRODUCT_SLUG,
    singleOfferProductSlug: H06_SINGLE_OFFER_PRODUCT_SLUG,
    noOfferProductSlug: H06_NO_OFFER_PRODUCT_SLUG,
    noindexProductSlug: H06_NOINDEX_PRODUCT_SLUG,
    inNoindexCategoryProductSlug: H06_IN_NOINDEX_CATEGORY_PRODUCT_SLUG,
    draftProductSlug: H06_DRAFT_PRODUCT_SLUG,
    archivedProductSlug: H06_ARCHIVED_PRODUCT_SLUG,
    gallerySlug: H06_GALLERY_SLUG,
    noindexGallerySlug: H06_NOINDEX_GALLERY_SLUG,
    unknownSlug: H06_UNKNOWN_SLUG,
    storageObjectCount: uploaded,
  });
}
