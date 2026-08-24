/**
 * Storefront `/truy-cap/thanh-toan` driver for the `APP7-E01` acceptance run.
 *
 * Selectors are accessible ones — roles, labels and the approved Vietnamese copy
 * — never CSS classes and never generated ids, exactly as the APP4 and APP5 E01
 * drivers are written. The secure-deposit feature ships **no** `data-testid`, so
 * the approved wording *is* the contract here, and it is transcribed rather than
 * imported: an assertion must fail when the approved copy changes, which is only
 * true if the expectation is written down rather than read out of the source it
 * is checking.
 *
 * The raw secure-link token passes through {@link openDepositLink} because the
 * customer's browser carries it in the URL fragment. It is never logged, never
 * put in an assertion message and never written to an artifact.
 *
 * Test-only.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** Approved `APP7-D01` copy (source: storefront `secure-deposit-copy.ts`). */
export const DEPOSIT = {
  path: '/truy-cap/thanh-toan',
  /** `747:3` — the order exists, no attempt has been opened. */
  preAttemptBadge: 'Chưa bắt đầu chuyển khoản',
  summaryTitle: 'Tóm tắt đơn hàng',
  startTitle: 'Sẵn sàng chuyển khoản?',
  startAction: 'Lấy thông tin chuyển khoản',
  /** `745:3` — instructions, QR and the waiting truth. */
  instructionsTitle: 'Đặt cọc đơn hàng',
  waitingBadge: 'Chờ xác nhận tiền cọc',
  transferPanelTitle: 'Thông tin chuyển khoản',
  amountLabel: 'SỐ TIỀN CẦN CHUYỂN',
  referenceLabel: 'NỘI DUNG CHUYỂN KHOẢN — VUI LÒNG GHI ĐÚNG',
  bankLabel: 'Ngân hàng',
  accountNumberLabel: 'Số tài khoản',
  accountNameLabel: 'Chủ tài khoản',
  waitingTitle: 'Bạn đã chuyển khoản rồi?',
  waitingNoButton:
    'Trang này không có nút “Tôi đã chuyển khoản”, vì hệ thống không có cách nào tự kiểm chứng điều đó.',
  qrTitle: 'Quét mã để chuyển nhanh',
  qrDownload: 'Tải mã QR',
  /** `745:365` — the prominent, explicitly optional reminder. */
  reminderHeadline: 'Sau khi chuyển khoản, hãy chụp màn hình giao dịch thành công',
  reminderOptional: 'Không bắt buộc. Ảnh giao dịch không tự động xác nhận thanh toán',
  /** `748:*` — the evidence panel. */
  evidenceTitle: 'Ảnh giao dịch',
  evidenceOptionalBadge: 'không bắt buộc',
  evidenceChoose: 'Chọn ảnh',
  evidenceMore: 'Tải thêm ảnh',
  evidenceConstraints:
    'JPG, PNG hoặc WebP · tối đa 10 MB mỗi ảnh · tối đa 5 ảnh cho mỗi lần thanh toán',
  evidenceNotPaymentNote:
    'Đây là trạng thái của ẢNH, không phải của thanh toán. Tiền cọc của bạn vẫn đang chờ cửa hàng xác nhận',
  evidenceInspecting: 'Đang kiểm tra ảnh',
  evidenceAccepted: 'Ảnh đã được tiếp nhận',
  /** `749:3` — the attempt is being reconciled. */
  reviewBadge: 'Đang đối chiếu',
  reviewTitle: 'Giao dịch đang được cửa hàng đối chiếu',
  /** `749:50` — the one authoritative success on this route. */
  confirmedTitle: 'Đã xác nhận tiền cọc',
  confirmedLead: 'Cửa hàng đã nhận được tiền cọc của bạn và xác nhận thành công.',
  confirmedOrderBadge: 'Đơn hàng: Đã xác nhận cọc',
  confirmedDepositBadge: 'Tiền cọc: Đã thu đủ',
  /** `749:90` — sentences this route may never say. */
  forbiddenAfterConfirmation: ['đang sản xuất', 'đã giao', 'giữ hàng', 'đã hoàn tất'],
  /** `747:41` — step-up runs over the page, never as a navigation. */
  stepUpTitle: 'Xác minh lại danh tính',
} as const;

/** Approved APP4 secure-link shell copy, reused by this route (`753:179`). */
export const SHELL = {
  unavailableTitle: 'Liên kết không mở được',
} as const;

