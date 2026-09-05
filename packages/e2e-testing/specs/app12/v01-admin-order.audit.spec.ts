/**
 * `APP12-V01` — the order lifecycle, audited from both sides at once.
 *
 * ```text
 * customer buys → operator prices delivery → customer pays → operator verifies
 *               → operator dispatches       → operator completes
 * ```
 *
 * Two screens move together through six states, and the audit photographs both
 * at every one: the Admin order detail — the highest-priority operator screen in
 * Wave 1 (§30) — and the customer's secure `ORDER_ACCESS` surface (§26). They are
 * captured in one project because they are one system: the question "can the
 * operator see what to do next" and the question "can the customer see what is
 * happening" have the same six answers, and auditing them apart would lose the
 * pairing.
 *
 * ## Nothing is simulated
 *
 * The order is placed through the real checkout, the fee is typed into the real
 * form, the payment attempt is opened by the **customer** pressing the delivered
 * control, and the verification, dispatch and completion all go through their
 * real dialogs. An operator screen proved against an attempt the harness
 * invented would prove nothing, which `APP12-A02-C1` records at length.
 *
 * ## Secrecy
 *
 * The customer's tab holds a live `ORDER_ACCESS` grant. `openSecureOrder` strips
 * the fragment and asserts it is gone before this file takes a single
 * screenshot, and `capture` refuses to photograph a URL that still carries one.
 * The transfer reference and the amount that appear inside the images belong to
 * a synthetic order in a database that is dropped when the run ends.
 *
 * Audit only.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  COPY as A02_COPY,
  openFullPaymentAttempt,
  openOperator,
  openOrderFromQueue,
  openQueue,
  submitShippingFee,
  storefrontOrigin,
} from './support/a02-world';
import { closeS02World, openS02World } from './support/s02-world';
import {
  closeS03World,
  openS03World,
  openSecureOrder,
  placeOrder,
  refreshUntilVisible,
  s03Evidence,
  statusPill,
  COPY as S03_COPY,
} from './support/s03-world';
import {
  ADMIN_VIEWPORTS,
  VIEWPORTS,
  createAuditLedger,
  loadEvidence,
  type AuditLedger,
} from './support/v01-world';
import { warmGateway } from './support/h08-world';

/* Plain-ESM helper layer; see `v01-world.ts`. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

test.describe.configure({ mode: 'serial', timeout: 1_500_000 });

let ledger: AuditLedger;
let operator: Page;
let customer: Page;
let closeAll: () => Promise<void>;
let orderCode: string;
let contact: string;

test.beforeAll(async () => {
  await openS02World();
  await openS03World();
  ledger = await createAuditLedger('admin-order');
});

test.afterAll(async () => {
  const { appendAuditLog } = await loadEvidence();
  appendAuditLog({
    cluster: 'Cluster 4 — Admin orders, payment, fulfilment, and the customer surface beside them',
    screens: ledger.screens(),
    screenshots: ledger.screenshots(),
    routes: ledger.routes(),
    concerns: [
      'operator "what must I do next" and customer state clarity are judged from these pairs',
      'see data/admin-order-measurements.json',
    ],
    next: 'analysis — findings, executive review and the V02 candidate matrix',
  });
  await closeAll?.();
  await closeS03World('[app12-v01-admin-order:s03]');
  await closeS02World('[app12-v01-admin-order:s02]');
});

/** Audits the operator's order detail at both Admin viewports. */
async function auditOperator(state: string): Promise<void> {
  for (const viewport of ADMIN_VIEWPORTS) {
    await ledger.audit(operator, {
      surface: 'admin',
      route: 'order-detail',
      viewport,
      state,
      aboveFold: true,
    });
  }
  await operator.setViewportSize({ width: 1440, height: 900 });
}

/**
 * Waits for the customer's screen to reach `pill`, then audits it.
 *
 * Waited for rather than assumed: the operator's write and the customer's next
 * read are two requests, and the second can win the race. Refreshed through the
 * delivered refresh path rather than reloaded — a reload would lose the
 * credential by design (`APP12-S03` §34).
 */
async function auditCustomer(state: string, pill: string, phone = true): Promise<void> {
  await customer.setViewportSize({ width: 1440, height: 900 });
  await refreshUntilVisible(customer, statusPill(customer, pill));
  await ledger.audit(customer, {
    surface: 'storefront',
    route: 'secure-order',
    viewport: VIEWPORTS[0]!,
    state,
    aboveFold: true,
  });
  if (phone) {
    await ledger.audit(customer, {
      surface: 'storefront',
      route: 'secure-order',
      viewport: VIEWPORTS[2]!,
      state,
      aboveFold: true,
    });
    await customer.setViewportSize({ width: 1440, height: 900 });
  }
}

test('A — the order exists, and both screens open on it', async ({ browser }) => {
  const shop = await browser.newContext({
    baseURL: storefrontOrigin(),
    viewport: { width: 1440, height: 900 },
  });
  customer = await shop.newPage();
  // See `warmGateway` (`APP12-H08`): this project's first connection through the
  // gateway answered `504` on the first V01 run, and `placeOrder` met an Nginx
  // error page where the checkout's contact card should have been. The failure
  // read as "the checkout has no Email option", which is the exact
  // misdiagnosis H08 records losing two runs to.
  await warmGateway(customer, 'v01-admin-order');
  const placed = await placeOrder(customer);
  orderCode = placed.orderCode;
  contact = placed.contact;
  await openSecureOrder(customer);

  const session = await openOperator(browser);
  operator = session.page;
  closeAll = async () => {
    await session.context.close();
    await shop.close();
  };

  // The queue, carrying real rows — the screen an operator starts every shift
  // on, and the one §29 asks whether "which order needs action" is answerable
  // from.
  await openQueue(operator);
  for (const viewport of ADMIN_VIEWPORTS) {
    await ledger.audit(operator, {
      surface: 'admin',
      route: 'orders-queue',
      viewport,
      state: 'with-orders',
      aboveFold: true,
    });
  }
  await operator.setViewportSize({ width: 1440, height: 900 });

  await openOrderFromQueue(operator, orderCode);
  await auditOperator('awaiting-shipping-fee');
});

