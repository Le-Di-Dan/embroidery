/**
 * The `APP12-M01.E1` cross-boundary acceptance fixture.
 *
 * ## What it exists to add
 *
 * `M01.E1` runs the `A1` Admin fixture and the `S1` Storefront fixture together
 * — between them they already provide DRAFT 0/8/20, PUBLISHED 1 and PUBLISHED
 * 20 — so this file seeds only the two states neither of them holds:
 *
 * ```text
 * m01e1-lan-truyen   PUBLISHED  3 images  §11 stored-primary propagation
 * m01e1-suy-giam     PUBLISHED  3 images  §12 effective-primary degradation
 * ```
 *
 * Both are needed because §11 and §12 are opposite experiments on the same
 * association. §11 changes the **stored** primary through the real Admin write
 * and asserts every public surface followed; §12 leaves `product_media`
 * untouched and makes the stored primary *ineligible*, then asserts the same
 * four surfaces agreed on a different row. Running them on one Product would
 * mean the degradation started from an order §11 had just rewritten, so a
 * failure could not be attributed to either.
 *
 * The `A1` fixture's `publishedRace` Product cannot serve §12: the Asset it
 * exposes for revocation is `raceAssets[1]` — a `GALLERY` row at position 1 —
 * and §12 is a claim about the row at position **0**.
 *
 * ## Why these Products carry a real purchase composition
 *
 * The `A1` PUBLISHED Products carry none, which is correct for an Admin screen
 * and wrong here: §11 and §12 assert `og:image` and JSON-LD `image[0]` on the
 * real Product Detail page, and a page whose purchase panel is stuck in its
 * unavailable state is not the page those tags are rendered from.
 *
 * ## Where this may run, and where it may never run
 *
 * Only against the **disposable** database `startEnvironment` provisions and
 * drops, for the reason `VALIDATION_GOVERNANCE.md` §3A.4 and the `APP12-G03`
 * reservation both give: these are published catalog rows, indistinguishable
 * once written from a Product an operator authored. `assertDisposable` refuses
 * anything not named `embroidery_db7_*`, and nothing is cleaned up row by row —
 * the whole database goes with the run.
 *
 * Every business key carries the `app12-m01e1-e2e` prefix, so a row that somehow
 * outlived its database is recognisable as harness debris.
 */
import { randomUUID } from 'node:crypto';

import pg from 'pg';

import { generateRenditions, insertAsset } from './h06-seo-media.mjs';

const { Client } = pg;

export const M01E1_PREFIX = 'app12-m01e1-e2e';
const STORAGE_PREFIX = `${M01E1_PREFIX}/catalog`;

export const M01E1_CATEGORY_SLUG = `${M01E1_PREFIX}-do-thu-nghiem`;
export const M01E1_PROPAGATE_SLUG = `${M01E1_PREFIX}-lan-truyen`;
export const M01E1_DEGRADE_SLUG = `${M01E1_PREFIX}-suy-giam`;
export const M01E1_DOMAIN_SLUG = `${M01E1_PREFIX}-mien-nghiep-vu`;
export const M01E1_PUBLISHED_SLUG = `${M01E1_PREFIX}-xuat-ban`;
export const M01E1_REFUSAL_SLUG = `${M01E1_PREFIX}-tu-choi`;
export const M01E1_SIGNAL_SLUG = `${M01E1_PREFIX}-tin-hieu`;

const BASE_PRICE = '540000';
const IMAGES_PER_PRODUCT = 3;
/**
 * How many Products carry their own three-image set.
 *
 * Five, and each with its own Assets: §9 rearranges its Product, §10 refuses
 * writes to another and permanently rejects one of its Assets, §11 rewrites a
 * third's stored primary, §12 degrades a fourth's and §13 audits a fifth.
 * Sharing any Asset between them would make one journey's deliberate damage
 * visible to another, and a failure unattributable — which is not theoretical:
 * §13 and §12 first shared the degradation Product, and a §13 failure left its
 * Asset rejected, so §12 then failed for §13's reason.
 */
const THREE_IMAGE_PRODUCTS = 5;
/**
 * The pool the domain project selects from.
 *
 * Twenty-one, because §7 asks for the twenty-image acceptance **and** the
 * twenty-first refusal, and a refusal composed from twenty ids plus a repeat
 * would be testing the duplicate rule instead of the cap.
 */
const DOMAIN_POOL_SIZE = 21;
const ON_HAND = 25;

/**
 * Refuses to touch anything but a disposable database.
 *
 * `createDisposableDatabase` names every database it makes `embroidery_db7_*`
 * and the persistent development database is plain `embroidery`. Checking the
 * name is what keeps a mistyped port from pointing this at the shared stack.
 */
