/**
 * `APP12-H01` Journeys B, C, D, E and G — the Wave-1 secure surface, proved by
 * what it refuses.
 *
 * ## What this file is, and what it deliberately is not
 *
 * `APP12-S03` already drives the *acceptance* half of this universe: the
 * customer's screen through the whole Ready-Made lifecycle, a real upload, an
 * expiry, a fee correction and a revoked grant. Repeating those here would be
 * two suites asserting one thing.
 *
 * This file is the **security delta** — the probes S03 had no reason to make,
 * and the one it made in a deliberately weaker form:
 *
 * ```text
 * B  an unverified caller cannot create an order at all
 * C  the delivered ORDER_ACCESS link leaves no token anywhere observable
 * D  possession of the link is not authority to pay
 * E  a REAL credential A, pointed at order B's attempt, is refused
 * G  the upload seam refuses a matrix of hostile payloads
 * ```
 *
 * E is the one that matters most. S03's cross-order probe uses a *fabricated*
 * token, and says so: the browser holds the real credential in an ephemeral ref
 * the page never exposes. That proves a caller with **no** credential is
 * refused. It does not prove that a caller holding a **real, live, valid**
 * credential for one order cannot reach another order's subordinate objects —
 * which is the actual IDOR question, and the one the H01 directive names. This
 * file reads both credentials out of the recording worker adapter, where they
 * legitimately exist, and makes that probe for real.
 *
 * ## The credentials are held, used, and never surfaced
 *
 * Two live `ORDER_ACCESS` tokens pass through this module. Every assertion about
 * them is a status code, an envelope code or a boolean — never the value — for
 * the reason `expect` prints what it received. Nothing is returned to a caller,
 * attached to a report, or written to disk; the project disables trace, video
 * and screenshots so no artifact can capture a request body either.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { closeS02World, openS02World, runWorkerUntilIdle, s02Worker } from './support/s02-world';
import {
  COPY,
  closeS03World,
  openAdminDriver,
  openS03World,
  openSecureOrder,
  placeOrder,
  s03Evidence,
} from './support/s03-world';
import {
  apiBaseUrl,
  expectIndistinguishableRefusal,
  probeSecure,
  requiredEnv,
} from './support/h01-security';

/* The harness helper layer is plain ESM `.mjs` — it has to be, because the same
   modules load outside ts-jest — so the worker control and the evidence reader
   arrive untyped. As in `s03-journeys` and `a02-world`, this file treats those
   imports as `any` and lets each explicit `expect` be the contract. */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

/**
 * A customer's browser, on the Storefront origin.
 *
 * This project's `baseURL` is the **Admin** origin, because Journey A's subject
 * is the operator’s screen. A customer journey therefore opens its own
 * context, exactly as `APP12-A02` does — which is also the honest shape: the two
 * actors in these journeys are two real sessions that share nothing but the
 * database.
 */
async function openShopper(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL: requiredEnv('E2E_BASE_STOREFRONT'),
    viewport: { width: 1440, height: 900 },
  });
  return { context, page: await context.newPage() };
}

/** The exact fee this run prices its orders at. Not a business value. */
const FEE = '35000';

/** A 1×1 PNG — a genuinely valid image the signature check accepts. */
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  // Both worlds: S02 owns the runtime, the worker and the checkout fixture; S03
  // owns the commercial evidence reader these journeys count rows with. They are
  // two readers over one disposable database, opened in the order S03's own
  // suites open them.
  await openS02World();
  await openS03World();
});

test.afterAll(async () => {
  await closeS03World('[app12-h01-secure]');
  await closeS02World('[app12-h01-secure-world]');
});

/**
 * The most recent delivered `ORDER_ACCESS` token, read from the recording
 * adapter the worker writes to.
 *
 * This is the one place a live credential is extracted, and it exists so the
 * cross-order probe can be made with a **real** one. The value is returned to a
 * single caller inside this file, passed to a request, and never asserted on.
 */
function latestOrderAccessToken(): string {
  const worker = s02Worker();
  for (let index = worker.deliveryCount() - 1; index >= 0; index -= 1) {
    if (worker.safeDelivery(index).secretKind === 'SECURE_LINK_TOKEN') {
      const url = new URL(worker.secureLinkOf(index) as string);
      const token = url.hash.slice('#t='.length);
      expect(token.length, 'the delivered fragment carries a token').toBeGreaterThan(0);
      return token;
    }
  }
  throw new Error('no SECURE_LINK_TOKEN delivery was recorded');
}

