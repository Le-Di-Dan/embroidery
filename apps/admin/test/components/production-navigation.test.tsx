/**
 * Reaching the production queue from the Admin shell, and the job detail from
 * the queue (`APP8-A02`; `780:22`).
 *
 * The shell's own rule is that every primary-navigation entry points at a route
 * that exists. This asserts the new entry against the same route constant the
 * segment uses, so a label and a destination cannot drift apart — and asserts
 * that the entries which came before it keep their positions.
 */
import {
  ADMIN_PRIMARY_NAV,
  isCurrentNavItem,
  resolveNavItemState,
} from '../../src/features/admin-shell/model/admin-shell-nav';
import {
  ADMIN_PRODUCTION_ROUTE,
  PRODUCTION_QUEUE_COPY,
  adminProductionJobRoute,
} from '../../src/features/production-queue';

const entry = ADMIN_PRIMARY_NAV.find((item) => item.id === 'production');

it('adds one primary navigation entry for the production queue', () => {
  expect(entry).toBeDefined();
  expect(entry?.href).toBe(ADMIN_PRODUCTION_ROUTE);
  expect(ADMIN_PRODUCTION_ROUTE).toBe('/san-xuat');
  // The label comes from the owning capability, so there is one spelling. It is
  // the shorter `Sản xuất` the sidenav draws, not the page's own heading.
  expect(entry?.label).toBe(PRODUCTION_QUEUE_COPY.page.navLabel);
  expect(entry?.label).toBe('Sản xuất');
});

it('marks the entry current on its own route', () => {
  expect(isCurrentNavItem(entry as never, ADMIN_PRODUCTION_ROUTE)).toBe(true);
  expect(isCurrentNavItem(entry as never, '/orders')).toBe(false);
});

it('keeps the queue reachable from a job detail route', () => {
  // The detail will live beneath this segment; the section must stay a
  // destination rather than becoming unreachable from its own detail screen.
  expect(resolveNavItemState(entry as never, adminProductionJobRoute('j1'))).toBe('section');
});

it('adds exactly one entry, and no inventory entry with it', () => {
  expect(ADMIN_PRIMARY_NAV.map((item) => item.id)).toEqual([
    'overview',
    'assets',
    'products',
    'design-templates',
    'custom-requests',
    'orders',
    // `780:22` draws production after orders.
    'production',
    'customer-access-support',
  ]);
  // `780:20` also draws a `Kho` entry. It is deliberately absent: `APP8-B01`
  // publishes stock by SKU only, so a parameterless `/kho` would have to be an
  // all-SKU list no accepted contract can serve. `FU-APP8-A01-04` stays open.
  expect(ADMIN_PRIMARY_NAV.some((item) => item.href.startsWith('/kho'))).toBe(false);
});

it('spells the detail address in exactly one place', () => {
  expect(adminProductionJobRoute('019a0000-0000-7000-8000-000000006091')).toBe(
    '/san-xuat/019a0000-0000-7000-8000-000000006091',
  );
});
