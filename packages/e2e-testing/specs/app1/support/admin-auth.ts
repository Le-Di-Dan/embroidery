/**
 * Admin authentication helpers for the E01 journeys. They drive the real login
 * form and logout control through the gateway — no API shortcut, no cookie
 * injection. Field selectors use the stable input ids; the asserted copy is the
 * approved Vietnamese text (source: apps/admin `staff-login-copy` /
 * `admin-shell-copy`) intentionally duplicated as a test expectation.
 *
 * A password is never written to a log or the URL: it is typed into the field
 * and submitted as a JSON body by the app.
 */
import { expect, type Page } from '@playwright/test';

import type { AdminCredentials } from './app1-test';

/** Stable ids from the login form; and the approved control copy. */
export const LOGIN = {
  emailInput: '#staff-login-email',
  passwordInput: '#staff-login-password',
  submitName: 'Đăng nhập',
  passwordToggleName: 'Hiện mật khẩu',
  authAlert: 'Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại thông tin đăng nhập.',
} as const;

export const SHELL = {
  logoutName: 'Đăng xuất',
  placeholderHeading: 'Quyền truy cập quản trị đã sẵn sàng',
  navTriggerName: 'Mở menu điều hướng',
} as const;

/** Fills and submits the login form with the given credentials (no assertion). */
export async function submitLogin(page: Page, email: string, password: string): Promise<void> {
  await page.locator(LOGIN.emailInput).fill(email);
  await page.locator(LOGIN.passwordInput).fill(password);
  await page.getByRole('button', { name: LOGIN.submitName }).click();
}

/**
 * Logs in as the bootstrap Admin and waits for the authenticated shell. Starts at
 * `/login` and proves the post-login landing is the authenticated home (`/`).
 */
export async function loginAsAdmin(page: Page, admin: AdminCredentials): Promise<void> {
  await page.goto('/login');
  await submitLogin(page, admin.email, admin.password);
  await expect(page.getByRole('button', { name: SHELL.logoutName })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/');
}

/** Clicks logout and waits for the return to `/login`. */
export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: SHELL.logoutName }).click();
  await page.waitForURL('**/login');
}
