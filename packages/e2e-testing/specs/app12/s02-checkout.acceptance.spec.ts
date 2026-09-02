/**
 * `APP12-S02` — Ready-Made checkout, in a real browser, against real commerce.
 *
 * Real Chromium, the real Storefront process, the real Nginx gateway, the real
 * API, a disposable PostgreSQL carrying migrations 1..38 and a clearly test-only
 * catalog. Nothing is mocked. This run **creates immutable commercial history**
 * — orders, frozen lines, stock reservations, idempotency records and
 * `ORDER_ACCESS` grants — which is exactly why it may only ever run against a
 * database the orchestrator drops afterwards (`APP12-S02` §43, §44).
 *
 * ### What is fixture, stated once
 *
 * Exactly one thing: the **catalog** — a published Product under a public
 * Category with three variants (`s02-checkout-fixture.mjs`). Authoring catalog
 * is APP2/APP8's journey, not S02's.
 *
 * Everything S02 is meant to prove is produced by the application: the Customer,
 * the verification challenge, the order, its line, its shipping detail, its
 * reservation, its idempotency record, its grant and its notification intent.
 *
 * ### The one non-real boundary, and why
 *
 * The notification **transport**. `APP4-W01`'s recording adapter is the
 * established deterministic seam and is what lets this process read the
 * verification code at all: no debug endpoint exists and none may be added. The
 * code is read into a variable, typed into a field, and never printed, never
 * compared with an operand-printing matcher and never attached to a report.
 *
 * ### The ORDER_ACCESS token is never read, not even from the database
 *
 * `secure_access_grants` stores a hash and never the plaintext, and the evidence
 * reader selects no `token_hash` column. What this run proves about the link is
 * its **count** and its **scope** (§48). Following it is `APP12-S03`'s job.
 */
/* The shared world is built on the plain ESM `.mjs` harness layer, so the
   evidence reader it hands back arrives untyped. As in `APP5-E01`, this spec
   treats it as `any` and lets each explicit `expect` be the contract. */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { expect, test } from '@playwright/test';

import { createS01Driver } from '../app4/support/s01-verification-driver';

import {
  COPY,
  MAIN_SKU,
  PRODUCT,
  SCARCE_SKU,
  AMBIGUOUS_SKU,
  VIEWPORTS,
  checkoutUrl,
  closeS02World,
  fillDelivery,
  issueAndVerifyChallenge,
  openS02World,
  proofs,
  runWorkerUntilIdle,
  s02Evidence,
  secureLinkDeliveryCount,
  verifyContact,
} from './support/s02-world';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(300_000);
  await openS02World();
});

test.afterAll(async () => {
  await closeS02World('APP12_S02_PROOFS');
});

