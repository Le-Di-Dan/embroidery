/**
 * `APP12-M01.E1` §16, §17 and §20 — the lightbox as a real viewport overlay.
 *
 * `S1-C1` established the correction; this file re-proves it as acceptance, on
 * the final world and with the purchase controls that caused the original
 * defect actually present.
 *
 * It is deliberately not a screenshot suite. A picture shows that one pixel
 * looked right; `elementsFromPoint` answers the question actually being asked —
 * *at this coordinate, which layer does the browser hand the click to?*
 *
 * ```text
 * §16  the scrim covers the viewport and owns every visible page point,
 *      at 1440 / 1024 / 390, with a real purchase panel behind it
 * §17  the navigation controls are circular outline chevrons whose accessible
 *      names are still "Ảnh trước" and "Ảnh sau"
 * §20  modal semantics, focus containment, focus return, and axe
 * ```
 */
import { expect, test, type Page } from '@playwright/test';

import {
  COPY,
  SLUGS,
  horizontalOverflow,
  positionLabel,
  resize,
  type ViewportName,
} from './support/m01s1-world';
import { capture, expectAxeClean, openGallery, selectStripImage } from './support/m01e1-world';

test.describe.configure({ mode: 'serial' });

/**
 * The layer the browser would hand a click at this point to.
 *
 * The plural `elementsFromPoint`, so a failure can say *what* was on top instead
 * of only that something was.
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

function ownedByLightbox(stack: readonly string[]): boolean {
  const top = stack[0] ?? '';
  return top.includes('product-detail__scrim') || top.includes('product-detail__dialog');
}

async function scrimBox(page: Page) {
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
 * The centre of a control, but only where the browser can actually be asked.
 *
 * `elementsFromPoint` is defined on the **viewport**: a coordinate below the
 * fold returns an empty stack, which reads exactly like "nothing is on top" and
 * would make this suite pass by asking a question with no answer. At 390 the
 * purchase panel sits far below the fold and the scroll lock freezes it there,
 * so returning `null` for those is the honest result and the caller asserts on
 * what remained.
 */
async function visibleCentre(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (box === null) return null;
  const viewport = page.viewportSize();
  if (viewport === null) return null;
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  if (x < 0 || y < 0 || x >= viewport.width || y >= viewport.height) return null;
  return { x, y };
}

const OVERLAP_TARGETS = [
  { label: 'shell header', selector: '.storefront-shell__bar' },
  { label: 'variant pill', selector: '.ready-made-purchase__option-pill' },
  { label: 'purchase CTA', selector: '.ready-made-purchase__cta' },
] as const;

/**
 * Opens the twenty-image Product at image 7, with the overlay up.
 *
 * The navigation is retried once. Every journey in this file loads twenty real
 * 1 600 px derivatives and opens a full-viewport overlay over them, and a
 * Chromium renderer that dies under that load answers with its own "This page
 * couldn't load" document — which is an environment failure, not a finding, and
 * would otherwise be reported as one. A second attempt either succeeds or the
 * suite fails on the real assertion below.
 */