test('B — an unverified caller cannot create a Ready-Made order', async ({ request }) => {
  test.setTimeout(120_000);

  const evidence = s03Evidence();
  // A **delta**, not an absolute. Other journeys in this project legitimately
  // create orders, and whether they ran first is a file-ordering accident rather
  // than anything this journey is about.
  const before = (await evidence.countReadyMadeOrders()) as number;

  // The delivered creation operation, called with no verification proof at all.
  // `publicReadyMadeOrder_create` is STATIC_ALLOW — it is not withheld by the
  // release gate — so this refusal is the verification requirement itself and
  // nothing else.
  const response = await request.post(`${apiBaseUrl()}/public/ready-made-orders`, {
    data: { skuId: '00000000-0000-4000-8000-000000000000', quantity: 1 },
    failOnStatusCode: false,
  });

  expect(response.status(), 'an unverified create is refused').toBeGreaterThanOrEqual(400);
  expect(response.status(), 'and is refused by the application, not by a crash').toBeLessThan(500);

  // Nothing was created. A 4xx with a row behind it would be worse than a 200.
  expect(await evidence.countReadyMadeOrders(), 'the refusal created no order').toBe(before);
});

test('C — the delivered link leaves no credential anywhere observable', async ({ browser }) => {
  test.setTimeout(420_000);
  const { context, page } = await openShopper(browser);

  try {
    await placeOrder(page);
    await openSecureOrder(page);

    // `openSecureOrder` has already asserted the fragment was stripped. What this
    // adds is everywhere else a credential could have been left behind.
    const leaks = await page.evaluate(() => {
      const storage = (store: Storage): string => {
        let out = '';
        for (let i = 0; i < store.length; i += 1) {
          const key = store.key(i);
          if (key === null) continue;
          out += `${key}=${store.getItem(key) ?? ''};`;
        }
        return out;
      };
      return {
        local: storage(window.localStorage),
        session: storage(window.sessionStorage),
        cookie: document.cookie,
        html: document.documentElement.outerHTML,
        href: window.location.href,
        historyState: JSON.stringify(window.history.state ?? null),
      };
    });

    // Asserted as booleans. A `toContain` failure would print the haystack, and
    // the haystack here is the page's entire HTML.
    const token = latestOrderAccessToken();
    for (const [where, haystack] of Object.entries(leaks)) {
      expect(haystack.includes(token), `the token is absent from ${where}`).toBe(false);
    }

    // And the address bar carries neither a fragment nor a query.
    expect(leaks.href.includes('#'), 'the address bar carries no fragment').toBe(false);
    expect(leaks.href.includes('?'), 'the address bar carries no query').toBe(false);
  } finally {
    await context.close();
  }
});

test('D — possession of the link is not authority to open a payment attempt', async ({
  browser,
  request,
}) => {
  test.setTimeout(420_000);
  const evidence = s03Evidence();
  const admin = await openAdminDriver(browser);
  const { context, page } = await openShopper(browser);

  try {
    const { orderCode } = await placeOrder(page);
    const orderId = await evidence.orderIdOf(orderCode);
    await admin.setShippingFee(orderId, FEE);

    await openSecureOrder(page);
    await expect(page.getByText(COPY.pillAwaitingPayment)).toBeVisible({ timeout: 30_000 });

    const token = latestOrderAccessToken();
    const api = apiBaseUrl();

    // The read is allowed: this credential opens this order.
    const read = await probeSecure(request, api, '/public/orders/full-payment', { token });
    expect(read.status, 'the FULL obligation is readable with its own credential').toBe(200);

    // The QR is allowed too — it is a read of the same obligation.
    const qr = await request.post(`${api}/public/orders/full-payment/qr`, {
      data: { token },
      failOnStatusCode: false,
    });
    expect(qr.status(), 'the QR is served to the order’s own credential').toBe(200);

    // The **initiation** is not. `APP12-B04` locks it behind a delivered
    // step-up, precisely so a forwarded link cannot by itself open a payment
    // attempt. This is the whole point of Journey D: the same credential that
    // just read the obligation is refused when it tries to act on it.
    const initiate = await request.post(`${api}/public/orders/full-payment/attempts`, {
      data: { token },
      headers: { 'Idempotency-Key': `h01-step-up-probe-${Date.now()}` },
      failOnStatusCode: false,
    });
    const body = (await initiate.json().catch(() => ({}))) as { code?: string };
    expect(
      initiate.status(),
      'initiation without a step-up is refused rather than opening an attempt',
    ).toBe(403);
    expect(body.code, 'and it is refused as a re-verification requirement').toBe(
      'REVERIFICATION_REQUIRED',
    );

    // Nothing was opened. The refusal is a refusal, not a warning.
    expect(await evidence.fullAttemptsOf(orderCode)).toHaveLength(0);
  } finally {
    await context.close();
    await admin.close();
  }
});

