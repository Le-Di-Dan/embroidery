import { defineConfig, devices } from '@playwright/test';

/**
 * Benchmark browser tier for the APP0-R01 spike.
 *
 * Deliberately separate from `@embroidery/e2e-testing`: this suite measures a
 * research app, never ships, and must never join the product E2E matrix or the
 * fast `pnpm quality` chain. It reuses the same pinned Playwright version so
 * there is exactly one browser toolchain in the repository.
 */
const BASE_URL = process.env.SPIKE_BASE_URL ?? 'http://127.0.0.1:4320';

export default defineConfig({
  testDir: './bench',
  testMatch: '**/*.bench.spec.ts',
  outputDir: 'bench-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Benchmarks are long by design; the wrapper owns the overall timeout.
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'desktop-webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
    },
  ],
});
