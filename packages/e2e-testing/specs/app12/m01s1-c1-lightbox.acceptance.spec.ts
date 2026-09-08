/**
 * `APP12-M01.S1-C1` — the Product Detail lightbox as a real viewport overlay.
 *
 * S1's own evidence showed the purchase panel's variant pills and the shell
 * header painting **over** the enlarged image. This suite is the mechanical
 * proof that they no longer can, and it is deliberately not a screenshot suite:
 * a picture shows that one pixel looked right, while `elementsFromPoint` answers
 * the question actually being asked — *at this coordinate, which layer does the
 * browser hand the click to?*
 *
 * It rides the `m01s1` project and fixture (the `testMatch` glob covers both
 * files), so the twenty-image Product it opens carries real processed media and
 * a real purchase panel with real variant options — which is the whole point,
 * because the escaping elements were the variant pills.
 */
import { expect, test, type Page } from '@playwright/test';

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  COPY,
  SLUGS,
  counter,
  counterText,
  currentThumbnails,
  horizontalOverflow,
  openProduct,
  positionLabel,
  resize,
  thumbnails,
  type ViewportName,
} from './support/m01s1-world';

test.describe.configure({ mode: 'serial' });

/** Evidence for this correction lands in its own directory. */
async function capture(page: Page, name: string): Promise<void> {
  const root = process.env.E2E_REPO_ROOT;
  if (root === undefined || root === '') throw new Error('E2E_REPO_ROOT is required.');
  const path = join(root, 'evidences', 'm01-s1-c1', `${name}.png`);
  mkdirSync(dirname(path), { recursive: true });
  await page.screenshot({ path });
}

/**
 * The layer the browser would hand a click at this point to.
 *
 * `elementsFromPoint` rather than `elementFromPoint`: the plural returns the
 * whole hit stack, so a failure can say *what* was on top instead of only that
 * something was. `pointer-events: none` elements are absent from the stack by
 * definition, which is why the assertion targets the scrim (a real hit target)
 * and not the counter pill.
 */
async function hitStack(page: Page, x: number, y: number): Promise<string[]> {
  return page.evaluate(
    ([px, py]) =>
      document
        .elementsFromPoint(px as number, py as number)
        .map((node) => `${node.tagName.toLowerCase()}.${node.className || '(no class)'}`),
    [x, y],
  );
}

/** True when the topmost thing at this point belongs to the lightbox layer. */
async function lightboxOwnsPoint(page: Page, x: number, y: number): Promise<boolean> {
  const stack = await hitStack(page, x, y);
  const top = stack[0] ?? '';
  return top.includes('product-detail__scrim') || top.includes('product-detail__dialog');
}

