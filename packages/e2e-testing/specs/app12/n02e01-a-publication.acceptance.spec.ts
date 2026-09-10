/**
 * `APP12-N02.E01` J1 + J2 — an operator builds two Ready-Made Products from
 * nothing, entirely through the Admin, and a visitor reads the truth of each.
 *
 * ```text
 * J1  new DRAFT → variant → SKU → stock handoff (left at 0) → 10/10 → publish
 *     → Storefront: visible, sold out, not buyable
 * J2  new DRAFT → variant → SKU → stock +7 → 10/10 → publish
 *     → Storefront: visible, price and availability truthful, purchase entry live
 * ```
 *
 * Stops at the purchase entry: no verification, OTP, order, shipping fee or
 * payment is executed (`N02.E01` §17 — that is `APP12-U01-C1`).
 */
import { expect, test } from '@playwright/test';

import {
  CREATED_NAMES,
  E01_COPY,
  adjustStock,
  chooseOption,
  continueLink,
  createDraftProduct,
  createSku,
  createVariant,
  expandVariant,
  loginAsOperator,
  openProduct,
  openReadiness,
  openStockFromRow,
  openStorefrontProduct,
  publish,
  publishAction,
  purchasePanel,
  readRows,
  selectableOptions,
  serverReadiness,
  skuRow,
  structureCounts,
  variantCard,
  warning,
} from './support/n02e01-world';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await loginAsOperator(page);
});

test('J1 — a new Product with valid structure and zero stock publishes, and reads sold out', async ({
  page,
}) => {
  const { productId, slug } = await createDraftProduct(page, {
    name: CREATED_NAMES.soldOut,
    description: 'Khăn tay cotton thêu tay họa tiết hoa sen, viền móc thủ công.',
    price: '350000',
  });

  await openProduct(page, productId);
  await createVariant(page, { color: 'Xanh navy', size: 'M' });
  await expect(variantCard(page, 'Xanh navy · M')).toHaveAttribute('data-active', 'true');
  await expandVariant(page, 'Xanh navy · M');
  await createSku(page, 'Xanh navy · M', { code: 'E01-J1-NAVY-M' });
  const sku = skuRow(page, 'E01-J1-NAVY-M');
  await expect(sku).toContainText('Dùng giá sản phẩm: 350.000 ₫');

  // The stock handoff, before any order exists anywhere in this world.
  const [orders] = await readRows<{ count: string }>('select count(*) as count from orders');
  expect(Number(orders?.count), 'no order exists in the disposable world').toBe(0);
  await openStockFromRow(sku, page);
  await expect(page.getByTestId('stock-metrics')).toBeVisible();
  // Left at zero, deliberately.

  await openReadiness(page, productId);
  await expect(page.locator('[data-testid^="requirement-"]')).toHaveCount(10);
  await expect(page.locator('[data-presentation="satisfied"]')).toHaveCount(10);
  const server = await serverReadiness(page, productId);
  expect(server).toEqual({ eligible: true, unsatisfied: [], requirementCount: 10 });
  await expect(publishAction(page)).toBeEnabled();
  await publish(page, productId);

  expect(await structureCounts(productId)).toEqual({
    variants: 1,
    activeVariants: 1,
    skus: 1,
    activeSkus: 1,
  });

  // Admin: valid structure, so no structural warning — sold out is not broken.
  await openProduct(page, productId);
  await expect(warning(page)).toHaveCount(0);

  // Storefront: visible, the SKU is structurally orderable, and it is sold out.
  await openStorefrontProduct(page, slug);
  const panel = purchasePanel(page);
  await expect(panel.getByText('350.000 VND')).toBeVisible();
  await expect(panel.getByText(E01_COPY.captionOutOfStock)).toBeVisible();
  await expect(panel.getByRole('radio', { name: /Xanh navy/u })).toHaveAccessibleName(
    new RegExp(E01_COPY.optionSoldOut, 'u'),
  );
  await expect(panel.getByRole('button', { name: E01_COPY.continueOutOfStock })).toBeDisabled();
  await expect(continueLink(page)).toHaveCount(0);
  await expect(selectableOptions(page)).toHaveCount(0);
});

test('J2 — a new Product with stock above zero publishes, and is buyable', async ({ page }) => {
  const { productId, slug } = await createDraftProduct(page, {
    name: CREATED_NAMES.inStock,
    description: 'Túi vải canvas thêu chữ theo yêu cầu, quai đeo vai chắc chắn.',
    price: '420000',
  });

  await openProduct(page, productId);
  await createVariant(page, { color: 'Kem', size: 'L' });
  await expandVariant(page, 'Kem · L');
  await createSku(page, 'Kem · L', { code: 'E01-J2-KEM-L' });
  await openStockFromRow(skuRow(page, 'E01-J2-KEM-L'), page);
  await adjustStock(page, 7, 'Nhập kho lô đầu tiên — nghiệm thu N02.E01');
  await expect(page.getByTestId('stock-metrics')).toContainText('7');

  await openReadiness(page, productId);
  await expect(page.locator('[data-presentation="satisfied"]')).toHaveCount(10);
  // Stock is not a readiness criterion and is not mentioned there.
  await expect(page.getByText('Tồn kho')).toHaveCount(0);
  await publish(page, productId);

  await openStorefrontProduct(page, slug);
  const panel = purchasePanel(page);
  await expect(panel.getByText('420.000 VND')).toBeVisible();
  await chooseOption(page, E01_COPY.variantLegend, 'Kem');
  await chooseOption(page, E01_COPY.sizeLegend, 'L');
  await expect(panel.getByText('Còn 7 sản phẩm')).toBeVisible();
  await expect(continueLink(page)).toBeVisible();
  await expect(continueLink(page)).toHaveAttribute('href', new RegExp(`/mua-hang/${slug}`, 'u'));
  // The entry is asserted, never followed: the customer transaction is U01-C1's.
});
