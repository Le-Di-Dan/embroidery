/**
 * Storefront S01 contact-verification driver (E01-H02).
 *
 * Selectors are accessible ones — roles, labels and the approved Vietnamese copy
 * — never CSS classes and never ids. The form's ids come from React `useId()`,
 * so they are generated per render and are not a stable contract; the label and
 * the button name are. No production test id was added, and none was needed.
 *
 * Copy is duplicated here as a test expectation on purpose, exactly as the APP1
 * E01 helpers duplicate the approved login copy: the assertion must fail when
 * the approved wording changes, which is only true if the expectation is written
 * down rather than imported from the source it is checking.
 *
 * The synthetic contact and the delivered code pass through this driver because
 * the customer types them. Neither is ever logged, and no operation returns the
 * code.
 *
 * Test-only.
 */
import { expect, type Page } from '@playwright/test';

/** Approved S01 copy (source: storefront `verification-copy.ts`). */
export const S01 = {
  path: '/xac-minh-lien-he',
  contactTitle: 'Xác minh liên hệ của bạn',
  kindEmail: 'Email',
  kindPhone: 'Số điện thoại',
  emailLabel: 'Email',
  phoneLabel: 'Số điện thoại',
  submitContact: 'Gửi mã xác minh',
  codeTitle: 'Nhập mã xác minh',
  codeLabel: 'Mã xác minh (6 chữ số)',
  submitCode: 'Xác minh',
  resend: 'Gửi lại mã',
  successTitle: 'Đã xác minh liên hệ',
  mismatchAlert: 'Mã không đúng. Hãy kiểm tra lại mã trong tin nhắn mới nhất.',
  expiredTitle: 'Mã đã hết hạn',
  lockedTitle: 'Đã hết lượt thử cho mã này',
} as const;

export type ContactKind = 'EMAIL' | 'PHONE';

export function createS01Driver(page: Page) {
  const kindLabel = (kind: ContactKind): string =>
    kind === 'EMAIL' ? S01.kindEmail : S01.kindPhone;

  return {
    openVerification: async (): Promise<void> => {
      await page.goto(S01.path);
      await expect(page.getByRole('heading', { name: S01.contactTitle })).toBeVisible();
    },

    /** The contact-kind control is one radio group covering both kinds. */
    chooseContactKind: (kind: ContactKind) =>
      page.getByRole('radio', { name: kindLabel(kind), exact: true }).check(),

    enterContact: (kind: ContactKind, value: string) =>
      page.getByLabel(kindLabel(kind), { exact: true }).fill(value),

    submitContact: () => page.getByRole('button', { name: S01.submitContact }).click(),

    waitForCodeEntry: () =>
      expect(page.getByRole('heading', { name: S01.codeTitle })).toBeVisible(),

    enterCode: (code: string) => page.getByLabel(S01.codeLabel).fill(code),

    submitCode: () => page.getByRole('button', { name: S01.submitCode }).click(),

    waitForSuccess: () =>
      expect(page.getByRole('heading', { name: S01.successTitle })).toBeVisible(),

    clickResend: () => page.getByRole('button', { name: S01.resend }).click(),

    /**
     * The masked destination the code-entry card shows.
     *
     * Returned so a suite can assert it is *masked* — never compared against the
     * raw contact, which would put the contact in the assertion.
     */
    readMaskedDestination: async (): Promise<string> => {
      const region = page.getByRole('heading', { name: S01.codeTitle }).locator('..');
      return (await region.innerText()).trim();
    },

    /** Which S01 state is on screen, by approved heading. Never reads a value. */
    readVisibleVerificationState: async (): Promise<string> => {
      const states: Array<[string, string]> = [
        ['CONTACT_ENTRY', S01.contactTitle],
        ['CODE_ENTRY', S01.codeTitle],
        ['SUCCESS', S01.successTitle],
        ['EXPIRED', S01.expiredTitle],
        ['LOCKED', S01.lockedTitle],
      ];
      for (const [name, heading] of states) {
        if (
          await page
            .getByRole('heading', { name: heading })
            .isVisible()
            .catch(() => false)
        ) {
          return name;
        }
      }
      return 'UNKNOWN';
    },

    isMismatchAlertVisible: () =>
      page.getByRole('alert').filter({ hasText: S01.mismatchAlert }).isVisible(),
  };
}
