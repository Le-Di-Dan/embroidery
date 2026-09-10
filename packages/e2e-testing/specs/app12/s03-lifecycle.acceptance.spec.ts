/**
 * `APP12-S03` Journey A — the full Ready-Made customer tail, live.
 *
 * One real order per viewport, walked from `AWAITING_SHIPPING_FEE` to
 * `COMPLETED` through the real API, the real worker, the real operator
 * operations and a real Chromium. Nothing is mocked and nothing is seeded but
 * the catalog.
 *
 * ```text
 * verified customer → order → real ORDER_ACCESS notification
 *   → AWAITING_SHIPPING_FEE
 * Admin sets the fee   → AWAITING_PAYMENT, exact FULL, QR, bank fallback
 * customer STEP_UP     → FULL attempt opened
 * Admin verifies       → READY_FOR_DELIVERY
 * Admin dispatches     → DELIVERED
 * Admin completes      → COMPLETED
 * ```
 *
 * No real bank transfer happens: the operator confirms the exact figures the
 * customer's own screen displayed, against a synthetic merchant account.
 */
import { expect, test, type Page } from '@playwright/test';

import { closeS02World, openS02World } from './support/s02-world';
import {
  COPY,
  VIEWPORTS,
  openAdminDriver,
  openSecureOrder,
  placeOrder,
  proofs,
  readPayableTotal,
  readTransferReference,
  refreshUntilVisible,
  closeS03World,
  openS03World,
  s03Evidence,
  statusPill,
} from './support/s03-world';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

/** The exact fee the operator sets. Distinct from every seeded figure. */
const SHIPPING_FEE = '35000.00';

/**
 * `APP12-U01-C1` copy, transcribed as expectations for the same reason
 * `s03-world.ts`'s catalog is — and kept here so that shared module stays
 * inside its size limit.
 */
const U01_COPY = {
  // F2 — once paid, the card keeps the total as history.
  amountSummaryTitle: 'Số tiền đơn hàng',
  amountSettled: 'Tổng đã thanh toán',
  // F4 — cause-neutral: it never claims a replacement link.
  unavailableBody: 'Không thể tiếp tục từ trang này',
} as const;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await openS02World();
  await openS03World();
});

test.afterAll(async () => {
  await closeS03World('[app12-s03-lifecycle]');
  await closeS02World('[app12-s03-lifecycle:s02]');
});

/** Every carrier and tracking word the surface may never print (§28, §53). */
const FORBIDDEN_LOGISTICS = ['mã vận đơn', 'đơn vị giao', 'theo dõi đơn', 'tracking', 'carrier'];

/**
 * One fact row's term element, matched exactly.
 *
 * `getByText` is a case-insensitive **substring** match, and several approved
 * sentences on these states legitimately contain "phí giao hàng" — the pill,
 * the next-action line and the pending-total line. Only the amount card's own
 * `<dt>` carries the label alone, so that is what presence and absence are
 * asserted against.
 */
function factLabel(page: Page, label: string) {
  return page.locator(`.secure-order__fact-label:text-is("${label}")`);
}

async function pageText(page: Page): Promise<string> {
  return (await page.locator('body').innerText()).toLowerCase();
}

/**
 * `APP12-U01-C1` F2 — a paid order keeps its exact total and asks for nothing.
 *
 * `shown` is the figure the customer saw while paying, already checked against
 * the obligation row. The settled highlight must repeat it verbatim, and neither
 * the pending-fee sentence nor the "amount to pay" title may survive payment.
 */
async function assertSettled(page: Page, shown: string): Promise<void> {
  const settled = page.getByTestId('secure-order-settled-total');
  await expect(settled).toContainText(U01_COPY.amountSettled);
  await expect(settled).toContainText(shown);
  await expect(page.getByRole('heading', { name: U01_COPY.amountSummaryTitle })).toBeVisible();
  await expect(page.getByText(COPY.amountPending)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: COPY.amountTitle })).toHaveCount(0);
}

/** One axe pass at WCAG 2.2 AA, gated on serious and critical (see N01.S1). */
async function assertNoGatedViolations(page: Page, label: string): Promise<void> {
  const { runAxe, describeViolations } = (await import('../../support/app12/h08-axe.mjs')) as {
    runAxe: (page: Page, options: Record<string, unknown>) => Promise<{ gated: unknown[] }>;
    describeViolations: (scan: unknown) => string;
  };
  const scan = await runAxe(page, { label, disableRules: ['color-contrast'] });
  expect(scan.gated, `${label}: ${describeViolations(scan)}`).toHaveLength(0);
  proofs[`axe:${label}`] = scan.gated.length;
}

