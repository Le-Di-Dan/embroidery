/**
 * Storefront custom-request driver (`APP5-S01`, `APP5-S02`).
 *
 * Accessible selectors only — roles, labels and the approved Vietnamese copy —
 * never a CSS class and never a generated id. As in the APP4 drivers, the copy
 * is written down here as a *test expectation* rather than imported from the
 * source it checks: an assertion that reads its own expectation from the code
 * under test cannot fail when that code changes.
 *
 * The embedded verification step is `APP4`'s own component rendered inside
 * `APP5`'s step 2, so its controls are driven through the existing
 * `createS01Driver` (APP4) rather than re-described here. This driver owns only
 * what `APP5` added.
 *
 * Test-only.
 */
import { expect, type Page } from '@playwright/test';

/** Approved APP5 copy (source: storefront `custom-request-copy.ts`). */
export const APP5_S01 = {
  path: '/yeu-cau/moi',
  pageTitle: 'Gửi yêu cầu thêu riêng',
  chooser: {
    catalog: 'Sản phẩm của cửa hàng',
    customerOwned: 'Sản phẩm bạn đã có sẵn',
  },
  catalog: {
    variantLegend: 'Chọn phiên bản bạn muốn đặt',
    sessionMissing: 'Chúng tôi không tìm thấy bản thiết kế nào cho sản phẩm này trên trình duyệt.',
  },
  customerOwned: { nameLabel: 'Tên món đồ' },
  quantity: { quantityLabel: 'Số lượng' },
  steps: { continueToVerify: 'Tiếp tục để xác minh liên hệ' },
  verification: { verified: 'Đã xác minh email. Bạn có thể tiếp tục bước 3.' },
  upload: {
    chooseCopImage: 'Chọn ảnh món đồ',
    accepted: 'Đã duyệt',
    inspecting: 'Đang kiểm tra ảnh…',
  },
  submit: { action: 'Gửi yêu cầu' },
} as const;

/** Approved `APP5-S02` confirmation copy (source: `custom-request-confirmation-copy.ts`). */
export const APP5_S02 = {
  path: '/yeu-cau/da-gui',
  title: 'Đã nhận yêu cầu của bạn',
  contactNotice: 'Chúng tôi đã gửi liên kết theo dõi tới liên hệ bạn đã xác minh',
} as const;

/** Approved secure-status copy (source: `custom-request-status-copy.ts`). */
export const APP5_STATUS = {
  needsClarificationBadge: 'Cần bổ sung thông tin',
  reasonTitle: 'Xưởng cần bạn làm rõ',
  reasonNote:
    'Đây là nội dung xưởng viết riêng để gửi cho bạn. Ghi chú nội bộ của xưởng không hiển thị ở đây.',
} as const;

