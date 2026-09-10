/**
 * `APP12-N02.E01` J5 + J6 — the refusals, with the database read back to prove
 * each refusal persisted nothing and deactivated nothing.
 */
import { expect, test } from '@playwright/test';

import {
  COPY,
  SEEDED,
  createSku,
  createVariant,
  expandVariant,
  loginAsOperator,
  openProduct,
  section,
  skuRow,
  structureCounts,
  variantCard,
} from './support/n02e01-world';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await loginAsOperator(page);
});

test('J5 — a second active SKU is refused, nothing is deactivated, and recovery works', async ({
  page,
}) => {
  const productId = SEEDED.draft0();
  await openProduct(page, productId);
  await createVariant(page, { color: 'Xanh navy', size: 'M' });
  await expandVariant(page, 'Xanh navy · M');
  await createSku(page, 'Xanh navy · M', { code: 'E01-J5-A' });
  await expect(skuRow(page, 'E01-J5-A')).toHaveAttribute('data-active', 'true');

  await createSku(page, 'Xanh navy · M', { code: 'E01-J5-B' });
  const dialog = page.getByTestId('sku-dialog');
  const alert = dialog.getByRole('alert');
  await expect(alert).toContainText(COPY.ambiguousTitle);
  await expect(alert).toContainText('E01-J5-A');
  await expect(alert).toContainText(COPY.noAutoDeactivate);
  await expect(alert).not.toContainText('SKU_ORDER_ELIGIBLE_AMBIGUOUS');

  // Persisted truth: the refused SKU does not exist; the original is still active.
  expect(await structureCounts(productId)).toEqual({
    variants: 1,
    activeVariants: 1,
    skus: 1,
    activeSkus: 1,
  });
  await expect(skuRow(page, 'E01-J5-A')).toHaveAttribute('data-active', 'true');

  // Supported recovery: create the second SKU inactive.
  await dialog.getByTestId('sku-active').uncheck();
  await dialog.getByTestId('sku-dialog-submit').click();
  await expect(skuRow(page, 'E01-J5-B')).toHaveAttribute('data-active', 'false');
  await expect(skuRow(page, 'E01-J5-A')).toHaveAttribute('data-active', 'true');
  expect(await structureCounts(productId)).toEqual({
    variants: 1,
    activeVariants: 1,
    skus: 2,
    activeSkus: 1,
  });
});

test('J6 — blank labels and a normalized duplicate are refused; a new size is allowed', async ({
  page,
}) => {
  const productId = SEEDED.draft0();
  await openProduct(page, productId);
  const before = await structureCounts(productId);

  // Blank labels (whitespace only counts as blank).
  await section(page).getByRole('button', { name: COPY.addVariant }).click();
  await page.getByTestId('variant-color').fill('   ');
  await page.getByTestId('variant-size').fill('  ');
  await page.getByTestId('variant-dialog-submit').click();
  await expect(page.getByTestId('variant-dialog')).toContainText(COPY.labelRequired);

  // Normalized duplicate of `Xanh navy / M`.
  await page.getByTestId('variant-color').fill('  xanh   NAVY  ');
  await page.getByTestId('variant-size').fill('m');
  await page.getByTestId('variant-dialog-submit').click();
  const alert = page.getByTestId('variant-dialog').getByRole('alert');
  await expect(alert).toContainText(COPY.duplicateTitle);
  await expect(alert).not.toContainText('PRODUCT_VARIANT_DUPLICATE');
  await expect(alert).not.toContainText('23505');
  await page.getByTestId('variant-dialog').getByRole('button', { name: COPY.cancel }).click();
  expect(await structureCounts(productId)).toEqual(before);

  // A distinct size of the same colour is a different variant.
  await createVariant(page, { color: 'Xanh navy', size: 'L' });
  await expect(variantCard(page, 'Xanh navy · L')).toHaveAttribute('data-active', 'true');
  expect((await structureCounts(productId)).variants).toBe(before.variants + 1);
});