for (const viewport of VIEWPORTS) {
  test.describe(`viewport ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('completes one real checkout end to end', async ({ page }, testInfo) => {
      test.setTimeout(180_000);
      const ordersBefore = await s02Evidence().countReadyMadeOrders();
      const stockBefore = await s02Evidence().readAvailableQuantity(MAIN_SKU());
      const onHandBefore = await s02Evidence().readOnHandQuantity(MAIN_SKU());

      await page.goto(checkoutUrl(MAIN_SKU(), '2'));
      await expect(page.getByRole('heading', { name: COPY.heading, level: 1 })).toBeVisible();

      // The summary states the merchandise line, and states the fee as pending
      // rather than as a zero (`BR-027`).
      await expect(page.getByText('798.000 VND')).toBeVisible();
      await expect(page.getByText(COPY.shippingPending)).toBeVisible();
      await expect(page.getByText(COPY.totalPending)).toBeVisible();
      await testInfo.attach(`checkout-ready-${viewport.name}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });

      await verifyContact(page);
      await fillDelivery(page);
      await testInfo.attach(`checkout-form-${viewport.name}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });

      await page.getByRole('button', { name: COPY.submit }).click();
      await expect(page.getByRole('heading', { name: COPY.successTitle })).toBeVisible({
        timeout: 30_000,
      });

      // Exactly one order, and the units are actually held.
      //
      // Availability drops by the quantity ordered while **on-hand does not**:
      // creating an order writes a `RESERVED` reservation against the stock
      // anchor and consumes nothing until fulfilment. Both halves are asserted,
      // because the interesting failure is a checkout that appears to reserve
      // and silently decrements instead.
      expect(await s02Evidence().countReadyMadeOrders()).toBe(ordersBefore + 1);
      expect(await s02Evidence().readAvailableQuantity(MAIN_SKU())).toBe(stockBefore - 2);
      expect(await s02Evidence().readOnHandQuantity(MAIN_SKU())).toBe(onHandBefore);

      // The order lands fee-pending, with no payable total anywhere on screen.
      const orders = await s02Evidence().readReadyMadeOrders();
      expect(orders[orders.length - 1].status).toBe('AWAITING_SHIPPING_FEE');
      // `exact`: the fallback caption below also mentions the order code by name.
      await expect(page.getByText(COPY.orderCodeLabel, { exact: true })).toBeVisible();
      await expect(page.getByText(COPY.secureLink)).toBeVisible();

      // No payment surface, and no navigation into the secure order route.
      expect(await page.locator('a[href*="/truy-cap"]').count()).toBe(0);
      expect(new URL(page.url()).pathname).toBe(`/mua-hang/${PRODUCT()}`);
      await expect(page.locator('body')).not.toContainText(/QR|ORDER_ACCESS|AWAITING_SHIPPING_FEE/);

      await testInfo.attach(`checkout-success-${viewport.name}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
      proofs[`viewport_${viewport.name}`] = true;
    });

    test('never scrolls sideways and is not overlapped by the contact dock', async ({ page }) => {
      await page.goto(checkoutUrl(MAIN_SKU(), '1'));
      const submit = page.getByRole('button', { name: COPY.submit });
      await submit.scrollIntoViewIfNeeded();

      const submitBox = await submit.boundingBox();
      expect(submitBox).not.toBeNull();
      const dock = page.locator('.storefront-shell__handoff-dock');
      if ((await dock.count()) > 0) {
        const dockBox = await dock.boundingBox();
        if (dockBox !== null && submitBox !== null) {
          const overlaps =
            submitBox.x < dockBox.x + dockBox.width &&
            dockBox.x < submitBox.x + submitBox.width &&
            submitBox.y < dockBox.y + dockBox.height &&
            dockBox.y < submitBox.y + submitBox.height;
          expect(overlaps, 'the contact dock overlaps the order action').toBe(false);
        }
      }

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}

test.describe('the address is a hint and never an authority', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(() => {
    proofs.selection_fail_closed = true;
  });

  test('refuses a SKU that belongs to no variant of this Product', async ({ page }) => {
    await page.goto(checkoutUrl('11111111-2222-4333-8444-555555555555', '1'));

    await expect(page.getByText(COPY.invalidSelection)).toBeVisible();
    await expect(page.getByRole('button', { name: COPY.submit })).toHaveCount(0);
    await expect(page.getByRole('link', { name: COPY.back })).toHaveAttribute(
      'href',
      `/san-pham/${PRODUCT()}`,
    );
  });

  test('refuses a checkout with no SKU hint at all', async ({ page }) => {
    await page.goto(`/mua-hang/${PRODUCT()}`);
    await expect(page.getByText(COPY.invalidSelection)).toBeVisible();
    await expect(page.getByRole('button', { name: COPY.submit })).toHaveCount(0);
  });

  test('keeps an ambiguous variant fail-closed and publishes no SKU id', async ({ page }) => {
    await page.goto(checkoutUrl(AMBIGUOUS_SKU(), '1'));

    await expect(page.getByText(COPY.invalidSelection)).toBeVisible();
    // Neither the ambiguous SKU's price nor its id reaches the customer.
    await expect(page.locator('body')).not.toContainText('100.000 VND');
    await expect(page.locator('body')).not.toContainText(AMBIGUOUS_SKU());
  });

  test('resets a malformed quantity instead of coercing it, and never 500s', async ({ page }) => {
    for (const quantity of ['0', '-4', '2.5', 'abc', '99999999']) {
      const response = await page.goto(checkoutUrl(MAIN_SKU(), quantity));
      expect(response?.status(), `quantity=${quantity}`).toBe(200);
      await expect(page.getByRole('heading', { name: COPY.heading, level: 1 })).toBeVisible();
      // Whatever the address said, the line is a quantity the SKU can satisfy.
      const line = await page.locator('.ready-made-checkout__item-variant').textContent();
      const ordered = Number(/SL (\d+)/.exec(line ?? '')?.[1] ?? '0');
      expect(ordered).toBeGreaterThanOrEqual(1);
      expect(ordered).toBeLessThanOrEqual(await s02Evidence().readAvailableQuantity(MAIN_SKU()));
    }
  });
});

