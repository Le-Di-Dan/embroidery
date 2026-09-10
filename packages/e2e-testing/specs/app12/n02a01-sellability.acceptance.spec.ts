/**
 * `APP12-N02.A01` — Admin Ready-Made sellability authoring, live.
 *
 * ```text
 * A  DRAFT empty → sellable   create variant · create SKU · stock handoff works
 * B  variant refusals         blank labels · normalized duplicate
 * C  SKU ambiguity            second selling SKU refused · nothing deactivated
 * D  PUBLISHED recovery       two malformed live shapes, repaired in place
 * E  readiness Chưa xét       states A, B and C, one actionable failure each
 * F  sold out                 10/10 with stock 0 · publish stays available
 * V  visual matrix            1440 / 1024 / 390, no horizontal overflow at 390
 * X  accessibility            axe serious/critical = 0 on every changed surface
 * ```
 *
 * Every journey runs against **this run's disposable database**, the real API,
 * the real Admin and the real gateway, as a real operator logged in through the
 * real form. Every sellability mutation used as evidence is made through the
 * Admin UI — there is no SQL that inserts a variant or a SKU anywhere in this
 * suite, because a fixture that wrote one would prove the fixture. No shared
 * development database is written and no `APP12-G03` dataset is created.
 *
 * Serial: the journeys author variants and SKUs on shared Products, and the
 * invariant under test — at most one order-eligible SKU per variant — is
 * decided by the server against rows a parallel worker would be changing at the
 * same time.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  BASE_PRICE_DISPLAY,
  COPY,
  LABELS,
  PRODUCTS,
  createSku,
  createVariant,
  expandVariant,
  horizontalOverflow,
  loginAsOperator,
  openProduct,
  openReadiness,
  publishAction,
  publishedBanner,
  requirement,
  resize,
  section,
  skuRow,
  variantCard,
  warning,
} from './support/n02a01-world';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }: { page: Page }) => {
  await loginAsOperator(page);
});

test('A — a DRAFT with nothing to sell becomes sellable, and its stock screen opens', async ({
  page,
}) => {
  await openProduct(page, PRODUCTS.authoring());
  await expect(section(page).getByTestId('sellability-empty')).toContainText(COPY.emptyTitle);

  await createVariant(page, { color: 'Xanh navy', size: 'M' });

  const navy = variantCard(page, 'Xanh navy · M');
  await expect(navy).toBeVisible();
  await expect(navy).toHaveAttribute('data-active', 'true');
  // The collapsed row states the sellability truth before anything is expanded.
  await expect(navy).toContainText(COPY.noOrderEligibleSku);

  await expandVariant(page, 'Xanh navy · M');
  await createSku(page, 'Xanh navy · M', { code: 'N02-NAVY-M' });

  const sku = skuRow(page, 'N02-NAVY-M');
  await expect(sku).toBeVisible();
  await expect(sku).toHaveAttribute('data-active', 'true');
  // Inheritance is legible on the row itself: no dialog is opened to learn it.
  await expect(sku).toContainText(`Dùng giá sản phẩm: ${BASE_PRICE_DISPLAY}`);
  await expect(navy).toContainText('SKU đang bán: N02-NAVY-M');

  // The stock handoff, for a SKU created seconds ago and no order anywhere in
  // the world. This is `FU-APP12-N02-STOCK-REACHABILITY`: before this section
  // existed, `/kho/skus/{skuId}` was reachable only from an order row, for a
  // Product that could not be ordered.
  await sku.getByRole('link', { name: new RegExp(COPY.manageStock) }).click();
  await expect(page).toHaveURL(/\/kho\/skus\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: COPY.stockScreenHeading })).toBeVisible();

  await openProduct(page, PRODUCTS.authoring());
  await expect(variantCard(page, 'Xanh navy · M')).toContainText('SKU đang bán: N02-NAVY-M');
});

test('B — a variant with no label and a duplicate variant are both refused safely', async ({
  page,
}) => {
  await openProduct(page, PRODUCTS.authoring());

  // Neither label filled: refused before anything is sent.
  await section(page).getByRole('button', { name: COPY.addVariant }).click();
  await page.getByTestId('variant-dialog-submit').click();
  await expect(page.getByTestId('variant-dialog')).toContainText(COPY.labelRequired);

  // The normalized duplicate of the variant journey A created. Case and
  // internal whitespace are collapsed server-side, so this is a duplicate.
  await page.getByTestId('variant-color').fill('  xanh   NAVY ');
  await page.getByTestId('variant-size').fill('m');
  await page.getByTestId('variant-dialog-submit').click();

  const alert = page.getByTestId('variant-dialog').getByRole('alert');
  await expect(alert).toContainText(COPY.duplicateTitle);
  // No raw code, no SQLSTATE, no constraint name.
  await expect(alert).not.toContainText('PRODUCT_VARIANT_DUPLICATE');
  await expect(alert).not.toContainText('23505');
  // The staged labels survive the refusal.
  await expect(page.getByTestId('variant-color')).toHaveValue('  xanh   NAVY ');

  await page.getByTestId('variant-dialog').getByRole('button', { name: COPY.cancel }).click();
  await expect(section(page).locator('li.product-sellability__variant')).toHaveCount(1);
});

test('C — a second selling SKU is refused, and the existing one is left alone', async ({
  page,
}) => {
  await openProduct(page, PRODUCTS.authoring());
  await expandVariant(page, 'Xanh navy · M');

  await createSku(page, 'Xanh navy · M', { code: 'N02-NAVY-M-2' });

  const dialog = page.getByTestId('sku-dialog');
  const alert = dialog.getByRole('alert');
  await expect(alert).toContainText(COPY.ambiguousTitle);
  // The refusal names the SKU already selling and says the system will not
  // deactivate it for the operator.
  await expect(alert).toContainText('N02-NAVY-M');
  await expect(alert).toContainText(COPY.noAutoDeactivate);
  await expect(alert).not.toContainText('SKU_ORDER_ELIGIBLE_AMBIGUOUS');

  // Nothing was committed and the staged code is still there.
  await expect(dialog.getByTestId('sku-code')).toHaveValue('N02-NAVY-M-2');
  await expect(skuRow(page, 'N02-NAVY-M')).toHaveAttribute('data-active', 'true');

  // The second legitimate path the refusal offers: create it inactive now.
  await dialog.getByTestId('sku-active').uncheck();
  await dialog.getByTestId('sku-dialog-submit').click();

  await expect(skuRow(page, 'N02-NAVY-M-2')).toHaveAttribute('data-active', 'false');
  // The original is untouched — the system deactivated nothing on its own.
  await expect(skuRow(page, 'N02-NAVY-M')).toHaveAttribute('data-active', 'true');
});

test('D1 — a live Product with zero variants is repaired in place, without unpublishing', async ({
  page,
}) => {
  // This Product's shape is not a contrivance: nothing in the delivered system
  // has ever created a variant, so every PUBLISHED Product in the world looks
  // like this. It is the exact state `N02.G01` found live.
  await openProduct(page, PRODUCTS.publishedA());

  await expect(warning(page)).toBeVisible();
  await expect(warning(page)).toContainText(COPY.warningBadge);
  await expect(warning(page)).toContainText(COPY.warningTitle);
  await expect(warning(page)).toContainText(COPY.warningEvidence);
  await expect(page.getByTestId('warning-active-variants')).toHaveText(
    'Phiên bản đang hoạt động: 0',
  );
  await expect(page.getByTestId('warning-eligible-skus')).toHaveText('SKU có thể đặt hàng: 0');
  // Structural unsellability is never labelled sold-out.
  await expect(warning(page)).toContainText(COPY.notSoldOut);
  await expect(warning(page)).toContainText(COPY.toSection);
  await expect(warning(page)).toContainText(COPY.toReadiness);

  // Repair, with no unpublish anywhere in the flow.
  await createVariant(page, { color: 'Đỏ', size: 'L' });
  await expandVariant(page, 'Đỏ · L');
  await createSku(page, 'Đỏ · L', { code: 'N02-PUBA-RED-L' });

  await expect(skuRow(page, 'N02-PUBA-RED-L')).toHaveAttribute('data-active', 'true');
  // The warning clears against the authoritative refetch, not optimistically.
  await expect(warning(page)).toHaveCount(0);

  await page.reload();
  await expect(warning(page)).toHaveCount(0);
  // Still published, throughout.
  await expect(publishedBanner(page)).toBeVisible();
});

test('D2 — breaking and restoring a live Product’s last selling SKU keeps it PUBLISHED', async ({
  page,
}) => {
  // Build the second historical malformed shape through delivered operations,
  // starting from a valid PUBLISHED Product.
  await openProduct(page, PRODUCTS.publishedB());
  await createVariant(page, { color: 'Trắng' });
  await expandVariant(page, 'Trắng');
  await createSku(page, 'Trắng', { code: 'N02-PUBB-WHITE' });
  await expect(warning(page)).toHaveCount(0);

  // The last selling SKU. The confirmation states the arithmetic, states that
  // the Product stays published, and says this is not "hết hàng".
  await skuRow(page, 'N02-PUBB-WHITE')
    .getByRole('button', { name: LABELS.deactivateSku('N02-PUBB-WHITE') })
    .click();
  const confirm = page.getByTestId('structure-break-lastSku');
  await expect(confirm).toBeVisible();
  await expect(page.getByTestId('structure-arithmetic')).toHaveText(
    'Sau thay đổi này: 0 SKU có thể đặt hàng.',
  );
  await expect(confirm).toContainText(COPY.remainsPublished);
  await expect(confirm).toContainText(COPY.notSoldOut);
  // The safe answer is present and the destructive one is not the default.
  await expect(confirm.getByTestId('structure-break-keep')).toBeVisible();

  await confirm.getByTestId('structure-break-confirm').click();

  await expect(warning(page)).toBeVisible();
  await expect(page.getByTestId('warning-active-variants')).toHaveText(
    'Phiên bản đang hoạt động: 1',
  );
  await expect(page.getByTestId('warning-eligible-skus')).toHaveText('SKU có thể đặt hàng: 0');
  await expect(publishedBanner(page)).toBeVisible();

  // Readiness agrees with the banner: the Product is live and not orderable.
  await openReadiness(page, PRODUCTS.publishedB());
  await expect(requirement(page, 'HAS_ORDER_ELIGIBLE_SKU')).toHaveAttribute(
    'data-presentation',
    'unsatisfied',
  );

  // Recovery is one action and is never gated by a confirmation.
  await openProduct(page, PRODUCTS.publishedB());
  await expandVariant(page, 'Trắng');
  await skuRow(page, 'N02-PUBB-WHITE')
    .getByRole('button', { name: LABELS.reactivateSku('N02-PUBB-WHITE') })
    .click();
  await expect(warning(page)).toHaveCount(0);
  await expect(publishedBanner(page)).toBeVisible();

  // And the last active variant carries its own confirmation.
  await variantCard(page, 'Trắng')
    .getByRole('button', { name: LABELS.deactivateVariant('Trắng') })
    .click();
  const variantConfirm = page.getByTestId('structure-break-lastVariant');
  await expect(variantConfirm).toBeVisible();
  await expect(variantConfirm).toContainText(COPY.remainsPublished);
  await variantConfirm.getByTestId('structure-break-keep').click();
  // The safe answer changed nothing.
  await expect(variantCard(page, 'Trắng')).toHaveAttribute('data-active', 'true');
});

test('E — the readiness checklist defers a criterion it has not evaluated', async ({ page }) => {
  const productId = PRODUCTS.readiness();

  // State A — no active variant. Two dependants read `Chưa xét`, and exactly
  // one row is an actionable failure.
  await openReadiness(page, productId);
  await expect(requirement(page, 'HAS_ACTIVE_VARIANT')).toHaveAttribute(
    'data-presentation',
    'unsatisfied',
  );
  for (const code of ['HAS_ORDER_ELIGIBLE_SKU', 'SKU_PRICE_RESOLVABLE']) {
    await expect(requirement(page, code)).toHaveAttribute('data-presentation', 'pending');
    await expect(requirement(page, code)).toContainText(COPY.pending);
    // Presentation only: the server's verdict is untouched underneath.
    await expect(requirement(page, code)).toHaveAttribute('data-satisfied', 'true');
  }
  await expect(page.locator('[data-presentation="unsatisfied"]')).toHaveCount(1);

  // State B — an active variant with no orderable SKU.
  await openProduct(page, productId);
  await createVariant(page, { size: 'Freesize' });
  await openReadiness(page, productId);
  await expect(requirement(page, 'HAS_ACTIVE_VARIANT')).toHaveAttribute(
    'data-presentation',
    'satisfied',
  );
  await expect(requirement(page, 'HAS_ORDER_ELIGIBLE_SKU')).toHaveAttribute(
    'data-presentation',
    'unsatisfied',
  );
  await expect(requirement(page, 'SKU_PRICE_RESOLVABLE')).toHaveAttribute(
    'data-presentation',
    'pending',
  );
  await expect(page.locator('[data-presentation="unsatisfied"]')).toHaveCount(1);

  // State C — a selling SKU whose override is "0". The Product's own base price
  // is fine and stays green; the failure is the SKU's, and the operator is sent
  // there rather than to a price field with nothing wrong with it.
  await openProduct(page, productId);
  await expandVariant(page, 'Freesize');
  await createSku(page, 'Freesize', { code: 'N02-FREE-ZERO', override: '0' });
  await expect(skuRow(page, 'N02-FREE-ZERO')).toContainText('Giá riêng cho SKU: 0 ₫');
  await expect(skuRow(page, 'N02-FREE-ZERO')).toContainText('Chưa có giá bán hợp lệ');

  await openReadiness(page, productId);
  await expect(requirement(page, 'PRODUCT_PRICE_READY')).toHaveAttribute(
    'data-presentation',
    'satisfied',
  );
  await expect(requirement(page, 'SKU_PRICE_RESOLVABLE')).toHaveAttribute(
    'data-presentation',
    'unsatisfied',
  );
  await expect(page.locator('[data-presentation="unsatisfied"]')).toHaveCount(1);
});

test('F — a structurally valid Product with zero stock reads 10/10 and may be published', async ({
  page,
}) => {
  const productId = PRODUCTS.readiness();

  // Repair state C by returning the SKU to the Product's price. Its stock has
  // never been touched by this run and no order exists anywhere in the world,
  // so it is genuinely zero.
  await openProduct(page, productId);
  await expandVariant(page, 'Freesize');
  await skuRow(page, 'N02-FREE-ZERO')
    .getByRole('button', { name: LABELS.editSku('N02-FREE-ZERO') })
    .click();
  await page.getByTestId('sku-price-inherit').check();
  await page.getByTestId('sku-dialog-submit').click();
  await expect(skuRow(page, 'N02-FREE-ZERO')).toContainText(
    `Dùng giá sản phẩm: ${BASE_PRICE_DISPLAY}`,
  );

  await openReadiness(page, productId);
  const rows = page.locator('[data-testid^="requirement-"]');
  await expect(rows).toHaveCount(10);
  await expect(page.locator('[data-presentation="satisfied"]')).toHaveCount(10);
  // Stock is not a criterion, is not counted and is not mentioned.
  await expect(page.getByText('Tồn kho')).toHaveCount(0);
  // Publish is available. It is deliberately not pressed: A01 authors
  // sellability, and the lifecycle transition is not this package's to make.
  await expect(publishAction(page)).toBeEnabled();
});

test('V — the section holds at 1440, 1024 and 390, with no horizontal overflow', async ({
  page,
}) => {
  for (const viewport of ['desktop', 'tablet', 'mobile'] as const) {
    await resize(page, viewport);
    await openProduct(page, PRODUCTS.authoring());

    const card = variantCard(page, 'Xanh navy · M');
    await expect(card).toBeVisible();
    await expect(
      card.getByRole('button', { name: LABELS.editVariant('Xanh navy · M') }),
    ).toBeVisible();

    await expandVariant(page, 'Xanh navy · M');
    const sku = skuRow(page, 'N02-NAVY-M');
    await expect(sku).toBeVisible();
    // The stock handoff is reachable at every width, including the one where a
    // compressed table would have pushed it off screen.
    await expect(sku.getByRole('link', { name: new RegExp(COPY.manageStock) })).toBeVisible();
    await expect(section(page).getByRole('button', { name: COPY.addVariant })).toBeVisible();

    expect(await horizontalOverflow(page), `horizontal overflow at ${viewport}`).toBe(0);

    // The dialogs have to fit the viewport too — a primary action off screen at
    // 390 is the failure the package names explicitly.
    await section(page).getByRole('button', { name: COPY.addVariant }).click();
    await expect(page.getByTestId('variant-dialog-submit')).toBeInViewport();
    expect(await horizontalOverflow(page), `dialog overflow at ${viewport}`).toBe(0);
    await page.getByTestId('variant-dialog').getByRole('button', { name: COPY.cancel }).click();
  }
  await resize(page, 'desktop');
});

test('X — every changed surface is axe-clean at 1440 and at 390', async ({ page }) => {
  /**
   * `color-contrast` is excluded from the **gate** and from nothing else, for
   * the reason `APP12-H08` recorded: the failing token pairs are named by the
   * Product Owner's own ruling `PO-APP12-004` and are `APP12-V02`'s to change,
   * not this package's. Every other rule counts, and no rule was disabled to
   * reach a number.
   */
  const { runAxe, describeViolations } = (await import('../../support/app12/h08-axe.mjs')) as {
    runAxe: (page: Page, options: Record<string, unknown>) => Promise<{ gated: unknown[] }>;
    describeViolations: (scan: unknown) => string;
  };
  const scan = async (label: string) => {
    const result = await runAxe(page, { label, disableRules: ['color-contrast'] });
    expect(result.gated.length, `axe ${label}: ${describeViolations(result)}`).toBe(0);
  };

  await openProduct(page, PRODUCTS.authoring());
  await expandVariant(page, 'Xanh navy · M');
  await scan('sellability-section-1440');

  await section(page).getByRole('button', { name: COPY.addVariant }).click();
  await expect(page.getByTestId('variant-dialog')).toBeVisible();
  await scan('variant-dialog');
  await page.getByTestId('variant-dialog').getByRole('button', { name: COPY.cancel }).click();

  await variantCard(page, 'Xanh navy · M')
    .getByRole('button', { name: LABELS.addSku('Xanh navy · M') })
    .click();
  await expect(page.getByTestId('sku-dialog')).toBeVisible();
  await scan('sku-dialog');
  await page.getByTestId('sku-dialog').getByRole('button', { name: COPY.cancel }).click();

  // The published surfaces, where the warning and the readiness list live.
  await openProduct(page, PRODUCTS.publishedA());
  await scan('published-sellability-1440');

  await openReadiness(page, PRODUCTS.readiness());
  await scan('readiness-ten-criteria');

  await resize(page, 'mobile');
  await openProduct(page, PRODUCTS.authoring());
  await expandVariant(page, 'Xanh navy · M');
  await scan('sellability-section-390');
  await resize(page, 'desktop');
});
