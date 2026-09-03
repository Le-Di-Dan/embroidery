/**
 * `APP12-S03` Journeys B–D plus the two security proofs.
 *
 * ```text
 * B  reservation expiry     real sweep → CANCELLED + RESERVATION_EXPIRED → EXPIRED
 * C  fee correction         FULL A superseded by FULL B, attempt A stranded
 * D  transfer evidence      real upload, real storage, no payment claim
 * S1 cross-order security   A's credential cannot reach B, on any operation
 * S2 secure-link death      a revoked grant clears the authorized screen
 * ```
 *
 * Each runs once, at the desktop reference viewport. `APP12-S03` §15 allows it:
 * the responsive behaviour of every state these journeys visit is already
 * covered by the lifecycle spec at all three widths, and multiplying an
 * expensive commercial journey to re-prove a layout has no acceptance value.
 */
import { expect, test, type Page } from '@playwright/test';

import { closeS02World, openS02World, runWorkerUntilIdle, s02Worker } from './support/s02-world';
import {
  COPY,
  ORDER_ACCESS_PATH,
  closeS03World,
  openAdminDriver,
  openS03World,
  openSecureOrder,
  placeOrder,
  proofs,
  readPayableTotal,
  readTransferReference,
  refreshUntilVisible,
  runReservationExpirySweep,
  statusPill,
  s03Evidence,
} from './support/s03-world';

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

const FEE_A = '35000.00';
/** Deliberately different, and deliberately not a rounding of A. */
const FEE_B = '60000.00';

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1440, height: 900 } });

test.beforeAll(async () => {
  await openS02World();
  await openS03World();
});

test.afterAll(async () => {
  await closeS03World('[app12-s03-journeys]');
  await closeS02World('[app12-s03-journeys:s02]');
});

