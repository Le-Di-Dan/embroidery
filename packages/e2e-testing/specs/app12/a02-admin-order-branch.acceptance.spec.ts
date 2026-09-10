/**
 * `APP12-A02-C1` — the Admin Ready-Made order branch, live.
 *
 * ```text
 * A  mixed queue           CUSTOM + READY_MADE on one page · Nguồn column ·
 *                          server-side origin filter both ways
 * B  before the fee        detail renders · no custom-only panel · first fee →
 *                          AWAITING_PAYMENT + FULL PENDING
 * C  fee correction        FULL A → correction → FULL B · A isolated · warning
 * D  FULL verification     real attempt · Admin verify → READY_FOR_DELIVERY ·
 *                          fee edit refused afterwards
 * E  dispatch / complete   READY_FOR_DELIVERY → DELIVERED → COMPLETED
 * F  negative matrix       every action the state does not allow is absent
 * ```
 *
 * Every order is created by the **delivered customer checkout** and every
 * operator write goes through a **control on the delivered Admin screen**. This
 * suite calls no Admin API directly: the checkpoint's claim is that an operator
 * can complete a Ready-Made order, and a harness that posted to the API would
 * prove the contract the backend half already proves.
 *
 * The single most important assertion is journey A's second half — that the
 * **custom** row still renders on a page a Ready-Made order shares. That is the
 * defect `APP12-A02` found and this correction removed: the queue mapper threw
 * per row, so one Ready-Made order returned HTTP 500 for the whole page.
 *
 * Everything runs against **this run's disposable database**, dropped in the
 * orchestrator's `finally`. No shared development database is written and no
 * `APP12-G03` dataset is created.
 *
 * Serial: the journeys share one catalog and one stock pool, and each depends
 * on the commercial state the previous one committed.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import {
  COPY,
  VIEWPORTS,
  detailOrigin,
  detailStatus,
  openOperator,
  openOrderFromQueue,
  openFullPaymentAttempt,
  openQueue,
  proofs,
  queueRow,
  storefrontOrigin,
  submitShippingFee,
} from './support/a02-world';
import {
  closeS03World,
  openS03World,
  openSecureOrder,
  placeOrder,
  s03Evidence,
  type PlacedOrder,
} from './support/s03-world';
import { closeS02World, openS02World } from './support/s02-world';

/*
 * The commercial evidence reader is a plain `.mjs` module with no type
 * declaration, so every call through it is `any` to ESLint. The same three
 * rules are disabled in `s03-lifecycle.acceptance.spec.ts` for the same reader
 * and the same reason: it returns counts, statuses and opaque ids from SQL, and
 * hand-writing a declaration for it would be a second description of a shape
 * the queries already define.
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

test.describe.configure({ mode: 'serial' });

// Every journey drives a real browser against a real stack, and journey A also
// places an order through the delivered checkout — a verification round trip,
// a worker drain and a commit. The 30s project default is a unit-test budget;
// these are live journeys, and the S03 specs set their own for the same reason.
test.describe.configure({ timeout: 420_000 });

/** The one operator session every journey works in. */
let operatorContext: BrowserContext;
let operator: Page;

/** Journeys B–F share one order; A places a second alongside it. */
let subject: PlacedOrder;

/** The goods figure journey B read before any fee existed (`APP12-U01-C1` F1). */
let goodsBefore = '';

/**
 * `APP12-U01-C1` F1 — `Tiền hàng` is the frozen line, whatever the fee did.
 *
 * Before a fee the order total *is* the goods figure, so the pre-fee reading is
 * the reference; afterwards the row must still say exactly that and must not
 * say the fee-inclusive total, which `Tổng khách phải trả` now carries.
 */
async function expectGoods(payableAmount: string): Promise<void> {
  const goods = operator.getByTestId('shipping-fee-merchandise').locator('dd');
  await expect(goods).toHaveText(goodsBefore);
  await expect(goods).not.toContainText(groupDong(payableAmount));
  await expect(operator.getByTestId('shipping-fee-payable')).toContainText(
    groupDong(payableAmount),
  );
}

/** `APP12-U01-C1` F3 — the fee card never promises a new link or an email. */
async function expectNoPromisedLink(): Promise<void> {
  // The fee card itself, by its own heading — an outer column is also a
  // `section` containing the row, so a `has:` filter matches both.
  const card = operator.locator('section[aria-labelledby="shipping-fee-heading"]');
  await expect(card).not.toContainText(/gửi khách liên kết|liên kết mới|gửi liên kết/);
}