function assertDisposable(databaseUrl) {
  const name = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (!name.startsWith('embroidery_db7_')) {
    throw new Error(
      `Refusing to seed the APP12-M01.E1 fixture into "${name}": only a disposable database ` +
        '(embroidery_db7_*) may receive it. See VALIDATION_GOVERNANCE.md §3A.4.',
    );
  }
  return name;
}

async function insertProduct(
  client,
  { categoryId, slug, name, displayOrder, status = 'PUBLISHED' },
) {
  const productId = randomUUID();
  await client.query(
    `insert into products
       (id, category_id, slug, name, description, base_price_amount, currency_code,
        status, is_display_out_of_stock, is_indexable, display_order)
     values ($1, $2, $3, $4, $5, $6, 'VND', $7, false, true, $8)`,
    [
      productId,
      categoryId,
      slug,
      name,
      'Sản phẩm thử nghiệm cho nghiệm thu ảnh đại diện trên các bề mặt công khai.',
      BASE_PRICE,
      status,
      displayOrder,
    ],
  );

  // One buyable path, so Product Detail renders its real composition — the page
  // `og:image` and the JSON-LD document are produced from.
  const variantId = randomUUID();
  await client.query(
    `insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
     values ($1, $2, $3, $4, 0, true)`,
    [variantId, productId, 'Kem', 'M'],
  );
  const skuId = randomUUID();
  await client.query(
    `insert into skus (id, product_variant_id, code, price_override_amount, currency_code, is_active)
     values ($1, $2, $3, null, 'VND', true)`,
    [skuId, variantId, `${M01E1_PREFIX}-${slug}-0`],
  );
  await client.query(
    `insert into sku_stocks (id, sku_id, quantity_on_hand, low_stock_threshold)
     values ($1, $2, $3, 0)`,
    [randomUUID(), skuId, ON_HAND],
  );

  return productId;
}

/**
 * Links Assets to a Product in array order.
 *
 * Position 0 takes `THUMBNAIL` and the rest `GALLERY`, which is what migration
 * `0039`'s `ck_product_media__primary_role_at_zero` requires — so a fixture that
 * got the ordering invariant wrong is refused by the database rather than
 * silently producing the state the acceptance run is trying to observe.
 */
async function linkMedia(client, productId, assetIds) {
  for (const [index, assetId] of assetIds.entries()) {
    await client.query(
      `insert into product_media (id, product_id, asset_id, role, display_order)
       values ($1, $2, $3, $4, $5)`,
      [randomUUID(), productId, assetId, index === 0 ? 'THUMBNAIL' : 'GALLERY', index],
    );
  }
}

/**
 * Writes the fixture and returns what the specs assert against.
 *
 * @param {{
 *   databaseUrl: string,
 *   sharp: unknown,
 *   putObject: (input: { storageKey: string, body: Buffer, contentType: string }) => Promise<void>,
 *   log?: (message: string) => void,
 * }} params
 */
