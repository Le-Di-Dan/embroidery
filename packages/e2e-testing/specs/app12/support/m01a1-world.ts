/**
 * The shared world for the `APP12-M01.A1` Admin product-media acceptance run.
 *
 * Everything here is **test-only** and every write lands in the run's
 * disposable database, which the orchestrator drops afterwards. No shared
 * development database is touched and no `APP12-G03` dataset is created.
 *
 * ## The copy is transcribed, not imported
 *
 * The Vietnamese below is transcribed from the approved frames
 * (`FIG-APPROVAL-APP12-M01-D1-PO-001`) rather than imported from
 * `packages/i18n`. That is deliberate and is what makes the assertions worth
 * making: a suite that read the same JSON the application renders would agree
 * with any wording, including a wrong one. Here, a copy change that departs
 * from the approved design fails the run.
 *
 * Never imported by application code.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { expect, type Locator, type Page } from '@playwright/test';

const LOGIN = {
  emailInput: '#staff-login-email',
  passwordInput: '#staff-login-password',
  submitName: 'Đăng nhập',
  logoutName: 'Đăng xuất',
} as const;

/** Every operator string this run asserts, transcribed from the approved frames. */
export const COPY = {
  sectionTitle: 'Ảnh sản phẩm',
  gridLabel: 'Lưới ảnh sản phẩm',
  add: 'Thêm ảnh',
  capacityFull: 'Đã đạt giới hạn 20 ảnh. Gỡ bớt một ảnh để thêm ảnh mới.',
  rolePrimary: 'Ảnh đại diện',
  roleGallery: 'Ảnh thư viện',
  saveDraft: 'Lưu thay đổi',
  savePublished: 'Lưu ảnh sản phẩm',
  cancelPublished: 'Huỷ thay đổi ảnh',
  publishedBannerTitle: 'Sản phẩm đang xuất bản',
  publishedBannerBody: 'Thông tin, danh mục và giá đã khoá. Bạn vẫn có thể cập nhật ảnh sản phẩm.',
  publishedMediaNote: 'Thay đổi ảnh không làm sản phẩm ngừng xuất bản.',
  publishedMinimum: 'Sản phẩm đang xuất bản cần ít nhất một ảnh.',
  readOnlyBadge: 'Chỉ đọc',
  removePrimaryTitle: 'Gỡ ảnh đại diện?',
  removePrimaryConfirm: 'Gỡ ảnh đại diện',
  removePrimaryCancel: 'Giữ lại ảnh',
  pickerTitle: 'Chọn ảnh cho sản phẩm',
  pickerAlreadyAdded: 'Đã thêm',
  pickerFullNotice:
    'Sản phẩm đã đạt giới hạn 20 ảnh. Hãy gỡ bớt ảnh ở phần “Ảnh sản phẩm” trước khi thêm ảnh mới.',
  pickerCancel: 'Huỷ',
  conflictTitle: 'Sản phẩm vừa được người khác cập nhật',
  conflictReload: 'Tải lại dữ liệu',
  assetUnavailableTitle: 'Một ảnh chưa sẵn sàng',
  statusPublished: 'Đã xuất bản',
  nameLabel: 'Tên sản phẩm',
  priceLabel: 'Giá cơ bản',
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
    throw new Error(`${name} is required for the APP12-M01.A1 acceptance run.`);
  }
  return value;
}

export const PRODUCTS = {
  draft0: () => requiredEnv('E2E_APP12_M01A1_DRAFT0'),
  draft8: () => requiredEnv('E2E_APP12_M01A1_DRAFT8'),
  draft20: () => requiredEnv('E2E_APP12_M01A1_DRAFT20'),
  published: () => requiredEnv('E2E_APP12_M01A1_PUBLISHED'),
  publishedSingle: () => requiredEnv('E2E_APP12_M01A1_PUBLISHED_SINGLE'),
  publishedRace: () => requiredEnv('E2E_APP12_M01A1_PUBLISHED_RACE'),
} as const;