async function openAtSeven(page: Page): Promise<void> {
  await openGallery(page, SLUGS.twenty());
  await selectStripImage(page, 7, 20);
  await page.getByRole('button', { name: /^Mở ảnh 7 /u }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

/** Leaves the page without an overlay, so the next journey starts from rest. */
async function closeLightbox(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
}

const LABEL: Record<ViewportName, string> = {
  desktop: '1440',
  tablet: '1024',
  mobile: '390',
};

for (const viewport of ['desktop', 'tablet', 'mobile'] as const) {
  test(`§16 — at ${LABEL[viewport]} the overlay owns every visible page point`, async ({
    page,
  }) => {
    await resize(page, viewport);
    await openAtSeven(page);

    // Measured *after* opening: the scroll lock freezes the page beneath, so
    // these are the coordinates the controls hold for as long as the overlay is
    // up — the only window in which "who owns this point" means anything.
    const targets: { label: string; x: number; y: number }[] = [];
    for (const target of OVERLAP_TARGETS) {
      const point = await visibleCentre(page, target.selector);
      if (point !== null) targets.push({ label: target.label, ...point });
    }
    // A run that tested nothing must fail rather than pass silently. The shell
    // header is fixed to the top of every viewport, and it was one of the two
    // things observed painting over the overlay.
    expect(
      targets.map((target) => target.label),
      `${LABEL[viewport]}: the header must be on screen and testable`,
    ).toContain('shell header');

    const box = await scrimBox(page);
    expect(box.top, `${LABEL[viewport]}: scrim top`).toBe(0);
    expect(box.left, `${LABEL[viewport]}: scrim left`).toBe(0);
    expect(box.width, `${LABEL[viewport]}: scrim width`).toBe(box.viewportWidth);
    expect(box.height, `${LABEL[viewport]}: scrim height`).toBe(box.viewportHeight);

    for (const target of targets) {
      const stack = await hitStack(page, target.x, target.y);
      expect(
        ownedByLightbox(stack),
        `${LABEL[viewport]}: the lightbox must own the point over the ${target.label}; ` +
          `top of stack was ${stack.slice(0, 3).join(' | ')}`,
      ).toBe(true);
    }

    // The dialog's own controls stay above the scrim: the overlay must not have
    // swallowed the thing it exists to present.
    const close = page.getByRole('button', { name: COPY.lightboxClose });
    await expect(close).toBeVisible();
    const closeBox = await close.boundingBox();
    expect(closeBox, `${LABEL[viewport]}: the close control is laid out`).not.toBeNull();
    expect((closeBox?.y ?? -1) >= 0, `${LABEL[viewport]}: close not clipped at the top`).toBe(true);
    expect(
      (closeBox?.y ?? 0) + (closeBox?.height ?? 0) <= box.viewportHeight,
      `${LABEL[viewport]}: close not clipped at the bottom`,
    ).toBe(true);
    expect(
      (closeBox?.x ?? 0) + (closeBox?.width ?? 0) <= box.viewportWidth,
      `${LABEL[viewport]}: close not clipped at the right`,
    ).toBe(true);

    expect(await horizontalOverflow(page), `${LABEL[viewport]}: no document overflow`).toBe(0);
    await capture(page, viewport, 'sf-lightbox');
    await closeLightbox(page);
  });
}

test('§17 — the navigation controls are circular outline chevrons that announce themselves', async ({
  page,
}) => {
  await resize(page, 'desktop');
  await openAtSeven(page);
  const dialog = page.getByRole('dialog');

  for (const name of [COPY.lightboxPrevious, COPY.lightboxNext]) {
    const control = dialog.getByRole('button', { name });
    await expect(control, `"${name}" is an addressable control`).toHaveCount(1);
    await expect(control).toHaveAccessibleName(name);

    // Circular: equal box, and a border radius that makes it one. Outline: a
    // real border with a transparent fill, never a filled pill.
    const shape = await control.evaluate((node) => {
      const element = node as HTMLElement;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        radius: style.borderTopLeftRadius,
        borderWidth: style.borderTopWidth,
        background: style.backgroundColor,
      };
    });
    expect(shape.width, `"${name}" is square before it can be circular`).toBe(shape.height);
    expect(shape.width, `"${name}" meets the minimum touch target`).toBeGreaterThanOrEqual(44);
    // 50% resolves to half the box, or the token stays a percentage.
    expect(
      shape.radius === '50%' || Number.parseFloat(shape.radius) >= shape.width / 2,
      `"${name}" is a circle (radius ${shape.radius} on a ${String(shape.width)}px box)`,
    ).toBe(true);
    expect(
      Number.parseFloat(shape.borderWidth),
      `"${name}" carries an outline`,
    ).toBeGreaterThanOrEqual(1);
    expect(shape.background, `"${name}" is not a filled pill at rest`).toMatch(
      /rgba\(.*,\s*0\)$|^transparent$/,
    );

    // The chevron itself is drawn, and is hidden from the accessible name — the
    // words moved to `aria-label`, they did not disappear.
    const icon = control.locator('svg');
    await expect(icon).toHaveCount(1);
    await expect(icon).toHaveAttribute('aria-hidden', 'true');
    // And the visible text is gone: a control that still printed the words would
    // not be the treatment the Product Owner approved.
    expect((await control.innerText()).trim(), `"${name}" shows no visible label`).toBe('');
  }

  await capture(page, 'desktop', 'sf-lightbox-chevrons');
  await closeLightbox(page);
});

test('§20 — the modal keeps its semantics, its focus and its scroll boundary', async ({ page }) => {
  await resize(page, 'desktop');
  await openGallery(page, SLUGS.twenty());

  // A real block-level child of `body`, which is what actually moves when the
  // page reflows. NOT `documentElement.clientWidth`: that is viewport minus
  // scrollbar by definition, so it changes the moment the scrollbar goes and no
  // compensation on `body` can hold it.
  const contentWidth = async (): Promise<number> =>
    page
      .locator('.storefront-shell__bar')
      .evaluate((node) => Math.round((node as HTMLElement).getBoundingClientRect().width));
  const widthBefore = await contentWidth();
  await page.evaluate(() => {
    window.scrollTo(0, 400);
  });

  await selectStripImage(page, 7, 20);
  await page.getByRole('button', { name: /^Mở ảnh 7 /u }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // The baseline is read after opening: Playwright scrolls a control into view
  // before clicking it, so a position sampled earlier is one the page has left.
  const scrollBefore = Math.round(await page.evaluate(() => window.scrollY));
  expect(scrollBefore, 'the page is scrolled somewhere worth holding').toBeGreaterThan(0);

  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog).toHaveAccessibleName('Túi vải thử nghiệm M01.S1 — 20 ảnh');
  await expect(dialog).toContainText(positionLabel(7, 20));

  // Locked, and without moving the page sideways.
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.mouse.wheel(0, 600);
  expect(Math.round(await page.evaluate(() => window.scrollY)), 'the page behind held').toBe(
    scrollBefore,
  );
  expect(await contentWidth(), 'the page under the overlay did not reflow').toBe(widthBefore);

  // Focus cannot reach the page behind, which is the failure a portal could have
  // introduced by moving the DOM out of the page's own order.
  for (let step = 0; step < 8; step += 1) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => {
      const active = document.activeElement;
      return active !== null && active.closest('.product-detail__scrim') !== null;
    });
    expect(inside, `focus stayed inside the modal after ${String(step + 1)} tabs`).toBe(true);
  }

  await expectAxeClean(page, 'sf-lightbox-1440');

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Restored: no permanent body-style leak, the reading position kept, and the
  // page back to the width it started at.
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  expect(await page.evaluate(() => document.body.style.paddingRight)).toBe('');
  expect(await contentWidth()).toBe(widthBefore);
  expect(Math.round(await page.evaluate(() => window.scrollY))).toBe(scrollBefore);

  await resize(page, 'mobile');
  await openAtSeven(page);
  await expectAxeClean(page, 'sf-lightbox-390');
  await closeLightbox(page);
  await resize(page, 'desktop');
});
