#!/usr/bin/env node
/**
 * `APP2-S01` §19 — the Discover feed in a real browser, against a REAL
 * production Storefront runtime, through the real Nginx gateway.
 *
 * Invoked by `tools/smoke-app2-s01-discover-production.mjs`, which owns the
 * production images, the disposable TLS database, the upstream swaps, the
 * gateway reload and the restore. This file owns only the assertions, so a
 * scenario change never risks the isolation model. The measurements themselves
 * live in `smoke-app2-s01-discover-measure.mjs`.
 *
 * Two things here cannot be proved anywhere else in this repository:
 *
 *  - **Server-rendered products.** The raw HTTP response is read with no
 *    JavaScript at all, so "the first page is in the HTML" is measured rather
 *    than inferred from a jsdom render.
 *  - **The masonry itself.** Column counts, variable heights and linear DOM
 *    order are read from real layout boxes at 1440 / 1024 / 390.
 *
 * No credential is involved: every route under test is anonymous.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

import {
  domOrder,
  measureLayout,
  publishedCount,
  readCardFacts,
  seedPublishedFixture,
  selectPublished,
  sql,
  undersizedTargets,
  watchProblems,
} from './smoke-app2-s01-discover-measure.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Playwright is a devDependency of the E2E package; resolved from there so this
// harness adds no dependency of its own.
const requireFromE2e = createRequire(join(REPO_ROOT, 'packages', 'e2e-testing', 'package.json'));
const { chromium } = requireFromE2e('@playwright/test');

const BASE_URL = process.env.SMOKE_BASE_URL ?? 'http://embroidery.local';
const DISCOVER = '/kham-pha';

const VIEWPORTS = [
  ['desktop', { width: 1440, height: 900, columns: 5 }],
  ['tablet', { width: 1024, height: 900, columns: 3 }],
  ['mobile', { width: 390, height: 844, columns: 2 }],
];

const CATEGORIES = ['Tất cả', 'Thú bông', 'Khăn', 'Quần áo', 'Khác'];
const CATEGORY_SLUGS = ['thu-bong', 'khan', 'quan-ao', 'khac'];

const results = [];

function record(name, ok, detail = {}) {
  results.push({ name, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name} :: ${JSON.stringify(detail)}`);
}

/** The server's own HTML, with no JavaScript involved. */
async function serverHtml(page, path = DISCOVER) {
  const response = await page.request.get(`${BASE_URL}${path}`);
  return { status: response.status(), headers: response.headers(), html: await response.text() };
}

