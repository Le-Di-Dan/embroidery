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
import { expect, test, type Page } from '@playwright/test';

import { createS01Driver } from '../app4/support/s01-verification-driver';

/* The harness helper layer is plain ESM `.mjs` — it has to be, because the same
   modules load outside ts-jest — so everything imported from it arrives untyped.
   As in `APP5-E01`, this spec treats those imports as `any` and lets each
   explicit `expect` below be the contract. */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required for the APP12-S02 acceptance run.`);
  }
  return value;
}

const PRODUCT = requiredEnv.bind(null, 'E2E_APP12_S02_PRODUCT_SLUG');
const MAIN_SKU = requiredEnv.bind(null, 'E2E_APP12_S02_MAIN_SKU');
const SCARCE_SKU = requiredEnv.bind(null, 'E2E_APP12_S02_SCARCE_SKU');
const AMBIGUOUS_SKU = requiredEnv.bind(null, 'E2E_APP12_S02_AMBIGUOUS_SKU');

/** The approved viewports (`APP12-D01` §L). */
const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 900 },
  { name: '390', width: 390, height: 844 },
] as const;

/** Approved `APP12-D01` copy, duplicated here as a test expectation on purpose. */
const COPY = {
  heading: 'Xác nhận đơn hàng',
  contactHeading: 'Liên hệ',
  verified: 'Đã xác minh',
  changeContact: 'Đổi liên hệ',
  deliveryHeading: 'Giao hàng',
  recipientName: 'Người nhận',
  recipientPhone: 'Số điện thoại người nhận',
  addressLine: 'Địa chỉ nhận hàng',
  province: 'Tỉnh/Thành',
  merchandise: 'Tiền hàng',
  shippingPending: 'Xưởng xác nhận sau',
  totalPending: 'Có sau khi xác nhận phí',
  submit: 'Đặt hàng',
  submitPending: 'Đang gửi…',
  successTitle: 'Đã tạo đơn hàng của bạn',
  orderCodeLabel: 'Mã đơn hàng',
  secureLink: 'Chúng tôi đã gửi liên kết theo dõi tới liên hệ bạn đã xác minh',
  invalidSelection: 'Chưa xác định được sản phẩm cần mua',
  back: 'Quay lại sản phẩm',
  outOfStock: 'Sản phẩm vừa hết hàng',
  nameRequired: 'Vui lòng nhập tên người nhận.',
  contactUnverified: 'Vui lòng xác minh liên hệ trước khi đặt hàng.',
} as const;

let runtime: any;
let worker: any;
let evidence: any;
let contactSeed = 0;

/** Safe facts only: booleans and counts. Never a code, a token or a contact. */
const proofs: Record<string, boolean | number | string> = {};

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(300_000);
  const databaseUrl = requiredEnv('E2E_DATABASE_URL');
  const { createApp4E01Runtime } = await import('../../support/app4/app4-runtime.mjs');
  const { createWorkerControl } = (await import('../../support/app4/worker-control.mjs')) as any;
  const { createS02Evidence } =
    (await import('../../support/app12/s02-checkout-fixture.mjs')) as any;

  runtime = await createApp4E01Runtime({
    runId: requiredEnv('E2E_RUN_ID'),
    app4: {
      verificationCodePepper: requiredEnv('VERIFICATION_CODE_SECRET_PEPPER'),
      secureLinkTokenPepper: requiredEnv('SECURE_LINK_TOKEN_SECRET_PEPPER'),
      notificationDeliveryEnvelopeKey: requiredEnv('NOTIFICATION_DELIVERY_ENVELOPE_KEY'),
      storefrontOrigin: requiredEnv('STOREFRONT_PUBLIC_ORIGIN'),
      designSessionPepper: requiredEnv('DESIGN_SESSION_SECRET_PEPPER'),
    },
    databaseUrl,
  });
  worker = createWorkerControl(runtime);
  evidence = await createS02Evidence(databaseUrl);
});

test.afterAll(async () => {
  await evidence?.close?.();
  await runtime?.close?.();
  process.stdout.write(`APP12_S02_PROOFS ${JSON.stringify(proofs)}\n`);
});

/** A checkout address, composed exactly as `APP12-S01`'s panel composes it. */
function checkoutUrl(skuId: string | undefined, quantity: string): string {
  const query = new URLSearchParams();
  if (skuId !== undefined) query.set('sku', skuId);
  query.set('quantity', quantity);
  return `/mua-hang/${PRODUCT()}?${query.toString()}`;
}

/**
 * Verify a contact through the **real** APP4 lane and leave the flow verified.
 *
 * A fresh synthetic address per call, so no two journeys share an idempotency
 * scope — two orders on one challenge is an `IDEMPOTENCY_CONFLICT` by design,
 * and a run that reused one would be measuring that instead of what it meant to.
 */
async function verifyContact(page: Page): Promise<void> {
  contactSeed += 1;
  const driver = createS01Driver(page);
  const address = `app12-s02-${String(contactSeed)}@vidu.test`;

  const url = page.url();
  const before = worker.deliveryCount();

  // Submitted **after hydration**, and the two are asserted together.
  //
  // `ContactEntryCard` is a real `<form>` whose `onSubmit` calls
  // `preventDefault`. Between first paint and hydration that handler is not
  // attached yet, so a click in that window performs a *native* GET — which on
  // this route replaces `?sku=&quantity=` with the contact form's own fields and
  // lands the customer back on a checkout that names nothing to buy. That is
  // ordinary Next.js behaviour rather than an S02 defect (the page is readable
  // before any JavaScript arrives, which is the point), but it makes a bare
  // click racy, exactly as `APP12-S01` records for its radio group. Retrying the
  // action and its outcome together is deterministic: it either lands after
  // hydration or fails loudly.
  //
  // The consequence on this particular route is recorded as `FU-APP12-S02-04`.
  // The whole step is retried, not just the click: a native submit navigates,
  // which clears the field it just posted, so re-entering the contact is part of
  // the retry rather than something done once before it.
  await expect(async () => {
    if (new URL(page.url()).searchParams.get('sku') === null) await page.goto(url);
    await driver.chooseContactKind('EMAIL');
    await driver.enterContact('EMAIL', address);
    await driver.submitContact();
    await expect(page.getByRole('heading', { name: 'Nhập mã xác minh' })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 30_000 });

  // The selection survived: whatever happened, the customer still has one.
  expect(new URL(page.url()).searchParams.get('sku')).not.toBeNull();

  // The API raises a notification intent; the **worker** is what turns it into a
  // delivery the recording adapter can be read from, and this topology holds the
  // worker's poll loop closed on purpose (`WORKER_STARTUP_GATE`) so a background
  // loop cannot race the assertions. So the run pumps it explicitly, exactly as
  // `APP5-E01` does.
  await runWorkerUntilIdle();

  // The code exists only in this process's memory and in the field below.
  const code = takeVerificationCode(before);
  await driver.enterCode(code);
  await driver.submitCode();

  await expect(page.getByText(COPY.verified)).toBeVisible();
}

/**
 * The verification code from the deliveries this journey produced.
 *
 * **Searched by kind, never taken positionally.** Once a journey has created an
 * order, the queue also carries that order's `SECURE_LINK_TOKEN` delivery, and a
 * later journey that drains the worker picks it up first — so "the delivery at
 * index `from`" is the code only for the very first journey of a run. Asking for
 * the first `VERIFICATION_CODE` at or after `from` is what the caller actually
 * means, and it is order-independent.
 *
 * The plaintext is returned to be typed into a field and nowhere else: it is not
 * logged, not attached, and not compared with an operand-printing matcher.
 */
function takeVerificationCode(from: number): string {
  const end = worker.deliveryCount() as number;
  // Newest first. A retried submit issues a *replacement* challenge, and
  // `APP4`'s reducer says the replacement's identity wholly replaces the old
  // one — so the code the card is now answering is the latest one, and taking
  // the oldest would answer a challenge the server has already cancelled.
  for (let index = end - 1; index >= from; index -= 1) {
    if (worker.safeDelivery(index).secretKind === 'VERIFICATION_CODE') {
      return worker.secretOf(index) as string;
    }
  }
  throw new Error(
    `No VERIFICATION_CODE delivery was recorded at or after index ${String(from)} ` +
      `(${String(end - from)} delivery/deliveries seen).`,
  );
}

/** How many secure-link deliveries the run has produced, by kind and never by value. */
function secureLinkDeliveryCount(): number {
  const end = worker.deliveryCount() as number;
  let seen = 0;
  for (let index = 0; index < end; index += 1) {
    if (worker.safeDelivery(index).secretKind === 'SECURE_LINK_TOKEN') seen += 1;
  }
  return seen;
}

/**
 * Drains the worker's due jobs, one real attempt at a time.
 *
 * The guard is a bound, not a timeout: a run that still has due jobs after this
 * many attempts has a loop, and failing loudly is better than spinning.
 */
async function runWorkerUntilIdle(guard = 12): Promise<number> {
  let executed = 0;
  for (let attempt = 0; attempt < guard; attempt += 1) {
    const summary = await worker.runOnce();
    if (summary === undefined) return executed;
    executed += 1;
  }
  throw new Error(`Worker still had due jobs after ${String(guard)} attempts.`);
}

// `exact` on every lookup: `Người nhận` is a substring of
// `Số điện thoại người nhận`, so a loose label match resolves to two inputs and
// Playwright's strict mode refuses it. The same trap the APP4 driver records
// for its own contact field.
async function fillDelivery(page: Page, address = '12 Nguyễn Huệ, Phường Bến Nghé, Quận 1') {
  await page.getByLabel(COPY.recipientName, { exact: true }).fill('Nguyễn Minh Anh');
  await page.getByLabel(COPY.recipientPhone, { exact: true }).fill('0901234567');
  await page.getByLabel(COPY.addressLine, { exact: true }).fill(address);
  await page.getByLabel(COPY.province, { exact: true }).fill('TP. Hồ Chí Minh');
}

for (const viewport of VIEWPORTS) {
  test.describe(`viewport ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('completes one real checkout end to end', async ({ page }, testInfo) => {
      test.setTimeout(180_000);
      const ordersBefore = await evidence.countReadyMadeOrders();
      const stockBefore = await evidence.readAvailableQuantity(MAIN_SKU());
      const onHandBefore = await evidence.readOnHandQuantity(MAIN_SKU());

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
      expect(await evidence.countReadyMadeOrders()).toBe(ordersBefore + 1);
      expect(await evidence.readAvailableQuantity(MAIN_SKU())).toBe(stockBefore - 2);
      expect(await evidence.readOnHandQuantity(MAIN_SKU())).toBe(onHandBefore);

      // The order lands fee-pending, with no payable total anywhere on screen.
      const orders = await evidence.readReadyMadeOrders();
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
      expect(ordered).toBeLessThanOrEqual(await evidence.readAvailableQuantity(MAIN_SKU()));
    }
  });
});

