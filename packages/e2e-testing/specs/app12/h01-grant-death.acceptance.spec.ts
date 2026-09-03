/**
 * `APP12-H01` Journey H — what a customer's screen holds after their grant dies.
 *
 * ## Why it is a file of its own
 *
 * The other secure journeys prove refusals against a **live** universe. This one
 * proves what happens when the credential stops being one mid-session, which is
 * a different subject and a slow one: it places an order, prices it, opens the
 * secure surface, kills the grant underneath the open page and then watches the
 * page discover that. Splitting it keeps both files inside the 600-line test
 * limit and keeps each one about a single question.
 *
 * ## Two halves, and the second is the stronger
 *
 * The API half asserts that a revoked grant is refused exactly as an unknown one
 * is — same status, same envelope code.
 *
 * The screen half then does what a word blacklist cannot: it renders the card an
 * **unknown** token produces and compares the two as text. A single differing
 * sentence between "revoked" and "never existed" is precisely what an
 * enumeration oracle is, and only a comparison can catch it. The approved card's
 * own generic copy — that a link can stop working — is not a leak, which is why
 * the blacklist form of this check was the wrong instrument.
 *
 * ## No production revocation endpoint was added
 *
 * None exists, and `APP12-H01` may not add one. The grant is killed by writing
 * the same columns the issuer's own revoke path writes, on a disposable
 * database, leaving the row's invariants intact and letting the application
 * decide what it means.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { closeS02World, openS02World, s02Worker } from './support/s02-world';
import {
  COPY,
  closeS03World,
  openAdminDriver,
  openS03World,
  openSecureOrder,
  placeOrder,
  refreshUntilVisible,
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

/** The delivered Ready-Made secure-access route (`APP12-S03`). */
const ORDER_ACCESS_ROUTE = '/truy-cap/don-hang';

/** The exact fee this run prices its order at. Not a business value. */
const FEE = '35000';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await openS02World();
  await openS03World();
});

test.afterAll(async () => {
  await closeS03World('[app12-h01-grant-death]');
  await closeS02World('[app12-h01-grant-death-world]');
});

/** A customer's browser, on the Storefront origin. See `h01-secure-security`. */
async function openShopper(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL: requiredEnv('E2E_BASE_STOREFRONT'),
    viewport: { width: 1440, height: 900 },
  });
  return { context, page: await context.newPage() };
}

/**
 * The credential this session is holding, read from the recording adapter.
 *
 * Passed to a request and never returned to an assertion: every check about it
 * below is a status code, an envelope code or a boolean.
 */
function latestOrderAccessToken(): string {
  const worker = s02Worker();
  for (let index = (worker.deliveryCount() as number) - 1; index >= 0; index -= 1) {
    if (worker.safeDelivery(index).secretKind === 'SECURE_LINK_TOKEN') {
      const url = new URL(worker.secureLinkOf(index) as string);
      const token = url.hash.slice('#t='.length);
      expect(token.length, 'the delivered fragment carries a token').toBeGreaterThan(0);
      return token;
    }
  }
  throw new Error('no SECURE_LINK_TOKEN delivery was recorded');
}

test('H — a dead grant clears the session and discloses no cause', async ({ browser, request }) => {
  test.setTimeout(600_000);
  const evidence = s03Evidence();
  const admin = await openAdminDriver(browser);
  const { context, page } = await openShopper(browser);

  try {
    const { orderCode } = await placeOrder(page);
    const orderId = await evidence.orderIdOf(orderCode);
    await admin.setShippingFee(orderId, FEE);

    await openSecureOrder(page);
    await expect(page.getByText(COPY.pillAwaitingPayment)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(orderCode, { exact: false })).toBeVisible({ timeout: 30_000 });

    // The credential this session is holding, captured before it dies so the
    // API half of the proof can use the same one the page has.
    const token = latestOrderAccessToken();
    const api = apiBaseUrl();

    // Live, on both halves, before the kill. Without this the refusals below
    // could be "the token was never any good".
    const before = await probeSecure(request, api, '/public/ready-made-orders/current', { token });
    expect(before.status, 'the credential is live before the grant is revoked').toBe(200);

    // The grant is revoked out from under the open session, by writing the same
    // columns the issuer's own revoke path writes. No delivered command revokes
    // an ORDER_ACCESS grant and `APP12-H01` may not add one, so this is a
    // disposable-database fixture mutation that preserves the row's invariants
    // and lets the application decide what it means.
    await evidence.revokeOrderAccessGrant(orderCode);

    // ── The API half ─────────────────────────────────────────────────────────
    //
    // A revoked grant is refused exactly as an unknown one is. This is the
    // non-enumeration property: the customer must not be able to tell "revoked"
    // from "never existed", or a probe learns which tokens were once real.
    const after = await probeSecure(request, api, '/public/ready-made-orders/current', { token });
    expectIndistinguishableRefusal(after, 'a revoked ORDER_ACCESS credential');

    const unknown = await probeSecure(request, api, '/public/ready-made-orders/current', {
      token: 'H01GrantDeathProbe' + 'A'.repeat(25),
    });
    expect(
      after.status === unknown.status && after.code === unknown.code,
      'a revoked grant and a token that never existed are refused identically',
    ).toBe(true);

    // ── The screen half ──────────────────────────────────────────────────────
    await refreshUntilVisible(page, page.getByRole('heading', { name: COPY.unavailableTitle }));

    const body = await page.locator('body').innerText();
    expect(body.includes(orderCode), 'the order code is gone from the screen').toBe(false);
    expect(/ORD[A-Z0-9]+FL/.test(body), 'no transfer reference remains').toBe(false);

    // The **cause** is not named. Only the cause-specific words are forbidden:
    // the approved card's own copy explains generically that a link can stop
    // working, and that generic sentence is the point of an indistinguishable
    // card rather than a leak from it.
    expect(/thu hồi|revoked/i.test(body), 'the revocation is not named').toBe(false);

    // And the stronger form of the same claim, which a word list cannot make:
    // the card a **revoked** grant renders is the same card a token that never
    // existed renders. Compared as text, so a difference of a single sentence
    // would fail — that difference is exactly what an enumeration oracle is.
    const unknownPage = await context.newPage();
    await unknownPage.goto(`${ORDER_ACCESS_ROUTE}#t=H01UnknownProbe${'B'.repeat(25)}`);
    await refreshUntilVisible(
      unknownPage,
      unknownPage.getByRole('heading', { name: COPY.unavailableTitle }),
    );
    const unknownBody = await unknownPage.locator('body').innerText();
    await unknownPage.close();
    expect(
      body === unknownBody,
      'a revoked grant and an unknown token render the identical card',
    ).toBe(true);

    // And the credential is not left lying around after the session died.
    const residue = await page.evaluate(() => ({
      local: JSON.stringify(window.localStorage),
      session: JSON.stringify(window.sessionStorage),
      html: document.documentElement.outerHTML,
      href: window.location.href,
    }));
    for (const [where, haystack] of Object.entries(residue)) {
      expect(haystack.includes(token), `the dead credential is absent from ${where}`).toBe(false);
    }
  } finally {
    await context.close();
    await admin.close();
  }
});