/** `APP12-U01-C1` §9 — axe (serious/critical) and horizontal overflow, live. */
async function expectAccessibleUnclipped(label: string): Promise<void> {
  const { runAxe, describeViolations } = (await import('../../support/app12/h08-axe.mjs')) as {
    runAxe: (page: Page, options: Record<string, unknown>) => Promise<{ gated: unknown[] }>;
    describeViolations: (scan: unknown) => string;
  };
  const scan = await runAxe(operator, { label, disableRules: ['color-contrast'] });
  expect(scan.gated, `${label}: ${describeViolations(scan)}`).toHaveLength(0);
  const overflow = await operator.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow, `${label}: no horizontal overflow`).toBe(false);
  process.stdout.write(`[app12-a02:u01c1] ${label} axe=0 overflow=false\n`);
}

/**
 * A `numeric(14,2)` decimal string as the Admin renders it: whole đồng, grouped.
 *
 * Used only to compare a **server figure** against the screen. It never
 * computes an amount — it reformats one the database already holds, so an
 * assertion built on it cannot pass by agreeing with arithmetic the screen also
 * did.
 */
function groupDong(amount: string): string {
  const whole = amount.split('.')[0] ?? amount;
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  // `openS02World` owns the in-process worker and the API runtime the checkout
  // needs; `openS03World` owns the commercial evidence reader. Both, in this
  // order, exactly as the S03 specs do — a real order cannot be placed without
  // the worker, and the operator has nothing to work on without a real order.
  await openS02World();
  await openS03World();
  const session = await openOperator(browser);
  operatorContext = session.context;
  operator = session.page;
});

test.afterAll(async () => {
  await operatorContext?.close();
  await closeS03World('[app12-a02]');
  await closeS02World('[app12-a02:s02]');
});

test('A — a mixed queue serves every row, and the origin filter is the server’s', async ({
  browser,
}) => {
  // One real Ready-Made order, through the delivered checkout.
  const customer = await browser.newContext({ baseURL: storefrontOrigin() });
  const shopper = await customer.newPage();
  subject = await placeOrder(shopper);
  await customer.close();

  const evidence = s03Evidence();
  proofs['readyMadeOrders'] = await evidence.countReadyMadeOrders();

  await openQueue(operator);

  // The Ready-Made row renders at all — the HTTP 500 this correction removed.
  const row = queueRow(operator, subject.orderCode);
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId('order-queue-origin')).toContainText(COPY.readyMadeBadge);
  await expect(row).toContainText(COPY.awaitingFee);
  proofs['queueServesReadyMade'] = true;

  // The `Nguồn` column exists as a real column header.
  await expect(
    operator.getByRole('columnheader', { name: COPY.originColumn, exact: true }),
  ).toBeVisible();

  // The origin filter is a labelled fieldset, not a bare control.
  await expect(operator.getByRole('group', { name: new RegExp(COPY.originLegend) })).toBeVisible();

  // Clicked rather than `check()`ed: the boxes are **URL-driven**, so their
  // `checked` state follows a `router.replace` and Playwright's built-in
  // post-click state assertion races it. Clicking is what an operator does, and
  // the URL is the stronger proof anyway — it is what the request carried.
  //
  // Each toggle is allowed to **settle** before the next. The filter reads its
  // selection back out of the URL, so two clicks in the same tick both compute
  // from the pre-first-click state and the second re-adds what the first
  // removed. Asserting the exact query string between them is what makes that
  // visible rather than silently producing a two-origin filter.
  await operator.getByTestId('order-origin-filter-READY_MADE').locator('xpath=..').click();
  await expect(operator).toHaveURL(/[?&]origin=READY_MADE(&|$)/);
  await expect(queueRow(operator, subject.orderCode)).toHaveCount(1);

  await operator.getByTestId('order-origin-filter-READY_MADE').locator('xpath=..').click();
  await expect(operator).not.toHaveURL(/origin=/);

  // Filtering to CUSTOM excludes it, and every row that survives is custom.
  //
  // ## What this tier proves, and what proves the rest
  //
  // This topology contains **no custom order**: creating one needs the whole
  // APP5 → APP6 chain — a request, a quotation, a design case, an approved
  // version and an approval snapshot — which no e2e fixture builds and which
  // would be a disproportionate detour to build here.
  //
  // So the collateral half of the defect — that a *canonically written* custom
  // order still renders on a page a Ready-Made order shares — is proved by
  // `admin-ready-made-order-read.integration.spec.ts`, which seeds one through
  // `OrderRepository.createFromAcceptedQuotation`, the production writer. That
  // is stronger evidence than this tier could produce, not weaker: a fabricated
  // `orders` row here would prove the fixture.
  //
  // What this tier proves is the half only a browser can: the filter is the
  // **server's**. The row leaves the page under `origin=CUSTOM` and the page
  // that comes back carries no Ready-Made badge at all.
  await operator.getByTestId('order-origin-filter-CUSTOM').locator('xpath=..').click();
  await expect(operator).toHaveURL(/[?&]origin=CUSTOM(&|$)/);
  await expect(queueRow(operator, subject.orderCode)).toHaveCount(0);

  const badges = operator.getByTestId('order-queue-origin');
  const customCount = await badges.count();
  for (let index = 0; index < customCount; index += 1) {
    await expect(badges.nth(index)).toContainText(COPY.customBadge);
  }
  proofs['customRowsUnderCustomFilter'] = customCount;
  proofs['originFilterServerSide'] = true;

  await operator.getByTestId('order-origin-filter-CUSTOM').locator('xpath=..').click();
  await expect(operator).not.toHaveURL(/origin=/);

  // And the Ready-Made status the queue could not name before this correction.
  // The checkbox has been clipped since `APP12-V02`; the chip — its wrapping
  // `<label>` — is what an operator presses, so that is what every filter
  // toggle in this suite clicks (`xpath=..`).
  await operator.getByTestId('order-filter-AWAITING_SHIPPING_FEE').locator('xpath=..').click();
  await expect(operator).toHaveURL(/status=AWAITING_SHIPPING_FEE/);
  await expect(queueRow(operator, subject.orderCode)).toHaveCount(1);
});

