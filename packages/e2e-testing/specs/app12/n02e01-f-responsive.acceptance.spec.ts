/**
 * `APP12-N02.E01` §20 — responsive and accessibility acceptance at 1440, 1024
 * and 390, on the surfaces the journeys above left in their final states.
 *
 * `color-contrast` is excluded from the axe **gate** only, for the reason
 * `APP12-H08` and `N02.A01` recorded (`PO-APP12-004`, owned by `APP12-V02`).
 */
import { expect, test, type Page } from '@playwright/test';

import {
  COPY,
  CREATED_NAMES,
  LABELS,
  SEEDED,
  expandVariant,
  findCreated,
  horizontalOverflow,
  loginAsOperator,
  openProduct,
  openReadiness,
  purchasePanel,
  requirement,
  resize,
  section,
  skuRow,
  storefront,
  variantCard,
  warning,
} from './support/n02e01-world';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await loginAsOperator(page);
});

async function axe(page: Page, label: string): Promise<void> {
  const { runAxe, describeViolations } = (await import('../../support/app12/h08-axe.mjs')) as {
    runAxe: (page: Page, options: Record<string, unknown>) => Promise<{ gated: unknown[] }>;
    describeViolations: (scan: unknown) => string;
  };
  const result = await runAxe(page, { label, disableRules: ['color-contrast'] });
  expect(result.gated.length, `axe ${label}: ${describeViolations(result)}`).toBe(0);
}

test('§20 — editor, dialogs, warning and readiness hold at every viewport, axe-clean', async ({
  page,
}) => {
  const { productId, slug } = await findCreated(CREATED_NAMES.inStock);

  // A structurally broken PUBLISHED Product for the warning surface, made so
  // through the UI and restored at the end.
  await openProduct(page, SEEDED.single());
  await expandVariant(page, 'Trắng');
  await skuRow(page, 'E01-J8-WHITE')
    .getByRole('button', { name: LABELS.deactivateSku('E01-J8-WHITE') })
    .click();
  await page.getByTestId('structure-break-confirm').click();
  await expect(warning(page)).toBeVisible();

  for (const viewport of ['desktop', 'tablet', 'mobile'] as const) {
    await resize(page, viewport);

    // Editor with active and inactive history.
    await openProduct(page, productId);
    const disclosure = variantCard(page, 'Kem · XL').locator('button[aria-expanded]').first();
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    await expandVariant(page, 'Kem · XL');
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    await expect(
      skuRow(page, 'E01-J9-KEM-XL').getByRole('button', {
        name: LABELS.reactivateSku('E01-J9-KEM-XL'),
      }),
    ).toBeVisible();
    await expect(
      variantCard(page, 'Kem · L').getByRole('button', { name: LABELS.editVariant('Kem · L') }),
    ).toBeVisible();
    expect(await horizontalOverflow(page), `editor overflow at ${viewport}`).toBe(0);
    await axe(page, `editor-${viewport}`);

    // Dialog actions reachable.
    await section(page).getByRole('button', { name: COPY.addVariant }).click();
    await expect(page.getByTestId('variant-dialog-submit')).toBeInViewport();
    expect(await horizontalOverflow(page), `variant dialog overflow at ${viewport}`).toBe(0);
    await axe(page, `variant-dialog-${viewport}`);
    await page.getByTestId('variant-dialog').getByRole('button', { name: COPY.cancel }).click();

    await variantCard(page, 'Kem · L')
      .getByRole('button', { name: LABELS.addSku('Kem · L') })
      .click();
    await expect(page.getByTestId('sku-dialog-submit')).toBeInViewport();
    await axe(page, `sku-dialog-${viewport}`);
    await page.getByTestId('sku-dialog').getByRole('button', { name: COPY.cancel }).click();

    // Structural warning: stated in words, not colour.
    await openProduct(page, SEEDED.single());
    await expect(warning(page)).toContainText(COPY.warningBadge);
    await expect(warning(page)).toContainText(COPY.notSoldOut);
    expect(await horizontalOverflow(page), `warning overflow at ${viewport}`).toBe(0);
    await axe(page, `warning-${viewport}`);

    // Readiness with `Chưa xét` in words (the J10 Product has no variant).
    await openReadiness(page, SEEDED.race());
    await expect(requirement(page, 'HAS_ORDER_ELIGIBLE_SKU')).toContainText(COPY.pending);
    await expect(requirement(page, 'HAS_ACTIVE_VARIANT')).toContainText(
      COPY.requirementUnsatisfied,
    );
    expect(await horizontalOverflow(page), `readiness overflow at ${viewport}`).toBe(0);
    await axe(page, `readiness-${viewport}`);

    // The public page the operator's structure produced.
    await page.goto(storefront(`/san-pham/${slug}`));
    await expect(purchasePanel(page)).toBeVisible();
    expect(await horizontalOverflow(page), `storefront overflow at ${viewport}`).toBe(0);
  }

  // Restore J8's repaired state.
  await resize(page, 'desktop');
  await openProduct(page, SEEDED.single());
  await expandVariant(page, 'Trắng');
  await skuRow(page, 'E01-J8-WHITE')
    .getByRole('button', { name: LABELS.reactivateSku('E01-J8-WHITE') })
    .click();
  await expect(warning(page)).toHaveCount(0);
});
