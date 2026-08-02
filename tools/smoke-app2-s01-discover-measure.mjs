#!/usr/bin/env node
/**
 * `APP2-S01` §19 — what the browser is asked to measure, separated from what the
 * run asserts about it.
 *
 * Everything here reads the page as laid out: real boxes, real DOM order, real
 * loaded images. Nothing infers a property from the stylesheet that produced it,
 * because the whole point of a browser run is that CSS multi-column either
 * yields five columns at 1440 or it does not.
 *
 * Also holds the fixture selection, which reads the run's disposable database
 * copy — never the developer's.
 */
import { execFileSync } from 'node:child_process';

import {
  PROD_DB_CONTAINER,
  PROD_DB_NAME,
  PROD_DB_USER,
} from './smoke-app2-t01-production-topology.mjs';

/** Every SQL statement in this harness targets the run's disposable copy only. */
export function sql(statement) {
  return execFileSync(
    'docker',
    [
      'exec',
      PROD_DB_CONTAINER,
      'psql',
      '-U',
      PROD_DB_USER,
      '-d',
      PROD_DB_NAME,
      '-tAF|',
      '-c',
      statement,
    ],
    { encoding: 'utf8' },
  ).trim();
}

/** The categories the fixture publishes into. `khac` is deliberately left empty. */
export const FIXTURE_CATEGORIES = ['thu-bong', 'khan', 'quan-ao'];
/** One page is 20; 24 guarantees a second page and therefore real continuation. */
export const FIXTURE_PRODUCT_COUNT = 24;
/** Every fourth product is seeded without media, to exercise the placeholder. */
const WITHOUT_MEDIA_EVERY = 4;

/**
 * Assets that really have a `READY` `THUMBNAIL` derivative in MinIO — the only
 * ones whose bytes the delivery route will actually serve.
 */
function deliverableAssets() {
  const rows = sql(`
    select distinct a.id
    from assets a
    join asset_derivatives d on d.asset_id = a.id
    where a.status = 'ACCEPTED' and d.kind = 'THUMBNAIL' and d.status = 'READY'
      and d.is_watermarked = false
    order by a.id`);
  return rows === '' ? [] : rows.split('\n').map((line) => line.trim());
}

/**
 * Seeds synthetic published products into the run's **disposable** copy.
 *
 * This is fixture setup, not a Product command: it runs no readiness
 * evaluation, honours no concurrency token and writes no Audit or Outbox row,
 * and nothing in this harness calls it publish. It exists because the
 * development database contains no published product at all — every product
 * there is `DRAFT` or `ARCHIVED` — so without it there would be nothing for a
 * public feed to show.
 *
 * The products are synthetic; the **images are not**. Each seeded product
 * points at an asset whose `THUMBNAIL` derivative really exists in MinIO, so
 * the browser fetches real WebP bytes through the real delivery route.
 */
export function seedPublishedFixture() {
  const assets = deliverableAssets();
  if (assets.length === 0) {
    throw new Error('The disposable copy has no ACCEPTED asset with a READY THUMBNAIL derivative.');
  }

  const values = [];
  const media = [];
  for (let index = 0; index < FIXTURE_PRODUCT_COUNT; index += 1) {
    const id = `019b0000-0000-7000-8000-${String(index + 1).padStart(12, '0')}`;
    const category = FIXTURE_CATEGORIES[index % FIXTURE_CATEGORIES.length];
    // Duplicate display_order values on purpose: the keyset tie-breaker is `id`,
    // and a fixture where every order is unique would never exercise it.
    const order = Math.floor(index / 2) + 1;
    // Zero-padded so no product name is a PREFIX of another: an unpadded "…1"
    // would substring-match "…10"–"…19" and quietly turn a visibility check
    // into a false positive.
    const label = String(index + 1).padStart(2, '0');
    values.push(
      `('${id}', (select id from categories where slug = '${category}'), 'Tác phẩm thử ${label}', 'smoke-s01-${label}', ${450000 + index * 1000}, 'VND', 'PUBLISHED', false, ${order}, false, now(), now())`,
    );
    if (index % WITHOUT_MEDIA_EVERY !== WITHOUT_MEDIA_EVERY - 1) {
      const assetId = assets[index % assets.length];
      const mediaId = `019b0001-0000-7000-8000-${String(index + 1).padStart(12, '0')}`;
      media.push(`('${mediaId}', '${id}', '${assetId}', 'THUMBNAIL', 1, now(), now())`);
    }
  }

  sql(`insert into products (id, category_id, name, slug, base_price_amount, currency_code,
        status, is_display_out_of_stock, display_order, is_indexable, created_at, updated_at)
       values ${values.join(', ')}
       on conflict (id) do nothing`);
  sql(`insert into product_media (id, product_id, asset_id, role, display_order, created_at, updated_at)
       values ${media.join(', ')}
       on conflict (id) do nothing`);

  return { products: FIXTURE_PRODUCT_COUNT, withMedia: media.length, assets: assets.length };
}