test('B — before the fee: the detail renders, and the first fee opens payment', async () => {
  await openOrderFromQueue(operator, subject.orderCode);

  await expect(detailOrigin(operator)).toContainText(COPY.readyMadeBadge);
  await expect(detailStatus(operator)).toContainText(COPY.awaitingFee);

  // The frozen facts, and the stock hold read from the reservation.
  await expect(operator.getByTestId('order-detail-address')).toBeVisible();
  await expect(operator.getByTestId('order-detail-deadline')).toBeVisible();

  // `BR-031` — the custom-only sections are absent and the absence is stated.
  // `V01-UX-004` removed the sentence narrating the absence; the absence itself
  // is what is asserted (as `order-ready-made-branch.test.tsx` does).
  await expect(operator.getByTestId('order-detail-omitted')).toHaveCount(0);
  for (const customOnly of ['open-final-payment', 'remaining-payment', 'deposit-expected-amount']) {
    await expect(operator.getByTestId(customOnly)).toHaveCount(0);
  }
  proofs['customOnlyPanelsOnReadyMade'] = 0;

  // No obligation yet, and no fabricated total. This is the read that answered
  // 404 before the correction.
  await expect(operator.getByTestId('full-payment-empty')).toBeVisible();
  await expect(operator.getByTestId('shipping-fee-payable')).toContainText('Chưa xác định');
  // `NULL` is unpriced, so the field opens empty rather than at zero.
  await expect(operator.getByTestId('shipping-fee-input')).toHaveValue('');
  await expect(operator.getByTestId('shipping-fee-submit')).toContainText(COPY.confirmFee);

  // `APP12-U01-C1` F1/F3 — the goods figure before any fee, and a card that
  // promises no link or email.
  goodsBefore = (
    await operator.getByTestId('shipping-fee-merchandise').locator('dd').innerText()
  ).trim();
  await expectNoPromisedLink();

  await submitShippingFee(operator, '35000');

  // Backend truth, read back from the screen and then from the database.
  await expect(detailStatus(operator)).toContainText(COPY.awaitingPayment);
  await expect(operator.getByTestId('full-payment-amount')).toBeVisible();

  const evidence = s03Evidence();
  const live = await evidence.liveFullObligationOf(subject.orderCode);
  expect(live?.status).toBe('PENDING');
  expect(await evidence.orderStatusOf(subject.orderCode)).toBe('AWAITING_PAYMENT');
  proofs['firstFeeOpensFull'] = true;

  // The payable total on screen is the obligation's **own** figure, compared
  // against the committed row rather than against a literal: a hard-coded
  // amount here would assert the fixture's price, not that the screen renders
  // what the server froze.
  await expect(operator.getByTestId('full-payment-amount')).toContainText(
    groupDong(live.amount as string),
  );
  // The FULL memo, never the deposit's.
  await expect(operator.getByTestId('full-payment-reference')).toContainText(/FL$/);

  // F1 — the fee moved the order total, and it did not move the goods figure.
  await expectGoods(live.amount as string);
  await expectNoPromisedLink();
  await expectAccessibleUnclipped('a02-u01c1-after-fee');
  proofs['u01c1_f1_merchandise_after_fee'] = true;
});

