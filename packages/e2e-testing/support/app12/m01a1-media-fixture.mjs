/**
 * The `APP12-M01.A1` Admin product-media fixture.
 *
 * ## Where this may run, and where it may never run
 *
 * Only against the **disposable** database `startEnvironment` provisions and
 * drops. `VALIDATION_GOVERNANCE.md` §3A.4 and the `APP12-G03` reservation both
 * require it: these are catalog rows, and once written they would be
 * indistinguishable from a Product an operator authored. `assertDisposable`
 * refuses anything not named `embroidery_db7_*`, so the rule is enforced rather
 * than remembered, and nothing is cleaned up row by row — the whole database is
 * dropped with the run, which is the only cleanup that cannot leave debris.
 *
 * ## Why the media is real
 *
 * `APP12-M01.A1` §22 asks for "real processed media", and the grid is precisely
 * the surface where a placeholder would hide the finding: twenty tiles of a
 * neutral block prove nothing about whether twenty photographs are legible at
 * 157 px. So every Asset here carries two **real WebP derivatives** — the
 * `THUMBNAIL` the Admin preview route serves and the `CATALOG_PREVIEW` the
 * publication gate requires — written to this run's object storage with honest
 * intrinsic dimensions. The rendition generator is `h06-seo-media.mjs`, reused
 * rather than copied: what an image needs in order to be *deliverable* is the
 * SEO matrix's question too, and two answers to it would drift.
 *
 * ## The dataset
 *
 * ```text
 * m01a1-draft-0      DRAFT      0 images    the approved empty state at 390
 * m01a1-draft-8      DRAFT      8 images    the ordinary curation journey
 * m01a1-draft-20     DRAFT     20 images    the cap: 20/20, add disabled
 * m01a1-pub-3        PUBLISHED  3 images    the media-only write, and the conflict
 * m01a1-pub-1        PUBLISHED  1 image     the published minimum: remove refused
 * m01a1-pub-race     PUBLISHED  2 images    one Asset is made unavailable mid-session
 * ```
 *
 * Assets are deliberately **shared** between the two drafts — one Asset may
 * belong to many Products, and generating forty photographs to prove an
 * ordering rule would be waste. The two Assets journey E interferes with belong
 * to `m01a1-pub-race` and to nothing else, so making one unavailable cannot
 * change what another journey sees.
 *
 * Every business key carries the `app12-m01a1-e2e` prefix, so a row that somehow
 * outlived its database is recognisable as harness debris.
 */
import { randomUUID } from 'node:crypto';

import pg from 'pg';

import { generateRenditions, insertAsset } from './h06-seo-media.mjs';

const { Client } = pg;

export const M01A1_PREFIX = 'app12-m01a1-e2e';
const STORAGE_PREFIX = `${M01A1_PREFIX}/catalog`;

export const M01A1_CATEGORY_SLUG = `${M01A1_PREFIX}-do-thu-nghiem`;
export const M01A1_DRAFT_0_SLUG = `${M01A1_PREFIX}-draft-0`;
export const M01A1_DRAFT_8_SLUG = `${M01A1_PREFIX}-draft-8`;
export const M01A1_DRAFT_20_SLUG = `${M01A1_PREFIX}-draft-20`;
export const M01A1_PUBLISHED_SLUG = `${M01A1_PREFIX}-pub-3`;
export const M01A1_PUBLISHED_SINGLE_SLUG = `${M01A1_PREFIX}-pub-1`;
export const M01A1_PUBLISHED_RACE_SLUG = `${M01A1_PREFIX}-pub-race`;

const BASE_PRICE = '480000';

/** The shared pool the two DRAFT products draw from, plus the dedicated ones. */
const POOL_SIZE = 20;
const PUBLISHED_COUNT = 3;
const SINGLE_COUNT = 1;
const RACE_COUNT = 2;
/** Unattached Assets, so the picker has something to offer and something to refuse. */
const FREE_COUNT = 4;
const TOTAL_ASSETS = POOL_SIZE + PUBLISHED_COUNT + SINGLE_COUNT + RACE_COUNT + FREE_COUNT;

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
      `Refusing to seed the APP12-M01.A1 fixture into "${name}": only a disposable database ` +
        '(embroidery_db7_*) may receive it. See VALIDATION_GOVERNANCE.md §3A.4.',
    );
  }
  return name;
}

async function insertProduct(client, { categoryId, slug, name, status, displayOrder }) {
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
      'Sản phẩm thử nghiệm cho quy trình quản lý ảnh sản phẩm.',
      BASE_PRICE,
      status,
      displayOrder,
    ],
  );
  return productId;
}

/**
 * Links Assets to a Product in array order.
 *
 * Position 0 takes `THUMBNAIL` and the rest `GALLERY`, which is exactly what
 * migration `0039`'s `ck_product_media__primary_role_at_zero` requires — so a
 * fixture that got the invariant wrong would be refused by the database rather
 * than produce a Product the Admin screen renders incorrectly.
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
 * Writes the fixture and returns what the spec asserts against.
 *
 * @param {{
 *   databaseUrl: string,
 *   sharp: unknown,
 *   putObject: (input: { storageKey: string, body: Buffer, contentType: string }) => Promise<void>,
 *   log?: (message: string) => void,
 * }} params
 */
