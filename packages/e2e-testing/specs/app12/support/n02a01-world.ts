/**
 * The shared world for the `APP12-N02.A01` Admin sellability acceptance run.
 *
 * Everything here is **test-only** and every write lands in the run's
 * disposable database, which the orchestrator drops afterwards. No shared
 * development database is touched and no `APP12-G03` dataset is created.
 *
 * ## The copy is transcribed, not imported
 *
 * The Vietnamese below is transcribed from the approved frames
 * (`FIG-APPROVAL-APP12-N02-D01-PO-001`) rather than imported from
 * `packages/i18n`. That is deliberate and is what makes the assertions worth
 * making: a suite that read the same JSON the application renders would agree
 * with any wording, including a wrong one. Here, a copy change that departs
 * from the approved design fails the run.
 *
 * ## Every sellability write goes through the UI
 *
 * There is no SQL helper here that inserts a variant or a SKU, and that is the
 * point of the package: the acceptance claim is that an operator can make a
 * Ready-Made Product sellable through the Admin, so a fixture that wrote one
 * directly would prove the fixture. The world's only job is to seat the
 * operator in front of the screen.
 *
 * Never imported by application code.
 */
import { expect, type Locator, type Page } from '@playwright/test';

const LOGIN = {
  emailInput: '#staff-login-email',
  passwordInput: '#staff-login-password',
  submitName: 'Đăng nhập',
  logoutName: 'Đăng xuất',
} as const;

/** Every operator string this run asserts, transcribed from the approved frames. */
export const COPY = {
  sectionTitle: 'Phiên bản & SKU',
  emptyTitle: 'Chưa có phiên bản nào',
  addVariant: 'Thêm phiên bản',
  addSku: 'Thêm SKU',
  expand: 'Xem SKU',
  editVariant: 'Sửa',
  deactivateVariant: 'Ngừng hoạt động',
  reactivateVariant: 'Hoạt động lại',
  deactivateSku: 'Ngừng bán',
  reactivateSku: 'Bán lại',
  manageStock: 'Quản lý tồn kho',
  activeBadge: 'Đang hoạt động',
  sellingBadge: 'Đang bán',
  notSellingBadge: 'Ngừng bán',
  noOrderEligibleSku: 'Chưa có SKU nào đang bán — phiên bản này chưa thể đặt hàng',

  colorLabel: 'Màu sắc',
  sizeLabel: 'Kích thước',
  skuCodeLabel: 'Mã SKU',
  priceOverrideOption: 'Đặt giá riêng cho SKU',
  priceOverrideLabel: 'Giá riêng (₫)',
  activeLabel: 'Đang hoạt động',
  sellingLabel: 'Đang bán',
  submitCreateVariant: 'Tạo phiên bản',
  submitEditVariant: 'Lưu phiên bản',
  submitCreateSku: 'Tạo SKU',
  submitEditSku: 'Lưu SKU',
  cancel: 'Huỷ',

  labelRequired: 'Cần nhập ít nhất màu sắc hoặc kích thước.',
  duplicateTitle: 'Phiên bản đã tồn tại',
  ambiguousTitle: 'Phiên bản đã có một SKU đang bán',
  noAutoDeactivate: 'Hệ thống sẽ không tự ngừng bán SKU cũ giúp bạn.',

  keep: 'Giữ nguyên',
  confirmVariantOff: 'Ngừng hoạt động phiên bản',
  confirmSkuOff: 'Ngừng bán SKU',
  remainsPublished:
    'Sản phẩm vẫn ở trạng thái Đang xuất bản. Hệ thống sẽ không tự động gỡ xuất bản.',
  notSoldOut:
    'Đây không phải là hết hàng. Hết hàng là tồn kho bằng 0 trên một SKU vẫn đang bán; ở đây không có SKU nào để bán.',

  warningBadge: 'Không thể đặt hàng',
  warningTitle: 'Sản phẩm vẫn đang được xuất bản nhưng hiện chưa có phiên bản có thể đặt hàng.',
  warningEvidence: 'Cấu trúc bán hàng còn thiếu',
  toSection: 'Đi tới Phiên bản & SKU',
  toReadiness: 'Xem điều kiện xuất bản',

  readinessHeading: 'Điều kiện xuất bản',
  publish: 'Xuất bản',
  pending: 'Chưa xét',
  requirementSatisfied: 'Đã đủ điều kiện',
  requirementUnsatisfied: 'Chưa đủ điều kiện',

  hasActiveVariant: 'Có ít nhất một phiên bản đang hoạt động',
  hasOrderEligibleSku: 'Có ít nhất một SKU có thể đặt hàng',
  skuPriceResolvable: 'SKU có thể đặt hàng đã có giá bán hợp lệ',
  productPriceReady: 'Đã đặt giá sản phẩm',

  stockScreenHeading: 'Tồn kho SKU',
} as const;

