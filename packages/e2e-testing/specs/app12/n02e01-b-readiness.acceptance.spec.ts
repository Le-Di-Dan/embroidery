/**
 * `APP12-N02.E01` J3 + J4 — the publication-readiness structural refusal ladder,
 * and the all-SKU price quantifier.
 *
 * Each state is read twice: as the operator sees it (`data-presentation`, the
 * `Chưa xét` rule) and as the server decides it (`publication-readiness`), so
 * the claim "`Chưa xét` is presentation only" is compared, not assumed.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  COPY,
  LABELS,
  SEEDED,
  createSku,
  createVariant,
  expandVariant,
  loginAsOperator,
  openProduct,
  openReadiness,
  publish,
  publishAction,
  requirement,
  serverReadiness,
  skuRow,
} from './support/n02e01-world';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await loginAsOperator(page);
});

async function expectPresentation(page: Page, code: string, state: string): Promise<void> {
  await expect(requirement(page, code)).toHaveAttribute('data-presentation', state);
}

async function returnSkuToBasePrice(page: Page, code: string): Promise<void> {
  await skuRow(page, code)
    .getByRole('button', { name: LABELS.editSku(code) })
    .click();
  await page.getByTestId('sku-price-inherit').check();
  await page.getByTestId('sku-dialog-submit').click();
  await expect(skuRow(page, code)).toContainText('Dùng giá sản phẩm');
}

test('J3 — no variant, no SKU, override 0 are each refused; the fix publishes', async ({
  page,
}) => {
  const productId = SEEDED.draft8();

  // State A — no active variant.
  await openReadiness(page, productId);
  await expectPresentation(page, 'HAS_ACTIVE_VARIANT', 'unsatisfied');
  for (const code of ['HAS_ORDER_ELIGIBLE_SKU', 'SKU_PRICE_RESOLVABLE']) {
    await expectPresentation(page, code, 'pending');
    await expect(requirement(page, code)).toContainText(COPY.pending);
    await expect(requirement(page, code)).toHaveAttribute('data-satisfied', 'true');
  }
  await expect(publishAction(page)).toBeDisabled();
  expect(await serverReadiness(page, productId)).toEqual({
    eligible: false,
    unsatisfied: ['HAS_ACTIVE_VARIANT'],
    requirementCount: 10,
  });

  // State B — an active variant with no active SKU.
  await openProduct(page, productId);
  await createVariant(page, { color: 'Be', size: 'Freesize' });
  await openReadiness(page, productId);
  await expectPresentation(page, 'HAS_ACTIVE_VARIANT', 'satisfied');
  await expectPresentation(page, 'HAS_ORDER_ELIGIBLE_SKU', 'unsatisfied');
  await expectPresentation(page, 'SKU_PRICE_RESOLVABLE', 'pending');
  await expect(publishAction(page)).toBeDisabled();
  expect(await serverReadiness(page, productId)).toEqual({
    eligible: false,
    unsatisfied: ['HAS_ORDER_ELIGIBLE_SKU'],
    requirementCount: 10,
  });

  // State C — an active SKU with override "0" on a valid base price.
  await openProduct(page, productId);
  await expandVariant(page, 'Be · Freesize');
  await createSku(page, 'Be · Freesize', { code: 'E01-J3-ZERO', override: '0' });
  await expect(skuRow(page, 'E01-J3-ZERO')).toContainText('Chưa có giá bán hợp lệ');
  await openReadiness(page, productId);
  await expectPresentation(page, 'PRODUCT_PRICE_READY', 'satisfied');
  await expectPresentation(page, 'HAS_ACTIVE_VARIANT', 'satisfied');
  await expectPresentation(page, 'HAS_ORDER_ELIGIBLE_SKU', 'satisfied');
  await expectPresentation(page, 'SKU_PRICE_RESOLVABLE', 'unsatisfied');
  await expect(publishAction(page)).toBeDisabled();
  expect(await serverReadiness(page, productId)).toEqual({
    eligible: false,
    unsatisfied: ['SKU_PRICE_RESOLVABLE'],
    requirementCount: 10,
  });

  // State D — the price is fixed; all ten pass and publish is allowed.
  await openProduct(page, productId);
  await expandVariant(page, 'Be · Freesize');
  await returnSkuToBasePrice(page, 'E01-J3-ZERO');
  await openReadiness(page, productId);
  await expect(page.locator('[data-presentation="satisfied"]')).toHaveCount(10);
  expect(await serverReadiness(page, productId)).toEqual({
    eligible: true,
    unsatisfied: [],
    requirementCount: 10,
  });
  await publish(page, productId);
});

test('J4 — one zero-priced SKU among valid ones refuses the whole Product', async ({ page }) => {
  const productId = SEEDED.draft20();

  await openProduct(page, productId);
  await createVariant(page, { color: 'Đen', size: 'S' });
  await createVariant(page, { color: 'Đen', size: 'XL' });
  await expandVariant(page, 'Đen · S');
  await createSku(page, 'Đen · S', { code: 'E01-J4-A' });
  await expandVariant(page, 'Đen · XL');
  await createSku(page, 'Đen · XL', { code: 'E01-J4-B', override: '0' });

  await openReadiness(page, productId);
  await expectPresentation(page, 'HAS_ACTIVE_VARIANT', 'satisfied');
  await expectPresentation(page, 'HAS_ORDER_ELIGIBLE_SKU', 'satisfied');
  await expectPresentation(page, 'SKU_PRICE_RESOLVABLE', 'unsatisfied');
  await expect(publishAction(page)).toBeDisabled();
  expect((await serverReadiness(page, productId)).unsatisfied).toEqual(['SKU_PRICE_RESOLVABLE']);

  await openProduct(page, productId);
  await expandVariant(page, 'Đen · XL');
  await returnSkuToBasePrice(page, 'E01-J4-B');
  await openReadiness(page, productId);
  await expect(page.locator('[data-presentation="satisfied"]')).toHaveCount(10);
  expect((await serverReadiness(page, productId)).eligible).toBe(true);
  await expect(publishAction(page)).toBeEnabled();
});
