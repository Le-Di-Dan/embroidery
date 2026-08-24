/**
 * `APP7-E01` — order creation, manual deposit, verification and the APP8
 * hand-off boundary. Cases **E01-01, E01-02, E01-05 and E01-06**.
 *
 * One serial chain across the real Storefront, the real API over HTTP through
 * the real gateway, real PostgreSQL, the real APP7 order-conversion runtime and
 * the real Admin. No APP7 route is intercepted, stubbed or mocked, and no
 * fixture creates a fact this run exists to prove: the Order, its OrderItem,
 * both payment obligations, the payment attempt, the reconciliation, the
 * `payment.verified` event and the `DEPOSIT_PAID` transition are all produced by
 * the application itself.
 *
 * What is fixture is stated once, in `support/app7-e01-world.ts`: the APP6
 * hand-off (approved request, exact accepted quotation version, immutable
 * Approval Snapshot) and the bootstrap Admin. That is the boundary
 * `APP7-E01` §6 fixes.
 *
 * ### The stale `APP7-R00` §19 wording
 *
 * `APP7_PHASE_ENTRY_AUDIT.md` §19 predates `APP7-G01` and reads as though a
 * verified deposit *creates* the Order. It does not, and `E01-01` proves the
 * delivered order both ways round: the Order exists at `AWAITING_DEPOSIT` before
 * any attempt is opened, and the **same** Order — asserted by id — is the one
 * that later reaches `DEPOSIT_PAID`.
 *
 * ```text
 * R00_E01_ORDER_AFTER_VERIFICATION_WORDING = SUPERSEDED_BY_G01_TR_LC14_01
 * ```
 *
 * Secrets: the secure-link token, the step-up code and the Admin password live
 * only in this process's memory and in browser fields. Nothing below prints one,
 * compares one with an operand-printing matcher, or writes one to an artifact.
 */
import type { Page } from '@playwright/test';

import { createS01Driver } from '../app4/support/s01-verification-driver';
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
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */

/** The accepted figures the hand-off freezes, as the customer sees them. */
const DEPOSIT_AMOUNT = '1166667.00';
const REMAINING_AMOUNT = '2166666.00';
const DEPOSIT_DISPLAY = '1.166.667';
const OPERATOR_NOTE = 'E01: doi chieu sao ke ngan hang, tien cop da ve tai khoan.';

let app7: App7World;
let admin: Awaited<ReturnType<typeof openAdminSession>>;
/**
 * A cookieless Storefront page, used only as the origin the three public
 * deposit operations are called from.
 *
 * Deliberately not the Admin context: a customer surface that only worked
 * because an operator's session happened to travel with the request would be the
 * exact confusion `APP7-B03` is built to make impossible, and this run must not
 * be the thing that hides it. See `apiJson` for why the calls are issued from a
 * page at all.
 */
let publicPage: Page;

/** Safe facts only: booleans, counts and id-free labels. */
const proofs: Record<string, boolean | string | number> = {};

/** Carried between the cases in this serial chain. */
const state: {
  catalogHandoff?: any;
  catalogOrderId?: string;
  catalogOrderCode?: string;
  catalogDepositId?: string;
  catalogAttemptId?: string;
  catalogToken?: string;
} = {};

test.describe.configure({ mode: 'serial' });

