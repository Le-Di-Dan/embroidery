/**
 * `APP12-N02.E01` J7, J8, J10 — PUBLISHED structure break and recovery, the
 * historical malformed shapes repaired in place, and unpublish safety.
 *
 * The three subjects are the `M01.A1` PUBLISHED Products, which were seeded with
 * **zero variants** — the historical shape itself, not a reconstruction of it.
 * Every structural write below is made through the Admin UI; the database is
 * only read, to prove the status never left PUBLISHED.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  COPY,
  E01_COPY,
  LABELS,
  SEEDED,
  continueLink,
  createSku,
  createVariant,
  expandVariant,
  loginAsOperator,
  openProduct,
  openReadiness,
  productStatus,
  publishedBanner,
  purchasePanel,
  requirement,
  selectableOptions,
  serverReadiness,
  skuRow,
  storefront,
  structureCounts,
  unpublish,
  variantCard,
  warning,
} from './support/n02e01-world';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await loginAsOperator(page);
});

async function expectWarning(page: Page, variants: number, skus: number): Promise<void> {
  await expect(warning(page)).toBeVisible();
  await expect(warning(page)).toContainText(COPY.warningBadge);
  await expect(warning(page)).toContainText(COPY.warningTitle);
  await expect(warning(page)).toContainText(COPY.notSoldOut);
  await expect(page.getByTestId('warning-active-variants')).toHaveText(
    `Phiên bản đang hoạt động: ${String(variants)}`,
  );
  await expect(page.getByTestId('warning-eligible-skus')).toHaveText(
    `SKU có thể đặt hàng: ${String(skus)}`,
  );
  await expect(publishedBanner(page)).toBeVisible();
}

/** The public page of a structurally unbuyable Product: no option, no entry. */
async function expectPublicUnbuyable(page: Page, slug: string): Promise<void> {
  const response = await page.goto(storefront(`/san-pham/${slug}`));
  expect(response?.status()).toBe(200);
  await expect(purchasePanel(page)).toBeVisible();
  await expect(selectableOptions(page)).toHaveCount(0);
  await expect(continueLink(page)).toHaveCount(0);
}

test('J7A/J7B — deactivating the last SKU or variant keeps PUBLISHED, warns, and recovers', async ({
  page,
}) => {
  const productId = SEEDED.published();
  const slug = SEEDED.publishedSlug();

  // Make it valid first, through the UI.
  await openProduct(page, productId);
  await createVariant(page, { color: 'Đỏ', size: 'L' });
  await expandVariant(page, 'Đỏ · L');
  await createSku(page, 'Đỏ · L', { code: 'E01-J7-RED-L' });
  await expect(warning(page)).toHaveCount(0);

  // J7A — the last active SKU.
  await skuRow(page, 'E01-J7-RED-L')
    .getByRole('button', { name: LABELS.deactivateSku('E01-J7-RED-L') })
    .click();
  const skuConfirm = page.getByTestId('structure-break-lastSku');
  await expect(skuConfirm).toContainText(COPY.remainsPublished);
  await expect(skuConfirm).toContainText(COPY.notSoldOut);
  await skuConfirm.getByTestId('structure-break-confirm').click();
  await expectWarning(page, 1, 0);
  // The warning is words, not a hue: it never says "hết hàng" as its verdict.
  await expect(warning(page)).not.toContainText(/^Hết hàng/u);
  expect(await productStatus(productId)).toBe('PUBLISHED');
  await openReadiness(page, productId);
  await expect(requirement(page, 'HAS_ORDER_ELIGIBLE_SKU')).toHaveAttribute(
    'data-presentation',
    'unsatisfied',
  );
  expect((await serverReadiness(page, productId)).unsatisfied).toEqual(['HAS_ORDER_ELIGIBLE_SKU']);
  await expectPublicUnbuyable(page, slug);

  await openProduct(page, productId);
  await expandVariant(page, 'Đỏ · L');
  await skuRow(page, 'E01-J7-RED-L')
    .getByRole('button', { name: LABELS.reactivateSku('E01-J7-RED-L') })
    .click();
  await expect(warning(page)).toHaveCount(0);
  expect(await productStatus(productId)).toBe('PUBLISHED');

  // J7B — the last active variant.
  await variantCard(page, 'Đỏ · L')
    .getByRole('button', { name: LABELS.deactivateVariant('Đỏ · L') })
    .click();
  const variantConfirm = page.getByTestId('structure-break-lastVariant');
  await expect(variantConfirm).toContainText(COPY.remainsPublished);
  await variantConfirm.getByTestId('structure-break-confirm').click();
  await expectWarning(page, 0, 0);
  expect(await productStatus(productId)).toBe('PUBLISHED');
  expect((await structureCounts(productId)).activeVariants).toBe(0);
  await expectPublicUnbuyable(page, slug);

  await openProduct(page, productId);
  await variantCard(page, 'Đỏ · L')
    .getByRole('button', { name: 'Hoạt động lại phiên bản Đỏ · L' })
    .click();
  await expect(warning(page)).toHaveCount(0);
  expect(await productStatus(productId)).toBe('PUBLISHED');

  // Recovered publicly: the option is back (sold out — stock was never added).
  await page.goto(storefront(`/san-pham/${slug}`));
  await expect(purchasePanel(page).getByRole('radio', { name: /Đỏ/u })).toHaveCount(1);
  await expect(purchasePanel(page).getByText(E01_COPY.captionOutOfStock)).toBeVisible();
});