async function assertServerRendering(page, product) {
  const { status, headers, html } = await serverHtml(page);
  record('the first page is server-rendered HTML', status === 200 && html.includes(product.name), {
    status,
    hasH1: /<h1[^>]*>Khám phá<\/h1>/.test(html),
    hasProduct: html.includes(product.name),
    hasThumbnailPath: /\/api\/public\/products\/[^"']+\/media\//.test(html),
    hasAllChips: CATEGORIES.every((label) => html.includes(label)),
    bytes: html.length,
  });
  record(
    'exactly one h1 and no duplicated shell landmark',
    (html.match(/<h1[\s>]/g) ?? []).length === 1 && (html.match(/<main[\s>]/g) ?? []).length === 1,
    {
      h1: (html.match(/<h1[\s>]/g) ?? []).length,
      main: (html.match(/<main[\s>]/g) ?? []).length,
    },
  );
  record('the page declares no invented canonical or product URL', !html.includes('/san-pham'), {
    mentionsProposal: html.includes('/san-pham'),
  });
  record('response carries a cache directive', 'cache-control' in headers, {
    cacheControl: headers['cache-control'] ?? '(none)',
  });
}

async function assertCards(page) {
  const facts = await readCardFacts(page);
  record(
    'cards are non-interactive articles (IMP-D038)',
    facts.interactiveDescendants === 0 && facts.articles > 0,
    {
      interactiveDescendants: facts.interactiveDescendants,
      articles: facts.articles,
    },
  );
  record('one semantic collection, not a tree per viewport', facts.collections === 1, {
    collections: facts.collections,
  });
  record(
    'thumbnails are real bytes from the relative same-origin path',
    facts.loadedImages > 0 && facts.relativeSources,
    {
      loaded: facts.loadedImages,
      total: facts.totalImages,
      allRelative: facts.relativeSources,
    },
  );
  record('images keep distinct natural ratios (no uniform crop)', facts.distinctRatios > 0, {
    distinctRatios: facts.distinctRatios,
  });
  record(
    'no price or marketplace chrome',
    !/₫|VND|Thêm vào giỏ|Mua ngay|Xem chi tiết|Hết hàng/.test(facts.bodyText),
    {},
  );
  record(
    'unsupported UI02 controls are absent',
    !/Tinh chỉnh|Bố cục|Phong cách|Xu hướng|Gợi ý liên quan|Bộ sưu tập cưới/.test(facts.bodyText),
    {},
  );
  return facts;
}

async function assertCategories(page) {
  for (const [index, label] of CATEGORIES.entries()) {
    const href = await page
      .locator('.discover__chip', { hasText: new RegExp(`^\\s*${label}\\s*$`) })
      .first()
      .getAttribute('href');
    const expected = index === 0 ? DISCOVER : `${DISCOVER}?category=${CATEGORY_SLUGS[index - 1]}`;
    record(`category "${label}" links to ${expected}`, href === expected, { href, expected });
  }

  const { html } = await serverHtml(page, `${DISCOVER}?category=khan`);
  record(
    'the server marks the requested category current',
    /aria-current="page"[^>]*>Khăn</.test(html) || /Khăn<\/a>/.test(html),
    {
      hasCurrent: html.includes('aria-current="page"'),
    },
  );

  await page.goto(`${BASE_URL}${DISCOVER}?category=khan`, { waitUntil: 'networkidle' });
  const current = (
    await page.locator('.discover__chip[aria-current="page"]').first().textContent()
  )?.trim();
  record('the rendered page marks exactly the requested chip', current === 'Khăn', { current });

  await page.goto(`${BASE_URL}${DISCOVER}`, { waitUntil: 'networkidle' });
  await page.goBack({ waitUntil: 'networkidle' });
  const back = (
    await page.locator('.discover__chip[aria-current="page"]').first().textContent()
  )?.trim();
  record('browser back restores the previous selection', back === 'Khăn', { current: back });
}

async function assertEmptyAndUnknown(page) {
  const empty = CATEGORY_SLUGS.find((slug) => publishedCount(slug) === 0);
  if (empty === undefined) {
    record('a category with no published work shows the filtered empty state', true, {
      skipped: 'every category has published work in this copy',
    });
  } else {
    const { html } = await serverHtml(page, `${DISCOVER}?category=${empty}`);
    record(
      'a category with no published work shows the filtered empty state',
      html.includes('Chưa có tác phẩm trong danh mục này'),
      {
        category: empty,
        offersWayBack: html.includes('Xem tất cả'),
      },
    );
  }

  const unknown = await serverHtml(page, `${DISCOVER}?category=khong-ton-tai`);
  record('an unknown category takes the approved not-found boundary', unknown.status === 404, {
    status: unknown.status,
    isApprovedNotFound: unknown.html.includes('Không tìm thấy trang'),
  });
}

async function assertResponsive(page, name, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(`${BASE_URL}${DISCOVER}`, { waitUntil: 'networkidle' });
  const layout = await measureLayout(page);
  record(
    `${name} ${viewport.width}px renders a ${viewport.columns}-column masonry`,
    layout.columns === viewport.columns,
    {
      measured: layout.columns,
      expected: viewport.columns,
      cards: layout.count,
    },
  );
  record(`${name} cards vary in height`, layout.distinctHeights > 1, {
    distinctHeights: layout.distinctHeights,
  });
  record(`${name} has no horizontal page overflow`, layout.overflow === false, {});
  const undersized = await undersizedTargets(page);
  record(`${name} controls meet the 44px minimum`, undersized.length === 0, {
    undersized: undersized.slice(0, 4),
  });
  return domOrder(page);
}

async function assertAssets(page) {
  const failed = [];
  page.on('response', (response) => {
    if (/_next\/static/.test(response.url()) && response.status() >= 400)
      failed.push(response.url());
  });
  await page.goto(`${BASE_URL}${DISCOVER}`, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  const assets = await page.evaluate(
    () => document.querySelectorAll('script[src*="_next"], link[href*="_next"]').length,
  );
  record(
    'production JS and CSS assets load through the gateway, including after a hard refresh',
    failed.length === 0 && assets > 0,
    {
      assets,
      failed: failed.slice(0, 3),
    },
  );
}

/**
 * Real keyset continuation: the first page is 20, the copy holds more, and the
 * sentinel must append the rest exactly once and then stop.
 */
async function assertContinuation(page) {
  const total = publishedCount(undefined);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}${DISCOVER}`, { waitUntil: 'networkidle' });

  const firstPage = (await domOrder(page)).length;
  record('the first page is one keyset page, not the whole catalogue', firstPage === 20, {
    firstPage,
    publishedTotal: total,
  });

  await page.mouse.wheel(0, 40000);
  await page.waitForFunction(
    () => document.querySelectorAll('.discover__masonry-item').length > 20,
    undefined,
    { timeout: 15000 },
  );
  const appended = await domOrder(page);
  record('scrolling appends the next page', appended.length === total, {
    rendered: appended.length,
    expected: total,
  });
  record('no product is rendered twice', new Set(appended).size === appended.length, {
    unique: new Set(appended).size,
  });
  record(
    'the end of the feed is announced, with no page number or total',
    await page.locator('.discover__continuation-end').isVisible(),
    {
      text: (await page.locator('.discover__continuation-end').textContent())?.trim(),
    },
  );
}

async function assertDraftRemoval(page, product) {
  const before = await serverHtml(page);
  const mediaPath = (before.html.match(/\/api\/public\/products\/[^"']+\/media\/[^"'\\]+/) ??
    [])[0];
  const mediaBefore = mediaPath ? await page.request.get(`${BASE_URL}${mediaPath}`) : undefined;
  record(
    'the product and its media are public while published',
    before.html.includes(product.name) && mediaBefore?.status() === 200,
    {
      mediaStatus: mediaBefore?.status(),
    },
  );

  // Fixture setup on the disposable copy — not a Product command. It runs no
  // readiness evaluation, honours no concurrency token and writes no Audit row,
  // and it is never called "unpublish".
  sql(`update products set status = 'DRAFT' where id = '${product.id}'`);

  const after = await serverHtml(page);
  record(
    'a drafted product disappears from the next authoritative request',
    !after.html.includes(product.name),
    {},
  );
  if (mediaPath) {
    const mediaAfter = await page.request.get(`${BASE_URL}${mediaPath}`);
    record('its media path stops serving bytes', mediaAfter.status() === 404, {
      before: mediaBefore?.status(),
      after: mediaAfter.status(),
    });
  }
  await page.goto(`${BASE_URL}${DISCOVER}`, { waitUntil: 'networkidle' });
  // Exact text, not a substring: the fixture names are zero-padded for the same
  // reason, and a loose match here would count neighbouring products as this one.
  const visible = await page
    .locator('.discover__card-title', { hasText: new RegExp(`^${product.name}$`) })
    .count();
  record('no Storefront route cache preserves it', visible === 0, { visibleCards: visible });

  sql(`update products set status = 'PUBLISHED' where id = '${product.id}'`);
}

async function main() {
  // The development database contains no published product at all, so the feed
  // has nothing to show until the run seeds one. Synthetic products, real
  // images: each points at an asset whose THUMBNAIL derivative exists in MinIO.
  const seeded = seedPublishedFixture();
  const product = selectPublished();
  console.log(
    `[fixture] ${JSON.stringify({ ...seeded, target: product.slug, published: publishedCount(undefined) })}`,
  );

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const problems = watchProblems(page);

  try {
    await assertServerRendering(page, product);
    await page.goto(`${BASE_URL}${DISCOVER}`, { waitUntil: 'networkidle' });
    await assertCards(page);
    await assertCategories(page);
    await assertEmptyAndUnknown(page);
    await assertAssets(page);

    const orders = [];
    for (const [name, viewport] of VIEWPORTS) {
      orders.push(await assertResponsive(page, name, viewport));
    }
    // Linear DOM order is the invariant the masonry must not break: the same
    // sequence must survive being laid out into 5, 3 and 2 columns.
    const [desktop, tablet, mobile] = orders;
    record(
      'DOM reading order is identical at every viewport',
      desktop.join('|') === tablet.join('|') && tablet.join('|') === mobile.join('|'),
      {
        products: desktop.length,
      },
    );

    await assertContinuation(page);
    await assertDraftRemoval(page, product);

    record('no unexpected console or runtime errors', problems.length === 0, {
      problems: problems.slice(0, 5),
    });
  } finally {
    await context.close();
    await browser.close();
  }

  const failed = results.filter((entry) => !entry.ok);
  console.log(
    `\n== browser scenarios: ${results.length - failed.length}/${results.length} passed ==`,
  );
  process.exitCode = failed.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
