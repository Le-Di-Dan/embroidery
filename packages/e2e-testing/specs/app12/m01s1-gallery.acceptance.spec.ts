/**
 * `APP12-M01.S1` — Storefront Product Detail multi-image gallery, live.
 *
 * Six journeys against a disposable world holding three PUBLISHED Products with
 * one, eight and twenty real images. Serial, one browser, one narrative: a
 * visitor arriving at a twenty-image Product, choosing an image, enlarging it,
 * and reaching the same page on a phone.
 *
 * What is deliberately proved **in the browser** rather than in Jest: that the
 * strip is one row and not a wall, that the document never scrolls sideways,
 * that the images decode to actual pixels, that only one full preview is
 * fetched, and that the purchase panel did not move down the page. Every one of
 * those is a fact about layout and network, and jsdom has neither.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  COPY,
  SLUGS,
  capture,
  counter,
  counterText,
  currentThumbnails,
  decoded,
  documentTop,
  gallery,
  horizontalOverflow,
  mainAlt,
  openProduct,
  positionLabel,
  resize,
  stageImage,
  strip,
  stripBounds,
  stripRows,
  tallyRenditions,
  thumbnails,
} from './support/m01s1-world';

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

test('A — a twenty-image Product opens on its primary and says so twice', async ({ page }) => {
  const requests = recordImageRequests(page);
  await resize(page, 'desktop');
  await openProduct(page, SLUGS.twenty());

  // §29.3 initial selection is media[0], and §18: the page takes the server's
  // order and does not re-sort it. The first thumbnail is current, and the
  // stage is showing the image that thumbnail stands for.
  await expect(thumbnails(page)).toHaveCount(20);
  await expect(currentThumbnails(page)).toHaveCount(1);
  await expect(thumbnails(page).first()).toHaveAttribute('aria-current', 'true');
  await expect(stageImage(page)).toHaveAttribute('alt', mainAlt(TWENTY_NAME, 1, 20));

  // §29.7 and §29.10 — the numerals and the sentence, which are two different
  // strings for two different audiences.
  await expect(counter(page)).toContainText(counterText(1, 20));
  await expect(counter(page)).toContainText(positionLabel(1, 20));

  // §24 — pixels, not markup. A 404 would satisfy every assertion above.
  const stage = await decoded(stageImage(page));
  expect(stage.width, 'the main preview decoded to real pixels').toBeGreaterThan(0);
  expect(stage.height).toBeGreaterThan(0);
  const firstThumb = await decoded(strip(page).locator('img').first());
  expect(firstThumb.width, 'the first thumbnail decoded to real pixels').toBeGreaterThan(0);

  // §29.6 — the intrinsic dimensions rendered are the derivative's own, which
  // is what `APP12-M01.B1` published and what keeps CLS flat.
  await expect(stageImage(page)).toHaveAttribute('width', '1600');
  await expect(stageImage(page)).toHaveAttribute('height', '1600');
  await expect(strip(page).locator('img').first()).toHaveAttribute('width', '800');

  // §20, §29.25/26 — one full preview, twenty thumbnails, and no eager fetch of
  // the nineteen previews the visitor has not asked for.
  await page.waitForLoadState('networkidle');
  const tally = tallyRenditions(requests);
  expect(
    tally.catalogPreview.length,
    `catalog-preview requests: ${tally.catalogPreview.join()}`,
  ).toBe(1);
  // Not twenty. The strip carries `loading="lazy"` and scrolls horizontally, so
  // the browser fetches only the thumbnails it has actually laid out inside the
  // viewport — 17 of 20 at 1440, and fewer at 390. That is the delivered
  // behaviour and the right one; what matters is that every image the strip did
  // ask for is a THUMBNAIL, that it asked for more than a couple, and that no
  // third rendition appeared from anywhere.
  expect(tally.thumbnail.length).toBeGreaterThan(1);
  expect(tally.thumbnail.length).toBeLessThanOrEqual(20);
  expect(tally.other, `unexpected image renditions: ${tally.other.join()}`).toHaveLength(0);

  await capture(page, '1440-20');
});

test('B — the strip stays one bounded row at every viewport, and the page never scrolls sideways', async ({
  page,
}) => {
  // §13 — 8 images at 1440. D1 measured this state as fitting exactly, so it is
  // the one that would expose a strip that had started wrapping.
  await resize(page, 'desktop');
  await openProduct(page, SLUGS.eight());
  await expect(thumbnails(page)).toHaveCount(8);
  expect(await stripRows(page), 'the 8-image strip is one row').toBe(1);
  expect(await horizontalOverflow(page)).toBe(0);
  await capture(page, '1440-8');

  // The purchase decision must not have been pushed down by the gallery (§4).
  // Measured against the same Product at twenty images: the counter is an
  // overlay and the strip is one row, so the number must not move.
  const eightPriceTop = await documentTop(page.locator('.ready-made-purchase__price').first());

  await openProduct(page, SLUGS.twenty());
  await expect(thumbnails(page)).toHaveCount(20);
  expect(await stripRows(page), 'twenty thumbnails are still one row, not a wall').toBe(1);
  const twentyBounds = await stripBounds(page);
  expect(twentyBounds.scrollable, 'twenty thumbnails scroll rather than widen the page').toBe(true);
  expect(await horizontalOverflow(page)).toBe(0);
  const twentyPriceTop = await documentTop(page.locator('.ready-made-purchase__price').first());
  expect(
    Math.abs(twentyPriceTop - eightPriceTop),
    'the price sits where it sat with eight images',
  ).toBeLessThanOrEqual(2);

  for (const viewport of ['tablet', 'mobile'] as const) {
    await resize(page, viewport);
    await openProduct(page, SLUGS.twenty());
    await expect(thumbnails(page)).toHaveCount(20);
    expect(await stripRows(page), `${viewport}: one row`).toBe(1);
    expect(await horizontalOverflow(page), `${viewport}: no document overflow`).toBe(0);
    const bounds = await stripBounds(page);
    expect(bounds.clientWidth, `${viewport}: the strip is bounded`).toBeLessThanOrEqual(
      viewport === 'mobile' ? 390 : 1024,
    );
    await expect(counter(page)).toContainText(counterText(1, 20));
    // §15 — a 64px control is still a realistic touch target after the strip
    // has been made to scroll.
    const box = await thumbnails(page).first().boundingBox();
    expect(box?.height ?? 0, `${viewport}: touchable thumbnail`).toBeGreaterThanOrEqual(44);
    await capture(page, viewport === 'tablet' ? '1024-20' : '390-20');
  }

  await resize(page, 'desktop');
});

test('C — choosing an image moves the stage, the counter and exactly one aria-current', async ({
  page,
}) => {
  const requests = recordImageRequests(page);
  await resize(page, 'desktop');
  await openProduct(page, SLUGS.twenty());

  // §23 steps 4-7: image 7.
  await thumbnails(page).nth(6).click();
  await expect(stageImage(page)).toHaveAttribute('alt', mainAlt(TWENTY_NAME, 7, 20));
  await expect(counter(page)).toContainText(counterText(7, 20));
  await expect(counter(page)).toContainText(positionLabel(7, 20));
  await expect(currentThumbnails(page)).toHaveCount(1);
  await expect(thumbnails(page).nth(6)).toHaveAttribute('aria-current', 'true');
  await capture(page, 'middle-image-selected');

  // §8 — the selected state is not carried by colour alone. The ring, the
  // opacity step and the marker rail are three signals; the two that are
  // measurable from computed style are asserted here, and `aria-current` above
  // is the third.
  const selectedOpacity = await thumbnails(page)
    .nth(6)
    .evaluate((node) => getComputedStyle(node as HTMLElement).opacity);
  const otherOpacity = await thumbnails(page)
    .nth(2)
    .evaluate((node) => getComputedStyle(node as HTMLElement).opacity);
  expect(Number(selectedOpacity)).toBeGreaterThan(Number(otherOpacity));
  const markerColour = await strip(page)
    .locator('li')
    .nth(6)
    .evaluate((node) => getComputedStyle(node as HTMLElement, '::after').backgroundColor);
  expect(markerColour, 'the selected tile carries the accent marker').not.toBe('rgba(0, 0, 0, 0)');

  // §9 — the roving strip: one Tab stop, arrows within it, End at the last.
  await thumbnails(page).nth(6).focus();
  await page.keyboard.press('ArrowRight');
  await expect(counter(page)).toContainText(counterText(8, 20));
  await page.keyboard.press('End');
  await expect(counter(page)).toContainText(counterText(20, 20));
  await expect(stageImage(page)).toHaveAttribute('alt', mainAlt(TWENTY_NAME, 20, 20));
  await expect(currentThumbnails(page)).toHaveCount(1);
  await capture(page, 'last-image-selected');

  // §26 — after selecting three more images the page has fetched three more
  // previews, one per image actually looked at, and never the other sixteen.
  await page.waitForLoadState('networkidle');
  const tally = tallyRenditions(requests);
  expect(tally.catalogPreview.length, 'one preview per image actually viewed').toBeLessThanOrEqual(
    4,
  );
});

test('D — the lightbox opens on the image the visitor is looking at', async ({ page }) => {
  await resize(page, 'desktop');
  await openProduct(page, SLUGS.twenty());
  await thumbnails(page).nth(6).click();
  await expect(counter(page)).toContainText(counterText(7, 20));

  // §11 / §29.20 — not the primary. This is the defect the package exists to
  // prevent: two gallery state machines that disagree about what is selected.
  await page.getByRole('button', { name: /^Mở ảnh 7 /u }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(positionLabel(7, 20));
  await expect(dialog.locator('img')).toHaveAttribute('alt', mainAlt(TWENTY_NAME, 7, 20));
  await capture(page, 'lightbox-current-selected');

  // §11 — ordered navigation, in the Product's media order.
  await dialog.getByRole('button', { name: COPY.lightboxNext }).click();
  await expect(dialog).toContainText(positionLabel(8, 20));
  await dialog.getByRole('button', { name: COPY.lightboxPrevious }).click();
  await expect(dialog).toContainText(positionLabel(7, 20));

  // §23 step 12 — closing leaves the page coherent rather than reset.
  await dialog.getByRole('button', { name: COPY.lightboxClose }).click();
  await expect(dialog).toBeHidden();
  await expect(counter(page)).toContainText(counterText(7, 20));
  await expect(currentThumbnails(page)).toHaveCount(1);

  // §23 steps 14-15 — a reload returns to the canonical primary, because the
  // selection is deliberately not persisted anywhere.
  await page.reload();
  await expect(counter(page)).toContainText(counterText(1, 20));
});

test('E — one image, and no empty navigation chrome around it', async ({ page }) => {
  await resize(page, 'desktop');
  await openProduct(page, SLUGS.one());

  // §16 / §29.8 — the main preview is there; the counter and the strip are not.
  await expect(stageImage(page)).toHaveAttribute('alt', mainAlt(ONE_NAME, 1, 1));
  await expect(counter(page)).toHaveCount(0);
  await expect(strip(page)).toHaveCount(0);
  await expect(gallery(page)).toContainText(COPY.zoomHint);

  // The large view still works, and states no position it cannot navigate.
  await page.getByRole('button', { name: /^Mở ảnh 1 /u }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: COPY.lightboxNext })).toHaveCount(0);
  await dialog.getByRole('button', { name: COPY.lightboxClose }).click();

  await capture(page, 'one-image-state');
});

test('F — the gallery is axe-clean and within the Core Web Vitals budget', async ({ page }) => {
  /**
   * `color-contrast` is excluded from the **gate** and from nothing else, for
   * the reason `APP12-H08` recorded and `PO-APP12-004` ruled: the failing token
   * pairs are `APP12-V02`'s to change, not this package's. Every other rule
   * counts, and no rule was disabled to reach a number.
   */
  const { runAxe, describeViolations } = (await import('../../support/app12/h08-axe.mjs')) as {
    runAxe: (page: Page, options: Record<string, unknown>) => Promise<{ gated: unknown[] }>;
    describeViolations: (scan: unknown) => string;
  };
  const scan = async (label: string) => {
    const result = await runAxe(page, { label, disableRules: ['color-contrast'] });
    expect(result.gated.length, `axe ${label}: ${describeViolations(result)}`).toBe(0);
  };

  await resize(page, 'desktop');
  await openProduct(page, SLUGS.twenty());
  await scan('1440-20-images');

  await page.getByRole('button', { name: /^Mở ảnh 1 /u }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await scan('lightbox');
  await page.getByRole('dialog').getByRole('button', { name: COPY.lightboxClose }).click();

  await resize(page, 'mobile');
  await openProduct(page, SLUGS.twenty());
  await scan('390-20-images');

  // §20 — the budget, measured on a cold desktop load of the twenty-image
  // Product with one real interaction, so INP has something to report.
  const { installH05Probe, readH05Probe } =
    (await import('../../support/app12/h05-cwv-probe.mjs')) as {
      installH05Probe: () => void;
      // Only the four gated figures are named. The probe also returns a resource
      // inventory, which this package has no question for and which is what
      // makes a `Record<string, number>` assertion untrue.
      readH05Probe: () => {
        lcpMs: number;
        cls: number;
        worstInteractionMs: number;
        ttfbMs: number | null;
      };
    };
  await resize(page, 'desktop');
  await page.addInitScript(installH05Probe);
  await openProduct(page, SLUGS.twenty());
  await page.waitForLoadState('networkidle');
  await thumbnails(page).nth(6).click();
  await expect(counter(page)).toContainText(counterText(7, 20));

  const metrics = await page.evaluate(readH05Probe);
  const summary = JSON.stringify({
    lcpMs: metrics.lcpMs,
    cls: metrics.cls,
    worstInteractionMs: metrics.worstInteractionMs,
    ttfbMs: metrics.ttfbMs,
  });
  expect(metrics.lcpMs, `LCP <= 2500ms — ${summary}`).toBeLessThanOrEqual(2500);
  expect(metrics.cls, `CLS <= 0.10 — ${summary}`).toBeLessThanOrEqual(0.1);
  expect(metrics.worstInteractionMs, `INP <= 200ms — ${summary}`).toBeLessThanOrEqual(200);
  expect(metrics.ttfbMs ?? 0, `TTFB <= 800ms — ${summary}`).toBeLessThanOrEqual(800);
  // Reported as well as asserted. The annotation is for the HTML report; the
  // line on stdout is what a completion report can actually quote, and a figure
  // nobody can quote is a figure nobody can check.
  test.info().annotations.push({ type: 'cwv', description: summary });
  process.stdout.write(`[m01s1] core web vitals ${summary}
`);
});
