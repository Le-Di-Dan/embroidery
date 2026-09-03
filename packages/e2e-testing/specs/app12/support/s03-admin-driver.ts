/**
 * The operator half of the `APP12-S03` run, driven through the **delivered
 * Admin HTTP operations**.
 *
 * ## Why this is an API driver and not a UI driver
 *
 * `APP7-E01`'s Admin driver clicks a real workspace, because `APP7-A01` had
 * shipped one. The Ready-Made operator surfaces have not: `APP12-A03` owns the
 * shipping-fee card, the `FULL` verification panel and the fulfilment rail, and
 * it is explicitly `NOT_AUTHORIZED` while S03 is open. So there is no screen to
 * click, and inventing one here would be building A01/A03 inside a test.
 *
 * What this drives instead is the exact set of operations those screens will
 * eventually call, already delivered by `APP12-B03` and `APP12-B05`:
 *
 * ```text
 * adminOrderShipping_save      PUT  /api/admin/orders/{orderId}/shipping-detail
 * adminPaymentAttempt_verify   POST /api/admin/payment-attempts/{attemptId}/verify
 * adminOrder_dispatch          POST /api/admin/orders/{orderId}/dispatch
 * adminOrder_complete          POST /api/admin/orders/{orderId}/completion
 * ```
 *
 * No new endpoint, no production hook, and no direct commercial DB mutation
 * where one of these exists.
 *
 * ## Nothing bypasses a guard
 *
 * The session comes from a **real login through the real form** on the Admin
 * origin — no cookie injection, no token minting, no guard override. The
 * requests below then travel that browser context's own cookie jar, so every
 * one of them passes `AuthenticatedAdminGuard` exactly as an operator's would.
 * A password is typed into a field and never logged.
 *
 * Test-only. Never imported by application code.
 */
import {
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
} from '@playwright/test';

/** The Admin login form's stable ids and its one approved control. */
const LOGIN = {
  emailInput: '#staff-login-email',
  passwordInput: '#staff-login-password',
  submitName: 'Đăng nhập',
  logoutName: 'Đăng xuất',
} as const;

export interface AdminCredentials {
  readonly email: string;
  readonly password: string;
}

export interface S03AdminDriver {
  /** Sets the exact shipping fee, which is what creates the FULL obligation. */
  readonly setShippingFee: (orderId: string, feeAmount: string) => Promise<void>;
  /** Verifies one attempt against the exact figures the customer was shown. */
  readonly verifyFullPayment: (
    attemptId: string,
    observedAmount: string,
    observedTransferReference: string,
  ) => Promise<void>;
  readonly dispatch: (orderId: string) => Promise<void>;
  readonly complete: (orderId: string) => Promise<void>;
  readonly close: () => Promise<void>;
}

/**
 * The delivery facts the operator confirms alongside the fee.
 *
 * `adminOrderShipping_save` is a **PUT** on the order's one shipping detail, so
 * it carries the whole record rather than a fee patch. These are the same values
 * the customer entered at checkout, restated by the operator — which is what the
 * delivered contract asks for and what `APP12-A03`'s card will submit.
 */
const DELIVERY = {
  recipientName: 'Nguyễn Minh Anh',
  recipientPhone: '0901234567',
  addressLine: '12 Nguyễn Huệ, Phường Bến Nghé, Quận 1',
  province: 'TP. Hồ Chí Minh',
} as const;

/**
 * Opens an authenticated operator session on the Admin origin.
 *
 * The context is this driver's own and is closed by `close()`, so the customer's
 * browser context is never touched: the two actors in these journeys are two
 * real sessions, which is the only honest way to prove that an operator's write
 * is what moves the customer's screen.
 */
export async function createS03AdminDriver(
  browser: Browser,
  adminBaseUrl: string,
  credentials: AdminCredentials,
): Promise<S03AdminDriver> {
  const context: BrowserContext = await browser.newContext({ baseURL: adminBaseUrl });
  const page = await context.newPage();

  await page.goto('/login');
  await page.locator(LOGIN.emailInput).fill(credentials.email);
  await page.locator(LOGIN.passwordInput).fill(credentials.password);
  await page.getByRole('button', { name: LOGIN.submitName }).click();
  await expect(page.getByRole('button', { name: LOGIN.logoutName })).toBeVisible();

  const request: APIRequestContext = context.request;

  /** Fails loudly with the status and the server's own code, never a body dump. */
  const expectOk = async (
    response: Awaited<ReturnType<APIRequestContext['post']>>,
    what: string,
  ): Promise<void> => {
    if (response.ok()) return;
    let code = 'unknown';
    try {
      const body: unknown = await response.json();
      const named = (body as { code?: unknown } | null)?.code;
      code = typeof named === 'string' ? named : 'unknown';
    } catch {
      /* a non-JSON body tells us nothing more than the status already did */
    }
    throw new Error(`${what} answered ${String(response.status())} (${code}).`);
  };

  return {
    setShippingFee: async (orderId, feeAmount) => {
      const response = await request.put(`/api/admin/orders/${orderId}/shipping-detail`, {
        data: { ...DELIVERY, feeAmount },
      });
      await expectOk(response, 'adminOrderShipping_save');
    },

    verifyFullPayment: async (attemptId, observedAmount, observedTransferReference) => {
      // The observed figures are the ones the **customer's own screen** showed,
      // passed through by the caller. The server compares them exactly, with no
      // tolerance and no rounding, so a run that invented them would be
      // asserting against its own arithmetic instead of against the obligation.
      const response = await request.post(`/api/admin/payment-attempts/${attemptId}/verify`, {
        data: {
          observedAmount,
          observedTransferReference,
          note: 'APP12-S03 disposable acceptance run — synthetic transfer, no real money moved.',
        },
      });
      await expectOk(response, 'adminPaymentAttempt_verify');
    },

    dispatch: async (orderId) => {
      const response = await request.post(`/api/admin/orders/${orderId}/dispatch`);
      await expectOk(response, 'adminOrder_dispatch');
    },

    complete: async (orderId) => {
      const response = await request.post(`/api/admin/orders/${orderId}/completion`);
      await expectOk(response, 'adminOrder_complete');
    },

    close: async () => {
      await context.close();
    },
  };
}
