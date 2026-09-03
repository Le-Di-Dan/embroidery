/**
 * The shared world for the `APP12-A01` acceptance run.
 *
 * Everything here is **test-only** and every write lands in the run's
 * disposable database, which the orchestrator drops afterwards. No shared
 * development database is touched, and no `APP12-G03` dataset is created.
 *
 * ## Slugs are minted per run, never fixed
 *
 * A category slug is globally unique across every lifecycle state, and an
 * archived category keeps its slug forever — so a fixed literal would pass once
 * and then collide with itself on the second run against the same database.
 * Each slug therefore carries the run id. It is also deliberately **not** a slug
 * any migration seeded, which is what makes the no-code proof a proof: the
 * category the Product form ends up offering is one this build has never seen.
 *
 * Never imported by application code.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** The Admin login form's stable ids and its one approved control. */
const LOGIN = {
  emailInput: '#staff-login-email',
  passwordInput: '#staff-login-password',
  submitName: 'Đăng nhập',
  logoutName: 'Đăng xuất',
} as const;

/** Every operator string this run asserts, transcribed from the approved frames. */
export const COPY = {
  navLabel: 'Danh mục',
  pageTitle: 'Danh mục',
  create: 'Tạo danh mục',
  saveDraft: 'Lưu nháp',
  save: 'Lưu',
  publish: 'Xuất bản',
  archive: 'Lưu trữ',
  close: 'Đóng',
  statusDraft: 'Nháp',
  statusPublished: 'Đang hiển thị',
  statusArchived: 'Đã lưu trữ',
  slugLockedChip: '🔒 khoá sau khi xuất bản',
  slugLockedHelp: 'Đã xuất bản nên không thể đổi. Đổi tên không làm đổi slug.',
  archiveRefusalTitle: 'Không thể lưu trữ danh mục',
  slugConflict: 'Slug này đã thuộc về một danh mục khác. Chọn slug khác.',
  conflictTitle: 'Danh mục đã được người khác thay đổi',
  conflictReload: 'Tải lại bản mới nhất',
  archivedNotice:
    'Danh mục đã lưu trữ nên chỉ xem được. Không thể sửa, không thể xuất bản lại và không thể xoá.',
} as const;

export const CATEGORIES_PATH = '/categories';
export const PRODUCTS_PATH = '/products';
export const PRODUCT_NEW_PATH = '/products/new';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required for the APP12-A01 acceptance run.`);
  }
  return value;
}

/**
 * A slug this build has never seen, unique to this run.
 *
 * Lowercased and hyphen-joined so it satisfies the contract's own pattern
 * without the test having to know the pattern — if it ever stopped satisfying
 * it, the create would be refused and the journey would fail loudly.
 */
export function runSlug(prefix: string): string {
  const runId = (process.env['E2E_RUN_ID'] ?? 'local').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return `${prefix}-${runId}`.slice(0, 80).replace(/-+$/, '');
}

/** Logs in through the real form. No cookie injection and no guard override. */
export async function loginAsOperator(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator(LOGIN.emailInput).fill(requiredEnv('E2E_ADMIN_EMAIL'));
  await page.locator(LOGIN.passwordInput).fill(requiredEnv('E2E_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: LOGIN.submitName }).click();
  await expect(page.getByRole('button', { name: LOGIN.logoutName })).toBeVisible();
}

/** Navigates to the category screen and waits for the table to be real. */
export async function openCategories(page: Page): Promise<void> {
  await page.goto(CATEGORIES_PATH);
  await expect(page.getByRole('heading', { name: COPY.pageTitle, level: 1 })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
}

export function row(page: Page, slug: string): Locator {
  return page.getByTestId(`category-row-${slug}`);
}

export function statusBadge(page: Page, slug: string): Locator {
  return page.getByTestId(`category-status-${slug}`);
}

export function publishedCount(page: Page, slug: string): Locator {
  return page.getByTestId(`category-count-${slug}`);
}

/** Opens the form panel for one category by clicking its name, as an operator does. */
export async function openCategory(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByTestId('category-name')).toBeVisible();
}

/**
 * Opens a category by its **slug**, clicking whatever name the row currently
 * carries.
 *
 * A name is editable and one journey deliberately changes it; a slug is the
 * stable identity. A later journey that addressed a category by a name an
 * earlier one renamed would fail for a reason unrelated to what it tests.
 */
export async function openCategoryBySlug(page: Page, slug: string): Promise<string> {
  const trigger = row(page, slug).getByRole('button').first();
  const name = ((await trigger.textContent()) ?? '').trim();
  await trigger.click();
  await expect(page.getByTestId('category-name')).toBeVisible();
  return name;
}

export interface DraftInput {
  readonly name: string;
  readonly slug: string;
  readonly displayOrder: string;
  readonly indexable?: boolean;
}

/**
 * Creates a DRAFT through the real screen.
 *
 * Asserts on the way through that the create panel offers no publish shortcut:
 * `adminCategory_create` always yields `DRAFT`, and a create-and-publish button
 * would mean the screen had invented a transition the contract refuses.
 */
export async function createDraft(page: Page, input: DraftInput): Promise<void> {
  await page.getByTestId('category-create').click();
  await expect(page.getByTestId('category-publish')).toHaveCount(0);
  await expect(page.getByTestId('category-archive')).toHaveCount(0);

  await page.getByTestId('category-name').fill(input.name);
  await page.getByTestId('category-slug').fill(input.slug);
  await page.getByTestId('category-display-order').fill(input.displayOrder);
  if (input.indexable === true) {
    await page.getByTestId('category-indexable').check();
  }
  await page.getByTestId('category-save').click();
  await expect(row(page, input.slug)).toBeVisible();
}

/** Reads the category options a Product authoring form currently offers. */
export async function productFormCategoryOptions(page: Page): Promise<string[]> {
  await page.goto(PRODUCT_NEW_PATH);
  const select = page.getByLabel('Danh mục sản phẩm');
  await expect(select).toBeVisible();
  // The options arrive from the inventory read; wait for more than the
  // placeholder before reading, or the assertion races the fetch.
  await expect
    .poll(async () => (await select.locator('option').count()) > 1, { timeout: 15_000 })
    .toBe(true);
  return select.locator('option').allTextContents();
}

/** Reads the category options the Product list filter currently offers. */
export async function productFilterCategoryOptions(page: Page): Promise<string[]> {
  await page.goto(PRODUCTS_PATH);
  const select = page.getByLabel('Danh mục', { exact: true });
  await expect(select).toBeVisible();
  await expect
    .poll(async () => (await select.locator('option').count()) > 1, { timeout: 15_000 })
    .toBe(true);
  return select.locator('option').allTextContents();
}
