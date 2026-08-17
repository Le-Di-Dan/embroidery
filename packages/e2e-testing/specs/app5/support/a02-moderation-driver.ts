/**
 * Admin request queue and detail driver (`APP5-A01`, `APP5-A02`).
 *
 * Two selector families, and the choice between them is deliberate. The queue
 * row and the dialog fields are addressed by their **accessible** names, because
 * those are the operator's own contract and an assertion on them fails when the
 * approved copy changes. The moderation controls and the evidence figures are
 * addressed by the `data-testid`s `APP5-A02` already publishes: they exist in
 * the delivered source, so using them adds no production surface, and they are
 * the only stable handle on a control whose label changes with the state it
 * offers a move from.
 *
 * Test-only.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** Approved Admin copy (source: `custom-request-detail-copy.ts`, `…queue-copy.ts`). */
export const APP5_ADMIN = {
  queuePath: '/requests',
  openRow: 'Xem chi tiết',
  reason: {
    internal: 'Lý do nội bộ (chỉ nhân viên đọc)',
    customerVisible: 'Nội dung gửi khách (khách sẽ đọc)',
    none: 'Không có',
  },
  status: { needsClarification: 'Cần làm rõ', underReview: 'Đang xem xét' },
  outcome: { successHeading: 'Đã cập nhật yêu cầu.' },
} as const;

export function createAdminRequestDriver(page: Page) {
  const detail = () => page.getByTestId('request-detail');

  return {
    openQueue: async (): Promise<void> => {
      await page.goto(APP5_ADMIN.queuePath);
      await expect(page.getByRole('table')).toBeVisible({ timeout: 20_000 });
    },

    /** The queue row for one request code, opened the way an operator opens it. */
    openRequestByCode: async (code: string): Promise<void> => {
      const link = page.getByRole('link', { name: `${APP5_ADMIN.openRow}: ${code}` });
      await expect(link).toBeVisible({ timeout: 20_000 });
      await link.click();
      await expect(detail()).toBeVisible({ timeout: 20_000 });
    },

    /** The request id this detail route is bound to, read from the URL. */
    openRequestId: () => new URL(page.url()).pathname.split('/').pop() ?? '',

    currentStatusText: () => page.getByTestId('request-detail-status').innerText(),

    evidenceFigures: (): Locator => page.getByTestId('request-evidence-item'),

    evidenceImages: (): Locator => page.getByTestId('request-evidence-image'),

    waitForEvidenceImage: async (): Promise<void> => {
      await expect(page.getByTestId('request-evidence-image').first()).toBeVisible({
        timeout: 30_000,
      });
    },

    /** `NEW → UNDER_REVIEW`: a direct action, with no justification surface. */
    startReview: async (): Promise<void> => {
      await page.getByTestId('moderation-action-start-review').click();
      await expect(page.getByTestId('moderation-success')).toBeVisible({ timeout: 20_000 });
    },

    /**
     * `UNDER_REVIEW → NEEDS_CLARIFICATION` through the approved dialog.
     *
     * Both texts are supplied and they are deliberately different strings, so a
     * later assertion can tell which of the two the customer's status page shows.
     */
    requestClarification: async (reasons: {
      internal: string;
      customerVisible: string;
      note: string;
    }): Promise<void> => {
      await page.getByTestId('moderation-action-clarify').click();
      await expect(page.getByTestId('moderation-dialog-clarify')).toBeVisible();
      await page.getByTestId('moderation-internal-reason').fill(reasons.internal);
      await page.getByTestId('moderation-customer-reason').fill(reasons.customerVisible);
      await page.getByTestId('moderation-note').fill(reasons.note);
      await page.getByTestId('moderation-submit').click();
      await expect(page.getByTestId('moderation-success')).toBeVisible({ timeout: 20_000 });
    },

    /** The two reasons of the *current* status, as the refetched detail renders them. */
    readCurrentReasons: async (): Promise<{ internal: string; customerVisible: string }> => ({
      internal: (await page.getByTestId('request-internal-reason').innerText()).trim(),
      customerVisible: (await page.getByTestId('request-customer-reason').innerText()).trim(),
    }),

    /** Every history entry's pair of reasons, oldest first. */
    readHistoryReasons: async (): Promise<{ internal: string; customerVisible: string }[]> => {
      const internals = await page.getByTestId('transition-internal-reason').allInnerTexts();
      const customers = await page.getByTestId('transition-customer-reason').allInnerTexts();
      return internals.map((internal, index) => ({
        internal: internal.trim(),
        customerVisible: (customers[index] ?? '').trim(),
      }));
    },

    detailText: () => detail().innerText(),
  };
}
