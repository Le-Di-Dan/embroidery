/**
 * `APP12-V01` — the customer's purchase path, audited state by state.
 *
 * ```text
 * Product Detail → SKU chosen → checkout (empty · refused · verified · ready)
 *                → order created → the secure ORDER_ACCESS surface
 * ```
 *
 * Every step is driven through the delivered UI rather than composed: the
 * question this project exists to answer is how a **decision** feels — whether a
 * customer can see what they are buying, what they will pay and what happens
 * next without reading the page twice — and that cannot be asked of a screen the
 * harness rendered for itself.
 *
 * The operator half of the lifecycle belongs to `v01-admin-order`, which places
 * its own order for the same reason: two Playwright projects are two processes,
 * and an order cannot be handed between them.
 *
 * ## Secrecy
 *
 * The run opens a live `ORDER_ACCESS` surface and takes **screenshots**, which
 * is a stronger exposure than any audit before it. Three things hold:
 * `openSecureOrder` strips the fragment before it returns and asserts it is
 * gone; `capture` refuses to photograph a page whose URL still carries a
 * credential; and no verification code, token or contact is ever written to the
 * ledger, whose fields are counts, colours and rectangles.
 *
 * The contact, the recipient name and the address that *do* appear inside the
 * screenshots are the harness's own synthetic values — `@vidu.test`, a made-up
 * name and a street address that is not a customer's.
 *
 * Audit only. The order it places is commercial history in the disposable
 * database the orchestrator drops.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  COPY as S02_COPY,
  MAIN_SKU,
  checkoutUrl,
  closeS02World,
  fillDelivery,
  openS02World,
  runWorkerUntilIdle,
  verifyContact,
} from './support/s02-world';
import { closeS03World, openS03World, openSecureOrder } from './support/s03-world';
import { warmGateway } from './support/h08-world';
import {
  VIEWPORTS,
  auditRouteAcross,
  createAuditLedger,
  gotoSettled,
  loadEvidence,
  requiredEnv,
  type AuditLedger,
} from './support/v01-world';

/* Plain-ESM helper layer; see `v01-world.ts`. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

/* eslint-disable @typescript-eslint/no-unsafe-call */

// Serial and generously bounded, for the reason every APP12 commerce project
// records: one journey places a real order through the real checkout and opens a
// real ORDER_ACCESS surface, and a single `verifyContact` alone is allowed 30s.
test.describe.configure({ mode: 'serial', timeout: 900_000 });

const SURFACE = 'storefront';

let ledger: AuditLedger;

test.beforeAll(async () => {
  await openS02World();
  await openS03World();
  ledger = await createAuditLedger('storefront-commerce');
});

test.afterAll(async () => {
  const { appendAuditLog } = await loadEvidence();
  appendAuditLog({
    cluster: 'Cluster 2 — Product Detail, checkout and the secure order surface',
    screens: ledger.screens(),
    screenshots: ledger.screenshots(),
    routes: ledger.routes(),
    concerns: [
      'the purchase decision, the checkout density and the secure-state clarity are judged from these',
      'see data/storefront-commerce-measurements.json',
    ],
    next: 'Cluster 3 — the Admin shell and the operator route tree',
  });
  await closeS03World('[app12-v01-commerce:s03]');
  await closeS02World('[app12-v01-commerce:s02]');
});

test('A — Product Detail, the purchase decision', async ({ page }) => {
  // See `warmGateway` (`APP12-H08`): the E2E gateway's first connection of a
  // project can stall past `proxy_connect_timeout` and answer `504`, and a 504
  // page measures and photographs perfectly while saying nothing about the
  // product. The first V01 run lost this project and the Admin order project to
  // exactly that, so every context here opens a connection before it works.
  await warmGateway(page, 'v01-commerce');
  await auditRouteAcross(page, ledger, {
    surface: SURFACE,
    route: 'product-detail',
    path: `/san-pham/${requiredEnv('E2E_APP12_S02_PRODUCT_SLUG')}`,
    viewports: VIEWPORTS,
    state: 'in-stock',
    aboveFold: true,
  });

  // The same page once a variant has been chosen: the state the panel spends
  // most of its life in, and the one where the price, the availability line and
  // the CTA all have their final values.
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await gotoSettled(page, `/san-pham/${requiredEnv('E2E_APP12_S02_PRODUCT_SLUG')}`);
    // Chosen the way the DOM allows rather than the way Playwright prefers.
    //
    // Each option is a **transparent** `<input type="radio">` behind the pill
    // that draws it (`APP12-S01`), so it has a box but no visible paint —
    // `check()` refuses it, and `check({ force: true })` still refuses it,
    // because Playwright's visibility rule is about the input rather than about
    // what a customer can see and press. Clicking through the element's own
    // handler is the honest equivalent of pressing the pill: it fires the same
    // change the pill's label would.
    const firstOption = page.locator('fieldset input[type="radio"]').first();
    await firstOption.waitFor({ state: 'attached', timeout: 30_000 });
    await firstOption.evaluate((element: HTMLElement) => {
      element.click();
    });
    await page.waitForTimeout(600);
    await ledger.audit(page, {
      surface: SURFACE,
      route: 'product-detail',
      viewport,
      state: 'variant-selected',
      aboveFold: true,
    });
  }
});