test('B — the shipping fee, and what it changes on both screens', async () => {
  // The form as an operator meets it, before anything is typed, is already
  // captured by state A above; this is the screen once the fee has been entered
  // and the confirm control is live.
  await operator.getByTestId('shipping-fee-input').fill('45000');
  await operator.waitForTimeout(400);
  await ledger.audit(operator, {
    surface: 'admin',
    route: 'order-detail',
    viewport: ADMIN_VIEWPORTS[0]!,
    state: 'fee-entered',
    aboveFold: true,
  });

  await operator.getByTestId('shipping-fee-input').fill('');
  await submitShippingFee(operator, '45000');
  await expect(operator.getByTestId('order-detail-status')).toContainText(
    A02_COPY.awaitingPayment,
    { timeout: 30_000 },
  );
  await auditOperator('awaiting-payment');
  await auditCustomer('awaiting-payment', S03_COPY.pillAwaitingPayment);
});

test('C — the customer opens the transfer, and the operator gets something to review', async () => {
  await openFullPaymentAttempt(customer, contact);
  // The state the whole surface exists for: an amount, a reference, a QR and an
  // evidence control, all on screen at once. §26 asks whether the payment action
  // survives the support copy around it.
  await ledger.audit(customer, {
    surface: 'storefront',
    route: 'secure-order',
    viewport: VIEWPORTS[0]!,
    state: 'transfer-open',
    aboveFold: true,
  });
  await customer.setViewportSize({ width: VIEWPORTS[2]!.width, height: VIEWPORTS[2]!.height });
  await ledger.audit(customer, {
    surface: 'storefront',
    route: 'secure-order',
    viewport: VIEWPORTS[2]!,
    state: 'transfer-open',
    aboveFold: true,
  });
  await customer.setViewportSize({ width: 1440, height: 900 });

  await operator.reload({ waitUntil: 'load' });
  await expect(operator.getByRole('button', { name: A02_COPY.verify })).toBeVisible({
    timeout: 30_000,
  });
  await auditOperator('payment-review');
});

test('D — the verification dialog, the operator decision that moves money', async () => {
  const evidence = s03Evidence();
  const owed = await evidence.liveFullObligationOf(orderCode);
  const amount = String(owed.amount).split('.')[0] ?? '';
  const reference = (
    await operator.getByTestId('full-payment-reference').locator('dd').innerText()
  ).trim();

  await operator.getByRole('button', { name: A02_COPY.verify }).click();
  await expect(operator.getByTestId('verify-dialog')).toBeVisible();
  await ledger.audit(operator, {
    surface: 'admin',
    route: 'order-detail',
    viewport: ADMIN_VIEWPORTS[0]!,
    state: 'verify-dialog',
    aboveFold: true,
  });

  const fields = operator.getByTestId('verify-dialog').locator('input, textarea');
  await fields.nth(0).fill(amount);
  await fields.nth(1).fill(reference);
  if ((await fields.count()) > 2) {
    await fields.nth(2).fill('Đối chiếu sao kê ngân hàng.');
  }
  await ledger.audit(operator, {
    surface: 'admin',
    route: 'order-detail',
    viewport: ADMIN_VIEWPORTS[0]!,
    state: 'verify-dialog-filled',
    aboveFold: true,
  });

  await operator
    .getByTestId('verify-dialog')
    .getByRole('button', { name: /Xác nhận/ })
    .click();
  await expect(operator.getByTestId('payment-outcome')).toHaveAttribute(
    'data-outcome',
    'verified',
    { timeout: 30_000 },
  );
  await ledger.audit(operator, {
    surface: 'admin',
    route: 'order-detail',
    viewport: ADMIN_VIEWPORTS[0]!,
    state: 'verify-settled',
    aboveFold: true,
  });

  // The settled dialog stays open by design (`APP12-A02-C1`), so it is closed
  // the only way out — which is also the next thing a person does.
  await operator.getByTestId('verify-dialog').getByRole('button').first().click();
  await expect(operator.getByTestId('verify-dialog')).toHaveCount(0, { timeout: 15_000 });

  await auditOperator('ready-for-delivery');
  await auditCustomer('ready-for-delivery', S03_COPY.pillReadyForDelivery);
});

test('E — dispatch and completion, on both screens', async () => {
  for (const step of [
    {
      open: 'open-dispatch',
      confirm: 'dispatch-dialog-confirm',
      state: 'delivered',
      pill: S03_COPY.pillDelivered,
    },
    {
      open: 'open-completion',
      confirm: 'completion-dialog-confirm',
      state: 'completed',
      pill: S03_COPY.pillCompleted,
    },
  ]) {
    await operator.getByTestId(step.open).click();
    const confirmation = operator.getByTestId(step.confirm);
    await expect(confirmation).toBeVisible();
    await ledger.audit(operator, {
      surface: 'admin',
      route: 'order-detail',
      viewport: ADMIN_VIEWPORTS[0]!,
      state: `${step.state}-dialog`,
      aboveFold: true,
    });
    await confirmation.click();
    await expect(confirmation).toHaveCount(0, { timeout: 30_000 });

    await auditOperator(step.state);
    await auditCustomer(step.state, step.pill, step.state === 'completed');
  }

  await expect(operator.getByTestId('order-detail-status')).toContainText(A02_COPY.completed, {
    timeout: 30_000,
  });
});
