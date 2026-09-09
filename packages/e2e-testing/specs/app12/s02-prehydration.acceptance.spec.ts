/**
 * `APP12-S02-C1` — pre-hydration checkout safety, in a real browser.
 *
 * Split from the journey spec because it is a different question asked of the
 * same route: the journeys prove what a customer can do once the page is
 * interactive, and this file proves what the page does **before** it is — the
 * window in which a click used to perform a native GET and destroy the
 * customer's `?sku=&quantity=`.
 *
 * The world is shared (`support/s02-world.ts`), so both files drive the same
 * real APP4 verification lane, the same disposable database and the same
 * commercial evidence reader.
 */
/* The shared world is built on the plain ESM `.mjs` harness layer, so the
   evidence reader it hands back arrives untyped. As in `APP5-E01`, this spec
   treats it as `any` and lets each explicit `expect` be the contract. */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { expect, test, type Page } from '@playwright/test';

import {
  COPY,
  MAIN_SKU,
  PRODUCT,
  checkoutUrl,
  closeS02World,
  fillDelivery,
  openS02World,
  proofs,
  s02Evidence,
  verifyContact,
} from './support/s02-world';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(300_000);
  await openS02World();
});

test.afterAll(async () => {
  await closeS02World('APP12_S02_C1_PROOFS');
});

/**
 * `APP12-S02-C1` — the server-rendered checkout is not submittable before it is
 * interactive.
 *
 * ## Why this is a real hold and not a race
 *
 * The defect exists only in the window between first paint and hydration, and
 * "click fast enough" is not a test. So the run **deterministically holds
 * hydration**: every Storefront JavaScript request is intercepted and parked
 * until the case releases it. Nothing in production is touched to make that
 * possible — no test hook, no query flag, no build variant. The page under test
 * is the ordinary SSR response every visitor gets.
 *
 * While the scripts are held, React never boots, `onSubmit` never attaches, and
 * the forms are exactly the HTML the server sent — the state in which a click
 * used to perform a native GET and destroy the customer's `?sku=`.
 */