test.describe('verification is required, and is bound to the contact', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('refuses an unverified submit and creates nothing', async ({ page }) => {
    const before = await s02Evidence().countReadyMadeOrders();
    await page.goto(checkoutUrl(MAIN_SKU(), '1'));

    await fillDelivery(page);
    await page.getByRole('button', { name: COPY.submit }).click();

    await expect(page.getByText(COPY.contactUnverified)).toBeVisible();
    expect(await s02Evidence().countReadyMadeOrders()).toBe(before);
    proofs.unverified_submit_refused = true;
  });

  test('binds each delivery field error to its own field, never a toast', async ({ page }) => {
    await page.goto(checkoutUrl(MAIN_SKU(), '1'));
    await verifyContact(page);
    await page.getByRole('button', { name: COPY.submit }).click();

    const name = page.getByLabel(COPY.recipientName, { exact: true });
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    const describedBy = await name.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    await expect(page.locator(`#${String(describedBy)}`)).toHaveText(COPY.nameRequired);
    proofs.field_bound_validation = true;
  });

  test('invalidates the verification when the contact changes (§16)', async ({ page }) => {
    const before = await s02Evidence().countReadyMadeOrders();
    await page.goto(checkoutUrl(MAIN_SKU(), '1'));

    await verifyContact(page);
    await page.getByRole('button', { name: COPY.changeContact }).click();

    // Back at contact entry: the verified affordance is gone.
    await expect(page.getByText(COPY.verified)).toHaveCount(0);
    const driver = createS01Driver(page);
    await driver.enterContact('EMAIL', 'app12-s02-swapped@vidu.test');

    await fillDelivery(page);
    await page.getByRole('button', { name: COPY.submit }).click();

    // The first contact's challenge cannot be spent on the second contact.
    await expect(page.getByText(COPY.contactUnverified)).toBeVisible();
    expect(await s02Evidence().countReadyMadeOrders()).toBe(before);
    proofs.contact_change_invalidates = true;
  });
});

test.describe('idempotency and the stock race', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('one semantic checkout creates exactly one order however hard it is pressed', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const ordersBefore = await s02Evidence().countReadyMadeOrders();
    const reservationsBefore = await s02Evidence().countReservations();
    const grantsBefore = await s02Evidence().countOrderAccessGrants();
    const recordsBefore = await s02Evidence().countIdempotencyRecords();
    const intentsBefore = await s02Evidence().countNotificationIntents();

    await page.goto(checkoutUrl(MAIN_SKU(), '1'));
    await verifyContact(page);
    await fillDelivery(page);

    // Every create this page issues, counted at the transport rather than
    // inferred from the button's disabled state.
    const creates: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/api/public/ready-made-orders')) {
        creates.push(request.url());
      }
    });

    const submit = page.getByRole('button', { name: COPY.submit });
    // Three presses and an Enter, as fast as the browser will deliver them.
    await submit.click();
    await page
      .getByRole('button', { name: COPY.submitPending })
      .click({ force: true })
      .catch(() => undefined);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: COPY.successTitle })).toBeVisible({
      timeout: 30_000,
    });

    // Exactly one of everything, and the browser issued exactly one request.
    expect(creates.length, 'the page issued more than one create request').toBe(1);
    expect(await s02Evidence().countReadyMadeOrders()).toBe(ordersBefore + 1);
    expect(await s02Evidence().countReservations()).toBe(reservationsBefore + 1);
    expect(await s02Evidence().countOrderAccessGrants()).toBe(grantsBefore + 1);
    expect(await s02Evidence().countIdempotencyRecords()).toBe(recordsBefore + 1);
    expect(await s02Evidence().countNotificationIntents()).toBeGreaterThan(intentsBefore);
    expect(await s02Evidence().readIdempotencyStatuses()).not.toContain('IN_PROGRESS');

    // §48: the secure link really was handed to the notification path, proved by
    // running the worker and counting a delivery **of that kind**. Its value is
    // never read — `secureLinkDeliveryCount` inspects `secretKind` and nothing
    // else, and `secretOf` is not called for it anywhere in this file.
    const linksBefore = secureLinkDeliveryCount();
    await runWorkerUntilIdle();
    expect(secureLinkDeliveryCount()).toBe(linksBefore + 1);
    proofs.secure_link_delivered = true;

    proofs.double_submit_orders = 1;
    proofs.order_access_grants_per_order = 1;
    proofs.raw_order_access_token_read = false;
  });

  test('replays rather than duplicates when the same body is sent twice', async ({ request }) => {
    test.setTimeout(180_000);
    // The previous test proved the browser issues exactly one request, which is
    // the right behaviour — and is also why the browser cannot prove *server*
    // idempotency: it never sends the second call. §47 asks for a bounded
    // API-level proof through the exact S02 mutation seam, so this drives that
    // seam directly: the same challenge and the same body, twice.
    //
    // The challenge is issued and verified here rather than lifted out of the
    // page, because the id deliberately never reaches the URL, storage or the
    // DOM — there is nothing in a rendered checkout to read it from.
    const ordersBefore = await s02Evidence().countReadyMadeOrders();
    const recordsBefore = await s02Evidence().countIdempotencyRecords();

    const verified = await issueAndVerifyChallenge(request);
    const body = {
      challengeId: verified,
      skuId: MAIN_SKU(),
      quantity: 1,
      delivery: {
        recipientName: 'Nguyễn Minh Anh',
        recipientPhone: '0901234567',
        addressLine: '12 Nguyễn Huệ, Phường Bến Nghé, Quận 1',
        province: 'TP. Hồ Chí Minh',
      },
    };

    const first = await request.post('/api/public/ready-made-orders', { data: body });
    const second = await request.post('/api/public/ready-made-orders', { data: body });
    expect(first.status()).toBe(201);
    expect(second.status()).toBe(201);

    const firstCode = (await first.json()).data.orderCode;
    const secondCode = (await second.json()).data.orderCode;
    // The same order, replayed — not a second one with a new code.
    expect(secondCode).toBe(firstCode);
    expect(await s02Evidence().countReadyMadeOrders()).toBe(ordersBefore + 1);
    expect(await s02Evidence().countIdempotencyRecords()).toBe(recordsBefore + 1);

    // And a *different* body on the same challenge is refused, not accepted.
    const conflicting = await request.post('/api/public/ready-made-orders', {
      data: { ...body, quantity: 2 },
    });
    expect(conflicting.status()).toBe(409);
    expect((await conflicting.json()).code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await s02Evidence().countReadyMadeOrders()).toBe(ordersBefore + 1);

    proofs.idempotency_replay = true;
    proofs.idempotency_conflict_refused = true;
  });

  test('refuses truthfully when the stock goes while the customer is on the page', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const before = await s02Evidence().countReadyMadeOrders();

    // The page is loaded while the single unit is still there.
    await page.goto(checkoutUrl(SCARCE_SKU(), '1'));
    await expect(page.getByRole('heading', { name: COPY.heading, level: 1 })).toBeVisible();
    await verifyContact(page);
    await fillDelivery(page);

    // Somebody else takes it. Real inventory, not a mocked response.
    await s02Evidence().consumeStock(SCARCE_SKU(), 1);

    await page.getByRole('button', { name: COPY.submit }).click();

    // The approved refusal, the reason stated, and the way back offered.
    await expect(page.getByText(COPY.outOfStock)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: COPY.successTitle })).toHaveCount(0);
    await expect(page.getByRole('link', { name: COPY.back })).toBeVisible();
    // No order, and no silent retry at a smaller quantity.
    expect(await s02Evidence().countReadyMadeOrders()).toBe(before);
    proofs.stock_race_refused = true;
  });
});

