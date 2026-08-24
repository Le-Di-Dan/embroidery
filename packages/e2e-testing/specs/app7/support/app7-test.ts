/**
 * The `APP7-E01` test object: one world per worker, shared by both spec files.
 *
 * ### Why the world is worker-scoped
 *
 * `createApp7World` composes the API's real `AppModule` **and** the worker's
 * real `WorkerModule` in this process, each with its own PostgreSQL pool. Two
 * spec files that each built their own would put four Nest graphs, two pools,
 * the API HTTP process, both Next servers, Nginx, PostgreSQL, MinIO and Chromium
 * on one machine — and the first thing to give way is not an assertion, it is
 * the Storefront answering a navigation, which arrives as a gateway timeout and
 * reads like a product defect. A worker-scoped fixture builds it once and tears
 * it down when the worker ends, which is also what makes the run one aggregate
 * rather than two.
 *
 * The Admin session and the cookieless Storefront origin are worker-scoped for
 * the same reason and with the same effect: one real login for the run, one page
 * the public deposit operations are called from.
 *
 * Test-only.
 */
import { test as base } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

import { createApp7World, openAdminSession, requiredEnv, type App7World } from './app7-e01-world';

export interface App7WorkerFixtures {
  app7: App7World;
  admin: Awaited<ReturnType<typeof openAdminSession>>;
  /** A cookieless Storefront page — the origin the public calls are issued from. */
  publicPage: Page;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export const test = base.extend<{}, App7WorkerFixtures>({
  app7: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const world = await createApp7World();
      await use(world);
      await world.close();
    },
    { scope: 'worker', timeout: 180_000 },
  ],

  admin: [
    async ({ browser }, use) => {
      const session = await openAdminSession(browser, requiredEnv('E2E_BASE_ADMIN'));
      await use(session);
      await session.close();
    },
    { scope: 'worker', timeout: 120_000 },
  ],

  publicPage: [
    async ({ browser }, use) => {
      const context: BrowserContext = await browser.newContext({
        baseURL: requiredEnv('E2E_BASE_STOREFRONT'),
      });
      const page = await context.newPage();
      await page.goto('/');
      await use(page);
      await context.close();
    },
    { scope: 'worker', timeout: 120_000 },
  ],
});

export { expect } from '@playwright/test';
