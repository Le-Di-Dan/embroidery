/**
 * `APP7-E01` — optional transfer evidence, the durable review outcome and the
 * focused browser acceptance. Cases **E01-03** and **E01-04**, plus §9's
 * Storefront mobile-390 state.
 *
 * The one claim these two cases carry is the one the whole phase is built
 * around: **evidence is supporting material, never a payment fact.** An image
 * travels the real `APP7-B05` intake, through real object storage and the real
 * inspection lane, to `ACCEPTED` — and the attempt, the obligation and the order
 * are exactly where they were. Verification's predicate is unchanged by it: the
 * exact amount and the exact reference, and nothing else.
 *
 * E01-04 proves the other half — a mismatch is a *business outcome* with a
 * durable state and a reconciliation row, not an HTTP failure, and the operator
 * is shown it as such.
 *
 * Fixture, secrecy and topology are as `support/app7-e01-world.ts` states them.
 */
import type { Page } from '@playwright/test';

import { createAdminOrderDriver, ADMIN_ORDER } from './support/admin-order-driver';
import { createDepositDriver, DEPOSIT } from './support/deposit-driver';
import { expect, test } from './support/app7-test';
import {
  apiBinary,
  apiJson,
  convertApprovedDesign,
  expectedTransferReference,
  type openAdminSession,
  requiredEnv,
  type App7World,
} from './support/app7-e01-world';

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */

const DEPOSIT_AMOUNT = '1166667.00';
const OPERATOR_NOTE = 'E01: doi chieu sao ke ngan hang.';
/** Deliberately one dong short — an exact comparison, no tolerance (§7 E01-04). */
const MISMATCHED_AMOUNT = '1166666.00';
const MISMATCH_REASON = 'E01: so tien tren sao ke khong khop voi so tien ky vong.';
/** `APP7-D01`'s mobile reference (`750:3`). */
const MOBILE_VIEWPORT = { width: 390, height: 844 };

let app7: App7World;
let admin: Awaited<ReturnType<typeof openAdminSession>>;
/** A cookieless Storefront origin for the public calls — see the sibling spec. */
let publicPage: Page;

const proofs: Record<string, boolean | string | number> = {};

test.describe.configure({ mode: 'serial' });