test.describe('accessibility and the S01 hand-off', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('is completable from the keyboard alone', async ({ page }) => {
    test.setTimeout(180_000);
    const before = await s02Evidence().countReadyMadeOrders();
    await page.goto(checkoutUrl(MAIN_SKU(), '1'));
    await verifyContact(page);

    // Reach the first delivery field by keyboard, then type the whole form and
    // submit with Enter — never a click.
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
    // Focus lands on the outcome rather than at the top of a vanished form.
    await expect(page.locator('#checkout-success-heading')).toBeFocused();
    expect(await s02Evidence().countReadyMadeOrders()).toBe(before + 1);
    proofs.keyboard_completable = true;
  });

  test('is reached by the exact href APP12-S01 composes, with Wave 2 off', async ({ page }) => {
    await page.goto(`/san-pham/${PRODUCT()}`);

    const panel = page.getByRole('region', { name: 'Mua sản phẩm có sẵn' });
    await expect(panel).toBeVisible();
    // Wave 2 is withheld and the purchase panel is still fully usable.
    expect(await page.locator('a[href*="/thiet-ke"]').count()).toBe(0);
    expect(await page.locator('a[href^="/yeu-cau"]').count()).toBe(0);

    const white = panel.getByRole('radio', { name: /^Trắng/ });
    await expect(async () => {
      await white.check({ timeout: 2_000 });
      await expect(white).toBeChecked({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await panel.getByRole('radio', { name: /^M/ }).check();

    const href = await panel.getByRole('link', { name: 'Mua ngay' }).getAttribute('href');
    expect(href).not.toBeNull();
    const url = new URL(href ?? '', 'http://localhost');
    expect(url.pathname).toBe(`/mua-hang/${PRODUCT()}`);
    expect(url.searchParams.get('sku')).toBe(MAIN_SKU());

    // And following it actually lands on a usable checkout.
    const response = await page.goto(href ?? '');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: COPY.heading, level: 1 })).toBeVisible();
    proofs.s01_handoff = true;
  });

  test('is noindex and absent from the sitemap', async ({ page, request }) => {
    await page.goto(checkoutUrl(MAIN_SKU(), '1'));
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
    expect(await page.locator('link[rel="canonical"]').count()).toBe(0);
    expect(await page.locator('meta[property^="og:"]').count()).toBe(0);

    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBe(true);
    expect(await sitemap.text()).not.toContain('/mua-hang');
    proofs.noindex = true;
    proofs.sitemap_excluded = true;
  });
});
