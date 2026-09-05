/**
 * `APP12-V01` — the operator route tree.
 *
 * Every Admin route, opened and photographed at the two viewports `APP12-D01`
 * §L draws the operator tool at. The Wave-1 screens are audited; the Wave-2
 * operator screens are opened and recorded as evidence but not critiqued, for
 * the reason the locked roadmap gives — `W01`…`W03` own Wave-2 UAT, and a
 * critique of an empty custom-request queue would be a critique of the absence
 * of custom requests rather than of the design.
 *
 * ## Why this project places two real orders
 *
 * Three Wave-1 operator surfaces cannot exist without a customer, and a customer
 * cannot exist without an order: `resolve-or-create-verified-customer` runs
 * inside Ready-Made order creation, so verification alone mints nothing. The
 * customer-access support screen, the merge selection screen and the merge case
 * detail all need one — and the merge needs **two**, because it is the screen
 * for deciding that two profiles are one person.
 *
 * So the project opens a Storefront context and buys twice. The queue gains real
 * rows as a side effect, which is the right kind of side effect: an operator
 * queue with no orders in it is not the screen an operator uses.
 *
 * ## Secrecy
 *
 * The two synthetic contacts are typed into the merge lookup and never logged;
 * the support screens mask contacts by design (`APP10-B01`), and the audit
 * ledger records counts and colours rather than text.
 *
 * Audit only. Nothing here changes a design, a token or a copy string.
 */
import { expect, test, type Page } from '@playwright/test';

import { openOperator } from './support/a02-world';
import { closeS02World, openS02World } from './support/s02-world';
import { warmGateway } from './support/h08-world';
import { closeS03World, openS03World, placeOrder } from './support/s03-world';
import {
  ADMIN_VIEWPORTS,
  auditRouteAcross,
  createAuditLedger,
  gotoSettled,
  loadEvidence,
  requiredEnv,
  type AuditLedger,
} from './support/v01-world';

/* Plain-ESM helper layer; see `v01-world.ts`. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

/* eslint-disable @typescript-eslint/no-unsafe-call */

test.describe.configure({ mode: 'serial', timeout: 1_200_000 });

const SURFACE = 'admin';

/**
 * The Wave-2 operator screens, opened for the record.
 *
 * The four detail routes below them (`/design-templates/[id]`,
 * `/requests/[id]`, `/requests/[id]/design`, `/requests/[id]/quotation`,
 * `/san-xuat/[jobId]`, `/design-templates/[id]/publication`) have **no Wave-1
 * subject that can exist**: `APP12-G02` §G traced every write that mints a
 * custom request or a custom order and proved both are reachable only from
 * withheld public operations. They are accounted for in `INVENTORY.md` as
 * `WITHHELD_WAVE2`, which is a statement about the release, not a gap.
 */
const WAVE2_LISTS = [
  { route: 'wave2-design-templates', path: '/design-templates' },
  { route: 'wave2-requests', path: '/requests' },
  { route: 'wave2-production', path: '/san-xuat' },
] as const;

let ledger: AuditLedger;
let operator: Page;
let closeOperator: () => Promise<void>;
const contacts: string[] = [];
let productId: string | undefined;
let galleryEntryId: string | undefined;

test.beforeAll(async () => {
  await openS02World();
  await openS03World();
  ledger = await createAuditLedger('admin-shell');
});

test.afterAll(async () => {
  const { appendAuditLog } = await loadEvidence();
  appendAuditLog({
    cluster: 'Cluster 3 — the Admin shell, catalog, inventory and support route tree',
    screens: ledger.screens(),
    screenshots: ledger.screenshots(),
    routes: ledger.routes(),
    concerns: [
      'operator decision speed, table readability and form density are judged from these',
      'see data/admin-shell-measurements.json',
    ],
    next: 'Cluster 4 — Admin orders, payment and fulfilment',
  });
  await closeOperator?.();
  await closeS03World('[app12-v01-admin-shell:s03]');
  await closeS02World('[app12-v01-admin-shell:s02]');
});

