/**
 * `APP12-A01` — Admin dynamic category management, live.
 *
 * ```text
 * A  create / edit / publish     DRAFT → edits → PUBLISH → slug visibly locked
 * B  slug and duplicate refusal  DRAFT slug edits · PUBLISHED slug locked ·
 *                                duplicate → CATEGORY_SLUG_CONFLICT
 * C  archive refusal             publishedProductCount ≥ 1 → refused, still PUBLISHED
 * D  archive success             no dependency → ARCHIVED, row stays, read-only
 * E  Product repoint             new category assignable · archived one is not,
 *                                but stays in the list filter
 * F  version conflict            two actors → CATEGORY_VERSION_CONFLICT, no overwrite
 * ```
 *
 * Every journey runs against **this run's disposable database**, the real API,
 * the real Admin and the real gateway, as a real operator logged in through the
 * real form. No shared development database is written and no `APP12-G03`
 * dataset is created.
 *
 * Serial: the journeys share one taxonomy, and a category slug is globally
 * unique across every lifecycle state — parallel workers would collide.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  CATEGORIES_PATH,
  COPY,
  createDraft,
  loginAsOperator,
  openCategories,
  openCategory,
  openCategoryBySlug,
  productFilterCategoryOptions,
  productFormCategoryOptions,
  publishedCount,
  row,
  runSlug,
  statusBadge,
} from './support/a01-world';

test.describe.configure({ mode: 'serial' });

/** The category journeys A, B and E author. Never seeded by any migration. */
const NEW_NAME = 'Quà tặng doanh nghiệp A01';
const NEW_SLUG = runSlug('a01-qua-tang-doanh-nghiep');
/** The category journey D archives: published, then emptied of nothing. */
const EMPTY_NAME = 'Danh mục rỗng A01';
const EMPTY_SLUG = runSlug('a01-danh-muc-rong');
/** The duplicate journey B attempts. */
const DUPLICATE_NAME = 'Trùng slug A01';
const DUPLICATE_SLUG = runSlug('a01-trung-slug');

function dependencySlug(): string {
  const slug = process.env['E2E_APP12_A01_DEPENDENCY_CATEGORY_SLUG'];
  if (slug === undefined || slug === '') {
    throw new Error('E2E_APP12_A01_DEPENDENCY_CATEGORY_SLUG is required for journey C.');
  }
  return slug;
}

test.beforeEach(async ({ page }: { page: Page }) => {
  await loginAsOperator(page);
});

