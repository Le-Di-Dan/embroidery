/**
 * Evidence readers for the `APP12-N02.E01` run — split out of
 * `n02e01-world.ts` by responsibility: that file *drives* the operator; this
 * one *reads* what the operator's writes produced — the disposable database
 * (read-only), the Storefront purchase panel, the server's own readiness
 * verdict and the Admin's network reads.
 *
 * It imports nothing from the world module, so the two cannot form a cycle.
 * Never imported by application code.
 */
import { expect, type Locator, type Page } from '@playwright/test';

interface PgClient {
  connect(): Promise<void>;
  query(sql: string, params: unknown[]): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required for the APP12-N02.E01 acceptance run.`);
  }
  return value;
}

/** Product, form, publication and stock strings, transcribed from the approved frames. */
export const E01_COPY = {
  createTitle: 'Sản phẩm mới',
  createSubmit: 'Tạo bản nháp',
  nameLabel: 'Tên sản phẩm',
  descriptionLabel: 'Mô tả',
  categoryLabel: 'Danh mục sản phẩm',
  categoryName: 'Đồ thử nghiệm M01.A1',
  priceLabel: 'Giá cơ bản',
  saveDraft: 'Lưu thay đổi',
  addMedia: 'Thêm ảnh',
  pickerTitle: 'Chọn ảnh cho sản phẩm',
  unpublishConfirm: 'Gỡ xuất bản',
  unpublishedTitle: 'Đã gỡ xuất bản sản phẩm',
  stockAdjustSubmit: 'Áp dụng điều chỉnh',
  stockAdjustedTitle: 'Đã ghi điều chỉnh',
  // Storefront purchase panel (`APP12-D01`).
  panel: 'Mua sản phẩm có sẵn',
  variantLegend: 'Phân loại',
  sizeLegend: 'Kích thước',
  continue: 'Mua ngay',
  continueOutOfStock: 'Tạm hết hàng',
  captionOutOfStock: 'Hiện chưa có phân loại nào còn hàng.',
  optionSoldOut: '· hết',
} as const;

export const storefront = (path: string): string =>
  new URL(path, requiredEnv('E2E_BASE_STOREFRONT')).toString();

/** A read-only query against this run's disposable database. */
export async function readRows<T extends Record<string, unknown>>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  if (!/^\s*select\b/iu.test(sql)) {
    throw new Error('The N02.E01 database handle is read-only evidence.');
  }
  // `pg` ships no declarations; the fixtures are `.mjs`, so only this TS reader
  // needs the three methods it calls typed.
  const pgModule = 'pg';
  const { default: pg } = (await import(pgModule)) as {
    default: { Client: new (options: { connectionString: string }) => PgClient };
  };
  const client = new pg.Client({ connectionString: requiredEnv('E2E_DATABASE_URL') });
  await client.connect();
  try {
    const result = await client.query(sql, [...params]);
    return result.rows as T[];
  } finally {
    await client.end();
  }
}

/** Counts a Product's variant and SKU rows, active and inactive. */
export async function structureCounts(productId: string): Promise<{
  variants: number;
  activeVariants: number;
  skus: number;
  activeSkus: number;
}> {
  const [row] = await readRows<Record<string, string>>(
    `select
       (select count(*) from product_variants v where v.product_id = $1) as variants,
       (select count(*) from product_variants v where v.product_id = $1 and v.is_active) as "activeVariants",
       (select count(*) from skus s join product_variants v on v.id = s.product_variant_id
          where v.product_id = $1) as skus,
       (select count(*) from skus s join product_variants v on v.id = s.product_variant_id
          where v.product_id = $1 and s.is_active) as "activeSkus"`,
    [productId],
  );
  return {
    variants: Number(row?.variants),
    activeVariants: Number(row?.activeVariants),
    skus: Number(row?.skus),
    activeSkus: Number(row?.activeSkus),
  };
}

export async function productStatus(productId: string): Promise<string> {
  const [row] = await readRows<{ status: string }>('select status from products where id = $1', [
    productId,
  ]);
  return row?.status ?? 'MISSING';
}

/** The Storefront purchase panel on a Product Detail page. */
export function purchasePanel(page: Page): Locator {
  return page.getByRole('region', { name: E01_COPY.panel });
}

export async function openStorefrontProduct(page: Page, slug: string): Promise<void> {
  const response = await page.goto(storefront(`/san-pham/${slug}`));
  expect(response?.status(), `Product Detail status for ${slug}`).toBe(200);
  await expect(purchasePanel(page)).toBeVisible();
}

/** Selects one purchase option, retrying across hydration (see `APP12-S01`). */
export async function chooseOption(page: Page, legend: string, option: string): Promise<void> {
  const radio = purchasePanel(page)
    .getByRole('group', { name: legend })
    .getByRole('radio', { name: new RegExp(`^${option}`, 'u') });
  await expect(async () => {
    await radio.check({ timeout: 2_000 });
    await expect(radio).toBeChecked({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

/** Every enabled, selectable purchase option on the page. */
export function selectableOptions(page: Page): Locator {
  return purchasePanel(page).locator('input[type="radio"]:not([disabled])');
}

/** A purchase entry the customer can actually follow. */
export function continueLink(page: Page): Locator {
  return purchasePanel(page).getByRole('link', { name: E01_COPY.continue });
}

export interface ServerReadiness {
  readonly eligible: boolean;
  readonly unsatisfied: readonly string[];
  readonly requirementCount: number;
}

/**
 * The server's own readiness verdict, read with the operator's session.
 *
 * The UI's `Chưa xét` is presentation only; this is the authority it presents,
 * read through the same gateway route the Admin uses, so the two can be compared.
 */
export async function serverReadiness(page: Page, productId: string): Promise<ServerReadiness> {
  const response = await page.request.get(`/api/admin/products/${productId}/publication-readiness`);
  expect(response.status(), 'readiness GET').toBe(200);
  const body = (await response.json()) as Record<string, unknown>;
  const payload = (body['data'] ?? body) as {
    eligible: boolean;
    requirements: { code: string; satisfied: boolean }[];
  };
  return {
    eligible: payload.eligible,
    unsatisfied: payload.requirements.filter((r) => !r.satisfied).map((r) => r.code),
    requirementCount: payload.requirements.length,
  };
}

/** Confirms a structure-break dialog if (and only if) the UI asked for one. */
export async function confirmIfAsked(page: Page): Promise<boolean> {
  const confirm = page.getByTestId('structure-break-confirm');
  try {
    await confirm.waitFor({ state: 'visible', timeout: 3_000 });
  } catch {
    return false;
  }
  await confirm.click();
  return true;
}

/** Records every browser GET the Admin issues to the named API path shapes. */
export function recordAdminReads(page: Page): { variantLists: string[]; skuStock: string[] } {
  const record = { variantLists: [] as string[], skuStock: [] as string[] };
  page.on('request', (request) => {
    if (request.method() !== 'GET') return;
    const path = new URL(request.url()).pathname;
    if (/\/api\/admin\/products\/[0-9a-f-]{36}\/variants$/u.test(path)) {
      record.variantLists.push(path);
    }
    if (/\/api\/admin\/skus\/[0-9a-f-]{36}\/stock/u.test(path)) record.skuStock.push(path);
    if (/\/variants\/[0-9a-f-]{36}\/skus$/u.test(path)) record.variantLists.push(`N+1:${path}`);
  });
  return record;
}