test('A — the login screen, before there is a session', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  // See `warmGateway` (`APP12-H08`): the gateway's first connection of a project
  // can answer `504`, and an Nginx error page measures and photographs perfectly
  // while saying nothing about the screen.
  await warmGateway(page, 'v01-admin-shell');
  for (const viewport of ADMIN_VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await gotoSettled(page, '/login');
    await ledger.audit(page, {
      surface: SURFACE,
      route: 'login',
      viewport,
      state: 'empty',
      aboveFold: true,
    });
  }

  // The refusal state, reached by submitting nothing — the screen an operator
  // who mistypes actually meets.
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoSettled(page, '/login');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForTimeout(1_000);
  await ledger.audit(page, {
    surface: SURFACE,
    route: 'login',
    viewport: ADMIN_VIEWPORTS[0]!,
    state: 'refused',
    aboveFold: true,
  });
  await context.close();
});

test('B — two real customers are created, so the support screens have subjects', async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: requiredEnv('E2E_BASE_STOREFRONT'),
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await warmGateway(page, 'v01-admin-shell-shop');
  for (let index = 0; index < 2; index += 1) {
    const placed = await placeOrder(page);
    contacts.push(placed.contact);
  }
  await context.close();
  expect(contacts.length, 'two distinct verified customers exist').toBe(2);
});

test('C — the operator route tree', async ({ browser }) => {
  const session = await openOperator(browser);
  operator = session.page;
  closeOperator = async () => {
    await session.context.close();
  };

  for (const route of [
    { route: 'dashboard', path: '/' },
    { route: 'orders-queue', path: '/orders' },
    { route: 'categories', path: '/categories' },
    { route: 'products', path: '/products' },
    { route: 'product-new', path: '/products/new' },
    { route: 'assets', path: '/assets' },
    { route: 'gallery', path: '/gallery' },
    { route: 'support-customer-access', path: '/support/customer-access' },
    { route: 'merge-selection', path: '/support/customer-access/merge' },
  ]) {
    await auditRouteAcross(operator, ledger, {
      surface: SURFACE,
      route: route.route,
      path: route.path,
      viewports: ADMIN_VIEWPORTS,
      aboveFold: true,
    });
  }
});

test('D — the catalog detail screens, reached the way an operator reaches them', async () => {
  await operator.setViewportSize({ width: 1440, height: 900 });
  await gotoSettled(operator, '/products');
  productId = await firstIdFrom(operator, '/products/');
  expect(productId, 'the products list links to a product').toBeDefined();

  for (const route of [
    { route: 'product-detail', path: `/products/${productId!}` },
    { route: 'product-publication', path: `/products/${productId!}/publication` },
  ]) {
    await auditRouteAcross(operator, ledger, {
      surface: SURFACE,
      route: route.route,
      path: route.path,
      viewports: ADMIN_VIEWPORTS,
      aboveFold: true,
    });
  }

  await gotoSettled(operator, '/gallery');
  galleryEntryId = await firstIdFrom(operator, '/gallery/');
  expect(galleryEntryId, 'the gallery list links to an entry').toBeDefined();
  await auditRouteAcross(operator, ledger, {
    surface: SURFACE,
    route: 'gallery-entry',
    path: `/gallery/${galleryEntryId!}`,
    viewports: ADMIN_VIEWPORTS,
    aboveFold: true,
  });

  // The inventory workspace is addressed by SKU id and has no list route of its
  // own, so it is opened at the SKU the checkout fixture already publishes.
  await auditRouteAcross(operator, ledger, {
    surface: SURFACE,
    route: 'sku-stock',
    path: `/kho/skus/${requiredEnv('E2E_APP12_S02_MAIN_SKU')}`,
    viewports: ADMIN_VIEWPORTS,
    aboveFold: true,
  });
});