test.describe('pre-hydration safety (APP12-S02-C1)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  /**
   * Loads the checkout with hydration held, and returns the release handle.
   *
   * `waitUntil: 'commit'` because the navigation deliberately never reaches
   * `load` — the scripts it would wait for are the ones being held.
   */
  async function loadUnhydrated(page: Page, url: string) {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let heldRequests = 0;

    await page.route('**/*.js', async (route) => {
      heldRequests += 1;
      await held;
      // A parked route can be abandoned while it waits — the page navigating,
      // or the request being superseded — and continuing one that Playwright
      // has already finished with throws. The hold is the point; a route that
      // no longer exists has nothing left to hold.
      await route.continue().catch(() => undefined);
    });

    await page.goto(url, { waitUntil: 'commit' });
    // The server-rendered page is on screen and readable…
    await expect(page.getByRole('heading', { name: COPY.heading, level: 1 })).toBeVisible();
    // …and the guard says it is not interactive yet. This assertion is what
    // makes the rest of the case meaningful: without it a green result could
    // simply mean hydration had already happened.
    await expect(page.locator('fieldset.ready-made-checkout__columns')).toHaveAttribute(
      'data-interactive',
      'false',
    );
    expect(heldRequests, 'no script was intercepted — hydration was never held').toBeGreaterThan(0);

    // The handler stays registered for the life of the case, deliberately:
    // once `held` resolves it continues everything immediately, whereas
    // `unroute` would discard routes that are still parked inside it.
    return { release: () => release?.() };
  }

  test('a click cannot navigate, and cannot take the selection with it', async ({ page }) => {
    const ordersBefore = await s02Evidence().countReadyMadeOrders();
    const url = checkoutUrl(MAIN_SKU(), '2');

    const navigations: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigations.push(frame.url());
    });
    const navigationRequests: string[] = [];
    page.on('request', (request) => {
      if (request.isNavigationRequest()) {
        navigationRequests.push(`${request.method()} ${request.url()}`);
      }
    });

    const { release } = await loadUnhydrated(page, url);
    const navigationsAfterLoad = navigations.length;
    const requestsAfterLoad = navigationRequests.length;

    // Genuinely disabled by the ancestor fieldset — the browser's own rule,
    // with no script running to enforce it.
    const submitContact = page.getByRole('button', { name: 'Gửi mã' });
    await expect(submitContact).toBeDisabled();
    await expect(page.getByRole('button', { name: COPY.submit })).toBeDisabled();
    await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeDisabled();

    // `force`, because Playwright would otherwise refuse to click a disabled
    // control — and Playwright refusing is not the proof. The browser has to be
    // the thing that does nothing.
    await submitContact.click({ force: true });
    await page.getByRole('button', { name: COPY.submit }).click({ force: true });
    await page.waitForTimeout(500);

    expect(navigations.length - navigationsAfterLoad, 'a pre-hydration click navigated').toBe(0);
    expect(
      navigationRequests.length - requestsAfterLoad,
      'a pre-hydration click issued a navigation request',
    ).toBe(0);

    const after = new URL(page.url());
    expect(after.pathname).toBe(`/mua-hang/${PRODUCT()}`);
    expect(after.searchParams.get('sku')).toBe(MAIN_SKU());
    expect(after.searchParams.get('quantity')).toBe('2');
    expect(await s02Evidence().countReadyMadeOrders()).toBe(ordersBefore);

    release();
    proofs.pre_hydration_click_navigations = 0;
  });

  test('Enter cannot navigate either, from any field on the page', async ({ page }) => {
    const ordersBefore = await s02Evidence().countReadyMadeOrders();
    const url = checkoutUrl(MAIN_SKU(), '3');

    const navigations: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigations.push(frame.url());
    });

    const { release } = await loadUnhydrated(page, url);
    const navigationsAfterLoad = navigations.length;

    // Implicit submission needs a focusable control inside the form, and every
    // one of them is disabled — so there is nothing for `Enter` to originate
    // from. Both the contact field and a delivery field are tried anyway.
    for (const field of [
      page.getByRole('textbox', { name: 'Email', exact: true }),
      page.getByLabel(COPY.recipientName, { exact: true }),
    ]) {
      // `press` has no `force`, and on a disabled control it would time out
      // waiting for actionability — which is Playwright refusing rather than the
      // browser doing nothing. Focus is attempted and the key is sent to the
      // page either way, so the keystroke really does reach the document.
      await field.focus().catch(() => undefined);
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(500);

    expect(navigations.length - navigationsAfterLoad, 'a pre-hydration Enter navigated').toBe(0);

    const after = new URL(page.url());
    expect(after.pathname).toBe(`/mua-hang/${PRODUCT()}`);
    expect(after.searchParams.get('sku')).toBe(MAIN_SKU());
    expect(after.searchParams.get('quantity')).toBe('3');
    // And nothing the customer might have typed reached the address either.
    expect([...after.searchParams.keys()].sort()).toEqual(['quantity', 'sku']);
    expect(page.url()).not.toMatch(/-kind=|contact=|email=|@/);
    expect(await s02Evidence().countReadyMadeOrders()).toBe(ordersBefore);

    release();
    proofs.pre_hydration_enter_navigations = 0;
    proofs.pre_hydration_contact_in_url = false;
  });

  test('becomes fully usable once the scripts arrive, and completes a real order', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const ordersBefore = await s02Evidence().countReadyMadeOrders();
    const { release } = await loadUnhydrated(page, checkoutUrl(MAIN_SKU(), '1'));

    release();

    // Hydration is observed rather than waited out: the guard flips its own
    // attribute from the mount effect, so this is React reporting that it has
    // taken the markup over.
    await expect(page.locator('fieldset.ready-made-checkout__columns')).toHaveAttribute(
      'data-interactive',
      'true',
      { timeout: 30_000 },
    );
    await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: COPY.submit })).toBeEnabled();

    // And the whole journey still works, on the very page that was held.
    await verifyContact(page);
    await fillDelivery(page);
    await page.getByRole('button', { name: COPY.submit }).click();
    await expect(page.getByRole('heading', { name: COPY.successTitle })).toBeVisible({
      timeout: 30_000,
    });
    expect(await s02Evidence().countReadyMadeOrders()).toBe(ordersBefore + 1);

    proofs.post_hydration_recovers = true;
  });

  test('keyboard-only checkout still works after a held hydration', async ({ page }) => {
    test.setTimeout(180_000);
    const ordersBefore = await s02Evidence().countReadyMadeOrders();
    const { release } = await loadUnhydrated(page, checkoutUrl(MAIN_SKU(), '1'));
    release();
    await expect(page.locator('fieldset.ready-made-checkout__columns')).toHaveAttribute(
      'data-interactive',
      'true',
      { timeout: 30_000 },
    );

    await verifyContact(page);

    // Typed and submitted with the keyboard alone — no click anywhere.
    await page.getByLabel(COPY.recipientName, { exact: true }).focus();
    await page.keyboard.type('Nguyễn Minh Anh');
    await page.keyboard.press('Tab');
    await page.keyboard.type('0901234567');
    await page.keyboard.press('Tab');
    await page.keyboard.type('12 Nguyễn Huệ, Quận 1');
    await page.keyboard.press('Tab');
    await page.keyboard.type('TP. Hồ Chí Minh');
    await page.keyboard.press('Enter');

    await expect(page.getByRole('heading', { name: COPY.successTitle })).toBeVisible({
      timeout: 30_000,
    });
    expect(await s02Evidence().countReadyMadeOrders()).toBe(ordersBefore + 1);
    proofs.post_hydration_keyboard = true;
  });
});
