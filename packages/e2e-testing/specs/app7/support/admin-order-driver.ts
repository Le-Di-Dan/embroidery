/**
 * Admin `/orders` → `/orders/{orderId}` driver for the `APP7-E01` run.
 *
 * Unlike the Storefront route, `APP7-A01` ships a deliberate `data-testid`
 * surface for exactly the values an operator's decision turns on — the expected
 * amount and reference, each attempt's status, the two dialogs, the outcome
 * banner. Those are used here, because they are the delivered contract for this
 * workspace and a class selector would not be. Everything else is addressed by
 * role and by the approved copy, transcribed rather than imported for the same
 * reason the Storefront driver transcribes it.
 *
 * Nothing here bypasses a guard: the Admin session comes from a real login
 * through the real form (`loginAsAdmin`), and every value typed below is typed
 * into the delivered dialog.
 *
 * Test-only.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** Approved `APP7-D01` Admin copy (source: admin `order-detail-copy.ts`). */
export const ADMIN_ORDER = {
  queuePath: '/orders',
  detailPath: (orderId: string) => `/orders/${orderId}`,
  depositSection: 'Tiền cọc (DEPOSIT)',
  attemptsSection: 'Các lần thanh toán',
  evidenceSection: 'Ảnh giao dịch khách gửi',
  actionsSection: 'Hành động đối chiếu',
  historySection: 'Lịch sử đối chiếu',
  itemsSection: 'Dòng hàng (OrderItem) — đông cứng',
  frozenFactsSection: 'Dữ kiện đơn hàng — đông cứng',
  verifyAction: 'Xác nhận đã nhận tiền cọc',
  reviewAction: 'Đưa vào cần đối chiếu',
  verifyDialogTitle: 'Xác nhận đã nhận tiền cọc',
  amountLabel: 'Số tiền thực nhận',
  referenceLabel: 'Nội dung/ghi chú chuyển khoản thực nhận',
  noteLabel: 'Ghi chú của nhân viên',
  successTitle: 'Đã xác nhận tiền cọc',
  reviewOutcomeTitle: 'Đã chuyển giao dịch sang cần đối chiếu',
  reviewOutcomeBody:
    'Máy chủ đã ghi nhận thành công. Đây là một kết quả nghiệp vụ, KHÔNG phải lỗi hệ thống',
  evidencePreview: 'Xem ảnh',
  evidenceEmpty: 'Khách chưa gửi ảnh giao dịch',
  settledNote: 'Tiền cọc của đơn hàng này đã được xác nhận.',
  orderAwaitingDeposit: 'Chờ đặt cọc',
  orderDepositPaid: 'Đã xác nhận cọc',
  depositPending: 'Chưa thu',
  depositSatisfied: 'Đã thu đủ',
  attemptPending: 'chờ đối chiếu',
  attemptSucceeded: 'thành công',
  attemptRequiresReview: 'cần đối chiếu',
} as const;

export function createAdminOrderDriver(page: Page) {
  const byId = (id: string): Locator => page.getByTestId(id);
  /**
   * The value half of one `DefinitionRow`.
   *
   * The test id sits on the wrapper holding both `<dt>` and `<dd>`, so reading
   * the wrapper would return "label + value" and an exact comparison against a
   * rendered amount would never match.
   */
  const valueOf = async (id: string): Promise<string> =>
    (await byId(id).locator('dd').innerText()).trim();

  return {
    openQueue: async (): Promise<void> => {
      await page.goto(ADMIN_ORDER.queuePath);
      await expect(byId('order-queue-table')).toBeVisible();
    },

    queueRows: () => byId('order-queue-row'),

    /** Opens the one queue row whose visible text carries this order code. */
    openOrderFromQueue: async (orderCode: string): Promise<void> => {
      const row = byId('order-queue-row').filter({ hasText: orderCode });
      await expect(row).toHaveCount(1);
      await row.getByRole('link').first().click();
      await expect(byId('order-detail-code')).toContainText(orderCode);
    },

    openOrderDirect: async (orderId: string): Promise<void> => {
      await page.goto(ADMIN_ORDER.detailPath(orderId));
      await expect(byId('order-detail-code')).toBeVisible();
    },

    waitForPaymentPanel: () => expect(byId('order-payment-panel')).toBeVisible(),

    readOrderCode: (): Promise<string> => valueOf('order-detail-code'),
    /**
     * The two status badges, read as their whole rendered text.
     *
     * A badge is a `<span>` carrying an `aria-hidden` symbol and the label, not
     * a `DefinitionRow`, so this returns "symbol + label" and callers compare
     * with `toContain`. Matching on the label alone is the point: the symbol is
     * decoration and the label is the vocabulary `751:3` governs.
     */
    readOrderStatus: async (): Promise<string> =>
      (await byId('order-detail-status').innerText()).trim(),
    readDepositStatus: async (): Promise<string> =>
      (await byId('deposit-status').innerText()).trim(),
    readExpectedAmount: (): Promise<string> => valueOf('deposit-expected-amount'),
    readExpectedReference: (): Promise<string> => valueOf('deposit-expected-reference'),

    attempts: () => byId('order-attempt'),
    attemptStatuses: () => byId('attempt-status'),
    evidenceItems: () => byId('order-evidence-item'),
    evidenceEmpty: () => byId('order-evidence-empty'),
    historyRows: () => byId('order-history-row'),
    orderItemRows: () => byId('order-item-row'),

    /**
     * Fills and submits the delivered verify dialog.
     *
     * The observed fields are deliberately empty when the dialog opens (`741:*`
     * forbids pre-filling them with the expectation), so every value here is one
     * the run types, which is the whole point of the comparison.
     */
    verifyDeposit: async (observed: {
      amount: string;
      reference: string;
      note: string;
    }): Promise<void> => {
      await byId('open-verify-dialog').click();
      await expect(byId('verify-dialog')).toBeVisible();
      await byId('verify-observed-amount').fill(observed.amount);
      await byId('verify-observed-reference').fill(observed.reference);
      await byId('verify-note').fill(observed.note);
      await byId('verify-submit').click();
    },

    /** The durable business outcome, by its own attribute rather than by copy. */
    waitForOutcome: async (kind: 'verified' | 'requiresReview'): Promise<void> => {
      await expect(byId('payment-outcome')).toBeVisible({ timeout: 30_000 });
      await expect(byId('payment-outcome')).toHaveAttribute('data-outcome', kind);
    },

    outcome: () => byId('payment-outcome'),
    outcomeAttempt: () => byId('outcome-attempt'),
    outcomeDeposit: () => byId('outcome-deposit'),
    outcomeOrder: () => byId('outcome-order'),
    outcomeReplayed: () => byId('payment-outcome-replayed'),
    failureBanner: () => byId('payment-failed'),

    /** Opens one accepted evidence image through the B06 private delivery. */
    openEvidencePreview: async (index = 0): Promise<void> => {
      await byId('order-evidence-item')
        .nth(index)
        .getByRole('button', { name: ADMIN_ORDER.evidencePreview })
        .click();
      await expect(byId('evidence-preview-dialog')).toBeVisible();
    },

    previewImage: () => byId('evidence-preview-image'),
    previewState: () => byId('evidence-preview-state'),
    closePreview: () => byId('evidence-preview-close').click(),

    readPageText: async (): Promise<string> => (await page.locator('body').innerText()).trim(),
  };
}