export function createRequestDriver(page: Page) {
  return {
    /**
     * The entry point the pre-E01 audit wired: the approved shell nav item, not
     * a typed URL. Opening `/yeu-cau/moi` directly would prove the route exists
     * and say nothing about whether a customer can reach it.
     */
    openThroughNavigation: async (): Promise<void> => {
      await page.goto('/');
      await page.getByRole('link', { name: 'Đặt thêu', exact: true }).first().click();
      await expect(page.getByRole('heading', { name: APP5_S01.pageTitle })).toBeVisible();
    },

    /** A direct visit, for the catalog branch which arrives with a placement. */
    openWithCatalogContext: async (query: {
      productSlug: string;
      sideCode: string;
      areaCode: string;
    }): Promise<void> => {
      const params = new URLSearchParams({
        'san-pham': query.productSlug,
        mat: query.sideCode,
        vung: query.areaCode,
      });
      await page.goto(`${APP5_S01.path}?${params.toString()}`);
      await expect(page.getByRole('heading', { name: APP5_S01.pageTitle })).toBeVisible();
    },

    currentPath: () => new URL(page.url()).pathname,

    /**
     * The chooser radio, matched on a *substring* of its accessible name.
     *
     * The approved option is a `<label>` wrapping the input, its title and its
     * hint, so the accessible name is the title **and** the hint sentence. An
     * exact match would therefore have to restate the hint, which would make
     * this driver assert two pieces of copy where it means to select one
     * control. The two option titles share no prefix, so a substring is
     * unambiguous.
     */
    chooseSubject: (subject: 'CATALOG' | 'CUSTOMER_OWNED') =>
      page
        .getByRole('radio', {
          name: subject === 'CATALOG' ? APP5_S01.chooser.catalog : APP5_S01.chooser.customerOwned,
        })
        .check({ force: true }),

    fillItemName: (value: string) =>
      page.getByLabel(APP5_S01.customerOwned.nameLabel, { exact: true }).fill(value),

    /**
     * The first quantity line; the screen starts with exactly one.
     *
     * Addressed by role, not by label: the quantity *section* carries the same
     * word as its field's label (`aria-label="Số lượng"`), so a label lookup
     * resolves the section first and fails on an element that is not an input.
     * The role is what distinguishes the control from the region around it.
     */
    fillQuantity: (value: string) =>
      page
        .getByRole('textbox', { name: APP5_S01.quantity.quantityLabel, exact: true })
        .first()
        .fill(value),

    /** Every selectable variant, in the order `APP5-B07` returned them. */
    variantRadios: () =>
      page.getByRole('group', { name: APP5_S01.catalog.variantLegend }).getByRole('radio'),

    chooseVariantAt: (index: number) =>
      page
        .getByRole('group', { name: APP5_S01.catalog.variantLegend })
        .getByRole('radio')
        .nth(index)
        .check({ force: true }),

    isSessionMissingVisible: () =>
      page
        .getByText(APP5_S01.catalog.sessionMissing)
        .isVisible()
        .catch(() => false),

    continueToVerification: () =>
      page.getByRole('button', { name: APP5_S01.steps.continueToVerify }).click(),

    /**
     * The embedded verification's submit control, matched **exactly**.
     *
     * `APP4`'s own driver matches this button by substring, which is
     * unambiguous on `/xac-minh-lien-he` and ambiguous here: `APP5-S01` wraps
     * the same card in a step rail whose step-2 button is named *"Bước 2 — Xác
     * minh liên hệ"*, so a substring match resolves both. The collision is a
     * property of the composition — exactly the kind of thing only a
     * cross-layer run sees — and it is answered here rather than by loosening
     * the APP4 driver, which is correct on its own route.
     */
    submitVerificationCode: () =>
      page.getByRole('button', { name: 'Xác minh', exact: true }).click(),

    /**
     * Verification is complete when **step 3 is on screen**, not when a notice
     * appears.
     *
     * `APP5-S01` retains the verified challenge id and the rail advances by
     * itself, so the *"Đã xác minh email"* line — which the step-2 card shows
     * a customer who navigates back — is never rendered on the forward path.
     * Waiting for it would be waiting for a state the happy path skips.
     */
    waitForUploadStep: () =>
      expect(page.getByRole('region', { name: 'Ảnh món đồ của bạn' })).toBeVisible({
        timeout: 20_000,
      }),

    /** The step-2 confirmation, seen only by a customer who navigates back. */
    verifiedNotice: () => page.getByText(APP5_S01.verification.verified),

    /**
     * Step 3 on the catalog branch, which has no item-photo uploader: the
     * design is the subject, so the only proof step 3 is reachable is its own
     * submit control.
     */
    waitForSubmitStep: () =>
      expect(page.getByRole('button', { name: APP5_S01.submit.action, exact: true })).toBeVisible({
        timeout: 20_000,
      }),

    /**
     * Adds one file to the customer-owned-image uploader.
     *
     * `setInputFiles` with an in-memory buffer, so the fixture image never
     * touches the disk and the browser sends the same bytes the run generated.
     */
    attachItemPhoto: (file: { name: string; mimeType: string; buffer: Buffer }) =>
      page
        .getByLabel(APP5_S01.upload.chooseCopImage, { exact: true })
        .setInputFiles({ name: file.name, mimeType: file.mimeType, buffer: file.buffer }),

    /** The upload tile's own status text — the screen's word, not a network guess. */
    waitForPhotoAccepted: (timeout = 60_000) =>
      expect(page.getByText(APP5_S01.upload.accepted).first()).toBeVisible({ timeout }),

    isPhotoInspecting: () =>
      page
        .getByText(APP5_S01.upload.inspecting)
        .first()
        .isVisible()
        .catch(() => false),

    submit: () => page.getByRole('button', { name: APP5_S01.submit.action, exact: true }).click(),

    waitForConfirmation: async (): Promise<void> => {
      await page.waitForURL(new RegExp(`${APP5_S02.path}\\?`), { timeout: 30_000 });
      await expect(page.getByRole('heading', { name: APP5_S02.title })).toBeVisible();
    },

    /**
     * The request code as the customer reads it.
     *
     * Taken from the URL's `ma` parameter, which is what `APP5-S01` hands over
     * and what the confirmation renders; the screen is asserted to contain the
     * same string, so this cannot report a code the customer never saw.
     */
    readConfirmedCode: async (): Promise<string> => {
      const code = new URL(page.url()).searchParams.get('ma') ?? '';
      expect(code).not.toBe('');
      await expect(page.getByText(code, { exact: false }).first()).toBeVisible();
      return code;
    },
  };
}
