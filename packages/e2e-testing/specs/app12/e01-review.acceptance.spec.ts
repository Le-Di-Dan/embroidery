/**
 * `APP12-E01` §13 and §3.5 — `PAYMENT_UNDER_REVIEW`, scanned in its own right.
 *
 * ### Why this is a project of its own
 *
 * `FU-APP12-H08-06` left one gap in the `APP12-H08` matrix: `PAYMENT_UNDER_REVIEW`
 * is the single §6 order state whose customer surface was never scanned alone.
 * Its components are covered by the six states that were, which is exactly why a
 * dedicated pass is worth doing — a state assembled entirely from scanned parts
 * can still be inaccessible as a whole.
 *
 * Reaching it needs a delivered `ORDER_ACCESS` link. E01's commerce spec composes
 * the worker over a real SMTP boundary and found that **no link survives that
 * transport** (§R of the completion report). Scanning accessibility from that
 * world would make this result hostage to an unrelated blocker, and would report
 * a delivery gap as an accessibility gap.
 *
 * So this runs on the recording topology — the one `APP12-S03` reaches the state
 * through — and states its transport explicitly rather than inheriting one: the
 * runner uses a single worker, so a previous project's `NOTIFICATION_TRANSPORT`
 * can still be in this process's environment, and a world that inherited it
 * would silently compose the adapter this file is not testing.
 *
 * ### One test, not five
 *
 * The delivered link is opened **once**. `openSecureOrder` navigates to the real
 * URL and waits for the client to strip the credential from `history`, and the
 * strip is a first-mount act — a second `goto` to the same document does not
 * remount, so re-opening per test would hang waiting for a strip that has
 * already happened. `APP12-S03`'s lifecycle suite is one long test for the same
 * reason, and re-reads the surface the way a returning customer does: refresh,
 * not re-navigate.
 */
import { expect, test, type Page } from '@playwright/test';

// `APP12-N01.B01` removed the wiring default, so a world has to say what it
// delivers over. Set before the world modules are imported, because the module
// graph reads it at composition time.
process.env['NOTIFICATION_TRANSPORT'] = 'RECORDING';

import { closeS02World, openS02World } from './support/s02-world';
import {
  COPY,
  closeS03World,
  openAdminDriver,
  openS03World,
  openSecureOrder,
  placeOrder,
  proofs,
  refreshUntilVisible,
  s03Evidence,
} from './support/s03-world';
import { initiateAttempt } from './support/s03-initiation';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

test.describe.configure({ mode: 'serial' });

/** The exact fee the operator confirms. Distinct from every seeded figure. */
const SHIPPING_FEE = '37000.00';

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '1440', width: 1440, height: 900 },
] as const;

/** Claims the review state must never make about money it has not received. */
const FALSE_CLAIMS = ['đã thanh toán thành công', 'đã nhận được tiền', 'đã xác nhận'];

test.beforeAll(async () => {
  await openS02World();
  await openS03World();
});

test.afterAll(async () => {
  await closeS03World('[app12-e01-review]');
  await closeS02World('[app12-e01-review:s02]');
});

/** One axe pass at WCAG 2.2 AA, gated on serious and critical. */
async function assertNoGatedViolations(page: Page, label: string): Promise<void> {
  const { runAxe, describeViolations } = (await import('../../support/app12/h08-axe.mjs')) as {
    runAxe: (page: Page, options: Record<string, unknown>) => Promise<{ gated: unknown[] }>;
    describeViolations: (scan: unknown) => string;
  };
  const scan = await runAxe(page, { label, disableRules: ['color-contrast'] });
  expect(scan.gated, `${label}: ${describeViolations(scan)}`).toHaveLength(0);
  proofs[`e01-axe:${label}`] = scan.gated.length;
}

test('PAYMENT_UNDER_REVIEW is truthful, offers one action, and is accessible', async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);

  // ── The state, reached through delivered operations only ────────────────
  const placed = await placeOrder(page);
  const driver = await openAdminDriver(browser);
  try {
    const orderId: string = await s03Evidence().orderIdOf(placed.orderCode);
    await driver.setShippingFee(orderId, SHIPPING_FEE);
  } finally {
    await driver.close();
  }

  await openSecureOrder(page);
  const underReview = page.getByRole('heading', { name: COPY.headingUnderReview });
  await refreshUntilVisible(page, page.getByRole('heading', { name: COPY.headingAwaitingPayment }));

  // Opening the attempt is what moves the customer's screen into the review
  // presentation. It is `AWAITING_PAYMENT` with an attempt outstanding, not a
  // ninth order state (`APP12-S03` §12C) — which is why the operator does
  // nothing further and the state still changes.
  //
  // Driven through the shared initiation helper rather than by clicking the
  // control directly, because GRD-003 demands step-up evidence before an attempt
  // may open: a bare click reaches a verification dialog, not an attempt, and a
  // spec that only clicked would sit waiting for a state the server had refused
  // to produce.
  const steppedUp = await initiateAttempt(page, placed.contact);
  proofs['e01-reviewStepUp'] = steppedUp;
  await refreshUntilVisible(page, underReview);
  proofs['e01-reviewOrder'] = placed.orderCode;

  // ── §13 the copy tells the truth ────────────────────────────────────────
  await expect(page.getByText(COPY.pillUnderReview)).toBeVisible();
  // The instructions stay on screen while the workshop reconciles (`911:328`).
  await expect(page.getByText(COPY.qrTruth)).toBeVisible();
  const body = (await page.locator('body').innerText()).toLowerCase();
  for (const claim of FALSE_CLAIMS) {
    expect(body, `the review state does not claim "${claim}"`).not.toContain(claim);
  }

  // ── §13 exactly one payment action ──────────────────────────────────────
  // The control that opens an attempt has done its job. A second one here is
  // how a customer is invited to transfer twice against one obligation.
  await expect(page.getByRole('button', { name: COPY.startAttempt })).toHaveCount(0);
  proofs['e01-reviewDuplicateActions'] = 0;

  // ── §3.5 the dedicated accessibility scan ───────────────────────────────
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(underReview).toBeVisible();
    await assertNoGatedViolations(page, `payment-under-review-${viewport.name}`);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `no horizontal document overflow at ${viewport.name}`).toBeLessThanOrEqual(1);
  }
});
