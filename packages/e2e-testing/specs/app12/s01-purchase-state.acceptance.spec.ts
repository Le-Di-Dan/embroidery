/**
 * `APP12-S01` — the Ready-Made purchase state, in a real browser.
 *
 * Real Chromium, against the real Storefront process, served through the real
 * Nginx gateway, reading the real API, over a disposable PostgreSQL carrying the
 * migration chain and a clearly test-only catalog. Nothing here is mocked, and
 * nothing here writes: the whole checkpoint is a read, and the suite asserts the
 * continue `href` rather than following it, because `/mua-hang/[slug]` is
 * `APP12-S02`'s route and does not exist yet.
 *
 * The three approved viewports run as one serial journey per viewport, because
 * the panel's behaviour is a sequence — choose, choose, adjust — and Playwright
 * gives no ordering guarantee across projects.
 */
import { expect, test, type Page } from '@playwright/test';

const PURCHASABLE = process.env['E2E_APP12_S01_PURCHASABLE_SLUG'] ?? '';
const UNBUYABLE = process.env['E2E_APP12_S01_UNBUYABLE_SLUG'] ?? '';
const CATEGORY = process.env['E2E_APP12_S01_CATEGORY_SLUG'] ?? '';

/** The approved viewports (`APP12-D01` §L). */
const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 900 },
  { name: '390', width: 390, height: 844 },
] as const;

const COPY = {
  variantLegend: 'Phân loại',
  sizeLegend: 'Kích thước',
  quantityLabel: 'Số lượng',
  continue: 'Mua ngay',
  continueOutOfStock: 'Tạm hết hàng',
  priceCaption: 'Chưa gồm phí giao hàng.',
  priceCaptionOutOfStock: 'Hiện chưa có phân loại nào còn hàng.',
  sizeRequired: 'Vui lòng chọn kích thước.',
  soldOut: '· hết',
} as const;

test.beforeAll(() => {
  expect(
    PURCHASABLE,
    'The orchestrator must export the seeded fixture slugs (run via `pnpm e2e:app12:s01`).',
  ).not.toBe('');
});

function panel(page: Page) {
  return page.getByRole('region', { name: 'Mua sản phẩm có sẵn' });
}

function group(page: Page, legend: string) {
  return panel(page).getByRole('group', { name: legend });
}

/**
 * Select an option, and prove it stuck.
 *
 * The panel is a client island on a server-rendered page, so a click that lands
 * in the window between first paint and hydration toggles the native radio and
 * is then reset when React takes the controlled input over. That is ordinary
 * Next.js behaviour rather than a defect — the page is readable before any
 * JavaScript arrives, which is the point — but it makes a bare `check()` racy.
 * Retrying the check *and its outcome* together is deterministic: it either
 * lands after hydration or fails loudly, and it never silently proceeds with an
 * unselected option.
 */