test('J8 — both historical malformed PUBLISHED shapes repair through the UI, in place', async ({
  page,
}) => {
  const productId = SEEDED.single();
  const slug = SEEDED.singleSlug();

  // Shape A — PUBLISHED with zero variants, exactly as seeded.
  expect(await structureCounts(productId)).toEqual({
    variants: 0,
    activeVariants: 0,
    skus: 0,
    activeSkus: 0,
  });
  await openProduct(page, productId);
  await expectWarning(page, 0, 0);
  await expectPublicUnbuyable(page, slug);

  // Shape B — an active variant with no order-eligible SKU.
  await openProduct(page, productId);
  await createVariant(page, { color: 'Trắng' });
  await expectWarning(page, 1, 0);
  expect(await productStatus(productId)).toBe('PUBLISHED');
  await expectPublicUnbuyable(page, slug);

  // Repair shape B.
  await openProduct(page, productId);
  await expandVariant(page, 'Trắng');
  await createSku(page, 'Trắng', { code: 'E01-J8-WHITE' });
  await expect(warning(page)).toHaveCount(0);
  await page.reload();
  await expect(warning(page)).toHaveCount(0);
  expect(await productStatus(productId)).toBe('PUBLISHED');
  expect((await serverReadiness(page, productId)).eligible).toBe(true);

  await page.goto(storefront(`/san-pham/${slug}`));
  await expect(purchasePanel(page).getByRole('radio', { name: /Trắng/u })).toHaveCount(1);
});

test('J10 — a PUBLISHED Product failing a commerce criterion can still be unpublished', async ({
  page,
}) => {
  const productId = SEEDED.race();
  const slug = SEEDED.raceSlug();

  await openReadiness(page, productId);
  await expect(requirement(page, 'HAS_ACTIVE_VARIANT')).toHaveAttribute(
    'data-presentation',
    'unsatisfied',
  );
  expect((await serverReadiness(page, productId)).eligible).toBe(false);
  await expect(page.getByTestId('unpublish-action')).toBeEnabled();

  await unpublish(page);
  await expect.poll(() => productStatus(productId)).toBe('DRAFT');
  const response = await page.goto(storefront(`/san-pham/${slug}`));
  expect(response?.status(), 'a withdrawn Product is no longer public').toBe(404);
});