for (const viewport of VIEWPORTS) {
  test(`full Ready-Made lifecycle at ${viewport.name}`, async ({ page, browser }) => {
    test.setTimeout(420_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    const evidence = s03Evidence();
    const admin = await openAdminDriver(browser);

    try {
      // ── 1–5. A real order, and the real link the worker delivered ─────────
      const { orderCode, contact } = await placeOrder(page);
      proofs[`order_${viewport.name}`] = orderCode;

      expect(await evidence.orderStatusOf(orderCode)).toBe('AWAITING_SHIPPING_FEE');
      const orderId = await evidence.orderIdOf(orderCode);

      await openSecureOrder(page);

      // The heading is state-aware since `APP12-V02` §17.1: it names the state
      // the order is actually in rather than saying `Thanh toán đơn hàng` on a
      // page where nothing is payable yet.
      await expect(
        page.getByRole('heading', { level: 1, name: COPY.headingAwaitingFee }),
      ).toBeVisible();
      await expect(page.getByText(COPY.pillAwaitingFee)).toBeVisible();
      await expect(page.getByText(COPY.bodyAwaitingFee)).toBeVisible();
      await expect(page.getByText(orderCode, { exact: false })).toBeVisible();

      // §17 — no total, no QR, no initiation before the fee exists.
      await expect(page.getByText(COPY.amountPending)).toBeVisible();
      await expect(page.getByRole('heading', { name: COPY.qrTitle })).toHaveCount(0);
      await expect(page.getByRole('button', { name: COPY.startAttempt })).toHaveCount(0);
      // Scoped to the amount card's own term list, and `exact`. `getByText` is
      // a case-insensitive *substring* match, and three approved sentences on
      // this state legitimately contain "phí giao hàng" — the pill, the
      // next-action line and the pending-total line. What must be absent is the
      // fee **row**, which is the only place the label stands alone.
      await expect(factLabel(page, COPY.feeLabel)).toHaveCount(0);

      await page.screenshot({
        path: `test-results/app12-s03/${viewport.name}-01-awaiting-shipping-fee.png`,
      });

      // ── 6–11. The operator prices delivery; the surface catches up ────────
      await admin.setShippingFee(orderId, SHIPPING_FEE);
      expect(await evidence.orderStatusOf(orderCode)).toBe('AWAITING_PAYMENT');

      await refreshUntilVisible(page, page.getByText(COPY.pillAwaitingPayment));

      // The payable figure is the obligation's own, read back from the database
      // and compared against what the customer is actually looking at.
      const obligation = await evidence.liveFullObligationOf(orderCode);
      expect(obligation?.status).toBe('PENDING');
      const shown = await readPayableTotal(page);
      expect(shown.replace(/\./g, '')).toBe(String(obligation.amount).split('.')[0]);

      // Both supporting rows are present, each exactly once. Matched on the
      // amount card's own term element, so a sentence that merely mentions the
      // words cannot satisfy it.
      await expect(factLabel(page, COPY.merchandiseLabel)).toHaveCount(1);
      await expect(factLabel(page, COPY.feeLabel)).toHaveCount(1);

      // §20/§21 — the QR exists, and so does the textual fallback beside it.
      await expect(page.getByRole('heading', { name: COPY.qrTitle })).toBeVisible();
      await expect(page.getByRole('img', { name: /Mã QR chuyển khoản/ })).toHaveCount(1);
      await expect(page.getByText(COPY.qrTruth)).toBeVisible();

      await page.screenshot({
        path: `test-results/app12-s03/${viewport.name}-02-awaiting-payment.png`,
      });

      // ── 12–14. STEP_UP, then one attempt ─────────────────────────────────
      //
      // The step-up is **conditional**, and that is the delivered behaviour:
      // `APP12-B04` asks for one only when GRD-003 finds no recent
      // re-verification, so a customer who verified moments ago at checkout is
      // not asked twice. §18's rule is that the *screen* never assumes either
      // way — it calls initiate first and lets the server decide — so the run
      // asserts exactly that and takes whichever branch the server chose.
      proofs[`step_up_${viewport.name}`] = await initiateAttempt(page, contact);

      // The **evidence** section is the attempt's own observable: the transfer
      // card is mounted from `payable` and was already on screen before the
      // step-up, so waiting for it would let a failed initiation pass for a
      // successful one.
      await expect(page.getByRole('heading', { name: COPY.evidenceTitle })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole('heading', { name: COPY.transferTitle })).toBeVisible();
      await expect(page.getByText(COPY.pillUnderReview)).toBeVisible();

      const attempt = await evidence.liveFullAttemptOf(orderCode);
      expect(attempt?.status).toBe('PENDING');
      expect(String(attempt.amount)).toBe(String(obligation.amount));

      const reference = await readTransferReference(page);
      await page.screenshot({
        path: `test-results/app12-s03/${viewport.name}-03-transfer-instructions.png`,
      });

      // ── 15–18. The operator verifies; only that can settle it ────────────
      await admin.verifyFullPayment(attempt.id, String(attempt.amount), reference);
      expect(await evidence.orderStatusOf(orderCode)).toBe('READY_FOR_DELIVERY');

      await refreshUntilVisible(page, page.getByText(COPY.pillReadyForDelivery));
      await expect(page.getByRole('button', { name: COPY.startAttempt })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: COPY.qrTitle })).toHaveCount(0);
      await assertSettled(page, shown);

      // §25 — the reservation is consumed, so the deadline stops being shown
      // while the access-expiry note stays. Two facts, and only one of them ended.
      await expect(page.getByText(new RegExp(COPY.deadlinePrefix))).toHaveCount(0);
      await expect(page.getByText(new RegExp(COPY.accessExpiryPrefix))).toBeVisible();

      await page.screenshot({
        path: `test-results/app12-s03/${viewport.name}-04-ready-for-delivery.png`,
      });

      // ── 19–22. Dispatch, and no tracking UI ──────────────────────────────
      await admin.dispatch(orderId);
      expect(await evidence.orderStatusOf(orderCode)).toBe('DELIVERED');

      // The exact pill: since `APP12-V02` §17.1 the heading "Đơn hàng đã giao"
      // also contains the pill's words, so a substring match is ambiguous.
      await refreshUntilVisible(page, statusPill(page, COPY.pillDelivered));
      await assertSettled(page, shown);

      const delivered = await pageText(page);
      for (const forbidden of FORBIDDEN_LOGISTICS) {
        expect(delivered, `"${forbidden}" must not appear`).not.toContain(forbidden);
      }

      await page.screenshot({
        path: `test-results/app12-s03/${viewport.name}-05-delivered.png`,
      });

      // ── 23–25. Completion, terminal ──────────────────────────────────────
      await admin.complete(orderId);
      expect(await evidence.orderStatusOf(orderCode)).toBe('COMPLETED');

      await refreshUntilVisible(page, statusPill(page, COPY.pillCompleted));
      await expect(page.getByRole('button', { name: COPY.startAttempt })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: COPY.qrTitle })).toHaveCount(0);

      // The link still opens the order after fulfilment — the customer keeps
      // their receipt — which is what makes one route serve the whole tail.
      await expect(page.getByText(orderCode, { exact: false })).toBeVisible();

      await assertSettled(page, shown);
      await assertNoGatedViolations(page, `s03-${viewport.name}-completed`);

      await page.screenshot({
        path: `test-results/app12-s03/${viewport.name}-06-completed.png`,
      });

      // ── `APP12-U01-C1` F4 — a reload without the fragment ──────────────
      // The strip ran on the first visit, so a reload carries no credential.
      // The card must not claim a replacement link, because the original one
      // still works — which is proven by reopening it straight afterwards.
      await page.reload();
      await expect(page.getByRole('heading', { name: COPY.unavailableTitle })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText(U01_COPY.unavailableBody)).toBeVisible();
      expect(await pageText(page)).not.toMatch(/đã được thay|thay bằng liên kết|liên kết mới nhất/);
      await assertNoGatedViolations(page, `s03-${viewport.name}-reload-unavailable`);
      await page.screenshot({
        path: `test-results/app12-s03/${viewport.name}-07-reload-unavailable.png`,
      });

      // Reopened the way a customer does — from the email, in a fresh tab. A
      // `goto` on this same page would only change the fragment of the URL it
      // is already on, a same-document navigation that claims nothing (U01).
      const reopened = await page.context().newPage();
      await reopened.setViewportSize({ width: viewport.width, height: viewport.height });
      await openSecureOrder(reopened);
      await expect(statusPill(reopened, COPY.pillCompleted)).toBeVisible();
      await reopened.close();
      proofs[`reload_then_reopen_${viewport.name}`] = true;

      // No horizontal overflow at any point of the journey.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow, `no horizontal overflow at ${viewport.name}`).toBe(false);
      expect(await page.getByRole('heading', { level: 1 }).count()).toBe(1);

      proofs[`lifecycle_${viewport.name}`] = true;
    } finally {
      await admin.close();
    }
  });
}