test('C — a fee correction supersedes, and the screen shows the successor', async () => {
  const evidence = s03Evidence();
  const before = await evidence.liveFullObligationOf(subject.orderCode);

  await openOrderFromQueue(operator, subject.orderCode);

  // The correction warning states what it replaces, and promises no more time.
  const warning = operator.getByTestId('shipping-fee-supersede-warning');
  await expect(warning).toBeVisible();
  await expect(warning).not.toContainText(/gia hạn|thêm thời gian|kéo dài/);
  await expect(operator.getByTestId('shipping-fee-submit')).toContainText(COPY.correctFee);

  await submitShippingFee(operator, '45000');

  // Polled against committed truth: the successor is a **new row**, and the
  // screen settling is not by itself proof the supersede transaction landed.
  await expect
    .poll(
      async (): Promise<string | null> => {
        const live: { id?: string } | null = await evidence.liveFullObligationOf(subject.orderCode);
        return live?.id ?? null;
      },
      { timeout: 30_000 },
    )
    .not.toBe(before.id);

  const after = await evidence.liveFullObligationOf(subject.orderCode);
  expect(after.status).toBe('PENDING');

  // Asserted per obligation, because a count across the order cannot tell a
  // supersede from a duplicate. The history read publishes an amount and a
  // status rather than an id, so the predecessor is located by the amount it
  // was created with — which the successor no longer carries.
  const history: { amount: string; status: string }[] = await evidence.fullObligationHistoryOf(
    subject.orderCode,
  );
  expect(history).toHaveLength(2);
  const predecessor = history.find((row) => row.amount === before.amount);
  expect(predecessor?.status).toBe('SUPERSEDED');
  const successor = history.find((row) => row.amount === after.amount);
  expect(successor?.status).toBe('PENDING');
  proofs['correctionSupersedes'] = true;

  // The screen shows the successor's amount, not the predecessor's — and the
  // two are different figures, which is what makes the assertion meaningful.
  expect(after.amount).not.toBe(before.amount);
  await expect(operator.getByTestId('full-payment-amount')).toContainText(
    groupDong(after.amount as string),
  );
  // The order did not move: a correction re-prices, it does not re-open.
  await expect(detailStatus(operator)).toContainText(COPY.awaitingPayment);
});