/** The first seeded product that really has a deliverable THUMBNAIL. */
export function selectPublished() {
  const row = sql(`
    select p.id, p.slug, p.name
    from products p
    join product_media pm on pm.product_id = p.id and pm.role = 'THUMBNAIL'
    join assets a on a.id = pm.asset_id and a.status = 'ACCEPTED'
    join categories c on c.id = p.category_id and c.status = 'PUBLISHED'
    where p.status = 'PUBLISHED'
      and exists (select 1 from asset_derivatives d
                  where d.asset_id = a.id and d.status = 'READY' and d.kind = 'THUMBNAIL')
    order by p.display_order, p.id limit 1`);
  if (row === '') throw new Error('No published product with a deliverable THUMBNAIL in the copy.');
  const [id, slug, name] = row.split('|');
  return { id, slug, name };
}

/** How many published products the copy can show for a category (or all). */
export function publishedCount(categorySlug) {
  const filter = categorySlug === undefined ? '' : ` and c.slug = '${categorySlug}'`;
  return Number(
    sql(`select count(*) from products p
         join categories c on c.id = p.category_id and c.status = 'PUBLISHED'
         where p.status = 'PUBLISHED'${filter}`),
  );
}

/**
 * Column count from real layout boxes: the distinct rounded left edges of the
 * cards. This reads what the browser laid out, not what the stylesheet asked
 * for — the only measurement that can actually fail if the masonry breaks.
 */
export async function measureLayout(page) {
  return page.evaluate(() => {
    const items = [...document.querySelectorAll('.discover__masonry-item')];
    const boxes = items.map((item) => item.getBoundingClientRect());
    const lefts = new Set(boxes.map((box) => Math.round(box.left)));
    const heights = boxes.map((box) => Math.round(box.height));
    return {
      count: items.length,
      columns: lefts.size,
      distinctHeights: new Set(heights).size,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
}

/** DOM order of the rendered product names, independent of visual placement. */
export async function domOrder(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.discover__masonry-item .discover__card-title')].map(
      (node) => node.textContent ?? '',
    ),
  );
}

/** Controls smaller than the locked minimum touch target. */
export async function undersizedTargets(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.discover__chip, .discover__action')]
      .map((node) => ({
        text: (node.textContent ?? '').trim(),
        height: Math.round(node.getBoundingClientRect().height),
      }))
      .filter((entry) => entry.height < 44),
  );
}

/** Everything the card tree asserts about itself, read in one pass. */
export async function readCardFacts(page) {
  return page.evaluate(() => {
    const images = [...document.querySelectorAll('.discover__card-image')];
    return {
      cards: document.querySelectorAll('.discover__card').length,
      interactiveDescendants: document.querySelectorAll(
        '.discover__masonry a, .discover__masonry button, .discover__masonry [role="button"]',
      ).length,
      articles: document.querySelectorAll('.discover__masonry article').length,
      collections: document.querySelectorAll('.discover__masonry').length,
      headings: document.querySelectorAll('h1').length,
      landmarks: document.querySelectorAll('main').length,
      relativeSources: images.every((image) =>
        (image.getAttribute('src') ?? '').startsWith('/api/'),
      ),
      loadedImages: images.filter((image) => image.naturalWidth > 0).length,
      totalImages: images.length,
      distinctRatios: new Set(
        images
          .filter((image) => image.naturalWidth > 0)
          .map((image) => Math.round((image.naturalWidth / image.naturalHeight) * 100)),
      ).size,
      bodyText: document.body.innerText,
    };
  });
}

/** Console errors and uncaught page errors, collected for the whole visit. */
export function watchProblems(page) {
  const problems = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}