test.describe('APP7-E01 — evidence, review outcome and browser acceptance', () => {
  // Worker-scoped fixtures, shared with the sibling spec — see `app7-test.ts`.
  test.beforeAll(({ app7: world, admin: session, publicPage: storefront }) => {
    app7 = world;
    admin = session;
    publicPage = storefront;
  });

  test.afterAll(() => {
    console.log(`[APP7-E01] proofs ${JSON.stringify(proofs)}`);
  });

  // -------------------------------------------------------------- E01-03 ----

  test('E01-03 — an accepted image changes no payment state and is previewed by evidenceId', async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const scene = await convertOneOrder('ev');
    const { orderId, depositId, orderCode } = scene;

    // --- the customer opens the attempt and submits one image --------------
    const customer = await browser.newContext({ baseURL: requiredEnv('E2E_BASE_STOREFRONT') });
    const page = await customer.newPage();
    const driver = createDepositDriver(page);
    await driver.openDepositLink(scene.token);
    await driver.waitForPreAttempt();
    await driver.startAttempt();
    await driver.waitForInstructions();

    const attempts = await app7.evidence.listAttempts(depositId);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].status).toBe('PENDING');
    const attemptId = attempts[0].id as string;

    await expect(driver.evidenceReminder()).toBeVisible();
    proofs['e0103.reminderProminentBeforeUpload'] = true;

    const image = await createSyntheticImage();
    await driver.submitEvidence(image);

    // Immediately after the upload the screen says the *image* is being
    // checked — never that a payment is. `APP7-B05` answers `INSPECTING`, and
    // this route has no poll that could quietly promote it.
    await driver.waitForEvidenceInspecting();
    await expect(page.getByText(DEPOSIT.waitingBadge).first()).toBeVisible();

    // --- the real inspection lane, inside §12's bound ----------------------
    const asset = await app7.control.settle(
      'transfer-evidence inspection',
      async () => {
        const rows = await app7.evidence.listTransferEvidence(attemptId);
        return rows.length === 0
          ? undefined
          : app7.evidence.readEvidenceAssetStatus(rows[0].id as string);
      },
      (value: any) => value?.status === 'ACCEPTED' || value?.status === 'REJECTED',
    );
    expect(asset.status).toBe('ACCEPTED');
    proofs['e0103.evidenceReachedAccepted'] = true;

    const evidenceRows = await app7.evidence.listTransferEvidence(attemptId);
    expect(evidenceRows).toHaveLength(1);
    const evidenceId = evidenceRows[0].id as string;

    // --- nothing about the payment moved -----------------------------------
    expect((await app7.evidence.readAttempt(attemptId)).status).toBe('PENDING');
    expect((await app7.evidence.readObligation(depositId)).status).toBe('PENDING');
    expect((await app7.evidence.readOrder(orderId)).status).toBe('AWAITING_DEPOSIT');
    expect(await app7.evidence.countReconciliations(depositId)).toBe(0);
    expect(await app7.evidence.countEventsFor('payment.verified', attemptId)).toBe(0);
    expect(await app7.control.isDepositSatisfied(orderId)).toBe(false);
    proofs['e0103.acceptedEvidenceMovedNoPaymentState'] = true;

    // The customer is told the *image* was accepted, and never that money was.
    await driver.returnToTab();
    await driver.waitForEvidenceAccepted();
    await expect(page.getByText(DEPOSIT.evidenceNotPaymentNote)).toBeVisible();
    await expect(page.getByText(DEPOSIT.waitingBadge).first()).toBeVisible();
    expect((await driver.readPageText()).toLowerCase()).not.toContain('đã xác nhận tiền cọc');
    proofs['e0103.customerCopyStaysNonAuthoritative'] = true;

    // --- Admin: B04 metadata and the B06 private delivery ------------------
    const workspace = createAdminOrderDriver(admin.page);
    await workspace.openOrderDirect(orderId);
    await workspace.waitForPaymentPanel();
    await expect(workspace.evidenceItems()).toHaveCount(1);

    const payments = await readAdminPayments(orderId);
    const published = payments.attempts.find((row: any) => row.attemptId === attemptId);
    expect(published.evidence).toHaveLength(1);
    expect(published.evidence[0].evidenceId).toBe(evidenceId);
    expect(published.evidence[0].previewEligible).toBe(true);
    proofs['e0103.previewEligibleTrue'] = true;

    // §25.27 — the address is the association, and the raw asset id is never
    // published. Asserted against the id this run read straight out of the
    // table, so the claim is about *this* asset and not about a shape.
    const rawAssetId = evidenceRows[0].asset_id as string | undefined;
    expect(typeof rawAssetId === 'string' && rawAssetId.length > 0).toBe(true);
    expect(JSON.stringify(payments)).not.toContain(rawAssetId);
    proofs['e0103.rawAssetIdNotPublished'] = true;

    const bytes = await apiBinary(admin.page, `/api/admin/payment-evidence/${evidenceId}/content`);
    expect(bytes.status).toBe(200);
    expect(bytes.bytes.equals(image.buffer)).toBe(true);
    proofs['e0103.b06ServedExactBytes'] = true;

    await workspace.openEvidencePreview(0);
    await expect(workspace.previewImage()).toBeVisible();
    await workspace.closePreview();

    // --- and verification still turns only on amount and reference ---------
    const reference = expectedTransferReference(orderCode);
    await workspace.verifyDeposit({ amount: DEPOSIT_AMOUNT, reference, note: OPERATOR_NOTE });
    await workspace.waitForOutcome('verified');
    expect((await app7.evidence.readOrder(orderId)).status).toBe('DEPOSIT_PAID');
    const settled = await app7.evidence.readObligation(depositId);
    expect(settled.status).toBe('SATISFIED');
    expect(settled.satisfied_by_attempt_id).toBe(attemptId);
    proofs['e0103.evidenceDidNotAlterPredicate'] = true;

    await customer.close();
  });

  // -------------------------------------------------------------- E01-04 ----

  test('E01-04 — a mismatch is a durable REQUIRES_REVIEW, not an HTTP failure', async () => {
    test.setTimeout(180_000);
    const scene = await convertOneOrder('mis');
    const attemptId = await openAttemptOverHttp(scene, 'mis');
    const reference = expectedTransferReference(scene.orderCode);

    const workspace = createAdminOrderDriver(admin.page);
    await workspace.openOrderDirect(scene.orderId);
    await workspace.waitForPaymentPanel();
    await workspace.verifyDeposit({
      amount: MISMATCHED_AMOUNT,
      reference,
      note: MISMATCH_REASON,
    });

    // The operator is shown a business outcome, never a generic failure.
    await workspace.waitForOutcome('requiresReview');
    await expect(workspace.outcome()).toContainText(ADMIN_ORDER.reviewOutcomeTitle);
    await expect(workspace.outcome()).toContainText(ADMIN_ORDER.reviewOutcomeBody);
    await expect(workspace.failureBanner()).toHaveCount(0);
    await expect(workspace.outcomeAttempt()).toContainText(ADMIN_ORDER.attemptRequiresReview);
    await expect(workspace.outcomeOrder()).toContainText(ADMIN_ORDER.orderAwaitingDeposit);
    await expect(workspace.outcomeDeposit()).toContainText(ADMIN_ORDER.depositPending);
    proofs['e0104.reviewRenderedAsBusinessOutcome'] = true;

    const attempt = await app7.evidence.readAttempt(attemptId);
    expect(attempt.status).toBe('REQUIRES_REVIEW');
    expect(typeof attempt.review_reason).toBe('string');
    expect((attempt.review_reason as string).length).toBeGreaterThan(0);

    expect((await app7.evidence.readObligation(scene.depositId)).status).toBe('PENDING');
    expect((await app7.evidence.readOrder(scene.orderId)).status).toBe('AWAITING_DEPOSIT');
    expect(await app7.evidence.countOrderTransitionsTo(scene.orderId, 'DEPOSIT_PAID')).toBe(0);
    expect(await app7.evidence.countReconciliations(scene.depositId)).toBe(1);
    expect(await app7.evidence.countEventsFor('payment.verified', attemptId)).toBe(0);
    expect(await app7.evidence.countProviderEvents()).toBe(0);
    expect(await app7.control.isDepositSatisfied(scene.orderId)).toBe(false);
    proofs['e0104.mismatchSatisfiedNothing'] = true;
    // The review is left unresolved: §7 says not to resolve it, and nothing in
    // this harness's cleanup needs it resolved.
  });

  // ------------------------------------------------- browser acceptance ----

  test('Browser — Storefront mobile 390 keeps the critical payment facts readable', async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const scene = await convertOneOrder('mob');

    const customer = await browser.newContext({
      baseURL: requiredEnv('E2E_BASE_STOREFRONT'),
      viewport: MOBILE_VIEWPORT,
    });
    const page = await customer.newPage();
    const driver = createDepositDriver(page);
    await driver.openDepositLink(scene.token);
    await driver.waitForPreAttempt();
    await driver.startAttempt();
    await driver.waitForInstructions();

    // The facts a customer needs in order to make the transfer, and the
    // reminder that an image is welcome and optional.
    await expect(page.getByText(DEPOSIT.amountLabel)).toBeVisible();
    await expect(page.getByText(DEPOSIT.referenceLabel)).toBeVisible();
    // `exact`: the QR fallback sentence mentions the account number too, and an
    // unanchored match would resolve to both.
    await expect(page.getByText(DEPOSIT.accountNumberLabel, { exact: true })).toBeVisible();
    await driver.waitForQr();
    await expect(driver.evidenceReminder()).toBeVisible();

    // No horizontal overflow: the document is never wider than the viewport.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    proofs['browser.mobile390NoHorizontalOverflow'] = true;

    await customer.close();
  });
});