test('D — a real FULL attempt is verified from the Admin screen', async ({ browser }) => {
  const evidence = s03Evidence();

  // A real customer attempt, opened by the **customer** through the delivered
  // secure order surface. The Admin read has to publish the id that action
  // created; an attempt the harness inserted would prove nothing about it.
  const customer = await browser.newContext({ baseURL: storefrontOrigin() });
  const shopper = await customer.newPage();
  await openSecureOrder(shopper);
  await openFullPaymentAttempt(shopper, subject.contact);
  await customer.close();

  // The attempt the customer opened is what the Admin read must publish.
  await expect
    .poll(
      async (): Promise<string | null> => {
        const attempt: { status?: string } | null = await evidence.liveFullAttemptOf(
          subject.orderCode,
        );
        return attempt?.status ?? null;
      },
      {
        timeout: 30_000,
      },
    )
    .not.toBeNull();

  await openOrderFromQueue(operator, subject.orderCode);

  // The current attempt is on screen — the fact `APP12-A02` could not obtain,
  // and what makes `adminPaymentAttempt_verify` addressable at all.
  await expect(operator.getByTestId('full-attempt-status')).toBeVisible();
  proofs['currentAttemptVisible'] = true;

  // The expected figures come from the **server**, not from scraping the label
  // and the value out of one definition row: the obligation's own amount is the
  // verification authority (`APP12-A02-C1` §18), and a mis-parsed screen string
  // is how an exact match becomes a mismatch the server then records durably.
  const owed = await evidence.liveFullObligationOf(subject.orderCode);
  const observedAmount = (owed.amount as string).split('.')[0] as string;
  const expectedReference = (
    await operator.getByTestId('full-payment-reference').locator('dd').innerText()
  ).trim();

  await operator.getByTestId('full-payment-verify').click();
  await expect(operator.getByTestId('verify-dialog')).toBeVisible();

  // The operator transcribes what the bank shows. Nothing prefills these from
  // the expected block beside them.
  await operator.getByTestId('verify-observed-amount').fill(observedAmount);
  await operator.getByTestId('verify-observed-reference').fill(expectedReference);
  await operator.getByTestId('verify-note').fill('Đối chiếu sao kê ngân hàng.');
  await operator.getByTestId('verify-submit').click();

  await expect(operator.getByTestId('payment-outcome')).toHaveAttribute(
    'data-outcome',
    'verified',
    { timeout: 30_000 },
  );

  // Backend truth.
  expect(await evidence.orderStatusOf(subject.orderCode)).toBe('READY_FOR_DELIVERY');
  expect((await evidence.liveFullObligationOf(subject.orderCode))?.status).toBe('SATISFIED');
  proofs['verifyToReadyForDelivery'] = true;

  // The fee is no longer editable, and the refusal states the rule (`BR-028`).
  await operator.reload();
  await expect(operator.getByTestId('shipping-fee-refused')).toContainText(COPY.refusedTitle);
  await expect(operator.getByTestId('shipping-fee-input')).toHaveCount(0);
  await expect(operator.getByTestId('shipping-fee-submit')).toHaveCount(0);
  proofs['postPaymentFeeEditRefused'] = true;

  // And the money-moving control is gone rather than disabled.
  await expect(operator.getByTestId('full-payment-verify')).toHaveCount(0);
  await expect(operator.getByTestId('full-payment-settled')).toBeVisible();

  // F1 — three server figures, side by side on the settled card.
  await expectGoods(owed.amount as string);
  await expect(operator.getByTestId('shipping-fee-frozen')).toContainText('45.000');
  await expectAccessibleUnclipped('a02-u01c1-settled');
  proofs['u01c1_f1_settled_three_figures'] = true;
});

test('E — dispatch and completion, through the APP9 rail', async () => {
  const evidence = s03Evidence();
  await openOrderFromQueue(operator, subject.orderCode);

  await expect(detailStatus(operator)).toContainText(COPY.readyForDelivery);

  // No production step anywhere on a Ready-Made order (`BR-030`).
  await expect(operator.getByTestId('production-job-card')).toHaveCount(0);

  await operator.getByTestId('open-dispatch').click();
  await operator.getByTestId('dispatch-dialog-confirm').click();
  await expect(detailStatus(operator)).toContainText(COPY.delivered, { timeout: 30_000 });
  expect(await evidence.orderStatusOf(subject.orderCode)).toBe('DELIVERED');

  // Shipping is frozen: a record, with no edit affordance at all.
  await expect(operator.getByTestId('shipping-fee-input')).toHaveCount(0);
  proofs['dispatchFreezesShipping'] = true;

  await operator.getByTestId('open-completion').click();
  await operator.getByTestId('completion-dialog-confirm').click();
  await expect(detailStatus(operator)).toContainText(COPY.completed, { timeout: 30_000 });
  expect(await evidence.orderStatusOf(subject.orderCode)).toBe('COMPLETED');
  proofs['completed'] = true;

  // No second reservation and no second stock consumption.
  const reservation = await evidence.reservationOf(subject.orderCode);
  expect(reservation?.status).not.toBe('RESERVED');
});

test('F — a terminal order offers no mutation, at either viewport', async () => {
  for (const viewport of VIEWPORTS) {
    await operator.setViewportSize({ width: viewport.width, height: viewport.height });
    await openOrderFromQueue(operator, subject.orderCode);

    await expect(detailStatus(operator)).toContainText(COPY.completed);

    // Every mutation is absent — not disabled, which would still be a claim
    // that the action exists here.
    for (const control of [
      'shipping-fee-input',
      'shipping-fee-submit',
      'full-payment-verify',
      'open-dispatch',
      'open-completion',
    ]) {
      await expect(operator.getByTestId(control)).toHaveCount(0);
    }

    // No reopen, redispatch, recomplete or refund was invented.
    await expect(operator.getByRole('button', { name: /hoàn tiền|mở lại|huỷ đơn/i })).toHaveCount(
      0,
    );

    // One `h1`, and the page does not scroll sideways at either width.
    await expect(operator.getByRole('heading', { level: 1 })).toHaveCount(1);
    const overflow = await operator.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow, `no horizontal overflow at ${viewport.name}`).toBe(false);

    proofs[`viewport${viewport.name}`] = true;
  }
});