test('E — a real credential for one order reaches no part of another', async ({
  browser,
  request,
}) => {
  test.setTimeout(600_000);
  const evidence = s03Evidence();
  const admin = await openAdminDriver(browser);
  const { context, page } = await openShopper(browser);

  try {
    // ── Order B: payable, with a real live attempt to aim at ────────────────
    const b = await placeOrder(page);
    const bOrderId = await evidence.orderIdOf(b.orderCode);
    await admin.setShippingFee(bOrderId, FEE);
    await openSecureOrder(page);
    await expect(page.getByText(COPY.pillAwaitingPayment)).toBeVisible({ timeout: 30_000 });
    await openAttempt(page, b.contact);
    const bAttempt = await evidence.liveFullAttemptOf(b.orderCode);
    expect(bAttempt?.id, 'order B has a real live FULL attempt').toBeDefined();

    // ── Order A: a different customer, a different grant ─────────────────────
    const a = await placeOrder(page);
    const aOrderId = await evidence.orderIdOf(a.orderCode);
    await admin.setShippingFee(aOrderId, FEE);
    await openSecureOrder(page);

    // The **real** credential A. This is the upgrade over `APP12-S03`'s probe,
    // which used a fabricated token: a caller with no credential being refused
    // says nothing about a caller holding a live one for the wrong object.
    const credentialA = latestOrderAccessToken();
    const api = apiBaseUrl();

    // Sanity: credential A really is live and really does open order A. Without
    // this the refusals below could all be "the token is dead".
    const own = await probeSecure(request, api, '/public/ready-made-orders/current', {
      token: credentialA,
    });
    expect(own.status, 'credential A opens its own order').toBe(200);

    // ── The probe ────────────────────────────────────────────────────────────
    //
    // Order B's attempt id, named by order A's live credential. The evidence
    // lane is the one Wave-1 operation that takes a subordinate locator at all,
    // which makes it the only place a cross-order probe is even expressible.
    const crossOrder = await probeSecure(request, api, '/public/orders/deposit/evidence/status', {
      accessToken: credentialA,
      attemptId: bAttempt.id,
    });
    expectIndistinguishableRefusal(crossOrder, 'order B’s attempt named by credential A');

    // And the refusal is indistinguishable from one for an attempt that never
    // existed — so the probe cannot be used to learn whether an id is real.
    const fictional = await probeSecure(request, api, '/public/orders/deposit/evidence/status', {
      accessToken: credentialA,
      attemptId: '00000000-0000-4000-8000-000000000000',
    });
    expect(
      fictional.status === crossOrder.status && fictional.code === crossOrder.code,
      'a real foreign attempt and a fictional one are refused identically',
    ).toBe(true);

    // ── The customer credential is not an operator credential ────────────────
    //
    // Sent as a bearer token, as a cookie, and as a body field: three shapes a
    // confused deputy might accept. None of them is a staff session.
    for (const attempt of [
      { headers: { authorization: `Bearer ${credentialA}` } },
      { headers: { cookie: `adm_session=${credentialA}` } },
    ]) {
      const adminProbe = await request.get(`${requiredEnv('E2E_BASE_ADMIN')}/api/admin/orders`, {
        ...attempt,
        failOnStatusCode: false,
      });
      expect(
        adminProbe.status(),
        'a customer ORDER_ACCESS credential authorizes no Admin operation',
      ).toBe(401);
    }
  } finally {
    await context.close();
    await admin.close();
  }
});

