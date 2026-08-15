/**
 * Playwright configuration for the APP0-T02B foundation smoke.
 *
 * Base URLs are the real gateway hostnames (never direct app ports). The
 * environment is owned entirely by `scripts/run-e2e.mjs`; there is deliberately
 * no `webServer` block so cleanup ownership stays outside Playwright (its
 * shutdown is insufficient on Windows). Direct execution (`playwright test`
 * without the wrapper) is only meaningful for `--list` in `check:e2e`.
 */
import { defineConfig, devices } from '@playwright/test';

const STOREFRONT_URL = process.env.E2E_BASE_STOREFRONT ?? 'http://embroidery.local:8090';
const ADMIN_URL = process.env.E2E_BASE_ADMIN ?? 'http://admin.embroidery.local:8090';
const IS_CI = !!process.env.CI;

// On the host, Chromium resolves the gateway hostnames itself (Firefox/WebKit
// cannot, so they run only in the container where `--add-host` provides DNS).
const storefrontHost = new URL(STOREFRONT_URL).hostname;
const adminHost = new URL(ADMIN_URL).hostname;
const hostResolverArgs =
  process.env.E2E_RUNNER === 'container'
    ? []
    : [`--host-resolver-rules=MAP ${storefrontHost} 127.0.0.1, MAP ${adminHost} 127.0.0.1`];

const chromiumLaunch = { launchOptions: { args: hostResolverArgs } };

export default defineConfig({
  testDir: './specs',
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: IS_CI,
  retries: IS_CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    navigationTimeout: 20_000,
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: 'storefront-chromium',
      testMatch: '**/storefront.smoke.spec.ts',
      use: { ...devices['Desktop Chrome'], ...chromiumLaunch, baseURL: STOREFRONT_URL },
    },
    {
      name: 'admin-chromium',
      testMatch: '**/{admin.smoke,api-readiness.smoke}.spec.ts',
      use: { ...devices['Desktop Chrome'], ...chromiumLaunch, baseURL: ADMIN_URL },
    },
    {
      name: 'storefront-firefox',
      testMatch: '**/storefront.smoke.spec.ts',
      use: { ...devices['Desktop Firefox'], baseURL: STOREFRONT_URL },
    },
    {
      name: 'admin-firefox',
      testMatch: '**/{admin.smoke,api-readiness.smoke}.spec.ts',
      use: { ...devices['Desktop Firefox'], baseURL: ADMIN_URL },
    },
    {
      name: 'storefront-webkit',
      testMatch: '**/storefront.smoke.spec.ts',
      use: { ...devices['Desktop Safari'], baseURL: STOREFRONT_URL },
    },
    {
      name: 'admin-webkit',
      testMatch: '**/{admin.smoke,api-readiness.smoke}.spec.ts',
      use: { ...devices['Desktop Safari'], baseURL: ADMIN_URL },
    },
    // APP1-E01 cross-layer acceptance (host/Chromium only — see run-e2e.mjs).
    {
      name: 'app1-admin-chromium',
      testMatch: '**/app1/admin-*.spec.ts',
      use: { ...devices['Desktop Chrome'], ...chromiumLaunch, baseURL: ADMIN_URL },
    },
    {
      name: 'app1-storefront-chromium',
      testMatch: '**/app1/storefront-*.spec.ts',
      use: { ...devices['Desktop Chrome'], ...chromiumLaunch, baseURL: STOREFRONT_URL },
    },
    // APP4-E01-H02 helper readiness. Host/Chromium only, like the APP1 E01
    // projects and for the same reason. Split by base URL: the S01/S02 checks
    // run against the Storefront, the A01 check against the Admin.
    {
      name: 'app4-storefront-chromium',
      testMatch: '**/app4/h02-helpers.smoke.spec.ts',
      grepInvert: /Admin A01/,
      use: { ...devices['Desktop Chrome'], ...chromiumLaunch, baseURL: STOREFRONT_URL },
    },
    {
      name: 'app4-admin-chromium',
      testMatch: '**/app4/h02-helpers.smoke.spec.ts',
      grep: /Admin A01/,
      use: { ...devices['Desktop Chrome'], ...chromiumLaunch, baseURL: ADMIN_URL },
    },
    // APP4-E01-R01 canonical acceptance. One serial project on the Storefront
    // origin; the Admin journeys open their own context against the Admin
    // origin, because the run is one journey and cannot be split across two
    // projects without losing the state it accumulates.
    {
      name: 'app4-r01-chromium',
      testMatch: '**/app4/e01-r01.acceptance.spec.ts',
      use: { ...devices['Desktop Chrome'], ...chromiumLaunch, baseURL: STOREFRONT_URL },
    },
    // APP4-E01-R01-C1 — the correction, independent of the R01 serial spec.
    {
      name: 'app4-r01-c1-chromium',
      testMatch: '**/app4/e01-r01-c1.acceptance.spec.ts',
      use: { ...devices['Desktop Chrome'], ...chromiumLaunch, baseURL: STOREFRONT_URL },
    },
  ],
});