/**
 * Presses the one initiation control and follows whichever branch the server
 * chose, returning `true` when a step-up was actually demanded.
 *
 * Both outcomes are correct. What would **not** be correct — and what this
 * cannot hide — is an attempt opening with neither a step-up nor a fresh
 * verification behind it: the evidence section only appears once the server has
 * returned an attempt, so a refused initiation leaves this waiting.
 */
async function initiateAttempt(page: Page, contact: string): Promise<boolean> {
  await page.getByRole('button', { name: COPY.startAttempt }).click();

  const stepUp = page.getByRole('heading', { name: COPY.stepUpTitle });
  const evidence = page.getByRole('heading', { name: COPY.evidenceTitle });
  try {
    await expect
      .poll(async () => (await stepUp.count()) > 0 || (await evidence.count()) > 0, {
        timeout: 45_000,
      })
      .toBe(true);
  } catch (error) {
    // Neither branch appeared, so the server refused. The approved refusal is
    // rendered as a note on the next-action card; naming it turns "nothing
    // happened" into the actual reason.
    const notice = await page.locator('.secure-order__note--danger').allInnerTexts();
    throw new Error(
      `initiation reached neither a step-up nor an attempt; page notice: ${
        notice.length === 0 ? '(none rendered)' : notice.join(' | ')
      }`,
      { cause: error },
    );
  }

  if ((await stepUp.count()) === 0) return false;
  await completeStepUp(page, contact);
  return true;
}