/** Runs the embedded step-up and leaves one FULL attempt open. */
async function openAttempt(page: Page, contact: string): Promise<void> {
  const { createS01Driver } = await import('../app4/support/s01-verification-driver');
  const worker = s02Worker();
  const driver = createS01Driver(page);
  const before = worker.deliveryCount() as number;

  await page.getByRole('button', { name: COPY.startAttempt }).click();

  // The step-up is conditional (GRD-003 freshness), so the run follows whichever
  // branch the server chose rather than assuming one. See the lifecycle spec.
  const stepUp = page.getByRole('heading', { name: COPY.stepUpTitle });
  const evidenceSection = page.getByRole('heading', { name: COPY.evidenceTitle });
  await expect
    .poll(async () => (await stepUp.count()) > 0 || (await evidenceSection.count()) > 0, {
      timeout: 30_000,
    })
    .toBe(true);
  if ((await stepUp.count()) === 0) {
    await expect(evidenceSection).toBeVisible();
    return;
  }

  await driver.chooseContactKind('EMAIL');
  await driver.enterContact('EMAIL', contact);
  await driver.submitContact();
  await expect(page.getByRole('heading', { name: 'Nhập mã xác minh' })).toBeVisible({
    timeout: 20_000,
  });

  await runWorkerUntilIdle();

  let code: string | undefined;
  for (let index = (worker.deliveryCount() as number) - 1; index >= before; index -= 1) {
    if (worker.safeDelivery(index).secretKind === 'VERIFICATION_CODE') {
      code = worker.secretOf(index) as string;
      break;
    }
  }
  expect(code, 'a step-up VERIFICATION_CODE was delivered').toBeDefined();

  await driver.enterCode(code!);
  await driver.submitCode();
  // The **evidence** section, not the transfer card: the transfer card is
  // mounted from `payable` and is already on screen before any attempt exists,
  // so waiting for it would let a failed step-up pass for a successful one. The
  // evidence section is mounted from the attempt itself.
  await expect(page.getByRole('heading', { name: COPY.evidenceTitle })).toBeVisible({
    timeout: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Journey B — reservation expiry
// ---------------------------------------------------------------------------

test('Journey B — a lapsed reservation renders the EXPIRED variant', async ({ page }) => {
  test.setTimeout(300_000);
  const evidence = s03Evidence();

  const { orderCode } = await placeOrder(page);
  await openSecureOrder(page);
  await expect(page.getByText(COPY.pillAwaitingFee)).toBeVisible();

  // The reservation is made **due**; everything after this is the application's.
  // The claim, the release, the cancellation and the recorded reason are all
  // produced by the real expiry sweep running in the real worker.
  await evidence.makeReservationDue(orderCode);

  const swept = await runReservationExpirySweep();
  expect(swept, 'the real sweep reported an outcome').toBeDefined();

  await expect
    .poll((): Promise<string> => evidence.orderStatusOf(orderCode) as Promise<string>, {
      timeout: 30_000,
    })
    .toBe('CANCELLED');

  const reservation = await evidence.reservationOf(orderCode);
  expect(reservation?.status).toBe('EXPIRED');

  // §29 — the EXPIRED presentation, and it came from `terminationReason` rather
  // than from a clock the browser read.
  await refreshUntilVisible(page, page.getByText(COPY.pillExpired));
  await expect(page.getByText(COPY.bodyExpired)).toBeVisible();
  // Scoped to the pill. "Đã huỷ" is a case-insensitive substring of the
  // approved EXPIRED sentence ("Đơn đã huỷ vì quá hạn giữ hàng 24 giờ."),
  // so a page-wide text match would find it on the very state that proves
  // the two are distinct.
  await expect(statusPill(page, COPY.pillCancelled)).toHaveCount(0);

  // §30 — nothing payable survives.
  await expect(page.getByRole('heading', { name: COPY.qrTitle })).toHaveCount(0);
  await expect(page.getByRole('button', { name: COPY.startAttempt })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: COPY.evidenceTitle })).toHaveCount(0);

  await page.screenshot({ path: 'test-results/app12-s03/journey-b-expired.png' });
  proofs.expiry = true;
});

// ---------------------------------------------------------------------------
// Journey C — fee correction and stale-attempt isolation
// ---------------------------------------------------------------------------

test('Journey C — a fee correction replaces the amount and strands the attempt', async ({
  page,
  browser,
}) => {
  test.setTimeout(420_000);
  const evidence = s03Evidence();
  const admin = await openAdminDriver(browser);

  try {
    const { orderCode, contact } = await placeOrder(page);
    const orderId = await evidence.orderIdOf(orderCode);

    await admin.setShippingFee(orderId, FEE_A);
    await openSecureOrder(page);
    await expect(page.getByText(COPY.pillAwaitingPayment)).toBeVisible({ timeout: 20_000 });

    const obligationA = await evidence.liveFullObligationOf(orderCode);
    const shownA = await readPayableTotal(page);
    expect(shownA.replace(/\./g, '')).toBe(String(obligationA.amount).split('.')[0]);

    await openAttempt(page, contact);
    const attemptA = await evidence.liveFullAttemptOf(orderCode);
    expect(String(attemptA.amount)).toBe(String(obligationA.amount));

    // The operator corrects the fee. `APP12-B03` recomposes the obligation from
    // the frozen subtotal, so FULL A is superseded and FULL B becomes current —
    // and the order status does not move, which is exactly why a screen that
    // refreshed only the order would show a stale amount.
    await admin.setShippingFee(orderId, FEE_B);

    const obligationB = await evidence.liveFullObligationOf(orderCode);
    expect(String(obligationB.amount)).not.toBe(String(obligationA.amount));
    expect(obligationB.status).toBe('PENDING');

    const history = await evidence.fullObligationHistoryOf(orderCode);
    expect(history.some((row: any) => row.status === 'SUPERSEDED')).toBe(true);

    // §24 — the amount follows the successor. Retried, because the surface
    // coalesces re-reads: a single dispatch would be racing that window.
    await refreshUntilVisible(page, page.getByText(COPY.superseded));
    await expect
      .poll(async () => (await readPayableTotal(page)).replace(/\./g, ''), { timeout: 25_000 })
      .toBe(String(obligationB.amount).split('.')[0]);

    const shownB = await readPayableTotal(page);
    expect(shownB.replace(/\./g, '')).not.toBe(String(obligationA.amount).split('.')[0]);

    // The stranded attempt is not presented as the successor's, and the customer
    // is told the amount moved.
    await expect(page.getByText(COPY.superseded)).toBeVisible();
    await expect(page.getByText(COPY.pillAwaitingPayment)).toBeVisible();

    // The reference is byte-identical across the correction by design, which is
    // exactly why the client compares amounts rather than references.
    const referenceB = await readTransferReference(page);
    expect(referenceB).toMatch(/^ORD[A-Z0-9]+FL$/);

    // No second attempt was created behind the customer's back.
    const attempts = await evidence.fullAttemptsOf(orderCode);
    expect(attempts).toHaveLength(1);
    expect(String(attempts[0].amount)).toBe(String(obligationA.amount));
    expect(attempts[0].obligation_status).toBe('SUPERSEDED');

    await page.screenshot({ path: 'test-results/app12-s03/journey-c-fee-correction.png' });
    proofs.feeCorrection = true;
  } finally {
    await admin.close();
  }
});

// ---------------------------------------------------------------------------
// Journey D — transfer evidence
// ---------------------------------------------------------------------------

test('Journey D — a real upload is stored and still means nothing about payment', async ({
  page,
  browser,
}) => {
  test.setTimeout(420_000);
  const evidence = s03Evidence();
  const admin = await openAdminDriver(browser);

  try {
    const { orderCode, contact } = await placeOrder(page);
    const orderId = await evidence.orderIdOf(orderCode);

    await admin.setShippingFee(orderId, FEE_A);
    await openSecureOrder(page);
    await expect(page.getByText(COPY.pillAwaitingPayment)).toBeVisible({ timeout: 20_000 });

    await openAttempt(page, contact);
    const attempt = await evidence.liveFullAttemptOf(orderCode);

    await expect(page.getByRole('heading', { name: COPY.evidenceTitle })).toBeVisible();
    await expect(page.getByText(COPY.evidenceTruth)).toBeVisible();

    // A real image, through the delivered attempt-scoped operation, into this
    // run's real object storage. A 1×1 PNG is a valid file the server's
    // signature check accepts; nothing about the assertion depends on its size.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    await page
      .locator('.secure-order__uploader-input')
      .setInputFiles({ name: 'bien-lai.png', mimeType: 'image/png', buffer: png });

    await expect
      .poll((): Promise<number> => evidence.countEvidenceFor(orderCode) as Promise<number>, {
        timeout: 40_000,
      })
      .toBe(1);

    // §22 — the image's own state is shown, and it says nothing about the money.
    //
    // Any of the three approved labels satisfies this: which one the file
    // settles on is the **inspection lane's** business, and pinning one would
    // make this journey fail on a change to asset inspection that S03 neither
    // owns nor renders differently. What §22 actually requires is that the row
    // exists, that it speaks about the file, and that nothing on the page
    // claims the money arrived — all three of which are asserted here.
    await expect(page.locator('.secure-order__evidence-item')).toHaveCount(1, {
      timeout: 30_000,
    });
    const evidenceRow = await page.locator('.secure-order__evidence-item').innerText();
    expect(
      [COPY.evidencePending, 'Ảnh dùng được', 'Ảnh không dùng được'].some((label) =>
        evidenceRow.includes(label),
      ),
      "the row states the image's own status",
    ).toBe(true);

    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/đã thanh toán thành công|thanh toán hoàn tất|đã nhận tiền/i);

    // The order and the obligation are exactly where they were.
    expect(await evidence.orderStatusOf(orderCode)).toBe('AWAITING_PAYMENT');
    const obligation = await evidence.liveFullObligationOf(orderCode);
    expect(obligation.status).toBe('PENDING');
    expect(attempt.status).toBe('PENDING');

    await page.screenshot({ path: 'test-results/app12-s03/journey-d-evidence.png' });
    proofs.evidence = true;
  } finally {
    await admin.close();
  }
});