test('E — the Wave-2 operator screens, for the record', async () => {
  for (const wave2 of WAVE2_LISTS) {
    await auditRouteAcross(operator, ledger, {
      surface: SURFACE,
      route: wave2.route,
      path: wave2.path,
      viewports: ADMIN_VIEWPORTS.slice(0, 1),
      state: 'wave2-not-audited',
    });
  }
  // Placement is a Wave-2 authoring surface on a Wave-1 subject, so unlike the
  // three above it can be opened against real data. Captured, not critiqued.
  await auditRouteAcross(operator, ledger, {
    surface: SURFACE,
    route: 'wave2-product-placement',
    path: `/products/${productId!}/placement`,
    viewports: ADMIN_VIEWPORTS.slice(0, 1),
    state: 'wave2-not-audited',
  });
});

test('F — a real merge case, opened through the delivered screen', async () => {
  await operator.setViewportSize({ width: 1440, height: 900 });
  await gotoSettled(operator, '/support/customer-access/merge');

  // Addressed by placeholder rather than by role: the screen carries **three**
  // text boxes — the two participant lookups and the merge-reason textarea — so
  // `getByRole('textbox')` is not the pair, which is what the first V01 run
  // discovered by asserting a count of two against a count of three.
  // Always the **first** remaining lookup, never `nth(index)`.
  //
  // A resolved slot replaces its lookup form with the participant it found and a
  // "Đổi khách hàng" control — which is good design and was also the second V01
  // harness fault: after the survivor resolved there was no `nth(1)` left to
  // fill, because there was only one lookup on the screen at all. Counting down
  // is what the screen actually does.
  const lookups = operator.getByPlaceholder('Nhập email hoặc số điện thoại');
  await expect(lookups).toHaveCount(2, { timeout: 30_000 });
  for (const [index, contact] of contacts.entries()) {
    await lookups.first().fill(contact);
    await operator.getByRole('button', { name: 'Tra cứu' }).first().click();
    await expect(lookups).toHaveCount(1 - index, { timeout: 30_000 });
  }
  await ledger.audit(operator, {
    surface: SURFACE,
    route: 'merge-selection',
    viewport: ADMIN_VIEWPORTS[0]!,
    state: 'both-resolved',
    aboveFold: true,
  });

  const reason = operator.locator('textarea').first();
  await reason.fill('Hai hồ sơ dùng chung một số điện thoại; khách xác nhận là cùng một người.');
  await operator.getByRole('button', { name: 'Mở hồ sơ gộp' }).click();
  await expect(operator).toHaveURL(/\/support\/customer-access\/merge\/[^/]+$/, {
    timeout: 30_000,
  });

  const casePath = new URL(operator.url()).pathname;
  await auditRouteAcross(operator, ledger, {
    surface: SURFACE,
    route: 'merge-case',
    path: casePath,
    viewports: ADMIN_VIEWPORTS,
    state: 'open',
    aboveFold: true,
  });
});

/**
 * The first `<a href>` under `prefix`, reduced to the id segment.
 *
 * **Polled, not read once.** Both Admin lists are TanStack Query screens: the
 * server sends a shell and the rows arrive from a client fetch, so `load` fires
 * while the table is still empty. The first V01 run read the gallery list in
 * that window, found only the sidebar's own links and failed on "the gallery
 * list links to an entry" — a true statement about the millisecond and a false
 * one about the screen.
 */
async function firstIdFrom(page: Page, prefix: string): Promise<string | undefined> {
  let found: string | undefined;
  await expect
    .poll(
      async () => {
        found = await readIdFrom(page, prefix);
        return found !== undefined;
      },
      { timeout: 30_000, intervals: [250, 500, 1_000] },
    )
    .toBe(true);
  return found;
}

async function readIdFrom(page: Page, prefix: string): Promise<string | undefined> {
  return page.evaluate((base) => {
    for (const anchor of Array.from(document.querySelectorAll('a[href]'))) {
      const href = anchor.getAttribute('href') ?? '';
      if (!href.startsWith(base)) continue;
      const rest = href.slice(base.length).split('/')[0] ?? '';
      if (rest !== '' && rest !== 'new') return rest;
    }
    return undefined;
  }, prefix);
}