test('G — the evidence upload seam accepts a real image and refuses a hostile one', async ({
  browser,
  request,
}) => {
  test.setTimeout(600_000);
  const evidence = s03Evidence();
  const admin = await openAdminDriver(browser);
  const { context, page } = await openShopper(browser);

  try {
    const { orderCode, contact } = await placeOrder(page);
    const orderId = await evidence.orderIdOf(orderCode);
    await admin.setShippingFee(orderId, FEE);
    await openSecureOrder(page);
    await expect(page.getByText(COPY.pillAwaitingPayment)).toBeVisible({ timeout: 30_000 });
    await openAttempt(page, contact);

    const attempt = await evidence.liveFullAttemptOf(orderCode);
    const token = latestOrderAccessToken();
    const api = apiBaseUrl();

    // ── The legitimate upload, through the delivered screen ──────────────────
    await page
      .locator('.secure-order__uploader-input')
      .setInputFiles({ name: 'bien-lai.png', mimeType: 'image/png', buffer: VALID_PNG });

    // Polled with the worker pumped, because the row is written by the upload
    // but the screen's own state depends on the inspector, and this project
    // holds the job loop closed. On failure the page's own notice is read out,
    // so "the count stayed at zero" becomes the reason the customer was given —
    // the same diagnostic `APP12-S03`'s initiation helper uses.
    try {
      await expect
        .poll(
          async (): Promise<number> => {
            await runWorkerUntilIdle();
            return (await evidence.countEvidenceFor(orderCode)) as number;
          },
          { timeout: 120_000, intervals: [1_000, 2_000, 5_000] },
        )
        .toBe(1);
    } catch (error) {
      const notice = await page.locator('.secure-order__note--danger').allInnerTexts();
      throw new Error(
        `the legitimate evidence upload stored no row; page notice: ${
          notice.length === 0 ? '(none rendered)' : notice.join(' | ')
        }`,
        { cause: error },
      );
    }

    // ── The hostile matrix, through the same delivered HTTP seam ─────────────
    //
    // No malware. Each fixture is a *shape* the intake must refuse: a declared
    // type that the bytes contradict, a payload that is not an image at all, a
    // size beyond the cap, an empty body, a format outside the allowlist, and
    // four filenames that would be dangerous if a filename ever reached a key.
    const hostile: { name: string; fileName: string; mime: string; body: Buffer }[] = [
      {
        name: 'a text payload declaring image/png',
        fileName: 'bien-lai.png',
        mime: 'image/png',
        body: Buffer.from('this is not a PNG, it is prose'),
      },
      {
        name: 'HTML declaring image/jpeg',
        fileName: 'bien-lai.jpg',
        mime: 'image/jpeg',
        body: Buffer.from('<!doctype html><script>1</script>'),
      },
      {
        name: 'an oversized payload',
        fileName: 'lon.png',
        mime: 'image/png',
        body: Buffer.concat([VALID_PNG, Buffer.alloc(12 * 1024 * 1024, 0x41)]),
      },
      { name: 'an empty body', fileName: 'rong.png', mime: 'image/png', body: Buffer.alloc(0) },
      {
        name: 'an unsupported format',
        fileName: 'tep.svg',
        mime: 'image/svg+xml',
        body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      },
      {
        name: 'a traversal filename',
        fileName: '../../../../etc/passwd.png',
        mime: 'image/png',
        body: VALID_PNG,
      },
      {
        name: 'an absolute-looking filename',
        fileName: 'C:\\Windows\\System32\\evil.png',
        mime: 'image/png',
        body: VALID_PNG,
      },
      {
        name: 'a filename of odd unicode',
        fileName: '\u202Egnp.exe.png',
        mime: 'image/png',
        body: VALID_PNG,
      },
    ];

    for (const fixture of hostile) {
      const response = await request.post(`${api}/public/orders/deposit/evidence`, {
        headers: { 'Idempotency-Key': `h01-abuse-${Date.now()}-${Math.random().toString(36)}` },
        multipart: {
          accessToken: token,
          attemptId: attempt.id,
          file: { name: fixture.fileName, mimeType: fixture.mime, buffer: fixture.body },
        },
        failOnStatusCode: false,
      });

      // Refused by the application, never by a crash. A 5xx here would be the
      // intake failing open on a payload it could not classify.
      expect(response.status(), `${fixture.name} is refused`).toBeGreaterThanOrEqual(400);
      expect(response.status(), `${fixture.name} is refused safely`).toBeLessThan(500);

      // And the refusal discloses no storage internals.
      const text = await response.text();
      for (const secret of ['bucket', 'objectKey', 'minio', 'amazonaws', 's3://', 'originals/']) {
        expect(
          text.toLowerCase().includes(secret.toLowerCase()),
          `${fixture.name} discloses no ${secret}`,
        ).toBe(false);
      }
    }

    // The whole matrix stored nothing: the count is still the one legitimate
    // image. Eight refusals that each left a row would be eight failures.
    expect(await evidence.countEvidenceFor(orderCode)).toBe(1);

    // ── The private read stays authorized ────────────────────────────────────
    const anonymous = await request.post(`${api}/public/orders/deposit/evidence/status`, {
      data: { accessToken: '', attemptId: attempt.id },
      failOnStatusCode: false,
    });
    expect(anonymous.status(), 'an anonymous evidence read is refused').toBeGreaterThanOrEqual(400);
  } finally {
    await context.close();
    await admin.close();
  }
});

