/**
 * E01-J09 — Storefront not-found HTTP 404 behavior (through the real gateway).
 *
 * Proves the accepted APP1-S01B boundary end-to-end: an unmatched path returns a
 * real 404 with the approved shell + content, honest recovery, no path echo, and
 * the mobile drawer still working — while valid routes stay 200.
 */
import { test, expect, assertNoAppErrors } from './support/app1-test';
import { fetchJsonInPage } from '../support/smoke-test';

const UNMATCHED = '/__app1-e01-not-found__';
const NOT_FOUND_HEADING = 'Không tìm thấy trang';

test.describe('storefront not-found (E01-J09)', () => {
  test('unmatched path returns 404 with the approved shell and content', async ({
    page,
    appErrors,
  }) => {
    const response = await page.goto(UNMATCHED);
    expect(response?.status(), 'unmatched path must be HTTP 404').toBe(404);

    // Exactly one of each shell landmark, plus the single not-found h1.
    await expect(page.getByRole('banner')).toHaveCount(1);
    await expect(page.getByRole('contentinfo')).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText(NOT_FOUND_HEADING);
    await expect(page.getByText('404', { exact: true })).toBeVisible();

    // The invalid path is never echoed back into the page.
    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body).not.toContain('__app1-e01-not-found__');

    // Primary recovery links home; secondary is honestly unavailable (not a link).
    // `exact` distinguishes the action from the brand link ("… — về trang chủ").
    const primary = page.getByRole('link', { name: 'Về trang chủ', exact: true });
    await expect(primary).toHaveAttribute('href', '/');
    await expect(page.getByRole('link', { name: 'Khám phá tác phẩm' })).toHaveCount(0);
    const secondary = page.locator('.storefront-not-found__action--secondary');
    await expect(secondary).toHaveAttribute('aria-disabled', 'true');
    await expect(secondary).toContainText('Khám phá tác phẩm');
    await expect(secondary).toContainText('Sắp ra mắt');

    // A real 404 document logs its own status; that one line is tolerated.
    assertNoAppErrors(appErrors, { allowStatus404: true });
  });

  test('primary recovery reaches home; valid routes and health stay 200', async ({ page }) => {
    await page.goto(UNMATCHED);
    await page.getByRole('link', { name: 'Về trang chủ', exact: true }).click();
    await page.waitForURL((url) => url.pathname === '/');
    await expect(page.getByRole('banner')).toBeVisible();

    // Valid routes and health remain 200 (checked in-page so the browser resolves
    // the gateway hostname, proving the response came through the gateway).
    const root = await fetchJsonInPage(page, '/');
    expect(root.status, 'valid / stays 200').toBe(200);
    const health = await fetchJsonInPage(page, '/healthz');
    expect(health.status).toBe(200);
    expect((health.body as { service?: string }).service).toBe('storefront');
  });

  test('at 390px the not-found page has no overflow and the drawer still works', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto(UNMATCHED);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflow, 'no horizontal overflow at 390px').toBe(false);

    const trigger = page.getByRole('button', { name: 'Mở menu điều hướng' });
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();
  });
});