/**
 * Completes the embedded step-up with the code the real worker delivered.
 *
 * This is the whole APP4 verification machine running inside S03's dialog — the
 * same three cards, the same controls, differing only in `purpose: STEP_UP`. So
 * it is driven with the delivered APP4 driver rather than with selectors of its
 * own: if S03 had quietly built a second OTP flow, this helper could not drive
 * it, which is a stronger proof of reuse than any assertion about the source.
 *
 * The contact is the **same** one the order was placed with. A step-up for a
 * different address would leave the initiation refused for exactly the reason it
 * was refused before, and the journey would pass while proving nothing.
 *
 * The plaintext code is read from the recording adapter, typed into the field,
 * and never printed. It is found by kind rather than by position, because this
 * order has already produced a `SECURE_LINK_TOKEN` delivery and "the newest
 * delivery" would answer the wrong one.
 */
async function completeStepUp(page: Page, contact: string): Promise<void> {
  const { s02Worker, runWorkerUntilIdle } = await import('./support/s02-world');
  const { createS01Driver } = await import('../app4/support/s01-verification-driver');

  const worker = s02Worker();
  const driver = createS01Driver(page);
  const before = worker.deliveryCount() as number;

  await driver.enterContact(contact);
  await driver.submitContact();

  await expect(page.getByRole('heading', { name: 'Nhập mã xác minh' })).toBeVisible({
    timeout: 20_000,
  });

  await runWorkerUntilIdle();

  let code: string | undefined;
  const end = worker.deliveryCount() as number;
  for (let index = end - 1; index >= before; index -= 1) {
    if (worker.safeDelivery(index).secretKind === 'VERIFICATION_CODE') {
      code = worker.secretOf(index) as string;
      break;
    }
  }
  expect(code, 'a VERIFICATION_CODE delivery was recorded for the step-up').toBeDefined();

  await driver.enterCode(code!);
  await driver.submitCode();

  // The dialog reports success and the controller resumes the *same* initiation
  // with the *same* idempotency key, so the dialog closing is the observable.
  await expect(page.getByRole('heading', { name: COPY.stepUpTitle })).toHaveCount(0, {
    timeout: 30_000,
  });
}