test('A — the route, the sidebar and the create/edit/publish journey', async ({ page }) => {
  // The nav gains exactly one entry, and it reaches the one route.
  await page.goto('/');
  const nav = page.getByRole('link', { name: COPY.navLabel, exact: true });
  await expect(nav).toHaveCount(1);
  await nav.click();
  await expect(page).toHaveURL(new RegExp(`${CATEGORIES_PATH}$`));

  await expect(page.getByRole('heading', { name: COPY.pageTitle, level: 1 })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();

  // Create yields a DRAFT — the server chooses the state, and the panel offered
  // no way to ask for another.
  await createDraft(page, { name: NEW_NAME, slug: NEW_SLUG, displayOrder: '910' });
  await expect(statusBadge(page, NEW_SLUG)).toContainText(COPY.statusDraft);

  // The draft's slug is editable, so the operator may still correct the address.
  await openCategory(page, NEW_NAME);
  await expect(page.getByTestId('category-slug')).toBeEnabled();
  await page.getByTestId('category-display-order').fill('905');
  await page.getByTestId('category-indexable').check();
  await page.getByTestId('category-save').click();
  await expect(row(page, NEW_SLUG)).toBeVisible();

  // Publish is a transition, and there is no optimistic published state: the
  // badge changes only after the server has answered.
  await openCategory(page, NEW_NAME);
  await page.getByTestId('category-publish').click();
  await expect(statusBadge(page, NEW_SLUG)).toContainText(COPY.statusPublished);

  // The slug is now visibly locked, and the reason is on screen.
  await openCategory(page, NEW_NAME);
  await expect(page.getByTestId('category-slug')).toBeDisabled();
  await expect(page.getByTestId('category-slug')).toHaveValue(NEW_SLUG);
  await expect(page.getByText(COPY.slugLockedChip)).toBeVisible();
  await expect(page.getByText(COPY.slugLockedHelp)).toBeVisible();
  // Everything else about a published category stays editable.
  await expect(page.getByTestId('category-name')).toBeEnabled();
  await expect(page.getByTestId('category-indexable')).toBeEnabled();
  await expect(page.getByTestId('category-display-order')).toBeEnabled();
});

test('B — a duplicate slug is refused on the field, and the published one cannot change', async ({
  page,
}) => {
  await openCategories(page);

  // A slug another category already owns is refused by the server, and the
  // refusal appears under the control the operator typed into.
  await page.getByTestId('category-create').click();
  await page.getByTestId('category-name').fill(DUPLICATE_NAME);
  await page.getByTestId('category-slug').fill(NEW_SLUG);
  await page.getByTestId('category-display-order').fill('911');
  await page.getByTestId('category-save').click();
  await expect(page.getByText(COPY.slugConflict)).toBeVisible();
  await expect(row(page, DUPLICATE_SLUG)).toHaveCount(0);

  // Correcting the slug and saving again succeeds — the panel kept the name.
  await page.getByTestId('category-slug').fill(DUPLICATE_SLUG);
  await page.getByTestId('category-save').click();
  await expect(row(page, DUPLICATE_SLUG)).toBeVisible();
  await expect(statusBadge(page, DUPLICATE_SLUG)).toContainText(COPY.statusDraft);
});

test('C — an archive is refused while published products remain, and states the count', async ({
  page,
}) => {
  const slug = dependencySlug();
  await openCategories(page);

  await expect(statusBadge(page, slug)).toContainText(COPY.statusPublished);
  const blocking = Number((await publishedCount(page, slug).textContent())?.trim());
  expect(blocking).toBeGreaterThanOrEqual(1);

  await openCategoryBySlug(page, slug);
  await page.getByTestId('category-archive').click();

  const refusal = page.getByTestId('category-archive-refusal');
  await expect(refusal).toBeVisible();
  await expect(refusal).toContainText(COPY.archiveRefusalTitle);
  // The number is the server's, re-read after the refusal, and the operator is
  // given the exact products that are blocking them.
  await expect(refusal).toContainText(String(blocking));
  await expect(refusal.getByRole('link')).toHaveAttribute(
    'href',
    `/products?status=PUBLISHED&category=${slug}`,
  );

  // Nothing was done to the products, and the category is still published.
  await expect(statusBadge(page, slug)).toContainText(COPY.statusPublished);
  await expect(publishedCount(page, slug)).toHaveText(String(blocking));
});

test('D — a category with no dependency archives, stays in the list and becomes read-only', async ({
  page,
}) => {
  await openCategories(page);
  await createDraft(page, { name: EMPTY_NAME, slug: EMPTY_SLUG, displayOrder: '920' });
  await openCategory(page, EMPTY_NAME);
  await page.getByTestId('category-publish').click();
  await expect(statusBadge(page, EMPTY_SLUG)).toContainText(COPY.statusPublished);

  await openCategory(page, EMPTY_NAME);
  await expect(publishedCount(page, EMPTY_SLUG)).toHaveText('0');
  await page.getByTestId('category-archive').click();
  await expect(statusBadge(page, EMPTY_SLUG)).toContainText(COPY.statusArchived);

  // Archiving is not deletion: the row survives, and the form is read-only with
  // no relist, no restore and no delete anywhere on it.
  await expect(row(page, EMPTY_SLUG)).toBeVisible();
  await openCategory(page, EMPTY_NAME);
  await expect(page.getByTestId('category-archived-notice')).toContainText(COPY.archivedNotice);
  await expect(page.getByTestId('category-name')).toBeDisabled();
  await expect(page.getByTestId('category-slug')).toBeDisabled();
  await expect(page.getByTestId('category-display-order')).toBeDisabled();
  await expect(page.getByTestId('category-indexable')).toBeDisabled();
  await expect(page.getByTestId('category-save')).toHaveCount(0);
  await expect(page.getByTestId('category-publish')).toHaveCount(0);
  await expect(page.getByTestId('category-archive')).toHaveCount(0);
});

test('E — the Product screens follow the runtime taxonomy, with no source change', async ({
  page,
}) => {
  // The category journey A published is offered for assignment. Nothing in this
  // build ever knew its slug: it was minted for this run.
  const options = await productFormCategoryOptions(page);
  expect(options).toContain(NEW_NAME);
  // The one journey D archived is not assignable…
  expect(options).not.toContain(EMPTY_NAME);
  // …and neither is a draft.
  expect(options).not.toContain(DUPLICATE_NAME);

  // …but the archived one is still in the list filter, so the products left
  // behind under it stay findable.
  const filters = await productFilterCategoryOptions(page);
  expect(filters).toContain(EMPTY_NAME);
  expect(filters).toContain(NEW_NAME);
  expect(filters).toContain(DUPLICATE_NAME);

  // Filtering by the archived category is an ordinary request.
  await page.getByLabel('Danh mục', { exact: true }).selectOption(EMPTY_SLUG);
  await expect(page).toHaveURL(new RegExp(`category=${EMPTY_SLUG}`));
});

test('F — two actors produce a version conflict, and nothing is overwritten', async ({
  browser,
  page,
}) => {
  await openCategories(page);
  await openCategory(page, NEW_NAME);
  // Actor A now holds T1 in its panel.

  // Actor B is a second real operator session that saves first, advancing the
  // record to T2.
  const second = await browser.newContext({ baseURL: page.url().replace(CATEGORIES_PATH, '') });
  const bPage = await second.newPage();
  try {
    await loginAsOperator(bPage);
    await openCategories(bPage);
    await openCategory(bPage, NEW_NAME);
    await bPage.getByTestId('category-display-order').fill('907');
    await bPage.getByTestId('category-save').click();
    await expect(bPage.getByTestId('category-conflict')).toHaveCount(0);
  } finally {
    await second.close();
  }

  // Actor A saves with T1 and is refused. No blind retry, no overwrite, and the
  // edits are still on screen.
  await page.getByTestId('category-name').fill('Tên của người A');
  await page.getByTestId('category-save').click();

  const conflict = page.getByTestId('category-conflict');
  await expect(conflict).toBeVisible();
  await expect(conflict).toContainText(COPY.conflictTitle);
  await expect(page.getByTestId('category-name')).toHaveValue('Tên của người A');
  // B's write survived: A did not overwrite it.
  await expect(row(page, NEW_SLUG).getByRole('button').first()).toHaveText(NEW_NAME);

  // Reloading re-seeds from server truth, and the next save carries the new token.
  await conflict.getByRole('button', { name: COPY.conflictReload }).click();
  await expect(page.getByTestId('category-conflict')).toHaveCount(0);
  await page.getByTestId('category-name').fill('Tên của người A');
  await page.getByTestId('category-save').click();
  await expect(page.getByRole('button', { name: 'Tên của người A', exact: true })).toBeVisible();
});

test('the screen holds at both approved Admin viewports', async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await openCategories(page);

    // The table and every column head are readable, and the page never scrolls
    // horizontally — the one layout failure that would hide a column entirely.
    await expect(page.getByRole('columnheader', { name: 'Tên danh mục' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Sản phẩm đang bán' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Lập chỉ mục' })).toBeVisible();
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);

    // The form panel opens and its controls are reachable at both widths.
    await openCategoryBySlug(page, NEW_SLUG);
    await expect(page.getByTestId('category-save')).toBeVisible();
    await page.getByRole('button', { name: COPY.close }).click();
  }
});

test('the whole taxonomy is keyboard-operable and never colour-only', async ({ page }) => {
  await openCategories(page);

  // Every status is announced as text, not as a tint.
  for (const [slug, label] of [
    [NEW_SLUG, COPY.statusPublished],
    [DUPLICATE_SLUG, COPY.statusDraft],
    [EMPTY_SLUG, COPY.statusArchived],
  ] as const) {
    await expect(statusBadge(page, slug)).toContainText(label);
  }

  // A row opens from the keyboard alone, and focus lands somewhere useful.
  const trigger = row(page, NEW_SLUG).getByRole('button').first();
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('category-name')).toBeVisible();

  // The locked slug's reason is part of its accessible name, so a screen reader
  // reaches it without hunting for the help text.
  await expect(page.getByTestId('category-slug')).toBeDisabled();
  await expect(page.getByLabel(new RegExp(COPY.slugLockedChip))).toBeVisible();
});
