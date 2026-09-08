/**
 * The shared world for the `APP12-M01.S1` Storefront gallery acceptance run.
 *
 * Everything here is **test-only**. The run reads a disposable database the
 * orchestrator drops afterwards; no shared development database is touched and
 * no `APP12-G03` dataset is created.
 *
 * ## The copy is transcribed, not imported
 *
 * The Vietnamese below is transcribed from the approved frames
 * (`FIG-APPROVAL-APP12-M01-D1-PO-001`) and from the delivered message
 * repository, rather than imported from `packages/i18n`. That is what makes the
 * assertions worth making: a suite that read the same JSON the application
 * renders would agree with any wording, including a wrong one.
 *
 * Never imported by application code.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { expect, type Locator, type Page } from '@playwright/test';

/** Every visitor-facing string this run asserts. */
export const COPY = {
  galleryLabel: 'Ảnh tác phẩm',
  zoomHint: 'Nhấn vào ảnh để mở chế độ xem lớn',
  lightboxClose: 'Đóng',
  lightboxPrevious: 'Ảnh trước',
  lightboxNext: 'Ảnh sau',
} as const;

/** The three viewports the package requires evidence at. */
export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 1024, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required for the APP12-M01.S1 acceptance run.`);
  }
  return value;
}

export const SLUGS = {
  one: () => requiredEnv('E2E_APP12_M01S1_ONE'),
  eight: () => requiredEnv('E2E_APP12_M01S1_EIGHT'),
  twenty: () => requiredEnv('E2E_APP12_M01S1_TWENTY'),
} as const;

/** The accessible position sentence — one string for the counter and the lightbox. */
export const positionLabel = (position: number, total: number): string =>
  `Ảnh ${String(position)} trên ${String(total)}`;

/** The visible numerals. */
export const counterText = (position: number, total: number): string =>
  `${String(position)} / ${String(total)}`;

/** The main image's alt, which states the Product and the position and invents nothing. */
export const mainAlt = (name: string, position: number, total: number): string =>
  `${name} — ảnh ${String(position)} trên ${String(total)}`;

export const thumbnailName = (position: number, total: number): string =>
  `Xem ảnh ${String(position)} trên ${String(total)}`;

/** Opens one Product Detail page and waits for the gallery to be real. */
export async function openProduct(page: Page, slug: string): Promise<void> {
  await page.goto(`/san-pham/${slug}`);
  await expect(gallery(page)).toBeVisible();
}

export function gallery(page: Page): Locator {
  return page.getByRole('region', { name: COPY.galleryLabel });
}

export function strip(page: Page): Locator {
  return page.getByRole('list', { name: COPY.galleryLabel });
}

export function thumbnails(page: Page): Locator {
  return strip(page).getByRole('button');
}

export function stageImage(page: Page): Locator {
  return page.locator('.product-detail__stage-image');
}

export function counter(page: Page): Locator {
  return page.locator('.product-detail__counter');
}

/**
 * The thumbnail currently marked `aria-current`.
 *
 * Queried across the whole strip rather than by index, because "exactly one is
 * current" is one of the acceptance criteria and a locator that named an index
 * could not fail when a second one appeared.
 */
export function currentThumbnails(page: Page): Locator {
  return strip(page).locator('button[aria-current="true"]');
}

/** Proves the document itself never scrolls sideways at the current viewport. */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return Math.max(0, root.scrollWidth - root.clientWidth);
  });
}

/**
 * How many rows the thumbnail strip is laid out in.
 *
 * Counted from the distinct vertical offsets of the tiles rather than from a CSS
 * property, because "no multi-row thumbnail wall" is a statement about where the
 * boxes ended up. `flex-wrap` could be removed and the wall could still appear
 * for another reason; distinct `y` values cannot lie about it.
 */
export async function stripRows(page: Page): Promise<number> {
  return strip(page)
    .locator('li')
    .evaluateAll((nodes) => {
      const tops = nodes.map((node) => Math.round(node.getBoundingClientRect().top));
      return new Set(tops).size;
    });
}

/** The strip's own box, and the content it is trying to hold. */
export async function stripBounds(page: Page): Promise<{
  clientWidth: number;
  scrollWidth: number;
  scrollable: boolean;
}> {
  return strip(page).evaluate((node) => {
    const element = node as HTMLElement;
    return {
      clientWidth: Math.round(element.clientWidth),
      scrollWidth: Math.round(element.scrollWidth),
      scrollable: element.scrollWidth > element.clientWidth + 1,
    };
  });
}

/** The vertical position of one element, so §4's hierarchy claim is measurable. */
export async function documentTop(locator: Locator): Promise<number> {
  return locator.evaluate((node) => Math.round((node as HTMLElement).getBoundingClientRect().top));
}

/**
 * One image has actually decoded.
 *
 * A `<img>` whose request 404ed still satisfies every `src` assertion in this
 * suite, so "the visitor sees a photograph" has to be checked as pixels.
 */
export async function decoded(locator: Locator): Promise<{ width: number; height: number }> {
  return locator.evaluate((node) => {
    const image = node as HTMLImageElement;
    return { width: image.naturalWidth, height: image.naturalHeight };
  });
}

export async function resize(page: Page, viewport: ViewportName): Promise<void> {
  await page.setViewportSize(VIEWPORTS[viewport]);
}

/**
 * Writes one screenshot under `evidences/m01-s1/<name>.png`.
 *
 * Deterministic names, because a random Playwright artifact name cannot be cited
 * from a completion report. Resolved from the repository root the orchestrator
 * passes in, never from the spec's own working directory.
 */
export async function capture(page: Page, name: string): Promise<string> {
  const path = join(requiredEnv('E2E_REPO_ROOT'), 'evidences', 'm01-s1', `${name}.png`);
  mkdirSync(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage: true });
  return path;
}

/** Every image request the page made, classified by the rendition in its address. */
export interface RenditionTally {
  readonly catalogPreview: string[];
  readonly thumbnail: string[];
  readonly other: string[];
}

export function tallyRenditions(urls: readonly string[]): RenditionTally {
  const catalogPreview: string[] = [];
  const thumbnail: string[] = [];
  const other: string[] = [];
  for (const url of urls) {
    if (url.includes('/catalog-preview')) catalogPreview.push(url);
    else if (url.includes('/thumbnail')) thumbnail.push(url);
    else other.push(url);
  }
  return { catalogPreview, thumbnail, other };
}