export function createDepositDriver(page: Page) {
  const heading = (name: string, level: 1 | 2 = 2): Locator =>
    page.getByRole('heading', { name, level });

  /**
   * One rendered value, collapsed to single spaces.
   *
   * The approved layout puts the amount and its currency in two `<span>`s, so
   * `innerText` returns them on separate lines — the *visual* value is
   * "1.166.667 VND" and the raw text is not. Normalising here keeps every call
   * site comparing what the customer reads rather than how it is marked up.
   */
  const readValue = async (locator: Locator): Promise<string> =>
    (await locator.innerText()).replace(/\s+/g, ' ').trim();

  return {
    /**
     * Opens the secure payment route with the credential in the URL fragment.
     *
     * `#t=` is the exact carrier `APP4-W01` writes and `APP4-S02` reads. The
     * bootstrap strips it before the first request, so this navigation is the
     * only place the token is ever in the address bar.
     */
    openDepositLink: async (rawToken: string): Promise<void> => {
      await page.goto(`${DEPOSIT.path}#t=${rawToken}`);
    },

    /** Waits for the authorized branch, whichever panel it renders. */
    waitForAuthorized: () =>
      expect(page.getByRole('heading', { level: 1 })).toHaveText(
        new RegExp(`${DEPOSIT.instructionsTitle}|${DEPOSIT.confirmedTitle}`),
      ),

    waitForPreAttempt: () => expect(heading(DEPOSIT.startTitle)).toBeVisible(),

    /** The order code as the customer reads it, from the summary list. */
    readOrderCode: async (): Promise<string> => {
      const row = page.getByRole('term').filter({ hasText: 'Mã đơn hàng' }).first();
      return readValue(row.locator('xpath=following-sibling::dd[1]'));
    },

    /** The deposit figure the pre-attempt summary shows, e.g. `1.166.667 VND`. */
    readSummaryDeposit: async (): Promise<string> => {
      const row = page.getByRole('term').filter({ hasText: 'Số tiền đặt cọc' }).first();
      return readValue(row.locator('xpath=following-sibling::dd[1]'));
    },

    startAttempt: () => page.getByRole('button', { name: DEPOSIT.startAction }).click(),

    waitForStepUp: () => expect(heading(DEPOSIT.stepUpTitle)).toBeVisible(),

    waitForInstructions: async (): Promise<void> => {
      await expect(heading(DEPOSIT.transferPanelTitle)).toBeVisible();
      await expect(page.getByText(DEPOSIT.waitingBadge).first()).toBeVisible();
    },

    /** The exact amount hero, as rendered beside its approved label. */
    readTransferAmount: async (): Promise<string> => {
      const label = page.getByText(DEPOSIT.amountLabel, { exact: true });
      return readValue(label.locator('xpath=following-sibling::*[1]'));
    },

    readTransferReference: async (): Promise<string> => {
      const label = page.getByText(DEPOSIT.referenceLabel, { exact: true });
      return readValue(label.locator('xpath=following-sibling::*[1]'));
    },

    readBankFact: async (label: string): Promise<string> => {
      const row = page.getByRole('term').filter({ hasText: label }).first();
      return readValue(row.locator('xpath=following-sibling::dd[1]'));
    },

    qrImage: () => page.getByRole('img', { name: /Mã QR chuyển khoản đặt cọc/ }),

    waitForQr: () =>
      expect(page.getByRole('img', { name: /Mã QR chuyển khoản đặt cọc/ })).toBeVisible(),

    evidenceReminder: () => page.getByText(DEPOSIT.reminderHeadline),

    /**
     * The evidence file input, addressed through its own label.
     *
     * The control is a real `<input type="file">`; `setInputFiles` drives it the
     * way the customer's file chooser does, and the upload that follows is the
     * delivered `APP7-B05` multipart request with nothing intercepted.
     */
    submitEvidence: async (file: {
      name: string;
      mimeType: string;
      buffer: Buffer;
    }): Promise<void> => {
      await page.getByLabel(DEPOSIT.evidenceConstraints).setInputFiles(file);
    },

    /**
     * The customer tabs away and comes back.
     *
     * The one gesture that makes an already-finished inspection visible on this
     * screen, and a real one: `APP7-S01` deliberately does **not** poll — there
     * is no interval, no socket and no "check again" button anywhere in the
     * feature — so an image submitted a moment ago still reads *đang kiểm tra*
     * until something refetches. TanStack's focus manager listens for
     * `visibilitychange`, which is exactly what a customer produces by leaving
     * the tab while they wait and returning to it. Nothing here calls an API, and
     * no query is refetched by the harness itself.
     *
     * The event is dispatched on `window`, not on `document`: TanStack's focus
     * manager listens there, and a manually constructed `Event` does not bubble,
     * so a `document` dispatch is delivered to nothing at all.
     */
    returnToTab: () =>
      page.evaluate(() => {
        for (const state of ['hidden', 'visible']) {
          Object.defineProperty(document, 'visibilityState', {
            value: state,
            configurable: true,
          });
          window.dispatchEvent(new Event('visibilitychange'));
          document.dispatchEvent(new Event('visibilitychange'));
        }
      }),

    waitForEvidenceAccepted: () =>
      expect(page.getByText(DEPOSIT.evidenceAccepted).first()).toBeVisible({ timeout: 30_000 }),

    waitForEvidenceInspecting: () =>
      expect(page.getByText(DEPOSIT.evidenceInspecting).first()).toBeVisible({ timeout: 30_000 }),

    waitForConfirmed: () =>
      expect(page.getByRole('heading', { name: DEPOSIT.confirmedTitle, level: 1 })).toBeVisible(),

    waitForReview: () => expect(heading(DEPOSIT.reviewTitle)).toBeVisible(),

    /** The whole rendered page text, for the forbidden-sentence sweep. */
    readPageText: async (): Promise<string> => (await page.locator('body').innerText()).trim(),
  };
}
