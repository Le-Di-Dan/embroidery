/**
 * The `APP12-M01.S1` Storefront gallery fixture.
 *
 * ## Where this may run, and where it may never run
 *
 * Only against the **disposable** database `startEnvironment` provisions and
 * drops. `VALIDATION_GOVERNANCE.md` §3A.4 and the `APP12-G03` reservation both
 * require it: these are published catalog rows, and once written they would be
 * indistinguishable from a Product an operator authored. `assertDisposable`
 * refuses anything not named `embroidery_db7_*`, and nothing is cleaned up row
 * by row — the whole database goes with the run.
 *
 * ## Why the media is the H05 pool and not the H06 one
 *
 * `APP12-M01.A1` seeded from `h06-seo-media.mjs`, whose derivatives are 400 and
 * 800 px: correct there, because the Admin question was whether twenty
 * photographs stay legible in a grid. S1's question is different. §20 asks what
 * the **initial page weight** is and whether the strip stopped pulling the
 * stage's derivative, and that is only answerable against derivatives with
 * production-like proportions — the 800 px `THUMBNAIL` against the 1600 px
 * `CATALOG_PREVIEW` that `APP12-H05` measured. A 400/800 pool would compress the
 * very ratio `APP12-M01.B1` exists to change, and would report a saving that
 * owed as much to the fixture as to the code.
 *
 * The pool holds twelve sources and the largest Product needs twenty images, so
 * the bodies repeat. Only the bodies: each Asset is its own row with its own
 * storage keys, so the browser fetches twenty distinct addresses and no
 * measurement is flattered by a cache hit.
 *
 * ## The dataset
 *
 * ```text
 * m01s1-anh-1     PUBLISHED   1 image    the clean single-image state
 * m01s1-anh-8     PUBLISHED   8 images   the strip that fits
 * m01s1-anh-20    PUBLISHED  20 images   the cap, and every viewport
 * ```
 *
 * Each Product carries one variant, one SKU and stock, so the purchase panel
 * renders its real buyable composition — S1 §4 is a claim about where the price
 * and the CTA sit, and a panel stuck in its unavailable state could not carry it.
 *
 * Every business key carries the `app12-m01s1-e2e` prefix, so a row that somehow
 * outlived its database is recognisable as harness debris.
 */
import { randomUUID } from 'node:crypto';

import pg from 'pg';

import { generateH05ImagePool } from './h05-media-generator.mjs';
import { insertAsset } from './h06-seo-media.mjs';

const { Client } = pg;

export const M01S1_PREFIX = 'app12-m01s1-e2e';
const STORAGE_PREFIX = `${M01S1_PREFIX}/catalog`;

export const M01S1_CATEGORY_SLUG = `${M01S1_PREFIX}-do-thu-nghiem`;
export const M01S1_ONE_SLUG = `${M01S1_PREFIX}-anh-1`;
export const M01S1_EIGHT_SLUG = `${M01S1_PREFIX}-anh-8`;
export const M01S1_TWENTY_SLUG = `${M01S1_PREFIX}-anh-20`;

const BASE_PRICE = '620000';
/** The `product_media` cap migration `0039` enforces, and the largest state S1 must prove. */
const MAX_MEDIA = 20;
const ON_HAND = 25;

function assertDisposable(databaseUrl) {
  const name = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (!name.startsWith('embroidery_db7_')) {
    throw new Error(
      `Refusing to seed the APP12-M01.S1 fixture into "${name}": only a disposable database ` +
        '(embroidery_db7_*) may receive it. See VALIDATION_GOVERNANCE.md §3A.4.',
    );
  }
  return name;
}

async function insertProduct(client, { categoryId, slug, name, displayOrder }) {
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
      name,
      'Sản phẩm thử nghiệm cho thư viện ảnh trên trang chi tiết.',
      BASE_PRICE,
      displayOrder,
    ],
  );

  // One buyable path, so the purchase panel is the real one. `APP12-B01` reads
  // the stock anchor rather than `is_display_out_of_stock`, so the anchor is
  // what has to exist.
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
    [skuId, variantId, `${M01S1_PREFIX}-${slug}-0`],
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
 * silently producing the page the Storefront must not render.
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
 * Writes the fixture and returns the slugs the spec navigates to.
 *
 * @param {{
 *   databaseUrl: string,
 *   sharp: unknown,
 *   putObject: (input: { storageKey: string, body: Buffer, contentType: string }) => Promise<void>,
 *   log?: (message: string) => void,
 * }} params
 */
export async function seedM01S1Gallery({ databaseUrl, sharp, putObject, log = () => {} }) {
  const databaseName = assertDisposable(databaseUrl);
  const pool = await generateH05ImagePool({ sharp, log });
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const objects = [];
  let result;

  try {
    await client.query('begin');

    const categoryId = randomUUID();
    await client.query(
      `insert into categories (id, name, slug, description, display_order, status, is_indexable)
       values ($1, $2, $3, $4, 950, 'PUBLISHED', true)`,
      [
        categoryId,
        'Đồ thử nghiệm M01.S1',
        M01S1_CATEGORY_SLUG,
        'APP12-M01.S1 disposable acceptance fixture. Never operator-authored catalog.',
      ],
    );

    // Twenty Assets from twelve sources: distinct rows and distinct addresses,
    // repeated bytes. See the note at the top of this file.
    const assetIds = [];
    for (let index = 0; index < MAX_MEDIA; index += 1) {
      assetIds.push(
        await insertAsset(client, {
          kind: 'CATALOG_MEDIA',
          storagePrefix: STORAGE_PREFIX,
          renditions: pool[index % pool.length],
          objects,
        }),
      );
    }

    const one = await insertProduct(client, {
      categoryId,
      slug: M01S1_ONE_SLUG,
      name: 'Nón thử nghiệm M01.S1 — một ảnh',
      displayOrder: 0,
    });
    await linkMedia(client, one, assetIds.slice(0, 1));

    const eight = await insertProduct(client, {
      categoryId,
      slug: M01S1_EIGHT_SLUG,
      name: 'Áo thun thử nghiệm M01.S1 — 8 ảnh',
      displayOrder: 1,
    });
    await linkMedia(client, eight, assetIds.slice(0, 8));

    const twenty = await insertProduct(client, {
      categoryId,
      slug: M01S1_TWENTY_SLUG,
      name: 'Túi vải thử nghiệm M01.S1 — 20 ảnh',
      displayOrder: 2,
    });
    await linkMedia(client, twenty, assetIds);

    await client.query('commit');

    result = {
      categorySlug: M01S1_CATEGORY_SLUG,
      oneSlug: M01S1_ONE_SLUG,
      eightSlug: M01S1_EIGHT_SLUG,
      twentySlug: M01S1_TWENTY_SLUG,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }

  // Storage last: a failed transaction must not leave orphan objects behind.
  for (const object of objects) {
    await putObject(object);
  }

  log(
    `seeded APP12-M01.S1 gallery fixture into ${databaseName} ` +
      `(${String(MAX_MEDIA)} assets, ${String(objects.length)} derivative objects)`,
  );
  return result;
}