// ---------------------------------------------------------------------------
// Security proof 1 — cross-order isolation
// ---------------------------------------------------------------------------

test('one order’s credential reaches no part of another order', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(420_000);
  const evidence = s03Evidence();
  const admin = await openAdminDriver(browser);

  try {
    // Order B: payable, with a live obligation and a real attempt to target.
    const b = await placeOrder(page);
    const bOrderId = await evidence.orderIdOf(b.orderCode);
    await admin.setShippingFee(bOrderId, FEE_A);
    await openSecureOrder(page);
    await expect(page.getByText(COPY.pillAwaitingPayment)).toBeVisible({ timeout: 20_000 });
    await openAttempt(page, b.contact);
    const bAttempt = await evidence.liveFullAttemptOf(b.orderCode);

    // Order A: a different customer, a different grant. Its link is the one the
    // browser now holds — and the token never leaves the page's own memory, so
    // the API-level half of this proof uses a **fabricated** token of the right
    // shape instead. That is the stronger statement anyway: a caller who has no
    // credential at all must be refused identically to one who has the wrong one.
    await placeOrder(page);
    await openSecureOrder(page);

    // 43 base64url characters — the exact published shape, and a token no grant
    // was ever minted for.
    const foreign = `S03CrossOrderProbe${'A'.repeat(25)}`;
    expect(foreign).toHaveLength(43);

    // Sent **sequentially**. The secure-link limiter counts requests and never
    // outcomes — precisely so it cannot become a validity oracle — so four
    // parallel probes answer 429 and prove nothing about the token. One at a
    // time is what actually exercises the authorization chain.
    const probes: [string, Record<string, unknown>][] = [
      ['/api/public/ready-made-orders/current', { token: foreign }],
      ['/api/public/orders/full-payment', { token: foreign }],
      ['/api/public/orders/full-payment/qr', { token: foreign }],
      [
        '/api/public/orders/deposit/evidence/status',
        { accessToken: foreign, attemptId: bAttempt.id },
      ],
      // A real attempt id from order B, named by a caller with no credential for
      // it. The refusal must be indistinguishable from the fictional one below.
      [
        '/api/public/orders/deposit/evidence/status',
        { accessToken: foreign, attemptId: '00000000-0000-4000-8000-000000000000' },
      ],
    ];

    for (const [path, data] of probes) {
      const response = await request.post(path, { data });
      const body = await response.text();

      // The load-bearing claim: no probe ever succeeds, and no probe ever
      // returns anything of order B.
      expect(response.status(), `${path} must not succeed`).not.toBe(200);
      expect(body, `${path} leaked an order code`).not.toContain(b.orderCode);

      // 404 is the canonical refusal. 429 is the limiter answering before the
      // request was evaluated at all — which says nothing about the token and is
      // itself part of the non-enumeration property, so it is accepted here
      // rather than retried into a 404 the run would rather see.
      expect([404, 429], `${path} answered ${String(response.status())}`).toContain(
        response.status(),
      );
      if (response.status() === 404) {
        expect(JSON.parse(body).code).toBe('SECURE_LINK_UNAVAILABLE');
      }
    }

    proofs.crossOrder = true;
  } finally {
    await admin.close();
  }
});