/**
 * Opens the checkout at one viewport and audits the states in order.
 *
 * The three pre-submission states are audited on **one** page rather than three
 * fresh loads, because they are three moments of one form and a reload would
 * reset the very progression under review.
 */
async function auditCheckoutStates(page: Page, viewport: (typeof VIEWPORTS)[number]) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await gotoSettled(page, checkoutUrl(MAIN_SKU(), '1'));
  await ledger.audit(page, {
    surface: SURFACE,
    route: 'checkout',
    viewport,
    state: 'initial',
    aboveFold: true,
  });

  // The refusal, reached the way a customer reaches it: pressing the order
  // button before the contact has been verified. It is the screen's own
  // validation state, not an injected one.
  await page.getByRole('button', { name: S02_COPY.submit }).click({ trial: false });
  await page.waitForTimeout(600);
  await ledger.audit(page, {
    surface: SURFACE,
    route: 'checkout',
    viewport,
    state: 'refused-unverified',
    aboveFold: true,
  });

  const contact = await verifyContact(page);
  await ledger.audit(page, {
    surface: SURFACE,
    route: 'checkout',
    viewport,
    state: 'contact-verified',
    aboveFold: true,
  });

  await fillDelivery(page);
  await page.waitForTimeout(300);
  await ledger.audit(page, {
    surface: SURFACE,
    route: 'checkout',
    viewport,
    state: 'ready-to-submit',
    aboveFold: true,
  });
  return contact;
}

test('B — the checkout, at every viewport and in every state it passes through', async ({
  page,
}) => {
  // 1440 and 390 carry the full state walk — they are the two compositions that
  // differ, and each walk costs a real verification. 1024 is captured in its
  // initial and verified states, which is where its column behaviour differs.
  await auditCheckoutStates(page, VIEWPORTS[0]!);
  await auditCheckoutStates(page, VIEWPORTS[2]!);

  await page.setViewportSize({ width: VIEWPORTS[1]!.width, height: VIEWPORTS[1]!.height });
  await gotoSettled(page, checkoutUrl(MAIN_SKU(), '1'));
  await ledger.audit(page, {
    surface: SURFACE,
    route: 'checkout',
    viewport: VIEWPORTS[1]!,
    state: 'initial',
    aboveFold: true,
  });
});

test('C — the order is created, and the customer is told what happens next', async ({ page }) => {
  await page.setViewportSize({ width: VIEWPORTS[0]!.width, height: VIEWPORTS[0]!.height });
  await gotoSettled(page, checkoutUrl(MAIN_SKU(), '1'));
  await verifyContact(page);
  await fillDelivery(page);

  await page.getByRole('button', { name: S02_COPY.submit }).click();
  await expect(page.getByRole('heading', { name: S02_COPY.successTitle })).toBeVisible({
    timeout: 30_000,
  });
  await ledger.audit(page, {
    surface: SURFACE,
    route: 'checkout',
    viewport: VIEWPORTS[0]!,
    state: 'order-created',
    aboveFold: true,
  });

  // The same panel on a phone, because "what do I do now" is the moment a
  // customer is most likely to be holding one.
  await ledger.audit(page, {
    surface: SURFACE,
    route: 'checkout',
    viewport: VIEWPORTS[2]!,
    state: 'order-created',
    aboveFold: true,
  });

  await runWorkerUntilIdle();
});

test('D — the secure order surface, as it opens', async ({ page }) => {
  // The state every customer meets first: the order exists, no operator has
  // priced the delivery yet, and the page has to say so without alarming anyone.
  // The later states belong to `v01-admin-order`, which is the project that can
  // move them.
  await openSecureOrder(page);
  for (const viewport of VIEWPORTS) {
    await ledger.audit(page, {
      surface: SURFACE,
      route: 'secure-order',
      viewport,
      state: 'awaiting-shipping-fee',
      aboveFold: true,
    });
  }
});