export const revocableAssetId = (): string => requiredEnv('E2E_APP12_M01A1_REVOCABLE_ASSET');
export const databaseUrl = (): string => requiredEnv('E2E_DATABASE_URL');

/** Logs in through the real form. No cookie injection and no guard override. */
export async function loginAsOperator(page: Page): Promise<void> {
  await page.goto('/login');
  // Filled under `toPass` because the inputs are React-controlled: a fill that
  // lands before hydration is overwritten when the client takes over the DOM.
  await expect(async () => {
    await page.locator(LOGIN.emailInput).fill(requiredEnv('E2E_ADMIN_EMAIL'));
    await page.locator(LOGIN.passwordInput).fill(requiredEnv('E2E_ADMIN_PASSWORD'));
    await expect(page.locator(LOGIN.emailInput)).not.toHaveValue('');
    await expect(page.locator(LOGIN.passwordInput)).not.toHaveValue('');
  }).toPass({ timeout: 30_000 });

  await page.getByRole('button', { name: LOGIN.submitName }).click();
  await expect(page.getByRole('button', { name: LOGIN.logoutName })).toBeVisible();
}

/** Opens one product's editor and waits for its media section to be real. */
export async function openProduct(page: Page, productId: string): Promise<void> {
  await page.goto(`/products/${productId}`);
  await expect(page.getByRole('heading', { name: COPY.sectionTitle, level: 2 })).toBeVisible();
}

export function grid(page: Page): Locator {
  return page.getByRole('list', { name: COPY.gridLabel });
}

export function tiles(page: Page): Locator {
  return grid(page).getByRole('listitem');
}

export function tile(page: Page, position: number): Locator {
  return tiles(page).nth(position - 1);
}

/** The capacity pill, `n/20`. */
export function capacity(page: Page): Locator {
  return page.locator('.product-media-editor__capacity');
}

const place = (position: number, total: number) => `ảnh ${String(position)} trên ${String(total)}`;

export const NAMES = {
  select: (position: number, total: number) => `Chọn ${place(position, total)}`,
  setPrimary: (position: number, total: number) => `Đặt ${place(position, total)} làm ảnh đại diện`,
  moveEarlier: (position: number, total: number) => `Di chuyển trước: ${place(position, total)}`,
  moveLater: (position: number, total: number) => `Di chuyển sau: ${place(position, total)}`,
  remove: (position: number, total: number) => `Gỡ ${place(position, total)}`,
  actionBar: (position: number, total: number) => `Thao tác với ${place(position, total)}`,
} as const;

/**
 * The **desktop** in-tile control, scoped to its own tile.
 *
 * Scoping matters: at 390 the mobile action bar carries controls with the same
 * accessible names, and an unscoped query would find whichever the DOM happened
 * to order first rather than the one the journey means.
 */
export function tileAction(page: Page, position: number, name: string): Locator {
  return tile(page, position).getByRole('button', { name });
}

/**
 * How many images the grid currently holds.
 *
 * Read rather than assumed. The journeys are serial against one fixture and the
 * early ones deliberately curate it — journey A saves nine images onto the
 * eight-image Product — so a later journey that hard-coded the seeded count
 * would be asserting against a world that no longer exists, and would fail for
 * a reason that has nothing to do with what it tests.
 */
export async function totalTiles(page: Page): Promise<number> {
  return tiles(page).count();
}

/** The mobile selected-image bar, which exists only once a tile is selected. */
export function actionBar(page: Page, position: number, total: number): Locator {
  return page.getByRole('group', { name: NAMES.actionBar(position, total) });
}

/**
 * The ordered asset ids the grid is currently showing.
 *
 * Read from the rendered preview URLs rather than from any test id: the URL is
 * the address the browser actually fetched, so an assertion on this order is an
 * assertion about what the operator is looking at, not about a data attribute a
 * component could set independently of the picture beside it.
 */
