/**
 * Shared base for the APP1-E01 cross-layer acceptance specs.
 *
 * Extends the Playwright test with:
 *  - `appErrors`: page + severe-console errors collected during the test, so each
 *    journey can assert that no app-code/hydration error occurred. Unlike the
 *    smoke base it does NOT auto-assert empty — a real 404 document legitimately
 *    logs its own status, so the not-found journey tolerates that one line via
 *    `assertNoAppErrors(..., { allowStatus404: true })`.
 *  - `admin`: the per-run bootstrap Admin credentials, read from the environment
 *    the orchestrator forwards (never hard-coded, never logged).
 *
 * This module imports only `@playwright/test`; the database session-mutation seam
 * lives in a separate module so specs that do not need it stay driver-free.
 */
import { test as base, expect, type Page } from '@playwright/test';

/** Non-owned browser noise tolerated on every page. */
const ALWAYS_IGNORED = [/favicon\.ico/i, /Failed to load resource.*favicon/i];

/** A real 404 document logs its own failed-resource status; benign, not app code. */
const STATUS_404 = /Failed to load resource.*status of 404/i;

/** An intentional 401 probe (e.g. current-staff with an invalid cookie) logs its
 * own failed-resource status; benign, not app code. */
const STATUS_401 = /Failed to load resource.*status of 401/i;

export interface AdminCredentials {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
}

type App1Fixtures = {
  appErrors: string[];
  admin: AdminCredentials;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is not set — the E01 suite must run via \`pnpm e2e:app1\`.`);
  }
  return value;
}

export const test = base.extend<App1Fixtures>({
  appErrors: async ({ page }: { page: Page }, use: (errors: string[]) => Promise<void>) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(`console.error: ${message.text()}`);
      }
    });
    await use(errors);
  },
  // Playwright requires the first fixture argument to be a destructuring pattern
  // even when the fixture depends on nothing.
  // eslint-disable-next-line no-empty-pattern
  admin: async ({}, use: (credentials: AdminCredentials) => Promise<void>) => {
    await use({
      email: requiredEnv('E2E_ADMIN_EMAIL'),
      password: requiredEnv('E2E_ADMIN_PASSWORD'),
      displayName: requiredEnv('E2E_ADMIN_DISPLAY_NAME'),
    });
  },
});

/**
 * Asserts no app-code/hydration error slipped through, ignoring benign non-owned
 * noise. `allowStatus404` additionally tolerates the document's own 404 status
 * line, which any real 404 page emits; `allowStatus401` tolerates the failed-
 * resource line of an intentional 401 probe (e.g. a current-staff call with an
 * invalid cookie) — an expected authoritative rejection, not app-code error.
 */
export function assertNoAppErrors(
  errors: readonly string[],
  options: { allowStatus404?: boolean; allowStatus401?: boolean } = {},
): void {
  const ignored = [...ALWAYS_IGNORED];
  if (options.allowStatus404) {
    ignored.push(STATUS_404);
  }
  if (options.allowStatus401) {
    ignored.push(STATUS_401);
  }
  const severe = errors.filter((entry) => !ignored.some((pattern) => pattern.test(entry)));
  expect(severe, `unexpected app/console errors:\n${severe.join('\n')}`).toEqual([]);
}

export { expect };