test.describe('APP7-E01 — order, deposit, verification', () => {
  // The world, the Admin session and the public origin are worker-scoped
  // fixtures shared with the sibling spec; this binds them to the module-level
  // names the helpers below read, so the run stays one aggregate rather than two.
  test.beforeAll(({ app7: world, admin: session, publicPage: storefront }) => {
    app7 = world;
    admin = session;
    publicPage = storefront;
  });

  test.afterAll(() => {
    console.log(`[APP7-E01] proofs ${JSON.stringify(proofs)}`);
  });

  // -------------------------------------------------------------- E01-01 ----

  test('E01-01 — Catalog conversion, customer deposit, Admin verification', async ({ browser }) => {
    test.setTimeout(240_000);
    const handoff = await app7.world.seedApprovedHandoff({ branch: 'CATALOG', suffix: 'cat' });
    state.catalogHandoff = handoff;

    // --- real `design.approved` conversion ---------------------------------
    const order = await convertApprovedDesign(app7, handoff);
    const orderId = order.id as string;
    state.catalogOrderId = orderId;
    expect(order.status).toBe('AWAITING_DEPOSIT');
    expect(await app7.evidence.countOrdersForRequest(handoff.customRequestId)).toBe(1);
    expect(order.accepted_quotation_version_id).toBe(handoff.quotationVersionId);
    expect(order.current_approval_snapshot_id).toBe(handoff.approvalSnapshotId);

    const items = await app7.evidence.listOrderItems(orderId);
    expect(items).toHaveLength(1);
    expect(items[0].sku_id).toBe(handoff.skuId);
    expect(items[0].customer_owned_product_id).toBeNull();
    expect(items[0].unit_price_amount).toBe('1111111.00');
    expect(items[0].line_total_amount).toBe('3333333.00');

    const obligations = await app7.evidence.listObligations(orderId);
    expect(obligations.map((row: any) => row.kind).sort()).toEqual(['DEPOSIT', 'REMAINING']);
    for (const obligation of obligations) {
      expect(obligation.order_id).toBe(orderId);
      expect(obligation.currency).toBe('VND');
      expect(obligation.status).toBe('PENDING');
    }
    const deposit = await app7.evidence.findObligation(orderId, 'DEPOSIT');
    const remaining = await app7.evidence.findObligation(orderId, 'REMAINING');
    state.catalogDepositId = deposit.id as string;
    expect(deposit.amount).toBe(DEPOSIT_AMOUNT);
    expect(remaining.amount).toBe(REMAINING_AMOUNT);

    // §7 — the hand-off port is false before satisfaction, and the order code
    // is learned from the row only so the browser assertions can compare
    // against it. It is never printed.
    expect(await app7.control.isDepositSatisfied(orderId)).toBe(false);
    proofs['e0101.eligibilityBeforeSatisfaction'] = false;

    // --- the customer, through the real Storefront -------------------------
    const link = await app7.world.issueSecureLink(handoff);
    state.catalogToken = link.rawToken as string;

    const customer = await browser.newContext({ baseURL: requiredEnv('E2E_BASE_STOREFRONT') });
    const page = await customer.newPage();
    const depositDriver = createDepositDriver(page);
    await depositDriver.openDepositLink(link.rawToken);
    await depositDriver.waitForPreAttempt();

    const orderCode = await depositDriver.readOrderCode();
    state.catalogOrderCode = orderCode;
    expect(await app7.evidence.findOrderIdByCode(orderCode)).toBe(orderId);
    expect(await depositDriver.readSummaryDeposit()).toBe(`${DEPOSIT_DISPLAY} VND`);

    // The token is stripped from the visible URL before the first request.
    expect(page.url()).not.toContain('#t=');
    proofs['e0101.fragmentStripped'] = true;

    // --- initiation: the real GRD-003 step-up runs over the page -----------
    app7.control.reset();
    await depositDriver.startAttempt();
    await depositDriver.waitForStepUp();
    const verification = createS01Driver(page);
    await verification.chooseContactKind('EMAIL');
    await verification.enterContact('EMAIL', handoff.contactValue);
    await verification.submitContact();
    await verification.waitForCodeEntry();
    // The code exists only in the in-process recording adapter, which is why
    // this process executes W01 rather than watching it.
    await app7.control.drainJobs();
    const code = app7.control.secretOf(0);
    expect(typeof code === 'string' && code.length > 0).toBe(true);
    await verification.enterCode(code);
    await verification.submitCode();

    await depositDriver.waitForInstructions();
    proofs['e0101.stepUpCompletedInPage'] = true;

    // --- the exact bank facts ----------------------------------------------
    const reference = expectedTransferReference(orderCode);
    expect(await depositDriver.readTransferAmount()).toBe(`${DEPOSIT_DISPLAY} VND`);
    expect(await depositDriver.readTransferReference()).toBe(reference);
    expect(await depositDriver.readBankFact(DEPOSIT.bankLabel)).toBe(app7.merchant.bankDisplayName);
    expect(await depositDriver.readBankFact(DEPOSIT.accountNumberLabel)).toContain(
      app7.merchant.accountNumber,
    );
    expect(await depositDriver.readBankFact(DEPOSIT.accountNameLabel)).toBe(
      app7.merchant.accountName,
    );
    await depositDriver.waitForQr();
    proofs['e0101.qrRendered'] = true;

    // Zero evidence in this case, by design (§7).
    const attemptsBefore = await app7.evidence.listAttempts(deposit.id);
    expect(attemptsBefore).toHaveLength(1);
    expect(attemptsBefore[0].status).toBe('PENDING');
    expect(attemptsBefore[0].method).toBe('BANK_TRANSFER');
    expect(attemptsBefore[0].amount).toBe(DEPOSIT_AMOUNT);
    state.catalogAttemptId = attemptsBefore[0].id as string;
    expect(await app7.evidence.listTransferEvidence(attemptsBefore[0].id)).toHaveLength(0);
    expect((await app7.evidence.readOrder(orderId)).status).toBe('AWAITING_DEPOSIT');
    expect(await app7.control.isDepositSatisfied(orderId)).toBe(false);

    // --- the Admin, through the real workspace ------------------------------
    const workspace = createAdminOrderDriver(admin.page);
    await workspace.openQueue();
    await workspace.openOrderFromQueue(orderCode);
    await workspace.waitForPaymentPanel();
    expect(await workspace.readOrderStatus()).toContain(ADMIN_ORDER.orderAwaitingDeposit);
    expect(await workspace.readDepositStatus()).toContain(ADMIN_ORDER.depositPending);
    expect(await workspace.readExpectedAmount()).toBe(`${DEPOSIT_DISPLAY} VND`);
    expect(await workspace.readExpectedReference()).toBe(reference);
    await expect(workspace.evidenceEmpty()).toBeVisible();

    await workspace.verifyDeposit({
      amount: DEPOSIT_AMOUNT,
      reference,
      note: OPERATOR_NOTE,
    });
    await workspace.waitForOutcome('verified');
    await expect(workspace.outcomeOrder()).toContainText(ADMIN_ORDER.orderDepositPaid);
    await expect(workspace.outcomeDeposit()).toContainText(ADMIN_ORDER.depositSatisfied);
    await expect(workspace.outcomeAttempt()).toContainText(ADMIN_ORDER.attemptSucceeded);

    // --- the durable truth --------------------------------------------------
    const settledAttempt = await app7.evidence.readAttempt(state.catalogAttemptId);
    expect(settledAttempt.status).toBe('SUCCEEDED');
    const settledDeposit = await app7.evidence.readObligation(deposit.id);
    expect(settledDeposit.status).toBe('SATISFIED');
    expect(settledDeposit.satisfied_by_attempt_id).toBe(state.catalogAttemptId);
    const settledOrder = await app7.evidence.readOrder(orderId);
    expect(settledOrder.id).toBe(orderId);
    expect(settledOrder.status).toBe('DEPOSIT_PAID');
    expect(await app7.evidence.countOrderTransitionsTo(orderId, 'DEPOSIT_PAID')).toBe(1);
    expect(await app7.evidence.countReconciliations(deposit.id)).toBe(1);
    expect(await app7.evidence.countEventsFor('payment.verified', state.catalogAttemptId)).toBe(1);
    expect(await app7.evidence.countProviderEvents()).toBe(0);
    expect(await app7.control.isDepositSatisfied(orderId)).toBe(true);
    proofs['e0101.eligibilityAfterSatisfaction'] = true;

    // --- the customer's confirmation, on a fresh entry ----------------------
    // S01 does not poll, and no customer polling endpoint exists. The
    // authoritative current state is what the original secure link returns when
    // it is opened again.
    const returning = await browser.newContext({
      baseURL: requiredEnv('E2E_BASE_STOREFRONT'),
    });
    const returningPage = await returning.newPage();
    const confirmation = createDepositDriver(returningPage);
    await confirmation.openDepositLink(link.rawToken);
    await confirmation.waitForConfirmed();
    await expect(returningPage.getByText(DEPOSIT.confirmedOrderBadge)).toBeVisible();
    await expect(returningPage.getByText(DEPOSIT.confirmedDepositBadge)).toBeVisible();

    // §25.22 — the confirmation claims no APP8/APP9 progress.
    const confirmationText = (await confirmation.readPageText()).toLowerCase();
    for (const forbidden of DEPOSIT.forbiddenAfterConfirmation) {
      expect(confirmationText).not.toContain(forbidden);
    }
    proofs['e0101.confirmationClaimsNoProduction'] = true;

    await expectNoApp8Writes();

    await returning.close();
    await customer.close();
  });

  // -------------------------------------------------------------- E01-02 ----

  test('E01-02 — COP conversion freezes a customer-owned line and can reach DEPOSIT_PAID', async () => {
    test.setTimeout(180_000);
    const handoff = await app7.world.seedApprovedHandoff({
      branch: 'CUSTOMER_OWNED',
      suffix: 'cop',
    });
    const order = await convertApprovedDesign(app7, handoff);
    const orderId = order.id as string;

    expect(order.status).toBe('AWAITING_DEPOSIT');
    expect(await app7.evidence.countOrdersForRequest(handoff.customRequestId)).toBe(1);

    const items = await app7.evidence.listOrderItems(orderId);
    expect(items).toHaveLength(1);
    expect(items[0].customer_owned_product_id).toBe(handoff.customerOwnedProductId);
    expect(items[0].sku_id).toBeNull();
    // §25.7 — no Catalog identity is fabricated for a customer-owned line.
    expect(items[0].variant_label).toBeNull();
    expect(items[0].size_label).toBeNull();
    proofs['e0102.copFabricatesNoCatalogIdentity'] = true;

    const deposit = await app7.evidence.findObligation(orderId, 'DEPOSIT');
    const remaining = await app7.evidence.findObligation(orderId, 'REMAINING');
    expect(deposit.amount).toBe(DEPOSIT_AMOUNT);
    expect(deposit.currency).toBe('VND');
    expect(remaining.amount).toBe(REMAINING_AMOUNT);
    expect(remaining.currency).toBe('VND');

    // The smallest real payment that proves this same COP order settles: the
    // delivered B03 initiation over HTTP and the delivered B04 verification
    // through the Admin's own session. §7 forbids repeating the browser journey.
    const link = await app7.world.issueSecureLink(handoff);
    await app7.world.seedFreshStepUp(handoff);
    const attempt = await initiateDepositAttempt(link.rawToken);
    expect(attempt.status).toBe('PENDING');

    const orderCode = attempt.orderCode;
    const reference = expectedTransferReference(orderCode);
    expect(attempt.transferReference).toBe(reference);

    const decision = await verifyAttempt(attempt.attemptId, {
      observedAmount: DEPOSIT_AMOUNT,
      observedTransferReference: reference,
      note: OPERATOR_NOTE,
    });
    expect(decision.attemptStatus).toBe('SUCCEEDED');
    expect(decision.depositStatus).toBe('SATISFIED');
    expect(decision.orderStatus).toBe('DEPOSIT_PAID');
    expect(decision.orderId).toBe(orderId);

    expect((await app7.evidence.readOrder(orderId)).status).toBe('DEPOSIT_PAID');
    expect(await app7.control.isDepositSatisfied(orderId)).toBe(true);
    expect(await app7.evidence.countProviderEvents()).toBe(0);
    await expectNoApp8Writes();
    proofs['e0102.copReachedDepositPaid'] = true;
  });

  // -------------------------------------------------------------- E01-05 ----

  test('E01-05 — duplicate design.approved and a verification replay converge', async () => {
    test.setTimeout(120_000);
    const handoff = state.catalogHandoff;
    const orderId = state.catalogOrderId as string;
    const depositId = state.catalogDepositId as string;
    const reference = expectedTransferReference(state.catalogOrderCode as string);

    const itemsBefore = await app7.evidence.countOrderItems(orderId);
    const obligationsBefore = (await app7.evidence.listObligations(orderId)).length;
    const transitionsBefore = (await app7.evidence.listOrderTransitions(orderId)).length;

    // One redelivery of the same event. The effect key is the approval, so two
    // rows naming one approval are two deliveries of one effect.
    await app7.world.appendDesignApproved(handoff);
    await app7.control.drainJobs();

    expect(await app7.evidence.countOrdersForRequest(handoff.customRequestId)).toBe(1);
    expect(await app7.evidence.countOrderItems(orderId)).toBe(itemsBefore);
    expect((await app7.evidence.listObligations(orderId)).length).toBe(obligationsBefore);
    proofs['e0105.duplicateApprovalKeptOneOrder'] = true;

    // One retry of the same logical exact verification.
    const replay = await verifyAttempt(state.catalogAttemptId as string, {
      observedAmount: DEPOSIT_AMOUNT,
      observedTransferReference: reference,
      note: OPERATOR_NOTE,
    });
    expect(replay.attemptStatus).toBe('SUCCEEDED');
    expect(replay.depositStatus).toBe('SATISFIED');
    expect(replay.orderStatus).toBe('DEPOSIT_PAID');

    expect(await app7.evidence.countOrderTransitionsTo(orderId, 'DEPOSIT_PAID')).toBe(1);
    expect(await app7.evidence.countReconciliations(depositId)).toBe(1);
    expect(await app7.evidence.countEventsFor('payment.verified', state.catalogAttemptId)).toBe(1);
    expect((await app7.evidence.listOrderTransitions(orderId)).length).toBe(transitionsBefore);
    const settled = await app7.evidence.readObligation(depositId);
    expect(settled.satisfied_by_attempt_id).toBe(state.catalogAttemptId);
    proofs['e0105.verificationReplayWroteNothingSecond'] = true;
  });

  // -------------------------------------------------------------- E01-06 ----

  test('E01-06 — secrecy and the APP8 hand-off boundary', async ({ browser }) => {
    test.setTimeout(180_000);
    // A fresh order, so the port can be interrogated at each step that must NOT
    // flip it: attempt creation, QR generation and evidence are all customer
    // actions and none of them is a payment.
    const handoff = await app7.world.seedApprovedHandoff({ branch: 'CATALOG', suffix: 'gate' });
    const order = await convertApprovedDesign(app7, handoff);
    const orderId = order.id as string;
    expect(await app7.control.isDepositSatisfied(orderId)).toBe(false);

    const link = await app7.world.issueSecureLink(handoff);
    await app7.world.seedFreshStepUp(handoff);

    const attempt = await initiateDepositAttempt(link.rawToken);
    expect(await app7.control.isDepositSatisfied(orderId)).toBe(false);

    const qr = await fetchDepositQr(link.rawToken);
    expect(qr.contentType).toContain('image/png');
    expect(qr.byteLength).toBeGreaterThan(0);
    expect(await app7.control.isDepositSatisfied(orderId)).toBe(false);
    proofs['e0106.eligibilityUnmovedByAttemptAndQr'] = false;

    const reference = expectedTransferReference(attempt.orderCode);
    const decision = await verifyAttempt(attempt.attemptId, {
      observedAmount: DEPOSIT_AMOUNT,
      observedTransferReference: reference,
      note: OPERATOR_NOTE,
    });
    expect(decision.depositStatus).toBe('SATISFIED');
    expect(await app7.control.isDepositSatisfied(orderId)).toBe(true);
    proofs['e0106.eligibilityTrueOnlyAfterSatisfaction'] = true;

    // --- the browser-side secrecy sweep -------------------------------------
    const customer = await browser.newContext({ baseURL: requiredEnv('E2E_BASE_STOREFRONT') });
    const page = await customer.newPage();
    const driver = createDepositDriver(page);
    await driver.openDepositLink(state.catalogToken as string);
    await driver.waitForConfirmed();

    const secrets: [string, string][] = [
      ['secureLinkToken', state.catalogToken as string],
      ['stepUpCode', app7.control.secretOf(0) ?? ''],
      ['adminPassword', requiredEnv('E2E_ADMIN_PASSWORD')],
    ];
    expect(await scanForSecrets(page, secrets)).toEqual([]);
    // The operator's own workspace is swept too: the Admin sees an order's whole
    // payment truth, and a customer's bearer token must not be part of it.
    expect(await scanForSecrets(admin.page, secrets)).toEqual([]);
    proofs['e0106.noSecretInBrowserSurface'] = true;

    // Storage keys, buckets and private DB credentials never reach a customer
    // surface. Matched on shape, so a value this run does not know still fails.
    const body = await driver.readPageText();
    for (const shape of [/postgres:\/\//i, /s3:\/\//i, /Idempotency-Key/i, /bucket/i]) {
      expect(body).not.toMatch(shape);
    }
    proofs['e0106.noInternalAddressOnCustomerSurface'] = true;

    expect(await app7.evidence.countProviderEvents()).toBe(0);
    expect(await app7.evidence.countRefunds()).toBe(0);
    await expectNoApp8Writes();

    await customer.close();
  });
});

// ---------------------------------------------------------------- helpers ----

/** Every APP8 table is empty. A table that does not exist yet counts as empty. */
async function expectNoApp8Writes(): Promise<void> {
  const counts = await app7.evidence.countApp8Writes();
  for (const [table, count] of Object.entries(counts)) {
    expect({ table, count }).toEqual({ table, count: count === null ? null : 0 });
  }
}

/** The delivered `publicOrderDeposit_initiate`, over real HTTP. */
async function initiateDepositAttempt(
  rawToken: string,
): Promise<{ attemptId: string; status: string; transferReference: string; orderCode: string }> {
  const current = await apiJson(publicPage, '/api/public/orders/deposit', {
    method: 'POST',
    body: { token: rawToken },
  });
  expect(current.status).toBe(200);
  const orderCode = current.body.data.orderCode as string;

  const opened = await apiJson(publicPage, '/api/public/orders/deposit/attempts', {
    method: 'POST',
    body: { token: rawToken },
    headers: { 'Idempotency-Key': `app7-e01-${orderCode}-1` },
  });
  expect(opened.status).toBe(201);
  return { ...opened.body.data, orderCode };
}

/** The delivered `publicOrderDeposit_qr`, over real HTTP. */
async function fetchDepositQr(
  rawToken: string,
): Promise<{ contentType: string; byteLength: number; body: Buffer }> {
  const response = await apiBinary(publicPage, '/api/public/orders/deposit/qr', {
    method: 'POST',
    body: { token: rawToken },
  });
  expect(response.status).toBe(200);
  return {
    contentType: response.contentType,
    byteLength: response.bytes.byteLength,
    body: response.bytes,
  };
}

/** The delivered `adminPaymentAttempt_verify`, carrying the real session cookie. */
async function verifyAttempt(
  attemptId: string,
  observed: { observedAmount: string; observedTransferReference: string; note: string },
): Promise<any> {
  const response = await apiJson(admin.page, `/api/admin/payment-attempts/${attemptId}/verify`, {
    method: 'POST',
    body: observed,
  });
  expect(response.status).toBe(200);
  return response.body.data;
}

/**
 * Looks for each named secret anywhere the browser can reach it.
 *
 * Returns the **names** that leaked, never the values, so a failure message can
 * say what went wrong without repeating the credential that went wrong.
 */
async function scanForSecrets(page: Page, secrets: [string, string][]): Promise<string[]> {
  const surface = await page.evaluate(() => ({
    url: window.location.href,
    html: document.documentElement.outerHTML,
    local: JSON.stringify(window.localStorage),
    session: JSON.stringify(window.sessionStorage),
    cookie: document.cookie,
  }));
  const haystack = Object.values(surface).join('\n');
  return secrets
    .filter(([, value]) => value.length > 0 && haystack.includes(value))
    .map(([name]) => name);
}