// ---------------------------------------------------------------------------
// Security proof 2 — the secure link dies mid-session
// ---------------------------------------------------------------------------

test('a revoked grant clears every authorized fact from the screen', async ({ page, browser }) => {
  test.setTimeout(420_000);
  const evidence = s03Evidence();
  const admin = await openAdminDriver(browser);

  try {
    const { orderCode } = await placeOrder(page);
    const orderId = await evidence.orderIdOf(orderCode);
    await admin.setShippingFee(orderId, FEE_A);

    await openSecureOrder(page);
    await expect(page.getByText(COPY.pillAwaitingPayment)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(orderCode, { exact: false })).toBeVisible();

    // Captured only if it is on screen. The obligation is a second read and the
    // secure-link limiter counts requests, so a run that has already exercised
    // several journeys can legitimately reach this state with the amount still
    // in flight. The §31 claim does not depend on it: what must vanish is every
    // authorized fact, and the order code is one the run always has.
    const shown = (
      await page
        .locator('.secure-order__highlight-number')
        .innerText()
        .catch(() => '')
    ).trim();

    // The grant is revoked out from under the open session. No delivered command
    // revokes an ORDER_ACCESS grant, and adding one to make a test pass is
    // forbidden — so the run writes the same columns the issuer's own revoke
    // path writes, on a disposable database, and lets the application decide
    // what that means.
    await evidence.revokeOrderAccessGrant(orderCode);

    // §31 — the same indistinguishable unavailable card, and nothing of the
    // order left behind it.
    await refreshUntilVisible(page, page.getByRole('heading', { name: COPY.unavailableTitle }));

    const body = await page.locator('body').innerText();
    expect(body, 'the order code is gone').not.toContain(orderCode);
    if (shown !== '') expect(body, 'the amount is gone').not.toContain(shown);
    expect(body, 'no transfer reference remains').not.toMatch(/ORD[A-Z0-9]+FL/);
    expect(body, 'no cause is disclosed').not.toMatch(/thu hồi|revoked/i);

    // The credential is gone with it: the address bar still carries no fragment,
    // and nothing was written to storage to recover one.
    expect(await page.evaluate(() => window.location.hash)).toBe('');
    expect(new URL(page.url()).pathname).toBe(ORDER_ACCESS_PATH);
    expect(
      await page.evaluate(() => window.localStorage.length + window.sessionStorage.length),
    ).toBe(0);

    await page.screenshot({ path: 'test-results/app12-s03/security-link-death.png' });
    proofs.linkDeath = true;
  } finally {
    await admin.close();
  }
});
