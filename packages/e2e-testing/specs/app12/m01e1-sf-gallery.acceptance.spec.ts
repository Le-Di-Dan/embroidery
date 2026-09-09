/**
 * `APP12-M01.E1` §14, §15, §18, §19 — the visitor's gallery on the final world.
 *
 * ```text
 * §14  1 / 8 / 20 images at 1440, 1024 and 390
 * §15  the selection and lightbox journey, at twenty images
 * §18  the rendition policy on a cold twenty-image load
 * §19  LCP / CLS / INP / TTFB, with a real interaction
 * ```
 *
 * Everything here is a fact about layout, network or timing, which is why it is
 * proved in a browser: jsdom has no layout engine, no network and no paint.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  COPY,
  SLUGS,
  counter,
  counterText,
  currentThumbnails,
  decoded,
  documentTop,
  gallery,
  horizontalOverflow,
  mainAlt,
  positionLabel,
  resize,
  stageImage,
  strip,
  stripBounds,
  stripRows,
  tallyRenditions,
  thumbnails,
} from './support/m01s1-world';
import { capture, expectAxeClean, openGallery, selectStripImage } from './support/m01e1-world';

test.describe.configure({ mode: 'serial' });

const TWENTY_NAME = 'Túi vải thử nghiệm M01.S1 — 20 ảnh';
const ONE_NAME = 'Nón thử nghiệm M01.S1 — một ảnh';

/** Every image address the page requested, in request order. */
function recordImageRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'image') seen.push(request.url());
  });
  return seen;
}

test('§14 — one image, and no navigation chrome invented around it', async ({ page }) => {
  await resize(page, 'desktop');
  await openGallery(page, SLUGS.one());

  await expect(stageImage(page)).toHaveAttribute('alt', mainAlt(ONE_NAME, 1, 1));
  await expect(counter(page), 'no counter at a total of one').toHaveCount(0);
  await expect(strip(page), 'no strip at a total of one').toHaveCount(0);
  await expect(gallery(page)).toContainText(COPY.zoomHint);
  expect(await horizontalOverflow(page)).toBe(0);

  // The large view still works, and states no position it cannot navigate to.
  await page.getByRole('button', { name: /^Mở ảnh 1 /u }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: COPY.lightboxNext })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: COPY.lightboxPrevious })).toHaveCount(0);
  await dialog.getByRole('button', { name: COPY.lightboxClose }).click();

  await capture(page, 'desktop', 'sf-one-image');
});

test('§14 — eight and twenty images, at 1440, 1024 and 390', async ({ page }) => {
  // 1440 / 8. `M01.D1` measured this state as fitting exactly, so it is the one
  // that would expose a strip that had begun to wrap.
  await resize(page, 'desktop');
  await openGallery(page, SLUGS.eight());
  await expect(thumbnails(page)).toHaveCount(8);
  await expect(counter(page)).toContainText(counterText(1, 8));
  expect(await stripRows(page), 'the 8-image strip is one row').toBe(1);
  expect(await horizontalOverflow(page)).toBe(0);
  await capture(page, 'desktop', 'sf-eight-images');

  // The purchase decision must not have been pushed down by the gallery: the
  // counter is an overlay and the strip is one row, so the price must not move
  // between eight images and twenty.
  const eightPriceTop = await documentTop(page.locator('.ready-made-purchase__price').first());

  for (const [viewport, label, bound] of [
    ['desktop', '1440', 1440],
    ['tablet', '1024', 1024],
    ['mobile', '390', 390],
  ] as const) {
    await resize(page, viewport);
    await openGallery(page, SLUGS.twenty());

    // §14's core claims, at every viewport.
    await expect(thumbnails(page)).toHaveCount(20);
    await expect(currentThumbnails(page), `${label}: exactly one aria-current`).toHaveCount(1);
    await expect(thumbnails(page).first()).toHaveAttribute('aria-current', 'true');
    await expect(stageImage(page), `${label}: the stage opens on media[0]`).toHaveAttribute(
      'alt',
      mainAlt(TWENTY_NAME, 1, 20),
    );
    await expect(counter(page)).toContainText(counterText(1, 20));
    await expect(counter(page)).toContainText(positionLabel(1, 20));

    // The stage is CATALOG_PREVIEW and the strip is THUMBNAIL, read from the
    // intrinsic dimensions the derivatives actually carry.
    await expect(stageImage(page)).toHaveAttribute('width', '1600');
    await expect(strip(page).locator('img').first()).toHaveAttribute('width', '800');

    expect(await stripRows(page), `${label}: one horizontal row, never a wall`).toBe(1);
    expect(await horizontalOverflow(page), `${label}: no document overflow`).toBe(0);
    const bounds = await stripBounds(page);
    expect(
      bounds.clientWidth,
      `${label}: the strip is bounded by the viewport`,
    ).toBeLessThanOrEqual(bound);
    expect(bounds.scrollable, `${label}: twenty thumbnails scroll rather than widen the page`).toBe(
      true,
    );
    const box = await thumbnails(page).first().boundingBox();
    expect(box?.height ?? 0, `${label}: touchable thumbnail`).toBeGreaterThanOrEqual(44);

    await capture(page, viewport, 'sf-twenty-images');
  }

  // V02 compatibility: back at 1440, the price sits where eight images left it.
  await resize(page, 'desktop');
  await openGallery(page, SLUGS.twenty());
  const twentyPriceTop = await documentTop(page.locator('.ready-made-purchase__price').first());
  expect(
    Math.abs(twentyPriceTop - eightPriceTop),
    'the purchase hierarchy is unchanged by twenty images',
  ).toBeLessThanOrEqual(2);
});

