/**
 * E01-J08 — Storefront shared shell responsive behavior (through the real
 * gateway). Confirms the accepted APP1-S01A shell: one set of landmarks at every
 * breakpoint, the Full header on desktop vs the Compact header (drawer trigger)
 * on tablet/mobile, and a fully accessible mobile drawer.
 */
import { type Page } from '@playwright/test';

import { test, expect, assertNoAppErrors } from './support/app1-test';

const NAV_TRIGGER = 'Mở menu điều hướng';
const PRIMARY_NAV = 'Điều hướng chính';
const DRAWER = 'Điều hướng';

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

async function expectSingleShell(page: Page): Promise<void> {
  await expect(page.getByRole('banner')).toHaveCount(1);
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('contentinfo')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Bỏ qua tới nội dung chính' })).toHaveAttribute(
    'href',
    '#main-content',
  );
}

test.describe('storefront shell (E01-J08)', () => {
  test('desktop 1440 renders the Full header inside one shell, no drawer trigger', async ({
    page,
    appErrors,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expectSingleShell(page);
    await expect(page.getByRole('navigation', { name: PRIMARY_NAV })).toBeVisible();
    await expect(page.getByRole('button', { name: NAV_TRIGGER })).toBeHidden();
    expect(await hasHorizontalOverflow(page)).toBe(false);
    assertNoAppErrors(appErrors);
  });

  test('tablet 1024 renders the Compact header with the drawer trigger', async ({
    page,
    appErrors,
  }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/');
    await expectSingleShell(page);
    await expect(page.getByRole('button', { name: NAV_TRIGGER })).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);
    assertNoAppErrors(appErrors);
  });

  test('mobile 390 drawer: open, Escape/backdrop close, focus return, scroll lock', async ({
    page,
    appErrors,
  }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto('/');
    await expectSingleShell(page);
    expect(await hasHorizontalOverflow(page)).toBe(false);

    const trigger = page.getByRole('button', { name: NAV_TRIGGER });
    const drawer = page.getByRole('dialog', { name: DRAWER });
    const bodyOverflow = () => page.evaluate(() => document.body.style.overflow);

    // Open → drawer visible, expanded, scroll locked.
    await trigger.click();
    await expect(drawer).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(await bodyOverflow()).toBe('hidden');

    // Escape → closed, focus returns to trigger, scroll restored.
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();
    expect(await bodyOverflow()).toBe('');

    // Reopen → backdrop click closes and also returns focus.
    await trigger.click();
    await expect(drawer).toBeVisible();
    await page.locator('.storefront-shell__scrim').dispatchEvent('click');
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await bodyOverflow()).toBe('');

    assertNoAppErrors(appErrors);
  });
});
