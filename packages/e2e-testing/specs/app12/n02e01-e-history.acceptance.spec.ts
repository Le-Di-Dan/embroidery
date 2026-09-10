/**
 * `APP12-N02.E01` J9 + §21 — inactive history is visible to the operator and
 * invisible to the visitor, and the editor renders it from one authoring read.
 */
import { expect, test } from '@playwright/test';

import {
  CREATED_NAMES,
  E01_COPY,
  LABELS,
  confirmIfAsked,
  createSku,
  createVariant,
  expandVariant,
  findCreated,
  loginAsOperator,
  openProduct,
  purchasePanel,
  recordAdminReads,
  skuRow,
  storefront,
  structureCounts,
  variantCard,
} from './support/n02e01-world';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await loginAsOperator(page);
});

test('J9 — an inactive variant and SKU stay in the Admin and never reach the Storefront', async ({
  page,
}) => {
  const { productId, slug } = await findCreated(CREATED_NAMES.inStock);

  await openProduct(page, productId);
  await createVariant(page, { color: 'Kem', size: 'XL' });
  await expandVariant(page, 'Kem · XL');
  await createSku(page, 'Kem · XL', { code: 'E01-J9-KEM-XL' });

  // A retired SKU on the live variant too, so history exists at both levels.
  await expandVariant(page, 'Kem · L');
  await createSku(page, 'Kem · L', { code: 'E01-J9-KEM-L-OLD', selling: false });

  await skuRow(page, 'E01-J9-KEM-XL')
    .getByRole('button', { name: LABELS.deactivateSku('E01-J9-KEM-XL') })
    .click();
  await confirmIfAsked(page);
  await expect(skuRow(page, 'E01-J9-KEM-XL')).toHaveAttribute('data-active', 'false');
  await variantCard(page, 'Kem · XL')
    .getByRole('button', { name: LABELS.deactivateVariant('Kem · XL') })
    .click();
  await confirmIfAsked(page);
  await expect(variantCard(page, 'Kem · XL')).toHaveAttribute('data-active', 'false');

  // The operator still sees both inactive rows after an authoritative reload.
  await page.reload();
  await expect(variantCard(page, 'Kem · XL')).toHaveAttribute('data-active', 'false');
  await expandVariant(page, 'Kem · XL');
  await expect(skuRow(page, 'E01-J9-KEM-XL')).toHaveAttribute('data-active', 'false');
  await expandVariant(page, 'Kem · L');
  await expect(skuRow(page, 'E01-J9-KEM-L-OLD')).toHaveAttribute('data-active', 'false');
  expect(await structureCounts(productId)).toEqual({
    variants: 2,
    activeVariants: 1,
    skus: 3,
    activeSkus: 1,
  });

  // The visitor sees only the live choice.
  await page.goto(storefront(`/san-pham/${slug}`));
  const panel = purchasePanel(page);
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole('group', { name: E01_COPY.sizeLegend }).getByRole('radio'),
  ).toHaveCount(1);
  await expect(panel.getByRole('radio', { name: /^XL/u })).toHaveCount(0);
  await expect(panel.getByText('Còn 7 sản phẩm')).toHaveCount(0); // nothing chosen yet
});

test('§21 — one authoring read per load or refetch, no N+1, no per-SKU stock read', async ({
  page,
}) => {
  const { productId } = await findCreated(CREATED_NAMES.inStock);
  const reads = recordAdminReads(page);

  await openProduct(page, productId);
  await expandVariant(page, 'Kem · L');
  await expandVariant(page, 'Kem · XL');
  await expect(skuRow(page, 'E01-J9-KEM-XL')).toBeVisible();
  // Let any trailing request settle before counting.
  await page.waitForLoadState('networkidle');
  expect(reads.variantLists, 'one authoring read for the initial load').toHaveLength(1);
  expect(reads.skuStock, 'no stock read merely to render the editor').toHaveLength(0);

  await page.reload();
  await expect(variantCard(page, 'Kem · XL')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(reads.variantLists, 'one more read for the reload').toHaveLength(2);

  // One mutation: its authoritative refetch is one read, not one per SKU.
  await expandVariant(page, 'Kem · XL');
  await skuRow(page, 'E01-J9-KEM-XL')
    .getByRole('button', { name: LABELS.reactivateSku('E01-J9-KEM-XL') })
    .click();
  await expect(skuRow(page, 'E01-J9-KEM-XL')).toHaveAttribute('data-active', 'true');
  await page.waitForLoadState('networkidle');
  expect(reads.variantLists, 'one refetch for the mutation').toHaveLength(3);
  expect(reads.variantLists.filter((path) => path.startsWith('N+1:'))).toHaveLength(0);
  expect(reads.skuStock).toHaveLength(0);

  // Restore the J9 history shape (inactive SKU under an inactive variant).
  await skuRow(page, 'E01-J9-KEM-XL')
    .getByRole('button', { name: LABELS.deactivateSku('E01-J9-KEM-XL') })
    .click();
  await confirmIfAsked(page);
  await expect(skuRow(page, 'E01-J9-KEM-XL')).toHaveAttribute('data-active', 'false');
});
