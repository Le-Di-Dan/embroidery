#!/usr/bin/env node
/**
 * `APP2-S02` §25 — the per-viewport interaction scenarios, separated from the
 * run's fixtures and its 404/visibility matrix.
 *
 * Everything here drives the real page: real clicks, real keyboard, real focus,
 * real image loads through the publication-gated route. Nothing infers a
 * behaviour from the source that produced it.
 */
import { execFileSync } from 'node:child_process';

import { API_CONTAINER } from './smoke-app2-t01-production-topology.mjs';

/**
 * How many detail requests the API has completed.
 *
 * Read from the production API container's own structured log. This is the only
 * place the request-scoped memo can be observed: `next/jest` resolves React's
 * client build, so a `cache()`d loader called from Jest runs every time and a
 * "one call" assertion there would prove nothing about the real runtime.
 *
 * The log records the **route pattern**, not the resolved path, so this counts
 * `/api/public/products/:slug` completions rather than one Product's. Taken as a
 * delta around a single page view in an isolated stack with no other traffic,
 * that is the same number — and it deliberately excludes the media route, which
 * shares the prefix.
 */
const DETAIL_ROUTE_RECORD = '"route":"/api/public/products/:slug"';

export function apiRequestCount() {
  const logs = execFileSync('docker', ['logs', API_CONTAINER], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return logs.split(DETAIL_ROUTE_RECORD).length - 1;
}

async function open(page, baseUrl, slug) {
  await page.goto(`${baseUrl}/san-pham/${slug}`, { waitUntil: 'networkidle' });
}

/** The gallery, the lightbox, share, the media states and the card handoff. */
export async function runDetailScenarios({ page, label, baseUrl, record, fixtures, mediaPaths }) {
  const { rich, single, noMedia, bare } = fixtures;

  // ---- multiple ordered media, selection and keyboard ----------------------
  await open(page, baseUrl, rich.slug);

  const firstSrc = await page.getAttribute('.product-detail__stage-image', 'src');
  record(`${label}: the first media item is shown, in server order`, firstSrc === mediaPaths[0], {
    src: firstSrc,
  });

  const loaded = await page.evaluate(() => {
    const image = document.querySelector('.product-detail__stage-image');
    return image === null ? 0 : image.naturalWidth;
  });
  record(`${label}: the artwork is real bytes through the gated route`, loaded > 0, {
    naturalWidth: loaded,
  });

  const thumbs = page.locator('.product-detail__thumbnail');
  record(`${label}: one thumbnail control per media item`, (await thumbs.count()) === 2, {
    count: await thumbs.count(),
  });

  await thumbs.nth(1).click();
  const secondPick = await page.getAttribute('.product-detail__stage-image', 'src');
  record(`${label}: clicking a thumbnail selects that media item`, secondPick === mediaPaths[1], {
    src: secondPick,
  });
  record(
    `${label}: the selected thumbnail is exposed by ARIA, not colour alone`,
    (await thumbs.nth(1).getAttribute('aria-current')) === 'true',
    {},
  );

  await page.keyboard.press('ArrowLeft');
  const afterLeft = await page.getAttribute('.product-detail__stage-image', 'src');
  record(`${label}: ArrowLeft moves the selection`, afterLeft === mediaPaths[0], {
    src: afterLeft,
  });

  await page.keyboard.press('Home');
  record(
    `${label}: Home returns to the first image`,
    (await page.getAttribute('.product-detail__stage-image', 'src')) === mediaPaths[0],
    {},
  );

  // ---- lightbox -------------------------------------------------------------
  await page.locator('.product-detail__stage-trigger').click();
  const dialog = page.locator('[role="dialog"]');
  record(`${label}: the stage opens a real modal dialog`, (await dialog.count()) === 1, {});
  record(
    `${label}: focus moved into the dialog`,
    await page.evaluate(() => {
      const element = document.querySelector('[role="dialog"]');
      return element !== null && element.contains(document.activeElement);
    }),
    {},
  );
  record(
    `${label}: the position is exposed as text`,
    (await page.locator('.product-detail__dialog-position').innerText()).includes('Ảnh 1 trên 2'),
    {},
  );

  await page.keyboard.press('ArrowRight');
  record(
    `${label}: ArrowRight advances inside the dialog`,
    (await page.locator('.product-detail__dialog-position').innerText()).includes('Ảnh 2 trên 2'),
    {},
  );

  await page.keyboard.press('Escape');
  record(`${label}: Escape closes the dialog`, (await dialog.count()) === 0, {});
  record(
    `${label}: focus returned to the control that opened it`,
    await page.evaluate(
      () => document.activeElement?.classList.contains('product-detail__stage-trigger') === true,
    ),
    {},
  );

  // ---- individual media failure --------------------------------------------
  // A genuine browser-level load failure: the request for the selected image is
  // aborted, exactly as a dropped connection would. Nothing is corrupted in
  // storage, and the JSON contract still advertises the address.
  // Matched by pathname predicate, not by a bare path string: Playwright treats
  // a string matcher as a GLOB against the whole URL, so `/api/...` silently
  // matches nothing and the abort never happens — which is exactly how this
  // scenario first passed for the wrong reason.
  const failingPath = mediaPaths[0] ?? '/none';
  await page.route(
    (url) => url.pathname === failingPath,
    (route) => route.abort(),
  );
  await open(page, baseUrl, rich.slug);
  const errorText = await page
    .locator('.product-detail__stage-message')
    .first()
    .innerText({ timeout: 15_000 });
  record(
    `${label}: a failed image says so and keeps the rest usable`,
    errorText.includes('Không tải được ảnh này') &&
      (await page.locator('.product-detail__title').isVisible()) &&
      (await page.locator('.product-detail__story-body').isVisible()) &&
      (await page.locator('.product-detail__thumbnail').count()) === 2,
    { message: errorText.slice(0, 48) },
  );
  await page.unroute((url) => url.pathname === failingPath);

  // ---- one image -------------------------------------------------------------
  await open(page, baseUrl, single.slug);
  record(
    `${label}: a single image shows no thumbnail strip`,
    (await page.locator('.product-detail__thumbnail').count()) === 0,
    {},
  );
  await page.locator('.product-detail__stage-trigger').click();
  record(
    `${label}: a single image offers no previous/next in the dialog`,
    (await page.locator('.product-detail__dialog-control').count()) === 1,
    { controls: await page.locator('.product-detail__dialog-control').count() },
  );
  await page.keyboard.press('Escape');

  // ---- media empty ------------------------------------------------------------
  await open(page, baseUrl, noMedia.slug);
  record(
    `${label}: no media states it plainly and offers no zoom affordance`,
    (await page.locator('.product-detail__stage--empty').count()) === 1 &&
      (await page.locator('.product-detail__stage-trigger').count()) === 0 &&
      (await page.locator('.product-detail__zoom-hint').count()) === 0,
    {},
  );

  // ---- description absent -----------------------------------------------------
  await open(page, baseUrl, bare.slug);
  record(
    `${label}: an absent description omits the whole story section`,
    (await page.locator('.product-detail__story').count()) === 0 &&
      (await page.locator('.product-detail__title').isVisible()),
    {},
  );

  // ---- share ------------------------------------------------------------------
  await open(page, baseUrl, rich.slug);
  const shared = await page.evaluate(async () => {
    const captured = [];
    Object.defineProperty(navigator, 'share', {
      value: (data) => {
        captured.push(data);
        return Promise.resolve();
      },
      configurable: true,
    });
    document
      .querySelector('.product-detail__share-button')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    return captured[0] ?? null;
  });
  record(
    `${label}: share offers the canonical URL through Web Share`,
    shared !== null && String(shared.url).endsWith(`/san-pham/${rich.slug}`),
    { url: shared?.url },
  );
  record(
    `${label}: the share result is announced politely`,
    (await page.locator('.product-detail__share-status').innerText()).includes('Đã chia sẻ'),
    {},
  );

  // ---- Discover continuation and the S01 card handoff --------------------------
  await page.locator('.product-detail__continue-link').first().click();
  await page.waitForURL('**/kham-pha');
  record(
    `${label}: "Khám phá tất cả" reaches the Discover feed`,
    page.url().endsWith('/kham-pha'),
    {
      url: page.url(),
    },
  );

  const cardHref = await page.locator('.discover__card').first().getAttribute('href');
  record(
    `${label}: a Discover card links to the detail route`,
    /^\/san-pham\//.test(cardHref ?? ''),
    {
      href: cardHref,
    },
  );
  await page.locator('.discover__card').first().click();
  await page.waitForURL('**/san-pham/**');
  await page.locator('.product-detail__title').waitFor({ timeout: 15_000 });
  record(
    `${label}: activating a card navigates to the real detail page`,
    (await page.locator('.product-detail__title').count()) === 1,
    { url: page.url() },
  );
}