/**
 * Opens a FULL payment attempt through the delivered screen, completing the
 * step-up the server demands.
 *
 * Deliberately the **same** sequence `APP12-S03`'s lifecycle journey performs,
 * driven with the delivered APP4 verification driver rather than with selectors
 * of its own: if the secure order surface had quietly built a second OTP flow,
 * this helper could not drive it, which is a stronger proof of reuse than any
 * assertion about the source. These journeys need it only so a cross-order probe
 * has a real attempt to aim at.
 */
async function openAttempt(page: Page, contact: string): Promise<void> {
  const { runWorkerUntilIdle } = await import('./support/s02-world');
  const { createS01Driver } = await import('../app4/support/s01-verification-driver');

  const start = page.getByRole('button', { name: COPY.startAttempt });
  const stepUp = page.getByRole('heading', { name: COPY.stepUpTitle });
  const evidenceHeading = page.getByRole('heading', { name: COPY.evidenceTitle });

  await start.click();

  // Retried, bounded, by pressing the delivered control again.
  //
  // The secure-link limiter counts **requests and never outcomes** — deliberately,
  // so it cannot become a validity oracle — which means a run that has already
  // exercised several security journeys can meet its own budget here. That is the
  // limiter working, not the initiation failing, and the delivered screen's answer
  // to it is a control the customer presses again. The poll therefore outlasts the
  // 60-second window and re-presses, which is what a customer does and is a
  // stronger proof of the affordance than asserting it exists.
  try {
    await expect
      .poll(
        async () => {
          if ((await stepUp.count()) > 0 || (await evidenceHeading.count()) > 0) return true;
          const retry = page.getByRole('button', { name: 'Thử lại' });
          if (await retry.isVisible().catch(() => false)) await retry.click();
          else if (await start.isVisible().catch(() => false)) await start.click();
          return false;
        },
        { timeout: 150_000, intervals: [2_000, 5_000, 10_000] },
      )
      .toBe(true);
  } catch (error) {
    const notice = await page.locator('.secure-order__note--danger').allInnerTexts();
    throw new Error(
      `initiation reached neither a step-up nor an attempt; page notice: ${
        notice.length === 0 ? '(none rendered)' : notice.join(' | ')
      }`,
      { cause: error },
    );
  }

  if ((await stepUp.count()) > 0) {
    const worker = s02Worker();
    const driver = createS01Driver(page);
    const before = worker.deliveryCount() as number;

    await driver.chooseContactKind('EMAIL');
    await driver.enterContact('EMAIL', contact);
    await driver.submitContact();
    await expect(page.getByRole('heading', { name: 'Nhập mã xác minh' })).toBeVisible({
      timeout: 30_000,
    });

    await runWorkerUntilIdle();

    // Found by **kind**, not by position: this order has already produced a
    // SECURE_LINK_TOKEN delivery, so "the newest delivery" is the wrong one.
    let code: string | undefined;
    for (let index = (worker.deliveryCount() as number) - 1; index >= before; index -= 1) {
      if (worker.safeDelivery(index).secretKind === 'VERIFICATION_CODE') {
        code = worker.secretOf(index) as string;
        break;
      }
    }
    expect(code, 'a VERIFICATION_CODE delivery was recorded for the step-up').toBeDefined();

    await driver.enterCode(code!);
    await driver.submitCode();
    await expect(stepUp).toHaveCount(0, { timeout: 30_000 });
  }

  await expect(evidenceHeading).toBeVisible({ timeout: 60_000 });
}
