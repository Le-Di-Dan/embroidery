/**
 * The shared world for the `APP12-N02.E01` cross-boundary sellability run.
 *
 * Builds on `n02a01-world.ts` rather than beside it: the sellability section,
 * its dialogs and its copy are the ones `N02.A01` delivered and the PO accepted,
 * so re-transcribing them here would create a second authority that could drift.
 * What this file adds is only what A01 never needed — creating a Product from
 * nothing, attaching its media, pricing it, publishing and unpublishing it,
 * adjusting stock, and reading the consequence on the Storefront.
 *
 * ## Every business write goes through the UI
 *
 * Nothing here writes a row. The single database handle is **read-only**
 * evidence: it resolves the slug the server derived for a Product the operator
 * just created, and it counts rows to prove a refusal persisted nothing. There
 * is no INSERT, UPDATE or DELETE anywhere in this suite.
 *
 * Never imported by application code.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { E01_COPY, productStatus, readRows } from './n02e01-evidence';
import { COPY as SELLABILITY_COPY } from './n02a01-world';

export * from './n02e01-evidence';

import {
  loginAsOperator as a01Login,
  openProduct as a01OpenProduct,
  openReadiness as a01OpenReadiness,
} from './n02a01-world';

/**
 * Retries an Admin step that died on a gateway 5xx rather than on its assertion.
 *
 * Run 1 of this package lost two journeys to a `504 Gateway Time-out` page from
 * the harness gateway in front of `next start` — the same mid-run 504 `APP12-V01`
 * recorded, and never a response the application produced. A step that fails
 * *with the page showing a 5xx* is retried; any other failure is rethrown
 * unchanged, so a real defect still fails on its first occurrence.
 */
async function retryOnGateway5xx(page: Page, step: () => Promise<void>): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await step();
      return;
    } catch (error) {
      const title = await page.title().catch(() => '');
      const heading = await page
        .locator('h1')
        .first()
        .textContent({ timeout: 1_000 })
        .catch(() => '');
      const gateway = /\b50[234]\b/u.test(`${title} ${heading ?? ''}`);
      if (!gateway || attempt >= 3) throw error;
    }
  }
}

/**
 * The real login form, retried only while the page is still on `/login`.
 *
 * Run 1's eleventh login ended on the login form with an empty alert: the POST
 * went through the same gateway that returned 504 elsewhere in that run, so the
 * form had nothing to show. Three attempts at most, which keeps a whole run far
 * inside the staff-login throttle (20 per IP per 15 minutes); a refused
 * credential still fails on the third, loudly.
 */
export async function loginAsOperator(page: Page): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await retryOnGateway5xx(page, () => a01Login(page));
      return;
    } catch (error) {
      if (!new URL(page.url()).pathname.endsWith('/login') || attempt >= 3) throw error;
    }
  }
}

export async function openProduct(page: Page, productId: string): Promise<void> {
  await retryOnGateway5xx(page, () => a01OpenProduct(page, productId));
}

export async function openReadiness(page: Page, productId: string): Promise<void> {
  await retryOnGateway5xx(page, () => a01OpenReadiness(page, productId));
}