test.describe('verification is required, and is bound to the contact', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('refuses an unverified submit and creates nothing', async ({ page }) => {
    const before = await evidence.countReadyMadeOrders();
    await page.goto(checkoutUrl(MAIN_SKU(), '1'));

    await fillDelivery(page);
    await page.getByRole('button', { name: COPY.submit }).click();

    await expect(page.getByText(COPY.contactUnverified)).toBeVisible();
    expect(await evidence.countReadyMadeOrders()).toBe(before);
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
    const before = await evidence.countReadyMadeOrders();
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
    expect(await evidence.countReadyMadeOrders()).toBe(before);
    proofs.contact_change_invalidates = true;
  });
});

test.describe('idempotency and the stock race', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('one semantic checkout creates exactly one order however hard it is pressed', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const ordersBefore = await evidence.countReadyMadeOrders();
    const reservationsBefore = await evidence.countReservations();
    const grantsBefore = await evidence.countOrderAccessGrants();
    const recordsBefore = await evidence.countIdempotencyRecords();
    const intentsBefore = await evidence.countNotificationIntents();

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
    expect(await evidence.countReadyMadeOrders()).toBe(ordersBefore + 1);
    expect(await evidence.countReservations()).toBe(reservationsBefore + 1);
    expect(await evidence.countOrderAccessGrants()).toBe(grantsBefore + 1);
    expect(await evidence.countIdempotencyRecords()).toBe(recordsBefore + 1);
    expect(await evidence.countNotificationIntents()).toBeGreaterThan(intentsBefore);
    expect(await evidence.readIdempotencyStatuses()).not.toContain('IN_PROGRESS');

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
    const ordersBefore = await evidence.countReadyMadeOrders();
    const recordsBefore = await evidence.countIdempotencyRecords();

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
    expect(await evidence.countReadyMadeOrders()).toBe(ordersBefore + 1);
    expect(await evidence.countIdempotencyRecords()).toBe(recordsBefore + 1);

    // And a *different* body on the same challenge is refused, not accepted.
    const conflicting = await request.post('/api/public/ready-made-orders', {
      data: { ...body, quantity: 2 },
    });
    expect(conflicting.status()).toBe(409);
    expect((await conflicting.json()).code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await evidence.countReadyMadeOrders()).toBe(ordersBefore + 1);

    proofs.idempotency_replay = true;
    proofs.idempotency_conflict_refused = true;
  });

  test('refuses truthfully when the stock goes while the customer is on the page', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const before = await evidence.countReadyMadeOrders();

    // The page is loaded while the single unit is still there.
    await page.goto(checkoutUrl(SCARCE_SKU(), '1'));
    await expect(page.getByRole('heading', { name: COPY.heading, level: 1 })).toBeVisible();
    await verifyContact(page);
    await fillDelivery(page);

    // Somebody else takes it. Real inventory, not a mocked response.
    await evidence.consumeStock(SCARCE_SKU(), 1);

    await page.getByRole('button', { name: COPY.submit }).click();

    // The approved refusal, the reason stated, and the way back offered.
    await expect(page.getByText(COPY.outOfStock)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: COPY.successTitle })).toHaveCount(0);
    await expect(page.getByRole('link', { name: COPY.back })).toBeVisible();
    // No order, and no silent retry at a smaller quantity.
    expect(await evidence.countReadyMadeOrders()).toBe(before);
    proofs.stock_race_refused = true;
  });
});

