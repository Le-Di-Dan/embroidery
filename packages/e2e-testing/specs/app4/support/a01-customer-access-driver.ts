/**
 * Admin A01 customer-access support driver (E01-H02).
 *
 * Accessible selectors and the approved Vietnamese copy (source: admin
 * `customer-access-copy.ts`), duplicated here as a test expectation for the same
 * reason the S01 driver duplicates its own.
 *
 * Authentication is **not** handled here. It reuses the accepted APP1 E01
 * mechanism — a real login through the real form against a bootstrap Admin —
 * because that is the accepted path and no guard may be disabled or bypassed
 * with an injected cookie.
 *
 * Replay and revoke outcomes are read from what the application publishes
 * (`CREATED`, `EXISTING`, `REISSUE_REQUIRED`); this driver never infers one
 * locally from a status code or a timing, because the point of `E01-16` and
 * `E01-17` is which outcome the server chose.
 *
 * Test-only.
 */
import { expect, type Page } from '@playwright/test';

/** Approved A01 copy (source: admin `customer-access-copy.ts`). */
export const A01 = {
  path: '/support/customer-access',
  title: 'Hỗ trợ truy cập khách hàng',
  lookupHeading: 'Tra cứu khách hàng',
  kindLabel: 'Loại liên hệ',
  kindEmail: 'EMAIL',
  kindPhone: 'PHONE',
  contactLabel: 'Email hoặc số điện thoại',
  lookupSubmit: 'Tra cứu',
  customerHeading: 'Khách hàng & liên hệ',
  grantHeading: 'Quyền truy cập an toàn',
  revokeTitle: 'Thu hồi quyền truy cập?',
  revokeReasonLabel: 'Lý do thu hồi',
  revokeConfirm: 'Thu hồi',
  notificationHeading: 'Gửi thông báo',
  replayTitle: 'Gửi lại thông báo này?',
  replayConfirm: 'Gửi lại',
} as const;

/** The authoritative outcomes the server publishes; never inferred locally. */
export const REPLAY_OUTCOME = ['CREATED', 'EXISTING', 'REISSUE_REQUIRED'] as const;
export type ReplayOutcome = (typeof REPLAY_OUTCOME)[number];

export function createA01Driver(page: Page) {
  const contactField = () => page.getByLabel(A01.contactLabel, { exact: true });

  return {
    openCustomerAccessSupport: async (): Promise<void> => {
      await page.goto(A01.path);
      await expect(page.getByRole('heading', { name: A01.lookupHeading })).toBeVisible();
    },

    lookupCustomer: async (kind: 'EMAIL' | 'PHONE', contact: string): Promise<void> => {
      await page
        .getByRole('radio', { name: kind === 'EMAIL' ? A01.kindEmail : A01.kindPhone, exact: true })
        .check();
      await contactField().fill(contact);
      await page.getByRole('button', { name: A01.lookupSubmit }).click();
    },

    waitForCustomerLoaded: () =>
      expect(page.getByRole('heading', { name: A01.customerHeading })).toBeVisible(),

    /**
     * Whether the raw contact the operator typed was cleared after resolution.
     *
     * Returns a boolean, not the field value: the draft under test *is* the raw
     * contact, so returning it would defeat the check.
     */
    isLookupDraftCleared: async (): Promise<boolean> => (await contactField().inputValue()) === '',

    /** The masked contacts region text, for a "is masked" assertion. */
    readMaskedContacts: async (): Promise<string> =>
      (
        await page
          .getByRole('region', { name: A01.customerHeading })
          .innerText()
          .catch(async () =>
            page.getByRole('heading', { name: A01.customerHeading }).locator('..').innerText(),
          )
      ).trim(),

    readGrantState: async (): Promise<string> =>
      (
        await page.getByRole('heading', { name: A01.grantHeading }).locator('..').innerText()
      ).trim(),

    openRevokeDialog: () => page.getByRole('button', { name: A01.revokeConfirm }).first().click(),

    enterRevokeReason: (reason: string) =>
      page.getByRole('dialog').getByLabel(A01.revokeReasonLabel).fill(reason),

    confirmRevoke: () =>
      page.getByRole('dialog').getByRole('button', { name: A01.revokeConfirm }).click(),

    waitForRevokeOutcome: () => expect(page.getByRole('dialog')).toBeHidden(),

    readTerminalNotification: async (): Promise<string> =>
      (
        await page.getByRole('heading', { name: A01.notificationHeading }).locator('..').innerText()
      ).trim(),

    openReplayDialog: () => page.getByRole('button', { name: A01.replayConfirm }).first().click(),

    confirmReplay: () =>
      page.getByRole('dialog').getByRole('button', { name: A01.replayConfirm }).click(),

    waitForReplayOutcome: () => expect(page.getByRole('dialog')).toBeHidden(),

    /**
     * Reads whichever authoritative outcome the page is showing.
     *
     * Matches only the published vocabulary, and returns `UNKNOWN` rather than
     * guessing — an inferred outcome would make `E01-16`/`E01-17` unfalsifiable.
     */
    readReplayOutcome: async (): Promise<ReplayOutcome | 'UNKNOWN'> => {
      const text = await page.locator('body').innerText();
      return REPLAY_OUTCOME.find((outcome) => text.includes(outcome)) ?? 'UNKNOWN';
    },

    /** The page stayed on the support route — revoke/replay never navigate away. */
    isStillOnSupportRoute: (): boolean => new URL(page.url()).pathname === A01.path,
  };
}