/** The scrim's own box, to compare against the viewport it claims to cover. */
async function scrimBox(page: Page): Promise<{
  top: number;
  left: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
}> {
  return page.locator('.product-detail__scrim').evaluate((node) => {
    const rect = (node as HTMLElement).getBoundingClientRect();
    return {
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });
}

/**
 * The centre of a page control, but only when that centre is somewhere the
 * browser can actually be asked about.
 *
 * `elementsFromPoint` is defined on the **viewport**, not the document: a
 * coordinate below the fold returns an empty stack, which reads exactly like
 * "nothing is on top" and would make this suite pass by asking a question with
 * no answer. At 390 the purchase panel sits far below the fold and the modal's
 * scroll lock freezes it there, so its pills are genuinely not on screen while
 * the lightbox is open — nothing can be painting over the overlay at a point
 * the visitor cannot see. Returning `null` for those is the honest result, and
 * the caller asserts on what remained.
 */
async function visibleCentre(
  page: Page,
  selector: string,
): Promise<{ x: number; y: number } | null> {
  const box = await page.locator(selector).first().boundingBox();
  if (box === null) return null;
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  const viewport = page.viewportSize();
  if (viewport === null) return null;
  if (x < 0 || y < 0 || x >= viewport.width || y >= viewport.height) return null;
  return { x, y };
}

async function openLightboxAtSeven(page: Page): Promise<void> {
  await openProduct(page, SLUGS.twenty());
  await thumbnails(page).nth(6).click();
  await expect(counter(page)).toContainText(counterText(7, 20));
  await page.getByRole('button', { name: /^Mở ảnh 7 /u }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

/**
 * The three points that were wrong.
 *
 * Recorded before the correction: the header bar and both variant pills each
 * won the hit test while the scrim was open, because the scrim's `z-index: 100`
 * was scoped inside the sticky gallery's stacking context.
 */
const OVERLAP_TARGETS = [
  { label: 'shell header', selector: '.storefront-shell__bar' },
  { label: 'variant pill', selector: '.ready-made-purchase__option-pill' },
  { label: 'purchase CTA', selector: '.ready-made-purchase__cta' },
] as const;

for (const viewport of ['desktop', 'tablet', 'mobile'] as const) {
  const label: Record<ViewportName, string> = {
    desktop: '1440',
    tablet: '1024',
    mobile: '390',
  };

  test(`${label[viewport]} — the scrim covers the viewport and owns every point over the page`, async ({
    page,
  }) => {
    await resize(page, viewport);
    await openLightboxAtSeven(page);

    // Measured *after* opening, not before. The scroll lock freezes the page
    // beneath the modal, so these are the coordinates the controls hold for as
    // long as the overlay is up — which is the only window in which the question
    // "who owns this point" means anything.
    const targets: { label: string; x: number; y: number }[] = [];
    for (const target of OVERLAP_TARGETS) {
      const point = await visibleCentre(page, target.selector);
      if (point !== null) targets.push({ label: target.label, ...point });
    }
    // The shell header is fixed to the top of every viewport, so it is on screen
    // whatever else is not. It was also one of the two things observed painting
    // over the overlay, so a run that tested nothing would be a run that proved
    // nothing.
    expect(
      targets.map((target) => target.label),
      `${label[viewport]}: the header must be on screen and testable`,
    ).toContain('shell header');

    // 1. The scrim is the viewport, to the pixel.
    const box = await scrimBox(page);
    expect(box.top, `${label[viewport]}: scrim top`).toBe(0);
    expect(box.left, `${label[viewport]}: scrim left`).toBe(0);
    expect(box.width, `${label[viewport]}: scrim width`).toBe(box.viewportWidth);
    expect(box.height, `${label[viewport]}: scrim height`).toBe(box.viewportHeight);

    // 2. Nothing on the page beneath it wins a click. This is the assertion the
    //    defect would fail: before the correction the header and the pills each
    //    came back on top of this stack.
    for (const target of targets) {
      const stack = await hitStack(page, target.x, target.y);
      expect(
        await lightboxOwnsPoint(page, target.x, target.y),
        `${label[viewport]}: the lightbox must own the point over the ${target.label}; ` +
          `top of stack was ${stack.slice(0, 3).join(' | ')}`,
      ).toBe(true);
    }

    // 3. The dialog's own controls stay above the scrim — the overlay must not
    //    have swallowed the thing it exists to present.
    const close = page.getByRole('button', { name: COPY.lightboxClose });
    await expect(close).toBeVisible();
    const closeBox = await close.boundingBox();
    expect(closeBox, `${label[viewport]}: the close control is laid out`).not.toBeNull();
    expect(
      closeBox?.y ?? -1,
      `${label[viewport]}: close is not clipped off the top`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      (closeBox?.y ?? 0) + (closeBox?.height ?? 0),
      `${label[viewport]}: close is not clipped off the bottom`,
    ).toBeLessThanOrEqual(box.viewportHeight);
    expect(
      (closeBox?.x ?? 0) + (closeBox?.width ?? 0),
      `${label[viewport]}: close is not clipped off the right`,
    ).toBeLessThanOrEqual(box.viewportWidth);

    expect(await horizontalOverflow(page), `${label[viewport]}: no document overflow`).toBe(0);

    await capture(page, `${label[viewport]}-lightbox`);
  });
}

test('the scroll lock holds the boundary and leaves nothing behind', async ({ page }) => {
  await resize(page, 'desktop');
  await openProduct(page, SLUGS.twenty());

  // The width of a real block-level child of `body`, which is what actually
  // moves when the page reflows. NOT `documentElement.clientWidth`: that is the
  // viewport minus the scrollbar by definition, so it changes the moment the
  // scrollbar goes and no amount of compensation on `body` can hold it. The
  // first version of this check asserted on it and reported a failure that was
  // true of the metric and false of the page.
  const contentWidth = async (): Promise<number> =>
    page
      .locator('.storefront-shell__bar')
      .evaluate((node) => Math.round((node as HTMLElement).getBoundingClientRect().width));
  const widthBefore = await contentWidth();
  await page.evaluate(() => {
    window.scrollTo(0, 400);
  });

  await thumbnails(page).nth(6).click();
  await page.getByRole('button', { name: /^Mở ảnh 7 /u }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // Read the baseline *after* opening, not before. Playwright scrolls a control
  // into view before clicking it, so a position sampled earlier is a position
  // the page has since left — the first version of this check compared 400
  // against the 213 the auto-scroll actually produced and failed for a reason
  // that had nothing to do with the scroll lock.
  const scrollBefore = Math.round(await page.evaluate(() => window.scrollY));
  expect(scrollBefore, 'the page is scrolled somewhere worth holding').toBeGreaterThan(0);

  // Locked: the page behind cannot be scrolled out from under the modal.
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.mouse.wheel(0, 600);
  expect(
    Math.round(await page.evaluate(() => window.scrollY)),
    'the page behind did not move',
  ).toBe(scrollBefore);

  // No width jump while locked. A body that loses its scrollbar hands that width
  // back to the layout, so everything under the overlay slides ~15px sideways on
  // open and back on close. Measured live at 1425 → 1440 before the fix; the
  // lock now reserves the freed width as padding on `body`, so the page keeps
  // exactly the box it had.
  expect(await contentWidth(), 'the page under the overlay did not reflow').toBe(widthBefore);

  // And the overlay itself still spans the whole viewport, which is the thing
  // the padding compensation must not have broken: the scrim is measured
  // against the viewport, the page against the padded body.
  const lockedScrim = await scrimBox(page);
  expect(lockedScrim.width, 'the scrim still covers the full viewport while locked').toBe(
    lockedScrim.viewportWidth,
  );

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  // Restored, with no permanent body-style leak and the reading position kept.
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  expect(await page.evaluate(() => document.body.style.paddingRight)).toBe('');
  expect(await contentWidth(), 'the page came back to the width it started at').toBe(widthBefore);
  expect(Math.round(await page.evaluate(() => window.scrollY))).toBe(scrollBefore);

  // Repeatable: open and close twice more and the style is still clean.
  for (let round = 0; round < 2; round += 1) {
    await page.getByRole('button', { name: /^Mở ảnh 7 /u }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  }
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  expect(await page.evaluate(() => document.body.style.paddingRight)).toBe('');
});

test('the modal keeps its semantics, its focus and its place in the gallery', async ({ page }) => {
  await resize(page, 'desktop');
  await openLightboxAtSeven(page);
  const dialog = page.getByRole('dialog');

  // §7 — semantics preserved, not weakened.
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog).toHaveAccessibleName('Túi vải thử nghiệm M01.S1 — 20 ảnh');
  await expect(dialog).toContainText(positionLabel(7, 20));

  // §13 — focus is inside the overlay, not behind it. Tabbing all the way round
  // must never land on the page underneath, which is the failure mode a portal
  // could have introduced by moving the DOM out of the page's own order.
  for (let step = 0; step < 8; step += 1) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => {
      const active = document.activeElement;
      return active !== null && active.closest('.product-detail__scrim') !== null;
    });
    expect(inside, `focus stayed inside the modal after ${String(step + 1)} tabs`).toBe(true);
  }

  // §12 — ordered navigation, then close, then a coherent page.
  await dialog.getByRole('button', { name: COPY.lightboxNext }).click();
  await expect(dialog).toContainText(positionLabel(8, 20));
  await dialog.getByRole('button', { name: COPY.lightboxPrevious }).click();
  await expect(dialog).toContainText(positionLabel(7, 20));

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(counter(page)).toContainText(counterText(7, 20));
  await expect(currentThumbnails(page)).toHaveCount(1);
  await expect(thumbnails(page).nth(6)).toHaveAttribute('aria-current', 'true');

  // Focus came back to the control that opened the dialog, not to the top.
  const returned = await page.evaluate(
    () => document.activeElement?.className.includes('product-detail__stage-trigger') ?? false,
  );
  expect(returned, 'focus returned to the opener').toBe(true);
});

test('the correction changed no media policy and no layout stability', async ({ page }) => {
  const images: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'image') images.push(request.url());
  });

  const { installH05Probe, readH05Probe } =
    (await import('../../support/app12/h05-cwv-probe.mjs')) as {
      installH05Probe: () => void;
      readH05Probe: () => { cls: number };
    };
  await page.addInitScript(installH05Probe);

  await resize(page, 'desktop');
  await openProduct(page, SLUGS.twenty());
  await page.waitForLoadState('networkidle');

  // §14 — a layering correction may not have moved the rendition policy B1 owns.
  const previews = images.filter((url) => url.includes('/catalog-preview'));
  const thumbs = images.filter((url) => url.includes('/thumbnail'));
  expect(previews.length, `initial catalog-preview requests: ${previews.join()}`).toBe(1);
  expect(thumbs.length).toBeGreaterThan(1);
  expect(
    images.filter((url) => !url.includes('/catalog-preview') && !url.includes('/thumbnail')),
  ).toHaveLength(0);

  // Opening and closing the overlay must not shift the page it sits over.
  await thumbnails(page).nth(6).click();
  await page.getByRole('button', { name: /^Mở ảnh 7 /u }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  const { cls } = await page.evaluate(readH05Probe);
  expect(cls, `CLS after a full open/close cycle: ${String(cls)}`).toBeLessThanOrEqual(0.1);
});

test('the overlay is axe-clean at 1440 and at 390', async ({ page }) => {
  const { runAxe, describeViolations } = (await import('../../support/app12/h08-axe.mjs')) as {
    runAxe: (page: Page, options: Record<string, unknown>) => Promise<{ gated: unknown[] }>;
    describeViolations: (scan: unknown) => string;
  };
  const scan = async (name: string) => {
    const result = await runAxe(page, { label: name, disableRules: ['color-contrast'] });
    expect(result.gated.length, `axe ${name}: ${describeViolations(result)}`).toBe(0);
  };

  await resize(page, 'desktop');
  await openLightboxAtSeven(page);
  await scan('c1-lightbox-1440');
  await page.keyboard.press('Escape');

  await resize(page, 'mobile');
  await openLightboxAtSeven(page);
  await scan('c1-lightbox-390');
  await page.keyboard.press('Escape');
});