test('§15 — selecting, enlarging and closing leaves the page where the visitor left it', async ({
  page,
}) => {
  await resize(page, 'desktop');
  await openGallery(page, SLUGS.twenty());
  await expect(counter(page)).toContainText(counterText(1, 20));

  // Image 7.
  await selectStripImage(page, 7, 20);
  await expect(stageImage(page)).toHaveAttribute('alt', mainAlt(TWENTY_NAME, 7, 20));
  await expect(currentThumbnails(page)).toHaveCount(1);
  await expect(thumbnails(page).nth(6)).toHaveAttribute('aria-current', 'true');
  await capture(page, 'desktop', 'sf-image-7-selected');

  // The selected state is not colour alone: `aria-current` above, plus an
  // opacity step and an accent marker that survive greyscale.
  const selected = await thumbnails(page)
    .nth(6)
    .evaluate((node) => getComputedStyle(node as HTMLElement).opacity);
  const other = await thumbnails(page)
    .nth(2)
    .evaluate((node) => getComputedStyle(node as HTMLElement).opacity);
  expect(Number(selected)).toBeGreaterThan(Number(other));

  // The lightbox opens on what is selected, not on the primary. That is the
  // defect this package exists to prevent: two gallery state machines that
  // disagree about what the visitor is looking at.
  await page.getByRole('button', { name: /^Mở ảnh 7 /u }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(positionLabel(7, 20));
  await expect(dialog.locator('img')).toHaveAttribute('alt', mainAlt(TWENTY_NAME, 7, 20));

  // Ordered navigation, in the Product's media order.
  await dialog.getByRole('button', { name: COPY.lightboxNext }).click();
  await expect(dialog).toContainText(positionLabel(8, 20));
  await dialog.getByRole('button', { name: COPY.lightboxPrevious }).click();
  await expect(dialog).toContainText(positionLabel(7, 20));

  // Escape closes, and the page is still at image 7.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(counter(page)).toContainText(counterText(7, 20));
  await expect(currentThumbnails(page)).toHaveCount(1);
  await expect(thumbnails(page).nth(6)).toHaveAttribute('aria-current', 'true');
  const returned = await page.evaluate(
    () => document.activeElement?.className.includes('product-detail__stage-trigger') ?? false,
  );
  expect(returned, 'focus returned to the opener').toBe(true);

  // No stage arrows: the frame holds exactly one control — the trigger that
  // opens the large view — and the page carries no previous/next control of its
  // own outside the dialog.
  await expect(page.locator('.product-detail__stage-frame').getByRole('button')).toHaveCount(1);
  await expect(gallery(page).getByRole('button', { name: COPY.lightboxNext })).toHaveCount(0);
  await expect(gallery(page).getByRole('button', { name: COPY.lightboxPrevious })).toHaveCount(0);

  // The roving strip: one Tab stop, arrows within it, End at the last.
  await thumbnails(page).nth(6).focus();
  await page.keyboard.press('ArrowRight');
  await expect(counter(page)).toContainText(counterText(8, 20));
  await page.keyboard.press('End');
  await expect(counter(page)).toContainText(counterText(20, 20));
  await expect(currentThumbnails(page)).toHaveCount(1);
});

test('§18 — a cold twenty-image load fetches one preview and no third rendition', async ({
  page,
}) => {
  const requests = recordImageRequests(page);
  await resize(page, 'desktop');
  await openGallery(page, SLUGS.twenty());
  await page.waitForLoadState('networkidle');

  const tally = tallyRenditions(requests);
  expect(
    tally.catalogPreview.length,
    `initial catalog-preview requests: ${tally.catalogPreview.join()}`,
  ).toBe(1);
  // Not twenty: the strip is lazy and scrolls horizontally, so the browser
  // fetches only the thumbnails it laid out inside the viewport. What matters is
  // that every image it did ask for is a THUMBNAIL and that no third rendition
  // appeared from anywhere.
  expect(tally.thumbnail.length).toBeGreaterThan(1);
  expect(tally.thumbnail.length).toBeLessThanOrEqual(20);
  expect(tally.other, `unexpected renditions: ${tally.other.join()}`).toHaveLength(0);

  // Every representative request is a real image: 200, an image content type,
  // and pixels rather than markup.
  for (const url of [tally.catalogPreview[0] as string, tally.thumbnail[0] as string]) {
    const response = await page.request.get(url);
    expect(response.status(), url).toBe(200);
    expect(response.headers()['content-type'], url).toMatch(/^image\//);
  }
  const stage = await decoded(stageImage(page));
  expect(stage.width, 'the stage decoded to real pixels').toBeGreaterThan(0);
  expect(stage.height).toBeGreaterThan(0);
  const thumb = await decoded(strip(page).locator('img').first());
  expect(thumb.width, 'the first thumbnail decoded to real pixels').toBeGreaterThan(0);
  expect(thumb.height).toBeGreaterThan(0);

  // Selecting three more images fetches three more previews — one per image
  // actually looked at, and never the other sixteen.
  await selectStripImage(page, 7, 20);
  await selectStripImage(page, 10, 20);
  await page.waitForLoadState('networkidle');
  const after = tallyRenditions(requests);
  expect(after.catalogPreview.length, 'one preview per image viewed').toBeLessThanOrEqual(3);
});

test('§19 — the twenty-image page is inside the Core Web Vitals budget', async ({ page }) => {
  const { installH05Probe, readH05Probe } =
    (await import('../../support/app12/h05-cwv-probe.mjs')) as {
      installH05Probe: () => void;
      readH05Probe: () => {
        lcpMs: number;
        cls: number;
        worstInteractionMs: number;
        ttfbMs: number | null;
      };
    };

  await resize(page, 'desktop');
  await page.addInitScript(installH05Probe);
  await openGallery(page, SLUGS.twenty());
  await page.waitForLoadState('networkidle');

  // A real interaction, so INP has a meaningful candidate rather than none.
  await selectStripImage(page, 7, 20);

  // And a full lightbox cycle, because the scroll lock removes the scrollbar —
  // the one thing in this package that could shift the page it sits over.
  await page.getByRole('button', { name: /^Mở ảnh 7 /u }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  const metrics = await page.evaluate(readH05Probe);
  const summary = JSON.stringify({
    lcpMs: metrics.lcpMs,
    cls: metrics.cls,
    worstInteractionMs: metrics.worstInteractionMs,
    ttfbMs: metrics.ttfbMs,
  });
  expect(metrics.lcpMs, `LCP <= 2500ms — ${summary}`).toBeLessThanOrEqual(2500);
  expect(metrics.cls, `CLS <= 0.10 (lightbox cycle included) — ${summary}`).toBeLessThanOrEqual(
    0.1,
  );
  expect(metrics.worstInteractionMs, `INP <= 200ms — ${summary}`).toBeLessThanOrEqual(200);
  expect(metrics.ttfbMs ?? 0, `TTFB <= 800ms — ${summary}`).toBeLessThanOrEqual(800);
  test.info().annotations.push({ type: 'cwv', description: summary });
  process.stdout.write(`[m01e1] core web vitals ${summary}\n`);
});

test('§20 — the Product Detail gallery is axe-clean at 1440 and 390', async ({ page }) => {
  await resize(page, 'desktop');
  await openGallery(page, SLUGS.twenty());
  await expectAxeClean(page, 'sf-1440-20-images');

  await resize(page, 'mobile');
  await openGallery(page, SLUGS.twenty());
  await expectAxeClean(page, 'sf-390-20-images');
  await resize(page, 'desktop');
});