/** The three viewports the package requires evidence at. */
export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 1024, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required for the APP12-N02.A01 acceptance run.`);
  }
  return value;
}

/**
 * The seeded Products, reused from the `M01.A1` fixture.
 *
 * Each is chosen for the state it is *already* in rather than for what it was
 * seeded to demonstrate:
 *
 * - `authoring` (`draft0`) — a draft with no media, used for the authoring and
 *   refusal journeys. Its media criteria are unmet and irrelevant: variant and
 *   SKU authoring is allowed on any draft.
 * - `readiness` (`draft8`) — a draft whose seven non-commerce criteria are all
 *   met, so the checklist's commerce chain is the only thing that varies.
 * - `publishedA` (`published`) — a **live** Product with zero variants. Nothing
 *   in the delivered system has ever created one, so this is not a contrivance:
 *   it is the historical malformed shape `N02.G01` found in the development
 *   world, reproduced exactly.
 * - `publishedB` (`publishedSingle`) — the second malformed shape is built on
 *   it through the real UI: an active variant with no selling SKU.
 */
export const PRODUCTS = {
  authoring: () => requiredEnv('E2E_APP12_M01A1_DRAFT0'),
  readiness: () => requiredEnv('E2E_APP12_M01A1_DRAFT8'),
  publishedA: () => requiredEnv('E2E_APP12_M01A1_PUBLISHED'),
  publishedB: () => requiredEnv('E2E_APP12_M01A1_PUBLISHED_SINGLE'),
} as const;

/** The base price every seeded Product carries, as the editor renders it. */
export const BASE_PRICE_DISPLAY = '480.000 ₫';

/** Logs in through the real form. No cookie injection and no guard override. */
export async function loginAsOperator(page: Page): Promise<void> {
  // The navigation is inside `toPass` as well as the fill. The first Admin
  // request of a run compiles the route on demand, and a cold `next start`
  // behind the gateway can answer the very first `/login` slowly enough that
  // the form is not in the DOM when the fill runs — retrying the fill alone
  // would then retry against a page that was never going to have one.
  await expect(async () => {
    await page.goto('/login');
    // Filled under `toPass` because the inputs are React-controlled too: a fill
    // that lands before hydration is overwritten when the client takes over.
    await page.locator(LOGIN.emailInput).fill(requiredEnv('E2E_ADMIN_EMAIL'));
    await page.locator(LOGIN.passwordInput).fill(requiredEnv('E2E_ADMIN_PASSWORD'));
    await expect(page.locator(LOGIN.emailInput)).not.toHaveValue('');
    await expect(page.locator(LOGIN.passwordInput)).not.toHaveValue('');
  }).toPass({ timeout: 30_000 });

  await page.getByRole('button', { name: LOGIN.submitName }).click();
  await expect(page.getByRole('button', { name: LOGIN.logoutName })).toBeVisible();
}

/** Opens one Product's editor and waits for the sellability section to be real. */
export async function openProduct(page: Page, productId: string): Promise<void> {
  await page.goto(`/products/${productId}`);
  await expect(section(page).getByRole('heading', { name: COPY.sectionTitle })).toBeVisible();
}

/**
 * Opens one Product's publication readiness screen.
 *
 * The readiness card's heading is not a fixed string — it is the *verdict*
 * (`Đã đủ điều kiện xuất bản`, `Còn thiếu điều kiện`, `Sản phẩm đang được xuất
 * bản`), which is exactly what the journeys change — so the wait is on the
 * checklist itself, which is present in every one of those states.
 */
export async function openReadiness(page: Page, productId: string): Promise<void> {
  await page.goto(`/products/${productId}/publication`);
  await expect(requirement(page, 'HAS_ACTIVE_VARIANT')).toBeVisible();
}

/** The publish control, addressed by its own handle rather than by a verdict. */
export function publishAction(page: Page): Locator {
  return page.getByTestId('publish-action');
}

export function section(page: Page): Locator {
  return page.locator('#phien-ban-sku');
}

export function variantCard(page: Page, title: string): Locator {
  return section(page).locator('li.product-sellability__variant', { hasText: title });
}

/**
 * One SKU row, matched on its **code element** and anchored.
 *
 * Not `hasText`: SKU codes are operator-authored and routinely share a prefix
 * (`N02-NAVY-M` and `N02-NAVY-M-2` are the pair journey C creates on purpose),
 * so a substring match resolves to two rows and the assertion becomes a strict
 * mode violation instead of a verdict.
 */
export function skuRow(page: Page, code: string): Locator {
  return section(page)
    .locator('li.product-sellability__sku')
    .filter({
      has: page.locator('.product-sellability__sku-code', {
        hasText: new RegExp(`^${code}$`, 'u'),
      }),
    });
}

export function warning(page: Page): Locator {
  return page.getByTestId('structural-unsellability-warning');
}

/** One readiness row, addressed by the contract's own criterion code. */
export function requirement(page: Page, code: string): Locator {
  return page.getByTestId(`requirement-${code}`);
}

/**
 * Creates a variant through the real dialog.
 *
 * Returns nothing: the caller asserts against the rendered list, which is the
 * only thing that proves the write reached the operator's screen.
 */
export async function createVariant(
  page: Page,
  options: { color?: string; size?: string; selling?: boolean },
): Promise<void> {
  await section(page).getByRole('button', { name: COPY.addVariant }).click();
  const dialog = page.getByTestId('variant-dialog');
  if (options.color !== undefined) await dialog.getByTestId('variant-color').fill(options.color);
  if (options.size !== undefined) await dialog.getByTestId('variant-size').fill(options.size);
  if (options.selling === false) await dialog.getByTestId('variant-active').uncheck();
  await dialog.getByTestId('variant-dialog-submit').click();
}

/** Creates a SKU under an expanded variant, through the real dialog. */
export async function createSku(
  page: Page,
  variantTitle: string,
  options: { code: string; override?: string; selling?: boolean },
): Promise<void> {
  await variantCard(page, variantTitle)
    .getByRole('button', { name: LABELS.addSku(variantTitle) })
    .click();
  const dialog = page.getByTestId('sku-dialog');
  await dialog.getByTestId('sku-code').fill(options.code);
  if (options.override !== undefined) {
    await dialog.getByTestId('sku-price-override').check();
    await dialog.getByTestId('sku-price-amount').fill(options.override);
  }
  if (options.selling === false) await dialog.getByTestId('sku-active').uncheck();
  await dialog.getByTestId('sku-dialog-submit').click();
}

/** Expands one variant's SKU list, if it is not already open. */
export async function expandVariant(page: Page, title: string): Promise<void> {
  const card = variantCard(page, title);
  const toggle = card.locator('button[aria-expanded]').first();
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

export async function resize(page: Page, viewport: ViewportName): Promise<void> {
  await page.setViewportSize(VIEWPORTS[viewport]);
}

/** Whether the document scrolls horizontally — the 390 failure this run forbids. */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/**
 * The PUBLISHED banner on the product editor, matched exactly.
 *
 * `exact` matters: the media editor's own "a published Product needs at least
 * one image" notice starts with the same four words, and a substring match
 * resolves to both on any published Product carrying a single image.
 */
export function publishedBanner(page: Page): Locator {
  return page.getByText('Sản phẩm đang xuất bản', { exact: true });
}

/**
 * The accessible names of the per-row controls, transcribed from the approved
 * copy.
 *
 * They exist because the visible labels do not identify their subject: an
 * expanded variant card carries `Sửa` on its own header and `Sửa` on every SKU
 * under it. Asserting through these names is therefore not a convenience — it
 * is the assertion that a screen-reader user can tell the three apart.
 */
export const LABELS = {
  editVariant: (variant: string) => `Sửa phiên bản ${variant}`,
  deactivateVariant: (variant: string) => `Ngừng hoạt động phiên bản ${variant}`,
  addSku: (variant: string) => `Thêm SKU cho phiên bản ${variant}`,
  editSku: (code: string) => `Sửa SKU ${code}`,
  deactivateSku: (code: string) => `Ngừng bán SKU ${code}`,
  reactivateSku: (code: string) => `Bán lại SKU ${code}`,
} as const;