export async function seedM01A1Media({ databaseUrl, sharp, putObject, log = () => {} }) {
  const databaseName = assertDisposable(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  /** Every derivative body this run has to place in storage. */
  const objects = [];
  let result;

  try {
    await client.query('begin');

    const categoryId = randomUUID();
    await client.query(
      `insert into categories (id, name, slug, description, display_order, status, is_indexable)
       values ($1, $2, $3, $4, 940, 'PUBLISHED', true)`,
      [
        categoryId,
        'Đồ thử nghiệm M01.A1',
        M01A1_CATEGORY_SLUG,
        'APP12-M01.A1 disposable acceptance fixture. Never operator-authored catalog.',
      ],
    );

    const assetIds = [];
    for (let seed = 0; seed < TOTAL_ASSETS; seed += 1) {
      const renditions = await generateRenditions({ sharp, seed: seed + 1 });
      assetIds.push(
        await insertAsset(client, {
          kind: 'CATALOG_MEDIA',
          storagePrefix: STORAGE_PREFIX,
          renditions,
          objects,
        }),
      );
    }

    const pool = assetIds.slice(0, POOL_SIZE);
    let cursor = POOL_SIZE;
    const publishedAssets = assetIds.slice(cursor, (cursor += PUBLISHED_COUNT));
    const singleAssets = assetIds.slice(cursor, (cursor += SINGLE_COUNT));
    const raceAssets = assetIds.slice(cursor, (cursor += RACE_COUNT));
    const freeAssets = assetIds.slice(cursor, cursor + FREE_COUNT);

    // No media at all. An empty DRAFT is a legal state — the publication gate,
    // not this screen, is where an empty gallery is refused — and it is the one
    // the approved 390 empty frame (`946:187`) draws.
    const draft0 = await insertProduct(client, {
      categoryId,
      slug: M01A1_DRAFT_0_SLUG,
      name: 'Sổ tay thử nghiệm M01.A1 — chưa có ảnh',
      status: 'DRAFT',
      displayOrder: 0,
    });

    const draft8 = await insertProduct(client, {
      categoryId,
      slug: M01A1_DRAFT_8_SLUG,
      name: 'Áo thun thử nghiệm M01.A1 — 8 ảnh',
      status: 'DRAFT',
      displayOrder: 1,
    });
    await linkMedia(client, draft8, pool.slice(0, 8));

    const draft20 = await insertProduct(client, {
      categoryId,
      slug: M01A1_DRAFT_20_SLUG,
      name: 'Túi vải thử nghiệm M01.A1 — 20 ảnh',
      status: 'DRAFT',
      displayOrder: 2,
    });
    await linkMedia(client, draft20, pool);

    const published = await insertProduct(client, {
      categoryId,
      slug: M01A1_PUBLISHED_SLUG,
      name: 'Khăn tay thử nghiệm M01.A1 — đang xuất bản',
      status: 'PUBLISHED',
      displayOrder: 3,
    });
    await linkMedia(client, published, publishedAssets);

    const single = await insertProduct(client, {
      categoryId,
      slug: M01A1_PUBLISHED_SINGLE_SLUG,
      name: 'Nón thử nghiệm M01.A1 — một ảnh',
      status: 'PUBLISHED',
      displayOrder: 4,
    });
    await linkMedia(client, single, singleAssets);

    const race = await insertProduct(client, {
      categoryId,
      slug: M01A1_PUBLISHED_RACE_SLUG,
      name: 'Ví thử nghiệm M01.A1 — ảnh bị thu hồi',
      status: 'PUBLISHED',
      displayOrder: 5,
    });
    await linkMedia(client, race, raceAssets);

    await client.query('commit');

    result = {
      categorySlug: M01A1_CATEGORY_SLUG,
      draft0: { productId: draft0, slug: M01A1_DRAFT_0_SLUG },
      draft8: { productId: draft8, slug: M01A1_DRAFT_8_SLUG },
      draft20: { productId: draft20, slug: M01A1_DRAFT_20_SLUG },
      published: { productId: published, slug: M01A1_PUBLISHED_SLUG },
      publishedSingle: { productId: single, slug: M01A1_PUBLISHED_SINGLE_SLUG },
      publishedRace: {
        productId: race,
        slug: M01A1_PUBLISHED_RACE_SLUG,
        // The Asset journey E revokes. It belongs to this Product and to no
        // other, so the interference cannot reach another journey.
        revocableAssetId: raceAssets[1],
      },
      freeAssetIds: freeAssets,
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
    `seeded APP12-M01.A1 media fixture into ${databaseName} ` +
      `(${String(TOTAL_ASSETS)} assets, ${String(objects.length)} derivative objects)`,
  );
  return result;
}

/**
 * Makes one Asset unavailable, exactly as a rejection would.
 *
 * Journey E needs the state `PRODUCT_MEDIA_ASSET_UNAVAILABLE` describes: an
 * Asset that was `ACCEPTED` when the operator staged it and is not by the time
 * they save. No application path produces that on demand, so it is written
 * directly — into the disposable database, and into one Asset no other journey
 * reads.
 */
export async function revokeAsset({ databaseUrl, assetId }) {
  assertDisposable(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`update assets set status = 'REJECTED' where id = $1`, [assetId]);
  } finally {
    await client.end();
  }
}