export async function renderedOrder(page: Page): Promise<string[]> {
  const sources = await grid(page)
    .locator('img')
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLImageElement).getAttribute('src') ?? ''),
    );
  return sources.map((src) => {
    const match = /\/api\/admin\/assets\/([0-9a-f-]+)\/thumbnail/.exec(src);
    if (match?.[1] === undefined) {
      throw new Error(`A media tile rendered an unexpected image source: ${src}`);
    }
    return match[1];
  });
}

/**
 * How many columns the grid is actually laying out.
 *
 * Read from the computed style rather than inferred from the viewport: the
 * media section lives inside a form column whose width depends on the Admin nav
 * and the metadata rail, so "1024" says nothing on its own about how many tiles
 * fit. One column at any desktop width is the failure this guards.
 */
export async function gridColumns(page: Page): Promise<number> {
  return grid(page).evaluate(
    (node) => getComputedStyle(node as HTMLElement).gridTemplateColumns.split(' ').length,
  );
}

/**
 * The grid's own content width, in CSS pixels.
 *
 * Reported alongside the column count so a reviewer can see *why* a viewport
 * yields the columns it does. The media section sits inside a form column whose
 * width is whatever the Admin nav and the metadata rail leave behind, and that
 * number is not derivable from the viewport — §Q.4 is the finding that came from
 * assuming otherwise.
 */
export async function gridWidth(page: Page): Promise<number> {
  return grid(page).evaluate((node) => Math.round((node as HTMLElement).clientWidth));
}

/** Proves the document itself never scrolls sideways at the current viewport. */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return Math.max(0, root.scrollWidth - root.clientWidth);
  });
}

export async function resize(page: Page, viewport: ViewportName): Promise<void> {
  await page.setViewportSize(VIEWPORTS[viewport]);
}

/**
 * Writes one screenshot under `evidences/m01-a1/<viewport>/<name>.png`.
 *
 * Deterministic names, because a random Playwright artifact name cannot be
 * cited from a completion report. Resolved from the repository root the
 * orchestrator passes in, never from the spec's own working directory.
 */
export async function capture(page: Page, viewport: ViewportName, name: string): Promise<string> {
  const path = join(requiredEnv('E2E_REPO_ROOT'), 'evidences', 'm01-a1', viewport, `${name}.png`);
  mkdirSync(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage: true });
  return path;
}

/**
 * Scrolls the whole grid past the viewport, as an operator reviewing twenty
 * photographs does.
 *
 * The tiles carry `loading="lazy"`, which is correct — a twenty-image editor
 * must not fetch twenty derivatives before the first row is usable — and it
 * means "every image loaded" is only a meaningful question about images that
 * have been reached. At 1024 the content column is narrower than at 1440, so
 * more rows fall below the fold and the difference is visible: the assertion
 * has to reproduce the scroll, not assume it away.
 */
export async function revealGrid(page: Page): Promise<void> {
  const count = await tiles(page).count();
  if (count === 0) {
    return;
  }
  // A viewport-sized walk, not one jump to the bottom. `scrollIntoViewIfNeeded`
  // on the last tile moves the document in a single step, and a lazy image the
  // viewport never intersected is never asked for — which is why the first
  // attempt still failed at 1024, where the narrower content column pushes more
  // rows below the fold than at 1440.
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y <= document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => {
        setTimeout(resolve, 60);
      });
    }
    window.scrollTo(0, 0);
  });
}

/**
 * Every image in the grid has actually loaded.
 *
 * A tile that rendered a broken image would still satisfy every accessible-name
 * assertion in this suite, so "twenty real photographs are legible" has to be
 * checked as pixels rather than as markup.
 */
export async function everyImageLoaded(page: Page): Promise<boolean> {
  return grid(page)
    .locator('img')
    .evaluateAll((nodes) =>
      nodes.every((node) => {
        const image = node as HTMLImageElement;
        return image.complete && image.naturalWidth > 0;
      }),
    );
}