async function choose(page: Page, legend: string, option: string) {
  const radio = group(page, legend).getByRole('radio', { name: new RegExp(`^${option}`) });
  await expect(async () => {
    await radio.check({ timeout: 2_000 });
    await expect(radio).toBeChecked({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

for (const viewport of VIEWPORTS) {
  test.describe(`viewport ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('renders the purchase panel and resolves a SKU from the two axes', async ({ page }) => {
      await page.goto(`/san-pham/${PURCHASABLE}`);
      await expect(panel(page)).toBeVisible();

      // The Product's own published price, before any SKU is resolved.
      await expect(panel(page).getByText('450.000 VND')).toBeVisible();
      await expect(panel(page).getByText(COPY.priceCaption)).toBeVisible();

      // Nothing is preselected, and the action is unavailable.
      await expect(panel(page).getByRole('radio', { checked: true })).toHaveCount(0);
      await expect(panel(page).getByRole('button', { name: COPY.continue })).toBeDisabled();
      await expect(panel(page).getByRole('link', { name: COPY.continue })).toHaveCount(0);

      // Choosing only the first axis binds the approved error to the second.
      await choose(page, COPY.variantLegend, 'Trắng');
      await expect(group(page, COPY.sizeLegend)).toContainText(COPY.sizeRequired);
      await expect(panel(page).getByRole('button', { name: COPY.continue })).toBeDisabled();

      // Completing the selection resolves the SKU and its overridden price.
      await choose(page, COPY.sizeLegend, 'M');
      await expect(panel(page).getByText('399.000 VND')).toBeVisible();
      await expect(panel(page).getByText('450.000 VND')).toHaveCount(0);
      await expect(panel(page).getByText('Còn 8 sản phẩm')).toBeVisible();
    });

    test('follows the price and the availability when the SKU changes', async ({ page }) => {
      await page.goto(`/san-pham/${PURCHASABLE}`);
      await choose(page, COPY.variantLegend, 'Trắng');
      await choose(page, COPY.sizeLegend, 'M');
      await expect(panel(page).getByText('399.000 VND')).toBeVisible();

      await choose(page, COPY.variantLegend, 'Đen');
      // The second variant has no override, so the base price is what its SKU
      // resolves to — a different number reached by a different route.
      await expect(panel(page).getByText('450.000 VND')).toBeVisible();
      await expect(panel(page).getByText('Còn 3 sản phẩm')).toBeVisible();
    });

    test('refuses a sold-out size and never claims stock it was not given', async ({ page }) => {
      await page.goto(`/san-pham/${PURCHASABLE}`);
      await choose(page, COPY.variantLegend, 'Trắng');

      const large = group(page, COPY.sizeLegend).getByRole('radio', { name: /^L/ });
      await expect(large).toBeDisabled();
      await expect(group(page, COPY.sizeLegend)).toContainText(COPY.soldOut);

      // The variant carrying two eligible SKUs is offered but not selectable, and
      // is NOT captioned as sold out: nothing about that refusal is inventory.
      const ambiguous = group(page, COPY.variantLegend).getByRole('radio', {
        name: /^Xanh rêu/,
      });
      await expect(ambiguous).toBeDisabled();
      // Neither of its SKU prices, and neither of its ids, reaches the customer.
      await expect(panel(page).getByText('100.000 VND')).toHaveCount(0);
      await expect(panel(page)).not.toContainText('app12-s01-e2e-Xanh');
    });

    test('bounds the quantity by the availability the server published', async ({ page }) => {
      await page.goto(`/san-pham/${PURCHASABLE}`);
      await choose(page, COPY.variantLegend, 'Đen');
      await choose(page, COPY.sizeLegend, 'M');

      // By role, not by label: the two step buttons are named 'Giảm số lượng' and
      // 'Tăng số lượng', so a label query for 'Số lượng' matches all three.
      const quantity = panel(page).getByRole('spinbutton', { name: COPY.quantityLabel });
      await expect(quantity).toHaveValue('1');
      await expect(quantity).toHaveAttribute('max', '3');

      const increase = panel(page).getByRole('button', { name: 'Tăng số lượng' });
      await increase.click();
      await increase.click();
      await expect(quantity).toHaveValue('3');
      await expect(increase).toBeDisabled();

      // A typed value past the ceiling never reaches the continue URL.
      await quantity.fill('99');
      await quantity.blur();
      await expect(quantity).toHaveValue('3');
    });

    test('composes a continue href carrying only the two selection hints', async ({ page }) => {
      await page.goto(`/san-pham/${PURCHASABLE}`);
      await choose(page, COPY.variantLegend, 'Đen');
      await choose(page, COPY.sizeLegend, 'M');
      await panel(page).getByRole('button', { name: 'Tăng số lượng' }).click();

      const href = await panel(page)
        .getByRole('link', { name: COPY.continue })
        .getAttribute('href');
      expect(href).not.toBeNull();
      const url = new URL(href ?? '', 'http://localhost');
      expect(url.pathname).toBe(`/mua-hang/${PURCHASABLE}`);
      expect([...url.searchParams.keys()].sort()).toEqual(['quantity', 'sku']);
      expect(url.searchParams.get('quantity')).toBe('2');
      // A real SKU id, not a variant id and not the product slug.
      expect(url.searchParams.get('sku')).toMatch(/^[0-9a-f-]{36}$/);
      // Explicitly NOT followed: `/mua-hang/[slug]` is `APP12-S02`'s route.
    });

    test('renders a Product with nothing to sell without pretending otherwise', async ({
      page,
    }) => {
      const response = await page.goto(`/san-pham/${UNBUYABLE}`);
      expect(response?.status()).toBe(200);

      // The page itself is intact: title, story, breadcrumb, continuation.
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(panel(page).getByText(COPY.priceCaptionOutOfStock)).toBeVisible();
      await expect(
        panel(page).getByRole('button', { name: COPY.continueOutOfStock }),
      ).toBeDisabled();
      await expect(panel(page).getByRole('link')).toHaveCount(0);
      await expect(panel(page).getByRole('spinbutton')).toHaveCount(0);
      // No restock promise was invented.
      await expect(panel(page)).not.toContainText(/sắp có|sắp về|thông báo khi/i);
    });

    test('keeps the dynamic category trail and withholds every Wave-2 path', async ({ page }) => {
      await page.goto(`/san-pham/${PURCHASABLE}`);

      // The breadcrumb and the continuation both address the category by its
      // runtime slug — no fixed list, and this category exists only in this run,
      // so a compiled taxonomy could not produce this link at all.
      const categoryLinks = page.locator(`a[href="/kham-pha?category=${CATEGORY}"]`);
      expect(await categoryLinks.count()).toBeGreaterThan(0);
      // At 390 the delivered breadcrumb collapses to the single back link, so
      // *which* of them is on screen differs by viewport; that at least one is
      // reachable is the invariant, and the collapse is APP2-S02's design.
      await expect(categoryLinks.locator('visible=true').first()).toBeVisible();

      // Wave 2 is off: no Studio entry, no commission call to action anywhere on
      // the page, and the panel is still fully usable.
      await expect(page.locator(`a[href*="/thiet-ke"]`)).toHaveCount(0);
      await expect(page.locator(`a[href^="/yeu-cau"]`)).toHaveCount(0);
      await expect(panel(page)).toBeVisible();
    });

    test('is operable from the keyboard and never overlapped by the social dock', async ({
      page,
    }) => {
      await page.goto(`/san-pham/${PURCHASABLE}`);

      // Reach the first option by keyboard alone and select it with the platform
      // gesture for a radio, then read what the browser thinks is focused.
      const white = group(page, COPY.variantLegend).getByRole('radio', { name: /^Trắng/ });
      await white.focus();
      await page.keyboard.press('Space');
      await expect(white).toBeChecked();
      // Arrow keys move within the group, which is what a real radio group gives
      // and a styled div never would.
      await page.keyboard.press('ArrowDown');
      await expect(
        group(page, COPY.variantLegend).getByRole('radio', { name: /^Đen/ }),
      ).toBeChecked();

      await choose(page, COPY.sizeLegend, 'M');
      const cta = panel(page).getByRole('link', { name: COPY.continue });
      await cta.scrollIntoViewIfNeeded();

      // The floating contact dock must not sit on top of the action. Compared as
      // real rendered rectangles rather than as a class name.
      const ctaBox = await cta.boundingBox();
      expect(ctaBox).not.toBeNull();
      const dock = page.locator('.storefront-shell__handoff-dock');
      if ((await dock.count()) > 0) {
        const dockBox = await dock.boundingBox();
        if (dockBox !== null && ctaBox !== null) {
          const overlaps =
            ctaBox.x < dockBox.x + dockBox.width &&
            dockBox.x < ctaBox.x + ctaBox.width &&
            ctaBox.y < dockBox.y + dockBox.height &&
            dockBox.y < ctaBox.y + ctaBox.height;
          expect(overlaps, 'the contact dock overlaps the purchase action').toBe(false);
        }
      }

      // Nothing anywhere on the page scrolls sideways.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test('captures the approved states', async ({ page }, testInfo) => {
      await page.goto(`/san-pham/${PURCHASABLE}`);
      await choose(page, COPY.variantLegend, 'Trắng');
      await choose(page, COPY.sizeLegend, 'M');
      await panel(page).scrollIntoViewIfNeeded();
      await testInfo.attach(`purchase-in-stock-${viewport.name}`, {
        body: await panel(page).screenshot(),
        contentType: 'image/png',
      });

      await page.goto(`/san-pham/${UNBUYABLE}`);
      await panel(page).scrollIntoViewIfNeeded();
      await testInfo.attach(`purchase-out-of-stock-${viewport.name}`, {
        body: await panel(page).screenshot(),
        contentType: 'image/png',
      });
    });
  });
}

test.describe('runtime is read-only', () => {
  test('a page view issues no write and creates nothing', async ({ page }) => {
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET' && request.method() !== 'HEAD') {
        writes.push(`${request.method()} ${request.url()}`);
      }
    });

    await page.goto(`/san-pham/${PURCHASABLE}`);
    await choose(page, COPY.variantLegend, 'Trắng');
    await choose(page, COPY.sizeLegend, 'M');
    await panel(page).getByRole('button', { name: 'Tăng số lượng' }).click();

    expect(writes, 'the purchase panel must issue no state-changing request').toEqual([]);
  });
});