export {
  COPY,
  LABELS,
  VIEWPORTS,
  createSku,
  createVariant,
  expandVariant,
  horizontalOverflow,
  publishAction,
  publishedBanner,
  requirement,
  resize,
  section,
  skuRow,
  variantCard,
  warning,
} from './n02a01-world';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required for the APP12-N02.E01 acceptance run.`);
  }
  return value;
}

/** The seeded `M01.A1` Products this run repairs, publishes and withdraws. */
export const SEEDED = {
  draft0: () => requiredEnv('E2E_APP12_M01A1_DRAFT0'),
  draft8: () => requiredEnv('E2E_APP12_M01A1_DRAFT8'),
  draft20: () => requiredEnv('E2E_APP12_M01A1_DRAFT20'),
  published: () => requiredEnv('E2E_APP12_M01A1_PUBLISHED'),
  publishedSlug: () => requiredEnv('E2E_APP12_N02E01_PUBLISHED_SLUG'),
  single: () => requiredEnv('E2E_APP12_M01A1_PUBLISHED_SINGLE'),
  singleSlug: () => requiredEnv('E2E_APP12_N02E01_SINGLE_SLUG'),
  race: () => requiredEnv('E2E_APP12_M01A1_PUBLISHED_RACE'),
  raceSlug: () => requiredEnv('E2E_APP12_N02E01_RACE_SLUG'),
} as const;

/**
 * The two Products J1 and J2 create from nothing. Later files find them again by
 * name in the database rather than through module state, because Playwright may
 * restart its worker between files.
 */
export const CREATED_NAMES = {
  soldOut: 'Khăn tay thêu hoa sen N02E01',
  inStock: 'Túi vải thêu chữ N02E01',
} as const;

export async function findCreated(name: string): Promise<{ productId: string; slug: string }> {
  const [row] = await readRows<{ id: string; slug: string }>(
    'select id, slug from products where name = $1',
    [name],
  );
  if (row === undefined) throw new Error(`J1/J2 Product "${name}" was not created.`);
  return { productId: row.id, slug: row.slug };
}

/**
 * Creates a DRAFT through the real `/products/new` form, then prices it and
 * attaches one eligible image through the real edit form and picker.
 */
export async function createDraftProduct(
  page: Page,
  input: { name: string; description: string; price: string },
): Promise<{ productId: string; slug: string }> {
  await page.goto('/products/new');
  await expect(page.getByRole('heading', { name: E01_COPY.createTitle })).toBeVisible();
  await expect(async () => {
    await page.getByLabel(E01_COPY.nameLabel).fill(input.name);
    await expect(page.getByLabel(E01_COPY.nameLabel)).toHaveValue(input.name);
  }).toPass({ timeout: 20_000 });
  await page.getByLabel(E01_COPY.descriptionLabel).fill(input.description);
  await page.getByLabel(E01_COPY.categoryLabel).selectOption({ label: E01_COPY.categoryName });
  await page.getByRole('button', { name: E01_COPY.createSubmit }).click();
  await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}$/u);
  const productId = /\/products\/([0-9a-f-]{36})$/u.exec(page.url())?.[1] ?? '';

  // Price and media belong to the edit step.
  await page.getByLabel(E01_COPY.priceLabel).fill(input.price);
  await page.getByRole('button', { name: E01_COPY.addMedia }).click();
  const picker = page.getByRole('dialog', { name: E01_COPY.pickerTitle });
  await expect(picker).toBeVisible();
  const boxes = picker.getByRole('checkbox');
  await expect.poll(() => boxes.count()).toBeGreaterThan(0);
  await boxes.nth(0).check();
  await picker.getByRole('button', { name: /^Dùng 1 ảnh đã chọn$/u }).click();
  await page.getByRole('button', { name: E01_COPY.saveDraft }).click();
  await expect(page).toHaveURL(/\/products$/u);

  const [row] = await readRows<{ slug: string; base_price_amount: string }>(
    'select slug, base_price_amount from products where id = $1',
    [productId],
  );
  expect(row, 'the created Product exists').toBeDefined();
  expect(Number(row?.base_price_amount)).toBe(Number(input.price));
  return { productId, slug: row?.slug ?? '' };
}

/** Opens the SKU's stock screen from its row — the handoff under test. */
export async function openStockFromRow(skuRowLocator: Locator, page: Page): Promise<string> {
  await skuRowLocator
    .getByRole('link', { name: new RegExp(SELLABILITY_COPY.manageStock, 'u') })
    .click();
  await expect(page).toHaveURL(/\/kho\/skus\/[0-9a-f-]{36}$/u);
  await expect(
    page.getByRole('heading', { name: SELLABILITY_COPY.stockScreenHeading }),
  ).toBeVisible();
  return /\/kho\/skus\/([0-9a-f-]{36})$/u.exec(page.url())?.[1] ?? '';
}

/** Adjusts stock by a signed delta through the real audited dialog. */
export async function adjustStock(page: Page, delta: number, reason: string): Promise<void> {
  const opener = page
    .getByTestId('open-adjustment-dialog-empty')
    .or(page.getByTestId('open-adjustment-dialog'));
  await opener.first().click();
  const dialog = page.getByTestId('adjustment-dialog');
  await dialog.getByTestId('adjustment-delta').fill(String(delta));
  await dialog.getByTestId('adjustment-reason').fill(reason);
  await dialog.getByTestId('adjustment-submit').click();
  await expect(dialog).toContainText(E01_COPY.stockAdjustedTitle);
  await dialog.getByTestId('adjustment-close').click();
}

/** Publishes from the readiness screen; asserts the server accepted it. */
export async function publish(page: Page, productId: string): Promise<void> {
  await page.getByTestId('publish-action').click();
  await expect(page.getByTestId('unpublish-action')).toBeVisible();
  await expect.poll(() => productStatus(productId)).toBe('PUBLISHED');
}

/** Unpublishes through the real confirmation. */
export async function unpublish(page: Page): Promise<void> {
  await page.getByTestId('unpublish-action').click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: E01_COPY.unpublishConfirm }).click();
  await expect(page.getByText(E01_COPY.unpublishedTitle)).toBeVisible();
}
