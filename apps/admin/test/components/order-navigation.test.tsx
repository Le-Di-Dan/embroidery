/**
 * Reaching the order queue from the Admin shell, and the order detail from the
 * queue (`APP7-A01`; `732:18`).
 *
 * The shell's own rule is that every primary-navigation entry points at a route
 * that exists. This asserts the new entry against the same route constant the
 * segment uses, so a label and a destination cannot drift apart.
 */
import {
  ADMIN_PRIMARY_NAV,
  isCurrentNavItem,
  resolveNavItemState,
} from '../../src/features/admin-shell/model/admin-shell-nav';
import {
  ADMIN_ORDERS_ROUTE,
  ORDER_QUEUE_COPY,
  adminOrderDetailRoute,
} from '../../src/features/order-queue';

const entry = ADMIN_PRIMARY_NAV.find((item) => item.id === 'orders');

it('adds one primary navigation entry for the order queue', () => {
  expect(entry).toBeDefined();
  expect(entry?.href).toBe(ADMIN_ORDERS_ROUTE);
  // The label comes from the owning capability, so there is one spelling.
  expect(entry?.label).toBe(ORDER_QUEUE_COPY.page.title);
});

it('marks the entry current on its own route', () => {
  expect(isCurrentNavItem(entry as never, ADMIN_ORDERS_ROUTE)).toBe(true);
});

it('keeps the queue reachable from an order detail route', () => {
  // The detail lives beneath this segment; the section must stay a destination
  // rather than becoming unreachable from its own detail screen.
  expect(resolveNavItemState(entry as never, adminOrderDetailRoute('o1'))).toBe('section');
});

it('places orders after requests, following the sequence an order travels', () => {
  expect(ADMIN_PRIMARY_NAV.map((item) => item.id)).toEqual([
    'overview',
    'assets',
    'products',
    // `APP12-A01` inserted category management between the catalog surfaces.
    'categories',
    // `APP11-A01` appended the gallery beside the catalog surfaces.
    'gallery',
    'design-templates',
    'custom-requests',
    'orders',
    // `APP8-A02` appended the production queue after the order queue; the order
    // entry keeps its position.
    'production',
    'customer-access-support',
  ]);
});

it('spells the detail address in exactly one place', () => {
  expect(adminOrderDetailRoute('01950000-0000-7000-8000-000000000001')).toBe(
    '/orders/01950000-0000-7000-8000-000000000001',
  );
});