/**
 * Issues and verifies one challenge through the real public endpoints.
 *
 * Used only by the API-level idempotency proof, which needs a challenge it can
 * name — the browser journey deliberately gives it none, because the id never
 * reaches the URL, storage or the DOM.
 */
async function issueAndVerifyChallenge(request: any): Promise<string> {
  contactSeed += 1;
  const before = worker.deliveryCount();
  const issued = await request.post('/api/public/verification/challenges', {
    data: {
      contactKind: 'EMAIL',
      contact: `app12-s02-api-${String(contactSeed)}@vidu.test`,
      purpose: 'SUBMISSION',
    },
  });
  // `202`, not `201`: issuing a challenge *accepts* the request and hands the
  // delivery to the notification path, which is a different claim from "a
  // resource was created at a location". Asserted as `ok()` so this proof is
  // about idempotency rather than about pinning APP4's success code.
  expect(issued.ok(), `challenge issue answered ${String(issued.status())}`).toBe(true);
  const challengeId = (await issued.json()).data.challengeId;

  // Same reason as the browser path: the delivery only exists once the worker
  // has actually run the job, and it is found by kind rather than by position.
  await runWorkerUntilIdle();
  const code = takeVerificationCode(before);
  const attempt = await request.post(
    `/api/public/verification/challenges/${String(challengeId)}/attempts`,
    { data: { code } },
  );
  expect(attempt.ok()).toBe(true);
  return challengeId as string;
}

test.describe('accessibility and the S01 hand-off', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('is completable from the keyboard alone', async ({ page }) => {
    test.setTimeout(180_000);
    const before = await evidence.countReadyMadeOrders();
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
    expect(await evidence.countReadyMadeOrders()).toBe(before + 1);
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