// ---------------------------------------------------------------- helpers ----

interface Scene {
  readonly orderId: string;
  readonly depositId: string;
  readonly orderCode: string;
  readonly token: string;
}

/**
 * One converted order with a live secure link and a fresh step-up, and no
 * attempt.
 *
 * The conversion is the real `design.approved` consumer. The step-up is the
 * committed `VERIFIED` row the accepted APP6 suites established, so `GRD-003`
 * runs for real against production evidence without these cases replaying the
 * APP4 OTP journey — `E01-01` drives that one end to end in a browser, and §7
 * says not to repeat it.
 */
async function convertOneOrder(suffix: string): Promise<Scene> {
  const handoff = await app7.world.seedApprovedHandoff({ branch: 'CATALOG', suffix });
  const order = await convertApprovedDesign(app7, handoff);
  const deposit = await app7.evidence.findObligation(order.id, 'DEPOSIT');
  const link = await app7.world.issueSecureLink(handoff);
  await app7.world.seedFreshStepUp(handoff);

  const current = await apiJson(publicPage, '/api/public/orders/deposit', {
    method: 'POST',
    body: { token: link.rawToken },
  });
  expect(current.status).toBe(200);

  return {
    orderId: order.id as string,
    depositId: deposit.id as string,
    orderCode: current.body.data.orderCode as string,
    token: link.rawToken as string,
  };
}

/** The delivered `publicOrderDeposit_initiate`, for the cases with no browser. */
async function openAttemptOverHttp(scene: Scene, suffix: string): Promise<string> {
  const opened = await apiJson(publicPage, '/api/public/orders/deposit/attempts', {
    method: 'POST',
    body: { token: scene.token },
    headers: { 'Idempotency-Key': `app7-e01-${suffix}-${scene.orderCode}` },
  });
  expect(opened.status).toBe(201);
  expect(opened.body.data.status).toBe('PENDING');
  return opened.body.data.attemptId as string;
}

/** The delivered `adminOrderPayment_read`, carrying the real session cookie. */
async function readAdminPayments(orderId: string): Promise<any> {
  const response = await apiJson(admin.page, `/api/admin/orders/${orderId}/payments`, {
    method: 'GET',
  });
  expect(response.status).toBe(200);
  return response.body.data;
}

/**
 * One valid synthetic image, generated rather than committed.
 *
 * The private customer-upload lane verifies a file by decoding every pixel, so a
 * hand-built byte array would pass a header check and fail that one. The
 * worker's own `sharp` produces it — the same generator `APP5-E01` uses — which
 * also means the bytes are a genuine JPEG rather than something only this suite
 * believes is one.
 */
async function createSyntheticImage(): Promise<{
  name: string;
  mimeType: string;
  buffer: Buffer;
}> {
  const { createEvidenceImage } =
    (await import('../../support/app5/app5-fixture-universe.mjs')) as any;
  const image = await createEvidenceImage({ width: 96, height: 96 });
  return { name: 'app7-e01-transfer.jpg', mimeType: image.mimeType, buffer: image.buffer };
}