export async function seedM01E1Acceptance({ databaseUrl, sharp, putObject, log = () => {} }) {
  const databaseName = assertDisposable(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const objects = [];
  let result;
  let assetCount;

  try {
    await client.query('begin');

    const categoryId = randomUUID();
    await client.query(
      `insert into categories (id, name, slug, description, display_order, status, is_indexable)
       values ($1, $2, $3, $4, 960, 'PUBLISHED', true)`,
      [
        categoryId,
        'Đồ thử nghiệm M01.E1',
        M01E1_CATEGORY_SLUG,
        'APP12-M01.E1 disposable acceptance fixture. Never operator-authored catalog.',
      ],
    );

    // Every Asset is its own row with its own storage keys, so no two Products
    // share an image and one journey's deliberate damage cannot be observed by
    // another.
    const assetIds = [];
    for (
      let seed = 0;
      seed < IMAGES_PER_PRODUCT * THREE_IMAGE_PRODUCTS + DOMAIN_POOL_SIZE;
      seed += 1
    ) {
      const renditions = await generateRenditions({ sharp, seed: seed + 41 });
      assetIds.push(
        await insertAsset(client, {
          kind: 'CATALOG_MEDIA',
          storagePrefix: STORAGE_PREFIX,
          renditions,
          objects,
        }),
      );
    }
    assetCount = assetIds.length;

    const take = (index) =>
      assetIds.slice(index * IMAGES_PER_PRODUCT, (index + 1) * IMAGES_PER_PRODUCT);
    const propagateAssets = take(0);
    const degradeAssets = take(1);
    const publishedAssets = take(2);
    const refusalAssets = take(3);
    const signalAssets = take(4);
    const domainPool = assetIds.slice(IMAGES_PER_PRODUCT * THREE_IMAGE_PRODUCTS);

    const propagate = await insertProduct(client, {
      categoryId,
      slug: M01E1_PROPAGATE_SLUG,
      name: 'Khăn tay thử nghiệm M01.E1 — lan truyền ảnh đại diện',
      displayOrder: 0,
    });
    await linkMedia(client, propagate, propagateAssets);

    const degrade = await insertProduct(client, {
      categoryId,
      slug: M01E1_DEGRADE_SLUG,
      name: 'Ví thử nghiệm M01.E1 — ảnh đại diện suy giảm',
      displayOrder: 1,
    });
    await linkMedia(client, degrade, degradeAssets);

    // The domain subject: a DRAFT with no media, and twenty-one Assets to
    // compose requests from. DRAFT rather than PUBLISHED because §7's
    // application half includes the *empty* start and the twenty-image
    // acceptance, and a PUBLISHED Product may legally reach neither.
    //
    // It is its own Product for the same reason the other two are: the Admin
    // project re-proves the `A1` journeys against the `A1` Products, and a
    // domain run that had emptied one of those first would make a later
    // failure unattributable.
    const domain = await insertProduct(client, {
      categoryId,
      slug: M01E1_DOMAIN_SLUG,
      name: 'Sổ tay thử nghiệm M01.E1 — miền nghiệp vụ',
      status: 'DRAFT',
      displayOrder: 2,
    });

    // §9's subject: a PUBLISHED Product with a real buyable composition, which
    // the `A1` PUBLISHED Products deliberately do not have. The three saves §9
    // requires rearrange it, so it can be no other journey's Product.
    const published = await insertProduct(client, {
      categoryId,
      slug: M01E1_PUBLISHED_SLUG,
      name: 'Áo thun thử nghiệm M01.E1 — biên tập ảnh khi đang xuất bản',
      displayOrder: 3,
    });
    await linkMedia(client, published, publishedAssets);

    // §10's subject. One of its Assets is permanently rejected during the run —
    // the invalid-write case has no other way to exist — so this Product's three
    // Assets belong to it and to nothing else.
    const refusal = await insertProduct(client, {
      categoryId,
      slug: M01E1_REFUSAL_SLUG,
      name: 'Nón thử nghiệm M01.E1 — từ chối ghi không hợp lệ',
      displayOrder: 4,
    });
    await linkMedia(client, refusal, refusalAssets);

    // §13's subject. Its own Product for the reason the note above records: the
    // audit rejects the stored primary, and when it shared §12's Product a
    // failing audit left that Asset rejected — so §12 then failed for §13's
    // reason and the run reported two defects where there was one.
    const signal = await insertProduct(client, {
      categoryId,
      slug: M01E1_SIGNAL_SLUG,
      name: 'Túi vải thử nghiệm M01.E1 — tín hiệu ảnh đại diện suy giảm',
      displayOrder: 5,
    });
    await linkMedia(client, signal, signalAssets);

    await client.query('commit');

    result = {
      categorySlug: M01E1_CATEGORY_SLUG,
      propagate: {
        productId: propagate,
        slug: M01E1_PROPAGATE_SLUG,
        assetIds: propagateAssets,
      },
      degrade: {
        productId: degrade,
        slug: M01E1_DEGRADE_SLUG,
        assetIds: degradeAssets,
        // Position 0 — the stored canonical primary, which is the row §12 is a
        // claim about.
        storedPrimaryAssetId: degradeAssets[0],
      },
      domain: {
        productId: domain,
        slug: M01E1_DOMAIN_SLUG,
        poolAssetIds: domainPool,
      },
      published: {
        productId: published,
        slug: M01E1_PUBLISHED_SLUG,
        assetIds: publishedAssets,
      },
      refusal: {
        productId: refusal,
        slug: M01E1_REFUSAL_SLUG,
        assetIds: refusalAssets,
        // The Asset §10's "tombstoned/ineligible" case rejects. Position 2, so
        // rejecting it cannot also change which row is the stored primary and
        // confuse the refusal under test with a degradation.
        revocableAssetId: refusalAssets[2],
      },
      signal: {
        productId: signal,
        slug: M01E1_SIGNAL_SLUG,
        assetIds: signalAssets,
        storedPrimaryAssetId: signalAssets[0],
      },
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }

  // Storage last: a failed transaction must not leave orphan objects behind,
  // and an object with no row is invisible to every read path anyway.
  for (const object of objects) {
    await putObject(object);
  }

  log(
    `seeded APP12-M01.E1 acceptance fixture into ${databaseName} ` +
      `(${String(assetCount)} assets, ${String(objects.length)} derivative objects)`,
  );
  return result;
}
